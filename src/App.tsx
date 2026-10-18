import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectView } from './components/ConnectView';
import { AnalyzingView } from './components/AnalyzingView';
import { NexusDashboardHub } from './components/NexusDashboardHub';
import { NexusDashboardFreePlan } from './components/NexusDashboardFreePlan';
import { NexusFolderWorkspaceView } from './components/NexusFolderWorkspaceView';
import { NexusExplorerView } from './components/NexusExplorerView';
import { ContextGuidedSearchModal } from './components/ContextGuidedSearchModal';
import { QuickLookModal } from './components/QuickLookModal';
import { AutonomousPlannerModal } from './components/AutonomousPlannerModal';
import { NexusProModal } from './components/NexusProModal';
import { NexusSaaSWebsite } from './components/NexusSaaSWebsite';
import { MediaGalleryView } from './components/MediaGalleryView';
import { TriageCommander } from './components/TriageCommander';
import { KanbanWorkspaceHub } from './components/KanbanWorkspaceHub';
import { AppShelfView } from './components/AppShelfView';
import { ToastContainer, ToastMessage } from './components/ToastNotification';
import { nexusAuth, nexusApi, AuthUser } from './utils/nexusAuth';
import { 
  ArrowLeft, 
  Search, 
  Layers,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
  Code,
  FileBox,
  Crown,
  FolderOpen,
  Sparkles
} from 'lucide-react';
import { 
  FileItem, 
  ScanProgress, 
  SmartWorkspace, 
  SystemInfo, 
  AutonomousBlueprint, 
  ExplorerSubView, 
  LicenseStatus,
  LimitExceededPayload
} from './types';

