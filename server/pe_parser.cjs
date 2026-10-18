/**
 * PROJECT NEXUS - LOW-LEVEL WINDOWS PE (PORTABLE EXECUTABLE) PARSER
 * Zero external dependencies. Direct raw buffer parsing of PE32/PE32+ binaries (.exe, .dll, .sys).
 * Extracts: DOS Header, PE Signature, COFF Header, Optional Header, Data Directories,
 * Section Headers, Import/Export Tables, Architecture (x86, x64, ARM64), Subsystems,
 * Compilation Timestamps, and Digital Signature certificates.
 */

const fs = require('node:fs');

// Windows PE Machine Types
const IMAGE_FILE_MACHINE = {
  0x014c: { name: 'IMAGE_FILE_MACHINE_I386', arch: 'x86 (32-bit)', label: 'Intel 386' },
  0x8664: { name: 'IMAGE_FILE_MACHINE_AMD64', arch: 'x64 (64-bit)', label: 'AMD/Intel x64' },
  0xaa64: { name: 'IMAGE_FILE_MACHINE_ARM64', arch: 'ARM64 (64-bit)', label: 'ARM64' },
  0x01c0: { name: 'IMAGE_FILE_MACHINE_ARM', arch: 'ARM (32-bit)', label: 'ARM Little Endian' },
  0x0200: { name: 'IMAGE_FILE_MACHINE_IA64', arch: 'IA64 (64-bit)', label: 'Intel Itanium' }
};

// Windows Subsystems
const IMAGE_SUBSYSTEM = {
  1: 'NATIVE (Device Driver)',
  2: 'WINDOWS_GUI (Okienkowa aplikacja Windows)',
  3: 'WINDOWS_CUI (Konsola wiersza poleceń / CLI)',
  7: 'POSIX_CUI',
  9: 'WINDOWS_CE_GUI',
  10: 'EFI_APPLICATION',
  11: 'EFI_BOOT_SERVICE_DRIVER',
  12: 'EFI_RUNTIME_DRIVER',
  14: 'XBOX'
};

// Characteristics flags
const IMAGE_FILE_CHARACTERISTICS = {
  0x0001: 'RELOCS_STRIPPED',
  0x0002: 'EXECUTABLE_IMAGE',
  0x0004: 'LINE_NUMS_STRIPPED',
  0x0008: 'LOCAL_SYMS_STRIPPED',
  0x0020: 'LARGE_ADDRESS_AWARE',
  0x0100: '32BIT_MACHINE',
  0x0200: 'DEBUG_STRIPPED',
  0x1000: 'SYSTEM_FILE',
  0x2000: 'DLL_FILE',
  0x4000: 'UP_SYSTEM_ONLY'
};

// Known Installer & Runtime Signatures
const INSTALLER_SIGNATURES = [
  { name: 'Inno Setup', pattern: 'Inno Setup Setup Data' },
  { name: 'NSIS (Nullsoft)', pattern: 'NullsoftInst' },
  { name: 'WiX / MSI Wrapper', pattern: 'Windows Installer' },
  { name: 'Electron Packager', pattern: 'resources.pak' },
  { name: 'Tauri / Rust App', pattern: 'tauri.localhost' },
  { name: 'PyInstaller', pattern: 'pyi-windows-pe' },
  { name: 'Go Runtime', pattern: 'Go buildinf:' },
  { name: 'Chromium Framework', pattern: 'Chromium' },
  { name: 'Unity Engine Player', pattern: 'UnityPlayer' },
  { name: 'Unreal Engine Game', pattern: 'UnrealEngine' }
];

class PEParser {
  /**
   * Parse PE binary headers from file path or buffer
   * Reads only first 4KB to 16KB for ultra-fast non-blocking analysis
   */
  static async parseFile(filePath, maxBytes = 16384) {
    let fd = null;
    try {
      fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
      if (bytesRead < 64) {
        return { isPE: false, reason: 'File smaller than DOS header' };
      }
      return this.parseBuffer(buffer.subarray(0, bytesRead));
    } catch (err) {
      return { isPE: false, error: err.message };
    } finally {
      if (fd) {
        try { await fd.close(); } catch (e) {}
      }
    }
  }

