import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trash2, 
  Clock, 
  Check, 
  FolderSync,
  AlertTriangle,
  Archive,
  CheckSquare,
  Square,
  Sparkles,
  ShieldAlert,
  X,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { FileItem, formatBytesCompact, formatDateCompact } from '../types';
import { LazyThumbnail } from './LazyThumbnail';

interface TriageCommanderProps {
  items: FileItem[];
  targetPath?: string;
  onSelectItem: (item: FileItem) => void;
  onOpenInExplorer?: (path: string) => void;
  onExecuteTriage: (itemIds: string[], action: 'ARCHIVE' | 'PURGE') => void;
}

export const TriageCommander: React.FC<TriageCommanderProps> = ({
  items,
  targetPath,
  onSelectItem,
  onOpenInExplorer,
  onExecuteTriage
}) => {
  const [decayDays, setDecayDays] = useState<number>(7);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{ action: 'ARCHIVE' | 'PURGE'; ids: string[]; count: number; bytes: number } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Filter screenshot and disposable candidate items
  const screenshotItems = useMemo(() => {
    return items.filter(i => 
      i.category === 'SCREENSHOT' || 
      i.isDisposable ||
      /(?:screenshot|zrzut|snip|prtscr|capture|image\s*\(\d+\))/i.test(i.name)
    );
  }, [items]);

  // Filter by age decay
  const filteredByAge = useMemo(() => {
    if (decayDays === 0) return screenshotItems;
    const cutoffTime = Date.now() - (decayDays * 24 * 60 * 60 * 1000);
    return screenshotItems.filter(i => i.mtime < cutoffTime);
  }, [screenshotItems, decayDays]);

  const totalFilteredBytes = useMemo(() => {
    return filteredByAge.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [filteredByAge]);

  const selectedBytes = useMemo(() => {
    const targetIds = selectedIds.size > 0 ? selectedIds : new Set(filteredByAge.map(i => i.id));
    return filteredByAge.filter(i => targetIds.has(i.id)).reduce((acc, i) => acc + (i.size || 0), 0);
  }, [filteredByAge, selectedIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredByAge.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const promptAction = (action: 'ARCHIVE' | 'PURGE') => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : filteredByAge.map(i => i.id);
    if (ids.length === 0) return;
    setConfirmModal({
      action,
      ids,
      count: ids.length,
      bytes: selectedBytes
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmModal) return;
    setActionInProgress(true);
    try {
      await onExecuteTriage(confirmModal.ids, confirmModal.action);
      setSelectedIds(new Set());
      setConfirmModal(null);
    } finally {
      setActionInProgress(false);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmModal) {
        if (e.key === 'Escape') setConfirmModal(null);
        if (e.key === 'Enter') executeConfirmedAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmModal]);

  const getRelativeAge = (mtime: number) => {
    const diffDays = Math.floor((Date.now() - mtime) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Dzisiaj';
    if (diffDays === 1) return 'Wczoraj';
    if (diffDays < 7) return `${diffDays} dni temu`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tyg. temu`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} mies. temu`;
    return `${Math.floor(diffDays / 365)} lat temu`;
  };

  return (
    <div className="w-full space-y-6 font-sans text-left animate-morphIn">
      
      {/* 1. Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#241218]/95 via-[#1a141c]/95 to-[#16161f]/95 backdrop-blur-xl border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono">
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>CENTRUM TRIAŻU ZRZUTÓW EKRANU • {formatBytesCompact(totalFilteredBytes)}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Wykryto {screenshotItems.length.toLocaleString('pl-PL')} zrzutów ekranu i plików ulotnych
          </h1>
          <p className="text-xs text-rose-200/80 max-w-2xl leading-relaxed font-sans">
            Ulotne zrzuty ekranu z komunikatorów (Discord, Teams, Slack) i narzędzi wycinania, które zaśmiecają pulpit.
            Możesz przenieść je do dedykowanego archiwum projektowego lub trwale usunąć.
          </p>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => promptAction('ARCHIVE')}
            disabled={filteredByAge.length === 0}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs font-mono shadow-xl shadow-purple-900/40 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FolderSync className="w-4 h-4" />
            <span>ZARCHIWIZUJ W _ARCHIWUM ({selectedIds.size > 0 ? selectedIds.size : filteredByAge.length})</span>
          </button>

          <button
            type="button"
            onClick={() => promptAction('PURGE')}
            disabled={filteredByAge.length === 0}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold text-xs font-mono shadow-xl shadow-rose-950/40 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            <span>USUŃ TRWALE ({selectedIds.size > 0 ? selectedIds.size : filteredByAge.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Control Toolbar: Decay Filter & Selection */}
      <div className="p-4 rounded-2xl bg-[#14141c]/90 border border-white/10 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        
        {/* Days Filter Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4 text-purple-400" />
          <span className="text-[#a1a1aa]">Wiek plików:</span>
          {[
            { days: 0, label: 'Wszystkie' },
            { days: 1, label: '> 24 godziny' },
            { days: 7, label: '> 7 dni' },
            { days: 14, label: '> 14 dni' },
            { days: 30, label: '> 30 dni' },
            { days: 90, label: '> 90 dni' }
          ].map(({ days, label }) => (
            <button
              key={days}
              type="button"
              onClick={() => setDecayDays(days)}
              className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
                decayDays === days
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                  : 'bg-black/40 border-white/10 text-[#a1a1aa] hover:text-white hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Selection Stats & Toggles */}
        <div className="flex items-center gap-4 text-slate-400 flex-wrap">
          <span>Kandydatów: <strong className="text-white font-bold">{filteredByAge.length.toLocaleString('pl-PL')}</strong></span>
          <span>Do odzyskania: <strong className="text-rose-400 font-bold">{formatBytesCompact(totalFilteredBytes)}</strong></span>

          <button
            type="button"
            onClick={selectedIds.size > 0 ? clearSelection : selectAllFiltered}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-purple-300 hover:text-white transition cursor-pointer font-semibold flex items-center gap-1.5"
          >
            {selectedIds.size > 0 ? <CheckSquare className="w-3.5 h-3.5 text-purple-400" /> : <Square className="w-3.5 h-3.5 text-[#71717a]" />}
            <span>{selectedIds.size > 0 ? `Odznacz (${selectedIds.size})` : 'Zaznacz widoczne'}</span>
          </button>
        </div>
      </div>

      {/* 3. Empty State */}
      {filteredByAge.length === 0 && (
        <div className="p-12 rounded-3xl bg-[#14141c]/50 border border-white/10 text-center space-y-4 font-mono">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
            ✨
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Brak zrzutów ekranu do oczyszczenia</h3>
            <p className="text-xs text-[#a1a1aa] font-sans max-w-sm mx-auto">
              Twój pulpit i katalogi są czyste. Brak zrzutów ekranu spełniających kryterium wieku ({decayDays === 0 ? 'dowolny wiek' : `> ${decayDays} dni`}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDecayDays(0)}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
          >
            Pokaż wszystkie zrzuty ekranu
          </button>
        </div>
      )}

      {/* 4. Triage Grid */}
      {filteredByAge.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
          {filteredByAge.slice(0, 180).map((item) => {
            const isSelected = selectedIds.has(item.id);
            const relativeAge = getRelativeAge(item.mtime);

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectItem(item);
                  }
                }}
                className={`p-3 rounded-2xl border transition flex flex-col justify-between cursor-pointer text-left relative overflow-hidden backdrop-blur-sm ${
                  isSelected 
                    ? 'border-rose-500/70 bg-rose-950/30 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40' 
                    : 'bg-[#14141c]/90 border-white/[0.07] hover:border-rose-500/40 hover:bg-[#1a141e]'
                }`}
              >
                {/* Checkbox trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(item.id);
                  }}
                  className={`absolute top-2 left-2 p-1 rounded-lg border transition cursor-pointer z-10 ${
                    isSelected ? 'bg-rose-600 border-rose-400 text-white' : 'bg-black/70 border-white/20 hover:border-white/40 text-transparent'
                  }`}
                  title={isSelected ? 'Odznacz' : 'Zaznacz'}
                >
                  <Check className="w-3 h-3 text-white" />
                </button>

                {/* Age Badge */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 border border-white/10 text-[9px] font-mono text-rose-300 z-10">
                  {relativeAge}
                </div>

                <div>
                  {/* Visual Thumbnail */}
                  <div className="w-full h-28 rounded-xl bg-[#0a0a0f] border border-white/5 flex items-center justify-center mb-2 overflow-hidden">
                    <LazyThumbnail
                      path={item.path}
                      name={item.name}
                      extension={item.extension}
                      category={item.category}
                      aspectRatio="video"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="text-[11px] font-semibold text-white truncate group-hover:text-rose-300 transition" title={item.name}>
                    {item.name}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-[#71717a]">
                  <span className="text-rose-400 font-bold">{formatBytesCompact(item.size)}</span>
                  <span>{formatDateCompact(item.mtime)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Safety Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-[#14141c] border border-rose-500/40 p-6 space-y-5 shadow-2xl font-mono text-left animate-scaleUp">
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center text-2xl shrink-0">
                {confirmModal.action === 'PURGE' ? '🗑️' : '📦'}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmModal.action === 'PURGE' ? 'Potwierdzenie Usunięcia' : 'Potwierdzenie Archiwizacji'}
                </h3>
                <p className="text-xs text-[#a1a1aa] font-sans">
                  {confirmModal.action === 'PURGE' 
                    ? 'Pliki zostaną bezpiecznie przeniesione do Kosza Windows.' 
                    : 'Pliki zostaną zorganizowane w folderze _Nexus_Archiwum.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#a1a1aa]">
                <span>Liczba elementów:</span>
                <strong className="text-white">{confirmModal.count.toLocaleString('pl-PL')} plików</strong>
              </div>
              <div className="flex justify-between text-[#a1a1aa]">
                <span>Przestrzeń do odzyskania:</span>
                <strong className="text-rose-400">{formatBytesCompact(confirmModal.bytes)}</strong>
              </div>
              <div className="flex justify-between text-[#a1a1aa]">
                <span>Tryb operacji:</span>
                <strong className="text-purple-300">{confirmModal.action === 'PURGE' ? 'Bezpieczne usunięcie (Kosz)' : 'Porządkowanie (Move)'}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={actionInProgress}
                className="w-1/2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition cursor-pointer"
              >
                Anuluj (Esc)
              </button>
              
              <button
                type="button"
                onClick={executeConfirmedAction}
                disabled={actionInProgress}
                className={`w-1/2 py-2.5 rounded-xl text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
                  confirmModal.action === 'PURGE' 
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50' 
                    : 'bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-950/50'
                }`}
              >
                {actionInProgress ? (
                  <span>Przetwarzanie...</span>
                ) : (
                  <>
                    <span>Wykonaj teraz (Enter)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
