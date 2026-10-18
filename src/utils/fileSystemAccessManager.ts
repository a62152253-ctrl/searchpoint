/**
 * PROJECT NEXUS - Autonomous File Intelligence
 * File System Access API Manager & Local Workspace Bridge
 * Connects Chromium showDirectoryPicker / showOpenFilePicker with
 * memory-safe blob management and fallback to hardened Nexus Node.js backend.
 */

import { FileItem, CategoryType } from '../types';
import { nexusApi, nexusAuthFetch } from './nexusAuth';

// Global memory registry for active FileSystemFileHandles
export const fileHandleRegistry = new Map<string, any>();
export const activeDirectoryHandleRef: { current: any } = { current: null };

export const isFileSystemAccessSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

export const isOpenFilePickerSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
};

// Quick category detector for browser-scanned files
const detectCategoryFromExtension = (ext: string, name: string): { category: CategoryType; subCategory: string; tags: string[] } => {
  const e = ext.toLowerCase();
  const n = name.toLowerCase();

  const devExts = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'lock', 'py', 'rs', 'go', 'css', 'html', 'sql', 'md', 'env', 'yml', 'yaml', 'toml', 'cpp', 'c', 'cs', 'java', 'sh', 'bat', 'ps1']);
  const mediaExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'ogg']);
  const docExts = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv']);
  const archiveExts = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'iso']);
  const appExts = new Set(['exe', 'msi', 'apk', 'dmg', 'appimage']);

  const tags: string[] = [`#${e || 'file'}`];

  // 1. If it's source code or config, classify strictly as DEV - never as a game screenshot!
  if (devExts.has(e)) {
    tags.push('#code', '#dev', `#${e}`);
    return { category: 'DEV', subCategory: 'Kod Źródłowy', tags };
  }

  // 2. Archives & packages
  if (archiveExts.has(e)) {
    tags.push('#archive', '#paczka', `#${e}`);
    return { category: 'ARCHIVES', subCategory: 'Archiwa', tags };
  }

  // 3. Documents
  if (docExts.has(e)) {
    tags.push('#document', `#${e}`);
    return { category: 'DOCS', subCategory: 'Dokumenty', tags };
  }

  // 4. Executables & installers
  if (appExts.has(e)) {
    tags.push('#installer', '#app', `#${e}`);
    return { category: 'APPS', subCategory: 'Aplikacje', tags };
  }

  // 5. Media & Screenshots (Only images/videos can be game photos or screenshots!)
  if (mediaExts.has(e)) {
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(e);

    // CS:GO / CS2 screenshots - strictly images (mostly PNG as user specified)
    if (isImage && /(?:^|[_\-\s])(?:csgo|cs2|counter[_\-\s]?strike|de_(?:dust2|mirage|inferno|nuke|overpass|ancient|anubis|vertigo)|dust2|mirage|inferno|nuke|overpass|clutch|headshot)(?:[_\-\s]|$)/i.test(n)) {
      tags.push('#csgo', '#gaming', '#screenshot');
      return { category: 'SCREENSHOT', subCategory: 'Zrzuty z CS:GO', tags };
    }

    if (isImage && /fortnite|chapter|victory[_\-\s]?royale/i.test(n)) tags.push('#fortnite', '#gaming');
    if (isImage && /valorant/i.test(n)) tags.push('#valorant', '#gaming');
    if (isImage && /roblox/i.test(n)) tags.push('#roblox', '#gaming');
    if (isImage && /minecraft/i.test(n)) tags.push('#minecraft', '#gaming');

    if (/screenshot|snip|zrzut|prtscr/i.test(n)) {
      tags.push('#screenshot');
      return { category: 'SCREENSHOT', subCategory: 'Screenshots', tags };
    }

    tags.push('#media');
    return { category: 'MEDIA', subCategory: 'Grafika i Media', tags };
  }

  if (docExts.has(e)) {
    tags.push('#document');
    return { category: 'DOCS', subCategory: 'Dokumenty', tags };
  }

  if (archiveExts.has(e)) {
    tags.push('#archive', '#paczka');
    return { category: 'ARCHIVES', subCategory: 'Archiwa', tags };
  }

  if (appExts.has(e)) {
    tags.push('#installer', '#app');
    return { category: 'APPS', subCategory: 'Aplikacje', tags };
  }

  return { category: 'OTHER', subCategory: 'Inne', tags };
};

