import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  X, 
  ArrowLeft, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  Layers, 
  FileText, 
  Image as ImageIcon,
  Compass,
  ArrowRight,
  FileCode,
  Activity,
  Archive,
  Terminal,
  Cpu
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';
import { LazyThumbnail } from './LazyThumbnail';
import { PaginationControls } from './PaginationControls';
import { nexusApi } from '../utils/nexusAuth';

interface ContextGuidedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInExplorer: (path: string) => void;
}

interface QuestionOption {
  value: string;
  label: string;
  count: number;
}

interface NextQuestion {
  id: string;
  title: string;
  subtitle: string;
  options: QuestionOption[];
}

export const ContextGuidedSearchModal: React.FC<ContextGuidedSearchModalProps> = ({
  isOpen,
  onClose,
  onOpenInExplorer
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ id: string; label: string; count: number }[]>([]);
  
  // Bounded rendering pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    totalIndexed: number;
    initialCount: number;
    totalMatches: number;
    domain?: string;
    isFinished: boolean;
    nextQuestion: NextQuestion | null;
    pagination?: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasPrev: boolean;
      hasNext: boolean;
    };
    items: FileItem[];
  } | null>(null);

  // Detail preview state
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // System memory stats
  const [memoryStats, setMemoryStats] = useState<{ rssMB: string; heapUsedMB: string } | null>(null);

  // 1. 300ms Debounce on search input (prevents excessive searching per keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1); // Reset to page 1 on query change
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch search step from server with Bounded Window
  const fetchStep = (currentQuery: string, currentAnswers: Record<string, string>, currentPage = page, currentLimit = limit) => {
    setLoading(true);
    nexusApi.post<any>('/api/guided-search', { 
      query: currentQuery, 
      answers: currentAnswers,
      page: currentPage,
      limit: currentLimit
    }, { timeoutMs: 12000 })
      .then(resData => {
        setData(resData);
        if (resData.items && resData.items.length > 0 && !selectedItem) {
          setSelectedItem(resData.items[0]);
        }
      })
      .catch(err => console.error('[GuidedSearch]', err))
      .finally(() => setLoading(false));
  };

  // Poll memory metrics periodically
  useEffect(() => {
    if (isOpen) {
      nexusApi.get<any>('/api/system/memory', { timeoutMs: 4000 })
        .then(setMemoryStats)
        .catch(() => {});
    }
  }, [isOpen, page, answers]);

  // Trigger fetch on query change, answer change, page change, or limit change
  useEffect(() => {
    if (isOpen) {
      fetchStep(debouncedQuery, answers, page, limit);
    }
  }, [isOpen, debouncedQuery, answers, page, limit]);

  // Handle answering a question
  const handleSelectOption = (questionId: string, option: QuestionOption) => {
    const updatedAnswers = { ...answers, [questionId]: option.value };
    setAnswers(updatedAnswers);
    setHistory(prev => [...prev, { id: questionId, label: option.label, count: option.count }]);
    setPage(1);
    fetchStep(debouncedQuery, updatedAnswers, 1, limit);
  };

  // Handle undoing last step
  const handleUndo = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    const last = newHistory.pop();
    setHistory(newHistory);

    if (last) {
      const updatedAnswers = { ...answers };
      delete updatedAnswers[last.id];
      setAnswers(updatedAnswers);
      setPage(1);
      fetchStep(debouncedQuery, updatedAnswers, 1, limit);
    }
  };

  // Handle resetting
  const handleReset = () => {
    setQuery('');
    setDebouncedQuery('');
    setAnswers({});
    setHistory([]);
    setPage(1);
    setSelectedItem(null);
    fetchStep('', {}, 1, limit);
  };

  // Handle open in default OS app
  const handleOpenDefault = (filePath: string) => {
    nexusApi.post('/api/action/open-default', { path: filePath }).catch(() => {});
  };

  // Handle copy path
  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath);
    setCopiedPath(filePath);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn text-left select-none">
      <div className="w-full max-w-5xl bg-[#161616] border border-[#2b2b2b] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh]">
        
        {/* 1. Header with architectural badge */}
        <div className="p-4 border-b border-[#242424] bg-[#1a1a1a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xl shadow-inner">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">Wyszukiwanie krok po kroku</h2>
              </div>
              <p className="text-xs text-[#888] font-mono mt-0.5">
                Zawężaj wyniki za pomocą pytań pomocniczych dopasowanych do Twoich plików
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {memoryStats && (
              <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-[#111] border border-[#2c2c2c] text-[10px] font-mono text-[#888]">
                <Cpu className="w-3 h-3 text-emerald-400" />
                <span>Heap: <b className="text-white">{memoryStats.heapUsedMB} MB</b></span>
              </div>
            )}
            <button
              onClick={handleReset}
              className="p-2 rounded-lg hover:bg-white/5 text-[#888] hover:text-white transition cursor-pointer"
              title="Resetuj filtry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-[#888] hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Debounced Search Input Bar */}
        <div className="p-4 bg-[#141414] border-b border-[#242424] space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Wpisz cokolwiek pamiętasz (np. 'dziewczyna anime', 'ten kod od logowania gdzie miałem recovery code', 'faktura')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-24 py-2.5 rounded-xl bg-[#1c1c1c] border border-[#333] text-sm text-white placeholder-[#666] focus:outline-none focus:border-purple-500/60 font-mono transition"
            />
            {loading && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-purple-400 animate-pulse">
                filtrowanie...
              </span>
            )}
          </div>

          {/* Progressive Entropy Reduction Breadcrumb Trail */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-[#222] text-[#888] border border-[#333]">
              📚 Indeks: <b className="text-white">{(data?.totalIndexed || 0).toLocaleString('pl-PL')}</b>
            </span>

            {query.trim() && (
              <>
                <ArrowRight className="w-3 h-3 text-[#555]" />
                <span className="px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-700/40 font-bold">
                  "{query}" ({(data?.initialCount || 0).toLocaleString('pl-PL')} pasujących)
                </span>
              </>
            )}

            {history.map((step, idx) => (
              <React.Fragment key={idx}>
                <ArrowRight className="w-3 h-3 text-[#555]" />
                <span className="px-2 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30">
                  {step.label.split('(')[0].trim()} ({step.count.toLocaleString('pl-PL')})
                </span>
              </React.Fragment>
            ))}

            <ArrowRight className="w-3 h-3 text-[#555]" />
            <span className="px-2.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 font-bold animate-pulse">
              {(data?.totalMatches || 0).toLocaleString('pl-PL')} kandydatów
            </span>

            {history.length > 0 && (
              <button
                onClick={handleUndo}
                className="ml-auto text-[11px] text-[#888] hover:text-white flex items-center gap-1 transition cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" /> Cofnij krok
              </button>
            )}
          </div>
        </div>

        {/* 3. Main Modal Body: Questions (if active) OR Results Grid */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left / Center: Interactive Dynamic Questions or Results Grid */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-[#242424]">
            
            {/* If there is a next question to answer */}
            {!data?.isFinished && data?.nextQuestion ? (
              <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
                
                {/* Active Question Title Card */}
                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1 text-left">
                  <div className="flex items-center gap-2 text-xs font-mono text-purple-400 font-bold uppercase tracking-wider">
                    <span>PYTANIE {history.length + 1} Z 5</span>
                    <span>•</span>
                    <span>Dynamiczny filtr metadanych ({data?.domain || 'GENERAL'})</span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {data.nextQuestion.title}
                  </h3>
                  <p className="text-xs text-[#aaa] font-mono">
                    {data.nextQuestion.subtitle}
                  </p>
                </div>

                {/* Option Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.nextQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(data!.nextQuestion!.id, option)}
                      className="p-3.5 rounded-xl bg-[#1c1c1c] hover:bg-purple-950/30 border border-[#2e2e2e] hover:border-purple-500/50 transition cursor-pointer text-left space-y-1.5 group flex flex-col justify-between"
                    >
                      <div className="font-medium text-sm text-[#eee] group-hover:text-purple-200 transition">
                        {option.label}
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono text-[#777] pt-1 border-t border-[#262626] group-hover:border-purple-900/40">
                        <span>Zawęża do:</span>
                        <span className="font-bold text-white group-hover:text-purple-300">
                          {option.count.toLocaleString('pl-PL')} plików
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Progressive preview of current matches while in questionnaire */}
                {data.items && data.items.length > 0 && (
                  <div className="pt-4 space-y-2 border-t border-[#242424]">
                    <div className="text-[11px] font-mono text-[#777] uppercase tracking-wider flex items-center justify-between">
                      <span>Podgląd bieżącej puli (Pokazano pierwsze {data.items.length} z {data.totalMatches.toLocaleString('pl-PL')}):</span>
                      <span className="text-purple-400">Zero Lag Rendering</span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {data.items.slice(0, 6).map((file) => (
                        <div
                          key={file.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedItem(file)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedItem(file);
                            }
                          }}
                          className={`cursor-pointer transition rounded-lg border overflow-hidden ${
                            selectedItem?.id === file.id ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-[#262626] hover:border-[#444]'
                          }`}
                        >
                          <LazyThumbnail
                            path={file.path}
                            name={file.name}
                            extension={file.extension}
                            category={file.category}
                            aspectRatio="square"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* RESULTS FOUND: Display Bounded Virtualized Grid + Large Previews */
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* Result header banner */}
                <div className="px-5 py-3 border-b border-[#242424] bg-[#191919] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎉</span>
                    <h3 className="font-bold text-sm text-white">
                      Znaleziono {data?.totalMatches.toLocaleString('pl-PL')} pasujących plików
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                    FOUND • 2 SEKUNDY
                  </span>
                </div>

                {/* Bounded Scrollable Items Grid (Only 25/50/100/250 items in DOM) */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {data?.items && data.items.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {data.items.map((file) => {
                        const isSelected = selectedItem?.id === file.id;
                        return (
                          <div
                            key={file.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedItem(file)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedItem(file);
                              }
                            }}
                            className={`group rounded-xl border bg-[#1b1b1b] p-2 space-y-2 cursor-pointer transition flex flex-col justify-between ${
                              isSelected
                                ? 'border-purple-500 bg-purple-950/20 ring-1 ring-purple-500/40'
                                : 'border-[#292929] hover:border-[#444] hover:bg-[#202020]'
                            }`}
                          >
                            <LazyThumbnail
                              path={file.path}
                              name={file.name}
                              extension={file.extension}
                              category={file.category}
                              aspectRatio="square"
                            />
                            <div className="space-y-0.5 text-left min-w-0">
                              <p className="text-xs font-medium text-white truncate group-hover:text-purple-300" title={file.name}>
                                {file.name}
                              </p>
                              <div className="flex items-center justify-between text-[10px] font-mono text-[#777]">
                                <span>{formatBytesCompact(file.size)}</span>
                                <span className="uppercase text-purple-400">.{file.extension}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-[#777]">
                      <Compass className="w-12 h-12 opacity-30" />
                      <p className="text-sm font-medium">Brak plików spełniających wybrane kryteria.</p>
                      <button
                        onClick={handleReset}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium cursor-pointer transition"
                      >
                        Wyczyść filtry
                      </button>
                    </div>
                  )}
                </div>

                {/* Bounded Pagination Controls Bar (50 per page, 25/50/100/250) */}
                {data?.pagination && (
                  <PaginationControls
                    page={page}
                    limit={limit}
                    totalItems={data.pagination.totalItems}
                    totalPages={data.pagination.totalPages}
                    hasPrev={data.pagination.hasPrev}
                    hasNext={data.pagination.hasNext}
                    onPageChange={(p) => setPage(p)}
                    onLimitChange={(l) => { setLimit(l); setPage(1); }}
                    showingCount={data.items.length}
                  />
                )}

              </div>
            )}

          </div>

          {/* Right Inspector Drawer: Full Preview & Quick Actions */}
          <div className="w-full md:w-80 bg-[#141414] border-t md:border-t-0 md:border-l border-[#242424] flex flex-col justify-between shrink-0 overflow-y-auto custom-scrollbar p-4 space-y-4 text-left">
            {selectedItem ? (
              <div className="space-y-4">
                
                {/* Large Preview */}
                <div className="rounded-xl overflow-hidden border border-[#2e2e2e] bg-[#181818]">
                  <LazyThumbnail
                    path={selectedItem.path}
                    name={selectedItem.name}
                    extension={selectedItem.extension}
                    category={selectedItem.category}
                    aspectRatio="video"
                    className="w-full"
                  />
                </div>

                {/* File Metadata */}
                <div className="space-y-2">
                  <h4 className="font-bold text-sm text-white break-all leading-tight">
                    {selectedItem.name}
                  </h4>
                  <div className="space-y-1 text-xs font-mono text-[#888]">
                    <div className="flex justify-between py-1 border-b border-[#242424]">
                      <span>Rozmiar:</span>
                      <span className="text-white">{formatBytesCompact(selectedItem.size)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#242424]">
                      <span>Format:</span>
                      <span className="text-purple-400 font-bold uppercase">.{selectedItem.extension}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#242424]">
                      <span>Kategoria:</span>
                      <span className="text-white">{selectedItem.category || 'MEDIA'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#242424]">
                      <span>Modyfikacja:</span>
                      <span className="text-white">
                        {selectedItem.mtime ? new Date(selectedItem.mtime).toLocaleDateString('pl-PL') : '2024'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {selectedItem.tags && selectedItem.tags.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-[#666] uppercase">Tagi kontekstowe:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedItem.tags.map((t, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-500/30 text-[10px] font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleOpenDefault(selectedItem.path)}
                    className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Otwórz w domyślnej aplikacji</span>
                  </button>

                  <button
                    onClick={() => onOpenInExplorer(selectedItem.path)}
                    className="w-full py-2 px-3 rounded-lg bg-[#222] hover:bg-[#2b2b2b] border border-[#333] text-white text-xs transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>📁 Pokaż w Windows Explorer</span>
                  </button>

                  <button
                    onClick={() => handleCopyPath(selectedItem.path)}
                    className="w-full py-2 px-3 rounded-lg bg-[#222] hover:bg-[#2b2b2b] border border-[#333] text-[#aaa] hover:text-white text-xs transition cursor-pointer flex items-center justify-center gap-2 font-mono"
                  >
                    {copiedPath === selectedItem.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Skopiowano ścieżkę!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopiuj pełną ścieżkę</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-4 text-[#666] text-xs">
                Wybierz element, aby zobaczyć szczegóły
              </div>
            )}

            {/* Architectural Manifesto Footer */}
            <div className="pt-3 border-t border-[#242424] text-[10px] font-mono text-[#666] text-center space-y-0.5">
              <div className="text-purple-400 font-bold">Unlimited files. Bounded rendering.</div>
              <div>Memory capped at viewport</div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
