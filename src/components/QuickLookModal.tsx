import React, { useEffect, useState } from 'react';
import { 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight,
  FolderOpen,
  Code2,
  Palette,
  Database,
  Table
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';
import { readFileWithFSA, fileHandleRegistry } from '../utils/fileSystemAccessManager';

interface QuickLookModalProps {
  item: FileItem | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenDefault: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onOpenCodeEditor?: (file: FileItem) => void;
  onOpenImageEditor?: (file: FileItem) => void;
}

export const QuickLookModal: React.FC<QuickLookModalProps> = ({
  item,
  onClose,
  onPrev,
  onNext,
  onOpenDefault,
  onOpenInExplorer,
  onOpenCodeEditor,
  onOpenImageEditor
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dbData, setDbData] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [activeTableIdx, setActiveTableIdx] = useState(0);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setDbData(null);
    setCodeSnippet(null);
    setPdfBlobUrl(null);
    setImageBlobUrl(null);
    setActiveTableIdx(0);

    if (!item) return;

    const controller = new AbortController();
    const extClean = (item.extension || '').toLowerCase();
    const isPdf = extClean === 'pdf';
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'avif'].includes(extClean);
    const isCodeFile = item.category === 'DEV' || [
      'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json', 'lock', 'css', 'scss', 'sass', 'less',
      'html', 'htm', 'py', 'pyw', 'rs', 'go', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
      'cs', 'sql', 'md', 'markdown', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
      'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'xml', 'svg', 'php', 'rb', 'lua', 'txt', 'log'
    ].includes(extClean);

    // 1. Try reading from FileSystemAccess handle if present
    const handle = item.fileHandle || fileHandleRegistry.get(item.id) || fileHandleRegistry.get(item.path);
    if (handle && typeof handle.getFile === 'function') {
      handle.getFile().then((file: File) => {
        if (controller.signal.aborted) return;
        if (isPdf) {
          const url = URL.createObjectURL(file);
          setPdfBlobUrl(url);
        } else if (isImg) {
          const url = URL.createObjectURL(file);
          setImageBlobUrl(url);
        } else if (isCodeFile) {
          file.text().then(text => {
            if (!controller.signal.aborted) setCodeSnippet(text);
          }).catch(() => {});
        }
      }).catch(() => {
        // Fallback to server API below
      });
    }

    if (['sqlite', 'db', 'sqlite3'].includes(extClean)) {
      nexusApi.get<any>(`/api/file/content?path=${encodeURIComponent(item.path)}`, {
        signal: controller.signal,
        timeoutMs: 8000
      })
        .then(data => {
          if (data?.success && data?.type === 'sqlite') {
            setDbData(data);
          }
        })
        .catch(() => {});
    } else if (isCodeFile) {
      nexusApi.get<{ content?: string }>(`/api/file/preview?path=${encodeURIComponent(item.path)}`, {
        signal: controller.signal,
        timeoutMs: 8000
      })
        .then(data => {
          if (data?.content) {
            setCodeSnippet(data.content);
          }
        })
        .catch(() => {});
    }

    return () => {
      controller.abort();
    };
  }, [item?.path, item?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]')) {
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  if (!item) return null;

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

  const handleCopy = () => {
    navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-2xl animate-fadeIn select-none">
      <div className="relative w-full max-w-5xl h-[86vh] bg-[#141416]/95 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-left animate-fadeInScale">
        
        {/* Top Header */}
        <div className="h-13 px-5 border-b border-white/8 bg-[#18181c]/70 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <span className="p-1.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              👁️
            </span>
            <span className="font-bold text-white text-xs sm:text-sm truncate" title={item.name}>
              {item.name}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-500/40 text-[10px] font-mono text-purple-300 font-bold uppercase">
              .{item.extension}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isImage && (
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
                <button
                  onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
                  title="Pomniejsz"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-[#a1a1aa] min-w-[35px] text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
                  title="Powiększ"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="h-3.5 w-px bg-white/10 mx-0.5" />
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
                  title="Obróć o 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isCode && onOpenCodeEditor && (
              <button
                onClick={() => { onOpenCodeEditor(item); onClose(); }}
                className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Edytuj w Nexus Code Studio"
              >
                <Code2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Edytor Kodu</span>
              </button>
            )}

            {isImage && onOpenImageEditor && (
              <button
                onClick={() => { onOpenImageEditor(item); onClose(); }}
                className="px-3 py-1.5 rounded-xl bg-pink-600/30 hover:bg-pink-600/50 border border-pink-500/50 text-pink-200 text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Edytuj w Nexus Image Studio"
              >
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                <span>Edytor Obrazów</span>
              </button>
            )}

            <button
              onClick={() => onOpenDefault(item.path)}
              className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Otwórz w programie domyślnym Windows"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Otwórz</span>
            </button>

            <button
              onClick={() => onOpenInExplorer(item.path)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Pokaż w Eksploratorze Windows"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Eksplorator</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer ml-1"
              title="Zamknij (Esc / Spacja)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Canvas View */}
        <div className="flex-1 bg-[#0c0c0e] relative overflow-hidden flex items-center justify-center p-6">
          {ext === 'pdf' ? (
            <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-[#141418] flex flex-col">
              <iframe
                src={pdfBlobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                className="w-full h-full border-0 rounded-2xl"
                title={`Podgląd PDF: ${item.name}`}
              />
            </div>
          ) : isImage ? (
            <div className="relative max-h-full max-w-full flex items-center justify-center">
              <img
                src={imageBlobUrl || item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                alt={item.name}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                className="max-h-[68vh] max-w-full object-contain rounded-xl shadow-2xl select-none"
              />
            </div>
          ) : dbData && dbData.isSqlite ? (
            <div className="w-full h-full flex flex-col rounded-2xl bg-[#141417] border border-white/10 overflow-hidden text-left font-mono">
              {/* SQLite DB Header Bar */}
              <div className="h-11 px-4 bg-[#1c1c21] border-b border-white/8 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-white">Podgląd Bazy SQLite</span>
                  <span className="text-[#71717a]">({dbData.tableCount} tabel, {dbData.totalRecords} rekordów)</span>
                </div>
                <div className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Node 24 Built-In Engine
                </div>
              </div>

              {/* SQLite Body: Table list & Grid */}
              <div className="flex-1 flex overflow-hidden">
                {/* Tables List */}
                <div className="w-48 bg-[#18181c]/70 border-r border-white/8 p-2 overflow-y-auto space-y-1 shrink-0">
                  <div className="text-[10px] text-[#71717a] uppercase font-bold px-2 py-1">TABELE</div>
                  {dbData.tables.map((t: any, idx: number) => (
                    <button
                      key={t.name}
                      onClick={() => setActiveTableIdx(idx)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition cursor-pointer flex items-center justify-between ${
                        activeTableIdx === idx
                          ? 'bg-purple-600/30 border border-purple-500/50 text-white font-bold'
                          : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[10px] opacity-60">({t.rowCount})</span>
                    </button>
                  ))}
                </div>

                {/* Table Data Preview */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#0e0e11]">
                  {dbData.tables[activeTableIdx] ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="p-3 border-b border-white/6 flex items-center justify-between text-xs bg-[#16161a]">
                        <div className="flex items-center gap-2">
                          <Table className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-bold text-white">{dbData.tables[activeTableIdx].name}</span>
                          <span className="text-[#71717a]">({dbData.tables[activeTableIdx].rowCount} wierszy)</span>
                        </div>
                        <span className="text-[10px] text-[#71717a]">Podgląd pierwszych {dbData.tables[activeTableIdx].sampleData?.length || 0} wierszy</span>
                      </div>

                      <div className="flex-1 overflow-auto p-2">
                        {dbData.tables[activeTableIdx].sampleData?.length > 0 ? (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-white/10 text-[10px] text-[#a1a1aa] uppercase bg-[#18181c]">
                                {dbData.tables[activeTableIdx].columns.map((col: any) => (
                                  <th key={col.name} className="p-2 font-bold whitespace-nowrap">
                                    {col.name} <span className="text-[#52525b] font-normal text-[9px]">({col.type})</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {dbData.tables[activeTableIdx].sampleData.map((row: any, rIdx: number) => (
                                <tr key={rIdx} className="border-b border-white/4 hover:bg-white/5 transition">
                                  {dbData.tables[activeTableIdx].columns.map((col: any) => (
                                    <td key={col.name} className="p-2 text-[#d4d4d8] font-mono whitespace-nowrap text-[11px]">
                                      {String(row[col.name] !== undefined ? row[col.name] : '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="p-8 text-center text-[#71717a] text-xs">
                            Tabela jest pusta (0 wierszy)
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : codeSnippet ? (
            <div className="w-full h-full flex flex-col rounded-2xl bg-[#111118] border border-white/10 overflow-hidden text-left font-mono">
              <div className="h-10 px-4 bg-[#181822] border-b border-white/10 flex items-center justify-between text-xs text-slate-400 shrink-0">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-white">{item.name}</span>
                </div>
                <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Podgląd kodu na żywo
                </span>
              </div>
              <pre className="flex-1 overflow-auto p-4 text-xs text-slate-200 leading-relaxed custom-scrollbar select-text">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          ) : (
            <div className="text-center p-8 space-y-4 font-mono max-w-lg">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl shadow-inner">
                📄
              </div>
              <div className="text-base font-bold text-white">{item.name}</div>
              <div className="text-xs text-[#a1a1aa]">Format pliku bez bezpośredniego renderingu rastrowego</div>
              <div className="text-[11px] text-[#71717a] break-all p-3 rounded-xl bg-white/5 border border-white/8">
                {item.path}
              </div>
            </div>
          )}

          {/* Navigation Arrows */}
          {onPrev && (
            <button
              onClick={onPrev}
              className="absolute left-5 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/60 hover:bg-black/90 text-white border border-white/15 backdrop-blur-md transition-all duration-150 cursor-pointer shadow-2xl hover:scale-105"
              title="Poprzedni plik (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="absolute right-5 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/60 hover:bg-black/90 text-white border border-white/15 backdrop-blur-md transition-all duration-150 cursor-pointer shadow-2xl hover:scale-105"
              title="Następny plik (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Footer info bar */}
        <div className="h-11 px-5 border-t border-white/8 bg-[#18181c]/70 backdrop-blur-md flex items-center justify-between text-xs font-mono text-[#a1a1aa] shrink-0">
          <div className="flex items-center gap-4">
            <span>Waga: <b className="text-white">{formatBytesCompact(item.size)}</b></span>
            <span>Modyfikacja: <b className="text-white">{new Date(item.mtime).toLocaleDateString('pl-PL')}</b></span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[#71717a]">
              <span>Klawisze:</span>
              <kbd className="kbd-badge">←</kbd>
              <kbd className="kbd-badge">→</kbd>
              <span>zmienia plik,</span>
              <kbd className="kbd-badge">Space</kbd>
              <span>zamyka</span>
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
            <span>{copied ? 'Skopiowano!' : 'Kopiuj ścieżkę'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
