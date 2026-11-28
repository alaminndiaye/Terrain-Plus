'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, AlertTriangle, BookOpen, CheckCircle2, ClipboardList, Lock } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateFr } from '@/lib/apiClient';
import { BODY_PART_OPTIONS, SUPPORTED_SPORTS } from '@/lib/config';
import type { PreventionArticle, PreventionSignal, TrainingLog } from '@/lib/types';

interface FollowupPayload {
  medicalRecord: {
    lastUpdatedByDoctorName: string | null;
    clinicalSummary: string;
    contraindications: string;
    fitnessGuidance: string;
    nextFollowupAt: string | null;
    updatedAt: string;
  } | null;
  entries: Array<{
    id: string;
    doctorName: string;
    summary: string;
    recommendations: string;
    fitnessStatus: string;
    createdAt: string;
  }>;
  returnToSportPlans: Array<{
    id: string;
    title: string;
    status: string;
    doctorName: string;
    clearedAt: string | null;
    disclaimer: string;
    steps: Array<{
      id: string;
      stepOrder: number;
      label: string;
      criteria: string;
      athleteDoneAt: string | null;
      doctorValidatedAt: string | null;
    }>;
  }>;
}

export default function AthleteSuiviPreventionPage() {
  const [activeTab, setActiveTab] = useState<'journal' | 'trends' | 'reprise' | 'dossier' | 'library'>('journal');
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [signals, setSignals] = useState<PreventionSignal[]>([]);
  const [followup, setFollowup] = useState<FollowupPayload | null>(null);
  const [articles, setArticles] = useState<PreventionArticle[]>([]);

  // Form states
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sport, setSport] = useState('basketball');
  const [sessionType, setSessionType] = useState<'training' | 'match' | 'conditioning' | 'recovery' | 'other'>('training');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [rpeIntensity, setRpeIntensity] = useState(6);
  const [fatigueScore, setFatigueScore] = useState(3);
  const [sleepScore, setSleepScore] = useState(4);
  const [recoveryScore, setRecoveryScore] = useState(4);
  const [hasDiscomfort, setHasDiscomfort] = useState(false);
  const [discomfortLevel, setDiscomfortLevel] = useState(3);
  const [bodyPart, setBodyPart] = useState('cheville_pied');
  const [minutesPlayed, setMinutesPlayed] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadAll() {
    const [logsRes, folRes, artRes] = await Promise.all([
      apiFetch<{ logs: TrainingLog[]; signals: PreventionSignal[] }>('/api/athlete/training-logs'),
      apiFetch<FollowupPayload>('/api/athlete/followup'),
      apiFetch<{ articles: PreventionArticle[] }>('/api/public/prevention'),
    ]);
    setLogs(logsRes.logs || []);
    setSignals(logsRes.signals || []);
    setFollowup(folRes);
    setArticles(artRes.articles || []);
  }

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  async function handleAddLog(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const perfStats: Record<string, string | number> = {};
      if (minutesPlayed) perfStats['Minutes jouées'] = Number(minutesPlayed);
      const res = await apiFetch<{ log: TrainingLog; signals: PreventionSignal[] }>('/api/athlete/training-logs', {
        method: 'POST',
        body: {
          sessionDate,
          sport,
          sessionType,
          durationMinutes: Number(durationMinutes),
          rpeIntensity: Number(rpeIntensity),
          fatigueScore: Number(fatigueScore),
          sleepScore: Number(sleepScore),
          recoveryScore: Number(recoveryScore),
          hasDiscomfort,
          discomfortLevel: hasDiscomfort ? Number(discomfortLevel) : 0,
          bodyPart: hasDiscomfort ? bodyPart : null,
          performanceStats: perfStats,
          notes,
        },
      });
      setLogs((prev) => [res.log, ...prev]);
      setSignals(res.signals || []);
      setNotes('');
      setMsg('Séance enregistrée dans votre journal privé.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStep(stepId: string, done: boolean) {
    await apiFetch('/api/athlete/return-to-sport', {
      method: 'POST',
      body: { stepId, done },
    });
    const folRes = await apiFetch<FollowupPayload>('/api/athlete/followup');
    setFollowup(folRes);
  }

  const chartData = [...logs]
    .slice(0, 14)
    .reverse()
    .map((l) => ({
      date: l.session_date.slice(5),
      charge: Math.round((l.duration_minutes * l.rpe_intensity) / 10),
      fatigue: l.fatigue_score * 20,
      recuperation: l.recovery_score * 20,
    }));

  return (
    <AppShell requireAuthRole="athlete">
      <div className="space-y-6">
        <section className="obsidian-card rounded-2xl p-6 border-l-4 border-l-[#0D6E46]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#ECF7F1] border border-[#C3D6CA] px-2.5 py-0.5 rounded-full text-[#0D6E46]">
                <Lock className="w-3.5 h-3.5" /> Données strictement privées (vous choisissez quoi partager)
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] mt-2">Suivi &amp; prévention</h1>
              <p className="text-sm text-[#475E52] mt-1">
                Journal d’entraînement, signaux de vigilance non diagnostiques, reprise après blessure et dossier médical.
              </p>
            </div>
            <Link
              href="/medecins"
              className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm font-mono tabular-nums transition"
            >
              Demander un avis médical (10 000 FCFA)
            </Link>
          </div>

          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#E2EBE5]">
            {[
              ['journal', 'Journal d’entraînement'],
              ['trends', `Tendances & signaux (${signals.length})`],
              ['reprise', 'Retour après blessure'],
              ['dossier', 'Mon dossier médical'],
              ['library', 'Bibliothèque prévention'],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveTab(k as typeof activeTab)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                  activeTab === k
                    ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                    : 'bg-[#F1F6F3] text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </section>

        {/* Signaux de vigilance toujours mis en avant s'il y en a */}
        {signals.length > 0 && (
          <section className="space-y-3">
            {signals.map((sig) => (
              <div
                key={sig.id}
                className={`rounded-2xl p-4 border ${
                  sig.severity === 'attention' ? 'bg-amber-50 border-amber-300' : 'bg-sky-50 border-sky-200'
                } space-y-2`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    {sig.title}
                  </div>
                </div>
                <p className="text-sm text-[#063725]">{sig.message}</p>
                <p className="text-[11px] text-[#5B7064] italic">{sig.disclaimer}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('library')}
                    className="px-3.5 py-1.5 rounded-full bg-white border border-[#D5E2DA] text-[#063725] hover:bg-[#F1F6F3] text-xs font-semibold transition"
                  >
                    Lire les conseils de prévention
                  </button>
                  <Link
                    href="/medecins"
                    className="px-3.5 py-1.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-xs font-semibold transition"
                  >
                    Demander un avis à un médecin / kiné
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'journal' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <form
              onSubmit={handleAddLog}
              className="lg:col-span-2 obsidian-card rounded-2xl p-5 space-y-3.5 h-fit"
            >
              <h2 className="font-display font-bold text-lg text-[#063725] flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#0D6E46]" />
                Saisir une séance / un match
              </h2>
              {msg && (
                <div className="bg-[#ECF7F1] border border-[#C3D6CA] text-[#063725] rounded-xl p-2.5 text-xs font-medium">
                  {msg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Date</label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Sport</label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    {SUPPORTED_SPORTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Type de séance</label>
                  <select
                    value={sessionType}
                    onChange={(e) => setSessionType(e.target.value as typeof sessionType)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    <option value="training">Entraînement</option>
                    <option value="match">Match</option>
                    <option value="conditioning">Prépa physique</option>
                    <option value="recovery">Récupération</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Durée (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#063725] mb-1">
                  Intensité ressentie (RPE 1 à 10) : <strong className="font-mono tabular-nums text-[#0D6E46]">{rpeIntensity}/10</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={rpeIntensity}
                  onChange={(e) => setRpeIntensity(Number(e.target.value))}
                  className="w-full accent-[#0D6E46]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#063725] mb-1">Fatigue (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={fatigueScore}
                    onChange={(e) => setFatigueScore(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#D5E2DA] px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#063725] mb-1">Sommeil (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={sleepScore}
                    onChange={(e) => setSleepScore(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#D5E2DA] px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#063725] mb-1">Récup. (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={recoveryScore}
                    onChange={(e) => setRecoveryScore(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#D5E2DA] px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDiscomfort}
                  onChange={(e) => setHasDiscomfort(e.target.checked)}
                />
                Signaler une douleur ou gêne pendant/après la séance
              </label>

              {hasDiscomfort && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Localisation</label>
                    <select
                      value={bodyPart}
                      onChange={(e) => setBodyPart(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-2.5 py-1.5 text-sm bg-white"
                    >
                      {BODY_PART_OPTIONS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Gêne (1-10) : {discomfortLevel}/10</label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={discomfortLevel}
                      onChange={(e) => setDiscomfortLevel(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Statistiques libres (ex. minutes jouées)</label>
                <input
                  type="number"
                  placeholder="Ex. 28"
                  value={minutesPlayed}
                  onChange={(e) => setMinutesPlayed(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Notes personnelles</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sensations, exercice réalisé..."
                  className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer la séance'}
              </button>
            </form>

            <div className="lg:col-span-3 space-y-3">
              <h2 className="font-display font-bold text-lg text-[#063725]">Historique des séances ({logs.length})</h2>
              {logs.length === 0 ? (
                <div className="obsidian-card rounded-2xl p-6 text-sm text-[#5B7064]">
                  Aucune séance enregistrée. Saisissez votre premier entraînement pour suivre vos tendances.
                </div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="obsidian-card rounded-2xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-[#063725]">
                        {formatDateFr(l.session_date)} · {l.sport} ({l.session_type})
                      </strong>
                      <span className="text-xs font-semibold bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] px-2.5 py-0.5 rounded-full font-mono tabular-nums">
                        {l.duration_minutes} min · RPE {l.rpe_intensity}/10
                      </span>
                    </div>
                    <p className="text-xs text-[#475E52]">
                      Fatigue {l.fatigue_score}/5 · Sommeil {l.sleep_score}/5 · Récupération {l.recovery_score}/5
                    </p>
                    {l.has_discomfort && (
                      <p className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg inline-block">
                        Gêne signalée : {l.body_part?.replace(/_/g, ' ')} ({l.discomfort_level}/10)
                      </p>
                    )}
                    {l.notes && <p className="text-xs text-[#5B7064]">{l.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <section className="obsidian-card rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-bold text-lg flex items-center gap-2 text-[#063725]">
              <Activity className="w-5 h-5 text-[#0D6E46]" />
              Évolution de la charge, fatigue et récupération
            </h2>
            {chartData.length < 2 ? (
              <p className="text-sm text-[#5B7064]">
                Ajoutez au moins 2 séances dans le journal pour afficher vos courbes de tendance.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="charge"
                      name="Charge (RPE×min/10)"
                      stroke="#0D6E46"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigue"
                      name="Fatigue (%)"
                      stroke="#b45309"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="recuperation"
                      name="Récupération (%)"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-xs text-[#5B7064]">
              Rappel : ces tendances sont indicatives et restent strictement privées tant que vous ne les partagez pas
              explicitement lors d’une consultation médicale.
            </p>
          </section>
        )}

        {activeTab === 'reprise' && (
          <section className="space-y-4">
            <h2 className="font-display font-bold text-lg text-[#063725]">Parcours de retour après blessure</h2>
            {!followup?.returnToSportPlans?.length ? (
              <div className="obsidian-card rounded-2xl p-6 text-sm text-[#475E52]">
                Aucun plan de retour après blessure actif. Lors d’une consultation, votre médecin ou kinésithérapeute
                peut créer vos étapes progressives ici.
              </div>
            ) : (
              followup.returnToSportPlans.map((plan) => (
                <div key={plan.id} className="obsidian-card rounded-2xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-base text-[#063725]">{plan.title}</h3>
                      <p className="text-xs text-[#5B7064]">Prescrit et supervisé par {plan.doctorName}</p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        plan.status === 'medical_clearance_granted'
                          ? 'bg-[#ECF7F1] text-[#0D6E46] border border-[#C3D6CA]'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {plan.status === 'medical_clearance_granted'
                        ? 'Reprise validée par le médecin'
                        : 'Progression en cours'}
                    </span>
                  </div>
                  <p className="text-xs text-[#475E52] obsidian-inset p-2.5 rounded-xl">{plan.disclaimer}</p>
                  <div className="space-y-2">
                    {plan.steps.map((s) => (
                      <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-xl obsidian-inset">
                        <div>
                          <p className="text-sm font-semibold text-[#063725]">
                            Étape {s.stepOrder} · {s.label}
                          </p>
                          {s.criteria && <p className="text-xs text-[#475E52]">{s.criteria}</p>}
                          <div className="flex gap-3 mt-1 text-[11px]">
                            <span className={s.athleteDoneAt ? 'text-[#0D6E46] font-semibold' : 'text-[#5B7064]'}>
                              {s.athleteDoneAt ? '✓ Effectuée par vous' : 'Non cochée'}
                            </span>
                            <span className={s.doctorValidatedAt ? 'text-[#063725] font-bold' : 'text-[#B45309]'}>
                              {s.doctorValidatedAt ? '✓ Validée par le médecin' : 'En attente validation praticien'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleStep(s.id, !s.athleteDoneAt)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                            s.athleteDoneAt
                              ? 'bg-[#ECF7F1] text-[#0D6E46] border border-[#C3D6CA]'
                              : 'bg-white border border-[#D5E2DA] text-[#063725] hover:bg-[#F1F6F3]'
                          }`}
                        >
                          {s.athleteDoneAt ? 'Validé' : 'Marquer fait'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === 'dossier' && (
          <section className="space-y-4">
            <h2 className="font-display font-bold text-lg text-[#063725]">Dossier médical sportif longitudinal</h2>
            {followup?.medicalRecord ? (
              <div className="obsidian-card rounded-2xl p-5 space-y-2">
                <p className="text-xs text-[#5B7064]">
                  Dernière mise à jour par {followup.medicalRecord.lastUpdatedByDoctorName} ·{' '}
                  {formatDateFr(followup.medicalRecord.updatedAt)}
                </p>
                <p className="text-sm text-[#063725]">
                  <strong>Synthèse clinique :</strong> {followup.medicalRecord.clinicalSummary}
                </p>
                {followup.medicalRecord.contraindications && (
                  <p className="text-sm text-amber-900">
                    <strong>Vigilances / restrictions :</strong> {followup.medicalRecord.contraindications}
                  </p>
                )}
                {followup.medicalRecord.fitnessGuidance && (
                  <p className="text-sm text-[#063725]">
                    <strong>Orientation pratique :</strong> {followup.medicalRecord.fitnessGuidance}
                  </p>
                )}
              </div>
            ) : (
              <div className="obsidian-card rounded-2xl p-5 text-sm text-[#5B7064]">
                Votre dossier médical longitudinal sera enrichi par les médecins à la clôture de chaque consultation.
              </div>
            )}

            <div className="space-y-3">
              {followup?.entries?.map((entry) => (
                <div key={entry.id} className="obsidian-card rounded-2xl p-4 space-y-1">
                  <div className="flex justify-between text-xs text-[#5B7064]">
                    <span className="font-bold text-[#063725]">{entry.doctorName}</span>
                    <span>{formatDateFr(entry.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#063725]">
                    <strong>Compte-rendu :</strong> {entry.summary}
                  </p>
                  <p className="text-sm text-[#475E52]">
                    <strong>Recommandations :</strong> {entry.recommendations}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'library' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles.map((art) => (
              <article key={art.id} className="obsidian-card rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0D6E46]">
                  <BookOpen className="w-4 h-4" />
                  <span>{art.category}</span>
                </div>
                <h3 className="font-display font-bold text-base text-[#063725]">{art.title}</h3>
                <p className="text-xs font-medium text-[#063725]">{art.summary}</p>
                <p className="text-xs text-[#475E52] leading-relaxed">{art.content}</p>
                <p className="text-[11px] text-[#5B7064] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0D6E46]" /> {art.reviewer_name}
                </p>
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
