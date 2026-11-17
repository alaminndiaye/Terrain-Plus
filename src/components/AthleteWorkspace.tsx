import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  HardDriveDownload,
  LayoutDashboard,
  Lock,
  LogOut,
  Maximize2,
  Play,
  ShieldCheck,
  Trash2,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ApiError,
  apiRequest,
  clearAllWorkspaceCaches,
  clearSessionToken,
  readJsonCache,
  writeJsonCache,
} from '../lib/api';
import {
  clearPendingCompletion,
  getOfflineSessions,
  getPendingCompletions,
  removeSessionOffline,
  saveSessionOffline,
} from '../lib/offlineCache';
import { formatReminderLeadLabel } from '../lib/pwaNotifications';
import { TECHNIQUE_FICHES, type TechniqueCategory, type TechniqueFiche } from '../data/exerciseMedia';
import { LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSessionReminders } from '../hooks/useSessionReminders';
import type {
  AthleteLevel,
  AthletePlanTier,
  AthleteWorkspacePayload,
  ScheduledSession,
  SessionTemplate,
  SportCode,
} from '../types';
import { GuidedSessionPlayer } from './GuidedSessionPlayer';
import { GuidedTourModal } from './GuidedTourModal';
import { PainReportModal } from './PainReportModal';
import { PWAInstallButton } from './PWAControls';

type AthleteTab = 'dashboard' | 'programme' | 'evaluation' | 'profil';

interface AthleteWorkspaceProps {
  showGuidedTourOnMount: boolean;
  onDismissGuidedTour: () => void;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const WORKSPACE_CACHE_KEY = 'terrain_plus_athlete_workspace_v1';

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFrenchDateLong(iso: string): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDateLocal(iso));
  return capitalizeFirst(formatted);
}

function formatMonthTitle(year: number, month: number): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));
  return capitalizeFirst(formatted);
}

