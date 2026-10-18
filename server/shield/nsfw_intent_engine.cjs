'use strict';

/**
 * ============================================================================
 * NEXUS NSFW INTENT ENGINE (v4.5 Enterprise Edition)
 * ============================================================================
 * Zaawansowany silnik heurystyczno-kontekstowy NLP dla języka polskiego
 * i angielskiego do wykrywania treści NSFW, pornografii, erotyki, slangu
 * seksualnego, prób obejścia filtrów (obfuskacji) oraz intencji wypowiedzi.
 *
 * Pipeline przetwarzania:
 *   1. Pre-processing   – ekstrakcja URL, nazw plików, emoji i metadanych.
 *   2. Normalizacja     – małe litery, usuwanie diakrytyków PL i zero-width,
 *                         mapowanie homoglifów (cyrylica/greka -> łacina),
 *                         dekodowanie leetspeak (s3ks, p0rn0), sklejanie
 *                         rozstrzelonych liter (s e k s / s.e.k.s), redukcja
 *                         powtórzeń (seeeeks -> seks), podział camelCase.
 *   3. Tokenizacja      – podział na tokeny z zachowaniem pozycji i indeksów,
 *                         filtrowanie przez białą listę (Scunthorpe safe-words).
 *   4. Tagowanie        – dopasowanie prefiksowe (rdzenie fleksyjne) i dokładne
 *                         (=token) z wykorzystaniem indeksowanych struktur.
 *   5. Analiza Intencji – analiza okna kontekstowego (Sliding Window +/- 5 słów):
 *                           • ramy edukacyjne / medyczne / prawne / definicyjne
 *                           • ekscytacja / promocja / pożądanie / namawianie
 *                           • czasownik dwuznaczny + dopełnienie osobowe
 *                           • wzorce ERP (Erotic Roleplay) oraz solicitation
 *                           • negacja lokalna wygaszająca markery ekscytacji
 *   6. Scoring & Raport – wyliczenie ryzyka (0-100), klasyfikacja kategorii,
 *                         porównanie z progiem nsfwSensitivity, pełny audyt.
 *
 * Twarde reguły bezpieczeństwa:
 *   - Pornografia / wulgaryzmy seksualne (HARD_EXPLICIT) NIGDY nie są
 *     usprawiedliwiane kontekstem naukowym ani edukacyjnym.
 *   - Kontekst edukacyjny neutralizuje WYŁĄCZNIE neutralne terminy (SENSITIVE_TOPIC:
 *     seks, penis, orgazm, ciąża...), i tylko gdy brak ekscytacji, slangu
 *     seksualnego, kombinacji emoji NSFW oraz wulgaryzmów.
 * ============================================================================
 */

// ============================================================================
// 1. KONFIGURACJA PROGÓW I WAG SYSTEMOWYCH
// ============================================================================

const SENSITIVITY_THRESHOLDS = Object.freeze({
  strict: 18,      // Tryb szkolny / dziecięcy – blokuje nawet luźne aluzje
  high: 30,        // Domyślny tryb bezpieczny – wymaga wyraźnego kontekstu edukacyjnego dla SENSITIVE
  medium: 48,      // Zbalansowany – przepuszcza neutralne wzmianki i pojedyncze przekleństwa ogólne
  low: 68,         // Liberalny – blokuje wyłącznie jednoznaczny slang seksualny i pornografię
  permissive: 88   // Tylko twarda pornografia, linki NSFW i bezpośrednie nękanie seksualne
});

const CATEGORY_WEIGHTS = Object.freeze({
  HARD_EXPLICIT: 100,
  SOLICITATION_ERP: 85,
  SEXUAL_SLANG: 60,
  AMBIGUOUS_COMBO: 65,
  NSFW_EMOJI_COMBO: 55,
  SENSITIVE_EXCITED: 55,
  SENSITIVE_NEUTRAL: 30,
  SENSITIVE_EDUCATIONAL: 5,
  PROFANITY_SEXUAL_CTX: 45,
  PROFANITY_GENERAL: 15,
  SUSPICIOUS_MEDIA_FILE: 40,
  OBFUSCATION_PENALTY: 20
});

// ============================================================================
// 2. LEKSYKONY GŁÓWNE ("rdzen" = prefiks/fleksja, "=slowo" = dokładny token)
// Wszystko bez polskich znaków – normalizacja usuwa diakrytyki przed analizą.
// ============================================================================

/**
 * Jawna pornografia: serwisy, gatunki, wulgarne czasowniki/nazwy narządów.
 * Waga bazowa: 100, bez wyjątków edukacyjnych.
 */
const HARD_EXPLICIT = [
  // Serwisy i platformy pornograficzne / cam / adult
  'pornhub', 'xvideo', 'xhamster', '=xnxx', 'redtube', 'youporn', 'brazzers', 'onlyfans', 'fansly',
  'chaturbate', 'stripchat', 'bongacams', 'livejasmin', 'spankbang', 'eporner', 'tnaflix', 'nhentai',
  'manyvids', 'clips4sale', 'faphouse', 'motherless', 'rule34', '=r34', 'xxxvideo', 'youjizz',
  'roksa', 'odloty', 'zbiornik', 'showup', 'eroplace', 'cam4', 'myfreecams', 'camwhores',
  'realitykings', 'mofos', 'bangbros', 'naughtyamerica', 'digitalplayground', 'vixen', 'tushy',
  'blacked', 'deeper', 'slayed', 'fakehub', 'faketaxi', 'publicagent', 'czechhunter', 'biempire',
  'hanime', 'hentaihaven', 'gelbooru', 'danbooru', 'e621', 'furaffinity', 'literotica', 'sexstories',
  'xmovies', 'beeg', 'hqporner', 'daftsex', 'sxyprn', 'txxx', 'vjav', 'javhd', 'javbus', 'javlibrary',

  // Pornografia – slang i formaty (formalne "pornografia" jest w SENSITIVE_TOPIC)
  '=porn', '=porno', '=pornos', '=porniak', '=porniaki', '=pornole', 'pornol', 'pornus', 'pornstar',
  'pornosy', 'pornhd', '=xxx', '=nsfw', '=jav', 'hentai', 'hentaj', '=ecchi', 'ahegao', '=yiff', '=futa',
  'futanari', 'sextape', 'sexcam', 'sexchat', 'seksczat', 'camgirl', 'camboy', 'camwhore', 'nudesy',
  '=nudes', 'nudziaki', 'golaski', 'cybersex', 'cyberseks', 'eroporno', 'softporn', 'hardporn',
  'childporn', '=cp_porn', 'deepfakeporn', 'revengporn', 'revengeporn', 'patostream_nsfw',

  // Gatunki, praktyki i akty pornograficzne PL/EN
  'blowjob', 'handjob', 'footjob', 'rimjob', 'titjob', 'boobjob', 'paizuri', 'deepthroat', 'gagging',
  'cumshot', 'cumslut', 'cumdump', 'cumjar', 'creampie', 'bukkake', 'gokkun', 'gangbang', 'threesome',
  'foursome', 'moresome', 'fisting', 'pegging', 'felching', 'snowballing', 'facesitting', 'queening',
  'anilingus', 'rimming', 'cunnilingus', 'fellatio', 'autofellatio', 'irrumatio', 'tribadism', 'scissoring',
  'milf', '=dilf', '=gilf', 'stepsis', 'stepmom', 'stepsister', 'stepbro', 'stepdad', 'stepdaughter',
  'analsex', '=analny', '=analna', '=analnie', '=analnego', '=analnym', '=analne', 'anal_sex',
  'doublepenetration', 'triplepenetration', 'dp_sex', 'ass2mouth', 'a2m', 'atm_sex', 'bareback',
  'breeding_kink', 'cnc_kink', 'freeuse', 'gloryhole', 'dogging', 'upskirt', 'downblouse', 'voyeurporn',
  'obciag', 'obciagani', 'lodzik', 'loda_robi', 'minetk', '=minete', '=mineta', '=minety', 'trzepanie_gruchy',
  'walenie_konia', 'walic_konia', 'bicie_piany', 'spust_na', 'spuscic_sie', 'spuscil_sie', 'wytrysk_na',

  // Wulgarne czasowniki seksualne PL
  'rucha', 'ruchan', 'ruchn', 'wyrucha', 'zarucha', 'przerucha', 'poruch', 'wyruch', 'ruchacz',
  'dojebac_w_dupe', 'zerzna', 'zerznie', 'zerznal', 'zerznela', 'wyjebal_ja', 'wyjebie_cie',
  'wydymac', 'wydymal', 'wydymana', 'zaciagnac_do_lozka', 'posuwac_ja', 'posuwal_ja',

  // Wulgarne nazwy narządów i wyzwiska stricte seksualne PL/EN
  'cipk', '=cipa', '=cipy', '=cipe', '=cipie', '=cipo', 'cipsk', 'pipk', 'kutas', 'fiut', 'chujek', 'pizdk',
  'pizdzisk', 'knaga', 'pyta_chuj', 'stulej', 'naplet', 'moszna_wulg', 'jajca_wulg',
  '=cock', '=cocks', 'cocksuck', 'pussy', 'pussies', '=dick', '=dicks', 'dickpic', 'dickhead',
  '=tits', '=titties', 'boobies', '=cunt', '=cunts', '=slut', '=sluts', 'slutty', '=whore', '=whores',
  '=horny', '=cum', 'cumming', '=jizz', '=spunk', 'twat', 'clit', 'boner', 'hardon', 'cameltoe',
  'nippleslip', 'nipslip', 'sideboob', 'underboob', 'bitchtits', 'fleshlight', 'buttplug'
];

/**
 * Slang seksualny / uprzedmiotawiający – silny sygnał intencji, NIE neutralizowany nauką.
 * Waga bazowa: 60.
 */
const SEXUAL_SLANG = [
  // Czasowniki slangowe
  'bzyka', 'bzykn', 'bzykan', 'przebzyk', 'wybzyk', '=dymac', '=dyma', '=dymam', '=dymal', '=dymala',
  'wydyma', 'przedyma', 'jebanko', 'ruchanko', 'dupczy', 'dupcz', 'wydymk', 'popieprzyc', 'pieprzenie_sie',
  'numerek', 'szybki_numerek', 'zaliczyc_laske', 'przeleciec_ja', 'puknac_ja', 'zrobic_loda', 'robic_loda',
  'robic_pale', 'ssac_pale', 'brac_do_buzi', 'polykac_sperme', 'zrobic_minete', 'palcowk', 'palcowac',
  'jechanie_na_recznym', 'marszczyc_freda', 'trzepac_kapucyna', 'pucowac_torpede', 'glaskac_wacusia',

  // Części ciała w ujęciu slangowym / erotycznym
  'cycki', '=cyce', 'cycusz', 'cycat', 'cyck', 'dupeczk', 'dupcia', '=dupci', 'tyleczek', 'tyleczk',
  'balony_cycki', 'zderzaki', 'melony_piersi', 'sterczace_sutki', 'mokra_szparka', 'szparka',
  'kuciapk', 'muszelk', 'ptaszek_penis', 'wacus', 'fujark', ' zaganiacz', 'pyton_w_spodniach',
  'wzwodzik', 'stojak_penis', 'namiot_w_majtkach',

  // Przymiotniki i określenia osób / zachowań
  '=sexy', 'seksown', '=seksi', '=sexi', 'sexown', 'napalon', 'napalen', 'wyposzczon', 'niewyzyt',
  'zboczeniec', 'zboczenc', 'zboczuch', 'perwers', 'pervert', 'dewiant', 'podgladacz', 'ekshibicjon',
  'dziwk', 'kurewk', 'prostytutk', 'eskortk', '=escort', '=escorts', 'callgirl', 'sponsoring',
  'sugardaddy', 'sugarbaby', 'sugarmama', 'kurtyzan', 'panienka_do_towarzystwa', 'tirówk', 'tirowk',
  'dupodajk', 'puszczalsk', 'zdzir', 'szmaul', 'lafirynd', 'blachar', 'nimfoman', 'seksoholi',
  '=lasencja', 'laseczk', 'dupera', 'foczk', 'goraca_sztuka', 'niezla_dupa', 'fajna_dupa',

  // Gadżety, miejsca, subkultury seksualne
  'striptiz', 'striptease', 'stripper', 'stripclub', 'lapdance', 'poledance_erot', 'burlesk',
  'golas', 'nagusk', 'nagusy', 'rozbieranek', 'rozbierank', 'gra_wstepna', 'macanko', 'obmacywan',
  'wibrator', 'dildo', 'sexshop', 'sekszop', 'sextoy', 'sextoys', 'kulki_gejszy', 'korek_analny',
  'kajdanki_erot', 'pejcz', 'bielizna_erot', 'stringi', 'kabaretki', 'gorset_erot', 'lateks_fetysz',
  'masturbuj', 'masturbowal', 'onanizuj', '=lewd', 'lewds', 'fetysz', 'fetish', '=kink', '=kinky',
  'bondage', '=bdsm', '=domina', 'dominatrix', 'submissive', '=ulegla', '=ulegly', 'sadomaso',
  'swinger', 'swingersi', 'orgia', '=orgie', '=orgii', '=orgy', '=orgies', 'hotwife', 'cuckold',
  'cuckquean', 'dogging', 'cruising', 'nudziak', 'sexting', 'seksting', 'dirty_talk', 'dirtytalk',
  'friends_with_benefits', '=fwb', 'one_night_stand', '=ons', 'hookup', 'bootycall', 'netflix_and_chill'
];

