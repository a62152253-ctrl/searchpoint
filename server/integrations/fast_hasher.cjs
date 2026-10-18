/**
 * PROJECT NEXUS - Extreme Performance Hasher
 * Provides hardware-accelerated Blake3 and xxHash64 hashing via WebAssembly (hash-wasm).
 * Powers near-instant deduplication and fast file integrity verification.
 */
const fs = require('node:fs');
const path = require('node:path');
const { blake3, xxhash64 } = require('hash-wasm');

class FastHasher {
  /**
   * Calculates Blake3 and xxHash64 for a given file buffer or stream.
   * For files > 10MB, uses multi-point chunk sampling for instant deduplication.
   */
  static async hashFile(filePath, full = false) {
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) return null;

      const stat = fs.statSync(resolved);
      const size = stat.size;

      // Small file (< 10MB) or full hash requested -> hash complete buffer
      if (size <= 10 * 1024 * 1024 || full) {
        const buf = fs.readFileSync(resolved);
        const [b3, xxh] = await Promise.all([
          blake3(buf),
          xxhash64(buf)
        ]);
        return {
          blake3: b3,
          xxhash: xxh,
          size,
          isSampled: false
        };
      }

      // Large file multi-point sampling (Head 64KB, Middle 64KB, Tail 64KB)
      const fd = fs.openSync(resolved, 'r');
      const chunkSize = 64 * 1024;
      const combined = Buffer.alloc(chunkSize * 3 + 8);

      try {
        // Write size in first 8 bytes
        combined.writeBigInt64BE(BigInt(size), 0);

        // Head
        fs.readSync(fd, combined, 8, chunkSize, 0);

        // Middle
        const mid = Math.floor(size / 2);
        fs.readSync(fd, combined, 8 + chunkSize, chunkSize, mid);

        // Tail
        const tail = Math.max(0, size - chunkSize);
        fs.readSync(fd, combined, 8 + chunkSize * 2, chunkSize, tail);
      } finally {
        fs.closeSync(fd);
      }

      const [b3, xxh] = await Promise.all([
        blake3(combined),
        xxhash64(combined)
      ]);

      return {
        blake3: b3,
        xxhash: xxh,
        size,
        isSampled: true
      };
    } catch (err) {
      return null;
    }
  }
}

module.exports = { FastHasher };
