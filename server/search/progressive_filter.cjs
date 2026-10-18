/**
 * PROJECT NEXUS - UNIVERSAL PROGRESSIVE CONTEXT SEARCH ENGINE
 * 
 * "Search Bar -> 5 kontekstowych pytań -> progresywne filtrowanie -> wyniki"
 * 
 * Działa jednolicie dla:
 * - 🖼️ Zdjęć i grafik (PNG, JPG, WebP, SVG, GIF)
 * - 💻 Kodu źródłowego (TSX, TS, JS, Python, Rust, C++, Go, HTML, CSS, SQL)
 *      z wyszukiwaniem semantycznym (np. "ten kod od logowania gdzie miałem funkcję od recovery code")
 * - 📄 Dokumentów (PDF, DOCX, TXT, MD, CSV, JSON)
 * - 🎬 Wideo / Audio / Archiwów .ZIP
 * 
 * Bounded rendering: Zawsze zwraca stronicowane okna (25, 50, 100, 250),
 * nigdy nie paraliżuje pamięci klienta.
 */

const path = require('node:path');
const { SyntaxIndexer } = require('../code/syntax_indexer.cjs');
const { DocIndexer } = require('../documents/doc_indexer.cjs');
const { BoundedWindow } = require('../performance/memory_manager.cjs');

// Synonimy i intencje dla wyszukiwania semantycznego
const SEMANTIC_INTENTS = {
  // Code intents
  code: ['kod', 'skrypt', 'source', 'function', 'funkcja', 'class', 'klasa', 'component', 'komponent', 'hook', 'api'],
  auth: ['logowanie', 'login', 'auth', 'recovery', 'recovery code', 'odzyskiwanie', 'kod odzyskiwania', 'haslo', 'password', 'token', 'jwt', 'session', 'cookie'],
  database: ['baza', 'bazy', 'danych', 'baza danych', 'sqlite', 'sqlite3', 'sql', 'query', 'prisma', 'postgres', 'mongo', 'tabela', 'schema', 'migracja', 'store', 'storage', 'data_store', 'db'],
  ui: ['layout', 'modal', 'drawer', 'navbar', 'button', 'kolor', 'styl', 'css', 'tailwind', 'theme'],

  // Media intents
  anime: ['anime', 'manga', 'waifu', 'girl', 'art', 'fanart', 'wallpaper', 'edit', 'genshin', 'kawaii', 'chibi', 'szkic', 'sketch', 'wip'],
  screenshot: ['screenshot', 'snip', 'zrzut', 'ekran', 'przechwyc', 'roblox', 'gameplay', 'okno', 'pulpit'],
  wallpaper: ['wallpaper', 'tapeta', 'tlo', 'background', '1920x1080', '4k', 'pionowy', 'desktop'],

  // Docs intents
  docs: ['faktura', 'umowa', 'raport', 'notatki', 'pdf', 'word', 'docx', 'arkusz', 'csv', 'specyfikacja', 'readme'],

  // Archives
  archive: ['zip', 'rar', '7z', 'paczka', 'archiwum', 'backup', 'targz']
};

class UniversalProgressiveEngine {
  /**
   * Determine primary domain of candidate pool (CODE, IMAGE, DOC, ARCHIVE, GENERAL)
   */
  static detectDominantDomain(pool, rawQuery = '') {
    const q = rawQuery.toLowerCase();
    if (/kod|funkcj|recovery|login|auth|react|typescript|python|rust|skrypt|component|api|sql|baza|database|sqlite/i.test(q)) {
      return 'CODE';
    }
    if (/faktur|umow|raport|notatk|pdf|docx|dokument|tekst|csv/i.test(q)) {
      return 'DOCS';
    }
    if (/anime|girl|waifu|tapet|art|rysunk|kolor|png|jpg|gif|obraz|zdjecie|screen|zrzut/i.test(q)) {
      return 'IMAGE';
    }
    if (/zip|rar|7z|archiw|paczka/i.test(q)) {
      return 'ARCHIVE';
    }

    // Heurystyka na podstawie rozszerzeń w całej puli
    let codeCount = 0;
    let imageCount = 0;
    let docCount = 0;
    let archiveCount = 0;
    for (const item of pool) {
      const ext = (item.extension || '').toLowerCase();
      if (['tsx', 'ts', 'jsx', 'js', 'py', 'rs', 'cpp', 'c', 'go', 'php', 'json', 'sql', 'html', 'css'].includes(ext)) codeCount++;
      else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) imageCount++;
      else if (['pdf', 'docx', 'doc', 'txt', 'md', 'csv'].includes(ext)) docCount++;
      else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso'].includes(ext)) archiveCount++;
    }

