import React from 'react';
import { 
  Image as ImageIcon, 
  Trash2, 
  Code, 
  FileBox, 
  ArrowRight, 
  Sparkles, 
  Zap,
  FolderOpen
} from 'lucide-react';
import { FileItem, SmartWorkspace, AutonomousBlueprint, ExplorerSubView, formatBytesCompact } from '../types';

interface ExecutiveMissionControlProps {
  items: FileItem[];
  workspaces?: SmartWorkspace[];
  blueprint?: AutonomousBlueprint | null;
  targetPath?: string;
  isProLicensed?: boolean;
  onOpenProModal?: () => void;
  onNavigateToView: (view: ExplorerSubView | 'EXPLORER') => void;
  onOpenPlannerModal?: () => void;
  onOpenGuidedSearch?: () => void;
  onQuickAction?: (actionId: string) => void;
}

export const ExecutiveMissionControl: React.FC<ExecutiveMissionControlProps> = ({
  items,
  workspaces = [],
  blueprint = null,
  targetPath,
  isProLicensed,
  onOpenProModal,
  onNavigateToView,
  onOpenPlannerModal,
  onOpenGuidedSearch,
  onQuickAction
}) => {
  const screenshots = items.filter(i => i.category === 'SCREENSHOT');
  const mediaPngs = items.filter(i => i.category === 'MEDIA' && !i.isDisposable);
  const devFiles = items.filter(i => i.category === 'DEV');
  const appFiles = items.filter(i => i.category === 'APPS');

  const screenshotBytes = screenshots.reduce((acc, i) => acc + (i.size || 0), 0);
  const totalBytes = items.reduce((acc, i) => acc + (i.size || 0), 0);

  return (
    <div className="w-full space-y-6 animate-morphIn font-sans text-left">
      
      {/* 1. Mission Control Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>NEXUS • PODSUMOWANIE INDEKSU ({items.length.toLocaleString('pl-PL')} PLIKÓW • {formatBytesCompact(totalBytes)})</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Twój indeks plików w jednym miejscu.
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Przeglądaj wykryte pliki, przejdź do wybranej kategorii albo sprawdź dostępne plany organizacji.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => onNavigateToView('EXPLORER')}
              className="py-3.5 px-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-bold text-xs font-mono transition flex items-center gap-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-purple-400" />
              <span>PEŁNY EKSPLORATOR</span>
            </button>

            <button
              type="button"
              onClick={onOpenPlannerModal}
              disabled={!blueprint}
              className="py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-purple-500 text-slate-950 font-extrabold text-xs font-mono shadow-xl shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              title={blueprint ? 'Zobacz plany organizacji dla tego indeksu' : 'Plany będą dostępne po zakończeniu skanowania'}
            >
              <Zap className="w-4 h-4 text-slate-950 fill-current" />
              <span>SPRAWDŹ PLANY ORGANIZACJI</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Four Master Functional Hubs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Hub 1: Indexed media */}
        <button
          type="button"
          onClick={() => onNavigateToView('GALLERY')}
          className="group p-6 rounded-3xl glass-card border border-white/10 hover:border-purple-500/50 hover:bg-slate-900/90 transition flex flex-col justify-between cursor-pointer relative overflow-hidden text-left"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition">
                <ImageIcon className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-purple-400 font-bold px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
                {mediaPngs.length.toLocaleString('pl-PL')} grafik
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white group-hover:text-purple-300 transition">
                Galeria grafik i assetów
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Przeglądaj znalezione grafiki i użyj filtrów galerii, aby zawęzić wyniki.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap pt-1 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">.PNG (Główne)</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">.WEBP</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">.SVG</span>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-xs font-mono text-purple-400 group-hover:translate-x-1 transition">
            <span>Otwórz dedykowaną galerię wizualną</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Hub 2: Screenshot Triage */}
        <button
          type="button"
          onClick={() => onNavigateToView('TRIAGE')}
          className="group p-6 rounded-3xl glass-card border border-rose-500/30 bg-rose-950/20 hover:border-rose-500/60 hover:bg-rose-950/30 transition flex flex-col justify-between cursor-pointer relative overflow-hidden text-left"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 group-hover:scale-110 transition">
                <Trash2 className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-rose-300 font-bold px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40">
                {screenshots.length.toLocaleString('pl-PL')} zrzutów • {formatBytesCompact(screenshotBytes)}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white group-hover:text-rose-300 transition">
                Stacja Triażu Zrzutów Ekranu
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Przejrzyj zrzuty ekranu według wieku, a następnie zarchiwizuj je lub przenieś do Kosza.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap pt-1 text-[11px] font-mono text-rose-300/80">
              <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-500/30">Win+Shift+S</span>
              <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-500/30">Łączny rozmiar: {formatBytesCompact(screenshotBytes)}</span>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-rose-500/20 flex items-center justify-between text-xs font-mono text-rose-400 group-hover:translate-x-1 transition">
            <span>Uruchom triaż i wyczyść zrzuty</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Hub 3: Smart Dev Workspaces Kanban */}
        <button
          type="button"
          onClick={() => onNavigateToView('KANBAN')}
          className="group p-6 rounded-3xl glass-card border border-white/10 hover:border-cyan-500/50 hover:bg-slate-900/90 transition flex flex-col justify-between cursor-pointer relative overflow-hidden text-left"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition">
                <Code className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                {workspaces.length} projektów • {devFiles.length} plików kodu
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white group-hover:text-cyan-300 transition">
                Wirtualne Workspace & Powiązania
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Tablica Kanban łącząca luźne pliki .tsx, .css i pobrane assety w czyste projekty. 
                Otwórz wykryte workspace’y i przeglądaj ich powiązane pliki.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap pt-1 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">.TSX / .JSX</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">Workspace’y</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">Powiązane pliki</span>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-xs font-mono text-cyan-400 group-hover:translate-x-1 transition">
            <span>Przejdź do tablicy projektów Kanban</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Hub 4: Apps & Installers Shelf */}
        <button
          type="button"
          onClick={() => onNavigateToView('APPS')}
          className="group p-6 rounded-3xl glass-card border border-white/10 hover:border-blue-500/50 hover:bg-slate-900/90 transition flex flex-col justify-between cursor-pointer relative overflow-hidden text-left"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 transition">
                <FileBox className="w-6 h-6" />
              </div>
              <span className="text-xs font-mono text-blue-400 font-bold px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30">
                {appFiles.length} plików aplikacji
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white group-hover:text-blue-300 transition">
                Półka Aplikacji & De-bloat .EXE
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Wykrywa zduplikowane wersje instalatorów (np. DiscordSetup (1).exe, ChromeSetup (2).exe) 
                i udostępnia narzędzia do ich przeglądania oraz porządkowania.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap pt-1 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">Natywne PE Header</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">Deduplikacja</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-white/5">Obsługa Kosza</span>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-xs font-mono text-blue-400 group-hover:translate-x-1 transition">
            <span>Zarządzaj instalatorami i usuń duplikaty</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

      </div>

    </div>
  );
};
