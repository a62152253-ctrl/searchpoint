import React, { useState, useEffect } from 'react';
import { X, FolderPlus, FilePlus, Check, Loader2 } from 'lucide-react';
import { FileItem } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDir: string;
  onItemCreated: (item: FileItem) => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  targetDir,
  onItemCreated
}) => {
  const [type, setType] = useState<'file' | 'folder'>('file');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'empty' | 'tsx' | 'json' | 'md' | 'py' | 'sql'>('empty');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const templates: Record<string, { ext: string; content: string; label: string }> = {
    empty: { ext: '.txt', content: '', label: 'Pusty dokument' },
    tsx: { 
      ext: '.tsx', 
      content: `import React from 'react';\n\nexport const Component: React.FC = () => {\n  return (\n    <div className="p-4 rounded-xl bg-neutral-900 text-white font-sans">\n      <h2>Nowy Komponent Nexus</h2>\n    </div>\n  );\n};\n`, 
      label: 'React TSX Komponent' 
    },
    json: { 
      ext: '.json', 
      content: `{\n  "name": "nexus-project",\n  "version": "1.0.0",\n  "private": true\n}\n`, 
      label: 'Konfiguracja JSON' 
    },
    md: { 
      ext: '.md', 
      content: `# Nowy Dokument\n\nUtworzono za pomocą PROJECT NEXUS.\n`, 
      label: 'Notatka Markdown' 
    },
    py: {
      ext: '.py',
      content: `#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n\ndef main() -> None:\n    print("Nexus Autonomous Script")\n\nif __name__ == "__main__":\n    main()\n`,
      label: 'Skrypt Python 3'
    },
    sql: {
      ext: '.sql',
      content: `-- Nexus SQL Schema\nCREATE TABLE IF NOT EXISTS resources (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n`,
      label: 'Schemat Bazy SQL'
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Wpisz nazwę pliku lub folderu');
      return;
    }

    // Windows filename check
    if (/[<>:"/\\|?*]/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('\\')) {
      setError('Nazwa nie może zawierać znaków specjalnych: < > : " / \\ | ? *');
      return;
    }

    setLoading(true);
    setError(null);

    let finalName = trimmed;
    let content = '';

    if (type === 'file') {
      const selectedTpl = templates[template];
      if (!finalName.includes('.')) {
        finalName += selectedTpl.ext;
      }
      content = selectedTpl.content;
    }

    try {
      const data = await nexusApi.post<{ item: FileItem; success: boolean; error?: string }>('/api/action/create-item', {
        type,
        parentPath: targetDir,
        name: finalName,
        content
      }, { timeoutMs: 10000 });

      if (data?.item) {
        onItemCreated(data.item);
        onClose();
      } else {
        throw new Error(data?.error || 'Nie udało się utworzyć elementu.');
      }
    } catch (err: any) {
      setError(err.message || 'Błąd tworzenia elementu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-item-title"
        className="w-full max-w-md rounded-2xl bg-[#16161f] border border-white/15 shadow-2xl overflow-hidden font-sans text-left"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1b1b26]">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {type === 'folder' ? <FolderPlus className="w-5 h-5" /> : <FilePlus className="w-5 h-5" />}
            </span>
            <div>
              <h3 id="create-item-title" className="font-bold text-white text-sm">
                {type === 'folder' ? 'Utwórz nowy folder' : 'Utwórz nowy plik'}
              </h3>
              <p className="text-[10px] font-mono text-[#8e8e98] truncate max-w-[260px]" title={targetDir}>
                Katalog: {targetDir}
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno tworzenia"
            className="p-1.5 rounded-lg text-[#8e8e98] hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-2 bg-[#101016] p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => { setType('file'); setError(null); }}
              className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'file' 
                  ? 'bg-purple-600/35 text-white border border-purple-500/40 shadow-sm' 
                  : 'text-[#8e8e98] hover:text-white'
              }`}
            >
              <FilePlus className="w-3.5 h-3.5 text-blue-400" />
              <span>Plik</span>
            </button>
            <button
              type="button"
              onClick={() => { setType('folder'); setError(null); }}
              className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'folder' 
                  ? 'bg-purple-600/35 text-white border border-purple-500/40 shadow-sm' 
                  : 'text-[#8e8e98] hover:text-white'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5 text-yellow-400" />
              <span>Folder</span>
            </button>
          </div>

          {/* Name Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-[#a1a1aa] uppercase font-bold tracking-wider">
              {type === 'folder' ? 'Nazwa folderu' : 'Nazwa pliku'}
            </label>
            <input
              type="text"
              autoFocus
              placeholder={type === 'folder' ? 'np. NowyProjekt_2026' : 'np. MyComponent.tsx lub notatka.md'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#101016] border border-white/10 focus:border-purple-500/60 text-sm text-white placeholder-[#52525b] font-mono focus:outline-none transition shadow-inner"
            />
          </div>

          {/* Templates for Files */}
          {type === 'file' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[#a1a1aa] uppercase font-bold tracking-wider">
                Szablon początkowy
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(templates).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key as any)}
                    className={`p-2.5 rounded-xl text-left border transition cursor-pointer text-xs ${
                      template === key 
                        ? 'bg-purple-950/45 border-purple-500/60 text-purple-200 shadow-sm' 
                        : 'bg-[#121219] border-white/8 text-[#9ca3af] hover:text-white hover:bg-[#1a1a24]'
                    }`}
                  >
                    <div className="font-bold truncate">{tpl.label}</div>
                    <div className="text-[10px] font-mono text-purple-400">{tpl.ext}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 font-mono">
              ⚠️ {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#a1a1aa] hover:text-white transition cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{loading ? 'Tworzenie...' : 'Utwórz natychmiast'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
