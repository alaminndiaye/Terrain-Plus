import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ClipboardList,
  LogOut,
  PlusCircle,
  Search,
  Users,
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
import { ApiError, apiRequest, clearSessionToken } from '../lib/api';
import { LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';
import type {
  AlertRecord,
  AthleteLevel,
  AthleteWorkspacePayload,
  AuthUser,
  CoachAthleteSummary,
  SessionTemplate,
  SportCode,
} from '../types';

type CoachTab = 'athletes' | 'alertes' | 'proposer';

interface CoachOverviewResponse {
  coach: AuthUser;
  athletes: CoachAthleteSummary[];
  alerts: AlertRecord[];
  library: Array<Omit<SessionTemplate, 'exercises'>>;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const CoachWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [tab, setTab] = useState<CoachTab>('athletes');
  const [overview, setOverview] = useState<CoachOverviewResponse | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteWorkspacePayload | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
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

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiRequest<CoachOverviewResponse>('/api/coach/overview');
      setOverview(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setNotice(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

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

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    onLoggedOut();
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center text-sm text-neutral-600">
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
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900 flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-neutral-200 bg-white">
        <div className="p-5 border-b border-neutral-200">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <div className="mt-2 text-xs font-medium text-neutral-500">Espace Coach · Suivi affecté</div>
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
          <p className="text-xs text-neutral-500 leading-relaxed">
            Accès strict aux athlètes affectés. Chaque consultation est journalisée. Le coach ne pose pas de diagnostic médical.
          </p>
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
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-neutral-900 truncate">
              Espace Coach Prépa
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
          <div className="mx-auto max-w-5xl space-y-6">
          {notice && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 flex items-center justify-between">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
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
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 min-h-[40px]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Retour à la liste des athlètes</span>
              </button>

              <div className="rounded-2xl border border-neutral-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-neutral-500">
                    {SPORTS_CONFIG[selectedAthlete.profile.sport_code].nom} ·{' '}
                    {LEVEL_LABELS[selectedAthlete.profile.niveau]} ·{' '}
                    {selectedAthlete.profile.poste || 'Tout poste'}
                    {selectedAthlete.user.is_minor ? ' · Compte mineur privé' : ''}
                  </div>
                  <h1 className="mt-1 font-display text-2xl font-bold text-neutral-900">
                    {selectedAthlete.user.prenom} {selectedAthlete.user.nom}
                  </h1>
                </div>
                <div className="flex items-center gap-6 font-mono tabular-nums text-sm">
                  <div>
                    <div className="text-xs text-neutral-500">Semaine</div>
                    <div className="font-bold">
                      {selectedAthlete.stats.weeklyCompleted}/{selectedAthlete.stats.weeklyTarget}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">RPE moyen</div>
                    <div className="font-bold">{selectedAthlete.stats.avgRpe ?? '—'}/10</div>
                  </div>
                </div>
              </div>

              {/* Objectives + Weight Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form onSubmit={handleUpdateObjective} className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h2 className="text-base font-semibold text-neutral-900">Objectifs fixés avec l’athlète</h2>
                  <textarea
                    rows={3}
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                  >
                    Mettre à jour les objectifs
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-5">
                  <h2 className="text-base font-semibold text-neutral-900">Tendance du poids</h2>
                  <div className="mt-3 h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedAthlete.weights} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="poids_kg" name="Poids (kg)" stroke="#111827" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Adjust Weekly Program */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Ajuster le programme hebdomadaire</h2>
                  <p className="text-xs text-neutral-500">
                    Toute modification est visible par l’athlète avec la date et le motif.
                  </p>
                </div>

                <div className="divide-y divide-neutral-100">
                  {selectedAthlete.schedule.map((slot) => (
                    <div key={slot.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-neutral-500">
                          {DAY_NAMES[slot.jour_semaine - 1]} · <span className="font-mono">{slot.date_prevue}</span>
                          {slot.ajustee_par_coach && ' · Ajustée'}
                        </div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {slot.is_rest_day || !slot.session ? 'Repos' : slot.session.titre}
                        </div>
                        {slot.motif_ajustement && (
                          <div className="text-xs text-neutral-600">Motif : {slot.motif_ajustement}</div>
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
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 min-h-[38px] self-start sm:self-center"
                      >
                        Modifier ce jour
                      </button>
                    </div>
                  ))}
                </div>

                {adjustingSlotId && (
                  <form onSubmit={handleAdjustSlot} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                    <div className="text-xs font-semibold text-neutral-900">Modification du créneau</div>
                    <div className="flex flex-wrap gap-4 items-center">
                      <label className="flex items-center gap-2 text-xs font-medium text-neutral-800">
                        <input
                          type="checkbox"
                          checked={adjustIsRest}
                          onChange={(e) => setAdjustIsRest(e.target.checked)}
                          className="h-4 w-4 accent-neutral-900"
                        />
                        <span>Passer en jour de repos</span>
                      </label>

                      {!adjustIsRest && (
                        <select
                          value={adjustSessionId}
                          onChange={(e) => setAdjustSessionId(e.target.value)}
                          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
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
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs min-h-[40px]"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustingSlotId(null)}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white"
                      >
                        Enregistrer la modification
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Evaluations & Coach Comments */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-semibold text-neutral-900">Évaluations et commentaires</h2>
                {selectedAthlete.evaluations.length === 0 ? (
                  <p className="text-xs text-neutral-500">L’athlète n’a pas encore complété son évaluation initiale.</p>
                ) : (
                  <div className="space-y-4">
                    {selectedAthlete.evaluations.map((ev) => (
                      <div key={ev.id} className="rounded-xl border border-neutral-200 p-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold">
                            {ev.type} · {ev.date}
                          </span>
                          <span className="font-mono font-bold tabular-nums">{ev.score_global}/100</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {ev.results.map((r) => (
                            <div key={r.test_code} className="rounded-lg bg-neutral-50 p-2.5">
                              <div className="font-medium text-neutral-800">{r.test_nom}</div>
                              <div className="font-mono text-neutral-600 mt-0.5">
                                {r.valeur} {r.unite} · {r.niveau_obtenu}
                              </div>
                            </div>
                          ))}
                        </div>

                        {ev.comments.map((c) => (
                          <div key={c.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-700">
                            <span className="font-semibold text-neutral-900">{c.coach_nom} : </span>
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
                            className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(ev.id)}
                            className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
                          >
                            Commenter
                          </button>
                        </div>
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
                  <h1 className="font-display text-2xl font-bold text-neutral-900">Mes athlètes affectés</h1>
                  <p className="text-sm text-neutral-600">
                    Cliquez sur un athlète pour consulter sa fiche (consultation tracée au journal d’accès).
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un athlète..."
                    className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm min-h-[42px]"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Athlète</th>
                      <th className="px-4 py-3 font-medium">Sport & Niveau</th>
                      <th className="px-4 py-3 font-medium text-right">Séances semaine</th>
                      <th className="px-4 py-3 font-medium text-right">Dernière éval.</th>
                      <th className="px-4 py-3 font-medium">Alertes</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredAthletes.map((a) => (
                      <tr key={a.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3.5 font-medium text-neutral-900">
                          {a.prenom} {a.nom}
                          {a.is_minor && (
                            <span className="ml-2 text-xs text-neutral-500">(Mineur)</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-neutral-600">
                          {SPORTS_CONFIG[a.sport_code].nom} · {LEVEL_LABELS[a.niveau]}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs">
                          {a.weeklyCompleted}/{a.weeklyTarget}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs">
                          {a.lastEvaluationScore !== null ? `${a.lastEvaluationScore}/100` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {a.hasPainAlert ? (
                            <span className="font-semibold text-red-700">Douleur active</span>
                          ) : a.openAlertsCount > 0 ? (
                            <span className="text-amber-700 font-medium">{a.openAlertsCount} ouverte(s)</span>
                          ) : (
                            <span className="text-neutral-400">Aucune</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openAthleteDossier(a.id)}
                            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 min-h-[36px]"
                          >
                            Ouvrir fiche
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAthletes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-500">
                          Aucun athlète affecté correspondant à votre recherche.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------- ALERTS QUEUE ---------------- */}
          {tab === 'alertes' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-neutral-900">Traitement des alertes</h1>
                <p className="text-sm text-neutral-600">
                  En cas de douleur signalée, adaptez ou mettez en pause le programme et orientez vers un professionnel de santé.
                </p>
              </div>

              <div className="space-y-4">
                {overview?.alerts.map((al) => (
                  <div key={al.id} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {al.type === 'DOULEUR' ? (
                          <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" />
                        ) : (
                          <ClipboardList className="h-4 w-4 text-neutral-700" aria-hidden="true" />
                        )}
                        <span className="text-sm font-semibold text-neutral-900">
                          {al.athlete_nom} · {al.type}
                          {al.zone_douleur ? ` (${al.zone_douleur}, ${al.intensite}/10)` : ''}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-neutral-500">
                        {al.traitee ? 'Traitée' : 'À traiter'} · {al.date.slice(0, 10)}
                      </span>
                    </div>

                    <p className="text-sm text-neutral-700">{al.message}</p>

                    {al.traitee ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
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
                          className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs min-h-[40px]"
                        />
                        <button
                          type="button"
                          onClick={() => openAthleteDossier(al.athlete_user_id).then(() => setTab('athletes'))}
                          className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-medium hover:bg-neutral-50 min-h-[40px]"
                        >
                          Voir fiche
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveAlert(al.id)}
                          className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[40px]"
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
                <h1 className="font-display text-2xl font-bold text-neutral-900">Proposer une séance</h1>
                <p className="text-sm text-neutral-600">
                  Toute nouvelle séance est envoyée en relecture à l’administrateur avant d’être visible aux athlètes.
                </p>
              </div>

              <form onSubmit={handleProposeSession} className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Sport</label>
                    <select
                      value={propSport}
                      onChange={(e) => setPropSport(e.target.value as SportCode)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="football">Football</option>
                      <option value="basket">Basket</option>
                      <option value="handball">Handball</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Niveau</label>
                    <select
                      value={propNiveau}
                      onChange={(e) => setPropNiveau(e.target.value as AthleteLevel)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="debutant">Débutant</option>
                      <option value="intermediaire">Intermédiaire</option>
                      <option value="avance">Avancé</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Durée (min)</label>
                    <input
                      type="number"
                      min={10}
                      max={60}
                      value={propDuree}
                      onChange={(e) => setPropDuree(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Titre de la séance *</label>
                  <input
                    type="text"
                    required
                    value={propTitre}
                    onChange={(e) => setPropTitre(e.target.value)}
                    placeholder="Ex: Renforcement chevilles et appuis courts"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Objectif principal *</label>
                    <input
                      type="text"
                      required
                      value={propObjectif}
                      onChange={(e) => setPropObjectif(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Prévention ciblée</label>
                    <input
                      type="text"
                      value={propPrevention}
                      onChange={(e) => setPropPrevention(e.target.value)}
                      placeholder="Chevilles, genoux..."
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Consigne principale (Français) *</label>
                  <textarea
                    rows={2}
                    required
                    value={propConsigneFr}
                    onChange={(e) => setPropConsigneFr(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Consigne adaptée (Wolof)</label>
                  <textarea
                    rows={2}
                    value={propConsigneWo}
                    onChange={(e) => setPropConsigneWo(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                >
                  Soumettre pour relecture
                </button>
              </form>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile coach"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-3 h-16">
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
                className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium px-1 ${
                  active ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-2.5 font-mono text-[9px] font-bold tabular-nums rounded bg-red-700 text-white px-1 leading-tight">
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
