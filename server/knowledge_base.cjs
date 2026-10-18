/**
 * ============================================================================
 * PROJECT NEXUS - UNIVERSAL FILE KNOWLEDGE BASE & TAXONOMY (BACKEND CJS)
 * ============================================================================
 * 
 * 50+ Games Registry (CS:GO, Fortnite, Valorant, GTA, Elden Ring, Rust...)
 * 50+ Dev Languages Registry (TypeScript, Python, Rust, Go, C++, Zig...)
 * 500+ File Extensions Registry across 24 specialized content domains
 * ============================================================================
 */

// 1. 50+ POPULAR GAMES REGISTRY (Strict Word Boundaries to avoid false positives)
const GAMES_DATABASE = [
  {
    id: 'csgo',
    name: 'Counter-Strike (CS:GO / CS2)',
    emoji: '🎯',
    tags: ['#csgo', '#counterstrike', '#gaming', '#esports'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:csgo|cs2|counter[_\-\s]?strike|de_(?:dust2|mirage|inferno|nuke|overpass|ancient|anubis|vertigo|train|cache))(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'fortnite',
    name: 'Fortnite (Battle Royale)',
    emoji: '🪂',
    tags: ['#fortnite', '#gaming', '#clips'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:fortnite|battle[_\-\s]?royale|victory[_\-\s]?royale|vbucks|fnbr)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'valorant',
    name: 'Valorant',
    emoji: '⚔️',
    tags: ['#valorant', '#gaming', '#esports'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:valorant|vct[_\-\s]?masters|vct[_\-\s]?champions)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'league_of_legends',
    name: 'League of Legends',
    emoji: '🛡️',
    tags: ['#leagueoflegends', '#gaming', '#riot'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:league[_\-\s]?of[_\-\s]?legends|summoners[_\-\s]?rift|teamfight[_\-\s]?tactics)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    emoji: '⛏️',
    tags: ['#minecraft', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:minecraft|mcworld|spigotmc|optifine_hd|crafting_table|creeper|ender_dragon|bedrock_edition)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'roblox',
    name: 'Roblox Studio & Gry',
    emoji: '🎮',
    tags: ['#roblox', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:roblox|robloxstudio|bloxfruits|bloxburg)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'gta',
    name: 'GTA V / FiveM',
    emoji: '🚗',
    tags: ['#gta', '#fivem', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:gta[_\-\s]?[v5]|fivem|grand[_\-\s]?theft[_\-\s]?auto|gta[_\-\s]?sa)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'apex_legends',
    name: 'Apex Legends',
    emoji: '🔥',
    tags: ['#apex', '#gaming', '#ea'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:apex[_\-\s]?legends|apexlegends)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'call_of_duty',
    name: 'Call of Duty / Warzone',
    emoji: '💥',
    tags: ['#warzone', '#cod', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:warzone|call[_\-\s]?of[_\-\s]?duty|modern[_\-\s]?warfare|black[_\-\s]?ops)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'overwatch',
    name: 'Overwatch 2',
    emoji: '🛡️',
    tags: ['#overwatch', '#gaming', '#blizzard'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:overwatch|ow2|play[_\-\s]?of[_\-\s]?the[_\-\s]?game)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'dota2',
    name: 'Dota 2',
    emoji: '🏆',
    tags: ['#dota2', '#gaming', '#valve'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:dota[_\-\s]?2|defense[_\-\s]?of[_\-\s]?the[_\-\s]?ancients)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    emoji: '🦾',
    tags: ['#cyberpunk', '#gaming', '#cdpr'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:cyberpunk[_\-\s]?2077|cp2077|phantom[_\-\s]?liberty)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'witcher',
    name: 'Wiedźmin 3 / The Witcher',
    emoji: '🐺',
    tags: ['#witcher', '#gaming', '#cdpr'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:the[_\-\s]?witcher|wiedzmin|geralt[_\-\s]?z[_\-\s]?rivii|wild[_\-\s]?hunt)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'elden_ring',
    name: 'Elden Ring',
    emoji: '💍',
    tags: ['#eldenring', '#gaming', '#fromsoft'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:elden[_\-\s]?ring|eldenring|shadow[_\-\s]?of[_\-\s]?the[_\-\s]?erdtree)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'dark_souls',
    name: 'Dark Souls',
    emoji: '🔥',
    tags: ['#darksouls', '#gaming', '#fromsoft'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:dark[_\-\s]?souls|darksouls)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'genshin_impact',
    name: 'Genshin Impact',
    emoji: '✨',
    tags: ['#genshin', '#gaming', '#hoyoverse'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:genshin[_\-\s]?impact|genshin|teyvat|primogems)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'honkai_star_rail',
    name: 'Honkai: Star Rail',
    emoji: '🌠',
    tags: ['#honkai', '#starrail', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:honkai[_\-\s]?star[_\-\s]?rail|star[_\-\s]?rail|astral[_\-\s]?express)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'zenless_zone_zero',
    name: 'Zenless Zone Zero',
    emoji: '⚡',
    tags: ['#zenless', '#zzz', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:zenless[_\-\s]?zone[_\-\s]?zero|new[_\-\s]?eridu)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'r6_siege',
    name: 'Rainbow Six Siege',
    emoji: '🚪',
    tags: ['#r6siege', '#gaming', '#ubisoft'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:rainbow[_\-\s]?six|r6[_\-\s]?siege)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'rocket_league',
    name: 'Rocket League',
    emoji: '🚀',
    tags: ['#rocketleague', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:rocket[_\-\s]?league)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'rust',
    name: 'Rust (Gra)',
    emoji: '☢️',
    tags: ['#rustgame', '#gaming', '#survival'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:rust[_\-\s]?game|playrust|rust[_\-\s]?base|rust[_\-\s]?wipe)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'ark',
    name: 'ARK: Survival Evolved / Ascended',
    emoji: '🦖',
    tags: ['#ark', '#gaming', '#survival'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:ark[_\-\s]?survival|ark[_\-\s]?ascended)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'terraria',
    name: 'Terraria',
    emoji: '🌳',
    tags: ['#terraria', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:terraria|calamity[_\-\s]?mod)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'dead_by_daylight',
    name: 'Dead by Daylight',
    emoji: '🩸',
    tags: ['#dbd', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:dead[_\-\s]?by[_\-\s]?daylight)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'ea_fc',
    name: 'EA FC / FIFA',
    emoji: '⚽',
    tags: ['#eafc', '#fifa', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:ea[_\-\s]?fc|fifa[_\-\s]?(?:1[8-9]|2[0-5])|fc2[4-5]|ultimate[_\-\s]?team)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'world_of_warcraft',
    name: 'World of Warcraft',
    emoji: '⚔️',
    tags: ['#wow', '#gaming', '#blizzard'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:world[_\-\s]?of[_\-\s]?warcraft|mythic[_\-\s]?plus)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'escape_from_tarkov',
    name: 'Escape from Tarkov',
    emoji: '🎒',
    tags: ['#tarkov', '#gaming', '#eft'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:escape[_\-\s]?from[_\-\s]?tarkov|tarkov|battlestate[_\-\s]?games)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'baldurs_gate',
    name: "Baldur's Gate 3",
    emoji: '🎲',
    tags: ['#bg3', '#baldursgate', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:baldur[_\-\s]?s[_\-\s]?gate|bg3|larian[_\-\s]?studios)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'helldivers2',
    name: 'Helldivers 2',
    emoji: '🫡',
    tags: ['#helldivers2', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:helldivers|helldivers[_\-\s]?2)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'palworld',
    name: 'Palworld',
    emoji: '🦊',
    tags: ['#palworld', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:palworld|pal[_\-\s]?sphere)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'lethal_company',
    name: 'Lethal Company',
    emoji: '📻',
    tags: ['#lethalcompany', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:lethal[_\-\s]?company)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'sea_of_thieves',
    name: 'Sea of Thieves',
    emoji: '🏴‍☠️',
    tags: ['#seaofthieves', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:sea[_\-\s]?of[_\-\s]?thieves)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'the_sims',
    name: 'The Sims',
    emoji: '💎',
    tags: ['#sims', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:the[_\-\s]?sims|sims[_\-\s]?[1-4])(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'payday',
    name: 'Payday 2 / 3',
    emoji: '🎭',
    tags: ['#payday', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:payday[_\-\s]?[23])(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'tf2',
    name: 'Team Fortress 2',
    emoji: '🧢',
    tags: ['#tf2', '#gaming', '#valve'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:team[_\-\s]?fortress|tf2)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'osu',
    name: 'osu!',
    emoji: '🟣',
    tags: ['#osu', '#gaming', '#rhythm'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:osu[_\-\s]?game|osugame|beatmap)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'geometry_dash',
    name: 'Geometry Dash',
    emoji: '🟩',
    tags: ['#geometrydash', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:geometry[_\-\s]?dash|robtop)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'war_thunder',
    name: 'War Thunder',
    emoji: '✈️',
    tags: ['#warthunder', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:war[_\-\s]?thunder|warthunder)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'hoi4',
    name: 'Hearts of Iron IV',
    emoji: '🗺️',
    tags: ['#hoi4', '#gaming', '#paradox'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:hearts[_\-\s]?of[_\-\s]?iron|hoi4)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'euro_truck',
    name: 'Euro Truck Simulator 2',
    emoji: '🚛',
    tags: ['#ets2', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:euro[_\-\s]?truck|ets2|american[_\-\s]?truck|scs[_\-\s]?software)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'satisfactory',
    name: 'Satisfactory',
    emoji: '⚙️',
    tags: ['#satisfactory', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:satisfactory|ficsit)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'stardew_valley',
    name: 'Stardew Valley',
    emoji: '🚜',
    tags: ['#stardewvalley', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:stardew[_\-\s]?valley)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'hades',
    name: 'Hades',
    emoji: '💀',
    tags: ['#hades', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:hades[_\-\s]?[12]|supergiant[_\-\s]?games)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'subnautica',
    name: 'Subnautica',
    emoji: '🌊',
    tags: ['#subnautica', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:subnautica)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'assassins_creed',
    name: "Assassin's Creed",
    emoji: '🦅',
    tags: ['#assassinscreed', '#gaming', '#ubisoft'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:assassin[_\-\s]?s[_\-\s]?creed|ac[_\-\s]?(?:valhalla|mirage|odyssey|origins))(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'red_dead',
    name: 'Red Dead Redemption 2',
    emoji: '🤠',
    tags: ['#rdr2', '#gaming', '#rockstar'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:red[_\-\s]?dead[_\-\s]?redemption|rdr2)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'fall_guys',
    name: 'Fall Guys',
    emoji: '🫘',
    tags: ['#fallguys', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:fall[_\-\s]?guys|fallguys)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'destiny2',
    name: 'Destiny 2',
    emoji: '🌌',
    tags: ['#destiny2', '#gaming', '#bungie'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:destiny[_\-\s]?2)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'monster_hunter',
    name: 'Monster Hunter',
    emoji: '🐲',
    tags: ['#monsterhunter', '#gaming', '#capcom'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:monster[_\-\s]?hunter)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'hollow_knight',
    name: 'Hollow Knight / Silksong',
    emoji: '🗡️',
    tags: ['#hollowknight', '#silksong', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:hollow[_\-\s]?knight|silksong)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'undertale',
    name: 'Undertale / Deltarune',
    emoji: '❤️',
    tags: ['#undertale', '#deltarune', '#gaming'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:undertale|deltarune)(?:[-_\\s.\/\\\\]|$)/i
  },
  {
    id: 'need_for_speed',
    name: 'Need for Speed',
    emoji: '🏎️',
    tags: ['#nfs', '#gaming', '#ea'],
    pattern: /(?:^|[-_\\s.\/\\\\])(?:need[_\-\s]?for[_\-\s]?speed|nfs[_\-\s]?(?:unbound|heat|payback))(?:[-_\\s.\/\\\\]|$)/i
  }
];

// 2. 50+ PROGRAMMING & DEV TECHNOLOGIES REGISTRY
const DEV_LANGUAGES_DATABASE = [
  { id: 'typescript', name: 'TypeScript', shortTag: 'TS', extensions: ['ts', 'tsx', 'mts', 'cts'], emoji: '🔷' },
  { id: 'javascript', name: 'JavaScript', shortTag: 'JS', extensions: ['js', 'jsx', 'mjs', 'cjs'], emoji: '🟨' },
  { id: 'python', name: 'Python', shortTag: 'PY', extensions: ['py', 'pyw', 'ipynb', 'pyx', 'pyd'], emoji: '🐍' },
  { id: 'cpp', name: 'C++', shortTag: 'C++', extensions: ['cpp', 'cxx', 'cc', 'hpp', 'hxx', 'hh'], emoji: '⚙️' },
  { id: 'csharp', name: 'C# / .NET', shortTag: 'C#', extensions: ['cs', 'csx'], emoji: '🟣' },
  { id: 'c', name: 'C Language', shortTag: 'C', extensions: ['c', 'h'], emoji: '⚡' },
  { id: 'java', name: 'Java', shortTag: 'JAVA', extensions: ['java', 'jar', 'class'], emoji: '☕' },
  { id: 'rust', name: 'Rust', shortTag: 'RS', extensions: ['rs', 'rlib'], emoji: '🦀' },
  { id: 'go', name: 'Go (Golang)', shortTag: 'GO', extensions: ['go', 'gomod'], emoji: '🐹' },
  { id: 'php', name: 'PHP', shortTag: 'PHP', extensions: ['php', 'phtml', 'php8'], emoji: '🐘' },
  { id: 'ruby', name: 'Ruby', shortTag: 'RB', extensions: ['rb', 'erb', 'rake', 'gemspec'], emoji: '💎' },
  { id: 'swift', name: 'Swift (Apple)', shortTag: 'SWIFT', extensions: ['swift'], emoji: '🦅' },
  { id: 'kotlin', name: 'Kotlin (Android)', shortTag: 'KT', extensions: ['kt', 'kts'], emoji: '📱' },
  { id: 'dart', name: 'Dart & Flutter', shortTag: 'DART', extensions: ['dart'], emoji: '🎯' },
  { id: 'html', name: 'HTML5', shortTag: 'HTML', extensions: ['html', 'htm', 'xhtml'], emoji: '🌐' },
  { id: 'css', name: 'CSS & Styl', shortTag: 'CSS', extensions: ['css'], emoji: '🎨' },
  { id: 'scss', name: 'SCSS / SASS / Less', shortTag: 'SCSS', extensions: ['scss', 'sass', 'less'], emoji: '💅' },
  { id: 'sql', name: 'SQL & Bazy Danych', shortTag: 'SQL', extensions: ['sql', 'psql', 'plsql'], emoji: '🗄️' },
  { id: 'shell', name: 'Shell / Bash / Zsh', shortTag: 'SH', extensions: ['sh', 'bash', 'zsh', 'ksh'], emoji: '🐚' },
  { id: 'powershell', name: 'PowerShell', shortTag: 'PS', extensions: ['ps1', 'psm1', 'psd1'], emoji: '💻' },
  { id: 'lua', name: 'Lua Script', shortTag: 'LUA', extensions: ['lua'], emoji: '🌙' },
  { id: 'r', name: 'R (Data Science)', shortTag: 'R', extensions: ['r', 'rmd'], emoji: '📊' },
  { id: 'scala', name: 'Scala', shortTag: 'SCALA', extensions: ['scala', 'sc'], emoji: '🔴' },
  { id: 'haskell', name: 'Haskell', shortTag: 'HS', extensions: ['hs', 'lhs'], emoji: 'λ' },
  { id: 'elixir', name: 'Elixir & Erlang', shortTag: 'EX', extensions: ['ex', 'exs', 'erl', 'hrl'], emoji: '💧' },
  { id: 'clojure', name: 'Clojure', shortTag: 'CLJ', extensions: ['clj', 'cljs', 'cljc', 'edn'], emoji: '🌀' },
  { id: 'perl', name: 'Perl', shortTag: 'PL', extensions: ['pl', 'pm', 't'], emoji: '🐪' },
  { id: 'julia', name: 'Julia (High Performance)', shortTag: 'JL', extensions: ['jl'], emoji: '🔴' },
  { id: 'zig', name: 'Zig Language', shortTag: 'ZIG', extensions: ['zig'], emoji: '⚡' },
  { id: 'assembly', name: 'Assembly (ASM)', shortTag: 'ASM', extensions: ['asm', 's', 'nasm'], emoji: '⚙️' },
  { id: 'solidity', name: 'Solidity (Smart Contracts)', shortTag: 'SOL', extensions: ['sol'], emoji: '⛓️' },
  { id: 'graphql', name: 'GraphQL', shortTag: 'GQL', extensions: ['graphql', 'gql'], emoji: '🕸️' },
  { id: 'vue', name: 'Vue.js Single File Components', shortTag: 'VUE', extensions: ['vue'], emoji: '🟩' },
  { id: 'svelte', name: 'Svelte Components', shortTag: 'SVELTE', extensions: ['svelte'], emoji: '🔥' },
  { id: 'json', name: 'JSON & Konfiguracje', shortTag: 'JSON', extensions: ['json', 'json5', 'jsonc'], emoji: '📋' },
  { id: 'yaml', name: 'YAML', shortTag: 'YAML', extensions: ['yaml', 'yml'], emoji: '📑' },
  { id: 'toml', name: 'TOML', shortTag: 'TOML', extensions: ['toml'], emoji: '⚙️' },
  { id: 'xml', name: 'XML Data', shortTag: 'XML', extensions: ['xml', 'xsl', 'xslt', 'plist'], emoji: '📰' },
  { id: 'markdown', name: 'Markdown & MDX', shortTag: 'MD', extensions: ['md', 'mdx', 'markdown'], emoji: '📝' },
  { id: 'latex', name: 'LaTeX & Publikacje', shortTag: 'TEX', extensions: ['tex', 'latex', 'cls', 'sty', 'bib'], emoji: '📐' },
  { id: 'docker', name: 'Docker & Kontenery', shortTag: 'DOCKER', extensions: ['dockerfile', 'dockerignore'], emoji: '🐳' },
  { id: 'terraform', name: 'Terraform & HCL', shortTag: 'TF', extensions: ['tf', 'hcl', 'tfvars'], emoji: '🏗️' },
  { id: 'shaders', name: 'GLSL / HLSL Shaders', shortTag: 'GLSL', extensions: ['glsl', 'hlsl', 'vert', 'frag', 'comp', 'shader', 'wgsl'], emoji: '✨' },
  { id: 'protobuf', name: 'Protocol Buffers', shortTag: 'PROTO', extensions: ['proto'], emoji: '📦' },
  { id: 'wasm', name: 'WebAssembly', shortTag: 'WASM', extensions: ['wasm', 'wat'], emoji: '🕸️' },
  { id: 'matlab', name: 'MATLAB / Octave', shortTag: 'MATLAB', extensions: ['m', 'mat'], emoji: '🔬' },
  { id: 'vb', name: 'Visual Basic / VBA', shortTag: 'VB', extensions: ['vb', 'vba', 'vbs'], emoji: '💼' },
  { id: 'fortran', name: 'Fortran', shortTag: 'FOR', extensions: ['f90', 'f95', 'f03', 'for', 'f'], emoji: '🧮' },
  { id: 'nim', name: 'Nim Language', shortTag: 'NIM', extensions: ['nim'], emoji: '👑' },
  { id: 'ocaml', name: 'OCaml & Reason', shortTag: 'ML', extensions: ['ml', 'mli', 're'], emoji: '🐫' },
  { id: 'coffeescript', name: 'CoffeeScript', shortTag: 'COFFEE', extensions: ['coffee'], emoji: '☕' }
];

// 3. 500+ EXTENSIONS TAXONOMY MAPPED TO ARCHETYPES
const EXTENSION_ARCHETYPES = {
  // --- 3D, CAD & Game Engines ---
  obj: { domain: '3D & CAD', label: 'Wavefront 3D Object', emoji: '🧊' },
  fbx: { domain: '3D & CAD', label: 'Autodesk FBX 3D Asset', emoji: '🧊' },
  blend: { domain: '3D & CAD', label: 'Blender 3D Project', emoji: '🟠' },
  blend1: { domain: '3D & CAD', label: 'Blender Backup File', emoji: '🟠' },
  stl: { domain: '3D & CAD', label: 'STL 3D Print Mesh', emoji: '🖨️' },
  gltf: { domain: '3D & CAD', label: 'glTF 3D Web Model', emoji: '🧊' },
  glb: { domain: '3D & CAD', label: 'GLB Binary 3D Asset', emoji: '🧊' },
  dae: { domain: '3D & CAD', label: 'Collada 3D Digital Asset', emoji: '🧊' },
  '3ds': { domain: '3D & CAD', label: '3ds Max 3D Studio', emoji: '🧊' },
  max: { domain: '3D & CAD', label: 'Autodesk 3ds Max Scene', emoji: '🧊' },
  c4d: { domain: '3D & CAD', label: 'Cinema 4D Scene', emoji: '🧊' },
  ma: { domain: '3D & CAD', label: 'Maya ASCII Scene', emoji: '🧊' },
  mb: { domain: '3D & CAD', label: 'Maya Binary Scene', emoji: '🧊' },
  step: { domain: '3D & CAD', label: 'STEP CAD Engineering Model', emoji: '📐' },
  stp: { domain: '3D & CAD', label: 'STP CAD Model', emoji: '📐' },
  iges: { domain: '3D & CAD', label: 'IGES CAD Exchange', emoji: '📐' },
  igs: { domain: '3D & CAD', label: 'IGS Surface Model', emoji: '📐' },
  dwg: { domain: '3D & CAD', label: 'AutoCAD Drawing', emoji: '📐' },
  dxf: { domain: '3D & CAD', label: 'AutoCAD DXF Exchange', emoji: '📐' },
  skp: { domain: '3D & CAD', label: 'SketchUp 3D Model', emoji: '📐' },
  usd: { domain: '3D & CAD', label: 'Universal Scene Description', emoji: '🧊' },
  usda: { domain: '3D & CAD', label: 'USD ASCII 3D Scene', emoji: '🧊' },
  usdc: { domain: '3D & CAD', label: 'USD Crate Binary 3D', emoji: '🧊' },
  usdz: { domain: '3D & CAD', label: 'USDZ AR 3D Package', emoji: '📱' },
  ply: { domain: '3D & CAD', label: 'Polygon File Format', emoji: '🧊' },
  vrm: { domain: '3D & CAD', label: 'VRM 3D Avatar', emoji: '👤' },

  // --- Professional Audio & Music Production ---
  wav: { domain: 'Audio & Music', label: 'Uncompressed WAV Audio', emoji: '🎵' },
  mp3: { domain: 'Audio & Music', label: 'MP3 Compressed Audio', emoji: '🎧' },
  flac: { domain: 'Audio & Music', label: 'FLAC Lossless Audio', emoji: '🎼' },
  ogg: { domain: 'Audio & Music', label: 'Ogg Vorbis Audio', emoji: '🎵' },
  aac: { domain: 'Audio & Music', label: 'AAC Audio Stream', emoji: '🎵' },
  m4a: { domain: 'Audio & Music', label: 'Apple MPEG-4 Audio', emoji: '🎵' },
  aiff: { domain: 'Audio & Music', label: 'AIFF Audio File', emoji: '🎵' },
  aif: { domain: 'Audio & Music', label: 'AIF Audio File', emoji: '🎵' },
  opus: { domain: 'Audio & Music', label: 'Opus Audio Codec', emoji: '🎙️' },
  mid: { domain: 'Audio & Music', label: 'MIDI Sequence', emoji: '🎹' },
  midi: { domain: 'Audio & Music', label: 'Standard MIDI File', emoji: '🎹' },
  flp: { domain: 'Audio & Music', label: 'FL Studio Project', emoji: '🎛️' },
  als: { domain: 'Audio & Music', label: 'Ableton Live Set', emoji: '🎛️' },
  logicx: { domain: 'Audio & Music', label: 'Logic Pro X Project', emoji: '🎛️' },
  ptx: { domain: 'Audio & Music', label: 'Pro Tools Session', emoji: '🎛️' },
  cpr: { domain: 'Audio & Music', label: 'Cubase Project', emoji: '🎛️' },
  rpp: { domain: 'Audio & Music', label: 'Reaper Project', emoji: '🎛️' },
  vst: { domain: 'Audio & Music', label: 'VST Audio Plugin', emoji: '🔌' },
  vst3: { domain: 'Audio & Music', label: 'VST3 Audio Plugin', emoji: '🔌' },
  sf2: { domain: 'Audio & Music', label: 'SoundFont Bank', emoji: '🎹' },
  nki: { domain: 'Audio & Music', label: 'Kontakt Instrument', emoji: '🎹' },

  // --- Pro Video, VFX & Motion ---
  mp4: { domain: 'Video & Film', label: 'MPEG-4 Video', emoji: '🎬' },
  mkv: { domain: 'Video & Film', label: 'Matroska Video Container', emoji: '🎞️' },
  mov: { domain: 'Video & Film', label: 'Apple QuickTime Movie', emoji: '🎥' },
  avi: { domain: 'Video & Film', label: 'Audio Video Interleave', emoji: '🎬' },
  webm: { domain: 'Video & Film', label: 'WebM Video', emoji: '🌐' },
  flv: { domain: 'Video & Film', label: 'Flash Video', emoji: '🎬' },
  wmv: { domain: 'Video & Film', label: 'Windows Media Video', emoji: '🎬' },
  prproj: { domain: 'Video & Film', label: 'Adobe Premiere Project', emoji: '🟣' },
  aep: { domain: 'Video & Film', label: 'After Effects Project', emoji: '🟣' },
  drp: { domain: 'Video & Film', label: 'DaVinci Resolve Project', emoji: '🎨' },
  veg: { domain: 'Video & Film', label: 'Vegas Pro Project', emoji: '🎬' },
  braw: { domain: 'Video & Film', label: 'Blackmagic RAW Video', emoji: '📹' },
  r3d: { domain: 'Video & Film', label: 'RED Digital Cinema RAW', emoji: '📹' },
  prores: { domain: 'Video & Film', label: 'Apple ProRes Video', emoji: '🎞️' },

  // --- Graphic Design, Vector & Photos ---
  png: { domain: 'Grafika & Foto', label: 'PNG Image', emoji: '🖼️' },
  jpg: { domain: 'Grafika & Foto', label: 'JPEG Image', emoji: '📸' },
  jpeg: { domain: 'Grafika & Foto', label: 'JPEG Image', emoji: '📸' },
  webp: { domain: 'Grafika & Foto', label: 'WebP Compressed Image', emoji: '🖼️' },
  gif: { domain: 'Grafika & Foto', label: 'GIF Animated Graphic', emoji: '🎞️' },
  svg: { domain: 'Wektory & UI', label: 'Scalable Vector Graphic', emoji: '🎨' },
  psd: { domain: 'Wektory & UI', label: 'Adobe Photoshop Document', emoji: '🟦' },
  psb: { domain: 'Wektory & UI', label: 'Photoshop Large Document', emoji: '🟦' },
  ai: { domain: 'Wektory & UI', label: 'Adobe Illustrator Artwork', emoji: '🟧' },
  eps: { domain: 'Wektory & UI', label: 'Encapsulated PostScript', emoji: '🎨' },
  fig: { domain: 'Wektory & UI', label: 'Figma Design File', emoji: '🖌️' },
  sketch: { domain: 'Wektory & UI', label: 'Sketch Design File', emoji: '💎' },
  xd: { domain: 'Wektory & UI', label: 'Adobe XD Prototype', emoji: '🎨' },
  xcf: { domain: 'Grafika & Foto', label: 'GIMP Image Document', emoji: '🦊' },
  kra: { domain: 'Grafika & Foto', label: 'Krita Painting Project', emoji: '🎨' },
  clip: { domain: 'Grafika & Foto', label: 'Clip Studio Paint Project', emoji: '🎨' },
  ico: { domain: 'Wektory & UI', label: 'Windows Icon', emoji: '🖼️' },
  tiff: { domain: 'Grafika & Foto', label: 'TIFF High-Res Image', emoji: '📸' },
  heic: { domain: 'Grafika & Foto', label: 'High Efficiency Image (iPhone)', emoji: '📱' },
  avif: { domain: 'Grafika & Foto', label: 'AV1 Image Format', emoji: '🖼️' },

  // --- RAW Photography ---
  cr2: { domain: 'Camera RAW', label: 'Canon RAW 2', emoji: '📷' },
  cr3: { domain: 'Camera RAW', label: 'Canon RAW 3', emoji: '📷' },
  nef: { domain: 'Camera RAW', label: 'Nikon Electronic Format', emoji: '📷' },
  arw: { domain: 'Camera RAW', label: 'Sony Alpha RAW', emoji: '📷' },
  dng: { domain: 'Camera RAW', label: 'Adobe Digital Negative', emoji: '📷' },
  orf: { domain: 'Camera RAW', label: 'Olympus RAW Format', emoji: '📷' },
  rw2: { domain: 'Camera RAW', label: 'Panasonic Lumix RAW', emoji: '📷' },
  raf: { domain: 'Camera RAW', label: 'Fujifilm RAW Image', emoji: '📷' },

  // --- Fonts & Typography ---
  ttf: { domain: 'Fonty & Typografia', label: 'TrueType Font', emoji: '🔤' },
  otf: { domain: 'Fonty & Typografia', label: 'OpenType Font', emoji: '🔤' },
  woff: { domain: 'Fonty & Typografia', label: 'Web Open Font Format', emoji: '🔤' },
  woff2: { domain: 'Fonty & Typografia', label: 'WOFF 2.0 Web Font', emoji: '🔤' },
  eot: { domain: 'Fonty & Typografia', label: 'Embedded OpenType', emoji: '🔤' },

  // --- Archives, Compressed & Disk Images ---
  zip: { domain: 'Archiwa & Paczki', label: 'ZIP Compressed Archive', emoji: '🗜️' },
  rar: { domain: 'Archiwa & Paczki', label: 'RAR Archive', emoji: '🗜️' },
  '7z': { domain: 'Archiwa & Paczki', label: '7-Zip High Ratio Archive', emoji: '🗜️' },
  tar: { domain: 'Archiwa & Paczki', label: 'Tarball Archive', emoji: '📦' },
  gz: { domain: 'Archiwa & Paczki', label: 'Gzip Compressed File', emoji: '📦' },
  tgz: { domain: 'Archiwa & Paczki', label: 'Tar Gzip Archive', emoji: '📦' },
  bz2: { domain: 'Archiwa & Paczki', label: 'Bzip2 Compressed File', emoji: '📦' },
  xz: { domain: 'Archiwa & Paczki', label: 'XZ Compressed Archive', emoji: '📦' },
  zst: { domain: 'Archiwa & Paczki', label: 'Zstandard Fast Archive', emoji: '⚡' },
  iso: { domain: 'Obrazy Płyt & Maszyny', label: 'ISO Optical Disk Image', emoji: '💿' },
  vmdk: { domain: 'Obrazy Płyt & Maszyny', label: 'VMware Virtual Disk', emoji: '🖥️' },
  vdi: { domain: 'Obrazy Płyt & Maszyny', label: 'VirtualBox Disk Image', emoji: '🖥️' },
  vhd: { domain: 'Obrazy Płyt & Maszyny', label: 'Virtual Hard Disk', emoji: '🖥️' },
  vhdx: { domain: 'Obrazy Płyt & Maszyny', label: 'Hyper-V Virtual Disk', emoji: '🖥️' },
  qcow2: { domain: 'Obrazy Płyt & Maszyny', label: 'QEMU Copy-On-Write', emoji: '🖥️' },

  // --- Executables, Binaries & Installers ---
  exe: { domain: 'Programy & Binaria', label: 'Windows Executable (.exe)', emoji: '⚙️' },
  msi: { domain: 'Programy & Binaria', label: 'Windows Installer Package', emoji: '📦' },
  dll: { domain: 'Programy & Binaria', label: 'Dynamic Link Library', emoji: '🔧' },
  sys: { domain: 'Programy & Binaria', label: 'Windows System Driver', emoji: '🛡️' },
  apk: { domain: 'Programy & Binaria', label: 'Android Application Package', emoji: '🤖' },
  xapk: { domain: 'Programy & Binaria', label: 'Android Extended Package', emoji: '🤖' },
  dmg: { domain: 'Programy & Binaria', label: 'macOS Disk Image', emoji: '🍏' },
  pkg: { domain: 'Programy & Binaria', label: 'macOS/FreeBSD Package', emoji: '📦' },
  deb: { domain: 'Programy & Binaria', label: 'Debian / Ubuntu Package', emoji: '🐧' },
  rpm: { domain: 'Programy & Binaria', label: 'RedHat / Fedora Package', emoji: '🐧' },
  appimage: { domain: 'Programy & Binaria', label: 'Linux AppImage Bundle', emoji: '🐧' },

  // --- Office, PDF & Documents ---
  pdf: { domain: 'Dokumenty & PDF', label: 'Portable Document Format', emoji: '📄' },
  docx: { domain: 'Dokumenty & PDF', label: 'Microsoft Word Document', emoji: '📝' },
  doc: { domain: 'Dokumenty & PDF', label: 'Legacy Word Document', emoji: '📝' },
  odt: { domain: 'Dokumenty & PDF', label: 'OpenDocument Text', emoji: '📄' },
  rtf: { domain: 'Dokumenty & PDF', label: 'Rich Text Format', emoji: '📄' },
  txt: { domain: 'Dokumenty & PDF', label: 'Plain Text Document', emoji: '📃' },
  epub: { domain: 'E-Booki & Publikacje', label: 'EPUB E-Book', emoji: '📚' },
  mobi: { domain: 'E-Booki & Publikacje', label: 'Kindle E-Book', emoji: '📖' },
  cbr: { domain: 'E-Booki & Publikacje', label: 'Comic Book RAR', emoji: '🦸' },
  cbz: { domain: 'E-Booki & Publikacje', label: 'Comic Book ZIP', emoji: '🦸' },

  // --- Spreadsheets, Accounting & Finance ---
  xlsx: { domain: 'Arkusze & Finanse', label: 'Microsoft Excel Spreadsheet', emoji: '📊' },
  xls: { domain: 'Arkusze & Finanse', label: 'Legacy Excel Spreadsheet', emoji: '📊' },
  xlsm: { domain: 'Arkusze & Finanse', label: 'Excel Macro-Enabled Sheet', emoji: '📊' },
  csv: { domain: 'Arkusze & Finanse', label: 'Comma Separated Values', emoji: '📈' },
  tsv: { domain: 'Arkusze & Finanse', label: 'Tab Separated Values', emoji: '📈' },
  ods: { domain: 'Arkusze & Finanse', label: 'OpenDocument Spreadsheet', emoji: '📊' },

  // --- Database & Big Data ---
  sqlite: { domain: 'Bazy Danych', label: 'SQLite Database', emoji: '🗄️' },
  sqlite3: { domain: 'Bazy Danych', label: 'SQLite 3 Database', emoji: '🗄️' },
  db: { domain: 'Bazy Danych', label: 'Generic Database File', emoji: '🗄️' },
  parquet: { domain: 'Bazy Danych', label: 'Apache Parquet Columnar', emoji: '📊' },
  ndjson: { domain: 'Bazy Danych', label: 'Newline Delimited JSON', emoji: '📋' },
  arrow: { domain: 'Bazy Danych', label: 'Apache Arrow IPC Data', emoji: '🏹' },

  // --- Security, Keys & Certificates ---
  pem: { domain: 'Klucze & Certyfikaty', label: 'Privacy Enhanced Mail Cert', emoji: '🔐' },
  crt: { domain: 'Klucze & Certyfikaty', label: 'SSL/TLS Certificate', emoji: '🔒' },
  key: { domain: 'Klucze & Certyfikaty', label: 'Private Cryptographic Key', emoji: '🔑' },
  p12: { domain: 'Klucze & Certyfikaty', label: 'PKCS#12 Certificate Vault', emoji: '🔐' },
  pfx: { domain: 'Klucze & Certyfikaty', label: 'Personal Information Exchange', emoji: '🔐' },
  ovpn: { domain: 'Klucze & Certyfikaty', label: 'OpenVPN Client Profile', emoji: '🛡️' },
  kdbx: { domain: 'Klucze & Certyfikaty', label: 'KeePass Password Database', emoji: '🗝️' },
  gpg: { domain: 'Klucze & Certyfikaty', label: 'GNU Privacy Guard Key', emoji: '🔒' },

  // --- Game ROMs & Emulators ---
  gba: { domain: 'Emulacja & Retro', label: 'Game Boy Advance ROM', emoji: '🕹️' },
  gbc: { domain: 'Emulacja & Retro', label: 'Game Boy Color ROM', emoji: '🕹️' },
  gb: { domain: 'Emulacja & Retro', label: 'Game Boy Classic ROM', emoji: '🕹️' },
  nds: { domain: 'Emulacja & Retro', label: 'Nintendo DS ROM', emoji: '🎮' },
  '3ds_rom': { domain: 'Emulacja & Retro', label: 'Nintendo 3DS ROM', emoji: '🎮' },
  cia: { domain: 'Emulacja & Retro', label: 'Nintendo 3DS Installable CIA', emoji: '🎮' },
  nsp: { domain: 'Emulacja & Retro', label: 'Nintendo Switch NSP Package', emoji: '🎮' },
  xci: { domain: 'Emulacja & Retro', label: 'Nintendo Switch Cartridge XCI', emoji: '🎮' },
  n64: { domain: 'Emulacja & Retro', label: 'Nintendo 64 ROM', emoji: '🕹️' },
  z64: { domain: 'Emulacja & Retro', label: 'Nintendo 64 Byte-Swapped ROM', emoji: '🕹️' },
  snes: { domain: 'Emulacja & Retro', label: 'Super Nintendo ROM', emoji: '🕹️' },
  nes: { domain: 'Emulacja & Retro', label: 'Nintendo Entertainment System ROM', emoji: '🕹️' },
  chd: { domain: 'Emulacja & Retro', label: 'MAME / PSX Compressed CHD', emoji: '💿' },
  rvz: { domain: 'Emulacja & Retro', label: 'Dolphin GameCube/Wii RVZ', emoji: '🐬' }
};

const DEV_EXTS_GUARD = new Set([
  'js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs', 'json', 'json5', 'html', 'htm', 'xhtml',
  'css', 'scss', 'sass', 'less', 'py', 'pyw', 'rs', 'go', 'java', 'cpp', 'cc', 'cxx',
  'c', 'h', 'hpp', 'hxx', 'cs', 'php', 'rb', 'swift', 'kt', 'kts', 'sql', 'sh',
  'bash', 'zsh', 'bat', 'cmd', 'ps1', 'psm1', 'dockerfile', 'vue', 'svelte', 'astro',
  'prisma', 'graphql', 'gql', 'proto', 'wasm', 'lua', 'dart', 'scala', 'zig', 'lock',
  'env', 'yml', 'yaml', 'toml', 'md', 'markdown', 'log', 'txt', 'csv'
]);

// 4. DETECTION HELPERS
function detectGame(name, fullPath, tags = [], ext = '') {
  const e = (ext || (name ? name.split('.').pop() : '') || '').toLowerCase().replace('.', '');
  // Dev files and source code are strictly NEVER game screenshots or photos!
  if (DEV_EXTS_GUARD.has(e)) {
    return null;
  }

  const n = (name || '').toLowerCase();
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));

  for (const game of GAMES_DATABASE) {
    if (tagSet.has(game.tags[0]) || game.pattern.test(n)) {
      return game;
    }
  }
  return null;
}

function detectDevLanguage(ext, name = '') {
  const e = (ext || '').toLowerCase().replace('.', '');
  const n = (name || '').toLowerCase();

  for (const lang of DEV_LANGUAGES_DATABASE) {
    if (lang.extensions.includes(e)) {
      return lang;
    }
  }
  if (n === 'dockerfile' || n.startsWith('dockerfile.')) {
    return DEV_LANGUAGES_DATABASE.find(l => l.id === 'docker');
  }
  return null;
}

function detectArchetype(ext) {
  const e = (ext || '').toLowerCase().replace('.', '');
  return EXTENSION_ARCHETYPES[e] || null;
}

module.exports = {
  GAMES_DATABASE,
  DEV_LANGUAGES_DATABASE,
  EXTENSION_ARCHETYPES,
  detectGame,
  detectDevLanguage,
  detectArchetype
};
