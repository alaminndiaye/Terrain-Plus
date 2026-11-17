import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookCheck,
  Building2,
  FileSearch,
  Landmark,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  ApiError,
  apiRequest,
  clearAllWorkspaceCaches,
  clearSessionToken,
  readJsonCache,
  writeJsonCache,
} from '../lib/api';
import { LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';

const ADMIN_OVERVIEW_CACHE_KEY = 'terrain_plus_admin_overview_v1';
const MINISTER_OVERVIEW_CACHE_KEY = 'terrain_plus_minister_overview_v1';
import type {
  AthleteLevel,
  AthleteStatus,
  AuditLogEntry,
  MinisterOverviewPayload,
  PartnerRequestRecord,
  PartnerSummary,
  SportCode,
  UserRole,
  ValidationStatus,
} from '../types';
import { MinisterOverviewContent, type MinisterSection } from './MinisterWorkspace';

type AdminTab = 'comptes' | 'contenus' | 'journal' | 'partenaires' | 'ministeres';

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
    readJsonCache<AdminOverviewResponse>(ADMIN_OVERVIEW_CACHE_KEY)
  );
  const [tab, setTab] = useState<AdminTab>('comptes');
  const [data, setData] = useState<AdminOverviewResponse | null>(cachedAdmin);
  const [ministerData, setMinisterData] = useState<MinisterOverviewPayload | null>(() =>
    readJsonCache<MinisterOverviewPayload>(MINISTER_OVERVIEW_CACHE_KEY)
  );
  const [ministerSection, setMinisterSection] = useState<MinisterSection>('synthese');
  const [loading, setLoading] = useState(!cachedAdmin);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewerBySession, setReviewerBySession] = useState<Record<number, string>>({});
  const [auditFilter, setAuditFilter] = useState('');

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
      const [res, minRes] = await Promise.all([
        apiRequest<AdminOverviewResponse>('/api/admin/overview'),
        apiRequest<MinisterOverviewPayload>('/api/minister/overview').catch(() => null),
      ]);
      setData(res);
      writeJsonCache(ADMIN_OVERVIEW_CACHE_KEY, res);
      if (minRes) {
        setMinisterData(minRes);
        writeJsonCache(MINISTER_OVERVIEW_CACHE_KEY, minRes);
      }
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
    verificationStatus: 'VERIFIE' | 'EN_ATTENTE' | 'REFUSE'
  ) => {
    try {
      await apiRequest(`/api/admin/coaches/${coachUserId}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({ verification_status: verificationStatus }),
      });
      setNotice('Statut de vérification du coach mis à jour et journalisé.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
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
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center text-sm text-neutral-600">
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
      label: 'Comptes & Affectations',
      mobileLabel: 'Comptes',
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
    { id: 'ministeres', label: 'Vue Ministères', mobileLabel: 'Ministères', icon: Landmark },
  ];

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900 flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-neutral-200 bg-white">
        <div className="p-5 border-b border-neutral-200">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <div className="mt-2 text-xs font-medium text-neutral-500">Administration & Gouvernance</div>
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
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] text-left ${
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="font-mono text-xs font-bold tabular-nums shrink-0">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200 space-y-3">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>Traçabilité et validation active</span>
          </div>
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
        {/* Compact Mobile Top Header (No nav tabs at top) */}
        <header className="md:hidden flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 h-[52px]">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-neutral-900 truncate">
              Administration Terrain+
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-neutral-600 hover:text-neutral-900 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
            aria-label="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            {notice && (
              <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 flex items-center justify-between gap-3">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} className="text-xs text-neutral-500 shrink-0">
                  Fermer
                </button>
              </div>
            )}

          {tab === 'comptes' && data && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-neutral-900">Comptes et affectations coach-athlète</h1>
                <p className="text-sm text-neutral-600">
                  Validez les dossiers des coachs avant publication, affectez un coach aux athlètes et gérez les statuts.
                </p>
              </div>

              {/* Coach Verification Section */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900">Validation des dossiers Coachs</h2>
                    <p className="text-xs text-neutral-500">
                      Seuls les coachs « VERIFIE » apparaissent dans le catalogue des athlètes.
                    </p>
                  </div>
                  {pendingCoachesCount > 0 && (
                    <span className="font-mono text-xs font-bold text-amber-800">
                      {pendingCoachesCount} en attente
                    </span>
                  )}
                </div>

                <div className="divide-y divide-neutral-100">
                  {data.coaches.map((c) => (
                    <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-sm font-semibold text-neutral-900">
                          {c.prenom} {c.nom} · {c.zone}
                        </div>
                        <div className="text-xs text-neutral-600">
                          {c.specialite} · {c.qualification}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500">
                          {c.coach_plan || 'MARKETPLACE'} {c.telephone ? `· ${c.telephone}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : c.verification_status === 'REFUSE'
                                ? 'border-red-300 bg-red-50 text-red-900'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
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

              <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Utilisateur</th>
                      <th className="px-4 py-3 font-medium">Rôle & Sport</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Coach affecté</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.users.map((u) => (
                      <tr key={u.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3.5 font-medium text-neutral-900">
                          {u.prenom} {u.nom}
                          {u.is_minor ? <span className="ml-2 text-xs text-amber-700">(Mineur)</span> : null}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-neutral-600">
                          {u.role}
                          {u.sport_code ? ` · ${SPORTS_CONFIG[u.sport_code].nom}` : ''}
                          {u.niveau ? ` (${LEVEL_LABELS[u.niveau]})` : ''}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-neutral-600 font-mono">
                          {u.telephone}
                        </td>
                        <td className="px-4 py-3.5">
                          {u.role === 'ATHLETE' ? (
                            <select
                              value={u.assigned_coach_id || ''}
                              onChange={(e) => handleAssignCoach(u.id, Number(e.target.value))}
                              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs min-h-[36px]"
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
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {u.role !== 'ADMIN' ? (
                            <select
                              value={u.statut}
                              onChange={(e) => handleStatusChange(u.id, e.target.value as AthleteStatus)}
                              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs min-h-[36px]"
                            >
                              <option value="ACTIF">ACTIF</option>
                              <option value="SUIVI_ACTIF">SUIVI_ACTIF</option>
                              <option value="EN_PAUSE">EN_PAUSE</option>
                              <option value="CLOTURE">CLOTURE</option>
                            </select>
                          ) : (
                            <span className="text-xs font-medium text-neutral-700">{u.statut}</span>
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
                <h1 className="font-display text-2xl font-bold text-neutral-900">Validation et relecture des séances</h1>
                <p className="text-sm text-neutral-600">
                  Chaque séance doit être relue par un préparateur physique ou un professionnel de santé avant publication.
                </p>
              </div>

              <div className="space-y-4">
                {data.sessions.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-neutral-500">
                          {SPORTS_CONFIG[s.sport_code].nom} · {LEVEL_LABELS[s.niveau]} · {s.duree_min} min
                          {s.proposee_par_nom ? ` · Proposée par ${s.proposee_par_nom}` : ''}
                        </div>
                        <h2 className="text-base font-semibold text-neutral-900 mt-0.5">{s.titre}</h2>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          s.validation_status === 'VALIDEE'
                            ? 'text-emerald-700'
                            : s.validation_status === 'EN_RELECTURE'
                              ? 'text-amber-700'
                              : 'text-neutral-500'
                        }`}
                      >
                        {s.validation_status}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-600">
                      Objectif : {s.objectif} · Prévention : {s.prevention_focus}
                    </p>
                    {s.relue_par && (
                      <p className="text-xs text-emerald-800 font-medium">Relue et validée par : {s.relue_par}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-neutral-100">
                      <input
                        type="text"
                        value={reviewerBySession[s.id] ?? s.relue_par ?? ''}
                        onChange={(e) =>
                          setReviewerBySession((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        placeholder="Nom et qualité du relecteur (ex: Dr. S. Diagne, Médecin du sport)"
                        className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'VALIDEE')}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 min-h-[40px]"
                      >
                        Valider et publier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'BROUILLON')}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 min-h-[40px]"
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
                  <h1 className="font-display text-2xl font-bold text-neutral-900">Journal des accès aux fiches athlètes</h1>
                  <p className="text-sm text-neutral-600">
                    Traçabilité complète des consultations, ajustements et exports de données sensibles.
                  </p>
                </div>
                <input
                  type="text"
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  placeholder="Filtrer par acteur, athlète ou action..."
                  className="w-full sm:w-64 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[42px]"
                />
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Horodatage</th>
                      <th className="px-4 py-3 font-medium">Acteur</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Athlète concerné</th>
                      <th className="px-4 py-3 font-medium">Ressource</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-mono tabular-nums text-neutral-500">{log.created_at}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900">
                          {log.actor_nom} ({log.actor_role})
                        </td>
                        <td className="px-4 py-3 font-mono text-neutral-800">{log.action}</td>
                        <td className="px-4 py-3 text-neutral-700">{log.athlete_nom || '—'}</td>
                        <td className="px-4 py-3 font-mono text-neutral-500">{log.resource}</td>
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
                <h1 className="font-display text-2xl font-bold text-neutral-900">
                  Partenaires, Groupes et Défis collectifs
                </h1>
                <p className="text-sm text-neutral-600">
                  Modèle collectif ASC, Campus et Ligues (suivi agrégé uniquement, sans classement individuel public).
                </p>
              </div>

              {/* Active Partners */}
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-neutral-900">Organisations partenaires actives</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.partners.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-2">
                      <div className="text-xs text-neutral-500">{p.type} · {p.zone}</div>
                      <div className="text-base font-semibold text-neutral-900">{p.nom}</div>
                      <div className="text-xs font-mono tabular-nums text-neutral-600 pt-1">
                        {p.groups_count} groupe(s) · {p.members_count} membre(s) agrégés
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Active Groups & Challenges */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h2 className="text-base font-semibold text-neutral-900">Groupes et Capitaines Prépa</h2>
                  <div className="divide-y divide-neutral-100">
                    {data.groups.map((g) => (
                      <div key={g.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">{g.nom}</div>
                          <div className="text-xs text-neutral-500">
                            {g.partner_nom} · {SPORTS_CONFIG[g.sport_code].nom} · Capitaine : {g.captain_name}
                          </div>
                        </div>
                        <span className="font-mono text-xs tabular-nums font-semibold text-neutral-800">
                          {g.member_count} membres
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h2 className="text-base font-semibold text-neutral-900">Défis collectifs en cours</h2>
                  <div className="space-y-3">
                    {data.challenges.map((c) => {
                      const pct = Math.min(100, Math.round((c.current_sessions / c.target_sessions) * 100));
                      return (
                        <div key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                            <span>{c.partner_nom} · {c.periode}</span>
                            <span className="font-mono tabular-nums font-semibold text-neutral-900">{pct}%</span>
                          </div>
                          <div className="text-sm font-semibold text-neutral-900">{c.titre}</div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                            <div className="h-full bg-neutral-900" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="font-mono text-xs tabular-nums text-neutral-600">
                            {c.current_sessions} / {c.target_sessions} · {c.indicateur}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Partner Requests from Landing Page */}
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Demandes de partenariat reçues</h2>
                  <p className="text-xs text-neutral-500">
                    Valider une demande crée automatiquement le partenaire actif dans la plateforme.
                  </p>
                </div>
                {data.partnerRequests.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-3">
                    Aucune demande de partenariat soumise depuis l’accueil public pour le moment.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Structure</th>
                          <th className="px-3 py-2.5 font-medium">Responsable & Contact</th>
                          <th className="px-3 py-2.5 font-medium">Détails</th>
                          <th className="px-3 py-2.5 font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.partnerRequests.map((req) => (
                          <tr key={req.id}>
                            <td className="px-3 py-3 font-medium text-neutral-900">
                              {req.organisation}
                              <div className="text-neutral-500 font-normal">
                                {req.type} · {req.zone}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-neutral-700">
                              <div>{req.contact_nom}</div>
                              <div className="font-mono text-neutral-500">{req.contact_telephone}</div>
                            </td>
                            <td className="px-3 py-3 text-neutral-600 max-w-xs">
                              {req.pack_souhaite ? (
                                <div className="mb-1 inline-block rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-neutral-800">
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
                                className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs min-h-[36px]"
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
                <form onSubmit={handleCreatePartner} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-900">Ajouter un partenaire</h3>
                  <input
                    type="text"
                    required
                    value={newPartnerNom}
                    onChange={(e) => setNewPartnerNom(e.target.value)}
                    placeholder="Nom de l'ASC, Campus ou Ligue"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newPartnerType}
                      onChange={(e) => setNewPartnerType(e.target.value as 'ASC' | 'CAMPUS' | 'LIGUE')}
                      className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
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
                      placeholder="Zone (ex: Kaolack)"
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                  >
                    Créer le partenaire
                  </button>
                </form>

                <form onSubmit={handleCreateGroup} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-900">Créer un groupe</h3>
                  <select
                    value={newGroupPartnerId}
                    onChange={(e) => setNewGroupPartnerId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
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
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={newGroupCaptain}
                      onChange={(e) => setNewGroupCaptain(e.target.value)}
                      placeholder="Capitaine Prépa"
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                    />
                    <select
                      value={newGroupSport}
                      onChange={(e) => setNewGroupSport(e.target.value as SportCode)}
                      className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
                    >
                      <option value="football">Football</option>
                      <option value="basket">Basket</option>
                      <option value="handball">Handball</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="athletisme">Athlétisme</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                  >
                    Créer le groupe
                  </button>
                </form>

                <form onSubmit={handleCreateChallenge} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-900">Lancer un défi collectif</h3>
                  <select
                    value={newChallPartnerId}
                    onChange={(e) => setNewChallPartnerId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
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
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={newChallPeriode}
                      onChange={(e) => setNewChallPeriode(e.target.value)}
                      placeholder="Période"
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                    />
                    <input
                      type="number"
                      min={10}
                      max={10000}
                      required
                      value={newChallTarget}
                      onChange={(e) => setNewChallTarget(e.target.value)}
                      placeholder="Objectif séances"
                      className="rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs min-h-[40px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                  >
                    Publier le défi
                  </button>
                </form>
              </div>
            </div>
          )}
          {tab === 'ministeres' && (
            ministerData ? (
              <MinisterOverviewContent
                data={ministerData}
                section={ministerSection}
                onSelectSection={setMinisterSection}
                embeddedInAdmin
              />
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
                Chargement de l’Observatoire National...
              </div>
            )
          )}
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile administration"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium px-0.5 ${
                  active ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-2 font-mono text-[9px] font-bold tabular-nums rounded bg-neutral-900 text-white px-1 leading-tight">
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
