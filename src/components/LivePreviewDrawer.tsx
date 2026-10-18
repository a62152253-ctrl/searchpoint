import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Tag as TagIcon,
  Calendar,
  HardDrive,
  FolderOpen,
  FileCode,
  FileText,
  Play,
  Maximize2,
  ShieldAlert,
  Sparkles,
  Zap,
  Clock
} from 'lucide-react';
import { FileItem, formatBytesCompact, formatDateCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface LivePreviewDrawerProps {
  item: FileItem | null;
  onClose: () => void;
  onOpenInExplorer: (filePath: string) => void;
  onOpenDefault?: (filePath: string) => void;
  onOpenCodeStudio?: (item: FileItem) => void;
  onOpenImageStudio?: (item: FileItem) => void;
  onDeleteEphemeral?: (item: FileItem) => void;
}

export const LivePreviewDrawer: React.FC<LivePreviewDrawerProps> = ({
  item,
  onClose,
  onOpenInExplorer,
  onOpenDefault,
  onOpenCodeStudio,
  onOpenImageStudio,
  onDeleteEphemeral
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [previewData, setPreviewData] = useState<{
    type?: string;
    content?: string;
    language?: string;
    totalLines?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) {
      setPreviewData(null);
      return;
    }

    if (item.blobUrl) {
      setPreviewData({
        type: item.category === 'MEDIA' || item.category === 'SCREENSHOT' ? 'image' : (item.category === 'DEV' ? 'code' : 'binary'),
        content: `// [Plik w pamięci przeglądarki] ${item.name} (${formatBytesCompact(item.size)})`
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();

    nexusApi.get<{ type?: string; content?: string; language?: string; totalLines?: number }>(
      `/api/file/preview?path=${encodeURIComponent(item.path)}`,
      { signal: controller.signal }
    )
      .then(data => {
        setPreviewData(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPreviewData({
            type: item.category === 'DEV' ? 'code' : (item.category === 'MEDIA' || item.category === 'SCREENSHOT' ? 'image' : 'binary'),
            content: `// Podgląd niedostępny: ${item.name}`
          });
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [item]);

  if (!item) return null;

  const copyPath = () => {
    navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCodeContent = () => {
    if (!previewData?.content) return;
    navigator.clipboard.writeText(previewData.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isScreenshot = item.category === 'SCREENSHOT' || item.isDisposable;
  const isImage = item.category === 'MEDIA' || item.category === 'SCREENSHOT' || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes((item.extension || '').toLowerCase());
  const isCode = item.category === 'DEV' || ['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'css', 'html', 'sql', 'md'].includes((item.extension || '').toLowerCase());
  const sizeFormatted = formatBytesCompact(item.size);
  const dateStr = formatDateCompact(item.mtime);

  return (
    <aside
      role="dialog"
      aria-label="Szybki Podgląd Boczny"
      aria-modal="true"
      className="fixed inset-y-0 right-0 w-full sm:w-[520px] z-50 bg-[#14141c]/95 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-[0_24px_70px_rgba(0,0,0,0.95)] text-left font-sans animate-slideLeft"
    >
      {/* 1. Top Bar */}
      <div className="h-14 px-5 border-b border-white/10 bg-[#101018]/95 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-lg select-none">
            {item.category === 'DEV' ? '💻' : item.category === 'MEDIA' ? '🖼️' : item.category === 'SCREENSHOT' ? '📸' : '📦'}
          </span>
          <span className="font-mono text-white font-bold text-xs">Szybki Podgląd Boczny</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-bold uppercase">
            .{item.extension || 'plik'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenInExplorer(item.path)}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title="Otwórz w Eksploratorze Windows"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title="Zamknij (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        
        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-white break-words tracking-tight leading-snug">
            {item.name}
          </h2>
          <div className="text-[11px] font-mono text-purple-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zaindeksowano pomyślnie (Pewność: {Math.round((item.confidence || 0.98) * 100)}%)</span>
          </div>
        </div>

        {/* Properties Grid */}
        <div className="space-y-3 text-xs bg-black/40 p-4 rounded-2xl border border-white/5 font-mono">
          
          <div className="grid grid-cols-3 items-center">
            <span className="flex items-center gap-2 text-[#71717a]">
              <TagIcon className="w-3.5 h-3.5 text-purple-400" />
              <span>Kategoria</span>
            </span>
            <div className="col-span-2">
              <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                {item.subCategory || item.category}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center">
            <span className="flex items-center gap-2 text-[#71717a]">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rozmiar</span>
            </span>
            <span className="col-span-2 font-mono text-white font-bold">
              {sizeFormatted}
            </span>
          </div>

          <div className="grid grid-cols-3 items-center">
            <span className="flex items-center gap-2 text-[#71717a]">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Data modyfikacji</span>
            </span>
            <span className="col-span-2 text-slate-300">
              {dateStr}
            </span>
          </div>

          <div className="grid grid-cols-3 items-center">
            <span className="flex items-center gap-2 text-[#71717a]">
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Lokalizacja</span>
            </span>
            <span className="col-span-2 text-[#a1a1aa] truncate" title={item.path}>
              {item.path}
            </span>
          </div>

        </div>

        {/* Ephemeral Warning if Screenshot */}
        {isScreenshot && (
          <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-200 space-y-1.5 font-mono">
            <div className="font-bold flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Ulotny zrzut ekranu (Status: Triage)</span>
            </div>
            <p className="text-[11px] text-rose-200/80 leading-relaxed font-sans">
              Plik zidentyfikowany jako tymczasowy zrzut ekranu. Zalecana archiwizacja lub zwolnienie miejsca.
            </p>
          </div>
        )}

        {/* Content Preview Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#a1a1aa] uppercase tracking-wider text-[11px] font-bold">
              Podgląd Treści {previewData?.totalLines ? `(${previewData.totalLines} linii)` : ''}
            </span>
            {isCode && previewData?.content && (
              <button
                type="button"
                onClick={copyCodeContent}
                className="text-[10px] font-mono text-purple-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-pointer transition"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'Skopiowano kod!' : 'Kopiuj treść'}</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a0a0f] p-3 overflow-hidden min-h-[220px] flex items-center justify-center relative">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-xs font-mono text-[#a1a1aa] animate-pulse">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Ładowanie podglądu pliku...</span>
              </div>
            ) : isImage ? (
              <div className="w-full flex items-center justify-center p-2">
                <img
                  src={item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                  alt={item.name}
                  className="max-h-72 max-w-full object-contain rounded-xl shadow-lg"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              </div>
            ) : isCode && previewData?.content ? (
              <pre className="w-full text-xs font-mono text-slate-200 overflow-x-auto p-2 leading-relaxed max-h-96 custom-scrollbar select-text">
                <code>{previewData.content}</code>
              </pre>
            ) : (
              <div className="text-center p-8 space-y-2 text-xs font-mono text-[#71717a]">
                <div className="text-2xl">📦</div>
                <div className="text-white font-bold">Plik binarny (Brak podglądu tekstu)</div>
                <div>Rozmiar na dysku: {sizeFormatted}</div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. Action Footer */}
      <div className="p-5 border-t border-white/10 bg-[#101018]/95 space-y-2.5 shrink-0 font-mono">
        
        {/* Primary Action Button */}
        <div className="flex gap-2">
          {isCode && onOpenCodeStudio && (
            <button
              type="button"
              onClick={() => onOpenCodeStudio(item)}
              className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition cursor-pointer"
            >
              <FileCode className="w-4 h-4" />
              <span>Edytuj w Code Studio</span>
            </button>
          )}

          {isImage && onOpenImageStudio && (
            <button
              type="button"
              onClick={() => onOpenImageStudio(item)}
              className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Edytuj w Image Studio</span>
            </button>
          )}

          {onOpenDefault && (
            <button
              type="button"
              onClick={() => onOpenDefault(item.path)}
              className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Otwórz systemowo</span>
            </button>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyPath}
            className="flex-1 py-2.5 px-3 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Skopiowano ścieżkę!' : 'Kopiuj ścieżkę'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenInExplorer(item.path)}
            className="py-2.5 px-3.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Pokaż w Eksploratorze Windows"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Folder</span>
          </button>

          {isScreenshot && onDeleteEphemeral && (
            <button
              type="button"
              onClick={() => onDeleteEphemeral(item)}
              className="py-2.5 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Usuń ten zrzut ekranu"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Usuń</span>
            </button>
          )}
        </div>

      </div>

    </aside>
  );
};
