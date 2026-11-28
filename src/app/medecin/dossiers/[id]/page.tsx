'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileHeart,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { MediaUploader } from '@/components/MediaUploader';
import { VideoCallRoom } from '@/components/VideoCallRoom';
import { apiFetch, formatDateFr, formatDateTimeFr } from '@/lib/apiClient';
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
  ends_at: string;
  location_label: string;
}

interface ReferralItem {
  id: string;
  referralType: 'handoff_transfer' | 'post_consult_referral';
  toDoctorName: string;
  toDoctorSpecialty: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface ColleagueItem {
  id: string;
  publicName: string;
  city: string;
  facilityName: string;
  specialtyName: string;
}

interface TrainingSignal {
  id: string;
  severity: 'info' | 'attention';
  title: string;
  message: string;
  disclaimer: string;
}

interface TrainingLogItem {
  id: string;
  session_date: string;
  sport: string;
  session_type: string;
  duration_minutes: number;
  rpe_intensity: number;
  fatigue_score: number;
  has_discomfort: boolean;
  body_part: string | null;
}

interface RtsStep {
  id: string;
  step_order: number;
  label: string;
  criteria: string;
  athlete_done_at: string | null;
  doctor_validated_at: string | null;
}

interface CasePayload {
  case: {
    id: string;
    reference: string;
    mode: string;
    status: string;
    bodyPart: string | null;
    sportContext: string | null;
    initialReason: string;
    headTraumaFlagged: boolean;
    shareTrainingTrends: boolean;
    paymentUnlocked: boolean;
    medicalRecordUpdated: boolean;
    canMessage: boolean;
    athlete: {
      id: string;
      fullName: string;
      city: string;
      sports: string[];
      primarySport: string;
      practiceLevel: string;
      weeklyFrequency: string;
      priorInjuries: string;
      allergiesConditions: string;
    };
    doctor: {
      id: string;
      publicName: string;
    };
  };
  messages: MessageItem[];
  appointments: AppointmentItem[];
  referrals: ReferralItem[];
  longitudinalRecord: {
    clinicalSummary: string;
    contraindications: string;
    fitnessGuidance: string;
    nextFollowupAt: string | null;
    lastUpdatedByDoctorName: string | null;
    updatedAt: string;
  } | null;
  medicalEntries: Array<{
    id: string;
    caseId: string;
    doctorName: string;
    summary: string;
    recommendations: string;
    fitnessStatus: string;
    createdAt: string;
  }>;
  sharedTrainingData: {
    logs: TrainingLogItem[];
    signals: TrainingSignal[];
  } | null;
  returnToSportPlan: {
    id: string;
    title: string;
    status: string;
    steps: RtsStep[];
  } | null;
}

export default function DoctorCaseDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const [data, setData] = useState<CasePayload | null>(null);
  const [colleagues, setColleagues] = useState<ColleagueItem[]>([]);
  const [sessionUserId, setSessionUserId] = useState('');
  const [mediaUrls, setMediaUrls] = useState<Record<string, { url: string; kind: string }>>({});
  const [showVideo, setShowVideo] = useState(false);