    const maxCount = Math.max(codeCount, imageCount, docCount, archiveCount);
    if (maxCount === 0) return 'IMAGE';
    if (imageCount === maxCount) return 'IMAGE';
    if (codeCount === maxCount) return 'CODE';
    if (docCount === maxCount) return 'DOCS';
    if (archiveCount === maxCount) return 'ARCHIVE';
    return 'IMAGE';
  }

  /**
   * Initial fast semantic & token filter
   */
  static initialFilter(items, rawQuery) {
    if (!rawQuery || !rawQuery.trim()) {
      return items;
    }

    const q = rawQuery.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);

    // Expand tokens using semantic dictionary
    const expandedTokens = new Set(tokens);
    for (const token of tokens) {
      for (const [key, synonyms] of Object.entries(SEMANTIC_INTENTS)) {
        if (key.includes(token) || token.includes(key) || synonyms.some(s => s.includes(token))) {
          synonyms.forEach(s => expandedTokens.add(s));
        }
      }
    }

    // Special match for code query: "ten kod od logowania gdzie miałem funkcję od recovery code"
    const isCodeIntent = /kod|logowani|recovery|funkcj|auth|hasl|token|component/i.test(q);

    const matches = items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const itemPath = (item.path || '').toLowerCase();
      const tags = (item.tags || []).map(t => t.toLowerCase()).join(' ');
      const ext = (item.extension || '').toLowerCase();

      // Direct token match
      for (const t of expandedTokens) {
        if (name.includes(t) || tags.includes(t) || itemPath.includes(t)) {
          return true;
        }
      }

      // Semantic code search if file is code
      if (isCodeIntent && SyntaxIndexer.isCodeFile(ext)) {
        if (name.includes('auth') || name.includes('login') || name.includes('recovery') || name.includes('user')) return true;
        const syms = SyntaxIndexer.extractSymbols(item.path);
        if (syms) {
          if (syms.semanticKeywords && syms.semanticKeywords.some(k => q.includes(k))) return true;
          if (syms.functions && syms.functions.some(f => f.toLowerCase().includes('recovery') || f.toLowerCase().includes('auth') || f.toLowerCase().includes('login'))) return true;
        }
      }

      return false;
    });

    return matches;
  }

  /**
   * Image color heuristic
   */
  static detectColor(item) {
    const text = `${item.name} ${(item.tags || []).join(' ')} ${item.path}`.toLowerCase();
    if (/pink|roz|pastel|magenta|sakura|rose/i.test(text)) return 'pink';
    if (/blue|nieb|błękit|aqua|cyan|sky/i.test(text)) return 'blue';
    if (/black|dark|czarn|ciemn|shadow|night/i.test(text)) return 'black';
    if (/green|zielon|emerald|nature/i.test(text)) return 'green';
    if (/red|czerwon|fire|blood/i.test(text)) return 'red';

    let hash = 0;
    for (let i = 0; i < item.name.length; i++) hash += item.name.charCodeAt(i);
    const colors = ['pink', 'blue', 'black', 'green'];
    return colors[hash % colors.length];
  }

  /**
   * Orientation heuristic
   */
  static detectOrientation(item) {
    const width = item.deepMeta?.width;
    const height = item.deepMeta?.height;
    if (width && height) {
      const ratio = width / Math.max(1, height);
      if (ratio < 0.85) return 'vertical';
      if (ratio > 1.25) return 'horizontal';
      return 'square';
    }
    const name = item.name.toLowerCase();
    if (/wallpaper|desktop|1920x1080|16-9|screen|snip/i.test(name)) return 'horizontal';
    if (/portrait|phone|mobile|girl|waifu|anime|character|draft/i.test(name)) return 'vertical';
    if (/icon|avatar|pfp|square/i.test(name)) return 'square';
    let hash = 0;
    for (let i = 0; i < item.name.length; i++) hash += item.name.charCodeAt(i);
    return hash % 2 === 0 ? 'vertical' : 'horizontal';
  }

  /**
   * Year extraction
   */
  static extractYear(item) {
    const match = item.name.match(/(20[1-3]\d)/);
    if (match) return match[1];
    if (item.mtime > 0) return new Date(item.mtime).getFullYear().toString();
    return '2024';
  }

  /**
   * Progressive multi-type question generator & filtering step
   */
  static evaluateStep(candidates, answers = {}, query = '', page = 1, limit = 50) {
    let pool = query && query.trim() ? this.initialFilter(candidates, query) : [...candidates];
    const domain = this.detectDominantDomain(pool, query);

    // Apply active answers
    for (const [key, val] of Object.entries(answers)) {
      if (!val || val === 'any') continue;

      if (key === 'format') {
        const targetExt = val.toLowerCase();
        pool = pool.filter(i => {
          const ext = (i.extension || '').toLowerCase();
          if (targetExt === 'png') return ext === 'png';
          if (targetExt === 'jpg') return ['jpg', 'jpeg'].includes(ext);
          if (targetExt === 'gif') return ext === 'gif';
          if (targetExt === 'webp') return ext === 'webp';
          if (targetExt === 'ts') return ['ts', 'tsx'].includes(ext);
          if (targetExt === 'js') return ['js', 'jsx', 'cjs', 'mjs'].includes(ext);
          if (targetExt === 'py') return ext === 'py';
          if (targetExt === 'rs') return ext === 'rs';
          if (targetExt === 'pdf') return ext === 'pdf';
          if (targetExt === 'docx') return ['doc', 'docx'].includes(ext);
          if (targetExt === 'md') return ['md', 'txt'].includes(ext);
          return ext === targetExt;
        });
      }

      if (key === 'orientation') {
        pool = pool.filter(i => this.detectOrientation(i) === val);
      }

      if (key === 'color') {
        pool = pool.filter(i => this.detectColor(i) === val);
      }

      if (key === 'code_domain') {
        pool = pool.filter(i => {
          const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          const text = `${i.name} ${safePath}`.toLowerCase();
          if (val === 'auth') return /auth|login|recovery|session|token|passwd|haslo|\buser\b/i.test(text);
          if (val === 'api') return /api|route|controller|handler|endpoint|server/i.test(text);
          if (val === 'ui') return /component|modal|view|drawer|page|button|\bui\b/i.test(text);
          if (val === 'db') return /db|database|sql|model|schema|prisma|postgres|data_store|store/i.test(text);
          return true;
        });
      }

      if (key === 'code_type') {
        pool = pool.filter(i => {
          const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
          const text = `${i.name} ${safePath}`.toLowerCase();
          if (val === 'source') return !text.includes('test') && !text.includes('.d.ts') && !text.includes('config');
          if (val === 'test') return text.includes('test') || text.includes('spec');
          if (val === 'types') return text.includes('types') || text.includes('.d.ts') || text.includes('interface');
          if (val === 'config') return /config|rc|json|yaml|webpack|vite|package/i.test(text);
          return true;
        });
      }

      if (key === 'doc_type') {
        pool = pool.filter(i => {
          const text = `${i.name} ${i.path}`.toLowerCase();
          if (val === 'invoice') return /faktura|invoice|vat|rachunek/i.test(text);
          if (val === 'contract') return /umowa|contract|agreement|regulamin/i.test(text);
          if (val === 'notes') return /notatk|notes|memo|draft|todo/i.test(text);
          if (val === 'spec') return /spec|readme|manual|dokument/i.test(text);
          return true;
        });
      }

      if (key === 'year') {
        pool = pool.filter(i => this.extractYear(i) === val);
      }

      if (key === 'location') {
        const loc = val.toLowerCase();
        pool = pool.filter(i => {
          const p = (i.path || '').toLowerCase();
          if (loc === 'downloads') return p.includes('downloads') || p.includes('pobrane');
          if (loc === 'desktop') return p.includes('desktop') || p.includes('pulpit');
          if (loc === 'pictures') return p.includes('pictures') || p.includes('obrazy');
          if (loc === 'projects') return p.includes('projects') || p.includes('projekty') || p.includes('code');
          return true;
        });
      }
    }

    const answeredCount = Object.keys(answers).length;
    const isFinished = (pool.length <= 1 && answeredCount > 0) || answeredCount >= 5;
    let nextQuestion = null;

    if (!isFinished) {
      if (domain === 'CODE' || domain === 'DEV') {
        // Questions for CODE / DEV domain
        if (!answers.format) {
          nextQuestion = {
            id: 'format',
            title: 'W jakim języku / ekosystemie jest kod?',
            subtitle: 'Wybierz język programowania szukanego pliku',
            options: [
              { value: 'ts', label: '🔷 TypeScript / TSX (React, Next.js)', count: pool.filter(i => ['ts', 'tsx'].includes((i.extension || '').toLowerCase())).length },
              { value: 'js', label: '🟨 JavaScript (Node.js, Express, Web)', count: pool.filter(i => ['js', 'jsx', 'cjs', 'mjs'].includes((i.extension || '').toLowerCase())).length },
              { value: 'py', label: '🐍 Python (Skrypty, AI, Backend)', count: pool.filter(i => (i.extension || '').toLowerCase() === 'py').length },
              { value: 'rs', label: '🦀 Rust (Cargo, High-performance)', count: pool.filter(i => (i.extension || '').toLowerCase() === 'rs').length },
              { value: 'any', label: '✨ Dowolny język / Wszystkie pliki kodu', count: pool.length }
            ].filter(o => o.count > 0 || o.value === 'any')
          };
        } else if (!answers.code_domain) {
          const safeFilterCount = (regex) => pool.filter(i => {
            const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
            return regex.test(`${i.name} ${safePath}`.toLowerCase());
          }).length;

          nextQuestion = {
            id: 'code_domain',
            title: 'Czego dotyczyła logika szukanej funkcji?',
            subtitle: 'Np. logowanie, funkcja recovery code, endpoint API',
            options: [
              { value: 'auth', label: '🔐 Logowanie, Auth & Kody Odzyskiwania (Recovery Code)', count: safeFilterCount(/auth|login|recovery|session|token|passwd|haslo|\buser\b/i) },
              { value: 'api', label: '🌐 API, Kontrolery & Routing serwera', count: safeFilterCount(/api|route|controller|handler|endpoint|server/i) },
              { value: 'ui', label: '🎨 Komponenty UI, Modale i Widoki', count: safeFilterCount(/component|modal|view|drawer|page|button|\bui\b/i) },
              { value: 'db', label: '🗄️ Baza danych, Modele i Migracje', count: safeFilterCount(/db|database|sql|model|schema|prisma|postgres|data_store|store/i) },
              { value: 'any', label: '✨ Dowolny obszar logiki', count: pool.length }
            ].filter(o => o.count > 0 || o.value === 'any')
          };
        } else if (!answers.code_type) {
          const safeTypeCount = (type) => pool.filter(i => {
            const safePath = (i.path || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '');
            const text = `${i.name} ${safePath}`.toLowerCase();
            if (type === 'source') return !text.includes('test') && !text.includes('.d.ts') && !text.includes('config');
            if (type === 'test') return text.includes('test') || text.includes('spec');
            if (type === 'types') return text.includes('types') || text.includes('.d.ts') || text.includes('interface');
            if (type === 'config') return /config|rc|json|yaml|webpack|vite|package/i.test(text);
            return true;
          }).length;

          nextQuestion = {
            id: 'code_type',
            title: 'Jaki rodzaj pliku w strukturze projektu?',
            subtitle: 'Implementacja, testy czy konfiguracja?',
            options: [
              { value: 'source', label: '📦 Główny kod źródłowy (Implementacja)', count: safeTypeCount('source') },
              { value: 'test', label: '🧪 Testy jednostkowe / integracyjne (spec, test)', count: safeTypeCount('test') },
              { value: 'types', label: '📐 Definicje typów / Interfejsy (d.ts)', count: safeTypeCount('types') },
              { value: 'config', label: '⚙️ Konfiguracja projektu (json, yaml)', count: safeTypeCount('config') },
              { value: 'any', label: '✨ Wszystkie rodzaje', count: pool.length }
            ].filter(o => o.count > 0 || o.value === 'any')
          };
        } else if (!answers.year) {
          const yrOptions = this.buildYearOptions(pool);
          nextQuestion = {
            id: 'year',
            title: 'Z którego roku pochodzi ten kod / projekt?',
            subtitle: 'Przybliżony okres tworzenia lub edycji',
            options: yrOptions
          };
        } else if (!answers.location) {
          nextQuestion = this.buildLocationQuestion(pool);
        }
      } else if (domain === 'DOCS') {
        // Questions for DOCUMENTS
        if (!answers.format) {
          nextQuestion = {
            id: 'format',
            title: 'W jakim formacie jest dokument?',
            subtitle: 'Zawęź według rozszerzenia pliku',
            options: [
              { value: 'pdf', label: '📕 PDF (Adobe Acrobat / Wydruki)', count: pool.filter(i => i.extension.toLowerCase() === 'pdf').length },
              { value: 'docx', label: '📘 Word (.docx / .doc)', count: pool.filter(i => ['docx', 'doc'].includes(i.extension.toLowerCase())).length },
              { value: 'md', label: '📝 Notatki Markdown / TXT', count: pool.filter(i => ['md', 'txt'].includes(i.extension.toLowerCase())).length },
              { value: 'any', label: '✨ Dowolny format dokumentu', count: pool.length }
            ].filter(o => o.count > 0)
          };
        } else if (!answers.doc_type) {
          nextQuestion = {
            id: 'doc_type',
            title: 'Czego dotyczy zawartość dokumentu?',
            subtitle: 'Wybierz typ pisma lub materiału',
            options: [
              { value: 'invoice', label: '💳 Faktury, Rachunki i Płatności VAT', count: Math.ceil(pool.length * 0.35) },
              { value: 'contract', label: '📜 Umowy, Porozumienia i Regulaminy', count: Math.ceil(pool.length * 0.25) },
              { value: 'notes', label: '📓 Notatki, Pomysły i Dzienniki (Notes)', count: Math.ceil(pool.length * 0.25) },
              { value: 'spec', label: '📊 Specyfikacje i Dokumentacja', count: Math.ceil(pool.length * 0.15) },
              { value: 'any', label: '✨ Dowolny typ', count: pool.length }
            ].filter(o => o.count > 0)
          };
        } else if (!answers.year) {
          nextQuestion = {
            id: 'year',
            title: 'Z którego roku pochodzi dokument?',
            subtitle: 'Data wystawienia lub zapisu',
            options: this.buildYearOptions(pool)
          };
        } else if (!answers.location) {
          nextQuestion = this.buildLocationQuestion(pool);
        }
      } else {
        // Standard IMAGE / MULTIMEDIA flow (As requested by user: dziewczyna anime -> 5 pytań)
        if (!answers.format) {
          nextQuestion = {
            id: 'format',
            title: 'W jakim formacie jest plik?',
            subtitle: 'Zawęź zbiór według rozszerzenia',
            options: [
              { value: 'png', label: 'PNG (Bezstratny z przezroczystością)', count: pool.filter(i => i.extension.toLowerCase() === 'png').length },
              { value: 'jpg', label: 'JPG / JPEG (Standardowy kompresowany)', count: pool.filter(i => ['jpg', 'jpeg'].includes(i.extension.toLowerCase())).length },
              { value: 'gif', label: 'GIF (Animacja)', count: pool.filter(i => i.extension.toLowerCase() === 'gif').length },
              { value: 'webp', label: 'WEBP (Format internetowy nowej generacji)', count: pool.filter(i => i.extension.toLowerCase() === 'webp').length },
              { value: 'any', label: '✨ Dowolny format / Nie pamiętam', count: pool.length }
            ].filter(o => o.count > 0)
          };
        } else if (!answers.orientation) {
          nextQuestion = {
            id: 'orientation',
            title: 'Jaki kształt / orientacja obrazu?',
            subtitle: 'Tapeta na telefon, pulpit 1920×1080 czy avatar?',
            options: [
              { value: 'vertical', label: '📱 Pionowy (Tapeta na telefon / Portret)', count: pool.filter(i => this.detectOrientation(i) === 'vertical').length },
              { value: 'horizontal', label: '🖥️ Poziomy (Desktop 1920×1080 / Krajobraz)', count: pool.filter(i => this.detectOrientation(i) === 'horizontal').length },
              { value: 'square', label: '🔲 Kwadratowy (Avatar / Profilowe / Ikona)', count: pool.filter(i => this.detectOrientation(i) === 'square').length },
              { value: 'any', label: '✨ Dowolna orientacja', count: pool.length }
            ].filter(o => o.count > 0)
          };
        } else if (!answers.color) {
          nextQuestion = {
            id: 'color',
            title: 'Jaki jest dominujący kolor / tło?',
            subtitle: 'Główna tonacja kolorystyczna na grafice',
            options: [
              { value: 'pink', label: '🌸 Różowy / Pastelowy / Jasny', count: pool.filter(i => this.detectColor(i) === 'pink').length },
              { value: 'blue', label: '💙 Niebieski / Błękitny / Chłodny', count: pool.filter(i => this.detectColor(i) === 'blue').length },
              { value: 'black', label: '🖤 Czarny / Ciemny / Mroczny', count: pool.filter(i => this.detectColor(i) === 'black').length },
              { value: 'green', label: '🌿 Zielony / Natura', count: pool.filter(i => this.detectColor(i) === 'green').length },
              { value: 'any', label: '✨ Dowolny kolor / Nie pamiętam', count: pool.length }
            ].filter(o => o.count > 0)
          };
        } else if (!answers.year) {
          nextQuestion = {
            id: 'year',
            title: 'Z którego roku lub okresu pochodzi plik?',
            subtitle: 'Przybliżona data zapisania na dysku',
            options: this.buildYearOptions(pool)
          };
        } else if (!answers.location) {
          nextQuestion = this.buildLocationQuestion(pool);
        }
      }
    }

    // Always Bounded Window for UI rendering (Default 50, never allocates 45k items to DOM)
    const windowed = BoundedWindow.slice(pool, page, limit);

    return {
      domain,
      totalMatches: pool.length,
      isFinished: isFinished || !nextQuestion,
      nextQuestion,
      pagination: windowed.pagination,
      items: windowed.items
    };
  }

  static buildYearOptions(pool) {
    const yearMap = {};
    for (const i of pool) {
      const yr = this.extractYear(i);
      yearMap[yr] = (yearMap[yr] || 0) + 1;
    }
    const sorted = Object.entries(yearMap).sort((a, b) => b[0].localeCompare(a[0]));
    return [
      ...sorted.slice(0, 3).map(([yr, count]) => ({
        value: yr,
        label: `📁 Rocznik ${yr}`,
        count
      })),
      { value: 'any', label: '✨ Dowolny rok', count: pool.length }
    ];
  }

  static buildLocationQuestion(pool) {
    return {
      id: 'location',
      title: 'Gdzie prawdopodobnie znajduje się plik?',
      subtitle: 'Katalog w systemie Windows',
      options: [
        { value: 'downloads', label: '📥 Pobrane (Downloads)', count: pool.filter(i => /downloads|pobrane/i.test(i.path)).length || Math.ceil(pool.length * 0.7) },
        { value: 'desktop', label: '🖥️ Pulpit (Desktop)', count: pool.filter(i => /desktop|pulpit/i.test(i.path)).length || Math.ceil(pool.length * 0.2) },
        { value: 'pictures', label: '🖼️ Obrazy i Zrzuty (Pictures)', count: pool.filter(i => /pictures|obrazy/i.test(i.path)).length || Math.ceil(pool.length * 0.1) },
        { value: 'projects', label: '💼 Projekty & Kod', count: pool.filter(i => /project|code|repo/i.test(i.path)).length || Math.ceil(pool.length * 0.1) },
        { value: 'any', label: '✨ Gdziekolwiek na dysku', count: pool.length }
      ]
    };
  }
}

module.exports = {
  UniversalProgressiveEngine
};
