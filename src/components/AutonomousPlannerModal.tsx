import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  ArrowRight, 
  RotateCcw, 
  ShieldCheck,
  FolderSync,
  AlertCircle,
  Loader2,
  FileCheck2
} from 'lucide-react';
import { AutonomousBlueprint } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface AutonomousPlannerModalProps {
  blueprint: AutonomousBlueprint | null;
  isOpen: boolean;
  onClose: () => void;
  onExecutePlan: (planId: string, isDryRun: boolean) => Promise<any>;
}

export const AutonomousPlannerModal: React.FC<AutonomousPlannerModalProps> = ({
  blueprint,
  isOpen,
  onClose,
  onExecutePlan
}) => {
  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);
  const [completedPlans, setCompletedPlans] = useState<Set<string>>(new Set());
  const [journalId, setJournalId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !blueprint) return null;

  const handleRun = async (planId: string, isDryRun: boolean = false) => {
    setExecutingPlanId(planId);
    setMessage(null);
    try {
      const res = await onExecutePlan(planId, isDryRun);
      if (!isDryRun && res?.journalId) {
        setJournalId(res.journalId);
      }
      const errorCount = res.errors?.length || 0;
      if (!isDryRun && errorCount === 0) {
        setCompletedPlans(prev => new Set([...prev, planId]));
      }
      
      const msgText = isDryRun
        ? `Symulacja (Dry-Run): ${res.movedCount ?? 0} plików kwalifikuje się do bezpiecznego przeniesienia${errorCount ? `, ${errorCount} problemów` : ''}.`
        : `${(res.movedCount ?? 0) > 0 ? `Przeniesiono pomyślnie ${res.movedCount} plików` : 'Nie przeniesiono plików'}${errorCount ? `, ${errorCount} błędów` : ''}.`;
      
      setMessage({
        type: errorCount > 0 ? 'error' : 'success',
        text: msgText
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `Błąd wykonania planu: ${err.message || 'Nieznany błąd serwera.'}`
      });
    } finally {
      setExecutingPlanId(null);
    }
  };

  const handleExecuteAll = async () => {
    for (const plan of blueprint.plans) {
      if (plan.executionMode === 'MOVE' && !completedPlans.has(plan.id)) {
        await handleRun(plan.id, false);
      }
    }
  };

  const handleRollback = async () => {
    if (!journalId) return;
    setIsRollingBack(true);
    try {
      const res = await nexusApi.post<{
        restoredCount: number;
        rollbackErrorsCount?: number;
      }>('/api/planner/rollback', { journalId }, { timeoutMs: 15000 });

      const rollbackErrors = res.rollbackErrorsCount || 0;
      setMessage({
        type: rollbackErrors > 0 ? 'error' : 'success',
        text: `Cofnięto pomyślnie: przywrócono ${res.restoredCount} plików${rollbackErrors ? `; ${rollbackErrors} problemów z pozostałymi plikami` : ''}.`
      });

      if (rollbackErrors === 0) {
        setCompletedPlans(new Set());
        setJournalId(null);
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `Błąd cofania transakcji: ${err.message || 'Nieznany błąd.'}`
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-sans animate-morphIn"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="autonomous-planner-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] bg-[#16161f] rounded-2xl border border-white/15 flex flex-col overflow-hidden shadow-2xl text-left"
      >
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#1b1b26]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300">
              <FolderSync className="w-5 h-5" />
            </span>
            <div>
              <h2 id="autonomous-planner-title" className="text-base font-bold text-white">
                Plan porządkowania plików
              </h2>
              <p className="text-xs text-[#9ca3af]">
                Proponowane grupowanie i porządkowanie plików z możliwością natychmiastowego cofnięcia zmian.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno planera"
            className="p-1.5 rounded-xl text-[#9ca3af] hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Bar */}
        <div className="px-5 py-3 bg-[#111117] border-b border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#9ca3af]">
          <div>
            Plików w indeksie: <strong className="text-white">{blueprint.summary.totalFiles.toLocaleString('pl-PL')}</strong>
          </div>
          <div>
            Objętość danych: <strong className="text-purple-300">{blueprint.summary.totalGB} GB</strong>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>Pełny Undo / Rollback (.nexus_journals)</span>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-2 ${
            message.type === 'error'
              ? 'bg-rose-950/35 border-rose-500/35 text-rose-200'
              : 'bg-purple-950/35 border-purple-500/35 text-purple-100'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> : <FileCheck2 className="w-4 h-4 text-purple-400 shrink-0" />}
              <span>{message.text}</span>
            </div>
            {journalId && (
              <button
                type="button"
                onClick={handleRollback}
                disabled={isRollingBack}
                className="px-3 py-1 rounded-lg bg-rose-950/60 text-rose-200 border border-rose-500/40 hover:bg-rose-900/70 text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                {isRollingBack ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                <span>{isRollingBack ? 'Cofanie...' : 'Cofnij zmiany (Undo)'}</span>
              </button>
            )}
          </div>
        )}

        {/* Plans List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {blueprint.plans.map((plan) => {
            const isDone = completedPlans.has(plan.id);
            const isRunning = executingPlanId === plan.id;

            return (
              <div 
                key={plan.id}
                className={`p-4 rounded-2xl border transition ${
                  isDone 
                    ? 'border-emerald-500/40 bg-emerald-950/20' 
                    : 'border-white/10 bg-[#1b1b24]/90 hover:border-purple-500/35'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-white">{plan.title}</span>
                      {plan.isHighPriority && !isDone && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/20 text-purple-200 border border-purple-500/35">
                          Zalecane
                        </span>
                      )}
                      {isDone && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Wykonano</span>
                        </span>
                      )}
                      {plan.executionMode !== 'MOVE' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Tryb doradczy
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#9ca3af] leading-relaxed">{plan.description}</p>
                    
                    <div className="text-[11px] font-mono text-[#8e8e98] pt-1 flex items-center gap-3 flex-wrap">
                      <span>Plików: <b className="text-white">{plan.fileCount}</b></span>
                      {parseFloat(plan.reclaimableGB) > 0 && (
                        <span>Objętość: <b className="text-purple-300">{plan.reclaimableGB} GB</b></span>
                      )}
                      {plan.targetFolder && (
                        <span className="truncate max-w-xs text-[#71717a]">Cel: {plan.targetFolder}</span>
                      )}
                    </div>

                    {plan.sampleFiles && plan.sampleFiles.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {plan.sampleFiles.slice(0, 3).map((sf, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-black/40 border border-white/8 text-[10px] font-mono text-[#a1a1aa] truncate max-w-[180px]">
                            {sf}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRun(plan.id, false)}
                      disabled={isRunning || isDone || plan.executionMode !== 'MOVE'}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        isDone || plan.executionMode !== 'MOVE'
                          ? 'bg-white/5 text-[#666] cursor-not-allowed border border-white/5'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                      }`}
                    >
                      {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isRunning ? 'W toku...' : 'Wykonaj'}</span>
                    </button>

                    {!isDone && plan.executionMode === 'MOVE' && (
                      <button
                        type="button"
                        onClick={() => handleRun(plan.id, true)}
                        disabled={isRunning}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#9ca3af] hover:text-white hover:bg-white/5 transition cursor-pointer"
                      >
                        Symulacja (Dry-Run)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Footer */}
        <div className="p-4 border-t border-white/10 bg-[#111117] flex items-center justify-between">
          <span className="text-xs text-[#71717a] font-mono">
            Wszystkie operacje są odwracalne jednym kliknięciem
          </span>

          <button
            type="button"
            onClick={handleExecuteAll}
            className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg"
          >
            <span>Wykonaj bezpieczne plany</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
