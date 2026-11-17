const SESSION_TOKEN_KEY = 'tp_session_token_v1';
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

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && typeof data.sessionToken === 'string') {
    setSessionToken(data.sessionToken);
  }
  if (res.status === 401 && url === '/api/auth/me') {
    clearSessionToken();
  }
  if (!res.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'Erreur réseau ou serveur.',
      res.status,
      data
    );
  }
  return data as T;
}
