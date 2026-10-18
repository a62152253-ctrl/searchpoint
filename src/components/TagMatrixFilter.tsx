import React, { useMemo, useState } from 'react';
import { 
  Tag as TagIcon, 
  Hash, 
  Sparkles, 
  Filter, 
  Check, 
  X, 
  SlidersHorizontal,
  Flame,
  Clock,
  HardDrive,
  Search
} from 'lucide-react';
import { FileItem } from '../types';
import { 
  detectGame, 
  detectDevLanguage, 
  detectArchetype 
} from '../utils/fileKnowledgeBase';

export interface TagDefinition {
  id: string;
  label: string;
  category: 'CONTENT' | 'TYPE' | 'LIFECYCLE' | 'SIZE' | 'TIME';
  color: string;
  count: number;
}

interface TagMatrixFilterProps {
  items: FileItem[];
  selectedTags: Set<string> | string[];
  onToggleTag: (tagId: string) => void;
  onClearTags: () => void;
  sizeFilter?: string;
  onSetSizeFilter?: (size: string) => void;
  timeFilter?: string;
  onSetTimeFilter?: (time: string) => void;
  onSelectCategory?: (category: string) => void;
}

export const TagMatrixFilter: React.FC<TagMatrixFilterProps> = ({
  items,
  selectedTags,
  onToggleTag,
  onClearTags,
  sizeFilter = 'ALL',
  onSetSizeFilter,
  timeFilter = 'ALL',
  onSetTimeFilter,
  onSelectCategory
}) => {
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTagCategory, setSelectedTagCategory] = useState<'ALL' | 'CONTENT' | 'TYPE' | 'LIFECYCLE' | 'TIME' | 'SIZE'>('ALL');

  const activeTagsSet = useMemo(() => {
    if (selectedTags instanceof Set) return selectedTags;
    return new Set(selectedTags);
  }, [selectedTags]);

  // Compute dynamic smart tags based on file attributes and universal knowledge base
  const dynamicTags = useMemo<TagDefinition[]>(() => {
    let figmaCount = 0;
    let screenshotCount = 0;
    let devComponentCount = 0;
    let installerDupeCount = 0;
    let largeFileCount = 0;
    let recentWeekCount = 0;
    let discordTempCount = 0;
    let iconSvgCount = 0;

    const gameMap = new Map<string, { label: string; count: number; color: string }>();
    const langMap = new Map<string, { label: string; count: number; color: string }>();

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const item of items) {
      const nameLower = item.name.toLowerCase();
      
      // Dynamic Game detection
      const g = detectGame(item);
      if (g) {
        const cur = gameMap.get(g.id) || { 
          label: g.tags[0], 
          count: 0, 
          color: `${g.badgeBg} ${g.badgeText} ${g.badgeBorder}` 
        };
        cur.count++;
        gameMap.set(g.id, cur);
      }

      // Dynamic Dev Language detection
      const dev = detectDevLanguage(item);
      if (dev) {
        const cur = langMap.get(dev.id) || { 
          label: dev.shortTag, 
          count: 0, 
          color: `${dev.badgeBg} ${dev.badgeText} ${dev.badgeBorder}` 
        };
        cur.count++;
        langMap.set(dev.id, cur);
      }

      if (item.category === 'SCREENSHOT' || item.isDisposable) screenshotCount++;
      if (/figma|frame\s*\d|export|asset/i.test(nameLower)) figmaCount++;
      if (item.category === 'DEV' && (item.extension === 'tsx' || item.extension === 'jsx' || item.extension === 'vue')) devComponentCount++;
      if (item.category === 'APPS' && /\(\d+\)/.test(nameLower)) installerDupeCount++;
      if (item.size > 15 * 1024 * 1024) largeFileCount++;
      if (item.mtime > oneWeekAgo) recentWeekCount++;
      if (/discord|image\s*\(\d+\)|capture/i.test(nameLower)) discordTempCount++;
      if (item.extension === 'svg' || (item.category === 'MEDIA' && item.size < 50 * 1024)) iconSvgCount++;
    }

    const tags: TagDefinition[] = [
      { id: 'tag-screenshot', label: '#UlotnyZrzut', category: 'LIFECYCLE', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', count: screenshotCount },
      { id: 'tag-figma', label: '#FigmaExport', category: 'CONTENT', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40', count: figmaCount },
      { id: 'tag-ui-comp', label: '#KomponentUI', category: 'TYPE', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', count: devComponentCount },
      { id: 'tag-dupe-app', label: '#DuplikatSetup', category: 'LIFECYCLE', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', count: installerDupeCount },
      { id: 'tag-large', label: '#DużyPlik>15MB', category: 'SIZE', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40', count: largeFileCount },
      { id: 'tag-this-week', label: '#Ostatnie7Dni', category: 'TIME', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', count: recentWeekCount },
      { id: 'tag-discord', label: '#DiscordTemp', category: 'LIFECYCLE', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', count: discordTempCount },
      { id: 'tag-icons', label: '#IkonyISvg', category: 'TYPE', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40', count: iconSvgCount }
    ];

    // Add detected games tags
    gameMap.forEach((v, k) => {
      tags.push({
        id: `game-${k}`,
        label: v.label,
        category: 'CONTENT',
        color: v.color,
        count: v.count
      });
    });

    // Add detected dev language tags
    langMap.forEach((v, k) => {
      tags.push({
        id: `lang-${k}`,
        label: v.label,
        category: 'TYPE',
        color: v.color,
        count: v.count
      });
    });

    return tags.filter(t => t.count > 0);
  }, [items]);

  const filteredTags = useMemo(() => {
    let result = dynamicTags;
    if (selectedTagCategory !== 'ALL') {
      result = result.filter(t => t.category === selectedTagCategory);
    }
    if (tagSearch.trim()) {
      const q = tagSearch.toLowerCase().trim();
      result = result.filter(t => t.label.toLowerCase().includes(q));
    }
    return result;
  }, [dynamicTags, selectedTagCategory, tagSearch]);

  const activeFiltersCount = activeTagsSet.size + (sizeFilter !== 'ALL' ? 1 : 0) + (timeFilter !== 'ALL' ? 1 : 0);

  return (
    <div
      role="region"
      aria-label="Matryca filtrów tagów i właściwości"
      className="w-full bg-[#14141c]/95 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-white/10 space-y-4 font-mono text-xs shadow-xl"
    >
      {/* Top Header of Tags Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-300 flex-wrap">
          <Hash className="w-4 h-4 text-purple-400" />
          <span className="font-extrabold text-white text-xs uppercase tracking-wider">
            Matryca Inteligentnych Tagów & Kontekstu
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#a1a1aa] text-[10px]">
            {dynamicTags.length} tagów
          </span>
          {activeFiltersCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
              Aktywne filtry: {activeFiltersCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search Tag Input */}
          <div className="relative min-w-[160px]">
            <Search className="w-3 h-3 text-[#71717a] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Filtruj tagi..."
              className="w-full pl-7 pr-2.5 py-1 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono text-white placeholder-[#71717a] focus:outline-none focus:border-purple-400 transition"
            />
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearTags();
                onSetSizeFilter('ALL');
                onSetTimeFilter('ALL');
                setTagSearch('');
              }}
              aria-label="Zresetuj wszystkie aktywne filtry"
              className="text-[#a1a1aa] hover:text-white flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer font-semibold"
            >
              <X className="w-3.5 h-3.5" />
              <span>Resetuj filtry</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-[10px]">
        {[
          { id: 'ALL', label: 'Wszystkie tagi' },
          { id: 'CONTENT', label: 'Gry & Zawartość' },
          { id: 'TYPE', label: 'Języki & Komponenty' },
          { id: 'LIFECYCLE', label: 'Cykl życia' },
          { id: 'SIZE', label: 'Rozmiar' },
          { id: 'TIME', label: 'Czas' }
        ].map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedTagCategory(cat.id as any)}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold shrink-0 ${
              selectedTagCategory === cat.id
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                : 'bg-black/30 text-[#71717a] hover:text-[#a1a1aa] border border-white/5'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tag Cloud Pills */}
      <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto custom-scrollbar" role="group" aria-label="Tagi kontekstowe">
        {filteredTags.map((tag) => {
          const isSelected = activeTagsSet.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggleTag(tag.id)}
              aria-pressed={isSelected}
              aria-label={`Filtruj tag ${tag.label} (${tag.count} elementów)`}
              className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 text-xs font-bold ${
                isSelected
                  ? 'bg-purple-500 text-slate-950 border-purple-400 shadow-md shadow-purple-500/25 scale-[1.02]'
                  : `${tag.color} hover:scale-[1.01] hover:brightness-125`
              }`}
            >
              <span>{tag.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-slate-900/60 text-white' : 'bg-black/40'}`}>
                {tag.count}
              </span>
              {isSelected && <Check className="w-3 h-3 text-slate-950 ml-0.5" />}
            </button>
          );
        })}
        {filteredTags.length === 0 && (
          <div className="text-xs text-[#71717a] p-3 text-center w-full">
            Brak tagów odpowiadających filtrowi.
          </div>
        )}
      </div>

      {/* Secondary Quick Facets (Size & Time Intervals) */}
      <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#a1a1aa]">
        
        {/* Size Filters */}
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtr rozmiaru">
          <HardDrive className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[#71717a] font-semibold">Rozmiar:</span>
          {['ALL', 'SMALL', 'MEDIUM', 'HUGE'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSetSizeFilter?.(s)}
              aria-pressed={sizeFilter === s}
              className={`px-2.5 py-1 rounded-lg border transition cursor-pointer font-bold ${
                sizeFilter === s
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                  : 'bg-black/40 border-white/10 hover:border-white/20 text-[#a1a1aa]'
              }`}
            >
              {s === 'ALL' && 'Wszystkie'}
              {s === 'SMALL' && '< 1 MB'}
              {s === 'MEDIUM' && '1 - 20 MB'}
              {s === 'HUGE' && '> 20 MB'}
            </button>
          ))}
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtr czasu">
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#71717a] font-semibold">Wiek:</span>
          {[['ALL', 'Wszystkie'], ['TODAY', 'Ostatnie 24h'], ['WEEK', 'Ten tydzień'], ['MONTH', 'Ostatni miesiąc'], ['OLD', 'Starsze > 1m']].map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => onSetTimeFilter?.(t)}
              aria-pressed={timeFilter === t}
              className={`px-2.5 py-1 rounded-lg border transition cursor-pointer font-bold ${
                timeFilter === t
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-black/40 border-white/10 hover:border-white/20 text-[#a1a1aa]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

      </div>

    </div>
  );
};
