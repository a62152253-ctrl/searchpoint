import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, 
  FolderSync, 
  ExternalLink, 
  Search, 
  ChevronRight, 
  Sparkles, 
  FileCode, 
  Image as ImageIcon, 
  Gamepad2, 
  Layers, 
  FileArchive, 
  Clock, 
  HardDrive, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Terminal, 
  Activity, 
  Archive, 
  Monitor,
  LayoutGrid,
  List,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  FolderInput,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Minimize2,
  Maximize2,
  Plus,
  Table as TableIcon,
  Calendar,
  CheckSquare,
  Square,
  Settings,
  FolderOpen,
  FileText,
  Crown,
  Bot,
  Menu,
  Zap,
  Cpu,
  BarChart3,
  PieChart,
  ArrowUpDown,
  Filter,
  Download,
  Music,
  Film,
  CheckCircle2,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { NexusOllamaChatDrawer } from './NexusOllamaChatDrawer';
import { FileItem, AutonomousBlueprint, ExplorerSubView } from '../types';
import { ExecutiveMissionControl } from './ExecutiveMissionControl';
import { TagMatrixFilter } from './TagMatrixFilter';
import { pickDirectoryWithFSA, pickFilesWithFSA } from '../utils/fileSystemAccessManager';
import { nexusApi } from '../utils/nexusAuth';
import { InlineGuidedSearchBar } from './InlineGuidedSearchBar';
import { NexusRightMetadataDrawer } from './NexusRightMetadataDrawer';
import { DesktopContextMenu } from './DesktopContextMenu';
import { QuickLookModal } from './QuickLookModal';
import { ToastContainer, ToastMessage } from './ToastNotification';
import { LazyThumbnail } from './LazyThumbnail';
import { PaginationControls } from './PaginationControls';
import { CreateItemModal } from './CreateItemModal';
import { AdvanceSettingsModal } from './AdvanceSettingsModal';
import { SmartShieldQuarantineModal } from './SmartShieldQuarantineModal';
import { GhostCleanerModal } from './GhostCleanerModal';
import { DeduplicatorModal } from './DeduplicatorModal';
import { NexusCodeStudioModal } from './NexusCodeStudioModal';
import { NexusImageStudioModal } from './NexusImageStudioModal';
import { OllamaSmartTaggingModal } from './OllamaSmartTaggingModal';
import { NexusProModal } from './NexusProModal';
import { 
  buildDynamicCategories, 
  buildSmartClusterCards, 
  DynamicCategory, 
  SmartClusterCard,
  isCsgo,
  isFortnite,
  isValorant,
  isMinecraft,
  isRoblox,
  isGamingGeneral,
  isInvoiceOrFinance,
  isWindowsScreenshot,
  isWallpaperOrArt,
  isUiOrIcon,
  detectGame,
  detectDevLanguage,
  detectArchetype,
  extractYear
} from '../utils/dynamicCategorizer';

interface NexusDashboardHubProps {
  items: FileItem[];
  targetPath: string;
  blueprint: AutonomousBlueprint | null;
  onOpenWorkspace: (workspaceId: string) => void;
  onOpenInExplorer: (path: string) => void;
  onOpenGuidedSearch?: () => void;
  onExecutePlan?: (planId: string, isDryRun: boolean) => Promise<any>;
  shieldReport?: {
    totalLoaded: number;
    rejectedNsfw: number;
    rejectedMalware: number;
  } | null;
  onItemCreated?: (item: FileItem) => void;
  onItemDeleted?: (path: string) => void;
  onChangeTargetFolder?: () => void;
  onFsaLoaded?: (dirName: string, items: FileItem[]) => void;
  onNavigateToView?: (view: ExplorerSubView) => void;
  onGoToWebsite?: () => void;
  isProLicensed?: boolean;
  onOpenProModal?: () => void;
}

interface DashboardActionResponse {
  status?: string;
  success?: boolean;
  error?: string;
  message?: string;
  item?: FileItem;
  sha256?: string;
  discordSnippet?: string;
}

