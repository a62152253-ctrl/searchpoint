/**
 * PROJECT NEXUS - Autonomous File Intelligence
 * Universal Core Type Definitions & API Contracts
 * Fully typed, production-hardened data schemas across Frontend & Backend.
 */

// ============================================================================
// 1. FILE CATEGORIZATION & ITEM TAXONOMY
// ============================================================================

export type CategoryType = 
  | 'DEV' 
  | 'MEDIA' 
  | 'SCREENSHOT' 
  | 'APPS' 
  | 'DOCS' 
  | 'ARCHIVES' 
  | 'OTHER';

export interface DeepFileMetadata {
  width?: number;
  height?: number;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  dateTaken?: string;
  sha256?: string;
  blake3?: string;
  xxhash64?: string;
  linesOfCode?: number;
  symbolsCount?: number;
  syntaxLanguage?: string;
  executableArch?: string; // 'x64' | 'x86' | 'ARM64'
  peSubsystem?: string;
  isSigned?: boolean;
  zipEntriesCount?: number;
  zipCompressedRatio?: number;
  docPagesCount?: number;
  docWordCount?: number;
  exifTags?: Record<string, string | number>;
  [key: string]: any;
}

export interface FileItem {
  id: string;
  name: string;
  path: string;
  dir: string;
  extension: string;
  size: number;
  mtime: number;
  category: CategoryType;
  subCategory: string;
  isDisposable: boolean;
  confidence: number;
  workspaceId?: string;
  deepMeta?: DeepFileMetadata;
  tags?: string[];
  fileHandle?: any; // Browser FileSystemFileHandle for FSA API
  blobUrl?: string; // Local in-memory blob preview URL
  isPinned?: boolean;
  quarantineReason?: string;
  threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// ============================================================================
// 2. WORKSPACES, SCANNING & METRICS
// ============================================================================

export interface SmartWorkspace {
  id: string;
  name: string;
  rootPath?: string;
  rootHint?: string;
  fileCount: number;
  totalBytes?: number;
  types: string[];
  recommendedAction?: string;
  dominantLanguage?: string;
  lastActiveTime?: number;
  confidence?: number;
}

export interface ScanProgress {
  filesCount: number;
  dirsCount: number;
  totalBytes: number;
  speedFilesPerSec: number;
  categories: Record<CategoryType, number>;
  workspacesCount: number;
  currentFolder?: string;
  currentFile?: string;
  elapsedMs?: number;
}

export interface ShieldReportSummary {
  totalLoaded: number;
  rejectedNsfw: number;
  rejectedMalware: number;
  quarantinedCount?: number;
  safeAcademicCount?: number;
}

export interface DuplicateInstallerGroup {
  name: string;
  canonicalPath: string;
  duplicates: {
    path: string;
    size: number;
    mtime: number;
    hash?: string;
  }[];
  totalWastedBytes: number;
}

export interface ScanStats {
  totalFiles: number;
  totalDirs: number;
  totalBytes: number;
  durationMs: number;
  speedFilesPerSec: number;
  categories: Record<CategoryType, number>;
  workspaces: SmartWorkspace[];
  duplicateInstallers?: DuplicateInstallerGroup[];
  temporalBursts?: any[];
  autonomousBlueprint?: AutonomousBlueprint;
  shieldReport?: ShieldReportSummary;
}

// ============================================================================
// 3. AUTONOMOUS PLANNER & BLUEPRINTS
// ============================================================================

export interface AutonomousPlanAction {
  type: string;
  destination: string;
  count: number;
  targetFolder?: string;
  targetFiles?: string[];
}

export interface AutonomousPlan {
  id: string;
  title: string;
  description: string;
  executionMode?: 'MOVE' | 'ADVISORY' | 'ARCHIVE';
  targetFolder: string;
  fileCount: number;
  reclaimableGB: string;
  actions: AutonomousPlanAction[];
  sampleFiles: string[];
  isHighPriority: boolean;
  requiresReview?: boolean;
  createdAt?: string;
}

export interface AutonomousBlueprint {
  summary: {
    totalFiles: number;
    totalGB: string;
    totalReclaimableGB: string;
    candidatePlansCount: number;
  };
  plans: AutonomousPlan[];
  generatedAt?: number;
}

// ============================================================================
// 4. SYSTEM TARGETS & MACHINE METRICS
// ============================================================================

export interface SystemTarget {
  id: string;
  name: string;
  path: string;
  hint: string;
  icon: string;
  fileCountEstimate?: number;
  exists?: boolean;
}

export interface SystemInfo {
  platform: string;
  release: string;
  username?: string;
  cpuCores: number;
  totalMemoryGB: string;
  freeMemoryGB: string;
  homeDir: string;
  defaultTargets: SystemTarget[];
  drives?: string[];
  nodeVersion?: string;
  uptimeSeconds?: number;
  installedModels?: string[];
  ollamaRunning?: boolean;
}

export interface MemoryWatchdogStats {
  rssMB: number;
  heapTotalMB: number;
  heapUsedMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  status: 'OPTIMAL' | 'ELEVATED' | 'CRITICAL';
}

// ============================================================================
// 5. CRYPTO CHECKOUT & LICENSING (CRITICAL PAYMENT ENGINE)
// ============================================================================

export type CryptoCurrency = 'LTC' | 'SOL' | 'POLYGON_USDT';

export type OrderStatus = 
  | 'WAITING_PAYMENT' 
  | 'CONFIRMING' 
  | 'UNDERPAID' 
  | 'PAID' 
  | 'EXPIRED' 
  | 'CANCELLED' 
  | 'FAILED' 
  | 'REFUNDED';

export interface CryptoOrder {
  orderId: string;
  currency: CryptoCurrency | string;
  network?: string;
  networkLabel?: string;
  recipientAddress: string;
  walletAddress?: string;
  amount: number;
  expectedAmount?: number;
  amountFormatted?: string;
  amountPaid?: number;
  priceUsd: number;
  usdValue?: number;
  exchangeRateUsd?: number;
  rateSource?: string;
  status: OrderStatus | string;
  confirmations?: number;
  requiredConfirmations?: number;
  txHash?: string | null;
  licenseKey?: string | null;
  paymentUri?: string;
  explorerBaseUrl?: string;
  isWalletConfigured?: boolean;
  expiresAt: number;
  remainingSeconds?: number;
  errorReason?: string | null;
  createdAt?: number;
  verifiedAt?: number;
}

export interface PlanLimits {
  tier: 'FREE' | 'PRO';
  name: string;
  allowWholePcScan: boolean;
  allowMultiWorkspace: boolean;
  maxScanBytes: number;
  maxScanBytesFormatted: string;
  maxScanFiles: number;
  maxProjects: number;
  aiTaggingBatchLimit: number;
  allowCodeStudioSave: boolean;
  allowImageStudioExport: boolean;
  allowAutonomousExecute: boolean;
  allowBatchMutations: boolean;
  allowAiChat: boolean;
  allowCreateItem: boolean;
}

export interface LimitExceededPayload {
  code: string;
  plan: 'FREE' | 'PRO';
  limitType?: string;
  maxBytes?: number;
  maxFiles?: number;
  currentBytes?: number;
  currentFiles?: number;
  message: string;
  error?: string;
  suggestedAction?: string;
}

export interface LicenseStatus {
  isPro: boolean;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  licenseKey?: string | null;
  keyMasked?: string | null;
  activatedKey?: string | null;
  activatedKeyFull?: string | null;
  activatedAt?: number | null;
  expiresAt?: number | null;
  deviceId?: string;
  hardwareHash?: string;
  tamperDetected?: boolean;
  entitlements?: {
    maxProjects?: number;
    aiTaggingBatchLimit?: number;
    allowCodeStudioSave?: boolean;
    allowImageStudioExport?: boolean;
    allowAutonomousExecute?: boolean;
    allowBatchMutations?: boolean;
    allowWholePcScan?: boolean;
    allowMultiWorkspace?: boolean;
    maxScanBytes?: number;
    maxScanBytesFormatted?: string;
    maxScanFiles?: number;
    allowAiChat?: boolean;
    allowCreateItem?: boolean;
    unlimitedScanning?: boolean;
    aiSemanticTriage?: boolean;
    photoshopAutomation?: boolean;
    threatVaultPurge?: boolean;
    autonomousRollback?: boolean;
    highPerformanceFastHash?: boolean;
  };
  planLimits?: PlanLimits;
}

export interface LicenseVerificationResult {
  valid: boolean;
  isPro: boolean;
  feature?: string;
  allowed: boolean;
  reason?: string;
}

export interface CryptoConfigWallets {
  ltc: string;
  sol: string;
  polygonUsdt: string;
  [key: string]: string;
}

export interface CryptoServerConfig {
  wallets: CryptoConfigWallets;
  targetPriceUsd: number;
  minConfirmations: {
    ltc: number;
    sol: number;
    polygonUsdt: number;
  };
}

// ============================================================================
// 6. AI AGENTS, LOCAL OLLAMA & METADATA TAGGING
// ============================================================================

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface AIServerStatus {
  ollamaRunning: boolean;
  ollamaVersion?: string;
  models: OllamaModel[];
  activeModel?: string;
  provider: 'OLLAMA' | 'OPENAI' | 'CLAUDE' | 'LOCAL_OFFLINE';
  isConfigured: boolean;
  lastCheckedAt?: number;
}

export interface OllamaTaggingResult {
  itemId: string;
  itemPath: string;
  suggestedTags: string[];
  suggestedCategory?: CategoryType;
  suggestedSubcategory?: string;
  confidenceScore: number;
  summaryExplanation?: string;
}

export interface ProjectInspection {
  name: string;
  path: string;
  framework?: string;
  packageManager?: string;
  dependenciesCount?: number;
  scriptsAvailable?: string[];
  dominantLanguage?: string;
  fileCount?: number;
  detectedTypes?: string[];
  gitBranch?: string;
  gitStatus?: 'CLEAN' | 'DIRTY' | 'UNTRACKED';
}

// ============================================================================
// 7. SECURITY, SMART SHIELD & QUARANTINE
// ============================================================================

export interface QuarantineItem {
  id: string;
  originalPath: string;
  quarantineVaultPath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  quarantinedAt: number;
  reason: 'MALWARE_SIGNATURE' | 'DOUBLE_EXTENSION' | 'NSFW_VULGARITY' | 'USER_ENFORCED';
  riskScore: number; // 0..100
  threatDetails?: string;
  status: 'QUARANTINED' | 'RESTORED' | 'PURGED';
}

export interface GhostJunkItem {
  path: string;
  name: string;
  size: number;
  type: 'ZERO_BYTE_FILE' | 'EMPTY_DIRECTORY' | 'ORPHAN_TEMP' | 'CORRUPTED_CACHE';
  mtime: number;
  canSafelyDelete: boolean;
}

// ============================================================================
// 8. TOAST NOTIFICATIONS & UI NOTIFICATION PIPELINE
// ============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  description?: string;
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// ============================================================================
// 9. NAVIGATION, SORTING & VIEW CONFIGURATIONS
// ============================================================================

export type ExplorerSubView = 
  | 'DASHBOARD' 
  | 'TOPICS' 
  | 'GALLERY' 
  | 'TRIAGE' 
  | 'KANBAN' 
  | 'APPS';

export type SortField = 'name' | 'size' | 'mtime' | 'category' | 'extension' | 'confidence';
export type SortDirection = 'asc' | 'desc';
export type GridDensity = 'compact' | 'comfortable' | 'spacious';
export type DisplayMode = 'grid' | 'table' | 'compact_list';

export interface FileFilterCriteria {
  searchQuery?: string;
  category?: CategoryType | 'ALL';
  subCategory?: string;
  extensions?: string[];
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: number;
  endDate?: number;
  isDisposable?: boolean;
  isPinned?: boolean;
}

// ============================================================================
// 10. UTILITY FORMATTERS
// ============================================================================

export function formatBytesCompact(bytes: number = 0): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 ** 4) return `${(bytes / (1024 ** 4)).toFixed(2)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatDateCompact(timestamp: number | string | Date): string {
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
}

export function formatDurationCompact(ms: number = 0): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}
