import React, { useState, useMemo } from 'react';
import { 
  FolderOpen, 
  Folder, 
  ChevronRight, 
  Calendar, 
  Sparkles, 
  ArrowLeft, 
  ExternalLink, 
  FolderSync, 
  Check, 
  CheckCircle2,
  Layers,
  LayoutGrid,
  FileText,
  AlertCircle
} from 'lucide-react';
import { FileItem, formatBytesCompact } from '../types';
import {
  isCsgo,
  isFortnite,
  isValorant,
  isMinecraft,
  isRoblox,
  isGamingGeneral,
  isWindowsScreenshot,
  isWallpaperOrArt,
  isUiOrIcon,
  isInvoiceOrFinance,
  isCodeDev,
  isArchive,
  isDocument,
  isAnimeExplicit,
  detectGame,
  detectDevLanguage,
  detectArchetype,
  extractYear
} from '../utils/dynamicCategorizer';
import { nexusApi } from '../utils/nexusAuth';

export interface YearCluster {
  year: string;
  count: number;
  items: FileItem[];
}

export interface TopicCluster {
  id: string;
  topicName: string;
  folderName: string;
  emoji: string;
  description: string;
  badgeClass: string;
  totalCount: number;
  years: YearCluster[];
  allItems: FileItem[];
}

interface SmartTopicHierarchyProps {
  items: FileItem[];
  targetRoot: string;
  selectedTopicId?: string | null;
  selectedYear?: string | null;
  onSelectTopic?: (topicId: string | null) => void;
  onSelectYear?: (year: string | null) => void;
  onSelectItem: (item: FileItem) => void;
  onOpenInExplorer: (path: string) => void;
}

