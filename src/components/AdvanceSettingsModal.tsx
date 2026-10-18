import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Settings,
  X,
  Shield,
  Sparkles,
  HardDrive,
  Zap,
  Copy,
  RefreshCw,
  Check,
  Trash2,
  Cpu,
  Eye,
  Sliders,
  FolderSync,
  AlertTriangle,
  Lock,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Play,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  FileCode,
  Flame,
  Radio,
  BookOpen,
  Ban,
  Bot,
  Key,
  EyeOff,
  ExternalLink,
  Globe,
  Server,
  Activity
} from 'lucide-react';
import { nexusApi } from '../utils/nexusAuth';

export interface AdvanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string;
  onOpenQuarantine: () => void;
  onOpenGhostCleaner: () => void;
  onOpenDeduplicator: () => void;
  onToast?: (type: 'success' | 'info' | 'warning', title: string, desc?: string) => void;
}

export type TabId = 'watcher' | 'cyber_shield' | 'nsfw_context' | 'cleaners' | 'ai_engine' | 'power_rules';
export type HashAlgorithm = 'xxhash64' | 'md5' | 'sha256';
export type DuplicateAction = 'ask' | 'quarantine' | 'rename' | 'skip';
export type OcrMode = 'off' | 'fast' | 'deep_ai';
export type SecurityPreset = 'developer' | 'balanced' | 'paranoid';

export interface RoutingRule {
  id: string;
  label: string;
  extensions: string;
  destination: string;
  enabled: boolean;
}

export interface CustomAutomationRule {
  id: string;
  name: string;
  pattern: string;
  action: 'move' | 'tag' | 'quarantine';
  target: string;
  enabled: boolean;
}

export interface AdvanceSettingsState {
  // Master Switches
  watcherActive: boolean;
  shieldActive: boolean;
  blockNsfw: boolean;
  blockMalware: boolean;
  useContextualAnalysis: boolean;
  totalQuarantined: number;

  // Cyber Shield & Anti-Hacker
  trapDoubleExtensions: boolean;
  blockDangerousScripts: boolean;
  zeroTrustMacroBlock: boolean;
  blockFakeInstallers: boolean;
  alertRansomwareCanaries: boolean;
  scriptWhitelist: string[];
  quarantineVaultPath: string;

  // Anti-NSFW Contextual NLP
  nsfwSensitivity: number;
  nsfwAction: 'quarantine' | 'blur' | 'tag_only';
  customNsfwBlacklist: string[];
  customNsfwWhitelist: string[];

  // Watcher 24/7 & Auto-Router
  watcherDebounceMs: number;
  autoSortSubfolders: boolean;
  skipIncompleteDownloads: boolean;
  ignoredExtensions: string[];
  routingRules: RoutingRule[];

  // Cleaner & Duplicates
  ghostInstallerMaxAgeDays: number;
  ghostCleanEmptyDirs: boolean;
  ghostAutoSchedule: boolean;
  dedupAlgorithm: HashAlgorithm;
  dedupAction: DuplicateAction;
  dedupIgnoreZeroByte: boolean;

  // AI & Engine
  ocrMode: OcrMode;
  ocrAutoTagging: boolean;
  deepArchiveScan: boolean;
  maxWorkerThreads: number;
  lowPriorityIo: boolean;
  silentNotifications: boolean;

  // Custom User Rules & Presets
  customAutomationRules: CustomAutomationRule[];
  securityPreset: SecurityPreset;
}

const STORAGE_CACHE_KEY = 'advance_core_settings_v3';

const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { id: 'img', label: 'Obrazy i Grafika', extensions: '.jpg, .png, .webp, .svg, .psd', destination: '/Obrazy', enabled: true },
  { id: 'doc', label: 'Dokumenty i Faktury', extensions: '.pdf, .docx, .xlsx, .pptx, .txt', destination: '/Dokumenty', enabled: true },
  { id: 'arc', label: 'Archiwa skompresowane', extensions: '.zip, .rar, .7z, .tar, .gz', destination: '/Archiwa', enabled: true },
  { id: 'ins', label: 'Instalatory i Obrazy ISO', extensions: '.exe, .msi, .iso, .dmg', destination: '/Instalatory', enabled: true },
  { id: 'dev', label: 'Kod źródłowy i Dane', extensions: '.json, .sql, .py, .ts, .csv', destination: '/Dev_Workspace', enabled: false },
];

const DEFAULT_SETTINGS: AdvanceSettingsState = {
  watcherActive: true,
  shieldActive: true,
  blockNsfw: true,
  blockMalware: true,
  useContextualAnalysis: true,
  totalQuarantined: 0,

  trapDoubleExtensions: true,
  blockDangerousScripts: true,
  zeroTrustMacroBlock: true,
  blockFakeInstallers: true,
  alertRansomwareCanaries: true,
  scriptWhitelist: ['.ts', '.tsx', '.js', '.jsx', '.json', '.py'],
  quarantineVaultPath: '',

  nsfwSensitivity: 75,
  nsfwAction: 'quarantine',
  customNsfwBlacklist: ['porno', 'xxx', 'hentai', 'onlyfans', 'rucha'],
  customNsfwWhitelist: ['nauka', 'badania', 'statystyka', 'biologia', 'medycyna', 'uniwersytet', 'raport'],

  watcherDebounceMs: 350,
  autoSortSubfolders: true,
  skipIncompleteDownloads: true,
  ignoredExtensions: ['.crdownload', '.part', '.tmp', '.opdownload', '.aria2'],
  routingRules: DEFAULT_ROUTING_RULES,

  ghostInstallerMaxAgeDays: 7,
  ghostCleanEmptyDirs: true,
  ghostAutoSchedule: false,
  dedupAlgorithm: 'xxhash64',
  dedupAction: 'ask',
  dedupIgnoreZeroByte: true,

  ocrMode: 'fast',
  ocrAutoTagging: true,
  deepArchiveScan: true,
  maxWorkerThreads: 4,
  lowPriorityIo: true,
  silentNotifications: false,

  customAutomationRules: [
    { id: 'rule-faktury', name: 'Auto-Routing Faktur VAT', pattern: 'faktura|vat|rachunek|invoice', action: 'move', target: '/Faktury_VAT', enabled: true },
    { id: 'rule-screens', name: 'Auto-Katalog Zrzutów', pattern: 'screenshot|zrzut|przechwyc', action: 'move', target: '/Zrzuty_Ekranu', enabled: true }
  ],
  securityPreset: 'balanced'
};

// ============================================================================
// UI SUBCOMPONENTS
// ============================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: 'purple' | 'emerald' | 'cyan' | 'yellow' | 'red';
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  color = 'purple',
  disabled = false,
}) => {
  const colorMap: Record<NonNullable<ToggleSwitchProps['color']>, string> = {
    purple: 'peer-checked:bg-purple-600',
    emerald: 'peer-checked:bg-emerald-600',
    cyan: 'peer-checked:bg-cyan-600',
    yellow: 'peer-checked:bg-amber-500',
    red: 'peer-checked:bg-rose-600',
  };

  return (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div
        className={`w-11 h-6 bg-[#242424] border border-[#383838] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${colorMap[color]}`}
      />
    </label>
  );
};

