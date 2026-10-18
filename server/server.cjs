const express = require('express');
const http = require('node:http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { exec, execFile, execSync } = require('node:child_process');
const { NexusScanner } = require('./scanner.cjs');
const { ThumbnailService } = require('./media/thumbnail_cache.cjs');
const { MemoryWatchdog } = require('./performance/memory_manager.cjs');
const { UniversalProgressiveEngine } = require('./search/progressive_filter.cjs');
const { AutonomousPlanner } = require('./planner.cjs');
const { NexusZipEngine } = require('./zip_parser.cjs');
const { SyntaxIndexer } = require('./code/syntax_indexer.cjs');
const { WindowsRecycleBin } = require('./integrations/recycle_bin.cjs');
const { SQLiteInspector } = require('./integrations/sqlite_inspector.cjs');
const { ImageMetadataInspector } = require('./integrations/image_metadata.cjs');
const { FastHasher } = require('./integrations/fast_hasher.cjs');
const { WinRtOcr } = require('./integrations/winrt_ocr.cjs');
const { OllamaSemanticEngine } = require('./integrations/ollama_semantic.cjs');
const { VirusTotalChecker } = require('./integrations/virustotal_checker.cjs');
const { AIAgentEngine } = require('./ai/agent_engine.cjs');
const { authVault } = require('./auth/auth_vault.cjs');
const { resolvePathInRoots, isPathWithin } = require('./security/path_scope.cjs');
const SmartShield = require('./shield/smart_shield.cjs');
const { LicenseVault, PLAN_LIMITS, validateScanTarget, LIMIT_MESSAGES } = require('./licensing/license_vault.cjs');

const app = express();
const server = http.createServer(app);
const isLocalOrigin = (origin) => !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const wss = new WebSocket.Server({
  server,
  path: '/ws',
  verifyClient: ({ origin, req }, done) => {
    const token = readSessionToken(req);
    const user = token ? authVault.verifySession(token) : null;
    done(isLocalOrigin(origin) && Boolean(user), 403, 'Origin or session not allowed');
  }
});

app.use((req, res, next) => {
  if (!isLocalOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // Only the local Vite dev and preview origins may access this API.
    if (isLocalOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS access denied: origin not allowed'));
    }
  }
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

let activeScanner = null;
let activeBenchmarkTimer = null;
let cachedResults = {
  items: [],
  categories: {},
  workspaces: [],
  stats: null,
  activePath: path.join(os.homedir(), 'Downloads'),
  activeRoots: [path.join(os.homedir(), 'Downloads')]
};

const scopedPathKeys = new Set([
  'path', 'filePath', 'sourcePath', 'targetDir', 'targetPath', 'destDir',
  'zipPath', 'codePath', 'parentPath', 'workspacePath', 'rootPath', 'paths'
]);
const authAttemptWindows = new Map();

function limitAuthAttempts(endpoint, windowMs, maximum) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${endpoint}:${req.ip}`;
    const attempt = authAttemptWindows.get(key);
    const current = !attempt || now - attempt.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : attempt;
    current.count += 1;
    authAttemptWindows.set(key, current);

    if (authAttemptWindows.size > 1000) {
      for (const [attemptKey, value] of authAttemptWindows) {
        if (now - value.startedAt >= windowMs) authAttemptWindows.delete(attemptKey);
      }
    }
    if (current.count > maximum) {
      const retryAfter = Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'Zbyt wiele prób. Spróbuj ponownie później.' });
    }
    next();
  };
}

app.use('/api/auth/login', limitAuthAttempts('login', 15 * 60 * 1000, 8));
app.use('/api/auth/register', limitAuthAttempts('register', 60 * 60 * 1000, 5));
app.use('/api/auth/forgot-password-verify', limitAuthAttempts('password-reset', 15 * 60 * 1000, 5));

function readSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookieHeader = req.headers.cookie || '';
  const cookieToken = cookieHeader.match(/(?:^|;\s*)nexus_session=([^;]+)/)?.[1];
  if (cookieToken) {
    try {
      return decodeURIComponent(cookieToken);
    } catch (_) {
      // ignore
    }
  }
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const queryToken = parsedUrl.searchParams.get('token');
    if (queryToken) return queryToken;
  } catch (_) {}

  return null;
}

function setSessionCookie(res, token) {
  const secure = process.env.NEXUS_COOKIE_SECURE === 'true' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `nexus_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NEXUS_COOKIE_SECURE === 'true' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `nexus_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

const publicApiRoutes = new Set([
  '/api/health',
  '/api/download/installer',
  '/api/license/status',
  '/api/license/activate',
  '/api/license/verify-feature',
  '/api/crypto/create-order',
  '/api/crypto/verify-tx',
  '/api/crypto/cancel-order',
  '/api/crypto/webhook',
  '/api/crypto/simulate-payment',
  '/api/file/preview',
  '/api/file/content'
]);
app.use('/api', (req, res, next) => {
  const apiPath = new URL(req.originalUrl, 'http://localhost').pathname;
  const isPublicCryptoGet =
    (req.method === 'GET' && apiPath === '/api/crypto/config') ||
    (req.method === 'GET' && apiPath.startsWith('/api/crypto/order-status/'));

  if (
    req.method === 'OPTIONS' ||
    apiPath.startsWith('/api/auth/') ||
    isPublicCryptoGet ||
    publicApiRoutes.has(apiPath)
  ) {
    return next();
  }

  const token = readSessionToken(req);
  const user = token ? authVault.verifySession(token) : null;
  if (!user) {
    return res.status(401).json({ error: 'Wymagana jest aktywna sesja.' });
  }
  req.authenticatedUser = user;
  next();
});

const unscopedNavigationRoutes = new Set([
  '/api/scan',
  '/api/system/list-folders',
  '/api/action/validate-path',
  '/api/action/pick-directory'
]);

app.use('/api', (req, res, next) => {
  const apiPath = new URL(req.originalUrl, 'http://localhost').pathname;
  if (
    req.method === 'OPTIONS' ||
    apiPath.startsWith('/api/auth/') ||
    apiPath.startsWith('/api/license/') ||
    apiPath.startsWith('/api/crypto/') ||
    unscopedNavigationRoutes.has(apiPath)
  ) {
    return next();
  }

  const roots = cachedResults.activeRoots?.length
    ? cachedResults.activeRoots
    : [path.join(os.homedir(), 'Downloads')];
  const resolveScopedValue = (value) => {
    if (Array.isArray(value)) {
      if (value.length > 10000) throw new Error('Too many filesystem paths were supplied.');
      return value.map((entry) => resolvePathInRoots(entry, roots));
    }
    return resolvePathInRoots(value, roots);
  };

  try {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      for (const key of scopedPathKeys) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          req.body[key] = resolveScopedValue(req.body[key]);
        }
      }
    }

    const parsedUrl = new URL(req.originalUrl, 'http://localhost');
    const sanitizedQuery = { ...req.query };
    let queryChanged = false;
    for (const key of scopedPathKeys) {
      if (Object.prototype.hasOwnProperty.call(sanitizedQuery, key)) {
        sanitizedQuery[key] = resolveScopedValue(sanitizedQuery[key]);
        queryChanged = true;
      }
    }
    if (queryChanged) {
      Object.defineProperty(req, 'query', { value: sanitizedQuery, configurable: true });
    }

    if (apiPath === '/api/action/instant-delete' || apiPath === '/api/action/quick-move') {
      const sourcePath = req.body?.path || req.body?.filePath || req.body?.sourcePath;
      if (sourcePath) resolvePathInRoots(sourcePath, roots, { rejectRoot: true });
    }
    next();
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket clients tracking
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
  
  if (cachedResults.items.length > 0) {
    ws.send(JSON.stringify({
      type: 'cache_state',
      count: cachedResults.items.length,
      categories: cachedResults.categories,
      stats: cachedResults.stats
    }));
  }

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (_) {}
    }
  }
}

// 1. System Discovery API
app.get('/api/system-info', (req, res) => {
  const homeDir = os.homedir();
  let username = 'User';
  try {
    username = os.userInfo().username || path.basename(homeDir);
  } catch (_) {
    username = path.basename(homeDir);
  }
  
  const defaultTargets = [
    {
      id: 'downloads',
      name: 'Pobrane (Downloads)',
      path: path.join(homeDir, 'Downloads'),
      hint: 'Domyślny katalog pobranych plików i grafik',
      icon: 'download'
    },
    {
      id: 'desktop',
      name: 'Pulpit (Desktop)',
      path: path.join(homeDir, 'Desktop'),
      hint: 'Chaotyczny bufor bieżącej pracy',
      icon: 'monitor'
    },
    {
      id: 'pictures',
      name: 'Obrazy i Zrzuty (Pictures)',
      path: path.join(homeDir, 'Pictures'),
      hint: 'Domyślny katalog screenshotów Windows',
      icon: 'image'
    },
    {
      id: 'documents',
      name: 'Dokumenty (Documents)',
      path: path.join(homeDir, 'Documents'),
      hint: 'Projekty, arkusze i instalacje',
      icon: 'file-text'
    }
  ].filter(t => fs.existsSync(t.path));

  // Detect drives on Windows (C:\, D:\, etc.)
  const drives = [];
  if (process.platform === 'win32') {
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          drives.push(drivePath);
        }
      } catch (_) {}
    }
  }

  res.json({
    platform: os.platform(),
    release: os.release(),
    username,
    cpuCores: os.cpus().length,
    totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
    freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(1),
    homeDir,
    defaultTargets,
    drives
  });
});

// 2. Cache inspection
app.get('/api/cache/items', (req, res) => {
  res.json({
    items: cachedResults.items,
    total: cachedResults.items.length,
    activePath: cachedResults.activePath,
    activeRoots: cachedResults.activeRoots || []
  });
});

// 3. Start Scan
app.post('/api/scan', async (req, res) => {
  let targetPath = req.body.path || path.join(os.homedir(), 'Downloads');
  const ingestionMode = req.body.ingestionMode || 'ALL';
  if (typeof targetPath !== 'string' && !Array.isArray(targetPath)) {
    return res.status(400).json({ error: 'Ścieżka skanowania ma nieprawidłowy format.' });
  }

  // Authoritative server-side licensing check
  const licenseStatus = LicenseVault.getStatus();
  const isPro = Boolean(licenseStatus?.isPro);

  const initialValidation = validateScanTarget(isPro, targetPath);
  if (!initialValidation.allowed) {
    return res.status(403).json({
      success: false,
      code: initialValidation.code || 'PRO_LIMIT_EXCEEDED',
      limitType: initialValidation.limitType || 'WHOLE_PC_NOT_ALLOWED',
      error: initialValidation.error || LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      message: initialValidation.message || LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      plan: 'FREE',
      suggestedAction: 'UPGRADE_OR_SINGLE_FOLDER'
    });
  }

  if (activeScanner) {
    activeScanner.abort();
    activeScanner = null;
  }
  if (activeBenchmarkTimer) {
    clearInterval(activeBenchmarkTimer);
    activeBenchmarkTimer = null;
  }

  let rootsToScan = [];
  let isWholePc = false;

  if (targetPath === 'WHOLE_PC' || targetPath === 'ALL_DRIVES' || targetPath === 'CAŁY KOMPUTER' || targetPath === 'Cały Komputer (Wszystkie Dyski)') {
    isWholePc = true;
    targetPath = 'Cały Komputer (Wszystkie Dyski)';
    if (process.platform === 'win32') {
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const rootPath = `${letter}:\\`;
        try {
          if (fs.existsSync(rootPath)) {
            rootsToScan.push(rootPath);
          }
        } catch (_) {}
      }
    }
    if (rootsToScan.length === 0) {
      rootsToScan = [os.homedir()];
    }
  } else if (Array.isArray(targetPath)) {
    rootsToScan = targetPath;
    targetPath = targetPath.join(' + ');
  } else {
    rootsToScan = [targetPath];
  }

  rootsToScan = rootsToScan
    .filter(root => typeof root === 'string' && root.trim())
    .map(root => path.resolve(root.trim()));
  if (rootsToScan.length === 0) {
    return res.status(400).json({ error: 'Wskaż co najmniej jeden katalog do skanowania.' });
  }

  const rootsValidation = validateScanTarget(isPro, targetPath, rootsToScan);
  if (!rootsValidation.allowed) {
    return res.status(403).json({
      success: false,
      code: rootsValidation.code || 'PRO_LIMIT_EXCEEDED',
      limitType: rootsValidation.limitType || 'WHOLE_PC_NOT_ALLOWED',
      error: rootsValidation.error || LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      message: rootsValidation.message || LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      plan: 'FREE',
      suggestedAction: 'UPGRADE_OR_SINGLE_FOLDER'
    });
  }

  if (!isWholePc) {
    for (const root of rootsToScan) {
      try {
        if (!fs.statSync(root).isDirectory()) {
          return res.status(400).json({ error: `Ścieżka nie jest katalogiem: ${root}` });
        }
      } catch {
        return res.status(400).json({ error: `Katalog nie istnieje lub jest niedostępny: ${root}` });
      }
    }
  }

  cachedResults = {
    items: [],
    categories: {},
    workspaces: [],
    stats: null,
    activePath: targetPath,
    activeRoots: rootsToScan,
    ingestionMode
  };

  broadcast({ type: 'scan:start', targetPath, ingestionMode, timestamp: Date.now(), isWholePc, rootsCount: rootsToScan.length });

  const maxScanBytes = isPro ? PLAN_LIMITS.PRO.maxScanBytes : PLAN_LIMITS.FREE.maxScanBytes;
  const maxScanFiles = isPro ? PLAN_LIMITS.PRO.maxScanFiles : PLAN_LIMITS.FREE.maxScanFiles;

  const scanner = new NexusScanner({
    concurrency: Math.max(12, os.cpus().length * 3),
    batchSize: 200,
    maxDepth: isWholePc ? 7 : 12,
    isPro,
    maxScanBytes,
    maxScanFiles,
    onLimitExceeded: (payload) => {
      broadcast({
        type: 'scan:limit_exceeded',
        payload
      });
    }
  });
  activeScanner = scanner;

  res.json({
    status: 'scanning_started',
    targetPath,
    ingestionMode,
    roots: rootsToScan,
    tier: isPro ? 'PRO' : 'FREE',
    maxScanBytes,
    maxScanFiles
  });

  scanner.scanDirectory(
    rootsToScan,
    (batch) => {
      if (activeScanner !== scanner) return;
      let filtered = batch;
      if (ingestionMode === 'ANIME_ONLY') {
        filtered = batch.filter(item => {
          const ext = (item.extension || '').toLowerCase();
          const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
          const isAnime = /anime|manga|waifu|girl|art|genshin|sketch|fanart|wallpaper|kawaii/i.test(item.name);
          return isImg || isAnime || item.category === 'MEDIA';
        });
      } else if (ingestionMode === 'DEV_ONLY') {
        filtered = batch.filter(item => {
          const ext = (item.extension || '').toLowerCase();
          return ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'css', 'html'].includes(ext) || item.category === 'DEV';
        });
      } else if (ingestionMode === 'SCREENSHOTS_ONLY') {
        filtered = batch.filter(item => item.category === 'SCREENSHOT' || /screenshot|snip|zrzut/i.test(item.name));
      }

      if (filtered.length > 0) {
        cachedResults.items.push(...filtered);
        broadcast({
          type: 'scan:batch',
          items: filtered,
          totalSoFar: cachedResults.items.length
        });
      }
    },
    (progress) => {
      if (activeScanner !== scanner) return;
      cachedResults.categories = progress.categories;
      broadcast({
        type: 'scan:progress',
        progress
      });
    },
    (complete) => {
      if (activeScanner !== scanner) return;
      if (complete.limitExceeded) {
        broadcast({
          type: 'scan:limit_exceeded',
          payload: complete.limitError
        });
        activeScanner = null;
        return;
      }
      cachedResults.stats = complete;
      cachedResults.workspaces = complete.workspaces || [];
      broadcast({
        type: 'scan:complete',
        stats: complete
      });
      activeScanner = null;
    },
    (errPayload) => {
      if (activeScanner !== scanner) return;
      broadcast({
        type: 'scan:limit_exceeded',
        payload: errPayload
      });
      activeScanner = null;
    }
  ).catch(err => {
    if (activeScanner !== scanner) return;
    broadcast({ type: 'scan:error', error: err.message });
    activeScanner = null;
  });
});

// 4. Synthetic Extreme Scale Generator (Benchmark 45 000 Files)
app.post('/api/benchmark-scale', (req, res) => {
  const requestedCount = Number(req.body.count || 45000);
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 500000) {
    return res.status(400).json({ error: 'Liczba elementów benchmarku musi mieścić się w zakresie 1–500000.' });
  }

  const license = LicenseVault.getStatus();
  if (!license.isPro && requestedCount > PLAN_LIMITS.FREE.maxScanFiles) {
    return res.status(403).json({
      success: false,
      code: 'PRO_LIMIT_EXCEEDED',
      error: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      message: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED
    });
  }

  const count = requestedCount;
  if (activeScanner) {
    activeScanner.abort();
    activeScanner = null;
  }
  if (activeBenchmarkTimer) clearInterval(activeBenchmarkTimer);
  cachedResults.items = [];
  cachedResults.activeRoots = [];
  
  broadcast({ type: 'scan:start', targetPath: 'BENCHMARK::45K_MEDIA_ENGINE', timestamp: Date.now() });

  const devExts = ['tsx', 'ts', 'jsx', 'json', 'css', 'py', 'rs'];
  const mediaExts = ['png', 'jpg', 'webp', 'svg'];
  const appExts = ['exe', 'msi', 'zip'];

  const startTime = Date.now();
  let generated = 0;
  const chunkSize = 2000;

  activeBenchmarkTimer = setInterval(() => {
    const chunk = [];
    const benchDir = path.join(os.homedir(), 'Downloads', 'Benchmark');

    for (let i = 0; i < chunkSize && generated < count; i++) {
      generated++;
      let cat = 'MEDIA';
      let ext = 'png';
      let name = `Asset_${generated}.png`;
      let isDisposable = false;

      const rand = crypto.randomInt(0, 1000) / 1000;
      if (rand < 0.60) {
        cat = 'MEDIA';
        ext = mediaExts[crypto.randomInt(0, mediaExts.length)];
        name = `render_export_${generated}_final_v2.${ext}`;
      } else if (rand < 0.75) {
        cat = 'SCREENSHOT';
        ext = 'png';
        name = `Screenshot 2026-10-${String(crypto.randomInt(1, 29)).padStart(2, '0')} ${crypto.randomInt(100000, 999999)}.${ext}`;
        isDisposable = true;
      } else if (rand < 0.88) {
        cat = 'DEV';
        ext = devExts[crypto.randomInt(0, devExts.length)];
        name = `Component_${generated}.${ext}`;
      } else if (rand < 0.95) {
        cat = 'APPS';
        ext = appExts[crypto.randomInt(0, appExts.length)];
        name = `Installer_Setup_v${crypto.randomInt(1, 5)}.${crypto.randomInt(0, 9)}.${ext}`;
      } else {
        cat = 'DOCS';
        ext = 'pdf';
        name = `Faktura_Dokument_${generated}.pdf`;
      }

      chunk.push({
        id: `bench-${generated}`,
        name,
        path: path.join(benchDir, name),
        dir: benchDir,
        extension: ext,
        size: crypto.randomInt(15000, 4515000),
        mtime: Date.now() - (crypto.randomInt(1, 30) * 86400000),
        category: cat,
        subCategory: cat === 'SCREENSHOT' ? 'Ephemeral Visual' : cat,
        isDisposable,
        confidence: 0.98,
        workspaceId: cat === 'DEV' ? 'ws-nexus-core' : undefined
      });
    }

    cachedResults.items.push(...chunk);
    broadcast({
      type: 'scan:batch',
      items: chunk,
      totalSoFar: cachedResults.items.length
    });

    broadcast({
      type: 'scan:progress',
      progress: {
        filesCount: generated,
        dirsCount: 1,
        totalBytes: generated * 1250000,
        speedFilesPerSec: Math.round(generated / Math.max(0.1, (Date.now() - startTime) / 1000)),
        categories: {
          MEDIA: Math.round(generated * 0.60),
          SCREENSHOT: Math.round(generated * 0.15),
          DEV: Math.round(generated * 0.13),
          APPS: Math.round(generated * 0.07),
          DOCS: Math.round(generated * 0.05)
        },
        workspacesCount: 4
      }
    });

    if (generated >= count) {
      clearInterval(activeBenchmarkTimer);
      activeBenchmarkTimer = null;
      const completeStats = {
        totalFiles: count,
        totalDirs: 1,
        totalBytes: count * 1250000,
        durationMs: Date.now() - startTime,
        speedFilesPerSec: Math.round(count / Math.max(0.1, (Date.now() - startTime) / 1000)),
        categories: {
          MEDIA: Math.round(count * 0.60),
          SCREENSHOT: Math.round(count * 0.15),
          DEV: Math.round(count * 0.13),
          APPS: Math.round(count * 0.07),
          DOCS: Math.round(count * 0.05)
        },
        workspaces: [
          { id: 'ws-nexus-core', name: 'Nexus Architecture', rootPath: 'C:\\Projects\\nexus', fileCount: 420, types: ['tsx', 'ts', 'css'] },
          { id: 'ws-frontend-app', name: 'Web Dashboard', rootPath: 'C:\\Projects\\app', fileCount: 280, types: ['tsx', 'json'] },
          { id: 'ws-design-assets', name: 'Design Tokens', rootPath: 'C:\\Assets\\Figma', fileCount: 1500, types: ['png', 'svg'] }
        ]
      };
      cachedResults.stats = completeStats;
      cachedResults.workspaces = completeStats.workspaces;
      broadcast({ type: 'scan:complete', stats: completeStats });
    }
  }, 40);

  res.json({ status: 'benchmark_started', count });
});

// 5. Stop active scan
app.post('/api/scan/stop', (req, res) => {
  if (activeScanner) {
    activeScanner.abort();
    activeScanner = null;
  }
  if (activeBenchmarkTimer) {
    clearInterval(activeBenchmarkTimer);
    activeBenchmarkTimer = null;
  }
  broadcast({ type: 'scan:stopped' });
  res.json({ status: 'stopped' });
});

// 6. Native Windows Folder Picker Dialog (TopMost window with fast timeout & auto-fallback)
app.post('/api/action/pick-directory', (req, res) => {
  const initialPath = req.body.initialPath || os.homedir();
  if (process.platform === 'win32') {
    const escaped = String(initialPath).replace(/'/g, "''");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Wybierz folder projektu dla Nexusa'
$dialog.ShowNewFolderButton = $true
if (Test-Path '${escaped}') {
    $dialog.SelectedPath = '${escaped}'
}
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.TopLevel = $true
$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
`;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -STA -EncodedCommand ${b64}`, { timeout: 15000 }, (err, stdout) => {
      if (err) {
        return res.json({ success: false, unsupported: true, error: err.message });
      }
      const selected = stdout ? stdout.trim() : '';
      if (!selected) {
        return res.json({ success: false, unsupported: true });
      }
      return res.json({ success: true, selectedPath: selected });
    });
  } else {
    res.json({ success: false, unsupported: true, message: 'Wybierz folder z drzewa katalogów' });
  }
});

// 7. Real-time Path Validation
app.post('/api/action/validate-path', (req, res) => {
  const target = req.body.path;
  if (!target || typeof target !== 'string') {
    return res.json({ exists: false, error: 'Brak ścieżki' });
  }
  try {
    const resolved = path.resolve(target.trim());
    if (!fs.existsSync(resolved)) {
      return res.json({ exists: false, path: resolved });
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.json({ exists: true, isDirectory: false, path: resolved });
    }
    let childCount = 0;
    try {
      childCount = fs.readdirSync(resolved).length;
    } catch (_) {}
    return res.json({ exists: true, isDirectory: true, path: resolved, childCount });
  } catch (err) {
    return res.json({ exists: false, error: err.message });
  }
});

// 8. Directory Browser & Quick Navigation API (With drive enumeration & auto-recovery)
app.get('/api/system/list-folders', (req, res) => {
  let targetPath = req.query.path ? String(req.query.path).trim() : os.homedir();

  // Sanitize malformed or trailing characters (e.g. ".../:", "/..", trailing slashes)
  if (targetPath.endsWith('/:')) targetPath = targetPath.slice(0, -2);
  if (targetPath.endsWith('/..') || targetPath.endsWith('\\..')) targetPath = path.dirname(targetPath);
  if (targetPath === '...' || targetPath === '..') targetPath = os.homedir();

  let resolved = path.resolve(targetPath);

  // Graceful fallback if path doesn't exist
  if (!fs.existsSync(resolved)) {
    const parent = path.dirname(resolved);
    if (fs.existsSync(parent)) {
      resolved = parent;
    } else {
      resolved = os.homedir();
    }
  }

  // Enumerate all active Windows drives (C:\, D:\, etc.)
  const drives = [];
  if (process.platform === 'win32') {
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const rootPath = `${letter}:\\`;
      try {
        if (fs.existsSync(rootPath)) {
          drives.push({ name: `Dysk (${letter}:)`, path: rootPath });
        }
      } catch (_) {}
    }
  } else {
    drives.push({ name: 'Root (/)', path: '/' });
  }

  // Quick access shortcuts
  const home = os.homedir();
  const quickAccess = [
    { name: 'Katalog Domowy', path: home, icon: 'home' },
    { name: 'Pulpit', path: path.join(home, 'Desktop'), icon: 'desktop' },
    { name: 'Pobrane', path: path.join(home, 'Downloads'), icon: 'downloads' },
    { name: 'Dokumenty', path: path.join(home, 'Documents'), icon: 'documents' },
    { name: 'Obrazy', path: path.join(home, 'Pictures'), icon: 'pictures' },
    { name: 'Ten Projekt (DSA)', path: path.resolve('.'), icon: 'project' }
  ].filter(qa => {
    try { return fs.existsSync(qa.path); } catch (_) { return false; }
  });

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      resolved = path.dirname(resolved);
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const folders = [];
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (ent.name.startsWith('$') || ent.name === 'System Volume Information' || ent.name === 'node_modules' || ent.name === '.git') continue;
        folders.push({
          name: ent.name,
          path: path.join(resolved, ent.name)
        });
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const parentDir = path.dirname(resolved);
    res.json({
      success: true,
      current: resolved,
      parent: parentDir !== resolved ? parentDir : null,
      drives,
      quickAccess,
      folders: folders.slice(0, 200)
    });
  } catch (err) {
    // Graceful recovery even if readdir fails due to permission
    res.json({
      success: true,
      current: resolved,
      parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
      drives,
      quickAccess,
      folders: [],
      warning: `Brak uprawnień do odczytu części zawartości katalogu: ${err.message}`
    });
  }
});

// Extension mappings
const CODE_EXTENSIONS = new Set([
  'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json', 'lock', 'css', 'scss', 'sass', 'less',
  'html', 'htm', 'py', 'pyw', 'rs', 'go', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
  'cs', 'sql', 'md', 'markdown', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'xml', 'svg', 'php', 'rb', 'lua', 'txt', 'log'
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'tiff', 'avif'
]);

const MONACO_LANG_MAP = {
  js: 'javascript', cjs: 'javascript', mjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', lock: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  py: 'python', pyw: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  sql: 'sql',
  md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  xml: 'xml', svg: 'xml',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  bat: 'bat', cmd: 'bat', ps1: 'powershell',
  ini: 'ini', env: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini',
  txt: 'plaintext', log: 'plaintext', lua: 'lua', php: 'php', rb: 'ruby'
};

// Helper to normalize and resolve potential duplicated directory segments or relative paths
function resolveValidFilePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let decoded = rawPath;
  try { decoded = decodeURIComponent(rawPath); } catch (_) {}

  // 1. Check direct path
  const directPath = path.resolve(decoded);
  if (fs.existsSync(directPath)) {
    try { if (fs.statSync(directPath).isFile()) return directPath; } catch (_) {}
  }

  // 2. Normalize Windows separators
  const winFixed = decoded.replace(/\//g, path.sep);
  if (fs.existsSync(winFixed)) {
    try { if (fs.statSync(winFixed).isFile()) return path.resolve(winFixed); } catch (_) {}
  }

  // 3. Remove sequential duplicate directory segments (e.g. \dsa\dsa\ or \Downloads\Downloads\)
  const parts = directPath.split(path.sep);
  const deduplicatedParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && parts[i].toLowerCase() === parts[i - 1].toLowerCase()) continue;
    deduplicatedParts.push(parts[i]);
  }
  const deduplicatedPath = deduplicatedParts.join(path.sep);
  if (fs.existsSync(deduplicatedPath)) {
    try { if (fs.statSync(deduplicatedPath).isFile()) return deduplicatedPath; } catch (_) {}
  }

  // 4. Try resolving relative to process.cwd()
  const cwdCandidate = path.resolve(process.cwd(), decoded.replace(/^[/\\]+/, ''));
  if (fs.existsSync(cwdCandidate)) {
    try { if (fs.statSync(cwdCandidate).isFile()) return cwdCandidate; } catch (_) {}
  }

  // 5. Check in cachedResults.items if available
  if (Array.isArray(cachedResults.items) && cachedResults.items.length > 0) {
    const baseName = path.basename(decoded).toLowerCase();
    const itemMatch = cachedResults.items.find(it => 
      it.path === decoded || 
      it.path === directPath || 
      it.path === deduplicatedPath || 
      (it.name && it.name.toLowerCase() === baseName)
    );
    if (itemMatch && itemMatch.path && fs.existsSync(itemMatch.path)) {
      try { if (fs.statSync(itemMatch.path).isFile()) return itemMatch.path; } catch (_) {}
    }
  }

  // 6. Try resolving relative to activeRoots or target directory
  const searchRoots = [
    ...(cachedResults.activeRoots || []),
    cachedResults.activePath,
    process.cwd()
  ].filter(Boolean);

  for (const root of searchRoots) {
    const candidateByName = path.join(root, path.basename(decoded));
    if (fs.existsSync(candidateByName)) {
      try { if (fs.statSync(candidateByName).isFile()) return candidateByName; } catch (_) {}
    }
    const candidateRel = path.resolve(root, decoded.replace(/^[/\\]+/, ''));
    if (fs.existsSync(candidateRel)) {
      try { if (fs.statSync(candidateRel).isFile()) return candidateRel; } catch (_) {}
    }
  }

  return null;
}

// 9. File Preview & Code Inspector API
app.get('/api/file/preview', (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath) return res.status(400).json({ error: 'Missing path' });

  const validPath = resolveValidFilePath(rawPath);
  const ext = path.extname(validPath || rawPath).toLowerCase().replace('.', '');
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isCode = CODE_EXTENSIONS.has(ext);

  if (!validPath) {
    if (isImage) {
      // 1x1 transparent PNG fallback so img tags don't break
      const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      res.setHeader('Content-Type', 'image/png');
      return res.status(200).send(transparentPng);
    }
    if (ext === 'pdf') {
      return res.status(404).send('PDF file not found on disk');
    }
    return res.json({
      type: isCode ? 'code' : 'mock',
      name: path.basename(rawPath),
      language: MONACO_LANG_MAP[ext] || 'plaintext',
      content: `// [PROJEKT NEXUS] Plik nie został odnaleziony na dysku:\n// ${rawPath}\n// Upewnij się, że ścieżka do pliku istnieje i jest dostępna.`,
      totalLines: 3
    });
  }

  if (ext === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(validPath))}"`);
    return res.sendFile(validPath);
  }

  if (isImage) {
    const mimeMap = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', tiff: 'image/tiff'
    };
    if (mimeMap[ext]) {
      res.setHeader('Content-Type', mimeMap[ext]);
    }
    return res.sendFile(validPath);
  }

  if (isCode) {
    try {
      const content = fs.readFileSync(validPath, 'utf-8');
      return res.json({
        type: 'code',
        language: MONACO_LANG_MAP[ext] || 'plaintext',
        content: content.slice(0, 30000),
        totalLines: content.split('\n').length
      });
    } catch (e) {
      return res.status(500).json({ error: 'Cannot read file' });
    }
  }

  res.json({
    type: 'binary',
    message: `Plik binarny/wykonywalny (${ext.toUpperCase()})`
  });
});

