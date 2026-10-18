import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack?: string;
  errorComponentStack?: string;
  copied: boolean;
  timestamp: string;
}

class NexusRootErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { 
      hasError: false, 
      errorMessage: '', 
      errorStack: undefined, 
      errorComponentStack: undefined,
      copied: false,
      timestamp: new Date().toISOString()
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'Wystąpił nieobsłużony błąd środowiska wykonawczego UI.',
      errorStack: error?.stack,
      timestamp: new Date().toISOString()
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Nexus Root ErrorBoundary] Złapano krytyczny wyjątek UI:', error, errorInfo);
    this.setState({
      errorComponentStack: errorInfo.componentStack || undefined
    });
  }

  handleCopyDiagnostics = async () => {
    const payload = JSON.stringify({
      appName: 'PROJECT NEXUS',
      version: '1.0.0-PRO',
      timestamp: this.state.timestamp,
      userAgent: navigator.userAgent,
      url: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      errorMessage: this.state.errorMessage,
      stack: this.state.errorStack,
      componentStack: this.state.errorComponentStack,
      localStorageKeys: Object.keys(localStorage)
    }, null, 2);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = payload;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (e) {
      console.warn('[ErrorBoundary] Kopiowanie do schowka nie powiodło się:', e);
    }
  };

  handleResetState = () => {
    try {
      localStorage.removeItem('nexus_target_path');
      localStorage.removeItem('nexus_pinned_ids');
      localStorage.removeItem('nexus_last_view');
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  handleHardReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = window.location.pathname;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0a0a0e] text-white flex items-center justify-center p-4 sm:p-6 font-mono select-none">
          <div className="max-w-xl w-full rounded-3xl bg-[#14141b] border border-rose-500/40 p-6 sm:p-8 space-y-6 shadow-2xl text-center relative overflow-hidden backdrop-blur-xl animate-scaleUp">
            
            {/* Ambient Red Glow Backdrop */}
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header Icon */}
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/25 to-rose-700/10 border border-rose-500/40 text-rose-300 flex items-center justify-center mx-auto text-3xl font-black shadow-xl shadow-rose-950/50">
              ⚠️
            </div>
            
            {/* Header Text */}
            <div className="relative z-10 space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                System Ochrony Interfejsu Nexus
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Zabezpieczono Awarię Renderowania
              </h1>
              <p className="text-xs text-[#a1a1aa] leading-relaxed max-w-md mx-auto font-sans">
                Aplikacja przechwyciła nieobsłużony wyjątek komponentu React. Dane systemowe i stan lokalnego serwera pozostały nienaruszone.
              </p>
            </div>

            {/* Error Message Box */}
            <div className="relative z-10 text-left bg-black/60 p-4 rounded-2xl border border-white/10 space-y-2 font-mono">
              <div className="flex items-center justify-between text-[10px] text-rose-400 font-semibold tracking-wider uppercase">
                <span>Komunikat Błędu</span>
                <span className="text-[#71717a] font-normal">{new Date(this.state.timestamp).toLocaleTimeString('pl-PL')}</span>
              </div>
              <p className="text-xs text-rose-200/95 break-words leading-relaxed font-mono select-text">
                {this.state.errorMessage}
              </p>
            </div>

            {/* Stack Trace Collapsible */}
            {(this.state.errorStack || this.state.errorComponentStack) && (
              <details className="relative z-10 text-left bg-black/40 p-3.5 rounded-2xl border border-white/5 text-[11px] text-[#71717a]">
                <summary className="cursor-pointer hover:text-white transition select-none font-semibold text-xs flex items-center justify-between">
                  <span>Pokaż pełny zrzut stosu wywołań (Stack Trace)</span>
                  <span className="text-[10px] text-purple-400">Rozwiń ▼</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {this.state.errorStack && (
                    <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap max-h-36 font-mono text-[#a1a1aa] bg-black/50 p-2.5 rounded-xl select-text">
                      {this.state.errorStack}
                    </pre>
                  )}
                  {this.state.errorComponentStack && (
                    <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap max-h-28 font-mono text-[#71717a] bg-black/30 p-2 rounded-xl select-text">
                      {this.state.errorComponentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action Buttons */}
            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-purple-900/40 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <span>↻ Przeładuj aplikację</span>
              </button>
              
              <button
                type="button"
                onClick={this.handleCopyDiagnostics}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-[#1e1e28] hover:bg-[#282836] border border-white/10 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{this.state.copied ? '✓ Skopiowano raport' : '📋 Kopiuj diagnostykę'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetState}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2"
                title="Czyści lokalny cache folderów i odświeża interfejs"
              >
                <span>Resetuj cache</span>
              </button>
            </div>

            <div className="relative z-10 pt-1">
              <button
                type="button"
                onClick={this.handleHardReset}
                className="text-[11px] text-[#71717a] hover:text-rose-400 transition underline underline-offset-4 cursor-pointer"
              >
                Pełny reset pamięci podręcznej przeglądarki (Wyloguj i wyczyść wszystko)
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global Network Status Notification
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Nexus Network] Przywrócono łączność sieciową');
  });
  window.addEventListener('offline', () => {
    console.warn('[Nexus Network] Utracono łączność sieciową — tryb lokalny');
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <NexusRootErrorBoundary>
        <App />
      </NexusRootErrorBoundary>
    </React.StrictMode>
  );
}