// Recursive directory crawler with depth limit & folder ignoring
export async function traverseDirectory(
  dirHandle: any,
  currentPath: string,
  results: FileItem[],
  maxDepth: number = 8,
  currentDepth: number = 0,
  onProgress?: (count: number, currentDir: string) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  if (abortSignal?.aborted) return;
  if (currentDepth > maxDepth || results.length >= 1000000) return;

  const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '.vscode', '.idea', 'target', 'vendor', '__pycache__',
    '$recycle.bin', 'system volume information', 'recovery', 'perflogs'
  ]);

  try {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      if (abortSignal?.aborted) return;
      const lowerName = name.toLowerCase();
      if (handle.kind === 'file') {
        try {
          const file = await handle.getFile();
          const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
          const fullVirtualPath = `${currentPath}/${name}`;
          const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
          const id = `fsa-${Date.now()}-${randomSuffix}`;

          const { category, subCategory, tags } = detectCategoryFromExtension(ext, name);

          let blobUrl: string | undefined = undefined;
          if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
            try {
              blobUrl = URL.createObjectURL(file);
            } catch (_) { }
          }

          const item: FileItem = {
            id,
            name,
            path: fullVirtualPath,
            dir: currentPath,
            extension: ext,
            size: file.size,
            mtime: file.lastModified,
            category,
            subCategory,
            isDisposable: /temp|cache|thumb|log/i.test(name),
            confidence: 0.98,
            tags,
            fileHandle: handle,
            blobUrl
          };

          fileHandleRegistry.set(id, handle);
          fileHandleRegistry.set(fullVirtualPath, handle);
          results.push(item);

          if (onProgress && results.length % 25 === 0) {
            onProgress(results.length, currentPath);
          }
        } catch (fileErr) {
          // Locked file or permission denial
        }
      } else if (handle.kind === 'directory') {
        if (!IGNORED_DIRS.has(lowerName) && !name.startsWith('.') && !name.startsWith('$')) {
          if (currentDepth <= 1 && (lowerName === 'windows' || lowerName === 'winnt' || lowerName === 'system32')) {
            continue;
          }
          await traverseDirectory(handle, `${currentPath}/${name}`, results, maxDepth, currentDepth + 1, onProgress, abortSignal);
        }
      }
    }
  } catch (dirErr) {
    console.error('[FSA] Błąd odczytu katalogu:', currentPath, dirErr);
  }
}

/**
 * 1. Wybierz folder przez File System Access API (showDirectoryPicker)
 * Przeglądarka Chromium wyświetla natywne okno wyboru folderu i pyta o zgodę na odczyt/zapis.
 */
export const pickDirectoryWithFSA = async (
  onProgress?: (count: number, currentDir: string) => void,
  abortSignal?: AbortSignal
): Promise<{
  success: boolean;
  dirName: string;
  items: FileItem[];
  dirHandle: any;
  error?: string;
}> => {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Twoja przeglądarka nie obsługuje File System Access API. Użyj Chrome, Edge lub Opery.');
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });

    activeDirectoryHandleRef.current = dirHandle;
    const items: FileItem[] = [];

    await traverseDirectory(dirHandle, dirHandle.name, items, 8, 0, onProgress, abortSignal);

    return {
      success: true,
      dirName: dirHandle.name,
      items,
      dirHandle
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, dirName: '', items: [], dirHandle: null, error: 'Anulowano wybór folderu.' };
    }
    return { success: false, dirName: '', items: [], dirHandle: null, error: err.message };
  }
};

/**
 * 2. Wybierz pliki przez File System Access API (showOpenFilePicker)
 * Pozwala wybrać pojedyncze lub wielokrotne pliki z dysku z natywnym dostępem.
 */
export const pickFilesWithFSA = async (): Promise<{
  success: boolean;
  items: FileItem[];
  error?: string;
}> => {
  if (!isOpenFilePickerSupported()) {
    throw new Error('Twoja przeglądarka nie obsługuje showOpenFilePicker.');
  }

  try {
    const fileHandles = await (window as any).showOpenFilePicker({
      multiple: true,
      excludeAcceptAllOption: false
    });

    const items: FileItem[] = [];

    for (const handle of fileHandles) {
      try {
        const file = await handle.getFile();
        const name = file.name;
        const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
        const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
        const id = `fsa-file-${Date.now()}-${randomSuffix}`;
        const { category, subCategory, tags } = detectCategoryFromExtension(ext, name);

        let blobUrl: string | undefined = undefined;
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
          try {
            blobUrl = URL.createObjectURL(file);
          } catch (_) { }
        }

        const item: FileItem = {
          id,
          name,
          path: `[FSA]/${name}`,
          dir: '[FSA]',
          extension: ext,
          size: file.size,
          mtime: file.lastModified,
          category,
          subCategory,
          isDisposable: false,
          confidence: 0.99,
          tags,
          fileHandle: handle,
          blobUrl
        };

        fileHandleRegistry.set(id, handle);
        fileHandleRegistry.set(item.path, handle);
        items.push(item);
      } catch (err) {
        console.warn('[FSA] Błąd pobierania pliku:', err);
      }
    }

    return {
      success: true,
      items
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, items: [], error: 'Anulowano wybór plików.' };
    }
    return { success: false, items: [], error: err.message };
  }
};

/**
 * 3. Zapisz plik bezpośrednio na dysku przez FileSystemWritableFileStream
 * Wykorzystuje natywne uprawnienia Chromium `createWritable()` z fallbackiem na Nexus API!
 */