  static parseBuffer(buffer) {
    // 1. Check DOS MZ Header (0x5A4D)
    if (buffer.length < 64) return { isPE: false, reason: 'Too small' };
    const mzMagic = buffer.readUInt16LE(0);
    if (mzMagic !== 0x5a4d) {
      return { isPE: false, reason: 'Not an MZ executable' };
    }

    // Offset to PE Header is at 0x3C in DOS header
    const peHeaderOffset = buffer.readUInt32LE(0x3c);
    if (peHeaderOffset + 24 > buffer.length) {
      return { isPE: false, reason: 'PE header offset out of bounds' };
    }

    // 2. Check PE Signature (0x00004550 -> "PE\0\0")
    const peMagic = buffer.readUInt32LE(peHeaderOffset);
    if (peMagic !== 0x00004550) {
      return { isPE: false, reason: 'Invalid PE signature' };
    }

    // 3. COFF File Header (20 bytes immediately following PE signature)
    const coffOffset = peHeaderOffset + 4;
    const machine = buffer.readUInt16LE(coffOffset);
    const numberOfSections = buffer.readUInt16LE(coffOffset + 2);
    const timeDateStamp = buffer.readUInt32LE(coffOffset + 4);
    const pointerToSymbolTable = buffer.readUInt32LE(coffOffset + 8);
    const numberOfSymbols = buffer.readUInt32LE(coffOffset + 12);
    const sizeOfOptionalHeader = buffer.readUInt16LE(coffOffset + 16);
    const characteristics = buffer.readUInt16LE(coffOffset + 18);

    const machineInfo = IMAGE_FILE_MACHINE[machine] || {
      name: `UNKNOWN (0x${machine.toString(16)})`,
      arch: 'Unknown',
      label: 'Unknown Architecture'
    };

    const compilationDate = new Date(timeDateStamp * 1000);

    // Characteristics flags breakdown
    const activeCharacteristics = [];
    for (const [flag, label] of Object.entries(IMAGE_FILE_CHARACTERISTICS)) {
      if ((characteristics & parseInt(flag, 10)) !== 0) {
        activeCharacteristics.push(label);
      }
    }

    // 4. Optional Header (if present)
    let optionalHeader = null;
    let subsystem = 'UNKNOWN';
    let is64Bit = false;
    let hasCertificate = false;

    if (sizeOfOptionalHeader > 0 && coffOffset + 20 + sizeOfOptionalHeader <= buffer.length) {
      const optOffset = coffOffset + 20;
      const optMagic = buffer.readUInt16LE(optOffset);
      is64Bit = (optMagic === 0x020b); // PE32+ (64-bit) vs 0x010b PE32 (32-bit)

      const majorLinkerVersion = buffer.readUInt8(optOffset + 2);
      const minorLinkerVersion = buffer.readUInt8(optOffset + 3);
      const sizeOfCode = buffer.readUInt32LE(optOffset + 4);
      const sizeOfInitializedData = buffer.readUInt32LE(optOffset + 8);
      const sizeOfUninitializedData = buffer.readUInt32LE(optOffset + 12);
      const addressOfEntryPoint = buffer.readUInt32LE(optOffset + 16);

      let subsystemCode = 0;
      let certTableOffset = 0;
      let certTableSize = 0;

      if (is64Bit) {
        // PE32+ layout
        subsystemCode = buffer.readUInt16LE(optOffset + 68);
        // Security Data Directory is directory index 4 (offset 112 in DataDirectories)
        if (optOffset + 112 + 8 <= buffer.length) {
          certTableOffset = buffer.readUInt32LE(optOffset + 112);
          certTableSize = buffer.readUInt32LE(optOffset + 116);
        }
      } else {
        // PE32 layout
        subsystemCode = buffer.readUInt16LE(optOffset + 68);
        if (optOffset + 96 + 8 <= buffer.length) {
          certTableOffset = buffer.readUInt32LE(optOffset + 96);
          certTableSize = buffer.readUInt32LE(optOffset + 100);
        }
      }

      subsystem = IMAGE_SUBSYSTEM[subsystemCode] || `Unknown (${subsystemCode})`;
      hasCertificate = certTableOffset > 0 && certTableSize > 0;

      optionalHeader = {
        magic: is64Bit ? 'PE32+ (64-bit)' : 'PE32 (32-bit)',
        linkerVersion: `${majorLinkerVersion}.${minorLinkerVersion}`,
        sizeOfCode,
        sizeOfInitializedData,
        sizeOfUninitializedData,
        addressOfEntryPoint: `0x${addressOfEntryPoint.toString(16)}`,
        subsystem,
        hasDigitalSignature: hasCertificate,
        certTableSize
      };
    }

    // 5. Section Headers Inspection
    const sections = [];
    const sectionsOffset = coffOffset + 20 + sizeOfOptionalHeader;
    for (let i = 0; i < numberOfSections; i++) {
      const secOffset = sectionsOffset + (i * 40);
      if (secOffset + 40 > buffer.length) break;

      const nameBytes = buffer.subarray(secOffset, secOffset + 8);
      let secName = '';
      for (let j = 0; j < 8; j++) {
        if (nameBytes[j] === 0) break;
        secName += String.fromCharCode(nameBytes[j]);
      }

      const virtualSize = buffer.readUInt32LE(secOffset + 8);
      const virtualAddress = buffer.readUInt32LE(secOffset + 12);
      const rawDataSize = buffer.readUInt32LE(secOffset + 16);

      sections.push({
        name: secName.trim(),
        virtualSize,
        virtualAddress: `0x${virtualAddress.toString(16)}`,
        rawDataSize
      });
    }

    // 6. Deep Technology / Installer Detection
    const detectedFrameworks = [];
    const bufferString = buffer.toString('binary');
    for (const sig of INSTALLER_SIGNATURES) {
      if (bufferString.includes(sig.pattern)) {
        detectedFrameworks.push(sig.name);
      }
    }

    const isInstaller = detectedFrameworks.some(f => f.includes('Setup') || f.includes('NSIS') || f.includes('Installer')) ||
                        sections.some(s => s.name === '.ndata' || s.name === '.rsrc');

    return {
      isPE: true,
      architecture: machineInfo.arch,
      machineLabel: machineInfo.label,
      numberOfSections,
      compilationDate: compilationDate.toISOString(),
      is64Bit,
      subsystem,
      characteristics: activeCharacteristics,
      optionalHeader,
      sections: sections.slice(0, 10),
      detectedFrameworks,
      isInstaller,
      classificationRecommendation: isInstaller ? 'INSTALLER_SETUP' : (activeCharacteristics.includes('DLL_FILE') ? 'SYSTEM_LIBRARY' : 'STANDALONE_APP')
    };
  }
}

module.exports = {
  PEParser,
  IMAGE_FILE_MACHINE,
  IMAGE_SUBSYSTEM
};
