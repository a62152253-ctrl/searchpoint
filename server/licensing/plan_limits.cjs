/**
 * PROJECT NEXUS - Authoritative Plan Limits & Quota Specifications
 * Single source of truth for FREE and PRO subscription tiers.
 * 
 * Strict specifications:
 * - 1 GB = 1 000 000 000 bytes (decimal standard)
 * - PRO maximum single scan limit: 5000 GB (5 TB) = 5 000 000 000 000 bytes
 * - FREE single folder scan limit: 50 GB = 50 000 000 000 bytes
 * - FREE maximum scan files: 15 000
 * - PRO maximum scan files: 500 000
 */

// Explicit definition: 1 GB = 1 000 000 000 bytes
const ONE_GB_BYTES = 1000000000;

// PRO tier maximum technical limit for a single scan operation: 5000 GB (5 TB)
const PRO_MAX_SCAN_BYTES = 5000 * ONE_GB_BYTES; // 5_000_000_000_000 bytes
const PRO_MAX_SCAN_FILES = 500000;

// FREE tier maximum limit for a single folder scan operation: 50 GB
const FREE_MAX_SCAN_BYTES = 50 * ONE_GB_BYTES; // 50_000_000_000 bytes
const FREE_MAX_SCAN_FILES = 15000;

// Official standard limit messages
const LIMIT_MESSAGES = Object.freeze({
  FREE_LIMIT_EXCEEDED: 'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.',
  PRO_CAPACITY_EXCEEDED: 'Operacja przekracza maksymalny limit techniczny planu Pro (5000 GB / 5 TB). Skanowanie zostało zatrzymane, aby chronić zasoby systemu.'
});

const PLAN_LIMITS = Object.freeze({
  FREE: {
    tier: 'FREE',
    name: 'Plan Darmowy (Free)',
    allowWholePcScan: false,
    allowMultiWorkspace: false,
    maxScanBytes: FREE_MAX_SCAN_BYTES,
    maxScanBytesFormatted: '50 GB',
    maxScanFiles: FREE_MAX_SCAN_FILES,
    maxProjects: 2,
    aiTaggingBatchLimit: 5,
    allowCodeStudioSave: false,
    allowImageStudioExport: false,
    allowAutonomousExecute: false,
    allowBatchMutations: false,
    allowAiChat: false,
    allowCreateItem: false
  },
  PRO: {
    tier: 'PRO',
    name: 'Plan Nexus PRO (Lifetime)',
    allowWholePcScan: true,
    allowMultiWorkspace: true,
    maxScanBytes: PRO_MAX_SCAN_BYTES,
    maxScanBytesFormatted: '5000 GB (5 TB)',
    maxScanFiles: PRO_MAX_SCAN_FILES,
    maxProjects: 50,
    aiTaggingBatchLimit: 50,
    allowCodeStudioSave: true,
    allowImageStudioExport: true,
    allowAutonomousExecute: true,
    allowBatchMutations: true,
    allowAiChat: true,
    allowCreateItem: true
  }
});

/**
 * Validates whether a requested scan target is allowed under the given tier.
 * Returns { allowed: boolean, reason?: string, code?: string }
 */
function validateScanTarget(isPro, targetPath, rootsToScan = []) {
  const isWholePc = targetPath === 'WHOLE_PC' ||
    targetPath === 'ALL_DRIVES' ||
    targetPath === 'CAŁY KOMPUTER' ||
    targetPath === 'Cały Komputer (Wszystkie Dyski)' ||
    (Array.isArray(rootsToScan) && rootsToScan.length > 1 && rootsToScan.some(r => /^[a-zA-Z]:\\?$/.test(String(r).trim())));

  const isMultiFolder = Array.isArray(targetPath) && targetPath.length > 1;

  if (!isPro) {
    if (isWholePc) {
      return {
        allowed: false,
        code: 'PRO_LIMIT_EXCEEDED',
        limitType: 'WHOLE_PC_NOT_ALLOWED',
        error: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
        message: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED
      };
    }
    if (isMultiFolder) {
      return {
        allowed: false,
        code: 'PRO_LIMIT_EXCEEDED',
        limitType: 'MULTI_WORKSPACE_NOT_ALLOWED',
        error: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
        message: LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED
      };
    }
  }

  return {
    allowed: true,
    isPro: Boolean(isPro),
    maxScanBytes: isPro ? PRO_MAX_SCAN_BYTES : FREE_MAX_SCAN_BYTES,
    maxScanFiles: isPro ? PRO_MAX_SCAN_FILES : FREE_MAX_SCAN_FILES
  };
}

/**
 * Checks in-flight scan progress metrics against plan thresholds
 */
function checkInFlightLimit(isPro, currentBytes, currentFiles) {
  const maxBytes = isPro ? PRO_MAX_SCAN_BYTES : FREE_MAX_SCAN_BYTES;
  const maxFiles = isPro ? PRO_MAX_SCAN_FILES : FREE_MAX_SCAN_FILES;

  if (currentBytes > maxBytes || currentFiles > maxFiles) {
    return {
      exceeded: true,
      isPro: Boolean(isPro),
      code: isPro ? 'PRO_MAX_CAPACITY_EXCEEDED' : 'PRO_LIMIT_EXCEEDED',
      error: isPro ? LIMIT_MESSAGES.PRO_CAPACITY_EXCEEDED : LIMIT_MESSAGES.FREE_LIMIT_EXCEEDED,
      currentBytes,
      maxBytes,
      currentFiles,
      maxFiles
    };
  }

  return { exceeded: false };
}

module.exports = {
  ONE_GB_BYTES,
  PRO_MAX_SCAN_BYTES,
  PRO_MAX_SCAN_FILES,
  FREE_MAX_SCAN_BYTES,
  FREE_MAX_SCAN_FILES,
  LIMIT_MESSAGES,
  PLAN_LIMITS,
  validateScanTarget,
  checkInFlightLimit
};
