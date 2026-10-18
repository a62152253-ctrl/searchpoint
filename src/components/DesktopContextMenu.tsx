import React, { useEffect, useRef } from 'react';
import { 
  ExternalLink, 
  FolderOpen, 
  Copy, 
  Share2, 
  ShieldCheck, 
  Eye, 
  Archive, 
  FileText,
  Code2,
  Palette
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface DesktopContextMenuProps {
  item: FileItem;
  position: ContextMenuPosition;
  onClose: () => void;
  onOpenDefault: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onCopyPath: (path: string) => void;
  onCopyName: (name: string) => void;
  onSendDiscord: (path: string) => void;
  onCalculateHash: (path: string) => void;
  onQuickLook: (item: FileItem) => void;
  onOpenCodeEditor?: (item: FileItem) => void;
  onOpenImageEditor?: (item: FileItem) => void;
}

export const DesktopContextMenu: React.FC<DesktopContextMenuProps> = ({
  item,
  position,
  onClose,
  onOpenDefault,
  onOpenInExplorer,
  onCopyPath,
  onCopyName,
  onSendDiscord,
  onCalculateHash,
  onQuickLook,
  onOpenCodeEditor,
  onOpenImageEditor
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
        if (!buttons || buttons.length === 0) return;
        const currentActive = document.activeElement as HTMLButtonElement;
        const index = Array.from(buttons).indexOf(currentActive);
        if (e.key === 'ArrowDown') {
          const nextIndex = index >= 0 && index < buttons.length - 1 ? index + 1 : 0;
          buttons[nextIndex]?.focus();
        } else {
          const prevIndex = index > 0 ? index - 1 : buttons.length - 1;
          buttons[prevIndex]?.focus();
        }
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const x = Math.max(10, Math.min(position.x, window.innerWidth - 260));
  const y = Math.max(10, Math.min(position.y, window.innerHeight - 380));

  const ext = (item.extension || '').toLowerCase();
  const isZip = ['zip', 'rar', '7z'].includes(ext);
  const CODE_EXTS = new Set([
    'tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'json', 'lock', 'css', 'scss', 'sass', 'less',
    'html', 'htm', 'py', 'pyw', 'rs', 'go', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'cs', 'sql', 'md', 'markdown', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'xml', 'svg', 'php', 'rb', 'lua', 'txt', 'log'
  ]);
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'avif']);
  const isImage = IMAGE_EXTS.has(ext);
  const isCode = CODE_EXTS.has(ext) || item.category === 'DEV';

  return (
    <div
      ref={menuRef}
      style={{ left: `${x}px`, top: `${y}px` }}
      role="menu"
      aria-label={`Menu kontekstowe: ${item.name}`}
      className="fixed z-[1000] w-60 rounded-2xl bg-[#16161f]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 font-sans text-xs text-[#ddd] select-none animate-fadeIn"
    >
      {/* File Header */}
      <div className="px-2.5 py-2 border-b border-white/10 mb-1 bg-white/[0.02] rounded-t-xl">
        <div className="font-bold text-white truncate text-[11px]" title={item.name}>
          {item.name}
        </div>
        <div className="text-[10px] font-mono text-[#8e8e98] flex items-center justify-between mt-0.5">
          <span>{formatBytesCompact(item.size)}</span>
          <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
            .{item.extension.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Menu Action Items */}
      <div className="space-y-0.5" role="none">
        {isCode && onOpenCodeEditor && (
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenCodeEditor(item); onClose(); }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-purple-900/35 hover:bg-purple-800/55 focus-visible:bg-purple-800/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-purple-100 border border-purple-500/30 transition text-left cursor-pointer font-semibold mb-0.5"
          >
            <span className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Nexus Code Studio</span>
            </span>
            <span className="text-[9px] font-mono text-purple-300">IDE</span>
          </button>
        )}

        {isImage && onOpenImageEditor && (
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenImageEditor(item); onClose(); }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-pink-900/35 hover:bg-pink-800/55 focus-visible:bg-pink-800/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pink-400 text-pink-100 border border-pink-500/30 transition text-left cursor-pointer font-semibold mb-0.5"
          >
            <span className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-pink-400" />
              <span>Nexus Image Studio</span>
            </span>
            <span className="text-[9px] font-mono text-pink-300">AI</span>
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          onClick={() => { onQuickLook(item); onClose(); }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#d4d4d8] hover:text-white transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Eye className="w-3.5 h-3.5 text-purple-400" />
            <span>Szybki podgląd</span>
          </span>
          <kbd className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[#9ca3af]">Spacja</kbd>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => { onOpenDefault(item.path); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-white transition text-left cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
          <span>Otwórz w programie domyślnym</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => { onOpenInExplorer(item.path); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#d4d4d8] hover:text-white transition text-left cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-yellow-500" />
          <span>Pokaż w Eksploratorze Windows</span>
        </button>

        <div className="h-px bg-white/10 my-1" role="separator" />

        <button
          type="button"
          role="menuitem"
          onClick={() => { onCopyPath(item.path); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#d4d4d8] hover:text-white transition text-left cursor-pointer font-mono text-[11px]"
        >
          <Copy className="w-3.5 h-3.5 text-[#8e8e98]" />
          <span>Kopiuj pełną ścieżkę</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => { onCopyName(item.name); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#d4d4d8] hover:text-white transition text-left cursor-pointer font-mono text-[11px]"
        >
          <FileText className="w-3.5 h-3.5 text-[#8e8e98]" />
          <span>Kopiuj samą nazwę pliku</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => { onSendDiscord(item.path); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#d4d4d8] hover:text-white transition text-left cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Wyślij do Discorda / Photoshopa</span>
        </button>

        <div className="h-px bg-white/10 my-1" role="separator" />

        <button
          type="button"
          role="menuitem"
          onClick={() => { onCalculateHash(item.path); onClose(); }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-[#a1a1aa] hover:text-white transition text-left cursor-pointer font-mono text-[11px]"
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Oblicz sumę kontrolną</span>
          </span>
          <span className="text-[9px] text-emerald-400 font-bold">SHA-256</span>
        </button>

        {isZip && (
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenDefault(item.path); onClose(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-400 text-yellow-400 hover:text-yellow-300 transition text-left cursor-pointer font-mono text-[11px]"
          >
            <Archive className="w-3.5 h-3.5 text-yellow-500" />
            <span>Zbadaj strukturę archiwum</span>
          </button>
        )}
      </div>
    </div>
  );
};
