import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  X, 
  RotateCcw, 
  Trash2, 
  FileCode, 
  Flame, 
  BrainCircuit, 
  Search, 
  CheckCircle2, 
  XCircle, 
  RefreshCw 
} from 'lucide-react';
import { formatBytesCompact } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface QuarantinedItem {
  id: string;
  originalPath: string;
  vaultPath: string;
  name: string;
  size: number;
  threatType: string;
  threatReason: string;
  threatDetail: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARNING';
  quarantinedAt: number;
  isBenignDev?: boolean;
}

interface SmartShieldQuarantineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreThreat?: (item: QuarantinedItem) => void;
  onToast?: (type: 'success' | 'info' | 'warning', title: string, desc?: string) => void;
}

function getThreatBadgeProps(item: QuarantinedItem) {
  if (item.isBenignDev) {
    return {
      className: 'bg-blue-950 text-blue-300 border-blue-500/40',
      label: '✨ SAFE DEV SCRIPT'
    };
  }
  if (item.threatType.startsWith('MALWARE')) {
    return {
      className: 'bg-red-950 text-red-300 border-red-500/40',
      label: '🛑 MALWARE THREAT'
    };
  }
  return {
    className: 'bg-purple-950 text-purple-300 border-purple-500/40',
    label: '🔞 NSFW BLOCKED'
  };
}

