import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ExternalLink, 
  FolderSync, 
  Sparkles, 
  Check, 
  X, 
  Filter, 
  ArrowUpDown, 
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  FolderOpen,
  Folder,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { FileItem, CategoryType, SmartWorkspace, AutonomousBlueprint, formatBytesCompact } from '../types';
import { AutonomousPlannerModal } from './AutonomousPlannerModal';
import { SmartTopicHierarchy } from './SmartTopicHierarchy';
import { AdvanceSettingsModal } from './AdvanceSettingsModal';
import {
  extractYear,
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
  GAMES_DATABASE,
  DEV_LANGUAGES_DATABASE
} from '../utils/dynamicCategorizer';

interface NexusExplorerViewProps {
  items: FileItem[];
  workspaces: SmartWorkspace[];
  blueprint: AutonomousBlueprint | null;
  targetPath: string;
  onSelectItem: (item: FileItem) => void;
  onResetToConnect: () => void;
  onOpenInExplorer: (path: string) => void;
  onExecutePlan: (planId: string, isDryRun: boolean) => Promise<any>;
  onDeleteEphemeralGroup?: (ids: string[]) => void;
}

export type NotionDatabaseView = 'TOPICS' | 'TABLE' | 'BOARD' | 'GALLERY' | 'TRIAGE';

