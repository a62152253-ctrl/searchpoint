/**
 * PROJECT NEXUS - Autonomous File Intelligence
 * Production SaaS Authentication Client & Unified API Network Engine
 * HMAC-signed identity verification, machine-bound .searched handling,
 * and resilient typed HTTP transport with auto-retry & auth lifecycle hooks.
 */

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  tier?: 'FREE' | 'PRO' | 'ENTERPRISE';
  registeredAt?: string;
}

export interface SearchedKeyFile {
  magic: string;
  version: string;
  userId: string;
  username: string;
  email: string;
  registeredAt: string;
  machineBoundHash: string;
  recoveryToken: string;
  integritySignature: string;
  securityNotice: string;
  lastRotated?: string;
}

export interface PasswordStrengthInfo {
  score: number; // 0..4
  label: string;
  colorClass: string;
  barColor: string;
  checks: {
    minLength: boolean;
    hasMixedCase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  skipAuth?: boolean;
}

const TOKEN_KEY = 'nexus_auth_token';
const USER_KEY = 'nexus_auth_user';
const LAST_KEYFILE_CACHE = 'nexus_last_searched_keyfile';

// ============================================================================
// 1. PASSWORD STRENGTH ANALYZER
// ============================================================================

export function evaluatePasswordStrength(password: string): PasswordStrengthInfo {
  const checks = {
    minLength: password.length >= 8,
    hasMixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password)
  };

  if (!password) {
    return {
      score: 0,
      label: 'Wprowadź hasło',
      colorClass: 'text-white/40',
      barColor: 'bg-white/10',
      checks
    };
  }

  let score = 0;
  if (checks.minLength) score += 1;
  if (checks.hasMixedCase) score += 1;
  if (checks.hasNumber) score += 1;
  if (checks.hasSpecial || password.length >= 12) score += 1;

  if (!checks.minLength) {
    return {
      score: 1,
      label: 'Za krótkie (min. 8 znaków)',
      colorClass: 'text-rose-400',
      barColor: 'bg-rose-500',
      checks
    };
  }

  const levels: Record<number, { label: string; colorClass: string; barColor: string }> = {
    1: { label: 'Słabe', colorClass: 'text-rose-400', barColor: 'bg-rose-500' },
    2: { label: 'Średnie', colorClass: 'text-amber-400', barColor: 'bg-amber-400' },
    3: { label: 'Silne', colorClass: 'text-cyan-400', barColor: 'bg-cyan-400' },
    4: { label: 'Pancerne (Kryptograficzne)', colorClass: 'text-emerald-400', barColor: 'bg-emerald-400' }
  };

  const level = levels[score] || levels[1];
  return {
    score,
    ...level,
    checks
  };
}

// ============================================================================
// 2. AUTHENTICATION VAULT CLIENT & SESSION MANAGER
// ============================================================================

type AuthStateListener = (user: AuthUser | null) => void;
const authListeners = new Set<AuthStateListener>();

export const nexusAuth = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setSession(token: string, user: AuthUser) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      authListeners.forEach(listener => listener(user));
    } catch (e) {
      console.warn('[nexusAuth] Błąd zapisu sesji do localStorage:', e);
    }
  },

  clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      authListeners.forEach(listener => listener(null));
    } catch (e) {
      console.warn('[nexusAuth] Błąd usuwania sesji:', e);
    }
  },

  onAuthStateChanged(listener: AuthStateListener): () => void {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },

  getCachedUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  getLastKeyFile(): { fileName: string; content: string } | null {
    try {
      const raw = sessionStorage.getItem(LAST_KEYFILE_CACHE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveLastKeyFile(file: { fileName: string; content: string }) {
    try {
      sessionStorage.setItem(LAST_KEYFILE_CACHE, JSON.stringify(file));
    } catch {}
  },

  inspectSearchedFile(rawText: string): SearchedKeyFile {
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('Błąd odczytu struktury pliku .searched. Upewnij się, że plik nie został uszkodzony.');
    }

    if (!parsed || parsed.magic !== 'NEXUS_SEARCHED_KEY_V1') {
      throw new Error('Przesłany plik nie posiada sygnatury NEXUS_SEARCHED_KEY_V1 Project Nexus.');
    }

    if (!parsed.userId || !parsed.username || !parsed.recoveryToken || !parsed.integritySignature) {
      throw new Error('Plik .searched jest niekompletny — brakuje wymaganych pól kryptograficznych.');
    }

    return parsed as SearchedKeyFile;
  },

  async checkAuth(): Promise<AuthUser | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await nexusApi.get<{ authenticated: boolean; user: AuthUser }>('/api/auth/me', {
        timeoutMs: 6000,
        retries: 1
      });
      if (res?.authenticated && res.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        return res.user;
      }
      this.clearSession();
      return null;
    } catch {
      return this.getCachedUser();
    }
  },

  async register(username: string, email: string, password: string): Promise<{
    success: boolean;
    user: AuthUser;
    token: string;
    searchedFile: { fileName: string; content: string };
  }> {
    const data = await nexusApi.post<{
      success: boolean;
      user: AuthUser;
      token: string;
      searchedFile: { fileName: string; content: string };
    }>('/api/auth/register', { username: username.trim(), email: email.trim(), password });

    if (!data?.success || !data.token) {
      throw new Error('Błąd rejestracji konta. Spróbuj ponownie.');
    }

    this.setSession(data.token, data.user);

    if (data.searchedFile) {
      this.saveLastKeyFile(data.searchedFile);
      this.downloadSearchedFile(data.searchedFile.fileName, data.searchedFile.content);
    }

    return data;
  },

  async login(identifier: string, password: string): Promise<{
    success: boolean;
    user: AuthUser;
    token: string;
  }> {
    const data = await nexusApi.post<{
      success: boolean;
      user: AuthUser;
      token: string;
    }>('/api/auth/login', { identifier: identifier.trim(), password });

    if (!data?.success || !data.token) {
      throw new Error('Nieprawidłowa nazwa użytkownika / e-mail lub hasło.');
    }

    this.setSession(data.token, data.user);
    return data;
  },

  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await nexusApi.post('/api/auth/logout', {}, { timeoutMs: 3000 });
      } catch {}
    }
    this.clearSession();
  },

  async resetPasswordWithKeyFile(searchedFileContent: string, newPassword: string): Promise<{
    success: boolean;
    message: string;
    user: AuthUser;
    token: string;
    newSearchedFile?: { fileName: string; content: string };
  }> {
    const data = await nexusApi.post<{
      success: boolean;
      message: string;
      user: AuthUser;
      token: string;
      newSearchedFile?: { fileName: string; content: string };
    }>('/api/auth/forgot-password-verify', { searchedFileContent, newPassword });

    if (!data?.success || !data.token) {
      throw new Error('Nie udało się zweryfikować pliku .searched. Upewnij się, że plik nie został zmodyfikowany.');
    }

    this.setSession(data.token, data.user);

    if (data.newSearchedFile) {
      this.saveLastKeyFile(data.newSearchedFile);
      this.downloadSearchedFile(data.newSearchedFile.fileName, data.newSearchedFile.content);
    }

    return data;
  },

  downloadSearchedFile(fileName: string, content: string) {
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[nexusAuth] Błąd zapisu pliku klucza:', err);
    }
  }
};

