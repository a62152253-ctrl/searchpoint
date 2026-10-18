import { FileItem, formatBytesCompact } from '../types';
import { 
  GAMES_DATABASE, 
  DEV_LANGUAGES_DATABASE, 
  EXTENSION_ARCHETYPES,
  detectGame as detectGameKB,
  detectDevLanguage as detectDevLanguageKB,
  detectArchetype as detectArchetypeKB,
  extractYear,
  GameDefinition,
  DevLanguageDefinition,
  ExtensionDetail
} from './fileKnowledgeBase';

export interface DynamicCategory {
  id: string;
  label: string;
  shortTag: string;
  emoji?: string;
  iconType: 'badge' | 'emoji';
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  count: number;
  items: FileItem[];
  filter: (item: FileItem) => boolean;
}

export interface SmartClusterCard {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  count: number;
  totalBytes: number;
  weightLabel: string;
  percent: number;
  barGradient: string;
  hoverColor: string;
  sample: FileItem[];
  previewType: 'IMAGE_COLLAGE' | 'CODE_SNIPPET' | 'ARCHIVE_LIST' | 'DOC_LIST' | 'GENERIC';
  codeSnippet?: { file: string; lines: string[]; lang: string };
  filter: (item: FileItem) => boolean;
}

// Re-export Knowledge Base items
export { 
  GAMES_DATABASE, 
  DEV_LANGUAGES_DATABASE, 
  EXTENSION_ARCHETYPES,
  extractYear
};

export const detectGame = detectGameKB;
export const detectDevLanguage = detectDevLanguageKB;
export const detectArchetype = detectArchetypeKB;

// ============================================================================
// CONVENIENCE DETECTOR HELPERS (BACKWARD COMPATIBILITY + HIGH ACCURACY)
// ============================================================================

const GAME_MEDIA_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'webm', 'gif', 'bmp']);

export const isCsgo = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  // As requested: CS:GO files MUST be photos/screenshots (PNG, JPG, WEBP) - NEVER source code!
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  return detectGameKB(item)?.id === 'csgo';
};

export const isFortnite = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  return detectGameKB(item)?.id === 'fortnite';
};

export const isValorant = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  return detectGameKB(item)?.id === 'valorant';
};

export const isMinecraft = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  return detectGameKB(item)?.id === 'minecraft';
};

export const isRoblox = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  return detectGameKB(item)?.id === 'roblox';
};

export const isGamingGeneral = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase().replace('.', '');
  if (!GAME_MEDIA_EXTS.has(ext) || item.category === 'DEV') return false;
  const g = detectGameKB(item);
  if (g) return true;
  const n = (item.name || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  return tags.includes('#gaming') ||
    tags.includes('#gameplay') ||
    /(geforce|shadowplay|medal[_\-\s]?tv|obs[_\-\s]|gameplay|replay|killfeed|clipping)/i.test(n);
};

export const isWindowsScreenshot = (item: FileItem): boolean => {
  if (isGamingGeneral(item)) return false;
  const n = (item.name || '').toLowerCase();
  const cat = item.category || '';
  const tags = (item.tags || []).map(t => t.toLowerCase());
  return cat === 'SCREENSHOT' ||
    tags.includes('#screenshot') ||
    tags.includes('#snip') ||
    /(screenshot|snip|zrzut|przechwyc|wycinanie|lightshot|greenshot|wycinek)/i.test(n);
};