/**
 * Neutralne terminy tematu seksualnego / anatomicznego / reprodukcyjnego.
 * Kontekst decyduje: edukacja/medycyna = OK, ekscytacja/promocja = BLOK.
 * Waga bazowa: 30 (redukowana do 5 w kontekście edukacyjnym, podnoszona do 55 przy ekscytacji).
 */
const SENSITIVE_TOPIC = [
  // Ogólne pojęcia seksualności
  '=sex', '=seks', '=seksu', '=seksie', '=seksem', '=sexu', '=sexem', '=sexie',
  'seksualn', 'sexual', 'seksuolog', 'wspolzyc', 'wspolzyj', 'wspolzyci', 'kopulac', 'copulat',
  'intercourse', 'stosunek_plciow', 'akt_plciow', 'zblizeni', 'intymn', 'intimate', 'inicjacj_seks',
  'orientacj_seks', 'tozsamosc_plciow', 'poped', 'libido', 'pozadani', 'podniec', 'arousal',

  // Anatomia i fizjologia
  'penis', 'pracie', 'pracia', 'praciu', 'fallus', 'phallus', 'wagin', 'vagin', 'pochw', 'pochwy',
  'lechtacz', 'clitor', '=srom', 'sromow', 'moszn', 'scrot', 'jadr_anatom', 'gruczol_krokowy', 'prostat',
  'napletek', 'napletk', 'wedzidelk', 'blona_dziewicza', 'hymen', 'macic', 'uterus', 'jajnik', 'ovary',
  'nasieniowod', 'jajowod', 'gruczoly_sutkowe', 'sutek', 'sutk', 'nipple', 'brodawk_sutkow',
  'biust', 'breasts', 'boobs', 'piersi_anatom', 'pupa', 'posladk', 'buttock', 'odbyt', '=anus', 'rectum',
  'krocze', 'perineum', 'strefy_erogenne', 'erogenous', 'genital', 'genitalia', 'narzady_plciow',
  'narzady_rodne', 'uklad_rozrodcz',

  // Reakcje fizjologiczne i płyny
  'sperm', 'nasieni', 'plemnik', 'semen', 'preejakulat', 'precum', 'śluz_szyjkowy', 'lubrykacj',
  'orgazm', 'orgasm', 'szczytowani', 'climax', 'masturb', 'onaniz', 'autoerotyzm', 'samogwalt',
  'erekc', 'erection', 'wzwod', 'polucj', 'zmazy_nocne', 'ejakul', 'ejacul', 'wytrysk', 'injacul',

  // Reprodukcja, antykoncepcja, medycyna seksualna
  'prezerwatyw', 'condom', 'antykoncep', 'contracept', 'pigułk_dzien_po', 'spirala_domaciczna',
  'wazektomi', 'vasectom', 'ciaza', 'ciazy', 'pregnan', 'zaplodn', 'fertiliz', 'owulacj', 'ovulat',
  'miesiaczk', 'menstruac', 'okres_krwawieni', 'aborcj', 'abortion', 'poronieni', 'bezplodnosc',
  'impotencj', 'zaburzenia_erekcji', 'przedwczesny_wytrysk', 'pochwic', 'vaginismus', 'dyspareuni',
  'choroby_weneryczne', '=std', '=sti', '=hiv', '=aids', 'kiła', 'rzeżączk', 'chlamydi', 'opryszczk_plciow',
  'hpv', 'klykciny',

  // Kultura, prawo, etyka, nagość artystyczna / zjawiska społeczne
  'pornograf', 'pornograph', '=nude', '=nudes_art', '=naked', '=naga', '=nagi', '=nagie', '=nagich',
  '=nago', 'nagosc', 'nudyst', 'nudism', 'naturyzm', 'naturism', 'akt_malarski', 'akt_fotograficzny',
  'erotyk', 'erotycz', 'erotic', 'erotik', 'erotyzm', 'eroty', 'zmyslow', 'sensual', 'kamasutr',
  'prostytuc', 'prostitut', 'nierząd', 'sutener', 'stręczyciel', 'handel_ludzmi', 'praca_seksualna',
  'pedofil', 'pedophil', 'hebephili', 'efebofili', 'zoofil', 'zoophil', 'bestiality', 'nekrofil',
  'necrophil', 'ekshibicjonizm', 'voyeuryzm', 'frotteryzm', 'masochizm', 'sadyzm', 'parafili',
  'gwalt', 'rape', 'zgwalc', 'molestow', 'molest', 'nadurzyci_seks', 'przemoc_seksualna', 'kazirod',
  'incest', 'homoseks', 'heteroseks', 'biseks', 'panseks', 'aseksual', 'lgbt', 'transpl', 'transseks',
  'interpłciow', 'niebinarn', 'queer', 'dziewic', 'virgin', 'cnot', 'celibat', 'czystosc_przedmalzenska',
  '=18+', '18plus', 'pelnoletn', 'cenzura_obyczajowa'
];

/**
 * Wulgaryzmy ogólne (nie zawsze seksualne).
 * Same w sobie dają umiarkowane ryzyko (15); w połączeniu z tematem seksu lub obiektem osobowym – blok.
 */
const PROFANITY = [
  'kurw', 'kurew', 'skurw', 'kurwiszon', 'chuj', '=huj', 'chuja', 'chujow', 'chujni',
  'pierdol', 'pierdziel', 'spierdal', 'wypierdal', 'odpierdal', 'zapierdal', 'rozpierdal',
  'popierdol', 'upierdol', 'dopierdol', 'napierdal', 'jeban', 'jebac', 'jebie', 'jebal', 'jebn',
  'jebi', 'zjeb', 'wyjeb', 'odjeb', 'przyjeb', 'podjeb', 'najeb', 'pojeb', 'rozjeb', 'zajeb',
  'dojeb', 'ujeb', 'pizd', 'pizda', 'pizdo', 'pizdzie', 'wpizdu', 'cwel', 'pedal', 'ciot',
  'szmat', '=suka', '=suki', '=suko', 'sukinsyn', 'skurwysyn', 'skurwiel', 'fuck', 'motherf',
  'fucker', 'fucking', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dumbass', 'jackass',
  '=dupa', '=dupe', '=dupy', '=dupie', 'dupek', 'dupsko', 'zasran', 'gowno', 'gowien', 'gownian',
  'srac', 'sraj', 'nasrac', 'zesrac', 'kutafon', 'debil', 'idiot', 'kretyn', 'imbecyl', 'wkurw',
  'nakurw', 'zakurw', 'wykurw', 'odkurw', 'psiakrew', 'cholera', 'szlag'
];

/**
 * Dwuznaczne czasowniki – w języku potocznym mogą oznaczać agresję, ruch, pracę lub oszustwo,
 * ale stają się wulgarnie seksualne, gdy w ich oknie znajduje się dopełnienie osobowe
 * (np. "jebie dziewczynę", "posuwa laskę", "zaliczył koleżankę", "liże jej").
 */
const AMBIGUOUS_SEX_VERBS = [
  'jeb', 'pierdol', 'posuw', 'rzn', 'rzni', 'zalicz', 'przelec', 'przelecia', 'zerzn',
  'wyjeb', 'zajeb', 'przerzn', 'dupcz', 'pukn', 'puka', 'obraca', 'obrocil', 'wyliz',
  'lize', 'liza', 'lizal', 'ssie', 'ssac', 'ssala', 'possac', 'polyk', 'polknel',
  'fuck', 'bang', 'screw', 'smash', 'breed', 'rail', 'pound', 'hump', 'mount',
  'pieprz', 'wypieprz', 'popieprz', 'bzyk', 'dosiad', 'ujezdz', 'tryka', 'bara',
  'grzmoc', 'wygrzmoc', 'mloc', 'wymloc', 'dziabn', 'uklu', 'nadzia', 'nadziew',
  'zapina', 'zapial', 'zadowol', 'zabawia', 'macal', 'obmac', 'dotyka', 'rozbiera',
  'rozebral', 'sciaga_majtki', 'wklada', 'wsadza', 'wsadzil', 'wepchnal', 'pcha'
];

/**
 * Dopełnienia osobowe (obiekt/ofiara/partner) aktywujące znaczenie seksualne
 * czasownika dwuznacznego w oknie kontekstowym.
 */
const PERSON_OBJECTS = [
  // Kobiety / określenia potoczne i rodzinne
  'dziewczyn', 'kobiet', 'lask', 'laseczk', 'babe', 'babk', 'kolezank', 'przyjaciol',
  'sasiadk', 'nauczycielk', 'szefow', 'sekretark', 'pielęgniark', 'pielegniark', 'studentk',
  'uczennic', 'malolat', 'nastolat', ' blondynk', 'brunetk', 'ruda', 'zone', 'zonk',
  'narzeczon', 'kochank', 'eks', 'była', 'byla', 'matk', 'mamk', 'mamus', 'macoch',
  'siostr', 'kuzynk', 'ciotk', 'cioci', 'babci', 'cork', 'pasierbic', 'szwagierk',
  'tesciow', 'wdow', 'dziewic', 'ksiezniczk', 'modelk', 'aktork', 'influencer',

  // Mężczyźni / określenia potoczne
  'chlopak', 'mezczyzn', 'facet', ' kolesi', 'kolesia', 'typ', 'typa', 'ziomk', 'koleg',
  'przyjaciel', 'sasiad', 'nauczyciel', 'szef', 'student', 'ucznia', 'meza', 'kochank',
  'ojc', 'tat', 'tatusi', 'ojczym', 'brat', 'kuzyn', 'wujk', 'dziadk', 'syn', 'pasierb',
  'szwagr', 'zieci', 'kawaler', 'prawiczk',

  // Zaimki osobowe i zwrotne w przypadkach zależnych (PL/EN)
  '=ja', '=jej', '=nia', '=mnie', '=cie', '=ciebie', '=go', '=mu', '=nim', '=nas', '=was',
  '=ich', '=im', '=nimi', '=sie', '=siebie', '=soba', '=sobie',
  '=her', '=him', '=me', '=you', '=them', '=us', 'myself', 'herself', 'himself', 'yourself',

  // Określenia angielskie
  'girl', 'woman', 'lady', 'chick', 'babe', 'shawty', 'wifey', 'wife', 'gf', 'girlfriend',
  'boyfriend', '=bf', 'sister', 'mom', 'mother', 'Mommy', 'daddy', 'daughter', 'son',
  'teacher', 'babysitter', 'maid', 'nurse', 'boss', 'coworker', 'neighbor', 'stranger',
  'teen', 'schoolgirl', 'virgin', 'bride'
];