const postDashboardAction = async (endpoint: string, body?: any, signal?: AbortSignal): Promise<DashboardActionResponse> => {
  const data = await nexusApi.post<DashboardActionResponse>(endpoint, body, { signal });
  if (!data || data.success === false || data.status === 'error' || data.error) {
    throw new Error(data?.error || data?.message || 'Request failed.');
  }
  return data;
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isBrowserBackedFile = (file: FileItem) => Boolean(file.fileHandle) || file.path.startsWith('[FSA]/');

export const NexusDashboardHub: React.FC<NexusDashboardHubProps> = ({
  items,
  targetPath,
  blueprint,
  onOpenWorkspace,
  onOpenInExplorer,
  onOpenGuidedSearch,
  onExecutePlan,
  shieldReport,
  onItemCreated,
  onItemDeleted,
  onChangeTargetFolder,
  onFsaLoaded,
  onNavigateToView,
  onGoToWebsite,
  isProLicensed: propIsProLicensed,
  onOpenProModal: propOnOpenProModal
}) => {
  // Selected file & inspection state
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Collapsible HUD State (Alt + Space or 1-Click)
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);

  // User AI (Ollama / Local Agent) System State (Requirement 5)
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [isOllamaChatOpen, setIsOllamaChatOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    nexusApi.get<any>('/api/ai/status', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted && data) setAiStatus(data);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.warn('[Nexus] Nie udało się pobrać statusu AI:', error);
        setAiStatus({ success: false, ollama: { running: false, status: 'UNAVAILABLE' } });
      });

    // Check lifetime Pro license status
    nexusApi.get<{ isPro?: boolean }>('/api/license/status', { signal: controller.signal })
      .then(lic => {
        if (!controller.signal.aborted && lic && lic.isPro) {
          setLocalIsProLicensed(true);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  // Fast Actions Pinned files
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_pinned_ids');
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState(false);
  const [isGhostCleanerOpen, setIsGhostCleanerOpen] = useState(false);
  const [isDeduplicatorOpen, setIsDeduplicatorOpen] = useState(false);
  const [isSmartTaggingModalOpen, setIsSmartTaggingModalOpen] = useState(false);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [localIsProLicensed, setLocalIsProLicensed] = useState(false);
  const isProLicensed = propIsProLicensed !== undefined ? propIsProLicensed : localIsProLicensed;
  const openProModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (propOnOpenProModal) {
      propOnOpenProModal();
    } else {
      setIsProModalOpen(true);
    }
  };
  const [codeStudioItem, setCodeStudioItem] = useState<FileItem | null>(null);
  const [imageStudioItem, setImageStudioItem] = useState<FileItem | null>(null);

  // Search & Filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeLanguageFilter, setActiveLanguageFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID' | 'TABLE' | 'YEARS' | 'KANBAN'>('LIST');
  const [gridZoom, setGridZoom] = useState<'SM' | 'MD' | 'LG'>('MD');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size' | 'ext'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [quickFormatFilter, setQuickFormatFilter] = useState<'ALL' | 'MEDIA' | 'CODE' | 'ARCHIVE' | 'DOCS' | 'LARGE'>('ALL');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string | null>(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // Inline Guided Search 5-Question Akinator State
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [guidedHistory, setGuidedHistory] = useState<{ id: string; label: string; count: number }[]>([]);
  const [guidedData, setGuidedData] = useState<{
    totalIndexed: number;
    initialCount: number;
    totalMatches: number;
    domain?: string;
    isFinished: boolean;
    nextQuestion: any;
    items: FileItem[];
  } | null>(null);

  // Bounded Window Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Desktop Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    item: FileItem;
    position: { x: number; y: number };
  } | null>(null);

  // QuickLook Lightbox State
  const [quickLookItem, setQuickLookItem] = useState<FileItem | null>(null);

  // Toast Notifications State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'info' | 'warning', title: string, description?: string) => {
    const id = `toast-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
    setToasts(prev => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Modern File System Access API (showDirectoryPicker / showOpenFilePicker)
  const handleOpenFolderFSA = async () => {
    try {
      const res = await pickDirectoryWithFSA();
      if (res.success) {
        if (onFsaLoaded) {
          onFsaLoaded(`[Chromium]: ${res.dirName}`, res.items);
        }
        addToast(
          res.items.length > 0 ? 'success' : 'info',
          res.items.length > 0 ? '📂 Załadowano folder przez File System Access API' : 'Folder nie zawiera plików',
          `${res.items.length} plików z folderu ${res.dirName}`
        );
      } else if (res.error && res.error !== 'Anulowano wybór folderu.') {
        addToast('warning', 'File System Access API', res.error);
      }
    } catch (e: any) {
      addToast('warning', 'Błąd File System Access API', e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenFilesFSA = async () => {
    try {
      const res = await pickFilesWithFSA();
      if (res.success) {
        if (onFsaLoaded) {
          onFsaLoaded(`[Wybrane Pliki]: (${res.items.length} plików)`, res.items);
        }
        addToast(
          res.items.length > 0 ? 'success' : 'info',
          res.items.length > 0 ? '📄 Załadowano pliki przez File System Access API' : 'Nie wybrano żadnych plików',
          `Wczytano ${res.items.length} plików`
        );
      } else if (res.error && res.error !== 'Anulowano wybór plików.') {
        addToast('warning', 'File System Access API', res.error);
      }
    } catch (e: any) {
      addToast('warning', 'Błąd File System Access API', e instanceof Error ? e.message : String(e));
    }
  };

  // 1. Debounced search filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchFilter);
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  // 2. Fetch Guided Search Step when query or answers change
  useEffect(() => {
    const controller = new AbortController();
    nexusApi.post<any>('/api/guided-search', { 
      query: debouncedSearch, 
      answers: guidedAnswers,
      tags: activeTags,
      language: activeLanguageFilter,
      page,
      limit 
    }, { signal: controller.signal })
      .then(d => {
        if (controller.signal.aborted || !d) return;
        setGuidedData(d);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn('[Nexus] Guided search request failed:', error);
        }
      });
    return () => controller.abort();
  }, [debouncedSearch, guidedAnswers, activeTags, activeLanguageFilter, page, limit, items.length, targetPath]);

  useEffect(() => {
    const availableIds = new Set(items.map(item => item.id));
    setSelectedBatchIds(current => {
      const next = current.filter(id => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [items]);

  // Alt + Space to toggle Collapsible HUD, Ctrl + J to toggle Ollama Chat
  useEffect(() => {
    const handleKeyShortcuts = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]')) {
        return;
      }
      if (e.altKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        setIsHudCollapsed(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsOllamaChatOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyShortcuts);
    return () => window.removeEventListener('keydown', handleKeyShortcuts);
  }, []);

  // Smart Shield Report Toast on Complete
  useEffect(() => {
    if (shieldReport) {
      addToast(
        'info',
        '🛡️ Analiza z Tarczą OCR zakończona',
        `Załadowano ${shieldReport.totalLoaded.toLocaleString('pl-PL')} plików. Zablokowano: ${shieldReport.rejectedNsfw} elementów NSFW oraz ${shieldReport.rejectedMalware} podejrzanych skryptów (Hack/Exploit).`
      );
    }
  }, [shieldReport]);

  // Dynamic categories and top smart clusters derived from user's actual files
  const dynamicCategories = useMemo<DynamicCategory[]>(() => {
    return buildDynamicCategories(items);
  }, [items]);

  const smartClusterCards = useMemo<SmartClusterCard[]>(() => {
    return buildSmartClusterCards(items);
  }, [items]);

  const formatFileSize = (bytes: number = 0) => {
    if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const dashboardStats = useMemo(() => {
    let totalBytes = 0;
    let screenshotCount = 0;
    let pinnedCount = 0;
    let mediaCount = 0;
    let codeCount = 0;
    let archiveCount = 0;
    let docsCount = 0;
    let largeCount = 0;

    const structureCounts: Record<string, number> = {
      nexus_work: 0,
      nexus_projects: 0,
      nexus_school: 0,
      nexus_images: 0,
      screenshots: 0,
      nexus_docs: 0,
      nexus_unorganized: 0,
      nexus_recent: 0,
      nexus_unclassified: 0,
    };

    const pinnedSet = new Set(pinnedIds);
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

    for (const item of items) {
      const sz = Number(item.size) || 0;
      totalBytes += sz;
      if (item.category === 'SCREENSHOT') screenshotCount++;
      if (pinnedSet.has(item.id)) pinnedCount++;
      if (sz >= 10 * 1024 * 1024) largeCount++;

      const ext = (item.extension || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'mp4', 'mkv', 'webm'].includes(ext)) mediaCount++;
      else if (['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'html', 'css', 'sql'].includes(ext)) codeCount++;
      else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) archiveCount++;
      else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'md'].includes(ext)) docsCount++;

      const combinedStr = `${item.name} ${item.path}`;
      if (/faktura|invoice|vat|rachunek|umowa|work|praca|raport|biznes/i.test(combinedStr) || ['xlsx', 'xls', 'docx', 'doc', 'pdf'].includes(ext)) {
        structureCounts.nexus_work++;
      }
      if (item.category === 'DEV' || ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'sql'].includes(ext)) {
        structureCounts.nexus_projects++;
      }
      if (/szkola|szkoła|studia|uczelnia|lekcja|zadanie|wyklad|wykład|school|study|exam/i.test(combinedStr)) {
        structureCounts.nexus_school++;
      }
      if (item.category === 'MEDIA' && !/screenshot|zrzut/i.test(item.name)) {
        structureCounts.nexus_images++;
      }
      if (item.category === 'SCREENSHOT' || /screenshot|snip|zrzut/i.test(item.name)) {
        structureCounts.screenshots++;
      }
      if (item.category === 'DOCS') {
        structureCounts.nexus_docs++;
      }
      if (item.category === 'APPS' || /setup|install|\(\d+\)|temp/i.test(item.name)) {
        structureCounts.nexus_unorganized++;
      }
      if (item.mtime && item.mtime > sevenDaysAgo) {
        structureCounts.nexus_recent++;
      }
      if (!item.category || item.category === 'OTHER') {
        structureCounts.nexus_unclassified++;
      }
    }

    const sizeLabel = totalBytes >= 1024 ** 3
      ? `${(totalBytes / (1024 ** 3)).toFixed(2)} GB`
      : `${(totalBytes / (1024 ** 2)).toFixed(1)} MB`;

    return { 
      totalBytes, 
      screenshotCount, 
      pinnedCount, 
      sizeLabel,
      mediaCount,
      codeCount,
      archiveCount,
      docsCount,
      largeCount,
      structureCounts
    };
  }, [items, pinnedIds]);

  const targetFolderName = targetPath.split(/[\\/]/).filter(Boolean).pop() || 'Downloads';
  const isBrowserBackedRoot = targetPath.startsWith('[Chromium]:') || targetPath.startsWith('[Wybrane Pliki]');
  const isBrowserBackedWorkspace = useMemo(
    () => isBrowserBackedRoot || items.some(isBrowserBackedFile),
    [isBrowserBackedRoot, items]
  );
  const isLocalAiOnline = aiStatus?.ollama?.running === true;

  const findBrowserBackedFile = (filePath: string) =>
    items.find(item => item.path === filePath && isBrowserBackedFile(item));

  const handleOpenInExplorer = (filePath: string) => {
    if (findBrowserBackedFile(filePath) || (filePath === targetPath && isBrowserBackedWorkspace)) {
      addToast('info', 'Ścieżka przeglądarkowa', 'Pliki wybrane przez przeglądarkę nie mają ścieżki systemowej do otwarcia w Eksploratorze.');
      return;
    }
    onOpenInExplorer(filePath);
  };

  // Safely extract a real model name from the reported Ollama status.
  const activeModelName = useMemo(() => {
    const raw = aiStatus?.ollama?.models?.[0];
    if (!raw) return 'Brak modelu';
    if (typeof raw === 'string') return raw;
    return raw.name || raw.model || 'Brak modelu';
  }, [aiStatus]);

  // Filtered files pool combining search, tags, dynamic category filter, and guided search
  const displayedFiles = useMemo(() => {
    let list = items;

    // Filter out system clutter files (desktop.ini, thumbs.db, etc.) unless explicitly searched
    if (!debouncedSearch.toLowerCase().includes('.ini') && !debouncedSearch.toLowerCase().includes('desktop')) {
      list = list.filter(i => !/^(desktop\.ini|thumbs\.db|\.ds_store|ntuser\.dat)$/i.test(i.name));
    }

    // Apply dynamic category filter if clicked
    if (activeLanguageFilter) {
      const cat = dynamicCategories.find(c => c.id === activeLanguageFilter);
      if (cat) {
        list = list.filter(cat.filter);
      } else {
        // Fallback and Intelligent Organization Structure checks (Sections 7 & 8)
        if (activeLanguageFilter === 'nexus_work') {
          list = list.filter(i => /faktura|invoice|vat|rachunek|umowa|work|praca|raport|biznes/i.test(`${i.name} ${i.path}`) || ['xlsx', 'xls', 'docx', 'doc', 'pdf'].includes((i.extension || '').toLowerCase()));
        } else if (activeLanguageFilter === 'nexus_projects') {
          list = list.filter(i => i.category === 'DEV' || ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'sql'].includes((i.extension || '').toLowerCase()));
        } else if (activeLanguageFilter === 'nexus_school') {
          list = list.filter(i => /szkola|szkoła|studia|uczelnia|lekcja|zadanie|wyklad|wykład|school|study|exam/i.test(`${i.name} ${i.path}`));
        } else if (activeLanguageFilter === 'nexus_images') {
          list = list.filter(i => i.category === 'MEDIA' && !/screenshot|zrzut/i.test(i.name));
        } else if (activeLanguageFilter === 'nexus_docs') {
          list = list.filter(i => i.category === 'DOCS');
        } else if (activeLanguageFilter === 'nexus_unorganized') {
          list = list.filter(i => i.category === 'APPS' || /setup|install|\(\d+\)|temp/i.test(i.name));
        } else if (activeLanguageFilter === 'nexus_recent') {
          const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
          list = list.filter(i => i.mtime && i.mtime > sevenDaysAgo);
        } else if (activeLanguageFilter === 'nexus_unclassified') {
          list = list.filter(i => !i.category || i.category === 'OTHER');
        } else if (activeLanguageFilter === 'pinned') {
          list = list.filter(i => pinnedIds.includes(i.id));
        } else if (activeLanguageFilter === 'js') list = list.filter(i => ['js', 'jsx', 'cjs', 'mjs'].includes((i.extension || '').toLowerCase()));
        else if (activeLanguageFilter === 'tsx') list = list.filter(i => ['tsx', 'ts'].includes((i.extension || '').toLowerCase()));
        else if (activeLanguageFilter === 'zip') list = list.filter(i => ['zip', 'rar', '7z'].includes((i.extension || '').toLowerCase()));
        else if (activeLanguageFilter === 'screenshots') list = list.filter(i => i.category === 'SCREENSHOT' || /screenshot|snip|zrzut/i.test(i.name));
      }
    }

    // Apply active tag filters with resilient fuzzy matching
    if (activeTags.length > 0) {
      list = list.filter(i => {
        const itemTags = (i.tags || []).map(t => t.toLowerCase());
        const n = i.name.toLowerCase();
        const p = (i.path || '').toLowerCase();
        const cat = (i.category || '').toLowerCase();
        return activeTags.every(t => {
          const rawTag = t.toLowerCase();
          const clean = rawTag.replace('#', '');
          if (itemTags.includes(rawTag) || itemTags.includes(`#${clean}`)) return true;
          if (n.includes(clean) || p.includes(clean)) return true;

          // Universal 50+ Game match
          const g = detectGame(i);
          if (g && (g.id === clean || g.tags.some(gt => gt.toLowerCase().includes(clean)))) return true;

          // Universal 50+ Dev Language match
          const l = detectDevLanguage(i);
          if (l && (l.id === clean || l.shortTag.toLowerCase() === clean)) return true;

          // Universal 500+ Archetype match
          const arch = detectArchetype(i.extension);
          if (arch && arch.domain.toLowerCase().replace(/[^a-z0-9]/g, '_').includes(clean)) return true;

          if ((clean === 'faktura' || clean === 'finanse' || clean === 'invoice') && isInvoiceOrFinance(i)) return true;
          if ((clean === 'gameplay' || clean === 'gaming') && isGamingGeneral(i)) return true;
          if (clean === 'screenshot' && (cat === 'screenshot' || isWindowsScreenshot(i))) return true;
          if (clean === 'snip' && (isWindowsScreenshot(i) || cat === 'screenshot')) return true;
          if (clean === 'wallpaper' && isWallpaperOrArt(i)) return true;
          if (clean === 'ui' && isUiOrIcon(i)) return true;
          if (clean === 'windows' && (p.includes('c:') || p.includes('downloads') || p.includes('desktop') || p.includes('pictures'))) return true;
          if (clean === 'ephemeral' && (/contact-sheet|sheet|temp|cache/i.test(n))) return true;
          if (clean === 'anime' && (/anime|manga|waifu|girl|art|genshin/i.test(n))) return true;
          return false;
        });
      });
    }

    // Apply high-precision text and format search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      
      // Tokenize by commas, spaces, semicolons: "zip, rar" -> ["zip", "rar"]
      const rawTokens = q
        .split(/[,;\s]+/)
        .map(t => t.trim().replace(/^[*.]/, ''))
        .filter(Boolean);

      if (rawTokens.length > 0) {
        const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'zst', 'cab', 'pkg']);
        const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico']);
        const CODE_EXTS = new Set(['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'htm', 'css', 'scss', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'sql', 'sh', 'bat', 'cmd', 'ps1']);
        const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv']);

        // Check if user is searching for extensions/formats (e.g. "zip, rar" or "png, jpg" or "zip")
        const isCommaSeparated = q.includes(',');
        const isPureFormatQuery = rawTokens.every(t => 
          ARCHIVE_EXTS.has(t) || IMAGE_EXTS.has(t) || CODE_EXTS.has(t) || DOC_EXTS.has(t)
        );

        // Precompile short token boundary regexes once outside the 45k filter loop
        const boundaryRegexMap = new Map<string, RegExp>();
        for (const token of rawTokens) {
          if (token.length <= 4) {
            boundaryRegexMap.set(
              token,
              new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i')
            );
          }
        }

        list = list.filter(item => {
          const ext = (item.extension || '').toLowerCase().replace('.', '');
          const name = item.name.toLowerCase();
          const tags = (item.tags || []).map(t => t.toLowerCase().replace(/^#/, ''));
          const cat = (item.category || '').toLowerCase();

          // 1. If user typed format list (e.g. "zip, rar" or "zip"):
          // It MUST match actual file extension or archive/format type!
          if (isPureFormatQuery) {
            return rawTokens.some(token => {
              if (token === 'zip' || token === 'rar' || token === '7z' || token === 'tar') {
                return ext === token || (token === 'zip' && ext === 'zip') || (token === 'rar' && ext === 'rar');
              }
              return ext === token;
            });
          }

          // 2. Individual token matcher with strict word-boundary protection
          const testToken = (token: string): boolean => {
            // A. Exact extension match (e.g. "png", "zip", "ts")
            if (ext === token) return true;

            // B. Exact tag match or tag prefix (e.g. "gaming", "csgo", "screenshot")
            if (tags.some(t => t === token || t === `tag_${token}`)) return true;

            // C. Category match (e.g. "archive", "code", "screenshot", "dev", "media")
            if (cat === token || (token === 'archive' && cat === 'archives') || (token === 'code' && cat === 'dev')) {
              return true;
            }

            // D. Short tokens (<= 4 chars like "rar", "zip", "cs", "tar", "png"):
            // Uses precompiled word-boundary regex so "rar" NEVER matches inside words like "library"!
            if (token.length <= 4) {
              const boundaryRegex = boundaryRegexMap.get(token);
              return boundaryRegex ? boundaryRegex.test(name) : false;
            }

            // E. Longer words: normal substring in file name
            return name.includes(token);
          };

          // If comma-separated, treat as OR; if space-separated, treat as AND
          return isCommaSeparated
            ? rawTokens.some(t => testToken(t))
            : rawTokens.every(t => testToken(t));
        });
      }
    }

    // Apply progressive guided answers (Instant zero-lag client filter for the 5 questions)
    for (const [key, val] of Object.entries(guidedAnswers)) {
      if (!val || val === 'any') continue;
      if (key === 'domain_scope') {
        list = list.filter(i => {
          const ext = (i.extension || '').toLowerCase();
          if (val === 'code') return ['tsx', 'ts', 'jsx', 'js', 'cjs', 'mjs', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'html', 'css', 'scss', 'sql', 'sh', 'bat', 'cmd', 'ps1', 'yml', 'yaml'].includes(ext);
          if (val === 'image') return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'mp4', 'webm', 'mov'].includes(ext);
          if (val === 'docs') return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'rtf'].includes(ext);
          if (val === 'archive') return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext);
          return true;
        });
      } else if (key === 'format') {
        list = list.filter(i => {
          const ext = (i.extension || '').toLowerCase();
          if (val === 'png') return ext === 'png';
          if (val === 'jpg') return ['jpg', 'jpeg'].includes(ext);
          if (val === 'gif') return ext === 'gif';
          if (val === 'webp') return ['webp', 'svg'].includes(ext);
          if (val === 'ts') return ['ts', 'tsx'].includes(ext);
          if (val === 'js') return ['js', 'jsx', 'cjs', 'mjs'].includes(ext);
          if (val === 'py') return ext === 'py';
          if (val === 'rs') return ['rs', 'go', 'cpp', 'c', 'cs'].includes(ext);
          if (val === 'web') return ['html', 'css', 'scss', 'json', 'yml', 'yaml', 'sql'].includes(ext);
          if (val === 'code_all') return ['tsx', 'ts', 'jsx', 'js', 'cjs', 'mjs', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'html', 'css', 'scss', 'sql', 'sh', 'bat', 'cmd', 'ps1', 'yml', 'yaml'].includes(ext);
          if (val === 'pdf') return ext === 'pdf';
          if (val === 'docx') return ['doc', 'docx', 'rtf', 'odt'].includes(ext);
          if (val === 'md') return ['md', 'txt', 'csv', 'xlsx', 'xls'].includes(ext);
          if (val === 'zip') return ext === 'zip';
          if (val === 'rar') return ['rar', '7z', 'tar', 'gz'].includes(ext);
          return ext === val;
        });
      } else if (key === 'orientation') {
        list = list.filter(i => {
          const n = i.name.toLowerCase();
          if (val === 'vertical') return /portrait|phone|mobile|girl|waifu|vertical/i.test(n);
          if (val === 'horizontal') return /wallpaper|desktop|1920x1080|horizontal|landscape|screen|snip|zrzut/i.test(n);
          if (val === 'square') return /icon|avatar|pfp|square|logo/i.test(n);
          return true;
        });
      } else if (key === 'color') {
        list = list.filter(i => i.name.toLowerCase().includes(val) || (i.tags || []).some(t => t.toLowerCase().includes(val)));
      } else if (key === 'character') {
        if (val === 'character') list = list.filter(i => /girl|waifu|character|oc|postac|genshin/i.test(i.name));
        else if (val === 'background') list = list.filter(i => /wallpaper|background|tlo|landscape/i.test(i.name));
        else if (val === 'sketch') list = list.filter(i => /sketch|szkic|wip|draft/i.test(i.name));
      } else if (key === 'year') {
        list = list.filter(i => i.name.includes(val) || (i.mtime && new Date(i.mtime).getFullYear().toString() === val));
      } else if (key === 'location') {
        list = list.filter(i => {
          const p = (i.path || '').toLowerCase();
          if (val === 'downloads') return p.includes('downloads') || p.includes('pobrane');
          if (val === 'desktop') return p.includes('desktop') || p.includes('pulpit');
          if (val === 'pictures') return p.includes('pictures') || p.includes('obrazy');
          if (val === 'projects') return p.includes('project') || p.includes('code') || p.includes('src') || p.includes('repo');
          return p.includes(val.toLowerCase());
        });
      } else if (key === 'code_domain') {
        list = list.filter(i => {
          const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          const str = `${i.name} ${safePath}`.toLowerCase();
          if (val === 'auth') return /auth|login|recovery|session|token|passwd|haslo|\buser\b|security|shield|vault/i.test(str);
          if (val === 'api') return /api|route|controller|handler|endpoint|server|fetch|socket|ws/i.test(str);
          if (val === 'ui') return /component|view|modal|page|drawer|button|\bui\b|dashboard|hub|website|css|style/i.test(str);
          if (val === 'db') return /db|database|sql|model|schema|prisma|postgres|data_store|store|cache|index|scanner/i.test(str);
          return true;
        });
      } else if (key === 'code_type') {
        list = list.filter(i => {
          const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          const str = `${i.name} ${safePath}`.toLowerCase();
          if (val === 'source') return !str.includes('test') && !str.includes('.d.ts') && !str.includes('config');
          if (val === 'test') return str.includes('test') || str.includes('spec');
          if (val === 'types') return str.includes('types') || str.includes('.d.ts');
          if (val === 'config') return /config|rc|json|yaml|webpack|vite|package|tsconfig/i.test(str);
          return true;
        });
      } else if (key === 'doc_type') {
        list = list.filter(i => {
          const str = `${i.name} ${i.path}`.toLowerCase();
          if (val === 'invoice') return /faktura|invoice|vat|rachunek|paragon/i.test(str);
          if (val === 'contract') return /umowa|contract|agreement|regulamin|wniosek/i.test(str);
          if (val === 'notes') return /notatk|notes|memo|draft|todo|plan/i.test(str);
          if (val === 'spec') return /spec|readme|manual|dokument|raport|doc/i.test(str);
          return true;
        });
      } else if (key === 'size_tier') {
        list = list.filter(i => {
          const sz = i.size || 0;
          if (val === 'small') return sz < 100 * 1024; // < 100 KB
          if (val === 'medium') return sz >= 100 * 1024 && sz < 5 * 1024 * 1024; // 100 KB - 5 MB
          if (val === 'large') return sz >= 5 * 1024 * 1024; // >= 5 MB
          return true;
        });
      }
    }

    // Quick format preset filter
    if (quickFormatFilter !== 'ALL') {
      if (quickFormatFilter === 'MEDIA') {
        list = list.filter(i => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'mp4', 'mkv', 'webm', 'mov'].includes((i.extension || '').toLowerCase()));
      } else if (quickFormatFilter === 'CODE') {
        list = list.filter(i => ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'html', 'css', 'sql', 'sh', 'bat', 'cmd', 'ps1'].includes((i.extension || '').toLowerCase()));
      } else if (quickFormatFilter === 'ARCHIVE') {
        list = list.filter(i => ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes((i.extension || '').toLowerCase()));
      } else if (quickFormatFilter === 'DOCS') {
        list = list.filter(i => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes((i.extension || '').toLowerCase()));
      } else if (quickFormatFilter === 'LARGE') {
        list = list.filter(i => (i.size || 0) >= 10 * 1024 * 1024); // >= 10 MB
      }
    }

    // Dynamic Multi-Criteria Sorting
    const sorted = [...list].sort((a, b) => {
      // Pinned items always take precedence
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      } else if (sortBy === 'ext') {
        comparison = (a.extension || '').localeCompare(b.extension || '');
      } else {
        // Date sort
        const timeA = typeof a.mtime === 'number' ? a.mtime : a.mtime ? new Date(a.mtime).getTime() : 0;
        const timeB = typeof b.mtime === 'number' ? b.mtime : b.mtime ? new Date(b.mtime).getTime() : 0;
        comparison = timeA - timeB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [items, activeLanguageFilter, activeTags, debouncedSearch, guidedAnswers, pinnedIds, selectedYearFilter, quickFormatFilter, sortBy, sortOrder]);

  // Keep selection, pagination and batch selection valid as scan results change.
  useEffect(() => {
    setSelectedItem(current => {
      if (current) {
        const refreshed = displayedFiles.find(item => item.id === current.id);
        if (refreshed) return refreshed;
      }
      return displayedFiles[0] ?? null;
    });
  }, [displayedFiles]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(displayedFiles.length / limit));
    setPage(current => Math.min(current, lastPage));
  }, [displayedFiles.length, limit]);

  // Group all items by year (ExtractYear: 2026, 2025, 2024, 2023, 2022, etc.)
  const yearClusters = useMemo(() => {
    const yearsMap: Record<string, { count: number; bytes: number; sample: FileItem[] }> = {};
    for (const file of items) {
      const yr = extractYear(file.name, file.mtime);
      if (!yearsMap[yr]) {
        yearsMap[yr] = { count: 0, bytes: 0, sample: [] };
      }
      yearsMap[yr].count++;
      yearsMap[yr].bytes += (file.size || 0);
      if (yearsMap[yr].sample.length < 5) {
        yearsMap[yr].sample.push(file);
      }
    }
    return Object.entries(yearsMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, data]) => ({
        year,
        count: data.count,
        bytes: data.bytes,
        weightLabel: data.bytes > 1024 * 1024 * 1024
          ? `${(data.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
          : `${(data.bytes / (1024 * 1024)).toFixed(1)} MB`,
        sample: data.sample
      }));
  }, [items]);

  // Multi-selection Batch Action Handlers
  const handleToggleBatch = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBatchIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAllVisible = () => {
    const visibleIds = pagedFiles.map(f => f.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedBatchIds.includes(id));
    if (allSelected) {
      setSelectedBatchIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedBatchIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBatchPin = () => {
    const next = Array.from(new Set([...pinnedIds, ...selectedBatchIds]));
    setPinnedIds(next);
    let persisted = true;
    try {
      localStorage.setItem('nexus_pinned_ids', JSON.stringify(next));
    } catch (error) {
      persisted = false;
      console.warn('[Nexus] Could not persist pinned files:', error);
    }
    addToast(
      persisted ? 'success' : 'warning',
      persisted ? `⭐ Przypięto ${selectedBatchIds.length} plików` : 'Nie zapisano przypiętych plików',
      persisted ? 'Zapisano na tym urządzeniu.' : 'Zmiana obowiązuje tylko do zamknięcia tej sesji.'
    );
    setSelectedBatchIds([]);
  };

  const handleBatchMoveToProject = async () => {
    if (!isProLicensed) {
      openProModal();
      addToast('info', '🔒 Masowe przenoszenie plików jest w Nexus PRO', 'Wersja Free ma tryb tylko do podglądu. Odblokuj PRO dla pełnej organizacji projektów.');
      return;
    }
    const targetDir = `${targetPath}\\Organized_Workspace`;
    const filesToMove = items.filter(i => selectedBatchIds.includes(i.id));
    let movedCount = 0;
    let failedCount = 0;
    let firstError = '';
    const failedIds: string[] = [];
    for (const file of filesToMove) {
      if (isBrowserBackedFile(file)) {
        failedCount++;
        failedIds.push(file.id);
        if (!firstError) firstError = 'Pliki wybrane w przeglądarce nie mogą być przenoszone przez serwer.';
        continue;
      }
      try {
        const data = await postDashboardAction('/api/action/quick-move', { sourcePath: file.path, targetDir });
        if (data.status !== 'moved') throw new Error(data.message || `Nie przeniesiono pliku ${file.name}.`);
        movedCount++;
        if (data.item && onItemCreated) onItemCreated(data.item);
        if (onItemDeleted) onItemDeleted(file.path);
      } catch (error) {
        failedCount++;
        failedIds.push(file.id);
        if (!firstError) firstError = getErrorMessage(error);
      }
    }
    addToast(
      failedCount === 0 ? 'success' : 'warning',
      `Przeniesiono ${movedCount} z ${filesToMove.length} plików`,
      failedCount > 0 ? `${failedCount} niepowodzeń. ${firstError}` : 'Pliki zapisano w Organized_Workspace.'
    );
    setSelectedBatchIds(failedIds);
  };

  const handleBatchDelete = async () => {
    if (!isProLicensed) {
      openProModal();
      addToast('info', '🔒 Masowe usuwanie plików wymaga wersji PRO', 'Odblokuj dożywotnią licencję Nexus PRO, aby zarządzać plikami grupowo na dysku.');
      return;
    }
    const filesToDelete = items.filter(i => selectedBatchIds.includes(i.id));
    let deletedCount = 0;
    let failedCount = 0;
    let firstError = '';
    const failedIds: string[] = [];
    for (const file of filesToDelete) {
      if (isBrowserBackedFile(file)) {
        failedCount++;
        failedIds.push(file.id);
        if (!firstError) firstError = 'Pliki wybrane w przeglądarce nie mogą być usuwane przez serwer.';
        continue;
      }
      try {
        const data = await postDashboardAction('/api/action/instant-delete', { path: file.path });
        if (data.status !== 'deleted') throw new Error(data.message || `Nie usunięto pliku ${file.name}.`);
        deletedCount++;
        if (onItemDeleted) onItemDeleted(file.path);
      } catch (error) {
        failedCount++;
        failedIds.push(file.id);
        if (!firstError) firstError = getErrorMessage(error);
      }
    }
    addToast(
      failedCount === 0 ? 'success' : 'warning',
      `Usunięto ${deletedCount} z ${filesToDelete.length} plików`,
      failedCount > 0 ? `${failedCount} niepowodzeń. ${firstError}` : 'Pliki usunięto z dysku.'
    );
    setSelectedBatchIds(failedIds);
  };

  // Selected batch total size calculation
  const batchTotalMB = useMemo(() => {
    const bytes = items.filter(i => selectedBatchIds.includes(i.id)).reduce((acc, f) => acc + (f.size || 0), 0);
    return (bytes / (1024 * 1024)).toFixed(1);
  }, [items, selectedBatchIds]);

  // Fast Actions Bar: Instant Delete (No confirmation prompts + instant toast)
  const handleInstantDelete = async (file: FileItem) => {
    if (!isProLicensed) {
      openProModal();
      addToast('info', '🔒 Modyfikacje i usuwanie plików są w Nexus PRO', 'W wersji Free masz nielimitowany bezpieczny podgląd. Odblokuj PRO do zarządzania plikami.');
      return;
    }
    if (isBrowserBackedFile(file)) {
      addToast('warning', 'Nie można usunąć pliku przeglądarkowego', 'Ta akcja wymaga ścieżki systemowej.');
      return;
    }
    try {
      const data = await postDashboardAction('/api/action/instant-delete', { path: file.path });
      if (data.status !== 'deleted') throw new Error(data.message || 'Serwer nie potwierdził usunięcia pliku.');
      if (onItemDeleted) onItemDeleted(file.path);
      addToast('success', '🗑️ Błyskawicznie usunięto z dysku i indeksu', file.name);
    } catch (error) {
      addToast('warning', 'Błąd usuwania pliku', `${file.name}: ${getErrorMessage(error)}`);
    }
  };

  // Fast Actions Bar: Pin to Top (Ulubione)
  const handlePinToggle = (fileId: string) => {
    const wasPinned = pinnedIds.includes(fileId);
    const next = wasPinned ? pinnedIds.filter(id => id !== fileId) : [...pinnedIds, fileId];
    setPinnedIds(next);
    let persisted = true;
    try {
      localStorage.setItem('nexus_pinned_ids', JSON.stringify(next));
    } catch (error) {
      persisted = false;
      console.warn('[Nexus] Could not persist pinned files:', error);
    }
    addToast(
      persisted ? 'info' : 'warning',
      persisted ? (wasPinned ? 'Odpięto plik' : '⭐ Przypięto plik') : 'Nie zapisano przypiętych plików',
      persisted ? undefined : 'Zmiana obowiązuje tylko do zamknięcia tej sesji.'
    );
  };

  // Fast Actions Bar: Quick Move to Project
  const handleQuickMove = async (file: FileItem) => {
    if (!isProLicensed) {
      openProModal();
      addToast('info', '🔒 Organizacja projektów jest funkcją PRO', 'Wersja Free ma tryb tylko do podglądu (max 2 projekty). Przejdź na PRO dla pełnej organizacji.');
      return;
    }
    if (isBrowserBackedFile(file) || isBrowserBackedRoot) {
      addToast('warning', 'Nie można przenieść pliku przeglądarkowego', 'Ta akcja wymaga ścieżek systemowych.');
      return;
    }
    try {
      const targetDir = `${targetPath}\\Organized_Workspace`;
      const data = await postDashboardAction('/api/action/quick-move', { sourcePath: file.path, targetDir });
      if (data.status !== 'moved') throw new Error(data.message || 'Serwer nie potwierdził przeniesienia pliku.');
      if (data.item && onItemCreated) onItemCreated(data.item);
      if (onItemDeleted) onItemDeleted(file.path);
      addToast('success', '💾 Przeniesiono plik do projektu', `${file.name} ➔ Organized_Workspace`);
    } catch (error) {
      addToast('warning', 'Błąd przenoszenia', `${file.name}: ${getErrorMessage(error)}`);
    }
  };

  // Bounded Window Pagination
  const totalPages = Math.max(1, Math.ceil(displayedFiles.length / limit));
  const pagedFiles = useMemo(() => {
    const start = (page - 1) * limit;
    return displayedFiles.slice(start, start + limit);
  }, [displayedFiles, page, limit]);

  // Keyboard navigation across files
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]')) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('nexus-dashboard-search') as HTMLInputElement | null;
        if (searchInput) searchInput.focus();
      } else if (e.key === ' ' && selectedItem) {
        e.preventDefault();
        setQuickLookItem(selectedItem);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (displayedFiles.length > 0) {
          const index = displayedFiles.findIndex(file => file.id === selectedItem?.id);
          const nextIndex = index < 0 ? 0 : Math.min(index + 1, displayedFiles.length - 1);
          setSelectedItem(displayedFiles[nextIndex]);
          setPage(Math.floor(nextIndex / limit) + 1);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (displayedFiles.length > 0) {
          const index = displayedFiles.findIndex(file => file.id === selectedItem?.id);
          const nextIndex = index < 0 ? 0 : Math.max(index - 1, 0);
          setSelectedItem(displayedFiles[nextIndex]);
          setPage(Math.floor(nextIndex / limit) + 1);
        }
      } else if (e.key === 'Enter' && selectedItem) {
        handleOpenDefault(selectedItem.path);
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedItem) {
        e.preventDefault();
        handleCopyPath(selectedItem.path);
      } else if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setIsDrawerOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, displayedFiles, limit]);

  // Handle open in default OS app
  const handleOpenDefault = async (filePath: string) => {
    if (findBrowserBackedFile(filePath)) {
      addToast('info', 'Plik wybrany w przeglądarce', 'Nie ma ścieżki systemowej wymaganej do otwarcia w aplikacji Windows.');
      return;
    }
    try {
      await postDashboardAction('/api/action/open-default', { path: filePath });
      addToast('success', 'Uruchomiono plik', 'Otwieranie w programie domyślnym Windows.');
    } catch (error) {
      addToast('warning', 'Nie udało się otworzyć pliku', getErrorMessage(error));
    }
  };

  // Handle copy path
  const handleCopyPath = async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath);
      addToast(
        'success',
        findBrowserBackedFile(filePath) ? 'Skopiowano ścieżkę względną' : 'Skopiowano pełną ścieżkę!',
        filePath
      );
    } catch (error) {
      addToast('warning', 'Nie udało się skopiować ścieżki', getErrorMessage(error));
    }
  };

  // Handle copy name
  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      addToast('success', 'Skopiowano nazwę pliku!', name);
    } catch (error) {
      addToast('warning', 'Nie udało się skopiować nazwy pliku', getErrorMessage(error));
    }
  };

  // Handle Send to Discord / Photoshop
  const handleSendDiscordPhotoshop = async (filePath: string) => {
    if (findBrowserBackedFile(filePath)) {
      addToast('warning', 'Nie można udostępnić pliku przeglądarkowego', 'Ta akcja wymaga ścieżki systemowej.');
      return;
    }
    try {
      const data = await postDashboardAction('/api/action/discord-photoshop', { path: filePath });
      const clipboardValue = typeof data.discordSnippet === 'string' && data.discordSnippet
        ? data.discordSnippet
        : filePath;
      await navigator.clipboard.writeText(clipboardValue);
      addToast(
        'success',
        data.discordSnippet ? 'Gotowe do wklejenia w Discord / Photoshop!' : 'Skopiowano ścieżkę do schowka',
        clipboardValue
      );
    } catch (error) {
      try {
        await navigator.clipboard.writeText(filePath);
        addToast('info', 'Nie udało się wykonać akcji Discord / Photoshop', `Skopiowano ścieżkę zamiast tego. ${getErrorMessage(error)}`);
      } catch (clipboardError) {
        addToast(
          'warning',
          'Nie udało się przygotować ścieżki do wklejenia',
          `${getErrorMessage(error)} ${getErrorMessage(clipboardError)}`
        );
      }
    }
  };

  // Handle Calculate SHA-256
  const handleCalculateHash = async (filePath: string) => {
    if (findBrowserBackedFile(filePath)) {
      addToast('warning', 'Nie można obliczyć skrótu tego pliku', 'Ta akcja serwerowa wymaga ścieżki systemowej.');
      return;
    }
    try {
      const data = await postDashboardAction('/api/action/calculate-hash', { path: filePath });
      if (!data.sha256) throw new Error('Serwer nie zwrócił sumy SHA-256.');
      await navigator.clipboard.writeText(data.sha256);
      addToast('success', 'Suma SHA-256 obliczona i skopiowana!', `${data.sha256.slice(0, 24)}...`);
    } catch (error) {
      addToast('warning', 'Nie udało się obliczyć lub skopiować SHA-256', getErrorMessage(error));
    }
  };

  // Tag filter toggle
  const handleTagClick = (tag: string) => {
    if (activeTags.includes(tag)) {
      setActiveTags(prev => prev.filter(t => t !== tag));
      addToast('info', 'Usunięto filtr tagu', tag);
    } else {
      setActiveTags(prev => [...prev, tag]);
      addToast('success', 'Aktywowano filtr tagu', tag);
    }
    setPage(1);
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    setSelectedItem(file);
    setContextMenu({
      item: file,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchFilter('');
    setDebouncedSearch('');
    setActiveTags([]);
    setActiveLanguageFilter(null);
    setQuickFormatFilter('ALL');
    setSelectedYearFilter(null);
    setGuidedAnswers({});
    setGuidedHistory([]);
    setPage(1);
    addToast('info', 'Zresetowano filtry', 'Przywrócono pełną listę plików.');
  };

  const toggleCategoryFilter = (filterId: string) => {
    setActiveLanguageFilter(current => current === filterId ? null : filterId);
    setPage(1);
    setIsSidebarOpen(false);
  };

  const handleNavigateToTopics = () => {
    onNavigateToView?.('TOPICS');
    setIsSidebarOpen(false);
  };

  const handleNavigationKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    activate: () => void
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <div className="nexus-dashboard-shell min-h-screen w-full flex bg-[#121214] text-[#e6e5e3] font-sans overflow-hidden">
      {isSidebarOpen && (
        <button
          type="button"
          className="nexus-dashboard-mobile-overlay"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Zamknij nawigację"
        />
      )}
      
      {/* 1. LEFT SIDEBAR (LUXURY OBSIDIAN / NOTION STYLE) */}
      <aside
        id="nexus-dashboard-navigation"
        aria-label="Nawigacja dashboardu"
        className={`nexus-dashboard-sidebar w-64 bg-[#131318]/95 backdrop-blur-xl border-r border-white/10 flex flex-col justify-between shrink-0 text-left text-xs font-sans shadow-2xl ${isSidebarOpen ? 'is-open' : ''}`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Brand Header */}
          <div className="p-3.5 pb-3 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-purple-950/30 via-[#17171f] to-cyan-950/20">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[1px] shadow-md shadow-purple-500/20">
                <div className="w-full h-full bg-[#0e0e14] rounded-[11px] flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-white text-xs tracking-wider font-mono">Project Nexus</span>
                <span className="text-[9px] font-mono text-white/45">Menedżer plików</span>
              </div>
            </div>
          </div>

          <div className="p-3 space-y-4 overflow-y-auto custom-scrollbar flex-1">
            
            {/* Section 1: NEXUS INTELLIGENT STRUCTURE */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-mono text-white/40 uppercase tracking-wider font-bold flex items-center justify-between">
                <span>STRUKTURA INTELIGENTNA</span>
                <Layers className="w-3 h-3 text-purple-400/70" />
              </div>
              
              <div 
                role="button"
                tabIndex={0}
                aria-pressed={!activeLanguageFilter && activeTags.length === 0 && quickFormatFilter === 'ALL'}
                onKeyDown={event => handleNavigationKeyDown(event, () => {
                  setActiveLanguageFilter(null);
                  setActiveTags([]);
                  setQuickFormatFilter('ALL');
                  setPage(1);
                  setIsSidebarOpen(false);
                })}
                onClick={() => { setActiveLanguageFilter(null); setActiveTags([]); setQuickFormatFilter('ALL'); setPage(1); setIsSidebarOpen(false); }}
                className={`flex items-center justify-between px-2.5 py-2 rounded-xl font-medium cursor-pointer transition border ${
                  !activeLanguageFilter && activeTags.length === 0 && quickFormatFilter === 'ALL'
                    ? 'bg-gradient-to-r from-purple-600/25 to-indigo-600/15 border-purple-500/45 text-white shadow-sm' 
                    : 'text-[#a1a1aa] hover:text-white hover:bg-white/[0.04] border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-yellow-400">📁</span>
                  <span className="truncate font-semibold text-xs">Wszystkie Pliki</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/80 font-bold">
                  {items.length.toLocaleString('pl-PL')}
                </span>
              </div>

              {[
                { id: 'nexus_work', label: 'Praca & Finanse', emoji: '💼' },
                { id: 'nexus_projects', label: isProLicensed ? 'Projekty & Kod (Unlimited)' : 'Projekty (Free: max 2)', emoji: '⚡', isProject: true },
                { id: 'nexus_school', label: 'Edukacja & Studia', emoji: '🎓' },
                { id: 'nexus_images', label: 'Obrazy & Grafika', emoji: '🖼️' },
                { id: 'screenshots', label: 'Zrzuty ekranu', emoji: '📸' },
                { id: 'nexus_docs', label: 'Dokumenty', emoji: '📄' },
                { id: 'nexus_unorganized', label: 'Instalatory & Temp', emoji: '🧹' },
                { id: 'nexus_recent', label: 'Ostatnie 7 dni', emoji: '⏱️' },
                { id: 'nexus_unclassified', label: 'Pozostałe', emoji: '📦' }
              ].map(cat => {
                const isSelected = activeLanguageFilter === cat.id;
                const count = dashboardStats.structureCounts[cat.id] ?? 0;
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onKeyDown={event => handleNavigationKeyDown(event, () => toggleCategoryFilter(cat.id))}
                    key={cat.id}
                    onClick={() => toggleCategoryFilter(cat.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition group border ${
                      isSelected
                        ? 'bg-purple-950/50 border-purple-500/50 text-purple-200 shadow-sm'
                        : 'border-transparent hover:bg-white/[0.04] text-[#a1a1aa] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{cat.emoji}</span>
                      <span className="truncate font-medium text-xs">{cat.label}</span>
                      {cat.isProject && !isProLicensed && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                          2 MAX
                        </span>
                      )}
                    </div>
                    {count > 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        isSelected ? 'bg-purple-500/30 text-white font-bold' : 'text-white/40 group-hover:text-white/80'
                      }`}>
                        {count.toLocaleString('pl-PL')}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Special Views & System Tools */}
              <div className="pt-3 space-y-1">
                <div className="px-2 pb-1 text-[10px] font-mono text-white/40 uppercase tracking-wider font-bold">
                  NARZĘDZIA & WIDOKI
                </div>
                {onNavigateToView && (
                  <div className="space-y-1">
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => handleNavigationKeyDown(event, handleNavigateToTopics)}
                      onClick={handleNavigateToTopics}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white cursor-pointer transition border border-purple-500/25 text-xs"
                      title="Widok Katalogu Tematów i Roczników (Ctrl+2)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>🗂️</span>
                        <span className="truncate font-semibold">Tematy i Roczniki</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => handleNavigationKeyDown(event, () => { onNavigateToView('GALLERY'); setIsSidebarOpen(false); })}
                      onClick={() => { onNavigateToView('GALLERY'); setIsSidebarOpen(false); }}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-pink-500/10 text-[#a1a1aa] hover:text-pink-300 cursor-pointer transition border border-transparent hover:border-pink-500/25 text-xs"
                      title="Galeria Multimediów (Ctrl+3)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <ImageIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                        <span className="truncate font-medium">Galeria Mediów</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => handleNavigationKeyDown(event, () => { onNavigateToView('TRIAGE'); setIsSidebarOpen(false); })}
                      onClick={() => { onNavigateToView('TRIAGE'); setIsSidebarOpen(false); }}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-rose-500/10 text-[#a1a1aa] hover:text-rose-300 cursor-pointer transition border border-transparent hover:border-rose-500/25 text-xs"
                      title="Triage Pobranych & Zrzutów (Ctrl+4)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate font-medium">Triage Pobranych</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => handleNavigationKeyDown(event, () => { onNavigateToView('KANBAN'); setIsSidebarOpen(false); })}
                      onClick={() => { onNavigateToView('KANBAN'); setIsSidebarOpen(false); }}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-cyan-500/10 text-[#a1a1aa] hover:text-cyan-300 cursor-pointer transition border border-transparent hover:border-cyan-500/25 text-xs"
                      title="Workspace Kanban (Ctrl+5)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate font-medium">Kanban Kod/Media</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => handleNavigationKeyDown(event, () => { onNavigateToView('APPS'); setIsSidebarOpen(false); })}
                      onClick={() => { onNavigateToView('APPS'); setIsSidebarOpen(false); }}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 text-[#a1a1aa] hover:text-amber-300 cursor-pointer transition border border-transparent hover:border-amber-500/25 text-xs"
                      title="Półka Aplikacji & Instalatory (Ctrl+6)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate font-medium">Półka Instalatorów</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </div>
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => handleNavigationKeyDown(event, () => setIsDeduplicatorOpen(true))}
                  onClick={() => setIsDeduplicatorOpen(true)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-cyan-500/10 text-[#a1a1aa] hover:text-cyan-300 cursor-pointer transition border border-transparent hover:border-cyan-500/25 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Copy className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate font-medium">Deduplikator Plików</span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => handleNavigationKeyDown(event, () => setIsGhostCleanerOpen(true))}
                  onClick={() => setIsGhostCleanerOpen(true)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 text-[#a1a1aa] hover:text-amber-300 cursor-pointer transition border border-transparent hover:border-amber-500/25 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate font-medium">Ghost Cleaner (Cache)</span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => handleNavigationKeyDown(event, () => {
                    if (!isProLicensed) {
                      openProModal();
                      addToast('info', '👑 Tagowanie Ollama AI jest w Nexus PRO', 'Wersja darmowa obsługuje reguły i filtry heurystyczne.');
                    } else {
                      setIsSmartTaggingModalOpen(true);
                    }
                  })}
                  onClick={() => {
                    if (!isProLicensed) {
                      openProModal();
                      addToast('info', '👑 Tagowanie Ollama AI jest w Nexus PRO', 'Wersja darmowa obsługuje reguły i filtry heurystyczne.');
                    } else {
                      setIsSmartTaggingModalOpen(true);
                    }
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 hover:text-white cursor-pointer transition border border-purple-500/30 text-xs font-semibold shadow-sm"
                  title={isProLicensed ? 'Inteligentne tagowanie plików za pomocą lokalnego modelu AI (Ollama)' : 'Funkcja dostępna w Nexus PRO'}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                    <span className="truncate">Tagowanie AI (Ollama)</span>
                  </div>
                  {isProLicensed ? (
                    <span className={`w-1.5 h-1.5 rounded-full ${isLocalAiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                      <Lock className="w-2.5 h-2.5" />
                      <span>PRO</span>
                    </span>
                  )}
                </div>

                <div 
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isProLicensed) {
                      openProModal();
                    } else {
                      setIsSmartTaggingModalOpen(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isProLicensed) {
                        openProModal();
                      } else {
                        setIsSmartTaggingModalOpen(true);
                      }
                    }
                  }}
                  className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-[10px] text-amber-300/90 leading-tight cursor-pointer transition space-y-0.5"
                  title="Kliknij, aby poznać korzyści z tagowania AI w Nexus PRO"
                >
                  <div className="font-semibold text-amber-200 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1">
                      <span>⚠️</span>
                      <span>Sortowanie bez AI:</span>
                    </span>
                    {!isProLicensed && (
                      <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-0.5">
                        <Crown className="w-2.5 h-2.5" /> PRO
                      </span>
                    )}
                  </div>
                  <p className="text-white/60">
                    Włącz zaawansowaną analizę zawartości plików za pomocą lokalnego silnika AI.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: DYNAMIC SMART FILTERS */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-mono text-white/40 uppercase tracking-wider flex items-center justify-between font-bold">
                <span>WYKRYTE KATEGORIE</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  {dynamicCategories.length}
                </span>
              </div>

              {dynamicCategories.length === 0 ? (
                <div className="px-2.5 py-2 text-xs font-mono text-[#555]">
                  Brak wykrytych kategorii
                </div>
              ) : (
                dynamicCategories.map(cat => {
                  const isSelected = activeLanguageFilter === cat.id;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onKeyDown={event => handleNavigationKeyDown(event, () => toggleCategoryFilter(cat.id))}
                      key={cat.id}
                      onClick={() => toggleCategoryFilter(cat.id)}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition group border ${
                        isSelected
                          ? 'bg-purple-950/50 border-purple-500/50 text-purple-200 shadow-sm'
                          : 'border-transparent hover:bg-white/[0.04] text-[#a1a1aa] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {cat.iconType === 'badge' ? (
                          <span className={`w-4 h-4 rounded ${cat.badgeBg} ${cat.badgeText} flex items-center justify-center text-[10px] font-bold font-mono border ${cat.badgeBorder} shrink-0`}>
                            {cat.shortTag}
                          </span>
                        ) : (
                          <span className="text-xs shrink-0">{cat.emoji || cat.shortTag}</span>
                        )}
                        <span className="font-medium truncate text-xs">{cat.label}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#71717a] group-hover:text-white shrink-0 ml-1.5">
                        {cat.count.toLocaleString('pl-PL')}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Storage & Health Footprint Card */}
          <div className="p-3 border-t border-white/10 space-y-2.5 font-mono bg-[#0e0e13]/90">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[#a1a1aa]">
                <span className="flex items-center gap-1.5 text-white font-semibold text-[11px]">
                  <HardDrive className="w-3.5 h-3.5 text-purple-400" /> Indeks w pamięci
                </span>
                <span className="text-purple-300 font-bold text-[10px]">{items.length.toLocaleString('pl-PL')} plików</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-extrabold text-white">{dashboardStats.sizeLabel}</span>
                <span className="text-[9px] text-white/45">łączny rozmiar</span>
              </div>

              {/* Segmented distribution bar */}
              {items.length > 0 && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${Math.max(4, Math.round((dashboardStats.mediaCount / items.length) * 100))}%` }}
                    title={`Multimedia: ${dashboardStats.mediaCount}`}
                  />
                  <div
                    className="h-full bg-cyan-400"
                    style={{ width: `${Math.max(4, Math.round((dashboardStats.codeCount / items.length) * 100))}%` }}
                    title={`Kod: ${dashboardStats.codeCount}`}
                  />
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${Math.max(4, Math.round((dashboardStats.docsCount / items.length) * 100))}%` }}
                    title={`Dokumenty: ${dashboardStats.docsCount}`}
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.max(4, Math.round((dashboardStats.archiveCount / items.length) * 100))}%` }}
                    title={`Archiwa: ${dashboardStats.archiveCount}`}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-1 text-[10px] text-white/50">
              <button
                type="button"
                onClick={() => {
                  if (!isProLicensed) {
                    openProModal();
                    addToast('info', '👑 Ollama AI jest w Nexus PRO', 'Odblokuj PRO dla czatu i asystenta AI.');
                  } else {
                    setIsOllamaChatOpen(true);
                  }
                }}
                className={`flex items-center gap-1.5 hover:underline cursor-pointer ${isProLicensed ? (isLocalAiOnline ? 'text-emerald-400' : 'text-amber-300') : 'text-amber-300'}`}
              >
                {isProLicensed ? (
                  <span className={`w-1.5 h-1.5 rounded-full ${isLocalAiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`}></span>
                ) : (
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                )}
                <span>Ollama {isProLicensed ? (isLocalAiOnline ? 'Online' : aiStatus ? 'Offline' : 'Łączenie') : 'Tylko PRO'}</span>
              </button>
              <span>{aiStatus?.ollama?.modelCount ?? 0} modeli AI</span>
            </div>
          </div>

        </div>
      </aside>

      {/* 2. MAIN CANVAS */}
      <main className="nexus-dashboard-main flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#0f0f13]">
        
        {/* Top Navbar Title & Breadcrumbs */}
        <div className="h-12 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#14141a]/85 backdrop-blur-xl text-xs font-mono">
          <div className="flex items-center gap-2.5 text-[#a1a1aa] min-w-0">
            <button
              type="button"
              className="nexus-mobile-menu-button"
              onClick={() => setIsSidebarOpen(open => !open)}
              aria-label={isSidebarOpen ? 'Zamknij nawigację' : 'Otwórz nawigację'}
              aria-expanded={isSidebarOpen}
              aria-controls="nexus-dashboard-navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-white font-extrabold tracking-wider">NEXUS EXPLORER</span>
            <span className="text-white/25">/</span>
            <button
              type="button"
              onClick={() => handleCopyPath(targetPath)}
              className="px-2 py-0.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-purple-200 font-medium truncate max-w-xs flex items-center gap-1.5 transition cursor-pointer"
              title={`Kliknij, aby skopiować ścieżkę: ${targetPath}`}
            >
              <Folder className="w-3 h-3 text-purple-400 shrink-0" />
              <span className="truncate">{targetFolderName}</span>
              <Copy className="w-2.5 h-2.5 opacity-60 shrink-0" />
            </button>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Indeks aktywny</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-[#71717a]">
            <span className="hidden xl:inline-flex items-center gap-1">
              <kbd className="kbd-badge">/</kbd>
              <span>Szukaj</span>
            </span>
            <span className="hidden xl:inline">•</span>
            <span className="hidden lg:inline-flex items-center gap-1">
              <kbd className="kbd-badge">Spacja</kbd>
              <span>QuickLook</span>
            </span>
            <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

            {/* Nexus PRO Status / Upgrade Button */}
            <button
              onClick={() => openProModal()}
              className="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-amber-950/30"
              title="Zarządzaj licencją Nexus PRO lub odblokuj dożywotni dostęp przez Krypto"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>{isProLicensed ? 'PRO AKTYWNE' : 'UPGRADE PRO'}</span>
            </button>

            {onGoToWebsite && (
              <button
                onClick={onGoToWebsite}
                className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-white/80 hover:text-white transition flex items-center gap-1.5 text-xs font-mono cursor-pointer"
                title="Wróć do strony głównej SaaS i zarządzania kontem"
              >
                <span>🌐 Portal</span>
              </button>
            )}

            {/* AI Ollama Assistant trigger button */}
            <button
              onClick={() => {
                if (!isProLicensed) {
                  openProModal();
                  addToast('info', '👑 Ollama AI jest funkcją Nexus PRO', 'W wersji Free masz nielimitowany podgląd plików. Odblokuj PRO dla pełnego AI.');
                } else {
                  setIsOllamaChatOpen(prev => !prev);
                }
              }}
              className={`px-3 py-1 rounded-xl border text-xs font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                isOllamaChatOpen
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400 text-white shadow-purple-900/50'
                  : isProLicensed
                  ? 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-500/40 text-purple-200'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
              }`}
              title={isProLicensed ? 'Otwórz okno rozmowy z Asystentem AI (Ctrl+J)' : 'Asystent Ollama AI dostępny w Nexus PRO'}
            >
              <Bot className="w-3.5 h-3.5 text-purple-300" />
              <span>Asystent AI</span>
              {isProLicensed ? (
                <span className={`w-2 h-2 rounded-full ml-0.5 ${isLocalAiOnline ? 'bg-emerald-400' : 'bg-amber-300'}`} />
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-full ml-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>PRO</span>
                </span>
              )}
            </button>

            <button
              onClick={() => setIsDrawerOpen(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                isDrawerOpen 
                  ? 'bg-purple-950/50 border-purple-500/40 text-purple-300 shadow-sm' 
                  : 'bg-white/[0.04] border-white/10 text-[#a1a1aa] hover:text-white'
              }`}
              title="Przełącz boczny panel Inspektora (Ctrl + I)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inspektor</span>
              <kbd className="kbd-badge text-[9px] hidden md:inline">Ctrl+I</kbd>
            </button>
          </div>
        </div>

        {/* Main Scrollable Canvas */}
        <div className="nexus-dashboard-canvas flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-left">
          
          {/* Executive Mission Control Master Hub */}
          <ExecutiveMissionControl
            items={items}
            targetPath={targetPath}
            isProLicensed={isProLicensed}
            onOpenProModal={openProModal}
            onNavigateToView={(view) => {
              if (view === 'EXPLORER') {
                onNavigateToView?.('TOPICS');
              } else {
                onNavigateToView?.(view);
              }
            }}
            onOpenGuidedSearch={onOpenGuidedSearch}
            onQuickAction={(actionId) => {
              if (actionId === 'QUICK_SEARCH') onOpenGuidedSearch?.();
              else if (actionId === 'AI_ASSISTANT') {
                if (!isProLicensed) openProModal();
                else setIsOllamaChatOpen(true);
              }
              else if (actionId === 'GHOST_CLEANER') setIsGhostCleanerOpen(true);
              else if (actionId === 'DEDUPLICATOR') setIsDeduplicatorOpen(true);
              else if (actionId === 'SMART_SHIELD') setIsQuarantineModalOpen(true);
              else if (actionId === 'CREATE_ITEM') setIsCreateModalOpen(true);
            }}
          />

          {/* Upgraded Glassmorphic Command Hero Banner */}
          <div className="relative rounded-2xl bg-gradient-to-r from-[#171722] via-[#14141c] to-[#121921] border border-white/10 p-4 sm:p-5 shadow-xl overflow-hidden">
            <div className="absolute -top-20 -left-16 w-64 h-64 bg-purple-600/15 blur-3xl pointer-events-none rounded-full" />
            <div className="absolute -bottom-20 -right-16 w-64 h-64 bg-cyan-500/10 blur-3xl pointer-events-none rounded-full" />

            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/35 flex items-center justify-center text-purple-300 shadow-inner">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h1 className="text-xl font-extrabold text-white tracking-tight">
                    Eksplorator plików
                  </h1>
                  {activeLanguageFilter && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Filtr aktywny
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-[#a1a1aa] flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5">
                  <span>
                    Katalog: <strong className="text-white" title={targetPath}>{targetFolderName}</strong>
                  </span>
                  <span className="text-white/25">•</span>
                  <span>
                    Wyświetlane: <strong className="text-emerald-400">{displayedFiles.length.toLocaleString('pl-PL')}</strong> z {items.length.toLocaleString('pl-PL')} plików
                  </span>
                  <span className="text-white/25">•</span>
                  <span>
                    Rozmiar indeksu: <strong className="text-cyan-300">{dashboardStats.sizeLabel}</strong>
                  </span>
                  <span className="text-white/25">•</span>
                  {isProLicensed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/40 text-[11px] font-bold text-amber-300">
                      <Crown className="w-3 h-3 text-amber-400" />
                      <span>PRO: Unlimited All + Ollama AI</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => openProModal()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 text-[11px] font-medium text-white/80 hover:text-amber-300 transition cursor-pointer"
                      title="Wersja Free: Limit 5 GB, 2 projekty, pełny podgląd plików. Kliknij, aby odblokować PRO."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span>Free: {dashboardStats.sizeLabel} / 5 GB • 2 projekty (podgląd)</span>
                      <span className="text-amber-400 font-bold ml-1 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> PRO
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* 1. Primary Action: Nowy plik */}
                <button 
                  onClick={() => {
                    if (!isProLicensed) {
                      openProModal();
                      addToast('info', '🔒 Tworzenie plików i zapis jest w Nexus PRO', 'W wersji Free masz bezpieczny nielimitowany podgląd. Odblokuj PRO do zapisu na dysku.');
                    } else {
                      setIsCreateModalOpen(true);
                    }
                  }}
                  disabled={isBrowserBackedWorkspace}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600/30 to-cyan-600/20 hover:from-emerald-600/40 hover:to-cyan-600/30 border border-emerald-500/45 text-xs text-emerald-200 transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  title={isBrowserBackedWorkspace ? 'Tworzenie plików wymaga folderu skanowanego przez aplikację' : (isProLicensed ? 'Utwórz plik w bieżącym folderze' : 'Tworzenie plików wymaga Nexus PRO')}
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nowy plik</span>
                  {!isProLicensed && <Lock className="w-3 h-3 text-amber-400 ml-0.5" />}
                </button>

                {/* 2. Change Target Folder */}
                {onChangeTargetFolder && (
                  <button 
                    onClick={onChangeTargetFolder}
                    className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                    title="Wybierz inny katalog lub uruchom nowy skan"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-purple-400" />
                    <span>Zmień folder</span>
                  </button>
                )}

                {/* 3. Open Any Folder from Disk */}
                <button
                  onClick={handleOpenFolderFSA}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Wybierz dowolny folder ze swojego dysku"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Wybierz z dysku</span>
                </button>

                {/* 4. Open in Windows Explorer */}
                <button 
                  onClick={() => handleOpenInExplorer(targetPath)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Otwórz folder w Eksploratorze Windows"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Eksplorator</span>
                </button>

                {/* 5. Deduplicator Quick Trigger */}
                <button 
                  onClick={() => setIsDeduplicatorOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Wyszukaj i usuń zduplikowane pliki"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline">Duplikaty</span>
                </button>

                {/* 5b. Ollama Intelligent Tagging */}
                <button 
                  onClick={() => {
                    if (!isProLicensed) {
                      openProModal();
                      addToast('info', '👑 Tagowanie AI jest w Nexus PRO', 'Wersja Free posiada nielimitowany podgląd oraz reguły heurystyczne.');
                    } else {
                      setIsSmartTaggingModalOpen(true);
                    }
                  }}
                  className={`px-3 py-2 rounded-xl border text-xs transition flex items-center gap-1.5 cursor-pointer font-semibold shadow-sm ${
                    isProLicensed
                      ? 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/35 text-purple-200 hover:text-white'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
                  }`}
                  title={isProLicensed ? 'Analiza zawartości plików lokalnym AI (Ollama)' : 'Funkcja AI dostępna w wersji Nexus PRO'}
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  <span className="hidden lg:inline">Tagowanie AI</span>
                  {isProLicensed ? (
                    <span className={`w-1.5 h-1.5 rounded-full ${isLocalAiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                      <Lock className="w-2.5 h-2.5" />
                      <span>PRO</span>
                    </span>
                  )}
                </button>

                {/* 5c. AI Sorting Accuracy Notice Pill */}
                <div 
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isProLicensed) {
                      openProModal();
                    } else {
                      setIsSmartTaggingModalOpen(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isProLicensed) {
                        openProModal();
                      } else {
                        setIsSmartTaggingModalOpen(true);
                      }
                    }
                  }}
                  className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-[11px] text-amber-300 font-mono cursor-pointer transition"
                  title="Klasyfikacja podstawowa bazuje na nazwach i metadanych. Kliknij tutaj, aby poznać analizę AI."
                >
                  <span className="text-amber-400">💡</span>
                  <span>Zaawansowana weryfikacja zawartości plików z modelem AI</span>
                  {!isProLicensed && <Crown className="w-3 h-3 text-amber-400 ml-1" />}
                </div>

                {/* 6. Security & Shield */}
                <button 
                  onClick={() => setIsQuarantineModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Tarcza Ochronna i Kwarantanna"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Tarcza</span>
                </button>

                {/* 7. Settings */}
                <button 
                  onClick={() => setIsAdvanceModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Centrum Kontroli i Ustawienia Zaawansowane"
                >
                  <Settings className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Ustawienia</span>
                </button>

                {/* 8. Collapse / Expand HUD */}
                <button 
                  onClick={() => setIsHudCollapsed(prev => !prev)}
                  className="px-2.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-[#a1a1aa] hover:text-white transition flex items-center gap-1.5 cursor-pointer font-mono"
                  title="Zwiń / Rozwiń panel analityczny (Alt + Space)"
                >
                  {isHudCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{isHudCollapsed ? 'Rozwiń HUD' : 'Zwiń HUD'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 6 Interactive Telemetry & Quick-Filter KPI Cards */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 select-none" aria-label="Podsumowanie indeksu i telemetria">
            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                !activeLanguageFilter && quickFormatFilter === 'ALL' && activeTags.length === 0
                  ? 'bg-purple-950/35 border-purple-500/50 ring-1 ring-purple-500/30'
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-purple-500/40'
              }`}
              onClick={handleResetFilters}
              title="Resetuj filtry i pokaż wszystkie pliki"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">WSZYSTKIE</span>
                <Folder className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-white tracking-tight">
                {items.length.toLocaleString('pl-PL')}
              </div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span>100% indeksu</span>
              </div>
            </button>

            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                quickFormatFilter === 'LARGE'
                  ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/40'
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-cyan-500/40'
              }`}
              onClick={() => setQuickFormatFilter(current => current === 'LARGE' ? 'ALL' : 'LARGE')}
              title="Kliknij, aby przefiltrować duże pliki (powyżej 10 MB)"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">WAGA / DUŻE</span>
                <HardDrive className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-cyan-300 tracking-tight">
                {dashboardStats.sizeLabel}
              </div>
              <div className="text-[10px] font-mono text-cyan-400/80 truncate">
                {dashboardStats.largeCount} plików &gt; 10 MB
              </div>
            </button>

            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                quickFormatFilter === 'MEDIA' 
                  ? 'bg-purple-950/45 border-purple-500/60 ring-1 ring-purple-500/40' 
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-purple-500/35'
              }`}
              onClick={() => setQuickFormatFilter(current => current === 'MEDIA' ? 'ALL' : 'MEDIA')}
              title="Filtruj multimedia, obrazy i wideo"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">MULTIMEDIA</span>
                <ImageIcon className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-purple-200 tracking-tight">
                {dashboardStats.mediaCount.toLocaleString('pl-PL')}
              </div>
              <div className="text-[10px] font-mono text-purple-400/80 truncate">
                grafiki, zrzuty i wideo
              </div>
            </button>

            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                quickFormatFilter === 'CODE' 
                  ? 'bg-blue-950/45 border-blue-500/60 ring-1 ring-blue-500/40' 
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-blue-500/35'
              }`}
              onClick={() => setQuickFormatFilter(current => current === 'CODE' ? 'ALL' : 'CODE')}
              title="Filtruj kod źródłowy i skrypty"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">KOD & DEV</span>
                <FileCode className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-blue-300 tracking-tight">
                {dashboardStats.codeCount.toLocaleString('pl-PL')}
              </div>
              <div className="text-[10px] font-mono text-blue-400/80 truncate">
                Monaco Studio gotowe
              </div>
            </button>

            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                quickFormatFilter === 'ARCHIVE' 
                  ? 'bg-yellow-950/45 border-yellow-500/60 ring-1 ring-yellow-500/40' 
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-yellow-500/35'
              }`}
              onClick={() => setQuickFormatFilter(current => current === 'ARCHIVE' ? 'ALL' : 'ARCHIVE')}
              title="Filtruj archiwa ZIP / RAR / 7Z"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">ARCHIWA</span>
                <FileArchive className="w-3.5 h-3.5 text-yellow-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-yellow-300 tracking-tight">
                {dashboardStats.archiveCount.toLocaleString('pl-PL')}
              </div>
              <div className="text-[10px] font-mono text-yellow-400/80 truncate">
                paczki .zip / .rar / .7z
              </div>
            </button>

            <button
              type="button"
              className={`relative overflow-hidden p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                activeLanguageFilter === 'pinned' 
                  ? 'bg-amber-950/45 border-amber-500/60 ring-1 ring-amber-500/40' 
                  : 'bg-[#16161d]/90 hover:bg-[#1c1c25] border-white/10 hover:border-amber-500/35'
              }`}
              onClick={() => toggleCategoryFilter('pinned')}
              title="Pokaż przypięte pliki"
            >
              <div className="flex items-center justify-between text-[#a1a1aa] text-[10px] font-mono">
                <span className="font-bold tracking-wider">PRZYPIĘTE</span>
                <Star className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" fill={dashboardStats.pinnedCount > 0 ? 'currentColor' : 'none'} />
              </div>
              <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-amber-300 tracking-tight">
                {dashboardStats.pinnedCount.toLocaleString('pl-PL')}
              </div>
              <div className="text-[10px] font-mono text-amber-400/80 truncate">
                ulubione na górze listy
              </div>
            </button>
          </section>

          {/* 3. COLLAPSIBLE HUD: SLIM STATUS BAR OR 5 LIVE SMART CLUSTERS */}
          {isHudCollapsed ? (
            /* COLLAPSED HUD: Sleek 38px status bar for 100% file viewing space (Pillar 4) */
            <div className="flex items-center justify-between px-4 py-2 bg-[#181818] border border-[#2b2b2b] rounded-xl shadow-lg font-mono text-xs text-[#aaa] animate-fadeIn">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsHudCollapsed(false)}
                  className="px-2.5 py-1 rounded-md bg-purple-600/30 text-purple-300 border border-purple-500/40 hover:bg-purple-600/50 flex items-center gap-1.5 cursor-pointer font-bold transition text-[11px]"
                  title="Rozwiń HUD (Alt + Space)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Rozwiń HUD (Alt+Space)</span>
                </button>
                <div className="flex items-center gap-2 text-white">
                  <span className="text-yellow-500">📁</span>
                  <span className="truncate max-w-xs">{targetPath}</span>
                  <span className="text-[#666]">({displayedFiles.length.toLocaleString('pl-PL')} plików)</span>
                </div>
              </div>

              {/* Quick Cluster chips */}
              <div className="hidden lg:flex items-center gap-2">
                {smartClusterCards.slice(0, 4).map((cluster) => (
                  <button
                    type="button"
                    key={cluster.id}
                    onClick={() => toggleCategoryFilter(cluster.id)}
                    className={`px-2.5 py-1 rounded bg-[#202020] hover:bg-[#2a2a2a] border transition cursor-pointer flex items-center gap-1.5 text-xs font-mono ${
                      activeLanguageFilter === cluster.id ? 'border-purple-500 text-purple-300' : 'border-white/10 text-slate-300'
                    }`}
                  >
                    <span>{cluster.emoji} {cluster.title}:</span>
                    <span className="text-white font-bold">{cluster.count}</span>
                    <span className="text-[10px] text-[#777]">({cluster.weightLabel})</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Collapsed HUD: current local AI status */}
                <button 
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(true)}
                  className="px-2.5 py-1 rounded bg-[#202020] hover:bg-[#282828] border border-purple-500/30 text-purple-200 cursor-pointer flex items-center gap-1.5 text-[11px] font-mono transition shadow-sm"
                  title={`${isLocalAiOnline ? 'Ollama jest połączona' : 'Ollama jest niedostępna'} — kliknij, aby otworzyć konfigurację`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isLocalAiOnline ? 'bg-emerald-400' : 'bg-amber-300'}`}></span>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-white font-bold text-[11px]">Ollama {isLocalAiOnline ? 'online' : 'offline'}</span>
                    <span className="text-purple-300 font-semibold text-[10px]">{activeModelName}</span>
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => setIsQuarantineModalOpen(true)}
                  className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 cursor-pointer hover:bg-emerald-900/50 flex items-center gap-1 text-[11px]"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tarcza ochronna</span>
                </button>
              </div>
            </div>
          ) : (
            /* DYNAMIC SMART CLUSTER CARDS tailored directly to user files */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 animate-fadeIn">
              {smartClusterCards.length === 0 ? (
                <div className="col-span-full py-8 text-center bg-[#16161d]/90 rounded-2xl border border-white/10 text-slate-400 font-mono text-xs">
                  Trwa analiza struktury plików lub brak plików do zgrupowania.
                </div>
              ) : (
                smartClusterCards.map((cluster) => {
                  const isSelected = activeLanguageFilter === cluster.id;
                  return (
                    <div
                      key={cluster.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCategoryFilter(cluster.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleCategoryFilter(cluster.id);
                        }
                      }}
                      className={`rounded-2xl border transition-all duration-200 cursor-pointer p-4 space-y-3 flex flex-col justify-between group shadow-xl ${
                        isSelected
                          ? 'bg-gradient-to-b from-purple-950/45 to-[#16161f] border-purple-500/80 ring-1 ring-purple-500/50 -translate-y-0.5'
                          : 'bg-gradient-to-b from-[#181820]/95 to-[#121218]/95 border-white/10 hover:border-purple-500/40 hover:bg-[#1d1d27] hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base shrink-0 group-hover:scale-110 transition-transform">{cluster.emoji}</span>
                            <h3 className={`font-bold text-xs text-white ${cluster.hoverColor} transition truncate`}>
                              {cluster.title}
                            </h3>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-bold shrink-0">
                            {cluster.weightLabel}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#9ca3af] flex justify-between">
                          <span className="truncate">{cluster.subtitle}</span>
                          <span className="text-purple-300/80 font-bold shrink-0 ml-1">{cluster.percent}%</span>
                        </div>
                        {/* Progress Fullness Bar */}
                        <div className="w-full bg-[#0d0d12] h-1.5 rounded-full overflow-hidden border border-white/10">
                          <div 
                            className={`h-full bg-gradient-to-r ${cluster.barGradient} rounded-full transition-all duration-500`}
                            style={{ width: `${cluster.percent}%` }}
                          />
                        </div>
                      </div>

                      {/* LIVE PREVIEW BASED ON REAL USER FILES */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono text-[#71717a] uppercase tracking-wider font-bold">
                          <span>PODGLĄD NA ŻYWO</span>
                          {isSelected && <span className="text-purple-400 font-semibold lowercase">● aktywny filtr</span>}
                        </div>
                        {cluster.previewType === 'IMAGE_COLLAGE' ? (
                          <div className="grid grid-cols-3 grid-rows-2 gap-1 rounded-xl bg-[#0d0d12] border border-white/8 p-1.5 h-28 overflow-hidden">
                            {cluster.sample.map((file, idx) => (
                              <div key={idx} className="w-full h-full rounded-md overflow-hidden bg-[#1b1b22] relative group/thumb">
                                <LazyThumbnail
                                  file={file}
                                  className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                                />
                              </div>
                            ))}
                            {cluster.sample.length === 0 && (
                              <div className="col-span-3 row-span-2 flex items-center justify-center text-xs text-[#555] font-mono">
                                Brak miniaturek
                              </div>
                            )}
                          </div>
                        ) : cluster.previewType === 'CODE_SNIPPET' ? (
                          <div className="rounded-xl bg-[#0d0d12] border border-white/8 p-2.5 font-mono text-[10px] leading-relaxed text-[#bbb] overflow-hidden h-28 flex flex-col justify-between">
                            <div className="space-y-0.5 truncate">
                              <div className="text-blue-400 font-semibold truncate flex items-center gap-1">
                                <span>📄</span>
                                <span className="truncate">{cluster.sample[0]?.name || 'plik_źródłowy'}</span>
                              </div>
                              <div className="text-purple-400 truncate">
                                <span className="text-[#555] mr-2">1</span>export default component;
                              </div>
                              <div className="text-sky-300 truncate">
                                <span className="text-[#555] mr-2">2</span>const data = loadWorkspace();
                              </div>
                            </div>
                            <div className="text-[9px] text-[#666] pt-1 border-t border-white/5 flex justify-between">
                              <span>{cluster.sample[0]?.extension?.toUpperCase() || 'KOD'}</span>
                              <span className="text-emerald-400">● {cluster.count} plików w bazie</span>
                            </div>
                          </div>
                        ) : cluster.previewType === 'DOC_LIST' ? (
                          <div className="rounded-xl bg-[#0d0d12] border border-white/8 p-2.5 font-mono text-[10px] leading-relaxed text-[#bbb] overflow-hidden h-28 flex flex-col justify-between">
                            <div className="space-y-1 overflow-hidden">
                              {cluster.sample.slice(0, 3).map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5 truncate text-[10px] text-[#ccc]">
                                  <span>📄</span>
                                  <span className="truncate">{f.name}</span>
                                </div>
                              ))}
                            </div>
                            <div className="text-[9px] text-[#666] pt-1 border-t border-white/5 flex justify-between">
                              <span>Dokumenty</span>
                              <span className="text-emerald-400">● {cluster.count} plików</span>
                            </div>
                          </div>
                        ) : cluster.previewType === 'ARCHIVE_LIST' ? (
                          <div className="rounded-xl bg-[#0d0d12] border border-white/8 p-2.5 font-mono text-[10px] leading-relaxed text-[#bbb] overflow-hidden h-28 flex flex-col justify-between">
                            <div className="space-y-1 overflow-hidden">
                              {cluster.sample.slice(0, 3).map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5 truncate text-[10px] text-yellow-400">
                                  <span>📦</span>
                                  <span className="truncate">{f.name}</span>
                                </div>
                              ))}
                            </div>
                            <div className="text-[9px] text-[#666] pt-1 border-t border-white/5 flex justify-between">
                              <span>Paczki Archiwów</span>
                              <span className="text-yellow-400">● {cluster.count} archiwów</span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-[#0d0d12] border border-white/8 p-2.5 font-mono text-[10px] text-[#bbb] overflow-hidden h-28 flex flex-col justify-between">
                            <div className="space-y-1">
                              {cluster.sample.slice(0, 3).map((f, i) => (
                                <div key={i} className="truncate text-[10px] text-[#ccc]">
                                  📁 {f.name}
                                </div>
                              ))}
                            </div>
                            <div className="text-[9px] text-[#666] pt-1 border-t border-white/5 flex justify-between">
                              <span>Kolekcja</span>
                              <span className="text-purple-400">● {cluster.count} elementów</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 4. EKSPLORATOR ZASOBÓW & INTEGRATED INLINE GUIDED SEARCH */}
          <div className="space-y-4 pt-2">
            
            {/* Header of Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/35 flex items-center justify-center text-purple-300 shadow-inner">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-white tracking-tight">Eksplorator Zasobów & Aktywne Pliki</h2>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[10px] font-mono font-bold text-purple-300">
                      {displayedFiles.length.toLocaleString('pl-PL')} wyników
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-[#8e8e98]">
                    {activeLanguageFilter
                      ? `Filtr kategorii: ${dynamicCategories.find(c => c.id === activeLanguageFilter)?.label || activeLanguageFilter}`
                      : quickFormatFilter !== 'ALL'
                      ? `Szybki filtr formatu: ${quickFormatFilter}`
                      : 'Wszystkie zaindeksowane zasoby'} • Strona {page} z {Math.max(1, totalPages)}
                  </p>
                </div>
              </div>

              {/* View Mode & Zoom controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {viewMode === 'GRID' && (
                  <div className="flex items-center bg-[#18181f] border border-white/10 rounded-xl p-0.5 text-xs font-mono">
                    {(['SM', 'MD', 'LG'] as const).map(z => (
                      <button
                        key={z}
                        onClick={() => setGridZoom(z)}
                        className={`px-2 py-1 rounded-lg transition cursor-pointer text-[10px] font-bold ${
                          gridZoom === z 
                            ? 'bg-purple-600/40 text-purple-200 border border-purple-500/40 shadow-sm' 
                            : 'text-[#71717a] hover:text-white'
                        }`}
                        title={`Rozmiar miniatur: ${z}`}
                      >
                        {z}
                      </button>
                    ))}
                  </div>
                )}

                {/* 5 Database & Folder View Modes */}
                <div className="flex items-center bg-[#18181f] border border-white/10 rounded-xl p-0.5 text-xs">
                  <button
                    onClick={() => { setViewMode('LIST'); setSelectedYearFilter(null); }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'LIST' ? 'bg-purple-600/35 text-white font-bold border border-purple-500/40 shadow-sm' : 'text-[#8e8e98] hover:text-white'
                    }`}
                    title="Widok listy"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Lista</span>
                  </button>
                  <button
                    onClick={() => { setViewMode('GRID'); setSelectedYearFilter(null); }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'GRID' ? 'bg-purple-600/35 text-white font-bold border border-purple-500/40 shadow-sm' : 'text-[#8e8e98] hover:text-white'
                    }`}
                    title="Widok kafelków"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kafelki</span>
                  </button>
                  <button
                    onClick={() => { setViewMode('TABLE'); setSelectedYearFilter(null); }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'TABLE' ? 'bg-purple-600/35 text-white font-bold border border-purple-500/40 shadow-sm' : 'text-[#8e8e98] hover:text-white'
                    }`}
                    title="Tabela Notion (Baza Danych)"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tabela</span>
                  </button>
                  <button
                    onClick={() => { setViewMode('YEARS'); }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'YEARS' ? 'bg-purple-600/35 text-white font-bold border border-purple-500/40 shadow-sm' : 'text-[#8e8e98] hover:text-white'
                    }`}
                    title="Foldery wg Roczników (2022-2026)"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Roczniki</span>
                  </button>
                  <button
                    onClick={() => { setViewMode('KANBAN'); setSelectedYearFilter(null); }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'KANBAN' ? 'bg-purple-600/35 text-white font-bold border border-purple-500/40 shadow-sm' : 'text-[#8e8e98] hover:text-white'
                    }`}
                    title="Tablica Kanban wg kategorii i formatów"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kanban</span>
                  </button>
                </div>

                {/* Quick Sort Selector */}
                <div className="flex items-center gap-1 bg-[#18181f] border border-white/10 rounded-xl px-2.5 py-1 text-xs font-mono">
                  <ArrowUpDown className="w-3 h-3 text-purple-400 shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-[#ccc] hover:text-white outline-none cursor-pointer text-[11px]"
                    aria-label="Kryterium sortowania"
                  >
                    <option value="date" className="bg-[#18181c] text-white">Data modyfikacji</option>
                    <option value="name" className="bg-[#18181c] text-white">Nazwa pliku</option>
                    <option value="size" className="bg-[#18181c] text-white">Rozmiar</option>
                    <option value="ext" className="bg-[#18181c] text-white">Rozszerzenie</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="ml-1 p-0.5 rounded text-[10px] font-bold text-purple-300 hover:text-white hover:bg-white/10"
                    title={`Kierunek: ${sortOrder === 'asc' ? 'Rosnąco' : 'Malejąco'}`}
                    aria-label="Zmień kierunek sortowania"
                  >
                    {sortOrder === 'asc' ? '▲' : '▼'}
                  </button>
                </div>

                {/* Batch select toggle button */}
                <button
                  onClick={handleSelectAllVisible}
                  className={`px-2.5 py-1 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                    pagedFiles.length > 0 && pagedFiles.every(f => selectedBatchIds.includes(f.id))
                      ? 'bg-purple-600/35 border-purple-500/45 text-purple-200 font-bold'
                      : 'bg-[#18181f] border-white/10 text-[#8e8e98] hover:text-white'
                  }`}
                  title="Zaznacz / Odznacz wszystkie widoczne na stronie"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Zaznacz stronę</span>
                </button>
              </div>
            </div>

            {/* QUICK FORMAT FILTER PILL BAR */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: 'ALL', label: 'Wszystkie formaty', emoji: '✨', count: items.length },
                  { id: 'MEDIA', label: 'Multimedia & Grafika', emoji: '🖼️', count: dashboardStats.mediaCount },
                  { id: 'CODE', label: 'Kod & Skrypty', emoji: '⚡', count: dashboardStats.codeCount },
                  { id: 'DOCS', label: 'Dokumenty', emoji: '📄', count: dashboardStats.structureCounts.docs },
                  { id: 'ARCHIVE', label: 'Archiwa', emoji: '📦', count: dashboardStats.archiveCount },
                  { id: 'LARGE', label: 'Duże >10 MB', emoji: '🔥', count: dashboardStats.largeCount },
                ] as const).map((pill) => {
                  const isActive = quickFormatFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => { setQuickFormatFilter(pill.id); setPage(1); }}
                      className={`px-3 py-1 rounded-xl text-[11px] font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                        isActive
                          ? 'bg-purple-600/30 text-white font-bold border-purple-500/50 shadow-sm'
                          : 'bg-[#17171f]/80 text-[#9ca3af] hover:text-white border-white/8 hover:border-white/20'
                      }`}
                    >
                      <span>{pill.emoji}</span>
                      <span>{pill.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isActive ? 'bg-purple-500/30 text-purple-200' : 'bg-white/5 text-[#71717a]'}`}>
                        {pill.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(quickFormatFilter !== 'ALL' || activeLanguageFilter || searchFilter || activeTags.length > 0 || selectedYearFilter || Object.keys(guidedAnswers).length > 0) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3 py-1 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 text-rose-300 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>✕ Wyczyść aktywne filtry</span>
                </button>
              )}
            </div>

            {/* INTEGRATED INLINE GUIDED SEARCH BAR (No separate modal!) */}
            <InlineGuidedSearchBar
              query={searchFilter}
              onQueryChange={setSearchFilter}
              answers={guidedAnswers}
              onAnswersChange={setGuidedAnswers}
              totalIndexed={items.length}
              totalMatches={displayedFiles.length}
              domain={guidedData?.domain}
              isFinished={guidedData?.isFinished}
              nextQuestion={guidedData?.nextQuestion}
              history={guidedHistory}
              onHistoryChange={setGuidedHistory}
              onReset={handleResetFilters}
              activeTags={activeTags}
              onRemoveTag={handleTagClick}
              workspacePath={targetPath}
              onOpenFile={handleOpenInExplorer}
              candidateFiles={displayedFiles}
              onSelectFile={(file) => setSelectedItem(file)}
            />

            {/* SMART TAG MATRIX FILTER */}
            <TagMatrixFilter
              items={items}
              selectedTags={activeTags}
              onToggleTag={handleTagClick}
              onClearTags={() => {
                setActiveTags([]);
                setPage(1);
              }}
              onSelectCategory={(catId) => {
                toggleCategoryFilter(catId);
              }}
            />

            {/* 4. ACTIVE YEAR FILTER BREADCRUMB BANNER */}
            {selectedYearFilter && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-xs font-mono text-white animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <span className="text-[#a1a1aa]">Folder rocznika:</span>
                  <span className="font-bold text-white px-2 py-0.5 rounded bg-purple-600/30 border border-purple-500/40">
                    📁 Rocznik {selectedYearFilter}
                  </span>
                  <span className="text-purple-300">({displayedFiles.length.toLocaleString('pl-PL')} plików w tym folderze)</span>
                </div>
                <button
                  onClick={() => setSelectedYearFilter(null)}
                  className="px-3 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>✕ Wróć do wszystkich folderów</span>
                </button>
              </div>
            )}

            {/* EMPTY STATE WHEN NO FILES MATCH */}
            {pagedFiles.length === 0 && viewMode !== 'YEARS' && (
              <div className="py-14 px-6 rounded-2xl border border-white/10 bg-[#16161d]/80 text-center space-y-3 animate-fadeIn">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto text-xl">
                  🔍
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Brak plików spełniających obecne kryteria</h3>
                  <p className="text-xs font-mono text-[#8e8e98] max-w-md mx-auto">
                    Zmień zapytanie wyszukiwarki, przełącz szybki filtr formatu powyżej lub przywróć pełny indeks zasobów.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition cursor-pointer shadow-lg shadow-purple-950/50"
                >
                  Przywróć wszystkie pliki ({items.length.toLocaleString('pl-PL')})
                </button>
              </div>
            )}

            {/* 4A. YEARS FOLDER VIEW: 3D Folder Cards Grid */}
            {viewMode === 'YEARS' && !selectedYearFilter && (
              <div className="space-y-4 animate-fadeIn">
                <div className="text-xs font-mono text-[#a1a1aa] flex items-center justify-between">
                  <span>Wybierz folder rocznika, aby przeglądać pliki posegregowane chronologicznie:</span>
                  <span className="text-purple-300 font-bold">{yearClusters.length} roczników</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {yearClusters.map((cluster) => (
                    <div
                      key={cluster.year}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedYearFilter(cluster.year); setPage(1); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedYearFilter(cluster.year);
                          setPage(1);
                        }
                      }}
                      className="folder-card-glow rounded-2xl p-4 space-y-3 cursor-pointer transition flex flex-col justify-between group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
                            📁
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition">
                              Rocznik {cluster.year}
                            </h3>
                            <span className="text-[11px] font-mono text-[#71717a]">
                              {cluster.count.toLocaleString('pl-PL')} plików
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-[11px] font-mono text-purple-300 font-bold">
                          {cluster.weightLabel}
                        </span>
                      </div>

                      {/* Sample thumbnail previews inside folder */}
                      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-black/40 border border-white/5 h-16 overflow-hidden">
                        {cluster.sample.map((sampleFile, idx) => (
                          <div key={idx} className="w-full h-full rounded-lg overflow-hidden bg-black/60 flex items-center justify-center text-[10px]">
                            {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes((sampleFile.extension || '').toLowerCase()) ? (
                              <img
                                src={sampleFile.blobUrl || `/api/file/preview?path=${encodeURIComponent(sampleFile.path)}`}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              />
                            ) : (
                              <span className="text-[#71717a] font-mono font-bold uppercase text-[9px]">.{sampleFile.extension}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[#71717a] pt-1 border-t border-white/5">
                        <span>Otwórz folder rocznika</span>
                        <span className="text-purple-400 group-hover:translate-x-1 transition-transform">➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4B. NOTION DATABASE TABLE VIEW */}
            {viewMode === 'TABLE' && pagedFiles.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#16161d]/95 overflow-hidden shadow-xl animate-fadeIn font-mono">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="notion-db-table">
                    <thead>
                      <tr>
                        <th className="w-10 text-center">
                          <button onClick={handleSelectAllVisible} className="cursor-pointer">
                            {pagedFiles.length > 0 && pagedFiles.every(f => selectedBatchIds.includes(f.id)) ? (
                              <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-[#52525b]" />
                            )}
                          </button>
                        </th>
                        <th className="w-12 text-center">Podgląd</th>
                        <th>Nazwa pliku</th>
                        <th>Katalog</th>
                        <th>Format</th>
                        <th>Rocznik</th>
                        <th>Waga</th>
                        <th>Modyfikacja</th>
                        <th className="text-right">Szybkie Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFiles.map((file) => {
                        const isSelected = selectedItem?.id === file.id;
                        const isBatchChecked = selectedBatchIds.includes(file.id);
                        const isPinned = pinnedIds.includes(file.id);
                        const ext = (file.extension || '').toLowerCase();
                        const yr = extractYear(file.name, file.mtime);
                        const dateFormatted = file.mtime ? new Date(file.mtime).toLocaleDateString('pl-PL') : '-';
                        return (
                          <tr
                            key={file.id}
                            tabIndex={0}
                            onClick={() => setSelectedItem(file)}
                            onDoubleClick={() => setQuickLookItem(file)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedItem(file);
                              }
                            }}
                            className={`nexus-virtual-row cursor-pointer transition ${isSelected ? 'selected' : ''}`}
                          >
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={(e) => handleToggleBatch(file.id, e)}
                                aria-label={`Zaznacz plik: ${file.name}`}
                                className="p-1 cursor-pointer inline-flex items-center justify-center"
                              >
                                {isBatchChecked ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-purple-400 mx-auto" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-[#52525b] hover:text-white mx-auto" />
                                )}
                              </button>
                            </td>
                            <td className="text-center">
                              <div className="w-6 h-6 rounded mx-auto overflow-hidden bg-black/60 flex items-center justify-center">
                                {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? (
                                  <img src={file.blobUrl || `/api/file/preview?path=${encodeURIComponent(file.path)}`} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] text-purple-300 uppercase font-bold">.{ext}</span>
                                )}
                              </div>
                            </td>
                            <td className="font-semibold text-white truncate max-w-xs" title={file.name}>
                              <div className="flex items-center gap-1.5">
                                {isPinned && <span className="text-amber-400 text-xs">⭐</span>}
                                <span className="truncate">{file.name}</span>
                              </div>
                            </td>
                            <td className="text-[#71717a] truncate max-w-[180px]" title={file.path}>
                              {file.path.split('\\').slice(-2, -1)[0] || 'Downloads'}
                            </td>
                            <td>
                              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-purple-300 font-bold uppercase text-[10px]">
                                .{ext}
                              </span>
                            </td>
                            <td>
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px]">
                                {yr}
                              </span>
                            </td>
                            <td className="text-[#a1a1aa] whitespace-nowrap">
                              {formatFileSize(file.size)}
                            </td>
                            <td className="text-[#71717a] whitespace-nowrap">
                              {dateFormatted}
                            </td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                                  className="p-1 rounded text-[#71717a] hover:text-purple-300 hover:bg-white/10 transition"
                                  title="QuickLook (Spacja)"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                                  className={`p-1 rounded hover:bg-white/10 transition ${isPinned ? 'text-amber-400' : 'text-[#71717a] hover:text-white'}`}
                                  title="Ulubione"
                                >
                                  <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleQuickMove(file); }}
                                  className="p-1 rounded text-[#71717a] hover:text-emerald-400 hover:bg-white/10 transition"
                                  title="Zapisz do projektu"
                                >
                                  <FolderInput className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleInstantDelete(file); }}
                                  className="p-1 rounded text-[#71717a] hover:text-red-400 hover:bg-white/10 transition"
                                  title="Usuń"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4C. LIST VIEW (POLISHED & FAST ACTIONS ON HOVER - PILLAR 5) */}
            {(viewMode === 'LIST' || (viewMode === 'YEARS' && selectedYearFilter)) && pagedFiles.length > 0 && (
              <div className="space-y-1.5">
                {pagedFiles.map((file) => {
                  const isSelected = selectedItem?.id === file.id;
                  const isBatchChecked = selectedBatchIds.includes(file.id);
                  const isPinned = pinnedIds.includes(file.id);
                  const ext = (file.extension || '').toLowerCase();
                  const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext);
                  const isCode = ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'html', 'css', 'sql', 'md', 'yml', 'yaml'].includes(ext);
                  const isZip = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);

                  // Extract concise parent folder
                  const parentDir = file.path.includes('\\')
                    ? file.path.substring(0, file.path.lastIndexOf('\\')).split('\\').slice(-2).join('/')
                    : file.path.includes('/')
                    ? file.path.substring(0, file.path.lastIndexOf('/')).split('/').slice(-2).join('/')
                    : '';

                  const badgeLabel = ['tsx', 'ts'].includes(ext) ? 'TSX' :
                                     ['jsx', 'js'].includes(ext) ? 'JS' :
                                     ['zip', 'rar', '7z'].includes(ext) ? 'ZIP' :
                                     ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? 'IMG' : ext.toUpperCase() || 'FILE';

                  const badgeColor = badgeLabel === 'TSX' ? 'bg-blue-600/25 text-blue-300 border-blue-500/35' :
                                     badgeLabel === 'JS' ? 'bg-amber-600/25 text-amber-300 border-amber-500/35' :
                                     badgeLabel === 'ZIP' ? 'bg-yellow-600/25 text-yellow-300 border-yellow-500/35' :
                                     badgeLabel === 'IMG' ? 'bg-purple-600/25 text-purple-300 border-purple-500/35' : 'bg-white/5 text-zinc-300 border-white/10';

                  return (
                    <div
                      key={file.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedItem(file)}
                      onDoubleClick={() => setQuickLookItem(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedItem(file);
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                      className={`nexus-virtual-row group relative flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all duration-150 cursor-pointer text-xs font-mono border ${
                        isSelected 
                          ? 'bg-gradient-to-r from-purple-950/45 via-[#1d192b] to-[#171720] border-purple-500/60 text-white shadow-md ring-1 ring-purple-500/30' 
                          : isPinned
                          ? 'bg-amber-950/20 border-amber-500/35 text-[#e6e5e3]'
                          : isBatchChecked
                          ? 'bg-purple-950/25 border-purple-500/40 text-white'
                          : 'bg-[#16161d]/85 hover:bg-[#1d1d26] border-white/6 hover:border-white/15 text-[#ccc]'
                      }`}
                    >
                      {/* Left: Checkbox + Thumbnail/Icon + Name + Folder + Tags */}
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <button
                          onClick={(e) => handleToggleBatch(file.id, e)}
                          className="text-[#52525b] hover:text-white cursor-pointer"
                        >
                          {isBatchChecked ? (
                            <CheckSquare className="w-4 h-4 text-purple-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        <div className="w-8 h-8 rounded-xl overflow-hidden bg-[#0e0e14] border border-white/10 shrink-0 flex items-center justify-center shadow-inner">
                          {isImg ? (
                            <img 
                              src={file.blobUrl || `/api/file/preview?path=${encodeURIComponent(file.path)}`}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : isCode ? (
                            <FileCode className="w-4 h-4 text-blue-400" />
                          ) : isZip ? (
                            <FileArchive className="w-4 h-4 text-yellow-400" />
                          ) : (
                            <span className="text-purple-300 text-xs font-bold uppercase">.{ext.slice(0, 3) || ' Plik'}</span>
                          )}
                        </div>

                        <div className="min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            {isPinned && <span className="text-amber-400 text-xs shrink-0" title="Przypięty na stałe">⭐</span>}
                            <span className="font-semibold text-white truncate text-[12px] group-hover:text-purple-300 transition" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-[10px] text-[#777] font-mono mt-0.5">
                            <span className="truncate max-w-[240px] text-[#8e8e98]" title={file.path}>📂 {parentDir || 'Downloads'}</span>
                            <span className="text-blue-400/80">📅 {extractYear(file.name, file.mtime)}</span>
                            {file.tags && file.tags.length > 0 && (
                              <span className="text-purple-400/80 hidden sm:inline">{file.tags.slice(0, 2).join(' ')}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Fast Actions Bar (on Hover) + Size + Badge */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* FAST ACTIONS BAR */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-[#111116]/95 border border-white/15 rounded-xl px-1.5 py-0.5 shadow-lg">
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                            className="p-1 rounded-lg text-[#9ca3af] hover:text-purple-300 hover:bg-white/10 transition"
                            title="👁️ Szybki podgląd QuickLook (Spacja)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isCode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isProLicensed) {
                                  openProModal();
                                  addToast('info', '👑 Monaco Code Studio jest w Nexus PRO', 'W wersji Free masz podgląd QuickLook (Spacja). Odblokuj PRO do edycji.');
                                } else {
                                  setCodeStudioItem(file);
                                }
                              }}
                              className="p-1 rounded-lg text-[#9ca3af] hover:text-blue-400 hover:bg-white/10 transition relative"
                              title={isProLicensed ? '⚡ Otwórz w Monaco Code Studio' : '🔒 Edycja kodu w Monaco Studio (Tylko PRO)'}
                            >
                              <FileCode className="w-3.5 h-3.5" />
                              {!isProLicensed && <span className="absolute -top-1 -right-1 text-[8px] text-amber-400 font-bold">★</span>}
                            </button>
                          )}
                          {isImg && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isProLicensed) {
                                  openProModal();
                                  addToast('info', '👑 Nexus Image Studio jest w Nexus PRO', 'W wersji Free masz podgląd QuickLook (Spacja). Odblokuj PRO do edycji.');
                                } else {
                                  setImageStudioItem(file);
                                }
                              }}
                              className="p-1 rounded-lg text-[#9ca3af] hover:text-fuchsia-400 hover:bg-white/10 transition relative"
                              title={isProLicensed ? '🎨 Otwórz w Image Studio' : '🔒 Edycja obrazów w Image Studio (Tylko PRO)'}
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              {!isProLicensed && <span className="absolute -top-1 -right-1 text-[8px] text-amber-400 font-bold">★</span>}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                            className={`p-1 rounded-lg hover:bg-white/10 transition ${isPinned ? 'text-amber-400' : 'text-[#9ca3af] hover:text-white'}`}
                            title={isPinned ? 'Odepnij z góry' : '⭐ Przypnij na górze'}
                          >
                            <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuickMove(file); }}
                            className="p-1 rounded-lg text-[#9ca3af] hover:text-emerald-400 hover:bg-white/10 transition"
                            title="💾 Zapisz do Projektu (Quick Move)"
                          >
                            <FolderInput className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInstantDelete(file); }}
                            className="p-1 rounded-lg text-[#9ca3af] hover:text-red-400 hover:bg-white/10 transition"
                            title="🗑️ Usuń plik"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="text-[11px] text-[#9ca3af] hidden md:inline font-mono min-w-[64px] text-right">
                          {formatFileSize(file.size)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border font-mono min-w-[44px] text-center ${badgeColor}`}>
                          {badgeLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4D. GRID VIEW (BOUNDED WITH FAST ACTIONS ON HOVER & DYNAMIC ZOOM) */}
            {viewMode === 'GRID' && pagedFiles.length > 0 && (
              <div className={`grid ${
                gridZoom === 'SM'
                  ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2'
                  : gridZoom === 'LG'
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              }`}>
                {pagedFiles.map((file) => {
                  const isSelected = selectedItem?.id === file.id;
                  const isBatchChecked = selectedBatchIds.includes(file.id);
                  const isPinned = pinnedIds.includes(file.id);
                  return (
                    <div
                      key={file.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedItem(file)}
                      onDoubleClick={() => setQuickLookItem(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedItem(file);
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                      className={`nexus-virtual-card group relative rounded-2xl border p-2.5 space-y-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                        isSelected
                          ? 'border-purple-500 bg-purple-950/35 ring-1 ring-purple-500/50 shadow-xl scale-[1.01]'
                          : isPinned
                          ? 'border-amber-500/40 bg-amber-950/20'
                          : isBatchChecked
                          ? 'border-purple-500/50 bg-purple-950/25'
                          : 'border-white/8 hover:border-purple-500/35 bg-[#16161d]/90 hover:bg-[#1e1e28] shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      {/* Checkbox badge on top-left of card */}
                      <button
                        onClick={(e) => handleToggleBatch(file.id, e)}
                        className={`absolute top-3 left-3 z-10 p-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 transition cursor-pointer ${
                          isBatchChecked ? 'text-purple-400' : 'text-[#a1a1aa] opacity-0 group-hover:opacity-100 hover:text-white'
                        }`}
                      >
                        {isBatchChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>

                      {/* Grid Fast Actions Overlay on Hover */}
                      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/85 backdrop-blur-md border border-white/15 rounded-xl p-1 shadow-xl">
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                          className="p-1.5 rounded-lg text-white hover:text-purple-300 hover:bg-white/20 transition"
                          title="👁️ QuickLook (Spacja)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                          className={`p-1.5 rounded-lg hover:bg-white/20 transition ${isPinned ? 'text-amber-400' : 'text-white'}`}
                          title="⭐ Przypnij na górze"
                        >
                          <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickMove(file); }}
                          className="p-1.5 rounded-lg text-white hover:text-emerald-400 hover:bg-white/20 transition"
                          title="💾 Quick Move do projektu"
                        >
                          <FolderInput className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleInstantDelete(file); }}
                          className="p-1.5 rounded-lg text-white hover:text-red-400 hover:bg-white/20 transition"
                          title="🗑️ Usuń plik"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <LazyThumbnail
                        file={file}
                        path={file.path}
                        name={file.name}
                        extension={file.extension}
                        category={file.category}
                        aspectRatio="square"
                      />
                      <div className="space-y-0.5 text-left min-w-0 px-1 pb-0.5">
                        <div className="flex items-center gap-1">
                          {isPinned && <span className="text-amber-400 text-xs shrink-0">⭐</span>}
                          <p className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition" title={file.name}>
                            {file.name}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#8e8e98]">
                          <span>{formatFileSize(file.size)}</span>
                          <span className="uppercase text-purple-400 font-bold">.{file.extension}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4E. KANBAN CATEGORY BOARD VIEW */}
            {viewMode === 'KANBAN' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start pb-4">
                {[
                  {
                    id: 'MEDIA',
                    label: 'MULTIMEDIA',
                    icon: '🖼️',
                    color: 'purple',
                    border: 'border-purple-500/30',
                    headerBg: 'bg-purple-950/30 text-purple-300',
                    items: pagedFiles.filter(f => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'flac'].includes((f.extension || '').toLowerCase()))
                  },
                  {
                    id: 'CODE',
                    label: 'KOD & PROJEKTY',
                    icon: '⚡',
                    color: 'emerald',
                    border: 'border-emerald-500/30',
                    headerBg: 'bg-emerald-950/30 text-emerald-300',
                    items: pagedFiles.filter(f => ['js', 'jsx', 'ts', 'tsx', 'json', 'py', 'html', 'css', 'go', 'rs', 'cpp', 'c', 'cs', 'java', 'sql', 'yaml', 'yml'].includes((f.extension || '').toLowerCase()))
                  },
                  {
                    id: 'ARCHIVE',
                    label: 'ARCHIWA',
                    icon: '📦',
                    color: 'amber',
                    border: 'border-amber-500/30',
                    headerBg: 'bg-amber-950/30 text-amber-300',
                    items: pagedFiles.filter(f => ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso'].includes((f.extension || '').toLowerCase()))
                  },
                  {
                    id: 'DOCS',
                    label: 'DOKUMENTY',
                    icon: '📄',
                    color: 'blue',
                    border: 'border-blue-500/30',
                    headerBg: 'bg-blue-950/30 text-blue-300',
                    items: pagedFiles.filter(f => ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'csv', 'xlsx', 'pptx'].includes((f.extension || '').toLowerCase()))
                  },
                  {
                    id: 'OTHER',
                    label: 'POZOSTAŁE',
                    icon: '📂',
                    color: 'neutral',
                    border: 'border-white/10',
                    headerBg: 'bg-white/5 text-zinc-300',
                    items: pagedFiles.filter(f => {
                      const ext = (f.extension || '').toLowerCase();
                      const isKnown = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'flac',
                        'js', 'jsx', 'ts', 'tsx', 'json', 'py', 'html', 'css', 'go', 'rs', 'cpp', 'c', 'cs', 'java', 'sql', 'yaml', 'yml',
                        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso',
                        'pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'csv', 'xlsx', 'pptx'].includes(ext);
                      return !isKnown;
                    })
                  }
                ].map((col) => {
                  const colTotalBytes = col.items.reduce((acc, curr) => acc + (curr.size || 0), 0);
                  const colTotalFormatted = formatFileSize(colTotalBytes);

                  return (
                    <div
                      key={col.id}
                      className={`flex flex-col bg-[#121215]/80 backdrop-blur-md rounded-2xl border ${col.border} p-3 min-h-[420px] max-h-[780px]`}
                    >
                      {/* Column Header */}
                      <div className={`flex items-center justify-between p-2.5 rounded-xl ${col.headerBg} border border-white/5 mb-3`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{col.icon}</span>
                          <span className="text-xs font-bold tracking-wider uppercase font-mono">{col.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono opacity-70">{colTotalFormatted}</span>
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                            {col.items.length}
                          </span>
                        </div>
                      </div>

                      {/* Column Cards (Scrollable) */}
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {col.items.length === 0 ? (
                          <div className="py-12 text-center text-xs text-zinc-600 font-mono italic">
                            Brak plików w tej kolumnie
                          </div>
                        ) : (
                          col.items.map((file) => {
                            const isSelected = selectedItem?.id === file.id;
                            const isPinned = pinnedIds.includes(file.id);
                            return (
                              <div
                                key={file.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedItem(file)}
                                onDoubleClick={() => setQuickLookItem(file)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedItem(file);
                                  }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, file)}
                                className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                                  isSelected
                                    ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/50 shadow-lg'
                                    : isPinned
                                    ? 'bg-amber-950/20 border-amber-500/40'
                                    : 'bg-[#18181c]/90 hover:bg-[#202026] border-white/5 hover:border-white/15'
                                }`}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-black/50 border border-white/10">
                                    <LazyThumbnail
                                      file={file}
                                      path={file.path}
                                      name={file.name}
                                      extension={file.extension}
                                      category={file.category}
                                      aspectRatio="square"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      {isPinned && <span className="text-amber-400 text-xs shrink-0">⭐</span>}
                                      <p className="text-xs font-medium text-white truncate group-hover:text-purple-300 transition" title={file.name}>
                                        {file.name}
                                      </p>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-1">
                                      <span className="uppercase font-semibold text-purple-400">.{file.extension}</span>
                                      <span>{formatFileSize(file.size)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Hover fast actions */}
                                <div className="mt-2 pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                                    className={`p-1 rounded hover:bg-white/10 text-xs ${isPinned ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}
                                    title="⭐ Pin"
                                  >
                                    <Star className="w-3 h-3" fill={isPinned ? 'currentColor' : 'none'} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                                    className="p-1 rounded hover:bg-white/10 text-xs text-zinc-400 hover:text-white"
                                    title="QuickLook"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleQuickMove(file); }}
                                    className="p-1 rounded hover:bg-white/10 text-xs text-zinc-400 hover:text-emerald-400"
                                    title="Przenieś"
                                  >
                                    <FolderInput className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleInstantDelete(file); }}
                                    className="p-1 rounded hover:bg-white/10 text-xs text-zinc-400 hover:text-red-400"
                                    title="Usuń"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4C. BOUNDED PAGINATION CONTROLS */}
            <div className="pt-2">
              <PaginationControls
                page={page}
                limit={limit}
                totalItems={displayedFiles.length}
                totalPages={totalPages}
                hasPrev={page > 1}
                hasNext={page < totalPages}
                onPageChange={(p) => setPage(p)}
                onLimitChange={(l) => { setLimit(l); setPage(1); }}
                showingCount={pagedFiles.length}
              />
            </div>

          </div>

        </div>
      </main>

      {/* 5. PERSISTENT RIGHT PANEL: METADATA & PREVIEW (EXACT SCREENSHOT 1) */}
      {isDrawerOpen && (
        <NexusRightMetadataDrawer
          item={selectedItem}
          onClose={() => setIsDrawerOpen(false)}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={handleOpenInExplorer}
          onCopyPath={handleCopyPath}
          onSendDiscord={handleSendDiscordPhotoshop}
          onTagClick={handleTagClick}
          activeTags={activeTags}
          onPinToggle={handlePinToggle}
          isPinned={selectedItem ? pinnedIds.includes(selectedItem.id) : false}
          onInstantDelete={handleInstantDelete}
          onQuickMove={handleQuickMove}
          onQuickLook={(f) => setQuickLookItem(f)}
          onOpenCodeEditor={(f) => setCodeStudioItem(f)}
          onOpenImageEditor={(f) => setImageStudioItem(f)}
          aiStatus={aiStatus}
          isHudExpanded={!isHudCollapsed}
          onOpenAiSettings={() => setIsAdvanceModalOpen(true)}
        />
      )}

      {/* DESKTOP CONTEXT MENU (ON RIGHT CLICK) */}
      {contextMenu && (
        <DesktopContextMenu
          item={contextMenu.item}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={handleOpenInExplorer}
          onCopyPath={handleCopyPath}
          onCopyName={handleCopyName}
          onSendDiscord={handleSendDiscordPhotoshop}
          onCalculateHash={handleCalculateHash}
          onQuickLook={(f) => setQuickLookItem(f)}
          onOpenCodeEditor={(f) => setCodeStudioItem(f)}
          onOpenImageEditor={(f) => setImageStudioItem(f)}
        />
      )}

      {/* QUICKLOOK LIGHTBOX (SPACEBAR) */}
      {quickLookItem && (
        <QuickLookModal
          item={quickLookItem}
          onClose={() => setQuickLookItem(null)}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={handleOpenInExplorer}
          onOpenCodeEditor={(f) => setCodeStudioItem(f)}
          onOpenImageEditor={(f) => setImageStudioItem(f)}
          onPrev={() => {
            const index = displayedFiles.findIndex(file => file.id === quickLookItem.id);
            if (index > 0) {
              const previous = displayedFiles[index - 1];
              setQuickLookItem(previous);
              setSelectedItem(previous);
              setPage(Math.floor((index - 1) / limit) + 1);
            }
          }}
          onNext={() => {
            const index = displayedFiles.findIndex(file => file.id === quickLookItem.id);
            if (index >= 0 && index < displayedFiles.length - 1) {
              const next = displayedFiles[index + 1];
              setQuickLookItem(next);
              setSelectedItem(next);
              setPage(Math.floor((index + 1) / limit) + 1);
            }
          }}
        />
      )}

      {/* TOAST NOTIFICATION DOCK */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
      />

      {/* FLOATING BATCH ACTION DOCK (MULTI-SELECT) */}
      {selectedBatchIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] batch-floating-dock rounded-2xl px-5 py-3 flex items-center gap-4 text-xs font-mono shadow-2xl">
          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
            <span className="text-white font-bold">
              Zaznaczono {selectedBatchIds.length} plików
            </span>
            <span className="text-[#a1a1aa]">({batchTotalMB} MB)</span>
          </div>

          <button
            onClick={handleBatchPin}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Przypnij zaznaczone pliki do góry"
          >
            <Star className="w-3.5 h-3.5" />
            <span>Przypnij ({selectedBatchIds.length})</span>
          </button>

          <button
            onClick={handleBatchMoveToProject}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Przenieś pliki do folderu projektu"
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span>Zapisz do projektu</span>
          </button>

          <button
            onClick={handleBatchDelete}
            className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Błyskawicznie usuń zaznaczone pliki z dysku"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Usuń ({selectedBatchIds.length})</span>
          </button>

          <button
            onClick={() => setSelectedBatchIds([])}
            className="p-1.5 rounded-xl hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer ml-1"
            title="Odznacz wszystkie"
          >
            ✕
          </button>
        </div>
      )}

      {/* 6. MODALS FOR CORE V2 (Instant Actions & Strażnik) */}
      <CreateItemModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        targetDir={targetPath}
        onItemCreated={(newItem) => {
          if (onItemCreated) onItemCreated(newItem);
          addToast('success', '📁 Utworzono pomyślnie!', newItem.name);
        }}
      />

      <AdvanceSettingsModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        targetPath={targetPath}
        onOpenQuarantine={() => setIsQuarantineModalOpen(true)}
        onOpenGhostCleaner={() => setIsGhostCleanerOpen(true)}
        onOpenDeduplicator={() => setIsDeduplicatorOpen(true)}
        onToast={addToast}
      />

      <SmartShieldQuarantineModal
        isOpen={isQuarantineModalOpen}
        onClose={() => setIsQuarantineModalOpen(false)}
        onToast={addToast}
        onRestoreThreat={(item) => {
          addToast('info', 'Przywrócono plik z kwarantanny', item.name);
        }}
      />

      <GhostCleanerModal
        isOpen={isGhostCleanerOpen}
        onClose={() => setIsGhostCleanerOpen(false)}
        onToast={addToast}
        onPurged={() => addToast('success', 'Wyczyszczono zbędne pliki cache')}
      />

      <DeduplicatorModal
        isOpen={isDeduplicatorOpen}
        onClose={() => setIsDeduplicatorOpen(false)}
        onToast={addToast}
        onPurged={() => addToast('success', 'Usunięto zduplikowane pliki')}
      />

      {/* 7. NEXUS CODE STUDIO (VS Code / Monaco Engine) */}
      {codeStudioItem && (
        <NexusCodeStudioModal
          item={codeStudioItem}
          onClose={() => setCodeStudioItem(null)}
          onOpenInExplorer={handleOpenInExplorer}
          onSaved={(savedData) => {
            addToast('success', '💾 Zapisano w Nexus Code Studio', `Zaktualizowano plik: ${codeStudioItem.name}`);
          }}
        />
      )}

      {/* 8. NEXUS IMAGE STUDIO (Canvas 2D / Filters Engine) */}
      {imageStudioItem && (
        <NexusImageStudioModal
          item={imageStudioItem}
          onClose={() => setImageStudioItem(null)}
          onOpenInExplorer={onOpenInExplorer}
          onSaved={(savedData) => {
            addToast('success', '🎨 Zapisano w Nexus Image Studio', `Zaktualizowano grafikę: ${imageStudioItem.name}`);
          }}
        />
      )}

      {/* 9. NEXUS OLLAMA AI CHAT DRAWER */}
      <NexusOllamaChatDrawer
        isOpen={isOllamaChatOpen}
        onClose={() => setIsOllamaChatOpen(false)}
        workspacePath={targetPath}
        items={items}
        selectedItem={selectedItem}
        onOpenFile={(path) => onOpenInExplorer(path)}
        aiStatus={aiStatus}
      />

      {/* 10. OLLAMA INTELLIGENT TAGGING MODAL */}
      <OllamaSmartTaggingModal
        isOpen={isSmartTaggingModalOpen}
        onClose={() => setIsSmartTaggingModalOpen(false)}
        items={items}
        isProLicensed={isProLicensed}
        onOpenProModal={() => openProModal()}
        onApplyTags={(updatedItems) => {
          addToast('success', `🏷️ Zaktualizowano tagi dla ${updatedItems.length} plików`, 'Nowe tagi i kategorie zapisane w indeksie.');
        }}
      />

      {/* 11. NEXUS PRO CHECKOUT & LICENSE ACTIVATION MODAL (Fallback only if no parent modal handler) */}
      {!propOnOpenProModal && (
        <NexusProModal
          isOpen={isProModalOpen}
          onClose={() => setIsProModalOpen(false)}
          onProActivated={() => {
            setLocalIsProLicensed(true);
            addToast('success', '👑 Gratulacje! Wersja Nexus PRO została odblokowana', 'Dożywotni dostęp do wszystkich funkcji premium.');
          }}
        />
      )}

    </div>
  );
};
