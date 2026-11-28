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
        <p className="text-sm text-[#475E52]">{error || 'Chargement de la consultation...'}</p>
      ) : (
        <div className="max-w-4xl mx-auto space-y-5">
          <section className="obsidian-card rounded-2xl p-6 border-l-4 border-l-[#0D6E46] flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] px-2.5 py-0.5 rounded-full">
                {c.status}
              </span>
              <h1 className="font-display text-2xl font-bold text-[#063725] mt-2">{c.doctor.publicName}</h1>
              <p className="text-sm text-[#475E52]">
                {c.doctor.specialtyName} · Dossier {c.reference}
              </p>
            </div>
            {c.paymentUnlocked && c.canMessage && (
              <button
                type="button"
                onClick={() => setShowVideo((v) => !v)}
                className="px-4 py-2.5 rounded-full bg-[#063725] hover:bg-[#0D6E46] text-white font-semibold text-sm flex items-center gap-2 transition"
              >
                <Video className="w-4 h-4 text-[#FBBF24]" />
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
              <Link href={`/sportif/paiement/${c.id}`} className="px-4 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-xs font-semibold transition">
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
          <section className="obsidian-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#063725]">
              <strong>Partage de vos tendances d’entraînement (Suivi &amp; Prévention) :</strong>{' '}
              <span className="text-[#475E52]">
                {c.shareTrainingTrends ? 'Autorisé pour ce médecin' : 'Masqué (privé)'}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleTrendsShare}
              className="px-3.5 py-1.5 rounded-full border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-xs font-semibold transition"
            >
              {c.shareTrainingTrends ? 'Révoquer l’accès' : 'Autoriser le partage'}
            </button>
          </section>

          {/* Transfert ou orientation proposée */}
          {pendingRef && (
            <section className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3">
              <h2 className="font-display font-bold text-base text-[#063725]">
                {pendingRef.referralType === 'handoff_transfer'
                  ? 'Transfert proposé vers un confrère (sans frais supplémentaires)'
                  : 'Orientation complémentaire proposée'}
              </h2>
              <p className="text-sm text-[#063725]">
                <strong>Médecin destinataire :</strong> {pendingRef.toDoctorName} ({pendingRef.toDoctorSpecialty})
              </p>
              <p className="text-sm text-[#063725]">
                <strong>Motif :</strong> {pendingRef.reason}
              </p>
              {pendingRef.referralType === 'handoff_transfer' && (
                <p className="text-xs font-semibold text-[#063725] bg-[#ECF7F1] border border-[#C3D6CA] p-3 rounded-xl">
                  Le médecin initial n’a pas effectué la consultation : si vous acceptez, vos 10 000 FCFA déjà payés
                  sont automatiquement transférés au médecin destinataire sans rien repayer.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => respondReferral(pendingRef.id, 'accepted')}
                  className="px-4 py-2 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-xs font-semibold transition"
                >
                  Accepter le transfert
                </button>
                <button
                  type="button"
                  onClick={() => respondReferral(pendingRef.id, 'refused')}
                  className="px-4 py-2 rounded-full bg-white border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-xs font-semibold transition"
                >
                  Refuser
                </button>
              </div>
            </section>
          )}

          {/* Rendez-vous proposés / confirmés */}
          {data.appointments.length > 0 && (
            <section className="obsidian-card rounded-2xl p-5 space-y-3">
              <h2 className="font-display font-bold text-base text-[#063725] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0D6E46]" /> Rendez-vous du dossier
              </h2>
              {data.appointments.map((a) => (
                <div key={a.id} className="obsidian-inset rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-[#063725]">
                    <strong>{a.appointment_type === 'video' ? 'Visio' : 'Cabinet'}</strong> ·{' '}
                    {formatDateTimeFr(a.starts_at)} · <span className="text-[#475E52]">{a.location_label}</span>
                    <span className="ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#D5E2DA] text-[#063725]">
                      {a.proposal_status}
                    </span>
                  </div>
                  {a.proposal_status === 'proposed' && a.proposed_by !== c.athlete.id && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => respondAppointment(a.id, 'confirmed')}
                        className="px-3.5 py-1.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-xs font-semibold transition"
                      >
                        Confirmer ce RDV
                      </button>
                      <button
                        type="button"
                        onClick={() => respondAppointment(a.id, 'declined')}
                        className="px-3.5 py-1.5 rounded-full bg-white border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-xs font-semibold transition"
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
          <section className="obsidian-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display font-bold text-base text-[#063725]">Messagerie privée (texte, images, vidéos)</h2>
            <div className="space-y-3 max-h-[420px] overflow-y-auto obsidian-inset p-3.5 rounded-xl">
              {data.messages.length === 0 ? (
                <p className="text-xs text-[#5B7064]">Aucun message. Commencez l’échange avec votre médecin.</p>
              ) : (
                data.messages.map((m) => {
                  const mine = m.senderId === c.athlete.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm space-y-2 ${
                          mine ? 'bg-[#063725] text-white' : 'bg-white border border-[#D5E2DA] text-[#063725]'
                        }`}
                      >
                        <div className="text-[11px] opacity-80">
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
                                  className={`text-xs font-bold underline ${mine ? 'text-[#FBBF24]' : 'text-[#0D6E46]'}`}
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
                  className="flex-1 rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm flex items-center gap-1.5 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="obsidian-inset rounded-xl p-3 text-xs text-[#475E52] flex flex-wrap items-center justify-between gap-2">
                <span>
                  Cette consultation est clôturée (lecture seule). Pour un nouveau besoin ou suivi, démarrez une
                  nouvelle consultation (10 000 FCFA).
                </span>
                <Link href={`/medecins/${c.doctor.id}`} className="font-bold text-[#0D6E46] hover:underline">
                  Nouvelle consultation →
                </Link>
              </div>
            )}
          </section>

          {/* Notation & avis après clôture */}
          {c.canReview && (
            <section className="obsidian-card-glow rounded-2xl p-5 space-y-3">
              <h2 className="font-display font-bold text-lg text-[#063725] flex items-center gap-2">
                <Star className="w-5 h-5 text-[#D97706] fill-[#FBBF24]" />
                Noter votre consultation avec {c.doctor.publicName}
              </h2>
              <form onSubmit={submitReview} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Note</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} ★
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">
                    Votre avis public (évitez les détails médicaux personnels)
                  </label>
                  <textarea
                    required
                    minLength={5}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <button type="submit" className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition">
                  Publier ma note
                </button>
              </form>
            </section>
          )}

          {data.review && (
            <section className="bg-[#ECF7F1] border border-[#C3D6CA] rounded-2xl p-4 text-sm text-[#063725]">
              <strong>Votre avis publié ({data.review.rating}/5 ★) :</strong> {data.review.comment}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
