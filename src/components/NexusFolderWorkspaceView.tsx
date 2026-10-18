import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  Share2, 
  Folder, 
  FolderOpen, 
  SlidersHorizontal, 
  Sparkles, 
  Terminal, 
  Archive, 
  FileCode, 
  Image as ImageIcon, 
  Layers, 
  ChevronRight, 
  Download,
  CheckCircle2,
  Package,
  Star,
  Trash2,
  FolderInput,
  Plus
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';
import { LazyThumbnail } from './LazyThumbnail';
import { 
  extractYear,
  isCsgo, 
  isFortnite, 
  isValorant, 
  isMinecraft, 
  isRoblox, 
  isWallpaperOrArt, 
  isUiOrIcon, 
  isInvoiceOrFinance, 
  isCodeDev, 
  isArchive 
} from '../utils/dynamicCategorizer';
import { 
  GAMES_DATABASE, 
  DEV_LANGUAGES_DATABASE, 
  detectGame, 
  detectDevLanguage, 
  detectArchetype,
  getItemSmartTags 
} from '../utils/fileKnowledgeBase';
import { PaginationControls } from './PaginationControls';
import { CreateItemModal } from './CreateItemModal';
import { AdvanceSettingsModal } from './AdvanceSettingsModal';
import { SmartShieldQuarantineModal } from './SmartShieldQuarantineModal';
import { GhostCleanerModal } from './GhostCleanerModal';
import { DeduplicatorModal } from './DeduplicatorModal';
import { ToastContainer, ToastMessage } from './ToastNotification';
import { nexusApi } from '../utils/nexusAuth';

interface NexusFolderWorkspaceViewProps {
  workspaceId: string;
  items: FileItem[];
  targetPath: string;
  onBackToHub: () => void;
  onOpenInExplorer: (path: string) => void;
  onOpenGuidedSearch?: () => void;
  onItemCreated?: (item: FileItem) => void;
  onItemDeleted?: (path: string) => void;
}

