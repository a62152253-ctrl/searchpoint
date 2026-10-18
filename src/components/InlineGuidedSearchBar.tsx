import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  ArrowRight, 
  RotateCcw, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  X,
  Bot,
  Terminal,
  CheckCircle2,
  GitBranch,
  Code2,
  Loader2,
  Clock,
  Play,
  SlidersHorizontal,
  SkipForward,
  Check,
  FileText,
  Image as ImageIcon,
  FolderArchive,
  Layers
} from 'lucide-react';
import { nexusApi } from '../utils/nexusAuth';

interface QuestionOption {
  value: string;
  label: string;
  subtitle?: string;
  emoji?: string;
  accent?: string;
  count: number;
  sampleNames?: string[];
}

interface NextQuestion {
  id: string;
  title: string;
  subtitle: string;
  stepIndex?: number;
  options: QuestionOption[];
}

export interface GuidedCandidateFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  size: number;
  mtime?: number;
  category?: string;
  tags?: string[];
}

interface InlineGuidedSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  answers: Record<string, string>;
  onAnswersChange: (ans: Record<string, string>) => void;
  totalIndexed: number;
  totalMatches: number;
  domain?: string;
  isFinished?: boolean;
  nextQuestion: NextQuestion | null;
  history: { id: string; label: string; count: number }[];
  onHistoryChange: (hist: { id: string; label: string; count: number }[]) => void;
  onReset: () => void;
  activeTags: string[];
  onRemoveTag: (tag: string) => void;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
  candidateFiles?: GuidedCandidateFile[];
  onSelectFile?: (file: any) => void;
}

type GuidedDomainMode = 'AUTO' | 'CODE' | 'IMAGE' | 'DOCS' | 'ARCHIVE';

const CODE_EXT_SET = new Set([
  'tsx', 'ts', 'jsx', 'js', 'cjs', 'mjs', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'cs', 'java', 'html', 'css', 'scss', 'sql', 'sh', 'bat', 'cmd', 'ps1', 'yml', 'yaml'
]);
const IMAGE_EXT_SET = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'mp4', 'webm', 'mov'
]);
const DOC_EXT_SET = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'rtf', 'odt'
]);
const ARCHIVE_EXT_SET = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'
]);

function extractFileYear(file: GuidedCandidateFile): string {
  const match = file.name.match(/(20[1-3]\d)/);
  if (match) return match[1];
  if (file.mtime && file.mtime > 0) return new Date(file.mtime).getFullYear().toString();
  return '2025';
}

