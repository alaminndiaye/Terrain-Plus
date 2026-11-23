import type { ScheduledSession } from '../types';

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

export const SENT_REMINDERS_STORAGE_KEY = 'tp_sent_session_reminders_v1';

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

export function formatReminderBannerCopy(reminder: ComputedReminder, reminderTime: string): {
  title: string;
  body: string;
} {
  const leadText =
    reminder.leadMinutes === 0
      ? `Séance prévue à ${reminderTime}`
      : `Séance prévue dans ${reminder.leadMinutes >= 60 ? `${reminder.leadMinutes / 60} h` : `${reminder.leadMinutes} min`} (${reminderTime})`;

  const durationText = reminder.dureeMin ? ` · ${reminder.dureeMin} min` : '';
  return {
    title: reminder.sessionTitle,
    body: `${leadText}${durationText}`,
  };
}