export default function App() {
  const [stage, setStage] = useState<'WEBSITE' | 'CONNECT' | 'ANALYZING' | 'EXPLORER'>('WEBSITE');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => nexusAuth.getCachedUser());
  const [authChecked, setAuthChecked] = useState(false);
  const [subView, setSubView] = useState<ExplorerSubView>('DASHBOARD');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [targetPath, setTargetPath] = useState<string>(() => {
    try {
      return localStorage.getItem('nexus_target_path') || '';
    } catch {
      return '';
    }
  });
  
  const [items, setItems] = useState<FileItem[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [workspaces, setWorkspaces] = useState<SmartWorkspace[]>([]);
  const [blueprint, setBlueprint] = useState<AutonomousBlueprint | null>(null);
  const [activeFolderWorkspace, setActiveFolderWorkspace] = useState<string | null>(null);
  const [isGuidedSearchOpen, setIsGuidedSearchOpen] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [limitExceededNotice, setLimitExceededNotice] = useState<LimitExceededPayload | null>(null);
  const [isProLicensed, setIsProLicensed] = useState<boolean>(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [quickLookItem, setQuickLookItem] = useState<FileItem | null>(null);
  const [shieldReport, setShieldReport] = useState<{
    totalLoaded: number;
    rejectedNsfw: number;
    rejectedMalware: number;
  } | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  // Global Toasts system
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
    const id = `toast-${Date.now()}-${randomSuffix}`;
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshLicenseStatus = useCallback(async () => {
    try {
      const res = await nexusApi.get<any>('/api/license/status');
      if (res && res.success !== false) {
        setIsProLicensed(Boolean(res.isPro));
        setLicenseStatus(res);
      }
    } catch (e) {
      console.warn('[Nexus] Nie udało się odpytać /api/license/status:', e);
    }
  }, []);

  const wsRef = useRef<WebSocket | null>(null);

  // 1. Verify the existing session before opening protected local APIs.
  useEffect(() => {
    let active = true;
    nexusAuth.checkAuth().then(user => {
      if (active) setCurrentUser(user);
    }).catch((err) => {
      console.error('[Nexus] Błąd weryfikacji sesji:', err);
      if (active) {
        setAppError('Nie udało się zweryfikować sesji. Sprawdź połączenie z lokalnym serwerem.');
        addToast({
          type: 'error',
          title: 'Sesja Użytkownika',
          description: 'Brak autoryzacji sesji. Zaloguj się ponownie.'
        });
      }
    }).finally(() => {
      if (active) setAuthChecked(true);
    });
    return () => {
      active = false;
    };
  }, [addToast]);

  // 2. Load machine and index data only after session validation.
  useEffect(() => {
    if (!authChecked || !currentUser) return;
    const controller = new AbortController();

    nexusApi.get<SystemInfo>('/api/system-info', { signal: controller.signal })
      .then((data: SystemInfo) => {
        setSystemInfo(data);
        setTargetPath(prev => {
          if (prev && prev.trim() !== '') return prev;
          const defaultPath = data.defaultTargets?.[0]?.path || data.homeDir || '';
          if (defaultPath) {
            try {
              localStorage.setItem('nexus_target_path', defaultPath);
            } catch {}
          }
          return defaultPath;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[Nexus] Błąd pobierania /api/system-info:', err);
      });

    nexusApi.get<{ items?: FileItem[]; activePath?: string }>('/api/cache/items', { signal: controller.signal })
      .then(data => {
        if (data.items && data.items.length > 0) {
          setItems(data.items);
          if (data.activePath) {
            setTargetPath(data.activePath);
            try {
              localStorage.setItem('nexus_target_path', data.activePath);
            } catch {}
          }
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[Nexus] Błąd pobierania indeksu:', err);
        setAppError('Nie udało się pobrać lokalnego indeksu plików.');
      });

    return () => controller.abort();
  }, [authChecked, currentUser]);

  // 3. Setup authenticated WebSocket live streaming bridge with auto-reconnection
  useEffect(() => {
    if (!currentUser) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = nexusAuth.getToken();
        const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log('[NEXUS WS] Połączono z autonomicznym silnikiem plików');
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'scan:batch') {
              setItems(prev => [...prev, ...msg.items]);
            } else if (msg.type === 'scan:progress') {
              setProgress(msg.progress);
            } else if (msg.type === 'scan:complete') {
              if (msg.stats?.workspaces) {
                setWorkspaces(msg.stats.workspaces);
              }
              if (msg.blueprint || msg.stats?.autonomousBlueprint) {
                setBlueprint(msg.blueprint || msg.stats?.autonomousBlueprint);
              }
              if (msg.shieldReport) {
                setShieldReport(msg.shieldReport);
              }
              addToast({
                type: 'success',
                title: 'Skanowanie zakończone',
                description: `Zaindeksowano pomyślnie ${msg.stats?.totalFiles ?? 'wszystkie'} plików.`
              });
              setTimeout(() => {
                setStage('EXPLORER');
              }, 600);
            } else if (msg.type === 'scan:limit_exceeded') {
              console.warn('[NEXUS WS] Przekroczono limit planu:', msg.payload);
              const limitPayload = msg.payload || {
                code: 'LIMIT_EXCEEDED',
                plan: isProLicensed ? 'PRO' : 'FREE',
                message: isProLicensed
                  ? 'Operacja przekracza maksymalny limit techniczny planu Pro (5000 GB / 5 TB). Skanowanie zostało zatrzymane, aby chronić zasoby systemu.'
                  : 'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.'
              };
              setLimitExceededNotice(limitPayload);
              setIsLimitModalOpen(true);
              setStage('CONNECT');
            } else if (msg.type === 'scan:error') {
              console.warn('[NEXUS WS] Błąd skanowania katalogu:', msg.error);
              setAppError(msg.error || 'Skanowanie zakończyło się błędem.');
              addToast({
                type: 'error',
                title: 'Błąd skanowania',
                description: msg.error || 'Nie udało się ukończyć skanowania wskazanego katalogu.'
              });
              setStage('CONNECT');
            } else if (msg.type === 'scan:stopped') {
              setProgress(null);
              addToast({
                type: 'info',
                title: 'Skanowanie zatrzymane',
                description: 'Przerwano proces indeksowania na żądanie użytkownika.'
              });
            } else if (msg.type === 'live:new_file') {
              setItems(prev => [msg.item, ...prev.filter(f => f.path !== msg.item.path)]);
            } else if (msg.type === 'action:item_created') {
              setItems(prev => [msg.item, ...prev.filter(f => f.path !== msg.item.path)]);
            } else if (msg.type === 'action:item_deleted') {
              setItems(prev => prev.filter(f => f.path !== msg.path));
            } else if (msg.type === 'cache_state') {
              if (msg.blueprint || msg.stats?.autonomousBlueprint) {
                setBlueprint(msg.blueprint || msg.stats?.autonomousBlueprint);
              }
            }
          } catch (e) {
            console.error('[NEXUS WS] Błąd przetwarzania komunikatu:', e);
          }
        };

        socket.onclose = () => {
          if (isMounted) {
            reconnectTimer = setTimeout(connectWebSocket, 2500);
          }
        };

        socket.onerror = () => {
          try { socket?.close(); } catch {}
        };
      } catch (err) {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [currentUser, addToast]);

  // Global Keyboard Navigation (Esc to close modals, Ctrl+K / Cmd+K for Search, Ctrl+1..6 for subviews)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (stage === 'EXPLORER') {
            setIsGuidedSearchOpen(prev => !prev);
          }
        } else if (stage === 'EXPLORER') {
          if (e.key === '1') { e.preventDefault(); setSubView('DASHBOARD'); }
          else if (e.key === '2') { e.preventDefault(); setSubView('TOPICS'); }
          else if (e.key === '3') { e.preventDefault(); setSubView('GALLERY'); }
          else if (e.key === '4') { e.preventDefault(); setSubView('TRIAGE'); }
          else if (e.key === '5') { e.preventDefault(); setSubView('KANBAN'); }
          else if (e.key === '6') { e.preventDefault(); setSubView('APPS'); }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stage]);

  // Initial and reactive license status sync
  useEffect(() => {
    if (currentUser) {
      refreshLicenseStatus();
    }
  }, [currentUser, refreshLicenseStatus]);

  // Actions
  const handleStartScan = async (path: string | string[], ingestionMode: string = 'ALL') => {
    const displayPath = Array.isArray(path) ? path.join(' + ') : path;
    setTargetPath(displayPath);
    if (typeof path === 'string') {
      try {
        localStorage.setItem('nexus_target_path', path);
        localStorage.setItem('nexus_access_granted', 'true');
      } catch {}
    }
    setItems([]);
    setProgress(null);
    setBlueprint(null);
    setActiveFolderWorkspace(null);
    setSubView('DASHBOARD');
    setStage('ANALYZING');
    setAppError(null);

    try {
      await nexusApi.post('/api/scan', { path, ingestionMode });
    } catch (err: any) {
      console.error('[Nexus] Błąd żądania /api/scan:', err);
      const isLimit = err?.payload?.code === 'PRO_LIMIT_EXCEEDED' ||
        err?.payload?.code === 'LIMIT_EXCEEDED' ||
        (err?.status === 403 && (err?.message?.includes('Nie masz planu Pro') || err?.payload?.error?.includes('Nie masz planu Pro')));

      if (isLimit) {
        setLimitExceededNotice({
          code: err?.payload?.code || 'PRO_LIMIT_EXCEEDED',
          plan: 'FREE',
          message: err?.payload?.message || err?.payload?.error || 'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.'
        });
        setIsLimitModalOpen(true);
        setStage('CONNECT');
        return;
      }

      setAppError(err.message || 'Nie udało się rozpocząć skanowania.');
      addToast({
        type: 'error',
        title: 'Błąd startu skanowania',
        description: err.message
      });
      setStage('CONNECT');
    }
  };

  const handleStartBenchmark = async (count: number) => {
    setTargetPath(`TEST WYDAJNOŚCI (${count.toLocaleString('pl-PL')} PLIKÓW)`);
    setItems([]);
    setProgress(null);
    setBlueprint(null);
    setActiveFolderWorkspace(null);
    setSubView('DASHBOARD');
    setStage('ANALYZING');
    setAppError(null);

    try {
      await nexusApi.post('/api/benchmark-scale', { count });
    } catch (err: any) {
      console.error('[Nexus] Błąd uruchomienia benchmarku:', err);
      const isLimit = err?.payload?.code === 'PRO_LIMIT_EXCEEDED' || err?.payload?.code === 'LIMIT_EXCEEDED';
      if (isLimit) {
        setLimitExceededNotice({
          code: err?.payload?.code || 'PRO_LIMIT_EXCEEDED',
          plan: 'FREE',
          message: err?.payload?.message || err?.payload?.error || 'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.'
        });
        setIsLimitModalOpen(true);
        setStage('CONNECT');
        return;
      }

      setAppError(err.message || 'Nie udało się rozpocząć testu wydajności.');
      addToast({
        type: 'error',
        title: 'Błąd benchmarku',
        description: err.message
      });
      setStage('CONNECT');
    }
  };

  const handleStopScan = async () => {
    try {
      await nexusApi.post('/api/scan/stop');
      setStage(items.length > 0 ? 'EXPLORER' : 'CONNECT');
    } catch (err: any) {
      console.error('[Nexus] Błąd zatrzymywania skanowania:', err);
      setAppError(err.message || 'Nie udało się zatrzymać skanowania.');
      addToast({
        type: 'warning',
        title: 'Zatrzymanie skanowania',
        description: err.message
      });
    }
  };

  const handleExecutePlan = async (planId: string, isDryRun: boolean) => {
    try {
      const res = await nexusApi.post<any>('/api/planner/execute', { planId, isDryRun });
      if (!isDryRun) {
        addToast({
          type: 'success',
          title: 'Plan wykonany',
          description: `Zorganizowano pomyślnie pliki zgodnie z blueprintem ${planId}.`
        });
      }
      return res;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Błąd wykonania planu',
        description: err.message
      });
      throw err;
    }
  };

  const handleOpenInExplorer = async (filePath: string) => {
    try {
      await nexusApi.post('/api/action/open-in-explorer', { path: filePath });
    } catch (err: any) {
      console.error('[Nexus] Błąd otwierania lokalizacji:', err);
      setAppError(err.message || 'Nie udało się otworzyć lokalizacji pliku.');
      addToast({
        type: 'error',
        title: 'Błąd Eksploratora Windows',
        description: 'Nie udało się otworzyć katalogu pliku na dysku.'
      });
    }
  };

  const handleOpenDefault = async (filePath: string) => {
    try {
      await nexusApi.post('/api/action/open-default', { path: filePath });
    } catch (err: any) {
      console.error('[Nexus] Błąd otwierania pliku:', err);
      setAppError(err.message || 'Nie udało się otworzyć pliku.');
      addToast({
        type: 'error',
        title: 'Błąd uruchomienia pliku',
        description: 'Domyślna aplikacja systemowa zgłosiła problem.'
      });
    }
  };

  const handleFsaLoaded = (dirName: string, fsaItems: FileItem[]) => {
    setTargetPath(dirName);
    setItems(fsaItems);
    setProgress(null);
    setBlueprint(null);
    setActiveFolderWorkspace(null);
    setSubView('DASHBOARD');
    setStage('EXPLORER');
    addToast({
      type: 'success',
      title: 'Folder załadowany (FSA)',
      description: `Wczytano ${fsaItems.length.toLocaleString('pl-PL')} plików z uprawnieniami przeglądarki.`
    });
  };

  const handleExecuteTriage = async (itemIds: string[], action: 'ARCHIVE' | 'PURGE') => {
    try {
      for (const id of itemIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;

        if (action === 'PURGE') {
          await nexusApi.post('/api/action/instant-delete', { path: item.path });
          setItems(prev => prev.filter(file => file.path !== item.path));
        } else {
          const targetDir = `${targetPath}\\Organized_Workspace\\Zrzuty_Archiwum`;
          const result = await nexusApi.post<{ item: FileItem }>('/api/action/quick-move', {
            sourcePath: item.path,
            targetDir
          });
          setItems(prev => [result.item, ...prev.filter(file => file.path !== item.path && file.path !== result.item.path)]);
        }
      }

      addToast({
        type: 'success',
        title: 'Triage wykonany',
        description: action === 'PURGE' 
          ? `Usunięto ${itemIds.length} plików.` 
          : `Przeniesiono ${itemIds.length} plików do archiwum zrzutów.`
      });
    } catch (err: any) {
      console.error('[Nexus] Błąd wykonywania triage:', err);
      setAppError(err.message || 'Nie udało się wykonać operacji triage.');
      addToast({
        type: 'error',
        title: 'Błąd operacji Triage',
        description: err.message
      });
    }
  };

  const handleDeduplicateInstallers = async (redundantIds: string[]) => {
    try {
      for (const id of redundantIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;
        await nexusApi.post('/api/action/instant-delete', { path: item.path });
        setItems(prev => prev.filter(file => file.path !== item.path));
      }
      addToast({
        type: 'success',
        title: 'Deduplikacja zakończona',
        description: `Usunięto ${redundantIds.length} nadmiarowych kopii instalatorów.`
      });
    } catch (err: any) {
      console.error('[Nexus] Błąd usuwania duplikatów instalatorów:', err);
      setAppError(err.message || 'Nie udało się usunąć duplikatów instalatorów.');
      addToast({
        type: 'error',
        title: 'Błąd deduplikacji',
        description: err.message
      });
    }
  };

  // Strict Authentication Gate: User cannot access the app without an authenticated account!
  useEffect(() => {
    if (!currentUser && stage !== 'WEBSITE') {
      setStage('WEBSITE');
    }
  }, [currentUser, stage]);

  const handleEnterApp = () => {
    if (!currentUser) {
      setStage('WEBSITE');
      return;
    }
    if (items && items.length > 0) {
      setStage('EXPLORER');
    } else {
      setStage('CONNECT');
    }
  };

  const handleUserChange = (user: AuthUser | null) => {
    setCurrentUser(user);
    if (!user) {
      setStage('WEBSITE');
      addToast({
        type: 'info',
        title: 'Wylogowano',
        description: 'Sesja użytkownika została pomyślnie zakończona.'
      });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#121212] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Top Banner Error Notification */}
      {appError && (
        <aside 
          className="fixed top-4 left-1/2 z-[100] flex w-[min(92vw,48rem)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl border border-rose-500/40 bg-[#1e1216]/95 backdrop-blur-xl px-4 py-3 text-xs font-mono text-rose-100 shadow-2xl animate-fadeIn" 
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{appError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAppError(null)}
            className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/30 transition cursor-pointer"
            aria-label="Zamknij komunikat błędu"
          >
            Zamknij
          </button>
        </aside>
      )}

      {/* Global Toast Pipeline */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {stage === 'WEBSITE' && (
        <NexusSaaSWebsite
          onEnterApp={handleEnterApp}
          currentUser={currentUser}
          onUserChange={handleUserChange}
          onOpenProModal={() => setIsProModalOpen(true)}
        />
      )}

      {stage === 'CONNECT' && currentUser && (
        <ConnectView
          systemInfo={systemInfo}
          initialPath={targetPath}
          onStartScan={handleStartScan}
          onStartBenchmark={handleStartBenchmark}
          onFsaLoaded={handleFsaLoaded}
          onGoToWebsite={() => setStage('WEBSITE')}
          isProLicensed={isProLicensed}
          onOpenProModal={() => setIsProModalOpen(true)}
        />
      )}

      {stage === 'ANALYZING' && currentUser && (
        <AnalyzingView
          targetPath={targetPath}
          progress={progress}
          recentItems={items}
          onCompleteTransition={() => setStage('EXPLORER')}
          onStop={handleStopScan}
        />
      )}

      {stage === 'EXPLORER' && currentUser && (
        <>
          {activeFolderWorkspace ? (
            /* VIEW 2: Inside Folder Workspace + Code Mode + Pure ZIP Engine */
            <NexusFolderWorkspaceView
              workspaceId={activeFolderWorkspace}
              items={items}
              targetPath={targetPath}
              onBackToHub={() => setActiveFolderWorkspace(null)}
              onOpenInExplorer={handleOpenInExplorer}
              onOpenGuidedSearch={() => setIsGuidedSearchOpen(true)}
              onItemCreated={(item) => setItems(prev => [item, ...prev.filter(f => f.path !== item.path)])}
              onItemDeleted={(path) => setItems(prev => prev.filter(f => f.path !== path))}
            />
          ) : subView === 'DASHBOARD' ? (
            /* VIEW 1: Active Dashboard Smart Hub (PRO vs FREE) */
            isProLicensed ? (
              <NexusDashboardHub
                items={items}
                targetPath={targetPath}
                blueprint={blueprint}
                isProLicensed={isProLicensed}
                onOpenProModal={() => setIsProModalOpen(true)}
                onOpenWorkspace={(wsId) => setActiveFolderWorkspace(wsId)}
                onOpenInExplorer={handleOpenInExplorer}
                onOpenGuidedSearch={() => setIsGuidedSearchOpen(true)}
                onExecutePlan={handleExecutePlan}
                shieldReport={shieldReport}
                onItemCreated={(item) => setItems(prev => [item, ...prev.filter(f => f.path !== item.path)])}
                onItemDeleted={(path) => setItems(prev => prev.filter(f => f.path !== path))}
                onChangeTargetFolder={() => setStage('CONNECT')}
                onFsaLoaded={handleFsaLoaded}
                onNavigateToView={(view) => setSubView(view)}
                onGoToWebsite={() => setStage('WEBSITE')}
              />
            ) : (
              <NexusDashboardFreePlan
                items={items}
                targetPath={targetPath}
                blueprint={blueprint}
                isProLicensed={false}
                onOpenProModal={() => setIsProModalOpen(true)}
                onOpenWorkspace={(wsId) => setActiveFolderWorkspace(wsId)}
                onOpenInExplorer={handleOpenInExplorer}
                onOpenGuidedSearch={() => setIsGuidedSearchOpen(true)}
                onExecutePlan={handleExecutePlan}
                shieldReport={shieldReport}
                onItemCreated={(item) => setItems(prev => [item, ...prev.filter(f => f.path !== item.path)])}
                onItemDeleted={(path) => setItems(prev => prev.filter(f => f.path !== path))}
                onChangeTargetFolder={() => setStage('CONNECT')}
                onFsaLoaded={handleFsaLoaded}
                onNavigateToView={(view) => setSubView(view)}
                onGoToWebsite={() => setStage('WEBSITE')}
              />
            )
          ) : (
            /* SPECIALIZED VIEWS CONTAINER WITH UNIFIED HEADER */
            <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#121216]">
              {/* Specialized Views Header Bar */}
              <header className="h-14 border-b border-white/10 bg-[#14141b]/95 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between shrink-0 font-mono text-xs shadow-lg gap-2 overflow-x-auto">
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSubView('DASHBOARD')}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-bold border border-white/10 shrink-0"
                    title="Powrót do głównego pulpitu (Ctrl+1)"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
                    <span className="hidden sm:inline">Pulpit Smart Hub</span>
                    <span className="sm:hidden">Wróć</span>
                  </button>
                  <div className="h-4 w-px bg-white/10 shrink-0" />
                  
                  {/* Sub-view navigation tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    <button
                      type="button"
                      onClick={() => setSubView('TOPICS')}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        subView === 'TOPICS' 
                          ? 'bg-purple-500/20 text-purple-200 font-bold border border-purple-500/40 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title="Katalog Tematów & Roczników (Ctrl+2)"
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Tematy & Roczniki</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubView('GALLERY')}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        subView === 'GALLERY' 
                          ? 'bg-pink-500/20 text-pink-200 font-bold border border-pink-500/40 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title="Galeria Multimediów (Ctrl+3)"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                      <span>Galeria</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubView('TRIAGE')}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        subView === 'TRIAGE' 
                          ? 'bg-rose-500/20 text-rose-200 font-bold border border-rose-500/40 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title="Triage Pobranych & Zrzutów (Ctrl+4)"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Triage Pobranych</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubView('KANBAN')}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        subView === 'KANBAN' 
                          ? 'bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-500/40 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title="Workspace Kanban (Ctrl+5)"
                    >
                      <Code className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Kanban Kod/Media</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubView('APPS')}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        subView === 'APPS' 
                          ? 'bg-amber-500/20 text-amber-200 font-bold border border-amber-500/40 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      title="Półka Aplikacji & EXE (Ctrl+6)"
                    >
                      <FileBox className="w-3.5 h-3.5 text-amber-400" />
                      <span>Instalatory</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/8 text-[11px] text-[#9ca3af] truncate max-w-xs">
                    📁 {targetPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsGuidedSearchOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50 transition flex items-center gap-1.5 cursor-pointer font-bold shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Szukaj (Ctrl+K)</span>
                  </button>
                </div>
              </header>

              {/* Sub-view Content Canvas */}
              <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar text-left">
                {subView === 'TOPICS' && (
                  <NexusExplorerView
                    items={items}
                    workspaces={workspaces}
                    blueprint={blueprint}
                    targetPath={targetPath}
                    onSelectItem={(it) => setQuickLookItem(it)}
                    onResetToConnect={() => setStage('CONNECT')}
                    onOpenInExplorer={handleOpenInExplorer}
                    onExecutePlan={handleExecutePlan}
                    onDeleteEphemeralGroup={(ids) => {
                      setItems(prev => prev.filter(f => !ids.includes(f.id)));
                    }}
                  />
                )}
                {subView === 'GALLERY' && (
                  <MediaGalleryView
                    items={items}
                    targetPath={targetPath}
                    onSelectItem={(it) => setQuickLookItem(it)}
                    onOpenInExplorer={handleOpenInExplorer}
                  />
                )}
                {subView === 'TRIAGE' && (
                  <TriageCommander
                    items={items}
                    targetPath={targetPath}
                    onSelectItem={(it) => setQuickLookItem(it)}
                    onOpenInExplorer={handleOpenInExplorer}
                    onExecuteTriage={handleExecuteTriage}
                  />
                )}
                {subView === 'KANBAN' && (
                  <KanbanWorkspaceHub
                    workspaces={workspaces}
                    items={items}
                    targetPath={targetPath}
                    onSelectWorkspace={(wsId) => setActiveFolderWorkspace(wsId)}
                    onSelectItem={(it) => setQuickLookItem(it)}
                    onOpenInExplorer={handleOpenInExplorer}
                  />
                )}
                {subView === 'APPS' && (
                  <AppShelfView
                    items={items}
                    targetPath={targetPath}
                    onSelectItem={(it) => setQuickLookItem(it)}
                    onOpenInExplorer={handleOpenInExplorer}
                    onOpenDefault={handleOpenDefault}
                    onDeduplicateInstallers={handleDeduplicateInstallers}
                  />
                )}
              </main>
            </div>
          )}

          {/* Context Guided Search Modal */}
          <ContextGuidedSearchModal
            isOpen={isGuidedSearchOpen}
            onClose={() => setIsGuidedSearchOpen(false)}
            onOpenInExplorer={handleOpenInExplorer}
          />

          {/* Autonomous Planner Modal */}
          {blueprint && (
            <AutonomousPlannerModal
              isOpen={isPlannerOpen}
              onClose={() => setIsPlannerOpen(false)}
              blueprint={blueprint}
              onExecutePlan={handleExecutePlan}
            />
          )}

          {/* QuickLook Modal */}
          {quickLookItem && (
            <QuickLookModal
              item={quickLookItem}
              onClose={() => setQuickLookItem(null)}
              onOpenDefault={handleOpenDefault}
              onOpenInExplorer={handleOpenInExplorer}
            />
          )}
        </>
      )}

      {/* Global Nexus Pro Checkout & License Modal */}
      <NexusProModal
        isOpen={isProModalOpen}
        onClose={() => setIsProModalOpen(false)}
        onProActivated={() => {
          refreshLicenseStatus();
          addToast({
            type: 'success',
            title: 'Nexus Pro Aktywny!',
            description: 'Wszystkie zaawansowane moduły AI, Smart Shield i automatyzacji zostały odblokowane.'
          });
        }}
      />

      {/* Free/Pro Limit Enforcement Modal */}
      {isLimitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg p-6 sm:p-7 rounded-3xl bg-[#15151c] border border-amber-500/40 shadow-2xl text-white space-y-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-extrabold text-amber-300">
                  {limitExceededNotice?.plan === 'PRO' ? 'Osiągnięto Maksymalny Limit Planu Pro' : 'Wymagany Plan Nexus Pro'}
                </h3>
                <p className="text-xs sm:text-sm text-[#ddd] leading-relaxed">
                  {limitExceededNotice?.message || 'Nie masz planu Pro, a ta operacja przekracza limity Twojego planu. Wybierz Pro, aby odblokować rozszerzoną analizę, lub ogranicz skanowanie do jednego folderu.'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0f0f14] border border-white/5 text-xs text-[#888] font-mono space-y-1">
              <div>Plan: <b className="text-white">{limitExceededNotice?.plan === 'PRO' ? 'Nexus PRO (Lifetime)' : 'Darmowy (Free)'}</b></div>
              <div>Limit pojedynczej operacji: <b className="text-amber-300">{limitExceededNotice?.plan === 'PRO' ? '5000 GB (5 TB)' : 'Pojedynczy folder (50 GB)'}</b></div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsLimitModalOpen(false);
                  setIsProModalOpen(true);
                }}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Wybierz Pro</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLimitModalOpen(false);
                  setStage('CONNECT');
                }}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Ogranicz do jednego folderu</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
