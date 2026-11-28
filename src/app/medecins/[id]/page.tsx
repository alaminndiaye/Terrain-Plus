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
        <p className="text-sm text-slate-500">Chargement de la fiche médecin...</p>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6">
          <Link href="/medecins" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0a2e1c] hover:underline">
            <ArrowLeft className="w-4 h-4" /> Retour aux médecins
          </Link>

          <section className="surface-card rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-[#0d3320]">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-[#f4f5f0] border border-[#dcdfd6] text-[#0d3320] px-2.5 py-0.5 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5" /> Médecin vérifié
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#112118]">{doctor.publicName}</h1>
              <p className="text-[#526057] text-sm">
                {doctor.specialtyName} · {doctor.facilityName} ({doctor.city})
              </p>
              <p className="text-xs text-[#526057]">Langues : {doctor.languages.join(', ')}</p>
            </div>
            <div className="bg-[#f4f5f0] border border-[#0d3320] rounded-lg px-5 py-3.5 text-center shrink-0">
              <span className="text-xs text-[#526057] block">Consultation unique TTC</span>
              <strong className="text-2xl font-extrabold text-[#0d3320] tabular-nums">
                {formatFcfa(doctor.consultationFeeFcfa)}
              </strong>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <section className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                <h2 className="font-bold text-lg">Présentation</h2>
                <p className="text-sm text-slate-700 leading-relaxed">{doctor.bio || 'Médecin du sport vérifié.'}</p>
                {doctor.contactUnlocked && doctor.unlockedContact ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-950">
                    <strong>Coordonnées débloquées :</strong> {doctor.unlockedContact.phone} ·{' '}
                    {doctor.unlockedContact.facilityAddress}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Les coordonnées directes sont révélées uniquement après paiement des 10 000 FCFA.
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg">Avis après consultation ({doctor.reviewsCount})</h2>
                  {doctor.averageRating && (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                      <Star className="w-4 h-4 fill-amber-400" /> {doctor.averageRating}/5
                    </span>
                  )}
                </div>
                {doctor.reviews.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun avis publié pour le moment.</p>
                ) : (
                  <div className="space-y-3">
                    {doctor.reviews.map((r) => (
                      <div key={r.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-amber-600">{'★'.repeat(r.rating)} {r.rating}/5</span>
                          <span className="text-slate-400">{formatDateTimeFr(r.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-700">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-fit space-y-4">
              <h2 className="font-bold text-lg">Consulter ce médecin</h2>
              <p className="text-xs text-slate-600">
                Payez <strong>10 000 FCFA</strong> pour ouvrir la messagerie privée, partager vos images/vidéos et fixer
                un RDV (Visio ou Cabinet) pour 1 consultation complète.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs">{error}</div>
              )}

              {!sessionUser ? (
                <div className="space-y-2">
                  <Link
                    href="/auth?tab=register"
                    className="block w-full py-3 rounded-xl bg-[#0a2e1c] text-white text-center text-sm font-bold"
                  >
                    Créer un compte sportif pour consulter
                  </Link>
                  <Link
                    href="/auth?tab=login"
                    className="block w-full py-2.5 rounded-xl border border-slate-300 text-center text-sm font-semibold"
                  >
                    Se connecter
                  </Link>
                </div>
              ) : sessionUser.role !== 'athlete' ? (
                <p className="text-xs text-slate-500">Connecté avec un compte {sessionUser.role}.</p>
              ) : (
                <form onSubmit={handleStartConsultation} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Format souhaité</label>
                    <div className="grid grid-cols-2 gap-2">
                      {doctor.supportsVideo && (
                        <button
                          type="button"
                          onClick={() => setMode('video')}
                          className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                            mode === 'video'
                              ? 'border-[#0a2e1c] bg-emerald-50 text-[#0a2e1c]'
                              : 'border-slate-200'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5" /> Visio / Chat
                        </button>
                      )}
                      {doctor.supportsPhysical && (
                        <button
                          type="button"
                          onClick={() => setMode('physical')}
                          className={`p-2 rounded-xl border text-xs font-bold ${
                            mode === 'physical'
                              ? 'border-[#0a2e1c] bg-emerald-50 text-[#0a2e1c]'
                              : 'border-slate-200'
                          }`}
                        >
                          Cabinet
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Motif de votre demande *</label>
                    <textarea
                      required
                      minLength={10}
                      rows={4}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex. Bilan médical de reprise, douleur au genou après match..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareTrends}
                      onChange={(e) => setShareTrends(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Autoriser ce médecin à voir mes tendances d’entraînement (Suivi &amp; Prévention).</span>
                  </label>

                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>J’accepte le traitement de mes données de santé pour cette consultation.</span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-[#0a2e1c] text-white font-bold text-sm hover:bg-[#13472d] disabled:opacity-50"
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