// ============================================================================
// 3. LEKSYKONY KONTEKSTOWE (INTENCJA: EDUKACJA vs EKSCYTACJA vs ERP)
// ============================================================================

/**
 * Markery ram edukacyjnych, medycznych, naukowych, prawnych i słownikowych.
 * Neutralizują wagę SENSITIVE_TOPIC, o ile w zdaniu nie ma wulgaryzmów lub ekscytacji.
 */
const EDUCATIONAL_MARKERS = [
  // Definicje i encyklopedia
  '=to_proces', '=jest_to', 'definicj', 'oznacz', 'polega_na', 'zjawisk', 'pojec', 'termin',
  'wedlug', 'zgodnie_z', 'encykloped', 'slownik', 'wikipedi', 'klasyfikacj', 'kategori',
  'charakteryzuj', 'okresla_sie', 'nazywamy', 'rozumie_sie', 'w_znaczeniu', 'etymologi',

  // Nauka, biologia, medycyna, psychologia
  'biologi', 'biologicz', 'medycyn', 'medycz', 'anatomi', 'anatomicz', 'fizjologi', 'fizjologicz',
  'psychologi', 'psychologicz', 'psychiatr', 'seksuologi', 'ginekologi', 'urologi', 'endokrynolog',
  ' dermatolog', 'wenerolog', 'pediatr', 'onkolog', 'diagnoz', 'diagnostyk', 'terapi', 'leczeni',
  'objaw', 'symptom', 'chorob', 'schorzen', 'zaburzen', 'dysfunkcj', 'profilaktyk', 'higien',
  'zdrowi', 'uklad', 'narzad', 'organizm', 'komork', 'hormon', 'testosteron', 'estrogen',
  'progesteron', 'oksytocyn', 'dopamin', 'chromosom', 'genetyk', 'ewolucj', 'rozmnazani',
  'reprodukcj', 'gatunk', 'ssak', 'czlowiek', 'rozwoj', 'dojrzewani', 'pokwitani', 'menopauz',
  'andropauz', 'plodnosc', 'nieplodnosc', 'badani', 'nauk', 'naukow', 'eksperyment', 'statystyk',
  'raport', 'analiz', 'uniwersytet', 'instytut', 'klinik', 'szpital', 'lekarz', 'doktor',
  'pacjent', 'konsultacj', 'recept', 'dawkowani', 'przeciwwskazan', 'skutki_uboczne',

  // Edukacja szkolna, socjologia, historia, sztuka
  'edukacj', 'wychowani', 'szkol', 'lekcj', 'podrecznik', 'program_nauczania', 'wyklad',
  'seminarium', 'konferencj', 'publikacj', 'artykul', 'rozpraw', 'praca_magisterska',
  'socjologi', 'antropologi', 'histori', 'historycz', 'kultur', 'kulturow', 'religi', 'etyk',
  'moraln', 'filozofi', 'literatur', 'sztuk', 'malarstw', 'rzezb', 'muzeum', 'galeri',
  'renesans', 'antyk', 'mitologi',

  // Prawo, kryminalistyka, wiadomości
  'kodeks', 'karny', 'praw', 'prawn', 'ustaw', 'paragraf', 'artykul_kk', 'przestepstw',
  'wykroczeni', 'sad', 'prokuratur', 'policj', 'sledztw', 'zarzut', 'wyrok', 'wiezieni',
  'kara', 'odpowiedzialnosc', 'konwencj', 'prawa_czlowieka', 'ochrona_nieletnich', 'statut',
  'regulamin', 'polityka_prywatnosci', 'moderacj', 'filtr', 'detekcj', 'algorytm',

  // Odpowiedniki EN
  'definition', 'meaning', 'biology', 'biological', 'medical', 'medicine', 'anatomy', 'anatomical',
  'physiology', 'psychology', 'clinical', 'health', 'healthcare', 'disease', 'disorder', 'symptom',
  'treatment', 'therapy', 'diagnosis', 'doctor', 'physician', 'patient', 'hospital', 'science',
  'scientific', 'research', 'study', 'studies', 'university', 'education', 'educational', 'textbook',
  'history', 'historical', 'legal', 'law', 'statute', 'crime', 'criminal', 'court', 'encyclopedia',
  'reproduction', 'reproductive', 'evolution', 'species', 'organism'
];

/**
 * Markery ekscytacji, pożądania, oceniania atrakcyjności, namawiania i promocji NSFW.
 * W obecności SENSITIVE_TOPIC podnoszą ryzyko i blokują tarczę edukacyjną.
 */
const EXCITEMENT_MARKERS = [
  // Zachwyt, ocena wulgarna / potoczna
  'zajebist', 'zajebiscie', 'podniecaj', 'podnieca', 'jaram_sie', 'jara_mnie', 'kręci_mnie',
  'kreci_mnie', 'uwielbiam', 'kocham_to', 'najlepsz', 'cudown', 'bosk', 'przepiekn',
  'gorac', 'soczyst', 'apetyczn', 'zmyslow', 'kusząc', 'kuszac', 'niegrzeczn', 'zboczon',
  'mokry', 'mokra', 'mokre', 'wilgotn', 'twardy', 'sztywn', 'pulsuj', 'goracy', 'namiętn',
  'namietn', 'dziki', 'ostro', 'na_ostro', 'bez_trzymanki', 'do_konca', 'gleboko', 'mocniej',
  'szybciej', 'wolniej', 'ach', 'och', 'mmm', 'uuch',

  // Pragnienie i intencja pierwszoosobowa
  'chce_mi_sie', 'mam_ochote', 'marze_o', 'pragne', 'pożądam', 'pozadam', 'nie_moge_sie_doczekac',
  'zrobmy_to', 'chodz_do_lozka', 'pokaz_mi', 'wyslij_mi', 'daj_mi', 'zrob_mi', 'dotknij',
  'pocaluj', 'rozbierz', 'zdejmij', 'wypnij', 'rozchyl', 'wloz', 'wsadz', 'spusc_sie',
  'chcialbym_cie', 'chcialabym_cie', 'zrobie_ci', 'zrobilbym_ci',

  // Promocja, linkowanie, szukanie treści
  'zobacz_jak', 'obejrzyj', 'darmow', 'bez_rejestracji', 'bez_limitu', 'pelne_wideo',
  'wyciek', 'leaked', 'ukryta_kamera', 'amatorsk', 'domowe_wideo', 'gorace_zdjecia',
  'prywatne_zdjecia', 'kliknij_tutaj', 'link_w_bio', 'zapraszam_na_priv', 'pisz_priv',
  'szukam_chinta', 'szukam_pana', 'szukam_pani', 'sponsorowane', 'za_kase', 'odplatnie',

  // Odpowiedniki EN
  'awesome', 'amazing', 'so_hot', 'turn_on', 'turned_on', 'turns_me_on', 'make_me_wet',
  'so_wet', 'so_hard', 'deep_inside', 'harder', 'faster', 'deeper', 'moan', 'moaning',
  'begging', 'craving', 'wanna_fuck', 'want_to_fuck', 'let_us_fuck', 'send_nudes',
  'show_me_your', 'take_off_your', 'free_video', 'full_video', 'leaked_tape', 'uncensored',
  'watch_now', 'click_here', 'dm_me', 'link_in_bio', 'custom_content', 'exclusive_content'
];

/**
 * Wzorce bezpośredniego nagabywania seksualnego (Solicitation) oraz Erotic Roleplay (ERP).
 * Wykrywane jako wielowyrazowe frazy lub bliskie kolokacje. Waga: 85.
 */
const SOLICITATION_ERP_PATTERNS = [
  /\b(wyslij|pokaz|daj|rzuc)\s+(mi\s+)?(swoje\s+)?(nudes\w*|nudziak\w*|cyck\w*|piersi|cipk\w*|fiut\w*|kutas\w*|dupk\w*|zdjeci\w*\s+nago)\b/i,
  /\b(send|show|dm)\s+(me\s+)?(your\s+)?(nudes|tits|boobs|pussy|dick|cock|ass|bobs|vegans|body)\b/i,
  /\b(chcesz|masz\s+ochote|idziemy|chodz)\s+(sie\s+)?(poruchac|pobzykac|uprawiac\s+seks|do\s+lozka|na\s+szybki\s+numerek|pokochac)\b/i,
  /\b(zrobisz|zrob)\s+(mi\s+)?(loda|lodzika|minete|minetke|dobrze\s+ustami|dobrze\s+reka)\b/i,
  /\b(wylize|wylizalbym|pocaluje|rozbiore|zerzne|wyrucham|wydymam|przelece)\s+(cie|ci|twoj\w*)\b/i,
  /\b(rozchyl\w*|wypnij\w*|zdejmij\w*|sciagnij\w*)\s+(nogi|uda|majtki|stanik|bielizne|spodnie|sukienke)\b/i,
  /\b(wkladam|wsadzam|wsuwam)\s+(ci|w\s+ciebie|do\s+twojej|swojego)\b/i,
  /\*\s*(rozbiera|caluje\s+po\s+szyi|dotyka\s+jej\s+ud|wklada\s+reke\s+w\s+majtki|sciaga\s+bielizne|popycha\s+na\s+lozko|steka\s+z\s+rozkoszy)\b/i,
  /\*\s*(undresses|kisses\s+neck|touches\s+thighs|slides\s+hand\s+into|pushes\s+onto\s+bed|moans\s+softly|unzips\s+pants)\b/i,
  /\b(szukam|poznaj\w*)\s+(sponsora|uleglej|uleglego|dominy|chetnej\s+na\s+seks|kogos\s+na\s+seks|fwb|ons)\b/i,
  /\b(ile\s+bierzesz\s+za|za\s+ile\s+robisz)\s+(godzine|caly\s+noc|loda|seks|spotkanie\s+w\s+hotelu)\b/i
];

/**
 * Markery negacji lokalnej – obecność przed markerem ekscytacji ("nie lubię", "brzydzi mnie")
 * neutralizuje pozytywne nacechowanie ekscytacji.
 */
const NEGATION_MARKERS = new Set([
  'nie', 'ani', 'wcale', 'nigdy', 'zaden', 'zadna', 'zadne', 'zadnych', 'bez',
  'brzydzi', 'obrzydz', 'nienawidz', 'odrzuca', 'wstret', 'stop', 'przeciw',
  'zakaz', 'blokuj', 'unikaj', 'szkodliw', 'niebezpieczn', 'uzaleznieni', 'problem',
  'not', 'never', 'no', 'without', 'hate', 'disgust', 'disgusting', 'against', 'stop', 'avoid'
]);

// ============================================================================
// 4. BIAŁA LISTA (SCUNTHORPE SAFE-WORDS) – OCHRONA PRZED FALSE POSITIVES
// ============================================================================

/**
 * Słowa zawierające podciągi wyglądające jak rdzenie wulgarne/seksualne
 * (np. "sekcja", "insekt", "dokument", "kura", "szampon", "analiza", "tytul").
 * Dokładne dopasowanie lub prefiks z tej listy chroni token przed błędnym tagowaniem.
 */
