/**
 * PROJECT NEXUS - Lifetime License & Hardware Verification Vault
 * Production-grade cryptographic license generation, constant-time HMAC verification,
 * hardware fingerprinting, revocation ledger, atomic persistence, and server-side
 * entitlement enforcement for FREE vs PRO tiers.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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
} = require('./plan_limits.cjs');

const SECRET_SALT = process.env.NEXUS_LICENSE_SECRET || 'NEXUS_OBSIDIAN_TITANIUM_PRO_2026_V3_SALT';

const FEATURE_POLICIES = Object.freeze({
  UNLIMITED_PROJECTS: {
    id: 'UNLIMITED_PROJECTS',
    label: 'Nielimitowana organizacja projektów',
    requiresPro: true,
    freeLimit: 2,
    proMaxBatchSize: 50
  },
  WHOLE_PC_SCAN: {
    id: 'WHOLE_PC_SCAN',
    label: 'Skanowanie całego komputera (wszystkie dyski)',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 1
  },
  EXTENDED_DISK_SCAN: {
    id: 'EXTENDED_DISK_SCAN',
    label: 'Rozszerzona analiza dysku (do 5000 GB / 5 TB)',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: PRO_MAX_SCAN_BYTES
  },
  AI_SMART_TAGGING_UNLIMITED: {
    id: 'AI_SMART_TAGGING_UNLIMITED',
    label: 'Masowe tagowanie AI (Ollama)',
    requiresPro: true,
    freeLimit: 5,
    proMaxBatchSize: 50
  },
  AI_VISION_UNLIMITED: {
    id: 'AI_VISION_UNLIMITED',
    label: 'Nielimitowana analiza Vision AI',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 50
  },
  AI_TAGGING_BATCH: {
    id: 'AI_TAGGING_BATCH',
    label: 'Seryjne tagowanie AI',
    requiresPro: false,
    freeLimit: 5,
    proMaxBatchSize: 50
  },
  AI_CHAT_ACCESS: {
    id: 'AI_CHAT_ACCESS',
    label: 'Rozmowa z Asystentem Ollama AI',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 1
  },
  CODE_STUDIO_WRITE: {
    id: 'CODE_STUDIO_WRITE',
    label: 'Zapis zmian w Monaco Code Studio',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 1
  },
  IMAGE_STUDIO_EXPORT: {
    id: 'IMAGE_STUDIO_EXPORT',
    label: 'Eksport i zapis w Nexus Image Studio',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 1
  },
  AUTONOMOUS_PLAN_EXECUTION: {
    id: 'AUTONOMOUS_PLAN_EXECUTION',
    label: 'Wykonywanie autonomicznych planów reorganizacji',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 500
  },
  BATCH_FILE_MUTATIONS: {
    id: 'BATCH_FILE_MUTATIONS',
    label: 'Masowe przenoszenie i modyfikacje plików',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 500
  },
  CREATE_WORKSPACE_FILE: {
    id: 'CREATE_WORKSPACE_FILE',
    label: 'Tworzenie nowych plików i folderów',
    requiresPro: true,
    freeLimit: 0,
    proMaxBatchSize: 1
  }
});

class LicenseVault {
  static defaultVaultFile = path.join(__dirname, '..', 'storage', 'nexus_licenses.json');
  static customVaultFile = null;

  /**
   * Resolve active vault storage path (allows isolated test storage without polluting production)
   */
  static get vaultFile() {
    if (this.customVaultFile) return this.customVaultFile;
    if (process.env.NEXUS_LICENSE_VAULT_FILE) return process.env.NEXUS_LICENSE_VAULT_FILE;
    return this.defaultVaultFile;
  }

  static setVaultFile(filePath) {
    this.customVaultFile = filePath ? path.resolve(filePath) : null;
  }

  /**
   * Default clean vault schema
   */
  static createEmptyVault() {
    return {
      schemaVersion: 3,
      activatedKey: null,
      activeLicense: null,
      activatedAt: null,
      tier: 'FREE',
      hardwareHash: this.getHardwareFingerprint(),
      generatedKeys: [],
      revokedKeys: {},
      activationHistory: [],
      updatedAt: Date.now()
    };
  }

  /**
   * Compute deterministic hardware fingerprint for the local machine
   */
  static getHardwareFingerprint() {
    try {
      const cpuModel = os.cpus()?.[0]?.model || 'generic-cpu';
      const raw = `${os.hostname()}|${os.platform()}|${os.arch()}|${cpuModel}|${os.totalmem()}`;
      return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24).toUpperCase();
    } catch (_) {
      return 'LOCAL_UNKNOWN_HW_ID';
    }
  }

  /**
   * Normalize raw key string (uppercase, trim, collapse spaces)
   */
  static normalizeKey(rawKey) {
    if (!rawKey) return '';
    if (typeof rawKey === 'object' && typeof rawKey.key === 'string') {
      return rawKey.key.trim().toUpperCase().replace(/\s+/g, '');
    }
    const str = String(rawKey);
    return str.trim().toUpperCase().replace(/\s+/g, '');
  }

  /**
   * Compute deterministic 4-hex-char cryptographic signature for a payload segment
   */
  static computeSegmentSignature(seg1, seg2) {
    const payload = `${String(seg1).toUpperCase()}-${String(seg2).toUpperCase()}`;
    return crypto
      .createHmac('sha256', SECRET_SALT)
      .update(payload)
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();
  }

  /**
   * Constant-time comparison of two ASCII strings
   */
  static timingSafeHexEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Wrap a key string and its metadata record so callers expecting either a string
   * or an object `{ key, tier, ... }` work seamlessly.
   */
  static createHybridKeyReturn(record) {
    const strObj = new String(record.key);
    Object.assign(strObj, record);
    return strObj;
  }

  /**
   * Generate a cryptographically signed Lifetime Pro License Key
   * Format: NEXUS-PRO-XXXX-YYYY-ZZZZ
   * Where ZZZZ is HMAC-SHA256(XXXX-YYYY, SECRET_SALT).slice(0, 4)
   */
  static generateLicenseKey(metadataOrTier = {}, noteArg = null) {
    const metadata = typeof metadataOrTier === 'string'
      ? { tier: metadataOrTier, note: noteArg }
      : (metadataOrTier || {});

    const seg1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const seg2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const signature = this.computeSegmentSignature(seg1, seg2);

    const key = `NEXUS-PRO-${seg1}-${seg2}-${signature}`;
    const now = Date.now();

    const vault = this.loadVault();
    vault.generatedKeys = Array.isArray(vault.generatedKeys) ? vault.generatedKeys : [];

    // Ensure idempotency if an orderId already generated a key
    if (metadata && metadata.orderId) {
      const existingForOrder = vault.generatedKeys.find(
        (k) => k && k.orderId === metadata.orderId && k.status !== 'REVOKED' && k.status !== 'REFUNDED'
      );
      if (existingForOrder && existingForOrder.key) {
        return this.createHybridKeyReturn(existingForOrder);
      }
    }

    const record = {
      key,
      createdAt: now,
      tier: metadata.tier || 'PRO_LIFETIME',
      status: 'ISSUED',
      orderId: metadata.orderId || null,
      currency: metadata.currency || null,
      txHash: metadata.txHash || null,
      amountPaid: typeof metadata.amountPaid === 'number' ? metadata.amountPaid : null,
      priceUsd: typeof metadata.priceUsd === 'number' ? metadata.priceUsd : null,
      note: metadata.note || noteArg || null,
      hardwareBound: null,
      activatedAt: null
    };

    vault.generatedKeys.push(record);
    this.saveVault(vault);

    return this.createHybridKeyReturn(record);
  }

  /**
   * Verify if a license key matches the cryptographic signature structure
   * using constant-time HMAC comparison.
   */
  static validateKeyFormat(rawKey) {
    const clean = this.normalizeKey(rawKey);
    if (!clean) return false;

    const match = clean.match(/^(?:NEXUS-PRO|NEXUS|NXPRO)-([A-F0-9]{4})-([A-F0-9]{4})-([A-F0-9]{4})$/);
    if (!match) return false;

    const [, seg1, seg2, providedSig] = match;
    const expectedSig = this.computeSegmentSignature(seg1, seg2);

    return this.timingSafeHexEqual(providedSig, expectedSig);
  }

  /**
   * Detailed key verification returning `{ valid, tier, key }`
   */
  static verifyKeyFormat(rawKey) {
    const clean = this.normalizeKey(rawKey);
    const valid = this.validateKeyFormat(clean);
    return {
      valid,
      tier: valid ? 'PRO_LIFETIME' : null,
      key: valid ? clean : null
    };
  }

  /**
   * Check whether a key has been revoked or refunded
   */
  static isKeyRevoked(rawKey, vaultInstance = null) {
    const clean = this.normalizeKey(rawKey);
    if (!clean) return false;
    const vault = vaultInstance || this.loadVault();

    if (vault.revokedKeys && vault.revokedKeys[clean]) {
      return true;
    }

    if (Array.isArray(vault.generatedKeys)) {
      const entry = vault.generatedKeys.find((k) => k && k.key === clean);
      if (entry && (entry.status === 'REVOKED' || entry.status === 'REFUNDED')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Activate a license key on this installation with full signature, revocation,
   * and hardware binding checks.
   */
  static activateKey(rawKey, optionsOrDeviceId = {}) {
    const options = typeof optionsOrDeviceId === 'string'
      ? { deviceId: optionsOrDeviceId, enforceDeviceLock: true }
      : (optionsOrDeviceId || {});

    const clean = this.normalizeKey(rawKey);
    if (!clean) {
      return {
        success: false,
        code: 'EMPTY_KEY',
        error: 'Wprowadź klucz licencyjny (np. NEXUS-PRO-XXXX-YYYY-ZZZZ).'
      };
    }

    if (!this.validateKeyFormat(clean)) {
      return {
        success: false,
        code: 'INVALID_SIGNATURE',
        error: 'Nieprawidłowy klucz licencyjny lub sygnatura kryptograficzna. Sprawdź pisownię (format: NEXUS-PRO-XXXX-YYYY-ZZZZ).'
      };
    }

    const vault = this.loadVault();

    if (this.isKeyRevoked(clean, vault)) {
      const revokeInfo = vault.revokedKeys?.[clean];
      return {
        success: false,
        code: 'KEY_REVOKED',
        error: `Ten klucz licencyjny został unieważniony lub zwrócony${revokeInfo?.reason ? ` (${revokeInfo.reason})` : ''}.`
      };
    }

    const hwId = options.deviceId || this.getHardwareFingerprint();
    const enforceLock = options.enforceDeviceLock !== false;
    const now = Date.now();

    // Check if key exists in generatedKeys ledger and verify single-device binding
    const existingRecord = Array.isArray(vault.generatedKeys)
      ? vault.generatedKeys.find((k) => k && k.key === clean)
      : null;

    if (existingRecord) {
      if (
        enforceLock &&
        existingRecord.hardwareBound &&
        existingRecord.hardwareBound !== hwId
      ) {
        return {
          success: false,
          code: 'HARDWARE_MISMATCH',
          error: 'Ten klucz licencyjny został już aktywowany na innym urządzeniu.'
        };
      }
      existingRecord.status = 'ACTIVE';
      existingRecord.activatedAt = existingRecord.activatedAt || now;
      existingRecord.lastVerifiedAt = now;
      existingRecord.hardwareBound = existingRecord.hardwareBound || hwId;
    } else {
      // Valid offline-signed key not previously in local generatedKeys list
      vault.generatedKeys.push({
        key: clean,
        createdAt: now,
        tier: 'PRO_LIFETIME',
        status: 'ACTIVE',
        orderId: options.orderId || null,
        currency: options.currency || null,
        txHash: options.txHash || null,
        note: options.note || 'Offline signed activation',
        hardwareBound: hwId,
        activatedAt: now,
        lastVerifiedAt: now
      });
    }

    vault.activatedKey = clean;
    vault.activatedAt = vault.activatedAt || now;
    vault.tier = 'PRO';
    vault.hardwareHash = hwId;
    vault.activeLicense = {
      key: clean,
      tier: 'PRO_LIFETIME',
      activatedAt: vault.activatedAt,
      hardwareHash: hwId
    };

    vault.activationHistory = Array.isArray(vault.activationHistory) ? vault.activationHistory : [];
    vault.activationHistory.push({
      keyMasked: `${clean.slice(0, 14)}-****-${clean.slice(-4)}`,
      action: 'ACTIVATE',
      hardwareHash: hwId,
      timestamp: now,
      source: options.source || 'MANUAL_OR_CHECKOUT'
    });
    if (vault.activationHistory.length > 100) {
      vault.activationHistory = vault.activationHistory.slice(-100);
    }

    this.saveVault(vault);

    return {
      success: true,
      tier: 'PRO',
      activatedKey: clean,
      activatedAt: vault.activatedAt,
      hardwareHash: vault.hardwareHash,
      license: vault.activeLicense,
      message: 'Licencja Project Nexus PRO (Lifetime) została pomyślnie aktywowana!'
    };
  }

  /**
   * Revoke a license key (e.g. on chargeback/refund or security incident).
   * Automatically downgrades the active installation if it was using the revoked key.
   */
  static revokeKey(rawKey, reason = 'ADMINISTRATIVE_REVOCATION') {
    const clean = this.normalizeKey(rawKey);
    if (!clean) {
      return { success: false, error: 'Brak klucza do unieważnienia.' };
    }

    const vault = this.loadVault();
    const now = Date.now();
    vault.revokedKeys = vault.revokedKeys && typeof vault.revokedKeys === 'object' ? vault.revokedKeys : {};
    vault.revokedKeys[clean] = {
      key: clean,
      reason: String(reason || 'REVOKED'),
      revokedAt: now
    };

    if (Array.isArray(vault.generatedKeys)) {
      const rec = vault.generatedKeys.find((k) => k && k.key === clean);
      if (rec) {
        rec.status = reason === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'REVOKED';
        rec.revokedAt = now;
        rec.revokeReason = reason;
      }
    }

    let wasActive = false;
    if (vault.activatedKey === clean || vault.activeLicense?.key === clean) {
      wasActive = true;
      vault.activatedKey = null;
      vault.activeLicense = null;
      vault.activatedAt = null;
      vault.tier = 'FREE';
    }

    vault.activationHistory = Array.isArray(vault.activationHistory) ? vault.activationHistory : [];
    vault.activationHistory.push({
      keyMasked: `${clean.slice(0, 14)}-****-${clean.slice(-4)}`,
      action: 'REVOKE',
      reason,
      timestamp: now
    });

    this.saveVault(vault);
    return {
      success: true,
      key: clean,
      wasActive,
      tier: vault.tier,
      revokedAt: now
    };
  }

  /**
   * Deactivate the currently active license on this machine (without revoking it globally)
   */
  static deactivateCurrentLicense(reason = 'USER_DEACTIVATED') {
    const vault = this.loadVault();
    const previousKey = vault.activatedKey || vault.activeLicense?.key || null;
    vault.activatedKey = null;
    vault.activeLicense = null;
    vault.activatedAt = null;
    vault.tier = 'FREE';

    if (previousKey) {
      vault.activationHistory = Array.isArray(vault.activationHistory) ? vault.activationHistory : [];
      vault.activationHistory.push({
        keyMasked: `${previousKey.slice(0, 14)}-****-${previousKey.slice(-4)}`,
        action: 'DEACTIVATE',
        reason,
        timestamp: Date.now()
      });
    }

    this.saveVault(vault);
    return {
      success: true,
      tier: 'FREE',
      isPro: false,
      previousKeyMasked: previousKey ? `${previousKey.slice(0, 14)}-****-****` : null
    };
  }

  /**
   * Get current license status with live cryptographic re-verification of stored key.
   * Prevents manual JSON file tampering (`tier: "PRO"` without a valid signed key).
   */
  static getStatus() {
    const vault = this.loadVault();
    const rawActiveKey = vault.activeLicense?.key || vault.activatedKey;

    let isValidActiveKey = false;
    let tamperDetected = false;

    if (rawActiveKey) {
      const sigValid = this.validateKeyFormat(rawActiveKey);
      const revoked = this.isKeyRevoked(rawActiveKey, vault);
      if (sigValid && !revoked) {
        isValidActiveKey = true;
      } else {
        tamperDetected = true;
        vault.activatedKey = null;
        vault.activeLicense = null;
        vault.activatedAt = null;
        vault.tier = 'FREE';
        this.saveVault(vault);
      }
    } else if (vault.tier === 'PRO') {
      tamperDetected = true;
      vault.tier = 'FREE';
      this.saveVault(vault);
    }

    const isPro = isValidActiveKey && vault.tier === 'PRO';
    const planLimits = isPro ? PLAN_LIMITS.PRO : PLAN_LIMITS.FREE;

    return {
      isPro,
      tier: isPro ? 'PRO' : 'FREE',
      keyMasked: isPro && rawActiveKey ? `${rawActiveKey.slice(0, 14)}-****-****` : null,
      activatedKey: isPro && rawActiveKey
        ? `${rawActiveKey.slice(0, 14)}-****-****`
        : null,
      activatedKeyFull: isPro ? rawActiveKey : null,
      activatedAt: isPro ? vault.activatedAt : null,
      hardwareHash: vault.hardwareHash || this.getHardwareFingerprint(),
      hardwareFingerprint: vault.hardwareHash || this.getHardwareFingerprint(),
      tamperDetected,
      tampered: tamperDetected,
      entitlements: {
        maxProjects: planLimits.maxProjects,
        aiTaggingBatchLimit: planLimits.aiTaggingBatchLimit,
        allowCodeStudioSave: planLimits.allowCodeStudioSave,
        allowImageStudioExport: planLimits.allowImageStudioExport,
        allowAutonomousExecute: planLimits.allowAutonomousExecute,
        allowBatchMutations: planLimits.allowBatchMutations,
        allowWholePcScan: planLimits.allowWholePcScan,
        allowMultiWorkspace: planLimits.allowMultiWorkspace,
        maxScanBytes: planLimits.maxScanBytes,
        maxScanBytesFormatted: planLimits.maxScanBytesFormatted,
        maxScanFiles: planLimits.maxScanFiles,
        allowAiChat: planLimits.allowAiChat,
        allowCreateItem: planLimits.allowCreateItem
      },
      planLimits
    };
  }

  /**
   * Authoritative server-side feature gate verification
   */
  static verifyFeatureAccess(featureId, requestedQuantity = 1) {
    const status = this.getStatus();
    const policy = FEATURE_POLICIES[featureId] || {
      id: featureId,
      label: featureId,
      requiresPro: true,
      freeLimit: 0,
      proMaxBatchSize: 50
    };

    if (status.isPro) {
      return {
        allowed: true,
        isPro: true,
        tier: 'PRO',
        feature: policy.id,
        limit: null,
        maxBatchSize: policy.proMaxBatchSize || 50
      };
    }

    if (!policy.requiresPro) {
      return {
        allowed: true,
        isPro: false,
        tier: 'FREE',
        feature: policy.id,
        limit: policy.freeLimit,
        maxBatchSize: policy.freeLimit || 5
      };
    }

    if (typeof policy.freeLimit === 'number' && policy.freeLimit > 0 && requestedQuantity <= policy.freeLimit) {
      return {
        allowed: true,
        isPro: false,
        tier: 'FREE',
        feature: policy.id,
        limit: policy.freeLimit,
        maxBatchSize: policy.freeLimit
      };
    }

    return {
      allowed: false,
      isPro: false,
      tier: 'FREE',
      feature: policy.id,
      limit: policy.freeLimit,
      maxBatchSize: policy.freeLimit || 0,
      error: `Funkcja "${policy.label}" wymaga aktywnej licencji Project Nexus PRO.`
    };
  }

  /**
   * Load vault from disk with schema normalization and corruption recovery
   */
  static loadVault() {
    const targetFile = this.vaultFile;
    try {
      if (fs.existsSync(targetFile)) {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const base = this.createEmptyVault();
          const activeLicenseObj = parsed.activeLicense && typeof parsed.activeLicense === 'object'
            ? {
                ...parsed.activeLicense,
                key: typeof parsed.activeLicense.key === 'string' ? this.normalizeKey(parsed.activeLicense.key) : null
              }
            : null;
          const resolvedKey = activeLicenseObj?.key
            || (typeof parsed.activatedKey === 'string' ? this.normalizeKey(parsed.activatedKey) : null);

          return {
            ...base,
            schemaVersion: 3,
            activatedKey: resolvedKey,
            activeLicense: activeLicenseObj || (resolvedKey ? { key: resolvedKey, tier: 'PRO_LIFETIME' } : null),
            activatedAt: typeof parsed.activatedAt === 'number' ? parsed.activatedAt : null,
            tier: parsed.tier === 'PRO' || Boolean(activeLicenseObj?.key) ? 'PRO' : 'FREE',
            hardwareHash: typeof parsed.hardwareHash === 'string' && parsed.hardwareHash
              ? parsed.hardwareHash
              : base.hardwareHash,
            generatedKeys: Array.isArray(parsed.generatedKeys) ? parsed.generatedKeys : [],
            revokedKeys: parsed.revokedKeys && typeof parsed.revokedKeys === 'object' && !Array.isArray(parsed.revokedKeys)
              ? parsed.revokedKeys
              : {},
            activationHistory: Array.isArray(parsed.activationHistory) ? parsed.activationHistory : [],
            updatedAt: parsed.updatedAt || Date.now()
          };
        }
      }
    } catch (_) {}
    return this.createEmptyVault();
  }

  /**
   * Atomically persist vault to disk (write to temp file + rename)
   */
  static saveVault(vault) {
    const targetFile = this.vaultFile;
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        ...vault,
        schemaVersion: 3,
        updatedAt: Date.now()
      };
      const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmpFile, targetFile);
      return true;
    } catch (e) {
      console.error('[LicenseVault] Error saving vault:', e.message);
      return false;
    }
  }
}

module.exports = {
  LicenseVault,
  FEATURE_POLICIES,
  PLAN_LIMITS,
  LIMIT_MESSAGES,
  ONE_GB_BYTES,
  PRO_MAX_SCAN_BYTES,
  PRO_MAX_SCAN_FILES,
  FREE_MAX_SCAN_BYTES,
  FREE_MAX_SCAN_FILES,
  validateScanTarget,
  checkInFlightLimit
};