// ============================================================================
// 3. UNIFIED PRODUCTION API NETWORK ENGINE (nexusApi & nexusAuthFetch)
// ============================================================================

export class NexusApiError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number = 0, payload: any = null) {
    super(message);
    this.name = 'NexusApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function nexusAuthFetch(input: RequestInfo | URL, init?: ApiRequestOptions): Promise<Response> {
  const token = nexusAuth.getToken();
  const headers = new Headers(init?.headers || {});
  
  if (!init?.skipAuth && token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const timeoutMs = init?.timeoutMs ?? 20000;
  const controller = new AbortController();
  const userSignal = init?.signal;

  let abortedByUser = false;
  const onUserAbort = () => {
    abortedByUser = true;
    controller.abort();
  };
  if (userSignal) {
    userSignal.addEventListener('abort', onUserAbort);
  }

  const timer = setTimeout(() => {
    if (!abortedByUser) controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      credentials: init?.credentials ?? 'same-origin',
      headers,
      signal: controller.signal
    });
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError' && !abortedByUser) {
      throw new NexusApiError(`Upłynął limit czasu żądania (${Math.round(timeoutMs / 1000)}s). Sprawdź stan lokalnego serwera.`, 408);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (userSignal) {
      userSignal.removeEventListener('abort', onUserAbort);
    }
  }
}

class NexusApiClient {
  async request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const retries = options.retries ?? 0;
    const retryDelay = options.retryDelayMs ?? 800;
    let lastError: any = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await nexusAuthFetch(endpoint, options);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          if (response.status === 401 && !options.skipAuth && !endpoint.includes('/api/auth/')) {
            console.warn('[nexusApi] Sesja wygasła (401) dla endpointu:', endpoint);
            nexusAuth.clearSession();
          }

          const errMsg = data?.error || data?.message || `Żądanie API zakończone błędem (${response.status}).`;
          throw new NexusApiError(errMsg, response.status, data);
        }

        return data as T;
      } catch (err: any) {
        lastError = err;
        // Don't retry client-side 4xx errors
        if (err instanceof NexusApiError && err.status >= 400 && err.status < 500) {
          throw err;
        }
        if (attempt < retries) {
          const randArray = new Uint32Array(1);
          if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(randArray);
          } else {
            randArray[0] = Date.now();
          }
          const jitter = randArray[0] % 200;
          await new Promise(r => setTimeout(r, (retryDelay * (attempt + 1)) + jitter));
        }
      }
    }

    throw lastError || new NexusApiError('Nieznany błąd sieciowy.');
  }

  get<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: ApiRequestOptions): Promise<T> {
    const headers = new Headers(options?.headers || {});
    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  put<T>(endpoint: string, body?: any, options?: ApiRequestOptions): Promise<T> {
    const headers = new Headers(options?.headers || {});
    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  patch<T>(endpoint: string, body?: any, options?: ApiRequestOptions): Promise<T> {
    const headers = new Headers(options?.headers || {});
    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  del<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const nexusApi = new NexusApiClient();

// Global transparent interceptor for native fetch on relative endpoints
if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !(window as any).__nexusFetchPatched) {
  const originalFetch = window.fetch.bind(window);
  (window as any).__nexusFetchPatched = true;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.pathname
        : input?.url || '';
    const isLocalApi = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    if (isLocalApi) {
      const token = nexusAuth.getToken();
      if (token) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, {
          ...init,
          credentials: init?.credentials ?? 'same-origin',
          headers
        });
      }
    }
    return originalFetch(input, init);
  };
}