const SAFE_WORDS_EXACT = new Set([
  // Rdzeń "seks" / "sex"
  'sekcj', 'sekcja', 'sekcji', 'sekcje', 'sekcyjny', 'sektor', 'sektory', 'sektorze',
  'sekret', 'sekretarz', 'sekretarka', 'sekretn', 'sekwencj', 'sekwencja', 'sekwencji',
  'sekund', 'sekunda', 'sekundy', 'sekundnik', 'sekularyz', 'sekularn', 'sekatorem', 'sekator',
  'seksant', 'sekstans', 'sekstet', 'seksta', 'insekt', 'insekty', 'insektow', 'uniseks', 'unisex',
  'middlesex', 'essex', 'sussex', 'wessex', 'sexton', 'sextant', 'bisect', 'intersect', 'dissect',

  // Rdzeń "anal"
  'analiz', 'analiza', 'analizy', 'analizie', 'analize', 'analizowac', 'analizuje', 'analityk',
  'analityczn', 'analog', 'analogia', 'analogii', 'analogow', 'analogiczn', 'analfabet',
  'analgetyk', 'analekta', 'annaly', 'kanal', 'kanaly', 'kanalu', 'kanalizacj', 'banal', 'banaln',

  // Rdzeń "cum" / "tit" / "cock" / "dick" / "ass" / "pussy" / "futa" / "jap"
  'document', 'dokument', 'dokumenty', 'dokumentacj', 'cumul', 'cumulative', 'cumulus',
  'cucumber', 'incumbent', 'succumb', 'circumstance', 'circumference', 'magna_cum_laude',
  'title', 'titles', 'titled', 'tytul', 'tytuly', 'tytulem', 'titan', 'titanium', 'titanic',
  'titrate', 'titration', 'constitu', 'institut', 'substitut', 'prostitut_safe', 'entitl',
  'entity', 'entities', 'identity', 'quantity', 'petit', 'petition', 'competit', 'repetit',
  'appetit', 'superstit', 'stitch', 'attitude', 'latitude', 'altitude', 'multitude', 'gratitude',
  'cockpit', 'cocktail', 'peacock', 'woodcock', 'shuttlecock', 'hitchcock', 'hancock', 'babcock',
  'dickens', 'dicky', 'dictat', 'diction', 'dictionary', 'predict', 'verdict', 'addict', 'contradict',
  'indict', 'jurisdict', 'benedict', 'assault', 'assemble', 'assembly', 'assert', 'assess',
  'assessment', 'asset', 'assets', 'assign', 'assignment', 'assist', 'assistant', 'associate',
  'association', 'assume', 'assumption', 'assure', 'assurance', 'compass', 'pass', 'passage',
  'passenger', 'passion', 'passive', 'passport', 'password', 'mass', 'massive', 'massage',
  'class', 'classic', 'classify', 'glass', 'grass', 'brass', 'embassy', 'ambassador', 'harass',
  'embarrass', 'cassette', 'casserole', 'chassis', 'bass', 'pussycat', 'pussywillow',
  'futon', 'future', 'futurism', 'futuristic', 'refute',

  // Rdzeń "kurw" / "kura" / "chuj" / "jeb" / "pierd" / "pizd" / "cip" / "suk" / "dup" / "rucha" / "dyma"
  'kura', 'kury', 'kurze', 'kure', 'kurczak', 'kurczaki', 'kurczaka', 'kurnik', 'kurort',
  'kurier', 'kurierzy', 'kuriera', 'kurator', 'kuratorium', 'kuracjusz', 'kuracja', 'kuracji',
  'kurek', 'kurki', 'kurka', 'kurtyna', 'kurtyny', 'kurz', 'kurzu', 'kurzyc', 'odkurzacz',
  'odkurzac', 'konkurs', 'konkursy', 'kurs', 'kursy', 'kursu', 'kursant', 'ekskursj', 'dyskurs',
  'prekursor', 'kuriozum', 'kuriozaln', 'kuri', 'kuria', 'kurii', 'kurtk', 'kurtka', 'kurtki',
  'kurcz', 'skurcz', 'skurcze', 'rozszerz', 'kurхан', 'kurant',
  'rachuj', 'wywiazuj', 'zobowiazuj', 'kojarz', 'cechuj', 'sluchaj', 'dmuchaj', 'kucharsk',
  'zuchwal', 'ruchom', 'ruchomy', 'ruchome', 'nieruchom', 'nieruchomosc', 'rozruch', 'odruch',
  'wybuch', 'podmuch', 'posluch', 'rozmach', 'brzuch', 'lancuch', 'kożuch', 'kozuch', 'maluch',
  'paluch', 'zuch', 'duch', 'duchow', 'sluch', 'węch', 'wech', 'gruczol', 'krucho', 'kruche',
  'uruchom', 'uruchamia', 'uruchomic', 'porusz', 'wzrusz', 'okruch', 'wierch',
  'dym', 'dymu', 'dymy', 'dymic', 'dymny', 'zadym', 'zadymiarz', 'anonim', 'synonim', 'akronim',
  'pseudonim', 'pantomim', 'intymnosc_safe', 'optymaln', 'maksymaln', 'minimaln', 'klimat',
  'suka_pies', 'sukces', 'sukcesy', 'sukcesu', 'sukcesj', 'sukni', 'suknia', 'sukienk', 'sukienka',
  'sukno', 'sukna', 'sukulent', 'fuksj', 'luksus', 'boks', 'koks', 'pejs', 'rejs',
  'duplikat', 'duplikow', 'dupleks', 'duplo', 'duszpasterz', 'duszno', 'dusza',
  'pukac_do_drzwi', 'zapukac', 'opukac', 'wypukl', 'wypukly', 'pukiel', 'puklerz',
  'lizak', 'lizaki', 'lizaka', 'lizard', 'lizbon', 'analiza_safe', 'kataliz', 'paraliz',
  'walizk', 'ślizg', 'slizg', 'blizn', 'bielizn', 'ojczyzn', 'plaszczyzn', 'zczytywac',
  'ssak', 'ssaki', 'ssakow', 'ssawka', 'ssanie_silnika', 'ambasad', 'passa', 'kassa',
  'barak', 'baran', 'barank', 'barok', 'barometr', 'baron', 'barykad', 'baryton', 'rabarbar',
  'trykot', 'trybun', 'trybunal', 'trybut', 'trylogi', 'tryb', 'tryby', 'atrybut', 'dystrybucj',
  'obracac_w_zart', 'obracac_glowe', 'obracac_monete', 'obraczk', 'obraczka',
  'zaliczyc_egzamin', 'zaliczyc_przedmiot', 'zaliczyc_semestr', 'zaliczeni', 'zaliczka',
  'przeleciec_samolotem', 'przelot', 'przelotn', 'odlotow',
  'szampon', 'szampan', 'szambelan', 'szamot', 'szata', 'szatni', 'szach', 'szacunek', 'szal',
  'szalik', 'szalup', 'szaman', 'szansa', 'szantaz', 'szarlotk', 'szarp', 'szarz', 'szereg',
  'cipa_safe', 'cip_karta', 'chip', 'chipy', 'scipion', 'emancypacj', 'partycypacj', 'pryncypi',
  'dyscyplin', 'incydent', 'pacyfik', 'specyfik', 'klasyfik', 'weryfik', 'modyfik', 'certyfikat',
  'penetrowac_rynek', 'penetracja_rynku', 'erekcja_budynku'
]);

/**
 * Bezpieczne kolokacje dwuwyrazowe (bigramy), które neutralizują dwuznaczne czasowniki
 * (np. "puka do drzwi", "zaliczył egzamin", "obraca się wokół", "liże lody").
 */
const SAFE_COLLOCATIONS = [
  /\bpuka\w*\s+(do\s+drzwi|w\s+okno|w\s+czolo|w\s+glowe|w\s+stol)\b/i,
  /\bzalicz\w*\s+(egzamin|test|kolokwium|semestr|rok|przedmiot|kurs|glebe|wpadke|zgon)\b/i,
  /\bprzelec\w*\s+(samolot\w*|przez\s+glowe|przez\s+palce|wzrokiem|tekst|ksiazke|strony)\b/i,
  /\bobrac\w*\s+(sie\s+wokol|w\s+zart|w\s+proch|w\s+niwecz|kierownica|glowe|strone|kapital)\b/i,
  /\b(lize|lizac|wyliz\w*)\s+(lod\w*|lizak\w*|rane|rany|talerz|miske|lape|znaczek)\b/i,
  /\b(ssie|ssac)\s+(kciuk|palec|smoczek|mleko|cukierek|paliwo|powietrze)\b/i,
  /\b(suka|suki|suczka)\s+(psa|owczarka|labradora|hodowlana|szczeni\w*|rasy|weterynarz)\b/i,
  /\b(rucha\w*|ruch)\s+(uliczn\w*|drogow\w*|pieszy|oporu|wskazowek|jednostajn\w*|obrotow\w*|ziemi)\b/i,
  /\b(stosunek)\s+(pracy|prawny|objetosciowy|masowy|procentowy|liczbowy|dyplomatyczny|przerywany_safe)\b/i,
  /\b(okres)\s+(czasu|probny|wypowiedzenia|rozliczeniowy|historyczny|dojrzewania|poltrwania|gwarancji)\b/i,
  /\b(akt)\s+(notarialny|urodzenia|zgonu|malzenstwa|prawny|oskarzenia|laski|wlasnosci|tworczy)\b/i,
  /\b(czlonek)\s+(zarzadu|partii|rodziny|zespolu|komisji|organizacji|klubu|akademii|unii|nato)\b/i
];

// ============================================================================
// 5. DETEKTORY EMOJI, HOMOGLIFÓW I OBFUSKACJI
// ============================================================================

/** Pojedyncze emoji silnie kojarzone z erotyką i seksem. */
const NSFW_EMOJIS_SINGLE = new Set(['🔞']);

/** Emoji sugestywne – pojedynczo neutralne, ale w kombinacjach lub przy tekście NSFW podnoszą wynik. */
const SUGGESTIVE_EMOJIS = new Set([
  '🍆', '🍑', '💦', '🍌', '🍒', '👅', '🫦', '🥵', '🤤', '😏', '😈', '👙', '🩲', '💋', '👌', '👈', '👉', '👆', '🛌', '🚿', '🍯', '🥛'
]);

/** Sekwencje kombinacji emoji o jednoznacznym podtekście seksualnym. */
const NSFW_EMOJI_COMBOS = [
  /🍆\s*🍑/, /🍑\s*🍆/, /🍆\s*💦/, /🍑\s*💦/, /👅\s*🍑/, /👅\s*🍒/, /👅\s*💦/,
  /👉\s*👌/, /👈\s*👌/, /🍌\s*🍩/, /🍌\s*💦/, /🍒\s*💦/, /🥵\s*💦/, /🫦\s*🍆/,
  /🍆\s*👄/, /🍆\s*👅/, /🍑\s*👋/, /🛌\s*💑\s*💦/
];

