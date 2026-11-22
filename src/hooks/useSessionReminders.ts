import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScheduledSession } from '../types';
import {
  cancelPWAScheduledNotifications,
  computeUpcomingReminders,
  formatReminderNotificationCopy,
  getNotificationPermission,
  getSentReminderKeys,
  markReminderSent,
  requestBrowserNotificationPermission,
  showPWALocalNotification,
  type BrowserNotificationPermission,
  type ComputedReminder,
} from '../lib/pwaNotifications';

interface UseSessionRemindersOptions {
  enabled: boolean;
  reminderTime: string;
  leadMinutes: number;
  schedule: ScheduledSession[];
  onOpenScheduledSession?: (scheduledId: number) => void;
}

export function useSessionReminders({
  enabled,
  reminderTime,
  leadMinutes,
  schedule,
  onOpenScheduledSession,
}: UseSessionRemindersOptions) {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(() =>
    getNotificationPermission()
  );
  const [swReady, setSwReady] = useState(false);

  const upcomingReminders = useMemo(
    () => computeUpcomingReminders(schedule, reminderTime, leadMinutes),
    [schedule, reminderTime, leadMinutes]
  );

  const nextReminder: ComputedReminder | null = useMemo(() => {
    const now = Date.now();
    // Pick next future reminder, or today's still-uncompleted session reminder
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return (
      upcomingReminders.find((r) => r.targetSessionAtMs >= now) ||
      upcomingReminders.find((r) => r.targetSessionAtMs >= startOfToday.getTime()) ||
      upcomingReminders[0] ||
      null
    );
  }, [upcomingReminders]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let active = true;
    navigator.serviceWorker.ready
      .then(() => {
        if (active) setSwReady(true);
      })
      .catch(() => {
        if (active) setSwReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Listen for notification clicks routed from the Service Worker or fallback Notification API
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_SCHEDULED_SESSION' && event.data?.scheduledId) {
        onOpenScheduledSession?.(Number(event.data.scheduledId));
      }
    };
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ scheduledId?: number }>).detail;
      if (detail?.scheduledId) {
        onOpenScheduledSession?.(Number(detail.scheduledId));
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    window.addEventListener('tp-open-scheduled-session', handleCustomEvent);

    return () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      window.removeEventListener('tp-open-scheduled-session', handleCustomEvent);
    };
  }, [onOpenScheduledSession]);

  // Refresh permission state when user returns from browser settings
  useEffect(() => {
    const syncPermission = () => setPermission(getNotificationPermission());
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  // Schedule local reminders with in-app timers and Service Worker catch-up checks
  useEffect(() => {
    if (!enabled || permission !== 'granted') {
      void cancelPWAScheduledNotifications('tp-session-');
      return;
    }

    const timers: number[] = [];

    const checkAndFireDueReminders = async () => {
      const now = Date.now();
      const sentMap = getSentReminderKeys();
      const fourHoursMs = 4 * 60 * 60 * 1000;

      for (const rem of upcomingReminders) {
        if (sentMap[rem.key]) continue;
        // Fire if we are inside [triggerAtMs, targetSessionAtMs + 4h] on the session day
        if (now >= rem.triggerAtMs && now <= rem.targetSessionAtMs + fourHoursMs) {
          const copy = formatReminderNotificationCopy(rem, reminderTime);
          const shown = await showPWALocalNotification({
            title: copy.title,
            body: copy.body,
            tag: rem.tag,
            scheduledId: rem.scheduledId,
            sessionId: rem.sessionId,
            url: `/?tab=programme&scheduledId=${rem.scheduledId}`,
          });
          if (shown) {
            markReminderSent(rem.key);
          }
        }
      }
    };

    const scheduleUpcoming = async () => {
      const now = Date.now();
      const next24h = now + 24 * 60 * 60 * 1000;

      // In-app precision timers for reminders within the next 24h (works while PWA is active)
      for (const rem of upcomingReminders) {
        const delay = rem.triggerAtMs - now;
        if (delay > 500 && rem.triggerAtMs <= next24h) {
          const timerId = window.setTimeout(() => {
            void checkAndFireDueReminders();
          }, delay);
          timers.push(timerId);
        }
      }

      await checkAndFireDueReminders();
    };

    void scheduleUpcoming();

    const intervalId = window.setInterval(() => {
      void checkAndFireDueReminders();
    }, 60 * 1000);

    const onVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        void checkAndFireDueReminders();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityOrOnline);
    window.addEventListener('online', onVisibilityOrOnline);

    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityOrOnline);
      window.removeEventListener('online', onVisibilityOrOnline);
    };
  }, [enabled, permission, upcomingReminders, reminderTime]);

  const requestPermission = useCallback(async () => {
    const next = await requestBrowserNotificationPermission();
    setPermission(next);
    return next;
  }, []);

  const sendTestNotification = useCallback(async (): Promise<{ ok: boolean; permission: BrowserNotificationPermission }> => {
    let current = getNotificationPermission();
    if (current === 'default') {
      current = await requestBrowserNotificationPermission();
      setPermission(current);
    }
    if (current !== 'granted') {
      return { ok: false, permission: current };
    }

    const preview = nextReminder;
    const title = preview
      ? `Terrain+ · Rappel : ${preview.sessionTitle}`
      : 'Terrain+ · Rappel d’entraînement activé';
    const body = preview
      ? `Votre séance (${preview.datePrevue} à ${reminderTime}${preview.dureeMin ? ` · ${preview.dureeMin} min` : ''}) est prête. Appuyez pour l’ouvrir.`
      : `Vos rappels locaux Terrain+ sont actifs pour ${reminderTime}. Vous serez prévenu avant chaque séance programmée.`;

    const ok = await showPWALocalNotification({
      title,
      body,
      tag: 'tp-reminder-test',
      renotify: true,
      scheduledId: preview?.scheduledId ?? null,
      sessionId: preview?.sessionId ?? null,
      url: preview ? `/?tab=programme&scheduledId=${preview.scheduledId}` : '/?tab=programme',
    });

    return { ok, permission: current };
  }, [nextReminder, reminderTime]);

  return {
    permission,
    swReady,
    upcomingReminders,
    nextReminder,
    requestPermission,
    sendTestNotification,
  };
}
