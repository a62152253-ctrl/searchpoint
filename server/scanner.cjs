/**
 * PROJECT NEXUS - Autonomous Engine Entrypoint
 * Bridges MasterNexusScanner to runtime API
 */

const { MasterNexusScanner, TAXONOMY } = require('./scanner_master.cjs');

module.exports = {
  NexusScanner: MasterNexusScanner,
  CLASSIFICATION_RULES: TAXONOMY
};
