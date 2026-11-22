import type { ScheduledSession } from '../types';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export interface LocalNotificationRequest {
  title: string;
  body: string;
  tag: string;
  url?: string;
  scheduledId?: number | null;
  sessionId?: number | null;
  triggerAt?: number | null;
  renotify?: boolean;
}

export interface ComputedReminder {
  key: string;
  tag: string;
  scheduledId: number;
  sessionId: number | null;
  sessionTitle: string;
  datePrevue: string;
  targetSessionAtMs: number;
  triggerAtMs: number;
  leadMinutes: number;
  dureeMin: number | null;
}

const SENT_REMINDERS_STORAGE_KEY = 'tp_sent_session_reminders_v1';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): BrowserNotificationPermission {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return getNotificationPermission();
  }
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return reg;
  } catch {
    return null;
  }
}

export async function showPWALocalNotification(payload: LocalNotificationRequest): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') {
    return false;
  }

  const reg = await getReadyServiceWorkerRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    try {
      const options: Record<string, unknown> = {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/brand/terrain-mark.png',
        tag: payload.tag,
        renotify: Boolean(payload.renotify),
        vibrate: [180, 90, 180],
        data: {
          url: payload.url || '/?tab=programme',
          scheduledId: payload.scheduledId ?? null,
          sessionId: payload.sessionId ?? null,
        },
        actions: [
          { action: 'open-session', title: 'Ouvrir la séance' },
          { action: 'dismiss', title: 'Plus tard' },
        ],
      };
      await reg.showNotification(payload.title, options as NotificationOptions);
      return true;
    } catch {
      // Fallback to controller postMessage or window Notification below
    }
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_SESSION_REMINDER',
      payload,
    });
    return true;
  }

  try {
    const notif = new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      tag: payload.tag,
    });
    notif.onclick = () => {
      window.focus();
      if (payload.scheduledId) {
        window.dispatchEvent(
          new CustomEvent('tp-open-scheduled-session', {
            detail: { scheduledId: payload.scheduledId, sessionId: payload.sessionId ?? null },
          })
        );
      }
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function cancelPWAScheduledNotifications(tagPrefix = 'tp-session-'): Promise<void> {
  const reg = await getReadyServiceWorkerRegistration();
  if (reg && typeof reg.getNotifications === 'function') {
    try {
      const list = await (reg as ServiceWorkerRegistration & {
        getNotifications(filter?: { includeTriggered?: boolean }): Promise<Notification[]>;
      }).getNotifications({ includeTriggered: true });
      for (const notif of list) {
        if (notif.tag && notif.tag.startsWith(tagPrefix)) {
          notif.close();
        }
      }
    } catch {
      // Ignore unsupported includeTriggered
    }
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CANCEL_REMINDERS',
      tagPrefix,
    });
  }
}

export function getSentReminderKeys(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SENT_REMINDERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && ts >= cutoff) {
        pruned[k] = ts;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

export function markReminderSent(key: string): void {
  try {
    const map = getSentReminderKeys();
    map[key] = Date.now();
    localStorage.setItem(SENT_REMINDERS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function parseLocalDateAndTimeMs(dateIso: string, timeHHMM: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = timeHHMM.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    return NaN;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export function computeUpcomingReminders(
  schedule: ScheduledSession[],
  reminderTime: string,
  leadMinutes: number
): ComputedReminder[] {
  const safeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime) ? reminderTime : '18:00';
  const safeLead = Number.isFinite(leadMinutes) ? Math.max(0, leadMinutes) : 30;

  return schedule
    .filter((slot) => !slot.is_rest_day && !slot.completed && Boolean(slot.session))
    .map((slot) => {
      const targetSessionAtMs = parseLocalDateAndTimeMs(slot.date_prevue, safeTime);
      const triggerAtMs = targetSessionAtMs - safeLead * 60 * 1000;
      return {
        key: `${slot.id}_${slot.date_prevue}_${safeTime}_${safeLead}`,
        tag: `tp-session-${slot.id}-${slot.date_prevue}`,
        scheduledId: slot.id,
        sessionId: slot.session_id,
        sessionTitle: slot.session?.titre || 'Séance d’entraînement',
        datePrevue: slot.date_prevue,
        targetSessionAtMs,
        triggerAtMs,
        leadMinutes: safeLead,
        dureeMin: slot.session?.duree_min ?? null,
      };
    })
    .filter((item) => Number.isFinite(item.triggerAtMs))
    .sort((a, b) => a.triggerAtMs - b.triggerAtMs);
}

export function formatReminderLeadLabel(leadMinutes: number): string {
  if (leadMinutes === 0) return 'À l’heure de la séance';
  if (leadMinutes < 60) return `${leadMinutes} min avant`;
  const hours = leadMinutes / 60;
  return `${hours} h avant`;
}

export function formatReminderNotificationCopy(reminder: ComputedReminder, reminderTime: string): {
  title: string;
  body: string;
} {
  const leadText =
    reminder.leadMinutes === 0
      ? `C’est l’heure de votre séance (${reminderTime})`
      : `Séance prévue dans ${reminder.leadMinutes >= 60 ? `${reminder.leadMinutes / 60} h` : `${reminder.leadMinutes} min`} (${reminderTime})`;

  const durationText = reminder.dureeMin ? ` · ${reminder.dureeMin} min` : '';
  return {
    title: `Terrain+ · ${reminder.sessionTitle}`,
    body: `${leadText}${durationText}. Appuyez pour ouvrir le guide terrain.`,
  };
}
