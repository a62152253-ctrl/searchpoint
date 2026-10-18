import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  FileText,
  Check,
  Loader2,
  Crown,
  Lock
} from 'lucide-react';
import { FileItem } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface OllamaModel {
  name: string;
  model: string;
  sizeFormatted: string;
  parameterSize: string;
  isVision?: boolean;
}

interface OllamaStatusResponse {
  installed: boolean;
  running: boolean;
  status: string;
  models: OllamaModel[];
  modelCount: number;
  error?: string;
}

interface AnalysisResultItem {
  id: string;
  path: string;
  name: string;
  success: boolean;
  status?: string;
  inspectionSource?: string;
  category?: string;
  tags?: string[];
  description?: string;
  confidence?: number;
  error?: string;
}

interface OllamaSmartTaggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FileItem[];
  isProLicensed?: boolean;
  onOpenProModal?: () => void;
  onApplyTags?: (updatedItems: { id: string; path: string; tags: string[]; category?: string }[]) => void;
}

export const OllamaSmartTaggingModal: React.FC<OllamaSmartTaggingModalProps> = ({
  isOpen,
  onClose,
  items,
  isProLicensed = false,
  onOpenProModal,
  onApplyTags
}) => {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusResponse | null>(null);
  const [serverIsPro, setServerIsPro] = useState<boolean>(isProLicensed);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [scope, setScope] = useState<'ALL' | 'UNVERIFIED' | 'MEDIA' | 'DEV'>('UNVERIFIED');

  // Analysis run state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [results, setResults] = useState<AnalysisResultItem[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  const effectiveIsPro = isProLicensed || serverIsPro;
  const maxAllowedItems = effectiveIsPro ? 50 : 5;

  // Check Ollama daemon & authoritative license status
  const checkStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await nexusApi.get<any>('/api/ai/tagging/status', { timeoutMs: 6000 });
      if (data.license && typeof data.license.isPro === 'boolean') {
        setServerIsPro(data.license.isPro);
      }
      if (data.ollama) {
        setOllamaStatus(data.ollama);
        if (data.ollama.models && data.ollama.models.length > 0 && !selectedModel) {
          const vis = data.ollama.models.find((m: OllamaModel) => m.isVision);
          setSelectedModel(vis ? vis.name : data.ollama.models[0].name);
        }
      }
    } catch (_) {
      setOllamaStatus({
        installed: false,
        running: false,
        status: 'OFFLINE',
        models: [],
        modelCount: 0,
        error: 'Nie można połączyć się z lokalną usługą Ollama.'
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    setServerIsPro(isProLicensed);
  }, [isProLicensed]);

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setResults([]);
      setAnalysisError(null);
      setAppliedSuccess(false);
    }
  }, [isOpen]);

  // Light-dismiss Escape key support
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const candidateItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    if (scope === 'UNVERIFIED') {
      return items.filter(i => {
        const t = i.tags || [];
        return (
          t.length === 0 ||
          t.includes('#do_sprawdzenia') ||
          t.includes('#nieznane') ||
          i.category === 'OTHER' ||
          i.confidence < 0.7
        );
      });
    }
    if (scope === 'MEDIA') {
      return items.filter(i => ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes((i.extension || '').toLowerCase()));
    }
    if (scope === 'DEV') {
      return items.filter(i => i.category === 'DEV');
    }
    return items;
  }, [items, scope]);

  const currentModelObj = useMemo(() => {
    if (!ollamaStatus?.models) return null;
    return ollamaStatus.models.find(m => m.name === selectedModel) || null;
  }, [ollamaStatus, selectedModel]);

  // Execute intelligent analysis in chunked batches respecting PRO vs FREE tier quota
  const handleStartAnalysis = async () => {
    if (!selectedModel || candidateItems.length === 0) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setResults([]);
    setAppliedSuccess(false);

    const targetList = candidateItems.slice(0, maxAllowedItems);
    setProgress({ current: 0, total: targetList.length });

    const batchSize = effectiveIsPro ? 10 : 5;
    const accumulated: AnalysisResultItem[] = [];

    for (let i = 0; i < targetList.length; i += batchSize) {
      const chunk = targetList.slice(i, i + batchSize);
      try {
        const data = await nexusApi.post<any>('/api/ai/tagging/analyze', {
          items: chunk,
          model: selectedModel,
          isVisionModel: !!currentModelObj?.isVision
        }, { timeoutMs: 30000 });

        if (!data || data.success === false) {
          setAnalysisError(data?.error || 'Błąd podczas analizy AI.');
          break;
        }
        if (data.results) {
          accumulated.push(...data.results);
          setResults([...accumulated]);
          setSelectedResultIds(
            new Set(accumulated.filter(r => r.success && r.status !== 'NEEDS_VISION_MODEL').map(r => r.id))
          );
        }
      } catch (err: any) {
        setAnalysisError(err?.message || 'Błąd komunikacji z lokalnym serwerem AI.');
      }
      setProgress({ current: Math.min(i + batchSize, targetList.length), total: targetList.length });
    }

    setAnalyzing(false);
  };

  const toggleSelectResult = (id: string) => {
    setSelectedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyTags = async () => {
    const toApply = results
      .filter(r => selectedResultIds.has(r.id) && r.tags && r.tags.length > 0)
      .map(r => ({
        id: r.id,
        path: r.path,
        tags: r.tags || [],
        category: r.category
      }));

    if (toApply.length === 0) return;

    try {
      const data = await nexusApi.post<{ success: boolean }>('/api/ai/tagging/apply-tags', {
        updates: toApply
      });
      if (data?.success) {
        setAppliedSuccess(true);
        if (onApplyTags) {
          onApplyTags(toApply);
        }
      }
    } catch (e) {
      console.error('Błąd zatwierdzania tagów:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ollama-smart-tagging-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#121218] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161622]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="ollama-smart-tagging-title" className="text-base font-bold text-white flex items-center gap-2">
                Inteligentne tagowanie plików (Ollama AI)
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Lokalne & Prywatne
                </span>
                {effectiveIsPro ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> PRO UNLOCKED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                    FREE TRIAL (Limit 5 plików/serię)
                  </span>
                )}
              </h2>
              <p className="text-xs text-amber-300/90 font-medium">
                Użyj lokalnego modelu AI do szczegółowej analizy semantycznej i kontekstowej zawartości plików.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno tagowania AI"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">

          {/* Tier Limit / Upgrade Banner when not PRO */}
          {!effectiveIsPro && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-amber-200">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  W wersji darmowej możesz analizować do <strong>5 plików na serię</strong>. Aktywuj <strong>NEXUS PRO</strong>, aby odblokować masowe tagowanie do 50 plików jednocześnie oraz pełną analizę Vision AI.
                </span>
              </div>
              {onOpenProModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProModal();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shrink-0 transition"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Odblokuj PRO</span>
                </button>
              )}
            </div>
          )}

          {/* Status banner */}
          {loadingStatus ? (
            <div className="flex items-center justify-center py-8 text-white/60 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              <span>Sprawdzanie dostępności lokalnej usługi Ollama...</span>
            </div>
          ) : !ollamaStatus?.running ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-amber-300">Ollama nie jest uruchomiona na tym komputerze</h3>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    Funkcja inteligentnego tagowania AI wymaga lokalnego silnika Ollama (localhost:11434).
                    Aplikacja nigdy nie instaluje modeli ani oprogramowania bez Twojej wiedzy.
                  </p>
                  <p className="text-xs text-white/60">
                    Podstawowa klasyfikacja deterministyczna i wyszukiwarka działają w pełni bez AI.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={checkStatus}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold text-amber-200 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sprawdź ponownie połączenie</span>
                </button>
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-amber-400 hover:underline"
                >
                  Pobierz Ollama oficjalnie &rarr;
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Ready banner & model selector */}
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/25 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Ollama połączona ({ollamaStatus.modelCount} zainstalowanych modeli)</span>
                  </div>
                  <p className="text-xs text-[#a1a1aa]">
                    Wybierz model do przeprowadzenia analizy. Modele wizyjne mogą bezpośrednio analizować zrzuty ekranu i obrazy.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono text-white/60 uppercase">Aktywny Model:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={analyzing}
                    className="w-full bg-[#181824] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-purple-500 outline-none"
                  >
                    {ollamaStatus.models.map(m => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.sizeFormatted}) {m.isVision ? '👁️ [Wizyjny]' : '📝 [Tekst/Kod]'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notice about vision capability */}
              {currentModelObj && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/70">
                  {currentModelObj.isVision ? (
                    <>
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <span>Model <strong>{currentModelObj.name}</strong> obsługuje natywną analizę obrazu (pikseli).</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 text-amber-400" />
                      <span>Model <strong>{currentModelObj.name}</strong> to model tekstowy. Obrazy będą analizowane wyłącznie przez OCR lub prompt EXIF (nie zmyśla tagów grafiki).</span>
                    </>
                  )}
                </div>
              )}

              {/* Scope filter */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono text-white/60 uppercase">Zakres analizy:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'UNVERIFIED', label: 'Do sprawdzenia / Niepewne', desc: 'Pliki bez kategorii lub o niskiej pewności' },
                    { id: 'MEDIA', label: 'Obrazy i Grafika', desc: 'PNG, JPG, WEBP z dysku' },
                    { id: 'DEV', label: 'Projekty i Kod', desc: 'Pliki źródłowe i konfiguracje' },
                    { id: 'ALL', label: 'Wszystkie pliki', desc: 'Pełna baza aktywnego folderu' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setScope(opt.id as 'ALL' | 'UNVERIFIED' | 'MEDIA' | 'DEV')}
                      disabled={analyzing}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        scope === opt.id
                          ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-sm'
                          : 'bg-white/[0.03] border-white/10 text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <span className="font-semibold text-xs text-white">{opt.label}</span>
                      <span className="text-[10px] text-white/45 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="text-xs text-white/50 pt-1 font-mono">
                  Dopasowano: <strong className="text-purple-300">{candidateItems.length}</strong> plików (w bieżącej serii analizowane do {maxAllowedItems}).
                </div>
              </div>

              {analysisError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  ❌ {analysisError}
                </div>
              )}

              {/* Action trigger */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleStartAnalysis}
                  disabled={analyzing || candidateItems.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analizowanie plików ({progress.current}/{progress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Uruchom analizę AI ({Math.min(candidateItems.length, maxAllowedItems)} plików)</span>
                    </>
                  )}
                </button>

                {results.length > 0 && !analyzing && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/60">
                      Wybrano: <strong className="text-white">{selectedResultIds.size}</strong> z {results.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyTags}
                      disabled={selectedResultIds.size === 0 || appliedSuccess}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                        appliedSuccess
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                      }`}
                    >
                      {appliedSuccess ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Zastosowano pomyślnie!</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Zastosuj wybrane tagi ({selectedResultIds.size})</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Results table */}
              {results.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs font-mono text-white/60">
                    <span>WYNIKI ANALIZY ({results.length}):</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedResultIds.size === results.length) setSelectedResultIds(new Set());
                        else setSelectedResultIds(new Set(results.map(r => r.id)));
                      }}
                      className="text-purple-400 hover:underline"
                    >
                      {selectedResultIds.size === results.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {results.map(res => {
                      const isChecked = selectedResultIds.has(res.id);
                      return (
                        <div
                          key={res.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleSelectResult(res.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleSelectResult(res.id);
                            }
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isChecked
                              ? 'bg-purple-950/20 border-purple-500/40 text-white'
                              : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-1 rounded bg-[#20202e] border-white/30 text-purple-600 focus:ring-0"
                            />
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-white truncate max-w-xs">{res.name}</span>
                                {res.category && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    {res.category}
                                  </span>
                                )}
                                {res.inspectionSource && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white/60">
                                    {res.inspectionSource}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#a1a1aa] line-clamp-1">
                                {res.description || res.error || 'Brak opisu'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 items-center shrink-0">
                            {(res.tags || []).map((t, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#14141c] flex items-center justify-between text-xs text-white/50 font-mono">
          <span>Ollama AI Smart Tagging Engine • 100% Offline & Bezpieczne</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition font-sans font-medium"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
};
