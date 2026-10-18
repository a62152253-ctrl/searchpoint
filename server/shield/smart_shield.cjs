const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { analyzeNsfwIntent } = require('./nsfw_intent_engine.cjs');

/**
 * ============================================================================
 * PROJECT NEXUS - SMART SHIELD & CYBER DEFENSE ENGINE (v3.0)
 * ============================================================================
 * 1. Context-Aware Anti-NSFW / Adult Filter (NLP Semantic Context Analysis)
 *    - Understands difference between scientific/medical/research vs adult content
 * 2. Cyber Threat & Anti-Hacker Defense
 *    - Double-extension trap detection (.pdf.exe, .png.vbs)
 *    - Dangerous script execution traps (.bat, .vbs, .ps1, .cmd, .scr, .hta)
 *    - Fake installer & crack/stealer malware signatures
 *    - Office macro zero-trust verification (.docm, .xlsm)
 * 3. Ghost Cleaner & Anti-Spam Manager
 * 4. Secure Quarantine Vault Manager with 1-Click Restore
 * ============================================================================
 */

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const SETTINGS_FILE = path.join(STORAGE_DIR, 'advance_settings.json');
const QUARANTINE_FILE = path.join(STORAGE_DIR, 'quarantine_registry.json');
const DEFAULT_QUARANTINE_DIR = path.join(os.homedir(), 'Downloads', '_nexus_quarantine');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// ----------------------------------------------------------------------------
// DEFAULT ADVANCE CONFIGURATION
// ----------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  // Master Switches
  watcherActive: true,
  shieldActive: true,
  blockNsfw: true,
  blockMalware: true,
  useContextualAnalysis: true,

  // Anti-Hacker / Cyber Defense
  trapDoubleExtensions: true,
  blockDangerousScripts: true,
  zeroTrustMacros: true,
  zeroTrustMacroBlock: true,
  blockFakeInstallers: true,
  alertRansomwareCanaries: true,
  scriptWhitelist: ['.ts', '.tsx', '.js', '.jsx', '.json', '.py'],

  // Anti-NSFW Contextual NLP
  nsfwSensitivity: 75,
  nsfwAction: 'quarantine', // 'quarantine' | 'blur' | 'tag_only'
  customNsfwBlacklist: ['porno', 'xxx', 'hentai', 'onlyfans', 'rucha'],
  customNsfwWhitelist: ['nauka', 'badania', 'statystyka', 'biologia', 'medycyna', 'uniwersytet', 'raport'],

  // Watcher 24/7 & Auto-Router
  watcherDebounceMs: 350,
  autoSortSubfolders: true,
  skipIncompleteDownloads: true,
  ignoredExtensions: ['.crdownload', '.part', '.tmp', '.opdownload', '.aria2'],
  routingRules: [
    { id: 'img', label: 'Obrazy i Grafika', extensions: '.jpg, .png, .webp, .svg, .psd', destination: '/Obrazy', enabled: true },
    { id: 'doc', label: 'Dokumenty i Faktury', extensions: '.pdf, .docx, .xlsx, .pptx, .txt', destination: '/Dokumenty', enabled: true },
    { id: 'arc', label: 'Archiwa skompresowane', extensions: '.zip, .rar, .7z, .tar, .gz', destination: '/Archiwa', enabled: true },
    { id: 'ins', label: 'Instalatory i Obrazy ISO', extensions: '.exe, .msi, .iso, .dmg', destination: '/Instalatory', enabled: true },
    { id: 'dev', label: 'Kod źródłowy i Dane', extensions: '.json, .sql, .py, .ts, .csv', destination: '/Dev_Workspace', enabled: false },
  ],

  // Cleaner & Duplicates
  ghostInstallerMaxAgeDays: 7,
  ghostCleanEmptyDirs: true,
  ghostAutoSchedule: false,
  dedupAlgorithm: 'xxhash64',
  dedupAction: 'ask',
  dedupIgnoreZeroByte: true,

  // Engine Performance
  maxWorkerThreads: 4,
  lowPriorityIo: true,
  silentNotifications: false,
  quarantineVaultPath: DEFAULT_QUARANTINE_DIR,

  // Custom User Rules (Automation IF -> THEN)
  customAutomationRules: [
    { id: 'rule-faktury', name: 'Auto-Routing Faktur VAT', pattern: 'faktura|vat|rachunek|invoice', action: 'move', target: '/Faktury_VAT', enabled: true },
    { id: 'rule-screens', name: 'Auto-Katalog Zrzutów', pattern: 'screenshot|zrzut|przechwyc', action: 'move', target: '/Zrzuty_Ekranu', enabled: true }
  ]
};