export const SmartTopicHierarchy: React.FC<SmartTopicHierarchyProps> = ({
  items,
  targetRoot,
  selectedTopicId: propTopicId,
  selectedYear: propYear,
  onSelectTopic,
  onSelectYear,
  onSelectItem,
  onOpenInExplorer
}) => {
  const [internalTopicId, setInternalTopicId] = useState<string | null>(null);
  const [internalYear, setInternalYear] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'FOLDERS' | 'TIMELINE'>('FOLDERS');

  const selectedTopicId = propTopicId !== undefined ? propTopicId : internalTopicId;
  const selectedYear = propYear !== undefined ? propYear : internalYear;

  const setSelectedTopicId = (id: string | null) => {
    if (onSelectTopic) onSelectTopic(id);
    else setInternalTopicId(id);
  };

  const setSelectedYear = (yr: string | null) => {
    if (onSelectYear) onSelectYear(yr);
    else setInternalYear(yr);
  };

  const [organizing, setOrganizing] = useState(false);
  const [organizeResult, setOrganizeResult] = useState<{
    success: boolean;
    movedCount: number;
    createdFolders: string[];
  } | null>(null);

  // Group all files into smart semantic topics + years hierarchy
  const topicClusters = useMemo<TopicCluster[]>(() => {
    const buckets = new Map<string, {
      topicName: string;
      folderName: string;
      emoji: string;
      description: string;
      badgeClass: string;
      items: FileItem[];
    }>();

    const getOrCreateBucket = (id: string, meta: {
      topicName: string;
      folderName: string;
      emoji: string;
      description: string;
      badgeClass: string;
    }) => {
      if (!buckets.has(id)) {
        buckets.set(id, { ...meta, items: [] });
      }
      return buckets.get(id)!;
    };

    for (const item of items) {
      // 1. Invoices & Finance (High Confidence)
      if (isInvoiceOrFinance(item)) {
        getOrCreateBucket('finance', {
          topicName: 'Faktury & Finanse (VAT)',
          folderName: 'Faktury_Finanse',
          emoji: '🧾',
          description: 'Faktury VAT, rachunki, potwierdzenia płatności i księgowość',
          badgeClass: 'notion-tag-green'
        }).items.push(item);
        continue;
      }

      // 2. 50+ Dev Languages (High Confidence)
      const lang = detectDevLanguage(item);
      if (lang) {
        getOrCreateBucket(`lang_${lang.id}`, {
          topicName: `${lang.name} (Kod)`,
          folderName: `Dev_${lang.shortTag}`,
          emoji: lang.emoji,
          description: `Pliki źródłowe, projekty i skrypty ${lang.name}`,
          badgeClass: 'notion-tag-blue'
        }).items.push(item);
        continue;
      }

      // 3. Wallpapers & High-Res Art (High Confidence - avoid game false-positives)
      if (isWallpaperOrArt(item)) {
        getOrCreateBucket('wallpapers', {
          topicName: 'Tapety Pulpitu & Arty HD',
          folderName: 'Tapety_Art',
          emoji: '🌄',
          description: 'Tapety 1080p, 1440p, 4K, tła pulpitu i grafiki artystyczne',
          badgeClass: 'notion-tag-blue'
        }).items.push(item);
        continue;
      }

      // 4. UI, Vectors & Icons (High Confidence - avoid game false-positives)
      if (isUiOrIcon(item)) {
        getOrCreateBucket('ui_assets', {
          topicName: 'UI, Wektory & Ikony',
          folderName: 'UI_Assety',
          emoji: '🎨',
          description: 'Ikony SVG, logotypy, banery, awatary i wektory projektowe',
          badgeClass: 'notion-tag-purple'
        }).items.push(item);
        continue;
      }

      // 5. Windows Screenshots
      if (isWindowsScreenshot(item)) {
        getOrCreateBucket('screenshots', {
          topicName: 'Zrzuty Ekranu Windows',
          folderName: 'Zrzuty_Ekranu',
          emoji: '⚡',
          description: 'Podręczne wycinki pulpitu Windows (Win+Shift+S, Wycinanie)',
          badgeClass: 'notion-tag-yellow'
        }).items.push(item);
        continue;
      }

      // 6. 50+ Game Match (Media & Gameplay only)
      const game = detectGame(item);
      if (game) {
        getOrCreateBucket(`game_${game.id}`, {
          topicName: game.name,
          folderName: `Gry_${game.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          emoji: game.emoji,
          description: `Zrzuty ekranu, klipy i nagrania z ${game.name}`,
          badgeClass: 'notion-tag-orange'
        }).items.push(item);
        continue;
      }

      // 7. 500+ Extension Domains (3D, Audio, Video, Emulation...)
      const arch = detectArchetype(item.extension);
      if (arch && arch.domain !== 'Grafika & Foto') {
        getOrCreateBucket(`arch_${arch.domain.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, {
          topicName: arch.domain,
          folderName: arch.domain.replace(/[^a-zA-Z0-9]/g, '_'),
          emoji: arch.emoji,
          description: `Pliki z kategorii ${arch.domain} (.${item.extension.toUpperCase()})`,
          badgeClass: 'notion-tag-indigo'
        }).items.push(item);
        continue;
      }

      // 8. Archives
      if (isArchive(item)) {
        getOrCreateBucket('archives', {
          topicName: 'Archiwa & Paczki (.ZIP)',
          folderName: 'Archiwa_ZIP',
          emoji: '🗜️',
          description: 'Skompresowane paczki .zip, .rar, .7z i kopie zapasowe',
          badgeClass: 'notion-tag-yellow'
        }).items.push(item);
        continue;
      }

      // 9. Documents
      if (isDocument(item)) {
        getOrCreateBucket('documents', {
          topicName: 'Dokumenty & Arkusze',
          folderName: 'Dokumenty',
          emoji: '📄',
          description: 'Pliki PDF, arkusze kalkulacyjne, umowy i notatki',
          badgeClass: 'notion-tag-gray'
        }).items.push(item);
        continue;
      }

      // 10. General Media / Images
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(item.extension.toLowerCase()) || item.category === 'MEDIA') {
        getOrCreateBucket('other_media', {
          topicName: 'Pobrane Zdjęcia & Media',
          folderName: 'Grafiki_Pobrane',
          emoji: '🖼️',
          description: 'Pozostałe zdjęcia i grafiki z internetu i komunikatorów',
          badgeClass: 'notion-tag-orange'
        }).items.push(item);
        continue;
      }

      // 11. Fallback: Do sprawdzenia / Nieznane (Brak pewności zamiast zmyślania)
      getOrCreateBucket('unverified', {
        topicName: 'Do sprawdzenia / Nieznane',
        folderName: 'Do_Sprawdzenia',
        emoji: '❓',
        description: 'Pliki bez jednoznacznej zawartości do ręcznej weryfikacji lub analizy AI',
        badgeClass: 'notion-tag-gray'
      }).items.push(item);
    }

    // Sub-cluster by Years inside each bucket
    return Array.from(buckets.entries())
      .map(([id, group]) => {
        const yearMap = new Map<string, FileItem[]>();
        for (const file of group.items) {
          const yr = extractYear(file.name, file.mtime);
          if (!yearMap.has(yr)) yearMap.set(yr, []);
          yearMap.get(yr)!.push(file);
        }

        const years: YearCluster[] = Array.from(yearMap.entries())
          .map(([year, yrItems]) => ({
            year,
            count: yrItems.length,
            items: yrItems
          }))
          .sort((a, b) => b.year.localeCompare(a.year)); // Newest year first

        return {
          id,
          topicName: group.topicName,
          folderName: group.folderName,
          emoji: group.emoji,
          description: group.description,
          badgeClass: group.badgeClass,
          totalCount: group.items.length,
          years,
          allItems: group.items
        };
      })
      .filter(cluster => cluster.totalCount > 0)
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [items]);

  const activeTopic = topicClusters.find(c => c.id === selectedTopicId) || null;
  const activeYearGroup = activeTopic?.years.find(y => y.year === selectedYear) || null;

  const [organizeError, setOrganizeError] = useState<string | null>(null);

  // Handle Physical Reorganization on Disk
  const handlePhysicalOrganize = async () => {
    if (!targetRoot) return;
    setOrganizing(true);
    setOrganizeResult(null);
    setOrganizeError(null);
    try {
      const res = await nexusApi.post<{
        success: boolean;
        movedCount: number;
        createdFolders?: string[];
      }>('/api/action/organize-by-topics', {
        clusters: topicClusters,
        targetRoot
      });

      if (res && res.success) {
        setOrganizeResult({
          success: true,
          movedCount: res.movedCount,
          createdFolders: res.createdFolders || []
        });
      }
    } catch (err: any) {
      setOrganizeError(err.message || 'Błąd organizacji plików na dysku');
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <div className="w-full space-y-6 text-left font-sans animate-morphIn">
      
      {/* 1. Header Banner with Clear Solution to 400 PNG Chaos */}
      <div className="p-6 rounded-2xl notion-callout border border-[rgba(255,255,255,0.08)] bg-[#202020] flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-lg">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono text-[#9b9a97] uppercase">
            <span>🗂️</span>
            <span>Autonomiczne Porządkowanie Dysku • Project Nexus</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Inteligentne Foldery Tematyczne & Sortowanie wg Lat
          </h2>
          <p className="text-xs text-[#9b9a97] leading-relaxed">
            Pliki są automatycznie segregowane w foldery odpowiadające Twoim grom i danym (np. CS:GO, Fortnite, Zrzuty, Faktury, Tapety, Dev), 
            a każdy temat podzielony na roczniki (<span className="text-white font-mono">2022</span>, <span className="text-white font-mono">2023</span>, <span className="text-white font-mono">2024</span>, <span className="text-white font-mono">2025</span>).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <button
            onClick={handlePhysicalOrganize}
            disabled={organizing || items.length === 0}
            className="px-5 py-2.5 rounded-xl bg-white text-[#191919] hover:bg-neutral-200 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <FolderSync className={`w-4 h-4 ${organizing ? 'animate-spin' : ''}`} />
            <span>{organizing ? 'Przenoszenie plików...' : 'Przenieś Fizycznie na Dysku'}</span>
          </button>

          <button
            onClick={() => onOpenInExplorer(targetRoot)}
            className="px-3.5 py-2.5 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#252525] hover:bg-[#2e2e2e] text-white text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
            title="Otwórz folder główny w Windows Explorerze"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#9b9a97]" />
            <span>Eksplorator Windows</span>
          </button>
        </div>
      </div>

      {/* Confirmation of physical reorganization */}
      {organizeResult && (
        <div className="p-4 rounded-xl bg-[#1c2921] border border-[#2b4c38] text-xs text-[#4ade80] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-morphIn">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#4ade80] shrink-0" />
            <div>
              <div className="font-bold text-white text-sm">
                Pliki zostały fizycznie posegregowane na dysku!
              </div>
              <div className="text-[#a7f3d0] text-[11px] mt-0.5">
                Przeniesiono {organizeResult.movedCount} plików do folderów tematycznych.
              </div>
            </div>
          </div>
          <button
            onClick={() => onOpenInExplorer(targetRoot)}
            className="px-3 py-1.5 rounded-lg bg-[#4ade80] text-black font-semibold text-xs hover:bg-[#86efac] transition flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <span>Otwórz w Windows</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. Breadcrumbs & View Toggle Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[rgba(255,255,255,0.06)] font-mono text-xs">
        
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setSelectedTopicId(null); setSelectedYear(null); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition cursor-pointer ${
              !selectedTopicId 
                ? 'bg-white/10 text-white font-bold' 
                : 'text-[#9b9a97] hover:bg-white/5 hover:text-white'
            }`}
          >
            <span>📁</span>
            <span>Wszystkie Kolekcje</span>
          </button>

          {activeTopic && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#555]" />
              <button
                onClick={() => setSelectedYear(null)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  !selectedYear 
                    ? 'bg-white/10 text-white font-bold' 
                    : 'text-[#9b9a97] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{activeTopic.emoji}</span>
                <span>{activeTopic.topicName}</span>
                <span className="text-[10px] text-[#787774]">({activeTopic.totalCount})</span>
              </button>
            </>
          )}

          {selectedYear && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#555]" />
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 text-white font-bold">
                <span>📁</span>
                <span>Rocznik {selectedYear}</span>
                <span className="text-[10px] text-[#a3e635]">({activeYearGroup?.count || 0})</span>
              </div>
            </>
          )}
        </div>

        {/* Level 2 View Switcher (Folders vs Timeline) */}
        {selectedTopicId && (
          <div className="flex items-center gap-1 bg-[#202020] p-1 rounded-lg border border-[rgba(255,255,255,0.06)] shrink-0">
            <button
              onClick={() => { setViewMode('FOLDERS'); setSelectedYear(null); }}
              className={`px-2.5 py-1 rounded text-xs transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'FOLDERS' && !selectedYear
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-[#9b9a97] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>Foldery Roczników</span>
            </button>
            <button
              onClick={() => setViewMode('TIMELINE')}
              className={`px-2.5 py-1 rounded text-xs transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'TIMELINE'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-[#9b9a97] hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Rozwiń Wszystkie Lata</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. LEVEL 1: Topic Collections (When no topic is selected) */}
      {!selectedTopicId && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-sm">💡</span>
              <span>
                Włącz <strong>Inteligentne tagowanie AI (Ollama)</strong>, aby głęboko zweryfikować faktyczną treść plików zamiast polegać wyłącznie na nazwach.
              </span>
            </div>
            <span className="text-[10px] font-mono text-amber-300/70 shrink-0">AI Content Inspection</span>
          </div>

          <div className="flex items-center justify-between text-xs text-[#9b9a97] font-mono px-1">
            <span>Dostępne foldery tematyczne ({topicClusters.length}):</span>
            <span>Łącznie plików: {items.length}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topicClusters.map((cluster) => (
              <div
                key={cluster.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTopicId(cluster.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTopicId(cluster.id);
                  }
                }}
                className="p-5 rounded-2xl notion-card border border-[rgba(255,255,255,0.08)] bg-[#202020] hover:bg-[#252525] transition cursor-pointer flex flex-col justify-between space-y-4 text-left group hover:border-white/20 shadow-md"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl select-none group-hover:scale-110 transition transform">
                      {cluster.emoji}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                      {cluster.totalCount.toLocaleString('pl-PL')} plików
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-white group-hover:text-blue-300 transition">
                      {cluster.topicName}
                    </h3>
                    <p className="text-xs text-[#9b9a97] mt-1 leading-relaxed">
                      {cluster.description}
                    </p>
                  </div>
                </div>

                {/* Subfolder years pill preview */}
                <div className="pt-3 border-t border-[rgba(255,255,255,0.06)] space-y-2">
                  <div className="text-[11px] font-mono text-[#787774] uppercase flex items-center justify-between">
                    <span>Podfoldery roczników:</span>
                    <span className="text-[10px] text-[#9b9a97]">{cluster.years.length} lata</span>
                  </div>
                  
                  <div className="flex gap-1.5 flex-wrap">
                    {cluster.years.map((yr) => (
                      <button
                        key={yr.year}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTopicId(cluster.id);
                          setSelectedYear(yr.year);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#191919] hover:bg-white/15 border border-[rgba(255,255,255,0.06)] text-[11px] font-mono text-[#d4d4d4] hover:text-white transition cursor-pointer"
                        title={`Otwórz pliki z roku ${yr.year}`}
                      >
                        📁 {yr.year} <span className="text-[#888]">({yr.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. LEVEL 2: Inside Selected Topic (e.g. Roblox or Anime) -> Years view */}
      {selectedTopicId && !selectedYear && activeTopic && viewMode === 'FOLDERS' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl notion-callout bg-[#202020] border border-[rgba(255,255,255,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl select-none">{activeTopic.emoji}</span>
              <div>
                <h3 className="font-bold text-base text-white">
                  Kolekcja: {activeTopic.topicName}
                </h3>
                <p className="text-xs text-[#9b9a97]">
                  Wybierz folder rocznika poniżej, aby wyświetlić tylko zdjęcia i pliki z tego konkretnego roku.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-white font-bold bg-white/10 px-3 py-1.5 rounded-lg">
                {activeTopic.totalCount} plików
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {activeTopic.years.map((yr) => (
              <div
                key={yr.year}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedYear(yr.year)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedYear(yr.year);
                  }
                }}
                className="p-5 rounded-2xl notion-card border border-[rgba(255,255,255,0.08)] bg-[#202020] hover:bg-[#252525] transition cursor-pointer flex flex-col justify-between space-y-3 text-left group hover:border-white/20 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#2a2a2a] flex items-center justify-center text-xl group-hover:scale-110 transition transform">
                    📁
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {yr.count} plików
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-base text-white group-hover:text-blue-300 transition">
                    Folder {yr.year}
                  </h4>
                  <p className="text-xs text-[#9b9a97] mt-0.5 font-mono">
                    {activeTopic.folderName}\{yr.year}
                  </p>
                </div>

                <div className="pt-2 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between text-xs text-[#787774] font-mono">
                  <span>Kliknij, aby otworzyć</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. LEVEL 2 (Alternative): Timeline view showing all years with section headers */}
      {selectedTopicId && viewMode === 'TIMELINE' && activeTopic && (
        <div className="space-y-8">
          {activeTopic.years.map((yrGroup) => (
            <div key={yrGroup.year} className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📁</span>
                  <h3 className="font-bold text-sm text-white">
                    Rocznik {yrGroup.year}
                  </h3>
                  <span className="text-xs font-mono text-[#9b9a97]">
                    ({yrGroup.count} plików w {activeTopic.folderName}\{yrGroup.year})
                  </span>
                </div>

                <button
                  onClick={() => setSelectedYear(yrGroup.year)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-mono transition flex items-center gap-1 cursor-pointer"
                >
                  <span>Pokaż tylko ten rocznik</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Grid for this year's files */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {yrGroup.items.slice(0, 15).map((file) => (
                  <FileCardItem
                    key={file.id}
                    file={file}
                    emoji={activeTopic.emoji}
                    onSelectItem={onSelectItem}
                    onOpenInExplorer={onOpenInExplorer}
                  />
                ))}
              </div>

              {yrGroup.items.length > 15 && (
                <div className="text-center">
                  <button
                    onClick={() => setSelectedYear(yrGroup.year)}
                    className="px-4 py-1.5 rounded-lg bg-[#202020] hover:bg-[#252525] border border-[rgba(255,255,255,0.06)] text-xs text-[#d4d4d4] font-mono cursor-pointer transition"
                  >
                    Zobacz wszystkie {yrGroup.items.length} plików z roku {yrGroup.year} →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 6. LEVEL 3: Specific Year Files View (e.g. Roblox -> 2023) */}
      {selectedTopicId && selectedYear && activeYearGroup && viewMode === 'FOLDERS' && (
        <div className="space-y-4">
          
          <div className="p-4 rounded-xl notion-callout bg-[#202020] border border-[rgba(255,255,255,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl select-none">{activeTopic?.emoji}</span>
              <div>
                <h3 className="font-bold text-sm text-white">
                  {activeTopic?.topicName} • Rocznik {selectedYear}
                </h3>
                <p className="text-xs text-[#9b9a97] font-mono">
                  Folder docelowy: <span className="text-white">{activeTopic?.folderName}\{selectedYear}</span> ({activeYearGroup.count} plików)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedYear(null)}
                className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-xs text-white font-medium transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Inne roczniki</span>
              </button>
            </div>
          </div>

          {/* Files Grid for this specific Year */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {activeYearGroup.items.map((file) => (
              <FileCardItem
                key={file.id}
                file={file}
                emoji={activeTopic?.emoji || '🖼️'}
                onSelectItem={onSelectItem}
                onOpenInExplorer={onOpenInExplorer}
              />
            ))}
          </div>

        </div>
      )}

    </div>
  );
};

// Sub-component for individual file card with resilient thumbnail
interface FileCardItemProps {
  file: FileItem;
  emoji: string;
  onSelectItem: (file: FileItem) => void;
  onOpenInExplorer: (path: string) => void;
}

const FileCardItem: React.FC<FileCardItemProps> = ({
  file,
  emoji,
  onSelectItem,
  onOpenInExplorer
}) => {
  const [thumbError, setThumbError] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectItem(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectItem(file);
        }
      }}
      className="notion-card overflow-hidden flex flex-col justify-between cursor-pointer text-left border border-white/[0.08] bg-[#16161f]/90 hover:bg-[#1d1d29] hover:border-purple-500/40 rounded-2xl transition group shadow-md"
    >
      <div>
        {/* Working Thumbnail / Crisp Preview */}
        <div className="w-full h-32 bg-[#0d0d14] border-b border-white/[0.06] flex items-center justify-center overflow-hidden relative">
          {!thumbError ? (
            <img
              src={file.blobUrl || `/api/file/preview?path=${encodeURIComponent(file.path)}`}
              alt={file.name}
              className="max-h-full max-w-full object-contain transition group-hover:scale-105 duration-200"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#12121a] p-2 text-center select-none">
              <span className="text-2xl">{emoji}</span>
              <span className="text-[10px] font-mono text-purple-300 mt-1">.{file.extension.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <div className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition" title={file.name}>
            {file.name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span className="px-1.5 py-0.2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">
              .{file.extension.toUpperCase()}
            </span>
            <span>{formatBytesCompact(file.size)}</span>
          </div>
        </div>
      </div>

      <div className="p-3 pt-0 text-[10px] font-mono text-slate-500 flex justify-between items-center">
        <span>{new Date(file.mtime).toLocaleDateString('pl-PL')}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenInExplorer(file.path);
          }}
          className="p-1 rounded-md hover:bg-white/10 hover:text-white transition"
          title="Otwórz w Windows Explorerze"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
