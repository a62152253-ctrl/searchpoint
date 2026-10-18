/**
 * PROJECT NEXUS - LOW-LEVEL MEDIA HEADER SNIFFER & SCREENSHOT HEURISTIC MATRIX
 * Zero external libraries (No sharp, No image-size, No canvas).
 * Parses raw binary chunks of PNG, JPEG, WebP, GIF, BMP, SVG to extract exact
 * resolution, aspect ratio, color depth, and ephemeral screenshot decay scores.
 */

const fs = require('node:fs');
const path = require('node:path');

// Common Standard Display & Screenshot Resolutions
const KNOWN_SCREEN_RESOLUTIONS = new Set([
  '1920x1080', '2560x1440', '3840x2160', '1366x768', '1440x900', '1536x864',
  '1600x900', '1680x1050', '1920x1200', '2560x1600', '3440x1440', '5120x1440',
  '5120x2880', '1280x720', '1280x800', '1024x768', '1080x1920', '1440x2560'
]);

// Ephemeral filename regex dictionary
const EPHEMERAL_PATTERNS = [
  /screenshot[_\s-]?\d+/i,
  /zrzut[_\s-]?ekranu[_\s-]?\d+/i,
  /przechwytywanie[_\s-]?\d+/i,
  /screen[_\s-]?shot/i,
  /snip[_\s-]?\d+/i,
  /capture[_\s-]?\d+/i,
  /obrazek[_\s-]?\(\d+\)/i,
  /image[_\s-]?\(\d+\)/i,
  /img[_\s-]?\d{4}[-_]\d{2}[-_]\d{2}/i,
  /\d{4}[-_]\d{2}[-_]\d{2}[-_ ]\d{2}[-_.]\d{2}[-_.]\d{2}/ // 2024-10-12 18.23.01
];

class MediaParser {
  /**
   * Fast header probe reads only the first 2KB of the file
   */
  static async probeImage(filePath) {
    let fd = null;
    try {
      fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(2048);
      const { bytesRead } = await fd.read(buffer, 0, 2048, 0);
      if (bytesRead < 16) {
        return { isMedia: false, reason: 'File too small' };
      }
      return this.parseBuffer(buffer.subarray(0, bytesRead), filePath);
    } catch (err) {
      return { isMedia: false, error: err.message };
    } finally {
      if (fd) {
        try { await fd.close(); } catch (e) {}
      }
    }
  }

  static parseBuffer(buffer, filePath = '') {
    // 1. PNG Signature: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 24 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
      return this.parsePNG(buffer, filePath);
    }

