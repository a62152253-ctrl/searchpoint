import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Terminal,
  ShieldCheck,
  Download,
  ArrowRight,
  Code2,
  Cpu,
  Lock,
  KeyRound,
  Zap,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  User,
  LogOut,
  RefreshCw,
  FolderSearch,
  Check,
  Eye,
  EyeOff,
  FileKey,
  Fingerprint,
  HardDrive,
  Layers,
  ShieldAlert,
  ChevronRight,
  Mail,
  UserPlus,
  Activity,
  Trash2,
  Crown,
} from 'lucide-react';
import {
  nexusAuth,
  AuthUser,
  evaluatePasswordStrength,
  SearchedKeyFile,
  nexusApi,
} from '../utils/nexusAuth';

interface NexusSaaSWebsiteProps {
  onEnterApp: () => void;
  currentUser: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
  onOpenProModal?: () => void;
}

// Fallback utility for browsers without native :user-invalid / :has(:user-invalid) support
const UserInvalidFallback = (() => {
  const dirtyState = new WeakMap<Element, { hasInteracted: boolean; hasBlurred: boolean }>();

  const syncAriaAndFallback = (input: HTMLInputElement) => {
    const isNativeInvalid =
      typeof CSS !== 'undefined' &&
      CSS.supports('selector(:user-invalid)') &&
      input.matches(':user-invalid');
    const isValid = input.checkValidity();

    if (typeof CSS !== 'undefined' && !CSS.supports('selector(:user-invalid)')) {
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);
    }

    const shouldMarkInvalid = isNativeInvalid || (!isValid && input.classList.contains('user-invalid-fallback'));
    input.setAttribute('aria-invalid', shouldMarkInvalid ? 'true' : 'false');

    const container = input.closest('.nexus-auth-field');
    if (container && typeof CSS !== 'undefined' && !CSS.supports('selector(:has(*))')) {
      const hasError = Boolean(container.querySelector('.user-invalid-fallback'));
      container.classList.toggle('has-error-fallback', hasError);
    }
  };

  const handleEvent = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (event.type === 'reset' && target instanceof HTMLFormElement) {
      const controls = Array.from(target.elements);
      for (const control of controls) {
        dirtyState.delete(control);
        control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        control.removeAttribute('aria-invalid');
      }
      target.querySelectorAll('.has-error-fallback').forEach((el) => {
        el.classList.remove('has-error-fallback');
      });
      return;
    }

    if (!(target instanceof HTMLInputElement)) return;

    if (event.type === 'input' || event.type === 'change') {
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(target, state);
      if (state.hasBlurred || target.hasAttribute('aria-invalid')) {
        syncAriaAndFallback(target);
      }
    } else if (event.type === 'blur') {
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(target, state);
      if (state.hasInteracted) {
        syncAriaAndFallback(target);
      }
    }
  };

  const attach = (root: HTMLElement | null) => {
    if (!root) return () => {};
    root.addEventListener('blur', handleEvent, true);
    root.addEventListener('input', handleEvent);
    root.addEventListener('change', handleEvent);
    root.addEventListener('reset', handleEvent, true);
    return () => {
      root.removeEventListener('blur', handleEvent, true);
      root.removeEventListener('input', handleEvent);
      root.removeEventListener('change', handleEvent);
      root.removeEventListener('reset', handleEvent, true);
    };
  };

  return { attach };
})();

type ShowcaseTab = 'TRIAGE' | 'PLANNER' | 'AI_CHAT' | 'SHIELD';