// 9b. Full File Content API for Nexus Code Studio & SQLite Database Inspector
app.get('/api/file/content', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path parameter' });

  try {
    const resolvedPath = resolveValidFilePath(filePath) || path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Plik nie istnieje na dysku', path: resolvedPath });
    }
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Ścieżka wskazuje na katalog, a nie plik' });
    }

    const ext = path.extname(resolvedPath).toLowerCase().replace('.', '');

    // Under-The-Hood: Native SQLite Database Studio
    if (['sqlite', 'db', 'sqlite3'].includes(ext) || SQLiteInspector.isSQLiteFile(resolvedPath)) {
      const dbData = SQLiteInspector.inspectDatabase(resolvedPath);
      if (dbData.isSqlite) {
        return res.json({
          success: true,
          type: 'sqlite',
          path: resolvedPath,
          name: path.basename(resolvedPath),
          ext,
          size: stat.size,
          mtime: stat.mtime,
          ...dbData
        });
      }
    }

    if (stat.size > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'Plik przekracza limit edytora (20 MB)', size: stat.size });
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const language = MONACO_LANG_MAP[ext] || 'plaintext';

    res.json({
      success: true,
      path: resolvedPath,
      name: path.basename(resolvedPath),
      ext,
      language,
      size: stat.size,
      mtime: stat.mtime,
      content,
      totalLines: content.split('\n').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9b. Media Thumbnail Streaming & Cache API
app.get('/api/thumbnail', (req, res) => {
  ThumbnailService.handleThumbnailRequest(req, res);
});

// 9c. System Memory Watchdog API
app.get('/api/system/memory', (req, res) => {
  res.json(MemoryWatchdog.checkMemory());
});

// 9d. Context-Guided Search with Silent Ollama Semantic Intelligence
app.post('/api/guided-search', async (req, res) => {
  const { query = '', answers = {}, page = 1, limit = 50 } = req.body;
  const items = cachedResults.items || [];

  let effectiveQuery = query;
  if (query && query.trim().length > 2) {
    try {
      const expanded = await OllamaSemanticEngine.expandSemanticQuery(query);
      if (expanded && expanded.length > 1) {
        effectiveQuery = expanded.join(' ');
      }
    } catch (_) {}
  }

  const result = UniversalProgressiveEngine.evaluateStep(items, answers, effectiveQuery, page, limit);
  res.json({
    ...result,
    totalIndexed: items.length,
    initialCount: items.length,
    isSemanticAugmented: effectiveQuery !== query
  });
});

// 9e. Pure Node.js ZIP Inspection API
app.get('/api/zip/inspect', async (req, res) => {
  const zipPath = req.query.path;
  if (!zipPath) return res.status(400).json({ error: 'Brak parametru path' });
  try {
    const resolved = path.resolve(String(zipPath));
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Plik ZIP nie istnieje na dysku' });
    }
    const meta = await NexusZipEngine.listEntries(resolved);
    res.json({ success: true, meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9f. Pure Node.js ZIP Unpack API
app.post('/api/zip/unpack', async (req, res) => {
  const { zipPath, destDir } = req.body;
  if (!zipPath) return res.status(400).json({ error: 'Brak parametru zipPath' });
  try {
    const resolvedZip = path.resolve(String(zipPath));
    if (!fs.existsSync(resolvedZip)) {
      return res.status(404).json({ error: 'Plik ZIP nie istnieje' });
    }
    const targetDest = destDir
      ? path.resolve(String(destDir))
      : path.join(path.dirname(resolvedZip), path.basename(resolvedZip, path.extname(resolvedZip)));
    const result = await NexusZipEngine.unpackAll(resolvedZip, targetDest);
    res.json({ success: true, unpackedCount: result.unpackedCount, destDir: targetDest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9g. Code & Symbol Inspector API
app.get('/api/code/inspect', (req, res) => {
  const codePath = req.query.path;
  if (!codePath) return res.status(400).json({ error: 'Brak parametru path' });
  try {
    const resolved = path.resolve(String(codePath));
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Plik nie istnieje' });
    }
    const symbols = SyntaxIndexer.extractSymbols(resolved);
    res.json({ success: true, ...(symbols || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9h. Autonomous Planner Execution API
app.post('/api/planner/execute', async (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('AUTONOMOUS_PLAN_EXECUTION');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  const { planId, isDryRun } = req.body;
  if (!AutonomousPlanner.supportsPlan(planId)) {
    return res.status(400).json({ error: 'Brak planu lub plan nie obsługuje bezpiecznego przenoszenia plików.' });
  }
  try {
    const roots = cachedResults.activeRoots || [];
    const targetBase = roots.length === 1 && fs.existsSync(roots[0])
      ? roots[0]
      : path.join(os.homedir(), 'Downloads');
    if (isProtectedSystemPath(targetBase)) {
      return res.status(403).json({ error: 'Odmowa: nie można organizować plików w katalogu systemowym.' });
    }
    const planner = new AutonomousPlanner(targetBase);
    const result = await planner.executePlan(
      planId,
      cachedResults.items || [],
      !!isDryRun,
      getInstallerRedundancyPaths()
    );
    if (!isDryRun && result.operations) {
      for (const op of result.operations) {
        if (op.status === 'MOVED') {
          cachedResults.items = cachedResults.items.filter(i => i.path !== op.source);
          broadcast({ type: 'action:item_deleted', path: op.source });
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9i. Autonomous Planner Rollback API
app.post('/api/planner/rollback', async (req, res) => {
  const { journalId } = req.body;
  if (!journalId) return res.status(400).json({ error: 'Brak journalId' });
  try {
    const roots = cachedResults.activeRoots || [];
    const targetBase = roots.length === 1 && fs.existsSync(roots[0])
      ? roots[0]
      : path.join(os.homedir(), 'Downloads');
    const planner = new AutonomousPlanner(targetBase);
    const result = await planner.rollback(journalId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function isProtectedSystemPath(targetPath) {
  if (!targetPath) return true;
  const norm = path.resolve(String(targetPath)).toLowerCase();
  const winDir = (process.env.WINDIR || 'c:\\windows').toLowerCase();
  const sysDrive = (process.env.SystemDrive || 'c:').toLowerCase() + '\\';
  const progFiles = (process.env.ProgramFiles || 'c:\\program files').toLowerCase();
  const progFilesX86 = (process.env['ProgramFiles(x86)'] || 'c:\\program files (x86)').toLowerCase();
  
  if (norm === sysDrive || norm === winDir || norm.startsWith(winDir + '\\')) return true;
  if (norm === progFiles || norm.startsWith(progFiles + '\\')) return true;
  if (norm === progFilesX86 || norm.startsWith(progFilesX86 + '\\')) return true;
  if (/^[a-z]:\\?$/i.test(norm)) return true;
  return false;
}

function getInstallerRedundancyPaths() {
  return (cachedResults.stats?.duplicateInstallers || [])
    .flatMap(group => Array.isArray(group.redundancies) ? group.redundancies : [])
    .map(item => item.path)
    .filter(filePath => typeof filePath === 'string');
}

// 9j. Instant Fast Delete API (With Windows Recycle Bin Safety & System Protection)
app.post('/api/action/instant-delete', async (req, res) => {
  const filePath = req.body.path || req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  try {
    const resolved = path.resolve(String(filePath));
    if (isProtectedSystemPath(resolved)) {
      return res.status(403).json({ error: 'Odmowa: Próba usunięcia chronionego pliku lub katalogu systemowego Windows' });
    }
    const delResult = await WindowsRecycleBin.moveToRecycleBin(resolved);
    if (!delResult.success) {
      return res.status(500).json({ error: delResult.error || 'Nie udało się przenieść pliku do Kosza systemowego.' });
    }

    cachedResults.items = cachedResults.items.filter(i => i.path !== resolved && i.path !== filePath);
    broadcast({ type: 'action:item_deleted', path: resolved });
    res.json({ success: true, status: 'deleted', path: resolved, method: delResult.method });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9k. Quick Move to Workspace / Project API
app.post('/api/action/quick-move', (req, res) => {
  const { sourcePath, targetDir } = req.body;
  if (!sourcePath || !targetDir) return res.status(400).json({ error: 'Brak wymaganych parametrów' });
  try {
    const srcResolved = path.resolve(String(sourcePath));
    const targetDirResolved = path.resolve(String(targetDir));
    if (isProtectedSystemPath(srcResolved) || isProtectedSystemPath(targetDirResolved)) {
      return res.status(403).json({ error: 'Odmowa: Próba operacji na chronionym katalogu systemowym Windows' });
    }
    if (!fs.existsSync(srcResolved)) {
      return res.status(404).json({ error: 'Plik źródłowy nie istnieje' });
    }
    if (!fs.existsSync(targetDirResolved)) {
      fs.mkdirSync(targetDirResolved, { recursive: true });
    }

    const fileName = path.basename(srcResolved);
    let destResolved = path.join(targetDirResolved, fileName);

    if (fs.existsSync(destResolved) && destResolved !== srcResolved) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      destResolved = path.join(targetDirResolved, `${base}_${Date.now()}${ext}`);
    }

    try {
      fs.renameSync(srcResolved, destResolved);
    } catch (renameError) {
      if (renameError.code !== 'EXDEV') throw renameError;
      fs.copyFileSync(srcResolved, destResolved, fs.constants.COPYFILE_EXCL);
      try {
        fs.unlinkSync(srcResolved);
      } catch (unlinkError) {
        try {
          fs.unlinkSync(destResolved);
        } catch (cleanupError) {
          console.error(`[Nexus] Nie udało się usunąć kopii po nieudanym przeniesieniu ${destResolved}:`, cleanupError.message);
        }
        throw unlinkError;
      }
    }

    const stat = fs.statSync(destResolved);
    const ext = path.extname(destResolved).toLowerCase().replace('.', '');
    const existing = cachedResults.items.find(i => i.path === srcResolved);

    const newItem = {
      id: existing ? existing.id : `file-${Date.now()}`,
      name: path.basename(destResolved),
      path: destResolved,
      dir: targetDirResolved,
      extension: ext,
      size: stat.size,
      mtime: stat.mtimeMs,
      category: existing ? existing.category : 'OTHER',
      subCategory: existing ? existing.subCategory : ext.toUpperCase(),
      isDisposable: false,
      confidence: existing ? existing.confidence : 0.95,
      workspaceId: existing ? existing.workspaceId : undefined,
      tags: existing ? existing.tags : []
    };

    cachedResults.items = cachedResults.items.filter(i => i.path !== srcResolved);
    cachedResults.items.unshift(newItem);

    broadcast({ type: 'action:item_deleted', path: srcResolved });
    broadcast({ type: 'action:item_created', item: newItem });

    res.json({ success: true, status: 'moved', item: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9l. Open in Default OS Application API
app.post('/api/action/open-default', (req, res) => {
  const filePath = req.body.path || req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  const resolved = path.resolve(String(filePath));
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Plik nie istnieje.' });

  const threat = SmartShield.analyzeCyberThreat(resolved, path.basename(resolved));
  const settings = SmartShield.loadSettings();
  if (threat && settings.shieldActive && settings.blockMalware) {
    return res.status(403).json({
      error: `Smart Shield zablokował uruchomienie potencjalnie niebezpiecznego pliku (${threat.threatReason || threat.threatType})`
    });
  }

  if (process.platform === 'win32') {
    const escaped = resolved.replace(/'/g, "''");
    const script = `Start-Process -LiteralPath '${escaped}'`;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { windowsHide: true }, (err) => {
      if (err) {
        console.error('[Nexus] Nie udało się otworzyć pliku:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Nie udało się otworzyć pliku w aplikacji systemowej.' });
      } else if (!res.headersSent) {
        res.json({ success: true });
      }
    });
  } else {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(cmd, [resolved], (err) => {
      if (err) {
        console.error('[Nexus] Nie udało się otworzyć pliku:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Nie udało się otworzyć pliku w aplikacji systemowej.' });
      } else if (!res.headersSent) {
        res.json({ success: true });
      }
    });
  }
});

// 9l-2. Open in OS File Explorer (reveal or open folder)
app.post('/api/action/open-in-explorer', (req, res) => {
  const targetPath = req.body.path || req.body.filePath;
  if (!targetPath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  const resolved = path.resolve(String(targetPath));
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Ścieżka nie istnieje' });
  }

  if (process.platform === 'win32') {
    try {
      const stat = fs.statSync(resolved);
      const explorerPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
      if (stat.isDirectory()) {
        execFile(explorerPath, [resolved], { windowsHide: false }, () => {});
      } else {
        exec(`"${explorerPath}" /select,"${resolved.replace(/"/g, '""')}"`, { windowsHide: false }, () => {});
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('[Nexus] Nie udało się otworzyć Eksploratora:', err);
      return res.status(500).json({ error: 'Nie udało się otworzyć lokalizacji pliku.' });
    }
  } else {
    const xdgOpenPath = fs.existsSync('/usr/bin/xdg-open') ? '/usr/bin/xdg-open' : 'xdg-open';
    execFile(xdgOpenPath, [path.dirname(resolved)], (err) => {
      if (err) console.error('[Nexus] Nie udało się otworzyć menedżera plików:', err.message);
    });
    res.json({ success: true });
  }
});

// 9l-3. Validate Path Existence and Stats
// 9m. Send to Discord / Photoshop Handshake API
app.post('/api/action/discord-photoshop', (req, res) => {
  const filePath = req.body.path || req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  const resolved = path.resolve(String(filePath));
  const fileName = path.basename(resolved);
  const ext = path.extname(resolved).toLowerCase();
  res.json({
    success: true,
    path: resolved,
    fileName,
    ext,
    discordSnippet: `[Nexus Asset: ${fileName}](${resolved})`
  });
});

// 9n. Cryptographic Hash Calculation API (SHA-256 + MD5 + Blake3 + xxHash64)
app.post('/api/action/calculate-hash', async (req, res) => {
  const filePath = req.body.path || req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  try {
    const resolved = path.resolve(String(filePath));
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Plik nie istnieje' });
    const stat = fs.statSync(resolved);
    const hashSha256 = crypto.createHash('sha256');
    const hashSha512 = crypto.createHash('sha512');

    // Calculate Blake3 + xxHash64
    const fastHash = await FastHasher.hashFile(resolved);

    if (stat.size <= 2 * 1024 * 1024) {
      const buf = fs.readFileSync(resolved);
      hashSha256.update(buf);
      hashSha512.update(buf);
      return res.json({
        success: true,
        path: resolved,
        size: stat.size,
        sha256: hashSha256.digest('hex'),
        sha512: hashSha512.digest('hex'),
        blake3: fastHash?.blake3 || null,
        xxhash: fastHash?.xxhash || null
      });
    }

    const stream = fs.createReadStream(resolved);
    stream.on('data', chunk => {
      hashSha256.update(chunk);
      hashSha512.update(chunk);
    });
    stream.on('end', () => {
      res.json({
        success: true,
        path: resolved,
        size: stat.size,
        sha256: hashSha256.digest('hex'),
        sha512: hashSha512.digest('hex'),
        blake3: fastHash?.blake3 || null,
        xxhash: fastHash?.xxhash || null
      });
    });
    stream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9n-2. Image EXIF & AI Generation Prompt Inspector API (Stable Diffusion / Midjourney / ComfyUI)
app.get('/api/file/image-meta', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  const result = await ImageMetadataInspector.inspectImage(filePath);
  res.json(result);
});

// 9n-3. Windows Native Runtime OCR Extraction API (Screenshots / Memes / Docs)
app.get('/api/action/ocr-extract', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki pliku' });
  const result = await WinRtOcr.extractText(filePath);
  res.json(result);
});

// 9n-4. VirusTotal SHA-256 Reputation Query API
app.post('/api/shield/virustotal', async (req, res) => {
  const { sha256, apiKey } = req.body;
  if (!sha256) return res.status(400).json({ error: 'Brak sumy kontrolnej SHA-256' });
  const result = await VirusTotalChecker.checkHash(sha256, apiKey || '');
  res.json(result);
});


// 9n-10. Real Ollama Installation API (Requires explicit user consent)
app.post('/api/ai/install-ollama', async (req, res) => {
  const { userConsent } = req.body;
  if (!userConsent) {
    return res.status(400).json({ error: 'Wymagana wyraźna zgoda użytkownika na instalację Ollama (User consent required).' });
  }
  try {
    const installRes = await AIAgentEngine.installOllama(true);
    res.json(installRes);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9o. Create Item API (New File or Folder)
app.post('/api/action/create-item', (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('CREATE_WORKSPACE_FILE');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  const { type, parentPath, name, content = '' } = req.body;
  if (!parentPath || !name) return res.status(400).json({ error: 'Wymagane parametry: parentPath, name' });
  try {
    const safeName = path.basename(String(name).trim());
    if (!safeName || safeName === '.' || safeName === '..') {
      return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku lub folderu.' });
    }
    const resolvedParent = path.resolve(String(parentPath));
    const fullPath = path.resolve(resolvedParent, safeName);

    if (!isPathWithin(resolvedParent, fullPath) || isProtectedSystemPath(fullPath)) {
      return res.status(403).json({ error: 'Niedozwolona operacja poza wskazanym katalogiem nadrzędnym.' });
    }

    if (type !== 'folder') {
      const threat = SmartShield.analyzeCyberThreat(fullPath, safeName);
      const settings = SmartShield.loadSettings();
      if (threat && settings.shieldActive && settings.blockMalware) {
        return res.status(403).json({
          error: `Smart Shield zablokował utworzenie pliku sklasyfikowanego jako cyberzagrożenie (${threat.threatReason || threat.threatType})`
        });
      }
    }

    if (!fs.existsSync(resolvedParent)) {
      fs.mkdirSync(resolvedParent, { recursive: true });
    }
    if (fs.existsSync(fullPath)) {
      return res.status(409).json({ error: 'Obiekt o tej nazwie już istnieje' });
    }

    if (type === 'folder') {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }

    const stat = fs.statSync(fullPath);
    const ext = type === 'folder' ? '' : path.extname(fullPath).toLowerCase().replace('.', '');
    
    let cat = 'OTHER';
    if (['tsx', 'ts', 'jsx', 'js', 'py', 'json', 'css', 'html'].includes(ext)) cat = 'DEV';
    else if (['png', 'jpg', 'webp', 'svg', 'gif'].includes(ext)) cat = 'MEDIA';
    else if (['pdf', 'docx', 'txt', 'md'].includes(ext)) cat = 'DOCS';

    const newItem = {
      id: `item-${Date.now()}`,
      name,
      path: fullPath,
      dir: resolvedParent,
      extension: ext,
      size: stat.size,
      mtime: stat.mtimeMs,
      category: cat,
      subCategory: cat,
      isDisposable: false,
      confidence: 1.0,
      tags: [`#${ext || 'folder'}`, `#${cat.toLowerCase()}`]
    };

    cachedResults.items.unshift(newItem);
    broadcast({ type: 'action:item_created', item: newItem });

    res.json({ success: true, item: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9p. Organize by Topics on Disk API
app.post('/api/action/organize-by-topics', (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('BATCH_FILE_MUTATIONS');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  const { clusters = [], targetRoot } = req.body;
  const root = targetRoot ? path.resolve(String(targetRoot)) : cachedResults.activePath;
  if (!root) return res.status(400).json({ error: 'Brak targetRoot' });

  const organizedBase = path.join(root, 'Organized_Workspace');
  let movedCount = 0;
  const createdFolders = [];

  try {
    if (!fs.existsSync(organizedBase)) {
      fs.mkdirSync(organizedBase, { recursive: true });
      createdFolders.push(organizedBase);
    }

    for (const cluster of clusters) {
      const topicDir = path.join(organizedBase, cluster.title || cluster.id);
      if (!fs.existsSync(topicDir)) {
        fs.mkdirSync(topicDir, { recursive: true });
        createdFolders.push(topicDir);
      }

      if (Array.isArray(cluster.years)) {
        for (const yrGroup of cluster.years) {
          const yrDir = path.join(topicDir, `Rocznik_${yrGroup.year}`);
          if (!fs.existsSync(yrDir)) {
            fs.mkdirSync(yrDir, { recursive: true });
            createdFolders.push(yrDir);
          }

          if (Array.isArray(yrGroup.items)) {
            for (const item of yrGroup.items) {
              if (item.path && fs.existsSync(item.path)) {
                const destPath = path.join(yrDir, item.name);
                try {
                  fs.renameSync(item.path, destPath);
                  movedCount++;
                  cachedResults.items = cachedResults.items.filter(i => i.path !== item.path);
                  broadcast({ type: 'action:item_deleted', path: item.path });
                } catch (_) {}
              }
            }
          }
        }
      }
    }

    res.json({
      success: true,
      movedCount,
      createdFolders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9c. Transactional File Save API for Code & Image Studios
app.post('/api/file/save', (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('CODE_STUDIO_WRITE');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  const { path: filePath, content, isBase64, createBackup = true, saveAsCopy = false } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Brak ścieżki docelowej pliku' });
  if (content === undefined || content === null) return res.status(400).json({ error: 'Brak zawartości do zapisu' });

  try {
    let targetPath = path.resolve(filePath);
    const fileName = path.basename(targetPath);
    const threat = SmartShield.analyzeCyberThreat(targetPath, fileName);
    const settings = SmartShield.loadSettings();
    if (threat && settings.shieldActive && settings.blockMalware) {
      return res.status(403).json({
        error: `Smart Shield zablokował zapis pliku sklasyfikowanego jako cyberzagrożenie (${threat.threatReason || threat.threatType})`
      });
    }
    let backupPath = null;

    if (saveAsCopy) {
      const dir = path.dirname(targetPath);
      const ext = path.extname(targetPath);
      const name = path.basename(targetPath, ext);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      targetPath = path.join(dir, `${name}.edited_${timestamp}${ext}`);
    } else if (createBackup && fs.existsSync(targetPath)) {
      const backupDir = path.join(path.dirname(targetPath), '.nexus_backups');
      try {
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const bName = `${path.basename(targetPath)}.${Date.now()}.bak`;
        backupPath = path.join(backupDir, bName);
        fs.copyFileSync(targetPath, backupPath);
      } catch (bkErr) {
        console.warn('Backup warning:', bkErr.message);
      }
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (isBase64) {
      const base64Data = content.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(targetPath, buffer);
    } else {
      fs.writeFileSync(targetPath, content, 'utf-8');
    }

    const stat = fs.statSync(targetPath);

    broadcast({
      type: 'file_saved',
      path: targetPath,
      name: path.basename(targetPath),
      size: stat.size,
      mtime: stat.mtime,
      backupPath
    });

    res.json({
      success: true,
      path: targetPath,
      name: path.basename(targetPath),
      size: stat.size,
      mtime: stat.mtime,
      backupPath,
      savedAsCopy: !!saveAsCopy
    });
  } catch (err) {
    console.error('File save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 11. ADVANCE CORE SETTINGS & SMART SHIELD API
// ============================================================================

app.get('/api/settings/advance', (req, res) => {
  const settings = SmartShield.loadSettings();
  const quarantine = SmartShield.loadQuarantine();
  res.json({
    ...settings,
    totalQuarantined: quarantine.length
  });
});

app.post('/api/settings/advance', (req, res) => {
  const saved = SmartShield.saveSettings(req.body);
  res.json({ success: true, settings: saved });
});

app.get('/api/shield/status', (req, res) => {
  const settings = SmartShield.loadSettings();
  const quarantine = SmartShield.loadQuarantine();
  res.json({
    isShieldActive: settings.shieldActive,
    blockNsfw: settings.blockNsfw,
    blockMalware: settings.blockMalware,
    useContextualAnalysis: settings.useContextualAnalysis,
    nsfwSensitivity: settings.nsfwSensitivity,
    quarantinedCount: quarantine.length,
    activeRulesCount: (settings.routingRules || []).filter(r => r.enabled).length
  });
});

app.post('/api/shield/toggle', (req, res) => {
  const settings = SmartShield.loadSettings();
  const { isShieldActive, blockNsfw, blockMalware, useContextualAnalysis } = req.body;
  if (typeof isShieldActive === 'boolean') settings.shieldActive = isShieldActive;
  if (typeof blockNsfw === 'boolean') settings.blockNsfw = blockNsfw;
  if (typeof blockMalware === 'boolean') settings.blockMalware = blockMalware;
  if (typeof useContextualAnalysis === 'boolean') settings.useContextualAnalysis = useContextualAnalysis;
  SmartShield.saveSettings(settings);
  res.json({ success: true, settings });
});

app.get('/api/shield/quarantine', (req, res) => {
  res.json(SmartShield.loadQuarantine());
});

app.post('/api/shield/test-context', (req, res) => {
  const { text, filename, content, name } = req.body || {};
  const evalText = typeof text === 'string' ? text : (typeof content === 'string' ? content : '');
  const evalName = typeof filename === 'string' ? filename : (typeof name === 'string' ? name : '');
  const result = SmartShield.evaluateContext(evalText, evalName);
  res.json(result);
});

const handleShieldRestore = (req, res) => {
  const { id } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Brak identyfikatora wpisu kwarantanny (id).' });
  }
  const result = SmartShield.restoreFile(id);
  res.json(result);
};
app.post('/api/shield/restore', handleShieldRestore);
app.post('/api/shield/quarantine/restore', handleShieldRestore);

const handleShieldRestoreSafeBatch = (req, res) => {
  const quarantine = SmartShield.loadQuarantine();
  let restored = 0;
  for (const item of [...quarantine]) {
    const ctx = SmartShield.evaluateContext(item.name, item.name);
    if (ctx.isEducational || item.threatType === 'BENIGN_DEV' || item.isBenignDev) {
      const r = SmartShield.restoreFile(item.id);
      if (r.success) restored++;
    }
  }
  res.json({ success: true, count: restored, restoredCount: restored });
};
app.post('/api/shield/restore-safe-batch', handleShieldRestoreSafeBatch);
app.post('/api/shield/quarantine/restore-safe-batch', handleShieldRestoreSafeBatch);

const handleShieldReEvaluate = (req, res) => {
  const quarantine = SmartShield.loadQuarantine();
  let safeCount = 0;
  for (const item of quarantine) {
    const ctx = SmartShield.evaluateContext(item.name, item.name);
    if (ctx.isEducational || item.threatType === 'BENIGN_DEV' || item.isBenignDev) {
      safeCount++;
    }
  }
  res.json({ safeCount, totalCount: quarantine.length });
};
app.get('/api/shield/re-evaluate', handleShieldReEvaluate);
app.get('/api/shield/quarantine/re-evaluate', handleShieldReEvaluate);

const handleShieldPurge = (req, res) => {
  const { id } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Brak identyfikatora wpisu kwarantanny (id).' });
  }
  const result = SmartShield.purgeFile(id);
  res.json(result);
};
app.post('/api/shield/purge', handleShieldPurge);
app.post('/api/shield/quarantine/purge', handleShieldPurge);

const handleShieldPurgeAll = (req, res) => {
  const result = SmartShield.purgeAll();
  res.json(result);
};
app.post('/api/shield/purge-all', handleShieldPurgeAll);
app.post('/api/shield/quarantine/purge-all', handleShieldPurgeAll);

app.get('/api/shield/ghost-junk', (req, res) => {
  const roots = cachedResults.activeRoots?.length
    ? cachedResults.activeRoots
    : [path.join(os.homedir(), 'Downloads')];
  const requestedPath = typeof req.query.path === 'string' ? path.resolve(req.query.path) : null;
  if (requestedPath && !roots.some(root => isPathWithin(root, requestedPath))) {
    return res.status(403).json({ error: 'Można skanować wyłącznie katalogi z aktywnego indeksu.' });
  }

  const scanRoots = requestedPath ? [requestedPath] : roots;
  const junk = scanRoots.flatMap(root => SmartShield.scanGhostJunk(root));
  const staleInstallers = junk.filter(item => item.type === 'OLD_INSTALLER' || item.type === 'DUPLICATE_INSTALLER');
  const tempJunk = junk.filter(item => item.type !== 'OLD_INSTALLER' && item.type !== 'DUPLICATE_INSTALLER');
  const reclaimableBytes = junk.reduce((total, item) => total + (Number(item.size) || 0), 0);
  res.json({
    staleInstallers,
    tempJunk,
    totalItems: junk.length,
    reclaimableBytes,
    reclaimableMB: (reclaimableBytes / (1024 ** 2)).toFixed(1),
    reclaimableGB: (reclaimableBytes / (1024 ** 3)).toFixed(2)
  });
});

app.post('/api/shield/purge-ghost-junk', async (req, res) => {
  const { paths } = req.body;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 10000 || paths.some(p => typeof p !== 'string')) {
    return res.status(400).json({ success: false, error: 'Wskaż od 1 do 10000 prawidłowych ścieżek do wyczyszczenia.' });
  }

  const roots = cachedResults.activeRoots?.length
    ? cachedResults.activeRoots
    : [path.join(os.homedir(), 'Downloads')];
  const detected = new Set(roots.flatMap(root => SmartShield.scanGhostJunk(root)).map(item => path.resolve(item.path)));
  let deletedCount = 0;
  let recycledFileCount = 0;
  let removedDirectoryCount = 0;
  let reclaimedBytes = 0;
  const errors = [];

  for (const requestedPath of [...new Set(paths)]) {
    const resolved = path.resolve(requestedPath);
    const root = roots.find(candidate => isPathWithin(candidate, resolved));
    if (!root || isProtectedSystemPath(resolved) || !detected.has(resolved)) {
      errors.push({ path: requestedPath, error: 'Ścieżka nie jest aktualnym kandydatem w dozwolonym katalogu.' });
      continue;
    }

    try {
      const stat = await fs.promises.lstat(resolved);
      if (stat.isSymbolicLink()) {
        throw new Error('Usuwanie dowiązań symbolicznych jest zablokowane.');
      }
      if (stat.isDirectory()) {
        const entries = await fs.promises.readdir(resolved);
        if (entries.length > 0) throw new Error('Katalog nie jest już pusty.');
        await fs.promises.rmdir(resolved);
        removedDirectoryCount++;
      } else if (stat.isFile()) {
        const result = await WindowsRecycleBin.moveToRecycleBin(resolved);
        if (!result.success) throw new Error(result.error || 'Nie udało się usunąć pliku.');
        reclaimedBytes += stat.size;
        recycledFileCount++;
      } else {
        throw new Error('Nieobsługiwany typ ścieżki.');
      }
      deletedCount++;
    } catch (err) {
      errors.push({ path: requestedPath, error: err.message });
    }
  }

  res.status(errors.length > 0 ? 207 : 200).json({
    success: errors.length === 0,
    deletedCount,
    recycledFileCount,
    removedDirectoryCount,
    reclaimedBytes,
    reclaimedGB: (reclaimedBytes / (1024 ** 3)).toFixed(2),
    errors
  });
});

app.get('/api/shield/duplicates', (req, res) => {
  const targetDir = req.query.path || cachedResults.activePath || path.join(os.homedir(), 'Downloads');
  const dups = SmartShield.scanDuplicates(targetDir);
  res.json(dups);
});
// ============================================================================
// AI AGENT & OLLAMA LOCAL/CLOUD ORCHESTRATION ROUTES
// ============================================================================

app.get('/api/ai/status', async (req, res) => {
  try {
    const settings = AIAgentEngine.loadSettings();
    const ollamaStatus = await AIAgentEngine.checkOllamaStatus(settings.ollama?.endpoint || 'http://127.0.0.1:11434');
    
    res.json({
      success: true,
      ollama: ollamaStatus,
      userAi: {
        provider: settings.userAi?.provider || 'openai',
        endpoint: settings.userAi?.endpoint || 'https://api.openai.com/v1',
        model: settings.userAi?.model || 'gpt-4o-mini',
        hasKey: Boolean(settings.userAi?.apiKey && settings.userAi.apiKey.trim().length > 0)
      },
      orchestration: {
        primary: settings.primaryProvider || 'ollama',
        helper: settings.helperProvider || 'ollama',
        fallbackEnabled: settings.fallbackEnabled !== false,
        privacyMode: settings.privacyMode || 'strict_local',
        autonomyLevel: settings.autonomyLevel || 'review_all',
        localDataBoundary: settings.privacyMode === 'strict_local'
      },
      permissions: settings.permissions || AIAgentEngine.defaultSettings.permissions,
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/settings', (req, res) => {
  try {
    const newSettings = req.body;
    const current = AIAgentEngine.loadSettings();
    const merged = { ...current, ...newSettings };
    AIAgentEngine.saveSettings(merged);
    res.json({ success: true, settings: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/test-connection', async (req, res) => {
  try {
    const { provider, config } = req.body;
    if (provider === 'ollama') {
      const endpoint = config?.endpoint || 'http://127.0.0.1:11434';
      const status = await AIAgentEngine.checkOllamaStatus(endpoint);
      res.json({
        success: status.running,
        latencyMs: status.latencyMs,
        status: status.status,
        models: status.models,
        modelCount: status.modelCount,
        isLocal: true,
        error: status.error
      });
    } else {
      const testRes = await AIAgentEngine.testUserAiConnection(config || {});
      res.json(testRes);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/inspect-project', (req, res) => {
  try {
    const { path: projectPath } = req.body;
    const target = projectPath || cachedResults.activePath || process.cwd();
    const info = AIAgentEngine.inspectWorkspaceProject(target);
    res.json(info);
  } catch (err) {
    res.status(500).json({ exists: false, error: err.message });
  }
});


app.post('/api/ai/agent/command', async (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('AI_CHAT_ACCESS');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  try {
    const { command, context } = req.body;
    const ctx = {
      workspacePath: context?.workspacePath || cachedResults.activePath || process.cwd(),
      currentFile: context?.currentFile || null,
      cachedItems: cachedResults.items || [],
      cachedCategories: cachedResults.categories || {},
      cachedStats: cachedResults.stats || null,
      ...context
    };
    const result = await AIAgentEngine.executeNaturalCommand(command, ctx);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Interactive Ollama Chat with real filesystem access & file reading
app.post('/api/ai/chat', async (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('AI_CHAT_ACCESS');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  try {
    const { messages = [], model, workspacePath, attachedFile, clientItemsSample, totalClientFiles } = req.body;
    const activeWs = workspacePath || cachedResults.activePath || process.cwd();
    const result = await AIAgentEngine.chatWithOllama({
      messages,
      model,
      workspacePath: activeWs,
      attachedFile,
      clientItemsSample,
      totalClientFiles,
      cachedItems: (cachedResults.items && cachedResults.items.length > 0) ? cachedResults.items : (clientItemsSample || [])
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Intelligent Tagging: Status & readiness
app.get('/api/ai/tagging/status', async (req, res) => {
  try {
    const settings = AIAgentEngine.loadSettings();
    const endpoint = settings.ollama?.endpoint || 'http://127.0.0.1:11434';
    const status = await AIAgentEngine.checkOllamaStatus(endpoint);
    const license = LicenseVault.getStatus();
    res.json({
      success: true,
      ollama: status,
      license: {
        isPro: license.isPro,
        tier: license.tier,
        maxBatchSize: license.isPro ? 30 : 5
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Intelligent Tagging: Batch analysis with server-side PRO tier enforcement
app.post('/api/ai/tagging/analyze', async (req, res) => {
  try {
    const { items, model, isVisionModel = false } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Brak plików do analizy.' });
    }
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ success: false, error: 'Wybierz model Ollama.' });
    }

    const license = LicenseVault.getStatus();
    if (isVisionModel && !license.isPro && items.length > 5) {
      return res.status(403).json({
        success: false,
        code: 'PRO_LICENSE_REQUIRED',
        error: 'Masowa analiza obrazów Vision AI (>5 plików) wymaga aktywnej licencji NEXUS PRO.'
      });
    }

    const settings = AIAgentEngine.loadSettings();
    const endpoint = settings.ollama?.endpoint || 'http://127.0.0.1:11434';

    // Server-side batch size cap: FREE tier = 5 items max, PRO tier = 30 items per request
    const maxBatchSize = license.isPro ? 30 : 5;
    const targetItems = items.slice(0, maxBatchSize);
    const results = [];

    for (const it of targetItems) {
      if (!it || typeof it !== 'object') continue;
      const analysis = await AIAgentEngine.analyzeItemWithOllama({
        item: it,
        model: model.trim(),
        isVisionModel: Boolean(isVisionModel),
        endpoint
      });
      results.push({
        id: it.id,
        path: it.path,
        name: it.name,
        ...analysis
      });
    }

    res.json({
      success: true,
      model: model.trim(),
      isVisionModel: Boolean(isVisionModel),
      isPro: license.isPro,
      maxBatchSize,
      truncatedByTier: items.length > maxBatchSize && !license.isPro,
      analyzedCount: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Intelligent Tagging: Apply reviewed tags to memory cache and notify clients
app.post('/api/ai/tagging/apply-tags', (req, res) => {
  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Brak zmian do zatwierdzenia.' });
    }

    let appliedCount = 0;
    const updateMap = new Map(updates.filter(u => u && (u.id || u.path)).map(u => [u.id || u.path, u]));

    if (Array.isArray(cachedResults.items)) {
      for (const item of cachedResults.items) {
        const up = updateMap.get(item.id) || updateMap.get(item.path);
        if (up) {
          if (Array.isArray(up.tags) && up.tags.length > 0) {
            const sanitizedTags = up.tags
              .filter(t => typeof t === 'string' && t.trim().length > 0)
              .map(t => t.trim().slice(0, 48));
            const existingTags = Array.isArray(item.tags) ? item.tags : [];
            item.tags = Array.from(new Set([...existingTags, ...sanitizedTags]));
          }
          if (up.category && typeof up.category === 'string' && up.category !== 'Do sprawdzenia' && up.category !== 'Nieznane') {
            item.subCategory = up.category.trim().slice(0, 64);
          }
          appliedCount++;
        }
      }
    }

    broadcast({ type: 'tags:updated', appliedCount });

    res.json({
      success: true,
      appliedCount,
      totalItemsInIndex: cachedResults.items ? cachedResults.items.length : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// LICENSE & CRYPTO ACTIVATION ROUTES (DECENTRALIZED / SELF-CUSTODY)
// ============================================================================
const { CryptoCheckoutEngine } = require('./licensing/crypto_checkout.cjs');

// Get current license status
app.get('/api/license/status', (req, res) => {
  try {
    const status = LicenseVault.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify server-side feature entitlement
app.get('/api/license/verify-feature', (req, res) => {
  try {
    const featureId = req.query.feature || req.query.featureId || '';
    const entitlement = LicenseVault.verifyFeatureAccess(String(featureId));
    res.status(entitlement.allowed ? 200 : 403).json({
      success: entitlement.allowed,
      ...entitlement
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/verify-feature', (req, res) => {
  try {
    const { featureId, feature } = req.body || {};
    const entitlement = LicenseVault.verifyFeatureAccess(String(featureId || feature || ''));
    res.status(entitlement.allowed ? 200 : 403).json({
      success: entitlement.allowed,
      ...entitlement
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Activate license with 16-character code
app.post('/api/license/activate', (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ success: false, error: 'Wprowadź kod licencji.' });
    }
    const result = LicenseVault.activateKey(key);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deactivate current license on this machine (requires authenticated session via middleware)
app.post('/api/license/deactivate', (req, res) => {
  try {
    const result = LicenseVault.deactivateCurrentLicense();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Revoke a license key (requires authenticated session via middleware)
app.post('/api/license/revoke', (req, res) => {
  try {
    const { key, reason } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, error: 'Wskaż klucz licencyjny do unieważnienia.' });
    }
    const result = LicenseVault.revokeKey(key, reason || 'REVOKED_BY_ADMIN');
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new crypto checkout order (FIXED: async/await + error validation)
app.post('/api/crypto/create-order', async (req, res) => {
  try {
    const { currency = 'LTC', metadata = {}, priceUsd, customPriceUsd } = req.body || {};
    const mergedMetadata = {
      ...metadata,
      customPriceUsd: customPriceUsd ?? priceUsd ?? metadata.customPriceUsd ?? metadata.priceUsd
    };
    const created = await CryptoCheckoutEngine.createOrder(currency, mergedMetadata);
    if (!created || created.success === false) {
      return res.status(400).json({
        success: false,
        error: created?.error || 'Nie udało się utworzyć zamówienia płatności.',
        code: created?.code || 'ORDER_CREATE_FAILED'
      });
    }
    const orderObj = created.order || created;
    res.json({
      success: true,
      order: orderObj,
      ...orderObj
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Poll order status & detect blockchain transaction
app.get('/api/crypto/order-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await CryptoCheckoutEngine.checkOrderStatus(orderId);
    if (result && result.status === 'NOT_FOUND') {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manually verify transaction by on-chain TX hash / signature
app.post('/api/crypto/verify-tx', async (req, res) => {
  try {
    const { orderId, txHash } = req.body || {};
    if (!orderId || !txHash) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: orderId oraz txHash.'
      });
    }
    const result = await CryptoCheckoutEngine.verifyTransactionByHash(orderId, txHash);
    if (!result.success && (result.code === 'TX_ALREADY_CONSUMED' || result.code === 'INVALID_TX_HASH_FORMAT' || result.code === 'MISSING_PARAMETERS')) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel an active pending crypto order
app.post('/api/crypto/cancel-order', (req, res) => {
  try {
    const { orderId, reason } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Wymagany identyfikator zamówienia (orderId).' });
    }
    const result = CryptoCheckoutEngine.cancelOrder(orderId, reason || 'USER_CANCELLED');
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Signed webhook receiver with HMAC-SHA256 verification and replay protection
app.post('/api/crypto/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-nexus-signature'] || req.headers['x-webhook-signature'] || '';
    const timestamp = req.headers['x-nexus-timestamp'] || req.headers['x-webhook-timestamp'] || '';
    const eventId = req.headers['x-nexus-event-id'] || req.body?.eventId || '';
    const rawBody = JSON.stringify(req.body || {});

    const result = await CryptoCheckoutEngine.processWebhook({
      payload: req.body || {},
      rawBody,
      signature: String(signature),
      timestamp: String(timestamp),
      eventId: String(eventId)
    });

    if (!result.success) {
      const status = result.code === 'INVALID_SIGNATURE' || result.code === 'TIMESTAMP_OUT_OF_RANGE' ? 401 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Simulate dev payment (instant activation test — guarded in production)
app.post('/api/crypto/simulate-payment', (req, res) => {
  try {
    const { orderId } = req.body || {};
    const result = CryptoCheckoutEngine.simulateDevPayment(orderId);
    if (!result.success) {
      const statusCode = result.code === 'SIMULATION_FORBIDDEN_IN_PROD' ? 403 : 400;
      return res.status(statusCode).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get developer wallet addresses and pricing config
app.get('/api/crypto/config', (req, res) => {
  try {
    const config = CryptoCheckoutEngine.loadConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update developer wallet addresses in storage (requires authenticated session via middleware)
app.post('/api/crypto/config', (req, res) => {
  try {
    const { wallets, targetPriceUsd, orderTtlMinutes, requiredConfirmations } = req.body || {};
    const result = CryptoCheckoutEngine.saveConfig({
      wallets,
      targetPriceUsd,
      orderTtlMinutes,
      requiredConfirmations
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, config: result.config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real organization execution (Nexus doesn't just find — Nexus executes)
app.post('/api/ai/agent/execute-organization', async (req, res) => {
  const entitlement = LicenseVault.verifyFeatureAccess('AUTONOMOUS_PLAN_EXECUTION');
  if (!entitlement.allowed) {
    return res.status(403).json({ success: false, error: entitlement.error, code: 'PRO_REQUIRED' });
  }

  try {
    const { targetDir, planId } = req.body;
    if (!AutonomousPlanner.supportsPlan(planId)) {
      return res.status(400).json({ success: false, error: 'Wskaż obsługiwany plan organizacji.' });
    }
    if (targetDir !== undefined && typeof targetDir !== 'string') {
      return res.status(400).json({ success: false, error: 'Nieprawidłowa ścieżka katalogu docelowego.' });
    }
    const roots = cachedResults.activeRoots?.length
      ? cachedResults.activeRoots
      : [path.join(os.homedir(), 'Downloads')];
    const defaultTarget = roots.find(root => isPathWithin(root, cachedResults.activePath || '')) || roots[0];
    const dir = path.resolve(targetDir || defaultTarget);
    if (!roots.some(root => isPathWithin(root, dir)) || isProtectedSystemPath(dir)) {
      return res.status(403).json({ success: false, error: 'Katalog docelowy musi znajdować się w bezpiecznym, aktywnie skanowanym katalogu.' });
    }
    const planner = new AutonomousPlanner(dir);
    const result = await planner.executePlan(planId, cachedResults.items, false, getInstallerRedundancyPaths());
    
    // Update memory index: remove successfully moved files or mark new paths
    if (result.operations && result.operations.length > 0) {
      const movedMap = new Map();
      for (const op of result.operations) {
        if (op.status === 'MOVED') movedMap.set(op.source, op.destination);
      }
      cachedResults.items = cachedResults.items.map(item => {
        if (movedMap.has(item.path)) {
          const newPath = movedMap.get(item.path);
          return {
            ...item,
            path: newPath,
            dir: path.dirname(newPath)
          };
        }
        return item;
      });
    }

    broadcast({ type: 'files:organized', result });

    res.json({
      success: true,
      movedCount: result.operations ? result.operations.filter(o => o.status === 'MOVED').length : 0,
      errorsCount: result.errors ? result.errors.length : 0,
      operations: result.operations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real file drop / upload security inspector
app.post('/api/shield/inspect-file', (req, res) => {
  try {
    const { path: filePath, name: fileName, text } = req.body;
    const threat = SmartShield.analyzeCyberThreat(filePath, fileName);
    const context = SmartShield.evaluateContext(text || '', fileName || '');
    const settings = SmartShield.loadSettings();

    if (threat && settings.shieldActive && settings.blockMalware) {
      const quarantined = filePath ? SmartShield.quarantineFile(filePath, threat) : null;
      return res.json({
        blocked: true,
        quarantined: !!quarantined,
        threatType: threat.threatType,
        reason: threat.threatReason,
        detail: threat.threatDetail,
        severity: threat.severity,
        quarantineRecord: quarantined
      });
    }

    if (context.isExplicit && settings.shieldActive && settings.blockNsfw) {
      const quarantined = (filePath && settings.nsfwAction === 'quarantine')
        ? SmartShield.quarantineFile(filePath, { threatType: 'NSFW_EXPLICIT_BLOCKED', threatReason: context.reason, severity: 'HIGH' })
        : null;
      return res.json({
        blocked: true,
        quarantined: !!quarantined,
        threatType: 'NSFW_EXPLICIT_BLOCKED',
        reason: context.reason,
        detail: 'Wykryto materiały dla dorosłych / wulgaryzmy o podłożu seksualnym.',
        severity: 'HIGH',
        quarantineRecord: quarantined
      });
    }

    res.json({
      blocked: false,
      status: 'VERIFIED_SAFE',
      context
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 12. SAAS AUTHENTICATION & IDENTITY VAULT
// ==========================================

// Register with auto-generated machine-bound .searched cryptographic key file
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    const result = authVault.register({ username, email, password });
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Standard user login
app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    const result = authVault.login({ identifier, password });
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Current user profile verification
app.get('/api/auth/me', (req, res) => {
  try {
    const token = readSessionToken(req);
    const user = authVault.verifySession(token);
    if (!user) {
      return res.status(401).json({ authenticated: false, error: 'Brak aktywnej sesji' });
    }
    setSessionCookie(res, token);
    res.json({ authenticated: true, user });
  } catch (err) {
    res.status(500).json({ authenticated: false, error: err.message });
  }
});

// User logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const token = readSessionToken(req);
    authVault.logout(token);
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Zero-knowledge password reset strictly requiring proprietary .searched machine-bound key file
app.post('/api/auth/forgot-password-verify', (req, res) => {
  try {
    const { searchedFileContent, newPassword } = req.body;
    const result = authVault.resetPasswordWithSearchedFile({ searchedFileContent, newPassword });
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Official Windows Installer package download endpoint (.exe setup)
app.get('/api/download/installer', (req, res) => {
  try {
    const exePath = path.resolve(__dirname, '..', 'public', 'Nexus_Setup.exe');
    if (fs.existsSync(exePath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="Nexus_Setup.exe"');
      res.setHeader('Content-Type', 'application/x-msdownload');
      return res.sendFile(exePath);
    }
    const distExe = path.resolve(__dirname, '..', 'dist_installer', 'Nexus_Setup.exe');
    if (fs.existsSync(distExe)) {
      res.setHeader('Content-Disposition', 'attachment; filename="Nexus_Setup.exe"');
      res.setHeader('Content-Type', 'application/x-msdownload');
      return res.sendFile(distExe);
    }
    const zipPath = path.resolve(__dirname, '..', 'public', 'Project-Nexus-Windows.zip');
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="Project-Nexus-Windows.zip"');
      res.setHeader('Content-Type', 'application/zip');
      return res.sendFile(zipPath);
    }
    const installerPath = path.resolve(__dirname, 'install', 'nexus_installer.bat');
    if (fs.existsSync(installerPath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="nexus_installer.bat"');
      res.setHeader('Content-Type', 'application/x-bat');
      return res.sendFile(installerPath);
    }
    res.status(404).json({ error: 'Plik instalatora nie został odnaleziony w repozytorium.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Production static frontend serving (Vite dist build)
const distPath = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[PROJECT NEXUS] Port ${PORT} jest już zajęty przez aktywną instancję serwera. Wykorzystuję istniejącą instancję.`);
    process.exit(0);
  } else {
    console.error('[PROJECT NEXUS] Błąd serwera:', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[PROJECT NEXUS] Server running securely on http://${HOST}:${PORT} (ENV: ${process.env.NODE_ENV || 'development'})`);
});
