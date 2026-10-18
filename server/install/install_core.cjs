const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const installDir = path.join(localAppData, 'ProjectNexus');

// Find project root
let projectDir = path.resolve(__dirname, '..', '..');
if (!fs.existsSync(path.join(projectDir, 'server', 'server.cjs'))) {
  const candidate = path.join(process.env.USERPROFILE, 'Downloads', 'dsa');
  if (fs.existsSync(path.join(candidate, 'server', 'server.cjs'))) {
    projectDir = candidate;
  }
}

console.log('[*] Folder zrodlowy projektu:', projectDir);
console.log('[*] Folder docelowy instalacji:', installDir);

if (!fs.existsSync(installDir)) {
  fs.mkdirSync(installDir, { recursive: true });
}

// 1. Copy Key Root Files
const filesToCopy = [
  'nexus-launcher.exe',
  'icon.ico',
  'START_APP.bat',
  'nexus_installer.bat',
  'INSTALL_APP.bat',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json'
];

for (const file of filesToCopy) {
  const src = path.join(projectDir, file);
  const dst = path.join(installDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[+] Skopiowano: ${file}`);
  }
}

// 2. Copy Directories (server, dist, public)
const dirsToCopy = ['server', 'dist', 'public'];
for (const dir of dirsToCopy) {
  const srcDir = path.join(projectDir, dir);
  const dstDir = path.join(installDir, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, dstDir, { recursive: true, force: true });
    console.log(`[+] Zsynchronizowano katalog: ${dir}`);
  }
}

// 3. Create Desktop & Start Menu Shortcuts pointing directly to native launcher (No CMD, No VBS)
const desktopLnk = path.join(process.env.USERPROFILE, 'Desktop', 'Project Nexus.lnk');
const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const startMenuLnk = path.join(startMenuDir, 'Project Nexus.lnk');
const launcherPath = path.join(installDir, 'nexus-launcher.exe');
const iconPath = path.join(installDir, 'icon.ico');

const vbsShortcutScript = path.join(installDir, `create_nexus_shortcut_${Date.now()}.vbs`);
const scriptContent = `
Set oWS = CreateObject("WScript.Shell")

sLinkFile = "${desktopLnk.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${launcherPath.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${installDir.replace(/\\/g, '\\\\')}"
oLink.Description = "Project Nexus - Autonomiczny Eksplorator Plikow i Lokalne AI"
oLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')},0"
oLink.Save

sStartMenu = "${startMenuLnk.replace(/\\/g, '\\\\')}"
Set oStartLink = oWS.CreateShortcut(sStartMenu)
oStartLink.TargetPath = "${launcherPath.replace(/\\/g, '\\\\')}"
oStartLink.WorkingDirectory = "${installDir.replace(/\\/g, '\\\\')}"
oStartLink.Description = "Project Nexus - Autonomiczny Eksplorator Plikow i Lokalne AI"
oStartLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')},0"
oStartLink.Save
`;

fs.writeFileSync(vbsShortcutScript, scriptContent, 'utf8');
try {
  execSync(`cscript //nologo "${vbsShortcutScript}"`);
  console.log('[+] Utworzono skrot na Pulpicie: Project Nexus.lnk');
  console.log('[+] Utworzono skrot w Menu Start: Project Nexus.lnk');
} catch (e) {
  console.error('[!] Blad tworzenia skrotu:', e.message);
} finally {
  try { fs.unlinkSync(vbsShortcutScript); } catch (_) {}
}

console.log('[*] Instalacja ukonczona pomyslnie.');
