'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FolderHeart,
  MessageSquare,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr, formatFcfa } from '@/lib/apiClient';
import type { VerificationStatus } from '@/lib/types';

interface DashboardData {
  verification: {
    status: VerificationStatus;
    reason: string | null;
    submittedAt: string | null;
    slaDueAt: string | null;
    slaTargetHours: number;
    evidence: Array<{ id: string }>;
  };
  profile: {
    publicName: string;
    specialtyName: string;
    city: string;
    facilityName: string;
    consultationFeeFcfa: number;
  };
  stats: {
    totalCases: number;
    activeCases: number;
    completedCases: number;
    paidCount: number;
    totalNetFcfa: number;
  };
}

interface WorkspaceCase {
  id: string;
  reference: string;
  mode: string;
  status: string;
  body_part: string | null;
  sport_context: string | null;
  head_trauma_flagged: boolean;
  medical_record_updated: boolean;
  share_training_trends: boolean;
  created_at: string;
  athleteName: string;
  athleteCity: string;
}

interface WorkspaceAppointment {
  id: string;
  case_id: string;
  appointment_type: 'video' | 'physical';
  proposal_status: string;
  starts_at: string;
  location_label: string;
}

const CASE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  awaiting_payment: { label: 'En attente de paiement', cls: 'bg-[#F1F6F3] text-[#475E52] border border-[#D5E2DA]' },
  open: { label: 'Actif · Échanges ouverts', cls: 'bg-[#ECF7F1] text-[#0D6E46] border border-[#C3D6CA]' },
  appointment_confirmed: { label: 'RDV confirmé', cls: 'bg-sky-50 text-sky-900 border border-sky-200' },
  referral_proposed: { label: 'Transfert proposé', cls: 'bg-amber-50 text-amber-900 border border-amber-200' },
  completed: { label: 'Clôturé · Dossier mis à jour', cls: 'bg-[#063725] text-white' },
  transferred: { label: 'Transféré à un confrère', cls: 'bg-purple-50 text-purple-900 border border-purple-200' },
  cancelled: { label: 'Annulé / Remboursé', cls: 'bg-red-50 text-red-900 border border-red-200' },
};

const VERIF_LABELS: Record<VerificationStatus, { title: string; badge: string; box: string }> = {
  to_complete: {
    title: 'Dossier praticien à compléter',
    badge: 'À compléter',
    box: 'border-amber-300 bg-amber-50 text-amber-950',
  },
  pending: {
    title: 'Vérification en cours (objectif SLA 72h)',
    badge: 'En attente de validation',
    box: 'border-amber-300 bg-amber-50 text-amber-950',
  },
  more_info_requested: {
    title: 'Complément justificatif demandé par l’administration',
    badge: 'Action requise',
    box: 'border-orange-300 bg-orange-50 text-orange-950',
  },
  verified: {
    title: 'Compte médecin vérifié et visible dans l’annuaire',
    badge: 'Vérifié Terrain+',
    box: 'border-[#C3D6CA] bg-[#ECF7F1] text-[#063725]',
  },
  rejected: {
    title: 'Demande de vérification refusée',
    badge: 'Refusé',
    box: 'border-red-300 bg-red-50 text-red-950',
  },
  suspended: {
    title: 'Compte praticien suspendu',
    badge: 'Suspendu',
    box: 'border-red-300 bg-red-50 text-red-950',
  },
};