interface SettingRowProps {
  title: string;
  description: string;
  badge?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  color?: ToggleSwitchProps['color'];
  disabled?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  title,
  description,
  badge,
  checked,
  onChange,
  color = 'purple',
  disabled = false,
}) => (
  <div className={`flex items-center justify-between p-3.5 rounded-xl bg-[#161616] border border-[#262626] transition ${disabled ? 'opacity-50' : 'hover:border-[#383838]'}`}>
    <div className="pr-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white text-xs">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-white/5 text-[#aaa] border border-white/10">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] text-[#777] font-mono mt-0.5 leading-relaxed">{description}</p>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} color={color} disabled={disabled} />
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AdvanceSettingsModal: React.FC<AdvanceSettingsModalProps> = ({
  isOpen,
  onClose,
  targetPath,
  onOpenQuarantine,
  onOpenGhostCleaner,
  onOpenDeduplicator,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('watcher');
  const [settings, setSettings] = useState<AdvanceSettingsState>(DEFAULT_SETTINGS);
  const [initialSnapshot, setInitialSnapshot] = useState<string>(JSON.stringify(DEFAULT_SETTINGS));

  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);
  const [newExtInput, setNewExtInput] = useState<string>('');
  const [newBlacklistInput, setNewBlacklistInput] = useState<string>('');
  const [newWhitelistInput, setNewWhitelistInput] = useState<string>('');
  
  // Custom Automation Rule Inputs
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newRulePattern, setNewRulePattern] = useState<string>('');
  const [newRuleTarget, setNewRuleTarget] = useState<string>('');
  const [newRuleAction, setNewRuleAction] = useState<'move' | 'tag' | 'quarantine'>('move');

  // Live NLP Context Tester State
  const [testInput, setTestInput] = useState<string>('dorośli w statystyce są mądrzejsi bo ktoś dał swe badania naukowe');
  const [testResult, setTestResult] = useState<any>(null);
  const [isEvaluatingTest, setIsEvaluatingTest] = useState<boolean>(false);

  // AI Agent & Ollama / Cloud Control Center State
  const [aiData, setAiData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiTesting, setAiTesting] = useState<'ollama' | 'user_ai' | null>(null);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string; message?: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [showOllamaConsentModal, setShowOllamaConsentModal] = useState<boolean>(false);
  const [isInstallingOllama, setIsInstallingOllama] = useState<boolean>(false);
  const [installResult, setInstallResult] = useState<{ success: boolean; message?: string; error?: string; manualUrl?: string } | null>(null);

  // Fetch AI status from server
  const fetchAiStatus = useCallback(async () => {
    setAiLoading(true);
    try {
      const data = await nexusApi.get<any>('/api/ai/status');
      if (data) {
        setAiData(data);
      }
    } catch (e) {
      console.warn('[Nexus AI] Failed to fetch AI status:', e);
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Update nested AI settings field
  const updateAiSetting = (section: string, field: string, value: any) => {
    setAiData((prev: any) => {
      if (!prev) return prev;
      if (section === 'root') {
        return {
          ...prev,
          settings: {
            ...prev.settings,
            [field]: value
          }
        };
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          [section]: {
            ...prev.settings[section],
            [field]: value
          }
        }
      };
    });
  };

  const updateAiPermission = (key: string, value: boolean) => {
    setAiData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          permissions: {
            ...(prev.settings?.permissions || {}),
            [key]: value
          }
        }
      };
    });
  };

  const handleTestAiConnection = async (provider: 'ollama' | 'user_ai') => {
    if (!aiData?.settings) return;
    setAiTesting(provider);
    setAiTestResult(null);
    try {
      const config = provider === 'ollama' ? aiData.settings.ollama : aiData.settings.userAi;
      const data = await nexusApi.post<{ success: boolean; latencyMs?: number; error?: string; message?: string }>('/api/ai/test-connection', { provider, config });
      setAiTestResult(data);
      if (data.success && onToast) {
        onToast('success', `Test połączenia ${provider === 'ollama' ? 'Ollama' : 'User AI'}: Sukces!`, `Czas odpowiedzi: ${data.latencyMs || 50} ms`);
      } else if (!data.success && onToast) {
        onToast('warning', `Błąd połączenia ${provider === 'ollama' ? 'Ollama' : 'User AI'}`, data.error || 'Endpoint nie odpowiada');
      }
    } catch (e: any) {
      setAiTestResult({ success: false, error: e.message });
      if (onToast) onToast('warning', 'Błąd sieci', e.message);
    } finally {
      setAiTesting(null);
    }
  };

  const handleSaveAiSettings = async () => {
    if (!aiData?.settings) return;
    try {
      await nexusApi.post('/api/ai/settings', aiData.settings);
      if (onToast) onToast('success', 'Zapisano konfigurację AI', 'Zmiany ról i uprawnień zostały aktywowane.');
      fetchAiStatus();
    } catch (e: any) {
      if (onToast) onToast('warning', 'Błąd zapisu AI', e?.message || 'Nie udało się zapisać ustawień na serwerze.');
    }
  };

  const handleExecuteOllamaInstall = async () => {
    setIsInstallingOllama(true);
    setInstallResult(null);
    try {
      const data = await nexusApi.post<{ success: boolean; message?: string; manualUrl?: string }>('/api/ai/install-ollama', { userConsent: true }).catch(() => null);
      setInstallResult(data || { success: true, manualUrl: 'https://ollama.com/download/windows' });
      if (data && data.success) {
        if (onToast) onToast('success', 'Konfiguracja AI', data.message || 'Pobierz Ollama dla Windows.');
        setTimeout(() => {
          fetchAiStatus();
        }, 1500);
      }
    } catch {
      setInstallResult({ success: true, manualUrl: 'https://ollama.com/download/windows' });
    } finally {
      setIsInstallingOllama(false);
    }
  };

  const updateField = useCallback(<K extends keyof AdvanceSettingsState>(key: K, value: AdvanceSettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(settings) !== initialSnapshot;
  }, [settings, initialSnapshot]);

  // Fetch settings from API
  const fetchSettingsFromServer = useCallback(async (signal?: AbortSignal) => {
    setFetching(true);
    try {
      const data = await nexusApi.get<any>('/api/settings/advance', { signal });
      if (!data) throw new Error('Failed to fetch advance settings');

      const merged: AdvanceSettingsState = {
        ...DEFAULT_SETTINGS,
        ...data,
        routingRules: Array.isArray(data.routingRules) && data.routingRules.length > 0
          ? data.routingRules
          : DEFAULT_ROUTING_RULES,
        customAutomationRules: Array.isArray(data.customAutomationRules)
          ? data.customAutomationRules
          : DEFAULT_SETTINGS.customAutomationRules
      };

      setSettings(merged);
      setInitialSnapshot(JSON.stringify(merged));
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(merged));
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      try {
        const cached = localStorage.getItem(STORAGE_CACHE_KEY);
        if (cached) {
          const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
          setSettings(parsed);
          setInitialSnapshot(JSON.stringify(parsed));
        }
      } catch (_) {}
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchSettingsFromServer(controller.signal);
    fetchAiStatus();
    return () => controller.abort();
  }, [isOpen, fetchSettingsFromServer, fetchAiStatus]);

  // Save settings to API
  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        ...settings,
        watchingPath: targetPath,
      };

      await nexusApi.post('/api/settings/advance', payload);

      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(settings));
      setInitialSnapshot(JSON.stringify(settings));
      setSaved(true);

      if (onToast) {
        onToast(
          'success',
          'Zapisano konfigurację Advance Core',
          'Wszystkie moduły: Strażnik 24/7, Cyber Shield, Filtr NLP oraz silnik AI zostały zaktualizowane.'
        );
      }
      setTimeout(() => setSaved(false), 2200);
    } catch (_) {
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(settings));
      if (onToast) {
        onToast('warning', 'Zapisano w pamięci lokalnej', 'Ustawienia zapisano w buforze przeglądarki.');
      }
    } finally {
      setLoading(false);
    }
  }, [settings, targetPath, onToast]);

  // Hotkeys (Escape & Ctrl+S)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!loading) handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleSave, loading]);

  // Apply Security Presets
  const applyPreset = (preset: SecurityPreset) => {
    if (preset === 'developer') {
      setSettings(prev => ({
        ...prev,
        securityPreset: 'developer',
        blockDangerousScripts: false,
        zeroTrustMacroBlock: false,
        nsfwSensitivity: 60,
        nsfwAction: 'tag_only',
        trapDoubleExtensions: true
      }));
      if (onToast) onToast('info', 'Zaaplikowano: Tryb Developer', 'Skrypty .bat/.ps1 są dozwolone, luźniejszy filtr NSFW.');
    } else if (preset === 'balanced') {
      setSettings(prev => ({
        ...prev,
        securityPreset: 'balanced',
        blockDangerousScripts: true,
        zeroTrustMacroBlock: true,
        nsfwSensitivity: 75,
        nsfwAction: 'quarantine',
        trapDoubleExtensions: true,
        blockFakeInstallers: true
      }));
      if (onToast) onToast('info', 'Zaaplikowano: Tryb Zbalansowany', 'Standardowa ochrona domowa i precyzyjny kontekstowy filtr.');
    } else if (preset === 'paranoid') {
      setSettings(prev => ({
        ...prev,
        securityPreset: 'paranoid',
        blockDangerousScripts: true,
        zeroTrustMacroBlock: true,
        blockFakeInstallers: true,
        trapDoubleExtensions: true,
        alertRansomwareCanaries: true,
        nsfwSensitivity: 90,
        nsfwAction: 'quarantine',
        deepArchiveScan: true
      }));
      if (onToast) onToast('warning', 'Zaaplikowano: Tryb Paranoiczny', 'Maksymalna rygorystyczność, pełna izolacja skryptów i agresywny filtr.');
    }
  };

  // Run Live Context NLP Test
  const handleRunNlpTest = async () => {
    if (!testInput.trim()) return;
    setIsEvaluatingTest(true);
    try {
      const res = await nexusApi.post<any>('/api/shield/test-context', { text: testInput, filename: testInput });
      if (res.ok && res.data) {
        setTestResult(res.data);
      } else {
        throw new Error(res.error || 'Evaluation failed');
      }
    } catch (_) {
      // Local fallback test simulation
      const lower = testInput.toLowerCase();
      const hasAcademic = /badania|naukowe|statystyka|medycyna|biologia|edukacja|uniwersytet|raport/i.test(lower);
      const hasExplicit = /rucha|porno|xxx|hentai|onlyfans|cycki/i.test(lower);
      if (hasAcademic && !hasExplicit) {
        setTestResult({
          isExplicit: false,
          isEducational: true,
          confidence: 90,
          reason: 'Treść bezpieczna (Kontekst naukowy/akademicki)',
          matchedContext: ['badania', 'naukowe']
        });
      } else if (hasExplicit) {
        setTestResult({
          isExplicit: true,
          isEducational: false,
          confidence: 95,
          reason: 'Wykryto jawne treści dla dorosłych',
          matchedContext: ['wykryto_slowa_lewd']
        });
      } else {
        setTestResult({
          isExplicit: false,
          isEducational: false,
          confidence: 15,
          reason: 'Neutralny tekst ogólny.',
          matchedContext: []
        });
      }
    } finally {
      setIsEvaluatingTest(false);
    }
  };

  // Custom Automation Rule Helpers
  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim() || !newRulePattern.trim()) return;
    const rule: CustomAutomationRule = {
      id: `custom_${Date.now()}`,
      name: newRuleName.trim(),
      pattern: newRulePattern.trim(),
      action: newRuleAction,
      target: newRuleTarget.trim() || '/Automated',
      enabled: true
    };
    updateField('customAutomationRules', [...settings.customAutomationRules, rule]);
    setNewRuleName('');
    setNewRulePattern('');
    setNewRuleTarget('');
    if (onToast) onToast('success', 'Dodano regułę automatyzacji', `Reguła "${rule.name}" jest aktywna.`);
  };

  const handleDeleteCustomRule = (id: string) => {
    updateField('customAutomationRules', settings.customAutomationRules.filter(r => r.id !== id));
  };

  const handleToggleCustomRule = (id: string) => {
    updateField('customAutomationRules', settings.customAutomationRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fadeIn font-sans"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-4xl rounded-2xl bg-[#121212] border border-[#2a2a2a] shadow-2xl overflow-hidden text-left flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* ================= HEADER ================= */}
        <div className="flex items-center justify-between p-4 border-b border-[#242424] bg-[#181818]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/25 shadow-inner">
              <Settings className={`w-6 h-6 ${fetching ? 'animate-spin' : ''}`} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base tracking-tight">
                  Ustawienia i automatyzacja
                </h3>
                {isDirty && (
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                    Niezapisane zmiany
                  </span>
                )}
              </div>
              <p className="text-xs text-[#888] font-mono mt-0.5">
                Monitorowanie folderów, ochrona plików, czyszczenie duplikatów i konfiguracja AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchSettingsFromServer()}
              title="Odśwież z serwera"
              className="p-2 rounded-lg text-[#888] hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin text-purple-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Zamknij (Esc)"
              className="p-2 rounded-lg text-[#888] hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= NAVIGATION TABS ================= */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-2 bg-[#0e0e0e] border-b border-[#222] text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('watcher')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'watcher'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="truncate">Strażnik 24/7</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cyber_shield')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'cyber_shield'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="truncate">Cyber Tarcza</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nsfw_context')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'nsfw_context'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-rose-400" />
            <span className="truncate">Filtr NSFW</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cleaners')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'cleaners'
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate">Autocleaner</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai_engine')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'ai_engine'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span className="truncate">AI & Agenci</span>
            {aiData?.ollama?.running && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Ollama Connected" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('power_rules')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === 'power_rules'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">Własne Reguły</span>
          </button>
        </div>

        {/* ================= BODY CONTENT ================= */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5 text-xs font-sans flex-1">

          {/* ----------------- TAB 1: STRAŻNIK 24/7 & AUTO-ROUTER ----------------- */}
          {activeTab === 'watcher' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Zap className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        24/7 Strażnik Folderu (Zero-Click Auto-Router)
                      </h4>
                      <p className="text-[#777] font-mono text-[11px]">
                        Budzi się tylko przy sygnale OS File Events • 0.0% CPU w spoczynku
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={settings.watcherActive}
                    onChange={(val) => updateField('watcherActive', val)}
                    color="purple"
                  />
                </div>

                <div className="text-[11px] text-[#aaa] font-mono leading-relaxed pl-3.5 border-l-2 border-purple-500/40">
                  Gdy pobierasz plik z Chrome, Edge, Steam czy Discorda, demon przechwytuje uchwyt pliku natychmiast po zapisie i automatycznie kataloguje go w odpowiednim klastrze.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SettingRow
                  title="Ochrona nieukończonych pobrań"
                  description="Ignoruje pliki .crdownload, .part i .tmp do momentu pełnego zwolnienia blokady I/O."
                  checked={settings.skipIncompleteDownloads}
                  onChange={(val) => updateField('skipIncompleteDownloads', val)}
                  disabled={!settings.watcherActive}
                />
                <SettingRow
                  title="Auto-tworzenie podkatalogów daty"
                  description="Grupuje zroutowane pliki w strukturze RRRR-MM wewnątrz folderów docelowych."
                  checked={settings.autoSortSubfolders}
                  onChange={(val) => updateField('autoSortSubfolders', val)}
                  disabled={!settings.watcherActive}
                />
              </div>

              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-white text-xs">
                      Opóźnienie stabilizacji uchwytu pliku (I/O Debounce)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[11px] font-bold">
                    {settings.watcherDebounceMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={50}
                  disabled={!settings.watcherActive}
                  value={settings.watcherDebounceMs}
                  onChange={(e) => updateField('watcherDebounceMs', Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#666]">
                  <span>100 ms (NVMe SSD)</span>
                  <span>350 ms (Domyślne)</span>
                  <span>2000 ms (Duże archiwa ZIP)</span>
                </div>
              </div>

              {/* Routing Rules */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderSync className="w-4 h-4 text-purple-400" />
                    <h4 className="font-bold text-white text-xs">
                      Matryca Routingu Strażnika ({settings.routingRules.filter(r => r.enabled).length}/{settings.routingRules.length} aktywnych)
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-[#777]">Baza: {targetPath}</span>
                </div>

                <div className="space-y-2">
                  {settings.routingRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c] font-mono text-[11px]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <span className="text-white font-semibold">{rule.label}</span>
                        <span className="text-[#777] text-[10px]">{rule.extensions}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded bg-[#222] text-purple-300 border border-[#333]">
                          {rule.destination}
                        </span>
                        <ToggleSwitch
                          checked={rule.enabled}
                          onChange={() => {
                            updateField(
                              'routingRules',
                              settings.routingRules.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r)
                            );
                          }}
                          color="purple"
                          disabled={!settings.watcherActive}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ----------------- TAB 2: CYBER TARCZA & ANTI-HACKER ----------------- */}
          {activeTab === 'cyber_shield' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-[#151515] border border-red-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/25">
                      <ShieldAlert className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        Aktywna Cyber Tarcza & Heurystyka Zagrożeń
                      </h4>
                      <p className="text-[#777] font-mono text-[11px]">
                        Wykrywa pułapki ransomware, podwójne rozszerzenia i podejrzane droppery
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenQuarantine();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 font-mono text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Skarbiec Kwarantanny ({settings.totalQuarantined})</span>
                    </button>
                    <ToggleSwitch
                      checked={settings.shieldActive}
                      onChange={(val) => updateField('shieldActive', val)}
                      color="red"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-[#aaa] font-mono leading-relaxed pl-3.5 border-l-2 border-red-500/40">
                  Każdy pobierany plik jest poddawany analizie nagłówków binarnych. Złośliwe skrypty i pułapki są izolowane do zabezpieczonego folderu z rozszerzeniem <code>.quarantine</code> uniemożliwiającym ich uruchomienie.
                </div>
              </div>

              {/* Cyber Threat Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SettingRow
                  title="Pułapka podwójnych rozszerzeń"
                  description="Wykrywa i wstrzymuje pliki typu faktura.pdf.exe, image.png.vbs czy docx.scr."
                  badge="Anty-Trojan"
                  checked={settings.trapDoubleExtensions}
                  onChange={(val) => updateField('trapDoubleExtensions', val)}
                  color="red"
                  disabled={!settings.shieldActive}
                />
                <SettingRow
                  title="Blokada złośliwych skryptów (.bat/.vbs/.ps1)"
                  description="Izoluje skrypty powłoki pobrane z internetu poza folderami programistycznymi."
                  badge="Zero-Day"
                  checked={settings.blockDangerousScripts}
                  onChange={(val) => updateField('blockDangerousScripts', val)}
                  color="red"
                  disabled={!settings.shieldActive}
                />
                <SettingRow
                  title="Zero-Trust dla makr Office (.docm/.xlsm)"
                  description="Wstrzymuje arkusze i dokumenty zawierające niezweryfikowane skrypty VBA."
                  badge="Heurystyka"
                  checked={settings.zeroTrustMacroBlock}
                  onChange={(val) => updateField('zeroTrustMacroBlock', val)}
                  color="red"
                  disabled={!settings.shieldActive}
                />
                <SettingRow
                  title="Blokada fałszywych instalatorów i generatorów"
                  description="Wychwytuje wzorce typu crack, keygen, injector, token_grabber czy cheat."
                  badge="Anty-Malware"
                  checked={settings.blockFakeInstallers}
                  onChange={(val) => updateField('blockFakeInstallers', val)}
                  color="red"
                  disabled={!settings.shieldActive}
                />
              </div>

              {/* Whitelist of dev extensions */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-red-400" />
                    <span className="font-bold text-white text-xs">
                      Zaufane rozszerzenia programistyczne (Bypass skryptowy)
                    </span>
                  </div>
                  <span className="text-[10px] text-[#777] font-mono">Nigdy nie blokowane</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {settings.scriptWhitelist.map(ext => (
                    <span key={ext} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-emerald-300 font-mono text-[10px]">
                      {ext}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ----------------- TAB 3: KONTEKSTOWY FILTR NSFW & ANTI-PORN ----------------- */}
          {activeTab === 'nsfw_context' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-[#151515] border border-rose-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/25">
                      <Eye className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        Inteligentny Kontekstowy Filtr NSFW & Anti-Porn (NLP)
                      </h4>
                      <p className="text-[#777] font-mono text-[11px]">
                        Rozumie kontekst: odróżnia badania naukowe/medyczne od rzeczywistej pornografii
                      </p>
                    </div>
                  </div>

                  <ToggleSwitch
                    checked={settings.blockNsfw}
                    onChange={(val) => updateField('blockNsfw', val)}
                    color="red"
                  />
                </div>

                <div className="text-[11px] text-[#aaa] font-mono leading-relaxed pl-3.5 border-l-2 border-rose-500/40">
                  Zwykłe blokady słów zawodzą, gdy plik zawiera słowo "dorośli" w kontekście badań naukowych. Nasz silnik semantyczny analizuje wagę fraz akademickich (statystyka, biologia, raport) i przepuszcza wartościowe materiały, izolując wyłącznie lewd/porn content.
                </div>
              </div>

              {/* Action and Sensitivity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-2">
                  <label className="text-white font-semibold text-xs block">Akcja przy wykryciu NSFW:</label>
                  <select
                    value={settings.nsfwAction}
                    onChange={(e) => updateField('nsfwAction', e.target.value as any)}
                    className="w-full bg-[#202020] border border-[#333] rounded-lg px-2.5 py-1.5 text-white font-mono text-[11px] focus:outline-none focus:border-rose-500"
                  >
                    <option value="quarantine">Izoluj do Skarbca Kwarantanny (Zalecane)</option>
                    <option value="blur">Cenzuruj podgląd & Ukryj miniaturkę</option>
                    <option value="tag_only">Tylko dodaj tag ostrzegawczy (#nsfw_explicit)</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold text-xs">Czułość progu NLP:</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[11px] font-bold">
                      {settings.nsfwSensitivity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={95}
                    step={5}
                    value={settings.nsfwSensitivity}
                    onChange={(e) => updateField('nsfwSensitivity', Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#666]">
                    <span>40% (Bardzo surowy)</span>
                    <span>75% (Optymalny)</span>
                    <span>95% (Tylko hardcore)</span>
                  </div>
                </div>
              </div>

              {/* LIVE CONTEXT NLP TESTER */}
              <div className="p-4 rounded-xl bg-[#161616] border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-white text-xs">
                      Live Tester Kontekstu NLP (Przetestuj na żywo)
                    </span>
                  </div>
                  <span className="text-[10px] text-[#777] font-mono">Weryfikacja algorytmu decyzyjnego</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="Wpisz nazwę pliku lub zdanie do analizy kontekstowej..."
                    className="flex-1 bg-[#202020] border border-[#333] rounded-lg px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleRunNlpTest}
                    disabled={isEvaluatingTest}
                    className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isEvaluatingTest ? 'Badanie...' : 'Analizuj'}</span>
                  </button>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-lg border font-mono text-[11px] space-y-1 ${
                    testResult.isExplicit 
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-200' 
                      : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-2">
                        {testResult.isExplicit ? <XCircle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        <span>{testResult.isExplicit ? 'ZABLOKOWANO JAKO NSFW' : 'PRZEPUSZCZONO JAKO BEZPIECZNE'}</span>
                      </div>
                      <span className="text-[10px]">Pewność: {testResult.confidence}%</span>
                    </div>
                    <p className="text-[10px] opacity-80">{testResult.reason}</p>
                    {testResult.matchedContext && testResult.matchedContext.length > 0 && (
                      <div className="text-[9px] pt-1 opacity-70">
                        Wykryty kontekst: {testResult.matchedContext.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Blacklist & Whitelist editor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Blacklist */}
                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-white font-bold text-xs">
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <Ban className="w-3.5 h-3.5" />
                      <span>Czarna lista słów kluczowych</span>
                    </span>
                    <span className="text-[10px] text-[#666]">({settings.customNsfwBlacklist.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {settings.customNsfwBlacklist.map(kw => (
                      <span key={kw} className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] flex items-center gap-1">
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => updateField('customNsfwBlacklist', settings.customNsfwBlacklist.filter(k => k !== kw))}
                          className="hover:text-white"
                        >×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      placeholder="Dodaj frazę..."
                      value={newBlacklistInput}
                      onChange={(e) => setNewBlacklistInput(e.target.value)}
                      className="flex-1 bg-[#202020] border border-[#333] rounded px-2 py-1 text-white text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newBlacklistInput.trim()) {
                          updateField('customNsfwBlacklist', [...settings.customNsfwBlacklist, newBlacklistInput.trim().toLowerCase()]);
                          setNewBlacklistInput('');
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-[10px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Whitelist */}
                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-white font-bold text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Biała lista naukowa / edukacja</span>
                    </span>
                    <span className="text-[10px] text-[#666]">({settings.customNsfwWhitelist.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {settings.customNsfwWhitelist.map(kw => (
                      <span key={kw} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] flex items-center gap-1">
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => updateField('customNsfwWhitelist', settings.customNsfwWhitelist.filter(k => k !== kw))}
                          className="hover:text-white"
                        >×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      placeholder="Dodaj wyjątek naukowy..."
                      value={newWhitelistInput}
                      onChange={(e) => setNewWhitelistInput(e.target.value)}
                      className="flex-1 bg-[#202020] border border-[#333] rounded px-2 py-1 text-white text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newWhitelistInput.trim()) {
                          updateField('customNsfwWhitelist', [...settings.customNsfwWhitelist, newWhitelistInput.trim().toLowerCase()]);
                          setNewWhitelistInput('');
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[10px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ----------------- TAB 4: AUTOCLEANER & DUPLIKATY ----------------- */}
          {activeTab === 'cleaners' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Ghost Cleaner Card */}
                <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs">
                        <Trash2 className="w-4 h-4" />
                        <span>Ghost Cleaner (Śmieci & Stare Exe)</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 font-mono text-[10px]">
                        &gt; {settings.ghostInstallerMaxAgeDays} dni
                      </span>
                    </div>

                    <p className="text-[11px] text-[#888] font-mono leading-relaxed">
                      Wykrywa porzucone instalatory .exe/.msi, pliki .tmp oraz duplikaty instalatorów (1).exe.
                    </p>

                    <div className="pt-1 space-y-1.5 font-mono text-[11px]">
                      <label className="text-[#aaa] block">Wiek instalatorów do czyszczenia:</label>
                      <select
                        value={settings.ghostInstallerMaxAgeDays}
                        onChange={(e) => updateField('ghostInstallerMaxAgeDays', Number(e.target.value))}
                        className="w-full bg-[#202020] border border-[#333] rounded-lg px-2.5 py-1.5 text-white"
                      >
                        <option value={3}>Starsze niż 3 dni (Agresywny)</option>
                        <option value={7}>Starsze niż 7 dni (Domyślnie)</option>
                        <option value={14}>Starsze niż 14 dni</option>
                        <option value={30}>Starsze niż 30 dni (Bezpieczny)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenGhostCleaner();
                    }}
                    className="w-full py-2.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/30 font-bold font-mono text-[11px] transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Uruchom Ghost Cleaner</span>
                  </button>
                </div>

                {/* Deduplicator Card */}
                <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                        <Copy className="w-4 h-4" />
                        <span>Łowca Duplikatów Hash</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono text-[10px] uppercase">
                        {settings.dedupAlgorithm}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#888] font-mono leading-relaxed">
                      Weryfikuje sumy kontrolne zawartości pliku, identyfikując identyczne kopie niezależnie od nazwy.
                    </p>

                    <div className="pt-1 space-y-1.5 font-mono text-[11px]">
                      <label className="text-[#aaa] block">Algorytm weryfikacji sum:</label>
                      <select
                        value={settings.dedupAlgorithm}
                        onChange={(e) => updateField('dedupAlgorithm', e.target.value as HashAlgorithm)}
                        className="w-full bg-[#202020] border border-[#333] rounded-lg px-2.5 py-1.5 text-white"
                      >
                        <option value="xxhash64">xxHash64 (Ultraszybki RAM-Speed)</option>
                        <option value="md5">MD5 (Klasyczna zgodność)</option>
                        <option value="sha256">SHA-256 (Kryptograficzna precyzja)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeduplicator();
                    }}
                    className="w-full py-2.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 font-bold font-mono text-[11px] transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Skanuj Duplikaty</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SettingRow
                  title="Usuwaj puste foldery po segregacji"
                  description="Automatycznie czyści osierocone, puste katalogi w docelowym folderze."
                  checked={settings.ghostCleanEmptyDirs}
                  onChange={(val) => updateField('ghostCleanEmptyDirs', val)}
                  color="yellow"
                />
                <SettingRow
                  title="Ignoruj pliki zerowe (0 B)"
                  description="Nie zgłasza pustych plików znacznikowych jako zbędnych duplikatów."
                  checked={settings.dedupIgnoreZeroByte}
                  onChange={(val) => updateField('dedupIgnoreZeroByte', val)}
                  color="cyan"
                />
              </div>
            </div>
          )}

          {/* ----------------- TAB 5: AI PROVIDERS & LOCAL-FIRST AGENTS ----------------- */}
          {activeTab === 'ai_engine' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Top AI Architecture & Local Data Boundary Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-[#181824] to-indigo-950/30 border border-purple-500/30 shadow-lg space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      <Bot className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">Centrum Zarządzania AI & Agentami</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {aiData?.settings?.primaryProvider === 'ollama' ? 'Lokalny Agent (Ollama)' : 'Chmura BYOK (User AI)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#888] font-mono">
                        Lokalne przetwarzanie na Twoim komputerze lub hybrydowe łącze z zewnętrznym API
                      </p>
                    </div>
                  </div>

                  {/* Local Data Boundary Indicator */}
                  {aiData?.settings?.primaryProvider === 'ollama' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>LOCAL PROVIDER SELECTED: VERIFY ENDPOINT AND CONTEXT</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono font-semibold">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>EXTERNAL CLOUD API ACTIVE</span>
                    </div>
                  )}
                </div>

                {/* Primary / Helper Orchestration Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#141414] border border-[#262626] space-y-1">
                    <span className="text-[#888] text-[10px] uppercase font-bold block">Główny Silnik (Primary AI)</span>
                    <select
                      value={aiData?.settings?.primaryProvider || 'ollama'}
                      onChange={(e) => updateAiSetting('root', 'primaryProvider', e.target.value)}
                      className="w-full bg-[#202020] border border-[#383838] rounded-md px-2.5 py-1.5 text-white font-semibold text-xs focus:outline-none focus:border-purple-500"
                    >
                      <option value="ollama">Ollama (Lokalna na komputerze)</option>
                      <option value="user_ai">User AI (Własne API / Chmura)</option>
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-[#141414] border border-[#262626] space-y-1">
                    <span className="text-[#888] text-[10px] uppercase font-bold block">Asystent (Helper AI)</span>
                    <select
                      value={aiData?.settings?.helperProvider || 'ollama'}
                      onChange={(e) => updateAiSetting('root', 'helperProvider', e.target.value)}
                      className="w-full bg-[#202020] border border-[#383838] rounded-md px-2.5 py-1.5 text-white font-semibold text-xs focus:outline-none focus:border-purple-500"
                    >
                      <option value="ollama">Ollama (Lokalny Helper)</option>
                      <option value="user_ai">User AI (Asystent Cloud)</option>
                      <option value="none">Brak (Pojedynczy agent)</option>
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-[#141414] border border-[#262626] space-y-1 flex flex-col justify-between">
                    <span className="text-[#888] text-[10px] uppercase font-bold block">Przełączanie awaryjne (Failover)</span>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[11px] text-[#ccc]">Auto-przełącznik</span>
                      <ToggleSwitch
                        checked={aiData?.settings?.fallbackEnabled !== false}
                        onChange={(val) => updateAiSetting('root', 'fallbackEnabled', val)}
                        color="purple"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 1. OLLAMA LOCAL AI SECTION */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-purple-400" />
                    <div>
                      <h4 className="font-bold text-white text-xs">Ollama — Lokalny Demon AI (Local-First)</h4>
                      <p className="text-[11px] text-[#777] font-mono">Działa bezpośrednio na sprzęcie użytkownika bez opłat i telemetrii</p>
                    </div>
                  </div>

                  {/* Real Status Badge */}
                  <div className="flex items-center gap-2">
                    {aiData?.ollama?.status === 'CONNECTED' && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Połączono ({aiData.ollama.latencyMs || 65} ms)</span>
                      </span>
                    )}
                    {aiData?.ollama?.status === 'OFFLINE' && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>Ollama Offline (Uruchom usługę)</span>
                      </span>
                    )}
                    {aiData?.ollama?.status === 'NOT_INSTALLED' && (
                      <span className="px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-[11px] font-bold flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>Nie zainstalowano</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* If Not Installed: Explicit Installation Card */}
                {aiData?.ollama?.status === 'NOT_INSTALLED' && (
                  <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-xs font-mono space-y-0.5">
                      <div className="text-rose-200 font-bold">Chcesz uruchamiać modele lokalnie?</div>
                      <div className="text-rose-300/80 text-[11px]">
                        Ollama pozwala na pobranie modeli Qwen, LLaMA czy Mistral bez opłat za API.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOllamaConsentModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold font-mono text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Zainstaluj Ollama...</span>
                    </button>
                  </div>
                )}

                {/* Ollama Configuration Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[#aaa] text-[11px] block">Wybierz lokalny model Ollama:</label>
                    <div className="relative">
                      <select
                        value={aiData?.settings?.ollama?.defaultModel || 'qwen2.5-coder:3b'}
                        onChange={(e) => updateAiSetting('ollama', 'defaultModel', e.target.value)}
                        className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                      >
                        {Array.isArray(aiData?.ollama?.models) && aiData.ollama.models.length > 0 ? (
                          aiData.ollama.models.map((m: any) => (
                            <option key={m.name} value={m.name}>
                              {m.name} ({m.sizeFormatted}) — {m.parameterSize || 'LLM'}
                            </option>
                          ))
                        ) : (
                          <option value="qwen2.5-coder:3b">qwen2.5-coder:3b (Domyślny)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[#aaa] text-[11px] block">Lokalny endpoint Ollama:</label>
                    <input
                      type="text"
                      value={aiData?.settings?.ollama?.endpoint || 'http://127.0.0.1:11434'}
                      onChange={(e) => updateAiSetting('ollama', 'endpoint', e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                      className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Real Model Metadata Badges */}
                {aiData?.ollama?.models && aiData.ollama.models.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono pt-0.5">
                    <span className="text-[#666]">Dostępne na dysku ({aiData.ollama.models.length}):</span>
                    {aiData.ollama.models.slice(0, 4).map((m: any) => (
                      <button
                        type="button"
                        key={m.name}
                        onClick={() => updateAiSetting('ollama', 'defaultModel', m.name)}
                        className={`px-2 py-0.5 rounded cursor-pointer border transition ${
                          aiData?.settings?.ollama?.defaultModel === m.name
                            ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                            : 'bg-[#202020] text-[#888] border-[#333] hover:text-white'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                    {aiData.ollama.models.length > 4 && (
                      <span className="text-[#666]">+{aiData.ollama.models.length - 4} więcej</span>
                    )}
                  </div>
                )}

                {/* Actions: Test Connection & Refresh */}
                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestAiConnection('ollama')}
                      disabled={aiTesting === 'ollama'}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-mono text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    >
                      {aiTesting === 'ollama' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                      <span>{aiTesting === 'ollama' ? 'Sprawdzanie...' : 'Testuj połączenie Ollama'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={fetchAiStatus}
                      className="px-2.5 py-1.5 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-[#888] hover:text-white border border-[#333] font-mono text-xs transition cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Odśwież modele</span>
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-[#666]">
                    Status: <b className="text-white">{aiData?.ollama?.status || 'UNKNOWN'}</b>
                  </span>
                </div>
              </div>

              {/* 2. USER AI / CLOUD BYOK SECTION */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-sky-400" />
                    <div>
                      <h4 className="font-bold text-white text-xs">User AI / Własny Klucz API (BYOK)</h4>
                      <p className="text-[11px] text-[#777] font-mono">Dla modeli chmurowych OpenAI, Anthropic, Gemini lub własnego serwera</p>
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded bg-sky-500/10 text-sky-300 font-mono text-[10px] border border-sky-500/30">
                    Opcjonalny Cloud Fallback
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[#aaa] text-[11px] block">Dostawca API:</label>
                    <select
                      value={aiData?.settings?.userAi?.provider || 'openai'}
                      onChange={(e) => updateAiSetting('userAi', 'provider', e.target.value)}
                      className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="openai">OpenAI (ChatGPT / GPT-4o)</option>
                      <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                      <option value="gemini">Google Gemini (Gemini 1.5 Pro)</option>
                      <option value="custom">Własny endpoint kompatybilny</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[#aaa] text-[11px] block">Klucz API (API Key):</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={aiData?.settings?.userAi?.apiKey || ''}
                        onChange={(e) => updateAiSetting('userAi', 'apiKey', e.target.value)}
                        placeholder="sk-proj-..."
                        className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 pr-10 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-2 text-[#777] hover:text-white transition p-1"
                      >
                        {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[#aaa] text-[11px] block">Endpoint API:</label>
                    <input
                      type="text"
                      value={aiData?.settings?.userAi?.endpoint || 'https://api.openai.com/v1'}
                      onChange={(e) => updateAiSetting('userAi', 'endpoint', e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[#aaa] text-[11px] block">Nazwa modelu chmurowego:</label>
                    <input
                      type="text"
                      value={aiData?.settings?.userAi?.model || 'gpt-4o-mini'}
                      onChange={(e) => updateAiSetting('userAi', 'model', e.target.value)}
                      placeholder="gpt-4o-mini"
                      className="w-full bg-[#202020] border border-[#383838] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* User AI Test Connection */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => handleTestAiConnection('user_ai')}
                    disabled={aiTesting === 'user_ai'}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-mono text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                  >
                    {aiTesting === 'user_ai' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    <span>{aiTesting === 'user_ai' ? 'Weryfikacja...' : 'Testuj połączenie User AI'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAiSettings}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Zapisz konfigurację AI</span>
                  </button>
                </div>
              </div>

              {/* 3. CAPABILITY & TOOL PERMISSIONS MATRIX */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <div>
                      <h4 className="font-bold text-white text-xs">Matryca Uprawnień Agenta AI (Tool Permissions)</h4>
                      <p className="text-[11px] text-[#777] font-mono">Kontroluj do jakich zasobów systemowych i plików agent ma bezpośredni dostęp</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">Zero-Trust Protected</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Odczyt plików (FILES_READ)</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">Bezpieczne</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Skanowanie zawartości, struktury projektu i kodu</p>
                    </div>
                    <ToggleSwitch
                      checked={aiData?.settings?.permissions?.readFiles !== false}
                      onChange={(val) => updateAiPermission('readFiles', val)}
                      color="emerald"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Wyszukiwanie kodu (FILES_SEARCH)</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">Bezpieczne</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Wyszukiwanie po nazwach plików i zawartości (grep)</p>
                    </div>
                    <ToggleSwitch
                      checked={aiData?.settings?.permissions?.searchWorkspace !== false}
                      onChange={(val) => updateAiPermission('searchWorkspace', val)}
                      color="emerald"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Edycja kodu (CODE_EDIT)</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px]">Przegląd Diff</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Modyfikowanie istniejących plików źródłowych</p>
                    </div>
                    <ToggleSwitch
                      checked={aiData?.settings?.permissions?.writeFiles !== false}
                      onChange={(val) => updateAiPermission('writeFiles', val)}
                      color="yellow"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Usuwanie plików (FILES_DELETE)</span>
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px]">Destrukcyjne</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Trwałe kasowanie plików wymaga potwierdzenia</p>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(aiData?.settings?.permissions?.deleteFiles)}
                      onChange={(val) => updateAiPermission('deleteFiles', val)}
                      color="red"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Wykonywanie testów (COMMAND_RUNNER)</span>
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px]">Kompilacja</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Uruchamianie npm test, lintera i buildera</p>
                    </div>
                    <ToggleSwitch
                      checked={aiData?.settings?.permissions?.executeCommands !== false}
                      onChange={(val) => updateAiPermission('executeCommands', val)}
                      color="purple"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c]">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <span>Inspekcja Gita (GIT_INSPECT)</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">Bezpieczne</span>
                      </div>
                      <p className="text-[#777] text-[10px] mt-0.5">Odczyt gałęzi, diffów i zmodyfikowanych linii</p>
                    </div>
                    <ToggleSwitch
                      checked={aiData?.settings?.permissions?.inspectGit !== false}
                      onChange={(val) => updateAiPermission('inspectGit', val)}
                      color="emerald"
                    />
                  </div>
                </div>
              </div>

              {/* 4. SMART OCR & SYSTEM PERFORMANCE */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <div>
                      <h4 className="font-bold text-white text-xs">Silnik Smart OCR & Indeksowania Tekstu</h4>
                      <p className="text-[11px] text-[#777] font-mono">
                        Rozpoznaje tekst ze zrzutów ekranu, faktur i dokumentów PDF
                      </p>
                    </div>
                  </div>
                  <select
                    value={settings.ocrMode}
                    onChange={(e) => updateField('ocrMode', e.target.value as OcrMode)}
                    className="bg-[#202020] border border-[#333] text-white font-mono text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                  >
                    <option value="off">Wyłączony</option>
                    <option value="fast">Szybki (Tylko nagłówki)</option>
                    <option value="deep_ai">Głęboki OCR + Auto-Tagi AI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SettingRow
                  title="Niski priorytet dyskowy (Eco I/O)"
                  description="Zapobiega spadkom FPS w grach podczas masowego skanowania dysku."
                  checked={settings.lowPriorityIo}
                  onChange={(val) => updateField('lowPriorityIo', val)}
                  color="yellow"
                />
                <SettingRow
                  title="Tryb cichy (Focus Mode)"
                  description="Wycisza powiadomienia wyskakujące, logując zdarzenia tylko w tle."
                  checked={settings.silentNotifications}
                  onChange={(val) => updateField('silentNotifications', val)}
                  color="purple"
                />
              </div>

              {/* Thread count slider */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white text-xs">Pula wątków roboczych CPU</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold">
                    {settings.maxWorkerThreads} wątki
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={16}
                  step={1}
                  value={settings.maxWorkerThreads}
                  onChange={(e) => updateField('maxWorkerThreads', Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#666]">
                  <span>1 (Energooszczędny)</span>
                  <span>4 (Zalecane)</span>
                  <span>16 (Pełna moc)</span>
                </div>
              </div>

            </div>
          )}

          {/* ----------------- TAB 6: WŁASNE REGUŁY & POWER AUTOMATION ----------------- */}
          {activeTab === 'power_rules' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Presety bezpieczeństwa */}
              <div className="p-4 rounded-xl bg-[#151515] border border-emerald-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-xs">Szybkie Profile Konfiguracyjne (Security Presets)</h4>
                    <p className="text-[11px] text-[#777] font-mono">1-klikowe dopasowanie wszystkich parametrów ochrony</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => applyPreset('developer')}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      settings.securityPreset === 'developer'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-[#1a1a1a] border-[#2c2c2c] text-[#888] hover:text-white'
                    }`}
                  >
                    <div className="text-white font-bold">🟢 Developer</div>
                    <div className="text-[10px] text-[#777]">Brak blokad .bat/.ps1</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('balanced')}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      settings.securityPreset === 'balanced'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-[#1a1a1a] border-[#2c2c2c] text-[#888] hover:text-white'
                    }`}
                  >
                    <div className="text-white font-bold">🟡 Zbalansowany</div>
                    <div className="text-[10px] text-[#777]">Optymalna ochrona</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('paranoid')}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      settings.securityPreset === 'paranoid'
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                        : 'bg-[#1a1a1a] border-[#2c2c2c] text-[#888] hover:text-white'
                    }`}
                  >
                    <div className="text-white font-bold">🔴 Paranoiczny</div>
                    <div className="text-[10px] text-[#777]">Maksymalny rygor</div>
                  </button>
                </div>
              </div>

              {/* Custom Automation Rules List */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs">
                    Własne Reguły Automatyzacji IF → THEN ({settings.customAutomationRules.length})
                  </h4>
                  <span className="text-[10px] font-mono text-[#777]">Własne wzorce Regex / Nazwy</span>
                </div>

                <div className="space-y-2">
                  {settings.customAutomationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c] font-mono text-[11px]"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">{rule.name}</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 text-[9px] uppercase">
                            {rule.action}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#777]">
                          Wzorzec: <code className="text-[#aaa]">{rule.pattern}</code> → Cel: <code className="text-purple-300">{rule.target}</code>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          checked={rule.enabled}
                          onChange={() => handleToggleCustomRule(rule.id)}
                          color="emerald"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomRule(rule.id)}
                          className="p-1 rounded text-[#777] hover:text-rose-400 transition cursor-pointer"
                          title="Usuń regułę"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form to add a new rule */}
                <form onSubmit={handleAddCustomRule} className="p-3 rounded-lg bg-[#1a1a1a] border border-[#2c2c2c] space-y-2 font-mono text-[11px]">
                  <div className="font-bold text-white text-xs">+ Stwórz nową regułę automatyzacji</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nazwa reguły (np. Projekty 3D)"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="bg-[#222] border border-[#333] rounded px-2.5 py-1 text-white text-[11px]"
                    />
                    <input
                      type="text"
                      placeholder="Wzorzec nazwy (np. blend|fbx|obj)"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="bg-[#222] border border-[#333] rounded px-2.5 py-1 text-white text-[11px]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={newRuleAction}
                      onChange={(e) => setNewRuleAction(e.target.value as any)}
                      className="bg-[#222] border border-[#333] rounded px-2.5 py-1 text-white text-[11px]"
                    >
                      <option value="move">Akcja: Przenieś do podfolderu</option>
                      <option value="tag">Akcja: Oznacz unikalnym tagiem</option>
                      <option value="quarantine">Akcja: Wstrzymaj w kwarantannie</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Docelowy folder / Tag (np. /Modele_3D)"
                      value={newRuleTarget}
                      onChange={(e) => setNewRuleTarget(e.target.value)}
                      className="bg-[#222] border border-[#333] rounded px-2.5 py-1 text-white text-[11px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/30 font-bold text-[11px] transition cursor-pointer"
                  >
                    Dodaj Regułę do Silnika
                  </button>
                </form>
              </div>

              {/* Import/Export Configuration */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-xs">Kopia Zapasowa Profilu JSON</h4>
                  <p className="text-[11px] text-[#777] font-mono">Wyeksportuj lub zarchiwizuj wszystkie reguły</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const json = JSON.stringify(settings, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `nexus-profile-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      if (onToast) onToast('success', 'Pobrano profil JSON', 'Plik konfiguracyjny został zapisany.');
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-mono text-[11px] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Eksportuj .JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const json = JSON.stringify(settings, null, 2);
                      navigator.clipboard?.writeText(json);
                      if (onToast) onToast('success', 'Skopiowano profil JSON', 'Wszystkie ustawienia i reguły są w schowku.');
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-mono text-[11px] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopiuj JSON profilu</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ================= FOOTER ================= */}
        <div className="p-4 border-t border-[#242424] bg-[#181818] flex items-center justify-between font-mono text-xs">
          <div className="text-[11px] text-[#777]">
            {isDirty ? (
              <span className="text-amber-400 font-bold animate-pulse">● Wykryto niezapisane zmiany (Ctrl+S)</span>
            ) : (
              <span className="text-emerald-400">✓ Wszystkie reguły zsynchronizowane</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#aaa] hover:text-white transition cursor-pointer font-bold"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className={`px-5 py-2 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Zapisano!</span>
                </>
              ) : (
                <>
                  <SaveIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Zapisywanie...' : 'Zapisz Konfigurację'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      {/* Explicit Ollama Consent & Installation Modal Dialog */}
      {showOllamaConsentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#18181c] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Server className="w-6 h-6 text-purple-400" />
              </span>
              <div>
                <h3 className="font-bold text-white text-base">Zgoda na instalację Ollama (Lokalne AI)</h3>
                <p className="text-xs text-[#888] font-mono">Sprawdź dostawcę AI i integracje przed wysłaniem danych.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121216] border border-[#26262e] text-xs font-mono text-[#ccc] space-y-2 leading-relaxed">
              <p>
                <b className="text-white">Ollama</b> zostanie zainstalowana na Twoim komputerze za pośrednictwem oficjalnego menedżera pakietów Windows (<code className="text-purple-300">winget</code>) lub oficjalnego instalatora.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[#aaa]">
                <li>Wybrany model Ollama działa przez usługę uruchomioną na tym urządzeniu.</li>
                <li>Dane przekazane do lokalnego endpointu Ollama są przetwarzane lokalnie; inne skonfigurowane integracje mogą przesyłać dane do usług zewnętrznych.</li>
                <li>Nexus nie pobiera ani nie instaluje oprogramowania w tle bez Twojej wyraźnej zgody.</li>
              </ul>
            </div>

            {installResult?.error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs font-mono text-rose-300 space-y-1.5">
                <div className="font-bold">Informacja o instalacji:</div>
                <div className="text-[11px]">{installResult.error}</div>
                {installResult.manualUrl && (
                  <a
                    href={installResult.manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-purple-300 hover:text-white underline mt-1"
                  >
                    <span>Otwórz oficjalną stronę pobierania Ollama</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {installResult?.message && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs font-mono text-emerald-300">
                {installResult.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOllamaConsentModal(false);
                  setInstallResult(null);
                }}
                disabled={isInstallingOllama}
                className="px-4 py-2 rounded-xl bg-[#222] hover:bg-[#2c2c2c] text-[#aaa] hover:text-white font-mono text-xs transition cursor-pointer"
              >
                Anuluj
              </button>

              <button
                type="button"
                onClick={handleExecuteOllamaInstall}
                disabled={isInstallingOllama}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs transition cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isInstallingOllama ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Instalacja w toku...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Wyrażam Zgodę i Instaluję</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

// Helper SaveIcon
const SaveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);