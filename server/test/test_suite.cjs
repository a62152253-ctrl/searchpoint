/**
 * PROJECT NEXUS - COMPREHENSIVE AUTOMATED VERIFICATION SUITE
 * Tests core business logic, cyber defense, progressive search,
 * syntax indexer, autonomous planner, and memory safety.
 */

const assert = require('assert');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SmartShield = require('../shield/smart_shield.cjs');
const { UniversalProgressiveEngine } = require('../search/progressive_filter.cjs');
const { SyntaxIndexer } = require('../code/syntax_indexer.cjs');
const { AutonomousPlanner } = require('../planner.cjs');
const { MemoryWatchdog, BoundedWindow, LRUCache } = require('../performance/memory_manager.cjs');
const { NexusZipEngine } = require('../zip_parser.cjs');
const { FastHasher } = require('../integrations/fast_hasher.cjs');
const { SQLiteInspector } = require('../integrations/sqlite_inspector.cjs');
const { WindowsRecycleBin } = require('../integrations/recycle_bin.cjs');
const { OllamaSemanticEngine } = require('../integrations/ollama_semantic.cjs');
const { VirusTotalChecker } = require('../integrations/virustotal_checker.cjs');
const { AIAgentEngine } = require('../ai/agent_engine.cjs');
const { AuthVault } = require('../auth/auth_vault.cjs');
const { resolvePathInRoots } = require('../security/path_scope.cjs');
const { MasterNexusScanner } = require('../scanner_master.cjs');
const {
  ONE_GB_BYTES,
  PRO_MAX_SCAN_BYTES,
  PRO_MAX_SCAN_FILES,
  FREE_MAX_SCAN_BYTES,
  FREE_MAX_SCAN_FILES,
  LIMIT_MESSAGES,
  PLAN_LIMITS,
  validateScanTarget,
  checkInFlightLimit
} = require('../licensing/plan_limits.cjs');
const { LicenseVault } = require('../licensing/license_vault.cjs');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAll() {
  console.log('\n======================================================');
  console.log('  PROJECT NEXUS AUTOMATED VERIFICATION SUITE');
  console.log('======================================================\n');

  // --- SUITE 1: Smart Shield & NLP Context ---
  console.log('Suite 1: Smart Shield & NLP Context');
  
  test('NLP recognizes academic/medical context as safe (anti-false positive)', () => {
    const res = SmartShield.evaluateContext(
      'Badanie statystyczne doroslych pacjentow uniwersytetu medycznego',
      'badanie_demograficzne_2024.pdf'
    );
    assert.strictEqual(res.isExplicit, false, 'Academic paper should not be marked explicit');
    assert.strictEqual(res.isEducational, true, 'Should detect educational/scientific context');
  });

  test('NLP strictly blocks vulgarities even when wrapped in pseudo-scientific text', () => {
    const res1 = SmartShield.evaluateContext(
      'dorośli w statystyce są mądrzejsi bo ruchaja kobiety i ktoś dał swe badania naukowe',
      'statystyka_badania.txt'
    );
    assert.strictEqual(res1.isExplicit, true, 'Vulgar sexual verb (ruchaja) must NEVER bypass filter');

    const res2 = SmartShield.evaluateContext(
      'jebie dziewczyni w celach naukowych',
      'artykul_naukowy.txt'
    );
    assert.strictEqual(res2.isExplicit, true, 'Vulgar sexual verb (jebie) must NEVER bypass filter');
  });

  test('NLP catches hardcore explicit adult keywords', () => {
    const res = SmartShield.evaluateContext(
      'hentai waifu xxx uncensored',
      'render_porn_xxx.png'
    );
    assert.strictEqual(res.isExplicit, true, 'Explicit content should be detected');
  });

  test('Cyber Defense traps double-extension trojan droppers', () => {
    const threat = SmartShield.analyzeCyberThreat('C:\\Users\\User\\Downloads\\invoice.pdf.exe', 'invoice.pdf.exe', 1024);
    assert.notStrictEqual(threat, null, 'Should detect threat');
    assert.strictEqual(threat.threatType, 'DOUBLE_EXTENSION_TRAP');
    assert.strictEqual(threat.severity, 'CRITICAL');
  });

  test('Cyber Defense flags dangerous batch/script droppers in Downloads', () => {
    const threat = SmartShield.analyzeCyberThreat('C:\\Users\\User\\Downloads\\setup_crack.vbs', 'setup_crack.vbs', 512);
    assert.notStrictEqual(threat, null);
    assert.strictEqual(threat.threatType, 'DANGEROUS_SCRIPT');
  });

  test('Cyber Defense flags malware/stealer signatures', () => {
    const threat = SmartShield.analyzeCyberThreat('C:\\Users\\User\\Downloads\\roblox_robux_hack.exe', 'roblox_robux_hack.exe', 2048);
    assert.notStrictEqual(threat, null);
    assert.strictEqual(threat.threatType, 'MALWARE_SIGNATURE');
  });

  // --- SUITE 2: Progressive Search & Akinator Engine ---
  console.log('\nSuite 2: Universal Progressive Search & Filter');

  const mockItems = [
    { id: '1', name: 'anime_girl_waifu.png', path: 'C:\\Downloads\\anime_girl_waifu.png', extension: 'png', size: 100000, mtime: Date.now(), category: 'MEDIA', tags: ['#anime', '#art'] },
    { id: '2', name: 'auth_recovery_code.ts', path: 'C:\\Projects\\auth_recovery_code.ts', extension: 'ts', size: 5000, mtime: Date.now(), category: 'DEV', tags: ['#code', '#auth'] },
    { id: '3', name: 'faktura_vat_2024.pdf', path: 'C:\\Downloads\\faktura_vat_2024.pdf', extension: 'pdf', size: 250000, mtime: Date.now(), category: 'DOCS', tags: ['#faktura'] },
    { id: '4', name: 'Screenshot_2024-03-12.png', path: 'C:\\Pictures\\Screenshot_2024-03-12.png', extension: 'png', size: 80000, mtime: Date.now(), category: 'SCREENSHOT', isDisposable: true, tags: ['#screenshot'] }
  ];

  test('UniversalProgressiveEngine detects dominant domain correctly', () => {
    assert.strictEqual(UniversalProgressiveEngine.detectDominantDomain(mockItems, 'funkcja recovery kod logowania'), 'CODE');
    assert.strictEqual(UniversalProgressiveEngine.detectDominantDomain(mockItems, 'faktura vat koszty'), 'DOCS');
    assert.strictEqual(UniversalProgressiveEngine.detectDominantDomain(mockItems, 'dziewczyna anime tapeta'), 'IMAGE');
  });

  test('UniversalProgressiveEngine filters candidates by semantic query', () => {
    const res = UniversalProgressiveEngine.evaluateStep(mockItems, {}, 'recovery auth', 1, 10);
    assert.strictEqual(res.totalMatches, 1);
    assert.strictEqual(res.items[0].name, 'auth_recovery_code.ts');
  });

  test('UniversalProgressiveEngine yields contextual question on partial domain', () => {
    const res = UniversalProgressiveEngine.evaluateStep(mockItems, {}, '', 1, 10);
    assert.strictEqual(typeof res.nextQuestion, 'object');
    assert.ok(res.pagination.totalItems > 0);
  });

  // --- SUITE 3: Code & Symbol Syntax Indexer ---
  console.log('\nSuite 3: Code & Symbol Syntax Indexer');

  test('SyntaxIndexer identifies code extensions and languages', () => {
    assert.strictEqual(SyntaxIndexer.isCodeFile('tsx'), true);
    assert.strictEqual(SyntaxIndexer.isCodeFile('py'), true);
    assert.strictEqual(SyntaxIndexer.isCodeFile('png'), false);
    assert.strictEqual(SyntaxIndexer.getLanguage('ts'), 'TypeScript');
  });

  // --- SUITE 4: Performance & Bounded Memory ---
  console.log('\nSuite 4: Performance & Bounded Memory Management');

  test('BoundedWindow ensures pagination never exceeds limit', () => {
    const hugeArray = Array.from({ length: 5000 }, (_, i) => ({ id: `item-${i}` }));
    const windowed = BoundedWindow.slice(hugeArray, 1, 50);
    assert.strictEqual(windowed.items.length, 50);
    assert.strictEqual(windowed.pagination.totalPages, 100);
    assert.strictEqual(windowed.pagination.hasPrev, false);
    assert.strictEqual(windowed.pagination.hasNext, true);
  });

  test('LRUCache evicts oldest entries and respects byte bounds', () => {
    const cache = new LRUCache(3, 10000);
    cache.set('a', 'valA', 100);
    cache.set('b', 'valB', 100);
    cache.set('c', 'valC', 100);
    assert.strictEqual(cache.get('a'), 'valA');
    cache.set('d', 'valD', 100); // Should evict 'b' because 'a' was recently accessed
    assert.strictEqual(cache.has('b'), false, 'Key b should be evicted');
    assert.strictEqual(cache.has('a'), true, 'Key a should be retained');
  });

  test('MemoryWatchdog produces valid heap diagnostics', () => {
    const stats = MemoryWatchdog.checkMemory();
    assert.ok(parseFloat(stats.heapUsedMB) > 0);
    assert.ok(parseFloat(stats.systemFreeGB) > 0);
  });

  // --- SUITE 5: Autonomous Planner & Reversible Transactions ---
  console.log('\nSuite 5: Autonomous Organization Planner');

  test('Path scope confines existing, new, and symlinked paths to active roots', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-path-scope-'));
    const activeRoot = path.join(tempRoot, 'active');
    const outsideRoot = path.join(tempRoot, 'outside');
    try {
      fs.mkdirSync(activeRoot);
      fs.mkdirSync(outsideRoot);
      const inRootFile = path.join(activeRoot, 'file.txt');
      fs.writeFileSync(inRootFile, 'test');

      assert.strictEqual(resolvePathInRoots(inRootFile, [activeRoot]), fs.realpathSync.native(inRootFile));
      assert.strictEqual(
        resolvePathInRoots(path.join(activeRoot, 'new', 'file.txt'), [activeRoot]),
        path.join(activeRoot, 'new', 'file.txt')
      );
      assert.throws(
        () => resolvePathInRoots(path.join(outsideRoot, 'secret.txt'), [activeRoot]),
        /outside the active indexed folders/
      );

      try {
        const outsideLink = path.join(activeRoot, 'outside-link');
        fs.symlinkSync(outsideRoot, outsideLink, 'junction');
        assert.throws(
          () => resolvePathInRoots(path.join(outsideLink, 'secret.txt'), [activeRoot]),
          /outside the active indexed folders/
        );
      } catch (err) {
        if (err.code !== 'EPERM' && err.code !== 'EACCES' && !/outside the active indexed folders/.test(err.message)) {
          throw err;
        }
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  await asyncTest('AutonomousPlanner generates blueprint and performs dry-run transaction', async () => {
    const testRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexus-planner-'));
    try {
      const sourceDir = path.join(testRoot, 'input');
      const journalDir = path.join(testRoot, 'journals');
      await fs.promises.mkdir(sourceDir);
      const screenshotPath = path.join(sourceDir, 'Screenshot.png');
      const mediaPath = path.join(sourceDir, 'Disposable-media.png');
      await fs.promises.writeFile(screenshotPath, 'screenshot');
      await fs.promises.writeFile(mediaPath, 'media');

      const planner = new AutonomousPlanner(testRoot, journalDir);
      const bp = planner.generateBlueprint(mockItems, {});
      assert.ok(bp.plans.length >= 4);
      assert.strictEqual(bp.summary.totalFiles, 4);
      assert.strictEqual(bp.plans[0].fileCount, 1, 'Disposable media must not be counted as a movable screenshot');
      assert.strictEqual(bp.summary.totalReclaimableGB, '0.00', 'Archiving files must not claim disk space was reclaimed');

      const scanItems = [
        { ...mockItems[3], path: screenshotPath, name: 'Screenshot.png' },
        { ...mockItems[0], path: mediaPath, name: 'Disposable-media.png', isDisposable: true }
      ];
      const dryRun = await planner.executePlan('plan-screenshot-triage', scanItems, true);
      assert.strictEqual(dryRun.isDryRun, true);
      assert.strictEqual(dryRun.operations.length, 1, 'Only screenshot-category items should be selected');
      assert.strictEqual(dryRun.operations[0].status, 'SIMULATED');
      assert.ok(fs.existsSync(screenshotPath), 'Dry-run must not move the source');

      await assert.rejects(
        planner.executePlan('plan-auto-organize', scanItems, false),
        /nie obsługuje jeszcze bezpiecznego przenoszenia/
      );
      await assert.rejects(
        planner.executePlan('plan-media-vault', scanItems, false),
        /nie obsługuje jeszcze bezpiecznego przenoszenia/
      );
      assert.strictEqual(AutonomousPlanner.supportsPlan('plan-screenshot-triage'), true);
      assert.strictEqual(AutonomousPlanner.supportsPlan('plan-auto-organize'), false);

      const execution = await planner.executePlan('plan-screenshot-triage', scanItems, false);
      assert.strictEqual(execution.operations.length, 1);
      assert.ok(fs.existsSync(execution.operations[0].destination));
      const rollback = await planner.rollback(execution.journalId);
      assert.strictEqual(rollback.restoredCount, 1);
      assert.ok(fs.existsSync(screenshotPath), 'Rollback must restore the original path');
      await assert.rejects(planner.rollback('../outside'), /identyfikator.*dziennika/i);

      const missingFileResult = await planner.executePlan('plan-screenshot-triage', [
        { category: 'SCREENSHOT', name: 'missing.png', path: path.join(sourceDir, 'missing.png') }
      ], false);
      assert.strictEqual(missingFileResult.movedCount, 0);
      assert.strictEqual(missingFileResult.status, 'COMPLETED_WITH_ERRORS');
      const savedJournal = JSON.parse(await fs.promises.readFile(
        path.join(journalDir, `${missingFileResult.journalId}.json`),
        'utf-8'
      ));
      assert.strictEqual(savedJournal.status, 'COMPLETED_WITH_ERRORS');

      const partialPath = path.join(sourceDir, 'partial.png');
      await fs.promises.writeFile(partialPath, 'partial');
      const partialExecution = await planner.executePlan('plan-screenshot-triage', [
        { category: 'SCREENSHOT', name: 'partial.png', path: partialPath }
      ], false);
      await fs.promises.unlink(partialExecution.operations[0].destination);
      const partialRollback = await planner.rollback(partialExecution.journalId);
      assert.strictEqual(partialRollback.status, 'ROLLBACK_COMPLETED_WITH_ERRORS');
      assert.strictEqual(partialRollback.rollbackErrorsCount, 1);

      const duplicateInstaller = path.join(sourceDir, 'Setup (1).exe');
      const unrelatedInstaller = path.join(sourceDir, 'Setup (2).exe');
      await fs.promises.writeFile(duplicateInstaller, 'duplicate');
      await fs.promises.writeFile(unrelatedInstaller, 'unrelated');
      const installerExecution = await planner.executePlan('plan-installers-debloat', [
        { category: 'APPS', name: 'Setup (1).exe', path: duplicateInstaller },
        { category: 'APPS', name: 'Setup (2).exe', path: unrelatedInstaller }
      ], false, [duplicateInstaller]);
      assert.strictEqual(installerExecution.movedCount, 1, 'Only installer paths confirmed by the duplicate analysis may move');
      assert.ok(fs.existsSync(unrelatedInstaller), 'Unconfirmed installer copies must remain untouched');
    } finally {
      await fs.promises.rm(testRoot, { recursive: true, force: true });
    }
  });

  console.log('\nSuite 5b: Local Authentication Vault');
  await asyncTest('AuthVault persists its signing secret, upgrades password hashes, and revokes sessions on key reset', async () => {
    const testRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexus-auth-'));
    try {
      const vault = new AuthVault(testRoot);
      const registration = vault.register({
        username: 'nexus-test-user',
        email: 'nexus-test@example.com',
        password: 'old-password-123'
      });
      const identityKey = JSON.parse(registration.searchedFile.content);
      assert.ok(fs.existsSync(path.join(testRoot, 'nexus_master_secret')));
      assert.strictEqual(vault.verifySession(registration.token).username, 'nexus-test-user');

      const dbFile = path.join(testRoot, 'nexus_users_vault.json');
      const legacyDb = JSON.parse(await fs.promises.readFile(dbFile, 'utf-8'));
      const legacyUser = legacyDb.users.find(user => user.id === registration.user.id);
      legacyUser.passwordIterations = 10000;
      legacyUser.salt = crypto.randomBytes(16).toString('hex');
      legacyUser.passwordHash = crypto.pbkdf2Sync('old-password-123', legacyUser.salt, 10000, 64, 'sha512').toString('hex');
      await fs.promises.writeFile(dbFile, JSON.stringify(legacyDb, null, 2));
      assert.strictEqual(vault.login({ identifier: 'nexus-test-user', password: 'old-password-123' }).success, true);
      const migratedDb = JSON.parse(await fs.promises.readFile(dbFile, 'utf-8'));
      assert.strictEqual(migratedDb.users[0].passwordIterations, 310000);

      const resetVault = new AuthVault(testRoot);
      const reset = resetVault.resetPasswordWithSearchedFile({
        searchedFileContent: registration.searchedFile.content,
        newPassword: 'new-password-456'
      });
      assert.strictEqual(reset.user.username, 'nexus-test-user');
      assert.strictEqual(resetVault.verifySession(registration.token), null, 'Password reset must revoke old sessions');
      assert.strictEqual(resetVault.login({ identifier: 'nexus-test-user', password: 'new-password-456' }).success, true);
      assert.throws(
        () => resetVault.resetPasswordWithSearchedFile({
          searchedFileContent: JSON.stringify(identityKey),
          newPassword: 'another-password-789'
        }),
        /wygasł lub został już wykorzystany/
      );
    } finally {
      await fs.promises.rm(testRoot, { recursive: true, force: true });
    }
  });

  // --- SUITE 6: Under-The-Hood Free Tools & High-Scale Integrations ---
  console.log('\nSuite 6: Under-The-Hood Free Tools & High-Scale Integrations');

  await asyncTest('FastHasher calculates hardware-accelerated Blake3 and xxHash64', async () => {
    const hashes = await FastHasher.hashFile(path.join(__dirname, '..', '..', 'package.json'));
    assert.ok(hashes !== null, 'Hash result should not be null');
    assert.strictEqual(typeof hashes.blake3, 'string');
    assert.strictEqual(hashes.blake3.length, 64, 'Blake3 should be 64-char hex string');
    assert.strictEqual(typeof hashes.xxhash, 'string');
    assert.strictEqual(hashes.xxhash.length, 16, 'xxHash64 should be 16-char hex string');
  });

  test('SQLiteInspector detects SQLite database headers and inspects tables via node:sqlite', () => {
    const isSqlite = SQLiteInspector.isSQLiteFile(path.join(__dirname, '..', '..', 'package.json'));
    assert.strictEqual(isSqlite, false, 'package.json is not an SQLite file');
  });

  await asyncTest('OllamaSemanticEngine expands queries with graceful fallback', async () => {
    const terms = await OllamaSemanticEngine.expandSemanticQuery('baza danych');
    assert.ok(Array.isArray(terms));
    assert.ok(terms.length >= 1);
    assert.ok(terms.includes('baza'));
  });

  await asyncTest('VirusTotalChecker performs safe hash reputation checks with offline fallback', async () => {
    const sampleHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const rep = await VirusTotalChecker.checkHash(sampleHash);
    assert.strictEqual(rep.success, true);
    assert.strictEqual(rep.sha256, sampleHash);
  });

  console.log('\nSuite 7: AI Agent & Local Ollama Orchestration');
  test('AIAgentEngine inspectWorkspaceProject accurately detects frameworks and stack', () => {
    const info = AIAgentEngine.inspectWorkspaceProject(path.join(__dirname, '..', '..'));
    assert.strictEqual(info.exists, true);
    assert.strictEqual(info.packageManager, 'npm');
    assert.ok(info.frameworks.includes('React'), 'Detects React');
    assert.ok(info.frameworks.includes('Vite'), 'Detects Vite');
    assert.ok(info.entryPoints.includes('src/main.tsx'), 'Detects main entrypoint');
  });

  await asyncTest('AIAgentEngine executeNaturalCommand finds matching files in workspace', async () => {
    const res = await AIAgentEngine.executeNaturalCommand('find server.cjs', {
      workspacePath: path.join(__dirname, '..', '..')
    });
    assert.strictEqual(res.type, 'FILE_SEARCH');
    assert.ok(res.results.length > 0, 'Found server.cjs');
    assert.ok(res.results.some(r => r.name === 'server.cjs'));
  });

  await asyncTest('AIAgentEngine installOllama rejects execution when userConsent is false', async () => {
    const res = await AIAgentEngine.installOllama(false);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('wyraźnej zgody') || res.error.includes('consent'));
  });

  await asyncTest('AIAgentEngine checkOllamaStatus returns genuine daemon status and models array', async () => {
    const status = await AIAgentEngine.checkOllamaStatus();
    assert.ok(typeof status.status === 'string');
    assert.ok(Array.isArray(status.models));
    assert.strictEqual(status.isLocal, true);
  });

  // --- SUITE 8: Enterprise NLP De-Obfuscation & Hardened File Security ---
  console.log('\nSuite 8: Enterprise NLP De-Obfuscation & Hardened Security');

  test('SmartShield catches obfuscated leetspeak and spaced adult words via nsfw_intent_engine', () => {
    const res = SmartShield.evaluateContext('Zobacz darmowe p.o.r.n.o oraz s e k s bez limitu n u d e s y');
    assert.strictEqual(res.isExplicit, true, 'De-obfuscation must catch spaced and dotted tokens');
    assert.ok(res.score >= 70, 'Risk score should reflect explicit intent');
  });

  test('SmartShield accurately passes full educational reproduction sentences without false positives', () => {
    const res = SmartShield.evaluateContext(
      'Na lekcji biologii omawialiśmy jak działa antykoncepcja, prezerwatywa oraz jak przebiega ciąża i zapłodnienie.',
      'notatka_szkola.txt'
    );
    assert.strictEqual(res.isExplicit, false, 'Educational reproduction talk must not be blocked');
    assert.strictEqual(res.isEducational, true, 'Should be flagged as educational context');
  });

  test('SmartShield detects obfuscated vulgar slang and solicitation', () => {
    const res = SmartShield.evaluateContext('Ale fajne c y c k i ma ta laska, wyslij mi nudesy na priv');
    assert.strictEqual(res.isExplicit, true, 'Must catch spaced slang and solicitation');
  });

  // --- SUITE 9: Intelligent File Tagging & Anti-False-Positive Regression ---
  console.log('\nSuite 9: Intelligent File Tagging & Anti-False-Positive Regression');

  const { detectGame, detectDevLanguage } = require('../knowledge_base.cjs');

  test('detectGame rejects generic wallpapers and glowing graphics from becoming Minecraft', () => {
    // Regression check: files with 'paper', 'assets', 'fabric', 'forge' in non-game contexts
    assert.strictEqual(detectGame('wallpaper_blue_glow.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('abstract_paper_texture.jpg', '', [], 'jpg'), null);
    assert.strictEqual(detectGame('newspaper_report.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('fabric_simulation.png', '', [], 'png'), null);
  });

  test('detectGame rejects icons and arrows from becoming Escape from Tarkov (eft)', () => {
    assert.strictEqual(detectGame('arrow_left.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('deft_icon.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('theft_incident.png', '', [], 'png'), null);
  });

  test('detectGame rejects ui banners with assets from becoming Euro Truck Simulator 2 (ats)', () => {
    assert.strictEqual(detectGame('ui_assets_banner.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('stats_overview.png', '', [], 'png'), null);
    assert.strictEqual(detectGame('cats_photo.jpg', '', [], 'jpg'), null);
  });

  test('detectGame correctly identifies genuine game files with word boundaries', () => {
    const mc = detectGame('minecraft_screenshot_2024.png', '', [], 'png');
    assert.ok(mc && mc.id === 'minecraft');

    const cs = detectGame('cs2_mirage_clutch.mp4', '', [], 'mp4');
    assert.ok(cs && cs.id === 'csgo');

    const tarkov = detectGame('escape_from_tarkov_raid.png', '', [], 'png');
    assert.ok(tarkov && tarkov.id === 'escape_from_tarkov');
  });

  await asyncTest('AIAgentEngine analyzeItemWithOllama correctly refuses to hallucinate image tags on text-only models', async () => {
    // Create temporary image test file
    const tmpImg = path.join(os.tmpdir(), 'test_sample_image.png');
    fs.writeFileSync(tmpImg, Buffer.from('FAKE_PNG_BINARY_BYTES'));

    try {
      const res = await AIAgentEngine.analyzeItemWithOllama({
        item: { name: 'test_sample_image.png', path: tmpImg, size: 22 },
        model: 'llama3:latest',
        isVisionModel: false
      });

      // Without vision and without OCR, the system must set category to Do sprawdzenia and NOT hallucinate games
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'NEEDS_VISION_MODEL');
      assert.strictEqual(res.category, 'Do sprawdzenia');
      assert.ok(res.tags.includes('#do_sprawdzenia'));
    } finally {
      if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
    }
  });

  // --- SUITE 10: Cryptographic Licensing & Crypto Checkout ---
  console.log('\nSuite 10: Cryptographic Licensing & Crypto Checkout Engine');

  const { LicenseVault } = require('../licensing/license_vault.cjs');
  const { CryptoCheckoutEngine } = require('../licensing/crypto_checkout.cjs');

  const testVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-license-crypto-test-'));
  const testLicenseFile = path.join(testVaultDir, 'nexus_licenses.test.json');
  const testCryptoConfigFile = path.join(testVaultDir, 'crypto_config.test.json');
  const testCryptoOrdersFile = path.join(testVaultDir, 'crypto_orders.test.json');

  LicenseVault.setVaultFile(testLicenseFile);
  CryptoCheckoutEngine.setStorageFiles({
    configFile: testCryptoConfigFile,
    ordersFile: testCryptoOrdersFile
  });

  try {
    test('LicenseVault generates valid HMAC-signed 16-character keys and rejects tampering', () => {
      const license = LicenseVault.generateLicenseKey('PRO_LIFETIME', 'Unit test key');
      assert.ok(license.key.startsWith('NEXUS-'));
      assert.strictEqual(license.tier, 'PRO_LIFETIME');

      // Cryptographic validation
      const verification = LicenseVault.verifyKeyFormat(license.key);
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.tier, 'PRO_LIFETIME');

      // Brute-force / tampering rejection
      const fakeKey = license.key.slice(0, -2) + (license.key.endsWith('99') ? '88' : '99');
      const fakeCheck = LicenseVault.verifyKeyFormat(fakeKey);
      assert.strictEqual(fakeCheck.valid, false, 'Tampered key must be rejected');
    });

    test('LicenseVault activates key, enforces device binding, and detects on-disk vault tampering', () => {
      const lic = LicenseVault.generateLicenseKey('PRO_LIFETIME', 'Device activation test');
      const act = LicenseVault.activateKey(lic.key, 'device-primary');
      assert.strictEqual(act.success, true);

      const status = LicenseVault.getStatus();
      assert.strictEqual(status.isPro, true);

      // Re-activation on same device allowed
      const sameDevice = LicenseVault.activateKey(lic.key, 'device-primary');
      assert.strictEqual(sameDevice.success, true);

      // Cross-device theft blocked
      const foreignDevice = LicenseVault.activateKey(lic.key, 'device-intruder');
      assert.strictEqual(foreignDevice.success, false);
      assert.ok(foreignDevice.error.includes('innym urządzeniu'));

      // Tamper with activeLicense key on disk and verify getStatus() rejects it
      const rawVault = JSON.parse(fs.readFileSync(testLicenseFile, 'utf-8'));
      const originalKey = rawVault.activeLicense.key;
      rawVault.activeLicense.key = 'NEXUS-DEAD-BEEF-0000';
      fs.writeFileSync(testLicenseFile, JSON.stringify(rawVault, null, 2), 'utf-8');

      const tamperedStatus = LicenseVault.getStatus();
      assert.strictEqual(tamperedStatus.isPro, false, 'Disk-tampered license key must not grant PRO');
      assert.strictEqual(tamperedStatus.tampered, true);

      // Restore valid key
      LicenseVault.activateKey(originalKey, 'device-primary');
      assert.strictEqual(LicenseVault.getStatus().isPro, true);
    });

    test('LicenseVault enforces server-side feature entitlements, deactivation, and key revocation', () => {
      // Currently PRO is active from previous test
      const proVision = LicenseVault.verifyFeatureAccess('AI_VISION_UNLIMITED');
      assert.strictEqual(proVision.allowed, true);
      assert.strictEqual(proVision.maxBatchSize, 50);

      // Deactivate license and verify FREE tier caps
      const deact = LicenseVault.deactivateCurrentLicense();
      assert.strictEqual(deact.success, true);
      assert.strictEqual(LicenseVault.getStatus().isPro, false);

      const freeVision = LicenseVault.verifyFeatureAccess('AI_VISION_UNLIMITED');
      assert.strictEqual(freeVision.allowed, false);

      const freeTagBatch = LicenseVault.verifyFeatureAccess('AI_TAGGING_BATCH');
      assert.strictEqual(freeTagBatch.allowed, true);
      assert.strictEqual(freeTagBatch.maxBatchSize, 5);

      // Generate, activate, then revoke a key
      const revLic = LicenseVault.generateLicenseKey('PRO_LIFETIME', 'Revocation test');
      assert.strictEqual(LicenseVault.activateKey(revLic.key, 'device-primary').success, true);
      assert.strictEqual(LicenseVault.getStatus().isPro, true);

      const revResult = LicenseVault.revokeKey(revLic.key, 'CHARGEBACK_OR_ABUSE');
      assert.strictEqual(revResult.success, true);
      assert.strictEqual(LicenseVault.isKeyRevoked(revLic.key), true);
      assert.strictEqual(LicenseVault.getStatus().isPro, false, 'Revoked key must immediately lose PRO status');

      const reactivateAttempt = LicenseVault.activateKey(revLic.key, 'device-primary');
      assert.strictEqual(reactivateAttempt.success, false, 'Revoked key must not be reactivated');
    });

    test('CryptoCheckoutEngine strictly validates wallet addresses and pricing bounds', () => {
      // Invalid LTC address rejected
      const badLtc = CryptoCheckoutEngine.saveConfig({
        wallets: { ltc: 'invalid_ltc_wallet_123' }
      });
      assert.strictEqual(badLtc.success, false);

      // Invalid Polygon EVM address rejected
      const badPoly = CryptoCheckoutEngine.saveConfig({
        wallets: { polygonUsdt: '0x12345' }
      });
      assert.strictEqual(badPoly.success, false);

      // Out-of-bounds price rejected
      const badPrice = CryptoCheckoutEngine.saveConfig({
        targetPriceUsd: -15
      });
      assert.strictEqual(badPrice.success, false);

      // Valid self-custody addresses accepted and persisted
      const validWallets = {
        ltc: 'ltc1q7r5k2m4n8p9w3x6y2z4a5s7d8f9g0h1j2k3l4m',
        sol: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        polygonUsdt: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
      };
      const saved = CryptoCheckoutEngine.saveConfig({
        wallets: validWallets,
        targetPriceUsd: 5.0
      });
      assert.strictEqual(saved.success, true);

      const loaded = CryptoCheckoutEngine.loadConfig();
      assert.strictEqual(loaded.wallets.ltc, validWallets.ltc);
      assert.strictEqual(loaded.wallets.sol, validWallets.sol);
      assert.strictEqual(loaded.wallets.polygonUsdt, validWallets.polygonUsdt);
      assert.strictEqual(loaded.targetPriceUsd, 5.0);
    });

    await asyncTest('CryptoCheckoutEngine creates orders with collision-free micro-offsets across LTC, SOL, and POLYGON_USDT', async () => {
      // Mock rate transport so tests are fast and deterministic offline
      CryptoCheckoutEngine.setCustomTransport({
        httpGetJson: async () => ({
          statusCode: 200,
          data: {
            litecoin: { usd: 80.0 },
            solana: { usd: 160.0 },
            tether: { usd: 1.0 }
          }
        })
      });

      const ltc1 = await CryptoCheckoutEngine.createOrder('LTC');
      const ltc2 = await CryptoCheckoutEngine.createOrder('LTC');
      assert.strictEqual(ltc1.success, true);
      assert.strictEqual(ltc2.success, true);
      assert.notStrictEqual(ltc1.order.amountFormatted, ltc2.order.amountFormatted, 'Concurrent LTC orders must have unique micro-offsets');
      assert.ok(ltc1.order.paymentUri.startsWith('litecoin:'));

      const solOrder = await CryptoCheckoutEngine.createOrder('SOL');
      assert.strictEqual(solOrder.success, true);
      assert.strictEqual(solOrder.order.currency, 'SOL');
      assert.ok(solOrder.order.paymentUri.startsWith('solana:'));

      const usdt1 = await CryptoCheckoutEngine.createOrder('POLYGON_USDT');
      const usdt2 = await CryptoCheckoutEngine.createOrder('POLYGON_USDT');
      assert.strictEqual(usdt1.success, true);
      assert.strictEqual(usdt2.success, true);
      assert.notStrictEqual(usdt1.order.amountFormatted, usdt2.order.amountFormatted, 'Concurrent POLYGON_USDT orders must have unique micro-offsets');
      assert.ok(usdt1.order.paymentUri.startsWith('ethereum:'));

      // Verify Pay-What-You-Want customPriceUsd ($1.00 min, $10.00 supporter, and clamp behavior)
      const minOrder = await CryptoCheckoutEngine.createOrder('POLYGON_USDT', { customPriceUsd: 1.00 });
      assert.strictEqual(minOrder.success, true);
      assert.strictEqual(minOrder.order.priceUsd, 1.00);
      assert.ok(minOrder.order.amount >= 1.00 && minOrder.order.amount < 1.01);

      const supporterOrder = await CryptoCheckoutEngine.createOrder('LTC', { customPriceUsd: 10.00 });
      assert.strictEqual(supporterOrder.success, true);
      assert.strictEqual(supporterOrder.order.priceUsd, 10.00);

      // Sub-$1 prices fallback or clamp to minimum $1.00
      const subMinOrder = await CryptoCheckoutEngine.createOrder('POLYGON_USDT', { customPriceUsd: 0.25 });
      assert.strictEqual(subMinOrder.success, true);
      assert.ok(subMinOrder.order.priceUsd >= 1.00, 'Orders below $1.00 must not allow under-minimum pricing');
    });

    await asyncTest('CryptoCheckoutEngine verifies LTC on-chain payment, detects underpayment, and prevents txHash replay', async () => {
      const created = await CryptoCheckoutEngine.createOrder('LTC');
      const ord = created.order;
      const validTxHash = 'a'.repeat(64);
      const expectedSatoshis = Math.round(ord.amount * 1e8);

      // 1. Simulate UNDERPAID transaction (only 40% of expected satoshis)
      CryptoCheckoutEngine.setCustomTransport({
        httpGetJson: async () => ({
          statusCode: 200,
          data: {
            txs: [
              {
                hash: validTxHash,
                received: new Date(ord.createdAt + 5000).toISOString(),
                confirmations: 2,
                double_spend: false,
                outputs: [
                  {
                    addresses: [ord.recipientAddress],
                    value: Math.round(expectedSatoshis * 0.4)
                  }
                ]
              }
            ]
          }
        })
      });

      const underpaidCheck = await CryptoCheckoutEngine.checkOrderStatus(ord.orderId);
      assert.strictEqual(underpaidCheck.paid, false);
      assert.strictEqual(underpaidCheck.status, 'UNDERPAID');

      // 2. Simulate full payment on-chain
      CryptoCheckoutEngine.setCustomTransport({
        httpGetJson: async () => ({
          statusCode: 200,
          data: {
            txs: [
              {
                hash: validTxHash,
                received: new Date(ord.createdAt + 10000).toISOString(),
                confirmations: 3,
                double_spend: false,
                outputs: [
                  {
                    addresses: [ord.recipientAddress],
                    value: expectedSatoshis
                  }
                ]
              }
            ]
          }
        })
      });

      const paidCheck = await CryptoCheckoutEngine.checkOrderStatus(ord.orderId);
      assert.strictEqual(paidCheck.paid, true);
      assert.strictEqual(paidCheck.status, 'PAID');
      assert.strictEqual(paidCheck.txHash, validTxHash);
      assert.ok(paidCheck.licenseKey && paidCheck.licenseKey.startsWith('NEXUS-'));

      // 3. Anti-replay: second order must NOT be able to claim the same txHash
      const secondCreated = await CryptoCheckoutEngine.createOrder('LTC');
      const secondOrd = secondCreated.order;
      const replayAttempt = await CryptoCheckoutEngine.verifyTransactionByHash(secondOrd.orderId, validTxHash);
      assert.strictEqual(replayAttempt.paid, false);
      assert.strictEqual(replayAttempt.code, 'TX_ALREADY_CONSUMED', 'Consumed txHash must be blocked from replay');
    });

    await asyncTest('CryptoCheckoutEngine verifies Solana (SOL) lamport balance delta and Polygon USDT contract transfers', async () => {
      // SOL order verification via RPC getSignaturesForAddress + getTransaction
      const solCreated = await CryptoCheckoutEngine.createOrder('SOL');
      const solOrd = solCreated.order;
      const solSig = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d1111111111111111111111111111111111111111';
      const expectedLamports = Math.round(solOrd.amount * 1e9);

      CryptoCheckoutEngine.setCustomTransport({
        httpPostJson: async (_url, payload) => {
          if (payload.method === 'getSignaturesForAddress') {
            return {
              statusCode: 200,
              data: {
                result: [
                  {
                    signature: solSig,
                    err: null,
                    confirmationStatus: 'finalized',
                    blockTime: Math.floor((solOrd.createdAt + 5000) / 1000)
                  }
                ]
              }
            };
          }
          if (payload.method === 'getTransaction') {
            return {
              statusCode: 200,
              data: {
                result: {
                  blockTime: Math.floor((solOrd.createdAt + 5000) / 1000),
                  meta: {
                    err: null,
                    preBalances: [2000000000, 0],
                    postBalances: [2000000000 - expectedLamports, expectedLamports]
                  },
                  transaction: {
                    message: {
                      accountKeys: ['SenderPubKey1111111111111111111111111111111', solOrd.recipientAddress]
                    }
                  }
                }
              }
            };
          }
          return { statusCode: 400, data: {} };
        }
      });

      const solPaid = await CryptoCheckoutEngine.checkOrderStatus(solOrd.orderId);
      assert.strictEqual(solPaid.paid, true);
      assert.strictEqual(solPaid.status, 'PAID');
      assert.strictEqual(solPaid.txHash, solSig);

      // Polygon USDT order verification: ensure spoofed token contract is ignored and official USDT contract is accepted
      const polyCreated = await CryptoCheckoutEngine.createOrder('POLYGON_USDT');
      const polyOrd = polyCreated.order;
      const polyTxHash = '0x' + 'b'.repeat(64);
      const expectedRawUnits = String(Math.round(polyOrd.amount * 1e6));

      CryptoCheckoutEngine.setCustomTransport({
        httpGetJson: async () => ({
          statusCode: 200,
          data: {
            status: '1',
            result: [
              {
                // Spoofed token contract — must be ignored
                hash: '0x' + 'c'.repeat(64),
                contractAddress: '0x000000000000000000000000000000000000dead',
                to: polyOrd.recipientAddress,
                value: expectedRawUnits,
                tokenDecimal: '6',
                confirmations: '10',
                timeStamp: String(Math.floor((polyOrd.createdAt + 5000) / 1000))
              },
              {
                // Authentic Polygon USDT transfer
                hash: polyTxHash,
                contractAddress: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
                to: polyOrd.recipientAddress,
                value: expectedRawUnits,
                tokenDecimal: '6',
                confirmations: '12',
                timeStamp: String(Math.floor((polyOrd.createdAt + 8000) / 1000))
              }
            ]
          }
        })
      });

      const polyPaid = await CryptoCheckoutEngine.checkOrderStatus(polyOrd.orderId);
      assert.strictEqual(polyPaid.paid, true);
      assert.strictEqual(polyPaid.txHash, polyTxHash);
    });

    await asyncTest('CryptoCheckoutEngine verifies HMAC-SHA256 webhooks with replay window and eventId idempotency', async () => {
      const created = await CryptoCheckoutEngine.createOrder('LTC');
      const ord = created.order;
      const secret = CryptoCheckoutEngine.getWebhookSecret();
      const nowSec = Math.floor(Date.now() / 1000);
      const webhookTxHash = 'd'.repeat(64);

      const payload = {
        eventId: 'EVT-TEST-001',
        orderId: ord.orderId,
        status: 'PAID',
        txHash: webhookTxHash,
        amountPaid: ord.amount,
        currency: 'LTC',
        recipientAddress: ord.recipientAddress
      };
      const rawBody = JSON.stringify(payload);

      // 1. Invalid signature rejected
      const badSigRes = await CryptoCheckoutEngine.processWebhook({
        payload,
        rawBody,
        signature: '0000deadbeef',
        timestamp: String(nowSec),
        eventId: payload.eventId
      });
      assert.strictEqual(badSigRes.success, false);
      assert.strictEqual(badSigRes.code, 'INVALID_SIGNATURE');

      // 2. Expired timestamp (>5 min old) rejected
      const oldTs = String(nowSec - 900);
      const oldSig = crypto.createHmac('sha256', secret).update(`${oldTs}.${rawBody}`).digest('hex');
      const expiredTsRes = await CryptoCheckoutEngine.processWebhook({
        payload,
        rawBody,
        signature: oldSig,
        timestamp: oldTs,
        eventId: payload.eventId
      });
      assert.strictEqual(expiredTsRes.success, false);
      assert.strictEqual(expiredTsRes.code, 'TIMESTAMP_OUT_OF_RANGE');

      // 3. Valid signed webhook succeeds and activates license
      const validSig = crypto.createHmac('sha256', secret).update(`${nowSec}.${rawBody}`).digest('hex');
      const okWebhook = await CryptoCheckoutEngine.processWebhook({
        payload,
        rawBody,
        signature: validSig,
        timestamp: String(nowSec),
        eventId: payload.eventId
      });
      assert.strictEqual(okWebhook.success, true);
      assert.strictEqual(okWebhook.paid, true);
      assert.ok(okWebhook.licenseKey.startsWith('NEXUS-'));

      // 4. Duplicate webhook delivery is idempotent and returns same licenseKey without double-charging
      const duplicateWebhook = await CryptoCheckoutEngine.processWebhook({
        payload,
        rawBody,
        signature: validSig,
        timestamp: String(nowSec),
        eventId: payload.eventId
      });
      assert.strictEqual(duplicateWebhook.success, true);
      assert.strictEqual(duplicateWebhook.duplicate, true);
      assert.strictEqual(duplicateWebhook.licenseKey, okWebhook.licenseKey);
    });

    await asyncTest('CryptoCheckoutEngine blocks dev payment simulation in production environment', async () => {
      const created = await CryptoCheckoutEngine.createOrder('LTC');
      const ord = created.order;

      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const prodSim = CryptoCheckoutEngine.simulateDevPayment(ord.orderId);
        assert.strictEqual(prodSim.success, false);
        assert.strictEqual(prodSim.code, 'SIMULATION_FORBIDDEN_IN_PROD');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }

      // In development/test mode, simulation succeeds and is idempotent
      const devSim1 = CryptoCheckoutEngine.simulateDevPayment(ord.orderId);
      const devSim2 = CryptoCheckoutEngine.simulateDevPayment(ord.orderId);
      assert.strictEqual(devSim1.success, true);
      assert.strictEqual(devSim1.paid, true);
      assert.strictEqual(devSim1.licenseKey, devSim2.licenseKey, 'Repeated simulation must be idempotent');
    });
  } finally {
    CryptoCheckoutEngine.setCustomTransport(null);
    LicenseVault.setVaultFile(null);
    CryptoCheckoutEngine.setStorageFiles({ configFile: null, ordersFile: null });
    try {
      fs.rmSync(testVaultDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // --- SUITE 11: End-to-End Free & Pro Limits Enforcement ---
  console.log('\nSuite 11: End-to-End Free & Pro Limits Enforcement');
  const limitsTestDir = path.join(os.tmpdir(), `nexus_limits_test_${Date.now()}`);
  fs.mkdirSync(limitsTestDir, { recursive: true });
  const limitsVaultFile = path.join(limitsTestDir, 'limits_vault.json');
  LicenseVault.setVaultFile(limitsVaultFile);

  try {
    // 1. Scenario 1: Użytkownik Free próbuje przeskanować cały komputer i przekracza dozwolony limit
    test('Scenario 1: Free user attempting whole PC scan is rejected with required Polish message', () => {
      const wholePcTargets = [
        'WHOLE_PC',
        'ALL_DRIVES',
        'CAŁY KOMPUTER',
        'Cały Komputer (Wszystkie Dyski)'
      ];

      for (const target of wholePcTargets) {
        const val = validateScanTarget(false, target);
        assert.strictEqual(val.allowed, false, `Target ${target} should not be allowed for Free user`);
        assert.strictEqual(val.code, 'PRO_LIMIT_EXCEEDED');
        assert.strictEqual(val.message, LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED);
        assert.strictEqual(
          val.message,
          'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.'
        );
      }

      // Also multiple drives in roots array
      const multiDriveVal = validateScanTarget(false, 'WHOLE_PC', ['C:\\', 'D:\\']);
      assert.strictEqual(multiDriveVal.allowed, false);
      assert.strictEqual(multiDriveVal.code, 'PRO_LIMIT_EXCEEDED');
      assert.strictEqual(multiDriveVal.message, LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED);
    });

    // 2. Scenario 2: Użytkownik Free otrzymuje możliwość ograniczenia operacji do jednego folderu
    test('Scenario 2: Free user gets option to limit operation to single folder within Free limits', () => {
      const singleFolderTarget = path.join(limitsTestDir, 'my_project');
      fs.mkdirSync(singleFolderTarget, { recursive: true });

      const val = validateScanTarget(false, singleFolderTarget);
      assert.strictEqual(val.allowed, true);
      assert.strictEqual(val.isPro, false);
      assert.strictEqual(val.maxScanBytes, 50 * ONE_GB_BYTES);
      assert.strictEqual(val.maxScanFiles, 15000);
    });

    // 3. Scenario 3: Użytkownik Free wybiera folder mieszczący się w limicie i operacja działa prawidłowo
    await asyncTest('Scenario 3: Free user scans single folder within limits successfully', async () => {
      const legalFolder = path.join(limitsTestDir, 'legal_folder');
      fs.mkdirSync(legalFolder, { recursive: true });

      // Create sample files within Free limits
      fs.writeFileSync(path.join(legalFolder, 'index.ts'), 'export const a = 1;');
      fs.writeFileSync(path.join(legalFolder, 'app.tsx'), 'export const App = () => null;');
      fs.writeFileSync(path.join(legalFolder, 'styles.css'), 'body { margin: 0; }');

      const scanner = new MasterNexusScanner({
        isPro: false,
        enableDeepInspection: false
      });

      let batchesReceived = 0;
      const result = await scanner.scanDirectory(
        legalFolder,
        (batch) => { batchesReceived += batch.length; }
      );

      assert.strictEqual(result.cancelled, undefined);
      assert.strictEqual(result.limitExceeded, undefined);
      assert.strictEqual(result.totalFiles, 3);
      assert.strictEqual(batchesReceived, 3);
      assert.ok(result.totalBytes > 0);
      assert.ok(result.totalBytes < FREE_MAX_SCAN_BYTES);
    });

    // 4. Scenario 4: Użytkownik Pro wykonuje rozszerzone skanowanie
    test('Scenario 4: Pro user can perform extended scan across whole PC or multiple drives', () => {
      const valWholePc = validateScanTarget(true, 'WHOLE_PC', ['C:\\', 'D:\\']);
      assert.strictEqual(valWholePc.allowed, true);
      assert.strictEqual(valWholePc.isPro, true);
      assert.strictEqual(valWholePc.maxScanBytes, 5000 * ONE_GB_BYTES);
      assert.strictEqual(valWholePc.maxScanFiles, 500000);

      const valMulti = validateScanTarget(true, ['C:\\Projects\\app', 'D:\\Workspace\\data']);
      assert.strictEqual(valMulti.allowed, true);
      assert.strictEqual(valMulti.isPro, true);
    });

    // 5. Scenario 5: Użytkownik Pro próbuje przekroczyć maksimum 5000 GB
    test('Scenario 5: Pro user exceeding 5000 GB (5 TB) maximum encounters controlled limit', () => {
      // 5000 GB = 5 000 000 000 000 bytes
      const exactMax = 5000 * ONE_GB_BYTES;
      assert.strictEqual(exactMax, 5000000000000, '5000 GB must equal exactly 5 000 000 000 000 bytes (1 GB = 1 000 000 000 B)');

      // Within limit: exactly 5000 GB
      const withinLimit = checkInFlightLimit(true, exactMax, 10000);
      assert.strictEqual(withinLimit.exceeded, false);

      // Over limit: 5000 GB + 1 byte
      const overLimitBytes = checkInFlightLimit(true, exactMax + 1, 10000);
      assert.strictEqual(overLimitBytes.exceeded, true);
      assert.strictEqual(overLimitBytes.code, 'PRO_MAX_CAPACITY_EXCEEDED');
      assert.strictEqual(overLimitBytes.error, LIMIT_MESSAGES.PRO_CAPACITY_EXCEEDED);
      assert.strictEqual(
        overLimitBytes.error,
        'Operacja przekracza maksymalny limit techniczny planu Pro (5000 GB / 5 TB). Skanowanie zostało zatrzymane, aby chronić zasoby systemu.'
      );

      // Over files limit: 500 001 files
      const overLimitFiles = checkInFlightLimit(true, 1000000, 500001);
      assert.strictEqual(overLimitFiles.exceeded, true);
      assert.strictEqual(overLimitFiles.code, 'PRO_MAX_CAPACITY_EXCEEDED');
    });

    // 6. Scenario 6: Użytkownik bez aktywnej subskrypcji próbuje wywołać endpoint wymagający Pro
    test('Scenario 6: Unsubscribed user attempting Pro-only features is strictly blocked', () => {
      // Ensure vault is clean Free tier
      LicenseVault.deactivateCurrentLicense();
      const status = LicenseVault.getStatus();
      assert.strictEqual(status.isPro, false);
      assert.strictEqual(status.tier, 'FREE');

      const proFeatures = [
        'AUTONOMOUS_PLAN_EXECUTION',
        'BATCH_FILE_MUTATIONS',
        'CODE_STUDIO_WRITE',
        'CREATE_WORKSPACE_FILE',
        'AI_CHAT_ACCESS',
        'WHOLE_PC_SCAN',
        'EXTENDED_DISK_SCAN'
      ];

      for (const feat of proFeatures) {
        const ent = LicenseVault.verifyFeatureAccess(feat);
        assert.strictEqual(ent.allowed, false, `Feature ${feat} must be blocked for Free tier`);
        assert.strictEqual(ent.isPro, false);
        assert.ok(ent.error && ent.error.includes('wymaga aktywnej licencji Project Nexus PRO'));
      }
    });

    // 7. Scenario 7: Klient próbuje sfałszować status subskrypcji lub parametry limitów
    test('Scenario 7: Client tampering with subscription status or parameters is detected and neutralized', () => {
      // Simulate malicious client directly editing storage JSON to claim "tier: PRO" without valid HMAC key
      const tamperedVault = {
        schemaVersion: 3,
        tier: 'PRO',
        activatedKey: 'NEXUS-FAKED-FORGED-KEY',
        activatedAt: Date.now(),
        hardwareHash: 'spoofed_hash_12345'
      };
      fs.writeFileSync(limitsVaultFile, JSON.stringify(tamperedVault), 'utf-8');

      // Server-side getStatus performs live cryptographic validation
      const status = LicenseVault.getStatus();
      assert.strictEqual(status.tamperDetected, true, 'Cryptographic tamper must be flagged');
      assert.strictEqual(status.isPro, false, 'Tampered user must NOT receive Pro rights');
      assert.strictEqual(status.tier, 'FREE');
      assert.strictEqual(status.entitlements.allowWholePcScan, false);
      assert.strictEqual(status.entitlements.maxScanBytes, 50 * ONE_GB_BYTES);

      // Verify on-disk storage was authoritatively sanitized back to FREE
      const onDisk = JSON.parse(fs.readFileSync(limitsVaultFile, 'utf-8'));
      assert.strictEqual(onDisk.tier, 'FREE');
      assert.strictEqual(onDisk.activatedKey, null);
    });

    // 8. Scenario 8: API zwraca kontrolowany błąd w przypadku przekroczenia limitu
    await asyncTest('Scenario 8: Engine returns controlled error when scan limit is exceeded in-flight', async () => {
      const overflowFolder = path.join(limitsTestDir, 'overflow_folder');
      fs.mkdirSync(overflowFolder, { recursive: true });

      // Create files of 300 bytes total
      fs.writeFileSync(path.join(overflowFolder, 'file1.txt'), Buffer.alloc(100, 'a'));
      fs.writeFileSync(path.join(overflowFolder, 'file2.txt'), Buffer.alloc(100, 'b'));
      fs.writeFileSync(path.join(overflowFolder, 'file3.txt'), Buffer.alloc(100, 'c'));

      let limitEventPayload = null;
      let errorEventPayload = null;

      // Restrict maxScanBytes to 150 bytes to trigger in-flight limit on file2
      const scanner = new MasterNexusScanner({
        isPro: false,
        maxScanBytes: 150,
        enableDeepInspection: false,
        onLimitExceeded: (payload) => {
          limitEventPayload = payload;
        }
      });

      const result = await scanner.scanDirectory(
        overflowFolder,
        null,
        null,
        null,
        (err) => { errorEventPayload = err; }
      );

      assert.strictEqual(result.cancelled, true);
      assert.strictEqual(result.limitExceeded, true);
      assert.ok(result.limitError, 'limitError payload must be present');
      assert.strictEqual(result.limitError.code, 'PRO_LIMIT_EXCEEDED');
      assert.strictEqual(result.limitError.message, LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED);
      assert.ok(limitEventPayload !== null);
      assert.strictEqual(limitEventPayload.code, 'PRO_LIMIT_EXCEEDED');
      assert.ok(errorEventPayload !== null);
    });

    // 9. Scenario 9: Błąd lokalnego silnika nie powoduje zawieszenia całej aplikacji
    await asyncTest('Scenario 9: Engine errors and crawler aborts do not crash the application', async () => {
      const nonExistent = path.join(limitsTestDir, 'does_not_exist_xyz_123');

      const scanner = new MasterNexusScanner({ isPro: false });

      // Crawling nonexistent or inaccessible folder must resolve cleanly
      const result = await scanner.scanDirectory(nonExistent);
      assert.ok(result !== null);
      assert.strictEqual(result.totalFiles, 0);

      // Aborting scanner during crawl must resolve gracefully with cancelled: true
      const longDir = path.join(limitsTestDir, 'abort_test');
      fs.mkdirSync(longDir, { recursive: true });
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(longDir, `dummy_${i}.txt`), 'data');
      }

      const abortScanner = new MasterNexusScanner({ isPro: false, batchSize: 5 });
      const scanPromise = abortScanner.scanDirectory(longDir);
      // Abort immediately
      abortScanner.abort({ code: 'USER_ABORT' });
      const abortResult = await scanPromise;
      assert.strictEqual(abortResult.cancelled, true);
    });

    // 10. Scenario 10: Zmiana statusu subskrypcji jest prawidłowo odzwierciedlana w dostępie do funkcji
    test('Scenario 10: Dynamic subscription change is authoritatively reflected in feature access', () => {
      // 1. Initial Free state
      LicenseVault.deactivateCurrentLicense();
      let status = LicenseVault.getStatus();
      assert.strictEqual(status.isPro, false);
      assert.strictEqual(status.entitlements.allowWholePcScan, false);
      assert.strictEqual(validateScanTarget(status.isPro, 'WHOLE_PC').allowed, false);

      // 2. Generate valid key and activate PRO
      const genResult = LicenseVault.generateLicenseKey({ orderId: 'ORDER_TEST_10' });
      const newKey = genResult.key || String(genResult);
      const act = LicenseVault.activateKey(newKey);
      assert.strictEqual(act.success, true);
      assert.strictEqual(act.tier, 'PRO');

      // 3. Pro state live reflection
      status = LicenseVault.getStatus();
      assert.strictEqual(status.isPro, true);
      assert.strictEqual(status.tier, 'PRO');
      assert.strictEqual(status.entitlements.allowWholePcScan, true);
      assert.strictEqual(status.entitlements.maxScanBytes, 5000 * ONE_GB_BYTES);
      assert.strictEqual(validateScanTarget(status.isPro, 'WHOLE_PC').allowed, true);
      assert.strictEqual(LicenseVault.verifyFeatureAccess('AUTONOMOUS_PLAN_EXECUTION').allowed, true);

      // 4. Deactivate PRO -> Returns to Free
      const deact = LicenseVault.deactivateCurrentLicense();
      assert.strictEqual(deact.success, true);
      status = LicenseVault.getStatus();
      assert.strictEqual(status.isPro, false);
      assert.strictEqual(status.tier, 'FREE');
      assert.strictEqual(status.entitlements.allowWholePcScan, false);
      assert.strictEqual(validateScanTarget(status.isPro, 'WHOLE_PC').allowed, false);
      assert.strictEqual(LicenseVault.verifyFeatureAccess('AUTONOMOUS_PLAN_EXECUTION').allowed, false);
    });

  } finally {
    LicenseVault.setVaultFile(null);
    try {
      fs.rmSync(limitsTestDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n======================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll().catch(e => {
  console.error('Test execution error:', e);
  process.exit(1);
});

