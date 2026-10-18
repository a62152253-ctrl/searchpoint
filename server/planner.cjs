/**
 * PROJECT NEXUS - AUTONOMOUS REORGANIZATION PLANNER & TRANSACTIONAL EXECUTOR
 * Creates actionable, safe, fully reversible organization plans to solve:
 * - 40,000 scattered PNGs
 * - 5,000 disposable screenshots
 * - 500 redundant installers (.exe / .msi)
 * - Loose .tsx code scattered across Downloads & Desktop
 * Supports Dry-Run, Atomic File Moves, and Full One-Click Rollback/Undo.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const MOVABLE_PLAN_IDS = new Set([
  'plan-screenshot-triage',
  'plan-installers-debloat'
]);

class AutonomousPlanner {
  constructor(baseTargetDir = '', journalDir = path.join(os.homedir(), '.nexus_journals')) {
    this.baseTargetDir = baseTargetDir || path.join(os.homedir(), 'Downloads');
    this.journalDir = journalDir;
  }

  static supportsPlan(planId) {
    return MOVABLE_PLAN_IDS.has(planId);
  }

  async ensureJournalDir() {
    await fs.promises.mkdir(this.journalDir, { recursive: true });
  }

  /**
   * Synthesize Complete Autonomous Organization Blueprint
   */
  generateBlueprint(items, clusters) {
    const totalFiles = items.length;
    const screenshots = items.filter(i => i.category === 'SCREENSHOT');
    const mediaPngs = items.filter(i => i.category === 'MEDIA' && !i.isDisposable);
    const devFiles = items.filter(i => i.category === 'DEV');
    const appFiles = items.filter(i => i.category === 'APPS');
    const docFiles = items.filter(i => i.category === 'DOCS');

    const totalBytes = items.reduce((acc, i) => acc + i.size, 0);
    // 1. Plan A: Ephemeral Screenshot Triage
    const planScreenshots = {
      id: 'plan-screenshot-triage',
      title: 'Triaż zrzutów ekranu',
      description: `Wykryto ${screenshots.length} plików sklasyfikowanych jako zrzuty ekranu.`,
      executionMode: 'MOVE',
      targetFolder: path.join(this.baseTargetDir, '_Nexus_Archiwum', 'Zrzuty_Ulotne'),
      fileCount: screenshots.length,
      reclaimableGB: '0.00',
      actions: [
        { type: 'MOVE', destination: '_Nexus_Archiwum/Zrzuty_Ulotne', count: screenshots.length }
      ],
      sampleFiles: screenshots.slice(0, 8).map(s => s.name),
      isHighPriority: true
    };

    // 2. Plan B: Duplicate Installers De-bloat
    const installerRedundancies = clusters.duplicateInstallers || [];
    const redundantFileCount = installerRedundancies.reduce((acc, g) => acc + g.redundancies.length, 0);
    const planInstallers = {
      id: 'plan-installers-debloat',
      title: 'De-bloat Zduplikowanych Instalatorów (.exe)',
      description: `Znaleziono ${redundantFileCount} zduplikowanych instalatorów. Wykonanie planu przeniesie wskazane kopie do archiwum.`,
      executionMode: 'MOVE',
      targetFolder: path.join(this.baseTargetDir, '_Nexus_Aplikacje', 'Archiwum_Instalatorow'),
      fileCount: redundantFileCount,
      reclaimableGB: '0.00',
      actions: [
        { type: 'MOVE', destination: '_Nexus_Aplikacje/Archiwum_Instalatorow', count: redundantFileCount }
      ],
      sampleFiles: installerRedundancies.slice(0, 5).map(g => `${g.family} (${g.count} wersji)`),
      isHighPriority: redundantFileCount > 5
    };

    // 3. Plan C: Smart Dev Workspaces Synthesis
    const workspacesCount = clusters.workspaces ? clusters.workspaces.length : 0;
    const planWorkspaces = {
      id: 'plan-workspaces-synthesis',
      title: 'Konsolidacja Workspace Deweloperskich',
      description: `Pogrupowanie luźnych plików .tsx, .css, .json z pobranymi grafikami w ${workspacesCount} uporządkowanych projektów.`,
      executionMode: 'ADVISORY',
      targetFolder: path.join(this.baseTargetDir, '_Nexus_Projekty'),
      fileCount: devFiles.length,
      reclaimableGB: '0.00',
      actions: [
        { type: 'CLUSTER_LINK', destination: '_Nexus_Projekty', count: devFiles.length }
      ],
      sampleFiles: devFiles.slice(0, 6).map(d => d.name),
      isHighPriority: devFiles.length > 0
    };

    // 4. Plan D: 40k Media Asset Library
    const planMedia = {
      id: 'plan-media-vault',
      title: 'Katalogowanie biblioteki grafik',
      description: 'Planowany katalog wirtualny z podziałem na proporcje i miesiące utworzenia; obecnie bez zmian na dysku.',
      executionMode: 'ADVISORY',
      targetFolder: path.join(this.baseTargetDir, '_Nexus_Media'),
      fileCount: mediaPngs.length,
      reclaimableGB: '0.00',
      actions: [
        { type: 'CATALOG_INDEX', destination: '_Nexus_Media', count: mediaPngs.length }
      ],
      sampleFiles: mediaPngs.slice(0, 6).map(m => m.name),
      isHighPriority: false
    };

    return {
      summary: {
        totalFiles,
        totalGB: (totalBytes / 1000000000).toFixed(2),
        totalReclaimableGB: '0.00',
        candidatePlansCount: 4
      },
      plans: [planScreenshots, planInstallers, planWorkspaces, planMedia]
    };
  }

  /**
   * Execute Plan with Transactional Journal (Supports Rollback)
   */
  async executePlan(planId, items, isDryRun = false, installerRedundancyPaths = []) {
    if (!AutonomousPlanner.supportsPlan(planId)) {
      throw new Error(`Plan "${planId}" nie obsługuje jeszcze bezpiecznego przenoszenia plików.`);
    }

    if (!Array.isArray(items)) {
      throw new Error('Nieprawidłowa lista plików do uporządkowania.');
    }
    if (!Array.isArray(installerRedundancyPaths) || installerRedundancyPaths.some(filePath => typeof filePath !== 'string')) {
      throw new Error('Nieprawidłowa lista zduplikowanych instalatorów.');
    }

    const timestamp = Date.now();
    const journalId = `journal-${planId}-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
    const journalFile = path.join(this.journalDir, `${journalId}.json`);

    const operations = [];
    const errors = [];
    const journalData = {
      journalId,
      planId,
      timestamp,
      isDryRun,
      status: 'IN_PROGRESS',
      movedCount: 0,
      errorsCount: 0,
      operations,
      errors
    };
    let targetItems;
    let destinationSubDir;

    if (planId === 'plan-screenshot-triage') {
      targetItems = items.filter(i => i.category === 'SCREENSHOT');
      destinationSubDir = path.join(this.baseTargetDir, '_Nexus_Archiwum', 'Zrzuty_Ulotne');
    } else {
      const redundantPaths = new Set(installerRedundancyPaths.map(filePath => path.resolve(filePath)));
      targetItems = items.filter(i => redundantPaths.has(path.resolve(String(i.path || ''))));
      destinationSubDir = path.join(this.baseTargetDir, '_Nexus_Aplikacje', 'Archiwum_Instalatorow');
    }

    if (!isDryRun && targetItems.length > 0) {
      await this.ensureJournalDir();
      await fs.promises.mkdir(destinationSubDir, { recursive: true });
      await this.writeJournal(journalFile, journalData);
    }

    let journalFailed = false;
    for (const item of targetItems) {
      const srcPath = path.resolve(String(item.path || ''));
      const fileName = path.basename(srcPath);
      if (!item.path || !fileName || fileName === '.' || fileName === path.sep) {
        errors.push({ file: item.name || String(item.path || ''), error: 'Nieprawidłowa ścieżka źródłowa.' });
        continue;
      }

      let targetPath = path.join(destinationSubDir, fileName);
      const ext = path.extname(fileName);
      const basename = path.basename(fileName, ext);
      let suffix = 1;
      while (targetPath !== srcPath && (fs.existsSync(targetPath) || targetItems.some(other => other !== item && path.resolve(other.path || '') === targetPath))) {
        targetPath = path.join(destinationSubDir, `${basename}_${suffix++}${ext}`);
      }
      if (targetPath === srcPath) {
        errors.push({ file: fileName, error: 'Plik znajduje się już w katalogu docelowym.' });
        continue;
      }

      if (isDryRun) {
        if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
          operations.push({ source: srcPath, destination: targetPath, status: 'SIMULATED' });
        } else {
          errors.push({ file: fileName, error: 'Plik źródłowy nie istnieje lub nie jest plikiem.' });
        }
      } else {
        let operation;
        try {
          const stat = await fs.promises.stat(srcPath);
          if (!stat.isFile()) {
            throw new Error('Ścieżka źródłowa nie wskazuje na plik.');
          }
          operation = { source: srcPath, destination: targetPath, status: 'PENDING' };
          operations.push(operation);
          try {
            await this.writeJournal(journalFile, journalData);
          } catch (journalError) {
            journalFailed = true;
            throw journalError;
          }
          try {
            await fs.promises.rename(srcPath, targetPath);
          } catch (err) {
            if (err.code !== 'EXDEV') throw err;
            await fs.promises.copyFile(srcPath, targetPath, fs.constants.COPYFILE_EXCL);
            try {
              await fs.promises.unlink(srcPath);
            } catch (unlinkError) {
              await fs.promises.unlink(targetPath).catch(cleanupError => {
                console.error(`[Planner] Nie udało się usunąć niepełnej kopii ${targetPath}:`, cleanupError.message);
              });
              throw unlinkError;
            }
          }
          operation.status = 'MOVED';
          journalData.movedCount = operations.filter(entry => entry.status === 'MOVED').length;
          try {
            await this.writeJournal(journalFile, journalData);
          } catch (journalError) {
            journalFailed = true;
            throw journalError;
          }
        } catch (err) {
          errors.push({ file: item.name, error: err.message });
          if (operation) {
            const sourceExists = fs.existsSync(srcPath);
            const destinationExists = fs.existsSync(targetPath);
            if (sourceExists && !destinationExists) {
              operation.status = 'NOT_MOVED';
            } else if (!sourceExists && destinationExists) {
              operation.status = 'MOVED';
              journalData.movedCount = operations.filter(entry => entry.status === 'MOVED').length;
            }
          }
          if (journalFailed || operation?.status === 'MOVED' || operation?.status === 'PENDING') {
            journalFailed = true;
            break;
          }
        }
      }
    }

    journalData.movedCount = isDryRun
      ? operations.filter(operation => operation.status === 'SIMULATED').length
      : operations.filter(operation => operation.status === 'MOVED').length;
    journalData.errorsCount = errors.length;
    journalData.status = journalFailed ? 'JOURNAL_WRITE_FAILED' : errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';

    if (!isDryRun && targetItems.length > 0) {
      await this.writeJournal(journalFile, journalData);
    }

    return journalData;
  }

  async writeJournal(journalFile, journalData) {
    const tempFile = `${journalFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.promises.writeFile(tempFile, JSON.stringify(journalData, null, 2), { flag: 'wx' });
      await fs.promises.rename(tempFile, journalFile);
    } catch (err) {
      try {
        await fs.promises.unlink(tempFile);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error(`[Planner] Nie udało się usunąć tymczasowego dziennika ${tempFile}:`, cleanupError.message);
        }
      }
      throw err;
    }
  }

  /**
   * Rollback a previous execution by journal ID
   */
  async rollback(journalId) {
    if (typeof journalId !== 'string' || !/^journal-[a-z0-9-]+-\d+-[a-f0-9]{8}$/i.test(journalId)) {
      throw new Error('Nieprawidłowy identyfikator dziennika transakcji.');
    }
    const journalFile = path.join(this.journalDir, `${journalId}.json`);
    if (!fs.existsSync(journalFile)) {
      throw new Error(`Dziennik transakcji ${journalId} nie istnieje.`);
    }

    const journal = JSON.parse(await fs.promises.readFile(journalFile, 'utf-8'));
    if (journal.journalId !== journalId || !Array.isArray(journal.operations)) {
      throw new Error('Dziennik transakcji jest nieprawidłowy lub uszkodzony.');
    }
    const restored = [];
    const rollbackErrors = [];

    for (const op of [...journal.operations].reverse()) {
      if (op.status === 'MOVED' || op.status === 'PENDING') {
        try {
          const sourceExists = fs.existsSync(op.source);
          const destinationExists = fs.existsSync(op.destination);
          if (op.status === 'PENDING' && sourceExists && !destinationExists) {
            op.status = 'NOT_MOVED';
            continue;
          }
          if (!destinationExists) {
            throw new Error('Brak pliku w lokalizacji docelowej; nie można potwierdzić cofnięcia.');
          }
          if (sourceExists) {
            throw new Error('Ścieżka źródłowa jest już zajęta; rollback nie nadpisze istniejącego pliku.');
          }
          await fs.promises.rename(op.destination, op.source);
          op.status = 'RESTORED';
          restored.push(op.source);
          await this.writeJournal(journalFile, journal);
        } catch (e) {
          rollbackErrors.push({ file: op.destination, error: e.message });
        }
      }
    }

    journal.rollbackStatus = rollbackErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    journal.rollbackErrors = rollbackErrors;
    await this.writeJournal(journalFile, journal);

    return {
      status: rollbackErrors.length > 0 ? 'ROLLBACK_COMPLETED_WITH_ERRORS' : 'ROLLBACK_COMPLETE',
      journalId,
      restoredCount: restored.length,
      rollbackErrorsCount: rollbackErrors.length,
      rollbackErrors
    };
  }
}

module.exports = {
  AutonomousPlanner
};
