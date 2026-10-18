import React, { useState, useEffect } from 'react';
import { Copy, X, Trash2, RotateCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatBytesCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface DuplicateEntry {
  type: string;
  original: any;
  duplicate: any;
  savingsBytes: number;
}

interface DeduplicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (type: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) => void;
  onPurged?: () => void;
}

export const DeduplicatorModal: React.FC<DeduplicatorModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onPurged
}) => {
  const [duplicates, setDuplicates] = useState<DuplicateEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [purgingAll, setPurgingAll] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const fetchDups = () => {
    setLoading(true);
    nexusApi.get<any[]>('/api/shield/duplicates', { timeoutMs: 8000 })
      .then(d => {
        if (!Array.isArray(d)) {
          setDuplicates([]);
          return;
        }
        const flattened: DuplicateEntry[] = [];
        for (const group of d) {
          if (Array.isArray(group.duplicatesList) && group.duplicatesList.length > 0 && group.original) {
            for (const copyItem of group.duplicatesList) {
              flattened.push({
                type: group.type || 'EXACT_CONTENT_DUPLICATE',
                original: group.original,
                duplicate: copyItem,
                savingsBytes: copyItem.size || group.size || group.savingsBytes || 0
              });
            }
          } else if (group.original && group.duplicate) {
            flattened.push(group);
          }
        }
        setDuplicates(flattened);
      })
      .catch(err => {
        console.warn('[Deduplicator] Błąd pobierania duplikatów:', err);
        setDuplicates([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchDups();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDeleteDuplicate = async (dup: DuplicateEntry) => {
    if (!dup?.duplicate?.path) return;
    const targetPath = dup.duplicate.path;
    setDeletingPath(targetPath);
    try {
      const res = await nexusApi.post<{ success?: boolean; status?: string; error?: string }>('/api/action/instant-delete', {
        path: targetPath
      });

      if (res?.success || res?.status === 'deleted') {
        setDuplicates(prev => prev.filter(d => d.duplicate.path !== targetPath));
        if (onToast) onToast('success', 'Usunięto zduplikowaną kopię', dup.duplicate.name);
        if (onPurged) onPurged();
      } else if (onToast) {
        onToast('warning', 'Nie udało się usunąć kopii', res?.error || dup.duplicate.name);
      }
    } catch (err: any) {
      if (onToast) onToast('error', 'Błąd usuwania pliku', err.message);
    } finally {
      setDeletingPath(null);
    }
  };

  const handleDeleteAllDuplicates = async () => {
    if (duplicates.length === 0) return;
    setPurgingAll(true);
    let removed = 0;
    try {
      for (const dup of duplicates) {
        if (!dup?.duplicate?.path) continue;
        try {
          const res = await nexusApi.post<{ success?: boolean; status?: string }>('/api/action/instant-delete', {
            path: dup.duplicate.path
          });
          if (res?.success || res?.status === 'deleted') removed++;
        } catch {}
      }
      fetchDups();
      if (onPurged) onPurged();
      if (onToast) onToast('success', `Usunięto ${removed} duplikatów`, 'Zwolniono miejsce w indeksie');
    } finally {
      setPurgingAll(false);
    }
  };

  const totalSavings = duplicates.reduce((acc, d) => acc + (d.savingsBytes || 0), 0);

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
        aria-labelledby="deduplicator-modal-title"
        className="w-full max-w-2xl rounded-2xl bg-[#16161f] border border-white/15 shadow-2xl overflow-hidden font-sans text-left flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1b1b26]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              <Copy className="w-5 h-5" />
            </span>
            <div>
              <h3 id="deduplicator-modal-title" className="font-bold text-white text-base">Łowca Duplikatów w Locie</h3>
              <p className="text-xs text-[#9ca3af] font-mono">
                Wykrywanie niepotrzebnych kopii Windows typu (1).png, (2).png oraz identycznych plików
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchDups}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Odśwież skanowanie duplikatów"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button 
              type="button"
              onClick={onClose}
              aria-label="Zamknij okno deduplikacji"
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
          <div className="p-4 rounded-2xl bg-cyan-950/25 border border-cyan-500/35 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div>
              <span className="text-cyan-300 font-bold text-sm block">Znalezione duplikaty: {duplicates.length}</span>
              <span className="text-[#9ca3af]">Możliwe do zaoszczędzenia: <b className="text-white">{formatBytesCompact(totalSavings)}</b></span>
            </div>

            {duplicates.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteAllDuplicates}
                disabled={purgingAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition cursor-pointer flex items-center gap-1.5 shadow-lg disabled:opacity-50"
              >
                {purgingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{purgingAll ? 'Usuwanie...' : `Usuń wszystkie kopie (${duplicates.length})`}</span>
              </button>
            )}
          </div>

          {duplicates.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-[#8e8e98] border border-dashed border-white/10 rounded-2xl bg-[#111117] flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>Nie wykryto zduplikowanych kopii w aktualnym indeksie.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {duplicates.map((dup, idx) => {
                const isItemDeleting = deletingPath === dup.duplicate.path;
                return (
                  <div 
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[#121219] border border-white/8 hover:border-cyan-500/30 transition flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-rose-300 font-bold truncate">
                        🗑️ Kopia: {dup.duplicate.name}
                      </div>
                      <div className="text-emerald-400 text-[11px] truncate">
                        ✓ Oryginał (zachowany): {dup.original.name}
                      </div>
                      <div className="text-[10px] text-[#71717a]">
                        Odzyskasz: <b className="text-[#a1a1aa]">{formatBytesCompact(dup.savingsBytes)}</b>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDuplicate(dup)}
                      disabled={isItemDeleting}
                      className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-200 border border-rose-500/35 font-bold transition flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {isItemDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      <span>Usuń kopię</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#111117] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#d4d4d8] hover:text-white transition cursor-pointer"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
};