export const SmartShieldQuarantineModal: React.FC<SmartShieldQuarantineModalProps> = ({
  isOpen,
  onClose,
  onRestoreThreat,
  onToast
}) => {
  const [items, setItems] = useState<QuarantinedItem[]>([]);
  const [isShieldActive, setIsShieldActive] = useState(true);
  const [blockNsfw, setBlockNsfw] = useState(true);
  const [blockMalware, setBlockMalware] = useState(true);
  const [useContextualAnalysis, setUseContextualAnalysis] = useState(true);

  // Safe false-positives batch recovery
  const [safeCount, setSafeCount] = useState(0);
  const [isRestoringSafeBatch, setIsRestoringSafeBatch] = useState(false);

  // Live Context NLP Tester State
  const [isTesterOpen, setIsTesterOpen] = useState(false);
  const [testInput, setTestInput] = useState('dorośli w statystyce są mądrzejsi bo ktoś dał swe badania naukowe');
  const [testResult, setTestResult] = useState<any>(null);
  const [isEvaluatingTest, setIsEvaluatingTest] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchQuarantine = () => {
    setLoading(true);
    nexusApi.get<any>('/api/shield/quarantine', { timeoutMs: 8000 })
      .then(d => setItems(Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : [])))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));

    nexusApi.get<any>('/api/shield/status', { timeoutMs: 5000 })
      .then(d => {
        if (!d || typeof d !== 'object') return;
        if (typeof d.isShieldActive === 'boolean') setIsShieldActive(d.isShieldActive);
        if (typeof d.blockNsfw === 'boolean') setBlockNsfw(d.blockNsfw);
        if (typeof d.blockMalware === 'boolean') setBlockMalware(d.blockMalware);
        if (typeof d.useContextualAnalysis === 'boolean') {
          setUseContextualAnalysis(d.useContextualAnalysis);
        }
      })
      .catch(() => {});

    // Check for safe items that can be recovered
    nexusApi.get<{ safeCount?: number }>('/api/shield/re-evaluate', { timeoutMs: 5000 })
      .then(d => {
        if (d && typeof d.safeCount === 'number') {
          setSafeCount(d.safeCount);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuarantine();
      handleRunContextTest('dorośli w statystyce są mądrzejsi bo ktoś dał swe badania naukowe');
    }
  }, [isOpen]);

  const handleRunContextTest = async (phrase: string) => {
    setTestInput(phrase);
    setIsEvaluatingTest(true);
    try {
      const res = await nexusApi.post<any>('/api/shield/test-context', {
        name: phrase.length < 50 ? phrase : 'badanie_naukowe.pdf',
        content: phrase
      }, { timeoutMs: 8000 });
      setTestResult(res);
    } catch (err) {
      console.warn('[QuarantineModal] Test context evaluation error:', err);
    } finally {
      setIsEvaluatingTest(false);
    }
  };

  if (!isOpen) return null;

  const handleRestore = async (id: string) => {
    try {
      const res = await nexusApi.post<{ success: boolean; item?: any; error?: string }>('/api/shield/restore', { id });

      if (res?.success) {
        setItems(prev => prev.filter(i => i.id !== id));
        setSafeCount(prev => Math.max(0, prev - 1));
        if (res.item && onRestoreThreat) {
          onRestoreThreat(res.item);
        }
        if (onToast) onToast('success', 'Przywrócono plik z kwarantanny', res.item?.name);
      } else if (onToast) {
        onToast('warning', 'Nie udało się przywrócić pliku', res?.error || 'Spróbuj ponownie.');
      }
    } catch (err: any) {
      console.warn('[QuarantineModal] Restore file error:', err);
      if (onToast) onToast('warning', 'Błąd przywracania pliku', err.message || 'Sprawdź połączenie z serwerem.');
    }
  };

  const handleRestoreSafeBatch = async () => {
    setIsRestoringSafeBatch(true);
    try {
      const res = await nexusApi.post<{ restoredCount: number }>('/api/shield/restore-safe-batch', {}, { timeoutMs: 15000 });

      if (res?.restoredCount > 0) {
        if (onToast) onToast('success', `Przywrócono ${res.restoredCount} bezpiecznych skryptów`, 'Legalne narzędzia deweloperskie wróciły na swoje miejsce.');
        fetchQuarantine();
      } else if (onToast) {
        onToast('info', 'Brak bezpiecznych skryptów do przywrócenia', 'Wszystkie pozostałe pliki zawierają podejrzane sygnatury.');
      }
    } catch (err: any) {
      console.warn('[QuarantineModal] Restore safe batch error:', err);
      if (onToast) onToast('warning', 'Błąd podczas przywracania', err.message || 'Spróbuj ponownie za chwilę.');
    } finally {
      setIsRestoringSafeBatch(false);
    }
  };

  const handlePurge = async (id: string) => {
    try {
      const res = await nexusApi.post<{ success: boolean }>('/api/shield/purge', { id });
      if (res?.success) {
        setItems(prev => prev.filter(i => i.id !== id));
        if (onToast) onToast('info', 'Zagrożenie zostało trwale usunięte', 'Plik skasowany z dysku');
      }
    } catch (err) {
      console.warn('[QuarantineModal] Purge file error:', err);
    }
  };

  const handlePurgeAll = async () => {
    try {
      const res = await nexusApi.post<{ success: boolean; purgedCount: number }>('/api/shield/purge-all');
      if (res?.success) {
        setItems([]);
        setSafeCount(0);
        if (onToast) onToast('success', 'Wyczyszczono kwarantannę', `Usunięto ${res.purgedCount} elementów.`);
      }
    } catch (err) {
      console.warn('[QuarantineModal] Purge all error:', err);
    }
  };

  const handleToggleRule = async (rule: 'shield' | 'nsfw' | 'malware' | 'context') => {
    let newShield = isShieldActive;
    let newNsfw = blockNsfw;
    let newMalware = blockMalware;
    let newContext = useContextualAnalysis;

    if (rule === 'shield') newShield = !isShieldActive;
    if (rule === 'nsfw') newNsfw = !blockNsfw;
    if (rule === 'malware') newMalware = !blockMalware;
    if (rule === 'context') newContext = !useContextualAnalysis;

    setIsShieldActive(newShield);
    setBlockNsfw(newNsfw);
    setBlockMalware(newMalware);
    setUseContextualAnalysis(newContext);

    try {
      await nexusApi.post('/api/shield/toggle', {
        isShieldActive: newShield,
        blockNsfw: newNsfw,
        blockMalware: newMalware,
        useContextualAnalysis: newContext
      });
    } catch (err) {
      console.warn('[QuarantineModal] Toggle rule error:', err);
      if (onToast) onToast('warning', 'Błąd zapisu reguły Smart Shield', 'Nie udało się zsynchronizować ustawień.');
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div 
        className="w-full max-w-4xl rounded-2xl bg-[#141416] border border-[#2e2e2e] shadow-2xl overflow-hidden font-sans text-left flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#292929] bg-[#18181c]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Kwarantanna i ochrona plików</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                  Ochrona w tle
                </span>
              </div>
              <p className="text-xs text-[#888] font-mono">
                Przeglądaj zatrzymane pliki, przywracaj bezpieczne pozycje lub usuwaj je na stałe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchQuarantine}
              disabled={loading}
              className="p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-white/5 transition cursor-pointer"
              title="Odśwież kwarantannę"
              aria-label="Odśwież kwarantannę"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            </button>

            <button
              onClick={() => setIsTesterOpen(!isTesterOpen)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                isTesterOpen 
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md' 
                  : 'bg-[#222] text-[#bbb] hover:text-white border-[#333]'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
              <span>Tester Kontekstu</span>
            </button>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-white/5 transition cursor-pointer"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Security Controls Strip */}
        <div className="p-4 bg-[#121214] border-b border-[#242426] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isShieldActive}
                onChange={() => handleToggleRule('shield')}
                className="rounded accent-emerald-500 cursor-pointer"
              />
              <span className={isShieldActive ? 'text-emerald-300 font-bold' : 'text-[#777]'}>
                🛡️ Tarcza w tle
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useContextualAnalysis}
                onChange={() => handleToggleRule('context')}
                className="rounded accent-purple-500 cursor-pointer"
              />
              <span className={useContextualAnalysis ? 'text-purple-300 font-bold' : 'text-[#777]'}>
                🧠 Analiza kontekstu (nie blokuj słów na ślepo)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blockMalware}
                onChange={() => handleToggleRule('malware')}
                className="rounded accent-red-500 cursor-pointer"
              />
              <span className={blockMalware ? 'text-red-300 font-bold' : 'text-[#777]'}>
                🛑 Blokuj złośliwe skrypty (zezwól na dev)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blockNsfw}
                onChange={() => handleToggleRule('nsfw')}
                className="rounded accent-purple-500 cursor-pointer"
              />
              <span className={blockNsfw ? 'text-purple-300 font-bold' : 'text-[#777]'}>
                🔞 Filtr pornografii
              </span>
            </label>
          </div>

          {items.length > 0 && (
            <button
              onClick={handlePurgeAll}
              className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ml-auto"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Trwale skasuj zagrożenia ({items.length})</span>
            </button>
          )}
        </div>

        {/* Live Context NLP Tester (Interactive Demonstration) */}
        {isTesterOpen && (
          <div className="p-4 bg-purple-950/20 border-b border-purple-500/30 font-sans space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold font-mono text-purple-300 uppercase tracking-wider">
                  Interaktywny Symulator Kontekstu Semantycznego (NLP Context Tester)
                </span>
              </div>
              <span className="text-[10px] text-purple-400 font-mono">
                Weryfikuje to samo słowo ('dorosły' / 'adult') w różnych kontekstach
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <span className="text-[#888] text-[11px] self-center">Przetestuj gotowe przykłady:</span>
              <button
                onClick={() => handleRunContextTest('dorośli w statystyce są mądrzejsi bo ktoś dał swe badania naukowe')}
                className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 transition cursor-pointer text-[11px]"
              >
                🔬 "dorośli w statystyce są mądrzejsi bo badania naukowe"
              </button>
              <button
                onClick={() => handleRunContextTest('dorosły rucha')}
                className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-300 transition cursor-pointer text-[11px]"
              >
                🔞 "dorosły rucha"
              </button>
              <button
                onClick={() => handleRunContextTest('adult education survey research study 2024.pdf')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 transition cursor-pointer text-[11px]"
              >
                📄 "adult education survey research study"
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunContextTest(testInput)}
                placeholder="Wpisz dowolne zdanie lub nazwę pliku..."
                className="flex-1 bg-[#1a1a1e] border border-[#383838] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white placeholder-[#666] outline-none font-mono"
              />
              <button
                onClick={() => handleRunContextTest(testInput)}
                disabled={isEvaluatingTest}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                {isEvaluatingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Przeanalizuj</span>
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono transition animate-fadeIn ${
                !testResult.isBlocked 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
                  : 'bg-red-950/40 border-red-500/40 text-red-200'
              }`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {!testResult.isBlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-bold text-sm">
                      {!testResult.isBlocked ? '🟢 ZEZWOLONO (PLIK BEZPIECZNY)' : '🔴 ZABLOKOWANO (NSFW QUARANTINE)'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-black/40 border border-current">
                      {testResult.type || 'CONTEXT_EVAL'}
                    </span>
                  </div>
                  <p className="text-xs opacity-90">{testResult.reason || 'Brak wykrytych zagrożeń'}</p>
                  {testResult.detail && <p className="text-[11px] opacity-75">{testResult.detail}</p>}
                </div>

                {testResult.scores && (
                  <div className="text-right text-[11px] font-mono shrink-0 pl-4 border-l border-white/10">
                    <div>Waga naukowa: <span className="text-emerald-400 font-bold">{testResult.scores.benignScore}</span></div>
                    <div>Waga seksualna: <span className="text-red-400 font-bold">{testResult.scores.sexualScore}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Safe Dev Scripts Recovery Strip */}
        {safeCount > 0 && (
          <div className="p-3.5 bg-blue-950/30 border-b border-blue-500/40 flex items-center justify-between gap-3 text-xs font-mono animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <FileCode className="w-4 h-4" />
              </span>
              <div>
                <span className="text-blue-300 font-bold">
                  Wykryto {safeCount} bezpiecznych skryptów deweloperskich w kwarantannie!
                </span>
                <p className="text-[11px] text-[#aaa]">
                  Pliki .bat / .ps1 (np. import_database.php, skrypty npm) omyłkowo zablokowane w starej wersji.
                </p>
              </div>
            </div>

            <button
              onClick={handleRestoreSafeBatch}
              disabled={isRestoringSafeBatch}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shrink-0 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRestoringSafeBatch ? 'animate-spin' : ''}`} />
              <span>{isRestoringSafeBatch ? 'Przywracanie...' : `Przywróć wszystkie (${safeCount})`}</span>
            </button>
          </div>
        )}

        {/* Quarantined Items List */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3 text-xs font-mono">
              <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                ✓
              </div>
              <h4 className="text-white font-bold text-sm">Brak zablokowanych zagrożeń</h4>
              <p className="text-[#777] max-w-sm mx-auto">
                Twój dysk i katalog Pobrane są czyste. Wszystkie podejrzane skrypty i złośliwe pliki zostaną natychmiast zablokowane i pojawią się w tym sejfie.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const badge = getThreatBadgeProps(item);
              return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans group ${
                  item.isBenignDev 
                    ? 'bg-[#181d24] border-blue-500/30 hover:border-blue-500/60' 
                    : 'bg-[#18181c] border-[#2b2b2b] hover:border-[#383838]'
                }`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badge.className}`}>
                      {badge.label}
                    </span>
                    <h4 className="text-white font-bold text-sm truncate" title={item.name}>
                      {item.name}
                    </h4>
                  </div>

                  <p className="text-[#bbb] text-xs">
                    {item.threatReason}
                  </p>

                  <div className="text-[10px] font-mono text-[#666] flex items-center gap-3 truncate">
                    <span>Oryginalna ścieżka: {item.originalPath}</span>
                    <span>•</span>
                    <span>{formatBytesCompact(item.size)}</span>
                    <span>•</span>
                    <span>{new Date(item.quarantinedAt).toLocaleTimeString('pl-PL')}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(item.id)}
                    className={`px-3 py-1.5 rounded-lg border transition text-xs font-medium flex items-center gap-1 cursor-pointer ${
                      item.isBenignDev
                        ? 'bg-blue-900/40 hover:bg-blue-900 text-blue-200 border-blue-500/40 font-bold'
                        : 'bg-[#242428] hover:bg-[#303036] text-[#ccc] hover:text-white border-[#38383e]'
                    }`}
                    title="Przywróć plik z kwarantanny"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                    <span>Przywróć</span>
                  </button>

                  <button
                    onClick={() => handlePurge(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/30 transition text-xs font-medium flex items-center gap-1 cursor-pointer"
                    title="Trwale usuń z dysku"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Usuń</span>
                  </button>
                </div>
              </div>
            );
          })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-[#111118] flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Zablokowane pliki są bezpiecznie odizolowane w .quarantine_vault</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition cursor-pointer font-bold"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
};