// ----------------------------------------------------------------------------
// PERSISTENCE HELPERS
// ----------------------------------------------------------------------------
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      const merged = { ...DEFAULT_SETTINGS, ...data };
      const macroVal = data.zeroTrustMacroBlock !== undefined
        ? Boolean(data.zeroTrustMacroBlock)
        : (data.zeroTrustMacros !== undefined ? Boolean(data.zeroTrustMacros) : true);
      merged.zeroTrustMacros = macroVal;
      merged.zeroTrustMacroBlock = macroVal;
      if (!merged.quarantineVaultPath || !fs.existsSync(path.dirname(merged.quarantineVaultPath))) {
        merged.quarantineVaultPath = DEFAULT_QUARANTINE_DIR;
      }
      return merged;
    }
  } catch (err) {
    console.error('[SmartShield] Error loading settings:', err.message);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(newSettings) {
  try {
    const merged = { ...loadSettings(), ...newSettings };
    if (newSettings && typeof newSettings === 'object') {
      if (newSettings.zeroTrustMacroBlock !== undefined) {
        merged.zeroTrustMacros = Boolean(newSettings.zeroTrustMacroBlock);
        merged.zeroTrustMacroBlock = Boolean(newSettings.zeroTrustMacroBlock);
      } else if (newSettings.zeroTrustMacros !== undefined) {
        merged.zeroTrustMacros = Boolean(newSettings.zeroTrustMacros);
        merged.zeroTrustMacroBlock = Boolean(newSettings.zeroTrustMacros);
      }
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (err) {
    console.error('[SmartShield] Error saving settings:', err.message);
    return newSettings;
  }
}

function loadQuarantine() {
  try {
    if (fs.existsSync(QUARANTINE_FILE)) {
      return JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[SmartShield] Error loading quarantine:', err.message);
  }
  return [];
}

function saveQuarantine(items) {
  try {
    fs.writeFileSync(QUARANTINE_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SmartShield] Error saving quarantine:', err.message);
  }
}

// ----------------------------------------------------------------------------
// 1. CONTEXTUAL ANTI-NSFW NLP ENGINE
// ----------------------------------------------------------------------------
const SCIENTIFIC_ACADEMIC_KEYWORDS = [
  'badanie', 'badania', 'badaniach', 'badaniu', 'naukowe', 'naukowy', 'nauka',
  'statystyka', 'statystyki', 'statystyczny', 'statystycznie', 'analiza', 'raport',
  'uniwersytet', 'akademia', 'profesor', 'doktorat', 'medycyna', 'medyczny',
  'biologia', 'biologiczny', 'anatomia', 'anatomiczny', 'edukacja', 'edukacyjny',
  'publikacja', 'artykul', 'dysertacja', 'psychologia', 'socjologia', 'demografia',
  'populacja', 'research', 'paper', 'journal', 'study', 'science', 'statistics', 'analysis',
  'medical', 'biology', 'education', 'demographic', 'academic'
];

// Comprehensive stem regex for explicit Polish & English adult keywords, vulgarities and sexual verbs
const HARDCORE_VULGARITY_REGEX = /(?:ruch[aąeęioóuy]|ruchank|rucham|ruchaj|jeb[aąeęioóuy]|zjeb|odjeb|przyjeb|wyjeb|podjeb|pierdol|zapierdol|rozpierdol|upierdol|chuj|huj|cip[aąeęioóuy]|kutang|kutas|fiut|porno|porn|xxx|hentai|onlyfans|fansly|brazzers|redtube|xvideos|rule34|blowjob|dildo|gangbang|nude|nudes|naked\s+girl|naked\s+women|lewd)/i;

const EXPLICIT_ADULT_KEYWORDS = [
  'porno', 'porn', 'xxx', 'nsfw', 'rucha', 'ruchac', 'ruchanko', 'ruchaja', 'ruchają', 'rucham', 'ruchasz',
  'jebac', 'jebie', 'jebana', 'jebany', 'jebane', 'jebanko', 'zjeb', 'wyjeb',
  'pierdol', 'pierdolic', 'pierdoli', 'zapierdol',
  'cycki', 'dupa', 'nude', 'nudes', 'naked', 'hentai', 'erotic', 'erotika',
  'sex', 'seks', 'orgasm', 'lewd', 'camgirl', 'onlyfans', 'fansly', 'brazzers',
  'redtube', 'xhamster', 'xvideos', 'rule34', 'blowjob', 'milf', 'dildo', 'kutas', 'chuj', 'cipa'
];

/**
 * Evaluates text or filename with full contextual NLP awareness (Enterprise NLP Intent Engine v4.5)
 */
function evaluateContext(text, filename = '') {
  const combined = `${filename} ${text || ''}`.trim();
  const settings = loadSettings();

  // Check if filename/text also triggers a cyber threat heuristic
  const cyberThreat = filename ? analyzeCyberThreat(filename, filename, 0, text) : null;

  // 1. Custom user blacklist check
  if (Array.isArray(settings.customNsfwBlacklist)) {
    const lower = combined.toLowerCase();
    for (const kw of settings.customNsfwBlacklist) {
      if (kw && lower.includes(kw.toLowerCase())) {
        // Only trigger immediate custom blacklist if not an explicit scientific/academic override on a non-hardcore word
        const nsfwCheck = analyzeNsfwIntent(combined, {
          nsfwSensitivity: settings.nsfwSensitivity || 'high'
        });
        if (nsfwCheck.isNsfw || HARDCORE_VULGARITY_REGEX.test(kw)) {
          return {
            isExplicit: true,
            isBlocked: true,
            isMalware: Boolean(cyberThreat),
            type: 'NSFW_CUSTOM_BLACKLIST',
            confidence: 99,
            reason: `Wykryto słowo z niestandardowej czarnej listy (${kw})`,
            isEducational: false,
            matchedContext: [kw],
            score: 100,
            intent: 'CUSTOM_BLACKLIST',
            scores: {
              explicitScore: 100,
              benignScore: 0,
              benignContextScore: 0
            },
            analysis: nsfwCheck
          };
        }
      }
    }
  }

  // 2. High-Precision NLP Intent Analysis with de-obfuscation & sliding context window
  const nsfwAnalysis = analyzeNsfwIntent(combined, {
    nsfwSensitivity: settings.nsfwSensitivity || 'high'
  });

  const isExplicit = Boolean(nsfwAnalysis.isNsfw);
  const lowerCombined = combined.toLowerCase();
  const academicHitCount = SCIENTIFIC_ACADEMIC_KEYWORDS.filter(kw => lowerCombined.includes(kw)).length;
  const isEducational = !isExplicit && (
    nsfwAnalysis.intent === 'EDUCATIONAL_OR_CLINICAL' ||
    Boolean(nsfwAnalysis.flags?.hasEducationalContext) ||
    academicHitCount > 0
  );
  const matchedTokens = (nsfwAnalysis.detections || []).map(d => d.token);

  const explicitScore = Number(nsfwAnalysis.score) || 0;
  const benignScore = isEducational ? Math.max(25, academicHitCount * 20) : (isExplicit ? 0 : 15);

  let reason = '';
  let resultType = 'SAFE_CONTENT';
  if (cyberThreat) {
    reason = `${cyberThreat.threatReason} — ${cyberThreat.threatDetail}`;
    resultType = cyberThreat.threatType || 'MALWARE_HEURISTIC';
  } else if (isExplicit) {
    const topDetections = nsfwAnalysis.detections.slice(0, 3).map(d => d.token).join(', ');
    reason = topDetections
      ? `Wykryto materiał NSFW / wulgaryzm (Frazy: ${topDetections})`
      : 'Wykryto jawne treści dla dorosłych / wulgaryzmy o podłożu seksualnym.';
    resultType = 'NSFW_EXPLICIT';
  } else if (isEducational) {
    const topContext = matchedTokens.length > 0 ? matchedTokens.slice(0, 3).join(', ') : 'nauka/medycyna';
    reason = `Treść bezpieczna — rozpoznano kontekst naukowy/akademicki (${topContext}).`;
    resultType = 'EDUCATIONAL_BYPASS (Kontekst Naukowy)';
  } else {
    reason = 'Brak wskaźników zagrożenia — bezpieczny kontekst ogólny.';
    resultType = 'SAFE_CONTENT';
  }

  const isBlocked = isExplicit || Boolean(cyberThreat);

  return {
    isExplicit,
    isBlocked,
    isMalware: Boolean(cyberThreat),
    type: resultType,
    confidence: isBlocked ? Math.max(85, explicitScore) : Math.max(80, 100 - explicitScore),
    reason,
    isEducational,
    matchedContext: matchedTokens,
    intent: cyberThreat ? 'MALWARE_THREAT' : nsfwAnalysis.intent,
    score: explicitScore,
    scores: {
      explicitScore,
      benignScore,
      benignContextScore: benignScore
    },
    analysis: {
      ...nsfwAnalysis,
      scores: {
        explicitScore,
        benignScore,
        benignContextScore: benignScore
      }
    }
  };
}

// ----------------------------------------------------------------------------
// 2. CYBER THREAT & ANTI-HACKER DEFENSE ENGINE
// ----------------------------------------------------------------------------
const DANGEROUS_EXTENSIONS = ['.bat', '.vbs', '.ps1', '.cmd', '.scr', '.hta', '.pif', '.reg', '.wsf', '.cpl'];
const SUSPICIOUS_DOUBLE_EXTS = ['.pdf.exe', '.png.exe', '.jpg.exe', '.docx.exe', '.pdf.vbs', '.zip.scr', '.rar.exe', '.txt.exe', '.mp4.exe'];
const SUSPICIOUS_MALWARE_PATTERNS = [
  /crack[_\-\s]?v?\d*/i,
  /keygen/i,
  /patcher/i,
  /stealer/i,
  /injector/i,
  /spoofer/i,
  /cheat[_\-\s]?engine/i,
  /crypto[_\-\s]?drainer/i,
  /token[_\-\s]?grabber/i,
  /roblox[_\-\s]?robux[_\-\s]?hack/i,
  /free[_\-\s]?nitro[_\-\s]?generator/i
];

function analyzeCyberThreat(filePath, fileName, size = 0, inlineContent = '') {
  const n = (fileName || path.basename(filePath || '')).toLowerCase();
  const ext = path.extname(n).toLowerCase();
  const settings = loadSettings();

  if (!settings.shieldActive || !settings.blockMalware) {
    return null;
  }

  // 1. Double Extension Trap
  if (settings.trapDoubleExtensions) {
    for (const dExt of SUSPICIOUS_DOUBLE_EXTS) {
      if (n.endsWith(dExt)) {
        return {
          threatType: 'DOUBLE_EXTENSION_TRAP',
          threatReason: `Plik maskuje się jako dokument lub obraz (${dExt})`,
          threatDetail: 'Powszechna technika dropperów ransomware i trojanów bankowych.',
          severity: 'CRITICAL'
        };
      }
    }
    // Generic double extension check (e.g. name.pdf.vbs)
    const parts = n.split('.');
    if (parts.length >= 3) {
      const secondLast = `.${parts[parts.length - 2]}`;
      const last = `.${parts[parts.length - 1]}`;
      if (['.pdf', '.docx', '.jpg', '.png', '.xlsx'].includes(secondLast) && DANGEROUS_EXTENSIONS.includes(last)) {
        return {
          threatType: 'DOUBLE_EXTENSION_TRAP',
          threatReason: `Podwójne rozszerzenie: ${secondLast}${last}`,
          threatDetail: 'Wykonywalny skrypt podszywający się pod plik biurowy/multimedialny.',
          severity: 'CRITICAL'
        };
      }
    }
  }

  // 2. Dangerous Script Droppers in Downloads / User Directories
  if (settings.blockDangerousScripts && DANGEROUS_EXTENSIONS.includes(ext)) {
    // Check if whitelisted dev script
    const isDevFolder = /src|node_modules|\.git|scripts|server/i.test(filePath || '');
    if (!isDevFolder) {
      return {
        threatType: 'DANGEROUS_SCRIPT',
        threatReason: `Automatycznie blokowany skrypt systemowy (${ext.toUpperCase()})`,
        threatDetail: 'Skrypty .bat, .vbs i .ps1 pobrane z sieci stanowią bezpośrednie ryzyko infekcji OS.',
        severity: 'HIGH'
      };
    }
  }

  // 3. Fake Installers & Malware Filename Heuristics
  if (settings.blockFakeInstallers) {
    for (const pat of SUSPICIOUS_MALWARE_PATTERNS) {
      if (pat.test(n)) {
        return {
          threatType: 'MALWARE_SIGNATURE',
          threatReason: `Podejrzany wzorzec nazwy (Keygen/Stealer/Hack): ${pat}`,
          threatDetail: 'Plik odpowiada profilom złośliwego oprogramowania wykradającego dane i tokeny sesji.',
          severity: 'HIGH'
        };
      }
    }
  }

  // 4. Macro Office Zero-Trust (.docm, .xlsm)
  if ((settings.zeroTrustMacros || settings.zeroTrustMacroBlock) && ['.docm', '.xlsm', '.dotm', '.xltm'].includes(ext)) {
    return {
      threatType: 'ZERO_TRUST_MACRO',
      threatReason: `Dokument pakietu Office z makrami (${ext.toUpperCase()})`,
      threatDetail: 'Wstrzymano prewencyjnie. Makra VBA mogą pobierać payload bez wiedzy użytkownika.',
      severity: 'WARNING'
    };
  }

  // 5. System File Spoofing in Downloads (e.g. svchost.exe, csrss.exe in Downloads!)
  if (['svchost.exe', 'csrss.exe', 'smss.exe', 'lsass.exe', 'explorer.exe', 'taskhost.exe'].includes(n)) {
    return {
      threatType: 'SYSTEM_SPOOF_TRAP',
      threatReason: `Próba podszywania się pod proces systemowy Windows: ${n}`,
      threatDetail: 'Prawdziwe pliki systemowe znajdują się w System32. Plik w katalogu pobranych to trojan.',
      severity: 'CRITICAL'
    };
  }

  // 6. Deep Content Inspection for Scripts & Executable Payloads (Token Grabbers, Reverse Shells, Encoded PowerShell)
  if (filePath && fs.existsSync(filePath)) {
    try {
      const fileStat = fs.statSync(filePath);
      if (fileStat.isFile() && fileStat.size > 0 && fileStat.size < 5 * 1024 * 1024) {
        const sampleBuffer = Buffer.alloc(Math.min(fileStat.size, 64 * 1024));
        const fd = fs.openSync(filePath, 'r');
        try {
          fs.readSync(fd, sampleBuffer, 0, sampleBuffer.length, 0);
        } finally {
          fs.closeSync(fd);
        }
        const sampleText = sampleBuffer.toString('utf-8');

        // Check for Encoded PowerShell Command
        if (/(?:-enc|-encodedcommand|-e\s+[A-Za-z0-9+/=]{20,})/i.test(sampleText)) {
          return {
            threatType: 'ENCODED_POWERSHELL_PAYLOAD',
            threatReason: 'Wykryto zaciemniony skrypt PowerShell (-EncodedCommand / Base64)',
            threatDetail: 'Powszechna technika obfuskacji używana przez ransomware i loader malware.',
            severity: 'CRITICAL'
          };
        }

        // Check for Webhook Exfiltration / Token Grabbers
        if (/(?:discord\.com\/api\/webhooks|api\.telegram\.org\/bot|webhook\.site)/i.test(sampleText)) {
          return {
            threatType: 'DATA_EXFILTRATION_PAYLOAD',
            threatReason: 'Wykryto kod eksfiltracji danych (Discord/Telegram Webhook)',
            threatDetail: 'Skrypt wysyła wykradzione tokeny lub hasła na zewnętrzny serwer przestępców.',
            severity: 'CRITICAL'
          };
        }

        // Check for Execution Bypass & Remote Payload Dropper
        if (/(?:bypass\s+-w\s+hidden|DownloadString|WebClient|IEX\s*\(|Invoke-Expression)/i.test(sampleText)) {
          return {
            threatType: 'REMOTE_CODE_DROPPER',
            threatReason: 'Wykryto technikę droppera (IEX / DownloadString / Hidden Window)',
            threatDetail: 'Skrypt próbuje pobrać i bezśladowo uruchomić zdalny kod w pamięci RAM.',
            severity: 'CRITICAL'
          };
        }

        // Check for Reverse Shell or Netcat Execution
        if (/(?:nc(?:\.exe)?\s+-e|TCPClient|System\.Net\.Sockets)/i.test(sampleText) && ['.bat', '.cmd', '.ps1', '.vbs'].includes(ext)) {
          return {
            threatType: 'REVERSE_SHELL_PAYLOAD',
            threatReason: 'Wykryto payload typu Reverse Shell / Backdoor',
            threatDetail: 'Skrypt próbuje otworzyć zdalny dostęp do powłoki Windows dla atakującego.',
            severity: 'CRITICAL'
          };
        }
      }
    } catch (_) {}
  }

  return null;
}

// ----------------------------------------------------------------------------
// 3. QUARANTINE VAULT OPERATIONS
// ----------------------------------------------------------------------------
function quarantineFile(filePath, threatInfo) {
  try {
    const settings = loadSettings();
    const vaultDir = settings.quarantineVaultPath || DEFAULT_QUARANTINE_DIR;
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const id = `quar_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const vaultPath = path.join(vaultDir, `${fileName}.${id}.quarantine`);

    let stats = { size: 0, mtime: Date.now() };
    try {
      stats = fs.statSync(filePath);
    } catch (_) {}

    // Safely move / rename to quarantine
    if (fs.existsSync(filePath)) {
      try {
        fs.renameSync(filePath, vaultPath);
      } catch (e) {
        // Fallback to copy and unlink if across volumes
        fs.copyFileSync(filePath, vaultPath);
        fs.unlinkSync(filePath);
      }
    }

    const item = {
      id,
      originalPath: filePath,
      vaultPath,
      name: fileName,
      size: stats.size,
      threatType: threatInfo.threatType,
      threatReason: threatInfo.threatReason,
      threatDetail: threatInfo.threatDetail,
      severity: threatInfo.severity,
      quarantinedAt: Date.now(),
      isBenignDev: threatInfo.isBenignDev || false
    };

    const current = loadQuarantine();
    current.unshift(item);
    saveQuarantine(current);

    return item;
  } catch (err) {
    console.error('[SmartShield] Error quarantining file:', err.message);
    return null;
  }
}

function restoreFile(id) {
  const current = loadQuarantine();
  const idx = current.findIndex(i => i.id === id);
  if (idx === -1) return { success: false, error: 'Nie znaleziono wpisu kwarantanny' };

  const item = current[idx];
  try {
    if (fs.existsSync(item.vaultPath)) {
      const origDir = path.dirname(item.originalPath);
      if (!fs.existsSync(origDir)) {
        fs.mkdirSync(origDir, { recursive: true });
      }
      fs.renameSync(item.vaultPath, item.originalPath);
    }
    current.splice(idx, 1);
    saveQuarantine(current);
    return { success: true, item };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function purgeFile(id) {
  const current = loadQuarantine();
  const idx = current.findIndex(i => i.id === id);
  if (idx === -1) return { success: false, error: 'Nie znaleziono wpisu' };

  const item = current[idx];
  try {
    if (fs.existsSync(item.vaultPath)) {
      fs.unlinkSync(item.vaultPath);
    }
    current.splice(idx, 1);
    saveQuarantine(current);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function purgeAll() {
  const current = loadQuarantine();
  for (const item of current) {
    try {
      if (fs.existsSync(item.vaultPath)) {
        fs.unlinkSync(item.vaultPath);
      }
    } catch (_) {}
  }
  saveQuarantine([]);
  return { success: true, count: current.length, purgedCount: current.length };
}

// ----------------------------------------------------------------------------
// 4. GHOST JUNK & CLEANER MANAGER
// ----------------------------------------------------------------------------
function scanGhostJunk(targetDir) {
  const settings = loadSettings();
  const maxAgeDays = settings.ghostInstallerMaxAgeDays || 7;
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const junkItems = [];

  if (!fs.existsSync(targetDir)) return [];

  function walk(dir, depth = 0) {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!ent.name.startsWith('.') && ent.name !== '_nexus_quarantine') {
            walk(full, depth + 1);
            // Check if directory is empty
            if (settings.ghostCleanEmptyDirs) {
              try {
                const sub = fs.readdirSync(full);
                if (sub.length === 0) {
                  junkItems.push({
                    path: full,
                    name: ent.name,
                    type: 'EMPTY_DIRECTORY',
                    size: 0,
                    reason: 'Pusty osierocony katalog'
                  });
                }
              } catch (_) {}
            }
          }
        } else if (ent.isFile()) {
          const n = ent.name.toLowerCase();
          const ext = path.extname(n);
          let stats = null;
          try { stats = fs.statSync(full); } catch (_) {}
          if (!stats) continue;

          // Temporary & incomplete downloads
          if (['.crdownload', '.part', '.tmp', '.dmp', '.opdownload'].includes(ext)) {
            junkItems.push({
              path: full,
              name: ent.name,
              type: 'INCOMPLETE_DOWNLOAD',
              size: stats.size,
              reason: 'Plik tymczasowy / niedokończone pobieranie'
            });
          }
          // Duplicate installers (e.g. DiscordSetup (1).exe, ChromeSetup (2).exe)
          else if (['.exe', '.msi'].includes(ext) && /\(\d+\)/.test(n)) {
            junkItems.push({
              path: full,
              name: ent.name,
              type: 'DUPLICATE_INSTALLER',
              size: stats.size,
              reason: 'Zduplikowany instalator programu'
            });
          }
          // Old installers exceeding max age
          else if (['.exe', '.msi'].includes(ext) && stats.mtimeMs < cutoffTime) {
            junkItems.push({
              path: full,
              name: ent.name,
              type: 'OLD_INSTALLER',
              size: stats.size,
              reason: `Instalator starszy niż ${maxAgeDays} dni (${Math.round((Date.now() - stats.mtimeMs) / (1000 * 3600 * 24))} dni)`
            });
          }
        }
      }
    } catch (_) {}
  }

  walk(targetDir, 0);
  return junkItems;
}

// ----------------------------------------------------------------------------
// 5. DUPLICATE HUNTER (HASH IDENTIFICATION)
// ----------------------------------------------------------------------------
function scanDuplicates(targetDir) {
  const sizeMap = new Map();
  const duplicates = [];

  if (!fs.existsSync(targetDir)) return [];

  function walk(dir, depth = 0) {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!ent.name.startsWith('.') && ent.name !== '_nexus_quarantine') {
            walk(full, depth + 1);
          }
        } else if (ent.isFile()) {
          try {
            const stats = fs.statSync(full);
            if (stats.size > 1024) { // Ignore < 1KB
              if (!sizeMap.has(stats.size)) {
                sizeMap.set(stats.size, []);
              }
              sizeMap.get(stats.size).push({ path: full, name: ent.name, size: stats.size, mtime: stats.mtimeMs });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  walk(targetDir, 0);

  // Safe chunked hash helper to prevent OOM on multi-gigabyte files
  function getFastFileHash(filePath, size) {
    try {
      const hash = crypto.createHash('sha256');
      if (size <= 1024 * 1024) {
        const buf = fs.readFileSync(filePath);
        hash.update(buf);
        return hash.digest('hex');
      }
      const fd = fs.openSync(filePath, 'r');
      try {
        const sampleSize = 65536;
        const b1 = Buffer.alloc(Math.min(sampleSize, size));
        fs.readSync(fd, b1, 0, b1.length, 0);
        hash.update(b1);
        if (size > sampleSize * 2) {
          const midPos = Math.floor(size / 2);
          const b2 = Buffer.alloc(sampleSize);
          fs.readSync(fd, b2, 0, b2.length, midPos);
          hash.update(b2);

          const b3 = Buffer.alloc(sampleSize);
          fs.readSync(fd, b3, 0, b3.length, size - sampleSize);
          hash.update(b3);
        }
        return hash.digest('hex');
      } finally {
        fs.closeSync(fd);
      }
    } catch (_) {
      return null;
    }
  }

  // For sizes with > 1 file, compute SHA-256
  for (const [size, files] of sizeMap.entries()) {
    if (files.length > 1) {
      const hashMap = new Map();
      for (const file of files) {
        const hash = getFastFileHash(file.path, file.size);
        if (hash) {
          if (!hashMap.has(hash)) {
            hashMap.set(hash, []);
          }
          hashMap.get(hash).push(file);
        }
      }

      for (const [hash, group] of hashMap.entries()) {
        if (group.length > 1) {
          // Prefer non-copy filename or older mtime as original
          const sortedGroup = [...group].sort((a, b) => {
            const aCopy = /\(\d+\)|kopia|copy/i.test(a.name) ? 1 : 0;
            const bCopy = /\(\d+\)|kopia|copy/i.test(b.name) ? 1 : 0;
            if (aCopy !== bCopy) return aCopy - bCopy;
            return (a.mtime || 0) - (b.mtime || 0);
          });
          const wastedBytes = size * (sortedGroup.length - 1);
          duplicates.push({
            hash,
            size,
            count: sortedGroup.length,
            wastedBytes,
            savingsBytes: wastedBytes,
            type: 'SHA-256 Exact Match',
            original: sortedGroup[0],
            duplicate: sortedGroup[1],
            duplicatesList: sortedGroup.slice(1),
            files: sortedGroup
          });
        }
      }
    }
  }

  return duplicates;
}

const SmartShieldAPI = {
  loadSettings,
  loadConfig: loadSettings,
  saveSettings,
  saveConfig: saveSettings,
  loadQuarantine,
  saveQuarantine,
  evaluateContext,
  analyzeCyberThreat,
  quarantineFile,
  restoreFile,
  purgeFile,
  purgeAll,
  purgeQuarantine: purgeAll,
  scanGhostJunk,
  scanDuplicates,
  DEFAULT_SETTINGS
};

module.exports = {
  ...SmartShieldAPI,
  SmartShield: SmartShieldAPI
};