export const InlineGuidedSearchBar: React.FC<InlineGuidedSearchBarProps> = ({
  query,
  onQueryChange,
  answers,
  onAnswersChange,
  totalIndexed,
  totalMatches,
  domain = 'GENERAL',
  isFinished = false,
  nextQuestion: serverNextQuestion,
  history,
  onHistoryChange,
  onReset,
  activeTags,
  onRemoveTag,
  workspacePath,
  onOpenFile,
  candidateFiles = [],
  onSelectFile
}) => {
  const [isRibbonOpen, setIsRibbonOpen] = useState(true);
  const [domainMode, setDomainMode] = useState<GuidedDomainMode>('AUTO');

  // Natural Language AI Agent Command Execution State
  const [isAgentExecuting, setIsAgentExecuting] = useState(false);
  const [agentResult, setAgentResult] = useState<any>(null);
  const [actionHistory, setActionHistory] = useState<{ id: string; time: string; action: string; query: string; success?: boolean }[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeReport, setOrganizeReport] = useState<any>(null);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [showProposalDetails, setShowProposalDetails] = useState(false);

  // Detect whether current query is a natural agent command or simple filter
  const isCommandIntent = /^(?:find|search|szukaj|znajdź|locate|open|grep|pokaż|pokaz|run\s+test|test|typecheck|check|git|status|explain|fix|analyze|co\s+jest|dlaczego|posprzątaj|posprzataj|uporządkuj|uporzadkuj|clean|organize|baza\s+danych|database)\b/i.test(query.trim());

  // Compute domain breakdown from candidateFiles
  const poolBreakdown = useMemo(() => {
    let code = 0;
    let image = 0;
    let docs = 0;
    let archive = 0;
    for (const f of candidateFiles) {
      const ext = (f.extension || '').toLowerCase();
      if (CODE_EXT_SET.has(ext)) code++;
      else if (IMAGE_EXT_SET.has(ext)) image++;
      else if (DOC_EXT_SET.has(ext)) docs++;
      else if (ARCHIVE_EXT_SET.has(ext)) archive++;
    }
    return { code, image, docs, archive, total: candidateFiles.length };
  }, [candidateFiles]);

  // Determine effective domain
  const effectiveDomain = useMemo<'CODE' | 'IMAGE' | 'DOCS' | 'ARCHIVE'>(() => {
    if (domainMode !== 'AUTO') return domainMode;
    if (answers.domain_scope === 'code') return 'CODE';
    if (answers.domain_scope === 'image') return 'IMAGE';
    if (answers.domain_scope === 'docs') return 'DOCS';
    if (answers.domain_scope === 'archive') return 'ARCHIVE';

    const q = query.toLowerCase();
    if (/kod|funkcj|recovery|login|auth|react|typescript|python|rust|skrypt|component|api|sql|baza|database|sqlite|ts|js/i.test(q)) {
      return 'CODE';
    }
    if (/faktur|umow|raport|notatk|pdf|docx|dokument|tekst|csv/i.test(q)) {
      return 'DOCS';
    }
    if (/zip|rar|7z|archiw|paczka/i.test(q)) {
      return 'ARCHIVE';
    }
    if (/anime|girl|waifu|tapet|art|rysunk|kolor|png|jpg|gif|obraz|zdjecie|screen|zrzut/i.test(q)) {
      return 'IMAGE';
    }

    if (candidateFiles.length > 0) {
      const { code, image, docs, archive } = poolBreakdown;
      const max = Math.max(code, image, docs, archive);
      if (max > 0) {
        if (image === max) return 'IMAGE';
        if (code === max) return 'CODE';
        if (docs === max) return 'DOCS';
        if (archive === max) return 'ARCHIVE';
      }
    }

    if (domain === 'CODE' || domain === 'DOCS' || domain === 'ARCHIVE' || domain === 'IMAGE') {
      return domain;
    }
    return 'CODE';
  }, [domainMode, answers.domain_scope, query, candidateFiles.length, poolBreakdown, domain]);

  // Step definitions per domain for the 5-step visual stepper
  const stepDefinitions = useMemo(() => {
    if (effectiveDomain === 'CODE') {
      return [
        { id: 'format', shortLabel: 'Język / Stack' },
        { id: 'code_domain', shortLabel: 'Obszar Logiki' },
        { id: 'code_type', shortLabel: 'Rola w Projekcie' },
        { id: 'year', shortLabel: 'Rocznik' },
        { id: 'location', shortLabel: 'Lokalizacja' }
      ];
    }
    if (effectiveDomain === 'DOCS') {
      return [
        { id: 'format', shortLabel: 'Format Pliku' },
        { id: 'doc_type', shortLabel: 'Typ Dokumentu' },
        { id: 'size_tier', shortLabel: 'Rozmiar' },
        { id: 'year', shortLabel: 'Rocznik' },
        { id: 'location', shortLabel: 'Lokalizacja' }
      ];
    }
    if (effectiveDomain === 'ARCHIVE') {
      return [
        { id: 'format', shortLabel: 'Typ Archiwum' },
        { id: 'size_tier', shortLabel: 'Rozmiar Paczki' },
        { id: 'year', shortLabel: 'Rocznik' },
        { id: 'location', shortLabel: 'Lokalizacja' },
        { id: 'domain_scope', shortLabel: 'Zakres' }
      ];
    }
    // IMAGE / MEDIA default
    return [
      { id: 'format', shortLabel: 'Format Obrazu' },
      { id: 'orientation', shortLabel: 'Kadr / Proporcje' },
      { id: 'color', shortLabel: 'Tonacja / Styl' },
      { id: 'year', shortLabel: 'Rocznik' },
      { id: 'location', shortLabel: 'Lokalizacja' }
    ];
  }, [effectiveDomain]);

  // Build smart client-side question with 100% accurate live counts from candidateFiles
  const activeQuestion = useMemo<NextQuestion | null>(() => {
    if (candidateFiles.length === 0) {
      return serverNextQuestion;
    }

    const pool = candidateFiles;
    const sampleFor = (predicate: (f: GuidedCandidateFile) => boolean) => {
      const matched = pool.filter(predicate);
      return {
        count: matched.length,
        sampleNames: matched.slice(0, 2).map(m => m.name)
      };
    };

    const buildYearOpts = (): QuestionOption[] => {
      const yearMap = new Map<string, GuidedCandidateFile[]>();
      for (const f of pool) {
        const yr = extractFileYear(f);
        const arr = yearMap.get(yr) || [];
        arr.push(f);
        yearMap.set(yr, arr);
      }
      const sorted = Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      return [
        ...sorted.slice(0, 3).map(([yr, list]) => ({
          value: yr,
          emoji: '📅',
          label: `Rocznik ${yr}`,
          subtitle: `Pliki utworzone lub zmodyfikowane w ${yr} r.`,
          accent: 'blue',
          count: list.length,
          sampleNames: list.slice(0, 2).map(x => x.name)
        })),
        {
          value: 'any',
          emoji: '✨',
          label: 'Dowolny okres',
          subtitle: 'Nie ograniczaj według daty modyfikacji',
          accent: 'purple',
          count: pool.length
        }
      ];
    };

    const buildLocationQuestion = (): NextQuestion => {
      const dl = sampleFor(f => /downloads|pobrane/i.test(f.path));
      const dt = sampleFor(f => /desktop|pulpit/i.test(f.path));
      const pic = sampleFor(f => /pictures|obrazy/i.test(f.path));
      const prj = sampleFor(f => /project|code|src|repo/i.test(f.path));
      return {
        id: 'location',
        title: 'Gdzie na dysku znajduje się szukany plik?',
        subtitle: 'Zawęź wyniki do konkretnego folderu systemowego lub projektowego',
        options: [
          {
            value: 'downloads',
            emoji: '📥',
            label: 'Pobrane (Downloads)',
            subtitle: 'Główny bufor pobranych plików i paczek',
            accent: 'emerald',
            count: dl.count,
            sampleNames: dl.sampleNames
          },
          {
            value: 'desktop',
            emoji: '🖥️',
            label: 'Pulpit (Desktop)',
            subtitle: 'Podręczne pliki i zrzuty z pulpitu',
            accent: 'blue',
            count: dt.count,
            sampleNames: dt.sampleNames
          },
          {
            value: 'pictures',
            emoji: '🖼️',
            label: 'Obrazy (Pictures)',
            subtitle: 'Kolekcje grafik, tapet i zrzutów ekranu',
            accent: 'purple',
            count: pic.count,
            sampleNames: pic.sampleNames
          },
          {
            value: 'projects',
            emoji: '💼',
            label: 'Projekty & Kod (src / repo)',
            subtitle: 'Katalogi źródeł i repozytoria deweloperskie',
            accent: 'amber',
            count: prj.count,
            sampleNames: prj.sampleNames
          },
          {
            value: 'any',
            emoji: '✨',
            label: 'Dowolna lokalizacja',
            subtitle: 'Przeszukaj wszystkie podkatalogi',
            accent: 'purple',
            count: pool.length
          }
        ].filter(o => o.count > 0 || o.value === 'any')
      };
    };

    if (effectiveDomain === 'CODE') {
      if (!answers.format) {
        const ts = sampleFor(f => ['ts', 'tsx'].includes((f.extension || '').toLowerCase()));
        const js = sampleFor(f => ['js', 'jsx', 'cjs', 'mjs'].includes((f.extension || '').toLowerCase()));
        const py = sampleFor(f => (f.extension || '').toLowerCase() === 'py');
        const web = sampleFor(f => ['html', 'css', 'scss', 'json', 'yml', 'yaml', 'sql'].includes((f.extension || '').toLowerCase()));
        const rs = sampleFor(f => ['rs', 'go', 'cpp', 'c', 'cs'].includes((f.extension || '').toLowerCase()));
        const allCode = sampleFor(f => CODE_EXT_SET.has((f.extension || '').toLowerCase()));

        return {
          id: 'format',
          title: 'W jakim języku / ekosystemie jest szukany kod?',
          subtitle: 'Wybierz technologię lub ogranicz widok wyłącznie do plików źródłowych',
          options: [
            {
              value: 'ts',
              emoji: '🔷',
              label: 'TypeScript / TSX',
              subtitle: 'React, Next.js, komponenty i typy statyczne',
              accent: 'blue',
              count: ts.count,
              sampleNames: ts.sampleNames
            },
            {
              value: 'js',
              emoji: '🟨',
              label: 'JavaScript / Node.js',
              subtitle: 'Skrypty JS, Express, moduły CJS / ESM',
              accent: 'amber',
              count: js.count,
              sampleNames: js.sampleNames
            },
            {
              value: 'py',
              emoji: '🐍',
              label: 'Python (.py)',
              subtitle: 'Skrypty AI, automatyzacja, backend i analiza',
              accent: 'emerald',
              count: py.count,
              sampleNames: py.sampleNames
            },
            {
              value: 'web',
              emoji: '🌐',
              label: 'Web / Config (JSON, CSS, HTML)',
              subtitle: 'Style, manifesty, konfiguracje i schematy SQL',
              accent: 'purple',
              count: web.count,
              sampleNames: web.sampleNames
            },
            ...(rs.count > 0 ? [{
              value: 'rs',
              emoji: '🦀',
              label: 'Systemowe (Rust / C++ / Go)',
              subtitle: 'Moduły natywne i kompilowane',
              accent: 'rose',
              count: rs.count,
              sampleNames: rs.sampleNames
            }] : []),
            {
              value: allCode.count < pool.length && allCode.count > 0 ? 'code_all' : 'any',
              emoji: '✨',
              label: allCode.count < pool.length && allCode.count > 0 ? 'Wszystkie pliki kodu' : 'Dowolny język / Pomiń',
              subtitle: allCode.count < pool.length && allCode.count > 0
                ? `Odfiltruj tylko pliki kodu (${allCode.count} z ${pool.length})`
                : 'Zachowaj całą bieżącą pulę plików',
              accent: 'purple',
              count: allCode.count < pool.length && allCode.count > 0 ? allCode.count : pool.length
            }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }

      if (!answers.code_domain) {
        const matchDomain = (regex: RegExp) => sampleFor(f => {
          const safePath = (f.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          return regex.test(`${f.name} ${safePath}`.toLowerCase());
        });
        const auth = matchDomain(/auth|login|recovery|session|token|passwd|haslo|\buser\b|security|shield|vault/i);
        const api = matchDomain(/api|route|controller|handler|endpoint|server|fetch|socket|ws/i);
        const ui = matchDomain(/component|view|modal|page|drawer|button|\bui\b|dashboard|hub|website|css|style/i);
        const db = matchDomain(/db|database|sql|model|schema|prisma|postgres|data_store|store|cache|index|scanner/i);

        return {
          id: 'code_domain',
          title: 'Jakiego obszaru architektury dotyczy ten plik?',
          subtitle: 'Zawęź według roli modułu (np. autoryzacja, serwer API, interfejs UI, baza danych)',
          options: [
            {
              value: 'ui',
              emoji: '🎨',
              label: 'Komponenty UI & Widoki',
              subtitle: 'Modale, dashboard, nawigacja i style',
              accent: 'purple',
              count: ui.count,
              sampleNames: ui.sampleNames
            },
            {
              value: 'api',
              emoji: '🌐',
              label: 'Serwer, API & Routing',
              subtitle: 'Endpointy HTTP, WebSockets i kontrolery',
              accent: 'blue',
              count: api.count,
              sampleNames: api.sampleNames
            },
            {
              value: 'auth',
              emoji: '🔐',
              label: 'Bezpieczeństwo, Auth & Tarcza',
              subtitle: 'Logowanie, sesje, klucze .searched i ochrona',
              accent: 'emerald',
              count: auth.count,
              sampleNames: auth.sampleNames
            },
            {
              value: 'db',
              emoji: '🗄️',
              label: 'Indeks, Baza Danych & Skaner',
              subtitle: 'SQLite, cache pamięci, indeksowanie i modele',
              accent: 'amber',
              count: db.count,
              sampleNames: db.sampleNames
            },
            {
              value: 'any',
              emoji: '✨',
              label: 'Dowolny obszar logiki',
              subtitle: 'Pokaż moduły ze wszystkich warstw',
              accent: 'purple',
              count: pool.length
            }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }

      if (!answers.code_type) {
        const matchType = (type: 'source' | 'test' | 'types' | 'config') => sampleFor(f => {
          const safePath = (f.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          const text = `${f.name} ${safePath}`.toLowerCase();
          if (type === 'source') return !text.includes('test') && !text.includes('.d.ts') && !text.includes('config');
          if (type === 'test') return text.includes('test') || text.includes('spec');
          if (type === 'types') return text.includes('types') || text.includes('.d.ts') || text.includes('interface');
          if (type === 'config') return /config|rc|json|yaml|webpack|vite|package|tsconfig/i.test(text);
          return true;
        });

        const src = matchType('source');
        const tst = matchType('test');
        const typ = matchType('types');
        const cfg = matchType('config');

        return {
          id: 'code_type',
          title: 'Jaki rodzaj pliku w strukturze projektu?',
          subtitle: 'Oddziel główny kod produkcyjny od konfiguracji i testów',
          options: [
            {
              value: 'source',
              emoji: '⚡',
              label: 'Główny kod źródłowy',
              subtitle: 'Implementacja logiki i komponentów',
              accent: 'purple',
              count: src.count,
              sampleNames: src.sampleNames
            },
            {
              value: 'config',
              emoji: '⚙️',
              label: 'Konfiguracja projektu',
              subtitle: 'Pliki package.json, tsconfig, vite, env',
              accent: 'amber',
              count: cfg.count,
              sampleNames: cfg.sampleNames
            },
            {
              value: 'test',
              emoji: '🧪',
              label: 'Testy i weryfikacja',
              subtitle: 'Testy jednostkowe i integracyjne (spec / test)',
              accent: 'emerald',
              count: tst.count,
              sampleNames: tst.sampleNames
            },
            {
              value: 'types',
              emoji: '📐',
              label: 'Definicje typów (.d.ts)',
              subtitle: 'Kontrakty danych i interfejsy TS',
              accent: 'blue',
              count: typ.count,
              sampleNames: typ.sampleNames
            },
            {
              value: 'any',
              emoji: '✨',
              label: 'Wszystkie rodzaje plików',
              subtitle: 'Bez filtrowania roli pliku',
              accent: 'purple',
              count: pool.length
            }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }

      if (!answers.year) {
        return {
          id: 'year',
          title: 'Z którego rocznika pochodzi szukany kod?',
          subtitle: 'Wybierz rok ostatniej modyfikacji lub utworzenia pliku',
          options: buildYearOpts()
        };
      }

      if (!answers.location) {
        return buildLocationQuestion();
      }
    } else if (effectiveDomain === 'DOCS') {
      if (!answers.format) {
        const pdf = sampleFor(f => (f.extension || '').toLowerCase() === 'pdf');
        const docx = sampleFor(f => ['doc', 'docx', 'rtf', 'odt'].includes((f.extension || '').toLowerCase()));
        const md = sampleFor(f => ['md', 'txt', 'csv', 'xlsx', 'xls'].includes((f.extension || '').toLowerCase()));
        return {
          id: 'format',
          title: 'W jakim formacie zapisany jest dokument?',
          subtitle: 'Wybierz rodzaj pliku tekstowego lub arkusza',
          options: [
            {
              value: 'pdf',
              emoji: '📕',
              label: 'Dokumenty PDF',
              subtitle: 'Faktury, raporty, e-booki i oficjalne pisma',
              accent: 'rose',
              count: pdf.count,
              sampleNames: pdf.sampleNames
            },
            {
              value: 'docx',
              emoji: '📘',
              label: 'Dokumenty Word (.docx / .doc)',
              subtitle: 'Umowy, pisma edytowalne i dokumentacja',
              accent: 'blue',
              count: docx.count,
              sampleNames: docx.sampleNames
            },
            {
              value: 'md',
              emoji: '📝',
              label: 'Notatki & Dane (MD, TXT, CSV, XLSX)',
              subtitle: 'Pliki tekstowe, README oraz arkusze kalkulacyjne',
              accent: 'emerald',
              count: md.count,
              sampleNames: md.sampleNames
            },
            {
              value: 'any',
              emoji: '✨',
              label: 'Dowolny format dokumentu',
              subtitle: 'Pokaż wszystkie formaty tekstowe',
              accent: 'purple',
              count: pool.length
            }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.doc_type) {
        const inv = sampleFor(f => /faktura|invoice|vat|rachunek|paragon/i.test(`${f.name} ${f.path}`));
        const cnt = sampleFor(f => /umowa|contract|agreement|regulamin|wniosek/i.test(`${f.name} ${f.path}`));
        const nts = sampleFor(f => /notatk|notes|memo|draft|todo|plan/i.test(`${f.name} ${f.path}`));
        const spc = sampleFor(f => /spec|readme|manual|dokument|raport|doc/i.test(`${f.name} ${f.path}`));
        return {
          id: 'doc_type',
          title: 'Czego dotyczy treść dokumentu?',
          subtitle: 'Klasyfikacja semantyczna na podstawie nazwy i ścieżki',
          options: [
            {
              value: 'invoice',
              emoji: '💳',
              label: 'Faktury & Finanse',
              subtitle: 'Rachunki, faktury VAT i potwierdzenia',
              accent: 'emerald',
              count: inv.count,
              sampleNames: inv.sampleNames
            },
            {
              value: 'contract',
              emoji: '📜',
              label: 'Umowy & Regulaminy',
              subtitle: 'Dokumenty prawne, wnioski i porozumienia',
              accent: 'amber',
              count: cnt.count,
              sampleNames: cnt.sampleNames
            },
            {
              value: 'notes',
              emoji: '📓',
              label: 'Notatki & Listy Zadań',
              subtitle: 'Szkice, plany, TODO i zapiski',
              accent: 'purple',
              count: nts.count,
              sampleNames: nts.sampleNames
            },
            {
              value: 'spec',
              emoji: '📊',
              label: 'Specyfikacje & Raporty',
              subtitle: 'Dokumentacja techniczna, instrukcje i README',
              accent: 'blue',
              count: spc.count,
              sampleNames: spc.sampleNames
            },
            {
              value: 'any',
              emoji: '✨',
              label: 'Dowolny typ dokumentu',
              subtitle: 'Pomiń filtr tematyczny',
              accent: 'purple',
              count: pool.length
            }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.size_tier) {
        const sm = sampleFor(f => (f.size || 0) < 100 * 1024);
        const md = sampleFor(f => (f.size || 0) >= 100 * 1024 && (f.size || 0) < 5 * 1024 * 1024);
        const lg = sampleFor(f => (f.size || 0) >= 5 * 1024 * 1024);
        return {
          id: 'size_tier',
          title: 'Jaka jest orientacyjna waga pliku?',
          subtitle: 'Zawęź według rozmiaru na dysku',
          options: [
            { value: 'small', emoji: '🪶', label: 'Lekki (< 100 KB)', subtitle: 'Krótkie notatki i skrypty tekstowe', accent: 'emerald', count: sm.count },
            { value: 'medium', emoji: '📄', label: 'Średni (100 KB – 5 MB)', subtitle: 'Standardowe dokumenty PDF i Word', accent: 'blue', count: md.count },
            { value: 'large', emoji: '📦', label: 'Duży (> 5 MB)', subtitle: 'Obszerne raporty, prezentacje i skany', accent: 'amber', count: lg.count },
            { value: 'any', emoji: '✨', label: 'Dowolny rozmiar', subtitle: 'Bez limitu wagi', accent: 'purple', count: pool.length }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.year) {
        return { id: 'year', title: 'Z którego roku pochodzi dokument?', subtitle: 'Data utworzenia lub modyfikacji', options: buildYearOpts() };
      }
      if (!answers.location) {
        return buildLocationQuestion();
      }
    } else if (effectiveDomain === 'ARCHIVE') {
      if (!answers.format) {
        const zip = sampleFor(f => (f.extension || '').toLowerCase() === 'zip');
        const rar = sampleFor(f => ['rar', '7z', 'tar', 'gz'].includes((f.extension || '').toLowerCase()));
        return {
          id: 'format',
          title: 'Jakiego formatu archiwum szukasz?',
          subtitle: 'Wybierz typ skompresowanej paczki',
          options: [
            { value: 'zip', emoji: '📦', label: 'Archiwa .ZIP', subtitle: 'Standardowe paczki ZIP z podglądem zawartości', accent: 'amber', count: zip.count, sampleNames: zip.sampleNames },
            { value: 'rar', emoji: '🗜️', label: 'Archiwa .RAR / .7Z / .TAR', subtitle: 'Silnie skompresowane archiwa wieloczęściowe', accent: 'purple', count: rar.count, sampleNames: rar.sampleNames },
            { value: 'any', emoji: '✨', label: 'Wszystkie archiwa', subtitle: 'Dowolny format kompresji', accent: 'blue', count: pool.length }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.size_tier) {
        const sm = sampleFor(f => (f.size || 0) < 5 * 1024 * 1024);
        const lg = sampleFor(f => (f.size || 0) >= 5 * 1024 * 1024);
        return {
          id: 'size_tier',
          title: 'Jaki jest rozmiar szukanego archiwum?',
          subtitle: 'Mała paczka czy duży backup?',
          options: [
            { value: 'medium', emoji: '🪶', label: 'Mniejsze paczki (< 5 MB)', subtitle: 'Drobne paczki dokumentów lub skryptów', accent: 'emerald', count: sm.count },
            { value: 'large', emoji: '🔥', label: 'Duże archiwa (> 5 MB)', subtitle: 'Pełne backupy, zasoby i instalatory', accent: 'amber', count: lg.count },
            { value: 'any', emoji: '✨', label: 'Dowolny rozmiar', subtitle: 'Pokaż wszystkie paczki', accent: 'purple', count: pool.length }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.year) {
        return { id: 'year', title: 'Z którego roku pochodzi paczka?', subtitle: 'Data zapisu archiwum na dysku', options: buildYearOpts() };
      }
      if (!answers.location) {
        return buildLocationQuestion();
      }
    } else {
      // IMAGE / MULTIMEDIA
      if (!answers.format) {
        const png = sampleFor(f => (f.extension || '').toLowerCase() === 'png');
        const jpg = sampleFor(f => ['jpg', 'jpeg'].includes((f.extension || '').toLowerCase()));
        const webp = sampleFor(f => ['webp', 'svg'].includes((f.extension || '').toLowerCase()));
        const gif = sampleFor(f => (f.extension || '').toLowerCase() === 'gif');
        return {
          id: 'format',
          title: 'W jakim formacie zapisana jest grafika / obraz?',
          subtitle: 'Zawęź kolekcję multimediów według rozszerzenia pliku',
          options: [
            { value: 'png', emoji: '🖼️', label: 'PNG (Bezstratny)', subtitle: 'Zrzuty ekranu, UI, grafiki z przezroczystością', accent: 'purple', count: png.count, sampleNames: png.sampleNames },
            { value: 'jpg', emoji: '📸', label: 'JPG / JPEG (Zdjęcia)', subtitle: 'Fotografie, tapety i skompresowane obrazy', accent: 'blue', count: jpg.count, sampleNames: jpg.sampleNames },
            { value: 'webp', emoji: '🌐', label: 'WEBP / SVG (Web & Wektory)', subtitle: 'Nowoczesne grafiki internetowe i ikony SVG', accent: 'emerald', count: webp.count, sampleNames: webp.sampleNames },
            { value: 'gif', emoji: '🎞️', label: 'GIF (Animacje)', subtitle: 'Animowane reakcje i krótkie klipy', accent: 'amber', count: gif.count, sampleNames: gif.sampleNames },
            { value: 'any', emoji: '✨', label: 'Dowolny format obrazu', subtitle: 'Zachowaj wszystkie formaty graficzne', accent: 'purple', count: pool.length }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.orientation) {
        const vert = sampleFor(f => /portrait|phone|mobile|girl|waifu|vertical/i.test(f.name));
        const horiz = sampleFor(f => /wallpaper|desktop|1920x1080|horizontal|landscape|screen|snip|zrzut/i.test(f.name));
        const sq = sampleFor(f => /icon|avatar|pfp|square|logo/i.test(f.name));
        return {
          id: 'orientation',
          title: 'Jaki jest charakter i układ grafiki?',
          subtitle: 'Zrzut ekranu / tapeta pozioma, portret czy ikona/avatar?',
          options: [
            { value: 'horizontal', emoji: '🖥️', label: 'Poziomy (Pulpit / Screenshot)', subtitle: 'Zrzuty ekranu 16:9, tapety desktopowe i krajobrazy', accent: 'blue', count: horiz.count, sampleNames: horiz.sampleNames },
            { value: 'vertical', emoji: '📱', label: 'Pionowy (Portret / Mobile)', subtitle: 'Postacie, plakaty i grafiki pionowe', accent: 'purple', count: vert.count, sampleNames: vert.sampleNames },
            { value: 'square', emoji: '🔲', label: 'Kwadratowy (Avatar / Ikona)', subtitle: 'Zdjęcia profilowe, logotypy i assety UI', accent: 'emerald', count: sq.count, sampleNames: sq.sampleNames },
            { value: 'any', emoji: '✨', label: 'Dowolny układ / kadr', subtitle: 'Nie ograniczaj orientacji obrazu', accent: 'purple', count: pool.length }
          ].filter(o => o.count > 0 || o.value === 'any')
        };
      }
      if (!answers.color) {
        const matchColor = (col: string) => sampleFor(f => f.name.toLowerCase().includes(col) || (f.tags || []).some(t => t.toLowerCase().includes(col)));
        const pink = matchColor('pink');
        const blue = matchColor('blue');
        const dark = matchColor('dark');
        return {
          id: 'color',
          title: 'Szukasz konkretnego motywu lub tagu wizualnego?',
          subtitle: 'Wybierz tonację lub przejdź od razu do wyboru rocznika',
          options: [
            ...(pink.count > 0 ? [{ value: 'pink', emoji: '🌸', label: 'Jasny / Pastelowy / Pink', subtitle: 'Grafiki z motywem pastelowym lub różowym', accent: 'rose', count: pink.count }] : []),
            ...(blue.count > 0 ? [{ value: 'blue', emoji: '💙', label: 'Chłodny / Błękitny / Blue', subtitle: 'Grafiki w odcieniach błękitu', accent: 'blue', count: blue.count }] : []),
            ...(dark.count > 0 ? [{ value: 'dark', emoji: '🖤', label: 'Ciemny / Dark Mode', subtitle: 'Ciemna stylistyka lub motyw nocny', accent: 'purple', count: dark.count }] : []),
            { value: 'any', emoji: '✨', label: 'Dowolna kolorystyka (Wszystkie)', subtitle: 'Przejdź dalej bez zawężania po kolorze', accent: 'purple', count: pool.length }
          ]
        };
      }
      if (!answers.year) {
        return { id: 'year', title: 'Z którego rocznika pochodzi grafika?', subtitle: 'Data utworzenia lub pobrania pliku', options: buildYearOpts() };
      }
      if (!answers.location) {
        return buildLocationQuestion();
      }
    }

    return null;
  }, [candidateFiles, effectiveDomain, answers, serverNextQuestion]);

  const handleExecuteOrganization = async (targetDir: string, planId: string) => {
    setIsOrganizing(true);
    setOrganizeReport(null);
    setOrganizeError(null);
    try {
      const data = await nexusApi.post<any>('/api/ai/agent/execute-organization', { targetDir, planId });
      if (data && data.success) {
        setOrganizeReport(data);
      } else {
        setOrganizeError(data?.error || 'Nieznany błąd organizacji');
      }
    } catch (err: any) {
      setOrganizeError(err.message || 'Błąd połączenia z agentem');
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleExecuteAgentCommand = async (cmdToRun?: string) => {
    const targetCmd = (cmdToRun || query).trim();
    if (!targetCmd) return;

    setIsAgentExecuting(true);
    setAgentResult(null);
    setOrganizeReport(null);
    setOrganizeError(null);
    setShowProposalDetails(false);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
      const data = await nexusApi.post<any>('/api/ai/agent/command', {
        command: targetCmd,
        context: {
          workspacePath: workspacePath || '.'
        }
      });

      setAgentResult(data);

      let actionLabel = 'AI Command';
      if (data.type === 'FILE_SEARCH') actionLabel = data.title || 'Search files';
      else if (data.type === 'ORGANIZATION_PROPOSAL') actionLabel = 'Cleanup proposal';
      else if (data.type === 'TEXT_SEARCH') actionLabel = 'Grep code';
      else if (data.type === 'COMMAND_EXECUTION') actionLabel = 'Run tests/command';
      else if (data.type === 'GIT_STATUS') actionLabel = 'Git inspection';
      else if (data.type === 'AI_RESPONSE') actionLabel = 'Agent analysis';

      setActionHistory(prev => [
        {
          id: String(Date.now()),
          time: timeStr,
          action: actionLabel,
          query: targetCmd,
          success: !data.error && data.exitCode !== 1
        },
        ...prev.slice(0, 9)
      ]);
    } catch (err: any) {
      setAgentResult({ error: err.message });
      setActionHistory(prev => [
        {
          id: String(Date.now()),
          time: timeStr,
          action: 'Command Failed',
          query: targetCmd,
          success: false
        },
        ...prev.slice(0, 9)
      ]);
    } finally {
      setIsAgentExecuting(false);
    }
  };

  // Quick preset queries for instant 1-click test
  const presets = [
    { label: '🗄️ find baza danych', q: 'find baza danych' },
    { label: '📸 find screenshots', q: 'find screenshots' },
    { label: '🧹 Posprzątaj Downloads', q: 'posprzątaj Downloads' },
    { label: '⚡ find Login.tsx', q: 'find Login.tsx' },
    { label: '⚡ run tests', q: 'run tests' },
    { label: '⚡ git status', q: 'git status' },
    { label: '🧾 Faktura VAT', q: 'faktura vat' },
    { label: '📦 Archiwa ZIP', q: 'zip rar' }
  ];

  const handleSelectOption = (questionId: string, option: QuestionOption) => {
    const updated = { ...answers, [questionId]: option.value };
    onAnswersChange(updated);
    onHistoryChange([...history, { id: questionId, label: option.label, count: option.count }]);
  };

  const handleSkipQuestion = () => {
    if (!activeQuestion) return;
    handleSelectOption(activeQuestion.id, {
      value: 'any',
      label: 'Dowolne (Pominięto)',
      count: totalMatches
    });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const newHist = [...history];
    const last = newHist.pop();
    onHistoryChange(newHist);
    if (last) {
      const updated = { ...answers };
      delete updated[last.id];
      onAnswersChange(updated);
    }
  };

  const handleJumpToStep = (stepIdx: number) => {
    if (stepIdx >= history.length) return;
    const keptHistory = history.slice(0, stepIdx);
    const removedHistory = history.slice(stepIdx);
    const updatedAnswers = { ...answers };
    for (const rem of removedHistory) {
      delete updatedAnswers[rem.id];
    }
    onHistoryChange(keptHistory);
    onAnswersChange(updatedAnswers);
  };

  const handleSwitchDomainMode = (mode: GuidedDomainMode) => {
    setDomainMode(mode);
    // Reset guided step answers when switching domain mode so questions start fresh for that domain
    const nextAnswers: Record<string, string> = {};
    if (mode === 'CODE') nextAnswers.domain_scope = 'code';
    else if (mode === 'IMAGE') nextAnswers.domain_scope = 'image';
    else if (mode === 'DOCS') nextAnswers.domain_scope = 'docs';
    else if (mode === 'ARCHIVE') nextAnswers.domain_scope = 'archive';
    onAnswersChange(nextAnswers);
    onHistoryChange([]);
  };

  // Support keyboard shortcuts 1..6 when user is not typing inside an input
  useEffect(() => {
    if (!isRibbonOpen || !activeQuestion || isFinished) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= activeQuestion.options.length) {
        e.preventDefault();
        handleSelectOption(activeQuestion.id, activeQuestion.options[num - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRibbonOpen, activeQuestion, isFinished, answers, history]);

  const currentStep = Math.min(5, history.length + 1);
  const progressPercent = Math.min(100, Math.round(((history.length + 0.35) / 5) * 100));
  const noiseReductionPercent = totalIndexed > 0
    ? Math.max(0, Math.round(((totalIndexed - totalMatches) / totalIndexed) * 100))
    : 0;

  const hasActiveFilters = query.trim().length > 0 || Object.keys(answers).length > 0 || activeTags.length > 0;
  const completedFinish = (isFinished || !activeQuestion) && history.length > 0;

  return (
    <div className="space-y-3 pb-3 text-left font-sans select-none">
      
      {/* 1. Main Integrated Search Bar (Raycast / Linear style) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 group">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 via-blue-500/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity blur-md -z-10" />
          
          {isCommandIntent ? (
            <Bot className="w-4 h-4 text-purple-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors animate-pulse" />
          ) : (
            <Search className="w-4 h-4 text-purple-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-purple-300" />
          )}
          
          <input
            id="nexus-dashboard-search"
            type="text"
            placeholder="Szukaj plików lub wpisz polecenie agenta (np. 'find Login.tsx', 'run tests', 'git status', 'faktura vat')..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isCommandIntent) {
                e.preventDefault();
                handleExecuteAgentCommand();
              }
            }}
            className="w-full pl-11 pr-32 py-3 rounded-2xl bg-[#16161d]/95 border border-white/10 focus:border-purple-500/60 focus:bg-[#1a1a24] text-sm text-white placeholder-[#71717a] focus:outline-none font-mono transition-all duration-200 shadow-xl"
          />

          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isCommandIntent && (
              <button
                type="button"
                onClick={() => handleExecuteAgentCommand()}
                disabled={isAgentExecuting}
                className="text-[11px] font-mono font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer transition shadow-sm"
              >
                {isAgentExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                <span>{isAgentExecuting ? 'Działa...' : 'Enter ↵'}</span>
              </button>
            )}

            {hasActiveFilters && !isCommandIntent && (
              <button
                type="button"
                onClick={() => {
                  setDomainMode('AUTO');
                  onReset();
                }}
                className="text-[11px] font-mono text-[#a1a1aa] hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg cursor-pointer transition border border-white/10"
                title="Wyczyść zapytanie i filtry"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <kbd className="kbd-badge hidden sm:inline-flex">/</kbd>
          </div>
        </div>

        {/* Dynamic Candidate Counter Pill & History toggle */}
        <div className="shrink-0 flex items-center justify-between sm:justify-end gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#16161d]/95 border border-white/10 text-xs font-mono shadow-xl backdrop-blur-md">
          {actionHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
              className="text-[11px] font-mono text-purple-300 hover:text-white flex items-center gap-1 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-md cursor-pointer transition"
              title="Historia akcji AI"
            >
              <Clock className="w-3 h-3 text-purple-400" />
              <span>Historia ({actionHistory.length})</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[#a1a1aa]">Wyniki:</span>
            <span className="font-bold text-white text-sm tracking-tight">
              {totalMatches.toLocaleString('pl-PL')}
            </span>
            <span className="text-[#52525b]">/ {totalIndexed.toLocaleString('pl-PL')}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsRibbonOpen(o => !o)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition cursor-pointer ${
              isRibbonOpen
                ? 'bg-purple-500/15 border-purple-500/35 text-purple-200 hover:bg-purple-500/25'
                : 'bg-white/5 border-white/10 text-[#a1a1aa] hover:text-white'
            }`}
            title="Zwiń / Rozwiń Asystenta 5 Kroków"
          >
            <SlidersHorizontal className="w-3 h-3 text-purple-400" />
            <span className="hidden md:inline">Asystent</span>
            {isRibbonOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* =========================================================================
          REAL AI AGENT EXECUTION RESULT CARD
      ========================================================================= */}
      {agentResult && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/30 via-[#16161e] to-[#141418] border border-purple-500/40 shadow-2xl space-y-3 animate-fadeIn text-xs font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold">
              <Bot className="w-4 h-4 text-purple-400" />
              <span>Wynik Działania Agenta AI</span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 text-[10px]">
                {agentResult.type || 'AGENT_ACTION'}
              </span>
            </div>

            <button
              onClick={() => setAgentResult(null)}
              className="p-1 rounded text-[#777] hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {agentResult.message && (
            <div className="text-purple-200 text-xs flex items-center gap-2">
              <span>{agentResult.message}</span>
              {agentResult.intent && (
                <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 text-[10px] font-bold">
                  ✨ Semantyczna intencja: {agentResult.intent}
                </span>
              )}
            </div>
          )}

          {agentResult.type === 'ORGANIZATION_PROPOSAL' && (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-[#111116] border border-purple-500/30 space-y-2.5">
                <div className="text-white font-bold text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span>{agentResult.summary}</span>
                  <span className="text-[10px] text-purple-300 font-mono truncate max-w-xs">
                    Katalog: {agentResult.targetDir}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1">
                  {agentResult.breakdown?.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg bg-black/40 border border-white/8 space-y-1"
                    >
                      <div className="text-purple-400 font-bold text-base">
                        {item.count.toLocaleString('pl-PL')}
                      </div>
                      <div className="text-[#aaa] text-[11px] font-medium leading-tight">
                        {item.label}
                      </div>
                      <div className="text-[#666] text-[9px] truncate">
                        ➔ /{item.target}
                      </div>
                    </div>
                  ))}
                </div>

                {!organizeReport && (
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => setShowProposalDetails(!showProposalDetails)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold transition cursor-pointer"
                    >
                      {showProposalDetails ? 'Ukryj' : 'Przejrzyj'}
                    </button>

                    <button
                      onClick={() => handleExecuteOrganization(agentResult.targetDir, agentResult.planId)}
                      disabled={isOrganizing}
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md hover:scale-[1.02]"
                    >
                      {isOrganizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isOrganizing ? 'Wykonywanie operacji na plikach...' : 'Uporządkuj'}</span>
                    </button>

                    <button
                      onClick={() => setAgentResult(null)}
                      className="px-3 py-1.5 rounded-lg text-[#777] hover:text-white transition cursor-pointer ml-auto"
                    >
                      Ignoruj
                    </button>
                  </div>
                )}

                {organizeReport && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 space-y-1.5 animate-fadeIn">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Fizycznie uporządkowano {organizeReport.movedCount} plików na dysku!</span>
                    </div>
                    <p className="text-[11px] text-[#aaa]">
                      Pliki zostały bezpiecznie przeniesione do dedykowanych folderów tematycznych. Indeks i widok zostały zaktualizowane.
                    </p>
                  </div>
                )}

                {organizeError && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <X className="w-4 h-4 text-rose-400" />
                      <span>{organizeError}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {agentResult.type === 'FILE_SEARCH' && Array.isArray(agentResult.results) && (
            <div className="space-y-1.5 pt-1">
              {agentResult.results.length === 0 ? (
                <div className="text-[#777]">Nie znaleziono pasujących plików w tym katalogu lub indeksie.</div>
              ) : (
                agentResult.results.map((f: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-[#111114] border border-white/5 flex items-center justify-between gap-2 hover:border-purple-500/40 transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Code2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="text-white font-bold truncate">{f.name}</span>
                      <span className="text-[#666] text-[10px] truncate">{f.relativePath || f.path}</span>
                      {f.extension && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono shrink-0">
                          .{f.extension}
                        </span>
                      )}
                    </div>

                    {onOpenFile && (
                      <button
                        onClick={() => onOpenFile(f.path)}
                        className="px-2.5 py-1 rounded bg-purple-600/30 hover:bg-purple-600 hover:text-white text-purple-300 text-[11px] font-bold transition shrink-0"
                      >
                        Otwórz
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {agentResult.type === 'COMMAND_EXECUTION' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[#aaa]">$ {agentResult.command}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${agentResult.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {agentResult.success ? 'PASSED (0)' : `FAILED (${agentResult.exitCode})`}
                </span>
                <span className="text-[#666] text-[10px] ml-auto">{agentResult.durationMs} ms</span>
              </div>

              {agentResult.stdout && (
                <pre className="p-3 rounded-lg bg-black/60 border border-white/5 text-[11px] text-[#ccc] overflow-x-auto max-h-48 custom-scrollbar">
                  {agentResult.stdout}
                </pre>
              )}
              {agentResult.stderr && (
                <pre className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300 overflow-x-auto max-h-48 custom-scrollbar">
                  {agentResult.stderr}
                </pre>
              )}
            </div>
          )}

          {agentResult.type === 'GIT_STATUS' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2 text-purple-300">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Stan repozytorium:</span>
              </div>
              <pre className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-[11px] text-[#ccc] overflow-x-auto">
                {agentResult.output || 'Working tree clean'}
              </pre>
            </div>
          )}

          {agentResult.type === 'AI_RESPONSE' && (
            <div className="p-3 rounded-lg bg-black/50 border border-white/5 space-y-1.5 text-xs text-[#ddd]">
              <div className="flex items-center justify-between text-[10px] text-[#777]">
                <span>Dostawca: <b className="text-purple-300">{agentResult.provider}</b></span>
                {agentResult.model && <span>Model: {agentResult.model}</span>}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{agentResult.response}</p>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          ACTION HISTORY LOG DRAWER
      ========================================================================= */}
      {showHistoryDrawer && actionHistory.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-[#141418] border border-white/10 shadow-xl space-y-2 text-xs font-mono animate-fadeIn">
          <div className="flex items-center justify-between text-[#888]">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Historia Wykonanych Działań AI (Action History)</span>
            </span>
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="hover:text-white"
            >
              Zamknij
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {actionHistory.map(item => (
              <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[#666] text-[10px]">{item.time}</span>
                  <span className="text-purple-300 font-semibold">{item.action}:</span>
                  <span className="text-white truncate">"{item.query}"</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${item.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {item.success ? 'OK' : 'ERR'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Active Tags & Quick Presets Row */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
        {activeTags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-200 text-[11px] font-semibold shadow-sm"
          >
            <span>{tag}</span>
            <button
              onClick={() => onRemoveTag(tag)}
              className="hover:text-white text-purple-400 transition cursor-pointer ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {!query && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#71717a] text-[10px] uppercase font-bold tracking-wider mr-1">
              Szybkie polecenia:
            </span>
            {presets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => onQueryChange(preset.q)}
                className="px-2.5 py-1 rounded-lg bg-[#181820] hover:bg-purple-950/40 border border-white/8 hover:border-purple-500/40 text-[#a1a1aa] hover:text-purple-200 text-[11px] transition cursor-pointer shadow-sm"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. UPGRADED 5-STEP PROGRESSIVE CONTEXT FILTER ENGINE (BENTO COMMAND FUNNEL) */}
      {isRibbonOpen && activeQuestion && !completedFinish && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1b1826]/95 via-[#15151e]/95 to-[#111117]/95 border border-purple-500/35 p-4 sm:p-5 space-y-4 shadow-2xl animate-fadeInScale">
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full bg-purple-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-emerald-500/5 blur-3xl" />

          {/* TOP BAR: Step Badge + Domain Mode Switcher + Noise Reduction Telemetry */}
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/8">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-200 font-bold border border-purple-500/40 text-[11px] font-mono flex items-center gap-1.5 shadow-inner">
                <Sparkles className="w-3 h-3 text-purple-300" />
                <span>Krok {currentStep} z 5</span>
              </span>
              <span className="text-white font-bold text-xs sm:text-sm tracking-tight">
                Inteligentny filtr kontekstowy
              </span>
              {noiseReductionPercent > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                  -{noiseReductionPercent}% szumu
                </span>
              )}
            </div>

            {/* Interactive Domain Mode Switcher */}
            <div className="flex items-center gap-1 flex-wrap bg-[#0f0f15]/90 p-1 rounded-xl border border-white/10 text-[10px] font-mono">
              <span className="text-[#71717a] px-2 font-semibold hidden sm:inline">Tryb pytań:</span>
              {([
                { id: 'AUTO', label: `Auto (${effectiveDomain})`, icon: '✨', count: totalMatches },
                { id: 'CODE', label: 'Kod & Dev', icon: '💻', count: poolBreakdown.code },
                { id: 'IMAGE', label: 'Grafika', icon: '🖼️', count: poolBreakdown.image },
                { id: 'DOCS', label: 'Dokumenty', icon: '📄', count: poolBreakdown.docs },
                { id: 'ARCHIVE', label: 'Archiwa', icon: '📦', count: poolBreakdown.archive }
              ] as const).map((m) => {
                const isActive = domainMode === m.id || (domainMode === 'AUTO' && m.id === 'AUTO');
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSwitchDomainMode(m.id)}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      domainMode === m.id
                        ? 'bg-purple-600/40 text-white font-bold border border-purple-500/50 shadow-sm'
                        : 'text-[#9ca3af] hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                    title={`Przełącz pytania asystenta na: ${m.label}`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5-STEP VISUAL STEPPER + PROGRESS BAR */}
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-1.5">
              {stepDefinitions.map((stepDef, idx) => {
                const stepNum = idx + 1;
                const isCompleted = idx < history.length;
                const isCurrent = idx === history.length;
                const historyItem = history[idx];

                return (
                  <button
                    key={stepDef.id}
                    type="button"
                    disabled={!isCompleted}
                    onClick={() => isCompleted && handleJumpToStep(idx)}
                    className={`group text-left p-2 rounded-xl border transition-all font-mono ${
                      isCurrent
                        ? 'bg-purple-950/45 border-purple-500/60 text-white shadow-sm'
                        : isCompleted
                        ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-200 hover:bg-emerald-950/40 cursor-pointer'
                        : 'bg-[#111117]/60 border-white/5 text-[#6b7280] cursor-default'
                    }`}
                    title={isCompleted ? `Kliknij, aby wrócić do kroku ${stepNum}: ${stepDef.shortLabel}` : stepDef.shortLabel}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold flex items-center gap-1 truncate">
                        {isCompleted ? (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0 ${
                            isCurrent ? 'bg-purple-500 text-white' : 'bg-white/10 text-[#71717a]'
                          }`}>
                            {stepNum}
                          </span>
                        )}
                        <span className="truncate">{stepDef.shortLabel}</span>
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] truncate">
                      {isCompleted && historyItem ? (
                        <span className="text-emerald-300 font-semibold">{historyItem.label}</span>
                      ) : isCurrent ? (
                        <span className="text-purple-300">Teraz wybierasz...</span>
                      ) : (
                        <span className="text-[#52525b]">Oczekuje</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="w-full h-1.5 bg-[#0c0c12] rounded-full overflow-hidden border border-white/8">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* BREADCRUMB FUNNEL TRAIL & ACTION CONTROLS */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-[#101016]/90 border border-white/8 rounded-xl px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-white/5 text-[#a1a1aa] border border-white/8 text-[11px]">
                📚 Baza: <b className="text-white">{totalIndexed.toLocaleString('pl-PL')}</b>
              </span>

              {domainMode !== 'AUTO' && (
                <>
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                  <span className="px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-200 border border-purple-500/35 text-[11px] font-bold">
                    Tryb: {domainMode}
                  </span>
                </>
              )}

              {query.trim() && (
                <>
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                  <span className="px-2 py-0.5 rounded-md bg-purple-900/50 text-purple-200 font-bold border border-purple-700/40 text-[11px]">
                    „{query}”
                  </span>
                </>
              )}

              {history.map((h, i) => (
                <React.Fragment key={i}>
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                  <button
                    type="button"
                    onClick={() => handleJumpToStep(i)}
                    className="px-2 py-0.5 rounded-md bg-purple-800/35 hover:bg-purple-700/45 text-purple-200 border border-purple-500/35 text-[11px] transition cursor-pointer"
                    title="Kliknij, aby zmienić ten wybór"
                  >
                    {h.label.split('(')[0].trim()}
                  </button>
                </React.Fragment>
              ))}

              <ArrowRight className="w-3 h-3 text-emerald-400" />
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-500/40 text-[11px] shadow-sm">
                🎯 {totalMatches.toLocaleString('pl-PL')} pasujących plików
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="text-[11px] text-[#d4d4d8] hover:text-white transition cursor-pointer flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"
                >
                  <RotateCcw className="w-3 h-3 text-purple-300" />
                  <span>Cofnij krok</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSkipQuestion}
                className="text-[11px] text-purple-200 hover:text-white transition cursor-pointer flex items-center gap-1 bg-purple-500/15 hover:bg-purple-500/30 px-2.5 py-1 rounded-lg border border-purple-500/30"
                title="Pomiń to pytanie bez zawężania puli"
              >
                <span>Pomiń pytanie</span>
                <SkipForward className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ACTIVE QUESTION HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pt-0.5">
            <div>
              <h4 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {activeQuestion.title}
              </h4>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                {activeQuestion.subtitle}
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#71717a] shrink-0">
              Skróty klawiszowe: naciśnij <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-purple-300">1</kbd> – <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-purple-300">{activeQuestion.options.length}</kbd>
            </span>
          </div>

          {/* BENTO OPTION CARDS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1">
            {activeQuestion.options.map((opt, idx) => {
              const sharePct = totalMatches > 0 ? Math.min(100, Math.round((opt.count / totalMatches) * 100)) : 0;
              const isSkipOrAll = opt.value === 'any';
              const accentBorder =
                opt.accent === 'blue' ? 'hover:border-blue-500/60 group-hover:text-blue-300' :
                opt.accent === 'amber' ? 'hover:border-amber-500/60 group-hover:text-amber-300' :
                opt.accent === 'emerald' ? 'hover:border-emerald-500/60 group-hover:text-emerald-300' :
                opt.accent === 'rose' ? 'hover:border-rose-500/60 group-hover:text-rose-300' :
                'hover:border-purple-500/60 group-hover:text-purple-300';

              const barColor =
                opt.accent === 'blue' ? 'from-blue-500 to-cyan-400' :
                opt.accent === 'amber' ? 'from-amber-500 to-yellow-400' :
                opt.accent === 'emerald' ? 'from-emerald-500 to-teal-400' :
                opt.accent === 'rose' ? 'from-rose-500 to-pink-400' :
                'from-purple-500 to-indigo-400';

              return (
                <button
                  key={`${activeQuestion.id}-${opt.value}-${idx}`}
                  type="button"
                  onClick={() => handleSelectOption(activeQuestion.id, opt)}
                  className={`group relative text-left p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5 shadow-lg hover:-translate-y-0.5 ${
                    isSkipOrAll
                      ? 'bg-[#171722]/85 hover:bg-[#201e30] border-purple-500/25 hover:border-purple-400/60'
                      : `bg-[#191824]/95 hover:bg-[#232034] border-white/10 ${accentBorder}`
                  }`}
                >
                  {/* Top row: Keycap + Emoji + Count pill */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-black/50 text-[10px] font-mono text-purple-300 group-hover:bg-purple-600 group-hover:text-white flex items-center justify-center font-bold border border-white/10 transition shrink-0">
                        {idx + 1}
                      </span>
                      {opt.emoji && (
                        <span className="text-base group-hover:scale-110 transition-transform shrink-0">
                          {opt.emoji}
                        </span>
                      )}
                      <span className="font-bold text-xs text-white group-hover:text-purple-200 transition truncate">
                        {opt.label}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono font-extrabold text-purple-300 group-hover:text-white group-hover:border-purple-500/40 shrink-0">
                      {opt.count.toLocaleString('pl-PL')}
                    </span>
                  </div>

                  {/* Subtitle or Sample filenames */}
                  <div className="text-[11px] text-[#9ca3af] line-clamp-1 font-sans">
                    {opt.subtitle || (opt.sampleNames && opt.sampleNames.length > 0
                      ? `np. ${opt.sampleNames.join(', ')}`
                      : `Zawęża listę do ${opt.count} plików`)}
                  </div>

                  {/* Share Progress Bar */}
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between text-[9px] font-mono text-[#71717a]">
                      <span>Udział w puli</span>
                      <span className="text-[#a1a1aa] font-bold">{sharePct}%</span>
                    </div>
                    <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden border border-white/5">
                      <div
                        className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${Math.max(4, sharePct)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* LIVE TOP MATCHES PREVIEW BAR */}
          {candidateFiles.length > 0 && (
            <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-[#71717a] uppercase text-[10px] font-bold tracking-wider mr-1">
                  Top trafienia ({Math.min(4, candidateFiles.length)} z {totalMatches}):
                </span>
                {candidateFiles.slice(0, 4).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onSelectFile ? onSelectFile(f) : onOpenFile?.(f.path)}
                    className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-purple-950/50 border border-white/8 hover:border-purple-500/40 text-[#d4d4d8] hover:text-white transition cursor-pointer flex items-center gap-1.5 max-w-[200px]"
                    title={`Kliknij, aby podejrzeć plik: ${f.path}`}
                  >
                    <span className="text-purple-400 font-bold uppercase text-[9px]">.{f.extension}</span>
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. When finished: Show rich summary & action banner */}
      {completedFinish && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/45 via-[#131d1b] to-[#14141c] border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-emerald-200 shadow-xl animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-lg shrink-0">
              🎯
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                Filtr kontekstowy zakończony — znaleziono {totalMatches.toLocaleString('pl-PL')} pasujących plików!
              </div>
              <div className="text-[11px] text-emerald-300/80 mt-0.5">
                Zawężono z <b>{totalIndexed.toLocaleString('pl-PL')}</b> do <b>{totalMatches.toLocaleString('pl-PL')}</b> plików w {history.length} {history.length === 1 ? 'kroku' : 'krokach'} (redukcja szumu o {noiseReductionPercent}%).
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition cursor-pointer text-[11px] font-bold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Cofnij krok</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDomainMode('AUTO');
                onReset();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 border border-emerald-500/40 transition cursor-pointer text-[11px] font-bold"
            >
              Resetuj filtry
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
