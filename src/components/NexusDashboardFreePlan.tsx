import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, 
  FolderSync, 
  ExternalLink, 
  Search, 
  ChevronRight, 
  FileCode, 
  HardDrive, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Activity, 
  Archive, 
  Monitor,
  LayoutGrid,
  List,
  Eye,
  SlidersHorizontal,
  RotateCcw,
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
  Lock,
  X,
  AlertTriangle,
  Info,
  Sparkles
} from 'lucide-react';
import { FileItem, AutonomousBlueprint, ExplorerSubView, CategoryType } from '../types';
import { TagMatrixFilter } from './TagMatrixFilter';
import { pickDirectoryWithFSA } from '../utils/fileSystemAccessManager';
import { nexusApi } from '../utils/nexusAuth';
import { DesktopContextMenu } from './DesktopContextMenu';
import { QuickLookModal } from './QuickLookModal';
import { NexusRightMetadataDrawer } from './NexusRightMetadataDrawer';
import { ToastContainer, ToastMessage } from './ToastNotification';
import { LazyThumbnail } from './LazyThumbnail';
import { AdvanceSettingsModal } from './AdvanceSettingsModal';
import { SmartShieldQuarantineModal } from './SmartShieldQuarantineModal';
import { GhostCleanerModal } from './GhostCleanerModal';
import { DeduplicatorModal } from './DeduplicatorModal';
import { NexusProModal } from './NexusProModal';
import { 
  buildDynamicCategories, 
  buildSmartClusterCards, 
  DynamicCategory, 
  SmartClusterCard,
  detectArchetype,
  extractYear
} from '../utils/dynamicCategorizer';

