const SESSION_TOKEN_KEY = 'tp_session_token_v1';
export const CACHED_USER_KEY = 'tp_cached_user_v1';
export const WORKSPACE_CACHE_KEYS = [
  'terrain_plus_athlete_workspace_v1',
  'terrain_plus_coach_overview_v1',
  'terrain_plus_admin_overview_v1',
  'terrain_plus_minister_overview_v1',
] as const;

let memorySessionToken: string | null = null;

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const stored = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return null;
}

export function setSessionToken(token: string | null | undefined): void {
  if (!token) return;
  memorySessionToken = token;
  try {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

export function clearSessionToken(): void {
  memorySessionToken = null;
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

export function readJsonCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJsonCache(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / restricted storage errors
  }
}

export function removeCacheKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

export function clearAllWorkspaceCaches(): void {
  removeCacheKey(CACHED_USER_KEY);
  for (const key of WORKSPACE_CACHE_KEYS) {
    removeCacheKey(key);
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
    } catch {
      // Ignore postMessage failures
    }
  }
}

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    payload: Record<string, unknown> = {},
    isNetworkError = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.isNetworkError = isNetworkError;
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

export async function apiRequest<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries, signal: externalSignal, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const maxAttempts = retries !== undefined ? Math.max(1, retries + 1) : method === 'GET' ? 2 : 1;

  const token = getSessionToken();
  const headers: Record<string, string> = {
    ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        window.clearTimeout(timeoutId);
        throw new ApiError('Requête annulée.', 0, {}, true);
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && typeof data.sessionToken === 'string') {
        setSessionToken(data.sessionToken);
      }
      if (res.status === 401 && url === '/api/auth/me') {
        clearSessionToken();
      }
      if (!res.ok) {
        const retryableStatus = res.status === 502 || res.status === 503 || res.status === 504;
        const err = new ApiError(
          typeof data.error === 'string' ? data.error : 'Erreur réseau ou serveur.',
          res.status,
          data,
          false
        );
        if (retryableStatus && attempt < maxAttempts) {
          lastError = err;
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          continue;
        }
        throw err;
      }
      return data as T;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      const networkErr = timedOut
        ? new ApiError('Connexion lente ou instable : délai d’attente dépassé.', 0, {}, true)
        : new ApiError(
            typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'Vous êtes hors ligne. Vérifiez votre connexion.'
              : 'Connexion réseau interrompue.',
            0,
            {},
            true
          );

      if (attempt < maxAttempts && !externalSignal?.aborted) {
        lastError = networkErr;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        continue;
      }
      throw networkErr;
    } finally {
      window.clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiError('Erreur réseau ou serveur.', 0, {}, true);
}

