import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookCheck,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileSearch,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
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
import { COACH_LEGAL_STATUS_OPTIONS } from '../data/sportsDiplomas';
import { LegalFooter } from './LegalFooter';

const ADMIN_OVERVIEW_CACHE_KEY = 'terrain_plus_admin_overview_v1';
import type {
  AthleteLevel,
  AthleteStatus,
  AuditLogEntry,
  CoachDocumentSummary,
  PartnerRequestRecord,
  PartnerSummary,
  SportCode,
  UserRole,
  ValidationStatus,
} from '../types';

type AdminTab = 'comptes' | 'contenus' | 'journal' | 'partenaires';

interface AdminUserRow {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: UserRole;
  statut: AthleteStatus;
  is_minor: number;
  verified: number;
  sport_code: SportCode | null;
  niveau: AthleteLevel | null;
  assigned_coach_id: number | null;
}

interface AdminCoachRow {
  id: number;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  statut?: AthleteStatus;
  verified?: number;
  specialite: string;
  qualification: string;
  zone: string;
  coach_plan?: string;
  verification_status?: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
  rejection_reason?: string | null;
  pro_card_number?: string | null;
  pro_card_expiry?: string | null;
  rc_pro_insurer?: string | null;
  rc_pro_policy_number?: string | null;
  legal_status?: string | null;
  business_reg_number?: string | null;
  honorability_attested?: number | boolean;
  document?: CoachDocumentSummary | null;
}

interface AdminSessionRow {
  id: number;
  sport_code: SportCode;
  titre: string;
  niveau: AthleteLevel;
  duree_min: number;
  objectif: string;
  prevention_focus: string;
  relue_par: string | null;
  validation_status: ValidationStatus;
  proposee_par_nom: string | null;
}

interface AdminGroupRow {
  id: number;
  nom: string;
  partner_id: number;
  partner_nom: string;
  partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
  zone: string;
  captain_name: string;
  sport_code: SportCode;
  member_count: number;
}

interface AdminOverviewResponse {
  users: AdminUserRow[];
  coaches: AdminCoachRow[];
  sessions: AdminSessionRow[];
  auditLogs: AuditLogEntry[];
  partners: PartnerSummary[];
  groups: AdminGroupRow[];
  challenges: Array<{
    id: number;
    partner_id: number;
    partner_nom: string;
    titre: string;
    indicateur: string;
    periode: string;
    target_sessions: number;
    current_sessions: number;
  }>;
  partnerRequests: PartnerRequestRecord[];
}

