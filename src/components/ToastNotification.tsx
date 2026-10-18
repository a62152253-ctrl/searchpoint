import React, { useEffect } from 'react';
import { Check, Info, AlertTriangle, AlertCircle, X, ExternalLink } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description?: string;
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <aside 
      aria-label="Powiadomienia systemowe" 
      className="fixed bottom-5 left-5 z-[999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        const borderAccent = isSuccess
          ? 'border-emerald-500/40 bg-gradient-to-r from-[#13221d]/95 via-[#16161e]/95 to-[#16161e]/95 text-emerald-300'
          : isWarning
          ? 'border-amber-500/40 bg-gradient-to-r from-[#241c12]/95 via-[#16161e]/95 to-[#16161e]/95 text-amber-300'
          : isError
          ? 'border-rose-500/40 bg-gradient-to-r from-[#2a1318]/95 via-[#16161e]/95 to-[#16161e]/95 text-rose-300'
          : 'border-purple-500/40 bg-gradient-to-r from-[#1c1626]/95 via-[#16161e]/95 to-[#16161e]/95 text-purple-300';

        return (
          <ToastItem
            key={toast.id}
            toast={toast}
            borderAccent={borderAccent}
            onDismiss={onDismiss}
          />
        );
      })}
    </aside>
  );
};

interface ToastItemProps {
  toast: ToastMessage;
  borderAccent: string;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, borderAccent, onDismiss }) => {
  useEffect(() => {
    const duration = toast.durationMs ?? (toast.type === 'error' ? 8000 : 4500);
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, toast.type, onDismiss]);

  const isRoleAlert = toast.type === 'error' || toast.type === 'warning';

  return (
    <div
      role={isRoleAlert ? 'alert' : 'status'}
      aria-live={isRoleAlert ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 p-3.5 rounded-2xl backdrop-blur-xl border ${borderAccent} shadow-2xl text-left animate-slideUp text-xs font-mono transition-all duration-200 hover:shadow-purple-950/20`}
    >
      <div className="shrink-0 mt-0.5">
        {toast.type === 'success' && (
          <div className="w-6 h-6 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/40 shadow-inner">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
        {toast.type === 'info' && (
          <div className="w-6 h-6 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/40 shadow-inner">
            <Info className="w-3.5 h-3.5" />
          </div>
        )}
        {toast.type === 'warning' && (
          <div className="w-6 h-6 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/40 shadow-inner">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        )}
        {toast.type === 'error' && (
          <div className="w-6 h-6 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center border border-rose-500/40 shadow-inner">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pr-1">
        <div className="font-bold text-white text-xs tracking-tight">{toast.title}</div>
        {toast.description && (
          <div className="text-[11px] text-[#b4b4be] mt-0.5 break-words leading-relaxed font-sans">
            {toast.description}
          </div>
        )}

        {toast.action && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition cursor-pointer"
          >
            {toast.action.label}
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-[#71717a] hover:text-white transition cursor-pointer p-1 rounded-lg hover:bg-white/10"
        aria-label="Zamknij powiadomienie"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