export const NexusExplorerView: React.FC<NexusExplorerViewProps> = ({
  items,
  workspaces,
  blueprint,
  targetPath,
  onSelectItem,
  onResetToConnect,
  onOpenInExplorer,
  onExecutePlan,
  onDeleteEphemeralGroup
}) => {
  // Primary default view is TOPICS: Grouped by Topic (Roblox, Anime, etc.) and Years (2022, 2023, 2024)
  const [activeView, setActiveView] = useState<NotionDatabaseView>('TOPICS');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryType | 'ALL'>('ALL');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [expandedSidebarTopic, setExpandedSidebarTopic] = useState<string | null>(null);

  const pageSize = 100;

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { ALL: items.length, DEV: 0, MEDIA: 0, SCREENSHOT: 0, APPS: 0, DOCS: 0, ARCHIVES: 0, OTHER: 0 };
    for (const item of items) {
      if (counts[item.category] !== undefined) counts[item.category]++;
      else counts.OTHER++;
    }
    return counts;
  }, [items]);

  // Sidebar Topic Tree stats (universal 50+ games, 50+ dev languages, archetypes)
  const sidebarTopicTree = useMemo(() => {
    const tree: {
      id: string;
      name: string;
      emoji: string;
      filter: (i: FileItem) => boolean;
      years: Map<string, number>;
    }[] = [];

    // 1. Add Games from 50+ Games Database that exist in items
    for (const game of GAMES_DATABASE) {
      if (items.some(i => detectGame(i)?.id === game.id)) {
        tree.push({
          id: `game_${game.id}`,
          name: game.name,
          emoji: game.emoji,
          filter: (i) => detectGame(i)?.id === game.id,
          years: new Map()
        });
      }
    }

    // 2. Add Invoices & Finance
    if (items.some(isInvoiceOrFinance)) {
      tree.push({
        id: 'finance',
        name: 'Faktury & Finanse (VAT)',
        emoji: '🧾',
        filter: isInvoiceOrFinance,
        years: new Map()
      });
    }

    // 3. Add Windows Screenshots
    if (items.some(isWindowsScreenshot)) {
      tree.push({
        id: 'screenshots',
        name: 'Zrzuty Ekranu Windows',
        emoji: '⚡',
        filter: isWindowsScreenshot,
        years: new Map()
      });
    }

    // 4. Add Dev Languages that exist in items
    for (const lang of DEV_LANGUAGES_DATABASE) {
      if (items.some(i => detectDevLanguage(i)?.id === lang.id)) {
        tree.push({
          id: `lang_${lang.id}`,
          name: `${lang.name} (Kod)`,
          emoji: lang.emoji,
          filter: (i) => detectDevLanguage(i)?.id === lang.id,
          years: new Map()
        });
      }
    }

    // 5. Add Wallpapers
    if (items.some(isWallpaperOrArt)) {
      tree.push({
        id: 'wallpapers',
        name: 'Tapety & Grafiki HD',
        emoji: '🌄',
        filter: isWallpaperOrArt,
        years: new Map()
      });
    }

    // 6. Add UI Assets
    if (items.some(isUiOrIcon)) {
      tree.push({
        id: 'ui',
        name: 'UI & Assety Wektorowe',
        emoji: '🎨',
        filter: isUiOrIcon,
        years: new Map()
      });
    }

    // 7. Add Archetype Domains (3D, Audio, Video, Emulation...)
    const foundDomains = new Set<string>();
    for (const item of items) {
      const arch = detectArchetype(item.extension);
      if (arch && arch.domain !== 'Grafika & Foto') foundDomains.add(arch.domain);
    }
    for (const domain of foundDomains) {
      tree.push({
        id: `arch_${domain.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: domain,
        emoji: '📁',
        filter: (i) => detectArchetype(i.extension)?.domain === domain,
        years: new Map()
      });
    }

    // 8. Add Archives
    if (items.some(isArchive)) {
      tree.push({
        id: 'archives',
        name: 'Archiwa .ZIP & Paczki',
        emoji: '🗜️',
        filter: isArchive,
        years: new Map()
      });
    }

    // 9. Add Documents
    if (items.some(i => isDocument(i) && !isInvoiceOrFinance(i))) {
      tree.push({
        id: 'docs',
        name: 'Dokumenty & Raporty',
        emoji: '📄',
        filter: (i) => isDocument(i) && !isInvoiceOrFinance(i),
        years: new Map()
      });
    }

    // 10. Add Other Media
    if (items.some(i => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(i.extension.toLowerCase()) && !isWindowsScreenshot(i) && !isWallpaperOrArt(i) && !detectGame(i))) {
      tree.push({
        id: 'other_media',
        name: 'Pobrane Zdjęcia & Media',
        emoji: '🖼️',
        filter: (i) => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(i.extension.toLowerCase()),
        years: new Map()
      });
    }

    for (const item of items) {
      for (const t of tree) {
        if (t.filter(item)) {
          const yr = extractYear(item.name, item.mtime);
          t.years.set(yr, (t.years.get(yr) || 0) + 1);
          break;
        }
      }
    }

    return tree.map(t => ({
      ...t,
      totalCount: Array.from(t.years.values()).reduce((a, b) => a + b, 0),
      sortedYears: Array.from(t.years.entries()).sort((a, b) => b[0].localeCompare(a[0]))
    })).filter(t => t.totalCount > 0);
  }, [items]);

  // Overall unique years for fast sidebar filtering
  const allUniqueYears = useMemo(() => {
    const yearsMap = new Map<string, number>();
    for (const item of items) {
      const yr = extractYear(item.name, item.mtime);
      yearsMap.set(yr, (yearsMap.get(yr) || 0) + 1);
    }
    return Array.from(yearsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  // Tags list derived from active populated topics
  const availableTags = useMemo(() => {
    return sidebarTopicTree.map(t => ({
      id: t.id,
      label: `${t.emoji} ${t.name}`,
      class: 'notion-tag-blue',
      filter: t.filter
    }));
  }, [sidebarTopicTree]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    let result = items;

    if (activeView === 'TRIAGE') {
      result = result.filter(i => i.category === 'SCREENSHOT' || i.isDisposable);
    } else if (activeCategory !== 'ALL') {
      result = result.filter(i => i.category === activeCategory);
    }

    if (selectedTag) {
      const tagObj = availableTags.find(t => t.id === selectedTag);
      if (tagObj) {
        result = result.filter(tagObj.filter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const tokens = q.split(/[,;\s]+/).map(t => t.trim().replace(/^[*.]/, '')).filter(Boolean);
      result = result.filter(i => {
        const ext = (i.extension || '').toLowerCase().replace('.', '');
        const name = i.name.toLowerCase();
        return tokens.some(token => {
          if (ext === token) return true;
          if (token.length <= 4) {
            const boundaryRegex = new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
            return boundaryRegex.test(name);
          }
          return name.includes(token);
        });
      });
    }

    return result;
  }, [items, activeView, activeCategory, selectedTag, searchQuery]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, page * pageSize);
  }, [filteredItems, page]);

  // Gallery grouped by Topic & Year so user NEVER gets a flat dump of 400 PNGs
  const galleryGrouped = useMemo(() => {
    const groups: {
      key: string;
      title: string;
      emoji: string;
      topicId: string;
      year: string;
      items: FileItem[];
    }[] = [];

    for (const t of sidebarTopicTree) {
      for (const [yr] of t.sortedYears) {
        const matching = items.filter(i => t.filter(i) && extractYear(i.name, i.mtime) === yr);
        if (matching.length > 0) {
          groups.push({
            key: `${t.id}-${yr}`,
            title: `${t.name} • Rocznik ${yr}`,
            emoji: t.emoji,
            topicId: t.id,
            year: yr,
            items: matching
          });
        }
      }
    }

    return groups;
  }, [items, sidebarTopicTree]);

  const handleSelectFolder = (topicId: string, year: string | null = null) => {
    setActiveView('TOPICS');
    setSelectedTopicId(topicId);
    setSelectedYear(year);
  };

  return (
    <div className="min-h-screen w-full flex bg-[#191919] text-[#e6e5e3] font-sans overflow-hidden select-none">
      
      {/* 1. Left Notion Sidebar with Folders Tree */}
      <aside className="w-64 notion-sidebar flex flex-col justify-between shrink-0 text-left text-xs border-r border-[rgba(255,255,255,0.06)] bg-[#1e1e1e]">
        <div className="p-3 space-y-4 overflow-y-auto custom-scrollbar">
          
          {/* Workspace Switcher */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
            <span className="text-base select-none">📁</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white truncate text-xs">Project Nexus</div>
              <div className="text-[11px] text-[#9b9a97] truncate font-mono">Menedżer plików</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-0.5">
            <button
              onClick={() => setIsPlannerOpen(true)}
              className="w-full px-2 py-1.5 rounded-lg hover:bg-white/5 flex items-center justify-between text-[#e6e5e3] font-medium transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>⚡</span>
                <span>Porządkowanie</span>
              </span>
            </button>

            <button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="w-full px-2 py-1.5 rounded-lg hover:bg-white/5 flex items-center justify-between text-[#e6e5e3] font-medium transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>⚙️</span>
                <span>Ustawienia</span>
              </span>
            </button>

            <button
              onClick={onResetToConnect}
              className="w-full px-2 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2 text-[#9b9a97] hover:text-white transition cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Zmień Skanowany Folder</span>
            </button>
          </div>

          {/* INTERACTIVE FOLDERS & YEARS TREE (Directly solves user request) */}
          <div className="space-y-1 pt-1">
            <div className="px-2 text-[10px] font-mono font-semibold text-[#787774] uppercase tracking-wider flex items-center justify-between">
              <span>Drzewo Folderów (Roczniki)</span>
            </div>

            {/* Tree Items */}
            <div className="space-y-0.5">
              {sidebarTopicTree.map((topic) => {
                const isExpanded = expandedSidebarTopic === topic.id;
                const isTopicActive = activeView === 'TOPICS' && selectedTopicId === topic.id;

                return (
                  <div key={topic.id} className="space-y-0.5">
                    {/* Topic Row */}
                    <div 
                      role="button"
                      tabIndex={0}
                      className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer group ${
                        isTopicActive && !selectedYear
                          ? 'bg-white/15 text-white font-bold'
                          : 'text-[#d4d4d4] hover:bg-white/5 hover:text-white'
                      }`}
                      onClick={() => handleSelectFolder(topic.id, null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectFolder(topic.id, null);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSidebarTopic(isExpanded ? null : topic.id);
                          }}
                          className="p-0.5 hover:text-white text-[#787774]"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                        <span className="text-sm select-none">{topic.emoji}</span>
                        <span className="truncate text-xs">{topic.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#787774] group-hover:text-white">
                        {topic.totalCount}
                      </span>
                    </div>

                    {/* Sub-Years List */}
                    {isExpanded && (
                      <div className="pl-6 space-y-0.5 border-l border-[rgba(255,255,255,0.06)] ml-3 my-0.5">
                        {topic.sortedYears.map(([yr, count]) => {
                          const isYearActive = activeView === 'TOPICS' && selectedTopicId === topic.id && selectedYear === yr;

                          return (
                            <button
                              key={yr}
                              onClick={() => handleSelectFolder(topic.id, yr)}
                              className={`w-full px-2 py-1 rounded-md flex items-center justify-between text-[11px] font-mono transition cursor-pointer ${
                                isYearActive
                                  ? 'bg-white/15 text-white font-bold'
                                  : 'text-[#9b9a97] hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span>📁</span>
                                <span>{yr}</span>
                              </span>
                              <span className="text-[10px] text-[#787774]">({count})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Views Navigation: Focused strictly on Tematy & Roczniki */}
          <div className="space-y-1 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="px-2 text-[10px] font-mono font-semibold text-[#787774] uppercase tracking-wider flex items-center justify-between">
              <span>Nawigacja Główna</span>
            </div>

            <button
              onClick={() => { setActiveView('TOPICS'); setSelectedTopicId(null); setSelectedYear(null); }}
              className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                activeView === 'TOPICS' && !selectedTopicId && !selectedYear
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold'
                  : 'text-[#9b9a97] hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>🗂️</span>
                <span>Wszystkie Foldery</span>
              </span>
              <span className="font-mono text-[10px] text-purple-300 font-semibold">{items.length}</span>
            </button>
          </div>

          {/* Roczniki (Lata) Filter */}
          <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="px-2 text-[10px] font-mono font-semibold text-[#787774] uppercase tracking-wider flex items-center justify-between">
              <span>Filtruj wg Rocznika</span>
              {selectedYear && (
                <button 
                  onClick={() => setSelectedYear(null)} 
                  className="text-[10px] text-purple-400 hover:text-white cursor-pointer font-bold"
                >
                  Wszystkie
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 px-1">
              <button
                onClick={() => setSelectedYear(null)}
                className={`px-2 py-1 rounded-md text-[10px] font-mono transition cursor-pointer flex items-center gap-1 ${
                  !selectedYear
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold'
                    : 'bg-white/5 text-[#9b9a97] hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>Wszystkie</span>
              </button>
              {allUniqueYears.slice(0, 7).map(([yr, count]) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(selectedYear === yr ? null : yr)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono transition cursor-pointer flex items-center gap-1 ${
                    selectedYear === yr
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold shadow-sm'
                      : 'bg-white/5 text-[#9b9a97] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>📅 {yr}</span>
                  <span className="text-[9px] text-[#787774]">({count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Tags Filter */}
          <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="px-2 text-[10px] font-mono font-semibold text-[#787774] uppercase tracking-wider flex items-center justify-between">
              <span>Szybki Filtr</span>
              {selectedTag && (
                <button onClick={() => setSelectedTag(null)} className="text-[10px] hover:text-white">Wyczyść</button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 px-1">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${tag.class} ${
                    selectedTag === tag.id ? 'ring-1 ring-white/60 font-bold' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  #{tag.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[rgba(255,255,255,0.06)] text-[11px] text-[#787774] flex items-center justify-between font-mono">
          <span>Project Nexus</span>
          <button 
            onClick={() => onOpenInExplorer(targetPath)}
            className="hover:text-white"
            title="Otwórz folder w Windows Explorerze"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </aside>

      {/* 2. Main Page Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#191919]">
        
        {/* Top Navbar */}
        <div className="h-12 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-6 shrink-0 bg-[#191919] text-xs">
          <div className="flex items-center gap-2 text-[#9b9a97] truncate">
            <span>Dysk:</span>
            <span className="font-mono text-white truncate max-w-sm">{targetPath}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlannerOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#ebebeb] text-[#191919] font-bold hover:bg-white text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>⚡</span>
              <span>Porządkowanie</span>
            </button>
          </div>
        </div>

        {/* Scrollable Page Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar">
          
          {/* Header Title */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>{activeView === 'TOPICS' ? '🗂️' : activeView === 'GALLERY' ? '📸' : activeView === 'TRIAGE' ? '⚡' : '⊞'}</span>
              <span>
                {activeView === 'TOPICS' ? 'Foldery Tematyczne & Roczniki' :
                 activeView === 'GALLERY' ? 'Galeria Posegregowana Wg Tematów i Lat' :
                 activeView === 'TRIAGE' ? 'Centrum Triażu Zrzutów Ekranu' :
                 activeView === 'BOARD' ? 'Tablica Projektów' : 'Tabela Bazodanowa'}
              </span>
            </h1>
            <p className="text-xs text-[#9b9a97] font-mono">
              {items.length.toLocaleString('pl-PL')} plików • Inteligentne grupowanie kontekstowe • Podział na roczniki
            </p>
          </div>

          {/* Database Views Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2 gap-3">
            {/* Views Tabs */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setActiveView('TOPICS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'TOPICS' ? 'bg-white/15 text-white font-bold' : 'text-[#9b9a97] hover:text-white'
                }`}
              >
                <span>🗂️</span>
                <span>Foldery & Roczniki</span>
              </button>

              <button
                onClick={() => setActiveView('GALLERY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'GALLERY' ? 'bg-white/15 text-white font-bold' : 'text-[#9b9a97] hover:text-white'
                }`}
              >
                <span>📸</span>
                <span>Galeria Tematyczna</span>
              </button>

              <button
                onClick={() => setActiveView('TABLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'TABLE' ? 'bg-white/15 text-white font-bold' : 'text-[#9b9a97] hover:text-white'
                }`}
              >
                <span>⊞</span>
                <span>Tabela</span>
              </button>

              <button
                onClick={() => setActiveView('TRIAGE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'TRIAGE' ? 'bg-[#3a2020] text-[#be5555] font-bold' : 'text-[#9b9a97] hover:text-white'
                }`}
              >
                <span>⚡</span>
                <span>Triaż ({categoryCounts.SCREENSHOT})</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#787774] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Szukaj pliku w bazie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-[#202020] border border-[rgba(255,255,255,0.08)] text-xs text-white placeholder-[#787774] focus:outline-none focus:border-white/20 w-56 font-mono"
              />
            </div>
          </div>

          {/* 1. TOPICS & YEARS HIERARCHY (THE MAIN USER REQUIREMENT) */}
          {activeView === 'TOPICS' && (
            <SmartTopicHierarchy
              items={filteredItems}
              targetRoot={targetPath}
              selectedTopicId={selectedTopicId}
              selectedYear={selectedYear}
              onSelectTopic={(id) => setSelectedTopicId(id)}
              onSelectYear={(yr) => setSelectedYear(yr)}
              onSelectItem={onSelectItem}
              onOpenInExplorer={onOpenInExplorer}
            />
          )}

          {/* 2. GALLERY VIEW (ALWAYS GROUPED BY TOPIC & YEAR - NO 400 PNG DUMP) */}
          {activeView === 'GALLERY' && (
            <div className="space-y-8">
              {galleryGrouped.map((grp) => (
                <div key={grp.key} className="space-y-3 text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                    <div className="flex items-center gap-2">
                      <span className="text-xl select-none">{grp.emoji}</span>
                      <h3 className="font-bold text-sm text-white">{grp.title}</h3>
                      <span className="text-xs font-mono text-[#9b9a97]">({grp.items.length} plików)</span>
                    </div>

                    <button
                      onClick={() => handleSelectFolder(grp.topicId, grp.year)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>Otwórz ten folder</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Grid of files for this group */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {grp.items.slice(0, 15).map((file) => (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectItem(file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectItem(file);
                          }
                        }}
                        className="notion-card overflow-hidden flex flex-col justify-between cursor-pointer text-left border border-[rgba(255,255,255,0.06)] bg-[#202020] hover:bg-[#252525] rounded-xl transition group"
                      >
                        <div>
                          <div className="w-full h-32 bg-[#181818] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-center overflow-hidden relative">
                            <img
                              src={file.blobUrl || `/api/file/preview?path=${encodeURIComponent(file.path)}`}
                              alt={file.name}
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-200"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <span className="text-2xl select-none opacity-40">
                              {grp.emoji}
                            </span>
                          </div>

                          <div className="p-3 space-y-1">
                            <div className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition" title={file.name}>
                              {file.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#9b9a97]">
                              <span className="px-1.5 py-0.2 rounded bg-white/5 text-[#d4d4d4]">
                                .{file.extension.toUpperCase()}
                              </span>
                              <span>{formatBytesCompact(file.size)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 pt-0 text-[10px] font-mono text-[#787774] flex justify-between items-center">
                          <span>{new Date(file.mtime).toLocaleDateString('pl-PL')}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenInExplorer(file.path);
                            }}
                            className="p-1 hover:text-white"
                            title="Otwórz w Windows"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. TABLE VIEW */}
          {activeView === 'TABLE' && (
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#202020] overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-[#252525] border-b border-[rgba(255,255,255,0.06)] text-[#9b9a97] text-[11px] font-mono">
                  <tr>
                    <th className="p-3 font-normal">Nazwa</th>
                    <th className="p-3 font-normal">Kategoria</th>
                    <th className="p-3 font-normal">Rocznik</th>
                    <th className="p-3 font-normal">Rozmiar</th>
                    <th className="p-3 font-normal text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
                  {displayedItems.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={() => onSelectItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectItem(item);
                        }
                      }}
                      className="hover:bg-white/5 cursor-pointer transition text-[#d4d4d4]"
                    >
                      <td className="p-3 font-medium text-white truncate max-w-xs flex items-center gap-2">
                        <span className="text-sm select-none">
                          {detectGame(item)?.emoji ||
                           detectDevLanguage(item)?.emoji ||
                           detectArchetype(item.extension)?.emoji ||
                           (isWindowsScreenshot(item) ? '⚡' :
                            isInvoiceOrFinance(item) ? '🧾' :
                            isWallpaperOrArt(item) ? '🌄' :
                            isUiOrIcon(item) ? '🎨' :
                            item.category === 'DEV' ? '💻' :
                            item.category === 'APPS' ? '📦' :
                            item.category === 'ARCHIVES' ? '🗜️' :
                            item.category === 'DOCS' ? '📄' : '🖼️')}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.category === 'DEV' ? 'notion-tag-blue' :
                          item.category === 'MEDIA' ? 'notion-tag-purple' :
                          item.category === 'SCREENSHOT' ? 'notion-tag-red' :
                          item.category === 'APPS' ? 'notion-tag-yellow' : 'notion-tag-green'
                        }`}>
                          {item.subCategory}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[#9b9a97]">
                        {extractYear(item.name, item.mtime)}
                      </td>
                      <td className="p-3 font-mono text-[#9b9a97]">
                        {formatBytesCompact(item.size)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInExplorer(item.path);
                          }}
                          className="p-1 hover:text-white text-[#9b9a97]"
                          title="Otwórz w Windows"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. TRIAGE VIEW (Clean disposal of disposable screenshots) */}
          {activeView === 'TRIAGE' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl notion-callout bg-[#291e1e] border border-[#4a2b2b] flex items-center justify-between text-xs">
                <div>
                  <h3 className="font-bold text-[#f87171] text-sm">Narzędzie Szybkiego Triażu Zrzutów Ekranu</h3>
                  <p className="text-[#fca5a5]/80 mt-0.5">Wykryto {categoryCounts.SCREENSHOT} tymczasowych wycinków ekranu, które zagracają Twój dysk.</p>
                </div>
                {onDeleteEphemeralGroup && (
                  <button
                    onClick={() => {
                      const ids = items.filter(i => i.category === 'SCREENSHOT' || i.isDisposable).map(i => i.id);
                      onDeleteEphemeralGroup(ids);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#ef4444] text-white font-bold hover:bg-[#dc2626] transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Wyczyść Wszystkie Zrzuty ({categoryCounts.SCREENSHOT})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.filter(i => i.category === 'SCREENSHOT' || i.isDisposable).map(item => (
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
                    className="notion-card overflow-hidden flex flex-col justify-between cursor-pointer border border-[#4a2b2b]/50 bg-[#201a1a] hover:bg-[#251e1e] rounded-xl transition"
                  >
                    <div className="w-full h-28 bg-[#181313] flex items-center justify-center overflow-hidden">
                      <img
                        src={item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}`}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-semibold text-white truncate" title={item.name}>{item.name}</div>
                      <div className="text-[10px] font-mono text-[#9b9a97] mt-0.5">{formatBytesCompact(item.size)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Autonomous Planner Modal */}
      {isPlannerOpen && (
        <AutonomousPlannerModal
          blueprint={blueprint}
          isOpen={isPlannerOpen}
          onClose={() => setIsPlannerOpen(false)}
          onExecutePlan={onExecutePlan}
        />
      )}

      {/* Advance Settings Modal */}
      <AdvanceSettingsModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        targetPath={targetPath}
        onOpenQuarantine={() => {}}
        onOpenGhostCleaner={() => {}}
        onOpenDeduplicator={() => {}}
      />

    </div>
  );
};