export const AdminWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [cachedAdmin] = useState<AdminOverviewResponse | null>(() =>
    readJsonCache<AdminOverviewResponse>(
      ADMIN_OVERVIEW_CACHE_KEY,
      (v): v is AdminOverviewResponse =>
        Boolean(v && typeof v === 'object' && Array.isArray((v as AdminOverviewResponse).users) && Array.isArray((v as AdminOverviewResponse).coaches))
    )
  );
  const [tab, setTab] = useState<AdminTab>('comptes');
  const [data, setData] = useState<AdminOverviewResponse | null>(cachedAdmin);
  const [loading, setLoading] = useState(!cachedAdmin);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reviewerBySession, setReviewerBySession] = useState<Record<number, string>>({});
  const [auditFilter, setAuditFilter] = useState('');

  // Coach document inspection modal state
  const [inspectedCoach, setInspectedCoach] = useState<AdminCoachRow | null>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState<string | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  // Partner creation forms
  const [newPartnerNom, setNewPartnerNom] = useState('');
  const [newPartnerType, setNewPartnerType] = useState<'ASC' | 'CAMPUS' | 'LIGUE'>('ASC');
  const [newPartnerZone, setNewPartnerZone] = useState('');

  const [newGroupNom, setNewGroupNom] = useState('');
  const [newGroupPartnerId, setNewGroupPartnerId] = useState(() =>
    cachedAdmin?.partners[0] ? String(cachedAdmin.partners[0].id) : ''
  );
  const [newGroupCaptain, setNewGroupCaptain] = useState('');
  const [newGroupSport, setNewGroupSport] = useState<SportCode>('football');

  const [newChallPartnerId, setNewChallPartnerId] = useState(() =>
    cachedAdmin?.partners[0] ? String(cachedAdmin.partners[0].id) : ''
  );
  const [newChallTitre, setNewChallTitre] = useState('');
  const [newChallIndicateur, setNewChallIndicateur] = useState('Séances collectives terminées');
  const [newChallPeriode, setNewChallPeriode] = useState('Décembre 2026');
  const [newChallTarget, setNewChallTarget] = useState('100');

  const loadAdmin = useCallback(async () => {
    try {
      const res = await apiRequest<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      writeJsonCache(ADMIN_OVERVIEW_CACHE_KEY, res);
      if (res.partners.length > 0) {
        setNewGroupPartnerId((prev) => prev || String(res.partners[0].id));
        setNewChallPartnerId((prev) => prev || String(res.partners[0].id));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      const cached = readJsonCache<AdminOverviewResponse>(ADMIN_OVERVIEW_CACHE_KEY);
      if (cached) {
        setData(cached);
        setNotice('Connexion instable ou hors ligne : affichage des dernières données synchronisées.');
      } else {
        setNotice(err instanceof Error ? err.message : 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  useEffect(() => {
    if (!inspectedCoach?.document) {
      setDocPreviewUrl(null);
      setDocPreviewError(null);
      setDocPreviewLoading(false);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setDocPreviewLoading(true);
    setDocPreviewError(null);
    setDocPreviewUrl(null);

    const token = getSessionToken();
    fetch(`/api/admin/coach-documents/${inspectedCoach.document.id}/file`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Impossible de charger l’aperçu du document diplôme.');
        }
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setDocPreviewUrl(objectUrl);
      })
      .catch((err) => {
        if (!active) return;
        setDocPreviewError(err instanceof Error ? err.message : 'Erreur de prévisualisation.');
      })
      .finally(() => {
        if (active) setDocPreviewLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inspectedCoach]);

  const handleAssignCoach = async (athleteId: number, coachId: number) => {
    if (!coachId) return;
    try {
      await apiRequest('/api/admin/assign', {
        method: 'POST',
        body: JSON.stringify({ athlete_user_id: athleteId, coach_user_id: coachId }),
      });
      setNotice('Affectation coach-athlète enregistrée et journalisée.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleStatusChange = async (userId: number, statut: AthleteStatus) => {
    try {
      await apiRequest(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      });
      setNotice('Statut du compte mis à jour.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleCoachVerification = async (
    coachUserId: number,
    verificationStatus: 'VERIFIE' | 'EN_ATTENTE' | 'REFUSE',
    options?: { adminReviewNote?: string; rejectionReason?: string; closeModal?: boolean }
  ) => {
    try {
      await apiRequest(`/api/admin/coaches/${coachUserId}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({
          verification_status: verificationStatus,
          admin_review_note: options?.adminReviewNote || undefined,
          rejection_reason: options?.rejectionReason || undefined,
        }),
      });
      setNotice(
        verificationStatus === 'VERIFIE'
          ? 'Dossier coach validé : le compte est désormais actif et visible dans le catalogue.'
          : verificationStatus === 'REFUSE'
            ? 'Dossier coach refusé : accès bloqué et décision journalisée.'
            : 'Dossier coach replacé en étude : accès suspendu jusqu’à validation.'
      );
      if (options?.closeModal) {
        setInspectedCoach(null);
      }
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const openCoachInspection = (coach: AdminCoachRow) => {
    setInspectedCoach(coach);
    setReviewNoteInput(coach.document?.admin_review_note || '');
    setRejectionReasonInput(coach.rejection_reason || '');
  };

  const handleReviewSession = async (sessionId: number, status: ValidationStatus) => {
    const reviewer = reviewerBySession[sessionId]?.trim() || '';
    if (status === 'VALIDEE' && !reviewer) {
      setNotice('Indiquez le nom du professionnel relecteur avant de publier la séance.');
      return;
    }
    try {
      await apiRequest(`/api/admin/sessions/${sessionId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          validation_status: status,
          relue_par: reviewer || null,
        }),
      });
      setNotice('Statut de relecture mis à jour.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/partners', {
        method: 'POST',
        body: JSON.stringify({
          nom: newPartnerNom,
          type: newPartnerType,
          zone: newPartnerZone,
        }),
      });
      setNewPartnerNom('');
      setNewPartnerZone('');
      setNotice('Organisation partenaire ajoutée à Terrain+.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({
          nom: newGroupNom,
          partner_id: Number(newGroupPartnerId),
          captain_name: newGroupCaptain,
          sport_code: newGroupSport,
        }),
      });
      setNewGroupNom('');
      setNewGroupCaptain('');
      setNotice('Groupe créé et rattaché à son Capitaine Prépa.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/challenges', {
        method: 'POST',
        body: JSON.stringify({
          partner_id: Number(newChallPartnerId),
          titre: newChallTitre,
          indicateur: newChallIndicateur,
          periode: newChallPeriode,
          target_sessions: Number(newChallTarget),
        }),
      });
      setNewChallTitre('');
      setNotice('Défi collectif publié.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handlePartnerRequestStatus = async (reqId: number, statut: 'NOUVELLE' | 'EN_ETUDE' | 'VALIDEE') => {
    try {
      await apiRequest(`/api/admin/partner-requests/${reqId}`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      });
      setNotice(
        statut === 'VALIDEE'
          ? 'Demande validée : l’organisation a été ajoutée aux partenaires actifs.'
          : 'Statut de la demande mis à jour.'
      );
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    clearAllWorkspaceCaches();
    onLoggedOut();
  };

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    const q = auditFilter.trim().toLowerCase();
    if (!q) return data.auditLogs;
    return data.auditLogs.filter(
      (l) =>
        l.actor_nom.toLowerCase().includes(q) ||
        (l.athlete_nom || '').toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
    );
  }, [data, auditFilter]);

  if (loading && !data) {
    return (
      <div className="min-h-screen obsidian-ambient flex items-center justify-center text-sm text-[#3D5246]">
        Chargement de l'administration Terrain+...
      </div>
    );
  }

  const pendingSessionsCount = data?.sessions.filter((s) => s.validation_status === 'EN_RELECTURE').length || 0;
  const pendingCoachesCount =
    data?.coaches.filter((c) => c.verification_status === 'EN_ATTENTE').length || 0;
  const newPartnerRequestsCount = data?.partnerRequests.filter((r) => r.statut === 'NOUVELLE').length || 0;

  const adminNavItems: Array<{
    id: AdminTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'comptes',
      label: 'Comptes & Dossiers',
      mobileLabel: 'Dossiers',
      icon: Users,
      badge: pendingCoachesCount,
    },
    {
      id: 'contenus',
      label: 'Contenus & Relecture',
      mobileLabel: 'Contenus',
      icon: BookCheck,
      badge: pendingSessionsCount,
    },
    { id: 'journal', label: 'Journal d’accès', mobileLabel: 'Journal', icon: FileSearch },
    {
      id: 'partenaires',
      label: 'Partenaires & Défis',
      mobileLabel: 'Réseau',
      icon: Building2,
      badge: newPartnerRequestsCount,
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
          <div className="mt-2.5 text-xs font-medium text-[#5B7064]">Administration & Gouvernance</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
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
                      active ? 'bg-white text-[#0D6E46]' : 'bg-amber-100 text-amber-800'
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
          <div className="flex items-center gap-2 text-xs text-[#3D5246]">
            <ShieldCheck className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />
            <span>Traçabilité et validation active</span>
          </div>
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
                · Administration
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
          {mobileMenuOpen && (
            <nav aria-label="Menu administration mobile" className="border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-1.5">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
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
                      <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
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
            </nav>
          )}
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            {notice && (
              <div className="obsidian-card rounded-xl px-4 py-3 text-sm text-[#063725] flex items-center justify-between gap-3">
                <span>{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="text-xs font-semibold text-[#0D6E46] hover:text-[#095637] shrink-0"
                >
                  Fermer
                </button>
              </div>
            )}

          {tab === 'comptes' && data && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#063725]">Comptes, dossiers coachs et affectations</h1>
                <p className="text-sm text-[#3D5246]">
                  Étudiez obligatoirement le diplôme d’un coach avant d’activer son accès et de le rendre visible aux athlètes.
                </p>
              </div>

              {/* Coach Verification Section */}
              <div className="obsidian-card rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[#063725]">Étude des dossiers & diplômes Coachs</h2>
                    <p className="text-xs text-[#5B7064]">
                      Un coach reste bloqué en attente de validation tant que l’administrateur n’a pas validé son diplôme (« VERIFIE »).
                    </p>
                  </div>
                  {pendingCoachesCount > 0 && (
                    <span className="font-mono text-xs font-bold text-amber-800">
                      {pendingCoachesCount} en attente d’étude
                    </span>
                  )}
                </div>

                <div className="divide-y divide-[#E2EBE5]">
                  {data.coaches.map((c) => (
                    <div key={c.id} className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#063725]">
                            {c.prenom} {c.nom} · {c.zone}
                          </span>
                          {c.document ? (
                            <span
                              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                c.document.study_status === 'CONFORME_PRE_ETUDE'
                                  ? 'border border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                                  : c.document.study_status === 'ANOMALIE'
                                    ? 'border border-red-200 bg-red-50 text-red-700'
                                    : 'border border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              Pré-étude {c.document.study_score}/100 · {c.document.study_status}
                            </span>
                          ) : (
                            <span className="rounded bg-[#F1F6F3] px-2 py-0.5 font-mono text-[10px] text-[#5B7064]">
                              Aucun document joint
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#3D5246]">
                          {c.specialite} · {c.qualification}
                        </div>
                        <div className="text-[11px] font-mono text-[#5B7064]">
                          {c.coach_plan || 'MARKETPLACE'} {c.telephone ? `· ${c.telephone}` : ''}
                          {c.document ? ` · Diplôme ${c.document.diploma_number} (${c.document.issuing_organism})` : ''}
                        </div>
                        <div className="text-[11px] text-[#5B7064] flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Carte pro : <strong className="font-mono text-[#063725]">{c.pro_card_number || 'Non renseignée'}</strong>
                            {c.pro_card_expiry ? ` (exp. ${c.pro_card_expiry})` : ''}
                          </span>
                          <span>
                            RC Pro : <strong className="text-[#063725]">{c.rc_pro_insurer || '—'}</strong>
                            {c.rc_pro_policy_number ? ` (${c.rc_pro_policy_number})` : ''}
                          </span>
                          <span>
                            Statut : <strong className="text-[#063725]">{COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === c.legal_status)?.label || c.legal_status || 'Non déclaré'}</strong>
                            {c.business_reg_number ? ` · ${c.business_reg_number}` : ''}
                          </span>
                        </div>
                        {c.rejection_reason && c.verification_status === 'REFUSE' && (
                          <div className="text-xs text-red-700 font-medium">Motif du refus : {c.rejection_reason}</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openCoachInspection(c)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#E2EBE5] min-h-[36px]"
                        >
                          <Eye className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                          <span>Étudier le dossier</span>
                        </button>
                        <select
                          value={c.verification_status || 'VERIFIE'}
                          onChange={(e) =>
                            handleCoachVerification(
                              c.id,
                              e.target.value as 'VERIFIE' | 'EN_ATTENTE' | 'REFUSE'
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold min-h-[36px] ${
                            c.verification_status === 'EN_ATTENTE'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : c.verification_status === 'REFUSE'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                          }`}
                        >
                          <option value="VERIFIE">VERIFIE</option>
                          <option value="EN_ATTENTE">EN_ATTENTE</option>
                          <option value="REFUSE">REFUSE</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="obsidian-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-xs text-[#5B7064]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Utilisateur</th>
                      <th className="px-4 py-3 font-medium">Rôle & Sport</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Coach affecté</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2EBE5]">
                    {data.users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#F6F8F5]">
                        <td className="px-4 py-3.5 font-medium text-[#063725]">
                          {u.prenom} {u.nom}
                          {u.is_minor ? <span className="ml-2 text-xs text-amber-700 font-semibold">(Mineur)</span> : null}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#3D5246]">
                          {u.role}
                          {u.sport_code ? ` · ${SPORTS_CONFIG[u.sport_code].nom}` : ''}
                          {u.niveau ? ` (${LEVEL_LABELS[u.niveau]})` : ''}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#3D5246] font-mono">
                          {u.telephone}
                        </td>
                        <td className="px-4 py-3.5">
                          {u.role === 'ATHLETE' ? (
                            <select
                              value={u.assigned_coach_id || ''}
                              onChange={(e) => handleAssignCoach(u.id, Number(e.target.value))}
                              className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725] min-h-[36px]"
                            >
                              <option value="">Non affecté</option>
                              {data.coaches
                                .filter((c) => (c.verification_status || 'VERIFIE') === 'VERIFIE')
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.prenom} {c.nom} ({c.zone})
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="text-xs text-[#5B7064]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {u.role !== 'ADMIN' ? (
                            <select
                              value={u.statut}
                              onChange={(e) => handleStatusChange(u.id, e.target.value as AthleteStatus)}
                              className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725] min-h-[36px]"
                            >
                              <option value="ACTIF">ACTIF</option>
                              <option value="SUIVI_ACTIF">SUIVI_ACTIF</option>
                              <option value="EN_PAUSE">EN_PAUSE</option>
                              <option value="CLOTURE">CLOTURE</option>
                            </select>
                          ) : (
                            <span className="text-xs font-semibold text-[#0D6E46]">{u.statut}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'contenus' && data && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#063725]">Validation et relecture des séances</h1>
                <p className="text-sm text-[#3D5246]">
                  Chaque séance doit être relue par un préparateur physique ou un professionnel de santé avant publication.
                </p>
              </div>

              <div className="space-y-4">
                {data.sessions.map((s) => (
                  <div key={s.id} className="obsidian-card rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#5B7064]">
                          {SPORTS_CONFIG[s.sport_code].nom} · {LEVEL_LABELS[s.niveau]} · {s.duree_min} min
                          {s.proposee_par_nom ? ` · Proposée par ${s.proposee_par_nom}` : ''}
                        </div>
                        <h2 className="text-base font-semibold text-[#063725] mt-0.5">{s.titre}</h2>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          s.validation_status === 'VALIDEE'
                            ? 'text-[#0D6E46]'
                            : s.validation_status === 'EN_RELECTURE'
                              ? 'text-amber-700'
                              : 'text-[#5B7064]'
                        }`}
                      >
                        {s.validation_status}
                      </span>
                    </div>

                    <p className="text-xs text-[#3D5246]">
                      Objectif : {s.objectif} · Prévention : {s.prevention_focus}
                    </p>
                    {s.relue_par && (
                      <p className="text-xs text-[#0D6E46] font-semibold">Relue et validée par : {s.relue_par}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[#E2EBE5]">
                      <input
                        type="text"
                        value={reviewerBySession[s.id] ?? s.relue_par ?? ''}
                        onChange={(e) =>
                          setReviewerBySession((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        placeholder="Nom et qualification du relecteur"
                        className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'VALIDEE')}
                        className="rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                      >
                        Valider et publier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'BROUILLON')}
                        className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-medium text-[#3D5246] hover:text-[#063725] hover:bg-[#E2EBE5] min-h-[40px]"
                      >
                        Renvoyer en brouillon
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'journal' && data && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">Journal des accès aux fiches athlètes</h1>
                  <p className="text-sm text-[#3D5246]">
                    Traçabilité complète des consultations, ajustements et exports de données sensibles.
                  </p>
                </div>
                <input
                  type="text"
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  placeholder="Filtrer par acteur, athlète ou action..."
                  className="w-full sm:w-64 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-sm text-[#063725] placeholder:text-[#5B7064] min-h-[42px]"
                />
              </div>

              <div className="obsidian-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Horodatage</th>
                      <th className="px-4 py-3 font-medium">Acteur</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Athlète concerné</th>
                      <th className="px-4 py-3 font-medium">Ressource</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2EBE5]">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#F6F8F5]">
                        <td className="px-4 py-3 font-mono tabular-nums text-[#5B7064]">{log.created_at}</td>
                        <td className="px-4 py-3 font-medium text-[#063725]">
                          {log.actor_nom} ({log.actor_role})
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-[#0D6E46]">{log.action}</td>
                        <td className="px-4 py-3 text-[#3D5246]">{log.athlete_nom || '—'}</td>
                        <td className="px-4 py-3 font-mono text-[#5B7064]">{log.resource}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'partenaires' && data && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#063725]">
                  Partenaires, Groupes et Défis collectifs
                </h1>
                <p className="text-sm text-[#3D5246]">
                  Modèle collectif ASC, Campus et Ligues (suivi agrégé uniquement, sans classement individuel public).
                </p>
              </div>

              {/* Active Partners */}
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-[#063725]">Organisations partenaires actives</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.partners.map((p) => (
                    <div key={p.id} className="obsidian-card rounded-2xl p-5 space-y-2">
                      <div className="text-xs text-[#0D6E46] font-semibold">{p.type} · {p.zone}</div>
                      <div className="text-base font-semibold text-[#063725]">{p.nom}</div>
                      <div className="text-xs font-mono tabular-nums text-[#3D5246] pt-1">
                        {p.groups_count} groupe(s) · {p.members_count} membre(s) agrégés
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Active Groups & Challenges */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="obsidian-card rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-semibold text-[#063725]">Groupes et Capitaines Prépa</h2>
                  <div className="divide-y divide-[#E2EBE5]">
                    {data.groups.map((g) => (
                      <div key={g.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#063725]">{g.nom}</div>
                          <div className="text-xs text-[#5B7064]">
                            {g.partner_nom} · {SPORTS_CONFIG[g.sport_code].nom} · Capitaine : {g.captain_name}
                          </div>
                        </div>
                        <span className="font-mono text-xs tabular-nums font-semibold text-[#0D6E46]">
                          {g.member_count} membres
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="obsidian-card rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-semibold text-[#063725]">Défis collectifs en cours</h2>
                  <div className="space-y-3">
                    {data.challenges.map((c) => {
                      const pct = Math.min(100, Math.round((c.current_sessions / c.target_sessions) * 100));
                      return (
                        <div key={c.id} className="obsidian-inset rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs text-[#5B7064]">
                            <span>{c.partner_nom} · {c.periode}</span>
                            <span className="font-mono tabular-nums font-semibold text-[#0D6E46]">{pct}%</span>
                          </div>
                          <div className="text-sm font-semibold text-[#063725]">{c.titre}</div>
                          <div className="h-1.5 w-full rounded-full bg-[#DCE7E0] overflow-hidden">
                            <div className="h-full bg-[#0D6E46]" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="font-mono text-xs tabular-nums text-[#3D5246]">
                            {c.current_sessions} / {c.target_sessions} · {c.indicateur}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Partner Requests from Landing Page */}
              <section className="obsidian-card rounded-2xl p-5 space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-[#063725]">Demandes de partenariat reçues</h2>
                  <p className="text-xs text-[#5B7064]">
                    Valider une demande crée automatiquement le partenaire actif dans la plateforme.
                  </p>
                </div>
                {data.partnerRequests.length === 0 ? (
                  <p className="text-xs text-[#5B7064] py-3">
                    Aucune demande de partenariat soumise depuis l’accueil public pour le moment.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Structure</th>
                          <th className="px-3 py-2.5 font-medium">Responsable & Contact</th>
                          <th className="px-3 py-2.5 font-medium">Détails</th>
                          <th className="px-3 py-2.5 font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2EBE5]">
                        {data.partnerRequests.map((req) => (
                          <tr key={req.id} className="hover:bg-[#F6F8F5]">
                            <td className="px-3 py-3 font-medium text-[#063725]">
                              {req.organisation}
                              <div className="text-[#5B7064] font-normal">
                                {req.type} · {req.zone}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[#3D5246]">
                              <div>{req.contact_nom}</div>
                              <div className="font-mono text-[#5B7064]">{req.contact_telephone}</div>
                            </td>
                            <td className="px-3 py-3 text-[#3D5246] max-w-xs">
                              {req.pack_souhaite ? (
                                <div className="mb-1 inline-block rounded border border-[#BFE0CD] bg-[#ECF7F1] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0D6E46]">
                                  {req.pack_souhaite}
                                </div>
                              ) : null}
                              <div>
                                {req.sport_principal ? `${req.sport_principal} · ` : ''}
                                {req.nombre_athletes_estime ? `${req.nombre_athletes_estime} sportifs · ` : ''}
                                {req.message || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <select
                                value={req.statut}
                                onChange={(e) =>
                                  handlePartnerRequestStatus(
                                    req.id,
                                    e.target.value as 'NOUVELLE' | 'EN_ETUDE' | 'VALIDEE'
                                  )
                                }
                                className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725] min-h-[36px]"
                              >
                                <option value="NOUVELLE">NOUVELLE</option>
                                <option value="EN_ETUDE">EN_ETUDE</option>
                                <option value="VALIDEE">VALIDEE</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Creation Forms */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <form onSubmit={handleCreatePartner} className="obsidian-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#063725]">Ajouter un partenaire</h3>
                  <input
                    type="text"
                    required
                    value={newPartnerNom}
                    onChange={(e) => setNewPartnerNom(e.target.value)}
                    placeholder="Nom de l'ASC, Campus ou Ligue"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newPartnerType}
                      onChange={(e) => setNewPartnerType(e.target.value as 'ASC' | 'CAMPUS' | 'LIGUE')}
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                    >
                      <option value="ASC">ASC</option>
                      <option value="CAMPUS">Campus</option>
                      <option value="LIGUE">Ligue</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={newPartnerZone}
                      onChange={(e) => setNewPartnerZone(e.target.value)}
                      placeholder="Ville ou zone"
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-full bg-[#0D6E46] py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                  >
                    Créer le partenaire
                  </button>
                </form>

                <form onSubmit={handleCreateGroup} className="obsidian-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#063725]">Créer un groupe</h3>
                  <select
                    value={newGroupPartnerId}
                    onChange={(e) => setNewGroupPartnerId(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                  >
                    {data.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom} ({p.zone})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={newGroupNom}
                    onChange={(e) => setNewGroupNom(e.target.value)}
                    placeholder="Nom du collectif"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={newGroupCaptain}
                      onChange={(e) => setNewGroupCaptain(e.target.value)}
                      placeholder="Capitaine Prépa"
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                    <select
                      value={newGroupSport}
                      onChange={(e) => setNewGroupSport(e.target.value as SportCode)}
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                    >
                      {ALL_SPORT_CODES.map((code) => (
                        <option key={code} value={code}>
                          {SPORTS_CONFIG[code].nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-full bg-[#0D6E46] py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                  >
                    Créer le groupe
                  </button>
                </form>

                <form onSubmit={handleCreateChallenge} className="obsidian-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#063725]">Lancer un défi collectif</h3>
                  <select
                    value={newChallPartnerId}
                    onChange={(e) => setNewChallPartnerId(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                  >
                    {data.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom} ({p.zone})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={newChallTitre}
                    onChange={(e) => setNewChallTitre(e.target.value)}
                    placeholder="Titre du défi (ex: 100 séances prévention)"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={newChallPeriode}
                      onChange={(e) => setNewChallPeriode(e.target.value)}
                      placeholder="Période"
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                    <input
                      type="number"
                      min={10}
                      max={10000}
                      required
                      value={newChallTarget}
                      onChange={(e) => setNewChallTarget(e.target.value)}
                      placeholder="Objectif séances"
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 font-mono text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-full bg-[#0D6E46] py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                  >
                    Publier le défi
                  </button>
                </form>
              </div>
            </div>
          )}
            <LegalFooter />
          </div>
        </main>
      </div>

      {/* Floating Light Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile administration"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-[#D5E2DA] bg-white/95 backdrop-blur-md p-1.5 shadow-xl"
      >
        <div className="grid grid-cols-4 gap-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 px-0.5 text-[10px] transition-colors ${
                  active
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#5B7064] hover:text-[#063725] font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`absolute -top-1.5 -right-2 font-mono text-[9px] font-bold tabular-nums rounded px-1 leading-tight ${
                        active ? 'bg-white text-[#0D6E46]' : 'bg-amber-500 text-white'
                      }`}
                    >
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

      {/* Coach Diploma Study & Inspection Modal */}
      {inspectedCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="obsidian-card-glow w-full max-w-4xl rounded-3xl my-auto overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-[#E2EBE5] px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#063725]">
                  Étude du dossier Coach · {inspectedCoach.prenom} {inspectedCoach.nom}
                </h2>
                <p className="text-xs text-[#5B7064]">
                  {inspectedCoach.zone} · {inspectedCoach.specialite} · {inspectedCoach.qualification}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedCoach(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5B7064] hover:bg-[#F1F6F3] hover:text-[#063725]"
                aria-label="Fermer l’étude"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* Left: Automated Conformity Study Report + Decision Controls */}
              <div className="space-y-4">
                {inspectedCoach.document ? (
                  <>
                    <div className="obsidian-inset rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#063725]">
                          {inspectedCoach.document.study_report.formatLabel}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                            inspectedCoach.document.study_status === 'CONFORME_PRE_ETUDE'
                              ? 'border border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                              : inspectedCoach.document.study_status === 'ANOMALIE'
                                ? 'border border-red-200 bg-red-50 text-red-700'
                                : 'border border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {inspectedCoach.document.study_score} / 100
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#3D5246] pt-1">
                        <div>
                          <span className="text-[#5B7064]">Organisme : </span>
                          <span className="font-medium text-[#063725]">{inspectedCoach.document.issuing_organism}</span>
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Année : </span>
                          <span className="font-mono font-medium text-[#063725]">{inspectedCoach.document.issue_year}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[#5B7064]">Référence : </span>
                          <span className="font-mono font-semibold text-[#0D6E46]">
                            {inspectedCoach.document.diploma_number}
                          </span>
                        </div>
                        <div className="col-span-2 truncate">
                          <span className="text-[#5B7064]">Empreinte SHA-256 : </span>
                          <span className="font-mono text-[11px]">{inspectedCoach.document.sha256_hash}</span>
                        </div>
                      </div>
                    </div>

                    <div className="obsidian-inset rounded-xl p-4 space-y-2 text-xs">
                      <div className="font-semibold text-[#063725]">
                        Conformité réglementaire (Carte Pro · RC Pro · Statut juridique · Honorabilité)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3D5246]">
                        <div>
                          <span className="text-[#5B7064]">Carte pro : </span>
                          <span className="font-mono font-semibold text-[#063725]">
                            {inspectedCoach.pro_card_number || 'Non renseignée'}
                          </span>
                          {inspectedCoach.pro_card_expiry && (
                            <span className="text-[#5B7064]"> (exp. {inspectedCoach.pro_card_expiry})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Honorabilité : </span>
                          <span
                            className={`font-semibold ${
                              inspectedCoach.honorability_attested ? 'text-[#0D6E46]' : 'text-amber-700'
                            }`}
                          >
                            {inspectedCoach.honorability_attested ? 'Attestée sur l’honneur' : 'Non attestée'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Assurance RC Pro : </span>
                          <span className="font-medium text-[#063725]">
                            {inspectedCoach.rc_pro_insurer || 'Non renseignée'}
                          </span>
                          {inspectedCoach.rc_pro_policy_number && (
                            <span className="font-mono text-[#5B7064]"> ({inspectedCoach.rc_pro_policy_number})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Structure & ID : </span>
                          <span className="font-medium text-[#063725]">
                            {COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === inspectedCoach.legal_status)?.label ||
                              inspectedCoach.legal_status ||
                              'Non déclaré'}
                          </span>
                          {inspectedCoach.business_reg_number && (
                            <span className="font-mono text-[#5B7064]"> · {inspectedCoach.business_reg_number}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[#063725]">
                        Contrôles automatiques de pré-étude
                      </div>
                      <div className="space-y-2">
                        {inspectedCoach.document.study_report.checks.map((chk) => (
                          <div
                            key={chk.id}
                            className={`rounded-xl border px-3 py-2.5 text-xs flex items-start gap-2.5 ${
                              chk.passed
                                ? 'border-[#BFE0CD] bg-[#ECF7F1] text-[#063725]'
                                : 'border-amber-200 bg-amber-50 text-amber-900'
                            }`}
                          >
                            {chk.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-[#0D6E46] shrink-0 mt-0.5" aria-hidden="true" />
                            ) : (
                              <XCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                            )}
                            <div>
                              <div className="font-semibold">{chk.label}</div>
                              <div className="text-[11px] opacity-90">{chk.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    Aucun justificatif numérique n’a été déposé pour ce profil. Vous pouvez laisser le dossier en attente ou le refuser.
                  </div>
                )}

                <div className="space-y-2.5 pt-2 border-t border-[#E2EBE5]">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Note d’étude administrative (interne)
                    </label>
                    <input
                      type="text"
                      value={reviewNoteInput}
                      onChange={(e) => setReviewNoteInput(e.target.value)}
                      placeholder="Référence ou note de validation"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Motif de refus (affiché au coach si refusé)
                    </label>
                    <input
                      type="text"
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      placeholder="Ex: Numéro de diplôme illisible ou non reconnu"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'VERIFIE', {
                          adminReviewNote: reviewNoteInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                    >
                      Valider le diplôme et activer le coach
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'EN_ATTENTE', {
                          adminReviewNote: reviewNoteInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3.5 py-2.5 text-xs font-medium text-[#063725] hover:bg-[#E2EBE5] min-h-[40px]"
                    >
                      Laisser en étude
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'REFUSE', {
                          adminReviewNote: reviewNoteInput,
                          rejectionReason: rejectionReasonInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 min-h-[40px]"
                    >
                      Refuser le dossier
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Live Document Preview (keep crisp white canvas behind uploaded document) */}
              <div className="flex flex-col rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] overflow-hidden min-h-[380px]">
                <div className="flex items-center justify-between gap-2 border-b border-[#E2EBE5] bg-white px-4 py-2.5 text-xs">
                  <span className="font-medium text-[#063725] truncate">
                    {inspectedCoach.document?.original_filename || 'Aperçu du justificatif'}
                  </span>
                  {docPreviewUrl && inspectedCoach.document && (
                    <a
                      href={docPreviewUrl}
                      download={inspectedCoach.document.original_filename}
                      className="inline-flex items-center gap-1 font-semibold text-[#0D6E46] hover:underline shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Télécharger</span>
                    </a>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center p-3">
                  {!inspectedCoach.document ? (
                    <div className="text-xs text-[#5B7064]">Aucun fichier joint.</div>
                  ) : docPreviewLoading ? (
                    <div className="text-xs text-[#3D5246]">Chargement sécurisé du document...</div>
                  ) : docPreviewError ? (
                    <div className="text-xs text-red-700 px-4 text-center">{docPreviewError}</div>
                  ) : docPreviewUrl ? (
                    inspectedCoach.document.mime_type === 'application/pdf' ? (
                      <iframe
                        src={docPreviewUrl}
                        title={`Aperçu diplôme ${inspectedCoach.prenom} ${inspectedCoach.nom}`}
                        className="w-full h-[460px] rounded-lg border border-[#D5E2DA] bg-white"
                      />
                    ) : (
                      <img
                        src={docPreviewUrl}
                        alt={`Diplôme ${inspectedCoach.prenom} ${inspectedCoach.nom}`}
                        className="max-h-[460px] w-auto object-contain rounded-lg border border-[#D5E2DA] bg-white"
                      />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
