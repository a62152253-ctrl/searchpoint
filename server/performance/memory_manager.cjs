/**
 * PROJECT NEXUS - PERFORMANCE & BOUNDED MEMORY MANAGER
 * 
 * Enforces the core architecture rule:
 * "Unlimited files. Bounded rendering."
 * 
 * - LRU memory caches with hard capacity and byte limits
 * - Bounded pagination windows (never allocates full arrays to clients)
 * - Process heap monitor and aggressive GC hint
 */

const os = require('node:os');

class LRUCache {
  constructor(maxEntries = 5000, maxBytes = 64 * 1024 * 1024) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.currentBytes = 0;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    // Refresh position (delete and re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key, value, sizeEstimate = 1024) {
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      this.currentBytes -= existing.size;
      this.cache.delete(key);
    }

    // Evict if over entries or byte limit
    while (this.cache.size >= this.maxEntries || (this.currentBytes + sizeEstimate > this.maxBytes && this.cache.size > 0)) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldestEntry = this.cache.get(oldestKey);
      this.currentBytes -= oldestEntry.size;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      size: sizeEstimate,
      lastAccess: Date.now()
    });
    this.currentBytes += sizeEstimate;
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    if (!this.cache.has(key)) return false;
    const entry = this.cache.get(key);
    this.currentBytes -= entry.size;
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.currentBytes = 0;
  }

  getStats() {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      bytes: this.currentBytes,
      maxBytes: this.maxBytes,
      megabytes: (this.currentBytes / (1024 * 1024)).toFixed(2)
    };
  }
}

class BoundedWindow {
  /**
   * Safe slice of any collection to guarantee bounded payload to UI
   */
  static slice(array, page = 1, limit = 50) {
    const validLimit = Math.min(250, Math.max(10, parseInt(limit, 10) || 50));
    const total = array.length;
    const totalPages = Math.max(1, Math.ceil(total / validLimit));
    const validPage = Math.min(totalPages, Math.max(1, parseInt(page, 10) || 1));
    const start = (validPage - 1) * validLimit;
    const end = Math.min(total, start + validLimit);

    return {
      items: array.slice(start, end),
      pagination: {
        page: validPage,
        limit: validLimit,
        totalItems: total,
        totalPages,
        hasPrev: validPage > 1,
        hasNext: validPage < totalPages,
        startIndex: start,
        endIndex: end
      }
    };
  }
}

class MemoryWatchdog {
  static checkMemory() {
    const mem = process.memoryUsage();
    return {
      rssMB: (mem.rss / (1024 * 1024)).toFixed(1),
      heapTotalMB: (mem.heapTotal / (1024 * 1024)).toFixed(1),
      heapUsedMB: (mem.heapUsed / (1024 * 1024)).toFixed(1),
      externalMB: (mem.external / (1024 * 1024)).toFixed(1),
      systemFreeGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2)
    };
  }
}

module.exports = {
  LRUCache,
  BoundedWindow,
  MemoryWatchdog
};
