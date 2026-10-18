import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDown } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  onLoadMore?: () => void;
  showingCount?: number;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  page,
  limit,
  totalItems,
  totalPages,
  hasPrev,
  hasNext,
  onPageChange,
  onLimitChange,
  onLoadMore,
  showingCount
}) => {
  const startItem = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(totalItems, (page - 1) * limit + (showingCount || limit));
  const safeTotalPages = Math.max(1, totalPages);

  // Build visible page number pills around current page
  const visiblePages: number[] = [];
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(safeTotalPages, page + 2);
  for (let p = windowStart; p <= windowEnd; p++) {
    visiblePages.push(p);
  }

  return (
    <nav
      aria-label="Nawigacja stronicowaniem"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#16161d]/95 border border-white/10 text-xs font-mono select-none shadow-xl"
    >
      {/* 1. Results Summary */}
      <div className="flex items-center gap-2 text-[#9ca3af]" role="status" aria-live="polite">
        <span>Pokazano</span>
        <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-white font-bold">
          {startItem.toLocaleString('pl-PL')}–{endItem.toLocaleString('pl-PL')}
        </span>
        <span>z</span>
        <span className="text-purple-300 font-extrabold">
          {totalItems.toLocaleString('pl-PL')}
        </span>
        <span>wyników</span>
        <span className="text-[10px] text-emerald-400/80 hidden md:inline-flex items-center gap-1 ml-1">
          ● Zero-Lag Window
        </span>
      </div>

      {/* 2. Page Size Selector & Navigation Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        
        {/* Limit options (25 / 50 / 100 / 250) */}
        <div
          className="flex items-center gap-1 bg-[#111117] p-1 rounded-xl border border-white/8"
          role="group"
          aria-label="Liczba elementów na stronę"
        >
          <span className="text-[#71717a] text-[10px] px-1.5">Na stronę:</span>
          {[25, 50, 100, 250].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onLimitChange(size)}
              aria-label={`Ustaw ${size} wyników na stronę`}
              aria-pressed={limit === size}
              className={`px-2 py-0.5 rounded-lg text-[11px] transition cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                limit === size
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[#8e8e98] hover:bg-white/5 hover:text-white'
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Load next chunk button */}
        {onLoadMore && hasNext && (
          <button
            type="button"
            onClick={onLoadMore}
            aria-label={`Wczytaj kolejne ${limit} elementów`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/35 text-purple-200 text-[11px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
            <span>Wczytaj kolejne {limit} →</span>
          </button>
        )}

        {/* First / Prev / Page Pills / Next / Last pagination */}
        <div className="flex items-center gap-1" role="group" aria-label="Wybór strony">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={!hasPrev}
            aria-label="Pierwsza strona"
            className="p-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] disabled:opacity-30 disabled:pointer-events-none text-white border border-white/10 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            title="Pierwsza strona"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={!hasPrev}
            aria-label="Poprzednia strona"
            className="p-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] disabled:opacity-30 disabled:pointer-events-none text-white border border-white/10 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            title="Poprzednia strona"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="hidden sm:flex items-center gap-1 px-1">
            {visiblePages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (p !== page) onPageChange(p);
                }}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Strona ${p}`}
                className={`min-w-[28px] h-7 px-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  p === page
                    ? 'bg-purple-600/40 border-purple-500/60 text-white shadow-sm font-extrabold'
                    : 'bg-[#14141b] border-white/8 text-[#9ca3af] hover:text-white hover:border-white/20'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <span className="sm:hidden px-2 py-0.5 text-[#aaa] text-[11px]" aria-current="page">
            {page} / {safeTotalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
            disabled={!hasNext}
            aria-label="Następna strona"
            className="p-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] disabled:opacity-30 disabled:pointer-events-none text-white border border-white/10 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            title="Następna strona"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={!hasNext}
            aria-label="Ostatnia strona"
            className="p-1.5 rounded-xl bg-[#1b1b24] hover:bg-[#252532] disabled:opacity-30 disabled:pointer-events-none text-white border border-white/10 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            title="Ostatnia strona"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

    </nav>
  );
};
