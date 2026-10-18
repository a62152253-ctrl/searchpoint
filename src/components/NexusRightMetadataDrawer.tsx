import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  Share2, 
  Folder, 
  Tag as TagIcon,
  Sparkles,
  ShieldCheck,
  Star,
  Trash2,
  FolderInput,
  Key,
  Calendar,
  HardDrive,
  FileCode,
  Eye,
  Maximize2,
  Code2,
  Palette,
  Cpu,
  Lock,
  Crown
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface NexusRightMetadataDrawerProps {
  item: FileItem | null;
  onClose?: () => void;
  onOpenDefault: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onCopyPath: (path: string) => void;
  onSendDiscord: (path: string) => void;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
  onPinToggle?: (fileId: string) => void;
  isPinned?: boolean;
  onInstantDelete?: (file: FileItem) => void;
  onQuickMove?: (file: FileItem) => void;
  onQuickLook?: (file: FileItem) => void;
  onOpenCodeEditor?: (file: FileItem) => void;
  onOpenImageEditor?: (file: FileItem) => void;
  aiStatus?: any;
  isHudExpanded?: boolean;
  onOpenAiSettings?: () => void;
  isProLicensed?: boolean;
  onUpgradePro?: () => void;
}

export const NexusRightMetadataDrawer: React.FC<NexusRightMetadataDrawerProps> = ({
  item,
  onClose,
  onOpenDefault,
  onOpenInExplorer,
  onCopyPath,
  onSendDiscord,
  onTagClick,
  activeTags = [],
  onPinToggle,
  isPinned = false,
  onInstantDelete,
  onQuickMove,
  onQuickLook,
  onOpenCodeEditor,
  onOpenImageEditor,
  aiStatus,
  isHudExpanded = true,
  onOpenAiSettings,
  isProLicensed = false,
  onUpgradePro
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'TAGS' | 'ACTIONS'>('DETAILS');
  const [shaHash, setShaHash] = useState<string | null>(null);
  const [blakeHash, setBlakeHash] = useState<string | null>(null);
  const [vtStatus, setVtStatus] = useState<string | null>(null);
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [aiMeta, setAiMeta] = useState<any>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setShaHash(null);
    setBlakeHash(null);
    setVtStatus(null);
    setAiMeta(null);

    const extClean = (item?.extension || '').toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'avif'].includes(extClean);
    if (item && isImg && !item.fileHandle && !item.path.startsWith('[FSA]/')) {
      nexusApi.get<{ success?: boolean; aiMetadata?: any }>(
        `/api/file/image-meta?path=${encodeURIComponent(item.path)}`,
        { signal: controller.signal }
      )
        .then(data => {
          if (!controller.signal.aborted && data?.success && data?.aiMetadata) {
            setAiMeta(data.aiMetadata);
          }
        })
        .catch(error => {
          if (!controller.signal.aborted) {
            console.warn('[Nexus] Could not load image metadata:', error);
          }
        });
    }
    return () => controller.abort();
  }, [item?.path]);

  // When no file is selected: Display User AI / Ollama details if HUD is expanded (Requirement 5)
  if (!item) {
    const hasOllamaStatus = typeof aiStatus?.ollama?.running === 'boolean';
    const isOllamaRunning = aiStatus?.ollama?.running === true;
    const rawModel = aiStatus?.ollama?.models?.[0];
    const activeModel = typeof rawModel === 'string'
      ? rawModel
      : (rawModel?.name || rawModel?.model || (hasOllamaStatus ? 'Brak modelu' : 'Sprawdzanie...'));
    const latency = Number.isFinite(aiStatus?.ollama?.latencyMs) ? `${aiStatus.ollama.latencyMs} ms` : '—';
    const modelCount = Number.isFinite(aiStatus?.ollama?.modelCount) ? aiStatus.ollama.modelCount : 0;

    return (
      <aside className="w-84 bg-[#141416]/95 border-l border-white/5 flex flex-col justify-between p-5 text-xs text-[#71717a] shrink-0 font-mono select-none overflow-y-auto custom-scrollbar">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <Cpu className="w-4 h-4 text-purple-200" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-white text-xs">Inspektor</span>
                <span className="text-[10px] text-purple-400">Status systemu</span>
              </div>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-1 rounded text-[#666] hover:text-white transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* User AI / Ollama Status Card (Requirement 5) */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-[#181820] to-[#141418] border border-purple-500/30 text-left space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 border ${
                isOllamaRunning
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOllamaRunning ? 'bg-emerald-400' : 'bg-amber-300'}`}></span>
                <span>{isOllamaRunning ? 'Ollama aktywna' : hasOllamaStatus ? 'Ollama offline' : 'Sprawdzanie statusu'}</span>
              </span>
              <span className="text-[10px] text-[#777] font-mono">{latency}</span>
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-white text-sm tracking-tight flex items-center gap-1.5">
                <span>Pomocnik Ollama</span>
              </h4>
              <p className="text-[11px] text-[#aaa] leading-relaxed">
                Status połączenia lokalnej usługi i dostępnych modeli.
              </p>
            </div>

            <div className="divide-y divide-white/5 text-[11px] font-mono pt-1">
              <div className="py-1.5 flex justify-between">
                <span className="text-[#777]">Aktywny model:</span>
                <span className="text-purple-300 font-bold truncate max-w-[140px]">{activeModel}</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-[#777]">Endpoint:</span>
                <span className="text-white font-mono text-[10px]">127.0.0.1:11434</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-[#777]">Tryb pracy:</span>
                <span className="text-white">Lokalny</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-[#777]">Dostępne modele:</span>
                <span className="text-white font-bold">{modelCount}</span>
              </div>
            </div>

            {onOpenAiSettings && (
              <button
                onClick={onOpenAiSettings}
                className="w-full py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold transition cursor-pointer shadow-sm text-center"
              >
                Otwórz ustawienia
              </button>
            )}
          </div>

          {/* Capabilities Matrix */}
          <div className="p-3.5 rounded-2xl bg-[#18181c] border border-white/5 text-left space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777]">
              Możliwości Silnika Nexusa
            </span>
            <div className="space-y-1.5 text-[11px] text-[#ccc]">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Wyszukiwanie intencji ("find database", "screeny")</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Automatyczne porządkowanie ("Posprzątaj Downloads")</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Tarcza Cyber i Kwarantanna skryptów (.ps1, .bat)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Inspekcja schematów SQLite i zapytań SQL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 text-center border-t border-white/5">
          <p className="text-[10px] text-[#555]">
            Wybierz dowolny plik z listy, aby przejść do podglądu metadanych.
          </p>
        </div>
      </aside>
    );
  }

  const handleCopy = () => {
    onCopyPath(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCalculateHash = async () => {
    setCalculatingHash(true);
    setVtStatus(null);
    try {
      const data = await nexusApi.post<{ success?: boolean; sha256?: string; blake3?: string }>(
        '/api/action/calculate-hash',
        { path: item.path }
      );
      if (data?.sha256) {
        setShaHash(data.sha256);
        if (data.blake3) setBlakeHash(data.blake3);

        nexusApi.post<{ success?: boolean; isSafe?: boolean; total?: number; message?: string }>(
          '/api/shield/virustotal',
          { sha256: data.sha256 }
        )
          .then(vtData => {
            if (vtData?.success) {
              setVtStatus(vtData.isSafe ? `Czysty (0/${vtData.total ?? 0})` : (vtData.message || 'Zweryfikowany'));
            } else if (vtData?.message) {
              setVtStatus(vtData.message);
            }
          })
          .catch(() => {
            setVtStatus('Offline / Baza lokalna');
          });
      }
    } catch (err: any) {
      console.warn('[NexusRightMetadataDrawer] Failed to calculate hash:', err);
    } finally {
      setCalculatingHash(false);
    }
  };

  const ext = (item.extension || '').toLowerCase();
  const CODE_EXTS = new Set([
    'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json', 'lock', 'css', 'scss', 'sass', 'less',
    'html', 'htm', 'py', 'pyw', 'rs', 'go', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'cs', 'sql', 'md', 'markdown', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'xml', 'svg', 'php', 'rb', 'lua', 'txt', 'log'
  ]);
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'avif']);

  const isImage = IMAGE_EXTS.has(ext);
  const isCode = CODE_EXTS.has(ext) || item.category === 'DEV';
  const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
  const sizeKB = (item.size / 1024).toFixed(1);
  const dateFormatted = item.mtime 
    ? new Date(item.mtime).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Nieznana data';

  const displayTags = (item.tags && item.tags.length > 0) 
    ? item.tags 
    : ['#anime', '#art', '#digital', '#media', '#windows'];

  return (
    <aside className="w-84 bg-[#141416]/95 backdrop-blur-xl border-l border-white/8 flex flex-col justify-between shrink-0 text-left text-xs font-sans overflow-hidden select-none shadow-2xl animate-slideInRight">
      <div className="flex flex-col h-full overflow-hidden">
        
        {/* 1. Header with Tab Bar */}
        <div className="p-3.5 border-b border-white/8 space-y-3 bg-[#18181b]/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                Nexus Inspector
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {onPinToggle && (
                <button
                  onClick={() => onPinToggle(item.id)}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isPinned 
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                      : 'border-white/5 text-[#71717a] hover:text-white hover:bg-white/5'
                  }`}
                  title={isPinned ? 'Odepnij plik' : '⭐ Przypnij na górę'}
                >
                  <Star className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                </button>
              )}
              {onClose && (
                <button 
                  onClick={onClose}
                  className="p-1.5 rounded-lg border border-white/5 text-[#71717a] hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Zamknij panel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center p-1 rounded-xl bg-black/40 border border-white/6 text-[11px] font-mono">
            <button
              onClick={() => setActiveTab('DETAILS')}
              className={`flex-1 py-1 rounded-lg transition cursor-pointer font-medium text-center ${
                activeTab === 'DETAILS' ? 'bg-[#27272a] text-white shadow-sm' : 'text-[#71717a] hover:text-white'
              }`}
            >
              Podgląd
            </button>
            <button
              onClick={() => setActiveTab('TAGS')}
              className={`flex-1 py-1 rounded-lg transition cursor-pointer font-medium text-center ${
                activeTab === 'TAGS' ? 'bg-[#27272a] text-white shadow-sm' : 'text-[#71717a] hover:text-white'
              }`}
            >
              Tagi ({displayTags.length})
            </button>
            <button
              onClick={() => setActiveTab('ACTIONS')}
              className={`flex-1 py-1 rounded-lg transition cursor-pointer font-medium text-center ${
                activeTab === 'ACTIONS' ? 'bg-[#27272a] text-white shadow-sm' : 'text-[#71717a] hover:text-white'
              }`}
            >
              Akcje
            </button>
          </div>
        </div>

        {/* 2. Scrollable Body Content */}
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          
          {/* TAB 1: DETAILS & PREVIEW */}
          {activeTab === 'DETAILS' && (
            <div className="space-y-4 animate-fadeInScale">
              
              {/* Media Preview Box */}
              <div 
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isCode && onOpenCodeEditor) {
                    onOpenCodeEditor(item);
                  } else if (isImage && onOpenImageEditor) {
                    onOpenImageEditor(item);
                  } else if (onQuickLook) {
                    onQuickLook(item);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isCode && onOpenCodeEditor) {
                      onOpenCodeEditor(item);
                    } else if (isImage && onOpenImageEditor) {
                      onOpenImageEditor(item);
                    } else if (onQuickLook) {
                      onQuickLook(item);
                    }
                  }
                }}
                className="w-full bg-[#0a0a0c] rounded-2xl border border-white/8 overflow-hidden flex items-center justify-center p-2 relative shadow-xl group cursor-pointer"
              >
                {ext === 'pdf' ? (
                  <div className="w-full h-56 rounded-xl overflow-hidden border border-white/5 bg-[#141418] relative group/pdf">
                    <iframe
                      src={item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                      className="w-full h-full border-0 rounded-xl pointer-events-none"
                      title={`Podgląd PDF: ${item.name}`}
                    />
                    <div className="absolute inset-0 bg-red-950/20 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover/pdf:opacity-100 transition duration-200 rounded-xl">
                      <span className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-900/50">
                        <span>Szybki podgląd PDF</span>
                      </span>
                    </div>
                  </div>
                ) : isImage ? (
                  <>
                    <img 
                      src={item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                      alt={item.name}
                      className="max-h-56 w-auto max-w-full object-contain rounded-xl group-hover:scale-[1.02] transition duration-300"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition flex items-center gap-1 shadow-md">
                      <Palette className="w-3 h-3 text-pink-400" />
                      <span>Edytuj w Image Studio</span>
                    </div>
                  </>
                ) : isCode ? (
                  <div className="py-12 text-center space-y-2 relative w-full group/code">
                    <span className="text-5xl select-none group-hover/code:scale-110 transition duration-200 inline-block">
                      💻
                    </span>
                    <div className="text-xs font-mono text-purple-400 font-bold uppercase tracking-wider">
                      .{ext} Kod Źródłowy
                    </div>
                    <div className="absolute inset-0 bg-purple-950/40 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover/code:opacity-100 transition duration-200 rounded-xl">
                      <span className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-900/50">
                        <Code2 className="w-3.5 h-3.5" />
                        Otwórz edytor kodu
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-2">
                    <span className="text-5xl select-none">
                      {ext === 'zip' ? '📦' : '📄'}
                    </span>
                    <div className="text-xs font-mono text-purple-400 font-bold uppercase tracking-wider">
                      .{ext} Komponent
                    </div>
                  </div>
                )}
              </div>

              {/* Dedicated Studio Launcher Buttons Underneath Preview Box */}
              {isCode && onOpenCodeEditor && (
                <button
                  onClick={() => {
                    if (!isProLicensed && onUpgradePro) {
                      onUpgradePro();
                    } else {
                      onOpenCodeEditor(item);
                    }
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-semibold transition cursor-pointer flex items-center justify-between gap-2 shadow-lg group ${
                    isProLicensed
                      ? 'bg-gradient-to-r from-purple-900/50 via-indigo-900/40 to-purple-900/50 hover:from-purple-800/70 hover:to-indigo-800/70 border-purple-500/40 text-purple-200 shadow-purple-950/50'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
                  }`}
                  title={isProLicensed ? 'Edytor kodu Monaco z zapisem na dysku' : 'Edycja Monaco Code Studio jest funkcją Nexus PRO'}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Code2 className="w-4 h-4 text-purple-400 group-hover:scale-110 transition shrink-0" />
                    <span className="truncate">⚡ Edytor kodu (Monaco Studio)</span>
                  </div>
                  {isProLicensed ? (
                    <span className="text-[10px] text-purple-400 font-bold shrink-0">PRO</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full shrink-0">
                      <Lock className="w-3 h-3" />
                      <span>PRO</span>
                    </span>
                  )}
                </button>
              )}

              {isImage && onOpenImageEditor && (
                <button
                  onClick={() => {
                    if (!isProLicensed && onUpgradePro) {
                      onUpgradePro();
                    } else {
                      onOpenImageEditor(item);
                    }
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-semibold transition cursor-pointer flex items-center justify-between gap-2 shadow-lg group ${
                    isProLicensed
                      ? 'bg-gradient-to-r from-pink-900/50 via-purple-900/40 to-pink-900/50 hover:from-pink-800/70 hover:to-purple-800/70 border-pink-500/40 text-pink-200 shadow-pink-950/50'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
                  }`}
                  title={isProLicensed ? 'Edytor obrazów Canvas 2D z zapisem na dysku' : 'Edycja Nexus Image Studio jest funkcją Nexus PRO'}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Palette className="w-4 h-4 text-pink-400 group-hover:scale-110 transition shrink-0" />
                    <span className="truncate">🎨 Edytor obrazów (Image Studio)</span>
                  </div>
                  {isProLicensed ? (
                    <span className="text-[10px] text-pink-400 font-bold shrink-0">PRO</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full shrink-0">
                      <Lock className="w-3 h-3" />
                      <span>PRO</span>
                    </span>
                  )}
                </button>
              )}

              {/* File Title & Badge */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-[10px] font-bold uppercase">
                    .{ext}
                  </span>
                  <span className="text-[10px] font-mono text-[#71717a]">
                    ID: {item.id.slice(0, 14)}
                  </span>
                </div>
                <h2 className="font-bold text-sm text-white break-all leading-snug tracking-tight">
                  {item.name}
                </h2>
              </div>

              {/* Informacje o pliku Table */}
              <div className="rounded-xl bg-[#18181b]/60 border border-white/6 p-3 space-y-2 font-mono text-[11px]">
                <div className="text-[10px] uppercase text-[#71717a] font-bold tracking-wider flex items-center justify-between">
                  <span>METADANE SYSTEMOWE</span>
                  <HardDrive className="w-3.5 h-3.5 text-[#52525b]" />
                </div>
                
                <div className="flex justify-between items-center text-[#a1a1aa] pt-1">
                  <span className="text-[#71717a]">Waga pliku:</span>
                  <span className="font-bold text-white font-mono">{formatBytesCompact(item.size)} ({sizeKB} KB)</span>
                </div>

                <div className="flex justify-between items-center text-[#a1a1aa]">
                  <span className="text-[#71717a]">Modyfikacja:</span>
                  <span className="font-bold text-white font-mono">{dateFormatted}</span>
                </div>

                <div className="flex justify-between items-center text-[#a1a1aa]">
                  <span className="text-[#71717a]">Kategoria:</span>
                  <span className="font-bold text-emerald-400 font-mono">{item.category}</span>
                </div>
              </div>

              {/* Full Path Copy Box */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#71717a]">
                  <span>PEŁNA ŚCIEŻKA DYSKOWA</span>
                  <button onClick={handleCopy} className="text-purple-400 hover:text-purple-300 transition cursor-pointer flex items-center gap-1">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Skopiowano!' : 'Kopiuj'}</span>
                  </button>
                </div>
                <div 
                  role="button"
                  tabIndex={0}
                  onClick={handleCopy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCopy();
                    }
                  }}
                  className="p-2.5 rounded-xl bg-[#0e0e10] border border-white/6 text-[10px] text-[#a1a1aa] font-mono break-all leading-relaxed hover:border-purple-500/40 cursor-pointer transition select-all"
                  title="Kliknij, aby skopiować"
                >
                  {item.path}
                </div>
              </div>

              {/* AI Generation Prompt Box (In Context) */}
              {aiMeta && (
                <div className="rounded-xl bg-purple-950/30 border border-purple-500/30 p-3 space-y-2 font-mono text-[11px] animate-fadeIn">
                  <div className="flex items-center justify-between text-purple-300">
                    <span className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>{aiMeta.generator || 'PROMPT AI'}</span>
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiMeta.positivePrompt || aiMeta.rawText);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 2000);
                      }}
                      className="text-[10px] text-purple-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPrompt ? 'Skopiowano!' : 'Kopiuj'}</span>
                    </button>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0e0e10]/80 border border-purple-500/20 text-[10px] text-purple-200 font-sans leading-relaxed select-all max-h-24 overflow-y-auto">
                    {aiMeta.positivePrompt || aiMeta.rawText}
                  </div>
                  {aiMeta.model && (
                    <div className="flex justify-between items-center text-[10px] text-[#a1a1aa] pt-1">
                      <span>Model:</span>
                      <span className="font-bold text-white truncate max-w-[140px]">{aiMeta.model}</span>
                    </div>
                  )}
                  {aiMeta.seed && (
                    <div className="flex justify-between items-center text-[10px] text-[#a1a1aa]">
                      <span>Seed:</span>
                      <span className="font-bold text-white">{aiMeta.seed}</span>
                    </div>
                  )}
                </div>
              )}

              {/* SHA-256, BLAKE3 & VirusTotal Checksum Box */}
              <div className="rounded-xl bg-[#18181b]/60 border border-white/6 p-3 space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-[#71717a] font-bold tracking-wider">
                    SUMA KONTROLNA I REPUTACJA
                  </span>
                  <Key className="w-3.5 h-3.5 text-[#52525b]" />
                </div>
                {shaHash ? (
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex items-center justify-between text-[9px] text-[#71717a] uppercase">
                        <span>SHA-256</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(shaHash)}
                          className="text-emerald-400 hover:text-white cursor-pointer"
                          title="Kopiuj SHA-256"
                        >
                          Kopiuj
                        </button>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[#0e0e10] border border-white/6 text-[9px] text-emerald-300 break-all leading-tight font-mono select-all">
                        {shaHash}
                      </div>
                    </div>
                    {blakeHash && (
                      <div>
                        <div className="flex items-center justify-between text-[9px] text-[#71717a] uppercase">
                          <span className="flex items-center gap-1">
                            <Cpu className="w-2.5 h-2.5 text-cyan-400" />
                            <span>BLAKE3 (NVMe Ultra-Fast)</span>
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(blakeHash)}
                            className="text-cyan-400 hover:text-white cursor-pointer"
                            title="Kopiuj BLAKE3"
                          >
                            Kopiuj
                          </button>
                        </div>
                        <div className="p-1.5 rounded-lg bg-[#0e0e10] border border-white/6 text-[9px] text-cyan-300 break-all leading-tight font-mono select-all">
                          {blakeHash}
                        </div>
                      </div>
                    )}
                    {vtStatus && (
                      <div className="flex items-center gap-1.5 pt-1 text-[10px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300 font-semibold">{vtStatus}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleCalculateHash}
                    disabled={calculatingHash}
                    className="w-full py-1.5 rounded-lg bg-[#27272a] hover:bg-[#323238] border border-white/8 text-[11px] text-white transition flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                  >
                    <span>{calculatingHash ? 'Obliczanie BLAKE3 & SHA-256...' : 'Oblicz sumy kontrolne pliku'}</span>
                  </button>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: TAGS & AI CONTEXT */}
          {activeTab === 'TAGS' && (
            <div className="space-y-4 animate-fadeInScale">
              <div className="p-3 rounded-xl bg-[#1c1427]/50 border border-purple-500/20 text-[11px] text-[#d8b4fe] flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Automatyczne tagowanie:</span> Tag przypisywany jest natychmiast na podstawie formatu, aktywnego okna i sygnatury pliku.
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] uppercase text-[#71717a] font-bold font-mono tracking-wider">
                  PRZYPISANE TAGI (KLIKNIJ, ABY FILTROWAĆ)
                </div>
                <div className="flex gap-2 flex-wrap">
                  {displayTags.map((tag) => {
                    const isTagActive = activeTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => onTagClick && onTagClick(tag)}
                        title={`Filtruj po ${tag}`}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                          isTagActive
                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/30'
                            : 'bg-[#221731] border-purple-500/30 text-purple-200 hover:bg-purple-900/40 hover:border-purple-400 hover:text-white'
                        }`}
                      >
                        <TagIcon className="w-3 h-3 opacity-60" />
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIONS */}
          {activeTab === 'ACTIONS' && (
            <div className="space-y-2.5 animate-fadeInScale">
              {isCode && onOpenCodeEditor && (
                <button
                  onClick={() => {
                    if (!isProLicensed && onUpgradePro) {
                      onUpgradePro();
                    } else {
                      onOpenCodeEditor(item);
                    }
                  }}
                  className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center justify-between gap-2 shadow-lg ${
                    isProLicensed
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30 border-purple-400/40'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-purple-400" />
                    <span>Edytor kodu (Monaco Studio)</span>
                  </div>
                  {isProLicensed ? (
                    <span className="text-[10px] text-purple-300 font-bold">PRO</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" />
                      <span>PRO</span>
                    </span>
                  )}
                </button>
              )}

              {isImage && onOpenImageEditor && (
                <button
                  onClick={() => {
                    if (!isProLicensed && onUpgradePro) {
                      onUpgradePro();
                    } else {
                      onOpenImageEditor(item);
                    }
                  }}
                  className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center justify-between gap-2 shadow-lg ${
                    isProLicensed
                      ? 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-pink-900/30 border-pink-400/40'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-amber-500/30 text-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-pink-400" />
                    <span>Edytor grafiki (Image Studio)</span>
                  </div>
                  {isProLicensed ? (
                    <span className="text-[10px] text-pink-300 font-bold">PRO</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" />
                      <span>PRO</span>
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={() => onOpenDefault(item.path)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#27272a] hover:bg-[#323238] border border-white/8 text-white text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <ExternalLink className="w-4 h-4 text-purple-400" />
                <span>Otwórz w programie domyślnym</span>
              </button>

              <button
                onClick={() => onOpenInExplorer(item.path)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#27272a] hover:bg-[#323238] border border-white/8 text-white text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <Folder className="w-4 h-4 text-yellow-500" />
                <span>Pokaż w Eksploratorze Windows</span>
              </button>

              <button
                onClick={() => onSendDiscord(item.path)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#27272a] hover:bg-[#323238] border border-white/8 text-white text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <Share2 className="w-4 h-4 text-indigo-400" />
                <span>Wyślij do Discorda / Photoshopa</span>
              </button>

              {onQuickMove && (
                <button
                  onClick={() => onQuickMove(item)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#27272a] hover:bg-[#323238] border border-white/8 text-emerald-300 text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <FolderInput className="w-4 h-4 text-emerald-400" />
                  <span>Przenieś do Organized_Workspace</span>
                </button>
              )}

              {onInstantDelete && (
                <button
                  onClick={() => onInstantDelete(item)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-red-300 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm mt-3"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Usuń plik z dysku (Kosz)</span>
                </button>
              )}
            </div>
          )}

        </div>

        {/* 3. Footer Bar with Quick Summary */}
        <div className="p-3 border-t border-white/8 bg-[#18181b]/60 flex items-center justify-between text-[11px] font-mono text-[#71717a]">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Tarcza zweryfikowana</span>
          </div>
          <span>{formatBytesCompact(item.size)}</span>
        </div>

      </div>
    </aside>
  );
};
