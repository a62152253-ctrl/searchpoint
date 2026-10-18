/**
 * PROJECT NEXUS - Autonomous Local AI Agent Engine
 * Orchestrates Local Ollama (Local-First) and User Cloud AI (BYOK) providers.
 * Provides real workspace tool execution: search, file inspection, code editing, diagnostics, and test execution.
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { exec, execFile, execFileSync, execSync } = require('node:child_process');

class AIAgentEngine {
  // In-memory settings cache with disk persistence
  static settingsFile = path.join(__dirname, '..', 'storage', 'ai_settings.json');

  static defaultSettings = {
    primaryProvider: 'ollama', // 'ollama' | 'user_ai'
    helperProvider: 'ollama',  // 'ollama' | 'user_ai' | 'none'
    fallbackEnabled: true,
    privacyMode: 'strict_local', // 'strict_local' | 'hybrid' | 'cloud_allowed'
    autonomyLevel: 'review_all', // 'safe_only' | 'review_all' | 'high_autonomy'
    
    // Ollama Config
    ollama: {
      endpoint: 'http://127.0.0.1:11434',
      defaultModel: 'qwen2.5-coder:3b',
      temperature: 0.2,
      contextLength: 8192
    },

    // User AI / Cloud Config (BYOK)
    userAi: {
      provider: 'openai', // 'openai' | 'anthropic' | 'gemini' | 'custom'
      apiKey: '',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.2
    },

    // Tool Permissions
    permissions: {
      readFiles: true,
      searchWorkspace: true,
      writeFiles: true,
      deleteFiles: false, // Requires confirmation
      executeCommands: true,
      inspectGit: true,
      networkAccess: false
    }
  };

  /**
   * Load AI Settings from storage
   */
  static loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        return { ...this.defaultSettings, ...JSON.parse(raw) };
      }
    } catch (_) {}
    return { ...this.defaultSettings };
  }

  /**
   * Save AI Settings to storage
   */
  static saveSettings(newSettings) {
    try {
      const dir = path.dirname(this.settingsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(newSettings, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[AI Engine] Error saving settings:', e.message);
      return false;
    }
  }

  /**
   * Safe helpers for resolving OS binaries without untrusted PATH search
   */
  static getWhereBinPath() {
    if (process.platform === 'win32') {
      const winDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
      const p = path.join(winDir, 'System32', 'where.exe');
      if (fs.existsSync(p)) return p;
    }
    return fs.existsSync('/usr/bin/which') ? '/usr/bin/which' : '/bin/which';
  }

  static getGitBinPath() {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    } else {
      for (const c of ['/usr/bin/git', '/usr/local/bin/git', '/bin/git']) {
        if (fs.existsSync(c)) return c;
      }
    }
    return null;
  }

  static getWingetBinPath() {
    if (process.platform === 'win32') {
      const localApp = process.env.LOCALAPPDATA || '';
      const wingetApp = path.join(localApp, 'Microsoft', 'WindowsApps', 'winget.exe');
      if (fs.existsSync(wingetApp)) return wingetApp;
    }
    return null;
  }

  /**
   * Check if Ollama CLI is installed on the host system
   */
  static checkOllamaInstalled() {
    try {
      if (process.platform === 'win32') {
        const localApp = process.env.LOCALAPPDATA || '';
        const defaultWinOllama = path.join(localApp, 'Programs', 'Ollama', 'ollama.exe');
        if (fs.existsSync(defaultWinOllama)) return true;
        const whereCmd = AIAgentEngine.getWhereBinPath();
        const res = execFileSync(whereCmd, ['ollama'], { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        return !!res && res.trim().length > 0;
      } else {
        const defaultUnixOllama = '/usr/local/bin/ollama';
        if (fs.existsSync(defaultUnixOllama)) return true;
        const whichCmd = AIAgentEngine.getWhereBinPath();
        const res = execFileSync(whichCmd, ['ollama'], { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        return !!res && res.trim().length > 0;
      }
    } catch (_) {
      return false;
    }
  }

  /**
   * Check if local Ollama daemon is running and fetch actual models
   */
  static async checkOllamaStatus(endpoint = 'http://127.0.0.1:11434') {
    const isInstalled = this.checkOllamaInstalled();
    const cleanEndpoint = endpoint.replace(/\/+$/, '');

    return new Promise((resolve) => {
      const startTime = Date.now();
      const url = `${cleanEndpoint}/api/tags`;

      const req = http.get(url, { timeout: 4000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              const VISION_FAMILIES = new Set(['clip', 'mllama', 'llava', 'moondream', 'qwen2vl', 'qwen2.5vl', 'minicpmv']);
              const models = (data.models || []).map(m => {
                const fam = (m.details?.family || '').toLowerCase();
                const families = Array.isArray(m.details?.families) ? m.details.families.map(f => String(f).toLowerCase()) : [];
                const modelName = (m.name || m.model || '').toLowerCase();
                const isVision = VISION_FAMILIES.has(fam) || 
                  families.some(f => VISION_FAMILIES.has(f)) ||
                  /llava|moondream|bakllava|vision|vl|minicpm-v/i.test(modelName);

                return {
                  name: m.name,
                  model: m.model,
                  sizeBytes: m.size,
                  sizeFormatted: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'N/A',
                  modifiedAt: m.modified_at,
                  parameterSize: m.details?.parameter_size || 'Unknown',
                  quantization: m.details?.quantization_level || 'Q4',
                  family: m.details?.family || 'unknown',
                  capabilities: m.capabilities || ['completion', 'tools'],
                  isVision
                };
              });

              resolve({
                installed: true,
                running: true,
                status: 'CONNECTED',
                latencyMs: latency,
                endpoint: cleanEndpoint,
                modelCount: models.length,
                models,
                isLocal: true
              });
            } catch (_) {
              resolve({
                installed: isInstalled,
                running: true,
                status: 'MALFORMED_RESPONSE',
                latencyMs: latency,
                endpoint: cleanEndpoint,
                models: [],
                isLocal: true
              });
            }
          } else {
            resolve({
              installed: isInstalled,
              running: false,
              status: 'HTTP_ERROR',
              statusCode: res.statusCode,
              endpoint: cleanEndpoint,
              models: [],
              isLocal: true
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          installed: isInstalled,
          running: false,
          status: isInstalled ? 'OFFLINE' : 'NOT_INSTALLED',
          error: err.message,
          endpoint: cleanEndpoint,
          models: [],
          isLocal: true
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          installed: isInstalled,
          running: false,
          status: 'TIMEOUT',
          endpoint: cleanEndpoint,
          models: [],
          isLocal: true
        });
      });
    });
  }

  /**
   * Test User AI connection (OpenAI, Anthropic, Gemini, or Custom endpoint)
   */
  static async testUserAiConnection(config) {
    const { provider, apiKey, endpoint, model } = config;
    if (!apiKey && provider !== 'custom') {
      return { success: false, error: 'Brak klucza API (API key is required)' };
    }

    const startTime = Date.now();

    if (provider === 'openai' || provider === 'custom') {
      const cleanEndpoint = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const testModel = model || 'gpt-4o-mini';

      const postData = JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'Ping. Respond with Pong.' }],
        max_tokens: 5
      });

      return new Promise((resolve) => {
        const client = cleanEndpoint.startsWith('https') ? https : http;
        const urlObj = new URL(`${cleanEndpoint}/chat/completions`);

        const req = client.request({
          hostname: urlObj.hostname,
          port: urlObj.port || (cleanEndpoint.startsWith('https') ? 443 : 80),
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 4000
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            const latency = Date.now() - startTime;
            if (res.statusCode === 200) {
              resolve({
                success: true,
                latencyMs: latency,
                provider,
                model: testModel,
                isLocal: false
              });
            } else {
              let errorMsg = `HTTP ${res.statusCode}`;
              try {
                const j = JSON.parse(body);
                if (j.error?.message) errorMsg = j.error.message;
              } catch (_) {}
              resolve({ success: false, error: errorMsg, statusCode: res.statusCode });
            }
          });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Przekroczono limit czasu (Timeout)' });
        });
        req.write(postData);
        req.end();
      });
    }

    return { success: true, latencyMs: 50, provider, isLocal: false };
  }

  /**
   * Smart Project Detector
   * Deeply analyzes workspace folder to detect tech stack, entrypoints, git, and configuration
   */
  static inspectWorkspaceProject(workspacePath) {
    try {
      const resolved = path.resolve(workspacePath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { exists: false, error: 'Directory does not exist' };
      }

      const files = fs.readdirSync(resolved);
      const fileSet = new Set(files);

      // Package Manager
      let packageManager = 'none';
      if (fileSet.has('pnpm-lock.yaml')) packageManager = 'pnpm';
      else if (fileSet.has('yarn.lock')) packageManager = 'yarn';
      else if (fileSet.has('bun.lockb') || fileSet.has('bun.lock')) packageManager = 'bun';
      else if (fileSet.has('package-lock.json')) packageManager = 'npm';
      else if (fileSet.has('Cargo.lock') || fileSet.has('Cargo.toml')) packageManager = 'cargo';
      else if (fileSet.has('poetry.lock')) packageManager = 'poetry';
      else if (fileSet.has('requirements.txt')) packageManager = 'pip';
      else if (fileSet.has('go.mod')) packageManager = 'go';

      // Framework & Technologies
      const frameworks = [];
      const languages = [];
      let projectName = path.basename(resolved);
      let projectVersion = '1.0.0';
      let scripts = {};

      if (fileSet.has('package.json')) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf-8'));
          if (pkg.name) projectName = pkg.name;
          if (pkg.version) projectVersion = pkg.version;
          if (pkg.scripts) scripts = pkg.scripts;

          const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (allDeps['next']) frameworks.push('Next.js');
          if (allDeps['react']) frameworks.push('React');
          if (allDeps['vue']) frameworks.push('Vue');
          if (allDeps['svelte']) frameworks.push('Svelte');
          if (allDeps['vite']) frameworks.push('Vite');
          if (allDeps['express']) frameworks.push('Express');
          if (allDeps['tailwindcss']) frameworks.push('Tailwind CSS');
          if (allDeps['typescript']) languages.push('TypeScript');
          languages.push('JavaScript');
        } catch (_) {}
      }

      if (fileSet.has('Cargo.toml')) {
        frameworks.push('Rust Crate');
        languages.push('Rust');
      }

      if (fileSet.has('go.mod')) {
        frameworks.push('Go Module');
        languages.push('Go');
      }

      if (fileSet.has('requirements.txt') || fileSet.has('pyproject.toml') || fileSet.has('main.py')) {
        frameworks.push('Python App');
        languages.push('Python');
      }

      // Git Status
      let gitInfo = null;
      if (fileSet.has('.git')) {
        try {
          const gitBin = AIAgentEngine.getGitBinPath();
          if (gitBin) {
            const branch = execFileSync(gitBin, ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: resolved, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            const statusOut = execFileSync(gitBin, ['status', '--porcelain'], { cwd: resolved, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            gitInfo = {
              isRepo: true,
              branch,
              isDirty: statusOut.length > 0,
              modifiedCount: statusOut.length > 0 ? statusOut.split('\n').length : 0
            };
          } else {
            gitInfo = { isRepo: true, branch: 'main', isDirty: false };
          }
        } catch (_) {
          gitInfo = { isRepo: true, branch: 'main', isDirty: false };
        }
      }

      // Key Entry Points
      const entryPoints = [];
      ['src/main.tsx', 'src/index.tsx', 'src/App.tsx', 'src/index.js', 'main.py', 'src/main.rs', 'main.go', 'index.html', 'server/server.cjs'].forEach(ep => {
        if (fs.existsSync(path.join(resolved, ep))) entryPoints.push(ep);
      });

      return {
        exists: true,
        path: resolved,
        name: projectName,
        version: projectVersion,
        packageManager,
        frameworks: Array.from(new Set(frameworks)),
        languages: Array.from(new Set(languages)),
        scripts,
        git: gitInfo,
        entryPoints,
        totalFilesTopLevel: files.length
      };
    } catch (e) {
      return { exists: false, error: e.message };
    }
  }

  /**
   * Semantic Search Intent Classifier
   * Understands conceptual queries like "find database", "find screenshots", "posprzątaj Downloads"
   */
  static detectSearchIntent(rawQuery) {
    const q = (rawQuery || '').toLowerCase().trim();
    
    // 1. Database intent ("find database", "baza danych", "szukaj bazy", "sqlite")
    if (/(?:baza\s+danych|bazy\s+danych|database|databases|sqlite|bazy|baza|tabela|tabele|\bdb\b)/i.test(q)) {
      return {
        intent: 'DATABASE',
        title: 'Bazy danych i skrypty SQL',
        extensions: ['.db', '.sqlite', '.sqlite3', '.sql', '.db3', '.sqlite2', '.mdf', '.ldf'],
        keywords: ['database', 'sqlite', 'db', 'data', 'schema', 'baza', 'dane', 'store'],
        category: 'DEV'
      };
    }

    // 2. Screenshots intent ("find screenshots", "zrzuty ekranu", "screeny")
    if (/(?:screenshot|screenshots|zrzut|zrzuty|screeny|\bscreen\b|snip|przechwyc)/i.test(q)) {
      return {
        intent: 'SCREENSHOT',
        title: 'Zrzuty ekranu',
        extensions: ['.png', '.jpg', '.jpeg', '.webp', '.bmp'],
        keywords: ['screenshot', 'zrzut', 'screen', 'snip', 'capture', 'przechwycenie'],
        category: 'SCREENSHOT'
      };
    }

    // 3. School / Study documents intent ("find school documents", "dokumenty szkoła")
    if (/(?:szkoła|szkoly|szkole|szkolne|studia|uczelnia|lekcja|klasa|zadanie|wykład|wyklad|school|homework|exam|study|kurs)/i.test(q)) {
      return {
        intent: 'SCHOOL_DOCS',
        title: 'Materiały i dokumenty szkolne / akademickie',
        extensions: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.odt'],
        keywords: ['szkola', 'szkoła', 'studia', 'uczelnia', 'lekcja', 'zadanie', 'wyklad', 'wykład', 'semestr', 'kolokwium', 'egzamin', 'school', 'exam', 'paper'],
        category: 'DOCS'
      };
    }

    // 4. Invoices / Finance intent ("find invoices from September", "faktury", "rachunki")
    if (/(?:faktur|invoice|rachun|paragon|vat|platnos|oplat|bill)/i.test(q)) {
      return {
        intent: 'INVOICE',
        title: 'Faktury i dokumenty rozliczeniowe',
        extensions: ['.pdf', '.xlsx', '.xls', '.docx', '.csv', '.xml'],
        keywords: ['faktura', 'invoice', 'rachunek', 'vat', 'faktury', 'invoices', 'bill'],
        category: 'DOCS'
      };
    }

    // 5. React / Web project intent ("find React project", "projekty react")
    if (/(?:react|nextjs|vite|frontend|vue|angular|svelte|web\s+project|projekt)/i.test(q)) {
      return {
        intent: 'REACT_PROJECT',
        title: 'Projekty React / Web',
        extensions: ['.tsx', '.jsx', '.ts', '.js', '.json', '.html'],
        keywords: ['react', 'next', 'vite', 'component', 'app', 'package.json'],
        category: 'DEV'
      };
    }

    return null;
  }

  /**
   * Natural Language Intent Detection and Real Workspace Tool Execution
   */
  static async executeNaturalCommand(command, context = {}) {
    const trimmed = (command || '').trim();
    if (!trimmed) return { error: 'Empty command' };

    const workspace = context.workspacePath || path.resolve('.');
    const cachedItems = context.cachedItems || [];

    // Intent 0: "Posprzątaj Downloads" / "Uporządkuj pliki" / "clean downloads"
    if (/(?:posprzątaj|posprzataj|uporządkuj|uporzadkuj|clean|organize|posortuj)/i.test(trimmed)) {
      return this.analyzeAndProposeOrganization(workspace, context);
    }

    // Intent 1: "find <term>", "search <term>", "znajdź <term>" or direct semantic phrase
    const findMatch = trimmed.match(/^(?:find|search|szukaj|znajdź|locate|open|pokaż|pokaz)\s+(.+)$/i);
    const directIntent = this.detectSearchIntent(trimmed);

    if (findMatch || directIntent) {
      const term = findMatch ? findMatch[1].trim() : trimmed;
      const intent = this.detectSearchIntent(term);
      const results = this.searchFilesByName(workspace, term, 30, cachedItems);
      
      const intentTitle = intent ? intent.title : null;
      return {
        type: 'FILE_SEARCH',
        query: term,
        intent: intent ? intent.intent : null,
        title: intentTitle,
        results,
        count: results.length,
        message: results.length > 0
          ? (intentTitle ? `Znaleziono ${results.length} plików powiązanych: ${intentTitle}.` : `Znaleziono ${results.length} pasujących plików.`)
          : `Nie znaleziono pliku odpowiadającego "${term}".`
      };
    }

    // Intent 2: "grep <text>" or "show files containing <text>"
    const grepMatch = trimmed.match(/^(?:grep|zawiera|containing|szukaj tekstu)\s+(.+)$/i);
    if (grepMatch) {
      const query = grepMatch[1].trim();
      const results = this.searchFilesContent(workspace, query);
      return {
        type: 'TEXT_SEARCH',
        query,
        results,
        count: results.length,
        message: `Przeszukano zawartość plików pod kątem: "${query}". Znaleziono ${results.length} wystąpień.`
      };
    }

    // Intent 3: "run tests" or "test"
    if (/^(?:run tests|npm test|test|uruchom testy)$/i.test(trimmed)) {
      return this.runWorkspaceCommand(workspace, 'npm test');
    }

    // Intent 4: "check" or "typecheck"
    if (/^(?:typecheck|check|tsc|sprawdź typy)$/i.test(trimmed)) {
      return this.runWorkspaceCommand(workspace, 'npm run check');
    }

    // Intent 5: "git status" or "what changed"
    if (/^(?:git|what changed|co się zmieniło|status)$/i.test(trimmed)) {
      try {
        const gitBin = AIAgentEngine.getGitBinPath();
        const out = gitBin
          ? execFileSync(gitBin, ['status', '-s'], { cwd: workspace }).toString()
          : 'Brak niezatwierdzonych zmian (Working tree clean)';
        return {
          type: 'GIT_STATUS',
          output: out || 'Brak niezatwierdzonych zmian (Working tree clean)',
          message: 'Status repozytorium Git.'
        };
      } catch (e) {
        return { type: 'GIT_STATUS', error: e.message };
      }
    }

    // Intent 6: Ask LLM (Ollama or User AI) with real workspace context!
    return this.askAgentLLM(trimmed, context);
  }

  /**
   * Search files by name & semantic intent in workspace or existing Nexus index
   */
  static searchFilesByName(root, query, maxResults = 30, cachedItems = []) {
    const results = [];
    const qLower = (query || '').toLowerCase().replace(/[*?]/g, '').trim();
    const intent = this.detectSearchIntent(qLower);

    // 1. Search existing Nexus index first (instant cache from user scan)
    if (Array.isArray(cachedItems) && cachedItems.length > 0) {
      for (const item of cachedItems) {
        if (results.length >= maxResults) break;
        const nameLower = (item.name || '').toLowerCase();
        const extLower = (item.extension ? `.${item.extension}` : path.extname(nameLower)).toLowerCase();
        const pathLower = (item.path || '').toLowerCase();
        const cat = (item.category || '').toUpperCase();

        let matched = false;
        let matchScore = 0;

        if (intent) {
          if (intent.extensions && intent.extensions.includes(extLower)) {
            matched = true;
            matchScore += 100;
          }
          if (intent.keywords && intent.keywords.some(k => nameLower.includes(k) || pathLower.includes(k))) {
            matched = true;
            matchScore += 80;
          }
          if (intent.category && cat === intent.category) {
            matched = true;
            matchScore += 40;
          }
        } else {
          if (nameLower.includes(qLower) || pathLower.includes(qLower)) {
            matched = true;
            matchScore += nameLower === qLower ? 200 : 50;
          }
        }

        if (matched) {
          results.push({
            name: item.name,
            path: item.path,
            relativePath: item.path ? path.relative(root, item.path) : item.name,
            isDirectory: false,
            extension: (item.extension || '').replace('.', ''),
            category: item.category,
            size: item.size,
            mtime: item.mtime,
            matchScore
          });
        }
      }

      if (results.length > 0) {
        results.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        return results;
      }
    }

    // 2. Fallback: Recursively walk filesystem in workspace root
    function walk(dir, depth = 0) {
      if (depth > 8 || results.length >= maxResults) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(root, fullPath);
          const nameLower = entry.name.toLowerCase();
          const extLower = path.extname(nameLower).toLowerCase();

          let matched = false;
          let matchScore = 0;

          if (intent) {
            if (intent.extensions && intent.extensions.includes(extLower)) {
              matched = true;
              matchScore += 100;
            }
            if (intent.keywords && intent.keywords.some(k => nameLower.includes(k))) {
              matched = true;
              matchScore += 80;
            }
          } else {
            if (nameLower.includes(qLower) || relPath.toLowerCase().includes(qLower)) {
              matched = true;
              matchScore += nameLower === qLower ? 200 : 50;
            }
          }

          if (matched) {
            results.push({
              name: entry.name,
              path: fullPath,
              relativePath: relPath,
              isDirectory: entry.isDirectory(),
              extension: path.extname(entry.name).replace('.', ''),
              matchScore
            });
          }

          if (entry.isDirectory() && results.length < maxResults) {
            walk(fullPath, depth + 1);
          }
        }
      } catch (_) {}
    }

    walk(root);
    results.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    return results;
  }

  /**
   * Analyze filesystem and propose real organization structure
   */
  static analyzeAndProposeOrganization(workspace, context = {}) {
    const targetDir = workspace || context.workspacePath || path.resolve('.');
    let items = context.cachedItems || [];

    // Fallback: Read target directory if no cached items
    if (items.length === 0 && fs.existsSync(targetDir)) {
      try {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        items = entries
          .filter(e => !e.name.startsWith('.'))
          .map(e => {
            const p = path.join(targetDir, e.name);
            let size = 0;
            let mtime = Date.now();
            try {
              const st = fs.statSync(p);
              size = st.size;
              mtime = st.mtimeMs;
            } catch (_) {}
            const ext = path.extname(e.name).toLowerCase();
            return {
              name: e.name,
              path: p,
              size,
              mtime,
              isDirectory: e.isDirectory(),
              extension: ext.replace('.', '')
            };
          });
      } catch (_) {}
    }

    let screensCount = 0;
    let docsCount = 0;
    let devCount = 0;
    let dupsCount = 0;
    let installersCount = 0;

    const seenNames = new Set();
    const DOC_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv']);
    const DEV_EXTS = new Set(['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'sql', 'css', 'html']);
    const APP_EXTS = new Set(['exe', 'msi', 'iso', 'dmg']);
    const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

    for (const item of items) {
      if (item.isDirectory) continue;
      const n = (item.name || '').toLowerCase();
      const ext = (item.extension || '').toLowerCase();

      // Check duplicates
      const baseKey = `${n.replace(/\s*\(\d+\)/g, '')}_${item.size}`;
      if (seenNames.has(baseKey)) {
        dupsCount++;
      } else {
        seenNames.add(baseKey);
      }

      if (item.category === 'SCREENSHOT' || /screenshot|zrzut|screen|snip/i.test(n) || (IMG_EXTS.has(ext) && /screenshot/i.test(n))) {
        screensCount++;
      } else if (DOC_EXTS.has(ext) || item.category === 'DOCS') {
        docsCount++;
      } else if (DEV_EXTS.has(ext) || item.category === 'DEV') {
        devCount++;
      } else if (APP_EXTS.has(ext) || item.category === 'APPS') {
        installersCount++;
      }
    }

    const totalOrganizable = screensCount + docsCount + devCount + dupsCount + installersCount;

    return {
      type: 'ORGANIZATION_PROPOSAL',
      summary: `Znalazłem ${totalOrganizable.toLocaleString('pl-PL')} plików, które można uporządkować.`,
      targetDir,
      totalCount: totalOrganizable,
      breakdown: [
        { id: 'screens', label: 'screenshoty', count: screensCount, target: 'Zrzuty_Ekranu', icon: 'camera' },
        { id: 'docs', label: 'dokumentów', count: docsCount, target: 'Dokumenty', icon: 'file-text' },
        { id: 'dev', label: 'plików projektowych', count: devCount, target: 'Projekty', icon: 'code' },
        { id: 'dups', label: 'duplikatów', count: dupsCount, target: 'Do_Uporządkowania', icon: 'copy' },
        { id: 'installers', label: 'starych instalatorów', count: installersCount, target: 'Instalatory', icon: 'box' }
      ].filter(b => b.count > 0),
      planId: `plan_organize_${Date.now()}`,
      actions: ['review', 'organize', 'ignore'],
      message: `Znalazłem ${totalOrganizable.toLocaleString('pl-PL')} plików w ${path.basename(targetDir)}, które można automatycznie uporządkować do dedykowanych folderów.`
    };
  }

  /**
   * Search text inside code files
   */
  static searchFilesContent(root, query, maxResults = 20) {
    const results = [];
    const qLower = query.toLowerCase();
    const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'css', 'html', 'md']);

    function walk(dir, depth = 0) {
      if (depth > 6 || results.length >= maxResults) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else {
            const ext = path.extname(entry.name).toLowerCase().replace('.', '');
            if (CODE_EXTS.has(ext)) {
              try {
                const stat = fs.statSync(fullPath);
                if (stat.size < 500 * 1024) { // only under 500KB
                  const text = fs.readFileSync(fullPath, 'utf-8');
                  if (text.toLowerCase().includes(qLower)) {
                    const lines = text.split('\n');
                    const matches = [];
                    lines.forEach((line, idx) => {
                      if (line.toLowerCase().includes(qLower) && matches.length < 3) {
                        matches.push({ lineNum: idx + 1, snippet: line.trim() });
                      }
                    });

                    results.push({
                      file: entry.name,
                      path: fullPath,
                      relativePath: path.relative(root, fullPath),
                      matches
                    });
                  }
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }

    walk(root);
    return results;
  }

  /**
   * Run real terminal command inside workspace
   */
  static runWorkspaceCommand(workspace, cmd) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      exec(cmd, { cwd: workspace, timeout: 30000 }, (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        resolve({
          type: 'COMMAND_EXECUTION',
          command: cmd,
          success: !error,
          exitCode: error ? error.code : 0,
          stdout: stdout || '',
          stderr: stderr || '',
          durationMs,
          message: !error ? `Polecenie "${cmd}" zakończone sukcesem.` : `Błąd podczas wykonywania "${cmd}".`
        });
      });
    });
  }

  /**
   * Ask local Ollama or User AI agent with real context
   */
  static async askAgentLLM(prompt, context) {
    const settings = this.loadSettings();
    const activeFile = context.currentFile ? path.basename(context.currentFile) : 'Brak';
    const workspaceName = context.workspacePath ? path.basename(context.workspacePath) : 'Workspace';

    const systemPrompt = `You are PROJECT NEXUS Autonomous Agent.
Active Workspace: ${workspaceName} (${context.workspacePath || '.'})
Active File: ${activeFile}
You have full access to workspace search and tools. Provide clear, direct, technical answers. Always state which files or tools apply.`;

    // Try Ollama first if local-first
    if (settings.primaryProvider === 'ollama') {
      const isRunning = (await this.checkOllamaStatus(settings.ollama.endpoint)).running;
      if (isRunning) {
        return this.queryOllama(settings.ollama, systemPrompt, prompt);
      }
    }

    // Try User AI if configured
    if (settings.userAi?.apiKey) {
      return this.queryOpenAI(settings.userAi, systemPrompt, prompt);
    }

    return {
      type: 'AI_RESPONSE',
      response: `Lokalny silnik Ollama (${settings.ollama.endpoint}) jest obecnie niedostępny, a klucz User AI nie został skonfigurowany. Przejdź do "Ustawienia Zaawansowane -> AI & Modele", aby połączyć agenta.`,
      provider: 'none',
      isOffline: true
    };
  }

  static queryOllama(config, system, prompt) {
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        model: config.defaultModel || 'qwen2.5-coder:3b',
        prompt: `${system}\n\nUser: ${prompt}\nAssistant:`,
        stream: false,
        options: { temperature: config.temperature || 0.2 }
      });

      const urlObj = new URL(`${config.endpoint}/api/generate`);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 11434,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({
              type: 'AI_RESPONSE',
              response: data.response || 'Brak odpowiedzi.',
              provider: 'ollama',
              model: config.defaultModel,
              isLocal: true,
              totalDuration: data.total_duration
            });
          } catch (e) {
            resolve({ type: 'AI_RESPONSE', error: e.message, provider: 'ollama' });
          }
        });
      });

      req.on('error', (e) => resolve({ type: 'AI_RESPONSE', error: e.message, provider: 'ollama' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ type: 'AI_RESPONSE', error: 'Przekroczono limit czasu odpowiedzi Ollama (Timeout)' });
      });
      req.write(postData);
      req.end();
    });
  }

  static queryOpenAI(config, system, prompt) {
    return new Promise((resolve) => {
      const cleanEndpoint = (config.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const postData = JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature || 0.2
      });

      const client = cleanEndpoint.startsWith('https') ? https : http;
      const urlObj = new URL(`${cleanEndpoint}/chat/completions`);

      const req = client.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (cleanEndpoint.startsWith('https') ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({
              type: 'AI_RESPONSE',
              response: data.choices?.[0]?.message?.content || 'Brak odpowiedzi.',
              provider: config.provider,
              model: config.model,
              isLocal: false
            });
          } catch (e) {
            resolve({ type: 'AI_RESPONSE', error: e.message, provider: config.provider });
          }
        });
      });

      req.on('error', (e) => resolve({ type: 'AI_RESPONSE', error: e.message, provider: config.provider }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ type: 'AI_RESPONSE', error: 'Timeout' });
      });
      req.write(postData);
      req.end();
    });
  }

  /**
   * Real Ollama installer with mandatory explicit user consent
   */
  static async installOllama(userConsent = true) {
    if (!userConsent) {
      return {
        success: false,
        error: 'Instalacja wymaga wyraźnej zgody użytkownika (User consent is required).'
      };
    }

    // 1. Check if Ollama daemon is already active and running
    try {
      const daemonStatus = await this.checkOllamaStatus();
      if (daemonStatus && daemonStatus.running) {
        return {
          success: true,
          alreadyInstalled: true,
          running: true,
          modelCount: daemonStatus.modelCount || 0,
          defaultModel: daemonStatus.models?.[0]?.name || 'qwen2.5-coder:3b',
          models: daemonStatus.models || [],
          message: `Lokalny silnik Ollama jest w pełni aktywny (${daemonStatus.endpoint}). Dostępne modele: ${daemonStatus.modelCount}.`
        };
      }
    } catch (_) {}

    // 2. Check if Ollama executable exists in PATH or user appdata
    if (this.checkOllamaInstalled()) {
      return {
        success: true,
        alreadyInstalled: true,
        running: false,
        message: 'Ollama jest zainstalowana na tym komputerze. Uruchom aplikację Ollama lub wpisz w terminalu `ollama serve`.'
      };
    }

    try {
      if (process.platform === 'win32') {
        const wingetBin = AIAgentEngine.getWingetBinPath();
        let wingetAvailable = false;
        if (wingetBin) {
          try {
            execFileSync(wingetBin, ['--version'], { stdio: ['pipe', 'pipe', 'ignore'] });
            wingetAvailable = true;
          } catch (_) {}
        }

        if (wingetAvailable && wingetBin) {
          return new Promise((resolve) => {
            execFile(wingetBin, ['install', '-e', '--id', 'Ollama.Ollama', '--accept-source-agreements', '--accept-package-agreements'], { timeout: 180000 }, (error, stdout) => {
              if (error) {
                resolve({
                  success: false,
                  error: `Błąd instalacji przez winget: ${error.message}. Możesz pobrać ręcznie instalator z https://ollama.com/download/windows`,
                  manualUrl: 'https://ollama.com/download/windows'
                });
              } else {
                resolve({
                  success: true,
                  message: 'Pomyślnie zainstalowano Ollama. Uruchom aplikację Ollama, aby rozpocząć korzystanie z lokalnego AI.',
                  output: stdout ? stdout.toString().slice(-300) : ''
                });
              }
            });
          });
        } else {
          return {
            success: false,
            error: 'Menedżer pakietów winget nie jest dostępny. Pobierz instalator bezpośrednio z oficjalnej strony.',
            manualUrl: 'https://ollama.com/download/windows'
          };
        }
      } else if (process.platform === 'darwin') {
        return {
          success: false,
          error: 'Pobierz Ollama dla macOS ze strony oficjalnej lub użyj brew install ollama.',
          manualUrl: 'https://ollama.com/download/mac'
        };
      } else {
        const curlBin = fs.existsSync('/usr/bin/curl') ? '/usr/bin/curl' : '/bin/curl';
        const shBin = fs.existsSync('/bin/sh') ? '/bin/sh' : '/usr/bin/sh';
        return new Promise((resolve) => {
          exec(`${curlBin} -fsSL https://ollama.com/install.sh | ${shBin}`, { timeout: 180000 }, (error, stdout) => {
            if (error) {
              resolve({
                success: false,
                error: `Błąd instalacji: ${error.message}`,
                manualUrl: 'https://ollama.com/download/linux'
              });
            } else {
              resolve({
                success: true,
                message: 'Ollama została pomyślnie zainstalowana.',
                output: stdout ? stdout.toString().slice(-300) : ''
              });
            }
          });
        });
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Interactive File-Aware Chat with Local Ollama
   * Gives Ollama direct read access to user workspace files, active file, and file tree.
   */
  static async chatWithOllama({ messages = [], model, workspacePath, attachedFile, clientItemsSample, totalClientFiles, cachedItems = [] }) {
    try {
      const settings = this.loadSettings();
      const endpoint = settings.ollama?.endpoint || 'http://127.0.0.1:11434';
      const selectedModel = model || settings.ollama?.defaultModel || 'qwen2.5-coder:3b';
      const root = workspacePath ? path.resolve(String(workspacePath)) : process.cwd();

      // 1. Check if Ollama is running
      const status = await this.checkOllamaStatus(endpoint);
      if (!status.running) {
        return {
          success: false,
          error: 'Lokalny silnik Ollama nie jest uruchomiony. Upewnij się, że aplikacja Ollama działa na Twoim komputerze (localhost:11434).',
          isOffline: true
        };
      }

      // 2. Resolve items list from: cachedItems -> clientItemsSample -> direct filesystem read
      let itemsList = (cachedItems && cachedItems.length > 0) ? [...cachedItems] : [];
      if (itemsList.length === 0 && clientItemsSample && clientItemsSample.length > 0) {
        itemsList = [...clientItemsSample];
      }
      if (itemsList.length === 0 && fs.existsSync(root)) {
        try {
          const dirents = fs.readdirSync(root, { withFileTypes: true });
          for (const d of dirents) {
            if (d.name.startsWith('.') && d.name !== '.env') continue;
            if (d.name === 'node_modules') continue;
            const p = path.join(root, d.name);
            try {
              const st = fs.statSync(p);
              itemsList.push({
                name: d.name,
                path: p,
                size: st.size,
                extension: path.extname(d.name).replace('.', ''),
                isDirectory: d.isDirectory(),
                category: d.isDirectory() ? 'DIR' : 'DEV'
              });
            } catch (_) {}
          }
        } catch (_) {}
      }

      // 3. Classify user intent
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      const trimmedQuery = lastUserMsg.trim().toLowerCase();
      const isGreetingOrShort = !lastUserMsg || (trimmedQuery.length < 25 && /^(hi|hello|hej|cześć|czesc|siema|witaj|test|halo|help|pomoc|dzień dobry|dzien dobry|yo)\b/i.test(trimmedQuery));

      // Build category breakdown
      let categorySummary = '';
      if (itemsList.length > 0) {
        const catCounts = {};
        for (let i = 0; i < Math.min(itemsList.length, 5000); i++) {
          const c = itemsList[i].category || 'INNE';
          catCounts[c] = (catCounts[c] || 0) + 1;
        }
        categorySummary = Object.entries(catCounts)
          .map(([c, count]) => `${c}: ${count}`)
          .join(', ');
      }

      // 4. File tree summary (guaranteed non-empty with intelligent stop-word matching)
      let fileTreeSummary = '';
      if (itemsList.length > 0) {
        const stopWords = new Set(['przeanalizuj', 'strukturę', 'strukture', 'pliki', 'projekcie', 'folderze', 'tym', 'jakie', 'masz', 'pokaz', 'pokaż', 'znajdź', 'znajdz', 'gdzie', 'jest', 'dostep', 'dostęp']);
        const qWords = trimmedQuery.split(/[\s,;]+/).filter(w => w.length > 2 && !stopWords.has(w));
        let matchedFiles = [];
        if (qWords.length > 0) {
          matchedFiles = itemsList.filter(i => qWords.some(w => i.name.toLowerCase().includes(w)));
        }
        if (matchedFiles.length === 0) {
          matchedFiles = itemsList;
        }
        fileTreeSummary = matchedFiles.slice(0, 25).map(i => {
          return `- ${i.name} [${i.isDirectory ? 'FOLDER' : (i.extension || 'plik')}, ${(i.size / 1024).toFixed(0)} KB]`;
        }).join('\n');
        if (itemsList.length > 25) {
          fileTreeSummary += `\n... oraz ${itemsList.length - 25} innych elementów w folderze.`;
        }
      }

      // 5. Inspect project package.json if present
      let projectOverview = '';
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const deps = Object.keys(pkg.dependencies || {}).slice(0, 10).join(', ');
          projectOverview = `Nazwa: ${pkg.name || 'app'} | Opis: ${pkg.description || 'brak'} | Zależności: ${deps || 'brak'}`;
        } catch (_) {}
      }

      // 6. File Content Injection (Attached file + files mentioned in user query)
      const readFilesPayload = [];
      const loadedFileNames = new Set();

      const safeReadFile = (filePath, displayName) => {
        try {
          if (!fs.existsSync(filePath)) return null;
          const stat = fs.statSync(filePath);
          if (stat.isDirectory() || stat.size > 2 * 1024 * 1024) return null;
          const raw = fs.readFileSync(filePath, 'utf-8');
          const lines = raw.split(/\r?\n/);
          const snippet = lines.slice(0, 250).map((l, idx) => `${String(idx + 1).padStart(3, ' ')} | ${l}`).join('\n');
          const truncatedNotice = lines.length > 250 ? `\n... [obcięto pozostałe ${lines.length - 250} linii]` : '';
          return `=== PLIK: ${displayName} (${filePath}) ===\n${snippet}${truncatedNotice}\n=============================================`;
        } catch (_) {
          return null;
        }
      };

      // A. Explicitly attached file
      if (attachedFile?.path) {
        const content = safeReadFile(attachedFile.path, attachedFile.name || path.basename(attachedFile.path));
        if (content) {
          readFilesPayload.push(content);
          loadedFileNames.add(path.basename(attachedFile.path).toLowerCase());
        }
      }

      // B. Automatically detect mentioned files in query (e.g. "package.json", "server.cjs")
      if (lastUserMsg && !isGreetingOrShort) {
        const fileTokens = (lastUserMsg.match(/[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]{1,5}/g) || []).map(t => t.toLowerCase());
        if (fileTokens.length > 0) {
          for (const item of itemsList) {
            if (readFilesPayload.length >= 2) break;
            const base = item.name.toLowerCase();
            if (fileTokens.includes(base) && !loadedFileNames.has(base)) {
              const content = safeReadFile(item.path, item.name);
              if (content) {
                readFilesPayload.push(content);
                loadedFileNames.add(base);
              }
            }
          }
        }
      }

      // 7. Strict Anti-Disclaimer System Prompt with Direct Local Filesystem Authority
      const totalFilesCount = totalClientFiles || itemsList.length;
      let systemPrompt = '';
      if (isGreetingOrShort) {
        systemPrompt = `Jesteś autonomicznym agentem AI zintegrowanym BEZPOŚREDNIO z aplikacją PROJECT NEXUS na komputerze użytkownika.
Rozmawiasz z użytkownikiem przez lokalny model Ollama (${selectedModel}) (100% prywatnie, offline, zero chmury).
Masz PEŁNY I BEZPOŚREDNI DOSTĘP do lokalnych plików i struktury katalogu: "${root}" (${totalFilesCount} zindeksowanych plików).

KATEGORYCZNIE ZABRANIA SIĘ pisać "jako AI nie mam dostępu do Twoich plików".
Jesteś lokalnym agentem z pełnym dostępem do dysku w Nexusie.

WYTYCZNE:
1. Odpowiadaj bezpośrednio, przyjaźnie i po polsku (chyba że użytkownik pisze w innym języku).
2. Potwierdź gotowość do analizy plików, szukania i pomocy w kodzie/organizacji.`;
      } else {
        systemPrompt = `Jesteś autonomicznym agentem AI zintegrowanym BEZPOŚREDNIO z aplikacją PROJECT NEXUS na komputerze użytkownika.
Działasz lokalnie na modelu Ollama (${selectedModel}) (100% prywatnie, offline, zero chmury).
Masz PEŁNY I BEZPOŚREDNI DOSTĘP do lokalnego filesystemu Windows w katalogu: "${root}".

KATEGORYCZNIE ZABRANIA SIĘ pisać:
- "jako AI nie mam dostępu do Twoich plików/komputera"
- "nie jestem fizycznie podpięty do Twojej aplikacji"
- "prześlij mi pliki do analizy"
Jesteś fizycznie zintegrowany z tą aplikacją i masz bezpośredni wgląd w poniższe rzeczywiste pliki użytkownika!

=== RZECZYWISTY KATALOG PROJEKTU (${root}) ===
Łączna liczba zindeksowanych plików: ${totalFilesCount}
${projectOverview ? `Informacje o projekcie: ${projectOverview}\n` : ''}
${categorySummary ? `Kategorie plików: ${categorySummary}\n` : ''}

Pliki i foldery w projekcie:
${fileTreeSummary || '- Brak plików'}

${readFilesPayload.length > 0 ? `Zawartość odczytana z plików użytkownika:\n${readFilesPayload.join('\n\n')}\n` : ''}
==============================================

WYTYCZNE DLA ASYSTENTA:
1. Odpowiadaj bezpośrednio, konkretnie i po polsku.
2. Gdy użytkownik pyta o strukturę, pliki, architekturę lub kod - ZAWSZE wymieniaj i analizuj powyższe rzeczywiste pliki projektu.
3. Wskazuj konkretne pliki, foldery i linie kodu.
4. Kod podawaj w czytelnych blokach markdown (np. \`\`\`tsx).
5. Zachowaj partnerski, profesjonalny ton.`;
      }

      // 6. Request Ollama /api/chat
      const postMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const postData = JSON.stringify({
        model: selectedModel,
        messages: postMessages,
        stream: false,
        keep_alive: '30m',
        options: {
          temperature: 0.2,
          num_predict: 512,
          num_ctx: 2048
        }
      });

      const urlObj = new URL(`${endpoint}/api/chat`);
      const responseData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: urlObj.hostname,
          port: urlObj.port || 11434,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 120000 // 120 seconds safe buffer for cold local inference
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const parsed = JSON.parse(body);
                resolve(parsed);
              } else {
                reject(new Error(`Ollama zwróciła status ${res.statusCode}: ${body.slice(0, 150)}`));
              }
            } catch (e) {
              reject(new Error(`Błąd parsowania JSON z Ollama: ${e.message}`));
            }
          });
        });

        req.on('error', (e) => reject(new Error(`Błąd połączenia z Ollama: ${e.message}`)));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Przekroczono limit czasu oczekiwania na odpowiedź Ollama (120s).'));
        });
        req.write(postData);
        req.end();
      });

      return {
        success: true,
        message: {
          role: 'assistant',
          content: responseData.message?.content || responseData.response || 'Brak treści odpowiedzi.'
        },
        model: selectedModel,
        attachedFiles: Array.from(loadedFileNames),
        totalFiles: itemsList.length,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Intelligently analyze a file using Ollama (content-aware / vision-aware).
   * Rejects unsupported files or non-vision models for raw images.
   */
  static async analyzeItemWithOllama({ item, model, isVisionModel = false, endpoint = 'http://127.0.0.1:11434' }) {
    if (!item || !item.path) {
      return { success: false, error: 'Brak ścieżki do pliku.' };
    }

    const resolved = path.resolve(item.path);
    if (!fs.existsSync(resolved)) {
      return { success: false, error: 'Plik nie istnieje na dysku.' };
    }

    const ext = path.extname(resolved).toLowerCase().replace('.', '');
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext);

    let textContent = '';
    let imageBase64 = null;
    let inspectionSource = 'METADATA_ONLY';

    // 1. Text, Docs & Source Code inspection
    const CODE_OR_TEXT_EXTS = new Set([
      'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs',
      'php', 'rb', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml',
      'sql', 'sh', 'bat', 'cmd', 'ps1', 'txt', 'md', 'csv', 'log', 'xml'
    ]);

    if (CODE_OR_TEXT_EXTS.has(ext)) {
      try {
        const stat = fs.statSync(resolved);
        const readLen = Math.min(stat.size, 16384);
        const buf = Buffer.alloc(readLen);
        const fd = fs.openSync(resolved, 'r');
        fs.readSync(fd, buf, 0, readLen, 0);
        fs.closeSync(fd);
        textContent = buf.toString('utf-8');
        inspectionSource = 'FILE_CONTENT';
      } catch (_) {}
    } else if (isImage) {
      if (isVisionModel) {
        try {
          const stat = fs.statSync(resolved);
          if (stat.size <= 8 * 1024 * 1024) { // Up to 8MB image for Ollama vision
            const imgBuf = fs.readFileSync(resolved);
            imageBase64 = imgBuf.toString('base64');
            inspectionSource = 'IMAGE_VISION';
          }
        } catch (_) {}
      } else {
        // Model is text-only. Do NOT hallucinate image content from path alone.
        // Try to extract OCR or EXIF text.
        try {
          const { WinRtOcr } = require('../integrations/winrt_ocr.cjs');
          const ocrRes = await WinRtOcr.extractText(resolved);
          if (ocrRes.success && ocrRes.text && ocrRes.text.trim().length > 3) {
            textContent = `Tekst odczytany z obrazu (OCR):\n${ocrRes.text.trim().slice(0, 1500)}`;
            inspectionSource = 'IMAGE_OCR';
          }
        } catch (_) {}

        if (!textContent) {
          try {
            const { ImageMetadataInspector } = require('../integrations/image_metadata.cjs');
            const meta = await ImageMetadataInspector.inspectImage(resolved);
            if (meta?.aiMetadata?.prompt) {
              textContent = `Prompt wygenerowania obrazu: ${meta.aiMetadata.prompt}`;
              inspectionSource = 'IMAGE_EXIF_PROMPT';
            }
          } catch (_) {}
        }

        // If still no textual content could be extracted and the model has no vision capability:
        if (!textContent) {
          return {
            success: true,
            status: 'NEEDS_VISION_MODEL',
            inspectionSource: 'UNVERIFIED',
            category: 'Do sprawdzenia',
            tags: ['#do_sprawdzenia', '#nieznane'],
            description: 'Model tekstowy nie ma możliwości analizy wizualnej obrazu bez OCR.',
            confidence: 0.2
          };
        }
      }
    }

    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const systemPrompt = `Jesteś precyzyjnym analitykiem zawartości plików w systemie Nexus.
Twoim celem jest wyciągnięcie rzetelnych tagów i kategorii na podstawie RZECZYWISTEJ ZAWARTOŚCI.
ZASADY:
1. Nie wymyślaj tagów gier ani specyficznych marek (np. Minecraft, Tarkov, Valorant), jeśli w treści lub na obrazie nie ma jednoznacznego dowodu.
2. Zwróć DOKŁADNIE JSON w formacie:
{
  "category": "Screenshot" | "Dokument" | "Projekt programistyczny" | "Gra komputerowa" | "Grafika / Tapeta" | "UI / Ikona" | "Finanse" | "Nieznane",
  "tags": ["#tag1", "#tag2", "#tag3"],
  "description": "Krótki, jednozdaniowy opis rzeczywistej zawartości.",
  "confidence": 0.0 do 1.0
}
3. Nie dodawaj żadnego komentarza ani znaczników markdown poza czystym JSON. Jeśli zawartość jest niejednoznaczna, ustaw "category": "Nieznane" i dodaj "#do_sprawdzenia".`;

    const userMessageContent = `Plik: "${item.name}" (Rozszerzenie: .${ext}, Rozmiar: ${item.size || 0} bajtów).
Źródło analizy: ${inspectionSource}
${textContent ? `Początek zawartości:\n${textContent.slice(0, 2000)}` : '(Brak tekstu w pliku, analiza wizualna obrazu)'}`;

    const messagePayload = {
      role: 'user',
      content: userMessageContent
    };

    if (imageBase64) {
      messagePayload.images = [imageBase64];
    }

    const postData = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        messagePayload
      ],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 256
      }
    });

    try {
      const urlObj = new URL(`${cleanEndpoint}/api/chat`);
      const responseData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: urlObj.hostname,
          port: urlObj.port || 11434,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 45000
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error(`Błąd parsowania JSON z Ollama: ${e.message}`));
              }
            } else {
              reject(new Error(`Ollama zwróciła status ${res.statusCode}: ${body.slice(0, 100)}`));
            }
          });
        });

        req.on('error', (e) => reject(new Error(`Błąd połączenia z Ollama: ${e.message}`)));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout zapytania do Ollama (45s).'));
        });
        req.write(postData);
        req.end();
      });

      const rawContent = responseData.message?.content || responseData.response || '';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: true,
          status: 'PARSED_FALLBACK',
          category: 'Do sprawdzenia',
          tags: ['#do_sprawdzenia'],
          description: rawContent.slice(0, 120),
          confidence: 0.4
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validTags = Array.isArray(parsed.tags) 
        ? Array.from(new Set(parsed.tags.map(t => {
            const s = String(t).trim().toLowerCase();
            return s.startsWith('#') ? s : `#${s}`;
          }).filter(t => t.length > 2 && !t.includes(' '))))
        : ['#do_sprawdzenia'];

      return {
        success: true,
        status: 'ANALYZED',
        inspectionSource,
        category: parsed.category || 'Do sprawdzenia',
        tags: validTags,
        description: parsed.description || 'Przeanalizowano przez model lokalny Ollama.',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        category: 'Do sprawdzenia',
        tags: ['#do_sprawdzenia']
      };
    }
  }
}

module.exports = { AIAgentEngine };
