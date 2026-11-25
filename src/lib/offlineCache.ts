import type { SessionTemplate } from '../types';

const SESSIONS_CACHE_KEY = 'terrain_plus_offline_sessions_v1';
const PENDING_COMPLETIONS_KEY = 'terrain_plus_pending_completions_v1';

export interface PendingSessionCompletion {
  id: string;
  scheduled_id: number | null;
  session_id: number | null;
  ressenti_fatigue: number;
  difficulte: number;
  qualite_sommeil?: number;
  recorded_at: string;
}

export function getOfflineSessions(): Record<number, SessionTemplate> {
  try {
    const raw = localStorage.getItem(SESSIONS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, SessionTemplate>) : {};
  } catch {
    return {};
  }
}

export function saveSessionOffline(session: SessionTemplate): void {
  const current = getOfflineSessions();
  current[session.id] = session;
  localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(current));
}

export function removeSessionOffline(sessionId: number): void {
  const current = getOfflineSessions();
  delete current[sessionId];
  localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(current));
}

export function queueOfflineCompletion(item: Omit<PendingSessionCompletion, 'id' | 'recorded_at'>): void {
  const list = getPendingCompletions();
  list.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recorded_at: new Date().toISOString(),
  });
  localStorage.setItem(PENDING_COMPLETIONS_KEY, JSON.stringify(list));
}

export function getPendingCompletions(): PendingSessionCompletion[] {
  try {
    const raw = localStorage.getItem(PENDING_COMPLETIONS_KEY);
    return raw ? (JSON.parse(raw) as PendingSessionCompletion[]) : [];
  } catch {
    return [];
  }
}

export function clearPendingCompletion(id: string): void {
  const list = getPendingCompletions().filter((item) => item.id !== id);
  localStorage.setItem(PENDING_COMPLETIONS_KEY, JSON.stringify(list));
}
