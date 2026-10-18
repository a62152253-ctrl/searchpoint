import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Zap,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Activity
} from 'lucide-react';
import { ScanProgress, FileItem, formatBytesCompact } from '../types';

interface AnalyzingViewProps {
  targetPath: string;
  progress: ScanProgress | null;
  recentItems: FileItem[];
  onCompleteTransition: () => void;
  onStop: () => void;
}

export const AnalyzingView: React.FC<AnalyzingViewProps> = ({
  targetPath,
  progress,
  recentItems,
  onCompleteTransition,
  onStop
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const count = progress?.filesCount ?? recentItems.length;
  const speed = progress?.speedFilesPerSec ?? 0;
  const cats = progress?.categories || {
    DEV: 0,
    MEDIA: 0,
    SCREENSHOT: 0,
    APPS: 0,
    DOCS: 0,
    ARCHIVES: 0,
    OTHER: 0
  };

  const totalBytes = progress?.totalBytes ?? 0;
  const sizeGB = (totalBytes / 1_000_000_000).toFixed(2);
  const progressWidth = progress ? '65%' : '30%';

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#101016] text-[#e6e5e3] font-sans relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-[18rem] bg-purple-600/15 blur-3xl rounded-full" />

      <div className="relative z-10 w-full max-w-2xl space-y-6 text-left rounded-3xl bg-[#16161f]/90 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        
        {/* Header with Live Status Pill */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
                Wielowątkowy skaner aktywny
              </span>
            </div>

            <div className="px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 font-mono text-xs flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>Indeksowanie na żywo</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <span>⚡</span>
            <span>Indeksowanie Twoich Plików...</span>
          </h1>
          <p className="text-xs font-mono text-[#9ca3af] truncate bg-[#101016] p-2.5 rounded-xl border border-white/8">
            Katalog roboczy: <span className="text-purple-200 font-semibold">{targetPath}</span>
          </p>
        </div>

        {/* Live Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-2.5 rounded-full bg-[#0d0d12] border border-white/10 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out rounded-full animate-pulse"
              style={{ width: progressWidth }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-[#8e8e98]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Silnik wielowątkowy Nexus & Smart Shield</span>
            </span>
            <span className="text-purple-300 font-bold">
              {count > 0 ? `${count.toLocaleString('pl-PL')} plików przeskanowano` : 'Przeszukiwanie struktury folderów...'}
            </span>
          </div>
        </div>

        {/* Live Telemetry Callout */}
        <div className="p-4 rounded-2xl flex items-center justify-between border border-purple-500/30 bg-gradient-to-r from-purple-950/35 to-[#14141d]">
          <div>
            <div className="text-[11px] text-[#9ca3af] uppercase font-mono">Zindeksowano obiektów na żywo</div>
            <div className="text-3xl font-extrabold text-white mt-0.5 font-mono flex items-center gap-2">
              <span>{count.toLocaleString('pl-PL')}</span>
              {count > 0 && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            </div>
          </div>
          <div className="text-right font-mono text-xs text-[#9ca3af] space-y-1">
            <div className="flex items-center justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Czas trwania: <strong className="text-white">{formatElapsed(elapsedSeconds)}</strong></span>
            </div>
            <div>Przepustowość: <span className="text-emerald-300 font-bold">{speed > 0 ? speed.toLocaleString('pl-PL') : '—'}</span> plików/s</div>
            <div>Objętość: <span className="text-purple-200 font-bold">{sizeGB} GB</span></div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="rounded-2xl border border-white/10 bg-[#12121a] overflow-hidden text-xs">
          <div className="px-4 py-2.5 border-b border-white/8 font-mono text-[#9ca3af] uppercase text-[11px] font-semibold flex items-center justify-between">
            <span>Wykryte Kolekcje Zasobów</span>
            <span className="text-purple-400 text-[10px]">Klasyfikacja w locie</span>
          </div>
          <div className="divide-y divide-white/5">
            {[
              { emoji: '📸', label: 'Grafiki & Media (.png, .webp, .jpg)', val: cats.MEDIA || 0, color: 'text-purple-300' },
              { emoji: '⚡', label: 'Ulotne zrzuty ekranu (do triażu)', val: cats.SCREENSHOT || 0, color: 'text-rose-300' },
              { emoji: '💻', label: 'Kod i repozytoria (.tsx, .ts, .js, .json)', val: cats.DEV || 0, color: 'text-blue-300' },
              { emoji: '📄', label: 'Dokumenty i notatki (.pdf, .docx, .md)', val: cats.DOCS || 0, color: 'text-emerald-300' },
              { emoji: '📦', label: 'Aplikacje i archiwa (.exe, .msi, .zip)', val: (cats.APPS || 0) + (cats.ARCHIVES || 0), color: 'text-amber-300' }
            ].map((row, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#d4d4d8]">
                  <span>{row.emoji}</span>
                  <span>{row.label}</span>
                </span>
                <span className={`font-mono font-bold ${row.color}`}>{row.val.toLocaleString('pl-PL')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live File Streamer */}
        {recentItems.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-[#111117] border border-white/8 text-[11px] font-mono text-[#9ca3af] space-y-1.5">
            <div className="text-[10px] uppercase font-bold text-[#71717a] mb-1">Ostatnio dodane do bazy:</div>
            {recentItems.slice(-3).reverse().map((item, idx) => (
              <div key={idx} className="flex justify-between truncate text-[#d4d4d8]">
                <span className="truncate"><b className="text-purple-300">[{item.category}]</b> {item.name}</span>
                <span className="text-[#8e8e98] ml-2 shrink-0">{formatBytesCompact(item.size)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onCompleteTransition}
            className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-purple-950/50"
          >
            <span>Otwórz bazę natychmiast</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onStop}
            className="py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#a1a1aa] hover:text-white text-xs font-mono transition cursor-pointer"
          >
            Zatrzymaj i wróć
          </button>
        </div>

      </div>
    </div>
  );
};
