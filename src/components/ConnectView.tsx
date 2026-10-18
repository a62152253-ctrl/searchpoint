import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FolderDown, 
  Monitor, 
  Image as ImageIcon, 
  FileText, 
  ArrowRight,
  HardDrive,
  Cpu,
  Sparkles,
  CheckCircle2,
  FolderOpen,
  ShieldCheck,
  Lock,
  Search,
  Loader2,
  AlertCircle,
  Clock,
  RotateCcw,
  ChevronRight,
  FolderTree,
  X,
  Bot,
  Server,
  GitBranch,
  Terminal,
  Code2,
  Layers,
  Download,
  Check,
  ExternalLink,
  Trash2,
  Globe,
  Zap,
  Activity,
  RefreshCw,
  Plus
} from 'lucide-react';
import { SystemInfo, FileItem } from '../types';
import { 
  pickDirectoryWithFSA, 
  pickFilesWithFSA, 
  isFileSystemAccessSupported, 
  isOpenFilePickerSupported,
  traverseDirectory,
  scanDroppedItems
} from '../utils/fileSystemAccessManager';
import { nexusApi } from '../utils/nexusAuth';

interface RecentWorkspace {
  path: string;
  name: string;
  frameworks?: string[];
  packageManager?: string;
  lastOpened: number;
}

interface ProjectInspection {
  exists: boolean;
  name?: string;
  version?: string;
  packageManager?: string;
  frameworks?: string[];
  languages?: string[];
  git?: {
    isRepo: boolean;
    branch: string;
    isDirty: boolean;
    modifiedCount: number;
  } | null;
  entryPoints?: string[];
  totalFilesTopLevel?: number;
  error?: string;
}

interface AiReadiness {
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  status: 'CONNECTED' | 'OFFLINE' | 'NOT_INSTALLED' | string;
  defaultModel?: string;
  latencyMs?: number;
  modelCount?: number;
}

interface ConnectViewProps {
  systemInfo: SystemInfo | null;
  initialPath?: string;
  onStartScan: (targetPath: string | string[], ingestionMode?: string) => void;
  onStartBenchmark: (count: number) => void;
  onFsaLoaded?: (dirName: string, items: FileItem[]) => void;
  onGoToWebsite?: () => void;
  isProLicensed?: boolean;
  onOpenProModal?: () => void;
}

const RECENT_STORAGE_KEY = 'nexus_recent_workspaces_v2';

const getQuickAccessIcon = (icon?: string): string => {
  switch (icon) {
    case 'desktop': return '🖥';
    case 'downloads': return '📥';
    case 'documents': return '📄';
    case 'pictures': return '🖼';
    case 'project': return '⚡';
    default: return '🏠';
  }
};

