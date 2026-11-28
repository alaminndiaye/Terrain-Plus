'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, Lock, Send, Star, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { MediaUploader } from '@/components/MediaUploader';
import { VideoCallRoom } from '@/components/VideoCallRoom';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface AttachmentItem {
  id: string;
  mediaKind: 'image' | 'video' | 'document';
  originalName: string;
  mimeType: string;
}

interface MessageItem {
  id: string;
  senderId: string;
  senderRole: string;
  messageType: string;
  body: string;
  attachments: AttachmentItem[];
  createdAt: string;
}

interface AppointmentItem {
  id: string;
  appointment_type: 'video' | 'physical';
  proposed_by: string;
  proposal_status: string;
  starts_at: string;
  location_label: string;
}

interface ReferralItem {
  id: string;
  referralType: 'handoff_transfer' | 'post_consult_referral';
  toDoctorName: string;
  toDoctorSpecialty: string;
  reason: string;
  status: string;
}

interface CasePayload {
  case: {
    id: string;
    reference: string;
    status: string;
    initialReason: string;
    shareTrainingTrends: boolean;
    paymentUnlocked: boolean;
    canMessage: boolean;
    canReview: boolean;
    athlete: { id: string; fullName: string };
    doctor: { id: string; publicName: string; specialtyName: string; phone?: string; facilityAddress?: string };
  };
  messages: MessageItem[];
  appointments: AppointmentItem[];
  referrals: ReferralItem[];
  review: { rating: number; comment: string } | null;
}