/** Mapa homoglifów (Cyrylica, Greka, znaki matematyczne i pełnoszerokie -> odpowiedniki ASCII). */
const HOMOGLYPH_MAP = Object.freeze({
  // Cyrylica mala i wielka wygladajaca jak lacina (Unicode escapes)
  '\u0430': 'a', '\u0410': 'a', '\u0432': 'b', '\u0412': 'b', '\u0441': 'c', '\u0421': 'c', '\u0435': 'e', '\u0415': 'e',
  '\u043D': 'h', '\u041D': 'h', '\u0456': 'i', '\u0406': 'i', '\u0457': 'i', '\u0458': 'j', '\u043A': 'k', '\u041A': 'k',
  '\u043C': 'm', '\u041C': 'm', '\u043E': 'o', '\u041E': 'o', '\u0440': 'p', '\u0420': 'p', '\u0455': 's', '\u0405': 's',
  '\u0442': 't', '\u0422': 't', '\u0443': 'y', '\u0423': 'y', '\u0445': 'x', '\u0425': 'x',
  // Greka
  '\u03B1': 'a', '\u03B2': 'b', '\u03B5': 'e', '\u03B9': 'i', '\u03BA': 'k', '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p',
  '\u03C4': 't', '\u03C5': 'u', '\u03C7': 'x',
  // Polskie diakrytyki i znaki europejskie
  '\u0105': 'a', '\u0107': 'c', '\u0119': 'e', '\u0142': 'l', '\u0144': 'n', '\u00F3': 'o', '\u015B': 's', '\u017A': 'z', '\u017C': 'z',
  '\u00E4': 'a', '\u00E1': 'a', '\u00E0': 'a', '\u00E2': 'a', '\u00E3': 'a', '\u00E5': 'a', '\u00E6': 'ae',
  '\u00E7': 'c', '\u010D': 'c', '\u010F': 'd', '\u0111': 'd',
  '\u00EB': 'e', '\u00E9': 'e', '\u00E8': 'e', '\u00EA': 'e', '\u011B': 'e',
  '\u00EF': 'i', '\u00ED': 'i', '\u00EC': 'i', '\u00EE': 'i',
  '\u00F1': 'n', '\u0148': 'n',
  '\u00F6': 'o', '\u00F4': 'o', '\u00F5': 'o', '\u00F8': 'o',
  '\u0159': 'r', '\u0161': 's', '\u00DF': 'ss', '\u0165': 't',
  '\u00FC': 'u', '\u00FA': 'u', '\u00F9': 'u', '\u00FB': 'u', '\u016F': 'u',
  '\u00FD': 'y', '\u00FF': 'y', '\u017E': 'z'
});

/**
 * Mapa Leetspeak – zamiana cyfr i symboli wewnątrz wyrazów na litery.
 * Stosowana selektywnie do tokenów mieszanych (litery + cyfry/symbole).
 */
const LEETSPEAK_MAP = Object.freeze({
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'l',
  '€': 'e',
  '¥': 'y'
});

/** Wzorce podejrzanych nazw plików i parametrów URL. */
const SUSPICIOUS_FILE_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|flv|wmv|gif|jpg|jpeg|png|webp|zip|rar|7z|Iso)$/i;
const ADULT_TLD_REGEX = /\.(xxx|porn|sex|adult|cam|webcam|ero|tube)\b/i;

// ============================================================================
// 6. KOMPILACJA I INDEKSOWANIE LEKSYKONÓW (OPTYMALIZACJA O(1) / PREFIKSY)
// ============================================================================

/**
 * Przetwarza surową tablicę leksykonu na zoptymalizowaną strukturę:
 * - exactSet: Set dla błyskawicznego sprawdzania dokładnych tokenów (=slowo)
 * - prefixes: Posortowana tablica rdzeni prefiksowych
 * - multiWordPhrases: Tablica fraz wielowyrazowych (z podkreślnikami zamienionymi na spacje)
 */
function compileLexicon(rawList, categoryName, baseWeight) {
  const exactSet = new Set();
  const prefixes = [];
  const multiWordPhrases = [];

  for (const rawEntry of rawList) {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) continue;

    if (entry.startsWith('=')) {
      const exactToken = entry.slice(1).replace(/_/g, ' ');
      if (exactToken.includes(' ')) {
        multiWordPhrases.push({ phrase: exactToken, raw: rawEntry, category: categoryName, weight: baseWeight });
      } else {
        exactSet.add(exactToken);
      }
    } else if (entry.includes('_')) {
      const phrase = entry.replace(/_/g, ' ');
      multiWordPhrases.push({ phrase, raw: rawEntry, category: categoryName, weight: baseWeight });
    } else {
      prefixes.push(entry);
    }
  }

  // Sortowanie od najdłuższego prefiksu, aby dopasować najbardziej szczegółowy rdzeń
  prefixes.sort((a, b) => b.length - a.length);

  // Indeksowanie prefiksów po pierwszych 2 znakach dla przyspieszenia wyszukiwania
  const prefixIndex = new Map();
  for (const prefix of prefixes) {
    const key = prefix.slice(0, 2);
    if (!prefixIndex.has(key)) {
      prefixIndex.set(key, []);
    }
    prefixIndex.get(key).push(prefix);
  }

  return Object.freeze({
    category: categoryName,
    baseWeight,
    exactSet,
    prefixes,
    prefixIndex,
    multiWordPhrases
  });
}

const COMPILED_LEXICONS = Object.freeze({
  HARD_EXPLICIT: compileLexicon(HARD_EXPLICIT, 'HARD_EXPLICIT', CATEGORY_WEIGHTS.HARD_EXPLICIT),
  SEXUAL_SLANG: compileLexicon(SEXUAL_SLANG, 'SEXUAL_SLANG', CATEGORY_WEIGHTS.SEXUAL_SLANG),
  SENSITIVE_TOPIC: compileLexicon(SENSITIVE_TOPIC, 'SENSITIVE_TOPIC', CATEGORY_WEIGHTS.SENSITIVE_NEUTRAL),
  PROFANITY: compileLexicon(PROFANITY, 'PROFANITY', CATEGORY_WEIGHTS.PROFANITY_GENERAL),
  AMBIGUOUS_SEX_VERBS: compileLexicon(AMBIGUOUS_SEX_VERBS, 'AMBIGUOUS_SEX_VERB', 0),
  PERSON_OBJECTS: compileLexicon(PERSON_OBJECTS, 'PERSON_OBJECT', 0),
  EDUCATIONAL: compileLexicon(EDUCATIONAL_MARKERS, 'EDUCATIONAL', 0),
  EXCITEMENT: compileLexicon(EXCITEMENT_MARKERS, 'EXCITEMENT', 0)
});

// ============================================================================
// 7. POTOK NORMALIZACJI TEKSTU (DE-OBFUSKACJA)
// ============================================================================

/**
 * Analizuje i wyciąga informacje o emoji zanim zostaną usunięte z tekstu.
 */
function analyzeEmojis(rawText) {
  const foundSingleNsfw = [];
  const foundSuggestive = [];
  const foundCombos = [];

  for (const char of rawText) {
    if (NSFW_EMOJIS_SINGLE.has(char)) {
      foundSingleNsfw.push(char);
    } else if (SUGGESTIVE_EMOJIS.has(char)) {
      foundSuggestive.push(char);
    }
  }

  for (const comboRegex of NSFW_EMOJI_COMBOS) {
    const match = rawText.match(comboRegex);
    if (match) {
      foundCombos.push(match[0]);
    }
  }

  return {
    hasHardNsfwEmoji: foundSingleNsfw.length > 0,
    hasNsfwCombo: foundCombos.length > 0,
    suggestiveCount: foundSuggestive.length,
    foundSingleNsfw,
    foundSuggestive: [...new Set(foundSuggestive)],
    foundCombos
  };
}

/**
 * Rozbija nazwy plików, adresy URL oraz notacje camelCase / PascalCase / snake_case
 * na osobne słowa możliwe do przetworzenia przez tokenizer.
 */
function expandIdentifiersAndFiles(text) {
  let hasMediaExtension = false;
  let hasAdultTld = false;

  if (SUSPICIOUS_FILE_EXTENSIONS.test(text)) {
    hasMediaExtension = true;
  }
  if (ADULT_TLD_REGEX.test(text)) {
    hasAdultTld = true;
  }

  // Rozbicie camelCase: "hotStepsisVideo" -> "hot Stepsis Video"
  let expanded = text.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2');
  expanded = expanded.replace(/([A-ZĄĆĘŁŃÓŚŹŻ]+)([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż])/g, '$1 $2');

  // Zamiana separatorów ścieżek i nazw plików na spacje (z zachowaniem cyfr 18+)
  expanded = expanded.replace(/[_\/\\\-+=~]+/g, ' ');

  return {
    expandedText: expanded,
    hasMediaExtension,
    hasAdultTld
  };
}

/**
 * Główna funkcja normalizująca tekst wejściowy:
 * 1. Usuwa znaki niewidoczne (zero-width spaces, joiners, soft hyphens).
 * 2. Zamienia homoglify i znaki diakrytyczne na czyste ASCII.
 * 3. Skleja rozstrzelone litery (np. "s e k s", "p.o.r.n.o", "s-e-x").
 * 4. Dekoduje leetspeak ("s3ks", "p0rn0", "j3b4c").
 * 5. Redukuje wielokrotne powtórzenia znaków ("seeeeeks" -> "seks").
 */
function normalizeText(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return {
      normalized: '',
      tokens: [],
      obfuscationScore: 0,
      obfuscationFlags: []
    };
  }

  const obfuscationFlags = [];
  let obfuscationScore = 0;

  // Krok 1: Usunięcie znaków Zero-Width, kontroli kierunku tekstu i невидимых separatorów
  const zeroWidthRegex = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g;
  if (zeroWidthRegex.test(rawInput)) {
    obfuscationFlags.push('ZERO_WIDTH_CHARS');
    obfuscationScore += 15;
  }
  let text = rawInput.replace(zeroWidthRegex, '');

  // Krok 2: Rozbicie camelCase i separatorów plikowych
  const { expandedText } = expandIdentifiersAndFiles(text);
  text = expandedText.toLowerCase();

  // Krok 3: Mapowanie homoglifów (Cyrylica / Greka / Diakrytyki PL)
  let homoglyphCount = 0;
  let asciiChars = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (HOMOGLYPH_MAP[ch]) {
      // Sprawdzamy czy to obcy alfabet (cyrylica/greka) użyty wewnątrz tekstu
      const code = ch.charCodeAt(0);
      if (code >= 0x0370 && code <= 0x052F) {
        homoglyphCount++;
      }
      asciiChars.push(HOMOGLYPH_MAP[ch]);
    } else {
      asciiChars.push(ch);
    }
  }
  text = asciiChars.join('');

  // Dodatkowy fallback Unicode NFKD dla pozostałych znaków akcentowanych
  text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  if (homoglyphCount > 0) {
    obfuscationFlags.push('HOMOGLYPH_SUBSTITUTION');
    obfuscationScore += Math.min(25, homoglyphCount * 8);
  }

  // Krok 4: Zabezpieczenie tokenu specjalnego "18+" przed wyczyszczeniem znaków interpunkcyjnych
  text = text.replace(/\b18\s*\+/g, ' 18plus ');

  // Krok 5: Sklejanie rozstrzelonych liter z kropkami/gwiazdkami/myślnikami: "s.e.k.s", "p*o*r*n*o"
  const dottedSpacedRegex = /\b([a-z0-9])(?:[\.\*\-\_\/\|]+([a-z0-9])){2,}\b/gi;
  if (dottedSpacedRegex.test(text)) {
    obfuscationFlags.push('PUNCTUATION_SPACED_LETTERS');
    obfuscationScore += 15;
    text = text.replace(dottedSpacedRegex, (match) => match.replace(/[\.\*\-\_\/\|]+/g, ''));
  }

  // Sklejanie pojedynczych liter oddzielonych spacjami: "s e k s", "p o r n o" (min 3 pojedyncze litery pod rząd)
  // Uwaga: pomijamy typowe polskie spójniki jednoliterowe (w, z, i, o, a, u), jeśli nie tworzą rdzenia NSFW
  text = collapseSpacedLetters(text, obfuscationFlags);
  if (obfuscationFlags.includes('WHITESPACE_SPACED_LETTERS')) {
    obfuscationScore += 15;
  }

  // Krok 6: Dekodowanie Leetspeak dla słów mieszanych (np. "s3ks", "p0rn", "ch*j", "j3b4c", "d1ck")
  text = decodeLeetspeakTokens(text, obfuscationFlags);
  if (obfuscationFlags.includes('LEETSPEAK_DETECTED')) {
    obfuscationScore += 15;
  }

  // Krok 7: Oczyszczenie pozostałych znaków specjalnych do spacji
  text = text.replace(/[^a-z0-9\s]/g, ' ');

  // Krok 8: Redukcja nadmiarowych powtórzeń liter ("seeeeeks" -> "seks", "kuuurwa" -> "kurwa")
  // Zachowujemy "xxx" jako specjalny token pornograficzny!
  text = text.replace(/\b([a-z0-9]+)\b/g, (word) => {
    if (word === 'xxx' || /^x+$/.test(word)) return 'xxx';
    // Redukcja 3+ takich samych liter do 1 (np. "seeeeks" -> "seks")
    let collapsed = word.replace(/([a-z])\1{2,}/g, '$1');
    // Jeśli słowo ma podwójne samogłoski rzadkie w PL ("seeks" -> "seks", "poorno" -> "porno")
    collapsed = collapsed.replace(/([aeiuyo])\1+/g, '$1');
    return collapsed;
  });

  // Redukcja wielokrotnych spacji
  text = text.replace(/\s+/g, ' ').trim();

  const tokens = text ? text.split(' ') : [];

  return {
    normalized: text,
    tokens,
    obfuscationScore: Math.min(35, obfuscationScore),
    obfuscationFlags
  };
}