export const NexusSaaSWebsite: React.FC<NexusSaaSWebsiteProps> = ({
  onEnterApp,
  currentUser,
  onUserChange,
  onOpenProModal,
}) => {
  // Modal Auth State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Interactive Hero Showcase Tab
  const [activeShowcase, setActiveShowcase] = useState<ShowcaseTab>('TRIAGE');

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // UI toggles for passwords & Caps Lock
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // .searched key file state
  const [searchedFileContent, setSearchedFileContent] = useState<string | null>(null);
  const [searchedFileName, setSearchedFileName] = useState<string | null>(null);
  const [parsedKeyDetails, setParsedKeyDetails] = useState<SearchedKeyFile | null>(null);
  const [lastIssuedKeyFile, setLastIssuedKeyFile] = useState<{ fileName: string; content: string } | null>(
    () => nexusAuth.getLastKeyFile()
  );

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [registeredFileNotice, setRegisteredFileNotice] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'CHECKING' | 'ONLINE' | 'OFFLINE'>('CHECKING');
  const [backendPingMs, setBackendPingMs] = useState<number | null>(null);

  const checkBackendHealth = () => {
    setBackendStatus('CHECKING');
    const start = performance.now();
    nexusApi.get<{ status: string }>('/api/health', { skipAuth: true })
      .then(() => {
        setBackendPingMs(Math.max(1, Math.round(performance.now() - start)));
        setBackendStatus('ONLINE');
      })
      .catch(() => {
        setBackendPingMs(null);
        setBackendStatus('OFFLINE');
      });
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  // Synchronize <dialog> open/close with React state + attach light-dismiss & validation fallbacks
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (authModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }

    const detachValidation = UserInvalidFallback.attach(dialog);

    const handleDialogClose = () => {
      setAuthModalOpen(false);
    };

    // Fallback for browsers that do not yet support declarative closedby="any"
    const handleBackdropClickFallback = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (!isDialogContent) {
        dialog.close();
      }
    };

    dialog.addEventListener('close', handleDialogClose);
    dialog.addEventListener('click', handleBackdropClickFallback);

    return () => {
      detachValidation();
      dialog.removeEventListener('close', handleDialogClose);
      dialog.removeEventListener('click', handleBackdropClickFallback);
    };
  }, [authModalOpen]);

  const openAuthModal = (mode: 'LOGIN' | 'REGISTER' | 'FORGOT', initialError: string | null = null) => {
    setAuthMode(mode);
    setError(initialError);
    setSuccessMsg(null);
    setRegisteredFileNotice(null);
    setShowPassword(false);
    setShowNewPassword(false);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setError(null);
    setSuccessMsg(null);
    setRegisteredFileNotice(null);
  };

  const handleKeyModifiers = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  // Strict Auth Launch Guard
  const handleLaunchApp = () => {
    if (!currentUser) {
      openAuthModal(
        'LOGIN',
        'Wymagana autoryzacja: Zaloguj się lub utwórz konto ze sprzętowym kluczem .searched, aby uruchomić środowisko Project Nexus.'
      );
      return;
    }
    onEnterApp();
  };

  // Handle Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setRegisteredFileNotice(null);

    if (password !== confirmPassword) {
      setError('Wprowadzone hasła nie są identyczne. Sprawdź pole potwierdzenia hasła.');
      return;
    }

    setLoading(true);
    try {
      const res = await nexusAuth.register(username, email, password);
      onUserChange(res.user);
      setLastIssuedKeyFile(res.searchedFile);
      setSuccessMsg(`Konto ${res.user.displayName} zostało utworzone i zalogowane!`);
      setRegisteredFileNotice(
        `Wygenerowano i pobrano klucz sprzętowy: ${res.searchedFile.fileName}. Zachowaj go w bezpiecznym miejscu — służy do bezhasłowego ratowania konta na tej maszynie.`
      );
      setTimeout(() => {
        closeAuthModal();
      }, 2800);
    } catch (err: any) {
      setError(err.message || 'Wystąpił błąd podczas rejestracji.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await nexusAuth.login(username, password);
      onUserChange(res.user);
      setSuccessMsg(`Witaj ponownie, ${res.user.displayName}! Trwa odblokowywanie sesji...`);
      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Nieprawidłowy login / e-mail lub hasło.');
    } finally {
      setLoading(false);
    }
  };

  // Process uploaded or dropped .searched file
  const processKeyFile = (file: File) => {
    if (!file.name.endsWith('.searched') && !file.name.endsWith('.json')) {
      setError('Wybierz prawidłowy plik klucza tożsamości (.searched) wygenerowany podczas rejestracji.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const parsed = nexusAuth.inspectSearchedFile(text);
        setSearchedFileContent(text);
        setSearchedFileName(file.name);
        setParsedKeyDetails(parsed);
        setError(null);
      } catch (err: any) {
        setSearchedFileContent(null);
        setSearchedFileName(null);
        setParsedKeyDetails(null);
        setError(err.message || 'Błąd odczytu struktury pliku .searched.');
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processKeyFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processKeyFile(file);
  };

  const clearLoadedKeyFile = () => {
    setSearchedFileContent(null);
    setSearchedFileName(null);
    setParsedKeyDetails(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchedFileContent) {
      setError('Wgraj plik klucza sprzętowego .searched, aby zweryfikować kryptograficzny podpis urządzenia.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError('Nowe hasło musi zawierać co najmniej 8 znaków.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Nowe hasło oraz jego potwierdzenie nie są identyczne.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await nexusAuth.resetPasswordWithKeyFile(searchedFileContent, newPassword);
      onUserChange(res.user);
      setSuccessMsg(res.message);
      if (res.newSearchedFile) {
        setLastIssuedKeyFile(res.newSearchedFile);
        setRegisteredFileNotice(
          `Twój token odzyskiwania został zrotowany ze względów bezpieczeństwa. Pobrano nowy klucz: ${res.newSearchedFile.fileName}`
        );
      }
      setTimeout(() => {
        closeAuthModal();
      }, 2600);
    } catch (err: any) {
      setError(err.message || 'Błąd weryfikacji tożsamości z pliku .searched.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await nexusAuth.logout();
    onUserChange(null);
  };

  const triggerInstallerDownload = () => {
    const a = document.createElement('a');
    a.href = '/Nexus_Setup.exe';
    a.download = 'Nexus_Setup.exe';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const registerStrength = evaluatePasswordStrength(password);
  const resetStrength = evaluatePasswordStrength(newPassword);

  return (
    <div className="h-screen w-full bg-[#07070b] text-white flex flex-col justify-between selection:bg-purple-500/30 font-sans relative overflow-y-auto overflow-x-hidden custom-scrollbar select-none">
      {/* Ambient Cyberpunk / Obsidian Glows */}
      <div className="fixed -top-36 left-1/4 w-[680px] h-[380px] bg-purple-600/14 blur-[140px] pointer-events-none rounded-full z-0" />
      <div className="fixed top-1/3 -right-24 w-[540px] h-[420px] bg-cyan-600/10 blur-[150px] pointer-events-none rounded-full z-0" />
      <div className="fixed -bottom-24 left-1/3 w-[500px] h-[320px] bg-emerald-600/8 blur-[140px] pointer-events-none rounded-full z-0" />

      {/* 1. Sticky Top Command Header */}
      <header className="sticky top-0 w-full border-b border-white/10 bg-[#09090f]/85 backdrop-blur-xl px-6 py-3 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-purple-500/20">
              <div className="w-full h-full bg-[#0b0b12] rounded-[11px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-sm text-white font-mono">
                  Project Nexus
                </span>
              </div>
              <p className="text-[10px] text-white/45 font-mono hidden sm:block">
                Lokalny menedżer plików i projektów
              </p>
            </div>
          </div>

          {/* Live Telemetry Pill */}
          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-white/10">
            <button
              type="button"
              onClick={checkBackendHealth}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-[11px] font-mono transition cursor-pointer"
              title="Kliknij, aby odświeżyć status lokalnego serwera"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === 'ONLINE'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : backendStatus === 'OFFLINE'
                    ? 'bg-rose-400'
                    : 'bg-amber-300 animate-pulse'
                }`}
              />
              <span className="text-white/70">
                Silnik:{' '}
                <strong
                  className={
                    backendStatus === 'ONLINE'
                      ? 'text-emerald-400'
                      : backendStatus === 'OFFLINE'
                      ? 'text-rose-400'
                      : 'text-amber-300'
                  }
                >
                  {backendStatus === 'ONLINE'
                    ? `Online (${backendPingMs ?? 1}ms)`
                    : backendStatus === 'OFFLINE'
                    ? 'Offline'
                    : 'Łączenie...'}
                </strong>
              </span>
            </button>
          </div>
        </div>

        {/* Right Status & Account Actions */}
        <div className="flex items-center gap-2.5">
          {currentUser ? (
            <div className="flex items-center gap-2 bg-white/[0.04] border border-emerald-500/30 rounded-xl px-3 py-1.5 text-xs font-mono shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="text-left leading-tight">
                <div className="text-white font-semibold text-xs">{currentUser.displayName}</div>
                <div className="text-[10px] text-white/45 hidden md:block">{currentUser.email}</div>
              </div>
              {lastIssuedKeyFile && (
                <button
                  type="button"
                  onClick={() =>
                    nexusAuth.downloadSearchedFile(lastIssuedKeyFile.fileName, lastIssuedKeyFile.content)
                  }
                  className="ml-1 px-2 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-[10px] text-purple-300 transition flex items-center gap-1 cursor-pointer"
                  title="Pobierz kopię swojego klucza .searched z tej sesji"
                >
                  <FileKey className="w-3 h-3" />
                  <span className="hidden xl:inline">Klucz .searched</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="p-1 rounded-lg text-white/45 hover:text-rose-400 hover:bg-rose-500/10 transition ml-0.5 cursor-pointer"
                title="Wyloguj się z sesji"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAuthModal('LOGIN')}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 text-xs font-mono text-white/90 transition flex items-center gap-1.5 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span>Logowanie</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('REGISTER')}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/35 text-xs font-mono text-purple-200 transition hidden sm:flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                <span>Załóż Konto (+ Klucz)</span>
              </button>
            </div>
          )}

          {onOpenProModal && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenProModal();
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-amber-950/30"
              title="Kup dożywotnią licencję Nexus PRO (Krypto) lub aktywuj kod"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Ulepsz do PRO</span>
            </button>
          )}

          <button
            type="button"
            onClick={triggerInstallerDownload}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-mono text-cyan-300 transition hidden md:flex items-center gap-1.5 cursor-pointer"
            title="Pobierz oficjalny instalator Windows (.exe)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Pobierz Instalator (.exe)</span>
          </button>

          <button
            type="button"
            onClick={handleLaunchApp}
            className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 group cursor-pointer shadow-lg ${
              currentUser
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white shadow-emerald-600/25'
                : 'bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-purple-600/25'
            }`}
          >
            <span>{currentUser ? 'Otwórz Eksplorator' : 'Uruchom Aplikację'}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </header>

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 lg:py-10 flex flex-col justify-center gap-10 z-10">
        {/* Hero Split Grid: Left Pitch + Right Interactive HUD Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Hero Pitch & CTAs */}
          <div className="lg:col-span-7 text-left space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>100% Prywatności • Lokalne AI • 1-Click Rollback</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.12] text-transparent bg-clip-text bg-gradient-to-br from-white via-white/95 to-purple-200/60">
              Uporządkuj dysk, odzyskaj gigabajty i przeszukuj pliki z lokalnym AI.
            </h1>

            <p className="text-xs sm:text-sm text-white/75 max-w-2xl leading-relaxed">
              Błyskawiczne sprzątanie folderu Pobrane, wykrywanie duplikatów i prywatny czat z dokumentami. Twoje dane nigdy nie opuszczają Twojego komputera.
            </p>

            {/* Primary & Secondary Hero Actions */}
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleLaunchApp}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-xs sm:text-sm font-bold text-white shadow-xl shadow-purple-600/25 transition flex items-center gap-2.5 group cursor-pointer"
              >
                <Zap className="w-4 h-4 text-yellow-300" />
                <span>
                  {currentUser
                    ? `Wejdź do Eksploratora (${currentUser.displayName})`
                    : 'Uruchom Eksplorator'}
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              {!currentUser && (
                <button
                  type="button"
                  onClick={() => openAuthModal('REGISTER')}
                  className="px-5 py-3.5 rounded-2xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-xs sm:text-sm font-mono font-semibold text-purple-200 transition flex items-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-purple-400" />
                  <span>Załóż konto</span>
                </button>
              )}

              {onOpenProModal && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenProModal();
                  }}
                  className="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 border border-amber-500/40 text-xs sm:text-sm font-mono font-bold text-amber-300 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-950/40"
                  title="Odblokuj pełny zakres dysku i tagowanie AI"
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Ulepsz do PRO</span>
                </button>
              )}

              <button
                type="button"
                onClick={triggerInstallerDownload}
                className="px-4 py-3 rounded-2xl bg-[#12121a] hover:bg-[#191924] border border-cyan-500/30 hover:border-cyan-500/60 text-xs sm:text-sm font-medium text-white/90 transition flex items-center gap-2.5 cursor-pointer shadow-lg shadow-cyan-950/20"
                title="Pobierz oficjalny instalator Windows (.exe)"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                <div className="text-left">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Instalator Windows (.exe)</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/30 font-mono">Setup</span>
                  </div>
                  <div className="text-[10px] text-white/50 font-mono">Dalej → Dalej → Gotowe • Bez CMD</div>
                </div>
              </button>
            </div>

            {/* Key Benefits Metrics Bar (Replaced Cryptographic Jargon with Real User Value) */}
            <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.025] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-white/45">100% Prywatności</div>
                <div className="text-sm font-extrabold font-mono text-white mt-0.5">0 bajtów w chmurze</div>
                <div className="text-[10px] font-mono text-emerald-400">Przetwarzanie lokalne</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.025] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-white/45">Odzyskane miejsce</div>
                <div className="text-sm font-extrabold font-mono text-white mt-0.5">Gigabajty na dysku</div>
                <div className="text-[10px] font-mono text-cyan-300">Wykrywanie duplikatów</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.025] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-white/45">Błyskawiczna szybkość</div>
                <div className="text-sm font-extrabold font-mono text-white mt-0.5">&lt; 1 sekundy</div>
                <div className="text-[10px] font-mono text-purple-300">Czas skanowania i podglądu</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.025] border border-white/10">
                <div className="text-[10px] font-mono uppercase text-white/45">Pancerne bezpieczeństwo</div>
                <div className="text-sm font-extrabold font-mono text-white mt-0.5">Smart Shield &amp; Kosz</div>
                <div className="text-[10px] font-mono text-amber-300">1-Click Rollback &amp; Kwarantanna</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Architecture & Workspace Preview */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-[#0c0c14]/90 border border-white/15 shadow-2xl overflow-hidden backdrop-blur-xl">
              {/* Window Top Bar */}
              <div className="px-4 py-2.5 bg-[#12121c] border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 text-[11px] font-mono text-white/60">
                    nexus://preview/{activeShowcase.toLowerCase()}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Podgląd
                </span>
              </div>

              {/* Interactive Module Selector Tabs */}
              <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#090910] border-b border-white/10 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setActiveShowcase('TRIAGE')}
                  className={`py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeShowcase === 'TRIAGE'
                      ? 'bg-pink-600/25 text-pink-200 border border-pink-500/40 font-bold'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Triage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShowcase('PLANNER')}
                  className={`py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeShowcase === 'PLANNER'
                      ? 'bg-cyan-600/25 text-cyan-200 border border-cyan-500/40 font-bold'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Planner</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShowcase('AI_CHAT')}
                  className={`py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeShowcase === 'AI_CHAT'
                      ? 'bg-purple-600/25 text-purple-200 border border-purple-500/40 font-bold'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Czat AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShowcase('SHIELD')}
                  className={`py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeShowcase === 'SHIELD'
                      ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/40 font-bold'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Ochrona</span>
                </button>
              </div>

              {/* Dynamic Preview Body Spotlight */}
              <div className="p-5 text-left font-mono text-xs space-y-3 min-h-[265px] flex flex-col justify-between">
                {activeShowcase === 'TRIAGE' && (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-pink-300">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Layers className="w-3.5 h-3.5" />
                          TRIAGE COMMANDER — „TINDER DLA PLIKÓW”
                        </span>
                        <span className="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 text-[10px]">Pobrane</span>
                      </div>

                      {/* Interactive Tinder-like Card Demo */}
                      <div className="p-3.5 rounded-xl bg-gradient-to-b from-[#161624] to-[#0c0c14] border border-pink-500/30 shadow-lg space-y-2.5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-300 font-bold text-xs">
                              EXE
                            </div>
                            <div>
                              <div className="text-white font-semibold text-xs truncate max-w-[210px]">
                                Instalator_Setup_2024_kopia (1).exe
                              </div>
                              <div className="text-[10px] text-white/50">
                                1.85 GB • Pobrany 4 mies. temu • Duplikat
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                            Zbędny
                          </span>
                        </div>

                        {/* Action Controls Preview */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleLaunchApp}
                            className="py-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>← Przesuń: Kosz</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleLaunchApp}
                            className="py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Zachowaj :Przesuń →</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-white/50 pt-1 border-t border-white/5 font-mono">
                          <span>Postęp: 48 / 120 plików</span>
                          <span className="text-emerald-400 font-bold">-4.2 GB odzyskane</span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-white/65">
                        Błyskawiczne sprzątanie: podejmuj decyzje kartami za pomocą strzałek klawiatury lub gestów dotykowych.
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
                      <span>Obsługa gestów &amp; klawiszy ← / →</span>
                      <button
                        type="button"
                        onClick={handleLaunchApp}
                        className="text-pink-400 hover:text-pink-300 font-bold cursor-pointer"
                      >
                        Otwórz Triage Commander →
                      </button>
                    </div>
                  </>
                )}

                {activeShowcase === 'PLANNER' && (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-cyan-300">
                        <span className="flex items-center gap-1.5 font-bold">
                          <RefreshCw className="w-3.5 h-3.5" />
                          AUTONOMICZNY PLANNER &amp; ROLLBACK
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px]">1-Click Rollback</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-cyan-500/30 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-xs font-semibold">
                            Wygenerowany Plan: Porządkowanie Dysku
                          </div>
                          <span className="text-emerald-400 text-[11px] font-bold">+5.8 GB wolnego</span>
                        </div>

                        <div className="space-y-1 text-[11px] font-mono text-white/70">
                          <div className="flex items-center gap-2">
                            <Check className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>140 zrzutów ekranu → foldery datowe (2026/10)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>38 starych instalatorów i duplikatów → bezpieczny Kosz</span>
                          </div>
                        </div>

                        {/* 1-Click Rollback Assurance */}
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-[11px]">
                          <span className="text-emerald-300 flex items-center gap-1.5 font-bold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            100% Bezpieczeństwa: Dziennik Transakcji
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-mono text-[10px]">
                            ↩ Cofnij jednym klikiem
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-white/65 leading-relaxed">
                        Każda operacja planera zapisuje transakcyjny dziennik. Zmieniłeś zdanie? Jedno kliknięcie natychmiast przywraca każdy plik do pierwotnego folderu.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
                      <span>Zero ryzyka przypadkowej utraty danych</span>
                      <button
                        type="button"
                        onClick={handleLaunchApp}
                        className="text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                      >
                        Zobacz Plany Działania →
                      </button>
                    </div>
                  </>
                )}

                {activeShowcase === 'AI_CHAT' && (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-purple-300">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Cpu className="w-3.5 h-3.5" />
                          PRYWATNY CZAT Z PLIKAMI (OLLAMA LLM)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">0 bajtów w chmurze</span>
                      </div>

                      <div className="p-3 rounded-xl bg-[#07070e] border border-purple-500/30 space-y-2 text-[11px]">
                        {/* User Bubble */}
                        <div className="p-2 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-100 max-w-[92%]">
                          <span className="text-[9px] text-purple-300/70 block font-mono">Ty:</span>
                          „Jaka jest kwota brutto na ostatniej fakturze za hosting i jakie są warunki płatności?”
                        </div>

                        {/* AI Response Bubble */}
                        <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 space-y-1">
                          <div className="flex items-center gap-1.5 text-cyan-300 text-[10px] font-bold">
                            <Sparkles className="w-3 h-3" />
                            <span>Lokalny Model Llama 3 (Offline):</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-white/80">
                            Na podstawie pliku <code className="text-cyan-300 font-mono">faktura_hosting_2026.pdf</code> kwota wynosi <b>1 450,00 PLN brutto</b> z terminem płatności 14 dni.
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono pt-1">
                          <span>🔒 Model uruchomiony na Twoim GPU</span>
                          <span>100% Poufności</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-white/65 leading-relaxed">
                        Pytaj o treść własnych umów, dokumentów PDF i kodu źródłowego. Twoje prywatne dane nigdy nie opuszczają Twojego komputera.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
                      <span>Darmowa integracja z Ollama</span>
                      <button
                        type="button"
                        onClick={handleLaunchApp}
                        className="text-purple-300 hover:text-purple-200 font-bold cursor-pointer"
                      >
                        Czatuj ze swoimi plikami →
                      </button>
                    </div>
                  </>
                )}

                {activeShowcase === 'SHIELD' && (
                  <>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-emerald-300">
                        <span className="flex items-center gap-1.5 font-bold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          CYBERNETYCZNA TARCZA SMART SHIELD
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">Aktywna ochrona</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-emerald-500/30 space-y-2.5 text-[11px]">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                          <div>
                            <span className="text-rose-300 font-bold block">⚠️ Zneutralizowano podwójne rozszerzenie</span>
                            <span className="text-white/60 text-[10px] font-mono">Potwierdzenie_Przelewu.pdf.exe</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[10px]">W kwarantannie</span>
                        </div>

                        <div className="space-y-1.5 text-white/80">
                          <div className="flex items-center justify-between">
                            <span>Cyfrowa izolacja podejrzanych skryptów (.bat / .vbs)</span>
                            <span className="text-emerald-400 font-mono">Zabezpieczone</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Eliminacja fałszywych alarmów (pliki medyczne i nauka)</span>
                            <span className="text-cyan-300 font-mono">0 błędnych blokad</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Ochrona przed przypadkowym usunięciem (Kosz Windows)</span>
                            <span className="text-emerald-400 font-mono">Włączona</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-white/65 leading-relaxed">
                        Automatyczna kwarantanna niebezpiecznych plików i pułapek socjotechnicznych bez utraty dostępu do ważnych materiałów edukacyjnych.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
                      <span>Bezpieczne środowisko pracy</span>
                      <button
                        type="button"
                        onClick={handleLaunchApp}
                        className="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer"
                      >
                        Sprawdź Tarczę →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Four Pillars Capabilities Section (Benefits-Focused) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          <div className="p-5 rounded-2xl bg-[#0e0e16]/85 border border-white/10 hover:border-pink-500/40 transition nexus-card-interactive">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-3">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white mb-1.5">Triage Commander („Tinder dla plików”)</h3>
            <p className="text-xs text-white/60 leading-relaxed font-mono">
              Błyskawicznie segreguj pobrane pliki za pomocą prostych decyzji lewo (Kosz) / prawo (Zachowaj). Posprzątaj cały folder Pobrane w kilkadziesiąt sekund.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0e0e16]/85 border border-white/10 hover:border-cyan-500/40 transition nexus-card-interactive">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3">
              <RefreshCw className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white mb-1.5">Autonomiczny Planner &amp; Rollback</h3>
            <p className="text-xs text-white/60 leading-relaxed font-mono">
              Inteligentna organizacja plików z gwarancją bezpieczeństwa. Każde przesunięcie plików cofniesz do stanu pierwotnego jednym kliknięciem.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0e0e16]/85 border border-white/10 hover:border-purple-500/40 transition nexus-card-interactive">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white mb-1.5">Prywatne Lokalne AI (Ollama LLM)</h3>
            <p className="text-xs text-white/60 leading-relaxed font-mono">
              Prywatny czat z zawartością własnych umów, dokumentów PDF i kodu. Twoje dane są przetwarzane w 100% na Twoim GPU bez wysyłania do chmury.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0e0e16]/85 border border-white/10 hover:border-emerald-500/40 transition nexus-card-interactive">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white mb-1.5">Smart Shield &amp; Bezpieczna Kwarantanna</h3>
            <p className="text-xs text-white/60 leading-relaxed font-mono">
              Wykrywanie podwójnych rozszerzeń (np. .pdf.exe), podejrzanych skryptów i izolacja zagrożeń bez fałszywych alarmów dla materiałów edukacyjnych.
            </p>
          </div>
        </div>
      </main>

      {/* 4. Bottom Telemetry Footer */}
      <footer className="w-full border-t border-white/10 bg-[#050508] px-6 py-3 text-center text-[11px] text-white/45 font-mono flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Serwer API:{' '}
            <b
              className={
                backendStatus === 'ONLINE'
                  ? 'text-emerald-400'
                  : backendStatus === 'OFFLINE'
                  ? 'text-rose-400'
                  : 'text-amber-300'
              }
            >
              {backendStatus === 'ONLINE'
                ? `Online (Port 3001 • ${backendPingMs ?? 1}ms)`
                : backendStatus === 'OFFLINE'
                ? 'Offline'
                : 'Sprawdzanie...'}
            </b>
          </span>
          <span>
            Sesja:{' '}
            <b className={currentUser ? 'text-emerald-400' : 'text-purple-300'}>
              {currentUser ? `Zalogowano (${currentUser.username})` : 'Gość (Wymagane logowanie)'}
            </b>
          </span>
          <span>
            Prywatność: <b className="text-cyan-400">100% lokalne przetwarzanie • 0 danych w chmurze</b>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {!currentUser && (
            <button
              type="button"
              onClick={() => openAuthModal('FORGOT')}
              className="text-white/60 hover:text-purple-300 underline cursor-pointer"
            >
              Odzyskaj konto (.searched)
            </button>
          )}
          <span>© 2026 Project Nexus. Wszystkie prawa zastrzeżone.</span>
        </div>
      </footer>

      {/* 5. NATIVE <dialog closedby="any"> AUTHENTICATION & VAULT MODAL */}
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-labelledby="nexus-auth-dialog-title"
        className="nexus-auth-dialog"
      >
        {authModalOpen && (
          <div className="w-[min(94vw,30rem)] bg-[#0d0d14] border border-white/15 rounded-2xl shadow-2xl overflow-hidden text-left animate-scaleUp">
            {/* Top Gradient Accent Bar */}
            <div
              className={`h-1.5 w-full bg-gradient-to-r ${
                authMode === 'LOGIN'
                  ? 'from-purple-600 via-indigo-500 to-cyan-400'
                  : authMode === 'REGISTER'
                  ? 'from-cyan-500 via-purple-500 to-pink-500'
                  : 'from-amber-500 via-emerald-500 to-cyan-500'
              }`}
            />

            <div className="p-6">
              {/* Dialog Header */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                      authMode === 'LOGIN'
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                        : authMode === 'REGISTER'
                        ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    {authMode === 'LOGIN' && <Lock className="w-5 h-5" />}
                    {authMode === 'REGISTER' && <UserPlus className="w-5 h-5" />}
                    {authMode === 'FORGOT' && <FileKey className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2
                      id="nexus-auth-dialog-title"
                      className="text-base font-extrabold text-white tracking-tight"
                    >
                      {authMode === 'LOGIN' && 'Autoryzacja Project Nexus'}
                      {authMode === 'REGISTER' && 'Rejestracja & Klucz .searched'}
                      {authMode === 'FORGOT' && 'Odzyskiwanie Konta (.searched)'}
                    </h2>
                    <p className="text-[11px] font-mono text-white/50">
                      {authMode === 'LOGIN' && 'Zaloguj się za pomocą nazwy użytkownika lub e-maila'}
                      {authMode === 'REGISTER' && 'Utwórz lokalny profil chroniony podpisem HMAC-SHA256'}
                      {authMode === 'FORGOT' && 'Zweryfikuj tożsamość sprzętową i ustaw nowe hasło'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeAuthModal}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  aria-label="Zamknij okno autoryzacji"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('LOGIN');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    authMode === 'LOGIN'
                      ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Logowanie</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('REGISTER');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    authMode === 'REGISTER'
                      ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Rejestracja</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('FORGOT');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    authMode === 'FORGOT'
                      ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Reset Hasła</span>
                </button>
              </div>

              {/* Global Alerts */}
              {error && (
                <div
                  className="p-3.5 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-mono flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              {successMsg && (
                <div
                  className="p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-mono flex items-start gap-2.5"
                  role="status"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{successMsg}</div>
                </div>
              )}

              {registeredFileNotice && (
                <div className="p-3.5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] font-mono space-y-2">
                  <div className="font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>Klucz sprzętowy .searched gotowy!</span>
                    </span>
                    {lastIssuedKeyFile && (
                      <button
                        type="button"
                        onClick={() =>
                          nexusAuth.downloadSearchedFile(
                            lastIssuedKeyFile.fileName,
                            lastIssuedKeyFile.content
                          )
                        }
                        className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 text-[10px] cursor-pointer"
                      >
                        Pobierz ponownie
                      </button>
                    )}
                  </div>
                  <p className="text-white/75 leading-relaxed">{registeredFileNotice}</p>
                </div>
              )}

              {/* =========================================================
                  A. LOGIN FORM
                 ========================================================= */}
              {authMode === 'LOGIN' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="nexus-auth-field">
                    <label
                      htmlFor="login-identifier"
                      className="block text-xs font-mono font-semibold text-white/80 mb-1"
                    >
                      Nazwa użytkownika lub E-mail <span className="text-rose-400">*</span>
                    </label>
                    <span id="login-identifier-hint" className="nexus-field-hint">
                      Wpisz swój login (min. 3 znaki) lub zarejestrowany adres e-mail
                    </span>
                    <div className="relative">
                      <input
                        id="login-identifier"
                        name="identifier"
                        type="text"
                        required
                        minLength={3}
                        autoComplete="username"
                        aria-describedby="login-identifier-hint"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="np. arimo lub twoj@email.com"
                        className="nexus-auth-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <User className="w-4 h-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Podaj poprawny login lub adres e-mail (min. 3 znaki).</span>
                      </div>
                    </div>
                  </div>

                  <div className="nexus-auth-field">
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-mono font-semibold text-white/80"
                      >
                        Hasło dostępu <span className="text-rose-400">*</span>
                      </label>
                      {capsLockActive && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⚠️ Caps Lock włączony
                        </span>
                      )}
                    </div>
                    <span id="login-password-hint" className="nexus-field-hint">
                      Wprowadź hasło powiązane z Twoim kontem Project Nexus
                    </span>
                    <div className="relative">
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={1}
                        autoComplete="current-password"
                        aria-describedby="login-password-hint"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={handleKeyModifiers}
                        onKeyDown={handleKeyModifiers}
                        placeholder="••••••••••••"
                        className="nexus-auth-input w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <Lock className="w-4 h-4 text-white/35 absolute left-3 top-3 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Pole hasła nie może być puste.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-2.5 p-1 text-white/40 hover:text-white transition cursor-pointer"
                        aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold text-xs font-mono transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-40 cursor-pointer"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    <span>Zaloguj się i odblokuj Eksplorator</span>
                  </button>

                  <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('FORGOT');
                        setError(null);
                      }}
                      className="text-purple-400 hover:text-purple-300 underline cursor-pointer"
                    >
                      Zapomniałeś hasła? Użyj pliku .searched
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('REGISTER');
                        setError(null);
                      }}
                      className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      Załóż nowe konto →
                    </button>
                  </div>
                </form>
              )}

              {/* =========================================================
                  B. REGISTER FORM
                 ========================================================= */}
              {authMode === 'REGISTER' && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="nexus-auth-field">
                    <label
                      htmlFor="register-username"
                      className="block text-xs font-mono font-semibold text-white/80 mb-0.5"
                    >
                      Nazwa użytkownika <span className="text-rose-400">*</span>
                    </label>
                    <span id="register-username-hint" className="nexus-field-hint">
                      Min. 3 znaki — używana w nazwie Twojego klucza nexus_identity_&lt;login&gt;.searched
                    </span>
                    <div className="relative">
                      <input
                        id="register-username"
                        name="username"
                        type="text"
                        required
                        minLength={3}
                        autoComplete="username"
                        aria-describedby="register-username-hint"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="np. nexus_operator"
                        className="nexus-auth-input w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <User className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Nazwa użytkownika musi mieć co najmniej 3 znaki.</span>
                      </div>
                    </div>
                  </div>

                  <div className="nexus-auth-field">
                    <label
                      htmlFor="register-email"
                      className="block text-xs font-mono font-semibold text-white/80 mb-0.5"
                    >
                      Adres E-mail <span className="text-rose-400">*</span>
                    </label>
                    <span id="register-email-hint" className="nexus-field-hint">
                      Format: twoj@domena.pl — zapisywany w podpisie kryptograficznym konta
                    </span>
                    <div className="relative">
                      <input
                        id="register-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        aria-describedby="register-email-hint"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="operator@projectnexus.local"
                        className="nexus-auth-input w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <Mail className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Wprowadź poprawny adres e-mail (np. nazwa@domena.pl).</span>
                      </div>
                    </div>
                  </div>

                  <div className="nexus-auth-field">
                    <div className="flex items-center justify-between mb-0.5">
                      <label
                        htmlFor="register-password"
                        className="block text-xs font-mono font-semibold text-white/80"
                      >
                        Hasło główne <span className="text-rose-400">*</span>
                      </label>
                      <span className={`text-[10px] font-mono font-bold ${registerStrength.colorClass}`}>
                        {registerStrength.label}
                      </span>
                    </div>
                    <span id="register-password-hint" className="nexus-field-hint">
                      Minimum 8 znaków (zalecane małe i wielkie litery, cyfra oraz znak specjalny)
                    </span>
                    <div className="relative">
                      <input
                        id="register-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        aria-describedby="register-password-hint"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={handleKeyModifiers}
                        onKeyDown={handleKeyModifiers}
                        placeholder="Minimum 8 znaków"
                        className="nexus-auth-input w-full pl-9 pr-10 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <Lock className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Hasło musi składać się z minimum 8 znaków.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-2 p-1 text-white/40 hover:text-white transition cursor-pointer"
                        aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Strength Bar & Checklist */}
                    <div className="mt-2 space-y-1.5">
                      <div className="grid grid-cols-4 gap-1.5 h-1">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`rounded-full transition-all duration-200 ${
                              registerStrength.score >= step ? registerStrength.barColor : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-white/45">
                        <span className={registerStrength.checks.minLength ? 'text-emerald-400' : ''}>
                          ✓ 8+ znaków
                        </span>
                        <span className={registerStrength.checks.hasMixedCase ? 'text-emerald-400' : ''}>
                          ✓ A-z
                        </span>
                        <span className={registerStrength.checks.hasNumber ? 'text-emerald-400' : ''}>
                          ✓ Cyfra (0-9)
                        </span>
                        <span className={registerStrength.checks.hasSpecial ? 'text-emerald-400' : ''}>
                          ✓ Symbol (!@#)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="nexus-auth-field">
                    <label
                      htmlFor="register-confirm-password"
                      className="block text-xs font-mono font-semibold text-white/80 mb-0.5"
                    >
                      Potwierdź hasło <span className="text-rose-400">*</span>
                    </label>
                    <span id="register-confirm-hint" className="nexus-field-hint">
                      Powtórz hasło, aby wykluczyć literówkę przed wygenerowaniem klucza
                    </span>
                    <div className="relative">
                      <input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        aria-describedby="register-confirm-hint"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Powtórz hasło"
                        className="nexus-auth-input w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition"
                      />
                      <ShieldCheck className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Potwierdzenie hasła musi zawierać co najmniej 8 znaków.</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview of the .searched Key File to be generated */}
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-[11px] font-mono text-purple-200 flex items-start gap-2.5">
                    <FileKey className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold text-white">
                        Klucz sprzętowy:{' '}
                        <span className="text-cyan-300">
                          nexus_identity_{(username || 'operator').trim().toLowerCase() || 'operator'}.searched
                        </span>
                      </div>
                      <p className="text-white/65 text-[10px] leading-relaxed">
                        Zostanie automatycznie pobrany po rejestracji. Zawiera podpis HMAC-SHA256 powiązany z tą maszyną.
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold text-xs font-mono transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-40 cursor-pointer"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>Utwórz Konto & Pobierz Klucz .searched</span>
                  </button>
                </form>
              )}

              {/* =========================================================
                  C. FORGOT PASSWORD (.searched KEY FILE RECOVERY)
                 ========================================================= */}
              {authMode === 'FORGOT' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] font-mono text-amber-200 flex items-start gap-2.5">
                    <Fingerprint className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <b className="text-white">Weryfikacja klucza:</b> Wgraj swój plik{' '}
                      <code className="text-amber-300">.searched</code> z tego urządzenia. Po zmianie hasła stary plik zostanie unieważniony i pobierzesz zaktualizowany klucz.
                    </div>
                  </div>

                  {/* Drag & Drop or File Picker Zone */}
                  <div>
                    <label className="block text-xs font-mono font-semibold text-white/80 mb-1">
                      1. Plik tożsamości sprzętowej (.searched) <span className="text-rose-400">*</span>
                    </label>
                    <span className="nexus-field-hint">
                      Upuść plik nexus_identity_*.searched poniżej lub kliknij, aby wybrać z dysku
                    </span>

                    {!parsedKeyDetails ? (
                      <label
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDropFile}
                        className={`flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed transition cursor-pointer ${
                          isDraggingFile
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-white/20 hover:border-purple-500/60 bg-white/[0.03] hover:bg-white/[0.05]'
                        }`}
                      >
                        <Upload className="w-6 h-6 text-purple-400 mb-2" />
                        <span className="text-xs font-mono text-white/85 font-semibold">
                          {searchedFileName || 'Kliknij lub przeciągnij plik .searched tutaj'}
                        </span>
                        <span className="text-[10px] font-mono text-white/45 mt-1">
                          Obsługiwany format: NEXUS_SEARCHED_KEY_V1 (.searched, .json)
                        </span>
                        <input
                          type="file"
                          accept=".searched,.json"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      /* Cryptographic Key Verification Card */
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-xs font-mono space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Rozpoznano klucz: {searchedFileName}</span>
                          </span>
                          <button
                            type="button"
                            onClick={clearLoadedKeyFile}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-rose-300 transition cursor-pointer"
                            title="Usuń wczytany plik i wybierz inny"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10 text-[11px]">
                          <div>
                            <span className="text-white/45 block">Użytkownik:</span>
                            <span className="text-white font-bold">@{parsedKeyDetails.username}</span>
                          </div>
                          <div>
                            <span className="text-white/45 block">E-mail:</span>
                            <span className="text-white/90 truncate block">{parsedKeyDetails.email}</span>
                          </div>
                          <div>
                            <span className="text-white/45 block">Odcisk maszyny:</span>
                            <span className="text-cyan-300">
                              {parsedKeyDetails.machineBoundHash.slice(0, 12)}...
                            </span>
                          </div>
                          <div>
                            <span className="text-white/45 block">Podpis HMAC:</span>
                            <span className="text-purple-300">
                              {parsedKeyDetails.integritySignature.slice(0, 12)}...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* New Password Field */}
                  <div className="nexus-auth-field">
                    <div className="flex items-center justify-between mb-0.5">
                      <label
                        htmlFor="reset-new-password"
                        className="block text-xs font-mono font-semibold text-white/80"
                      >
                        2. Nowe hasło <span className="text-rose-400">*</span>
                      </label>
                      <span className={`text-[10px] font-mono font-bold ${resetStrength.colorClass}`}>
                        {resetStrength.label}
                      </span>
                    </div>
                    <span id="reset-password-hint" className="nexus-field-hint">
                      Wprowadź nowe hasło (minimum 8 znaków)
                    </span>
                    <div className="relative">
                      <input
                        id="reset-new-password"
                        name="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        aria-describedby="reset-password-hint"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 znaków"
                        className="nexus-auth-input w-full pl-9 pr-10 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none transition"
                      />
                      <Lock className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Nowe hasło musi mieć co najmniej 8 znaków.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-2.5 top-2 p-1 text-white/40 hover:text-white transition cursor-pointer"
                        aria-label={showNewPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 h-1 mt-2">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`rounded-full transition-all duration-200 ${
                            resetStrength.score >= step ? resetStrength.barColor : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Confirm New Password Field */}
                  <div className="nexus-auth-field">
                    <label
                      htmlFor="reset-confirm-password"
                      className="block text-xs font-mono font-semibold text-white/80 mb-0.5"
                    >
                      3. Potwierdź nowe hasło <span className="text-rose-400">*</span>
                    </label>
                    <span id="reset-confirm-hint" className="nexus-field-hint">
                      Powtórz nowe hasło przed rotacją klucza .searched
                    </span>
                    <div className="relative">
                      <input
                        id="reset-confirm-password"
                        name="confirmNewPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        aria-describedby="reset-confirm-hint"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Powtórz nowe hasło"
                        className="nexus-auth-input w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none transition"
                      />
                      <ShieldCheck className="w-4 h-4 text-white/35 absolute left-3 top-2.5 pointer-events-none" />
                      <div className="nexus-field-error">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Potwierdź nowe hasło (min. 8 znaków).</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-bold text-xs font-mono transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-40 cursor-pointer"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    <span>Zweryfikuj Klucz HMAC & Zmień Hasło</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
};