export const AthleteWorkspace: React.FC<AthleteWorkspaceProps> = ({
  showGuidedTourOnMount,
  onDismissGuidedTour,
  onLoggedOut,
  onSessionExpired,
}) => {
  const isOnline = useOnlineStatus();
  const [cachedInit] = useState<AthleteWorkspacePayload | null>(() =>
    readJsonCache<AthleteWorkspacePayload>(WORKSPACE_CACHE_KEY)
  );
  const [tab, setTab] = useState<AthleteTab>('dashboard');
  const [data, setData] = useState<AthleteWorkspacePayload | null>(cachedInit);
  const [loading, setLoading] = useState(!cachedInit);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const [activePlayer, setActivePlayer] = useState<{
    session: SessionTemplate;
    scheduledId: number | null;
  } | null>(null);
  const [showPainModal, setShowPainModal] = useState(false);

  // Offline downloaded sessions
  const [offlineMap, setOfflineMap] = useState<Record<number, SessionTemplate>>(() => getOfflineSessions());

  // Library filter, weekly summary tab & programme calendar
  const [levelFilter, setLevelFilter] = useState<'all' | AthleteLevel>('all');
  const [weekDetailFilter, setWeekDetailFilter] = useState<'completed' | 'remaining'>('completed');
  const [programmeView, setProgrammeView] = useState<'calendar' | 'list'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => toIsoDateLocal(new Date()));
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'completed' | 'scheduled'>('all');

  // Evaluation form & embedded stopwatch
  const [evalValues, setEvalValues] = useState<Record<string, string>>({});
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [chronoRunning, setChronoRunning] = useState(false);
  const [chronoSeconds, setChronoSeconds] = useState(0);
  const [chronoMode, setChronoMode] = useState<'up' | '30' | '20'>('up');

  // Technical fiches & freemium plan states
  const [ficheCategoryFilter, setFicheCategoryFilter] = useState<'Toutes' | TechniqueCategory>('Toutes');
  const [selectedFicheModal, setSelectedFicheModal] = useState<TechniqueFiche | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; reason: string } | null>(null);

  // Profile form states
  const [newWeight, setNewWeight] = useState('');
  const [profileNom, setProfileNom] = useState(() => cachedInit?.user.nom || '');
  const [profilePrenom, setProfilePrenom] = useState(() => cachedInit?.user.prenom || '');
  const [profileNiveau, setProfileNiveau] = useState<AthleteLevel>(() => cachedInit?.profile.niveau || 'debutant');
  const [profilePoste, setProfilePoste] = useState(() => cachedInit?.profile.poste || '');
  const [profileTaille, setProfileTaille] = useState(() =>
    cachedInit?.profile.taille_cm ? String(cachedInit.profile.taille_cm) : ''
  );
  const [profileLangue, setProfileLangue] = useState<'fr' | 'wo'>(() => cachedInit?.user.langue || 'fr');
  const [ecoMode, setEcoMode] = useState(() => Boolean(cachedInit?.profile.eco_data_mode));
  const [notifEnabled, setNotifEnabled] = useState(() => cachedInit?.profile.notifications_enabled ?? true);
  const [reminderTime, setReminderTime] = useState(() => cachedInit?.profile.reminder_time || '18:00');
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(() =>
    Number(cachedInit?.profile.reminder_lead_minutes ?? 30)
  );
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [pendingSportChange, setPendingSportChange] = useState<SportCode | null>(null);
  const [coachChangeMotif, setCoachChangeMotif] = useState('');
  const [selectedCoachDraftId, setSelectedCoachDraftId] = useState<number | null>(() => cachedInit?.coach?.id || null);
  const [targetPlanDraft, setTargetPlanDraft] = useState<AthletePlanTier>(() => cachedInit?.profile.plan_tier || 'ESSENTIEL');
  const [planSwitchBilling, setPlanSwitchBilling] = useState<'MENSUEL' | 'TRIMESTRIEL'>(() =>
    cachedInit?.profile.plan_billing_cycle === 'TRIMESTRIEL' ? 'TRIMESTRIEL' : 'MENSUEL'
  );
  const [confirmPlanSwitch, setConfirmPlanSwitch] = useState(false);
  const [coachActionSubmitting, setCoachActionSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      const payload = await apiRequest<AthleteWorkspacePayload>('/api/athlete/workspace');
      setData(payload);
      writeJsonCache(WORKSPACE_CACHE_KEY, payload);
      setProfileNom(payload.user.nom);
      setProfilePrenom(payload.user.prenom);
      setProfileNiveau(payload.profile.niveau);
      setProfilePoste(payload.profile.poste || '');
      setProfileTaille(payload.profile.taille_cm ? String(payload.profile.taille_cm) : '');
      setProfileLangue(payload.user.langue);
      setEcoMode(payload.profile.eco_data_mode);
      setNotifEnabled(payload.profile.notifications_enabled);
      setReminderTime(payload.profile.reminder_time || '18:00');
      setReminderLeadMinutes(Number(payload.profile.reminder_lead_minutes ?? 30));
      setTargetPlanDraft(payload.profile.plan_tier || 'ESSENTIEL');
      if (payload.profile.plan_billing_cycle === 'TRIMESTRIEL' || payload.profile.plan_billing_cycle === 'MENSUEL') {
        setPlanSwitchBilling(payload.profile.plan_billing_cycle);
      }
      if (payload.coach?.id) {
        setSelectedCoachDraftId(payload.coach.id);
      }
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      const cached = readJsonCache<AthleteWorkspacePayload>(WORKSPACE_CACHE_KEY);
      if (cached) {
        setData(cached);
        setError('Connexion instable ou hors ligne : affichage des dernières données synchronisées.');
      } else {
        setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  // Sync queued offline completions when online
  useEffect(() => {
    if (!isOnline) return;
    const pending = getPendingCompletions();
    if (pending.length === 0) return;

    (async () => {
      for (const item of pending) {
        try {
          await apiRequest('/api/athlete/complete-session', {
            method: 'POST',
            body: JSON.stringify(item),
          });
          clearPendingCompletion(item.id);
        } catch {
          break;
        }
      }
      loadWorkspace();
    })();
  }, [isOnline, loadWorkspace]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Embedded evaluation timer
  useEffect(() => {
    if (!chronoRunning) return;
    const id = window.setInterval(() => {
      setChronoSeconds((prev) => {
        if (chronoMode === 'up') return prev + 1;
        if (prev <= 1) {
          setChronoRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [chronoRunning, chronoMode]);

  const sportTheme = data ? SPORTS_CONFIG[data.profile.sport_code] : SPORTS_CONFIG.football;
  const currentPlanTier: AthletePlanTier = data?.profile.plan_tier ?? 'ESSENTIEL';
  const isProgressionUnlocked = currentPlanTier === 'PROGRESSION' || currentPlanTier === 'COACH_PRIVE';

  const currentPlanShortLabel =
    currentPlanTier === 'COACH_PRIVE'
      ? 'Suivi Coach · 5 000 F/mois'
      : currentPlanTier === 'PROGRESSION'
        ? data?.profile.plan_billing_cycle === 'TRIMESTRIEL'
          ? 'Progression+ · 4 000 F/trim.'
          : 'Progression+ · 1 500 F/mois'
        : 'Essentiel · 0 FCFA';

  const todaySession: ScheduledSession | null = useMemo(() => {
    if (!data) return null;
    const jsDay = new Date().getDay();
    const weekDay = jsDay === 0 ? 7 : jsDay;
    const exact = data.schedule.find((s) => s.jour_semaine === weekDay && !s.is_rest_day && s.session);
    if (exact) return exact;
    return data.schedule.find((s) => !s.is_rest_day && !s.completed && s.session) || data.schedule.find((s) => !s.is_rest_day && s.session) || null;
  }, [data]);

  const filteredLibrary = useMemo(() => {
    if (!data) return [];
    if (levelFilter === 'all') return data.library;
    return data.library.filter((s) => s.niveau === levelFilter);
  }, [data, levelFilter]);

  const filteredFiches = useMemo(() => {
    if (ficheCategoryFilter === 'Toutes') return TECHNIQUE_FICHES;
    return TECHNIQUE_FICHES.filter((f) => f.category === ficheCategoryFilter);
  }, [ficheCategoryFilter]);

  const evalChartData = useMemo(() => {
    if (!data) return [];
    return [...data.evaluations].reverse().map((ev) => ({
      date: ev.date,
      score: ev.score_global,
    }));
  }, [data]);

  const weeklySummary = useMemo(() => {
    if (!data) {
      return {
        completedSessions: [] as ScheduledSession[],
        remainingSessions: [] as ScheduledSession[],
        totalMinutesDone: 0,
        totalMinutesPlanned: 0,
        completionPct: 0,
        avgFatigue: null as number | null,
        restDaysCount: 0,
        days: [] as Array<{
          dayNum: number;
          dayLabel: string;
          dateLabel: string;
          status: 'done' | 'planned' | 'rest';
          minutesDone: number;
          minutesRemaining: number;
          sessionsCount: number;
        }>,
      };
    }

    const trainingSlots = data.schedule.filter((s) => !s.is_rest_day);
    const completedSessions = trainingSlots
      .filter((s) => s.completed)
      .sort((a, b) => a.jour_semaine - b.jour_semaine);
    const remainingSessions = trainingSlots
      .filter((s) => !s.completed)
      .sort((a, b) => a.jour_semaine - b.jour_semaine);

    const totalMinutesDone = completedSessions.reduce(
      (acc, s) => acc + (s.session?.duree_min ?? 0),
      0
    );
    const totalMinutesPlanned = trainingSlots.reduce(
      (acc, s) => acc + (s.session?.duree_min ?? 0),
      0
    );
    const completionPct =
      trainingSlots.length > 0
        ? Math.min(100, Math.round((completedSessions.length / trainingSlots.length) * 100))
        : 0;

    const fatigueRated = completedSessions.filter((s) => s.ressenti_fatigue !== null);
    const avgFatigue =
      fatigueRated.length > 0
        ? Number(
            (
              fatigueRated.reduce((acc, s) => acc + (s.ressenti_fatigue || 0), 0) /
              fatigueRated.length
            ).toFixed(1)
          )
        : null;

    const restDaysCount = data.schedule.filter((s) => s.is_rest_day).length;

    const days = DAY_NAMES.map((dayLabel, idx) => {
      const dayNum = idx + 1;
      const daySlots = data.schedule.filter((s) => s.jour_semaine === dayNum);
      const dayTraining = daySlots.filter((s) => !s.is_rest_day);
      const dayDone = dayTraining.filter((s) => s.completed);
      const dayRemaining = dayTraining.filter((s) => !s.completed);
      const minutesDone = dayDone.reduce((acc, s) => acc + (s.session?.duree_min ?? 0), 0);
      const minutesRemaining = dayRemaining.reduce((acc, s) => acc + (s.session?.duree_min ?? 0), 0);

      let status: 'done' | 'planned' | 'rest' = 'rest';
      if (dayDone.length > 0) {
        status = 'done';
      } else if (dayRemaining.length > 0) {
        status = 'planned';
      }

      const rawDate = daySlots[0]?.date_prevue || '';
      const dateLabel = rawDate.length >= 10 ? `${rawDate.slice(8, 10)}/${rawDate.slice(5, 7)}` : '—';

      return {
        dayNum,
        dayLabel,
        dateLabel,
        status,
        minutesDone,
        minutesRemaining,
        sessionsCount: dayDone.length,
      };
    });

    return {
      completedSessions,
      remainingSessions,
      totalMinutesDone,
      totalMinutesPlanned,
      completionPct,
      avgFatigue,
      restDaysCount,
      days,
    };
  }, [data]);

  const todayIso = useMemo(() => toIsoDateLocal(new Date()), []);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, ScheduledSession[]> = {};
    if (!data) return map;
    for (const slot of data.schedule) {
      const key = (slot.date_prevue || '').slice(0, 10);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(slot);
    }
    return map;
  }, [data]);

  const calendarGrid = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: Array<{
      iso: string;
      dayNumber: number;
      inCurrentMonth: boolean;
      isToday: boolean;
      completedCount: number;
      plannedCount: number;
      totalMinutes: number;
      hasRest: boolean;
    }> = [];

    let completedInMonth = 0;
    let plannedInMonth = 0;

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, 1 - startOffset + i);
      const iso = toIsoDateLocal(d);
      const inCurrentMonth = d.getMonth() === month && d.getFullYear() === year;
      const rawSlots = sessionsByDate[iso] || [];
      const visibleSlots = rawSlots.filter((s) => {
        if (calendarFilter === 'completed') return s.completed && !s.is_rest_day;
        if (calendarFilter === 'scheduled') return !s.completed && !s.is_rest_day;
        return true;
      });

      const completedSlots = visibleSlots.filter((s) => s.completed && !s.is_rest_day);
      const plannedSlots = visibleSlots.filter((s) => !s.completed && !s.is_rest_day);
      const hasRest = visibleSlots.some((s) => s.is_rest_day);
      const totalMinutes = [...completedSlots, ...plannedSlots].reduce(
        (sum, s) => sum + (s.session?.duree_min ?? 0),
        0
      );

      if (inCurrentMonth) {
        completedInMonth += completedSlots.length;
        plannedInMonth += plannedSlots.length;
      }

      cells.push({
        iso,
        dayNumber: d.getDate(),
        inCurrentMonth,
        isToday: iso === todayIso,
        completedCount: completedSlots.length,
        plannedCount: plannedSlots.length,
        totalMinutes,
        hasRest,
      });
    }

    return { cells, completedInMonth, plannedInMonth };
  }, [calendarMonth, sessionsByDate, calendarFilter, todayIso]);

  const selectedDaySlots = useMemo(() => {
    const raw = sessionsByDate[selectedCalendarDate] || [];
    if (calendarFilter === 'completed') return raw.filter((s) => s.completed && !s.is_rest_day);
    if (calendarFilter === 'scheduled') return raw.filter((s) => !s.completed && !s.is_rest_day);
    return raw;
  }, [sessionsByDate, selectedCalendarDate, calendarFilter]);

  const jumpToCalendarDate = useCallback((iso: string) => {
    const d = parseIsoDateLocal(iso);
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedCalendarDate(iso.slice(0, 10));
  }, []);

  const handleOpenScheduledFromNotification = useCallback(
    (scheduledId: number) => {
      setTab('programme');
      const slot = data?.schedule.find((s) => s.id === scheduledId);
      if (slot?.date_prevue) {
        jumpToCalendarDate(slot.date_prevue);
      }
    },
    [data, jumpToCalendarDate]
  );

  // Support deep-link (?tab=programme&scheduledId=...) when opened from a closed PWA notification
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.search);
    const paramTab = params.get('tab');
    const paramScheduledId = Number(params.get('scheduledId'));
    if (paramTab === 'programme' || Number.isInteger(paramScheduledId) && paramScheduledId > 0) {
      setTab('programme');
      if (Number.isInteger(paramScheduledId) && paramScheduledId > 0) {
        const slot = data.schedule.find((s) => s.id === paramScheduledId);
        if (slot?.date_prevue) {
          jumpToCalendarDate(slot.date_prevue);
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [data, jumpToCalendarDate]);

  const {
    permission: notifPermission,
    swReady,
    supportsTriggerApi,
    nextReminder,
    requestPermission: requestNotifPermission,
    sendTestNotification,
  } = useSessionReminders({
    enabled: Boolean(data?.profile.notifications_enabled),
    reminderTime: data?.profile.reminder_time || reminderTime,
    leadMinutes: Number(data?.profile.reminder_lead_minutes ?? reminderLeadMinutes),
    schedule: data?.schedule || [],
    onOpenScheduledSession: handleOpenScheduledFromNotification,
  });

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    clearAllWorkspaceCaches();
    onLoggedOut();
  };

  const handleToggleOfflineSession = (s: SessionTemplate) => {
    if (offlineMap[s.id]) {
      removeSessionOffline(s.id);
      setOfflineMap(getOfflineSessions());
      return;
    }
    if (s.access_tier === 'PROGRESSION' && !isProgressionUnlocked) {
      setUpgradePrompt({
        title: `Téléchargement Progression+ : ${s.titre}`,
        reason:
          'Activez Progression+ (1 500 FCFA / mois ou 4 000 FCFA / trimestre) ou Suivi Coach (5 000 FCFA / mois) pour télécharger les cycles avancés hors ligne.',
      });
      return;
    }
    if (!isProgressionUnlocked && Object.keys(offlineMap).length >= 2) {
      setUpgradePrompt({
        title: 'Limite hors ligne Essentiel atteinte (2 séances)',
        reason:
          'Votre formule Essentiel gratuite permet de garder jusqu’à 2 séances hors ligne simultanément. Retirez une séance déjà en cache ou passez à Progression+ (1 500 FCFA / mois) pour les téléchargements illimités.',
      });
      return;
    }
    saveSessionOffline(s);
    setOfflineMap(getOfflineSessions());
  };

  const handleLaunchLibrarySession = (sess: SessionTemplate) => {
    if (sess.access_tier === 'PROGRESSION' && !isProgressionUnlocked) {
      setUpgradePrompt({
        title: `Cycle Progression+ : ${sess.titre}`,
        reason:
          'Toutes les séances fondamentales et la sécurité douleur restent 100 % gratuites. Passez à Progression+ (1 500 FCFA / mois) ou Suivi Coach (5 000 FCFA / mois) pour débloquer les cycles avancés et variantes avec charge.',
      });
      return;
    }
    setActivePlayer({ session: sess, scheduledId: null });
  };

  const handleOpenTechniqueFiche = (fiche: TechniqueFiche) => {
    if (fiche.tier === 'PROGRESSION' && !isProgressionUnlocked) {
      setUpgradePrompt({
        title: `Fiche technique Progression+ : ${fiche.titre}`,
        reason:
          'Les 7 fiches posturales de base (squats sans matériel, pompes classiques, gainage) sont gratuites. Passez à Progression+ (1 500 FCFA / mois) pour agrandir et exploiter les variantes avec charge ou barre.',
      });
      return;
    }
    setSelectedFicheModal(fiche);
  };

  const handleStartChrono = (mode: 'up' | '30' | '20') => {
    setChronoMode(mode);
    setChronoSeconds(mode === 'up' ? 0 : Number(mode));
    setChronoRunning(true);
  };

  const handleEvaluationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const numericValues: Record<string, number> = {};
    for (const testSpec of sportTheme.tests) {
      const val = Number(evalValues[testSpec.code]);
      if (!Number.isFinite(val) || val <= 0) {
        setFeedbackBanner(`Saisissez une valeur valide pour : ${testSpec.nom}`);
        return;
      }
      numericValues[testSpec.code] = val;
    }

    setEvalSubmitting(true);
    try {
      await apiRequest('/api/athlete/evaluations', {
        method: 'POST',
        body: JSON.stringify({ values: numericValues }),
      });
      setEvalValues({});
      setFeedbackBanner('Évaluation enregistrée et comparée à votre historique.');
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setEvalSubmitting(false);
    }
  };

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(newWeight);
    if (!Number.isFinite(val) || val < 30 || val > 220) {
      setFeedbackBanner('Saisissez un poids valide entre 30 et 220 kg.');
      return;
    }
    try {
      await apiRequest('/api/athlete/weight', {
        method: 'POST',
        body: JSON.stringify({ poids_kg: val }),
      });
      setNewWeight('');
      setFeedbackBanner('Poids enregistré et courbe mise à jour.');
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/athlete/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nom: profileNom,
          prenom: profilePrenom,
          niveau: profileNiveau,
          poste: profilePoste,
          taille_cm: profileTaille ? Number(profileTaille) : null,
          langue: profileLangue,
          eco_data_mode: ecoMode,
          notifications_enabled: notifEnabled,
          reminder_time: reminderTime,
          reminder_lead_minutes: reminderLeadMinutes,
        }),
      });
      setFeedbackBanner('Préférences et profil enregistrés.');
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    }
  };

  const handleSaveReminders = async (
    nextEnabled = notifEnabled,
    nextTime = reminderTime,
    nextLead = reminderLeadMinutes
  ) => {
    setReminderSubmitting(true);
    try {
      await apiRequest('/api/athlete/reminders', {
        method: 'PATCH',
        body: JSON.stringify({
          notifications_enabled: nextEnabled,
          reminder_time: nextTime,
          reminder_lead_minutes: nextLead,
        }),
      });
      setFeedbackBanner(
        nextEnabled
          ? `Rappels PWA enregistrés (${nextTime} · ${formatReminderLeadLabel(nextLead).toLowerCase()}).`
          : 'Rappels automatiques de séance désactivés.'
      );
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Impossible d’enregistrer les rappels.');
    } finally {
      setReminderSubmitting(false);
    }
  };

  const handleEnablePwaNotifications = async () => {
    const res = await requestNotifPermission();
    if (res === 'granted') {
      if (!notifEnabled) {
        setNotifEnabled(true);
      }
      await handleSaveReminders(true, reminderTime, reminderLeadMinutes);
      await sendTestNotification();
      setNotifBannerDismissed(true);
    } else if (res === 'denied') {
      setFeedbackBanner(
        'Notifications bloquées dans les paramètres du navigateur. Autorisez Terrain+ depuis l’icône cadenas de la barre d’adresse.'
      );
    }
  };

  const handleTestPwaNotification = async () => {
    const res = await sendTestNotification();
    if (res.ok) {
      setFeedbackBanner('Notification de test envoyée via le Service Worker Terrain+.');
    } else if (res.permission === 'denied') {
      setFeedbackBanner('Notifications bloquées dans votre navigateur. Réactivez l’autorisation pour recevoir les rappels.');
    } else if (res.permission === 'unsupported') {
      setFeedbackBanner('Votre navigateur actuel ne supporte pas les notifications PWA locales.');
    } else {
      setFeedbackBanner('Autorisez l’affichage des notifications dans votre navigateur pour tester.');
    }
  };

  const handleConfirmSportChange = async () => {
    if (!pendingSportChange) return;
    try {
      await apiRequest('/api/athlete/change-sport', {
        method: 'POST',
        body: JSON.stringify({ sport_code: pendingSportChange }),
      });
      setPendingSportChange(null);
      setFeedbackBanner('Sport mis à jour : interface, séances et tests adaptés.');
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleToggleGroup = async (groupId: number) => {
    try {
      await apiRequest(`/api/athlete/groups/${groupId}/toggle`, { method: 'POST' });
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleRequestCoachChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/athlete/request-coach-change', {
        method: 'POST',
        body: JSON.stringify({ motif: coachChangeMotif || 'Demande de changement de coach' }),
      });
      setCoachChangeMotif('');
      setFeedbackBanner('Demande transmise à l’administrateur Terrain+.');
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleSwitchAthletePlan = async (e?: React.FormEvent, explicitTier?: AthletePlanTier) => {
    if (e) e.preventDefault();
    const tierToApply = explicitTier || targetPlanDraft;
    if (tierToApply !== 'ESSENTIEL' && !confirmPlanSwitch) {
      setFeedbackBanner('Cochez la confirmation de formule avant de valider.');
      return;
    }
    if (tierToApply === 'COACH_PRIVE' && !selectedCoachDraftId) {
      setFeedbackBanner('Sélectionnez d’abord un coach dans la liste.');
      return;
    }
    setCoachActionSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/athlete/select-plan', {
        method: 'POST',
        body: JSON.stringify({
          plan_tier: tierToApply,
          billing_cycle: tierToApply === 'PROGRESSION' ? planSwitchBilling : 'MENSUEL',
          coach_user_id: tierToApply === 'COACH_PRIVE' ? selectedCoachDraftId : null,
          confirm_plan: tierToApply !== 'ESSENTIEL',
        }),
      });
      setConfirmPlanSwitch(false);
      setUpgradePrompt(null);
      setFeedbackBanner(res.message);
      await loadWorkspace();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Impossible de mettre à jour votre formule.');
    } finally {
      setCoachActionSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const exported = await apiRequest<Record<string, unknown>>('/api/athlete/export');
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terrain-plus-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Export impossible.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSubmitting(true);
    try {
      const res = await apiRequest<{ message: string; sessionToken?: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPasswordInput,
          new_password: newPasswordInput,
        }),
      });
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setFeedbackBanner(res.message);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword) {
      setFeedbackBanner('Saisissez votre mot de passe actuel pour confirmer la suppression.');
      return;
    }
    try {
      await apiRequest('/api/athlete/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      clearSessionToken();
      clearAllWorkspaceCaches();
      onLoggedOut();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-6">
        <div className="text-sm text-neutral-600">Chargement de votre espace sportif...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-sm text-red-700">{error || 'Impossible de charger les données.'}</p>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white min-h-[44px]"
        >
          Retour à l'accueil
        </button>
      </div>
    );
  }

  const navItems: Array<{ id: AthleteTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Tableau', icon: LayoutDashboard },
    { id: 'programme', label: 'Programme', icon: Calendar },
    { id: 'evaluation', label: 'Évaluation', icon: ClipboardCheck },
    { id: 'profil', label: 'Profil', icon: User },
  ];

  const latestEval = data.evaluations[0] || null;
  const previousEval = data.evaluations[1] || null;

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900 flex flex-col md:flex-row">
      {/* Desktop & Tablet Detached Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-neutral-200 bg-white">
        <div className="p-5 border-b border-neutral-200">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <div className={`mt-2 text-xs font-semibold ${sportTheme.accentTextClass}`}>
            {sportTheme.nom} · {LEVEL_LABELS[data.profile.niveau]}
          </div>
          <div className="mt-1 font-mono text-[11px] font-medium text-neutral-500">
            {currentPlanShortLabel}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? `${sportTheme.accentBgClass} text-white`
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200 space-y-3">
          <button
            type="button"
            onClick={() => setShowPainModal(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-800 hover:bg-red-100 min-h-[44px]"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Signaler une douleur</span>
          </button>

          <PWAInstallButton compact />

          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Top Bar (non-sticky; navigation is fixed at bottom on mobile) */}
        <header className="md:hidden flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 h-[52px]">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-neutral-900 whitespace-nowrap">Terrain+</span>
            <span className={`text-xs font-semibold truncate ${sportTheme.accentTextClass}`}>
              · {sportTheme.nom}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPainModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-800 min-h-[36px]"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Douleur</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-neutral-600 hover:text-neutral-900 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 pb-24 md:pb-12">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
            {/* Desktop/Tablet Quick Cross-Page Bar (hidden on mobile where bottom tab bar is fixed) */}
            <div className="hidden md:flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5">
              <div className="flex items-center gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors min-h-[38px] whitespace-nowrap shrink-0 ${
                      active
                        ? `${sportTheme.accentBgClass} text-white`
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-neutral-500 hidden sm:inline">
              {data.user.prenom} {data.user.nom} · {sportTheme.nom}
            </span>
          </div>
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center gap-2">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {feedbackBanner && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 flex items-center justify-between gap-4">
              <span>{feedbackBanner}</span>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
              >
                Fermer
              </button>
            </div>
          )}

          {/* ---------------- TAB 1: DASHBOARD ---------------- */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              {/* Welcome & Today's Session */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-6 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-neutral-500">
                      Bonjour {data.user.prenom} · {sportTheme.nom} · {data.profile.poste || 'Tout poste'}
                    </div>
                    <h1 className="mt-2 font-display text-2xl font-bold text-neutral-900">
                      {todaySession?.session ? todaySession.session.titre : 'Séance de récupération'}
                    </h1>
                    <p className="mt-1.5 text-sm text-neutral-600">
                      Objectif de la semaine : {data.program?.objectif || data.profile.objectif || 'Maintenir la régularité'}
                    </p>

                    {todaySession?.ajustee_par_coach && todaySession.motif_ajustement && (
                      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-700">
                        Ajustement coach : {todaySession.motif_ajustement}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 pt-4">
                    <div className="text-xs text-neutral-600 font-mono tabular-nums">
                      {todaySession?.session
                        ? `${todaySession.session.duree_min} min · Prévention ${todaySession.session.prevention_focus}`
                        : 'Repos actif'}
                    </div>

                    {todaySession?.session && (
                      <button
                        type="button"
                        onClick={() =>
                          setActivePlayer({
                            session: todaySession.session!,
                            scheduledId: todaySession.id,
                          })
                        }
                        className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors min-h-[44px] ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        <span>{todaySession.completed ? 'Refaire la séance' : 'Commencer la séance'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sport visual or Eco-Data compact card */}
                <div className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col">
                  {!ecoMode && isOnline ? (
                    <div className="relative h-44 lg:h-48 bg-neutral-100">
                      <img
                        src={sportTheme.imageUrl}
                        alt={sportTheme.nom}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4 text-white">
                        <div className="text-xs text-neutral-200">Prévention prioritaire</div>
                        <div className="text-sm font-semibold">{sportTheme.preventionZones.join(' & ')}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 border-b border-neutral-100 bg-neutral-50">
                      <div className="text-xs font-semibold text-neutral-700">Mode éco données actif</div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Images masquées pour économiser votre forfait mobile. Prévention : {sportTheme.preventionZones.join(' & ')}.
                      </p>
                    </div>
                  )}

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-neutral-500">Semaine</div>
                        <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-neutral-900">
                          {data.stats.weeklyCompleted}/{data.stats.weeklyTarget}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Régularité 4 sem.</div>
                        <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-neutral-900">
                          {data.stats.fourWeekRegularityPct}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-neutral-500">
                      Difficulté moy. : {data.stats.avgRpe ? `${data.stats.avgRpe}/10` : '—'} · Sommeil moy. :{' '}
                      {data.stats.avgSleep ? `${data.stats.avgSleep}/10` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Training Statistics Summary & Weekly Completed Sessions */}
              <section
                aria-labelledby="training-stats-heading"
                className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className={`h-4 w-4 ${sportTheme.accentTextClass}`} aria-hidden="true" />
                      <h2 id="training-stats-heading" className="text-base font-semibold text-neutral-900">
                        Statistiques d’entraînement de la semaine
                      </h2>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Récapitulatif de votre volume réalisé, de votre charge ressentie et de vos séances validées.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProgrammeView('calendar');
                      setTab('programme');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[40px] self-start sm:self-auto"
                  >
                    <span>Voir le calendrier</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* 4 Key Weekly KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-2">
                    <div className="text-xs text-neutral-500">Séances effectuées</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-2xl font-bold tabular-nums text-neutral-900">
                        {weeklySummary.completedSessions.length}/{data.stats.weeklyTarget}
                      </span>
                      <span className={`font-mono text-xs font-semibold tabular-nums ${sportTheme.accentTextClass}`}>
                        {weeklySummary.completionPct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className={`h-full transition-all ${sportTheme.accentBgClass}`}
                        style={{ width: `${weeklySummary.completionPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-1">
                    <div className="text-xs text-neutral-500">Temps d’entraînement</div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-neutral-900">
                      {weeklySummary.totalMinutesDone} min
                    </div>
                    <div className="text-xs font-mono tabular-nums text-neutral-500">
                      sur {weeklySummary.totalMinutesPlanned} min planifiées
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-1">
                    <div className="text-xs text-neutral-500">Charge et fatigue</div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-neutral-900">
                      {data.stats.avgRpe !== null ? `${data.stats.avgRpe}/10` : '—'}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-neutral-500">
                      Fatigue moy. : {weeklySummary.avgFatigue !== null ? `${weeklySummary.avgFatigue}/10` : '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-1">
                    <div className="text-xs text-neutral-500">Sommeil et constance</div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-neutral-900">
                      {data.stats.avgSleep !== null ? `${data.stats.avgSleep}/10` : '—'}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-neutral-500">
                      Régularité 4 sem. : {data.stats.fourWeekRegularityPct}%
                    </div>
                  </div>
                </div>

                {/* 7-Day Breakdown + Weekly Sessions List */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 border-t border-neutral-100">
                  {/* Left: 7-day strip + minutes BarChart */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-neutral-900">Répartition hebdomadaire</h3>
                      <span className="text-xs font-mono tabular-nums text-neutral-500">
                        {weeklySummary.restDaysCount} j de repos
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                      {weeklySummary.days.map((d) => (
                        <div
                          key={d.dayNum}
                          className={`rounded-xl border p-2 text-center flex flex-col items-center justify-between gap-1 ${
                            d.status === 'done'
                              ? 'border-emerald-200 bg-emerald-50/70'
                              : d.status === 'planned'
                                ? 'border-neutral-200 bg-white'
                                : 'border-neutral-100 bg-neutral-50'
                          }`}
                        >
                          <span className="text-[11px] font-semibold text-neutral-800">{d.dayLabel}</span>
                          <span className="text-[10px] font-mono tabular-nums text-neutral-500">{d.dateLabel}</span>
                          {d.status === 'done' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-label="Séance effectuée" />
                          ) : d.status === 'planned' ? (
                            <Clock className="h-4 w-4 text-neutral-400" aria-label="Séance planifiée" />
                          ) : (
                            <span className="text-[10px] font-medium text-neutral-400 leading-4">Repos</span>
                          )}
                          <span className="text-[10px] font-mono tabular-nums text-neutral-700">
                            {d.status === 'done'
                              ? `${d.minutesDone}m`
                              : d.status === 'planned'
                                ? `${d.minutesRemaining}m`
                                : '—'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="h-44 w-full pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={weeklySummary.days}
                          margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#6B7280' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} unit="m" />
                          <Tooltip
                            formatter={(value, name) => [
                              `${value ?? 0} min`,
                              name === 'minutesDone' ? 'Effectuées' : 'Planifiées restantes',
                            ]}
                          />
                          <Bar
                            dataKey="minutesDone"
                            stackId="week"
                            name="minutesDone"
                            fill={sportTheme.accentHex}
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="minutesRemaining"
                            stackId="week"
                            name="minutesRemaining"
                            fill="#E5E7EB"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Right: Completed vs Remaining Sessions Summary */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Résumé des séances de la semaine
                      </h3>

                      <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
                        <button
                          type="button"
                          onClick={() => setWeekDetailFilter('completed')}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                            weekDetailFilter === 'completed'
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-600 hover:text-neutral-900'
                          }`}
                        >
                          Effectuées ({weeklySummary.completedSessions.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeekDetailFilter('remaining')}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                            weekDetailFilter === 'remaining'
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-600 hover:text-neutral-900'
                          }`}
                        >
                          À venir ({weeklySummary.remainingSessions.length})
                        </button>
                      </div>
                    </div>

                    {weekDetailFilter === 'completed' ? (
                      weeklySummary.completedSessions.length === 0 ? (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center space-y-3">
                          <p className="text-xs text-neutral-600">
                            Aucune séance validée cette semaine pour le moment. Lancez votre séance du jour pour enregistrer vos premiers indicateurs.
                          </p>
                          {todaySession?.session && (
                            <button
                              type="button"
                              onClick={() =>
                                setActivePlayer({
                                  session: todaySession.session!,
                                  scheduledId: todaySession.id,
                                })
                              }
                              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white min-h-[40px] ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                            >
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Commencer maintenant</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                          {weeklySummary.completedSessions.map((slot) => (
                            <div
                              key={slot.id}
                              className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                  <span className="font-semibold text-neutral-900">
                                    {DAY_NAMES[slot.jour_semaine - 1] || `Jour ${slot.jour_semaine}`}
                                  </span>
                                  <span>·</span>
                                  <span className="font-mono tabular-nums">
                                    {slot.completed_at ? slot.completed_at.slice(0, 10) : slot.date_prevue}
                                  </span>
                                  {slot.session && (
                                    <>
                                      <span>·</span>
                                      <span className="font-mono tabular-nums font-medium text-neutral-700">
                                        {slot.session.duree_min} min
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="text-sm font-semibold text-neutral-900 truncate">
                                  {slot.session ? slot.session.titre : 'Séance complétée'}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 font-mono tabular-nums">
                                  <span>Difficulté {slot.difficulte ?? '—'}/10</span>
                                  <span>Fatigue {slot.ressenti_fatigue ?? '—'}/10</span>
                                  <span>Sommeil {slot.qualite_sommeil ?? '—'}/10</span>
                                </div>
                              </div>

                              {slot.session && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActivePlayer({ session: slot.session!, scheduledId: slot.id })
                                  }
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[40px] shrink-0"
                                >
                                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Refaire</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    ) : weeklySummary.remainingSessions.length === 0 ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-xs text-emerald-900">
                        Toutes les séances planifiées de la semaine ont été réalisées. Vous pouvez choisir une séance complémentaire dans la bibliothèque du programme.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                        {weeklySummary.remainingSessions.map((slot) => (
                          <div
                            key={slot.id}
                            className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                <span className="font-semibold text-neutral-900">
                                  {DAY_NAMES[slot.jour_semaine - 1] || `Jour ${slot.jour_semaine}`}
                                </span>
                                <span>·</span>
                                <span className="font-mono tabular-nums">{slot.date_prevue}</span>
                                {slot.session && (
                                  <>
                                    <span>·</span>
                                    <span className="font-mono tabular-nums font-medium text-neutral-700">
                                      {slot.session.duree_min} min
                                    </span>
                                  </>
                                )}
                                {slot.ajustee_par_coach && (
                                  <>
                                    <span>·</span>
                                    <span className={`font-semibold ${sportTheme.accentTextClass}`}>
                                      Ajustée coach
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-sm font-semibold text-neutral-900 truncate">
                                {slot.session ? slot.session.titre : 'Séance planifiée'}
                              </div>
                              {slot.session && (
                                <div className="text-xs text-neutral-500">
                                  Prévention : {slot.session.prevention_focus}
                                </div>
                              )}
                            </div>

                            {slot.session && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActivePlayer({ session: slot.session!, scheduledId: slot.id })
                                }
                                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white min-h-[40px] shrink-0 ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                              >
                                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Lancer</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Indicators + Coach + Alerts */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Weight & Eval Chart */}
                <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900">Indicateurs de suivi</h2>
                      <p className="text-xs text-neutral-500">
                        Évolution du poids (sans classement public) et dernier score d’évaluation
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Dernière évaluation</div>
                      <div className="font-mono text-lg font-bold tabular-nums text-neutral-900">
                        {latestEval ? `${latestEval.score_global}/100` : 'À faire'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-52 w-full">
                    {data.weights.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.weights} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} />
                          <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 11, fill: '#6B7280' }} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="poids_kg"
                            name="Poids (kg)"
                            stroke={sportTheme.accentHex}
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-neutral-500">
                        Ajoutez votre poids dans Profil pour afficher la courbe.
                      </div>
                    )}
                  </div>
                </div>

                {/* Coach & Alerts */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-neutral-900">Ma formule & Mon coach</h2>
                      <span className="font-mono text-xs font-semibold text-neutral-600">
                        {currentPlanShortLabel}
                      </span>
                    </div>
                    {currentPlanTier === 'COACH_PRIVE' && data.coach ? (
                      <div className="mt-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-neutral-900">
                            {data.coach.prenom} {data.coach.nom}
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-800">
                            Suivi Coach actif · {data.coach.zone}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500">{data.coach.qualification}</div>
                        {latestEval?.comments[0] && (
                          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 leading-relaxed">
                            Dernier commentaire : « {latestEval.comments[0].texte} »
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setTab('profil')}
                          className="text-xs font-semibold text-neutral-900 underline hover:text-neutral-700"
                        >
                          Gérer ma formule ou changer de coach
                        </button>
                      </div>
                    ) : currentPlanTier === 'PROGRESSION' ? (
                      <div className="mt-2.5 space-y-3">
                        <p className="text-xs text-neutral-600 leading-relaxed">
                          Votre formule <strong>Progression+</strong> débloque le hors-ligne illimité, les cycles avancés et les courbes complètes d’évaluation. Ajoutez un coach dédié à tout moment pour passer à 5 000 FCFA / mois.
                        </p>
                        <button
                          type="button"
                          onClick={() => setTab('profil')}
                          className="rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                        >
                          Ajouter un coach ou gérer ma formule
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2.5 space-y-3">
                        <p className="text-xs text-neutral-600 leading-relaxed">
                          Vous utilisez l’accès <strong>Essentiel (0 FCFA)</strong>. Débloquez tous les cycles avancés et le hors-ligne illimité dès 1 500 FCFA / mois, ou choisissez un coach dédié (5 000 FCFA / mois).
                        </p>
                        <button
                          type="button"
                          onClick={() => setTab('profil')}
                          className="rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                        >
                          Comparer les formules Terrain+
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-neutral-900">Alertes et rappels</h2>
                      <button
                        type="button"
                        onClick={() => setTab('profil')}
                        className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
                      >
                        Régler l’heure
                      </button>
                    </div>

                    {notifEnabled && notifPermission === 'default' && !notifBannerDismissed && (
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
                            <BellRing className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                            <span>Activer les rappels push PWA avant vos séances</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNotifBannerDismissed(true)}
                            aria-label="Masquer"
                            className="text-neutral-400 hover:text-neutral-700"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-[11px] text-neutral-600 leading-relaxed">
                          Recevez une alerte locale directement sur votre téléphone ou ordinateur ({formatReminderLeadLabel(reminderLeadMinutes).toLowerCase()} votre horaire de {reminderTime}).
                        </p>
                        <button
                          type="button"
                          onClick={handleEnablePwaNotifications}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[36px]"
                        >
                          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Autoriser les rappels PWA</span>
                        </button>
                      </div>
                    )}

                    {notifEnabled && notifPermission === 'granted' && nextReminder && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                            <span className="truncate">Prochain rappel : {nextReminder.sessionTitle}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-emerald-900/80 font-mono tabular-nums">
                            {nextReminder.datePrevue} · {reminderTime} ({formatReminderLeadLabel(reminderLeadMinutes).toLowerCase()})
                          </div>
                        </div>
                      </div>
                    )}

                    {data.alerts.length === 0 ? (
                      <p className="text-xs text-neutral-500">Aucune alerte active.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.alerts.slice(0, 3).map((al) => (
                          <button
                            key={al.id}
                            type="button"
                            onClick={() => setTab(al.type === 'DOULEUR' ? 'evaluation' : 'profil')}
                            className="w-full text-left rounded-xl border border-neutral-200 p-3 hover:bg-neutral-50 transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-semibold ${al.type === 'DOULEUR' ? 'text-red-700' : 'text-neutral-800'}`}>
                                {al.type === 'DOULEUR' ? 'Signal douleur' : al.type}
                              </span>
                              <span className="text-neutral-500">{al.traitee ? 'Traitée' : 'En cours'}</span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-600 line-clamp-2">{al.message}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Collectif & Défis (without individual ranking) */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900">Groupes ASC / Campus et défis collectifs</h2>
                    <p className="text-xs text-neutral-500">
                      Valorisation de la régularité collective · Aucun classement individuel public.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.groups.map((grp) => (
                    <div key={grp.id} className="rounded-xl border border-neutral-200 p-4 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs text-neutral-500">
                          {grp.partner_type} · {grp.partner_nom} · {grp.zone}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-neutral-900">{grp.nom}</div>
                        <div className="mt-1 text-xs text-neutral-600 font-mono tabular-nums">
                          Capitaine Prépa : {grp.captain_name} · {grp.member_count} membres
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleGroup(grp.id)}
                        className={`rounded-lg px-3 py-2 text-xs font-medium min-h-[40px] border transition-colors ${
                          grp.joined
                            ? 'border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
                            : 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
                        }`}
                      >
                        {grp.joined ? 'Quitter le groupe' : 'Rejoindre le groupe'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-neutral-100 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.challenges.map((ch) => {
                    const pct = Math.min(100, Math.round((ch.current_sessions / ch.target_sessions) * 100));
                    return (
                      <div key={ch.id} className="rounded-xl bg-neutral-50 border border-neutral-200 p-3.5">
                        <div className="text-xs text-neutral-500">{ch.partner_nom} · {ch.periode}</div>
                        <div className="mt-1 text-sm font-semibold text-neutral-900">{ch.titre}</div>
                        <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                          <div className={`h-full ${sportTheme.accentBgClass}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-xs font-mono tabular-nums text-neutral-600">
                          <span>{ch.indicateur}</span>
                          <span>{ch.current_sessions}/{ch.target_sessions}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ---------------- TAB 2: PROGRAMME ---------------- */}
          {tab === 'programme' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-neutral-900">
                    Programme {sportTheme.nom}
                  </h1>
                  <p className="mt-1 text-sm text-neutral-600">
                    Visualisez vos séances passées et programmées, ajustements du coach et téléchargement hors ligne.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-200/70 p-1 self-start">
                  <button
                    type="button"
                    onClick={() => setProgrammeView('calendar')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium min-h-[38px] transition-colors ${
                      programmeView === 'calendar' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Calendrier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgrammeView('list')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium min-h-[38px] transition-colors ${
                      programmeView === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Vue semaine</span>
                  </button>
                </div>
              </div>

              {programmeView === 'calendar' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Monthly Calendar Grid */}
                  <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-neutral-900">
                          {formatMonthTitle(calendarMonth.year, calendarMonth.month)}
                        </h2>
                        <div className="mt-0.5 text-xs font-mono tabular-nums text-neutral-500">
                          {calendarGrid.completedInMonth} effectuée{calendarGrid.completedInMonth > 1 ? 's' : ''} ·{' '}
                          {calendarGrid.plannedInMonth} programmée{calendarGrid.plannedInMonth > 1 ? 's' : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth((prev) =>
                              prev.month === 0
                                ? { year: prev.year - 1, month: 11 }
                                : { year: prev.year, month: prev.month - 1 }
                            )
                          }
                          aria-label="Mois précédent"
                          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-50 min-h-[40px] min-w-[40px]"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => jumpToCalendarDate(todayIso)}
                          className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[40px]"
                        >
                          Aujourd’hui
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth((prev) =>
                              prev.month === 11
                                ? { year: prev.year + 1, month: 0 }
                                : { year: prev.year, month: prev.month + 1 }
                            )
                          }
                          aria-label="Mois suivant"
                          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-50 min-h-[40px] min-w-[40px]"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Filter + Legend */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-neutral-100 py-2.5">
                      <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
                        {(
                          [
                            { id: 'all', label: 'Toutes' },
                            { id: 'completed', label: 'Passées' },
                            { id: 'scheduled', label: 'Programmées' },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setCalendarFilter(f.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium min-h-[32px] transition-colors ${
                              calendarFilter === f.id
                                ? 'bg-white text-neutral-900 shadow-sm'
                                : 'text-neutral-600 hover:text-neutral-900'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                          <span>Effectuée</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className={`h-3.5 w-3.5 ${sportTheme.accentTextClass}`} aria-hidden="true" />
                          <span>Programmée</span>
                        </span>
                        <span className="text-neutral-400">Repos</span>
                      </div>
                    </div>

                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-xs font-medium text-neutral-500">
                      {DAY_NAMES.map((dayName) => (
                        <div key={dayName} className="py-1">
                          {dayName}
                        </div>
                      ))}
                    </div>

                    {/* Month Days Grid */}
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                      {calendarGrid.cells.map((cell) => {
                        const isSelected = cell.iso === selectedCalendarDate;
                        const hasActivity = cell.completedCount > 0 || cell.plannedCount > 0;
                        return (
                          <button
                            key={cell.iso}
                            type="button"
                            onClick={() => jumpToCalendarDate(cell.iso)}
                            aria-label={`${formatFrenchDateLong(cell.iso)}${
                              cell.completedCount > 0
                                ? `, ${cell.completedCount} séance effectuée`
                                : cell.plannedCount > 0
                                  ? `, ${cell.plannedCount} séance programmée`
                                  : cell.hasRest
                                    ? ', jour de repos'
                                    : ''
                            }`}
                            className={`min-h-[58px] sm:min-h-[76px] rounded-xl border p-1.5 sm:p-2 text-left flex flex-col justify-between transition-colors ${
                              isSelected
                                ? 'border-neutral-900 ring-1 ring-neutral-900 bg-white'
                                : !cell.inCurrentMonth
                                  ? 'border-neutral-100 bg-neutral-50/50 text-neutral-400 hover:bg-neutral-50'
                                  : cell.completedCount > 0
                                    ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                                    : cell.plannedCount > 0
                                      ? 'border-neutral-200 bg-white hover:bg-neutral-50'
                                      : 'border-neutral-100 bg-neutral-50/40 hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 w-full">
                              <span
                                className={`font-mono text-xs font-semibold tabular-nums ${
                                  cell.isToday
                                    ? sportTheme.accentTextClass
                                    : cell.inCurrentMonth
                                      ? 'text-neutral-900'
                                      : 'text-neutral-400'
                                }`}
                              >
                                {cell.dayNumber}
                              </span>
                              {cell.isToday && (
                                <span className={`hidden sm:inline text-[10px] font-semibold ${sportTheme.accentTextClass}`}>
                                  Auj.
                                </span>
                              )}
                            </div>

                            <div className="w-full space-y-0.5">
                              {cell.completedCount > 0 && (
                                <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-700" aria-hidden="true" />
                                  <span className="hidden sm:inline truncate">
                                    {cell.totalMinutes > 0 ? `${cell.totalMinutes}m` : 'Fait'}
                                  </span>
                                </div>
                              )}
                              {cell.plannedCount > 0 && (
                                <div className={`flex items-center gap-1 text-[10px] font-mono tabular-nums ${sportTheme.accentTextClass}`}>
                                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span className="hidden sm:inline truncate">
                                    {cell.totalMinutes > 0 ? `${cell.totalMinutes}m` : 'Prévu'}
                                  </span>
                                </div>
                              )}
                              {!hasActivity && cell.hasRest && (
                                <div className="hidden sm:block text-[10px] text-neutral-400">Repos</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Day Detail + Quick Chronology */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
                      <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 pb-3">
                        <div>
                          <div className="text-xs text-neutral-500">
                            {selectedCalendarDate === todayIso
                              ? 'Aujourd’hui'
                              : selectedCalendarDate < todayIso
                                ? 'Date passée'
                                : 'Date à venir'}
                          </div>
                          <h2 className="text-base font-semibold text-neutral-900">
                            {formatFrenchDateLong(selectedCalendarDate)}
                          </h2>
                        </div>
                      </div>

                      {selectedDaySlots.length === 0 ? (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600 space-y-2">
                          <p>
                            {calendarFilter === 'all'
                              ? 'Aucune séance programmée ou enregistrée à cette date.'
                              : 'Aucune séance ne correspond au filtre sélectionné à cette date.'}
                          </p>
                          <p className="text-neutral-500">
                            Vous pouvez lancer une séance libre depuis la bibliothèque ci-dessous à tout moment.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedDaySlots.map((slot) => (
                            <div
                              key={slot.id}
                              className="rounded-xl border border-neutral-200 p-4 space-y-3"
                            >
                              {slot.is_rest_day || !slot.session ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-neutral-500">Récupération</div>
                                  <div className="text-sm font-semibold text-neutral-900">
                                    Repos et récupération
                                  </div>
                                  <p className="text-xs text-neutral-600">
                                    Journée dédiée au sommeil, à l’hydratation et à la récupération musculaire.
                                  </p>
                                </div>
                              ) : (
                                <>
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                      {slot.completed ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                          <span>
                                            Effectuée
                                            {slot.completed_at ? ` le ${slot.completed_at.slice(0, 10)}` : ''}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className={`inline-flex items-center gap-1 font-semibold ${sportTheme.accentTextClass}`}>
                                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                          <span>
                                            {slot.date_prevue < todayIso ? 'Planifiée (en attente)' : 'Programmée'}
                                          </span>
                                        </span>
                                      )}
                                      <span className="font-mono tabular-nums text-neutral-600">
                                        {slot.session.duree_min} min
                                      </span>
                                    </div>

                                    <div className="text-sm font-semibold text-neutral-900">
                                      {slot.session.titre}
                                    </div>
                                    <div className="text-xs text-neutral-600">
                                      Objectif : {slot.session.objectif} · Prévention {slot.session.prevention_focus}
                                    </div>

                                    {slot.ajustee_par_coach && (
                                      <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs text-neutral-700">
                                        Ajustée par le coach
                                        {slot.motif_ajustement ? ` : ${slot.motif_ajustement}` : ''}
                                      </div>
                                    )}

                                    {slot.completed && (
                                      <div className="pt-1 text-xs font-mono tabular-nums text-neutral-600">
                                        Difficulté {slot.difficulte ?? '—'}/10 · Fatigue {slot.ressenti_fatigue ?? '—'}/10 · Sommeil {slot.qualite_sommeil ?? '—'}/10
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleOfflineSession(slot.session!)}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 min-h-[40px]"
                                    >
                                      <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                                      <span>{offlineMap[slot.session.id] ? 'Hors ligne OK' : 'Télécharger'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActivePlayer({ session: slot.session!, scheduledId: slot.id })
                                      }
                                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white min-h-[40px] ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                                    >
                                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>{slot.completed ? 'Refaire' : 'Lancer'}</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick chronological access to all past & scheduled sessions */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Toutes les séances du programme
                      </h3>
                      <div className="divide-y divide-neutral-100">
                        {data.schedule
                          .filter((s) => !s.is_rest_day && s.session)
                          .map((slot) => {
                            const slotDate = slot.date_prevue.slice(0, 10);
                            const isCurrentSelected = slotDate === selectedCalendarDate;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => jumpToCalendarDate(slotDate)}
                                className={`w-full py-2.5 px-2 -mx-2 rounded-xl text-left flex items-center justify-between gap-3 transition-colors min-h-[44px] ${
                                  isCurrentSelected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono tabular-nums">
                                    <span>{DAY_NAMES[slot.jour_semaine - 1] || `J${slot.jour_semaine}`}</span>
                                    <span>·</span>
                                    <span>{slotDate}</span>
                                  </div>
                                  <div className="text-xs font-semibold text-neutral-900 truncate">
                                    {slot.session!.titre}
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium">
                                  {slot.completed ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Fait</span>
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 ${sportTheme.accentTextClass}`}>
                                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Prévu</span>
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Weekly Schedule List View */
                <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
                  {data.schedule.map((slot) => (
                    <div key={slot.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                          <span className="font-semibold text-neutral-900">
                            {DAY_NAMES[slot.jour_semaine - 1] || `Jour ${slot.jour_semaine}`}
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">{slot.date_prevue}</span>
                          {slot.ajustee_par_coach && (
                            <>
                              <span>·</span>
                              <span className={`font-semibold ${sportTheme.accentTextClass}`}>
                                Ajustée par le coach {slot.date_ajustement ? `(${slot.date_ajustement.slice(0, 10)})` : ''}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-base font-semibold text-neutral-900">
                          {slot.is_rest_day || !slot.session ? 'Repos et récupération' : slot.session.titre}
                        </div>

                        {slot.motif_ajustement && (
                          <p className="text-xs text-neutral-600">Motif : {slot.motif_ajustement}</p>
                        )}

                        {slot.completed && (
                          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              Terminée · Fatigue {slot.ressenti_fatigue}/10 · Difficulté {slot.difficulte}/10
                            </span>
                          </div>
                        )}
                      </div>

                      {!slot.is_rest_day && slot.session && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleOfflineSession(slot.session!)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 min-h-[40px]"
                          >
                            <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                            <span>{offlineMap[slot.session.id] ? 'Hors ligne OK' : 'Télécharger'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActivePlayer({ session: slot.session!, scheduledId: slot.id })
                            }
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white min-h-[40px] ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{slot.completed ? 'Refaire' : 'Lancer'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Sport Session Library */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-neutral-900">
                        Bibliothèque {sportTheme.nom} (relue avant diffusion)
                      </h2>
                      <span className="font-mono text-xs text-neutral-500">
                        {Object.keys(offlineMap).length}
                        {isProgressionUnlocked ? ' hors ligne (illimité)' : '/2 hors ligne (Essentiel)'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Toutes les séances incluent des consignes français/wolof et une variante facile ou exigeante.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-200/70 p-1 self-start">
                    {(['all', 'debutant', 'intermediaire', 'avance'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevelFilter(lvl)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] whitespace-nowrap ${
                          levelFilter === lvl ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                        }`}
                      >
                        {lvl === 'all' ? 'Tous niveaux' : LEVEL_LABELS[lvl]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLibrary.map((sess) => {
                    const cachedOffline = Boolean(offlineMap[sess.id]);
                    const isLockedProgression = sess.access_tier === 'PROGRESSION' && !isProgressionUnlocked;
                    return (
                      <div key={sess.id} className="rounded-2xl border border-neutral-200 bg-white p-5 flex flex-col justify-between gap-4">
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                            <span>
                              {LEVEL_LABELS[sess.niveau]} · {sess.duree_min} min · {sess.exercises.length} exercices
                            </span>
                            {sess.access_tier === 'PROGRESSION' ? (
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  isLockedProgression ? 'text-amber-800' : 'text-emerald-700'
                                }`}
                              >
                                {isLockedProgression && <Lock className="h-3 w-3" aria-hidden="true" />}
                                <span>Progression+</span>
                              </span>
                            ) : (
                              <span className="font-medium text-neutral-500">Essentiel gratuit</span>
                            )}
                          </div>
                          <h3 className="mt-1.5 text-base font-semibold text-neutral-900">{sess.titre}</h3>
                          <p className="mt-1 text-xs text-neutral-600">Objectif : {sess.objectif}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Prévention : {sess.prevention_focus} {sess.relue_par ? `· Relue par ${sess.relue_par}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-100">
                          <button
                            type="button"
                            onClick={() => handleToggleOfflineSession(sess)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium min-h-[40px] ${
                              cachedOffline
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                            <span>{cachedOffline ? 'Disponible hors ligne' : 'Télécharger hors ligne'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleLaunchLibrarySession(sess)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white min-h-[40px] ${
                              isLockedProgression
                                ? 'bg-neutral-800 hover:bg-neutral-900'
                                : `${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`
                            }`}
                          >
                            {isLockedProgression ? (
                              <>
                                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Débloquer</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Commencer</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Illustrated Exercise & Anatomy Technique Sheets */}
              <div className="space-y-4 pt-4 border-t border-neutral-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      Fiches techniques illustrées (Postures & Anatomie)
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Repères visuels d’alignement et muscles sollicités pour exécuter chaque mouvement sans vous blesser.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-200/70 p-1 self-start">
                    {(['Toutes', 'Squats', 'Pompes', 'Gainage'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFicheCategoryFilter(cat)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] whitespace-nowrap ${
                          ficheCategoryFilter === cat ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {ecoMode ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-xs text-neutral-600">
                    Mode éco données actif : les {filteredFiches.length} planches techniques illustrées sont masquées pour préserver votre forfait mobile. Désactivez le mode éco données dans Profil pour les afficher.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredFiches.map((fiche) => {
                      const locked = fiche.tier === 'PROGRESSION' && !isProgressionUnlocked;
                      return (
                        <div
                          key={fiche.id}
                          className="rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col justify-between"
                        >
                          <div className="relative bg-white border-b border-neutral-100 p-3">
                            <img
                              src={fiche.imageUrl}
                              alt={fiche.titre}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className={`h-44 w-full object-contain ${locked ? 'opacity-75' : ''}`}
                            />
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-neutral-500">{fiche.category}</span>
                              <span className={locked ? 'font-semibold text-amber-800' : 'font-medium text-emerald-700'}>
                                {fiche.tier === 'PROGRESSION' ? 'Progression+' : 'Essentiel gratuit'}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-neutral-900">{fiche.titre}</h3>
                              <div className="mt-1 text-[11px] font-medium text-neutral-500">{fiche.muscles}</div>
                              <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">{fiche.caption}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenTechniqueFiche(fiche)}
                              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[38px]"
                            >
                              {locked ? (
                                <>
                                  <Lock className="h-3.5 w-3.5 text-amber-800" aria-hidden="true" />
                                  <span>Débloquer avec Progression+</span>
                                </>
                              ) : (
                                <>
                                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Agrandir le repère visuel</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- TAB 3: EVALUATION ---------------- */}
          {tab === 'evaluation' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-neutral-900">
                    Auto-évaluation {sportTheme.nom}
                  </h1>
                  <p className="mt-1 text-sm text-neutral-600">
                    Tests physiques sans matériel à réaliser toutes les 4 semaines pour mesurer votre progression.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPainModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800 hover:bg-red-100 min-h-[44px] self-start"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>Signaler une douleur</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* New Evaluation Form */}
                <form onSubmit={handleEvaluationSubmit} className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900">Nouvelle batterie de tests</h2>
                      <p className="text-xs text-neutral-500">Barème adapté au niveau : {LEVEL_LABELS[data.profile.niveau]}</p>
                    </div>

                    {/* Built-in Stopwatch / Countdown */}
                    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5">
                      <span className="font-mono text-base font-bold tabular-nums text-neutral-900 min-w-[44px]">
                        {chronoSeconds}s
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartChrono('30')}
                        className="rounded-lg bg-white border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100"
                      >
                        30s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartChrono('20')}
                        className="rounded-lg bg-white border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100"
                      >
                        20s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (chronoRunning) {
                            setChronoRunning(false);
                          } else {
                            handleStartChrono('up');
                          }
                        }}
                        className="rounded-lg bg-neutral-900 text-white px-2.5 py-1 text-xs font-medium"
                      >
                        {chronoRunning ? 'Stop' : 'Chrono'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {sportTheme.tests.map((testSpec) => (
                      <div key={testSpec.code} className="rounded-xl border border-neutral-200 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor={testSpec.code} className="text-sm font-semibold text-neutral-900">
                            {testSpec.nom}
                          </label>
                          <span className="text-xs font-mono text-neutral-500">{testSpec.unite}</span>
                        </div>
                        <p className="text-xs text-neutral-600 leading-relaxed">{testSpec.consigne}</p>
                        {!ecoMode && isOnline && testSpec.imageUrl && (
                          <div className="rounded-lg border border-neutral-100 bg-white p-2">
                            <img
                              src={testSpec.imageUrl}
                              alt={`Repère technique : ${testSpec.nom}`}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="h-28 w-full object-contain"
                            />
                          </div>
                        )}
                        <input
                          id={testSpec.code}
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={evalValues[testSpec.code] || ''}
                          onChange={(e) =>
                            setEvalValues((prev) => ({ ...prev, [testSpec.code]: e.target.value }))
                          }
                          placeholder={`Résultat en ${testSpec.unite}`}
                          className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 font-mono text-sm min-h-[44px]"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={evalSubmitting}
                    className={`w-full rounded-xl py-3 text-sm font-semibold text-white min-h-[48px] ${sportTheme.accentBgClass} ${sportTheme.accentHoverBgClass}`}
                  >
                    {evalSubmitting ? 'Calcul et enregistrement...' : 'Enregistrer mon auto-évaluation'}
                  </button>
                </form>

                {/* Comparison & History */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <h2 className="text-base font-semibold text-neutral-900">Comparaison récente</h2>
                    {latestEval ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-neutral-500">
                            {latestEval.type === 'INITIALE' ? 'Évaluation initiale' : 'Bilan périodique'} · {latestEval.date}
                          </span>
                          <div className="font-mono text-2xl font-bold tabular-nums text-neutral-900">
                            {latestEval.score_global}/100
                            {previousEval && (
                              <span className="ml-2 text-xs font-semibold text-emerald-700">
                                {latestEval.score_global - previousEval.score_global >= 0 ? '+' : ''}
                                {latestEval.score_global - previousEval.score_global} pts
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="divide-y divide-neutral-100">
                          {latestEval.results.map((r) => (
                            <div key={r.test_code} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-medium text-neutral-900">{r.test_nom}</div>
                                <div className="text-neutral-500 font-mono tabular-nums">
                                  {r.valeur} {r.unite}
                                </div>
                              </div>
                              <span
                                className={`font-semibold ${
                                  r.niveau_obtenu === 'Bon pour le niveau'
                                    ? 'text-emerald-700'
                                    : r.niveau_obtenu === 'Moyen'
                                      ? 'text-amber-700'
                                      : 'text-red-700'
                                }`}
                              >
                                {r.niveau_obtenu}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-neutral-600">
                        Réalisez votre première évaluation pour établir vos repères de départ.
                      </p>
                    )}
                  </div>

                  {/* Full History & Coach Comments */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-neutral-900">Historique et avis du coach</h2>
                      {!isProgressionUnlocked && data.evaluations.length > 1 && (
                        <span className="text-[11px] font-semibold text-amber-800">Progression+</span>
                      )}
                    </div>

                    {isProgressionUnlocked && evalChartData.length >= 2 && (
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                        <div className="text-[11px] font-medium text-neutral-500 mb-2">
                          Courbe d’évolution (score / 100)
                        </div>
                        <div className="h-36 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={evalChartData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6B7280' }} />
                              <Tooltip />
                              <Line
                                type="monotone"
                                dataKey="score"
                                name="Score"
                                stroke={sportTheme.accentHex}
                                strokeWidth={2.5}
                                dot={{ r: 3.5 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {data.evaluations.length === 0 ? (
                      <p className="text-xs text-neutral-500">Aucune évaluation enregistrée.</p>
                    ) : (
                      <div className="space-y-4">
                        {(isProgressionUnlocked ? data.evaluations : data.evaluations.slice(0, 1)).map((ev) => (
                          <div key={ev.id} className="rounded-xl border border-neutral-200 p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-neutral-900">
                                {ev.type} · {ev.date}
                              </span>
                              <span className="font-mono font-bold tabular-nums text-neutral-900">
                                {ev.score_global}/100
                              </span>
                            </div>
                            {ev.comments.length > 0 ? (
                              ev.comments.map((c) => (
                                <div key={c.id} className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-700">
                                  <span className="font-semibold text-neutral-900">{c.coach_nom} : </span>
                                  {c.texte}
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-neutral-500">En attente de commentaire du coach.</div>
                            )}
                          </div>
                        ))}

                        {!isProgressionUnlocked && data.evaluations.length > 1 && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {data.evaluations.length - 1} autre{data.evaluations.length - 1 > 1 ? 's' : ''} bilan{data.evaluations.length - 1 > 1 ? 's' : ''} et la courbe multi-mois disponibles
                              </span>
                            </div>
                            <p className="text-xs text-amber-900/90 leading-relaxed">
                              Votre évaluation du moment reste 100 % gratuite. Activez <strong>Progression+ (1 500 FCFA / mois)</strong> pour consulter la courbe d’évolution et tout votre historique comparatif.
                            </p>
                            <button
                              type="button"
                              onClick={() => setTab('profil')}
                              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                            >
                              Activer Progression+
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- TAB 4: PROFIL ---------------- */}
          {tab === 'profil' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-neutral-900">Profil et confidentialité</h1>
                <p className="mt-1 text-sm text-neutral-600">
                  Gérez vos coordonnées, votre poids, votre sport, le mode éco données et vos droits sur vos données.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Personal Info & Preferences */}
                <form onSubmit={handleSaveProfile} className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
                  <h2 className="text-base font-semibold text-neutral-900">Informations et préférences</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Prénom</label>
                      <input
                        type="text"
                        required
                        value={profilePrenom}
                        onChange={(e) => setProfilePrenom(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Nom</label>
                      <input
                        type="text"
                        required
                        value={profileNom}
                        onChange={(e) => setProfileNom(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Niveau</label>
                      <select
                        value={profileNiveau}
                        onChange={(e) => setProfileNiveau(e.target.value as AthleteLevel)}
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                      >
                        <option value="debutant">Débutant</option>
                        <option value="intermediaire">Intermédiaire</option>
                        <option value="avance">Avancé</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Poste</label>
                      <select
                        value={profilePoste}
                        onChange={(e) => setProfilePoste(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                      >
                        <option value="">Non précisé</option>
                        {sportTheme.positions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Taille (cm)</label>
                      <input
                        type="number"
                        value={profileTaille}
                        onChange={(e) => setProfileTaille(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Langue des consignes</label>
                      <select
                        value={profileLangue}
                        onChange={(e) => setProfileLangue(e.target.value as 'fr' | 'wo')}
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                      >
                        <option value="fr">Français</option>
                        <option value="wo">Wolof + Français</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2.5 rounded-xl border border-neutral-200 px-3 py-2.5 cursor-pointer min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={ecoMode}
                          onChange={(e) => setEcoMode(e.target.checked)}
                          className="h-4 w-4 accent-neutral-900"
                        />
                        <span className="text-xs font-medium text-neutral-800">Mode éco données</span>
                      </label>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifEnabled}
                      onChange={(e) => setNotifEnabled(e.target.checked)}
                      className="h-4 w-4 accent-neutral-900"
                    />
                    <span className="text-xs text-neutral-700">Recevoir les rappels de séance et retours coach</span>
                  </label>

                  <button
                    type="submit"
                    className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                  >
                    Enregistrer le profil
                  </button>
                </form>

                {/* Weight & Sport Switch */}
                <div className="lg:col-span-5 space-y-6">
                  <form onSubmit={handleSaveWeight} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                    <h2 className="text-base font-semibold text-neutral-900">Suivi du poids</h2>
                    <p className="text-xs text-neutral-500">
                      Dernière mesure :{' '}
                      <span className="font-mono font-semibold text-neutral-900">
                        {data.weights[data.weights.length - 1]?.poids_kg ?? '—'} kg
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min={30}
                        max={220}
                        required
                        value={newWeight}
                        onChange={(e) => setNewWeight(e.target.value)}
                        placeholder="Nouveau poids (kg)"
                        className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                      >
                        Ajouter
                      </button>
                    </div>
                  </form>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {notifEnabled && notifPermission === 'granted' ? (
                            <BellRing className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                          ) : (
                            <BellOff className="h-4 w-4 text-neutral-500 shrink-0" aria-hidden="true" />
                          )}
                          <h2 className="text-base font-semibold text-neutral-900">Rappels push locaux (PWA)</h2>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          Alertes locales avant vos séances programmées · zéro SMS payant requis.
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          notifPermission === 'granted' && notifEnabled
                            ? 'text-emerald-700'
                            : notifPermission === 'denied'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {notifPermission === 'unsupported'
                          ? 'Non supporté'
                          : notifPermission === 'denied'
                            ? 'Bloqué'
                            : notifPermission === 'granted'
                              ? notifEnabled
                                ? 'Actifs'
                                : 'En pause'
                              : 'À autoriser'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="pwa-reminder-time" className="block text-xs font-medium text-neutral-700 mb-1">
                          Heure habituelle
                        </label>
                        <input
                          id="pwa-reminder-time"
                          type="time"
                          value={reminderTime}
                          onChange={(e) => setReminderTime(e.target.value || '18:00')}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[42px]"
                        />
                      </div>
                      <div>
                        <label htmlFor="pwa-reminder-lead" className="block text-xs font-medium text-neutral-700 mb-1">
                          Délai de rappel
                        </label>
                        <select
                          id="pwa-reminder-lead"
                          value={reminderLeadMinutes}
                          onChange={(e) => setReminderLeadMinutes(Number(e.target.value))}
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                        >
                          <option value={0}>À l’heure prévue</option>
                          <option value={15}>15 min avant</option>
                          <option value={30}>30 min avant</option>
                          <option value={60}>1 heure avant</option>
                          <option value={120}>2 heures avant</option>
                        </select>
                      </div>
                    </div>

                    {nextReminder ? (
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 space-y-0.5">
                        <div className="font-semibold text-neutral-900">
                          Prochain rappel ciblé : {nextReminder.sessionTitle}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-600 tabular-nums">
                          {nextReminder.datePrevue} · séance à {reminderTime} ({formatReminderLeadLabel(reminderLeadMinutes).toLowerCase()})
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        Toutes les séances de la semaine en cours sont déjà réalisées.
                      </p>
                    )}

                    {notifPermission === 'denied' && (
                      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 leading-relaxed">
                        Les notifications sont actuellement bloquées dans votre navigateur. Réactivez-les depuis les paramètres du site (icône cadenas dans la barre d’adresse).
                      </p>
                    )}

                    <div className="text-[11px] text-neutral-500 leading-relaxed">
                      Service Worker PWA : {swReady ? 'prêt' : 'initialisation'}{' '}
                      {supportsTriggerApi ? '· planification OS native active' : '· rappel actif à l’ouverture et en arrière-plan'}. Sur iPhone/iPad (iOS 16.4+), installez l’app sur l’écran d’accueil pour recevoir les notifications.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {notifPermission === 'default' && (
                        <button
                          type="button"
                          onClick={handleEnablePwaNotifications}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 min-h-[40px]"
                        >
                          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Autoriser les notifications</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={reminderSubmitting}
                        onClick={() => handleSaveReminders(notifEnabled, reminderTime, reminderLeadMinutes)}
                        className="rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[40px]"
                      >
                        {reminderSubmitting ? 'Enregistrement...' : 'Enregistrer les rappels'}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestPwaNotification}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[40px]"
                      >
                        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Tester</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                    <h2 className="text-base font-semibold text-neutral-900">Discipline active : {sportTheme.nom}</h2>
                    <p className="text-xs text-neutral-600">
                      Changer de sport adapte l’interface, les séances et la batterie de tests.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['football', 'basket', 'handball', 'volleyball', 'athletisme'] as SportCode[]).map((code) => (
                        <button
                          key={code}
                          type="button"
                          disabled={code === data.profile.sport_code}
                          onClick={() => setPendingSportChange(code)}
                          className={`rounded-xl border px-3.5 py-2 text-xs font-medium min-h-[40px] ${
                            code === data.profile.sport_code
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {SPORTS_CONFIG[code].nom}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Plan Tier, Coach Switch & Data Privacy */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-neutral-900">
                      Ma formule Terrain+ & Coach
                    </h2>
                    <span className="font-mono text-xs font-semibold text-neutral-700">
                      {currentPlanShortLabel}
                    </span>
                  </div>

                  {currentPlanTier === 'COACH_PRIVE' && data.coach && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-neutral-900">
                          Coach actif : {data.coach.prenom} {data.coach.nom}
                        </span>
                        <span className="text-xs font-medium text-emerald-800">{data.coach.zone}</span>
                      </div>
                      <div className="text-xs text-neutral-600">
                        {data.coach.specialite} · {data.coach.qualification}
                      </div>
                    </div>
                  )}

                  {/* 3-Tier Plan Selector */}
                  <form onSubmit={(e) => handleSwitchAthletePlan(e)} className="space-y-3">
                    <div className="space-y-2">
                      {(
                        [
                          {
                            tier: 'ESSENTIEL' as const,
                            title: 'Essentiel',
                            price: '0 FCFA / mois',
                            desc: 'Programme hebdo, séance du jour, alerte douleur 100 % gratuite, collectif & 2 séances hors ligne.',
                          },
                          {
                            tier: 'PROGRESSION' as const,
                            title: 'Progression+',
                            price:
                              planSwitchBilling === 'TRIMESTRIEL'
                                ? '4 000 FCFA / trimestre'
                                : '1 500 FCFA / mois',
                            desc: 'Hors-ligne illimité, tous les cycles avancés, fiches anatomie avec charge et courbes d’évolution.',
                          },
                          {
                            tier: 'COACH_PRIVE' as const,
                            title: 'Suivi Coach',
                            price: '5 000 FCFA / mois',
                            desc: 'Tout Progression+ + coach vérifié dédié (80 % reversés au coach, 20 % plateforme).',
                          },
                        ] as const
                      ).map((opt) => {
                        const selected = targetPlanDraft === opt.tier;
                        const activeNow = currentPlanTier === opt.tier;
                        return (
                          <button
                            key={opt.tier}
                            type="button"
                            onClick={() => {
                              setTargetPlanDraft(opt.tier);
                              setConfirmPlanSwitch(false);
                            }}
                            className={`w-full rounded-xl border p-3 text-left transition-colors ${
                              selected
                                ? 'border-neutral-900 bg-neutral-50'
                                : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-neutral-900">
                                {opt.title}
                                {activeNow ? ' (Formule actuelle)' : ''}
                              </span>
                              <span className="font-mono text-xs font-bold text-[#0D3B2A]">{opt.price}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-neutral-600 leading-relaxed">{opt.desc}</p>
                          </button>
                        );
                      })}
                    </div>

                    {targetPlanDraft === 'PROGRESSION' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPlanSwitchBilling('MENSUEL')}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium min-h-[38px] ${
                            planSwitchBilling === 'MENSUEL'
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-300 text-neutral-700'
                          }`}
                        >
                          Mensuel · 1 500 F
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlanSwitchBilling('TRIMESTRIEL')}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium min-h-[38px] ${
                            planSwitchBilling === 'TRIMESTRIEL'
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-300 text-neutral-700'
                          }`}
                        >
                          Trimestriel · 4 000 F
                        </button>
                      </div>
                    )}

                    {targetPlanDraft === 'COACH_PRIVE' && data.availableCoaches.length > 0 && (
                      <div className="space-y-2 border-t border-neutral-100 pt-2">
                        <div className="text-xs font-semibold text-neutral-800">
                          Choisir ou changer votre coach vérifié :
                        </div>
                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                          {data.availableCoaches.map((c) => {
                            const isCurrent = data.coach?.id === c.id;
                            const isSelected = selectedCoachDraftId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedCoachDraftId(c.id)}
                                className={`w-full rounded-xl border p-3 text-left flex items-center justify-between gap-3 transition-colors ${
                                  isSelected
                                    ? 'border-neutral-900 bg-neutral-50'
                                    : 'border-neutral-200 hover:border-neutral-300'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-neutral-900">
                                    {c.prenom} {c.nom} · {c.zone}
                                    {isCurrent ? ' (Actuel)' : ''}
                                  </div>
                                  <div className="text-[11px] text-neutral-600 truncate">
                                    {c.specialite} · {c.qualification}
                                  </div>
                                </div>
                                <span className="font-mono text-xs font-bold text-[#0D3B2A] shrink-0">
                                  {c.athlete_monthly_fee_fcfa.toLocaleString('fr-FR')} F/mois
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {targetPlanDraft !== 'ESSENTIEL' && (
                      <label className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 p-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmPlanSwitch}
                          onChange={(e) => setConfirmPlanSwitch(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-neutral-900"
                        />
                        <span className="text-[11px] text-neutral-700 leading-relaxed">
                          {targetPlanDraft === 'COACH_PRIVE'
                            ? 'Je confirme la formule Suivi Coach à 5 000 FCFA / mois (dont 80 % reversés au coach sélectionné).'
                            : `Je confirme la formule Progression+ (${planSwitchBilling === 'TRIMESTRIEL' ? '4 000 FCFA / trimestre' : '1 500 FCFA / mois'}).`}
                        </span>
                      </label>
                    )}

                    <button
                      type="submit"
                      disabled={coachActionSubmitting}
                      className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[42px]"
                    >
                      {coachActionSubmitting
                        ? 'Mise à jour...'
                        : targetPlanDraft === 'ESSENTIEL'
                          ? 'Passer / Rester en Essentiel gratuit (0 FCFA)'
                          : targetPlanDraft === 'PROGRESSION'
                            ? `Activer Progression+ (${planSwitchBilling === 'TRIMESTRIEL' ? '4 000 F / trim.' : '1 500 F / mois'})`
                            : 'Activer / Mettre à jour Suivi Coach (5 000 F / mois)'}
                    </button>
                  </form>

                  <form onSubmit={handleRequestCoachChange} className="flex gap-2 border-t border-neutral-100 pt-3">
                    <input
                      type="text"
                      value={coachChangeMotif}
                      onChange={(e) => setCoachChangeMotif(e.target.value)}
                      placeholder="Note optionnelle pour l’administrateur"
                      className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[40px] whitespace-nowrap"
                    >
                      Signaler
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-neutral-200 bg-white p-5 space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                      <h2 className="text-base font-semibold text-neutral-900">Confidentialité et sécurité</h2>
                    </div>
                    <p className="text-xs text-neutral-600">
                      Consentements actifs : {data.consents.map((c) => `${c.type} (${c.version})`).join(' · ')}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleExportData}
                        className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[44px]"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        <span>Exporter mes données (JSON)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletePassword('');
                          setShowDeleteConfirm(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800 hover:bg-red-100 min-h-[44px]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Supprimer mon compte</span>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-3 border-t border-neutral-100 pt-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Changer mon mot de passe</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="password"
                        required
                        value={currentPasswordInput}
                        onChange={(e) => setCurrentPasswordInput(e.target.value)}
                        placeholder="Mot de passe actuel"
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                      />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="Nouveau (8+ car., lettres+chiffres)"
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={passwordSubmitting}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[40px]"
                    >
                      {passwordSubmitting ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (<= 15% viewport height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-md pb-safe">
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? sportTheme.accentTextClass : 'text-neutral-500'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sport Change Confirmation Modal */}
      {pendingSportChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">
              Passer au {SPORTS_CONFIG[pendingSportChange].nom} ?
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Ce changement adapte immédiatement les couleurs de l’interface, les séances de votre semaine et les tests d’auto-évaluation. Votre historique de poids et d’évaluations passées est conservé.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingSportChange(null)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmSportChange}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white min-h-[44px]"
              >
                Confirmer le changement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleDeleteAccount}
            className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-neutral-900">Supprimer définitivement votre compte ?</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Toutes vos données personnelles, mesures de poids, évaluations et séances planifiées seront supprimées de la base Terrain+. Saisissez votre mot de passe actuel pour confirmer cette action irréversible.
            </p>
            <div>
              <label htmlFor="delete-account-password" className="block text-xs font-medium text-neutral-700 mb-1">
                Mot de passe actuel *
              </label>
              <input
                id="delete-account-password"
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeletePassword('');
                  setShowDeleteConfirm(false);
                }}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 min-h-[44px]"
              >
                Supprimer définitivement
              </button>
            </div>
          </form>
        </div>
      )}

      {showGuidedTourOnMount && (
        <GuidedTourModal
          sportCode={data.profile.sport_code}
          prenom={data.user.prenom}
          onFinish={(goEval) => {
            onDismissGuidedTour();
            if (goEval) setTab('evaluation');
          }}
        />
      )}

      {activePlayer && (
        <GuidedSessionPlayer
          session={activePlayer.session}
          scheduledId={activePlayer.scheduledId}
          defaultLangue={data.user.langue}
          ecoMode={ecoMode}
          onClose={() => setActivePlayer(null)}
          onCompleted={() => {
            setActivePlayer(null);
            setFeedbackBanner('Séance enregistrée. Bravo pour votre régularité.');
            loadWorkspace();
          }}
          onReportPain={() => {
            setActivePlayer(null);
            setShowPainModal(true);
          }}
        />
      )}

      {selectedFicheModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-neutral-200 overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-3.5">
              <div>
                <div className="text-[11px] font-semibold text-neutral-500">
                  {selectedFicheModal.category} · {selectedFicheModal.muscles}
                </div>
                <h3 className="text-base font-semibold text-neutral-900">{selectedFicheModal.titre}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFicheModal(null)}
                aria-label="Fermer la fiche"
                className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-white p-4 sm:p-6 flex items-center justify-center">
              <img
                src={selectedFicheModal.imageUrl}
                alt={selectedFicheModal.titre}
                decoding="async"
                referrerPolicy="no-referrer"
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
            <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-3.5 text-xs text-neutral-700 leading-relaxed">
              {selectedFicheModal.caption}
            </div>
          </div>
        </div>
      )}

      {upgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-800">
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">Option Terrain+</span>
              </div>
              <button
                type="button"
                onClick={() => setUpgradePrompt(null)}
                aria-label="Fermer"
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <h3 className="text-lg font-semibold text-neutral-900">{upgradePrompt.title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{upgradePrompt.reason}</p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpgradePrompt(null)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 min-h-[42px]"
              >
                Rester en Essentiel
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpgradePrompt(null);
                  setTargetPlanDraft('PROGRESSION');
                  setTab('profil');
                }}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[42px]"
              >
                Voir Progression+ / Suivi Coach
              </button>
            </div>
          </div>
        </div>
      )}

      {showPainModal && (
        <PainReportModal
          onClose={() => setShowPainModal(false)}
          onSubmitted={() => loadWorkspace()}
        />
      )}
    </div>
  );
};