export const ConnectView: React.FC<ConnectViewProps> = ({
  systemInfo,
  initialPath,
  onStartScan,
  onStartBenchmark,
  onFsaLoaded,
  onGoToWebsite,
  isProLicensed = false,
  onOpenProModal
}) => {
  // Target folder states
  const [selectedPath, setSelectedPath] = useState<string>(() => {
    return initialPath || localStorage.getItem('nexus_target_path') || systemInfo?.defaultTargets?.[0]?.path || '';
  });
  const [customPath, setCustomPath] = useState<string>('');
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [ingestionMode, setIngestionMode] = useState<'ALL' | 'DEV_ONLY' | 'ANIME_ONLY' | 'SCREENSHOTS_ONLY'>('DEV_ONLY');

  // Scope: 'SINGLE' | 'WHOLE_PC' | 'MULTI'
  const [scanScope, setScanScope] = useState<'SINGLE' | 'WHOLE_PC' | 'MULTI'>('SINGLE');
  const [showProLimitNotice, setShowProLimitNotice] = useState<boolean>(false);
  const [multiFolders, setMultiFolders] = useState<string[]>([]);
  const [multiHandles, setMultiHandles] = useState<{ name: string; handle: any; count?: number }[]>([]);

  // Drag and drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);

  // Path validation state
  const [pathValidation, setPathValidation] = useState<{
    status: 'idle' | 'valid' | 'invalid' | 'checking';
    childCount?: number;
    path?: string;
  }>({ status: 'idle' });

  // Smart Project Inspection state
  const [projectInspection, setProjectInspection] = useState<ProjectInspection | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // AI Readiness state
  const [aiReadiness, setAiReadiness] = useState<AiReadiness | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showOllamaConsentModal, setShowOllamaConsentModal] = useState(false);
  const [isInstallingOllama, setIsInstallingOllama] = useState(false);
  const [installResult, setInstallResult] = useState<{ success: boolean; message?: string; error?: string; manualUrl?: string } | null>(null);

  // Recent Workspaces
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Chromium FSA API States
  const [fsaLoading, setFsaLoading] = useState(false);
  const [fsaStatus, setFsaStatus] = useState<string | null>(null);
  const [fsaError, setFsaError] = useState<string | null>(null);

  // In-app directory browser drawer state
  const [isTreeBrowserOpen, setIsTreeBrowserOpen] = useState(false);
  const [treeCurrentPath, setTreeCurrentPath] = useState<string>('');
  const [treeParentPath, setTreeParentPath] = useState<string | null>(null);
  const [treeFolders, setTreeFolders] = useState<{ name: string; path: string }[]>([]);
  const [treeDrives, setTreeDrives] = useState<{ name: string; path: string }[]>([]);
  const [treeQuickAccess, setTreeQuickAccess] = useState<{ name: string; path: string; icon?: string }[]>([]);
  const [treeWarning, setTreeWarning] = useState<string | null>(null);
  const [treePathInput, setTreePathInput] = useState<string>('');
  const [isTreeLoading, setIsTreeLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectivePath = customPath.trim() || selectedPath;

  // 1. Fetch AI Readiness from server on mount
  const checkAiReadiness = useCallback(async () => {
    setIsAiLoading(true);
    try {
      const data = await nexusApi.get<any>('/api/ai/status');
      if (data) {
        setAiReadiness({
          ollamaInstalled: Boolean(data.ollama?.installed),
          ollamaRunning: Boolean(data.ollama?.running),
          status: data.ollama?.status || 'UNKNOWN',
          defaultModel: data.settings?.ollama?.defaultModel || data.ollama?.models?.[0]?.name,
          latencyMs: data.ollama?.latencyMs,
          modelCount: data.ollama?.modelCount || 0
        });
      }
    } catch (e) {
      console.warn('[Nexus AI Readiness] Check failed:', e);
    } finally {
      setIsAiLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAiReadiness();
  }, [checkAiReadiness]);

  // 2. Validate directory and inspect project structure
  const inspectAndValidate = useCallback(async (dirPath: string) => {
    const clean = (dirPath || '').trim();
    if (!clean) {
      setPathValidation({ status: 'idle' });
      setProjectInspection(null);
      return;
    }

    setPathValidation({ status: 'checking' });
    setIsInspecting(true);

    try {
      const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

      // Step A: Path validation
      const valData = await nexusApi.post<any>('/api/action/validate-path', { path: clean }).catch(() => null);

      if (valData && valData.exists && valData.isDirectory) {
        setPathValidation({ status: 'valid', childCount: valData.childCount, path: valData.path });

        // Step B: Smart Project Inspection
        const inspectData = await nexusApi.post<ProjectInspection>('/api/ai/inspect-project', { path: clean }).catch(() => null);

        if (inspectData) {
          setProjectInspection(inspectData);
          if (inspectData.frameworks && inspectData.frameworks.length > 0) {
            setIngestionMode('DEV_ONLY');
          }
        }
      } else if (isWeb || (valData && valData.isWeb)) {
        // Web / SaaS mode: The user typed a local Windows/Mac path (e.g. C:\Users\...\faktup)
        const parts = clean.split(/[\\/]/).filter(Boolean);
        const folderName = parts[parts.length - 1] || clean;
        setPathValidation({
          status: 'valid',
          path: clean,
          childCount: undefined
        });
        setProjectInspection({
          exists: true,
          name: folderName,
          frameworks: ['Workspace Lokalny']
        });
      } else {
        setPathValidation({ status: 'invalid', path: clean });
        setProjectInspection(null);
      }
    } catch {
      const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isWeb) {
        const parts = clean.split(/[\\/]/).filter(Boolean);
        const folderName = parts[parts.length - 1] || clean;
        setPathValidation({ status: 'valid', path: clean, childCount: undefined });
        setProjectInspection({
          exists: true,
          name: folderName,
          frameworks: ['Workspace Lokalny']
        });
      } else {
        setPathValidation({ status: 'idle' });
        setProjectInspection(null);
      }
    } finally {
      setIsInspecting(false);
    }
  }, []);

  // Sync initial path
  useEffect(() => {
    if (effectivePath) {
      inspectAndValidate(effectivePath);
    }
  }, [effectivePath, inspectAndValidate]);

  // 3. Save workspace to recent list
  const saveToRecent = (pathToAdd: string, inspection?: ProjectInspection | null) => {
    if (!pathToAdd) return;
    const name = inspection?.name || pathToAdd.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
    const updated: RecentWorkspace[] = [
      {
        path: pathToAdd,
        name,
        frameworks: inspection?.frameworks || [],
        packageManager: inspection?.packageManager || undefined,
        lastOpened: Date.now()
      },
      ...recentWorkspaces.filter(w => w.path !== pathToAdd)
    ].slice(0, 6);

    setRecentWorkspaces(updated);
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  const removeFromRecent = (e: React.MouseEvent, pathToRemove: string) => {
    e.stopPropagation();
    const filtered = recentWorkspaces.filter(w => w.path !== pathToRemove);
    setRecentWorkspaces(filtered);
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(filtered));
    } catch (_) {}
  };

  // Launch workspace scan
  const handleLaunchWorkspace = async () => {
    if (!effectivePath) return;

    const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    // In web mode, if files are not yet loaded into memory, launch the browser folder picker:
    if (isWeb && isFileSystemAccessSupported() && pathValidation.childCount === undefined) {
      await handlePickNativeFolder();
      return;
    }

    saveToRecent(effectivePath, projectInspection);
    localStorage.setItem('nexus_target_path', effectivePath);
    localStorage.setItem('nexus_access_granted', 'true');
    onStartScan(effectivePath, ingestionMode);
  };

  // Launch Whole PC (All Drives / Full Computer)
  const handleLaunchWholePc = async () => {
    if (!isProLicensed) {
      setShowProLimitNotice(true);
      return;
    }

    const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isWeb) {
      setFsaLoading(true);
      setFsaStatus('Wskaż folder C:\\Users lub dysk w oknie przeglądarki...');
      try {
        const res = await pickDirectoryWithFSA((count, cur) => {
          setFsaStatus(`Skanowanie całego komputera: ${count} plików... (${cur})`);
        });
        if (res.success && res.items.length > 0) {
          if (onFsaLoaded) {
            onFsaLoaded(`Cały Komputer (${res.dirName})`, res.items);
          }
        } else if (res.error && res.error !== 'Anulowano wybór folderu.') {
          setFsaError(res.error);
        }
      } catch (err: any) {
        console.warn('[Nexus] Whole PC FSA error:', err);
      } finally {
        setFsaLoading(false);
        setFsaStatus(null);
      }
    } else {
      onStartScan('WHOLE_PC', ingestionMode);
    }
  };

  // Add folder to Multi-Folder workspace
  const handleAddFolderToMulti = async () => {
    if (isFileSystemAccessSupported()) {
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        if (handle) {
          if (!multiHandles.some(h => h.name === handle.name)) {
            setMultiHandles(prev => [...prev, { name: handle.name, handle }]);
            setMultiFolders(prev => Array.from(new Set([...prev, handle.name])));
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.warn('[Nexus] Multi-picker error:', e);
      }
    } else {
      openTreeBrowser(effectivePath || systemInfo?.homeDir || 'C:\\');
    }
  };

  const handleRemoveMultiFolder = (name: string) => {
    setMultiFolders(prev => prev.filter(f => f !== name));
    setMultiHandles(prev => prev.filter(h => h.name !== name));
  };

  const handleAddPresetMulti = () => {
    const home = systemInfo?.homeDir || 'C:\\Users\\arimo';
    const presets = [
      `${home}\\Desktop`,
      `${home}\\Downloads`,
      `${home}\\Documents`
    ];
    setMultiFolders(prev => Array.from(new Set([...prev, ...presets])));
  };

  const handleLaunchMultiWorkspace = async () => {
    if (!isProLicensed) {
      setShowProLimitNotice(true);
      return;
    }

    const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isWeb && multiHandles.length > 0) {
      setFsaLoading(true);
      const allItems: FileItem[] = [];
      for (const item of multiHandles) {
        setFsaStatus(`Skanowanie: ${item.name}...`);
        await traverseDirectory(item.handle, item.name, allItems, 8, 0, (count) => {
          setFsaStatus(`Skanowanie ${item.name}: ${count} plików...`);
        });
      }
      setFsaLoading(false);
      setFsaStatus(null);
      if (onFsaLoaded && allItems.length > 0) {
        onFsaLoaded(`Multi-Workspace (${multiHandles.map(h => h.name).join(', ')})`, allItems);
      }
    } else if (multiFolders.length > 0) {
      onStartScan(multiFolders, ingestionMode);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    setDragError(null);

    // 1. Try unified scanDroppedItems (Chromium File System Access + webkitGetAsEntry recursive fallback)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        setIsBrowsing(true);
        setFsaLoading(true);
        setFsaStatus('Przetwarzanie upuszczonego katalogu...');
        const dropRes = await scanDroppedItems(e.dataTransfer.items, (count) => {
          setFsaStatus(`Zaindeksowano ${count} upuszczonych plików...`);
        });

        if (dropRes.items.length > 0) {
          setCustomPath(dropRes.dirName);
          setSelectedPath(dropRes.dirName);
          setPathValidation({
            status: 'valid',
            childCount: dropRes.items.length,
            path: dropRes.dirName
          });

          if (onFsaLoaded) {
            onFsaLoaded(dropRes.dirName, dropRes.items);
            setIsBrowsing(false);
            setFsaLoading(false);
            setFsaStatus(null);
            return;
          }
        }
      } catch (dropErr: any) {
        console.warn('[Nexus] scanDroppedItems error:', dropErr);
      } finally {
        setIsBrowsing(false);
        setFsaLoading(false);
        setFsaStatus(null);
      }
    }

    // 2. Fallback to normal files or Electron native paths
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const first = files[0];
      const potentialPath = (first as any).path || (first as any).webkitRelativePath;
      if (potentialPath) {
        const folderDir = (first as any).path 
          ? (first.size === 0 ? potentialPath : potentialPath.substring(0, potentialPath.lastIndexOf('\\') || potentialPath.lastIndexOf('/')))
          : potentialPath.split('/')[0];

        if (folderDir) {
          setCustomPath(folderDir);
          setSelectedPath(folderDir);
          inspectAndValidate(folderDir);
          return;
        }
      }
      setCustomPath(first.name);
      setSelectedPath(first.name);
      inspectAndValidate(first.name);
    }
  };

  // Open native OS folder browser dialog with fallback
  const handlePickNativeFolder = async () => {
    setIsBrowsing(true);
    setFsaLoading(true);
    setFsaError(null);
    setFsaStatus('Wybierz katalog w oknie przeglądarki...');
    try {
      // 1. Modern Chromium File System Access API directory picker
      if (isFileSystemAccessSupported()) {
        const res = await pickDirectoryWithFSA((count, curDir) => {
          setFsaStatus(`Przeszukiwanie folderu: ${count} plików... (${curDir})`);
        });
        if (res.success && res.items.length > 0) {
          setCustomPath(res.dirName);
          setSelectedPath(res.dirName);
          setPathValidation({
            status: 'valid',
            childCount: res.items.length,
            path: res.dirName
          });
          if (onFsaLoaded) {
            onFsaLoaded(res.dirName, res.items);
            return;
          }
        } else if (res.error && res.error !== 'Anulowano wybór folderu.') {
          setFsaError(res.error);
        }
      } else {
        // 2. Invoke server-side picker with fast timeout
        const data = await nexusApi.post<{ success: boolean; selectedPath?: string }>('/api/action/pick-directory', {
          initialPath: effectivePath || systemInfo?.homeDir
        }).catch(() => null);

        if (data && data.success && data.selectedPath) {
          setCustomPath(data.selectedPath);
          setSelectedPath(data.selectedPath);
          inspectAndValidate(data.selectedPath);
        } else {
          openTreeBrowser(effectivePath || systemInfo?.homeDir || 'C:\\');
        }
      }
    } catch (err: any) {
      console.warn('[Nexus] Native folder picker error:', err);
      openTreeBrowser(effectivePath || systemInfo?.homeDir || 'C:\\');
    } finally {
      setIsBrowsing(false);
      setFsaLoading(false);
      setFsaStatus(null);
    }
  };

  // Open in-app folder explorer
  const openTreeBrowser = async (dirPath?: string) => {
    setIsTreeBrowserOpen(true);
    setIsTreeLoading(true);
    setTreeWarning(null);
    const target = (dirPath || effectivePath || systemInfo?.homeDir || 'C:\\').trim();
    setTreePathInput(target);
    try {
      const data = await nexusApi.get<any>(`/api/system/list-folders?path=${encodeURIComponent(target)}`).catch(() => null);
      if (data && data.current) {
        setTreeCurrentPath(data.current);
        setTreePathInput(data.current);
        setTreeParentPath(data.parent);
        setTreeFolders(data.folders || []);
        if (data.drives) setTreeDrives(data.drives);
        if (data.quickAccess) setTreeQuickAccess(data.quickAccess);
        if (data.warning) setTreeWarning(data.warning);
      }
    } catch (e: any) {
      console.error('[Nexus] Error listing folders:', e);
      setTreeWarning('Nie udało się wczytać katalogu. Użyj przycisków dysków poniżej.');
    } finally {
      setIsTreeLoading(false);
    }
  };

  const handleSelectTreeFolder = (folderPath: string) => {
    setCustomPath(folderPath);
    setSelectedPath(folderPath);
    inspectAndValidate(folderPath);
    setIsTreeBrowserOpen(false);
  };

  // Chromium File System Access API
  const handleOpenFolderWithFSA = async () => {
    setFsaLoading(true);
    setFsaError(null);
    setFsaStatus('Wybierz katalog w oknie przeglądarki...');
    try {
      const res = await pickDirectoryWithFSA((count) => {
        setFsaStatus(`Przeszukiwanie folderu: ${count} plików...`);
      });
      if (res.success && res.items.length > 0) {
        if (onFsaLoaded) {
          onFsaLoaded(`[Chromium]: ${res.dirName}`, res.items);
        }
      } else if (res.error && res.error !== 'Anulowano wybór folderu.') {
        setFsaError(res.error);
      }
    } catch (e: any) {
      setFsaError(e.message);
    } finally {
      setFsaLoading(false);
      setFsaStatus(null);
    }
  };

  // Execute explicit Ollama installation
  const handleExecuteOllamaInstall = async () => {
    setIsInstallingOllama(true);
    setInstallResult(null);
    try {
      const isWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const data = await nexusApi.post<any>('/api/ai/install-ollama', { userConsent: true }).catch(() => null);

      if (isWeb || (data && data.isWeb)) {
        setInstallResult({
          success: true,
          message: data?.message || 'Ollama uruchamia wybrany model na tym urządzeniu. W wersji przeglądarkowej pobierz oficjalny pakiet Ollama dla Windows lub uruchom instalator Nexus Desktop.',
          manualUrl: data?.manualUrl || 'https://ollama.com/download/windows'
        });
      } else if (data && data.success) {
        setInstallResult(data);
        setTimeout(() => {
          checkAiReadiness();
          setShowOllamaConsentModal(false);
        }, 2000);
      } else {
        setInstallResult({
          success: true,
          message: 'Pobierz oficjalny instalator Ollama dla Windows, aby uruchomić modele AI na swoim procesorze lub karcie graficznej.',
          manualUrl: 'https://ollama.com/download/windows'
        });
      }
    } catch {
      setInstallResult({
        success: true,
        message: 'Lokalny silnik AI wymaga uruchomionej usługi na Twoim komputerze. Pobierz oficjalny pakiet instalacyjny dla systemu Windows.',
        manualUrl: 'https://ollama.com/download/windows'
      });
    } finally {
      setIsInstallingOllama(false);
    }
  };

  const ingestionOptions = [
    {
      id: 'DEV_ONLY',
      emoji: '💻',
      title: 'Dev Workspace (Kod & Architektura)',
      desc: 'TypeScript, React, Python, pomija node_modules i .git'
    },
    {
      id: 'ALL',
      emoji: '🌐',
      title: 'Pełny Skan (Wszystkie Pliki)',
      desc: 'Wszystkie formaty, archiwa ZIP, obrazy i dokumenty'
    },
    {
      id: 'ANIME_ONLY',
      emoji: '🎨',
      title: 'Tylko Grafika & Media',
      desc: 'PNG, WebP, SVG, tekstury i assety wizualne'
    },
    {
      id: 'SCREENSHOTS_ONLY',
      emoji: '⚡',
      title: 'Zrzuty Ekranu & OCR',
      desc: 'Szybki triaż świeżych i ulotnych zrzutów ekranu'
    }
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#0f0f12] text-[#e6e5e3] font-sans overflow-y-auto selection:bg-purple-500/30">
      
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="w-full max-w-4xl space-y-6 py-6 text-left relative z-10">

        {/* =========================================================================
            HEADER & SYSTEM STATUS
        ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 font-bold flex items-center gap-1.5 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5" />
              TRYB LOKALNY
            </span>
            {onGoToWebsite && (
              <button
                onClick={onGoToWebsite}
                className="ml-auto px-3.5 py-1 rounded-full bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 hover:text-white transition flex items-center gap-1.5 text-xs font-mono cursor-pointer"
                title="Wróć do strony głównej"
              >
                <span>🌐 Strona główna</span>
              </button>
            )}
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <FolderDown className="w-7 h-7 sm:w-8 sm:h-8" />
              </span>
              <span>Wybierz folder lub projekt</span>
            </h1>
            <p className="text-sm text-[#9b9a97] mt-1.5 leading-relaxed max-w-2xl font-mono">
              Wybierz katalog z dysku, aby zindeksować pliki, wykryć projekty i otworzyć eksplorator.
            </p>
          </div>
        </div>

        {/* System Diagnostics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#16161a] border border-white/5 shadow-sm">
            <div className="text-[#888] text-[10px] uppercase font-bold">Użytkownik OS</div>
            <div className="font-bold text-white mt-0.5 truncate">{systemInfo?.username || 'Lokalny Użytkownik'}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#16161a] border border-white/5 shadow-sm">
            <div className="text-[#888] text-[10px] uppercase font-bold">Pamięć RAM</div>
            <div className="font-bold text-emerald-400 mt-0.5">{systemInfo?.freeMemoryGB || '16.0'} GB Wolne</div>
          </div>
          <div className="p-3 rounded-xl bg-[#16161a] border border-white/5 shadow-sm">
            <div className="text-[#888] text-[10px] uppercase font-bold">Ollama</div>
            <div className={`font-bold mt-0.5 flex items-center gap-1.5 ${aiReadiness?.ollamaRunning ? 'text-purple-400' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${aiReadiness?.ollamaRunning ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{aiReadiness?.ollamaRunning ? `Gotowy (${aiReadiness.modelCount} modeli)` : 'Offline'}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#16161a] border border-white/5 shadow-sm">
            <div className="text-[#888] text-[10px] uppercase font-bold">Czas Indeksowania</div>
            <div className="font-bold text-sky-400 mt-0.5">Zależnie od folderu</div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 1: AI READINESS CARD (SECTIONS 2, 3, 26)
        ========================================================================= */}
        <div className="p-4 rounded-2xl bg-[#141418] border border-[#26262e] shadow-lg space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="font-bold text-white text-sm">Status połączenia z Ollama</h3>
                <p className="text-[11px] text-[#777] font-mono">Lokalny serwer modeli na tym komputerze</p>
              </div>
            </div>

            {aiReadiness?.ollamaRunning ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ollama Connected{typeof aiReadiness.latencyMs === 'number' ? ` (${aiReadiness.latencyMs} ms)` : ''}</span>
              </span>
            ) : aiReadiness?.ollamaInstalled ? (
              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Ollama Offline (Usługa wyłączona)</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/35 text-rose-300 font-mono text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Ollama Nie Zainstalowana</span>
              </span>
            )}
          </div>

          {/* Connected State */}
          {aiReadiness?.ollamaRunning && (
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 font-mono text-xs text-purple-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Aktywny model: <b className="text-white">{aiReadiness.defaultModel || 'qwen2.5-coder:3b'}</b></span>
                <span className="text-[#888]">• Lokalny endpoint Ollama • Narzędzia kodu aktywne</span>
              </div>
              <button
                onClick={checkAiReadiness}
                className="text-[11px] text-purple-300 hover:text-white underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Odśwież</span>
              </button>
            </div>
          )}

          {/* Not Installed State with Explicit Consent Flow */}
          {!aiReadiness?.ollamaInstalled && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/30 to-indigo-950/20 border border-purple-500/30 flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1 font-mono text-xs">
                <div className="font-bold text-white flex items-center gap-2">
                  <span>⚡</span>
                  <span>Uruchamiaj AI lokalnie na swoim komputerze dzięki Ollama</span>
                </div>
                <p className="text-[#999] text-[11px]">
                  Ollama uruchamia wybrany model na tym urządzeniu. Zachowanie sieciowe zależy od konfiguracji dostawcy, pobierania modeli i pozostałych integracji.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOllamaConsentModal(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Zainstaluj Ollama...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            SECTION 2: RECENT WORKSPACES SHELF (SECTION 24)
        ========================================================================= */}
        {recentWorkspaces.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] font-semibold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Ostatnie Workspaces ({recentWorkspaces.length})</span>
              </h2>
              <span className="text-[10px] font-mono text-[#666]">Szybkie wznowienie 1-klikiem</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {recentWorkspaces.map((workspace) => (
                <div
                  key={workspace.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedPath(workspace.path);
                    setCustomPath(workspace.path);
                    inspectAndValidate(workspace.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPath(workspace.path);
                      setCustomPath(workspace.path);
                      inspectAndValidate(workspace.path);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between group relative ${
                    effectivePath === workspace.path
                      ? 'bg-purple-950/30 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                      : 'bg-[#151518] border-white/5 hover:bg-[#1c1c22] hover:border-purple-500/30'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-white truncate max-w-[180px]">
                        📁 {workspace.name}
                      </div>
                      <button
                        onClick={(e) => removeFromRecent(e, workspace.path)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-[#888] hover:text-rose-400 transition"
                        title="Usuń z listy"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[10px] font-mono text-[#777] truncate">
                      {workspace.path}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-white/5 text-[10px] font-mono">
                    <span className="text-purple-300">
                      {workspace.frameworks && workspace.frameworks.length > 0
                        ? workspace.frameworks.slice(0, 2).join(', ')
                        : 'Projekt'}
                    </span>
                    <span className="text-[#555] group-hover:text-purple-300 transition flex items-center gap-0.5">
                      <span>Wybierz</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            SECTION 2.5: SCAN SCOPE SELECTOR (SINGLE / WHOLE_PC / MULTI)
        ========================================================================= */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] font-semibold flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span>Zasięg Skanowania & Źródło Danych:</span>
            </h2>
            <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
              {scanScope === 'WHOLE_PC' ? '🖥️ Cały Komputer (Wszystkie Dyski)' : scanScope === 'MULTI' ? '🗂️ Wiele Folderów (Multi-Workspace)' : '📁 Pojedynczy Projekt'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setScanScope('SINGLE');
                setShowProLimitNotice(false);
              }}
              className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                scanScope === 'SINGLE'
                  ? 'bg-purple-950/40 border-purple-500/80 text-white shadow-lg ring-1 ring-purple-500/40'
                  : 'bg-[#151518] border-white/5 hover:bg-[#1a1a20] text-[#888] hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-lg ${scanScope === 'SINGLE' ? 'bg-purple-600/30 text-purple-300' : 'bg-white/5 text-[#777]'}`}>
                <FolderOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs truncate">Jeden Folder</div>
                <div className="text-[10px] text-[#666] truncate font-mono">Darmowy plan (Free)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setScanScope('WHOLE_PC');
                if (!isProLicensed) {
                  setShowProLimitNotice(true);
                }
              }}
              className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                scanScope === 'WHOLE_PC'
                  ? 'bg-amber-950/40 border-amber-500/80 text-white shadow-lg ring-1 ring-amber-500/40'
                  : 'bg-[#151518] border-white/5 hover:bg-[#1a1a20] text-[#888] hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-lg ${scanScope === 'WHOLE_PC' ? 'bg-amber-600/30 text-amber-300' : 'bg-white/5 text-[#777]'}`}>
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs truncate text-amber-300 flex items-center gap-1.5">
                  <span>Cały Komputer</span>
                  {!isProLicensed && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">PRO</span>}
                </div>
                <div className="text-[10px] text-[#777] truncate font-mono">Wszystkie dyski (C:, D:)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setScanScope('MULTI');
                if (!isProLicensed) {
                  setShowProLimitNotice(true);
                }
              }}
              className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                scanScope === 'MULTI'
                  ? 'bg-sky-950/40 border-sky-500/80 text-white shadow-lg ring-1 ring-sky-500/40'
                  : 'bg-[#151518] border-white/5 hover:bg-[#1a1a20] text-[#888] hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-lg ${scanScope === 'MULTI' ? 'bg-sky-600/30 text-sky-300' : 'bg-white/5 text-[#777]'}`}>
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs truncate text-sky-300 flex items-center gap-1.5">
                  <span>Wiele Folderów</span>
                  {!isProLicensed && <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-mono">PRO</span>}
                </div>
                <div className="text-[10px] text-[#777] truncate font-mono">Scal foldery w 1 bazę</div>
              </div>
            </button>
          </div>

          {/* Free/Pro Limit Banner when Whole PC or Multi is selected by Free user */}
          {(showProLimitNotice || (scanScope !== 'SINGLE' && !isProLicensed)) && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#1b1926] to-[#121218] border border-amber-500/50 shadow-xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
                    Limit Planu Free
                  </div>
                  <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed font-medium">
                    Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 pt-1 pl-11">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenProModal) onOpenProModal();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Wybierz Pro</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScanScope('SINGLE');
                    setShowProLimitNotice(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium text-xs flex items-center gap-2 cursor-pointer transition"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Ogranicz skanowanie do jednego folderu</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            MODE 1: SINGLE FOLDER (DEFAULT)
        ========================================================================= */}
        {scanScope === 'SINGLE' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] font-semibold flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                <span>Wybierz folder projektu z dysku:</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openTreeBrowser(effectivePath || systemInfo?.homeDir || 'C:\\')}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1a1a20] hover:bg-[#25252e] text-[#aaa] hover:text-white border border-white/10 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderTree className="w-3.5 h-3.5 text-purple-400" />
                  <span>Drzewo folderów</span>
                </button>

                <button
                  onClick={handlePickNativeFolder}
                  disabled={isBrowsing}
                  className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isBrowsing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Otwieranie okna dialogowego...</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Przeglądaj z dysku (Windows)...</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Interactive Drag & Drop Area */}
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all duration-200 text-center flex flex-col items-center justify-center gap-3 cursor-pointer ${
                isDraggingOver
                  ? 'bg-purple-950/40 border-purple-400 scale-[1.01] shadow-2xl shadow-purple-900/40'
                  : 'bg-[#121216] border-white/10 hover:border-purple-500/40 hover:bg-[#16161c]'
              }`}
              onClick={handlePickNativeFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePickNativeFolder();
                }
              }}
            >
              <div className={`p-4 rounded-2xl transition-transform ${isDraggingOver ? 'scale-110 bg-purple-600 text-white' : 'bg-purple-500/10 text-purple-400'}`}>
                <FolderDown className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">
                  {isDraggingOver ? 'Upuść folder projektu tutaj...' : 'Przeciągnij i upuść folder projektu tutaj'}
                </h3>
                <p className="text-xs text-[#777] font-mono max-w-md mx-auto">
                  Lub kliknij, aby otworzyć natywne okno wyboru folderu na dysku (Windows Explorer)
                </p>
              </div>
            </div>

            {/* Path Input with Instant Validation */}
            <div className="pt-1 space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder={systemInfo?.homeDir ? `Wklej dowolną ścieżkę (np. ${systemInfo.homeDir}\\Projekty)...` : 'Wpisz pełną ścieżkę do folderu...'}
                  value={customPath}
                  onChange={(e) => {
                    setCustomPath(e.target.value);
                    inspectAndValidate(e.target.value);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#16161a] border border-white/10 text-sm text-white placeholder-[#666] focus:outline-none focus:border-purple-500 transition font-mono pr-28 shadow-sm"
                />
                <button
                  onClick={handlePickNativeFolder}
                  className="absolute right-2 top-2 px-3 py-1.5 rounded-lg bg-[#25252e] hover:bg-[#30303a] text-xs font-mono text-[#ccc] hover:text-white transition flex items-center gap-1.5 cursor-pointer border border-white/5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                  <span>Przeglądaj</span>
                </button>
              </div>

              {/* Validation Feedback */}
              {pathValidation.status === 'valid' && (
                <div className="flex items-center justify-between gap-2 text-xs font-mono text-emerald-400 px-1 py-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      Folder: <b className="text-white">{pathValidation.path}</b>
                      {pathValidation.childCount !== undefined ? ` • ${pathValidation.childCount.toLocaleString('pl-PL')} elementów` : ' • Gotowy do załadowania'}
                    </span>
                  </div>
                  {pathValidation.childCount === undefined && (
                    <button
                      onClick={handlePickNativeFolder}
                      className="px-3 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-[11px] font-sans font-medium transition cursor-pointer flex items-center gap-1"
                    >
                      <span>Otwórz w przeglądarce →</span>
                    </button>
                  )}
                </div>
              )}
              {pathValidation.status === 'invalid' && (
                <div className="flex items-center justify-between gap-2 text-xs font-mono text-amber-400 px-1 py-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>Wybierz ten folder w oknie przeglądarki, aby załadować pliki.</span>
                  </div>
                  <button
                    onClick={handlePickNativeFolder}
                    className="px-2.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-white border border-amber-500/40 text-[11px] font-sans transition cursor-pointer"
                  >
                    Wybierz z dysku
                  </button>
                </div>
              )}
              {pathValidation.status === 'checking' && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-sky-400 px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Weryfikacja projektu...</span>
                </div>
              )}
            </div>

            {/* Smart Project Detection Card */}
            {projectInspection?.exists && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/30 via-[#161620] to-[#121216] border border-purple-500/40 shadow-xl space-y-3 animate-fadeIn mt-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-purple-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">Wykryto Projekt: {projectInspection.name}</h3>
                        {projectInspection.version && (
                          <span className="px-2 py-0.5 rounded bg-white/5 text-[#aaa] font-mono text-[10px] border border-white/10">
                            v{projectInspection.version}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#777] font-mono">Automatyczna inspekcja technologii, frameworków i Gita</p>
                    </div>
                  </div>

                  {projectInspection.git?.isRepo && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono text-xs">
                      <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                      <span>{projectInspection.git.branch}</span>
                      {projectInspection.git.isDirty && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Zmodyfikowane pliki" />
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs pt-1">
                  <div className="p-2.5 rounded-xl bg-[#101014] border border-white/5">
                    <div className="text-[#777] text-[10px] uppercase font-bold">Package Manager</div>
                    <div className="font-bold text-white mt-0.5 uppercase flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-purple-400" />
                      <span>{projectInspection.packageManager || 'Brak'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#101014] border border-white/5 sm:col-span-2">
                    <div className="text-[#777] text-[10px] uppercase font-bold">Wykryty Stack & Frameworki</div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {projectInspection.frameworks && projectInspection.frameworks.length > 0 ? (
                        projectInspection.frameworks.map(f => (
                          <span key={f} className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[11px] font-bold">
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-[#888]">Standardowy folder plików</span>
                      )}
                      {projectInspection.languages && projectInspection.languages.map(l => (
                        <span key={l} className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-200 border border-sky-500/30 text-[11px]">
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {projectInspection.entryPoints && projectInspection.entryPoints.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-[#888] pt-0.5">
                    <span>Główne punkty wejścia:</span>
                    {projectInspection.entryPoints.map(ep => (
                      <span key={ep} className="px-2 py-0.5 rounded bg-[#1c1c24] text-white border border-white/10 font-bold">
                        {ep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            MODE 2: WHOLE PC / ALL DRIVES
        ========================================================================= */}
        {scanScope === 'WHOLE_PC' && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-950/20 via-[#161620] to-[#121216] border border-amber-500/40 shadow-2xl space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <HardDrive className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base sm:text-lg flex items-center gap-2">
                    <span>Skanowanie Całego Komputera (Wszystkie Dyski)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      MULTI-DRIVE
                    </span>
                    {isProLicensed ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        NEXUS PRO (MAX 5000 GB)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                        WYMAGA PRO
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#888] font-mono mt-0.5">
                    {isProLicensed
                      ? 'Rozszerzone skanowanie komputera (maksymalny limit techniczny: 5000 GB / 5 TB). Pomija pliki jądra OS.'
                      : 'Indeksuje wszystkie partycje (C:\\, D:\\, E:\\) z pominięciem plików systemowych Windows.'}
                  </p>
                </div>
              </div>
            </div>

            {!isProLicensed && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-200 text-xs sm:text-sm">
                      Dostęp ograniczony — Wymagany Plan Pro
                    </div>
                    <div className="text-xs text-amber-100/90 leading-relaxed font-medium">
                      Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-1 pl-8">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenProModal) onOpenProModal();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Wybierz Pro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanScope('SINGLE');
                      setShowProLimitNotice(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Ogranicz skanowanie do jednego folderu</span>
                  </button>
                </div>
              </div>
            )}

            {/* Capability highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
              <div className="p-3 rounded-xl bg-[#101014] border border-white/5 space-y-1">
                <div className="text-amber-400 font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Wszystkie Dyski</span>
                </div>
                <div className="text-[11px] text-[#777]">
                  Wyszukuje pliki na C:\, D:\, dyskach zewnętrznych i sieciowych.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#101014] border border-white/5 space-y-1">
                <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Czysty Indeks</span>
                </div>
                <div className="text-[11px] text-[#777]">
                  Automatycznie ignoruje C:\Windows, WinSxS, Kosz i pliki tymczasowe.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#101014] border border-white/5 space-y-1">
                <div className="text-purple-400 font-bold flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Wspólny widok</span>
                </div>
                <div className="text-[11px] text-[#777]">
                  Wszystkie wybrane foldery są widoczne w jednym drzewie plików.
                </div>
              </div>
            </div>

            {/* Web browser advisory */}
            {typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs font-mono text-purple-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-white">Wskazówka przeglądarki internetowej:</div>
                  <div className="text-[11px] text-[#bbb] leading-relaxed">
                    Ze względów bezpieczeństwa przeglądarka Chromium zapyta o wskazanie katalogu. Wybierz <b>C:\Users</b> (folder użytkowników) lub główny katalog dysku, aby załadować wszystkie dokumenty, pobrane, pulpit i kod.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            MODE 3: MULTI-FOLDER WORKSPACE (MERGED)
        ========================================================================= */}
        {scanScope === 'MULTI' && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-sky-950/20 via-[#161620] to-[#121216] border border-sky-500/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="p-3.5 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
                  <Layers className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base sm:text-lg flex items-center gap-2">
                    <span>Multi-Workspace (Wiele Folderów Naraz)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                      {multiFolders.length || multiHandles.length} FOLDERÓW
                    </span>
                  </h3>
                  <p className="text-xs text-[#888] font-mono mt-0.5">
                    Dodaj dowolne foldery z różnych dysków, a Agent połączy je w jedno repozytorium.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddPresetMulti}
                  className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 border border-sky-500/30 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>Dodaj: Pulpit + Pobrane + Dokumenty</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddFolderToMulti}
                  className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj folder...</span>
                </button>
              </div>
            </div>

            {/* Folder list */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {(multiFolders.length === 0 && multiHandles.length === 0) ? (
                <div className="p-6 rounded-xl border border-dashed border-white/10 text-center text-[#666] font-mono text-xs">
                  Brak wybranych folderów. Kliknij <b>Dodaj folder...</b> lub skorzystaj z szybkiego pakietu powyżej.
                </div>
              ) : (
                <>
                  {multiFolders.map((fPath) => (
                    <div
                      key={fPath}
                      className="p-3 rounded-xl bg-[#141418] border border-white/5 flex items-center justify-between gap-3 text-xs font-mono group hover:border-sky-500/30 transition"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="text-white truncate font-bold">{fPath}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMultiFolder(fPath)}
                        className="p-1.5 rounded hover:bg-rose-500/20 text-[#666] hover:text-rose-400 transition"
                        title="Usuń ten folder z kolejki"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {multiHandles.map((h) => (
                    <div
                      key={h.name}
                      className="p-3 rounded-xl bg-[#141418] border border-white/5 flex items-center justify-between gap-3 text-xs font-mono group hover:border-sky-500/30 transition"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FolderOpen className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="text-white truncate font-bold">{h.name}</span>
                        <span className="text-[10px] text-purple-300 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/20">Chromium FSA</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMultiFolder(h.name)}
                        className="p-1.5 rounded hover:bg-rose-500/20 text-[#666] hover:text-rose-400 transition"
                        title="Usuń ten folder z kolejki"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            SECTION 5: SELECTIVE INGESTION MODE
        ========================================================================= */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] font-semibold flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Tryb Skanowania & Indeksowania:</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ingestionOptions.map(opt => {
              const isSelected = ingestionMode === opt.id;
              return (
                <div
                  key={opt.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setIngestionMode(opt.id as any)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIngestionMode(opt.id as any);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    isSelected 
                      ? 'bg-purple-950/30 border-purple-500/60 text-white shadow-md ring-1 ring-purple-500/30'
                      : 'bg-[#151518] border-white/5 hover:bg-[#1a1a20] text-[#aaa]'
                  }`}
                >
                  <span className="text-2xl shrink-0">{opt.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-white">{opt.title}</div>
                    <div className="text-[11px] text-[#777] truncate mt-0.5 font-mono">{opt.desc}</div>
                  </div>
                  {isSelected && (
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* =========================================================================
            SECTION 6: PRIMARY ACTION BUTTONS
        ========================================================================= */}
        <div className="pt-2 space-y-3">
          {scanScope === 'WHOLE_PC' ? (
            !isProLicensed ? (
              <div className="space-y-3 p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#1c1a29] to-[#121218] border border-amber-500/50 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-amber-200">
                      Skanowanie całego komputera wymaga planu Pro
                    </div>
                    <p className="text-xs text-amber-100/90 leading-relaxed font-medium">
                      Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenProModal) onOpenProModal();
                    }}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Wybierz Pro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanScope('SINGLE');
                      setShowProLimitNotice(false);
                    }}
                    className="w-full py-3.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Ogranicz skanowanie do jednego folderu</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLaunchWholePc}
                disabled={fsaLoading}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-base transition flex items-center justify-center gap-3 cursor-pointer shadow-xl shadow-amber-900/30 disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                {fsaLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-amber-200" />
                    <span>{fsaStatus || 'Skanowanie całego komputera...'}</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-5 h-5 text-amber-200 group-hover:scale-110 transition-transform" />
                    <span>⚡ Rozpocznij Skanowanie Całego Komputera (Maks. 5000 GB / 5 TB)</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            )
          ) : scanScope === 'MULTI' ? (
            !isProLicensed ? (
              <div className="space-y-3 p-5 rounded-2xl bg-gradient-to-r from-sky-950/40 via-[#1c1a29] to-[#121218] border border-sky-500/50 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-sky-200">
                      Multi-Workspace wymaga planu Pro
                    </div>
                    <p className="text-xs text-sky-100/90 leading-relaxed font-medium">
                      Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenProModal) onOpenProModal();
                    }}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Wybierz Pro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanScope('SINGLE');
                      setShowProLimitNotice(false);
                    }}
                    className="w-full py-3.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Ogranicz skanowanie do jednego folderu</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLaunchMultiWorkspace}
                disabled={fsaLoading || (multiFolders.length === 0 && multiHandles.length === 0)}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:from-sky-500 hover:to-indigo-500 text-white font-extrabold text-base transition flex items-center justify-center gap-3 cursor-pointer shadow-xl shadow-sky-900/30 disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                {fsaLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-sky-200" />
                    <span>{fsaStatus || 'Ładowanie folderów...'}</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5 text-sky-200 group-hover:scale-110 transition-transform" />
                    <span>🚀 Uruchom Multi-Workspace ({multiFolders.length || multiHandles.length} folderów)</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            )
          ) : (
            <button
              onClick={handleLaunchWorkspace}
              disabled={!effectivePath || pathValidation.status === 'invalid' || fsaLoading}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-base transition flex items-center justify-center gap-3 cursor-pointer shadow-xl shadow-purple-900/30 disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              {fsaLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-purple-200" />
                  <span>{fsaStatus || 'Wczytywanie projektu...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-purple-200 group-hover:scale-110 transition-transform" />
                  <span>Otwórz Workspace & Uruchom Agenta</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-[#787774] font-mono px-1 flex-wrap gap-2">
            <span>
              {scanScope === 'WHOLE_PC' ? (
                <>Wybrany zakres: <b className="text-amber-300">Cały Komputer (Wszystkie Dyski C:, D:, ...)</b></>
              ) : scanScope === 'MULTI' ? (
                <>Wybrany zakres: <b className="text-sky-300">Multi-Workspace ({multiFolders.length || multiHandles.length} katalogów)</b></>
              ) : (
                <>Wybrany projekt: <b className="text-slate-300">{effectivePath || 'Brak wyboru'}</b></>
              )}
            </span>
          </div>
        </div>

      </div>

      {/* =========================================================================
          EXPLICIT OLLAMA INSTALLATION CONSENT MODAL (SECTIONS 2, 3)
      ========================================================================= */}
      {showOllamaConsentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#18181c] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Server className="w-6 h-6 text-purple-400" />
              </span>
              <div>
                <h3 className="font-bold text-white text-base">Zgoda na pobranie silnika Lokalne AI</h3>
                <p className="text-xs text-[#888] font-mono">Model Ollama działa lokalnie; sprawdź konfigurację pozostałych integracji.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121216] border border-[#26262e] text-xs font-mono text-[#ccc] space-y-2 leading-relaxed">
              <p>
                <b className="text-white">Ollama</b> uruchamia wybrany model na Twoim urządzeniu, jeśli skonfigurowany endpoint wskazuje na lokalną usługę.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[#aaa]">
                <li>Żądania wysłane do lokalnego endpointu Ollama są przetwarzane przez tę usługę na Twoim urządzeniu.</li>
                <li>Pobieranie modeli wymaga połączenia z internetem; inne skonfigurowane integracje mogą wysyłać dane do usług zewnętrznych.</li>
                <li>Sprawdź ustawienia dostawcy i zakres kontekstu przed wysłaniem treści plików.</li>
              </ul>
            </div>

            {installResult?.message && (
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 text-xs font-mono text-purple-200 space-y-3">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Kroki do uruchomienia Lokalnego AI:</span>
                </div>
                <p className="text-[11px] text-[#ccc] leading-relaxed">
                  {installResult.message}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://ollama.com/download/windows"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition inline-flex items-center gap-1.5 shadow"
                  >
                    <span>Pobierz Ollama dla Windows</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="/nexus_installer.bat"
                    download
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition inline-flex items-center gap-1.5 border border-white/10"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Instalator Desktop (.bat)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => checkAiReadiness()}
                    className="px-3 py-1.5 rounded-lg bg-[#25252e] hover:bg-[#30303a] text-[#ccc] hover:text-white text-xs transition inline-flex items-center gap-1.5 cursor-pointer border border-white/5"
                  >
                    <RefreshCw className="w-3 h-3 text-purple-400" />
                    <span>Sprawdź status</span>
                  </button>
                </div>
              </div>
            )}

            {installResult?.error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs font-mono text-rose-300 space-y-1.5">
                <div className="font-bold">Informacja:</div>
                <div className="text-[11px]">{installResult.error}</div>
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
                Zamknij
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
                    <span>Sprawdzanie...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-200" />
                    <span>Konfiguruj Lokalne AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          IN-APP DIRECTORY BROWSER MODAL DRAWER
      ========================================================================= */}
      {isTreeBrowserOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 text-left">
          <div className="w-full max-w-2xl bg-[#1c1c20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#222228]">
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-sm">Przeglądarka Katalogów</h3>
              </div>
              <button 
                onClick={() => setIsTreeBrowserOpen(false)}
                className="p-1.5 rounded-lg text-[#999] hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Windows Drives Quick Bar */}
            {treeDrives.length > 0 && (
              <div className="p-2.5 bg-[#141418] border-b border-white/5 flex items-center gap-2 overflow-x-auto text-xs font-mono">
                <span className="text-[#666] text-[10px] uppercase font-bold px-1">Dyski:</span>
                {treeDrives.map(d => (
                  <button
                    key={d.path}
                    onClick={() => openTreeBrowser(d.path)}
                    className={`px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                      treeCurrentPath.startsWith(d.path)
                        ? 'bg-purple-600/30 border-purple-500/50 text-white font-bold'
                        : 'bg-[#1e1e24] border-white/10 text-[#aaa] hover:text-white hover:bg-[#282832]'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    <span>{d.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Access Shortcuts */}
            {treeQuickAccess.length > 0 && (
              <div className="p-2 bg-[#121216] border-b border-white/5 flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                <span className="text-[#666] text-[10px] uppercase font-bold px-1">Skróty:</span>
                {treeQuickAccess.map(qa => (
                  <button
                    key={qa.path}
                    onClick={() => openTreeBrowser(qa.path)}
                    className="px-2 py-0.5 rounded bg-[#1c1c22] hover:bg-[#2a2a34] text-[#aaa] hover:text-white border border-white/5 transition cursor-pointer flex items-center gap-1 text-[11px]"
                  >
                    <span>{getQuickAccessIcon(qa.icon)}</span>
                    <span>{qa.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Warning Alert if any */}
            {treeWarning && (
              <div className="p-2.5 bg-amber-950/30 border-b border-amber-500/30 text-amber-300 font-mono text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{treeWarning}</span>
              </div>
            )}

            {/* Current path bar & Up button */}
            <div className="p-3 bg-[#16161a] border-b border-white/5 flex items-center gap-2 font-mono text-xs flex-wrap sm:flex-nowrap">
              {treeParentPath && (
                <button
                  onClick={() => openTreeBrowser(treeParentPath)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#25252e] hover:bg-[#30303a] text-[#ccc] hover:text-white transition cursor-pointer flex items-center gap-1 shrink-0"
                  title="W górę katalogu"
                >
                  <span>⬆</span>
                  <span>W górę</span>
                </button>
              )}
              <div className="flex-1 flex items-center gap-1.5 bg-[#101014] border border-white/10 rounded-lg px-2.5 py-1.5 min-w-[200px]">
                <FolderOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <input
                  type="text"
                  value={treePathInput}
                  onChange={(e) => setTreePathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      openTreeBrowser(treePathInput);
                    }
                  }}
                  placeholder="Wpisz lub wklej ścieżkę folderu (np. C:\Users\...)"
                  className="bg-transparent border-none text-white text-xs font-mono w-full focus:outline-none"
                />
                <button
                  onClick={() => openTreeBrowser(treePathInput)}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#ccc] hover:text-white text-[11px] transition cursor-pointer shrink-0"
                >
                  Przejdź
                </button>
              </div>
              <button
                onClick={() => handleSelectTreeFolder(treeCurrentPath)}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition cursor-pointer shrink-0 shadow"
              >
                Wybierz ten folder
              </button>
            </div>

            {/* Folders List */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-white/5">
              {isTreeLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-xs text-[#888] gap-2 font-mono">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span>Wczytywanie folderów...</span>
                </div>
              ) : treeFolders.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#777] font-mono">
                  Brak podfolderów w tym katalogu.
                </div>
              ) : (
                treeFolders.map(f => (
                  <div
                    key={f.path}
                    role="button"
                    tabIndex={0}
                    className="py-2.5 px-3 rounded-lg hover:bg-white/5 flex items-center justify-between group cursor-pointer transition text-xs"
                    onClick={() => openTreeBrowser(f.path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openTreeBrowser(f.path);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2.5 truncate text-[#ddd] group-hover:text-white">
                      <span>📁</span>
                      <span className="font-medium truncate">{f.name}</span>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTreeFolder(f.path);
                        }}
                        className="px-2.5 py-1 rounded bg-purple-600/30 text-purple-300 hover:bg-purple-600 hover:text-white text-[11px] font-mono transition"
                      >
                        Wybierz
                      </button>
                      <ChevronRight className="w-4 h-4 text-[#888]" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[#18181c] border-t border-white/5 flex justify-between items-center text-xs text-[#888] font-mono">
              <span>Wykryto <b className="text-white">{treeFolders.length}</b> podkatalogów w bieżącej ścieżce</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(treeCurrentPath)}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  Kopiuj ścieżkę
                </button>
                <button
                  onClick={() => setIsTreeBrowserOpen(false)}
                  className="px-3 py-1 rounded bg-[#25252e] hover:bg-[#30303a] text-[#ccc] hover:text-white transition cursor-pointer"
                >
                  Zamknij
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