export default function DoctorDashboardPage() {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [cases, setCases] = useState<WorkspaceCase[]>([]);
  const [appointments, setAppointments] = useState<WorkspaceAppointment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<DashboardData>('/api/doctor/dashboard'),
      apiFetch<{ cases: WorkspaceCase[]; appointments: WorkspaceAppointment[] }>('/api/doctor/workspace'),
    ])
      .then(([d, w]) => {
        setDash(d);
        setCases(w.cases || []);
        setAppointments(w.appointments || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de chargement.'));
  }, []);

  const verifMeta = dash ? VERIF_LABELS[dash.verification.status] : null;
  const activeQueue = cases.filter((c) => !['completed', 'transferred', 'cancelled'].includes(c.status));

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0D6E46]">
              Espace Praticien Terrain+
            </p>
            <h1 className="font-display text-2xl font-bold text-[#063725]">
              {dash?.profile.publicName || 'Tableau de bord médecin'}
            </h1>
            <p className="text-sm text-[#475E52]">
              {dash?.profile.specialtyName || 'Spécialité médicale'} · {dash?.profile.facilityName || dash?.profile.city || 'Cabinet'} · Tarif unique{' '}
              <span className="font-mono tabular-nums font-semibold text-[#063725]">
                {formatFcfa(dash?.profile.consultationFeeFcfa || 10000)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/medecin/agenda"
              className="px-4 py-2 rounded-full border border-[#D5E2DA] bg-white text-sm font-semibold text-[#063725] hover:bg-[#F1F6F3] flex items-center gap-1.5 transition"
            >
              <Calendar className="w-4 h-4 text-[#0D6E46]" />
              Gérer l’agenda
            </Link>
            <Link
              href="/medecin/forum"
              className="px-4 py-2 rounded-full border border-[#D5E2DA] bg-white text-sm font-semibold text-[#063725] hover:bg-[#F1F6F3] flex items-center gap-1.5 transition"
            >
              <Users className="w-4 h-4 text-[#0D6E46]" />
              Forum confrères
            </Link>
            <Link
              href="/medecin/confreres"
              className="px-4 py-2 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold flex items-center gap-1.5 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Messagerie confrères
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">{error}</div>
        )}

        {dash && verifMeta && (
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${verifMeta.box}`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#0D6E46]" />
                <span className="font-semibold text-sm">{verifMeta.title}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white border border-[#D5E2DA] text-[#063725]">
                  {verifMeta.badge}
                </span>
              </div>
              {dash.verification.slaDueAt && dash.verification.status === 'pending' && (
                <p className="text-xs opacity-90">
                  Échéance cible (72h) : {formatDateTimeFr(dash.verification.slaDueAt)} · Pièces jointes :{' '}
                  {dash.verification.evidence.length}
                </p>
              )}
              {dash.verification.reason && (
                <p className="text-xs font-medium">Note : {dash.verification.reason}</p>
              )}
            </div>
            <Link
              href="/medecin/verification"
              className="px-4 py-2 rounded-full bg-white text-[#063725] text-xs font-semibold border border-[#D5E2DA] hover:bg-[#F1F6F3] shrink-0 text-center transition"
            >
              {dash.verification.status === 'verified' ? 'Profil & justificatifs' : 'Compléter ma vérification'}
            </Link>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl obsidian-card">
            <div className="flex items-center justify-between text-[#5B7064] text-xs mb-1">
              <span>Dossiers actifs</span>
              <FolderHeart className="w-4 h-4 text-[#0D6E46]" />
            </div>
            <p className="font-display text-2xl font-bold text-[#063725] font-mono tabular-nums">
              {dash?.stats.activeCases ?? 0}
            </p>
            <p className="text-xs text-[#5B7064] mt-1">À traiter ou suivre</p>
          </div>
          <div className="p-5 rounded-2xl obsidian-card">
            <div className="flex items-center justify-between text-[#5B7064] text-xs mb-1">
              <span>Consultations clôturées</span>
              <CheckCircle2 className="w-4 h-4 text-[#0D6E46]" />
            </div>
            <p className="font-display text-2xl font-bold text-[#063725] font-mono tabular-nums">
              {dash?.stats.completedCases ?? 0}
            </p>
            <p className="text-xs text-[#5B7064] mt-1">Sur {dash?.stats.totalCases ?? 0} dossiers reçus</p>
          </div>
          <div className="p-5 rounded-2xl obsidian-card">
            <div className="flex items-center justify-between text-[#5B7064] text-xs mb-1">
              <span>Actes payés</span>
              <Clock className="w-4 h-4 text-[#0D6E46]" />
            </div>
            <p className="font-display text-2xl font-bold text-[#063725] font-mono tabular-nums">
              {dash?.stats.paidCount ?? 0}
            </p>
            <p className="text-xs text-[#5B7064] mt-1">9 000 FCFA net / consultation</p>
          </div>
          <Link
            href="/medecin/revenus"
            className="p-5 rounded-2xl obsidian-card hover:border-[#0D6E46]/40 transition"
          >
            <div className="flex items-center justify-between text-[#5B7064] text-xs mb-1">
              <span>Revenus nets</span>
              <Wallet className="w-4 h-4 text-[#0D6E46]" />
            </div>
            <p className="font-display text-2xl font-bold text-[#0D6E46] font-mono tabular-nums">
              {formatFcfa(dash?.stats.totalNetFcfa ?? 0)}
            </p>
            <p className="text-xs font-semibold text-[#0D6E46] mt-1">Voir détail &amp; reversements →</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active consultations */}
          <div className="lg:col-span-2 rounded-2xl obsidian-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-[#063725]">Dossiers patients ({cases.length})</h2>
              <span className="text-xs text-[#5B7064]">{activeQueue.length} en cours</span>
            </div>

            {cases.length === 0 ? (
              <div className="p-6 rounded-xl obsidian-inset text-sm text-[#475E52] text-center">
                Aucun dossier patient reçu pour le moment. Publiez vos créneaux dans{' '}
                <Link href="/medecin/agenda" className="text-[#0D6E46] font-semibold underline">
                  votre agenda
                </Link>{' '}
                pour accueillir des sportifs.
              </div>
            ) : (
              <div className="space-y-3">
                {cases.map((c) => {
                  const badge = CASE_STATUS_LABELS[c.status] || {
                    label: c.status,
                    cls: 'bg-[#F1F6F3] text-[#475E52]',
                  };
                  return (
                    <Link
                      key={c.id}
                      href={`/medecin/dossiers/${c.id}`}
                      className="block p-4 rounded-xl border border-[#D5E2DA] bg-white hover:border-[#0D6E46] hover:bg-[#F6F8F5] transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#063725]">{c.athleteName}</span>
                          <span className="text-xs font-mono text-[#5B7064]">· {c.reference}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#475E52]">
                        {c.sport_context && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F1F6F3] border border-[#E2EBE5]">{c.sport_context}</span>
                        )}
                        {c.body_part && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F1F6F3] border border-[#E2EBE5]">Zone : {c.body_part}</span>
                        )}
                        {c.share_training_trends && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] font-medium">
                            Tendances entraînement partagées
                          </span>
                        )}
                        {c.head_trauma_flagged && (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Signalement choc crânien
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs text-[#5B7064]">
                        <span>Créé le {formatDateTimeFr(c.created_at)}</span>
                        <span className="text-[#0D6E46] font-semibold flex items-center gap-1">
                          Ouvrir le dossier <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming appointments */}
          <div className="rounded-2xl obsidian-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-[#063725]">Rendez-vous</h2>
              <Link href="/medecin/agenda" className="text-xs text-[#0D6E46] font-semibold hover:underline">
                Agenda
              </Link>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-[#5B7064]">Aucun rendez-vous planifié pour l’instant.</p>
            ) : (
              <div className="space-y-2.5">
                {appointments.slice(0, 8).map((a) => (
                  <Link
                    key={a.id}
                    href={`/medecin/dossiers/${a.case_id}`}
                    className="block p-3 rounded-xl border border-[#D5E2DA] bg-[#F6F8F5] hover:border-[#0D6E46]/40 text-xs space-y-1 transition"
                  >
                    <div className="flex items-center justify-between font-semibold text-[#063725]">
                      <span>{a.appointment_type === 'video' ? 'Téléconsultation Visio' : 'Consultation Cabinet'}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          a.proposal_status === 'confirmed'
                            ? 'bg-[#ECF7F1] text-[#0D6E46] border border-[#C3D6CA]'
                            : a.proposal_status === 'proposed'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-white text-[#475E52] border border-[#D5E2DA]'
                        }`}
                      >
                        {a.proposal_status}
                      </span>
                    </div>
                    <p className="text-[#475E52]">{formatDateTimeFr(a.starts_at)}</p>
                    <p className="text-[#5B7064] truncate">{a.location_label}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