  const [msgText, setMsgText] = useState('');
  const [apptType, setApptType] = useState<'video' | 'physical'>('video');
  const [apptDate, setApptDate] = useState(() => new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [apptLocation, setApptLocation] = useState('');

  // Mandatory closure form
  const [entrySummary, setEntrySummary] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [contraindications, setContraindications] = useState('');
  const [fitnessGuidance, setFitnessGuidance] = useState('');
  const [fitnessStatus, setFitnessStatus] = useState<
    'apte_sans_restriction' | 'reprise_progressive' | 'repos_sportif' | 'suivi_en_cours'
  >('reprise_progressive');
  const [nextFollowupDate, setNextFollowupDate] = useState('');

  // Referral form
  const [toDoctorId, setToDoctorId] = useState('');
  const [referralType, setReferralType] = useState<'handoff_transfer' | 'post_consult_referral'>('handoff_transfer');
  const [referralReason, setReferralReason] = useState('');
  const [sharedFields, setSharedFields] = useState<Array<'initial_complaint' | 'medical_record' | 'training_trends'>>([
    'initial_complaint',
    'medical_record',
  ]);

  // Return to Sport builder
  const [rtsTitle, setRtsTitle] = useState('Protocole progressif de reprise');
  const [rtsStepsText, setRtsStepsText] = useState(
    'Phase 1 : Mobilité & gainage sans douleur\nPhase 2 : Course en ligne sans appui explosif\nPhase 3 : Entraînement sans contact\nPhase 4 : Entraînement collectif complet'
  );

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCase = useCallback(async () => {
    const res = await apiFetch<CasePayload>(`/api/cases/${caseId}`);
    setData(res);
    if (res.longitudinalRecord && !clinicalSummary) {
      setClinicalSummary(res.longitudinalRecord.clinicalSummary || '');
      setContraindications(res.longitudinalRecord.contraindications || '');
      setFitnessGuidance(res.longitudinalRecord.fitnessGuidance || '');
    }
  }, [caseId, clinicalSummary]);

  useEffect(() => {
    Promise.all([
      loadCase(),
      apiFetch<{ colleagues: ColleagueItem[] }>('/api/doctor/workspace'),
      apiFetch<{ user: { id: string } | null }>('/api/auth/session'),
    ])
      .then(([, ws, sess]) => {
        setColleagues(ws.colleagues || []);
        setSessionUserId(sess.user?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement dossier.'));

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel(`doctor-case-${caseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_messages', filter: `case_id=eq.${caseId}` },
        () => loadCase().catch(() => {})
      )
      .subscribe();

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [caseId, loadCase]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    setError(null);
    try {
      await apiFetch(`/api/cases/${caseId}/messages`, {
        method: 'POST',
        body: { body: msgText },
      });
      setMsgText('');
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  }

  async function loadAttachmentUrl(attId: string, kind: string) {
    try {
      const res = await apiFetch<{ signedUrl: string }>(`/api/cases/${caseId}/attachments/${attId}`);
      setMediaUrls((prev) => ({ ...prev, [attId]: { url: res.signedUrl, kind } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la pièce.');
    }
  }

  async function proposeAppointment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const starts = new Date(`${apptDate}T${apptTime}:00`);
      const ends = new Date(starts.getTime() + 30 * 60000);
      await apiFetch(`/api/cases/${caseId}/appointments/propose`, {
        method: 'POST',
        body: {
          appointmentType: apptType,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          locationLabel: apptLocation || undefined,
        },
      });
      setNotice('Proposition de rendez-vous envoyée au sportif.');
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proposition impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function respondAppointment(apptId: string, decision: 'confirmed' | 'declined' | 'cancelled') {
    setError(null);
    try {
      await apiFetch(`/api/cases/${caseId}/appointments/${apptId}/respond`, {
        method: 'POST',
        body: { decision },
      });
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour RDV impossible.');
    }
  }

  async function handleCompleteCase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/cases/${caseId}/complete`, {
        method: 'POST',
        body: {
          entrySummary,
          recommendations,
          clinicalSummary,
          contraindications,
          fitnessGuidance,
          fitnessStatus,
          nextFollowupAt: nextFollowupDate ? new Date(`${nextFollowupDate}T09:00:00Z`).toISOString() : null,
        },
      });
      setNotice('Consultation clôturée et dossier médical longitudinal mis à jour.');
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clôture impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateReferral(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/cases/${caseId}/referrals`, {
        method: 'POST',
        body: {
          toDoctorId,
          referralType,
          reason: referralReason,
          sharedFields,
        },
      });
      setNotice('Proposition de transfert / orientation envoyée au sportif pour validation.');
      setReferralReason('');
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Orientation impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRtsPlan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const steps = rtsStepsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((label) => ({ label, criteria: 'Validation clinique du praticien requise.' }));
      await apiFetch(`/api/cases/${caseId}/return-to-sport`, {
        method: 'POST',
        body: { title: rtsTitle, steps },
      });
      setNotice('Parcours de retour au sport créé.');
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création RTS impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleValidateRtsStep(stepId: string, grantMedicalClearance: boolean) {
    setError(null);
    try {
      await apiFetch(`/api/cases/${caseId}/return-to-sport`, {
        method: 'POST',
        body: {
          stepId,
          validated: true,
          note: grantMedicalClearance ? 'Feu vert médical explicite du médecin' : 'Étape validée',
          grantMedicalClearance,
        },
      });
      setNotice(
        grantMedicalClearance
          ? 'Validation médicale de reprise accordée.'
          : 'Étape de reprise validée.'
      );
      await loadCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation étape impossible.');
    }
  }

  function toggleSharedField(f: 'initial_complaint' | 'medical_record' | 'training_trends') {
    setSharedFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const c = data?.case;
  const isClosed = c ? ['completed', 'transferred', 'cancelled'].includes(c.status) : false;

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/medecin" className="text-sm font-semibold text-[#0D6E46] hover:text-[#063725] flex items-center gap-1 transition">
            <ArrowLeft className="w-4 h-4" /> Retour aux dossiers
          </Link>
          {c && c.paymentUnlocked && !isClosed && (
            <button
              type="button"
              onClick={() => setShowVideo((v) => !v)}
              className="px-4 py-2 rounded-full bg-[#063725] hover:bg-[#0D6E46] text-white text-sm font-semibold flex items-center gap-2 transition"
            >
              <Video className="w-4 h-4 text-[#FBBF24]" />
              {showVideo ? 'Masquer la salle Visio' : 'Démarrer la Visio'}
            </button>
          )}
        </div>

        {notice && (
          <div className="p-3.5 rounded-xl border border-[#C3D6CA] bg-[#ECF7F1] text-sm text-[#063725]">{notice}</div>
        )}
        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">{error}</div>
        )}

        {c && (
          <>
            {/* Patient header */}
            <div className="p-5 rounded-2xl obsidian-card border-l-4 border-l-[#0D6E46] space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono tabular-nums text-[#5B7064]">
                    {c.reference} · Statut : <span className="font-semibold text-[#063725]">{c.status}</span>
                  </p>
                  <h1 className="font-display text-xl font-bold text-[#063725] mt-0.5">
                    {c.athlete.fullName} {c.athlete.city ? `(${c.athlete.city})` : ''}
                  </h1>
                  <p className="text-xs text-[#475E52] mt-1">
                    Sport principal : <strong>{c.athlete.primarySport || c.sportContext || 'Non précisé'}</strong> · Niveau :{' '}
                    {c.athlete.practiceLevel || '—'} · Fréquence : {c.athlete.weeklyFrequency || '—'}
                  </p>
                </div>
                {c.headTraumaFlagged && (
                  <div className="px-3 py-1.5 rounded-full bg-red-100 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Choc crânien / commotion signalé
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl obsidian-inset text-sm text-[#063725] space-y-1">
                <p className="text-xs font-semibold text-[#5B7064] uppercase">Motif initial du sportif</p>
                <p>{c.initialReason}</p>
                {(c.athlete.priorInjuries || c.athlete.allergiesConditions) && (
                  <p className="text-xs text-[#475E52] pt-1">
                    Antécédents : {c.athlete.priorInjuries || 'Aucun renseigné'} · Allergies/conditions :{' '}
                    {c.athlete.allergiesConditions || 'Aucune renseignée'}
                  </p>
                )}
              </div>
            </div>

            {showVideo && sessionUserId && (
              <VideoCallRoom
                caseId={caseId}
                userId={sessionUserId}
                peerName={c.athlete.fullName}
                onClose={() => setShowVideo(false)}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 columns: Chat + Appointments + Referrals list */}
              <div className="lg:col-span-2 space-y-6">
                {/* Chat */}
                <div className="p-5 rounded-2xl obsidian-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-bold text-[#063725]">Messagerie &amp; Médias sécurisés</h2>
                    {isClosed && (
                      <span className="px-2.5 py-1 rounded-full bg-[#F1F6F3] border border-[#D5E2DA] text-[#475E52] text-xs font-semibold flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" /> Lecture seule
                      </span>
                    )}
                  </div>

                  {!c.paymentUnlocked ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
                      Ce dossier est en attente de règlement (10 000 FCFA) par le sportif. La messagerie et les médias seront débloqués dès confirmation.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {data.messages.map((m) => {
                          const isDoc = m.senderRole === 'doctor';
                          const isSys = m.messageType === 'system';
                          return (
                            <div
                              key={m.id}
                              className={`p-3.5 rounded-2xl text-sm ${
                                isSys
                                  ? 'bg-[#F1F6F3] border border-[#E2EBE5] text-[#475E52] text-xs text-center'
                                  : isDoc
                                  ? 'bg-[#063725] text-white ml-6'
                                  : 'obsidian-inset text-[#063725] mr-6'
                              }`}
                            >
                              {!isSys && (
                                <div className={`flex items-center justify-between text-[11px] mb-1 ${isDoc ? 'text-white/75' : 'text-[#5B7064]'}`}>
                                  <span className="font-semibold">
                                    {isDoc ? 'Vous (Médecin)' : c.athlete.fullName}
                                  </span>
                                  <span>{formatDateTimeFr(m.createdAt)}</span>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap">{m.body}</p>
                              {m.attachments.map((att) => (
                                <div key={att.id} className="mt-2">
                                  {!mediaUrls[att.id] ? (
                                    <button
                                      type="button"
                                      onClick={() => loadAttachmentUrl(att.id, att.mediaKind)}
                                      className="px-3 py-1.5 rounded-full bg-white border border-[#D5E2DA] text-xs font-semibold text-[#0D6E46] hover:bg-[#ECF7F1] transition"
                                    >
                                      Ouvrir pièce ({att.originalName})
                                    </button>
                                  ) : mediaUrls[att.id].kind === 'image' ? (
                                    <img
                                      src={mediaUrls[att.id].url}
                                      alt={att.originalName}
                                      className="max-h-60 rounded-xl border border-[#D5E2DA] mt-1"
                                    />
                                  ) : mediaUrls[att.id].kind === 'video' ? (
                                    <video
                                      src={mediaUrls[att.id].url}
                                      controls
                                      className="max-h-64 rounded-xl border border-[#D5E2DA] mt-1 w-full"
                                    />
                                  ) : (
                                    <a
                                      href={mediaUrls[att.id].url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`text-xs font-semibold underline ${isDoc ? 'text-[#FBBF24]' : 'text-[#0D6E46]'}`}
                                    >
                                      Télécharger le PDF ({att.originalName})
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      {c.canMessage && (
                        <form onSubmit={sendMessage} className="flex flex-wrap gap-2 pt-2 border-t border-[#E2EBE5]">
                          <input
                            value={msgText}
                            onChange={(e) => setMsgText(e.target.value)}
                            placeholder="Répondre au sportif, préciser le créneau ou donner des consignes..."
                            className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl border border-[#D5E2DA] text-sm"
                          />
                          <MediaUploader
                            caseId={caseId}
                            onUploaded={() => loadCase()}
                            onError={(m) => setError(m)}
                          />
                          <button
                            type="submit"
                            className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold flex items-center gap-1.5 transition"
                          >
                            <Send className="w-4 h-4" /> Envoyer
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </div>

                {/* Appointments negotiation */}
                {c.paymentUnlocked && (
                  <div className="p-5 rounded-2xl obsidian-card space-y-4">
                    <h2 className="font-display font-bold text-[#063725] flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#0D6E46]" /> Rendez-vous (Visio ou Cabinet)
                    </h2>

                    {data.appointments.map((a) => (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-xl obsidian-inset flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[#063725]">
                            {a.appointment_type === 'video' ? 'Téléconsultation Visio' : 'Consultation Cabinet'} ·{' '}
                            {formatDateTimeFr(a.starts_at)}
                          </p>
                          <p className="text-[#475E52]">
                            {a.location_label} · Statut : <strong>{a.proposal_status}</strong>
                          </p>
                        </div>
                        {a.proposal_status === 'proposed' && a.proposed_by !== sessionUserId && !isClosed && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => respondAppointment(a.id, 'confirmed')}
                              className="px-3.5 py-1.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold transition"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => respondAppointment(a.id, 'declined')}
                              className="px-3.5 py-1.5 rounded-full border border-[#D5E2DA] bg-white text-[#063725] hover:bg-[#F1F6F3] font-semibold transition"
                            >
                              Refuser
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {!isClosed && (
                      <form onSubmit={proposeAppointment} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
                        <select
                          value={apptType}
                          onChange={(e) => setApptType(e.target.value as 'video' | 'physical')}
                          className="px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm bg-white"
                        >
                          <option value="video">Visio</option>
                          <option value="physical">Cabinet</option>
                        </select>
                        <input
                          type="date"
                          required
                          value={apptDate}
                          onChange={(e) => setApptDate(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                        />
                        <input
                          type="time"
                          required
                          value={apptTime}
                          onChange={(e) => setApptTime(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm font-mono tabular-nums"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-3 py-2 rounded-full bg-[#063725] hover:bg-[#0D6E46] text-white text-sm font-semibold transition"
                        >
                          Proposer RDV
                        </button>
                        {apptType === 'physical' && (
                          <input
                            value={apptLocation}
                            onChange={(e) => setApptLocation(e.target.value)}
                            placeholder="Adresse / cabinet (optionnel)"
                            className="sm:col-span-4 px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                          />
                        )}
                      </form>
                    )}
                  </div>
                )}

                {/* Mandatory Closure Form */}
                {c.paymentUnlocked && !isClosed && (
                  <form onSubmit={handleCompleteCase} className="p-5 rounded-2xl obsidian-card-glow space-y-4">
                    <div className="flex items-start gap-2">
                      <ClipboardCheck className="w-5 h-5 text-[#0D6E46] shrink-0 mt-0.5" />
                      <div>
                        <h2 className="font-display font-bold text-[#063725]">
                          Clôturer la consultation &amp; Mettre à jour le dossier patient
                        </h2>
                        <p className="text-xs text-[#475E52]">
                          Obligatoire : vous ne pouvez clôturer ce dossier qu’après avoir rempli la synthèse et mis à jour le dossier médical partagé pour les futures consultations.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#063725] mb-1">
                          Synthèse de cette consultation (15 caractères min.) *
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={entrySummary}
                          onChange={(e) => setEntrySummary(e.target.value)}
                          placeholder="Examen clinique, observations, évolution..."
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#063725] mb-1">
                          Recommandations médicales et sportives (10 caractères min.) *
                        </label>
                        <textarea
                          required
                          rows={2}
                          value={recommendations}
                          onChange={(e) => setRecommendations(e.target.value)}
                          placeholder="Charge adaptée, soins, examens complémentaires..."
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#063725] mb-1">
                          Dossier médical longitudinal mis à jour (15 caractères min.) *
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={clinicalSummary}
                          onChange={(e) => setClinicalSummary(e.target.value)}
                          placeholder="Synthèse globale utile aux prochains médecins consultés sur Terrain+..."
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#063725] mb-1">Contre-indications éventuelles</label>
                          <input
                            value={contraindications}
                            onChange={(e) => setContraindications(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#063725] mb-1">Statut sportif</label>
                          <select
                            value={fitnessStatus}
                            onChange={(e) => setFitnessStatus(e.target.value as typeof fitnessStatus)}
                            className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm bg-white"
                          >
                            <option value="reprise_progressive">Reprise progressive</option>
                            <option value="apte_sans_restriction">Apte sans restriction</option>
                            <option value="repos_sportif">Repos sportif temporaire</option>
                            <option value="suivi_en_cours">Suivi en cours</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#063725] mb-1">Consignes de charge / reprise</label>
                          <input
                            value={fitnessGuidance}
                            onChange={(e) => setFitnessGuidance(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#063725] mb-1">Prochain suivi conseillé (date)</label>
                          <input
                            type="date"
                            value={nextFollowupDate}
                            onChange={(e) => setNextFollowupDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="px-6 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition disabled:opacity-50"
                    >
                      {busy ? 'Enregistrement...' : 'Enregistrer le dossier & Clôturer la consultation'}
                    </button>
                  </form>
                )}

                {/* Handoff Transfer / Referral */}
                {c.paymentUnlocked && !isClosed && (
                  <form onSubmit={handleCreateReferral} className="p-5 rounded-2xl obsidian-card space-y-4">
                    <div className="flex items-start gap-2">
                      <ArrowRightLeft className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                      <div>
                        <h2 className="font-display font-bold text-[#063725]">Transférer ou orienter vers un confrère vérifié</h2>
                        <p className="text-xs text-[#475E52]">
                          Si vous n’avez pas effectué la consultation, le transfert sans consultation reverse automatiquement les 10 000 FCFA (9 000 FCFA net) au médecin receveur après accord du sportif.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#063725] mb-1">Type de démarche</label>
                        <select
                          value={referralType}
                          onChange={(e) =>
                            setReferralType(e.target.value as 'handoff_transfer' | 'post_consult_referral')
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm bg-white"
                        >
                          <option value="handoff_transfer">Transfert avant consultation (reversement 10 000 FCFA)</option>
                          <option value="post_consult_referral">Orientation après consultation (nouveau parcours)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#063725] mb-1">Confrère destinataire</label>
                        <select
                          required
                          value={toDoctorId}
                          onChange={(e) => setToDoctorId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm bg-white"
                        >
                          <option value="">Choisir un confrère vérifié...</option>
                          {colleagues.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.publicName} ({col.specialtyName} · {col.city})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#063725] mb-1">Motif médical du transfert *</label>
                      <textarea
                        required
                        rows={2}
                        value={referralReason}
                        onChange={(e) => setReferralReason(e.target.value)}
                        placeholder="Précisez la spécialité ou l'examen requis..."
                        className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
                      />
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-[#475E52]">
                      {(
                        [
                          ['initial_complaint', 'Motif initial'],
                          ['medical_record', 'Dossier médical longitudinal'],
                          ['training_trends', 'Tendances entraînement'],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sharedFields.includes(k)}
                            onChange={() => toggleSharedField(k)}
                            className="accent-[#0D6E46]"
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={busy || sharedFields.length === 0}
                      className="px-5 py-2.5 rounded-full bg-[#063725] hover:bg-[#0D6E46] text-white text-sm font-semibold transition disabled:opacity-50"
                    >
                      Proposer le transfert au sportif
                    </button>

                    {data.referrals.length > 0 && (
                      <div className="pt-2 border-t border-[#E2EBE5] space-y-1.5 text-xs">
                        {data.referrals.map((r) => (
                          <p key={r.id} className="text-[#475E52]">
                            → <strong>{r.toDoctorName}</strong> ({r.referralType}) : Statut{' '}
                            <span className="font-semibold text-[#063725]">{r.status}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </form>
                )}
              </div>

              {/* Right Column: Longitudinal Record, Shared Training Trends, RTS */}
              <div className="space-y-6">
                {/* Longitudinal Medical Record */}
                <div className="p-5 rounded-2xl obsidian-card space-y-3">
                  <div className="flex items-center gap-2 font-display font-bold text-[#063725]">
                    <FileHeart className="w-4 h-4 text-[#0D6E46]" />
                    Dossier médical longitudinal
                  </div>
                  {data.longitudinalRecord ? (
                    <div className="p-3.5 rounded-xl bg-[#ECF7F1] border border-[#C3D6CA] text-xs space-y-1.5">
                      <p className="font-semibold text-[#063725]">Synthèse actuelle</p>
                      <p className="text-[#063725] whitespace-pre-wrap">{data.longitudinalRecord.clinicalSummary}</p>
                      {data.longitudinalRecord.contraindications && (
                        <p className="text-red-900">
                          <strong>Contre-indications :</strong> {data.longitudinalRecord.contraindications}
                        </p>
                      )}
                      {data.longitudinalRecord.fitnessGuidance && (
                        <p className="text-[#475E52]">
                          <strong>Charge / aptitude :</strong> {data.longitudinalRecord.fitnessGuidance}
                        </p>
                      )}
                      <p className="text-[11px] text-[#5B7064]">
                        Mis à jour le {formatDateFr(data.longitudinalRecord.updatedAt)} par{' '}
                        {data.longitudinalRecord.lastUpdatedByDoctorName || 'Médecin Terrain+'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#5B7064]">
                      Aucune note médicale antérieure enregistrée pour ce sportif.
                    </p>
                  )}

                  {data.medicalEntries.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold text-[#475E52]">
                        Historique des consultations ({data.medicalEntries.length})
                      </p>
                      {data.medicalEntries.map((entry) => (
                        <div key={entry.id} className="p-3 rounded-xl obsidian-inset text-xs space-y-1">
                          <div className="flex justify-between font-semibold text-[#063725]">
                            <span>{entry.doctorName}</span>
                            <span>{formatDateFr(entry.createdAt)}</span>
                          </div>
                          <p className="text-[#063725]">{entry.summary}</p>
                          <p className="text-[#0D6E46] font-medium">Recommandations : {entry.recommendations}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Shared Training & Prevention Trends */}
                <div className="p-5 rounded-2xl obsidian-card space-y-3">
                  <div className="flex items-center gap-2 font-display font-bold text-[#063725]">
                    <Activity className="w-4 h-4 text-[#0D6E46]" />
                    Suivi d’entraînement partagé
                  </div>
                  {!data.sharedTrainingData ? (
                    <p className="text-xs text-[#5B7064]">
                      Le sportif n’a pas activé le partage de son journal d’entraînement sur ce dossier.
                    </p>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      {data.sharedTrainingData.signals.map((sig, i) => (
                        <div
                          key={`${sig.id}-${i}`}
                          className={`p-2.5 rounded-xl border ${
                            sig.severity === 'attention'
                              ? 'border-amber-200 bg-amber-50 text-amber-950'
                              : 'border-[#C3D6CA] bg-[#ECF7F1] text-[#063725]'
                          }`}
                        >
                          <p className="font-semibold">{sig.title}</p>
                          <p className="mt-0.5">{sig.message}</p>
                        </div>
                      ))}
                      <p className="font-semibold text-[#063725] pt-1">
                        Dernières séances ({data.sharedTrainingData.logs.length})
                      </p>
                      {data.sharedTrainingData.logs.slice(0, 6).map((l) => (
                        <div key={l.id} className="p-2.5 rounded-xl obsidian-inset flex justify-between">
                          <span className="text-[#063725]">
                            {l.session_date} · {l.sport} ({l.duration_minutes} min)
                          </span>
                          <span className="font-semibold font-mono tabular-nums text-[#0D6E46]">
                            RPE {l.rpe_intensity}/10 {l.has_discomfort ? `· Gêne (${l.body_part || 'zone'})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Return to sport */}
                {c.paymentUnlocked && (
                  <div className="p-5 rounded-2xl obsidian-card space-y-3">
                    <div className="flex items-center gap-2 font-display font-bold text-[#063725]">
                      <ShieldCheck className="w-4 h-4 text-[#0D6E46]" />
                      Retour après blessure (validation médicale)
                    </div>
                    {data.returnToSportPlan ? (
                      <div className="space-y-2 text-xs">
                        <p className="font-semibold text-[#063725]">
                          {data.returnToSportPlan.title} ·{' '}
                          <span className="text-[#0D6E46]">{data.returnToSportPlan.status}</span>
                        </p>
                        {data.returnToSportPlan.steps.map((st, idx) => (
                          <div key={st.id} className="p-2.5 rounded-xl obsidian-inset space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#063725]">
                                Étape {st.step_order} : {st.label}
                              </span>
                              {st.doctor_validated_at ? (
                                <CheckCircle2 className="w-4 h-4 text-[#0D6E46] shrink-0" />
                              ) : !isClosed ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleValidateRtsStep(
                                      st.id,
                                      idx === data.returnToSportPlan!.steps.length - 1
                                    )
                                  }
                                  className="px-3 py-1 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-[11px] font-semibold shrink-0 transition"
                                >
                                  {idx === data.returnToSportPlan!.steps.length - 1
                                    ? 'Valider reprise finale'
                                    : 'Valider étape'}
                                </button>
                              ) : null}
                            </div>
                            <p className="text-[#5B7064]">
                              Sportif : {st.athlete_done_at ? 'Signalé fait' : 'En cours'} · Médecin :{' '}
                              {st.doctor_validated_at ? 'Validé' : 'En attente'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : !isClosed ? (
                      <form onSubmit={handleCreateRtsPlan} className="space-y-2 text-xs">
                        <input
                          required
                          value={rtsTitle}
                          onChange={(e) => setRtsTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA]"
                        />
                        <textarea
                          rows={4}
                          value={rtsStepsText}
                          onChange={(e) => setRtsStepsText(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA]"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-4 py-2 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold flex items-center gap-1.5 transition"
                        >
                          <Plus className="w-3.5 h-3.5" /> Créer le protocole de reprise
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-[#5B7064]">Aucun protocole de reprise actif.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