/**
 * Inteligentne sklejanie liter rozstrzelonych spacjami (np. "t o  j e s t  s e k s" lub "s e k s").
 * Skleja sekwencje >= 3 pojedynczych znaków i sprawdza, czy po sklejeniu tworzą znany termin z leksykonów.
 */
function collapseSpacedLetters(text, obfuscationFlags) {
  // Szukamy ciągów min. 3 pojedynczych znaków alfanumerycznych oddzielonych pojedynczymi spacjami
  const spacedSeqRegex = /(?:\b[a-z0-9]\s+){2,}[a-z0-9]\b/g;

  return text.replace(spacedSeqRegex, (match) => {
    const parts = match.trim().split(/\s+/);
    if (parts.length < 3) return match;

    const joined = parts.join('');
    // Sprawdzamy, czy sklejony ciąg (lub jego podciąg po pominięciu polskich przyimków w/z/i/o/a/u na początku)
    // pasuje do któregokolwiek z leksykonów ryzyka
    const candidates = [joined];
    if (['w', 'z', 'i', 'o', 'a', 'u'].includes(parts[0]) && parts.length >= 4) {
      candidates.push(parts.slice(1).join(''));
    }

    for (const cand of candidates) {
      const deLeeted = applyRawLeetspeak(cand);
      if (isTokenInRiskLexicons(deLeeted)) {
        if (!obfuscationFlags.includes('WHITESPACE_SPACED_LETTERS')) {
          obfuscationFlags.push('WHITESPACE_SPACED_LETTERS');
        }
        return cand === joined ? deLeeted : `${parts[0]} ${deLeeted}`;
      }
    }

    return match;
  });
}

/**
 * Zamienia znaki leetspeak w pojedynczym słowie.
 */
function applyRawLeetspeak(word) {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    out += LEETSPEAK_MAP[ch] || ch;
  }
  return out;
}

/**
 * Dekoduje tokeny zawierające mieszankę liter i cyfr/symboli (np. "s3ks", "p0rn0", "k*rwa", "ch@j").
 * Nie psuje czystych liczb (np. "2026", "18plus") ani bezpiecznych skrótów ("mp4", "b2b", "3d").
 */
function decodeLeetspeakTokens(text, obfuscationFlags) {
  const SAFE_ALPHANUMERIC = new Set([
    '18plus', 'mp3', 'mp4', 'mkv', 'ps4', 'ps5', 'b2b', 'b2c', 'c4', 'a4', 'a3',
    'v4', 'v2', 'v3', '3d', '2d', '4k', '8k', 'h2o', 'co2', 'covid19', 'g20', 'g7', 'm1', 'm2'
  ]);

  return text.replace(/\b[a-z0-9@\$!\|\*\€\¥]{3,}\b/g, (token) => {
    if (SAFE_ALPHANUMERIC.has(token) || /^\d+$/.test(token)) {
      return token;
    }

    // Jeśli token to specjalny skrót pornograficzny (np. r34, e621) – zachowaj oryginał!
    if (token === 'r34' || token === 'rule34' || token === 'e621') {
      return token;
    }

    // Sprawdzamy, czy słowo zawiera jednocześnie litery oraz cyfry/symbole leetspeak/gwiazdki
    const hasLetters = /[a-z]/.test(token);
    const hasLeetOrMask = /[013456789@\$!\|\*\€\¥]/.test(token);

    if (!hasLetters || !hasLeetOrMask) {
      return token;
    }

    // Obsługa cenzury gwiazdkowej w najczęstszych słowach: k*rwa, ch*j, j*bac, p*rno, s*ks
    let candidate = token;
    if (token.includes('*')) {
      candidate = unmaskAsterisks(token);
    }

    const decoded = applyRawLeetspeak(candidate).replace(/\*/g, '');
    if (decoded !== token && isTokenInRiskLexicons(decoded)) {
      if (!obfuscationFlags.includes('LEETSPEAK_DETECTED')) {
        obfuscationFlags.push('LEETSPEAK_DETECTED');
      }
      return decoded;
    }

    return token;
  });
}

/**
 * Próbuje zrekonstruować słowo zamaskowane pojedynczą gwiazdką (np. "s*ks" -> "seks", "k*rwa" -> "kurwa").
 */
function unmaskAsterisks(maskedToken) {
  const vowels = ['e', 'u', 'o', 'i', 'a', 'y'];
  for (const v of vowels) {
    const attempt = applyRawLeetspeak(maskedToken.replace(/\*/g, v));
    if (isTokenInRiskLexicons(attempt)) {
      return attempt;
    }
  }
  return maskedToken;
}

// ============================================================================
// 8. DOPASOWYWANIE TOKENÓW DO LEKSYKONÓW
// ============================================================================

/**
 * Sprawdza, czy token jest chroniony przez białą listę (Scunthorpe Safe-Words).
 */
function isSafeWord(token) {
  if (SAFE_WORDS_EXACT.has(token)) return true;

  // Sprawdzenie dłuższych odmian słów z białej listy (np. "dokumentacja" od "dokumentacj")
  for (const safeEntry of SAFE_WORDS_EXACT) {
    if (safeEntry.length >= 5 && token.startsWith(safeEntry)) {
      return true;
    }
  }
  return false;
}

/**
 * Sprawdza czy pojedynczy token pasuje do skompilowanego leksykonu.
 * Zwraca obiekt dopasowania lub null.
 */
function matchTokenAgainstLexicon(token, compiledLexicon) {
  if (!token || token.length < 2) return null;

  // 1. Sprawdzenie dokładnego dopasowania (=slowo)
  if (compiledLexicon.exactSet.has(token)) {
    return {
      matchedRule: `=${token}`,
      matchType: 'EXACT',
      category: compiledLexicon.category,
      baseWeight: compiledLexicon.baseWeight
    };
  }

  // 2. Sprawdzenie dopasowania prefiksowego (rdzenia) przez zindeksowaną mapę 2-znakową
  const key = token.slice(0, 2);
  const candidatePrefixes = compiledLexicon.prefixIndex.get(key);
  if (!candidatePrefixes) return null;

  for (const prefix of candidatePrefixes) {
    if (token.startsWith(prefix)) {
      // Zabezpieczenie przed zbyt agresywnym dopasowaniem krótkiego prefiksu do długiego obcego słowa
      // Np. 3-literowy rdzeń "suk" nie powinien łapać 12-literowego słowa spoza rodziny
      const suffixLen = token.length - prefix.length;
      if (prefix.length <= 3 && suffixLen > 5) {
        continue;
      }
      return {
        matchedRule: prefix,
        matchType: 'PREFIX',
        category: compiledLexicon.category,
        baseWeight: compiledLexicon.baseWeight
      };
    }
  }

  return null;
}

/**
 * Pomocnicza funkcja dla de-obfuskatora sprawdzająca, czy zdekodowane słowo
 * znajduje się w którymkolwiek z leksykonów ryzyka.
 */
function isTokenInRiskLexicons(token) {
  if (!token || isSafeWord(token)) return false;
  return Boolean(
    matchTokenAgainstLexicon(token, COMPILED_LEXICONS.HARD_EXPLICIT) ||
    matchTokenAgainstLexicon(token, COMPILED_LEXICONS.SEXUAL_SLANG) ||
    matchTokenAgainstLexicon(token, COMPILED_LEXICONS.SENSITIVE_TOPIC) ||
    matchTokenAgainstLexicon(token, COMPILED_LEXICONS.PROFANITY) ||
    matchTokenAgainstLexicon(token, COMPILED_LEXICONS.AMBIGUOUS_SEX_VERBS)
  );
}

/**
 * Taguje wszystkie tokeny w znormalizowanym tekście oraz wykrywa frazy wielowyrazowe.
 */
function tagTokens(tokens, normalizedText) {
  // Krok 1: Zidentyfikuj bezpieczne kolokacje w całym tekście i oznacz ich pozycje tokenowe jako bezpieczne
  const safeTokenIndices = new Set();
  for (const safeRegex of SAFE_COLLOCATIONS) {
    const match = normalizedText.match(safeRegex);
    if (match) {
      const phraseWords = match[0].trim().split(/\s+/);
      for (let i = 0; i <= tokens.length - phraseWords.length; i++) {
        let allMatch = true;
        for (let j = 0; j < phraseWords.length; j++) {
          if (tokens[i + j] !== phraseWords[j]) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          for (let j = 0; j < phraseWords.length; j++) {
            safeTokenIndices.add(i + j);
          }
        }
      }
    }
  }

  // Krok 2: Tagowanie pojedynczych tokenów
  const taggedTokens = tokens.map((token, index) => {
    const item = {
      index,
      token,
      isSafe: safeTokenIndices.has(index) || isSafeWord(token),
      isNegation: NEGATION_MARKERS.has(token) || token.startsWith('brzydz') || token.startsWith('nienawidz'),
      tags: [],
      primaryCategory: null,
      matchedRule: null,
      baseWeight: 0
    };

    if (item.isSafe) {
      const eduMatch = matchTokenAgainstLexicon(token, COMPILED_LEXICONS.EDUCATIONAL);
      if (eduMatch) {
        item.tags.push('EDUCATIONAL');
      }
      return item;
    }

    // Kolejność priorytetów dla głównych kategorii ryzyka
    const riskOrder = [
      COMPILED_LEXICONS.HARD_EXPLICIT,
      COMPILED_LEXICONS.SEXUAL_SLANG,
      COMPILED_LEXICONS.SENSITIVE_TOPIC,
      COMPILED_LEXICONS.PROFANITY
    ];

    for (const lex of riskOrder) {
      const m = matchTokenAgainstLexicon(token, lex);
      if (m) {
        item.tags.push(m.category);
        if (!item.primaryCategory) {
          item.primaryCategory = m.category;
          item.matchedRule = m.matchedRule;
          item.baseWeight = m.baseWeight;
        }
      }
    }

    // Tagowanie pomocniczych ról kontekstowych (mogą współwystępować z głównymi kategoriami)
    const ambigVerbMatch = matchTokenAgainstLexicon(token, COMPILED_LEXICONS.AMBIGUOUS_SEX_VERBS);
    if (ambigVerbMatch) {
      item.tags.push('AMBIGUOUS_SEX_VERB');
      if (!item.matchedRule) item.matchedRule = ambigVerbMatch.matchedRule;
    }

    const personObjMatch = matchTokenAgainstLexicon(token, COMPILED_LEXICONS.PERSON_OBJECTS);
    if (personObjMatch) {
      item.tags.push('PERSON_OBJECT');
    }

    const eduMatch = matchTokenAgainstLexicon(token, COMPILED_LEXICONS.EDUCATIONAL);
    if (eduMatch) {
      item.tags.push('EDUCATIONAL');
    }

    const exciteMatch = matchTokenAgainstLexicon(token, COMPILED_LEXICONS.EXCITEMENT);
    if (exciteMatch) {
      item.tags.push('EXCITEMENT');
    }

    return item;
  });

  // Krok 3: Wykrywanie wielowyrazowych fraz z leksykonów (np. "walenie konia", "jest to", "chce mi sie")
  const allLexicons = Object.values(COMPILED_LEXICONS);
  for (const lex of allLexicons) {
    for (const mw of lex.multiWordPhrases) {
      if (normalizedText.includes(mw.phrase)) {
        const phraseParts = mw.phrase.split(' ');
        for (let i = 0; i <= taggedTokens.length - phraseParts.length; i++) {
          let match = true;
          for (let j = 0; j < phraseParts.length; j++) {
            if (!taggedTokens[i + j].token.startsWith(phraseParts[j])) {
              match = false;
              break;
            }
          }
          if (match) {
            const firstToken = taggedTokens[i];
            if (!firstToken.tags.includes(mw.category)) {
              firstToken.tags.push(mw.category);
            }
            if (mw.weight > firstToken.baseWeight) {
              firstToken.primaryCategory = mw.category;
              firstToken.matchedRule = mw.raw;
              firstToken.baseWeight = mw.weight;
            }
          }
        }
      }
    }
  }

  return taggedTokens;
}