export default function AthleteCaseDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<CasePayload | null>(null);
  const [msgText, setMsgText] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, { url: string; kind: string }>>({});
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadCase = useCallback(async () => {
    const res = await apiFetch<CasePayload>(`/api/cases/${caseId}`);
    setData(res);
  }, [caseId]);

  useEffect(() => {
    loadCase().catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement.'));

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel(`case-updates-${caseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_messages', filter: `case_id=eq.${caseId}` },
        () => loadCase().catch(() => {})
      )
      .subscribe();

    const poll = setInterval(() => {
      if (!document.hidden) loadCase().catch(() => {});
    }, 6000);

    return () => {
      clearInterval(poll);
      channel?.unsubscribe();
    };
  }, [caseId, loadCase]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    setError(null);
    try {
      const res = await apiFetch<{ message: MessageItem }>(`/api/cases/${caseId}/messages`, {
        method: 'POST',
        body: { body: msgText },
      });
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      setMsgText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer.');
    }
  }

  async function openAttachment(att: AttachmentItem) {
    const res = await apiFetch<{ signedUrl: string; mediaKind: string }>(`/api/cases/${caseId}/attachments/${att.id}`);
    setMediaUrls((prev) => ({ ...prev, [att.id]: { url: res.signedUrl, kind: res.mediaKind } }));
  }

  async function respondAppointment(apptId: string, decision: 'confirmed' | 'declined') {
    await apiFetch(`/api/cases/${caseId}/appointments/${apptId}/respond`, {
      method: 'POST',
      body: { decision },
    });
    await loadCase();
  }

  async function respondReferral(refId: string, decision: 'accepted' | 'refused') {
    const res = await apiFetch<{ status: string; targetCaseId: string | null }>(
      `/api/cases/${caseId}/referrals/${refId}/respond`,
      { method: 'POST', body: { decision } }
    );
    if (res.status === 'accepted' && res.targetCaseId) {
      router.push(`/sportif/dossiers/${res.targetCaseId}`);
      return;
    }
    await loadCase();
  }

  async function toggleTrendsShare() {
    if (!data) return;
    await apiFetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      body: { shareTrainingTrends: !data.case.shareTrainingTrends },
    });
    await loadCase();
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/api/cases/${caseId}/reviews`, {
      method: 'POST',
      body: { rating, comment: reviewComment },
    });
    await loadCase();
  }

  const c = data?.case;
  const pendingRef = data?.referrals.find((r) => r.status === 'pending_consent');

  return (
    <AppShell requireAuthRole="athlete">
      {!c ? (
        <p className="text-sm text-slate-500">{error || 'Chargement de la consultation...'}</p>
      ) : (
        <div className="max-w-4xl mx-auto space-y-5">
          <section className="surface-card rounded-xl p-6 border-l-4 border-l-[#0d3320] flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold bg-[#f4f5f0] border border-[#dcdfd6] text-[#0d3320] px-2.5 py-0.5 rounded-md">
                {c.status}
              </span>
              <h1 className="text-2xl font-bold text-[#112118] mt-2">{c.doctor.publicName}</h1>
              <p className="text-sm text-[#526057]">
                {c.doctor.specialtyName} · Dossier {c.reference}
              </p>
            </div>
            {c.paymentUnlocked && c.canMessage && (
              <button
                type="button"
                onClick={() => setShowVideo((v) => !v)}
                className="px-4 py-2.5 rounded-lg bg-[#0d3320] hover:bg-[#14452c] text-white font-bold text-sm flex items-center gap-2 transition"
              >
                <Video className="w-4 h-4 text-[#c8f62d]" />
                {showVideo ? 'Masquer la visio' : 'Démarrer / Rejoindre Visio'}
              </button>
            )}
          </section>

          {error && <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-sm">{error}</div>}

          {!c.paymentUnlocked && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-amber-950 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Consultation verrouillée avant paiement
                </p>
                <p className="text-xs text-amber-900">
                  Réglez les 10 000 FCFA pour discuter, partager images/vidéos et fixer votre RDV.
                </p>
              </div>
              <Link href={`/sportif/paiement/${c.id}`} className="px-4 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-xs font-bold">
                Payer 10 000 FCFA
              </Link>
            </div>
          )}

          {showVideo && c.paymentUnlocked && (
            <VideoCallRoom
              caseId={c.id}
              userId={c.athlete.id}
              peerName={c.doctor.publicName}
              onClose={() => setShowVideo(false)}
            />
          )}

          {/* Consentement partage tendances */}
          <section className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <strong>Partage de vos tendances d’entraînement (Suivi &amp; Prévention) :</strong>{' '}
              <span className="text-slate-600">
                {c.shareTrainingTrends ? 'Autorisé pour ce médecin' : 'Masqué (privé)'}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleTrendsShare}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50"
            >
              {c.shareTrainingTrends ? 'Révoquer l’accès' : 'Autoriser le partage'}
            </button>
          </section>

          {/* Transfert ou orientation proposée */}
          {pendingRef && (
            <section className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3">
              <h2 className="font-bold text-base">
                {pendingRef.referralType === 'handoff_transfer'
                  ? 'Transfert proposé vers un confrère (sans frais supplémentaires)'
                  : 'Orientation complémentaire proposée'}
              </h2>
              <p className="text-sm">
                <strong>Médecin destinataire :</strong> {pendingRef.toDoctorName} ({pendingRef.toDoctorSpecialty})
              </p>
              <p className="text-sm">
                <strong>Motif :</strong> {pendingRef.reason}
              </p>
              {pendingRef.referralType === 'handoff_transfer' && (
                <p className="text-xs font-semibold text-emerald-900 bg-emerald-100 p-2.5 rounded-lg">
                  Le médecin initial n’a pas effectué la consultation : si vous acceptez, vos 10 000 FCFA déjà payés
                  sont automatiquement transférés au médecin destinataire sans rien repayer.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => respondReferral(pendingRef.id, 'accepted')}
                  className="px-4 py-2 rounded-xl bg-[#0a2e1c] text-white text-xs font-bold"
                >
                  Accepter le transfert
                </button>
                <button
                  type="button"
                  onClick={() => respondReferral(pendingRef.id, 'refused')}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold"
                >
                  Refuser
                </button>
              </div>
            </section>
          )}

          {/* Rendez-vous proposés / confirmés */}
          {data.appointments.length > 0 && (
            <section className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0a2e1c]" /> Rendez-vous du dossier
              </h2>
              {data.appointments.map((a) => (
                <div key={a.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <strong>{a.appointment_type === 'video' ? 'Visio' : 'Cabinet'}</strong> ·{' '}
                    {formatDateTimeFr(a.starts_at)} · <span className="text-slate-600">{a.location_label}</span>
                    <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-white border">
                      {a.proposal_status}
                    </span>
                  </div>
                  {a.proposal_status === 'proposed' && a.proposed_by !== c.athlete.id && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => respondAppointment(a.id, 'confirmed')}
                        className="px-3 py-1.5 rounded-lg bg-[#0a2e1c] text-white text-xs font-bold"
                      >
                        Confirmer ce RDV
                      </button>
                      <button
                        type="button"
                        onClick={() => respondAppointment(a.id, 'declined')}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs"
                      >
                        Décliner
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Messagerie privée + Images & Vidéos */}
          <section className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <h2 className="font-bold text-base">Messagerie privée (texte, images, vidéos)</h2>
            <div className="space-y-3 max-h-[420px] overflow-y-auto bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              {data.messages.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun message. Commencez l’échange avec votre médecin.</p>
              ) : (
                data.messages.map((m) => {
                  const mine = m.senderId === c.athlete.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm space-y-2 ${
                          mine ? 'bg-[#0a2e1c] text-white' : 'bg-white border border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="text-[11px] opacity-75">
                          {mine ? 'Vous' : c.doctor.publicName} · {formatDateTimeFr(m.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        {m.attachments?.map((att) => {
                          const loaded = mediaUrls[att.id];
                          return (
                            <div key={att.id} className="pt-1">
                              {!loaded ? (
                                <button
                                  type="button"
                                  onClick={() => openAttachment(att)}
                                  className={`text-xs font-bold underline ${mine ? 'text-[#c8f62d]' : 'text-[#0a2e1c]'}`}
                                >
                                  Afficher {att.originalName} ({att.mediaKind})
                                </button>
                              ) : loaded.kind === 'image' ? (
                                <img src={loaded.url} alt={att.originalName} className="max-h-64 rounded-lg" />
                              ) : loaded.kind === 'video' ? (
                                <video src={loaded.url} controls className="max-h-64 rounded-lg w-full" />
                              ) : (
                                <a href={loaded.url} target="_blank" rel="noreferrer" className="underline text-xs font-bold">
                                  Ouvrir le PDF ({att.originalName})
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {c.canMessage ? (
              <form onSubmit={sendMessage} className="flex items-center gap-2">
                <MediaUploader
                  caseId={c.id}
                  onUploaded={(msg) =>
                    setData((prev) =>
                      prev ? { ...prev, messages: [...prev.messages, msg as unknown as MessageItem] } : prev
                    )
                  }
                  onError={(m) => setError(m)}
                />
                <input
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Écrire au médecin..."
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-[#0a2e1c] text-white font-bold text-sm flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Cette consultation est clôturée (lecture seule). Pour un nouveau besoin ou suivi, démarrez une
                  nouvelle consultation (10 000 FCFA).
                </span>
                <Link href={`/medecins/${c.doctor.id}`} className="font-bold text-[#0a2e1c] underline">
                  Nouvelle consultation →
                </Link>
              </div>
            )}
          </section>

          {/* Notation & avis après clôture */}
          {c.canReview && (
            <section className="bg-white rounded-2xl p-5 border-2 border-[#c8f62d] space-y-3">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                Noter votre consultation avec {c.doctor.publicName}
              </h2>
              <form onSubmit={submitReview} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Note</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} ★
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Votre avis public (évitez les détails médicaux personnels)
                  </label>
                  <textarea
                    required
                    minLength={5}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-sm font-bold">
                  Publier ma note
                </button>
              </form>
            </section>
          )}

          {data.review && (
            <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm">
              <strong>Votre avis publié ({data.review.rating}/5 ★) :</strong> {data.review.comment}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
