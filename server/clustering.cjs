/**
 * PROJECT NEXUS - MULTI-DIMENSIONAL CLUSTERING & GRAPH TOPOLOGY ENGINE
 * Synthesizes intelligent virtual workspaces across chaotic files using
 * temporal proximity, lexical Levenshtein-token overlap, dependency linking,
 * and installer duplicate deduplication.
 */

const path = require('node:path');

class ClusteringEngine {
  constructor(options = {}) {
    this.timeWindowMs = options.timeWindowMs || (30 * 60 * 1000); // 30-minute burst window
    this.lexicalThreshold = options.lexicalThreshold || 0.65;
  }

  /**
   * Tokenize filename into normalized semantic keywords
   */
  static tokenize(str) {
    return str
      .toLowerCase()
      .replace(/[._\-()+\[\]\d]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !['final', 'copy', 'v1', 'v2', 'v3', 'new', 'old', 'test', 'the', 'and'].includes(t));
  }

  /**
   * Jaccard Similarity between two token sets
   */
  static jaccardSimilarity(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Cluster 40,000+ items into coherent Workspaces and Triage Groups
   */
  clusterItems(items) {
    const workspaces = new Map();
    const installerGroups = new Map();
    const temporalBursts = [];

    // Sort items by modification time for temporal analysis
    const sorted = [...items].sort((a, b) => a.mtime - b.mtime);

    // 1. Detect Temporal Bursts (e.g., intense 15-minute screenshot/download sessions)
    let currentBurst = null;
    for (const item of sorted) {
      if (!currentBurst || (item.mtime - currentBurst.endTime > this.timeWindowMs)) {
        if (currentBurst && currentBurst.items.length >= 4) {
          temporalBursts.push(currentBurst);
        }
        currentBurst = {
          id: `burst-${temporalBursts.length + 1}`,
          startTime: item.mtime,
          endTime: item.mtime,
          items: [item]
        };
      } else {
        currentBurst.endTime = item.mtime;
        currentBurst.items.push(item);
      }
    }
    if (currentBurst && currentBurst.items.length >= 4) {
      temporalBursts.push(currentBurst);
    }

    // 2. Detect Project Workspaces (Dev code + associated loose assets)
    for (const item of items) {
      const tokens = ClusteringEngine.tokenize(item.name);
      const itemDir = item.dir || (item.path ? path.dirname(item.path) : '');
      const dirParts = itemDir ? itemDir.split(path.sep).filter(p => p && !['Users', 'AppData', 'Downloads', 'Desktop', 'Documents'].includes(p)) : [];
      const potentialRoot = dirParts.length > 0 ? dirParts[dirParts.length - 1] : (tokens[0] || 'Unsorted');

      // Create or update workspace
      if (!workspaces.has(potentialRoot)) {
        workspaces.set(potentialRoot, {
          id: `ws-${potentialRoot.toLowerCase().replace(/\s+/g, '-')}`,
          name: potentialRoot,
          rootHint: itemDir,
          fileCount: 0,
          totalBytes: 0,
          categories: {},
          types: new Set(),
          files: [],
          recommendedAction: 'MAINTAIN_STRUCTURE'
        });
      }

      const ws = workspaces.get(potentialRoot);
      ws.fileCount++;
      ws.totalBytes += item.size;
      ws.categories[item.category] = (ws.categories[item.category] || 0) + 1;
      ws.types.add(item.extension || 'bin');
      ws.files.push(item);
      item.workspaceId = ws.id;

      // 3. Detect Installer Duplicate Stacks (.exe / .msi)
      if (item.category === 'APPS') {
        const baseInstallerName = item.name.replace(/(?:\s*\(\d+\)$|\s*[-_]v?\d+(?:\.\d+)*.*$)/i, '').trim().toLowerCase();
        if (!installerGroups.has(baseInstallerName)) {
          installerGroups.set(baseInstallerName, []);
        }
        installerGroups.get(baseInstallerName).push(item);
      }
    }

    // Filter duplicate installer clusters (e.g. ChromeSetup, ChromeSetup (1), ChromeSetup (2))
    const duplicateInstallers = [];
    for (const [name, files] of installerGroups.entries()) {
      if (files.length > 1) {
        // Sort newest first
        files.sort((a, b) => b.mtime - a.mtime);
        const keeper = files[0];
        const redundancies = files.slice(1);
        const savedBytes = redundancies.reduce((acc, f) => acc + f.size, 0);

        duplicateInstallers.push({
          family: name,
          count: files.length,
          keeper,
          redundancies,
          savedBytes,
          recommendedAction: `Zachowaj najnowszy [${keeper.name}], usuń ${redundancies.length} zduplikowanych wersji`
        });
      }
    }

    return {
      workspaces: Array.from(workspaces.values())
        .filter(w => w.fileCount >= 3)
        .map(w => ({
          ...w,
          types: Array.from(w.types).slice(0, 8),
          files: w.files.slice(0, 100) // sample
        })),
      temporalBursts: temporalBursts.map(b => ({
        id: b.id,
        durationMinutes: Math.round((b.endTime - b.startTime) / 60000),
        count: b.items.length,
        timeFormatted: new Date(b.startTime).toLocaleString('pl-PL'),
        sampleNames: b.items.slice(0, 5).map(i => i.name)
      })),
      duplicateInstallers
    };
  }
}

module.exports = {
  ClusteringEngine
};