// ============================================================================
// 9. ANALIZATOR INTENCJI I KONTEKSTU OKIENKOWEGO (SLIDING WINDOW INTENT)
// ============================================================================

/**
 * Sprawdza, czy token o podanym indeksie jest poprzedzony negacją w promieniu 1-2 słów
 * (np. "nie lubię", "wcale mnie nie podnieca", "brzydzi mnie").
 */
function isLocallyNegated(taggedTokens, targetIndex) {
  const start = Math.max(0, targetIndex - 3);
  for (let i = start; i < targetIndex; i++) {
    if (taggedTokens[i].isNegation) {
      return true;
    }
  }
  return false;
}

/**
 * Analizuje okno kontekstowe wokół każdego trafienia i wylicza finalne zdarzenia ryzyka,
 * klasyfikując intencję wypowiedzi.
 */
function evaluateIntentAndContext(taggedTokens, normalizedText, rawText, emojiReport, fileInfo, obfuscationInfo) {
  const WINDOW_RADIUS = 5;
  const detections = [];

  let hasHardExplicit = false;
  let hasSexualSlang = false;
  let hasSolicitationErp = false;
  let hasAmbiguousCombo = false;
  let hasExcitedSensitive = false;
  let hasEducationalContext = false;
  let hasProfanity = false;

  // Globalne sprawdzenie czy w całym zdaniu istnieją jakiekolwiek twarde sygnały NSFW
  const globalHardOrSlang = taggedTokens.some(
    (t) => t.tags.includes('HARD_EXPLICIT') || t.tags.includes('SEXUAL_SLANG')
  );
  const globalProfanity = taggedTokens.some((t) => t.tags.includes('PROFANITY'));
  const globalEducation = taggedTokens.some((t) => t.tags.includes('EDUCATIONAL'));
  const globalExcitement = taggedTokens.some((t, idx) => t.tags.includes('EXCITEMENT') && !isLocallyNegated(taggedTokens, idx));

  // 1. Sprawdzenie wzorców Solicitation / Erotic Roleplay (ERP)
  for (const pattern of SOLICITATION_ERP_PATTERNS) {
    const m = normalizedText.match(pattern) || rawText.match(pattern);
    if (m) {
      hasSolicitationErp = true;
      detections.push({
        type: 'SOLICITATION_OR_ERP',
        token: m[0],
        rule: pattern.source.slice(0, 45) + '...',
        weight: CATEGORY_WEIGHTS.SOLICITATION_ERP,
        contextNote: 'Wykryto bezpośrednią propozycję seksualną, prośbę o nudesy lub odgrywanie ról erotycznych (ERP).'
      });
    }
  }

  // 2. Iteracja po otagowanych tokenach i analiza okna +/- WINDOW_RADIUS
  for (let i = 0; i < taggedTokens.length; i++) {
    const current = taggedTokens[i];
    if (current.isSafe) continue;

    const winStart = Math.max(0, i - WINDOW_RADIUS);
    const winEnd = Math.min(taggedTokens.length - 1, i + WINDOW_RADIUS);

    // Zbieranie sygnałów z sąsiedztwa
    let windowHasEducation = false;
    let windowHasActiveExcitement = false;
    let windowHasPersonObject = false;
    let windowPersonToken = null;
    let windowHasSensitive = false;

    for (let j = winStart; j <= winEnd; j++) {
      const neighbor = taggedTokens[j];
      if (neighbor.tags.includes('EDUCATIONAL')) {
        windowHasEducation = true;
      }
      if (neighbor.tags.includes('EXCITEMENT') && !isLocallyNegated(taggedTokens, j)) {
        windowHasActiveExcitement = true;
      }
      if (j !== i && neighbor.tags.includes('PERSON_OBJECT')) {
        windowHasPersonObject = true;
        windowPersonToken = neighbor.token;
      }
      if (neighbor.tags.includes('SENSITIVE_TOPIC')) {
        windowHasSensitive = true;
      }
    }

    // --- REGUŁA A: JAWNA PORNOGRAFIA (HARD_EXPLICIT) ---
    // Nigdy nie jest usprawiedliwiana nauką.
    if (current.tags.includes('HARD_EXPLICIT')) {
      hasHardExplicit = true;
      detections.push({
        type: 'HARD_EXPLICIT',
        token: current.token,
        rule: current.matchedRule,
        weight: CATEGORY_WEIGHTS.HARD_EXPLICIT,
        contextNote: 'Twardy termin pornograficzny lub wulgarny seksualny (brak wyjątków kontekstowych).'
      });
      continue;
    }

    // --- REGUŁA B: SLANG SEKSUALNY (SEXUAL_SLANG) ---
    // Silny sygnał intencji potoczno-erotycznej, nie neutralizowany edukacją.
    if (current.tags.includes('SEXUAL_SLANG')) {
      hasSexualSlang = true;
      detections.push({
        type: 'SEXUAL_SLANG',
        token: current.token,
        rule: current.matchedRule,
        weight: CATEGORY_WEIGHTS.SEXUAL_SLANG,
        contextNote: 'Slang seksualny / uprzedmiotawiający.'
      });
      continue;
    }

    // --- REGUŁA C: CZASOWNIK DWUZNACZNY + DOPEŁNIENIE OSOBOWE ---
    // np. "jebie dziewczynę", "posuwa laskę", "liże jej", "zaliczył sąsiadkę"
    if (current.tags.includes('AMBIGUOUS_SEX_VERB') && windowHasPersonObject) {
      // Wykluczamy przypadek, gdy to czysta negacja obronna lub bezpieczny zwrot
      hasAmbiguousCombo = true;
      detections.push({
        type: 'AMBIGUOUS_VERB_WITH_PERSON',
        token: `${current.token} ... ${windowPersonToken}`,
        rule: `${current.matchedRule} + PERSON_OBJECT(${windowPersonToken})`,
        weight: CATEGORY_WEIGHTS.AMBIGUOUS_COMBO,
        contextNote: 'Czasownik dwuznaczny użyty z dopełnieniem osobowym w znaczeniu seksualnym.'
      });
      continue;
    }

    // --- REGUŁA D: NEUTRALNY TERMIN SEKSUALNY (SENSITIVE_TOPIC) ---
    // Tutaj decyduje intencja wokół słowa!
    if (current.tags.includes('SENSITIVE_TOPIC')) {
      const hasSuggestiveEmojis = emojiReport.suggestiveCount > 0 || emojiReport.hasNsfwCombo;

      // D1: Kontekst ekscytacji, pożądania, wulgaryzmów lub sugestywnych emoji -> BLOK
      if (windowHasActiveExcitement || globalProfanity || hasSuggestiveEmojis) {
        hasExcitedSensitive = true;
        detections.push({
          type: 'SENSITIVE_EXCITED',
          token: current.token,
          rule: current.matchedRule,
          weight: CATEGORY_WEIGHTS.SENSITIVE_EXCITED,
          contextNote: 'Termin seksualny użyty w kontekście ekscytacji, pożądania, wulgaryzmów lub sugestywnych emoji.'
        });
      }
      // D2: Kontekst edukacyjny / medyczny / definicyjny (i brak wulgaryzmów/slangu w całym zdaniu) -> DOZWOLONE
      else if ((windowHasEducation || (globalEducation && !globalExcitement)) && !globalHardOrSlang && !globalProfanity && !hasSuggestiveEmojis) {
        hasEducationalContext = true;
        detections.push({
          type: 'SENSITIVE_EDUCATIONAL',
          token: current.token,
          rule: current.matchedRule,
          weight: CATEGORY_WEIGHTS.SENSITIVE_EDUCATIONAL,
          contextNote: 'Termin seksualny użyty w bezpiecznym kontekście edukacyjnym, naukowym lub definicyjnym (zneutralizowany).'
        });
      }
      // D3: Wzmianka neutralna bez wyraźnej ramy naukowej, ale też bez ekscytacji
      else {
        detections.push({
          type: 'SENSITIVE_NEUTRAL',
          token: current.token,
          rule: current.matchedRule,
          weight: CATEGORY_WEIGHTS.SENSITIVE_NEUTRAL,
          contextNote: 'Neutralny termin seksualny/anatomiczny bez wyraźnego kontekstu naukowego ani ekscytacji.'
        });
      }
      continue;
    }

    // --- REGUŁA E: WULGARYZMY OGÓLNE (PROFANITY) ---
    if (current.tags.includes('PROFANITY')) {
      hasProfanity = true;
      const inSexualWindow = windowHasSensitive || windowHasActiveExcitement;
      const weight = inSexualWindow
        ? CATEGORY_WEIGHTS.PROFANITY_SEXUAL_CTX
        : CATEGORY_WEIGHTS.PROFANITY_GENERAL;

      detections.push({
        type: inSexualWindow ? 'PROFANITY_IN_SEXUAL_CONTEXT' : 'PROFANITY_GENERAL',
        token: current.token,
        rule: current.matchedRule,
        weight,
        contextNote: inSexualWindow
          ? 'Wulgaryzm użyty w bezpośrednim sąsiedztwie tematu seksualnego.'
          : 'Ogólny wulgaryzm nieseksualny.'
      });
    }
  }

  // 3. Dodatkowe sygnały z analizy Emoji
  if (emojiReport.hasHardNsfwEmoji) {
    detections.push({
      type: 'NSFW_EMOJI_EXPLICIT',
      token: emojiReport.foundSingleNsfw.join(' '),
      rule: 'EMOJI_18_PLUS',
      weight: 60,
      contextNote: 'Jawny symbol 18+.'
    });
  }
  if (emojiReport.hasNsfwCombo) {
    detections.push({
      type: 'NSFW_EMOJI_COMBO',
      token: emojiReport.foundCombos.join(', '),
      rule: 'EMOJI_SEXUAL_SEQUENCE',
      weight: CATEGORY_WEIGHTS.NSFW_EMOJI_COMBO,
      contextNote: 'Kombinacja emoji o jednoznacznym podtekście seksualnym.'
    });
  }

  // 4. Sygnały z domen adult (.xxx, .porn) oraz podejrzanych plików multimedialnych
  if (fileInfo.hasAdultTld) {
    hasHardExplicit = true;
    detections.push({
      type: 'ADULT_DOMAIN_TLD',
      token: 'URL (.xxx/.porn/.sex)',
      rule: 'ADULT_TLD_REGEX',
      weight: 100,
      contextNote: 'Domena najwyższego poziomu zarezerwowana dla treści pornograficznych.'
    });
  }

  if (fileInfo.hasMediaExtension && detections.some((d) => d.weight >= 30)) {
    detections.push({
      type: 'SUSPICIOUS_MEDIA_FILENAME',
      token: 'Plik multimedialny z tagami NSFW',
      rule: 'SUSPICIOUS_FILE_EXTENSIONS',
      weight: CATEGORY_WEIGHTS.SUSPICIOUS_MEDIA_FILE,
      contextNote: 'Nazwa pliku wideo/obrazu lub archiwum zawiera terminy powiązane z NSFW.'
    });
  }

  // 5. Kara za celową obfuskację (tylko jeśli w tekście faktycznie wykryto słowa z leksykonów)
  if (obfuscationInfo.obfuscationScore > 0 && detections.some((d) => d.weight >= 25)) {
    detections.push({
      type: 'EVASION_ATTEMPT',
      token: obfuscationInfo.obfuscationFlags.join(', '),
      rule: 'DEOBFUSCATION_ENGINE',
      weight: obfuscationInfo.obfuscationScore,
      contextNote: 'Wykryto celową próbę ukrycia słów (leetspeak, rozstrzelone znaki, homoglify).'
    });
  }

  // Wyznaczenie głównej klasyfikacji intencji
  let intentClassification = 'SAFE_GENERAL';
  const isPureAcademic = globalEducation && !globalHardOrSlang && !globalProfanity && !globalExcitement;
  if (isPureAcademic) {
    hasEducationalContext = true;
  }

  if (hasHardExplicit || hasSolicitationErp) {
    intentClassification = 'EXPLICIT_PORNOGRAPHIC_OR_SOLICITATION';
  } else if (hasSexualSlang || hasAmbiguousCombo || hasExcitedSensitive || emojiReport.hasNsfwCombo) {
    intentClassification = 'EROTIC_SLANG_OR_AROUSAL';
  } else if ((hasEducationalContext || isPureAcademic) && detections.every((d) => d.weight <= 15)) {
    intentClassification = 'EDUCATIONAL_OR_CLINICAL';
  } else if (detections.some((d) => d.type === 'SENSITIVE_NEUTRAL')) {
    intentClassification = 'SENSITIVE_MENTION_NEUTRAL';
  } else if (hasProfanity) {
    intentClassification = 'VULGAR_NON_SEXUAL';
  }

  return {
    detections,
    intentClassification,
    flags: {
      hasHardExplicit,
      hasSexualSlang,
      hasSolicitationErp,
      hasAmbiguousCombo,
      hasExcitedSensitive,
      hasEducationalContext,
      hasProfanity
    }
  };
}