export interface NexusDashboardHubProps {
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

export type ViewMode = 'LIST' | 'GRID' | 'TABLE' | 'YEARS' | 'KANBAN';
export type SortOption = 'NAME_ASC' | 'NAME_DESC' | 'SIZE_DESC' | 'SIZE_ASC' | 'DATE_DESC' | 'DATE_ASC' | 'TYPE';

// Official Plan Limits
const FREE_LIMIT_BYTES = 50 * 1_000_000_000; // 50 GB (1 GB = 1,000,000,000 bytes)
const FREE_LIMIT_FILES = 15_000;
const PRO_MAX_BYTES = 5000 * 1_000_000_000; // 5000 GB (5 TB)

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export const NexusDashboardFreePlan: React.FC<NexusDashboardHubProps> = ({
  items,
  targetPath,
  blueprint,
  onOpenWorkspace,
  onOpenInExplorer,
  onOpenGuidedSearch,
  shieldReport,
  onChangeTargetFolder,
  onFsaLoaded,
  onNavigateToView,
  onGoToWebsite,
  onOpenProModal
}) => {
  // Navigation & Layout States
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLimitNoticeDismissed, setIsLimitNoticeDismissed] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [isTagMatrixOpen, setIsTagMatrixOpen] = useState(false);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLanguageFilter, setActiveLanguageFilter] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('NAME_ASC');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string | null>(null);
  const [quickFormatFilter, setQuickFormatFilter] = useState<string>('ALL');

  // Selection & Items States
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_pinned_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Modals & Popups
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState(false);
  const [isGhostCleanerOpen, setIsGhostCleanerOpen] = useState(false);
  const [isDeduplicatorOpen, setIsDeduplicatorOpen] = useState(false);
  const [quickLookItem, setQuickLookItem] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileItem } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Debounced search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 120);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Open Pro modal helper
  const openProModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onOpenProModal) {
      onOpenProModal();
    } else {
      setIsProModalOpen(true);
    }
  };

  // Toast notification helper
  const addToast = (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => {
    const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
    const id = `${Date.now()}-${randomSuffix}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }]);
  };

  // Save pinned IDs
  useEffect(() => {
    try {
      localStorage.setItem('nexus_pinned_ids', JSON.stringify(pinnedIds));
    } catch {
      // ignore localstorage quota errors
    }
  }, [pinnedIds]);

  // Free Tier Metrics & Limit Verification
  const totalBytes = useMemo(() => items.reduce((acc, f) => acc + (f.size || 0), 0), [items]);
  const isSizeLimitExceeded = totalBytes > FREE_LIMIT_BYTES;
  const isFilesLimitExceeded = items.length > FREE_LIMIT_FILES;
  const isLimitViolated = isSizeLimitExceeded || isFilesLimitExceeded;

  const freeSizePercent = Math.min(100, Math.round((totalBytes / FREE_LIMIT_BYTES) * 100));
  const freeFilesPercent = Math.min(100, Math.round((items.length / FREE_LIMIT_FILES) * 100));

  // Extract folder name
  const targetFolderName = useMemo(() => {
    if (!targetPath) return 'Nie wybrano';
    const normalized = targetPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : targetPath;
  }, [targetPath]);

  // Calculate Dynamic Categories & Smart Clusters
  const dynamicCategories = useMemo(() => buildDynamicCategories(items), [items]);
  const smartClusterCards = useMemo(() => buildSmartClusterCards(items), [items]);

  // Global Telemetry Metrics
  const dashboardStats = useMemo(() => {
    let images = 0;
    let code = 0;
    let archives = 0;
    let docs = 0;

    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      const cat = f.category;
      if (cat === 'MEDIA' || cat === 'SCREENSHOT') images++;
      else if (cat === 'DEV') code++;
      else if (cat === 'ARCHIVES') archives++;
      else if (cat === 'DOCS') docs++;
    }

    return {
      totalCount: items.length,
      totalBytes,
      sizeLabel: formatFileSize(totalBytes),
      imagesCount: images,
      codeCount: code,
      archivesCount: archives,
      docsCount: docs,
      pinnedCount: pinnedIds.length
    };
  }, [items, totalBytes, pinnedIds]);

  // Keyboard Shortcuts (Space for QuickLook, Esc to close, Ctrl+I for Inspector)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.code === 'Space' && selectedItem) {
        e.preventDefault();
        setQuickLookItem(prev => (prev?.id === selectedItem.id ? null : selectedItem));
      } else if (e.key === 'Escape') {
        if (quickLookItem) setQuickLookItem(null);
        if (contextMenu) setContextMenu(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsDrawerOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, quickLookItem, contextMenu]);

  // Toggle category filter
  const toggleCategoryFilter = (catId: string) => {
    setActiveLanguageFilter(prev => (prev === catId ? null : catId));
    setPage(1);
  };

  // Toggle tag filter
  const handleTagToggle = (tagId: string) => {
    setActiveTags(prev => 
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
    setPage(1);
  };

  // Filtered & Sorted items
  const filteredFiles = useMemo(() => {
    let list = [...items];

    // Search filter
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase().trim();
      list = list.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.path.toLowerCase().includes(q) ||
        (f.extension && f.extension.toLowerCase().includes(q))
      );
    }

    // Quick Format Filter
    if (quickFormatFilter !== 'ALL') {
      if (quickFormatFilter === 'MEDIA') {
        list = list.filter(f => f.category === 'MEDIA' || f.category === 'SCREENSHOT');
      } else if (quickFormatFilter === 'CODE') {
        list = list.filter(f => f.category === 'DEV');
      } else if (quickFormatFilter === 'DOCS') {
        list = list.filter(f => f.category === 'DOCS');
      } else if (quickFormatFilter === 'ARCHIVES') {
        list = list.filter(f => f.category === 'ARCHIVES');
      } else if (quickFormatFilter === 'LARGE') {
        list = list.filter(f => (f.size || 0) >= 10_000_000);
      }
    }

    // Dynamic Category / Smart Cluster filter
    if (activeLanguageFilter) {
      if (activeLanguageFilter === 'pinned') {
        list = list.filter(f => pinnedIds.includes(f.id));
      } else {
        const foundDyn = dynamicCategories.find(c => c.id === activeLanguageFilter);
        if (foundDyn) {
          list = list.filter(foundDyn.filter);
        } else {
          const foundCluster = smartClusterCards.find(c => c.id === activeLanguageFilter);
          if (foundCluster) {
            list = list.filter(foundCluster.filter);
          } else {
            list = list.filter(f => f.category === activeLanguageFilter);
          }
        }
      }
    }

    // Active Tags filter
    if (activeTags.length > 0) {
      list = list.filter(f => f.tags && activeTags.every(t => f.tags!.includes(t)));
    }

    // Single Tag filter
    if (selectedTag) {
      list = list.filter(f => f.tags && f.tags.includes(selectedTag));
    }

    // Year filter (in Years view)
    if (selectedYearFilter) {
      list = list.filter(f => extractYear(f.name, f.mtime) === selectedYearFilter);
    }

    // Sorting
    list.sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      switch (sortOption) {
        case 'NAME_ASC':
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'NAME_DESC':
          return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'SIZE_DESC':
          return (b.size || 0) - (a.size || 0);
        case 'SIZE_ASC':
          return (a.size || 0) - (b.size || 0);
        case 'DATE_DESC':
          return (b.mtime || 0) - (a.mtime || 0);
        case 'DATE_ASC':
          return (a.mtime || 0) - (b.mtime || 0);
        case 'TYPE':
          return (a.extension || '').localeCompare(b.extension || '');
        default:
          return 0;
      }
    });

    return list;
  }, [items, debouncedSearchQuery, quickFormatFilter, activeLanguageFilter, activeTags, selectedTag, selectedYearFilter, sortOption, pinnedIds, dynamicCategories, smartClusterCards]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / limit));
  const pagedFiles = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredFiles.slice(start, start + limit);
  }, [filteredFiles, page, limit]);

  // Adjust page if out of bounds
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // Pin toggle handler
  const handlePinToggle = (fileId: string) => {
    setPinnedIds(prev => {
      const isPinned = prev.includes(fileId);
      const next = isPinned ? prev.filter(id => id !== fileId) : [...prev, fileId];
      addToast('info', isPinned ? 'Odpnięto plik' : 'Przypięto plik do ulubionych');
      return next;
    });
  };

  // Open file with default OS application
  const handleOpenDefault = async (filePath: string) => {
    try {
      await fetch('/api/action/open-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      addToast('success', 'Uruchomiono plik', 'Otwieranie w domyślnym programie.');
    } catch {
      addToast('warning', 'Nie udało się otworzyć pliku');
    }
  };

  // Open file in Windows Explorer
  const handleOpenInExplorer = (path: string) => {
    if (onOpenInExplorer) onOpenInExplorer(path);
    else handleOpenDefault(path);
  };

  // Open directory via File System Access API
  const handleOpenFolderFSA = async () => {
    try {
      const res = await pickDirectoryWithFSA();
      if (res && res.success && res.items && onFsaLoaded) {
        onFsaLoaded(res.dirName || 'Katalog', res.items);
        addToast('success', 'Wczytano katalog z dysku', `Zaindeksowano ${res.items.length} plików.`);
      }
    } catch {
      addToast('warning', 'Anulowano wybór folderu');
    }
  };

  // Context Menu trigger
  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    setSelectedItem(item);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // Pro Gated Action handler
  const handleProGatedAction = (actionName: string, reason: string) => {
    openProModal();
    addToast('warning', `🔒 ${actionName} wymaga planu Pro`, reason);
  };

  // Batch toggle
  const handleBatchToggle = (fileId: string) => {
    setSelectedBatchIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  // Batch pin
  const handleBatchPin = () => {
    setPinnedIds(prev => {
      const newPins = Array.from(new Set([...prev, ...selectedBatchIds]));
      addToast('success', 'Przypięto zaznaczone pliki', `${selectedBatchIds.length} plików dodano do ulubionych.`);
      return newPins;
    });
    setSelectedBatchIds([]);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setActiveLanguageFilter(null);
    setSelectedTag(null);
    setActiveTags([]);
    setSelectedYearFilter(null);
    setQuickFormatFilter('ALL');
    setPage(1);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c0c10] text-[#e6e5e3] font-sans antialiased select-none">
      
      {/* ==================================================================== */}
      {/* 1. LEFT SIDEBAR (FREE TIER METERS, CATEGORIES, RESTRICTED TOOLS)    */}
      {/* ==================================================================== */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 md:w-72 bg-[#121217]/98 border-r border-white/10 backdrop-blur-2xl flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* App Title & Free Plan Pill */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-black font-extrabold shadow-lg shadow-amber-950/40">
              <HardDrive className="w-4 h-4 text-black" />
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-sm text-white block">Project Nexus</span>
              <span className="text-[10px] font-mono text-amber-400 font-bold tracking-wider uppercase block">
                Plan Free (50 GB)
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Free Plan Limits Usage Meter */}
        <div className="p-3.5 mx-3 my-2.5 rounded-2xl bg-gradient-to-b from-amber-950/30 to-zinc-900/60 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-amber-300 font-bold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Limit danych Free
            </span>
            <span className="text-zinc-300 font-bold">{freeSizePercent}%</span>
          </div>

          <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden border border-white/10">
            <div 
              className={`h-full transition-all duration-300 ${isSizeLimitExceeded ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`}
              style={{ width: `${freeSizePercent}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] font-mono text-zinc-400">
            <span>{dashboardStats.sizeLabel} / 50 GB</span>
            <span>{items.length.toLocaleString('pl-PL')} / 15k plików</span>
          </div>

          <button
            onClick={openProModal}
            className="w-full mt-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-extrabold text-[11px] font-mono transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 text-black" />
            <span>Odblokuj Pro (5000 GB)</span>
          </button>
        </div>

        {/* Dynamic Categories Nav */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar text-xs">
          <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
            Kategorie w folderze
          </div>

          <button
            onClick={() => toggleCategoryFilter('')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition text-left cursor-pointer ${
              activeLanguageFilter === null 
                ? 'bg-white/10 text-white font-bold border border-white/10' 
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-zinc-400" />
              <span>Wszystkie pliki</span>
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-zinc-300">
              {items.length.toLocaleString('pl-PL')}
            </span>
          </button>

          {dynamicCategories.map((cat) => {
            const isSelected = activeLanguageFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategoryFilter(cat.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl transition text-left cursor-pointer ${
                  isSelected 
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200 font-bold' 
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {cat.emoji ? (
                    <span className="text-sm shrink-0">{cat.emoji}</span>
                  ) : (
                    <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${cat.badgeBg} ${cat.badgeText} border ${cat.badgeBorder}`}>
                      {cat.shortTag}
                    </span>
                  )}
                  <span className="truncate">{cat.label}</span>
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 shrink-0">
                  {cat.count.toLocaleString('pl-PL')}
                </span>
              </button>
            );
          })}

          <div className="pt-3 px-2 py-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
            Narzędzia lokalne Free
          </div>

          <button
            onClick={() => setIsDeduplicatorOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition text-left cursor-pointer"
          >
            <Copy className="w-4 h-4 text-amber-400" />
            <span>Wyszukiwarka Duplikatów</span>
          </button>

          <button
            onClick={() => setIsGhostCleanerOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition text-left cursor-pointer"
          >
            <Archive className="w-4 h-4 text-emerald-400" />
            <span>Czyszczenie Cache</span>
          </button>

          <button
            onClick={() => setIsQuarantineModalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition text-left cursor-pointer"
          >
            <Shield className="w-4 h-4 text-cyan-400" />
            <span>Kwarantanna SmartShield</span>
          </button>

          {/* Pro Gated Section Teasers in Sidebar */}
          <div className="pt-3 px-2 py-1 text-[10px] font-mono text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1">
            <Lock className="w-3 h-3" /> Funkcje Planu Pro
          </div>

          <button
            onClick={() => handleProGatedAction('Asystent Ollama AI', 'Modele językowe i automatyczne tagowanie są dostępne wyłącznie w planie Pro.')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-500 hover:bg-amber-500/10 hover:text-amber-300 transition text-left cursor-pointer group"
          >
            <span className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition" />
              <span>Ollama AI Asystent</span>
            </span>
            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">
              PRO
            </span>
          </button>

          <button
            onClick={() => handleProGatedAction('Skanowanie Całego Dysku', 'Plan Free pozwala na skanowanie 1 folderu do 50 GB. Wersja Pro wspiera cały dysk do 5000 GB.')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-500 hover:bg-amber-500/10 hover:text-amber-300 transition text-left cursor-pointer group"
          >
            <span className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition" />
              <span>Skan Dysku (5000 GB)</span>
            </span>
            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">
              PRO
            </span>
          </button>

          <button
            onClick={() => handleProGatedAction('Autonomiczna Reorganizacja', 'Automatyczne sortowanie plików i generowanie planów migracji wymaga licencji Pro.')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-500 hover:bg-amber-500/10 hover:text-amber-300 transition text-left cursor-pointer group"
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition" />
              <span>Autonomiczne Plany</span>
            </span>
            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">
              PRO
            </span>
          </button>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/10 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
          <button 
            onClick={() => setIsAdvanceModalOpen(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Ustawienia</span>
          </button>
          <span className="text-zinc-600">v2.5.0-free</span>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* 2. MAIN CENTER CANVAS (NAVBAR, WARNING BANNER, COMMAND HERO, VIEWS)  */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#101014]">
        
        {/* Top Navbar */}
        <header className="h-14 border-b border-white/10 bg-[#121218]/95 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between shrink-0 font-mono text-xs shadow-lg gap-2 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white md:hidden transition cursor-pointer"
              aria-label="Przełącz nawigację"
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="text-zinc-400 hidden sm:inline">Folder roboczy:</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.04] border border-white/10 text-white font-bold max-w-xs md:max-w-md truncate">
              <span className="text-yellow-400 shrink-0">📁</span>
              <span className="truncate">{targetPath}</span>
            </div>
            
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1 shrink-0">
              <Lock className="w-3 h-3 text-amber-400" />
              <span>LIMIT FREE: 50 GB</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-zinc-400 hidden xl:inline text-[11px]">
              Zaindeksowano: <strong className="text-white">{items.length.toLocaleString('pl-PL')}</strong> plików ({dashboardStats.sizeLabel})
            </span>
            <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

            {/* UPGRADE PRO ACTION BUTTON */}
            <button
              onClick={openProModal}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-amber-600/30 to-amber-500/25 hover:from-amber-500/35 hover:to-amber-600/40 border border-amber-500/50 text-amber-200 font-bold text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/30"
              title="Wybierz Pro, aby odblokować analizę całego dysku do 5000 GB oraz modele AI"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>UPGRADE PRO (5 TB + AI)</span>
            </button>

            {onGoToWebsite && (
              <button
                onClick={onGoToWebsite}
                className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-zinc-300 hover:text-white transition flex items-center gap-1 text-xs font-mono cursor-pointer"
                title="Wróć do portalu"
              >
                <span>🌐 Portal</span>
              </button>
            )}

            {/* Pro Locked AI Assistant Button */}
            <button
              onClick={() => handleProGatedAction('Asystent Ollama AI', 'Modele Ollama AI są dostępne w planie Pro. Plan Darmowy umożliwia bezpieczny lokalny podgląd plików.')}
              className="px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-zinc-300 font-mono text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm group"
              title="Asystent AI — Zablokowany w planie Free"
            >
              <Bot className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-400 transition" />
              <span>AI (Wymaga Pro)</span>
              <Lock className="w-2.5 h-2.5 text-amber-400" />
            </button>

            {/* Inspector Toggle */}
            <button
              onClick={() => setIsDrawerOpen(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                isDrawerOpen 
                  ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm' 
                  : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white'
              }`}
              title="Przełącz boczny panel Inspektora (Ctrl + I)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inspektor</span>
              <kbd className="kbd-badge text-[9px] hidden md:inline">Ctrl+I</kbd>
            </button>
          </div>
        </header>

        {/* Scrollable Center Canvas */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar text-left">
          
          {/* ================================================================ */}
          {/* FREE PLAN AUDIT & LIMIT NOTICE CALLOUT (MANDATORY REQUIREMENT)   */}
          {/* ================================================================ */}
          {!isLimitNoticeDismissed && (
            <div className={`relative rounded-2xl p-4 sm:p-5 shadow-2xl overflow-hidden border transition-all ${
              isLimitViolated
                ? 'bg-gradient-to-r from-rose-950/50 via-[#1e1418] to-zinc-900 border-rose-500/50 ring-1 ring-rose-500/40'
                : 'bg-gradient-to-r from-amber-950/45 via-[#1a1714] to-zinc-900 border-amber-500/40 ring-1 ring-amber-500/30'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                    isLimitViolated
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                      : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  }`}>
                    <ShieldAlert className="w-6 h-6" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-extrabold tracking-tight ${isLimitViolated ? 'text-rose-200' : 'text-amber-200'}`}>
                        Stan Planu Darmowego (Free)
                      </h3>
                      <span className={`px-2 py-0.2 rounded-full text-[9px] font-mono font-bold border ${
                        isLimitViolated
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/35'
                      }`}>
                        {isLimitViolated ? 'PRZEKROCZONO LIMIT' : 'OGRANICZONY DOSTĘP'}
                      </span>
                    </div>

                    {/* Official user prompt required copy */}
                    <p className="text-xs text-zinc-300 max-w-3xl leading-relaxed">
                      „Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu”.
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-400 pt-1">
                      <span>Maks. rozmiar: <strong className="text-zinc-200">50 GB</strong> (zużyto: {dashboardStats.sizeLabel})</span>
                      <span className="text-white/20">•</span>
                      <span>Maks. plików: <strong className="text-zinc-200">15 000</strong> (obecnie: {items.length.toLocaleString('pl-PL')})</span>
                      <span className="text-white/20">•</span>
                      <span>Zakres: <strong className="text-amber-300">1 folder</strong> (Pro odblokowuje cały dysk do 5000 GB)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={openProModal}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs font-mono transition flex items-center gap-1.5 shadow-lg shadow-amber-950/60 cursor-pointer"
                  >
                    <Crown className="w-4 h-4 text-black" />
                    <span>Wybierz Pro</span>
                  </button>

                  <button
                    onClick={() => {
                      if (onChangeTargetFolder) onChangeTargetFolder();
                      else addToast('info', 'Wybór folderu', 'Wybierz folder mieszczący się w limitach planu Free.');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono text-white transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Ogranicz do jednego folderu</span>
                  </button>

                  <button
                    onClick={() => setIsLimitNoticeDismissed(true)}
                    className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                    title="Ukryj powiadomienie na tę sesję"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* COMMAND HERO BANNER                                              */}
          {/* ================================================================ */}
          <div className="relative rounded-2xl bg-gradient-to-r from-[#16161c] via-[#141419] to-[#121217] border border-white/10 p-4 sm:p-5 shadow-xl overflow-hidden">
            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shadow-inner">
                    <Folder className="w-4 h-4" />
                  </div>
                  <h1 className="text-xl font-extrabold text-white tracking-tight">
                    Eksplorator plików — Plan Free
                  </h1>
                  {activeLanguageFilter && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      Filtr aktywny
                    </span>
                  )}
                </div>

                <div className="text-xs font-mono text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5">
                  <span>
                    Katalog: <strong className="text-white" title={targetPath}>{targetFolderName}</strong>
                  </span>
                  <span className="text-white/25">•</span>
                  <span>
                    Wyświetlane: <strong className="text-emerald-400">{filteredFiles.length.toLocaleString('pl-PL')}</strong> z {items.length.toLocaleString('pl-PL')} plików
                  </span>
                  <span className="text-white/25">•</span>
                  <span>
                    Rozmiar: <strong className="text-cyan-300">{dashboardStats.sizeLabel}</strong>
                  </span>
                  <span className="text-white/25">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    <span>Limit Free: 50 GB / 1 folder</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Pro Gated: Nowy plik */}
                <button 
                  onClick={() => handleProGatedAction('Tworzenie plików', 'Tworzenie i zapis plików w katalogu wymaga aktywnego planu Pro.')}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-amber-500/30 text-xs text-zinc-300 transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm"
                  title="Tworzenie plików wymaga planu Pro"
                >
                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Nowy plik</span>
                  <Lock className="w-3 h-3 text-amber-400 ml-0.5" />
                </button>

                {/* Change Target Folder */}
                {onChangeTargetFolder && (
                  <button 
                    onClick={onChangeTargetFolder}
                    className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                    title="Wybierz inny katalog w ramach limitu Free"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Zmień folder</span>
                  </button>
                )}

                {/* Open Folder via FSA */}
                <button
                  onClick={handleOpenFolderFSA}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Wybierz pojedynczy folder ze swojego dysku"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Wybierz z dysku</span>
                </button>

                {/* Open in Windows Explorer */}
                <button 
                  onClick={() => handleOpenInExplorer(targetPath)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Otwórz folder w Eksploratorze Windows"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Eksplorator</span>
                </button>

                {/* Deduplicator */}
                <button 
                  onClick={() => setIsDeduplicatorOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-white/90 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-sm"
                  title="Wyszukaj zduplikowane pliki w folderze"
                >
                  <Copy className="w-3.5 h-3.5 text-zinc-300" />
                  <span className="hidden md:inline">Duplikaty</span>
                </button>

                {/* HUD toggle */}
                <button
                  onClick={() => setIsHudCollapsed(prev => !prev)}
                  className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                  title={isHudCollapsed ? 'Rozwiń klastry i statystyki' : 'Zwiń klastry i statystyki'}
                >
                  {isHudCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* 3. TELEMETRY CARDS & PRO TEASERS                                 */}
          {/* ================================================================ */}
          {!isHudCollapsed && (
            <div className="space-y-4 animate-fadeIn">
              {/* Telemetry Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  { id: '', label: 'WSZYSTKIE', count: dashboardStats.totalCount, sub: dashboardStats.sizeLabel, icon: Folder, color: 'text-zinc-300' },
                  { id: 'MEDIA', label: 'GRAFIKA & MEDIA', count: dashboardStats.imagesCount, sub: 'foto, wideo, audio', icon: Film, color: 'text-pink-400' },
                  { id: 'DEV', label: 'KOD I DANE', count: dashboardStats.codeCount, sub: 'ts, js, json, py', icon: FileCode, color: 'text-emerald-400' },
                  { id: 'DOCS', label: 'DOKUMENTY', count: dashboardStats.docsCount, sub: 'pdf, docx, txt', icon: FileText, color: 'text-amber-400' },
                  { id: 'ARCHIVES', label: 'ARCHIWA', count: dashboardStats.archivesCount, sub: 'zip, rar, 7z', icon: Archive, color: 'text-yellow-400' },
                  { id: 'pinned', label: 'PRZYPIĘTE', count: dashboardStats.pinnedCount, sub: 'ulubione pliki', icon: Star, color: 'text-amber-300' },
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = activeLanguageFilter === item.id;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => toggleCategoryFilter(item.id)}
                      className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between group shadow-lg cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/45 border-amber-500/60 ring-1 ring-amber-500/40'
                          : 'bg-[#15151c]/90 hover:bg-[#1a1a23] border-white/10 hover:border-amber-500/35'
                      }`}
                    >
                      <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono">
                        <span className="font-bold tracking-wider">{item.label}</span>
                        <Icon className={`w-3.5 h-3.5 ${item.color} group-hover:scale-110 transition-transform`} />
                      </div>
                      <div className="my-1.5 text-lg sm:text-2xl font-extrabold font-mono text-white tracking-tight">
                        {item.count.toLocaleString('pl-PL')}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 truncate">
                        {item.sub}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 3 Pro Locked Teasers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Teaser 1: Skanowanie Całego Komputera (5 TB) */}
                <button 
                  type="button"
                  onClick={() => handleProGatedAction('Skanowanie Całego Komputera', 'Wersja Pro pozwala na jednoczesną analizę dysków do 5000 GB (5 TB). Plan Free ogranicza skan do 1 folderu (50 GB).')}
                  className="p-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-[#121217] border border-zinc-800 hover:border-amber-500/40 transition cursor-pointer flex flex-col justify-between space-y-3 group shadow-md text-left"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Lock className="w-2.5 h-2.5" /> PRO: 5000 GB
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition">
                      Skanowanie Całego Komputera (5 TB)
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Plan Free ogranicza skanowanie do 1 folderu (50 GB). Wersja Pro odblokowuje analizę całego komputera do 5000 GB.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-amber-400/80 pt-1 border-t border-white/5 w-full">
                    <span>Wybierz Pro</span>
                    <span className="group-hover:translate-x-1 transition-transform">➔</span>
                  </div>
                </button>

                {/* Teaser 2: Ollama AI Modele Językowe */}
                <button 
                  type="button"
                  onClick={() => handleProGatedAction('Asystent Ollama AI', 'Lokalne modele LLM Ollama, automatyczne tagowanie i kategoryzacja semantyczna wymagają planu Pro.')}
                  className="p-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-[#121217] border border-zinc-800 hover:border-amber-500/40 transition cursor-pointer flex flex-col justify-between space-y-3 group shadow-md text-left"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                      <Bot className="w-4 h-4" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Lock className="w-2.5 h-2.5" /> PRO ONLY
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition">
                      Modele Ollama AI & Smart Tagging
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Zapytaj asystenta AI o treść dokumentów, generuj automatyczne podsumowania i automatycznie taguj pliki jednym kliknięciem.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-amber-400/80 pt-1 border-t border-white/5 w-full">
                    <span>Wymaga Pro</span>
                    <span className="group-hover:translate-x-1 transition-transform">➔</span>
                  </div>
                </button>

                {/* Teaser 3: Autonomiczna Migracja i Porządkowanie */}
                <button 
                  type="button"
                  onClick={() => handleProGatedAction('Autonomiczne Plany i Masowa Migracja', 'Automatyczne sortowanie projektów i bezpieczne przenoszenie plików wymaga licencji Pro.')}
                  className="p-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-[#121217] border border-zinc-800 hover:border-amber-500/40 transition cursor-pointer flex flex-col justify-between space-y-3 group shadow-md text-left"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
                      <FolderInput className="w-4 h-4" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Lock className="w-2.5 h-2.5" /> PRO ONLY
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition">
                      Autonomiczne Plany i Masowa Migracja
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Jedno kliknięcie, aby automatycznie posortować tysiące plików na projekty, wyczyścić bałagan i zachować pełną historię cofania zmian.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-amber-400/80 pt-1 border-t border-white/5 w-full">
                    <span>Zobacz możliwości Pro</span>
                    <span className="group-hover:translate-x-1 transition-transform">➔</span>
                  </div>
                </button>
              </div>

              {/* Dynamic Smart Clusters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {smartClusterCards.length === 0 ? (
                  <div className="col-span-full py-6 text-center bg-[#15151c]/90 rounded-2xl border border-white/10 text-zinc-400 font-mono text-xs">
                    Trwa indeksowanie struktury plików lub brak plików do zgrupowania.
                  </div>
                ) : (
                  smartClusterCards.slice(0, 5).map((cluster) => {
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
                            ? 'bg-gradient-to-b from-zinc-800 to-[#14141a] border-zinc-500 ring-1 ring-zinc-500/50 -translate-y-0.5'
                            : 'bg-gradient-to-b from-[#16161e]/95 to-[#101014]/95 border-white/10 hover:border-zinc-500 hover:bg-[#1a1a24] hover:-translate-y-0.5'
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
                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-300 font-bold shrink-0">
                              {cluster.weightLabel}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 flex justify-between">
                            <span className="truncate">{cluster.subtitle}</span>
                            <span className="text-zinc-300 font-bold shrink-0 ml-1">{cluster.percent}%</span>
                          </div>
                          <div className="w-full bg-[#0d0d12] h-1.5 rounded-full overflow-hidden border border-white/10">
                            <div 
                              className={`h-full bg-gradient-to-r ${cluster.barGradient} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.max(5, cluster.percent)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-zinc-400">
                          <span>{cluster.count.toLocaleString('pl-PL')} plików</span>
                          <span className="group-hover:text-white transition">Filtruj ➔</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* 4. SEARCH & FILTER TOOLBAR                                       */}
          {/* ================================================================ */}
          <div className="space-y-3 p-3.5 rounded-2xl bg-[#15151c]/90 border border-white/10 shadow-lg">
            
            {/* Top row: search input & view modes */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Szukaj plików w folderze (nazwa, rozszerzenie, ścieżka)..."
                  className="w-full pl-10 pr-10 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View Mode & Sorting Controls */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {/* Reset filter pill */}
                {(activeLanguageFilter || selectedTag || activeTags.length > 0 || selectedYearFilter || quickFormatFilter !== 'ALL') && (
                  <button
                    onClick={handleResetFilters}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono transition flex items-center gap-1 cursor-pointer hover:bg-amber-500/25"
                    title="Wyczyść aktywne filtry"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Wyczyść filtry</span>
                  </button>
                )}

                {/* Tag Matrix Toggle */}
                <button
                  onClick={() => setIsTagMatrixOpen(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
                    isTagMatrixOpen || activeTags.length > 0
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white'
                  }`}
                  title="Filtruj wg macierzy tagów"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Tagi ({activeTags.length})</span>
                </button>

                {/* Sort Dropdown */}
                <div className="relative">
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-300 text-xs font-mono focus:outline-none focus:border-amber-500 cursor-pointer appearance-none pr-8"
                    aria-label="Sortuj pliki"
                  >
                    <option value="NAME_ASC" className="bg-zinc-900">Nazwa: A-Z</option>
                    <option value="NAME_DESC" className="bg-zinc-900">Nazwa: Z-A</option>
                    <option value="SIZE_DESC" className="bg-zinc-900">Rozmiar: Największe</option>
                    <option value="SIZE_ASC" className="bg-zinc-900">Rozmiar: Najmniejsze</option>
                    <option value="DATE_DESC" className="bg-zinc-900">Data: Najnowsze</option>
                    <option value="DATE_ASC" className="bg-zinc-900">Data: Najstarsze</option>
                    <option value="TYPE" className="bg-zinc-900">Typ rozszerzenia</option>
                  </select>
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Page Limit */}
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-300 text-xs font-mono focus:outline-none cursor-pointer"
                  aria-label="Liczba plików na stronę"
                >
                  <option value={25} className="bg-zinc-900">25</option>
                  <option value={50} className="bg-zinc-900">50</option>
                  <option value={100} className="bg-zinc-900">100</option>
                  <option value={250} className="bg-zinc-900">250</option>
                </select>

                {/* View Modes Toggle */}
                <div className="flex items-center rounded-xl bg-white/[0.04] border border-white/10 p-0.5">
                  {[
                    { mode: 'GRID' as ViewMode, icon: LayoutGrid, title: 'Kafelki (Siatka)' },
                    { mode: 'LIST' as ViewMode, icon: List, title: 'Lista' },
                    { mode: 'TABLE' as ViewMode, icon: TableIcon, title: 'Tabela Notion' },
                    { mode: 'YEARS' as ViewMode, icon: Calendar, title: 'Oś czasu (Lata)' },
                    { mode: 'KANBAN' as ViewMode, icon: BarChart3, title: 'Tablica Kanban' }
                  ].map(item => {
                    const Icon = item.icon;
                    const isActive = viewMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        onClick={() => setViewMode(item.mode)}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isActive 
                            ? 'bg-amber-500/20 text-amber-300 shadow-sm' 
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title={item.title}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Format Filter Pill Bar */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
              {[
                { id: 'ALL', label: 'Wszystkie formaty', emoji: '✨', count: items.length },
                { id: 'MEDIA', label: 'Multimedia & Grafika', emoji: '🖼️', count: dashboardStats.imagesCount },
                { id: 'CODE', label: 'Kod & Dane', emoji: '⚡', count: dashboardStats.codeCount },
                { id: 'DOCS', label: 'Dokumenty', emoji: '📄', count: dashboardStats.docsCount },
                { id: 'ARCHIVES', label: 'Archiwa', emoji: '📦', count: dashboardStats.archivesCount },
                { id: 'LARGE', label: 'Duże >10 MB', emoji: '🔥', count: items.filter(f => (f.size || 0) >= 10_000_000).length }
              ].map(pill => {
                const isActive = quickFormatFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => { setQuickFormatFilter(pill.id); setPage(1); }}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-200 font-bold border-amber-500/40 shadow-sm'
                        : 'bg-[#17171f]/80 text-zinc-400 hover:text-white border-white/8 hover:border-white/20'
                    }`}
                  >
                    <span>{pill.emoji}</span>
                    <span>{pill.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isActive ? 'bg-amber-500/30 text-amber-200' : 'bg-white/5 text-zinc-500'}`}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Smart Tag Matrix Filter Expandable Section */}
            {isTagMatrixOpen && (
              <div className="pt-2 border-t border-white/5 animate-fadeIn">
                <TagMatrixFilter
                  items={items}
                  selectedTags={activeTags}
                  onToggleTag={handleTagToggle}
                  onClearTags={() => { setActiveTags([]); setPage(1); }}
                />
              </div>
            )}
          </div>

          {/* ================================================================ */}
          {/* 5. VIEW MODES (GRID, LIST, TABLE, YEARS, KANBAN)                 */}
          {/* ================================================================ */}
          {filteredFiles.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#15151c]/90 border border-white/10 space-y-3">
              <FolderOpen className="w-10 h-10 text-zinc-500 mx-auto" />
              <h3 className="text-base font-bold text-white">Brak plików pasujących do kryteriów</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Spróbuj zmienić zapytanie wyszukiwania, zresetować filtry lub wczytać inny katalog roboczy.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-mono transition cursor-pointer"
              >
                Resetuj wyszukiwanie
              </button>
            </div>
          ) : (
            <>
              {/* 5A. GRID VIEW */}
              {viewMode === 'GRID' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {pagedFiles.map((file) => {
                    const isSelected = selectedItem?.id === file.id;
                    const isPinned = pinnedIds.includes(file.id);
                    const isBatchChecked = selectedBatchIds.includes(file.id);

                    return (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem(file)}
                        onDoubleClick={() => setQuickLookItem(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedItem(file);
                          }
                        }}
                        className={`group relative rounded-2xl p-3 border transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-2.5 text-xs font-mono shadow-md ${
                          isSelected
                            ? 'bg-zinc-800 border-zinc-500 ring-1 ring-zinc-500/40 text-white'
                            : isPinned
                            ? 'bg-amber-950/20 border-amber-500/35 text-zinc-200'
                            : isBatchChecked
                            ? 'bg-zinc-800/60 border-zinc-600 text-white'
                            : 'bg-[#15151c]/85 hover:bg-[#1c1c24] border-white/6 hover:border-white/20 text-zinc-300'
                        }`}
                      >
                        {/* Top indicators */}
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="checkbox"
                            checked={isBatchChecked}
                            onChange={() => handleBatchToggle(file.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-zinc-600 text-amber-500 focus:ring-0 cursor-pointer"
                            aria-label={`Zaznacz plik ${file.name}`}
                          />

                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                              className={`p-1 rounded hover:bg-white/10 transition ${isPinned ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`}
                              title={isPinned ? 'Odepnij' : 'Przypnij'}
                            >
                              <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition"
                              title="Szybki podgląd (Spacja)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Thumbnail / Icon preview */}
                        <div className="h-24 w-full rounded-xl bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden">
                          {file.category === 'MEDIA' || file.category === 'SCREENSHOT' ? (
                            <LazyThumbnail file={file} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-500 group-hover:text-amber-400 transition">
                              <FileText className="w-8 h-8" />
                              <span className="text-[10px] uppercase font-bold mt-1 text-zinc-400">
                                {file.extension || 'PLIK'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Title & Metadata */}
                        <div>
                          <div className="font-bold text-white truncate" title={file.name}>
                            {file.name}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                            <span>{formatFileSize(file.size)}</span>
                            <span>{file.extension ? `.${file.extension}` : ''}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 5B. LIST VIEW */}
              {viewMode === 'LIST' && (
                <div className="space-y-1.5">
                  {pagedFiles.map((file) => {
                    const isSelected = selectedItem?.id === file.id;
                    const isPinned = pinnedIds.includes(file.id);
                    const isBatchChecked = selectedBatchIds.includes(file.id);

                    return (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem(file)}
                        onDoubleClick={() => setQuickLookItem(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedItem(file);
                          }
                        }}
                        className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition duration-150 cursor-pointer text-xs font-mono border ${
                          isSelected 
                            ? 'bg-zinc-800 border-zinc-500 text-white shadow-md' 
                            : isPinned
                            ? 'bg-amber-950/20 border-amber-500/35 text-zinc-200'
                            : isBatchChecked
                            ? 'bg-zinc-800/60 border-zinc-600 text-white'
                            : 'bg-[#15151c]/85 hover:bg-[#1c1c24] border-white/6 hover:border-white/15 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isBatchChecked}
                            onChange={() => handleBatchToggle(file.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-zinc-600 text-amber-500 focus:ring-0 cursor-pointer"
                            aria-label={`Zaznacz plik ${file.name}`}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                            className={`p-1 rounded transition ${isPinned ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`}
                          >
                            <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                          </button>
                          <span className="text-zinc-400">📄</span>
                          <span className="font-bold text-white truncate max-w-sm sm:max-w-md md:max-w-lg" title={file.name}>
                            {file.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 text-zinc-400 text-[11px]">
                          <span className="hidden md:inline">{file.extension?.toUpperCase() || 'FILE'}</span>
                          <span>{formatFileSize(file.size)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                            title="Szybki podgląd"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 5C. TABLE VIEW */}
              {viewMode === 'TABLE' && (
                <div className="rounded-2xl border border-white/10 bg-[#15151c]/90 overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#121217] border-b border-white/10 text-zinc-400 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3 w-10 text-center">✓</th>
                          <th className="p-3">Nazwa pliku</th>
                          <th className="p-3">Rozszerzenie</th>
                          <th className="p-3">Rozmiar</th>
                          <th className="p-3">Data modyfikacji</th>
                          <th className="p-3 text-right">Akcje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pagedFiles.map((file) => {
                          const isSelected = selectedItem?.id === file.id;
                          const isPinned = pinnedIds.includes(file.id);
                          const isBatchChecked = selectedBatchIds.includes(file.id);

                          return (
                            <tr
                              key={file.id}
                              tabIndex={0}
                              onClick={() => setSelectedItem(file)}
                              onDoubleClick={() => setQuickLookItem(file)}
                              onContextMenu={(e) => handleContextMenu(e, file)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedItem(file);
                                }
                              }}
                              className={`transition cursor-pointer ${
                                isSelected 
                                  ? 'bg-zinc-800 text-white' 
                                  : isPinned
                                  ? 'bg-amber-950/20 text-zinc-200'
                                  : 'hover:bg-white/5 text-zinc-300'
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isBatchChecked}
                                  onChange={() => handleBatchToggle(file.id)}
                                  className="rounded border-zinc-600 text-amber-500 focus:ring-0 cursor-pointer"
                                  aria-label={`Zaznacz plik ${file.name}`}
                                />
                              </td>
                              <td className="p-3 font-bold text-white max-w-xs truncate" title={file.name}>
                                <div className="flex items-center gap-2">
                                  {isPinned && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" />}
                                  <span className="truncate">{file.name}</span>
                                </div>
                              </td>
                              <td className="p-3 text-zinc-400 uppercase">
                                {file.extension || '—'}
                              </td>
                              <td className="p-3 text-zinc-300">
                                {formatFileSize(file.size)}
                              </td>
                              <td className="p-3 text-zinc-400 whitespace-nowrap">
                                {file.mtime ? new Date(file.mtime).toLocaleDateString('pl-PL') : '—'}
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setQuickLookItem(file); }}
                                    className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition"
                                    title="Podgląd"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id); }}
                                    className={`p-1 rounded hover:bg-white/10 transition ${isPinned ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}`}
                                    title="Przypnij"
                                  >
                                    <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
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

              {/* 5D. YEARS TIMELINE VIEW */}
              {viewMode === 'YEARS' && (
                <div className="space-y-4">
                  {/* Years Bar */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    <button
                      onClick={() => setSelectedYearFilter(null)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono transition cursor-pointer shrink-0 ${
                        selectedYearFilter === null 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold' 
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Wszystkie lata ({items.length.toLocaleString('pl-PL')})
                    </button>
                    {['2026', '2025', '2024', '2023', '2022', 'Wcześniejsze'].map(yr => (
                      <button
                        key={yr}
                        onClick={() => setSelectedYearFilter(prev => prev === yr ? null : yr)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono transition cursor-pointer shrink-0 ${
                          selectedYearFilter === yr 
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold' 
                            : 'bg-white/5 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  {/* Render files in Year view */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {pagedFiles.map(file => (
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
                        className="p-3 rounded-2xl bg-[#15151c]/90 border border-white/10 hover:border-white/20 transition cursor-pointer text-xs font-mono space-y-2"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>{extractYear(file.name, file.mtime)}</span>
                          <span>{formatFileSize(file.size)}</span>
                        </div>
                        <div className="font-bold text-white truncate" title={file.name}>
                          {file.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5E. KANBAN VIEW */}
              {viewMode === 'KANBAN' && (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
                  {[
                    { title: 'Grafika & Media', cat: 'MEDIA' as CategoryType, color: 'border-pink-500/30' },
                    { title: 'Kod & Dane', cat: 'DEV' as CategoryType, color: 'border-emerald-500/30' },
                    { title: 'Dokumenty', cat: 'DOCS' as CategoryType, color: 'border-amber-500/30' },
                    { title: 'Archiwa', cat: 'ARCHIVES' as CategoryType, color: 'border-yellow-500/30' }
                  ].map(col => {
                    const colFiles = filteredFiles.filter(f => f.category === col.cat);
                    return (
                      <div key={col.cat} className={`rounded-2xl bg-[#15151c]/90 border ${col.color} p-3.5 space-y-3 flex flex-col max-h-[600px]`}>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <h4 className="font-bold text-xs text-white">{col.title}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/40 text-zinc-400">
                            {colFiles.length}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                          {colFiles.slice(0, 30).map(file => (
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
                              className="p-2.5 rounded-xl bg-black/30 border border-white/5 hover:border-white/15 transition cursor-pointer text-xs font-mono space-y-1"
                            >
                              <div className="font-bold text-zinc-200 truncate" title={file.name}>
                                {file.name}
                              </div>
                              <div className="flex justify-between text-[10px] text-zinc-500">
                                <span>{formatFileSize(file.size)}</span>
                                <span className="uppercase">{file.extension}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ================================================================ */}
          {/* 6. PAGINATION CONTROLS                                           */}
          {/* ================================================================ */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-3 px-4 rounded-2xl bg-[#15151c]/90 border border-white/10 font-mono text-xs text-zinc-400">
              <div>
                Strona <strong className="text-white">{page}</strong> z <strong className="text-white">{totalPages}</strong> ({filteredFiles.length.toLocaleString('pl-PL')} wyników)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-white transition cursor-pointer"
                >
                  Poprzednia
                </button>
                <button
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-white transition cursor-pointer"
                >
                  Następna
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ==================================================================== */}
      {/* 7. RIGHT INSPECTOR METADATA DRAWER (REUSABLE NEXUS COMPONENT)        */}
      {/* ==================================================================== */}
      {isDrawerOpen && (
        <NexusRightMetadataDrawer
          item={selectedItem}
          onClose={() => setIsDrawerOpen(false)}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={(p) => handleOpenInExplorer(p)}
          onCopyPath={(p) => {
            navigator.clipboard.writeText(p);
            addToast('success', 'Skopiowano ścieżkę do schowka');
          }}
          onSendDiscord={() => handleProGatedAction('Wysyłanie Discord', 'Integracja z webhookami Discord wymaga planu Pro.')}
          onPinToggle={(id) => handlePinToggle(id)}
          isPinned={selectedItem ? pinnedIds.includes(selectedItem.id) : false}
          onInstantDelete={() => handleProGatedAction('Usuwanie z dysku', 'Usuwanie plików z poziomu aplikacji wymaga planu Pro.')}
          onQuickMove={() => handleProGatedAction('Przenoszenie do projektu', 'Reorganizacja struktury plików wymaga planu Pro.')}
          onQuickLook={(it) => setQuickLookItem(it)}
          isProLicensed={false}
          onUpgradePro={openProModal}
        />
      )}

      {/* ==================================================================== */}
      {/* 8. MODALS & POPUPS                                                  */}
      {/* ==================================================================== */}
      
      {/* QuickLook Modal */}
      {quickLookItem && (
        <QuickLookModal
          item={quickLookItem}
          onClose={() => setQuickLookItem(null)}
          onPrev={() => {
            const idx = filteredFiles.findIndex(f => f.id === quickLookItem.id);
            if (idx > 0) {
              const prev = filteredFiles[idx - 1];
              setQuickLookItem(prev);
              setSelectedItem(prev);
            }
          }}
          onNext={() => {
            const idx = filteredFiles.findIndex(f => f.id === quickLookItem.id);
            if (idx >= 0 && idx < filteredFiles.length - 1) {
              const next = filteredFiles[idx + 1];
              setQuickLookItem(next);
              setSelectedItem(next);
            }
          }}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={(p) => handleOpenInExplorer(p)}
        />
      )}

      {/* Desktop Context Menu */}
      {contextMenu && (
        <DesktopContextMenu
          item={contextMenu.item}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onOpenDefault={handleOpenDefault}
          onOpenInExplorer={(p) => handleOpenInExplorer(p)}
          onCopyPath={(p) => {
            navigator.clipboard.writeText(p);
            addToast('success', 'Skopiowano ścieżkę');
          }}
          onCopyName={(n) => {
            navigator.clipboard.writeText(n);
            addToast('success', 'Skopiowano nazwę pliku');
          }}
          onSendDiscord={() => handleProGatedAction('Wysyłanie Discord', 'Integracja z Discord wymaga planu Pro.')}
          onCalculateHash={() => handleProGatedAction('Obliczanie skrótów SHA256/BLAKE3', 'Zaawansowana kryptografia wymaga planu Pro.')}
          onQuickLook={(it) => setQuickLookItem(it)}
        />
      )}

      {/* Floating Batch Dock */}
      {selectedBatchIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-2xl px-5 py-3 bg-[#15151c]/95 border border-white/20 backdrop-blur-xl flex items-center gap-3 text-xs font-mono shadow-2xl">
          <span className="text-white font-bold">
            Zaznaczono {selectedBatchIds.length} plików
          </span>

          <button
            onClick={handleBatchPin}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold transition cursor-pointer flex items-center gap-1"
          >
            <Star className="w-3.5 h-3.5" />
            <span>Przypnij</span>
          </button>

          <button
            onClick={() => handleProGatedAction('Masowe przenoszenie', 'Masowe przenoszenie plików między folderami wymaga planu Pro.')}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-amber-300 transition cursor-pointer flex items-center gap-1"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <span>Przenieś (Pro)</span>
          </button>

          <button
            onClick={() => handleProGatedAction('Masowe usuwanie', 'Masowe usuwanie plików wymaga planu Pro.')}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-rose-400 transition cursor-pointer flex items-center gap-1"
          >
            <Lock className="w-3 h-3 text-rose-400" />
            <span>Usuń (Pro)</span>
          </button>

          <button
            onClick={() => setSelectedBatchIds([])}
            className="p-1 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toast Notification Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
      />

      {/* Settings Modal */}
      <AdvanceSettingsModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        targetPath={targetPath}
        onOpenQuarantine={() => setIsQuarantineModalOpen(true)}
        onOpenGhostCleaner={() => setIsGhostCleanerOpen(true)}
        onOpenDeduplicator={() => setIsDeduplicatorOpen(true)}
        onToast={addToast}
      />

      {/* Quarantine Modal */}
      <SmartShieldQuarantineModal
        isOpen={isQuarantineModalOpen}
        onClose={() => setIsQuarantineModalOpen(false)}
        onToast={addToast}
        onRestoreThreat={(item) => addToast('info', 'Przywrócono plik', item.name)}
      />

      {/* Ghost Cleaner Modal */}
      <GhostCleanerModal
        isOpen={isGhostCleanerOpen}
        onClose={() => setIsGhostCleanerOpen(false)}
        onToast={addToast}
        onPurged={() => addToast('success', 'Wyczyszczono pliki tymczasowe')}
      />

      {/* Deduplicator Modal */}
      <DeduplicatorModal
        isOpen={isDeduplicatorOpen}
        onClose={() => setIsDeduplicatorOpen(false)}
        onToast={addToast}
        onPurged={() => addToast('success', 'Zakończono analizę duplikatów')}
      />

      {/* Nexus Pro Upgrade Modal (Fallback only if no parent modal handler) */}
      {!onOpenProModal && (
        <NexusProModal
          isOpen={isProModalOpen}
          onClose={() => setIsProModalOpen(false)}
          onProActivated={() => {
            addToast('success', '👑 Odblokowano Nexus Pro!', 'Odświeżanie aplikacji...');
            window.location.reload();
          }}
        />
      )}

    </div>
  );
};
