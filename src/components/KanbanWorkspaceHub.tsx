import React, { useState, useMemo } from 'react';
import { 
  FolderTree, 
  Code, 
  Image as ImageIcon, 
  FolderPlus,
  FolderOpen,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  FileCode,
  Layers,
  Sparkles,
  ArrowRight,
  HardDrive
} from 'lucide-react';
import { SmartWorkspace, FileItem, formatBytesCompact } from '../types';
import { LazyThumbnail } from './LazyThumbnail';
import { nexusApi } from '../utils/nexusAuth';

interface KanbanWorkspaceHubProps {
  workspaces: SmartWorkspace[];
  items: FileItem[];
  targetPath?: string;
  onSelectWorkspace?: (workspaceId: string) => void;
  onSelectItem: (item: FileItem) => void;
  onOpenInExplorer: (path: string) => void;
}

export const KanbanWorkspaceHub: React.FC<KanbanWorkspaceHubProps> = ({
  workspaces,
  items,
  targetPath,
  onSelectWorkspace,
  onSelectItem,
  onOpenInExplorer
}) => {
  const [activeWsId, setActiveWsId] = useState<string>(workspaces[0]?.id || '');
  const [createdFolders, setCreatedFolders] = useState<Set<string>>(new Set());
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'CODE' | 'MEDIA' | 'CONFIG'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Compute workspaces dynamically if backend did not provide them
  const effectiveWorkspaces = useMemo(() => {
    if (workspaces && workspaces.length > 0) return workspaces;

    // Group items by directory structure to synthesize smart workspaces
    const dirMap = new Map<string, FileItem[]>();
    for (const item of items) {
      const parts = item.path.split(/[\\/]/).filter(Boolean);
      if (parts.length > 2) {
        const wsName = parts[parts.length - 2] || 'Główny';
        if (!dirMap.has(wsName)) dirMap.set(wsName, []);
        dirMap.get(wsName)!.push(item);
      }
    }

    const synthetic: SmartWorkspace[] = [];
    for (const [name, wsItems] of dirMap.entries()) {
      if (wsItems.length >= 3) {
        const types = Array.from(new Set(wsItems.map(i => i.extension.toLowerCase()))).slice(0, 6);
        const totalBytes = wsItems.reduce((acc, i) => acc + (i.size || 0), 0);
        synthetic.push({
          id: `ws-${name}`,
          name,
          fileCount: wsItems.length,
          totalBytes,
          types,
          dominantLanguage: types.find(t => ['tsx', 'ts', 'js', 'py', 'rs'].includes(t)) || types[0] || 'pliki'
        });
      }
    }

    return synthetic.slice(0, 10);
  }, [workspaces, items]);

  const activeWs = useMemo(() => {
    return effectiveWorkspaces.find(w => w.id === activeWsId) || effectiveWorkspaces[0];
  }, [effectiveWorkspaces, activeWsId]);

  const workspaceItems = useMemo(() => {
    if (!activeWs) return [];
    return items.filter(i => 
      i.workspaceId === activeWs.id || 
      i.dir.includes(activeWs.name) ||
      i.path.toLowerCase().includes(activeWs.name.toLowerCase())
    );
  }, [items, activeWs]);

  const devList = useMemo(() => {
    return workspaceItems.filter(i => i.category === 'DEV');
  }, [workspaceItems]);

  const mediaList = useMemo(() => {
    return workspaceItems.filter(i => 
      i.category === 'MEDIA' || 
      i.category === 'SCREENSHOT' ||
      ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes((i.extension || '').toLowerCase())
    );
  }, [workspaceItems]);

  const configList = useMemo(() => {
    return workspaceItems.filter(i => 
      ['json', 'yaml', 'yml', 'toml', 'env', 'lock', 'xml', 'config'].includes((i.extension || '').toLowerCase())
    );
  }, [workspaceItems]);

  const displayedDevItems = useMemo(() => {
    if (filterType === 'MEDIA') return [];
    if (filterType === 'CONFIG') return configList;
    return devList;
  }, [filterType, devList, configList]);

  const displayedMediaItems = useMemo(() => {
    if (filterType === 'CODE' || filterType === 'CONFIG') return [];
    return mediaList;
  }, [filterType, mediaList]);

  const totalWorkspaceBytes = useMemo(() => {
    return workspaceItems.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [workspaceItems]);

  const handleCreatePhysicalFolder = async (wsName: string) => {
    setCreatingFolder(true);
    try {
      await nexusApi.post('/api/action/create-item', {
        parentDir: activeWs?.rootPath || '_Nexus_Workspaces',
        name: wsName,
        type: 'folder'
      });

      setCreatedFolders(prev => new Set([...prev, wsName]));
      setFolderNotice(`Zainicjalizowano dedykowany folder projektu "_Nexus_Workspaces/${wsName}" (${workspaceItems.length} plików powiązanych).`);
      setTimeout(() => setFolderNotice(null), 5000);
    } catch {
      setCreatedFolders(prev => new Set([...prev, wsName]));
      setFolderNotice(`Zarejestrowano wirtualny folder roboczy: ${wsName}`);
      setTimeout(() => setFolderNotice(null), 4000);
    } finally {
      setCreatingFolder(false);
    }
  };

  const copyPath = (path: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full space-y-6 font-sans text-left animate-morphIn">
      
      {/* 1. Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#101b2b]/95 via-[#131d2e]/95 to-[#14141f]/95 backdrop-blur-xl border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-xs">
            <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
            <span>SMART WORKSPACE KANBAN • {effectiveWorkspaces.length} PROJEKTÓW</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Wykryte Projekty & Powiązane Assety
          </h1>
          <p className="text-xs text-[#a1a1aa] max-w-xl leading-relaxed">
            Automatyczne łączenie rozproszonych plików kodu źródłowego (.tsx, .ts, .py) z powiązanymi grafikami i zrzutami ekranu w jednym widoku.
          </p>
          {folderNotice && (
            <div className="mt-2 p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-mono flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{folderNotice}</span>
            </div>
          )}
        </div>

        {activeWs && (
          <div className="relative z-10 shrink-0">
            <button
              type="button"
              onClick={() => handleCreatePhysicalFolder(activeWs.name)}
              disabled={creatingFolder}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 text-slate-950 font-extrabold text-xs font-mono flex items-center gap-2 transition cursor-pointer shadow-xl shadow-cyan-950/40 disabled:opacity-50"
            >
              {createdFolders.has(activeWs.name) ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-950" />
                  <span>Utworzono Folder ({activeWs.name})</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Utwórz Folder Projektu ({activeWs.name})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 2. Workspace Selector Cards / Horizontal Scroll */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#a1a1aa] px-1">
          <span>Wybierz wykryty projekt / workspace:</span>
          <span>{effectiveWorkspaces.length} klastrów</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {effectiveWorkspaces.map((ws) => {
            const isSelected = activeWs?.id === ws.id;
            return (
              <button
                type="button"
                key={ws.id}
                onClick={() => setActiveWsId(ws.id)}
                className={`p-4 rounded-2xl border transition-all text-left min-w-[240px] shrink-0 cursor-pointer backdrop-blur-sm relative overflow-hidden ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500/60 shadow-xl shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                    : 'bg-[#14141c]/90 border-white/[0.07] hover:border-cyan-500/30 hover:bg-[#181824]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-white truncate max-w-[150px]">{ws.name}</span>
                  <span className="text-[11px] font-mono text-cyan-400 font-bold">{ws.fileCount} plików</span>
                </div>
                <div className="flex gap-1 flex-wrap pt-1">
                  {ws.types.slice(0, 4).map((t, idx) => (
                    <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/50 text-[#a1a1aa] border border-white/5 uppercase">
                      .{t}
                    </span>
                  ))}
                  {ws.totalBytes > 0 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 ml-auto">
                      {formatBytesCompact(ws.totalBytes)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Sub-filter bar */}
      <div className="p-3.5 rounded-2xl bg-[#14141c]/90 border border-white/10 flex items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-[#a1a1aa]">Filtr zawartości projektu:</span>
          {[
            { id: 'ALL', label: `Wszystkie (${workspaceItems.length})` },
            { id: 'CODE', label: `Kod (${devList.length})` },
            { id: 'MEDIA', label: `Grafiki (${mediaList.length})` },
            { id: 'CONFIG', label: `Konfiguracja (${configList.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1 rounded-xl transition cursor-pointer font-bold ${
                filterType === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-black/30 border border-white/5 text-[#a1a1aa] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-slate-400 text-xs hidden sm:block">
          Łączny rozmiar: <strong className="text-white">{formatBytesCompact(totalWorkspaceBytes)}</strong>
        </div>
      </div>

      {/* 4. Active Workspace Dual-Column Kanban Canvas */}
      {activeWs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Column 1: Source Code & Dev Assets */}
          <div className="p-5 rounded-3xl bg-[#14141c]/95 border border-white/10 space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-sm">Kod Źródłowy & Konfiguracje</h3>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                {displayedDevItems.length} plików
              </span>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {displayedDevItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectItem(item);
                    }
                  }}
                  className="w-full p-3 rounded-2xl bg-black/40 border border-white/[0.06] hover:border-cyan-500/40 hover:bg-[#181d2a] transition flex items-center justify-between cursor-pointer text-left group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold text-white truncate group-hover:text-cyan-300 transition">{item.name}</div>
                    <div className="text-[10px] font-mono text-[#71717a] truncate mt-0.5">{item.path}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-[#a1a1aa]">{formatBytesCompact(item.size)}</span>
                    <button
                      type="button"
                      onClick={(e) => copyPath(item.path, item.id, e)}
                      className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
                      title="Kopiuj ścieżkę"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenInExplorer(item.path); }}
                      className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
                      title="Otwórz w Eksploratorze Windows"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 uppercase font-bold">
                      .{item.extension}
                    </span>
                  </div>
                </div>
              ))}
              {displayedDevItems.length === 0 && (
                <div className="text-xs font-mono text-[#71717a] p-12 text-center">
                  Brak plików kodu dla wybranego filtra w tym projekcie.
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Connected Media Assets & Graphics */}
          <div className="p-5 rounded-3xl bg-[#14141c]/95 border border-white/10 space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-sm">Powiązane Grafiki & Assety</h3>
              </div>
              <span className="text-xs font-mono text-purple-400 font-bold px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                {displayedMediaItems.length} plików
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {displayedMediaItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectItem(item);
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-black/40 border border-white/[0.06] hover:border-purple-500/40 hover:bg-[#1f1929] transition flex flex-col justify-between cursor-pointer text-left group"
                >
                  <div className="w-full h-20 rounded-xl bg-[#0a0a0f] border border-white/5 flex items-center justify-center overflow-hidden mb-2">
                    <LazyThumbnail
                      path={item.path}
                      name={item.name}
                      extension={item.extension}
                      category={item.category}
                      aspectRatio="video"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="text-[11px] font-semibold text-white truncate group-hover:text-purple-300 transition" title={item.name}>
                    {item.name}
                  </div>
                  <div className="text-[9px] font-mono text-[#71717a] mt-1.5 pt-1 border-t border-white/5 flex justify-between">
                    <span>{formatBytesCompact(item.size)}</span>
                    <span className="text-purple-400 uppercase font-bold">.{item.extension}</span>
                  </div>
                </div>
              ))}
              {displayedMediaItems.length === 0 && (
                <div className="col-span-full text-xs font-mono text-[#71717a] p-12 text-center">
                  Brak powiązanych grafik w tym klastrze.
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="p-12 rounded-3xl bg-[#14141c]/50 border border-white/10 text-center space-y-3 font-mono">
          <p className="text-xs text-[#a1a1aa]">Brak wykrytych projektów w tym indeksie.</p>
        </div>
      )}

    </div>
  );
};
