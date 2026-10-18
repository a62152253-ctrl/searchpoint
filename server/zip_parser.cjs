/**
 * PROJECT NEXUS - Autonomous Pure Node.js ZIP Engine
 * High-performance, zero external dependency ZIP parser, inspector & extractor.
 * Handles End of Central Directory, Central Directory records, and Deflate decompression.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

class NexusZipEngine {
  /**
   * Parse Central Directory from a .zip file on disk
   * @param {string} zipFilePath 
   * @returns {Promise<{entries: Array, totalSize: number, compressedSize: number, comment: string}>}
   */
  static async listEntries(zipFilePath) {
    const fd = await fs.promises.open(zipFilePath, 'r');
    try {
      const stats = await fd.stat();
      const fileSize = stats.size;
      if (fileSize < 22) throw new Error('File too small to be a valid ZIP archive');

      // 1. Search for End of Central Directory (EOCD) signature: 0x06054b50
      const searchLen = Math.min(fileSize, 65557); // 65535 max comment + 22 byte EOCD
      const buffer = Buffer.alloc(searchLen);
      await fd.read(buffer, 0, searchLen, fileSize - searchLen);

      let eocdOffset = -1;
      for (let i = searchLen - 22; i >= 0; i--) {
        if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
          eocdOffset = i;
          break;
        }
      }

      if (eocdOffset === -1) {
        throw new Error('End of Central Directory signature (EOCD) not found');
      }

      const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
      const cdSize = buffer.readUInt32LE(eocdOffset + 12);
      const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
      const commentLen = buffer.readUInt16LE(eocdOffset + 20);
      const comment = commentLen > 0 ? buffer.toString('utf8', eocdOffset + 22, eocdOffset + 22 + commentLen) : '';

      // 2. Read Central Directory
      const cdBuffer = Buffer.alloc(cdSize);
      await fd.read(cdBuffer, 0, cdSize, cdOffset);

      const entries = [];
      let pos = 0;

      while (pos < cdSize) {
        if (pos + 46 > cdSize) break;
        const sig = cdBuffer.readUInt32LE(pos);
        if (sig !== 0x02014b50) break; // Central Directory header signature

        const method = cdBuffer.readUInt16LE(pos + 10);
        const modTime = cdBuffer.readUInt16LE(pos + 12);
        const modDate = cdBuffer.readUInt16LE(pos + 14);
        const crc32 = cdBuffer.readUInt32LE(pos + 16);
        const compSize = cdBuffer.readUInt32LE(pos + 20);
        const uncompSize = cdBuffer.readUInt32LE(pos + 24);
        const nameLen = cdBuffer.readUInt16LE(pos + 28);
        const extraLen = cdBuffer.readUInt16LE(pos + 30);
        const commentLen = cdBuffer.readUInt16LE(pos + 32);
        const localOffset = cdBuffer.readUInt32LE(pos + 42);

        const entryName = cdBuffer.toString('utf8', pos + 46, pos + 46 + nameLen);
        const isDir = entryName.endsWith('/') || entryName.endsWith('\\');
        const ext = path.extname(entryName).toLowerCase().replace('.', '');

        // Decode MS-DOS date/time
        const sec = (modTime & 0x1f) * 2;
        const min = (modTime >> 5) & 0x3f;
        const hour = (modTime >> 11) & 0x1f;
        const day = modDate & 0x1f;
        const month = ((modDate >> 5) & 0x0f) - 1;
        const year = ((modDate >> 9) & 0x7f) + 1980;
        const date = new Date(year, Math.max(0, month), Math.max(1, day), hour, min, sec);

        entries.push({
          name: entryName,
          baseName: path.basename(entryName),
          isDir,
          extension: ext,
          size: uncompSize,
          compressedSize: compSize,
          compressionMethod: method === 0 ? 'stored' : method === 8 ? 'deflate' : `type_${method}`,
          mtime: date.getTime(),
          crc32,
          localOffset
        });

        pos += 46 + nameLen + extraLen + commentLen;
      }

      return {
        zipPath: zipFilePath,
        zipName: path.basename(zipFilePath),
        totalFiles: entries.filter(e => !e.isDir).length,
        totalFolders: entries.filter(e => e.isDir).length,
        uncompressedSize: entries.reduce((acc, e) => acc + e.size, 0),
        compressedSize: entries.reduce((acc, e) => acc + e.compressedSize, 0),
        comment,
        entries
      };
    } finally {
      await fd.close();
    }
  }

  /**
   * Extract entry directly using an existing open file descriptor
   */
  static async extractEntryWithFd(fd, entry) {
    if (entry.isDir) return Buffer.alloc(0);

    // 1. Read Local File Header (30 bytes min) at localOffset
    const headerBuf = Buffer.alloc(30);
    await fd.read(headerBuf, 0, 30, entry.localOffset);
    if (headerBuf.readUInt32LE(0) !== 0x04034b50) {
      throw new Error('Invalid Local File Header signature');
    }

    const nameLen = headerBuf.readUInt16LE(26);
    const extraLen = headerBuf.readUInt16LE(28);
    const dataOffset = entry.localOffset + 30 + nameLen + extraLen;

    // 2. Read compressed payload
    const compressedBuffer = Buffer.alloc(entry.compressedSize);
    await fd.read(compressedBuffer, 0, entry.compressedSize, dataOffset);

    // 3. Decompress payload
    if (entry.compressionMethod === 'stored' || entry.compressedSize === entry.size) {
      return compressedBuffer;
    } else if (entry.compressionMethod === 'deflate') {
      return zlib.inflateRawSync(compressedBuffer);
    } else {
      throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
    }
  }

  /**
   * Extract a single entry from a .zip into a Buffer in memory without extracting entire archive
   * @param {string} zipFilePath 
   * @param {string} entryName 
   * @returns {Promise<Buffer>}
   */
  static async extractEntry(zipFilePath, entryName) {
    const list = await this.listEntries(zipFilePath);
    const normalizedTarget = entryName.trim().replace(/\\/g, '/').toLowerCase();
    const entry = list.entries.find(e => 
      e.name.trim().replace(/\\/g, '/').toLowerCase() === normalizedTarget ||
      e.name.trim().replace(/\\/g, '/').toLowerCase().endsWith('/' + normalizedTarget)
    );
    if (!entry) throw new Error(`Entry "${entryName}" not found in zip archive`);
    if (entry.isDir) return Buffer.alloc(0);

    const fd = await fs.promises.open(zipFilePath, 'r');
    try {
      return await this.extractEntryWithFd(fd, entry);
    } finally {
      await fd.close();
    }
  }

  /**
   * Unpack entire ZIP archive to a destination directory on disk
   * @param {string} zipFilePath 
   * @param {string} destDir 
   * @param {function} onProgress 
   * @returns {Promise<{unpackedCount: number, destDir: string}>}
   */
  static async unpackAll(zipFilePath, destDir, onProgress = null) {
    const meta = await this.listEntries(zipFilePath);
    const resolvedDestDir = path.resolve(destDir);
    await fs.promises.mkdir(resolvedDestDir, { recursive: true });

    let unpacked = 0;
    const fd = await fs.promises.open(zipFilePath, 'r');
    try {
      for (const entry of meta.entries) {
        // Prevent Zip Slip vulnerability (CWE-22 / Path Traversal)
        const safeRelative = entry.name.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        const fullPath = path.resolve(resolvedDestDir, safeRelative);
        const relative = path.relative(resolvedDestDir, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          console.warn(`[NexusZipEngine] Blocked Zip Slip traversal attempt: ${entry.name}`);
          continue;
        }

        if (entry.isDir) {
          await fs.promises.mkdir(fullPath, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
          const data = await this.extractEntryWithFd(fd, entry);
          await fs.promises.writeFile(fullPath, data);
          unpacked++;
        }
        if (onProgress) {
          onProgress({ current: unpacked, total: meta.totalFiles, file: entry.name });
        }
      }
    } finally {
      await fd.close();
    }

    return {
      unpackedCount: unpacked,
      destDir: resolvedDestDir
    };
  }
}

module.exports = {
  NexusZipEngine
};