export const isWallpaperOrArt = (item: FileItem): boolean => {
  const n = (item.name || '').toLowerCase();
  const ext = (item.extension || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  if (!['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext)) return false;
  return tags.includes('#wallpaper') ||
    tags.includes('#art') ||
    /(wallpaper|tapeta|1920x1080|2560x1440|3840x2160|4k|ultrawide|desktop[_\-\s]?bg|background|render|digital[_\-\s]?art|illustration)/i.test(n);
};

export const isUiOrIcon = (item: FileItem): boolean => {
  const n = (item.name || '').toLowerCase();
  const ext = (item.extension || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  return tags.includes('#ui') ||
    tags.includes('#assets') ||
    ext === 'svg' ||
    /(icon|logo|badge|avatar|pfp|button|banner|thumbnail|asset|transparent|vector|figma)/i.test(n);
};

export const isInvoiceOrFinance = (item: FileItem): boolean => {
  const n = (item.name || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  return tags.includes('#faktura') ||
    tags.includes('#finanse') ||
    /(faktura|invoice|vat|bill|rachunek|paragon|platnosc|przelew|fv[_\-\s]\d+)/i.test(n);
};

export const isCodeDev = (item: FileItem): boolean => {
  if (detectDevLanguageKB(item)) return true;
  return item.category === 'DEV';
};

export const isArchive = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase();
  return item.category === 'ARCHIVES' || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'].includes(ext);
};

export const isDocument = (item: FileItem): boolean => {
  const ext = (item.extension || '').toLowerCase();
  return item.category === 'DOCS' || ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'odt'].includes(ext);
};

export const isAnimeExplicit = (item: FileItem): boolean => {
  const n = (item.name || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  return tags.includes('#anime') ||
    /(anime|manga|waifu|genshin|honkai|zenless|otaku|chibi|naruto|onepiece|jujutsu|bleach)/i.test(n);
};

// ============================================================================
// HIGH PERFORMANCE SINGLE-PASS ITEM ANALYZER (O(N) PASS WITH WEAKMAP CACHING)
// ============================================================================

interface AnalysisBuckets {
  gameBuckets: Map<string, FileItem[]>;
  langBuckets: Map<string, FileItem[]>;
  financeItems: FileItem[];
  snipItems: FileItem[];
  wallItems: FileItem[];
  uiItems: FileItem[];
  domainGroups: Map<string, { label: string; emoji: string; items: FileItem[] }>;
  archiveItems: FileItem[];
  docItems: FileItem[];
  extMap: Map<string, FileItem[]>;
  totalBytes: number;
}

const analysisCache = new WeakMap<FileItem[], AnalysisBuckets>();

function analyzeItemsOnce(items: FileItem[]): AnalysisBuckets {
  const cached = analysisCache.get(items);
  if (cached) return cached;

  const gameBuckets = new Map<string, FileItem[]>();
  const langBuckets = new Map<string, FileItem[]>();
  const financeItems: FileItem[] = [];
  const snipItems: FileItem[] = [];
  const wallItems: FileItem[] = [];
  const uiItems: FileItem[] = [];
  const domainGroups = new Map<string, { label: string; emoji: string; items: FileItem[] }>();
  const archiveItems: FileItem[] = [];
  const docItems: FileItem[] = [];
  const extMap = new Map<string, FileItem[]>();
  let totalBytes = 0;

  const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst']);
  const DOC_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'odt']);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ext = (item.extension || '').toLowerCase().replace('.', '');
    const cat = item.category || '';
    const isDev = cat === 'DEV';
    const isMedia = GAME_MEDIA_EXTS.has(ext) && !isDev;
    totalBytes += (item.size || 0);

    // Extension bucket
    if (!extMap.has(ext)) extMap.set(ext, []);
    extMap.get(ext)!.push(item);

    // Game (strictly media, never code)
    if (isMedia) {
      const g = detectGameKB(item);
      if (g) {
        if (!gameBuckets.has(g.id)) gameBuckets.set(g.id, []);
        gameBuckets.get(g.id)!.push(item);
      }
    }

    // Dev language (O(1) lookup)
    const lang = detectDevLanguageKB(item);
    if (lang) {
      if (!langBuckets.has(lang.id)) langBuckets.set(lang.id, []);
      langBuckets.get(lang.id)!.push(item);
    }

    // Finance
    const isFin = isInvoiceOrFinance(item);
    if (isFin) {
      financeItems.push(item);
    }

    // Screenshot
    if (isWindowsScreenshot(item)) {
      snipItems.push(item);
    }

    // Wallpapers
    if (isWallpaperOrArt(item)) {
      wallItems.push(item);
    }

    // UI assets
    if (isUiOrIcon(item)) {
      uiItems.push(item);
    }

    // Archetypes domain
    const arch = detectArchetypeKB(ext);
    if (arch && arch.domain !== 'Grafika & Foto') {
      if (!domainGroups.has(arch.domain)) {
        domainGroups.set(arch.domain, { label: arch.domain, emoji: arch.emoji, items: [] });
      }
      domainGroups.get(arch.domain)!.items.push(item);
    }

    // Archives
    if (cat === 'ARCHIVES' || ARCHIVE_EXTS.has(ext)) {
      archiveItems.push(item);
    }

    // Documents
    if ((cat === 'DOCS' || DOC_EXTS.has(ext)) && !isFin) {
      docItems.push(item);
    }
  }

  const buckets: AnalysisBuckets = {
    gameBuckets,
    langBuckets,
    financeItems,
    snipItems,
    wallItems,
    uiItems,
    domainGroups,
    archiveItems,
    docItems,
    extMap,
    totalBytes: Math.max(1, totalBytes)
  };

  analysisCache.set(items, buckets);
  return buckets;
}

// ============================================================================
// DYNAMIC CATEGORIES FOR SIDEBAR (INSTANT O(N) RENDERING)
// ============================================================================

export function buildDynamicCategories(items: FileItem[]): DynamicCategory[] {
  if (!items || items.length === 0) return [];
  const buckets = analyzeItemsOnce(items);
  const result: DynamicCategory[] = [];

  // 1. Games (from map)
  for (const game of GAMES_DATABASE) {
    const matched = buckets.gameBuckets.get(game.id);
    if (matched && matched.length > 0) {
      result.push({
        id: `game_${game.id}`,
        label: game.name,
        shortTag: game.emoji,
        emoji: game.emoji,
        iconType: 'emoji',
        badgeBg: game.badgeBg,
        badgeText: game.badgeText,
        badgeBorder: game.badgeBorder,
        count: matched.length,
        items: matched,
        filter: (i) => {
          const ext = (i.extension || '').toLowerCase().replace('.', '');
          return GAME_MEDIA_EXTS.has(ext) && i.category !== 'DEV' && detectGameKB(i)?.id === game.id;
        }
      });
    }
  }

  // 2. Dev languages (from map)
  for (const lang of DEV_LANGUAGES_DATABASE) {
    const matched = buckets.langBuckets.get(lang.id);
    if (matched && matched.length > 0) {
      result.push({
        id: `lang_${lang.id}`,
        label: lang.name,
        shortTag: lang.shortTag,
        emoji: lang.emoji,
        iconType: 'badge',
        badgeBg: lang.badgeBg,
        badgeText: lang.badgeText,
        badgeBorder: lang.badgeBorder,
        count: matched.length,
        items: matched,
        filter: (i) => detectDevLanguageKB(i)?.id === lang.id
      });
    }
  }

  // 3. Finance
  if (buckets.financeItems.length > 0) {
    result.push({
      id: 'faktury',
      label: 'Faktury & Finanse (VAT)',
      shortTag: '🧾',
      emoji: '🧾',
      iconType: 'emoji',
      badgeBg: 'bg-emerald-500/20',
      badgeText: 'text-emerald-400',
      badgeBorder: 'border-emerald-500/30',
      count: buckets.financeItems.length,
      items: buckets.financeItems,
      filter: isInvoiceOrFinance
    });
  }

  // 4. Windows Screenshots
  if (buckets.snipItems.length > 0) {
    result.push({
      id: 'screenshots',
      label: 'Zrzuty Ekranu Windows',
      shortTag: '⚡',
      emoji: '⚡',
      iconType: 'emoji',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-400',
      badgeBorder: 'border-amber-500/30',
      count: buckets.snipItems.length,
      items: buckets.snipItems,
      filter: isWindowsScreenshot
    });
  }

  // 5. Wallpapers
  if (buckets.wallItems.length > 0) {
    result.push({
      id: 'wallpapers',
      label: 'Tapety & Grafiki HD',
      shortTag: '🌄',
      emoji: '🌄',
      iconType: 'emoji',
      badgeBg: 'bg-pink-500/20',
      badgeText: 'text-pink-400',
      badgeBorder: 'border-pink-500/30',
      count: buckets.wallItems.length,
      items: buckets.wallItems,
      filter: isWallpaperOrArt
    });
  }

  // 6. UI & Icons
  if (buckets.uiItems.length > 0) {
    result.push({
      id: 'ui_assets',
      label: 'UI & Assety Wektorowe',
      shortTag: '🎨',
      emoji: '🎨',
      iconType: 'emoji',
      badgeBg: 'bg-teal-500/20',
      badgeText: 'text-teal-400',
      badgeBorder: 'border-teal-500/30',
      count: buckets.uiItems.length,
      items: buckets.uiItems,
      filter: isUiOrIcon
    });
  }

  // 7. Domain groups
  for (const [domainName, group] of buckets.domainGroups.entries()) {
    if (group.items.length > 0 && !result.some(r => r.label.includes(domainName))) {
      result.push({
        id: `arch_${domainName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        label: group.label,
        shortTag: group.emoji,
        emoji: group.emoji,
        iconType: 'emoji',
        badgeBg: 'bg-indigo-500/20',
        badgeText: 'text-indigo-400',
        badgeBorder: 'border-indigo-500/30',
        count: group.items.length,
        items: group.items,
        filter: (i) => detectArchetypeKB(i.extension)?.domain === domainName
      });
    }
  }

  // 8. Archives
  if (buckets.archiveItems.length > 0 && !result.some(r => r.id === 'zip')) {
    result.push({
      id: 'zip',
      label: 'Archiwa .ZIP & Paczki',
      shortTag: 'ZIP',
      iconType: 'badge',
      badgeBg: 'bg-yellow-500/20',
      badgeText: 'text-yellow-400',
      badgeBorder: 'border-yellow-500/30',
      count: buckets.archiveItems.length,
      items: buckets.archiveItems,
      filter: isArchive
    });
  }

  // 9. Documents
  if (buckets.docItems.length > 0 && !result.some(r => r.id === 'documents')) {
    result.push({
      id: 'documents',
      label: 'Dokumenty & Raporty',
      shortTag: '📄',
      emoji: '📄',
      iconType: 'emoji',
      badgeBg: 'bg-emerald-500/20',
      badgeText: 'text-emerald-400',
      badgeBorder: 'border-emerald-500/30',
      count: buckets.docItems.length,
      items: buckets.docItems,
      filter: (i) => isDocument(i) && !isInvoiceOrFinance(i)
    });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

// ============================================================================
// TOP 5 SMART CLUSTERS FOR HORIZONTAL CARDS (INSTANT O(N) RENDERING)
// ============================================================================

export function buildSmartClusterCards(items: FileItem[]): SmartClusterCard[] {
  if (!items || items.length === 0) {
    return [];
  }

  const buckets = analyzeItemsOnce(items);
  const totalBytes = buckets.totalBytes;

  const formatWeight = (bytes: number): string => formatBytesCompact(bytes);

  const candidateCards: {
    id: string;
    title: string;
    emoji: string;
    subtitle: string;
    barGradient: string;
    hoverColor: string;
    previewType: 'IMAGE_COLLAGE' | 'CODE_SNIPPET' | 'ARCHIVE_LIST' | 'DOC_LIST' | 'GENERIC';
    codeSnippet?: { file: string; lines: string[]; lang: string };
    filter: (item: FileItem) => boolean;
    count: number;
    items: FileItem[];
    bytes: number;
    priority: number;
  }[] = [];

  // Check 50+ Games from precomputed map
  for (const game of GAMES_DATABASE) {
    const matched = buckets.gameBuckets.get(game.id);
    if (matched && matched.length > 0) {
      const bytes = matched.reduce((a, f) => a + (f.size || 0), 0);
      const isAllPng = matched.every(m => (m.extension || '').toLowerCase() === 'png');
      candidateCards.push({
        id: `game_${game.id}`,
        title: game.name,
        emoji: game.emoji,
        subtitle: isAllPng ? `${matched.length} zrzutów PNG z gry` : `${matched.length} zrzutów / fotek z gry`,
        barGradient: 'from-orange-500 to-amber-500',
        hoverColor: 'group-hover:text-orange-400',
        previewType: 'IMAGE_COLLAGE',
        filter: (i) => {
          const ext = (i.extension || '').toLowerCase().replace('.', '');
          return GAME_MEDIA_EXTS.has(ext) && i.category !== 'DEV' && detectGameKB(i)?.id === game.id;
        },
        count: matched.length,
        items: matched,
        bytes,
        priority: 100
      });
    }
  }

  // Check 50+ Dev Languages from precomputed map
  for (const lang of DEV_LANGUAGES_DATABASE) {
    const matched = buckets.langBuckets.get(lang.id);
    if (matched && matched.length > 0) {
      const bytes = matched.reduce((a, f) => a + (f.size || 0), 0);
      const first = matched[0];
      candidateCards.push({
        id: `lang_${lang.id}`,
        title: `${lang.name} (Kod)`,
        emoji: lang.emoji,
        subtitle: `${matched.length} plików źródłowych .${lang.shortTag}`,
        barGradient: 'from-blue-500 to-indigo-600',
        hoverColor: 'group-hover:text-blue-400',
        previewType: 'CODE_SNIPPET',
        codeSnippet: {
          file: first.name,
          lines: [
            `// ${first.name} • ${lang.name}`,
            `export const config = {`,
            `  lang: "${lang.id}",`,
            `  filesCount: ${matched.length}`,
            `};`
          ],
          lang: lang.shortTag.toLowerCase()
        },
        filter: (i) => detectDevLanguageKB(i)?.id === lang.id,
        count: matched.length,
        items: matched,
        bytes,
        priority: 90
      });
    }
  }

  // Invoices & Finance
  if (buckets.financeItems.length > 0) {
    const bytes = buckets.financeItems.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'faktury',
      title: 'Faktury & Finanse (VAT)',
      emoji: '🧾',
      subtitle: `${buckets.financeItems.length} faktur i rozliczeń`,
      barGradient: 'from-emerald-500 to-teal-500',
      hoverColor: 'group-hover:text-emerald-400',
      previewType: 'DOC_LIST',
      filter: isInvoiceOrFinance,
      count: buckets.financeItems.length,
      items: buckets.financeItems,
      bytes,
      priority: 85
    });
  }

  // Windows Screenshots & Snips
  if (buckets.snipItems.length > 0) {
    const bytes = buckets.snipItems.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'screenshots',
      title: 'Zrzuty Ekranu Windows',
      emoji: '⚡',
      subtitle: `${buckets.snipItems.length} wycinków ekranu`,
      barGradient: 'from-amber-400 to-orange-500',
      hoverColor: 'group-hover:text-amber-400',
      previewType: 'IMAGE_COLLAGE',
      filter: isWindowsScreenshot,
      count: buckets.snipItems.length,
      items: buckets.snipItems,
      bytes,
      priority: 80
    });
  }

  // Wallpapers & High-Res Art
  if (buckets.wallItems.length > 0) {
    const bytes = buckets.wallItems.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'wallpapers',
      title: 'Tapety & Grafiki HD',
      emoji: '🌄',
      subtitle: `${buckets.wallItems.length} tapet 1080p / 4K`,
      barGradient: 'from-pink-500 to-rose-500',
      hoverColor: 'group-hover:text-pink-400',
      previewType: 'IMAGE_COLLAGE',
      filter: isWallpaperOrArt,
      count: buckets.wallItems.length,
      items: buckets.wallItems,
      bytes,
      priority: 75
    });
  }

  // UI Assets & Vector
  if (buckets.uiItems.length > 0) {
    const bytes = buckets.uiItems.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'ui_assets',
      title: 'UI & Ikony SVG',
      emoji: '🎨',
      subtitle: `${buckets.uiItems.length} wektorów i grafik UI`,
      barGradient: 'from-teal-400 to-cyan-500',
      hoverColor: 'group-hover:text-teal-400',
      previewType: 'IMAGE_COLLAGE',
      filter: isUiOrIcon,
      count: buckets.uiItems.length,
      items: buckets.uiItems,
      bytes,
      priority: 70
    });
  }

  // Archives
  if (buckets.archiveItems.length > 0) {
    const bytes = buckets.archiveItems.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'zip',
      title: 'Archiwa .ZIP & Paczki',
      emoji: '📦',
      subtitle: `${buckets.archiveItems.length} spakowanych paczek`,
      barGradient: 'from-yellow-400 to-amber-500',
      hoverColor: 'group-hover:text-yellow-400',
      previewType: 'ARCHIVE_LIST',
      filter: isArchive,
      count: buckets.archiveItems.length,
      items: buckets.archiveItems,
      bytes,
      priority: 65
    });
  }

  // 3D & CAD Models
  const threeD = buckets.domainGroups.get('3D & CAD')?.items || [];
  if (threeD.length > 0) {
    const bytes = threeD.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: '3d_cad',
      title: 'Modele 3D & CAD',
      emoji: '🧊',
      subtitle: `${threeD.length} modeli 3D i scen`,
      barGradient: 'from-indigo-500 to-blue-600',
      hoverColor: 'group-hover:text-indigo-400',
      previewType: 'GENERIC',
      filter: (i) => detectArchetypeKB(i.extension)?.domain === '3D & CAD',
      count: threeD.length,
      items: threeD,
      bytes,
      priority: 60
    });
  }

  // Audio & Music Production
  const audio = buckets.domainGroups.get('Audio & Music')?.items || [];
  if (audio.length > 0) {
    const bytes = audio.reduce((a, f) => a + (f.size || 0), 0);
    candidateCards.push({
      id: 'audio_music',
      title: 'Audio & Produkcja Muzyczna',
      emoji: '🎧',
      subtitle: `${audio.length} ścieżek i projektów audio`,
      barGradient: 'from-purple-500 to-pink-500',
      hoverColor: 'group-hover:text-purple-400',
      previewType: 'GENERIC',
      filter: (i) => detectArchetypeKB(i.extension)?.domain === 'Audio & Music',
      count: audio.length,
      items: audio,
      bytes,
      priority: 60
    });
  }

  // Sort candidate cards by count and priority
  candidateCards.sort((a, b) => {
    if (Math.abs(a.count - b.count) > 15) {
      return b.count - a.count;
    }
    return (b.priority * 10 + b.count) - (a.priority * 10 + a.count);
  });

  // Pick top 5 dominant cards
  const topCards = candidateCards.slice(0, 5);

  // If still fewer than 3 clusters, group by primary file extension
  if (topCards.length < 3 && items.length > 0) {
    const extSorted = Array.from(buckets.extMap.entries())
      .filter(([ext]) => !topCards.some(tc => tc.id.includes(ext)))
      .sort((a, b) => b[1].length - a[1].length);

    for (const [ext, extItems] of extSorted) {
      if (topCards.length >= 5) break;
      const bytes = extItems.reduce((acc, f) => acc + (f.size || 0), 0);
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext);
      topCards.push({
        id: `ext_${ext}`,
        title: `Pliki .${ext.toUpperCase()}`,
        emoji: isImg ? '🖼️' : ext === 'pdf' ? '📄' : '📁',
        subtitle: `${extItems.length} plików .${ext}`,
        barGradient: 'from-blue-500 to-cyan-500',
        hoverColor: 'group-hover:text-blue-400',
        previewType: isImg ? 'IMAGE_COLLAGE' : 'GENERIC',
        filter: (i) => (i.extension || '').toLowerCase() === ext,
        count: extItems.length,
        items: extItems,
        bytes,
        priority: 10
      });
    }
  }

  return topCards.map(c => ({
    id: c.id,
    title: c.title,
    emoji: c.emoji,
    subtitle: c.subtitle,
    count: c.count,
    totalBytes: c.bytes,
    weightLabel: formatWeight(c.bytes),
    percent: Math.max(5, Math.min(100, Math.round((c.bytes / totalBytes) * 100))),
    barGradient: c.barGradient,
    hoverColor: c.hoverColor,
    sample: c.items.slice(0, 6),
    previewType: c.previewType,
    codeSnippet: c.codeSnippet,
    filter: c.filter
  }));
}
