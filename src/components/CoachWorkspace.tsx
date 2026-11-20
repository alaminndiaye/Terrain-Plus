import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ClipboardList,
  Link2,
  LogOut,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import {
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
  getSessionToken,
  readJsonCache,
  writeJsonCache,
} from '../lib/api';
import { LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';
import { CoachVideoPlayer, formatVideoSizeMb } from './CoachVideoPlayer';
import type {
  AlertRecord,
  AthleteLevel,
  AthleteWorkspacePayload,
  AuthUser,
  CoachAthleteSummary,
  CoachVideoItem,
  SessionTemplate,
  SportCode,
} from '../types';

type CoachTab = 'athletes' | 'videos' | 'alertes' | 'proposer';

interface CoachOverviewResponse {
  coach: AuthUser;
  coachProfile?: {
    specialite: string;
    qualification: string;
    zone: string;
    monthly_fee_fcfa: number;
    athlete_monthly_fee_fcfa: number;
    platform_subscription_status: string;
    coach_plan?: 'MARKETPLACE' | 'COACH_PRO';
    commission_pct?: number;
    athlete_payout_fcfa?: number;
    verification_status?: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
  } | null;
  athletes: CoachAthleteSummary[];
  alerts: AlertRecord[];
  library: Array<Omit<SessionTemplate, 'exercises'>>;
}

interface CoachVideosQuota {
  usedBytes: number;
  maxBytes: number;
  maxFileBytes: number;
  storageMode: 'supabase' | 'local';
}

interface CoachVideosResponse {
  videos: CoachVideoItem[];
  quota: CoachVideosQuota;
}

const COACH_OVERVIEW_CACHE_KEY = 'terrain_plus_coach_overview_v1';
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function resolveVideoMimeType(file: File): string {
  if (file.type && ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type.toLowerCase())) {
    return file.type.toLowerCase();
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return file.type || '';
}

export const CoachWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [tab, setTab] = useState<CoachTab>('athletes');
  const [overview, setOverview] = useState<CoachOverviewResponse | null>(() =>
    readJsonCache<CoachOverviewResponse>(
      COACH_OVERVIEW_CACHE_KEY,
      (v): v is CoachOverviewResponse =>
        Boolean(v && typeof v === 'object' && Array.isArray((v as CoachOverviewResponse).athletes))
    )
  );
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteWorkspacePayload | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!overview);
  const [notice, setNotice] = useState<string | null>(null);

  // Athlete dossier interactive states
  const [objectiveInput, setObjectiveInput] = useState('');
  const [commentByEval, setCommentByEval] = useState<Record<number, string>>({});
  const [adjustingSlotId, setAdjustingSlotId] = useState<number | null>(null);
  const [adjustSessionId, setAdjustSessionId] = useState<string>('');
  const [adjustIsRest, setAdjustIsRest] = useState(false);
  const [adjustMotif, setAdjustMotif] = useState('');

  // Alert resolution
  const [resolveNoteByAlert, setResolveNoteByAlert] = useState<Record<number, string>>({});

  // Propose session form
  const [propSport, setPropSport] = useState<SportCode>('football');
  const [propTitre, setPropTitre] = useState('');
  const [propNiveau, setPropNiveau] = useState<AthleteLevel>('debutant');
  const [propDuree, setPropDuree] = useState('20');
  const [propObjectif, setPropObjectif] = useState('');
  const [propPrevention, setPropPrevention] = useState('');
  const [propConsigneFr, setPropConsigneFr] = useState('');
  const [propConsigneWo, setPropConsigneWo] = useState('');

  // Coach session videos state (Supabase Free Tier aware)
  const [coachVideos, setCoachVideos] = useState<CoachVideoItem[]>([]);
  const [videoQuota, setVideoQuota] = useState<CoachVideosQuota>({
    usedBytes: 0,
    maxBytes: 100 * 1024 * 1024,
    maxFileBytes: 15 * 1024 * 1024,
    storageMode: 'local',
  });
  const [videoMode, setVideoMode] = useState<'file' | 'url'>('file');
  const [videoTitre, setVideoTitre] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [videoSport, setVideoSport] = useState<SportCode>('football');
  const [videoAthleteId, setVideoAthleteId] = useState<string>('');
  const [videoSessionId, setVideoSessionId] = useState<string>('');
  const [videoExternalUrl, setVideoExternalUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);

  const loadVideos = useCallback(async () => {
    try {
      const res = await apiRequest<CoachVideosResponse>('/api/coach/videos');
      setCoachVideos(res.videos);
      setVideoQuota(res.quota);
    } catch {
      // Non-fatal if offline; keep existing list
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiRequest<CoachOverviewResponse>('/api/coach/overview');
      setOverview(res);
      writeJsonCache(COACH_OVERVIEW_CACHE_KEY, res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      const cached = readJsonCache<CoachOverviewResponse>(COACH_OVERVIEW_CACHE_KEY);
      if (cached) {
        setOverview(cached);
        setNotice('Connexion instable ou hors ligne : affichage des dernières données synchronisées.');
      } else {
        setNotice(err instanceof Error ? err.message : 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadOverview();
    loadVideos();
  }, [loadOverview, loadVideos]);

  const openAthleteDossier = async (athleteId: number) => {
    try {
      const dossier = await apiRequest<AthleteWorkspacePayload>(`/api/coach/athletes/${athleteId}`);
      setSelectedAthlete(dossier);
      setObjectiveInput(dossier.program?.objectif || dossier.profile.objectif || '');
      setAdjustingSlotId(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Impossible d'ouvrir la fiche.");
    }
  };

  const filteredAthletes = useMemo(() => {
    if (!overview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return overview.athletes;
    return overview.athletes.filter(
      (a) =>
        `${a.prenom} ${a.nom}`.toLowerCase().includes(q) ||
        SPORTS_CONFIG[a.sport_code].nom.toLowerCase().includes(q)
    );
  }, [overview, search]);

  const handleUpdateObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthlete || !objectiveInput.trim()) return;
    try {
      await apiRequest(`/api/coach/athletes/${selectedAthlete.user.id}/objectives`, {
        method: 'PATCH',
        body: JSON.stringify({ objectif: objectiveInput.trim() }),
      });
      setNotice('Objectif mis à jour sur le tableau de bord de l’athlète.');
      await openAthleteDossier(selectedAthlete.user.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleAddComment = async (evalId: number) => {
    if (!selectedAthlete) return;
    const text = (commentByEval[evalId] || '').trim();
    if (!text) return;
    try {
      await apiRequest(`/api/coach/evaluations/${evalId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ texte: text }),
      });
      setCommentByEval((prev) => ({ ...prev, [evalId]: '' }));
      setNotice('Commentaire ajouté à l’évaluation.');
      await openAthleteDossier(selectedAthlete.user.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleAdjustSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthlete || !adjustingSlotId) return;
    try {
      await apiRequest(`/api/coach/scheduled/${adjustingSlotId}/adjust`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_rest_day: adjustIsRest,
          session_id: adjustIsRest ? null : Number(adjustSessionId),
          motif_ajustement: adjustMotif.trim(),
        }),
      });
      setAdjustingSlotId(null);
      setAdjustMotif('');
      setNotice('Programme ajusté. L’athlète verra la date et le motif de modification.');
      await openAthleteDossier(selectedAthlete.user.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    try {
      await apiRequest(`/api/coach/alerts/${alertId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          note_traitement:
            resolveNoteByAlert[alertId]?.trim() ||
            'Alerte prise en compte et charge d’entraînement adaptée.',
        }),
      });
      setNotice('Alerte marquée comme traitée.');
      await loadOverview();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleProposeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/coach/sessions/propose', {
        method: 'POST',
        body: JSON.stringify({
          sport_code: propSport,
          titre: propTitre,
          niveau: propNiveau,
          duree_min: Number(propDuree),
          objectif: propObjectif,
          prevention_focus: propPrevention,
          consigneFr: propConsigneFr,
          consigneWo: propConsigneWo,
        }),
      });
      setPropTitre('');
      setPropObjectif('');
      setPropPrevention('');
      setPropConsigneFr('');
      setPropConsigneWo('');
      setNotice('Séance soumise à la file de relecture avant publication.');
      await loadOverview();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleSwitchCoachPlan = async (targetPlan: 'MARKETPLACE' | 'COACH_PRO') => {
    try {
      const res = await apiRequest<{ message: string }>('/api/coach/plan', {
        method: 'PATCH',
        body: JSON.stringify({ coach_plan: targetPlan }),
      });
      setNotice(res.message);
      await loadOverview();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors du changement de formule.');
    }
  };

  const handlePublishCoachVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoTitre.trim()) {
      setNotice('Renseignez un titre pour la vidéo.');
      return;
    }

    setVideoUploading(true);
    try {
      if (videoMode === 'url') {
        await apiRequest('/api/coach/videos', {
          method: 'POST',
          body: JSON.stringify({
            titre: videoTitre.trim(),
            description: videoDesc.trim() || null,
            sport_code: videoSport,
            session_id: videoSessionId ? Number(videoSessionId) : null,
            athlete_user_id: videoAthleteId ? Number(videoAthleteId) : null,
            source_type: 'EXTERNAL_URL',
            external_url: videoExternalUrl.trim(),
          }),
        });
        setNotice('Lien vidéo publié pour vos étudiants (0 Mo utilisés sur le stockage).');
      } else {
        if (!videoFile) {
          setNotice('Sélectionnez un fichier vidéo MP4, WebM ou MOV (max 15 Mo).');
          setVideoUploading(false);
          return;
        }
        const mimeType = resolveVideoMimeType(videoFile);
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) {
          setNotice('Format non supporté. Utilisez MP4, WebM ou MOV.');
          setVideoUploading(false);
          return;
        }
        if (videoFile.size > videoQuota.maxFileBytes) {
          setNotice(
            `Vidéo trop lourde (${(videoFile.size / (1024 * 1024)).toFixed(1)} Mo). Limite Supabase gratuit : ${Math.round(videoQuota.maxFileBytes / (1024 * 1024))} Mo max, ou utilisez un lien HTTPS.`
          );
          setVideoUploading(false);
          return;
        }

        const uploadTarget = await apiRequest<{
          uploadMode: 'supabase_signed' | 'local_proxy';
          signedUrl?: string;
          uploadUrl?: string;
          uploadToken?: string;
          objectPath: string;
        }>('/api/coach/videos/upload-url', {
          method: 'POST',
          body: JSON.stringify({
            mime_type: mimeType,
            file_size_bytes: videoFile.size,
          }),
        });

        let finalSourceType: 'SUPABASE_STORAGE' | 'LOCAL_STORAGE' = 'LOCAL_STORAGE';

        if (uploadTarget.uploadMode === 'supabase_signed' && uploadTarget.signedUrl) {
          const putRes = await fetch(uploadTarget.signedUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': mimeType,
              'x-upsert': 'true',
            },
            body: videoFile,
          });
          if (!putRes.ok) {
            throw new Error('Échec du téléversement direct vers Supabase Storage.');
          }
          finalSourceType = 'SUPABASE_STORAGE';
        } else if (uploadTarget.uploadUrl && uploadTarget.uploadToken) {
          const token = getSessionToken();
          const putRes = await fetch(uploadTarget.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': mimeType,
              'x-object-path': uploadTarget.objectPath,
              'x-upload-token': uploadTarget.uploadToken,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'include',
            body: videoFile,
          });
          if (!putRes.ok) {
            const errJson = (await putRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(errJson.error || 'Échec du téléversement du fichier vidéo.');
          }
          finalSourceType = 'LOCAL_STORAGE';
        } else {
          throw new Error('Configuration de téléversement vidéo incomplète.');
        }

        await apiRequest('/api/coach/videos', {
          method: 'POST',
          body: JSON.stringify({
            titre: videoTitre.trim(),
            description: videoDesc.trim() || null,
            sport_code: videoSport,
            session_id: videoSessionId ? Number(videoSessionId) : null,
            athlete_user_id: videoAthleteId ? Number(videoAthleteId) : null,
            source_type: finalSourceType,
            storage_path: uploadTarget.objectPath,
            mime_type: mimeType,
            file_size_bytes: videoFile.size,
          }),
        });
        setNotice('Vidéo de séance téléversée et partagée avec vos étudiants.');
      }

      setVideoTitre('');
      setVideoDesc('');
      setVideoExternalUrl('');
      setVideoFile(null);
      await loadVideos();
      if (selectedAthlete) {
        await openAthleteDossier(selectedAthlete.user.id);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Impossible de publier la vidéo.');
    } finally {
      setVideoUploading(false);
    }
  };

  const handleDeleteCoachVideo = async (videoId: number) => {
    try {
      await apiRequest(`/api/coach/videos/${videoId}`, { method: 'DELETE' });
      setNotice('Vidéo supprimée et espace de stockage libéré.');
      await loadVideos();
      if (selectedAthlete) {
        await openAthleteDossier(selectedAthlete.user.id);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    clearAllWorkspaceCaches();
    onLoggedOut();
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen obsidian-ambient flex items-center justify-center text-sm text-[#B4BCA9]">
        Chargement de l'espace Coach...
      </div>
    );
  }

  const openAlertsCount = overview ? overview.alerts.filter((a) => !a.traitee).length : 0;

  const coachNavItems: Array<{
    id: CoachTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'athletes',
      label: `Mes athlètes (${overview?.athletes.length || 0})`,
      mobileLabel: 'Athlètes',
      icon: Users,
    },
    {
      id: 'videos',
      label: `Vidéos séances (${coachVideos.length})`,
      mobileLabel: 'Vidéos',
      icon: Video,
    },
    {
      id: 'alertes',
      label: 'Alertes',
      mobileLabel: 'Alertes',
      icon: Bell,
      badge: openAlertsCount,
    },
    {
      id: 'proposer',
      label: 'Proposer une séance',
      mobileLabel: 'Proposer',
      icon: PlusCircle,
    },
  ];

  return (
    <div className="min-h-screen obsidian-ambient text-[#F5F7F1] flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-white/[0.08] bg-[#0C0F0A]">
        <div className="p-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-contain shrink-0"
            />
            <span className="font-display text-lg font-bold tracking-tight text-[#F5F7F1]">
              Terrain<span className="text-[#C8F62D]">+</span>
            </span>
          </div>
          <div className="mt-2 text-xs font-medium text-[#8E9784]">Espace Coach · Suivi affecté</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {coachNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSelectedAthlete(null);
                }}
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] text-left transition-colors ${
                  active
                    ? 'bg-[#C8F62D] text-[#080A07] font-bold'
                    : 'text-[#B4BCA9] hover:bg-white/[0.06] hover:text-[#F5F7F1]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 rounded-md px-1.5 py-0.5 ${
                      active ? 'bg-[#080A07] text-[#C8F62D]' : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.08] space-y-3">
          {overview?.coachProfile && (
            <div className="obsidian-inset rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-[#F5F7F1]">
                  {overview.coachProfile.coach_plan === 'COACH_PRO' ? 'Coach Pro' : 'Marketplace'}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#C8F62D]">
                  {overview.coachProfile.monthly_fee_fcfa.toLocaleString('fr-FR')} F/mois
                </span>
              </div>
              <div className="text-[11px] text-[#B4BCA9] leading-snug">
                Revenu par élève :{' '}
                <strong className="text-[#F5F7F1]">
                  {(overview.coachProfile.athlete_payout_fcfa ?? 4000).toLocaleString('fr-FR')} F/mois
                </strong>{' '}
                ({100 - (overview.coachProfile.commission_pct ?? 20)} %)
              </div>
              <button
                type="button"
                onClick={() =>
                  handleSwitchCoachPlan(
                    overview.coachProfile?.coach_plan === 'COACH_PRO' ? 'MARKETPLACE' : 'COACH_PRO'
                  )
                }
                className="w-full rounded-lg border border-white/15 bg-[#121610] px-2.5 py-1.5 text-[11px] font-semibold text-[#F5F7F1] hover:bg-white/[0.08]"
              >
                {overview.coachProfile.coach_plan === 'COACH_PRO'
                  ? 'Passer à Marketplace (0 F)'
                  : 'Passer à Coach Pro (3 000 F)'}
              </button>
            </div>
          )}
          <p className="text-xs text-[#8E9784] leading-relaxed">
            Accès strict aux athlètes affectés. Chaque consultation est journalisée. Le coach ne pose pas de diagnostic médical.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-xs font-medium text-[#F5F7F1] hover:bg-white/[0.08] min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Top Header */}
        <header className="md:hidden flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0B0E09] px-4 h-[52px]">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-[#F5F7F1] truncate">
              Espace Coach Prépa
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-[#B4BCA9] hover:text-[#F5F7F1] min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
            aria-label="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-5xl space-y-6">
          {overview?.coachProfile?.verification_status === 'EN_ATTENTE' && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 px-4 py-3 text-xs text-amber-200 leading-relaxed">
              <strong>Dossier en attente de validation :</strong> un administrateur Terrain+ doit vérifier votre qualification et votre zone avant que votre profil apparaisse dans la liste publique des athlètes.
            </div>
          )}

          {overview?.coachProfile?.verification_status === 'REFUSE' && (
            <div className="rounded-xl border border-red-400/35 bg-red-950/50 px-4 py-3 text-xs text-red-200 leading-relaxed">
              <strong>Profil coach suspendu :</strong> votre dossier n’est actuellement pas validé pour le suivi des athlètes. Contactez l’administration Terrain+.
            </div>
          )}

          {notice && (
            <div className="obsidian-card rounded-xl px-4 py-3 text-sm text-[#F5F7F1] flex items-center justify-between gap-3">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs font-semibold text-[#C8F62D] hover:text-[#D7FA59] shrink-0"
              >
                Fermer
              </button>
            </div>
          )}

          {/* ---------------- ATHLETE DOSSIER VIEW ---------------- */}
          {tab === 'athletes' && selectedAthlete && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setSelectedAthlete(null)}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#B4BCA9] hover:text-[#F5F7F1] min-h-[40px]"
              >
                <ArrowLeft className="h-4 w-4 text-[#C8F62D]" aria-hidden="true" />
                <span>Retour à la liste des athlètes</span>
              </button>

              <div className="obsidian-card-glow rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[#C8F62D] font-semibold">
                    {SPORTS_CONFIG[selectedAthlete.profile.sport_code].nom} ·{' '}
                    {LEVEL_LABELS[selectedAthlete.profile.niveau]} ·{' '}
                    {selectedAthlete.profile.poste || 'Tout poste'}
                    {selectedAthlete.user.is_minor ? ' · Compte mineur privé' : ''}
                  </div>
                  <h1 className="mt-1 font-display text-2xl font-bold text-[#F5F7F1]">
                    {selectedAthlete.user.prenom} {selectedAthlete.user.nom}
                  </h1>
                </div>
                <div className="flex items-center gap-6 font-mono tabular-nums text-sm">
                  <div className="obsidian-inset rounded-xl px-3.5 py-2">
                    <div className="text-[11px] text-[#8E9784]">Semaine</div>
                    <div className="font-bold text-[#C8F62D]">
                      {selectedAthlete.stats.weeklyCompleted}/{selectedAthlete.stats.weeklyTarget}
                    </div>
                  </div>
                  <div className="obsidian-inset rounded-xl px-3.5 py-2">
                    <div className="text-[11px] text-[#8E9784]">RPE moyen</div>
                    <div className="font-bold text-[#F5F7F1]">{selectedAthlete.stats.avgRpe ?? '—'}/10</div>
                  </div>
                </div>
              </div>

              {/* Objectives + Weight Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form onSubmit={handleUpdateObjective} className="lg:col-span-5 obsidian-card rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-semibold text-[#F5F7F1]">Objectifs fixés avec l’athlète</h2>
                  <textarea
                    rows={3}
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784]"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#C8F62D] px-5 py-2 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[40px]"
                  >
                    Mettre à jour les objectifs
                  </button>
                </form>

                <div className="lg:col-span-7 obsidian-card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-[#F5F7F1]">Tendance du poids</h2>
                  <div className="mt-3 h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedAthlete.weights} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#8E9784' }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                          tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                        />
                        <YAxis
                          domain={['dataMin - 2', 'dataMax + 2']}
                          tick={{ fontSize: 11, fill: '#8E9784' }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                          tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#121610',
                            borderColor: 'rgba(255,255,255,0.15)',
                            borderRadius: 12,
                            color: '#F5F7F1',
                          }}
                          itemStyle={{ color: '#F5F7F1' }}
                          labelStyle={{ color: '#C8F62D' }}
                        />
                        <Line type="monotone" dataKey="poids_kg" name="Poids (kg)" stroke="#C8F62D" strokeWidth={2.5} dot={{ r: 3.5, fill: '#C8F62D' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Adjust Weekly Program */}
              <div className="obsidian-card rounded-2xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-[#F5F7F1]">Ajuster le programme hebdomadaire</h2>
                  <p className="text-xs text-[#8E9784]">
                    Toute modification est visible par l’athlète avec la date et le motif.
                  </p>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {selectedAthlete.schedule.map((slot) => (
                    <div key={slot.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-[#8E9784]">
                          {DAY_NAMES[slot.jour_semaine - 1]} · <span className="font-mono">{slot.date_prevue}</span>
                          {slot.ajustee_par_coach && <span className="text-[#C8F62D]"> · Ajustée</span>}
                        </div>
                        <div className="text-sm font-semibold text-[#F5F7F1]">
                          {slot.is_rest_day || !slot.session ? 'Repos' : slot.session.titre}
                        </div>
                        {slot.motif_ajustement && (
                          <div className="text-xs text-[#B4BCA9]">Motif : {slot.motif_ajustement}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustingSlotId(slot.id);
                          setAdjustIsRest(slot.is_rest_day);
                          setAdjustSessionId(
                            slot.session_id
                              ? String(slot.session_id)
                              : String(selectedAthlete.library[0]?.id || '')
                          );
                          setAdjustMotif(slot.motif_ajustement || '');
                        }}
                        className="rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-xs font-medium text-[#F5F7F1] hover:bg-white/[0.08] min-h-[38px] self-start sm:self-center"
                      >
                        Modifier ce jour
                      </button>
                    </div>
                  ))}
                </div>

                {adjustingSlotId && (
                  <form onSubmit={handleAdjustSlot} className="obsidian-inset rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-[#F5F7F1]">Modification du créneau</div>
                    <div className="flex flex-wrap gap-4 items-center">
                      <label className="flex items-center gap-2 text-xs font-medium text-[#F5F7F1]">
                        <input
                          type="checkbox"
                          checked={adjustIsRest}
                          onChange={(e) => setAdjustIsRest(e.target.checked)}
                          className="h-4 w-4 accent-[#C8F62D]"
                        />
                        <span>Passer en jour de repos</span>
                      </label>

                      {!adjustIsRest && (
                        <select
                          value={adjustSessionId}
                          onChange={(e) => setAdjustSessionId(e.target.value)}
                          className="flex-1 rounded-xl border border-white/15 bg-[#121610] px-3 py-2 text-xs text-[#F5F7F1] min-h-[40px]"
                        >
                          {selectedAthlete.library.map((lib) => (
                            <option key={lib.id} value={lib.id}>
                              {lib.titre} ({LEVEL_LABELS[lib.niveau]}, {lib.duree_min} min)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      value={adjustMotif}
                      onChange={(e) => setAdjustMotif(e.target.value)}
                      placeholder="Motif visible par l'athlète (ex: Allègement suite à douleur cheville)"
                      className="w-full rounded-xl border border-white/15 bg-[#121610] px-3 py-2 text-xs text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[40px]"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustingSlotId(null)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-[#B4BCA9] hover:text-[#F5F7F1]"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-full bg-[#C8F62D] px-4 py-1.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59]"
                      >
                        Enregistrer la modification
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Evaluations & Coach Comments */}
              <div className="obsidian-card rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-semibold text-[#F5F7F1]">Évaluations et commentaires</h2>
                {selectedAthlete.evaluations.length === 0 ? (
                  <p className="text-xs text-[#8E9784]">L’athlète n’a pas encore complété son évaluation initiale.</p>
                ) : (
                  <div className="space-y-4">
                    {selectedAthlete.evaluations.map((ev) => (
                      <div key={ev.id} className="obsidian-inset rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-[#F5F7F1]">
                            {ev.type} · {ev.date}
                          </span>
                          <span className="font-mono font-bold tabular-nums text-[#C8F62D]">{ev.score_global}/100</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {ev.results.map((r) => (
                            <div key={r.test_code} className="rounded-lg border border-white/[0.06] bg-[#121610] p-2.5">
                              <div className="font-medium text-[#F5F7F1]">{r.test_nom}</div>
                              <div className="font-mono text-[#B4BCA9] mt-0.5">
                                {r.valeur} {r.unite} · {r.niveau_obtenu}
                              </div>
                            </div>
                          ))}
                        </div>

                        {ev.comments.map((c) => (
                          <div key={c.id} className="rounded-lg border border-[#C8F62D]/20 bg-[#C8F62D]/[0.06] p-2.5 text-xs text-[#B4BCA9]">
                            <span className="font-semibold text-[#C8F62D]">{c.coach_nom} : </span>
                            {c.texte}
                          </div>
                        ))}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={commentByEval[ev.id] || ''}
                            onChange={(e) =>
                              setCommentByEval((prev) => ({ ...prev, [ev.id]: e.target.value }))
                            }
                            placeholder="Ajouter un commentaire de suivi..."
                            className="flex-1 rounded-xl border border-white/15 bg-[#121610] px-3 py-2 text-xs text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[40px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(ev.id)}
                            className="rounded-full bg-[#C8F62D] px-4 py-2 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[40px]"
                          >
                            Commenter
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shared Coach Videos for this Athlete */}
              <div className="obsidian-card rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F5F7F1]">
                      Vidéos de séances accessibles à {selectedAthlete.user.prenom}
                    </h2>
                    <p className="text-xs text-[#8E9784]">
                      Inclut vos vidéos globales et celles ciblées uniquement sur cet athlète.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVideoAthleteId(String(selectedAthlete.user.id));
                      setVideoSport(selectedAthlete.profile.sport_code);
                      setSelectedAthlete(null);
                      setTab('videos');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F62D] px-4 py-2 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[38px]"
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ajouter une vidéo pour {selectedAthlete.user.prenom}</span>
                  </button>
                </div>

                {(selectedAthlete.coachVideos || []).length === 0 ? (
                  <p className="text-xs text-[#8E9784]">
                    Aucune vidéo de séance publiée pour cet athlète pour le moment.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(selectedAthlete.coachVideos || []).map((vid) => (
                      <div key={vid.id} className="obsidian-inset rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-[#8E9784] font-mono">
                              {vid.athlete_user_id ? 'Ciblée sur cet athlète' : 'Tous vos athlètes'} · {formatVideoSizeMb(vid.file_size_bytes)}
                            </div>
                            <div className="text-sm font-semibold text-[#F5F7F1] truncate">{vid.titre}</div>
                            {vid.session_titre && (
                              <div className="text-xs text-[#B4BCA9] truncate">Séance : {vid.session_titre}</div>
                            )}
                          </div>
                        </div>
                        <CoachVideoPlayer video={vid} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- ATHLETES LIST ---------------- */}
          {tab === 'athletes' && !selectedAthlete && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F5F7F1]">Mes athlètes affectés</h1>
                  <p className="text-sm text-[#B4BCA9]">
                    Cliquez sur un athlète pour consulter sa fiche (consultation tracée au journal d’accès).
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="h-4 w-4 text-[#8E9784] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un athlète..."
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] pl-9 pr-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[42px]"
                  />
                </div>
              </div>

              <div className="obsidian-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/[0.08] bg-[#181D15] text-xs text-[#8E9784]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Athlète</th>
                      <th className="px-4 py-3 font-medium">Sport & Niveau</th>
                      <th className="px-4 py-3 font-medium text-right">Séances semaine</th>
                      <th className="px-4 py-3 font-medium text-right">Dernière éval.</th>
                      <th className="px-4 py-3 font-medium">Alertes</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredAthletes.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.03]">
                        <td className="px-4 py-3.5 font-medium text-[#F5F7F1]">
                          {a.prenom} {a.nom}
                          {a.is_minor && (
                            <span className="ml-2 text-xs text-amber-300">(Mineur)</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#B4BCA9]">
                          {SPORTS_CONFIG[a.sport_code].nom} · {LEVEL_LABELS[a.niveau]}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs text-[#F5F7F1]">
                          {a.weeklyCompleted}/{a.weeklyTarget}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs text-[#C8F62D]">
                          {a.lastEvaluationScore !== null ? `${a.lastEvaluationScore}/100` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {a.hasPainAlert ? (
                            <span className="font-semibold text-red-400">Douleur active</span>
                          ) : a.openAlertsCount > 0 ? (
                            <span className="text-amber-300 font-medium">{a.openAlertsCount} ouverte(s)</span>
                          ) : (
                            <span className="text-[#8E9784]">Aucune</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openAthleteDossier(a.id)}
                            className="rounded-full bg-[#C8F62D] px-3.5 py-1.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[36px] whitespace-nowrap"
                          >
                            Ouvrir fiche
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAthletes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#8E9784]">
                          Aucun athlète affecté correspondant à votre recherche.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------- COACH SESSION VIDEOS TAB ---------------- */}
          {tab === 'videos' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F5F7F1]">
                    Vidéos de séances pour vos étudiants
                  </h1>
                  <p className="mt-1 text-sm text-[#B4BCA9]">
                    Publiez des démonstrations courtes ou des consignes filmées pour tous vos athlètes ou pour un élève précis.
                  </p>
                </div>
              </div>

              {/* Supabase Free Tier Quota Banner */}
              <div className="obsidian-card rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[#F5F7F1]">
                      Quota stockage vidéo coach ({videoQuota.storageMode === 'supabase' ? 'Supabase Storage gratuit' : 'Stockage local'})
                    </div>
                    <p className="text-xs text-[#8E9784]">
                      Limite : 15 Mo par fichier (MP4, WebM, MOV) et 100 Mo par coach. Les liens YouTube / Vimeo consomment 0 Mo.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-bold tabular-nums text-[#C8F62D]">
                    {(videoQuota.usedBytes / (1024 * 1024)).toFixed(1)} / {Math.round(videoQuota.maxBytes / (1024 * 1024))} Mo
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      videoQuota.usedBytes / videoQuota.maxBytes > 0.85 ? 'bg-amber-400' : 'bg-[#C8F62D]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((videoQuota.usedBytes / Math.max(1, videoQuota.maxBytes)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Publish Video Form */}
              <form onSubmit={handlePublishCoachVideo} className="obsidian-card rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[#F5F7F1]">Ajouter une vidéo de séance</h2>
                  <div className="inline-flex items-center gap-1 rounded-xl bg-[#181D15] border border-white/[0.08] p-1">
                    <button
                      type="button"
                      onClick={() => setVideoMode('file')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                        videoMode === 'file' ? 'bg-[#C8F62D] text-[#080A07] font-bold' : 'text-[#B4BCA9]'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Fichier (max 15 Mo)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoMode('url')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                        videoMode === 'url' ? 'bg-[#C8F62D] text-[#080A07] font-bold' : 'text-[#B4BCA9]'
                      }`}
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Lien externe (0 Mo)</span>
                    </button>
                  </div>
                </div>

                {overview?.coachProfile?.verification_status !== 'VERIFIE' && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 p-3 text-xs text-amber-200">
                    Votre compte coach doit être vérifié par l’administrateur avant de pouvoir publier des vidéos.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Titre de la vidéo *</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={140}
                      value={videoTitre}
                      onChange={(e) => setVideoTitre(e.target.value)}
                      placeholder="Ex: Placement des genoux sur fentes avant"
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Sport</label>
                    <select
                      value={videoSport}
                      onChange={(e) => {
                        setVideoSport(e.target.value as SportCode);
                        setVideoSessionId('');
                      }}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    >
                      <option value="football">Football</option>
                      <option value="basket">Basket</option>
                      <option value="handball">Handball</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="athletisme">Athlétisme</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Destinataire</label>
                    <select
                      value={videoAthleteId}
                      onChange={(e) => setVideoAthleteId(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    >
                      <option value="">Tous mes étudiants affectés</option>
                      {(overview?.athletes || []).map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.prenom} {a.nom} ({SPORTS_CONFIG[a.sport_code].nom})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Séance associée (optionnel)</label>
                    <select
                      value={videoSessionId}
                      onChange={(e) => setVideoSessionId(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    >
                      <option value="">Vidéo générale de coaching</option>
                      {(overview?.library || [])
                        .filter((s) => s.sport_code === videoSport && s.validation_status === 'VALIDEE')
                        .map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.titre} ({LEVEL_LABELS[s.niveau]})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {videoMode === 'file' ? (
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                      Fichier vidéo (MP4, WebM ou MOV · 15 Mo maximum) *
                    </label>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-[#B4BCA9] file:mr-3 file:rounded-full file:border-0 file:bg-[#C8F62D] file:px-4 file:py-2 file:text-xs file:font-bold file:text-[#080A07] hover:file:bg-[#D7FA59]"
                    />
                    {videoFile && (
                      <div className="mt-1.5 text-xs font-mono text-[#C8F62D]">
                        Sélectionné : {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} Mo)
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                      Lien vidéo HTTPS (YouTube, Vimeo ou lien MP4 direct) *
                    </label>
                    <input
                      type="url"
                      required
                      value={videoExternalUrl}
                      onChange={(e) => setVideoExternalUrl(e.target.value)}
                      placeholder="https://youtu.be/... ou https://vimeo.com/..."
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[44px]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Consignes ou repères pour l’athlète</label>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={videoDesc}
                    onChange={(e) => setVideoDesc(e.target.value)}
                    placeholder="Ex: Maintenir le dos neutre, 3 séries de 10 répétitions avec 45s de repos."
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={videoUploading || overview?.coachProfile?.verification_status !== 'VERIFIE'}
                  className="inline-flex items-center gap-2 rounded-full bg-[#C8F62D] px-6 py-2.5 text-sm font-bold text-[#080A07] hover:bg-[#D7FA59] disabled:opacity-50 min-h-[44px]"
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  <span>{videoUploading ? 'Publication en cours...' : 'Publier la vidéo'}</span>
                </button>
              </form>

              {/* Published Videos Library */}
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-[#F5F7F1]">
                  Vos vidéos publiées ({coachVideos.length})
                </h2>

                {coachVideos.length === 0 ? (
                  <div className="obsidian-card rounded-2xl p-6 text-center text-xs text-[#8E9784]">
                    Vous n’avez pas encore publié de vidéo pour vos étudiants. Ajoutez un clip court (≤ 15 Mo) ou un lien YouTube/Vimeo ci-dessus.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {coachVideos.map((vid) => (
                      <div key={vid.id} className="obsidian-card rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-[11px] font-mono text-[#8E9784]">
                              {SPORTS_CONFIG[vid.sport_code].nom} ·{' '}
                              {vid.athlete_nom ? `Pour ${vid.athlete_nom}` : 'Tous mes athlètes'} ·{' '}
                              {formatVideoSizeMb(vid.file_size_bytes)}
                            </div>
                            <h3 className="text-sm font-semibold text-[#F5F7F1] truncate">{vid.titre}</h3>
                            {vid.session_titre && (
                              <div className="text-xs text-[#B4BCA9] truncate">Séance : {vid.session_titre}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCoachVideo(vid.id)}
                            aria-label={`Supprimer ${vid.titre}`}
                            className="rounded-lg border border-red-400/35 bg-red-950/50 p-2 text-red-200 hover:bg-red-950/70 min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        <CoachVideoPlayer video={vid} />

                        {vid.description && (
                          <p className="text-xs text-[#B4BCA9] leading-relaxed">{vid.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- ALERTS QUEUE ---------------- */}
          {tab === 'alertes' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#F5F7F1]">Traitement des alertes</h1>
                <p className="text-sm text-[#B4BCA9]">
                  En cas de douleur signalée, adaptez ou mettez en pause le programme et orientez vers un professionnel de santé.
                </p>
              </div>

              <div className="space-y-4">
                {overview?.alerts.map((al) => (
                  <div key={al.id} className="obsidian-card rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {al.type === 'DOULEUR' ? (
                          <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
                        ) : (
                          <ClipboardList className="h-4 w-4 text-[#C8F62D]" aria-hidden="true" />
                        )}
                        <span className="text-sm font-semibold text-[#F5F7F1]">
                          {al.athlete_nom} · {al.type}
                          {al.zone_douleur ? ` (${al.zone_douleur}, ${al.intensite}/10)` : ''}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[#8E9784]">
                        {al.traitee ? 'Traitée' : 'À traiter'} · {al.date.slice(0, 10)}
                      </span>
                    </div>

                    <p className="text-sm text-[#B4BCA9]">{al.message}</p>

                    {al.traitee ? (
                      <div className="flex items-center gap-2 text-xs text-[#C8F62D] font-medium">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Note : {al.note_traitement}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          value={resolveNoteByAlert[al.id] || ''}
                          onChange={(e) =>
                            setResolveNoteByAlert((prev) => ({ ...prev, [al.id]: e.target.value }))
                          }
                          placeholder="Action prise (ex: Passage en repos + orientation médecin du sport)"
                          className="flex-1 rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-xs text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[40px]"
                        />
                        <button
                          type="button"
                          onClick={() => openAthleteDossier(al.athlete_user_id).then(() => setTab('athletes'))}
                          className="rounded-xl border border-white/15 bg-[#181D15] px-3.5 py-2 text-xs font-medium text-[#F5F7F1] hover:bg-white/[0.08] min-h-[40px]"
                        >
                          Voir fiche
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveAlert(al.id)}
                          className="rounded-full bg-[#C8F62D] px-4 py-2 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[40px]"
                        >
                          Marquer traitée
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------- PROPOSE SESSION ---------------- */}
          {tab === 'proposer' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#F5F7F1]">Proposer une séance</h1>
                <p className="text-sm text-[#B4BCA9]">
                  Toute nouvelle séance est envoyée en relecture à l’administrateur avant d’être visible aux athlètes.
                </p>
              </div>

              <form onSubmit={handleProposeSession} className="obsidian-card rounded-2xl p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Sport</label>
                    <select
                      value={propSport}
                      onChange={(e) => setPropSport(e.target.value as SportCode)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    >
                      <option value="football">Football</option>
                      <option value="basket">Basket</option>
                      <option value="handball">Handball</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="athletisme">Athlétisme</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Niveau</label>
                    <select
                      value={propNiveau}
                      onChange={(e) => setPropNiveau(e.target.value as AthleteLevel)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    >
                      <option value="debutant">Débutant</option>
                      <option value="intermediaire">Intermédiaire</option>
                      <option value="avance">Avancé</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Durée (min)</label>
                    <input
                      type="number"
                      min={10}
                      max={60}
                      value={propDuree}
                      onChange={(e) => setPropDuree(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 font-mono text-sm text-[#F5F7F1] min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Titre de la séance *</label>
                  <input
                    type="text"
                    required
                    value={propTitre}
                    onChange={(e) => setPropTitre(e.target.value)}
                    placeholder="Ex: Renforcement chevilles et appuis courts"
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Objectif principal *</label>
                    <input
                      type="text"
                      required
                      value={propObjectif}
                      onChange={(e) => setPropObjectif(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Prévention ciblée</label>
                    <input
                      type="text"
                      value={propPrevention}
                      onChange={(e) => setPropPrevention(e.target.value)}
                      placeholder="Chevilles, genoux..."
                      className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1] placeholder:text-[#8E9784] min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Consigne principale (Français) *</label>
                  <textarea
                    rows={2}
                    required
                    value={propConsigneFr}
                    onChange={(e) => setPropConsigneFr(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">Consigne adaptée (Wolof)</label>
                  <textarea
                    rows={2}
                    value={propConsigneWo}
                    onChange={(e) => setPropConsigneWo(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] px-3 py-2 text-sm text-[#F5F7F1]"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-full bg-[#C8F62D] px-6 py-2.5 text-sm font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[44px]"
                >
                  Soumettre pour relecture
                </button>
              </form>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Floating Dark Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile coach"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-white/12 bg-[#121610]/95 backdrop-blur-md p-1.5 shadow-2xl"
      >
        <div className="grid grid-cols-4 gap-1">
          {coachNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSelectedAthlete(null);
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 px-1 text-[11px] transition-colors ${
                  active
                    ? 'bg-[#C8F62D] text-[#080A07] font-bold'
                    : 'text-[#8E9784] hover:text-[#F5F7F1] font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 font-mono text-[9px] font-bold tabular-nums rounded bg-red-600 text-white px-1 leading-tight">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