export const NexusFolderWorkspaceView: React.FC<NexusFolderWorkspaceViewProps> = ({
  workspaceId,
  items,
  targetPath,
  onBackToHub,
  onOpenInExplorer,
  onOpenGuidedSearch,
  onItemCreated,
  onItemDeleted
}) => {
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [selectedSubGroup, setSelectedSubGroup] = useState<string | null>(null);
  const [activeFilterPill, setActiveFilterPill] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isVisualFilterActive, setIsVisualFilterActive] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState(false);
  const [isGhostCleanerOpen, setIsGhostCleanerOpen] = useState(false);
  const [isDeduplicatorOpen, setIsDeduplicatorOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'info' | 'warning', title: string, description?: string) => {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36);
    const id = `toast-${Date.now()}-${uuid}`;
    setToasts(prev => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const handleInstantDelete = async (file: FileItem) => {
    try {
      const data = await nexusApi.post<{ status: string }>('/api/action/instant-delete', { path: file.path });
      if (data && data.status === 'deleted') {
        if (onItemDeleted) onItemDeleted(file.path);
        addToast('success', '🗑️ Błyskawicznie usunięto z dysku', file.name);
      }
    } catch (_) {
      addToast('warning', 'Błąd usuwania pliku', file.name);
    }
  };

  // Bounded rendering pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // ZIP Inspection state
  const [zipData, setZipData] = useState<{
    zipPath: string;
    totalFiles: number;
    uncompressedSize: number;
    compressedSize: number;
    entries: any[];
  } | null>(null);
  const [selectedZipEntry, setSelectedZipEntry] = useState<string | null>(null);
  const [unpacking, setUnpacking] = useState(false);
  const [unpackSuccess, setUnpackSuccess] = useState<string | null>(null);

  // Code inspection state for Dev
  const [codeData, setCodeData] = useState<{
    totalLines: number;
    imports: string[];
    exports: string[];
    content: string;
    linesPreview: string[];
  } | null>(null);

  // Workspace configuration metadata
  const config = useMemo(() => {
    // 1. Dynamic Game matching across all 50+ games
    const gameMatch = GAMES_DATABASE.find(g => g.id === workspaceId);
    if (gameMatch) {
      return {
        title: gameMatch.name,
        emoji: gameMatch.emoji,
        filter: (i: FileItem) => detectGame(i)?.id === gameMatch.id,
        isCodeMode: false,
        isZipMode: false,
        pills: [
          { id: 'ALL', label: 'Wszystkie' },
          { id: 'MEDIA', label: 'Zrzuty & Wideo' },
          { id: 'RECENT', label: 'Ostatnie (3 dni)' },
          { id: '2025', label: 'Rocznik 2025' },
          { id: '2024', label: 'Rocznik 2024' }
        ],
        subGroups: [
          { id: `${gameMatch.id}_all`, label: `Folder: ${gameMatch.name}`, emoji: gameMatch.emoji, filter: (i: FileItem) => detectGame(i)?.id === gameMatch.id },
          { id: 'yr2025', label: 'Folder: Rocznik 2025', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2025' },
          { id: 'yr2024', label: 'Folder: Rocznik 2024', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2024' }
        ],
        tags: gameMatch.tags
      };
    }

    // 2. Dynamic Language matching across all 50+ languages
    const devMatch = DEV_LANGUAGES_DATABASE.find(d => d.id === workspaceId);
    if (devMatch) {
      return {
        title: `${devMatch.name} (${devMatch.shortTag})`,
        emoji: devMatch.emoji,
        filter: (i: FileItem) => detectDevLanguage(i)?.id === devMatch.id,
        isCodeMode: true,
        isZipMode: false,
        pills: [
          { id: 'ALL', label: 'Wszystkie' },
          { id: 'CODE', label: devMatch.extensions.map(e => `.${e}`).join(', ') }
        ],
        subGroups: [
          { id: `${devMatch.id}_src`, label: `Folder: Źródła ${devMatch.name}`, emoji: devMatch.emoji, filter: (i: FileItem) => detectDevLanguage(i)?.id === devMatch.id }
        ],
        tags: [devMatch.shortTag, '#code', `#${devMatch.id}`]
      };
    }

    switch (workspaceId) {
      case 'csgo':
        return {
          title: 'Counter-Strike (CS:GO / CS2)',
          emoji: '🎯',
          filter: isCsgo,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'Zrzuty PNG' },
            { id: 'RECENT', label: 'Ostatnie (3 dni)' },
            { id: '2025', label: 'Rocznik 2025' },
            { id: '2024', label: 'Rocznik 2024' }
          ],
          subGroups: [
            { id: 'cs_clutches', label: 'Folder: Clutche & Highlights', emoji: '🎯', filter: (i: FileItem) => /clutch|ace|headshot|kill/i.test(i.name) },
            { id: 'cs_dust2', label: 'Folder: Dust2 & Mirage', emoji: '🗺️', filter: (i: FileItem) => /dust2|mirage|inferno/i.test(i.name) },
            { id: 'yr2025', label: 'Folder: Rocznik 2025', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2025' },
            { id: 'yr2024', label: 'Folder: Rocznik 2024', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2024' }
          ],
          tags: ['#csgo', '#counterstrike', '#gaming', '#highlights', '#esports']
        };

      case 'fortnite':
        return {
          title: 'Fortnite & Klipy',
          emoji: '🏆',
          filter: isFortnite,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'Zrzuty PNG' },
            { id: 'RECENT', label: 'Ostatnie (3 dni)' },
            { id: 'TAGS', label: 'Auto-Tagi' }
          ],
          subGroups: [
            { id: 'fn_wins', label: 'Folder: Victory Royale & Wygrane', emoji: '🏆', filter: (i: FileItem) => /victory|win|royale|top1/i.test(i.name) },
            { id: 'fn_clips', label: 'Folder: Klipy z gry', emoji: '🎬', filter: (i: FileItem) => /clip|medal|shadowplay|replay/i.test(i.name) },
            { id: 'yr2025', label: 'Folder: Rocznik 2025', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2025' }
          ],
          tags: ['#fortnite', '#gaming', '#clips', '#victory_royale']
        };

      case 'valorant':
        return {
          title: 'Valorant & Akcje',
          emoji: '🔺',
          filter: isValorant,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'Zrzuty PNG' }
          ],
          subGroups: [
            { id: 'val_aces', label: 'Folder: Asy & Mecze', emoji: '🔺', filter: (i: FileItem) => /ace|vct|clutch/i.test(i.name) }
          ],
          tags: ['#valorant', '#gaming', '#esports']
        };

      case 'minecraft':
        return {
          title: 'Minecraft & Mody',
          emoji: '⛏️',
          filter: isMinecraft,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'Zrzuty PNG' },
            { id: 'MODS', label: 'Paczki & Mody' }
          ],
          subGroups: [
            { id: 'mc_worlds', label: 'Folder: Światy & Budowle', emoji: '⛏️', filter: (i: FileItem) => /world|save|build/i.test(i.name) }
          ],
          tags: ['#minecraft', '#gaming', '#mods']
        };

      case 'wallpapers':
        return {
          title: 'Tapety & Grafiki HD',
          emoji: '🖼️',
          filter: isWallpaperOrArt,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'PNG/JPG' },
            { id: 'RECENT', label: 'Ostatnie' }
          ],
          subGroups: [
            { id: 'w_desktop', label: 'Folder: Pulpit 1920x1080+', emoji: '🖥️', filter: (i: FileItem) => /1920|2560|3840|wallpaper|desktop/i.test(i.name) }
          ],
          tags: ['#wallpaper', '#hd', '#art', '#desktop']
        };

      case 'ui_assets':
        return {
          title: 'Assety UI & Ikony',
          emoji: '🎨',
          filter: isUiOrIcon,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'SVG', label: 'SVG' },
            { id: 'PNG', label: 'Przezroczyste PNG' }
          ],
          subGroups: [
            { id: 'ui_icons', label: 'Folder: Ikony & Wektory', emoji: '🎨', filter: (i: FileItem) => i.extension === 'svg' || /icon/i.test(i.name) }
          ],
          tags: ['#ui', '#assets', '#design', '#icons']
        };

      case 'faktury':
        return {
          title: 'Faktury & Finanse',
          emoji: '🧾',
          filter: isInvoiceOrFinance,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PDF', label: 'Faktury PDF' }
          ],
          subGroups: [
            { id: 'inv_vat', label: 'Folder: Faktury VAT', emoji: '🧾', filter: (i: FileItem) => /faktura|vat|invoice/i.test(i.name) }
          ],
          tags: ['#faktura', '#finanse', '#dokumenty']
        };

      case 'anime':
        return {
          title: 'Anime & Sztuka',
          emoji: '🌸',
          filter: (i: FileItem) => /anime|manga|waifu|edit|wallpaper|girl|art|genshin|sketch|illustration|kawaii/i.test(i.name),
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'PNG/JPG' },
            { id: 'GIF', label: 'GIF' },
            { id: 'PSD', label: 'Projektówki (.psd/.clip)' },
            { id: 'RECENT', label: 'Ostatnie (3 dni)' },
            { id: 'TAGS', label: 'Auto-Tagi' }
          ],
          subGroups: [
            { id: 'fanarts', label: 'Folder: Fanarty & OCG', emoji: '🌸', filter: (i: FileItem) => /fanart|oc|waifu/i.test(i.name) },
            { id: 'inspirations', label: 'Folder: Inspiracje', emoji: '💡', filter: (i: FileItem) => /wallpaper|edit|background/i.test(i.name) },
            { id: 'sketches', label: 'Folder: Szkice & WIP', emoji: '✏️', filter: (i: FileItem) => /sketch|draft|wip|lineart/i.test(i.name) },
            { id: 'yr2024', label: 'Folder: Rocznik 2024', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2024' },
            { id: 'yr2023', label: 'Folder: Rocznik 2023', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2023' }
          ],
          tags: ['#manga', '#kawaii', '#backgrounds', '#chibi', '#digital-art', '#sketch']
        };

      case 'roblox':
        return {
          title: 'Roblox Studio & Gry',
          emoji: '🎮',
          filter: isRoblox,
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'Zrzuty PNG' },
            { id: 'RECENT', label: 'Ostatnie (3 dni)' },
            { id: '2025', label: 'Rocznik 2025' },
            { id: '2024', label: 'Rocznik 2024' }
          ],
          subGroups: [
            { id: 'gameplay', label: 'Folder: Roblox Screenshots (Gra)', emoji: '🎮', filter: (i: FileItem) => /roblox/i.test(i.name) },
            { id: 'yr2025', label: 'Folder: Rocznik 2025', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2025' },
            { id: 'yr2024', label: 'Folder: Rocznik 2024', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2024' },
            { id: 'yr2023', label: 'Folder: Rocznik 2023', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2023' }
          ],
          tags: ['#roblox', '#gameplay', '#screenshot', '#avatar', '#gaming']
        };

      case 'dev':
        return {
          title: 'Dev & Projekty (Kod Źródłowy)',
          emoji: '💻',
          filter: isCodeDev,
          isCodeMode: true,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'TSX', label: 'TSX/TS' },
            { id: 'JS', label: 'JS/JSX' },
            { id: 'CONFIG', label: 'JSON/Config' },
            { id: 'CSS', label: 'CSS/Styling' }
          ],
          subGroups: [
            { id: 'components', label: 'Folder: Komponenty UI (.tsx)', emoji: '🧩', filter: (i: FileItem) => /component|view|card|modal/i.test(i.name) || i.extension === 'tsx' },
            { id: 'hooks', label: 'Folder: Hooki & Logika', emoji: '🪝', filter: (i: FileItem) => /hook|use|scanner|engine/i.test(i.name) },
            { id: 'backend', label: 'Folder: API & Serwer (.cjs)', emoji: '⚡', filter: (i: FileItem) => /server|api|backend/i.test(i.name) || i.extension === 'cjs' },
            { id: 'configs', label: 'Folder: Konfiguracje (.json)', emoji: '⚙️', filter: (i: FileItem) => ['json', 'config', 'env'].includes(i.extension) }
          ],
          tags: ['#react', '#typescript', '#vite', '#component', '#backend', '#state']
        };

      case 'zip':
        return {
          title: 'Archiwa .ZIP & Paczki',
          emoji: '📦',
          filter: isArchive,
          isCodeMode: false,
          isZipMode: true,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'ZIP', label: 'Archiwa .ZIP' },
            { id: 'RAR', label: '.RAR / .7Z' },
            { id: 'RECENT', label: 'Ten Tydzień' }
          ],
          subGroups: [
            { id: 'all_zip', label: 'Folder: Wszystkie Archiwa', emoji: '📦', filter: (i: FileItem) => i.extension === 'zip' },
            { id: 'large_zip', label: 'Folder: Duże Paczki (>50MB)', emoji: '💾', filter: (i: FileItem) => i.size > 50 * 1024 * 1024 }
          ],
          tags: ['#zip', '#compressed', '#archive', '#backup', '#source']
        };

      default: // media & screenshots
        return {
          title: 'Zrzuty Ekranu & Media',
          emoji: '⚡',
          filter: (i: FileItem) => i.category === 'SCREENSHOT' || ['png', 'jpg', 'jpeg'].includes(i.extension.toLowerCase()),
          isCodeMode: false,
          isZipMode: false,
          pills: [
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'PNG', label: 'PNG' },
            { id: 'RECENT', label: 'Ostatnie (3 dni)' }
          ],
          subGroups: [
            { id: 'snips', label: 'Folder: Narzędzie Wycinanie', emoji: '⚡', filter: (i: FileItem) => /screenshot|snip/i.test(i.name) },
            { id: 'yr2024', label: 'Folder: Rocznik 2024', emoji: '📁', filter: (i: FileItem) => extractYear(i.name, i.mtime) === '2024' }
          ],
          tags: ['#screenshot', '#snip', '#windows', '#desktop']
        };
    }
  }, [workspaceId]);

  // Filtered dataset
  const workspaceItems = useMemo(() => {
    let result = items.filter(config.filter);

    // Sub-group filter
    if (selectedSubGroup) {
      const sg = config.subGroups.find(s => s.id === selectedSubGroup);
      if (sg) result = result.filter(sg.filter);
    }

    // Pill filter
    if (activeFilterPill !== 'ALL') {
      if (activeFilterPill === 'PNG') result = result.filter(i => ['png', 'jpg', 'jpeg'].includes(i.extension.toLowerCase()));
      if (activeFilterPill === 'GIF') result = result.filter(i => i.extension.toLowerCase() === 'gif');
      if (activeFilterPill === 'TSX') result = result.filter(i => ['tsx', 'ts'].includes(i.extension.toLowerCase()));
      if (activeFilterPill === 'JS') result = result.filter(i => ['js', 'jsx'].includes(i.extension.toLowerCase()));
      if (activeFilterPill === 'CONFIG') result = result.filter(i => ['json', 'config'].includes(i.extension.toLowerCase()));
      if (activeFilterPill === 'RECENT') result = result.filter(i => i.mtime > Date.now() - 3 * 86400000);
      if (activeFilterPill === '2025') result = result.filter(i => extractYear(i.name, i.mtime) === '2025');
      if (activeFilterPill === '2024') result = result.filter(i => extractYear(i.name, i.mtime) === '2024');
    }

    // Selected Tag filter (Exact Screenshot 1 & 2 interactivity)
    if (selectedTag) {
      const cleanTag = selectedTag.toLowerCase().replace(/^#/, '');
      result = result.filter(i => {
        const itemTags = (i.tags || []).map(t => t.toLowerCase());
        return itemTags.includes(selectedTag.toLowerCase()) || 
               itemTags.includes(`#${cleanTag}`) || 
               i.name.toLowerCase().includes(cleanTag) || 
               (i.path || '').toLowerCase().includes(cleanTag);
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q));
    }

    return result;
  }, [items, config, selectedSubGroup, activeFilterPill, selectedTag, searchQuery]);

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [selectedSubGroup, activeFilterPill, selectedTag, searchQuery]);

  // Bounded Window Pagination calculation
  const totalPages = Math.max(1, Math.ceil(workspaceItems.length / limit));
  const pagedItems = useMemo(() => {
    const start = (page - 1) * limit;
    return workspaceItems.slice(start, start + limit);
  }, [workspaceItems, page, limit]);

  // Select first item by default
  useEffect(() => {
    if (pagedItems.length > 0 && !selectedItem) {
      setSelectedItem(pagedItems[0]);
    }
  }, [pagedItems, selectedItem]);

  // Fetch zip or code inspection when selected item changes
  useEffect(() => {
    if (!selectedItem) return;

    if (config.isZipMode || selectedItem.extension.toLowerCase() === 'zip') {
      nexusApi.get<{ success: boolean; meta?: any }>(`/api/zip/inspect?path=${encodeURIComponent(selectedItem.path)}`)
        .then(data => {
          if (data && data.success && data.meta) {
            setZipData(data.meta);
          } else {
            setZipData(null);
          }
        })
        .catch(() => setZipData(null));
    } else {
      setZipData(null);
    }

    if (config.isCodeMode || ['tsx', 'ts', 'js', 'jsx', 'json', 'py', 'css'].includes(selectedItem.extension.toLowerCase())) {
      nexusApi.get<any>(`/api/code/inspect?path=${encodeURIComponent(selectedItem.path)}`)
        .then(data => {
          setCodeData(data);
        })
        .catch(() => setCodeData(null));
    } else {
      setCodeData(null);
    }
  }, [selectedItem, config]);

  // Handle open in default OS app
  const handleOpenDefault = (filePath: string) => {
    nexusApi.post('/api/action/open-default', { path: filePath }).catch(() => {});
  };

  // Handle copy path
  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  // Handle Unpack ZIP
  const handleUnpackZip = async () => {
    if (!selectedItem) return;
    setUnpacking(true);
    setUnpackSuccess(null);
    try {
      const res = await nexusApi.post<{ success: boolean; unpackedCount?: number; destDir?: string }>('/api/zip/unpack', {
        zipPath: selectedItem.path
      });

      if (res && res.success) {
        setUnpackSuccess(`Rozpakowano ${res.unpackedCount} plików do: ${res.destDir}`);
      }
    } catch (e: any) {
      alert(`Błąd rozpakowywania: ${e.message}`);
    } finally {
      setUnpacking(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#141414] text-[#e6e5e3] font-sans overflow-hidden select-none">
      
      {/* 1. Left Sidebar (Exact Image 2) */}
      <aside className="w-60 bg-[#181818] border-r border-[#262626] flex flex-col justify-between shrink-0 text-left text-xs font-sans">
        <div className="p-3 space-y-4 overflow-y-auto custom-scrollbar">
          
          {/* Back to Smart Hub Button */}
          <div>
            <button
              onClick={onBackToHub}
              className="w-full px-3 py-2 rounded-lg bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-white font-medium flex items-center gap-2 cursor-pointer transition text-xs shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Powrót do Smart Hub</span>
            </button>
          </div>

          {/* Active Workspace Pill */}
          <div className="px-2 py-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-200 font-bold flex items-center gap-2 text-xs">
            <span className="text-base">{config.emoji}</span>
            <span className="truncate">{config.title}</span>
          </div>

          {/* Smart Sub-groups (Folders inside workspace) */}
          <div className="space-y-1">
            <div className="px-2 text-[10px] font-mono text-[#888] uppercase tracking-wider">
              Smart Sub-groups
            </div>

            <button
              onClick={() => setSelectedSubGroup(null)}
              className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                selectedSubGroup === null ? 'bg-white/10 text-white font-bold' : 'text-[#888] hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>📁</span>
                <span>Wszystkie pliki</span>
              </span>
              <span className="font-mono text-[10px] text-[#777]">{items.filter(config.filter).length}</span>
            </button>

            {config.subGroups.map((sg) => {
              const count = items.filter(config.filter).filter(sg.filter).length;
              return (
                <button
                  key={sg.id}
                  onClick={() => setSelectedSubGroup(selectedSubGroup === sg.id ? null : sg.id)}
                  className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                    selectedSubGroup === sg.id ? 'bg-white/10 text-white font-bold' : 'text-[#888] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span>{sg.emoji}</span>
                    <span className="truncate">{sg.label}</span>
                  </span>
                  <span className="font-mono text-[10px] text-[#777] shrink-0">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Autogenerated tags */}
          <div className="space-y-1.5 pt-2 border-t border-[#262626]">
            <div className="px-2 text-[10px] font-mono text-[#888] uppercase tracking-wider">
              Autogenerated tags
            </div>

            <div className="space-y-1">
              {config.tags.map((tag) => (
                <div key={tag} className="flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-[#888] hover:text-white cursor-pointer transition text-xs">
                  <span>{tag}</span>
                  <span className="font-mono text-[10px] text-[#666]">
                    {items.filter(i => (i.tags || []).includes(tag)).length || 42}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual filter toggle switch */}
          <div className="pt-2 border-t border-[#262626] px-2 flex items-center justify-between text-xs text-[#888]">
            <span>Visual filter</span>
            <button 
              onClick={() => setIsVisualFilterActive(!isVisualFilterActive)}
              className={`w-8 h-4 rounded-full transition flex items-center p-0.5 cursor-pointer ${
                isVisualFilterActive ? 'bg-purple-600 justify-end' : 'bg-[#333] justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-sm"></span>
            </button>
          </div>

        </div>

        {/* Sidebar Status Footer */}
        <div className="p-3 border-t border-[#262626] text-[10px] text-[#777] space-y-1 font-mono">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Połączenie systemowe aktywne</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-400">
            <span>● Szybki podgląd włączony</span>
          </div>
          <div>Update status (5.2 GB)</div>
        </div>
      </aside>

      {/* 2. Main Canvas (Exact Image 2) */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#141414]">
        
        {/* Top Navbar Header */}
        <div className="h-12 border-b border-[#262626] flex items-center justify-between px-6 shrink-0 bg-[#141414] text-xs">
          
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <button onClick={onBackToHub} className="text-[#888] hover:text-white cursor-pointer">
              Smart Hub
            </button>
            <span className="text-[#555]">/</span>
            <span className="text-white font-bold">{config.title}</span>
            <span className="text-[#777]">({workspaceItems.length.toLocaleString('pl-PL')} plików)</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenGuidedSearch && (
              <button 
                onClick={onOpenGuidedSearch}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm text-xs"
              >
                <span>🎯</span>
                <span>Wyszukiwanie</span>
              </button>
            )}
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>📁 Nowy plik</span>
            </button>
            <button 
              onClick={() => setIsAdvanceModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-purple-200 transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm text-xs"
              title="Ustawienia"
            >
              <span>⚙️ Ustawienia</span>
            </button>
          </div>
        </div>

        {/* Sub-header with search and pills */}
        <div className="p-6 pb-2 space-y-4">
          
          {/* Search + Filter Pills Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder={`Szukaj w ${config.title}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#1e1e1e] border border-[#2b2b2b] text-xs text-white placeholder-[#666] focus:outline-none focus:border-white/20 font-mono"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {config.pills.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setActiveFilterPill(pill.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                    activeFilterPill === pill.id
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'bg-[#1e1e1e] text-[#888] hover:text-white hover:bg-[#252525] border border-[#2b2b2b]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inteligentne Pod-Foldery (Row of folder cards from Image 2) */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-mono text-[#888] uppercase tracking-wider">
              Podkatalogi
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {config.subGroups.slice(0, 4).map((sg) => (
                <div
                  key={sg.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSubGroup(selectedSubGroup === sg.id ? null : sg.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedSubGroup(selectedSubGroup === sg.id ? null : sg.id);
                    }
                  }}
                  className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    selectedSubGroup === sg.id 
                      ? 'bg-white/10 border-white/30 text-white' 
                      : 'bg-[#1a1a1a] border-[#2b2b2b] hover:bg-[#222] text-[#ccc]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl">{sg.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate text-white">{sg.label}</div>
                      <div className="text-[10px] font-mono text-[#777]">Folder tematyczny</div>
                    </div>
                  </div>
                  <span className="text-xs text-[#666]">⋮</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Main Files Grid Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar text-left">
          
          <div className="text-[10px] font-mono text-[#777] uppercase tracking-wider pb-2 flex items-center justify-between">
            <span>Katalog • {workspaceItems.length.toLocaleString('pl-PL')} plików</span>
            <span className="text-purple-400 font-bold">Na stronie: {pagedItems.length}</span>
          </div>

          {/* 3A. IMAGE / ART MODE GRID (Exact Image 2) */}
          {!config.isCodeMode && !config.isZipMode && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {pagedItems.map((file) => {
                const isSelected = selectedItem?.id === file.id;

                return (
                  <div
                    key={file.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItem(file)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItem(file);
                      }
                    }}
                    className={`rounded-xl border overflow-hidden flex flex-col justify-between cursor-pointer transition text-left group shadow-md ${
                      isSelected 
                        ? 'bg-[#222] border-purple-500 ring-1 ring-purple-500' 
                        : 'bg-[#1a1a1a] border-[#282828] hover:border-[#383838]'
                    }`}
                  >
                    <div>
                      {/* Crisp Lazy Thumbnail Preview with Offloading */}
                      <div className="w-full h-36 bg-[#111] overflow-hidden relative">
                        <LazyThumbnail
                          path={file.path}
                          name={file.name}
                          extension={file.extension}
                          category={file.category}
                          aspectRatio="video"
                          className="w-full h-full"
                        />

                        {/* Tag badge in bottom-right corner of thumbnail */}
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-purple-900/80 border border-purple-500/30 text-[9px] font-mono text-purple-200">
                          {(file.size / 1024).toFixed(0)} KB
                        </div>
                      </div>

                      {/* File Card Meta */}
                      <div className="p-2.5 space-y-1">
                        <div className="font-bold text-xs text-white truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#777] truncate" title={file.path}>
                          {(file.size / (1024 * 1024)).toFixed(1)} MB • {file.path}
                        </div>
                        <div className="flex gap-1 flex-wrap pt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] font-mono text-[#aaa]">#art</span>
                          <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] font-mono text-[#aaa]">#sketch</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3B. DEV CODE MODE GRID ("a dev to ma to samo ALE CODE") */}
          {config.isCodeMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pagedItems.map((file) => {
                const isSelected = selectedItem?.id === file.id;

                return (
                  <div
                    key={file.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItem(file)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItem(file);
                      }
                    }}
                    className={`rounded-xl border overflow-hidden flex flex-col justify-between cursor-pointer transition text-left group shadow-md p-3 space-y-2.5 ${
                      isSelected 
                        ? 'bg-[#222] border-blue-500 ring-1 ring-blue-500' 
                        : 'bg-[#1a1a1a] border-[#282828] hover:border-[#383838]'
                    }`}
                  >
                    <div>
                      {/* Code Snippet Box */}
                      <div className="w-full h-28 bg-[#111] rounded-lg border border-[#262626] p-2.5 font-mono text-[10px] text-[#aaa] overflow-hidden leading-relaxed">
                        <div className="text-blue-400 font-bold">{`// ${file.name}`}</div>
                        <div className="text-purple-400">import &#123; useState &#125; from 'react';</div>
                        <div className="text-emerald-400">export function Component() &#123;</div>
                        <div className="text-[#888] pl-2">return &lt;div&gt;Nexus App&lt;/div&gt;;</div>
                        <div className="text-emerald-400">&#125;</div>
                      </div>

                      {/* Code Card Meta */}
                      <div className="pt-2 space-y-1">
                        <div className="font-bold text-xs text-white truncate flex items-center justify-between">
                          <span className="truncate" title={file.name}>{file.name}</span>
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono text-[9px] border border-blue-500/30">
                            .{file.extension.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#777] truncate">
                          {formatBytesCompact(file.size)} • {new Date(file.mtime).toLocaleDateString('pl-PL')}
                        </div>
                        <div className="flex gap-1 flex-wrap pt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] font-mono text-[#aaa]">#react</span>
                          <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] font-mono text-[#aaa]">#typescript</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3C. ZIP ARCHIVES MODE ("I OBSŁÓŻ ZIPA...") */}
          {config.isZipMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {pagedItems.map((file) => {
                const isSelected = selectedItem?.id === file.id;

                return (
                  <div
                    key={file.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedItem(file)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItem(file);
                      }
                    }}
                    className={`rounded-xl border overflow-hidden flex flex-col justify-between cursor-pointer transition text-left group shadow-md p-4 space-y-3 ${
                      isSelected 
                        ? 'bg-[#222] border-yellow-500 ring-1 ring-yellow-500' 
                        : 'bg-[#1a1a1a] border-[#282828] hover:border-[#383838]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-2xl font-bold border border-yellow-500/30">
                        📦
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-white truncate" title={file.name}>{file.name}</div>
                        <div className="text-xs font-mono text-yellow-400 mt-0.5">Archiwum ZIP (Pure Engine)</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#111] border border-[#262626] font-mono text-[11px] space-y-1">
                      <div className="flex justify-between text-[#888]">
                        <span>Rozmiar:</span>
                        <span className="text-white">{formatBytesCompact(file.size)}</span>
                      </div>
                      <div className="flex justify-between text-[#888]">
                        <span>Format:</span>
                        <span className="text-yellow-400 font-bold">PKZIP</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 4. Bounded Window Pagination Controls */}
          <div className="mt-6">
            <PaginationControls
              page={page}
              limit={limit}
              totalItems={workspaceItems.length}
              totalPages={totalPages}
              hasPrev={page > 1}
              hasNext={page < totalPages}
              onPageChange={(p) => setPage(p)}
              onLimitChange={(l) => { setLimit(l); setPage(1); }}
              showingCount={pagedItems.length}
            />
          </div>

        </div>
      </main>

      {/* 3. Persistent Right Panel: Metadata & Preview (Exact Image 2) */}
      <aside className="w-80 bg-[#181818] border-l border-[#262626] flex flex-col justify-between shrink-0 text-left text-xs font-sans">
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
            <div className="font-bold text-white text-xs">Metadata & Preview</div>
            {selectedItem && (
              <button
                onClick={() => setSelectedItem(null)}
                className="text-xs text-[#666] hover:text-white cursor-pointer"
                title="Wyczyść zaznaczenie"
              >
                ✕
              </button>
            )}
          </div>

          {selectedItem ? (
            <div className="space-y-4">
              
              {/* Back title */}
              <div className="text-[11px] font-mono text-[#888] flex items-center gap-1 truncate" title={selectedItem.name}>
                <span>←</span>
                <span className="text-white truncate">{selectedItem.name}</span>
              </div>

              {/* Large Image Preview OR Code Inspector OR Zip Inspector */}
              <div className="w-full rounded-xl border border-[#2b2b2b] overflow-hidden bg-[#111] flex items-center justify-center">
                
                {/* 1. Real Image */}
                {!config.isCodeMode && !config.isZipMode && (
                  <div className="w-full h-72 flex items-center justify-center bg-[#0d0d0d] overflow-hidden">
                    <img 
                      src={`/api/file/preview?path=${encodeURIComponent(selectedItem.path)}`}
                      alt={selectedItem.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}

                {/* 2. Code Inspector ("a dev to ma to samo ALE CODE") */}
                {config.isCodeMode && (
                  <div className="w-full h-72 p-3 font-mono text-[10px] text-[#ccc] overflow-y-auto custom-scrollbar bg-[#0d0d0d] leading-relaxed">
                    <div className="text-blue-400 font-bold pb-1 border-b border-[#222] mb-2 flex justify-between">
                      <span>{selectedItem.name}</span>
                      <span>{codeData?.totalLines || 120} linii</span>
                    </div>
                    {codeData?.linesPreview ? (
                      codeData.linesPreview.map((line, idx) => (
                        <div key={idx} className="flex">
                          <span className="text-[#555] w-6 shrink-0 select-none">{idx + 1}</span>
                          <span className="whitespace-pre truncate">{line}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[#888]">Wczytywanie kodu ze źródła...</div>
                    )}
                  </div>
                )}

                {/* 3. ZIP Virtual Tree Inspector ("I OBSŁÓŻ ZIPA...") */}
                {config.isZipMode && zipData && (
                  <div className="w-full h-72 p-3 font-mono text-[11px] overflow-y-auto custom-scrollbar bg-[#0d0d0d] space-y-2">
                    <div className="font-bold text-yellow-400 pb-1 border-b border-[#222] flex justify-between">
                      <span>Pliki wewnątrz .ZIP</span>
                      <span>{zipData.totalFiles} plików</span>
                    </div>
                    <div className="space-y-1">
                      {zipData.entries.map((ent, idx) => (
                        <div 
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedZipEntry(ent.name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedZipEntry(ent.name);
                            }
                          }}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition text-[10px] ${
                            selectedZipEntry === ent.name ? 'bg-yellow-500/20 text-yellow-300' : 'hover:bg-white/5 text-[#bbb]'
                          }`}
                        >
                          <span className="truncate">{ent.name}</span>
                          <span className="text-[#666] shrink-0">{formatBytesCompact(ent.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Title */}
              <div>
                <h3 className="font-bold text-sm text-white truncate" title={selectedItem.name}>
                  {selectedItem.name}
                </h3>
              </div>

              {/* Informacje o pliku (Exact Image 2) */}
              <div className="space-y-2 pt-2 border-t border-[#262626] font-mono text-[11px]">
                <div className="text-[10px] uppercase text-[#777] font-bold">Informacje o pliku</div>
                
                <div className="flex justify-between text-[#bbb]">
                  <span className="text-[#777]">Nazwa:</span>
                  <span className="truncate max-w-[160px] text-white" title={selectedItem.name}>{selectedItem.name}</span>
                </div>

                <div className="flex justify-between text-[#bbb]">
                  <span className="text-[#777]">Rozmiar:</span>
                  <span className="text-white">{formatBytesCompact(selectedItem.size)}</span>
                </div>

                <div className="flex justify-between text-[#bbb]">
                  <span className="text-[#777]">Modyfikowany:</span>
                  <span className="text-white">{new Date(selectedItem.mtime).toLocaleDateString('pl-PL')}</span>
                </div>

                <div className="text-[#bbb]">
                  <span className="text-[#777] block">Ścieżka:</span>
                  <span className="text-[10px] break-all text-[#999]">{selectedItem.path}</span>
                </div>
              </div>

              {/* Detekcja AI / Tagi (Exact Image 2 with working filters) */}
              <div className="space-y-1.5 pt-2 border-t border-[#262626] font-mono text-[11px]">
                <div className="flex items-center justify-between text-[10px] uppercase text-[#777] font-bold">
                  <span>Detekcja AI / Tagi</span>
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="text-purple-400 hover:text-white lowercase text-[9px] cursor-pointer"
                    >
                      (wyczyść #{selectedTag.replace('#', '')})
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {getItemSmartTags(selectedItem).map((t) => {
                    const isSelected = selectedTag === t || selectedTag === t.replace('#', '');
                    return (
                      <button
                        key={t}
                        onClick={() => setSelectedTag(prev => prev === t ? null : t)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-400 shadow-sm ring-1 ring-purple-400'
                            : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border-purple-500/30'
                        }`}
                        title={`Filtruj wg tagu ${t}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons (Exact Image 2) */}
              <div className="pt-3 border-t border-[#262626] space-y-2">
                
                {/* ZIP Unpack button if ZIP */}
                {config.isZipMode && (
                  <button
                    onClick={handleUnpackZip}
                    disabled={unpacking}
                    className="w-full py-2.5 rounded-lg bg-yellow-500 text-black font-bold text-xs hover:bg-yellow-400 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${unpacking ? 'animate-bounce' : ''}`} />
                    <span>{unpacking ? 'Rozpakowywanie...' : 'Rozpakuj ZIP tutaj (Unpack)'}</span>
                  </button>
                )}

                {unpackSuccess && (
                  <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-300 font-mono">
                    {unpackSuccess}
                  </div>
                )}

                <button
                  onClick={() => handleOpenDefault(selectedItem.path)}
                  className="w-full py-2 rounded-lg bg-[#252525] hover:bg-[#303030] border border-[#383838] text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Otwórz w programie domyślnym</span>
                </button>

                <button
                  onClick={() => handleCopyPath(selectedItem.path)}
                  className="w-full py-2 rounded-lg bg-[#252525] hover:bg-[#303030] border border-[#383838] text-white text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPath ? 'Skopiowano ścieżkę!' : 'Kopiuj ścieżkę'}</span>
                </button>

                <button
                  onClick={() => {
                    handleCopyPath(selectedItem.path);
                    nexusApi.post('/api/action/discord-photoshop', { path: selectedItem.path }).catch(() => {});
                  }}
                  className="w-full py-2 rounded-lg bg-[#252525] hover:bg-[#303030] border border-[#383838] text-white text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Wyślij do Discorda / Photoshopa</span>
                </button>

                <button
                  onClick={() => onOpenInExplorer(selectedItem.path)}
                  className="w-full py-2 rounded-lg bg-[#252525] hover:bg-[#303030] border border-[#383838] text-white text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5 text-yellow-500" />
                  <span>Otwórz folder w Eksploratorze</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#777] font-mono">
              Wybierz plik z katalogu, aby zobaczyć podgląd i metadane.
            </div>
          )}

        </div>
      </aside>

      {/* TOAST NOTIFICATION DOCK */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
      />

      {/* MODALS FOR CORE V2 */}
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

    </div>
  );
};
