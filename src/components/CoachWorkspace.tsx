import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
import { ALL_SPORT_CODES, LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';
import { compressVideoFile } from '../lib/videoCompression';
import { CoachVideoPlayer, formatVideoSizeMb } from './CoachVideoPlayer';
import { LegalFooter } from './LegalFooter';
import type {
  AlertRecord,
  AthleteWorkspacePayload,
  AuthUser,
  CoachAthleteSummary,
  CoachMessage,
  CoachVideoItem,
  SessionTemplate,
  SportCode,
} from '../types';

type CoachTab = 'athletes' | 'videos';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Athlete dossier interactive states
  const [objectiveInput, setObjectiveInput] = useState('');
  const [commentByEval, setCommentByEval] = useState<Record<number, string>>({});
  const [adjustingSlotId, setAdjustingSlotId] = useState<number | null>(null);
  const [adjustSessionId, setAdjustSessionId] = useState<string>('');
  const [adjustIsRest, setAdjustIsRest] = useState(false);
  const [adjustMotif, setAdjustMotif] = useState('');

  // Direct Athlete ↔ Coach messaging
  const [athleteMessages, setAthleteMessages] = useState<CoachMessage[]>([]);
  const [chatBody, setChatBody] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

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
  const [videoCompressionMsg, setVideoCompressionMsg] = useState<string | null>(null);

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

  const loadAthleteMessages = useCallback(async (athleteId: number, markRead = false) => {
    try {
      const res = await apiRequest<{ messages: CoachMessage[] }>(`/api/coach/athletes/${athleteId}/messages`);
      setAthleteMessages(res.messages || []);
      if (markRead) {
        await apiRequest(`/api/coach/athletes/${athleteId}/messages/read`, { method: 'POST' }).catch(() => undefined);
        setOverview((prev) =>
          prev
            ? {
                ...prev,
                athletes: prev.athletes.map((a) => (a.id === athleteId ? { ...a, unreadMessagesCount: 0 } : a)),
              }
            : prev
        );
      }
    } catch {
      // Non-fatal
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAthlete) return;
    const athleteId = selectedAthlete.user.id;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadAthleteMessages(athleteId, true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [selectedAthlete, loadAthleteMessages]);

  const openAthleteDossier = async (athleteId: number) => {
    try {
      setChatLoading(true);
      const dossier = await apiRequest<AthleteWorkspacePayload>(`/api/coach/athletes/${athleteId}`);
      setSelectedAthlete(dossier);
      setObjectiveInput(dossier.program?.objectif || dossier.profile.objectif || '');
      setAdjustingSlotId(null);
      await loadAthleteMessages(athleteId, true);
    } catch (err) {
      setChatLoading(false);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthlete || !chatBody.trim() || chatSending) return;
    setChatSending(true);
    try {
      const res = await apiRequest<{ message: CoachMessage | null }>(
        `/api/coach/athletes/${selectedAthlete.user.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ body: chatBody.trim() }),
        }
      );
      if (res.message) {
        setAthleteMessages((prev) => [...prev, res.message!]);
      } else {
        await loadAthleteMessages(selectedAthlete.user.id, true);
      }
      setChatBody('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Impossible d'envoyer le message.");
    } finally {
      setChatSending(false);
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
        let fileToUpload = videoFile;
        let mimeType = resolveVideoMimeType(fileToUpload);
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) {
          setNotice('Format non supporté. Utilisez MP4, WebM ou MOV.');
          setVideoUploading(false);
          return;
        }

        if (fileToUpload.size > 4 * 1024 * 1024) {
          setVideoCompressionMsg('Compression automatique en cours pour accélérer le chargement...');
          const compressed = await compressVideoFile(fileToUpload, {
            onProgress: (pct) => {
              setVideoCompressionMsg(`Compression vidéo optimisée : ${pct}%`);
            },
          });
          fileToUpload = compressed.file;
          mimeType = resolveVideoMimeType(fileToUpload) || 'video/webm';
          if (compressed.compressed) {
            setVideoCompressionMsg(
              `Vidéo allégée : ${(compressed.originalBytes / (1024 * 1024)).toFixed(1)} Mo → ${(compressed.finalBytes / (1024 * 1024)).toFixed(1)} Mo`
            );
          } else {
            setVideoCompressionMsg(null);
          }
        }

        if (fileToUpload.size > videoQuota.maxFileBytes) {
          setNotice(
            `Vidéo trop lourde (${(fileToUpload.size / (1024 * 1024)).toFixed(1)} Mo). Limite Supabase gratuit : ${Math.round(videoQuota.maxFileBytes / (1024 * 1024))} Mo max, ou utilisez un lien HTTPS.`
          );
          setVideoCompressionMsg(null);
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
            file_size_bytes: fileToUpload.size,
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
            body: fileToUpload,
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
            body: fileToUpload,
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
            file_size_bytes: fileToUpload.size,
          }),
        });
        setNotice('Vidéo de séance compressée, téléversée et partagée avec vos étudiants.');
      }

      setVideoTitre('');
      setVideoDesc('');
      setVideoExternalUrl('');
      setVideoFile(null);
      setVideoCompressionMsg(null);
      await loadVideos();
      if (selectedAthlete) {
        await openAthleteDossier(selectedAthlete.user.id);
      }
    } catch (err) {
      setVideoCompressionMsg(null);
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
      <div className="min-h-screen obsidian-ambient flex items-center justify-center text-sm text-[#3D5246]">
        Chargement de l'espace Coach...
      </div>
    );
  }

  const totalUnreadMessages = overview
    ? overview.athletes.reduce((acc, a) => acc + (a.unreadMessagesCount || 0), 0)
    : 0;

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
      badge: totalUnreadMessages,
    },
    {
      id: 'videos',
      label: `Vidéos séances (${coachVideos.length})`,
      mobileLabel: 'Vidéos',
      icon: Video,
    },
  ];

  return (
    <div className="min-h-screen obsidian-ambient text-[#063725] flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-[#D5E2DA] bg-white">
        <div className="p-5 border-b border-[#E2EBE5]">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-9 w-auto object-contain"
          />
          <div className="mt-2.5 text-xs font-medium text-[#5B7064]">Espace Coach · Suivi affecté</div>
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
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#3D5246] hover:bg-[#ECF7F1] hover:text-[#063725]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 rounded-md px-1.5 py-0.5 ${
                      active ? 'bg-white text-[#0D6E46]' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2EBE5] space-y-3">
          <p className="text-xs text-[#5B7064] leading-relaxed">
            Accès strict aux athlètes affectés. Chaque consultation est journalisée. Le coach ne pose pas de diagnostic médical.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Top Header with Hamburger Menu */}
        <header className="md:hidden border-b border-[#D5E2DA] bg-white/95 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 h-[52px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={mobileMenuOpen}
                className="p-2 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3] min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
              <img
                src="/brand/terrain-logo.png"
                alt="Terrain+"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-7 w-auto object-contain shrink-0"
              />
              <span className="text-xs font-semibold text-[#5B7064] truncate">
                · Espace Coach
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-[#3D5246] hover:text-[#063725] min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.nav
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                aria-label="Menu coach mobile"
                className="border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-1.5"
              >
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
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold min-h-[40px] ${
                        active ? 'bg-[#0D6E46] text-white' : 'bg-[#F6F8F5] text-[#063725]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && item.badge > 0 ? (
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-xs font-semibold text-[#3D5246] min-h-[40px]"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Déconnexion</span>
                </button>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-5xl space-y-6">
          {overview?.coachProfile?.verification_status === 'EN_ATTENTE' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
              <strong>Dossier en attente de validation :</strong> un administrateur Terrain+ doit vérifier votre qualification et votre zone avant que votre profil apparaisse dans la liste publique des athlètes.
            </div>
          )}

          {overview?.coachProfile?.verification_status === 'REFUSE' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 leading-relaxed">
              <strong>Profil coach suspendu :</strong> votre dossier n’est actuellement pas validé pour le suivi des athlètes. Contactez l’administration Terrain+.
            </div>
          )}

          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="obsidian-card rounded-xl px-4 py-3 text-sm text-[#063725] flex items-center justify-between gap-3"
              >
                <span>{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="text-xs font-semibold text-[#0D6E46] hover:text-[#095637] shrink-0"
                >
                  Fermer
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
          <motion.div
            key={selectedAthlete ? `dossier-${selectedAthlete.user.id}` : tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >

          {/* ---------------- ATHLETE DOSSIER VIEW ---------------- */}
          {tab === 'athletes' && selectedAthlete && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setSelectedAthlete(null)}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#3D5246] hover:text-[#063725] min-h-[40px]"
              >
                <ArrowLeft className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                <span>Retour à la liste des athlètes</span>
              </button>

              <div className="obsidian-card-glow rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[#0D6E46] font-semibold">
                    {SPORTS_CONFIG[selectedAthlete.profile.sport_code].nom} ·{' '}
                    {LEVEL_LABELS[selectedAthlete.profile.niveau]} ·{' '}
                    {selectedAthlete.profile.poste || 'Tout poste'}
                    {selectedAthlete.user.is_minor ? ' · Compte mineur privé' : ''}
                  </div>
                  <h1 className="mt-1 font-display text-2xl font-bold text-[#063725]">
                    {selectedAthlete.user.prenom} {selectedAthlete.user.nom}
                  </h1>
                </div>
                <div className="flex items-center gap-6 font-mono tabular-nums text-sm">
                  <div className="obsidian-inset rounded-xl px-3.5 py-2">
                    <div className="text-[11px] text-[#5B7064]">Semaine</div>
                    <div className="font-bold text-[#0D6E46]">
                      {selectedAthlete.stats.weeklyCompleted}/{selectedAthlete.stats.weeklyTarget}
                    </div>
                  </div>
                  <div className="obsidian-inset rounded-xl px-3.5 py-2">
                    <div className="text-[11px] text-[#5B7064]">RPE moyen</div>
                    <div className="font-bold text-[#063725]">{selectedAthlete.stats.avgRpe ?? '—'}/10</div>
                  </div>
                </div>
              </div>

              {/* Direct Messaging Thread with Athlete */}
              <div className="obsidian-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                    <h2 className="text-base font-semibold text-[#063725]">
                      Discussion directe avec {selectedAthlete.user.prenom}
                    </h2>
                  </div>
                  <span className="text-[11px] text-[#5B7064]">
                    Échanges privés · Actualisation automatique
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2.5 rounded-xl border border-[#E2EBE5] bg-[#F7FAF8] p-3.5">
                  {chatLoading && athleteMessages.length === 0 ? (
                    <div className="text-xs text-[#5B7064] py-4 text-center">Chargement des échanges...</div>
                  ) : athleteMessages.length === 0 ? (
                    <div className="text-xs text-[#5B7064] py-4 text-center">
                      Aucun message pour le moment. Envoyez un message d’encouragement ou une précision technique à {selectedAthlete.user.prenom}.
                    </div>
                  ) : (
                    athleteMessages.map((msg) => {
                      const fromCoach = msg.sender_role === 'COACH';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${fromCoach ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                              fromCoach
                                ? 'bg-[#0D6E46] text-white'
                                : 'bg-white border border-[#D5E2DA] text-[#063725]'
                            }`}
                          >
                            <div className={`text-[10px] mb-0.5 font-semibold ${fromCoach ? 'text-white/80' : 'text-[#0D6E46]'}`}>
                              {fromCoach ? 'Vous' : msg.sender_nom || selectedAthlete.user.prenom}
                            </div>
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                          </div>
                          <span className="mt-0.5 px-1 text-[10px] font-mono text-[#5B7064]">
                            {msg.created_at.slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={1000}
                    value={chatBody}
                    onChange={(e) => setChatBody(e.target.value)}
                    placeholder={`Écrire un message à ${selectedAthlete.user.prenom}...`}
                    className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3.5 py-2 text-sm text-[#063725] placeholder:text-[#5B7064] min-h-[42px]"
                  />
                  <button
                    type="submit"
                    disabled={chatSending || !chatBody.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[42px] shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{chatSending ? 'Envoi...' : 'Envoyer'}</span>
                  </button>
                </form>
              </div>

              {/* Objectives + Weight Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form onSubmit={handleUpdateObjective} className="lg:col-span-5 obsidian-card rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-semibold text-[#063725]">Objectifs fixés avec l’athlète</h2>
                  <textarea
                    rows={3}
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064]"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#0D6E46] px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px] shadow-sm"
                  >
                    Mettre à jour les objectifs
                  </button>
                </form>

                <div className="lg:col-span-7 obsidian-card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-[#063725]">Tendance du poids</h2>
                  <div className="mt-3 h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedAthlete.weights} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2EBE5" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#5B7064' }}
                          axisLine={{ stroke: '#D5E2DA' }}
                          tickLine={{ stroke: '#D5E2DA' }}
                        />
                        <YAxis
                          domain={['dataMin - 2', 'dataMax + 2']}
                          tick={{ fontSize: 11, fill: '#5B7064' }}
                          axisLine={{ stroke: '#D5E2DA' }}
                          tickLine={{ stroke: '#D5E2DA' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#D5E2DA',
                            borderRadius: 12,
                            color: '#063725',
                          }}
                          itemStyle={{ color: '#063725' }}
                          labelStyle={{ color: '#0D6E46', fontWeight: 600 }}
                        />
                        <Line type="monotone" dataKey="poids_kg" name="Poids (kg)" stroke="#0D6E46" strokeWidth={2.5} dot={{ r: 3.5, fill: '#0D6E46' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Adjust Weekly Program */}
              <div className="obsidian-card rounded-2xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-[#063725]">Ajuster le programme hebdomadaire</h2>
                  <p className="text-xs text-[#5B7064]">
                    Toute modification est visible par l’athlète avec la date et le motif.
                  </p>
                </div>

                <div className="divide-y divide-[#E2EBE5]">
                  {selectedAthlete.schedule.map((slot) => (
                    <div key={slot.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-[#5B7064]">
                          {DAY_NAMES[slot.jour_semaine - 1]} · <span className="font-mono">{slot.date_prevue}</span>
                          {slot.ajustee_par_coach && <span className="text-[#0D6E46] font-semibold"> · Ajustée</span>}
                        </div>
                        <div className="text-sm font-semibold text-[#063725]">
                          {slot.is_rest_day || !slot.session ? 'Journée sans séance' : slot.session.titre}
                        </div>
                        {slot.motif_ajustement && (
                          <div className="text-xs text-[#3D5246]">Motif : {slot.motif_ajustement}</div>
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
                        className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[38px] self-start sm:self-center"
                      >
                        Modifier ce jour
                      </button>
                    </div>
                  ))}
                </div>

                {adjustingSlotId && (
                  <form onSubmit={handleAdjustSlot} className="obsidian-inset rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-[#063725]">Modification du créneau</div>
                    <div className="flex flex-wrap gap-4 items-center">
                      <label className="flex items-center gap-2 text-xs font-medium text-[#063725]">
                        <input
                          type="checkbox"
                          checked={adjustIsRest}
                          onChange={(e) => setAdjustIsRest(e.target.checked)}
                          className="h-4 w-4 accent-[#0D6E46]"
                        />
                        <span>Passer en journée sans séance</span>
                      </label>

                      {!adjustIsRest && (
                        <select
                          value={adjustSessionId}
                          onChange={(e) => setAdjustSessionId(e.target.value)}
                          className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
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
                      placeholder="Motif visible par l'athlète (ex: Adaptation de la charge hebdomadaire)"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustingSlotId(null)}
                        className="rounded-lg border border-[#C3D6CA] bg-white px-3 py-1.5 text-xs font-medium text-[#3D5246] hover:text-[#063725]"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-full bg-[#0D6E46] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#095637]"
                      >
                        Enregistrer la modification
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Evaluations & Coach Comments */}
              <div className="obsidian-card rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-semibold text-[#063725]">Évaluations et commentaires</h2>
                {selectedAthlete.evaluations.length === 0 ? (
                  <p className="text-xs text-[#5B7064]">L’athlète n’a pas encore complété son évaluation initiale.</p>
                ) : (
                  <div className="space-y-4">
                    {selectedAthlete.evaluations.map((ev) => (
                      <div key={ev.id} className="obsidian-inset rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-[#063725]">
                            {ev.type} · {ev.date}
                          </span>
                          <span className="font-mono font-bold tabular-nums text-[#0D6E46]">{ev.score_global}/100</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {ev.results.map((r) => (
                            <div key={r.test_code} className="rounded-lg border border-[#D5E2DA] bg-white p-2.5">
                              <div className="font-medium text-[#063725]">{r.test_nom}</div>
                              <div className="font-mono text-[#3D5246] mt-0.5">
                                {r.valeur} {r.unite} · {r.niveau_obtenu}
                              </div>
                            </div>
                          ))}
                        </div>

                        {ev.comments.map((c) => (
                          <div key={c.id} className="rounded-lg border border-[#BFE0CD] bg-[#ECF7F1] p-2.5 text-xs text-[#3D5246]">
                            <span className="font-semibold text-[#0D6E46]">{c.coach_nom} : </span>
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
                            className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(ev.id)}
                            className="rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
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
                    <h2 className="text-base font-semibold text-[#063725]">
                      Vidéos de séances accessibles à {selectedAthlete.user.prenom}
                    </h2>
                    <p className="text-xs text-[#5B7064]">
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[38px]"
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ajouter une vidéo pour {selectedAthlete.user.prenom}</span>
                  </button>
                </div>

                {(selectedAthlete.coachVideos || []).length === 0 ? (
                  <p className="text-xs text-[#5B7064]">
                    Aucune vidéo de séance publiée pour cet athlète pour le moment.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(selectedAthlete.coachVideos || []).map((vid) => (
                      <div key={vid.id} className="obsidian-inset rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-[#5B7064] font-mono">
                              {vid.athlete_user_id ? 'Ciblée sur cet athlète' : 'Tous vos athlètes'} · {formatVideoSizeMb(vid.file_size_bytes)}
                            </div>
                            <div className="text-sm font-semibold text-[#063725] truncate">{vid.titre}</div>
                            {vid.session_titre && (
                              <div className="text-xs text-[#3D5246] truncate">Séance : {vid.session_titre}</div>
                            )}
                          </div>
                        </div>
                        <CoachVideoPlayer video={vid} theme="light" />
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
              {overview?.coachProfile && (
                <div className="obsidian-card rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-semibold text-[#063725]">
                      Modèle Coach Terrain+
                    </span>
                    <span className="font-mono text-[#0D6E46] font-bold">
                      0 FCFA fixe / mois
                    </span>
                    <span className="text-[#3D5246]">
                      Revenu par athlète suivi :{' '}
                      <strong className="text-[#063725]">4 000 F</strong> (80 %) · 20 % commission plateforme
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">Mes athlètes affectés</h1>
                  <p className="text-sm text-[#3D5246]">
                    Cliquez sur un athlète pour consulter sa fiche et échanger en direct (consultation tracée au journal d’accès).
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="h-4 w-4 text-[#5B7064] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un athlète..."
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white pl-9 pr-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064] min-h-[42px]"
                  />
                </div>
              </div>

              <div className="obsidian-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-xs text-[#5B7064]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Athlète</th>
                      <th className="px-4 py-3 font-medium">Sport & Niveau</th>
                      <th className="px-4 py-3 font-medium text-right">Séances semaine</th>
                      <th className="px-4 py-3 font-medium text-right">Dernière éval.</th>
                      <th className="px-4 py-3 font-medium">Alertes & Messages</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2EBE5]">
                    {filteredAthletes.map((a) => (
                      <tr key={a.id} className="hover:bg-[#F6F8F5]">
                        <td className="px-4 py-3.5 font-medium text-[#063725]">
                          {a.prenom} {a.nom}
                          {a.is_minor && (
                            <span className="ml-2 text-xs text-amber-700">(Mineur)</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#3D5246]">
                          {SPORTS_CONFIG[a.sport_code].nom} · {LEVEL_LABELS[a.niveau]}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs text-[#063725]">
                          {a.weeklyCompleted}/{a.weeklyTarget}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs font-semibold text-[#0D6E46]">
                          {a.lastEvaluationScore !== null ? `${a.lastEvaluationScore}/100` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {a.openAlertsCount > 0 ? (
                              <span className="text-amber-700 font-medium">{a.openAlertsCount} ouverte(s)</span>
                            ) : (
                              <span className="text-[#5B7064]">Suivi normal</span>
                            )}
                            {a.unreadMessagesCount && a.unreadMessagesCount > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-[#BFE0CD] bg-[#ECF7F1] px-2 py-0.5 font-mono text-[11px] font-bold text-[#0D6E46]">
                                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                                {a.unreadMessagesCount} non lu{a.unreadMessagesCount > 1 ? 's' : ''}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openAthleteDossier(a.id)}
                            className="rounded-full bg-[#0D6E46] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[36px] whitespace-nowrap"
                          >
                            Ouvrir fiche
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAthletes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#5B7064]">
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
                  <h1 className="font-display text-2xl font-bold text-[#063725]">
                    Vidéos de séances pour vos étudiants
                  </h1>
                  <p className="mt-1 text-sm text-[#3D5246]">
                    Publiez des démonstrations courtes ou des consignes filmées pour tous vos athlètes ou pour un élève précis.
                  </p>
                </div>
              </div>

              {/* Supabase Free Tier Quota Banner */}
              <div className="obsidian-card rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[#063725]">
                      Quota stockage vidéo coach ({videoQuota.storageMode === 'supabase' ? 'Supabase Storage gratuit' : 'Stockage local'})
                    </div>
                    <p className="text-xs text-[#5B7064]">
                      Limite : 15 Mo par fichier (MP4, WebM, MOV) et 100 Mo par coach. Les liens YouTube / Vimeo consomment 0 Mo.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-bold tabular-nums text-[#0D6E46]">
                    {(videoQuota.usedBytes / (1024 * 1024)).toFixed(1)} / {Math.round(videoQuota.maxBytes / (1024 * 1024))} Mo
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-[#E2EBE5] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(100, Math.round((videoQuota.usedBytes / Math.max(1, videoQuota.maxBytes)) * 100))}%`,
                    }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full ${
                      videoQuota.usedBytes / videoQuota.maxBytes > 0.85 ? 'bg-amber-500' : 'bg-[#0D6E46]'
                    }`}
                  />
                </div>
              </div>

              {/* Publish Video Form */}
              <form onSubmit={handlePublishCoachVideo} className="obsidian-card rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[#063725]">Ajouter une vidéo de séance</h2>
                  <div className="inline-flex items-center gap-1 rounded-xl bg-[#F1F6F3] border border-[#D5E2DA] p-1">
                    <button
                      type="button"
                      onClick={() => setVideoMode('file')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                        videoMode === 'file' ? 'bg-[#0D6E46] text-white font-bold shadow-sm' : 'text-[#3D5246] hover:text-[#063725]'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Fichier (max 15 Mo)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoMode('url')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium min-h-[34px] transition-colors ${
                        videoMode === 'url' ? 'bg-[#0D6E46] text-white font-bold shadow-sm' : 'text-[#3D5246] hover:text-[#063725]'
                      }`}
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Lien externe (0 Mo)</span>
                    </button>
                  </div>
                </div>

                {overview?.coachProfile?.verification_status !== 'VERIFIE' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Votre compte coach doit être vérifié par l’administrateur avant de pouvoir publier des vidéos.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Titre de la vidéo *</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={140}
                      value={videoTitre}
                      onChange={(e) => setVideoTitre(e.target.value)}
                      placeholder="Ex: Placement des genoux sur fentes avant"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Sport</label>
                    <select
                      value={videoSport}
                      onChange={(e) => {
                        setVideoSport(e.target.value as SportCode);
                        setVideoSessionId('');
                      }}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] min-h-[44px]"
                    >
                      {ALL_SPORT_CODES.map((code) => (
                        <option key={code} value={code}>
                          {SPORTS_CONFIG[code].nom}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Destinataire</label>
                    <select
                      value={videoAthleteId}
                      onChange={(e) => setVideoAthleteId(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] min-h-[44px]"
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
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Séance associée (optionnel)</label>
                    <select
                      value={videoSessionId}
                      onChange={(e) => setVideoSessionId(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] min-h-[44px]"
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
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Fichier vidéo (MP4, WebM ou MOV · 15 Mo maximum) *
                    </label>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-[#3D5246] file:mr-3 file:rounded-full file:border-0 file:bg-[#0D6E46] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-[#095637]"
                    />
                    {videoFile && (
                      <div className="mt-1.5 text-xs font-mono text-[#0D6E46] font-semibold">
                        Sélectionné : {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} Mo)
                        {videoFile.size > 4 * 1024 * 1024 && ' · Compression auto avant envoi'}
                      </div>
                    )}
                    {videoCompressionMsg && (
                      <div className="mt-1.5 text-xs text-amber-800 font-medium">{videoCompressionMsg}</div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Lien vidéo HTTPS (YouTube, Vimeo ou lien MP4 direct) *
                    </label>
                    <input
                      type="url"
                      required
                      value={videoExternalUrl}
                      onChange={(e) => setVideoExternalUrl(e.target.value)}
                      placeholder="https://youtu.be/... ou https://vimeo.com/..."
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064] min-h-[44px]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Consignes ou repères pour l’athlète</label>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={videoDesc}
                    onChange={(e) => setVideoDesc(e.target.value)}
                    placeholder="Ex: Maintenir le dos neutre, 3 séries de 10 répétitions avec 45s de repos."
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={videoUploading || overview?.coachProfile?.verification_status !== 'VERIFIE'}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0D6E46] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px]"
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  <span>{videoUploading ? 'Publication en cours...' : 'Publier la vidéo'}</span>
                </button>
              </form>

              {/* Published Videos Library */}
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-[#063725]">
                  Vos vidéos publiées ({coachVideos.length})
                </h2>

                {coachVideos.length === 0 ? (
                  <div className="obsidian-card rounded-2xl p-6 text-center text-xs text-[#5B7064]">
                    Vous n’avez pas encore publié de vidéo pour vos étudiants. Ajoutez un clip court (≤ 15 Mo) ou un lien YouTube/Vimeo ci-dessus.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {coachVideos.map((vid) => (
                      <div key={vid.id} className="obsidian-card rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-[11px] font-mono text-[#5B7064]">
                              {SPORTS_CONFIG[vid.sport_code].nom} ·{' '}
                              {vid.athlete_nom ? `Pour ${vid.athlete_nom}` : 'Tous mes athlètes'} ·{' '}
                              {formatVideoSizeMb(vid.file_size_bytes)}
                            </div>
                            <h3 className="text-sm font-semibold text-[#063725] truncate">{vid.titre}</h3>
                            {vid.session_titre && (
                              <div className="text-xs text-[#0D6E46] font-medium truncate">Séance : {vid.session_titre}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCoachVideo(vid.id)}
                            aria-label={`Supprimer ${vid.titre}`}
                            className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        <CoachVideoPlayer video={vid} theme="light" />

                        {vid.description && (
                          <p className="text-xs text-[#3D5246] leading-relaxed">{vid.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          </motion.div>
          </AnimatePresence>

            <LegalFooter />
          </div>
        </main>
      </div>

      {/* Floating Light Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile coach"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-[#D5E2DA] bg-white/95 backdrop-blur-md p-1.5 shadow-xl"
      >
        <div className="grid grid-cols-2 gap-1">
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
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#5B7064] hover:text-[#063725] font-medium'
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
