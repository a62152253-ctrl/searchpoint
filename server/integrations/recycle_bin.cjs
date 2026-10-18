/**
 * PROJECT NEXUS - Windows Shell Recycle Bin Integration
 * Safely moves files/folders to Windows Recycle Bin instead of permanent deletion.
 */
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

class WindowsRecycleBin {
  /**
   * Move a file or directory to the Windows Recycle Bin without a destructive fallback.
   */
  static moveToRecycleBin(targetPath) {
    return new Promise((resolve) => {
      const resolved = path.resolve(String(targetPath));
      if (!fs.existsSync(resolved)) {
        return resolve({ success: false, error: 'Path does not exist' });
      }

      if (process.platform === 'win32') {
        const isDir = fs.statSync(resolved).isDirectory();
        const method = isDir ? 'DeleteDirectory' : 'DeleteFile';
        const script = `$targetPath = $env:NEXUS_RECYCLE_TARGET; Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}($targetPath, 'OnlyErrorDialogs', 'SendToRecycleBin')`;
        const childEnv = { ...process.env, NEXUS_RECYCLE_TARGET: resolved };
        delete childEnv.NEXUS_MASTER_SECRET;

        const powershellPath = process.env.SystemRoot 
          ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
          : 'powershell.exe';

        execFile(powershellPath, ['-NoProfile', '-NonInteractive', '-Command', script], {
          env: childEnv,
          windowsHide: true
        }, (err) => {
          if (!err && !fs.existsSync(resolved)) {
            return resolve({ success: true, method: 'recycle_bin', path: resolved });
          }
          resolve({ success: false, error: err?.message || 'Nie udało się przenieść elementu do Kosza systemowego.' });
        });
      } else {
        resolve({ success: false, error: 'Kosz systemowy jest obsługiwany wyłącznie w Windows; plik nie został usunięty.' });
      }
    });
  }
}

module.exports = { WindowsRecycleBin };
