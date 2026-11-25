import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScheduledSession } from '../types';
import {
  computeUpcomingReminders,
  formatReminderBannerCopy,
  getBrowserNotificationPermission,
  getSentReminderKeys,
  hasBrowserNotifiedKey,
  markBrowserNotifiedKey,
  markReminderSent,
  showBrowserNotification,
  type ComputedReminder,
} from '../lib/pwaNotifications';

interface UseSessionRemindersOptions {
  enabled: boolean;
  reminderTime: string;
  leadMinutes: number;
  schedule: ScheduledSession[];
}

export function useSessionReminders({
  enabled,
  reminderTime,
  leadMinutes,
  schedule,
}: UseSessionRemindersOptions) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, number>>(() => getSentReminderKeys());

  const upcomingReminders = useMemo(
    () => computeUpcomingReminders(schedule, reminderTime, leadMinutes),
    [schedule, reminderTime, leadMinutes]
  );

  const nextReminder: ComputedReminder | null = useMemo(() => {
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    return (
      upcomingReminders.find((r) => r.targetSessionAtMs >= nowMs) ||
      upcomingReminders.find((r) => r.targetSessionAtMs >= startOfToday.getTime()) ||
      upcomingReminders[0] ||
      null
    );
  }, [upcomingReminders, nowMs]);

  const dueReminder: ComputedReminder | null = useMemo(() => {
    if (!enabled) return null;
    const fourHoursMs = 4 * 60 * 60 * 1000;
    return (
      upcomingReminders.find(
        (rem) =>
          !dismissedKeys[rem.key] &&
          nowMs >= rem.triggerAtMs &&
          nowMs <= rem.targetSessionAtMs + fourHoursMs
      ) || null
    );
  }, [enabled, upcomingReminders, dismissedKeys, nowMs]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNowMs(Date.now());
    const intervalId = window.setInterval(tick, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !dueReminder) return;
    if (getBrowserNotificationPermission() !== 'granted') return;
    if (hasBrowserNotifiedKey(dueReminder.key)) return;

    markBrowserNotifiedKey(dueReminder.key);
    const copy = formatReminderBannerCopy(dueReminder, reminderTime);
    void showBrowserNotification({
      title: `Terrain+ · ${copy.title}`,
      body: copy.body,
      tag: dueReminder.tag,
      url: `/?tab=programme&scheduledId=${dueReminder.scheduledId}`,
    });
  }, [enabled, dueReminder, reminderTime]);

  const dismissReminder = useCallback((key: string) => {
    markReminderSent(key);
    setDismissedKeys(getSentReminderKeys());
  }, []);

  return {
    upcomingReminders,
    nextReminder,
    dueReminder,
    dismissReminder,
  };
}