// ============================================================================
// 10. SILNIK SCORINGU (0 - 100) I GŁÓWNE API
// ============================================================================

/**
 * Oblicza skumulowany wynik ryzyka (0-100) z nieliniowym tłumieniem dla drobnych przewinień
 * i natychmiastową saturacją dla twardych trafień.
 */
function calculateRiskScore(detections) {
  if (!detections || detections.length === 0) return 0;

  // Znajdź najwyższą pojedynczą wagę
  let maxWeight = 0;
  let secondarySum = 0;

  const sorted = [...detections].sort((a, b) => b.weight - a.weight);
  maxWeight = sorted[0].weight;

  // Każde kolejne trafienie dokłada 35% swojej wagi (efekt kumulacji wielu sygnałów)
  for (let i = 1; i < sorted.length; i++) {
    secondarySum += sorted[i].weight * 0.35;
  }

  const rawScore = Math.round(maxWeight + secondarySum);
  return Math.max(0, Math.min(100, rawScore));
}

/**
 * Główna funkcja analityczna silnika NEXUS NSFW INTENT ENGINE.
 *
 * @param {string} input - Tekst, wiadomość, prompt lub nazwa pliku do zbadania.
 * @param {object} [options] - Opcje konfiguracji.
 * @param {'strict'|'high'|'medium'|'low'|'permissive'|number} [options.nsfwSensitivity='high'] - Próg czułości lub własna wartość 1-100.
 * @param {boolean} [options.allowProfanity=true] - Czy pojedyncze przekleństwa nieseksualne mają być traktowane łagodniej.
 * @returns {object} Pełny raport z analizy (isNsfw, score, threshold, intent, detections, normalizedText, tokens).
 */
function analyzeNsfwIntent(input, options = {}) {
  const startTime = Date.now();

  // Ustalenie progu czułości
  const sensitivitySetting = options.nsfwSensitivity ?? 'high';
  let threshold = SENSITIVITY_THRESHOLDS.high;

  if (typeof sensitivitySetting === 'number') {
    // Procent czułości ze slidera UI (0-100%): wyższa czułość = niższy próg odcięcia ryzyka
    threshold = Math.max(5, Math.min(95, Math.round(105 - sensitivitySetting)));
  } else if (SENSITIVITY_THRESHOLDS[sensitivitySetting] !== undefined) {
    threshold = SENSITIVITY_THRESHOLDS[sensitivitySetting];
  }

  if (typeof input !== 'string' || !input.trim()) {
    return {
      isNsfw: false,
      action: 'ALLOW',
      score: 0,
      threshold,
      sensitivity: sensitivitySetting,
      intent: 'SAFE_EMPTY',
      summary: 'Pusty tekst wejściowy.',
      detections: [],
      obfuscationFlags: [],
      normalizedText: '',
      executionTimeMs: 0
    };
  }

  // 1. Analiza Emoji i plików przed normalizacją ASCII
  const emojiReport = analyzeEmojis(input);
  const fileInfo = expandIdentifiersAndFiles(input);

  // 2. Normalizacja i de-obfuskacja
  const normResult = normalizeText(input);

  // 3. Tagowanie tokenów
  const taggedTokens = tagTokens(normResult.tokens, normResult.normalized);

  // 4. Analiza okna kontekstowego i intencji
  const contextResult = evaluateIntentAndContext(
    taggedTokens,
    normResult.normalized,
    input,
    emojiReport,
    fileInfo,
    normResult
  );

  // Opcjonalne wyciszenie czystych wulgaryzmów ogólnych, jeśli allowProfanity === true i brak kontekstu NSFW
  let effectiveDetections = contextResult.detections;
  if (options.allowProfanity === true && contextResult.intentClassification === 'VULGAR_NON_SEXUAL') {
    effectiveDetections = effectiveDetections.map((d) =>
      d.type === 'PROFANITY_GENERAL' ? { ...d, weight: Math.min(d.weight, 10) } : d
    );
  }

  // 5. Wyliczenie finalnego wyniku
  const score = calculateRiskScore(effectiveDetections);
  const isNsfw = score >= threshold;

  let action = 'ALLOW';
  if (score >= 80) {
    action = 'BLOCK_IMMEDIATE';
  } else if (isNsfw) {
    action = 'BLOCK_POLICY';
  } else if (score >= threshold * 0.75 && score >= 20) {
    action = 'WARN_REVIEW';
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    isNsfw,
    action,
    score,
    threshold,
    sensitivity: sensitivitySetting,
    intent: contextResult.intentClassification,
    flags: contextResult.flags,
    detections: effectiveDetections,
    obfuscationFlags: normResult.obfuscationFlags,
    emojiReport: {
      hasNsfwCombo: emojiReport.hasNsfwCombo,
      foundCombos: emojiReport.foundCombos,
      foundSuggestive: emojiReport.foundSuggestive
    },
    normalizedText: normResult.normalized,
    executionTimeMs
  };
}

/**
 * Szybki helper zwracający wyłącznie wartość logiczną (true = NSFW / zablokuj, false = bezpieczne).
 */
function isNsfwText(input, nsfwSensitivity = 'high') {
  return analyzeNsfwIntent(input, { nsfwSensitivity }).isNsfw;
}

// ============================================================================
// 11. WBUDOWANY ZESTAW TESTÓW DIAGNOSTYCZNYCH (SELF-TEST SUITE)
// ============================================================================

function runSelfDiagnostics() {
  const testCases = [
    // 1. Edukacja / Nauka / Medycyna -> DOZWOLONE
    {
      text: 'Seks jest to biologiczna metoda rozmnażania organizmów żywych oraz element zdrowia człowieka.',
      expectedNsfw: false,
      desc: 'Definicja encyklopedyczna seksu'
    },
    {
      text: 'Według podręcznika anatomii penis oraz pochwa należą do zewnętrznych i wewnętrznych narządów płciowych.',
      expectedNsfw: false,
      desc: 'Kontekst anatomiczny i medyczny'
    },
    {
      text: 'Na lekcji biologii omawialiśmy jak działa antykoncepcja, prezerwatywa oraz jak przebiega ciąża i zapłodnienie.',
      expectedNsfw: false,
      desc: 'Edukacja szkolna o reprodukcji'
    },
    // 2. Scunthorpe Safe-Words (Fałszywe alarmy) -> DOZWOLONE
    {
      text: 'Sekcja zwłok wykazała, że dokumentacja i analiza kanału wentylacyjnego były kompletne.',
      expectedNsfw: false,
      desc: 'Scunthorpe: sekcja, dokument, analiza, kanał'
    },
    {
      text: 'Sąsiad puka do drzwi, bo jego suka rasy owczarek niemiecki uciekła na ulicę, a syn zaliczył egzamin.',
      expectedNsfw: false,
      desc: 'Bezpieczne kolokacje: puka do drzwi, suka owczarek, zaliczył egzamin'
    },
    // 3. Ekscytacja / Promocja wokół neutralnych słów -> BLOK
    {
      text: 'Ale zajebisty seks, strasznie mnie podnieca jej mokra pochwa i wielki biust 🥵💦',
      expectedNsfw: true,
      desc: 'Ekscytacja + terminy anatomiczne + emoji'
    },
    // 4. Czasownik dwuznaczny + dopełnienie osobowe -> BLOK
    {
      text: 'Ten typ z imprezy ostro jebie dziewczynę swojego kolegi i posuwa sąsiadkę.',
      expectedNsfw: true,
      desc: 'Czasownik dwuznaczny + obiekt osobowy'
    },
    // 5. Próba obejścia kontekstem naukowym dla twardej pornografii -> BLOK
    {
      text: 'Do mojej pracy naukowej z biologii badam jak na pornhub ludzie ruchają się i robią blowjob.',
      expectedNsfw: true,
      desc: 'Twarda pornografia nie może być usprawiedliwiona nauką'
    },
    // 6. Obfuskacja (Leetspeak, rozstrzelone litery, kropki, powtórzenia) -> BLOK
    {
      text: 'Zobacz darmowe p.o.r.n.o oraz s e k s bez limitu, n u d e s y i kuuuutas!',
      expectedNsfw: true,
      desc: 'De-obfuskacja: p.o.r.n.o, s e k s, n u d e s y, kuuuutas'
    },
    {
      text: 'Ale fajne c y c k i ma ta laska, wyslij mi nudesy na priv',
      expectedNsfw: true,
      desc: 'Rozstrzelony slang + solicitation'
    }
  ];

  const results = testCases.map((tc) => {
    const res = analyzeNsfwIntent(tc.text, { nsfwSensitivity: 'high' });
    const passed = res.isNsfw === tc.expectedNsfw;
    return {
      passed,
      description: tc.desc,
      input: tc.text,
      expectedNsfw: tc.expectedNsfw,
      actualNsfw: res.isNsfw,
      score: res.score,
      intent: res.intent,
      detectionsCount: res.detections.length
    };
  });

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    details: results
  };
}

// ============================================================================
// 12. EKSPORT MODUŁU (CommonJS / Node.js)
// ============================================================================

module.exports = {
  analyzeNsfwIntent,
  isNsfwText,
  normalizeText,
  runSelfDiagnostics,
  SENSITIVITY_THRESHOLDS,
  CATEGORY_WEIGHTS,
  LEXICONS: {
    HARD_EXPLICIT,
    SEXUAL_SLANG,
    SENSITIVE_TOPIC,
    PROFANITY,
    AMBIGUOUS_SEX_VERBS,
    PERSON_OBJECTS,
    EDUCATIONAL_MARKERS,
    EXCITEMENT_MARKERS,
    SAFE_WORDS_EXACT
  }
};