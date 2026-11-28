'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Lock, ShieldCheck, Star, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr, formatFcfa } from '@/lib/apiClient';

interface DoctorDetail {
  id: string;
  publicName: string;
  specialtyName: string;
  city: string;
  facilityName: string;
  languages: string[];
  bio: string;
  supportsVideo: boolean;
  supportsPhysical: boolean;
  consultationFeeFcfa: number;
  reviewsCount: number;
  averageRating: number | null;
  reviews: Array<{ id: string; rating: number; comment: string; created_at: string }>;
  contactUnlocked: boolean;
  unlockedContact: { phone: string; facilityAddress: string } | null;
}

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [sessionUser, setSessionUser] = useState<{ role: string; onboardingCompleted: boolean } | null>(null);
  const [mode, setMode] = useState<'video' | 'physical' | 'chat'>('video');
  const [reason, setReason] = useState('');
  const [shareTrends, setShareTrends] = useState(true);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ doctor: DoctorDetail }>(`/api/public/doctors/${id}`),
      apiFetch<{ authenticated: boolean; user: { role: string; onboardingCompleted: boolean } | null }>(
        '/api/auth/session'
      ),
    ])
      .then(([docRes, sessRes]) => {
        setDoctor(docRes.doctor);
        setSessionUser(sessRes.user);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Médecin introuvable.'));
  }, [id]);

  async function handleStartConsultation(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionUser) {
      router.push('/auth?tab=login');
      return;
    }
    if (sessionUser.role === 'athlete' && !sessionUser.onboardingCompleted) {
      router.push('/sportif/onboarding');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch<{ case: { id: string } }>('/api/athlete/cases', {
        method: 'POST',
        body: {
          doctorId: id,
          mode,
          initialReason: reason,
          shareTrainingTrends: shareTrends,
          healthDataConsentAccepted: consent,
        },
      });
      router.push(`/sportif/paiement/${created.case.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ouvrir la consultation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      {error && !doctor ? (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-6">{error}</div>
      ) : !doctor ? (
        <div className="obsidian-card rounded-2xl p-8 text-center text-sm text-[#475E52]">
          Chargement de la fiche médecin...
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6">
          <Link href="/medecins" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0D6E46] hover:text-[#063725]">
            <ArrowLeft className="w-4 h-4" /> Retour aux médecins
          </Link>

          <section className="obsidian-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-[#0D6E46]">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] px-2.5 py-0.5 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Médecin vérifié
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#063725]">{doctor.publicName}</h1>
              <p className="text-[#475E52] text-sm">
                {doctor.specialtyName} · {doctor.facilityName} ({doctor.city})
              </p>
              <p className="text-xs text-[#5B7064]">Langues : {doctor.languages.join(', ')}</p>
            </div>
            <div className="bg-[#ECF7F1] border border-[#0D6E46] rounded-2xl px-5 py-3.5 text-center shrink-0">
              <span className="text-xs text-[#475E52] block">Consultation unique TTC</span>
              <strong className="font-display text-2xl font-extrabold text-[#063725] font-mono tabular-nums">
                {formatFcfa(doctor.consultationFeeFcfa)}
              </strong>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <section className="obsidian-card rounded-2xl p-5 space-y-3">
                <h2 className="font-display font-bold text-lg text-[#063725]">Présentation</h2>
                <p className="text-sm text-[#475E52] leading-relaxed">{doctor.bio || 'Médecin du sport vérifié.'}</p>
                {doctor.contactUnlocked && doctor.unlockedContact ? (
                  <div className="bg-[#ECF7F1] border border-[#C3D6CA] rounded-xl p-3 text-sm text-[#063725]">
                    <strong>Coordonnées débloquées :</strong> {doctor.unlockedContact.phone} ·{' '}
                    {doctor.unlockedContact.facilityAddress}
                  </div>
                ) : (
                  <div className="obsidian-inset rounded-xl p-3 text-xs text-[#475E52] flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0 text-[#0D6E46]" />
                    Les coordonnées directes sont révélées uniquement après paiement des 10 000 FCFA.
                  </div>
                )}
              </section>

              <section className="obsidian-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-lg text-[#063725]">Avis après consultation ({doctor.reviewsCount})</h2>
                  {doctor.averageRating && (
                    <span className="inline-flex items-center gap-1 font-bold text-[#B45309] tabular-nums">
                      <Star className="w-4 h-4 fill-[#FBBF24] text-[#D97706]" /> {doctor.averageRating}/5
                    </span>
                  )}
                </div>
                {doctor.reviews.length === 0 ? (
                  <p className="text-sm text-[#5B7064]">Aucun avis publié pour le moment.</p>
                ) : (
                  <div className="space-y-3">
                    {doctor.reviews.map((r) => (
                      <div key={r.id} className="obsidian-inset rounded-xl p-3.5">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-[#B45309]">{'★'.repeat(r.rating)} {r.rating}/5</span>
                          <span className="text-[#5B7064]">{formatDateTimeFr(r.created_at)}</span>
                        </div>
                        <p className="text-sm text-[#063725]">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="obsidian-card rounded-2xl p-5 h-fit space-y-4">
              <h2 className="font-display font-bold text-lg text-[#063725]">Consulter ce médecin</h2>
              <p className="text-xs text-[#475E52]">
                Payez <strong className="text-[#063725] font-mono tabular-nums">10 000 FCFA</strong> pour ouvrir la messagerie privée, partager vos images/vidéos et fixer
                un RDV (Visio ou Cabinet) pour 1 consultation complète.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs">{error}</div>
              )}

              {!sessionUser ? (
                <div className="space-y-2">
                  <Link
                    href="/auth?tab=register"
                    className="block w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-center text-sm font-semibold transition"
                  >
                    Créer un compte sportif pour consulter
                  </Link>
                  <Link
                    href="/auth?tab=login"
                    className="block w-full py-2.5 rounded-full border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-center text-sm font-semibold transition"
                  >
                    Se connecter
                  </Link>
                </div>
              ) : sessionUser.role !== 'athlete' ? (
                <p className="text-xs text-[#5B7064]">Connecté avec un compte {sessionUser.role}.</p>
              ) : (
                <form onSubmit={handleStartConsultation} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Format souhaité</label>
                    <div className="grid grid-cols-2 gap-2">
                      {doctor.supportsVideo && (
                        <button
                          type="button"
                          onClick={() => setMode('video')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition ${
                            mode === 'video'
                              ? 'border-[#0D6E46] bg-[#ECF7F1] text-[#0D6E46]'
                              : 'border-[#D5E2DA] bg-white text-[#475E52] hover:border-[#0D6E46]'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5" /> Visio / Chat
                        </button>
                      )}
                      {doctor.supportsPhysical && (
                        <button
                          type="button"
                          onClick={() => setMode('physical')}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                            mode === 'physical'
                              ? 'border-[#0D6E46] bg-[#ECF7F1] text-[#0D6E46]'
                              : 'border-[#D5E2DA] bg-white text-[#475E52] hover:border-[#0D6E46]'
                          }`}
                        >
                          Cabinet
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Motif de votre demande *</label>
                    <textarea
                      required
                      minLength={10}
                      rows={4}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex. Bilan médical de reprise, douleur au genou après match..."
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs text-[#475E52] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareTrends}
                      onChange={(e) => setShareTrends(e.target.checked)}
                      className="mt-0.5 accent-[#0D6E46]"
                    />
                    <span>Autoriser ce médecin à voir mes tendances d’entraînement (Suivi &amp; Prévention).</span>
                  </label>

                  <label className="flex items-start gap-2 text-xs text-[#475E52] cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 accent-[#0D6E46]"
                    />
                    <span>J’accepte le traitement de mes données de santé pour cette consultation.</span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Préparation...' : 'Continuer vers le paiement (10 000 FCFA)'}
                  </button>
                </form>
              )}
            </aside>
          </div>
        </div>
      )}
    </AppShell>
  );
}