    // 2. JPEG Signature: FF D8 FF
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return this.parseJPEG(buffer, filePath);
    }

    // 3. WebP Signature: RIFF .... WEBP
    if (buffer.length >= 16 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP') {
      return this.parseWebP(buffer, filePath);
    }

    // 4. GIF Signature: GIF87a or GIF89a
    if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return this.evaluateScreenshotProbability({
        format: 'GIF',
        width,
        height,
        aspectRatio: (width / Math.max(1, height)).toFixed(2),
        filePath
      });
    }

    // 5. BMP Signature: BM (0x42, 0x4D)
    if (buffer.length >= 26 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
      const width = buffer.readInt32LE(18);
      const height = Math.abs(buffer.readInt32LE(22));
      return this.evaluateScreenshotProbability({
        format: 'BMP',
        width,
        height,
        aspectRatio: (width / Math.max(1, height)).toFixed(2),
        filePath
      });
    }

    return { isMedia: false, reason: 'Unsupported or non-media header' };
  }

  static parsePNG(buffer, filePath) {
    // IHDR chunk starts at byte 12
    const chunkLength = buffer.readUInt32BE(8);
    const chunkType = buffer.toString('ascii', 12, 16);
    if (chunkType !== 'IHDR') {
      return { isMedia: true, format: 'PNG', corrupted: true };
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const bitDepth = buffer.readUInt8(24);
    const colorType = buffer.readUInt8(25);
    const compression = buffer.readUInt8(26);
    const filter = buffer.readUInt8(27);
    const interlace = buffer.readUInt8(28);

    return this.evaluateScreenshotProbability({
      format: 'PNG',
      width,
      height,
      bitDepth,
      colorType,
      aspectRatio: (width / Math.max(1, height)).toFixed(2),
      isInterlaced: interlace === 1,
      filePath
    });
  }

  static parseJPEG(buffer, filePath) {
    let offset = 2;
    let width = 0;
    let height = 0;

    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];

      // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) contain image size
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        height = buffer.readUInt16BE(offset + 5);
        width = buffer.readUInt16BE(offset + 7);
        break;
      } else {
        // Skip variable length marker
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }

    return this.evaluateScreenshotProbability({
      format: 'JPEG',
      width,
      height,
      aspectRatio: width && height ? (width / height).toFixed(2) : '1.0',
      filePath
    });
  }

  static parseWebP(buffer, filePath) {
    const chunk = buffer.toString('ascii', 12, 16);
    let width = 0;
    let height = 0;

    if (chunk === 'VP8 ' && buffer.length >= 30) {
      // Lossy WebP
      width = buffer.readUInt16LE(26) & 0x3fff;
      height = buffer.readUInt16LE(28) & 0x3fff;
    } else if (chunk === 'VP8L' && buffer.length >= 25) {
      // Lossless WebP
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      width = 1 + (((b1 & 0x3f) << 8) | b0);
      height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    } else if (chunk === 'VP8X' && buffer.length >= 30) {
      // Extended WebP
      width = 1 + buffer.readUIntLE(24, 3);
      height = 1 + buffer.readUIntLE(27, 3);
    }

    return this.evaluateScreenshotProbability({
      format: 'WEBP',
      width,
      height,
      aspectRatio: width && height ? (width / height).toFixed(2) : '1.0',
      filePath
    });
  }

  /**
   * Autonomous Screenshot Heuristic Probability Matrix
   * Combines filename, resolution, aspect ratio, and directory location
   */
  static evaluateScreenshotProbability(meta) {
    const fileName = path.basename(meta.filePath || '');
    const dirName = path.dirname(meta.filePath || '');
    const resKey = `${meta.width}x${meta.height}`;

    let score = 0;
    const reasons = [];

    // 1. Exact Screen Resolution Match
    if (KNOWN_SCREEN_RESOLUTIONS.has(resKey)) {
      score += 45;
      reasons.push(`Natywna rozdzielczość monitora Windows (${resKey})`);
    }

    // 2. Aspect Ratio Matches (16:9 = ~1.78, 16:10 = 1.6, 21:9 = 2.39)
    const ratio = parseFloat(meta.aspectRatio);
    if (Math.abs(ratio - 1.78) < 0.05 || Math.abs(ratio - 1.60) < 0.05 || Math.abs(ratio - 2.39) < 0.05) {
      score += 20;
      reasons.push(`Współczynnik proporcji ekranu panoramicznego (${meta.aspectRatio})`);
    }

    // 3. Filename Pattern Match
    for (const pattern of EPHEMERAL_PATTERNS) {
      if (pattern.test(fileName)) {
        score += 35;
        reasons.push(`Wzorzec nazewnictwa narzędzia Wycinanie/Zrzut (${fileName})`);
        break;
      }
    }

    // 4. Folder Context
    if (/screenshot|zrzut|przechwyc|snip|temp|pobrane|desktop/i.test(dirName)) {
      score += 15;
      reasons.push(`Lokalizacja w buforze tymczasowym (${path.basename(dirName)})`);
    }

    // 5. Ephemeral Decay Calculation
    const isScreenshot = score >= 50;
    const isDisposable = score >= 65;

    return {
      isMedia: true,
      format: meta.format,
      width: meta.width,
      height: meta.height,
      aspectRatio: meta.aspectRatio,
      resolutionString: resKey,
      screenshotScore: Math.min(100, score),
      isScreenshot,
      isDisposable,
      detectionReasons: reasons,
      recommendedTriageAction: isDisposable ? 'AUTO_ARCHIVE_OR_PURGE' : (isScreenshot ? 'REVIEW_IN_WORKSPACE' : 'KEEP_ASSET')
    };
  }
}

module.exports = {
  MediaParser,
  KNOWN_SCREEN_RESOLUTIONS
};
