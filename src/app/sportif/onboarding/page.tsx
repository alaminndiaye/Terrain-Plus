'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/apiClient';
import { SUPPORTED_SPORTS } from '@/lib/config';
import type { MedicalGoal } from '@/lib/types';

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sports, setSports] = useState<string[]>(['football']);
  const [primarySport, setPrimarySport] = useState('football');
  const [practiceLevel, setPracticeLevel] = useState<'loisir' | 'scolaire_universitaire' | 'club' | 'competition'>('club');
  const [weeklyFrequency, setWeeklyFrequency] = useState('3 séances / semaine');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [dominantSide, setDominantSide] = useState('droite');
  const [priorInjuries, setPriorInjuries] = useState('');
  const [allergiesConditions, setAllergiesConditions] = useState('');
  const [medicalGoal, setMedicalGoal] = useState<MedicalGoal>('regular_followup');
  const [followupFrequency, setFollowupFrequency] = useState<'monthly' | 'quarterly' | 'as_needed'>('monthly');
  const [healthConsent, setHealthConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSport(code: string) {
    setSports((prev) => {
      const next = prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code];
      if (next.length > 0 && !next.includes(primarySport)) {
        setPrimarySport(next[0]);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/athlete/onboarding', {
        method: 'POST',
        body: {
          sports,
          primarySport,
          practiceLevel,
          weeklyFrequency,
          heightCm: heightCm ? Number(heightCm) : null,
          weightKg: weightKg ? Number(weightKg) : null,
          dominantSide,
          priorInjuries,
          allergiesConditions,
          medicalGoal,
          followupFrequency,
          healthDataConsentAccepted: healthConsent,
        },
      });
      router.push('/sportif');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de valider votre onboarding.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell requireAuthRole="athlete">
      <div className="max-w-2xl mx-auto">
        <div className="obsidian-card rounded-2xl border-t-4 border-t-[#0D6E46] overflow-hidden">
          <div className="p-6 border-b border-[#E2EBE5] bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] px-3 py-1 rounded-full tabular-nums">
                Première connexion · Étape {step} / 4
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#063725] mt-3">Configurons votre profil sportif</h1>
            <p className="text-sm text-[#475E52] mt-1">
              Ces réponses préparent votre dossier médical privé et votre espace Suivi &amp; Prévention.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-sm">{error}</div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="font-bold text-lg">1. Quel(s) sport(s) pratiquez-vous ?</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SUPPORTED_SPORTS.map((sp) => {
                    const active = sports.includes(sp.code);
                    return (
                      <button
                        key={sp.code}
                        type="button"
                        onClick={() => toggleSport(sp.code)}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition ${
                          active
                            ? 'border-[#0D6E46] bg-[#ECF7F1] text-[#0D6E46]'
                            : 'border-[#D5E2DA] bg-white text-[#475E52] hover:bg-[#F1F6F3]'
                        }`}
                      >
                        {sp.label}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Sport principal</label>
                  <select
                    value={primarySport}
                    onChange={(e) => setPrimarySport(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    {SUPPORTED_SPORTS.filter((s) => sports.includes(s.code)).map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display font-bold text-lg text-[#063725]">2. Niveau et rythme d’entraînement</h2>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Niveau de pratique</label>
                  <select
                    value={practiceLevel}
                    onChange={(e) => setPracticeLevel(e.target.value as typeof practiceLevel)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    <option value="loisir">Loisir / Remise en forme</option>
                    <option value="scolaire_universitaire">Universitaire / Campus</option>
                    <option value="club">Club / Amateur structuré</option>
                    <option value="competition">Compétition / Haut niveau</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Fréquence hebdomadaire *</label>
                  <input
                    required
                    value={weeklyFrequency}
                    onChange={(e) => setWeeklyFrequency(e.target.value)}
                    placeholder="Ex. 3 entraînements + 1 match par semaine"
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Taille (cm)</label>
                    <input
                      type="number"
                      min={120}
                      max={240}
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Poids (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={35}
                      max={200}
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Côté dominant</label>
                    <select
                      value={dominantSide}
                      onChange={(e) => setDominantSide(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                    >
                      <option value="droite">Droit</option>
                      <option value="gauche">Gauche</option>
                      <option value="ambidextre">Ambidextre</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="font-display font-bold text-lg text-[#063725]">3. Repères médicaux &amp; antécédents</h2>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Blessures ou douleurs antérieures (facultatif)</label>
                  <textarea
                    rows={3}
                    value={priorInjuries}
                    onChange={(e) => setPriorInjuries(e.target.value)}
                    placeholder="Ex. Entorse cheville droite il y a 6 mois, tendinite genou..."
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Allergies ou traitements en cours (facultatif)</label>
                  <textarea
                    rows={2}
                    value={allergiesConditions}
                    onChange={(e) => setAllergiesConditions(e.target.value)}
                    placeholder="Ex. Asthme d’effort, allergie..."
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="font-display font-bold text-lg text-[#063725]">4. Objectif de suivi &amp; consentement</h2>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Objectif principal sur Terrain+</label>
                  <select
                    value={medicalGoal}
                    onChange={(e) => setMedicalGoal(e.target.value as MedicalGoal)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    <option value="regular_followup">Suivi médical sportif régulier</option>
                    <option value="injury_advice">Avis sur une douleur ou blessure actuelle</option>
                    <option value="prevention">Prévention et gestion de la charge</option>
                    <option value="return_to_sport">Accompagnement de reprise après blessure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Rythme de bilan souhaité</label>
                  <select
                    value={followupFrequency}
                    onChange={(e) => setFollowupFrequency(e.target.value as typeof followupFrequency)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    <option value="monthly">Mensuel</option>
                    <option value="quarterly">Trimestriel</option>
                    <option value="as_needed">Ponctuel selon le besoin</option>
                  </select>
                </div>
                <label className="flex items-start gap-2.5 bg-[#ECF7F1] border border-[#C3D6CA] rounded-xl p-3.5 text-xs text-[#063725] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={healthConsent}
                    onChange={(e) => setHealthConsent(e.target.checked)}
                    className="mt-0.5 accent-[#0D6E46]"
                  />
                  <span>
                    Je consens distinctement au traitement sécurisé de mes données de santé et sportives par Terrain+ et
                    les médecins vérifiés que je consulterai. Ces données ne sont jamais partagées automatiquement aux
                    clubs ni aux entraîneurs.
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#E2EBE5]">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2.5 rounded-full border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-sm font-semibold transition"
                >
                  ← Retour
                </button>
              ) : (
                <span />
              )}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && sports.length === 0) {
                      setError('Sélectionnez au moins un sport.');
                      return;
                    }
                    setError(null);
                    setStep((s) => s + 1);
                  }}
                  className="px-6 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition"
                >
                  Continuer →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {saving ? 'Enregistrement...' : 'Entrer sur la plateforme →'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
