import React, { useState, useEffect } from 'react';
import { Trash2, X, HardDrive, RotateCw, Loader2, CheckCircle2 } from 'lucide-react';
import { formatBytesCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface JunkReport {
  staleInstallers: any[];
  tempJunk: any[];
  totalItems: number;
  reclaimableBytes: number;
  reclaimableMB: string;
  reclaimableGB: string;
}

interface GhostCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (type: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) => void;
  onPurged?: () => void;
}

export const GhostCleanerModal: React.FC<GhostCleanerModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onPurged
}) => {
  const [data, setData] = useState<JunkReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'ALL' | 'INSTALLERS' | 'TEMP'>('ALL');

  const fetchJunk = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await nexusApi.get<JunkReport>('/api/shield/ghost-junk', { timeoutMs: 10000 });
      if (!result || !Array.isArray(result.staleInstallers) || !Array.isArray(result.tempJunk) || typeof result.totalItems !== 'number') {
        throw new Error('Serwer zwrócił nieprawidłowy raport czyszczenia.');
      }
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Nie udało się przeskanować plików.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchJunk();
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

  const displayedCandidates = tab === 'INSTALLERS'
    ? (data?.staleInstallers || [])
    : tab === 'TEMP'
    ? (data?.tempJunk || [])
    : [...(data?.staleInstallers || []), ...(data?.tempJunk || [])];

  const handlePurge = async () => {
    const candidates = [...(data?.staleInstallers || []), ...(data?.tempJunk || [])];
    if (candidates.length === 0) return;
    const confirmed = window.confirm(
      `Przenieść ${candidates.length} wykrytych plików do Kosza systemowego? Puste katalogi zostaną usunięte.`
    );
    if (!confirmed) return;

    setPurging(true);
    setError(null);
    try {
      const res = await nexusApi.post<{
        success?: boolean;
        deletedCount: number;
        recycledFileCount?: number;
        removedDirectoryCount?: number;
        errors: { path: string; error: string }[];
        error?: string;
      }>('/api/shield/purge-ghost-junk', {
        paths: candidates.map(item => item.path)
      }, { timeoutMs: 20000 });

      if (res.deletedCount > 0 && onPurged) onPurged();
      await fetchJunk();

      if (res.errors && res.errors.length > 0) {
        const firstError = res.errors[0]?.error || 'Nieznany błąd.';
        const message = `Obsłużono ${res.deletedCount} z ${candidates.length} pozycji: ${res.recycledFileCount || 0} plików w Koszu, ${res.removedDirectoryCount || 0} pustych katalogów usunięto. ${res.errors.length} problemów: ${firstError}`;
        setError(message);
        if (onToast) onToast('warning', 'Czyszczenie częściowo zakończone', message);
      } else {
        if (onToast) {
          onToast(
            'success',
            'Wyczyszczono zbędne pliki!',
            `${res.recycledFileCount || 0} plików przeniesiono do Kosza; usunięto ${res.removedDirectoryCount || 0} pustych katalogów.`
          );
        }
      }
    } catch (err: any) {
      const message = err.message || 'Nie udało się wyczyścić plików.';
      setError(message);
      if (onToast) onToast('error', 'Czyszczenie nie powiodło się', message);
    } finally {
      setPurging(false);
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
        className="w-full max-w-2xl rounded-2xl bg-[#16161f] border border-white/15 shadow-2xl overflow-hidden font-sans text-left flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ghost-cleaner-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#1b1b26]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <HardDrive className="w-5 h-5" />
            </span>
            <div>
              <h3 id="ghost-cleaner-modal-title" className="font-bold text-white text-base">Ghost Cleaner & Autocleaner Śmieci</h3>
              <p className="text-xs text-[#9ca3af] font-mono">
                Wykrywanie starych instalatorów (.exe/.msi &gt; 7 dni) oraz plików tymczasowych cache
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchJunk}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Odśwież skanowanie"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button 
              type="button"
              onClick={onClose}
              aria-label="Zamknij Ghost Cleaner"
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-mono" role="alert">
              ⚠️ {error}
            </div>
          )}
          
          {/* Big Meter Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/35 to-[#161512] border border-amber-500/35 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-amber-300 font-bold uppercase tracking-wider">
                Do odzyskania jednym kliknięciem
              </span>
              <div className="text-3xl font-extrabold text-white font-mono">
                {data ? `${data.reclaimableGB} GB` : '0.00 GB'}
                <span className="text-xs font-normal text-[#9ca3af] ml-2">
                  ({data?.totalItems || 0} zbędnych plików)
                </span>
              </div>
              <p className="text-xs text-[#b4b4be]">
                Stare instalatory programów oraz porzucone pliki tymczasowe pobierania.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePurge}
              disabled={purging || loading || !data || data.totalItems === 0}
              className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-40 shrink-0"
            >
              {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{purging ? 'Czyszczenie...' : loading ? 'Skanowanie...' : 'Zwolnij miejsce teraz'}</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-xs font-mono uppercase text-[#9ca3af] font-bold tracking-wider">
              Wykryte pozycje ({displayedCandidates.length})
            </h4>
            <div className="flex items-center gap-1 bg-[#101016] p-1 rounded-xl border border-white/8 text-[11px] font-mono">
              {([
                { id: 'ALL', label: `Wszystkie (${data?.totalItems || 0})` },
                { id: 'INSTALLERS', label: `Instalatory (${data?.staleInstallers?.length || 0})` },
                { id: 'TEMP', label: `Tymczasowe (${data?.tempJunk?.length || 0})` }
              ] as const).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    tab === t.id ? 'bg-amber-500/25 text-amber-200 font-bold border border-amber-500/40' : 'text-[#8e8e98] hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* List of Found Files */}
          {displayedCandidates.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {displayedCandidates.map((item, idx) => (
                <div 
                  key={item.path || `${item.name}-${idx}`}
                  className="p-2.5 rounded-xl bg-[#121219] border border-white/8 flex items-center justify-between text-xs font-mono"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-white font-bold truncate" title={item.name}>{item.name}</div>
                    <div className="text-[10px] text-[#71717a] truncate">{item.path}</div>
                  </div>
                  <span className="text-amber-300 font-bold shrink-0">
                    {formatBytesCompact(item.size)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs font-mono text-[#8e8e98] border border-dashed border-white/10 rounded-2xl bg-[#111117] flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>Brak starych instalatorów i śmieci w tej kategorii.</span>
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
