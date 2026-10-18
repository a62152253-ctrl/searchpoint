import React, { useState, useMemo } from 'react';
import { 
  FileBox, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle,
  Search,
  FolderOpen,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  HardDrive,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles
} from 'lucide-react';
import { FileItem, formatBytesCompact, formatDateCompact } from '../types';

interface AppShelfViewProps {
  items: FileItem[];
  targetPath?: string;
  onSelectItem: (item: FileItem) => void;
  onOpenInExplorer: (path: string) => void;
  onOpenDefault?: (path: string) => void;
  onDeduplicateInstallers?: (redundantIds: string[]) => void;
}

export const AppShelfView: React.FC<AppShelfViewProps> = ({
  items,
  targetPath,
  onSelectItem,
  onOpenInExplorer,
  onOpenDefault,
  onDeduplicateInstallers
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'DUPLICATES' | 'INSTALLERS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);
  const [confirmFamily, setConfirmFamily] = useState<{ family: string; redundantIds: string[]; savedMB: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const rawApps = useMemo(() => {
    return items.filter(i => 
      i.category === 'APPS' || 
      ['exe', 'msi', 'bat', 'cmd', 'ps1', 'lnk', 'appx', 'msix'].includes((i.extension || '').toLowerCase())
    );
  }, [items]);

  const duplicateFamilies = useMemo(() => {
    const map = new Map<string, FileItem[]>();
    for (const item of rawApps) {
      // Normalize installer name to find version families (e.g., DiscordSetup (1).exe, DiscordSetup_v1.2.exe)
      const familyName = item.name.replace(/(?:\s*\(\d+\)$|\s*[-_]v?\d+(?:\.\d+)*.*$)/i, '').trim().toLowerCase();
      if (!map.has(familyName)) {
        map.set(familyName, []);
      }
      map.get(familyName)!.push(item);
    }

    const dupes: { family: string; keeper: FileItem; redundancies: FileItem[]; savedMB: number }[] = [];
    for (const [family, files] of map.entries()) {
      if (files.length > 1) {
        files.sort((a, b) => b.mtime - a.mtime);
        const keeper = files[0];
        const redundancies = files.slice(1);
        const savedMB = redundancies.reduce((acc, f) => acc + (f.size || 0), 0) / (1024 * 1024);
        dupes.push({ family, keeper, redundancies, savedMB });
      }
    }
    return dupes;
  }, [rawApps]);

  const appItems = useMemo(() => {
    let list = rawApps;
    if (filterType === 'INSTALLERS') {
      list = rawApps.filter(i => ['exe', 'msi', 'appx', 'msix'].includes((i.extension || '').toLowerCase()));
    } else if (filterType === 'DUPLICATES') {
      const dupeIds = new Set(duplicateFamilies.flatMap(d => [d.keeper.id, ...d.redundancies.map(r => r.id)]));
      list = rawApps.filter(i => dupeIds.has(i.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i => 
        i.name.toLowerCase().includes(q) || 
        i.path.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rawApps, filterType, duplicateFamilies, searchQuery]);

  const totalRedundantCount = duplicateFamilies.reduce((acc, d) => acc + d.redundancies.length, 0);
  const totalSavedMB = duplicateFamilies.reduce((acc, d) => acc + d.savedMB, 0).toFixed(0);

  const handleCleanAllDuplicates = () => {
    const allRedundantIds = duplicateFamilies.flatMap(d => d.redundancies.map(r => r.id));
    if (onDeduplicateInstallers && allRedundantIds.length > 0) {
      onDeduplicateInstallers(allRedundantIds);
      setCleanFeedback(`Usunięto pomyślnie ${totalRedundantCount} zduplikowanych instalatorów (${totalSavedMB} MB odzyskane).`);
    } else {
      setCleanFeedback(`Zidentyfikowano ${totalRedundantCount} starych instalatorów do usunięcia (${totalSavedMB} MB).`);
    }
    setTimeout(() => setCleanFeedback(null), 5000);
  };

  const handleCleanSingleFamily = (familyInfo: { family: string; redundantIds: string[]; savedMB: number }) => {
    if (onDeduplicateInstallers && familyInfo.redundantIds.length > 0) {
      onDeduplicateInstallers(familyInfo.redundantIds);
      setCleanFeedback(`Oczyszczono ${familyInfo.redundantIds.length} starszych wersji dla "${familyInfo.family}" (${familyInfo.savedMB.toFixed(1)} MB).`);
      setConfirmFamily(null);
      setTimeout(() => setCleanFeedback(null), 4000);
    }
  };

  const copyPath = (path: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full space-y-6 font-sans text-left animate-morphIn">
      
      {/* 1. Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#121c2d]/95 via-[#141d30]/95 to-[#16161f]/95 backdrop-blur-xl border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-mono">
            <FileBox className="w-3.5 h-3.5 text-blue-400" />
            <span>PÓŁKA APLIKACJI & DE-BLOAT INSTALATORÓW</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Zaindeksowano {rawApps.length.toLocaleString('pl-PL')} plików aplikacji & instalatorów
          </h1>
          <p className="text-xs text-blue-200/80 max-w-2xl leading-relaxed font-sans">
            Nexus automatycznie grupuje wersje tego samego instalatora (np. DiscordSetup (1).exe, ChromeSetup (2).exe) 
            i pozwala zachować najnowszą, bezpiecznie usuwając zbędne kopie.
          </p>
          {cleanFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-mono flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{cleanFeedback}</span>
            </div>
          )}
        </div>

        {totalRedundantCount > 0 && (
          <div className="relative z-10 shrink-0">
            <button
              type="button"
              onClick={handleCleanAllDuplicates}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-extrabold text-xs font-mono shadow-xl shadow-blue-950/40 transition cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>USUŃ WSZYSTKIE {totalRedundantCount} DUPLIKATY ({totalSavedMB} MB)</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Control Toolbar */}
      <div className="p-4 rounded-2xl bg-[#14141c]/90 border border-white/10 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
              filterType === 'ALL'
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-black/30 border-white/10 text-[#a1a1aa] hover:text-white hover:bg-white/5'
            }`}
          >
            Wszystkie aplikacje ({rawApps.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('INSTALLERS')}
            className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
              filterType === 'INSTALLERS'
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-black/30 border-white/10 text-[#a1a1aa] hover:text-white hover:bg-white/5'
            }`}
          >
            Instalatory (.exe / .msi)
          </button>
          <button
            type="button"
            onClick={() => setFilterType('DUPLICATES')}
            className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
              filterType === 'DUPLICATES'
                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                : 'bg-black/30 border-white/10 text-[#a1a1aa] hover:text-white hover:bg-white/5'
            }`}
          >
            Zduplikowane wersje ({duplicateFamilies.length})
          </button>
        </div>

        {/* Quick Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj instalatorów (np. Discord, Setup)..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/50 border border-white/10 focus:border-blue-500 text-xs font-mono text-white placeholder-[#71717a] focus:outline-none transition"
          />
        </div>
      </div>

      {/* 3. Duplicate Installer Stacks (Highlight Card) */}
      {duplicateFamilies.length > 0 && filterType !== 'INSTALLERS' && (
        <div className="p-5 rounded-3xl bg-[#14141c]/95 border border-amber-500/30 space-y-4 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white text-sm">Wykryte Grupy Zduplikowanych Instalatorów</h3>
            </div>
            <span className="text-xs font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
              {duplicateFamilies.length} programów z wieloma wersjami
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {duplicateFamilies.map((group, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-black/40 border border-white/[0.07] flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white text-sm capitalize">{group.family}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {group.redundancies.length + 1} wersji ({group.savedMB.toFixed(1)} MB)
                    </span>
                  </div>

                  {/* Keeper Item */}
                  <div className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate font-semibold">Najnowsza (zostaw): {group.keeper.name}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-emerald-400/80">{formatBytesCompact(group.keeper.size)}</span>
                  </div>

                  {/* Redundancy list */}
                  <div className="mt-2 text-[10px] font-mono text-[#a1a1aa] space-y-1">
                    <span className="text-[#71717a] font-semibold">Starsze kopie do usunięcia:</span>
                    {group.redundancies.map((r, rIdx) => (
                      <div key={rIdx} className="flex items-center justify-between pl-2 border-l border-rose-500/30 text-rose-300/80">
                        <span className="truncate pr-2">{r.name}</span>
                        <span className="shrink-0 text-[#71717a]">{formatBytesCompact(r.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleCleanSingleFamily({
                      family: group.family,
                      redundantIds: group.redundancies.map(r => r.id),
                      savedMB: group.savedMB
                    })}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Usuń {group.redundancies.length} kopie ({group.savedMB.toFixed(0)} MB)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. All Apps Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {appItems.slice(0, 180).map((item) => {
          const isSigned = item.deepMeta?.isSigned;
          const arch = item.deepMeta?.executableArch;

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
              className="group relative p-3 rounded-2xl bg-[#14141c]/90 border border-white/[0.07] hover:border-blue-500/40 hover:bg-[#181d2e] transition flex flex-col justify-between cursor-pointer text-left backdrop-blur-sm"
            >
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
                <button
                  type="button"
                  onClick={(e) => copyPath(item.path, item.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/70 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Kopiuj ścieżkę"
                >
                  {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenInExplorer(item.path); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/70 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Pokaż w Eksploratorze Windows"
                >
                  <FolderOpen className="w-3 h-3" />
                </button>
              </div>

              <div>
                <div className="w-full h-24 rounded-xl bg-[#0a0a0f] border border-white/5 flex flex-col items-center justify-center mb-2 gap-1.5 group-hover:border-blue-500/30 transition">
                  <FileBox className="w-8 h-8 text-blue-400/80 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono uppercase text-blue-300 font-bold">.{item.extension}</span>
                    {arch && (
                      <span className="text-[8px] font-mono px-1 rounded bg-blue-500/20 text-blue-300">
                        {arch}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition" title={item.name}>
                  {item.name}
                </div>
                <div className="text-[10px] font-mono text-[#71717a] truncate mt-0.5">
                  {item.subCategory}
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-[#71717a]">
                <span className="text-blue-400 font-bold">{formatBytesCompact(item.size)}</span>
                <span>{formatDateCompact(item.mtime)}</span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