export const saveFileWithFSA = async (
  item: FileItem,
  content: string | Blob,
  isBase64: boolean = false
): Promise<{ success: boolean; bytesWritten?: number; error?: string }> => {
  const handle = item.fileHandle || fileHandleRegistry.get(item.id) || fileHandleRegistry.get(item.path);

  if (!handle || typeof handle.createWritable !== 'function') {
    // Brak uchwytu FSA -> bezpieczny zapis przez uwierzytelniony Nexus API
    await nexusApi.post('/api/file/save', {
      path: item.path,
      content,
      isBase64,
      createBackup: true
    });
    return { success: true };
  }

  try {
    // 1. Sprawdź i poproś o uprawnienia readwrite jeśli potrzebne
    const permOpts = { mode: 'readwrite' };
    if (await handle.queryPermission(permOpts) !== 'granted') {
      const status = await handle.requestPermission(permOpts);
      if (status !== 'granted') {
        throw new Error('Odmówiono uprawnień do zapisu w oknie przeglądarki Chromium.');
      }
    }

    // 2. Utwórz natywny strumień zapisu
    const writable = await handle.createWritable();

    if (isBase64 && typeof content === 'string') {
      const resp = await fetch(content);
      const blob = await resp.blob();
      await writable.write(blob);
    } else {
      await writable.write(content);
    }

    await writable.close();

    // 3. Opcjonalna kopia zapasowa na serwerze jeśli ścieżka fizyczna istnieje
    if (item.path && !item.path.startsWith('[FSA]')) {
      nexusApi.post('/api/file/save', {
        path: item.path,
        content,
        isBase64,
        createBackup: true
      }).catch(() => { });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[FSA] Błąd natywnego zapisu do pliku:', err);
    throw err;
  }
};

/**
 * 4. Odczytaj treść pliku bezpośrednio z uchwytu FSA
 */
export const readFileWithFSA = async (
  item: FileItem
): Promise<{ content: string; size: number; mtime: number } | null> => {
  const handle = item.fileHandle || fileHandleRegistry.get(item.id) || fileHandleRegistry.get(item.path);

  if (!handle || typeof handle.getFile !== 'function') {
    return null;
  }

  try {
    const file = await handle.getFile();
    const text = await file.text();
    return {
      content: text,
      size: file.size,
      mtime: file.lastModified
    };
  } catch (err) {
    console.warn('[FSA] Błąd odczytu z uchwytu, przełączanie na API serwera:', err);
    return null;
  }
};

/**
 * 5. Zwolnij pamięć tymczasowych URL-i blob utworzonych podczas sesji FSA
 */
export const clearFsaRegistry = (items?: FileItem[]): void => {
  if (items) {
    for (const item of items) {
      if (item.blobUrl && item.blobUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch (_) {}
      }
    }
  }
  fileHandleRegistry.clear();
};

/**
 * 6. Obsługa przeciągania folderów (HTML5 Drag & Drop z webkitGetAsEntry)
 * Pozwala użytkownikowi upuścić folder z pulpitu Windows bezpośrednio na okno aplikacji.
 */
export const scanDroppedItems = async (
  dataTransferItems: DataTransferItemList,
  onProgress?: (count: number, currentDir: string) => void
): Promise<{ dirName: string; items: FileItem[] }> => {
  const results: FileItem[] = [];
  let rootDirName = 'Upuszczone Pliki';

  const readEntry = async (entry: any, currentPath: string): Promise<void> => {
    if (!entry) return;

    if (entry.isFile) {
      return new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
            const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
            const id = `drag-${Date.now()}-${randomSuffix}`;
            const { category, subCategory, tags } = detectCategoryFromExtension(ext, file.name);

            let blobUrl: string | undefined = undefined;
            if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
              try {
                blobUrl = URL.createObjectURL(file);
              } catch (_) {}
            }

            const item: FileItem = {
              id,
              name: file.name,
              path: `${currentPath}/${file.name}`,
              dir: currentPath,
              extension: ext,
              size: file.size,
              mtime: file.lastModified,
              category,
              subCategory,
              isDisposable: /temp|cache|thumb|log/i.test(file.name),
              confidence: 0.98,
              tags,
              blobUrl
            };

            results.push(item);
            if (onProgress && results.length % 25 === 0) {
              onProgress(results.length, currentPath);
            }
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      return new Promise<void>((resolve) => {
        const dirReader = entry.createReader();
        const readEntries = () => {
          dirReader.readEntries(async (entries: any[]) => {
            if (!entries || entries.length === 0) {
              resolve();
              return;
            }
            for (const subEntry of entries) {
              await readEntry(subEntry, `${currentPath}/${entry.name}`);
            }
            readEntries();
          }, () => resolve());
        };
        readEntries();
      });
    }
  };

  const entriesToRead: any[] = [];
  for (let i = 0; i < dataTransferItems.length; i++) {
    const item = dataTransferItems[i];
    if (item.kind === 'file') {
      const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
      if (entry) {
        entriesToRead.push(entry);
        if (entriesToRead.length === 1 && entry.isDirectory) {
          rootDirName = entry.name;
        }
      }
    }
  }

  for (const entry of entriesToRead) {
    await readEntry(entry, rootDirName);
  }

  return { dirName: rootDirName, items: results };
};
