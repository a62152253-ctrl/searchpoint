import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Search, 
  ExternalLink,
  SlidersHorizontal,
  ArrowUpDown,
  Grid3X3,
  LayoutGrid,
  Maximize2,
  Copy,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Eye,
  Film
} from 'lucide-react';
import { FileItem, formatBytesCompact, formatDateCompact } from '../types';
import { LazyThumbnail } from './LazyThumbnail';

interface MediaGalleryViewProps {
  items: FileItem[];
  targetPath?: string;
  onSelectItem: (item: FileItem) => void;
  onOpenInExplorer: (path: string) => void;
}

type MediaSortOption = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'name_asc';
type GridDensity = 'compact' | 'standard' | 'large';

export const MediaGalleryView: React.FC<MediaGalleryViewProps> = ({
  items,
  targetPath,
  onSelectItem,
  onOpenInExplorer
}) => {
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [sortOption, setSortOption] = useState<MediaSortOption>('date_desc');
  const [density, setDensity] = useState<GridDensity>('standard');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [page, setPage] = useState<number>(1);
  
  const pageSize = density === 'compact' ? 72 : density === 'standard' ? 48 : 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Filter only media items
  const mediaItems = useMemo(() => {
    return items.filter(i => 
      i.category === 'MEDIA' || 
      (i.category === 'SCREENSHOT' && !i.isDisposable) ||
      ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'mov'].includes((i.extension || '').toLowerCase())
    );
  }, [items]);

  const filteredMedia = useMemo(() => {
    let result = mediaItems;

    if (formatFilter !== 'ALL') {
      if (formatFilter === 'VIDEO') {
        result = result.filter(i => ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes((i.extension || '').toLowerCase()));
      } else {
        result = result.filter(i => (i.extension || '').toLowerCase() === formatFilter.toLowerCase());
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => 
        i.name.toLowerCase().includes(q) || 
        i.path.toLowerCase().includes(q) ||
        (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      switch (sortOption) {
        case 'date_desc': return b.mtime - a.mtime;
        case 'date_asc': return a.mtime - b.mtime;
        case 'size_desc': return b.size - a.size;
        case 'size_asc': return a.size - b.size;
        case 'name_asc': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        default: return 0;
      }
    });
  }, [mediaItems, formatFilter, search, sortOption]);

  const totalMediaBytes = useMemo(() => {
    return filteredMedia.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [filteredMedia]);

  const displayedMedia = useMemo(() => {
    return filteredMedia.slice(0, page * pageSize);
  }, [filteredMedia, page, pageSize]);

  // Infinite Scroll Sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPage(prev => {
            if (prev * pageSize < filteredMedia.length) {
              return prev + 1;
            }
            return prev;
          });
        }
      },
      { rootMargin: '400px 0px 400px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [displayedMedia.length, filteredMedia.length, pageSize]);

  // Bulk actions
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllDisplayed = () => {
    if (selectedIds.size === displayedMedia.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedMedia.map(i => i.id)));
    }
  };

  const handleCopySelectedPaths = async () => {
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    if (selectedItems.length === 0) return;
    const paths = selectedItems.map(i => i.path).join('\n');
    try {
      await navigator.clipboard.writeText(paths);
      setCopiedBatch(true);
      setTimeout(() => setCopiedBatch(false), 2000);
    } catch {}
  };

  const gridColsClass = density === 'compact'
    ? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5'
    : density === 'standard'
    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5'
    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

  const thumbHeightClass = density === 'compact' ? 'h-24' : density === 'standard' ? 'h-36' : 'h-52';

  return (
    <div className="w-full space-y-6 font-sans text-left animate-morphIn">
      
      {/* 1. Master Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#161622]/95 via-[#1a1828]/95 to-[#151520]/95 backdrop-blur-xl border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs">
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span>NEXUS MEDIA VAULT • {formatBytesCompact(totalMediaBytes)}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Galeria Grafik i Multimediów
          </h1>
          <p className="text-xs text-[#a1a1aa] max-w-xl leading-relaxed">
            Wizualny przegląd wszystkich grafik, zrzutów ekranu, wektorów i wideo. Leniwe ładowanie o wysokiej wydajności z błyskawicznym podglądem.
          </p>
        </div>

        {/* Format Filter Chips */}
        <div className="relative z-10 flex items-center gap-2 flex-wrap">
          <div className="flex bg-black/60 p-1 rounded-2xl border border-white/10 text-xs font-mono">
            {[
              { id: 'ALL', label: 'Wszystkie' },
              { id: 'png', label: '.PNG' },
              { id: 'webp', label: '.WEBP' },
              { id: 'svg', label: '.SVG' },
              { id: 'jpg', label: '.JPG' },
              { id: 'gif', label: '.GIF' },
              { id: 'VIDEO', label: 'Wideo' }
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => { setFormatFilter(fmt.id); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer font-bold ${
                  formatFilter === fmt.id
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50'
                    : 'text-[#a1a1aa] hover:text-white hover:bg-white/5'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar: Search, Sort, Density, Batch Selection */}
      <div className="p-4 rounded-2xl bg-[#14141c]/90 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
        
        {/* Left: Stats & Select All */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSelectAllDisplayed}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition flex items-center gap-2 cursor-pointer font-semibold"
          >
            {selectedIds.size > 0 && selectedIds.size === displayedMedia.length ? (
              <CheckSquare className="w-4 h-4 text-purple-400" />
            ) : (
              <Square className="w-4 h-4 text-[#71717a]" />
            )}
            <span>{selectedIds.size > 0 ? `Zaznaczono (${selectedIds.size})` : 'Zaznacz widoczne'}</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleCopySelectedPaths}
              className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 transition flex items-center gap-1.5 cursor-pointer font-bold"
            >
              {copiedBatch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBatch ? 'Skopiowano ścieżki!' : 'Kopiuj ścieżki'}</span>
            </button>
          )}

          <div className="text-slate-400 text-[11px]">
            Znaleziono <strong className="text-purple-300 font-bold">{filteredMedia.length.toLocaleString('pl-PL')}</strong> grafik ({formatBytesCompact(totalMediaBytes)})
          </div>
        </div>

        {/* Right: Search, Sorting & Density */}
        <div className="flex items-center gap-2.5 flex-wrap">
          
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Szukaj grafik (np. icon, screenshot)..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white placeholder-[#71717a] focus:outline-none focus:border-purple-400 transition"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-xl border border-white/10">
            <ArrowUpDown className="w-3 h-3 text-purple-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as MediaSortOption)}
              className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="date_desc" className="bg-[#16161f]">Najnowsze</option>
              <option value="date_asc" className="bg-[#16161f]">Najstarsze</option>
              <option value="size_desc" className="bg-[#16161f]">Największe</option>
              <option value="size_asc" className="bg-[#16161f]">Najmniejsze</option>
              <option value="name_asc" className="bg-[#16161f]">Nazwa A-Z</option>
            </select>
          </div>

          {/* Grid Density Selector */}
          <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${density === 'compact' ? 'bg-purple-600 text-white' : 'text-[#71717a] hover:text-white'}`}
              title="Widok zwarty (wiele miniaturek)"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDensity('standard')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${density === 'standard' ? 'bg-purple-600 text-white' : 'text-[#71717a] hover:text-white'}`}
              title="Widok standardowy"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDensity('large')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${density === 'large' ? 'bg-purple-600 text-white' : 'text-[#71717a] hover:text-white'}`}
              title="Widok duży"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Empty State if no media found */}
      {filteredMedia.length === 0 && (
        <div className="p-12 rounded-3xl bg-[#14141c]/50 border border-white/10 text-center space-y-4 font-mono">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-center mx-auto text-2xl">
            🖼️
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Brak grafik spełniających kryteria</h3>
            <p className="text-xs text-[#a1a1aa] font-sans max-w-sm mx-auto">
              Nie znaleziono multimediów dla formatu „{formatFilter}” lub zapytania „{search}”.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setFormatFilter('ALL'); setSearch(''); }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-purple-900/30"
          >
            Zresetuj filtry galerii
          </button>
        </div>
      )}

      {/* 4. Masonry / Adaptive Visual Grid */}
      {filteredMedia.length > 0 && (
        <div className={`grid ${gridColsClass}`}>
          {displayedMedia.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const isVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes((item.extension || '').toLowerCase());

            return (
              <div
                role="button"
                tabIndex={0}
                key={item.id}
                onClick={() => onSelectItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectItem(item);
                  }
                }}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '180px' }}
                className={`group p-2.5 rounded-2xl border transition flex flex-col justify-between cursor-pointer text-left relative overflow-hidden backdrop-blur-sm ${
                  isSelected 
                    ? 'bg-purple-950/40 border-purple-500/80 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/50' 
                    : 'bg-[#14141c]/90 border-white/[0.07] hover:border-purple-500/40 hover:bg-[#1a1a26]'
                }`}
              >
                <div>
                  {/* High Performance Lazy Thumbnail Container */}
                  <div className={`w-full ${thumbHeightClass} rounded-xl bg-[#0a0a0f] border border-white/5 flex items-center justify-center overflow-hidden mb-2 group-hover:border-purple-500/30 transition relative`}>
                    <LazyThumbnail
                      path={item.path}
                      name={item.name}
                      extension={item.extension}
                      category={item.category}
                      aspectRatio="square"
                      className="w-full h-full object-contain"
                    />

                    {/* Video Indicator */}
                    {isVideo && (
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-purple-300 flex items-center gap-1 border border-white/10">
                        <Film className="w-3 h-3" />
                        <span>VIDEO</span>
                      </div>
                    )}

                    {/* Selection Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => toggleSelect(item.id, e)}
                      className={`absolute top-1.5 left-1.5 p-1 rounded-lg transition cursor-pointer z-10 ${
                        isSelected 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-black/60 text-[#71717a] hover:text-white opacity-0 group-hover:opacity-100'
                      }`}
                      title={isSelected ? 'Odznacz' : 'Zaznacz'}
                    >
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    </button>

                    {/* Open in Explorer Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInExplorer(item.path);
                      }}
                      title="Pokaż w Eksploratorze Windows"
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/70 hover:bg-purple-600 text-slate-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition cursor-pointer z-10"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition" title={item.name}>
                    {item.name}
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-[#71717a]">
                  <span className="text-purple-400 font-bold uppercase">.{item.extension}</span>
                  <span>{formatBytesCompact(item.size)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Infinite Scroll Sentinel / Load More Button */}
      {displayedMedia.length < filteredMedia.length && (
        <div ref={sentinelRef} className="pt-4 pb-12 flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
          <span className="text-[11px] font-mono text-purple-300/80">
            Wyświetlono {displayedMedia.length.toLocaleString('pl-PL')} z {filteredMedia.length.toLocaleString('pl-PL')} plików...
          </span>
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            className="px-5 py-2 rounded-xl bg-[#14141c] border border-purple-500/30 hover:border-purple-400 text-xs font-mono text-purple-300 transition cursor-pointer shadow-lg shadow-purple-950/30"
          >
            Załaduj kolejną partię (+{pageSize})
          </button>
        </div>
      )}

    </div>
  );
};
