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
  awaiting_payment: { label: 'En attente de paiement', cls: 'bg-slate-100 text-slate-700' },
  open: { label: 'Actif · Échanges ouverts', cls: 'bg-emerald-100 text-emerald-800' },
  appointment_confirmed: { label: 'RDV confirmé', cls: 'bg-sky-100 text-sky-800' },
  referral_proposed: { label: 'Transfert proposé', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Clôturé · Dossier mis à jour', cls: 'bg-slate-900 text-white' },
  transferred: { label: 'Transféré à un confrère', cls: 'bg-purple-100 text-purple-800' },
  cancelled: { label: 'Annulé / Remboursé', cls: 'bg-rose-100 text-rose-800' },
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
    box: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  },
  rejected: {
    title: 'Demande de vérification refusée',
    badge: 'Refusé',
    box: 'border-rose-300 bg-rose-50 text-rose-950',
  },
  suspended: {
    title: 'Compte praticien suspendu',
    badge: 'Suspendu',
    box: 'border-rose-300 bg-rose-50 text-rose-950',
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
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Espace Praticien Terrain+
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              {dash?.profile.publicName || 'Tableau de bord médecin'}
            </h1>
            <p className="text-sm text-slate-600">
              {dash?.profile.specialtyName || 'Spécialité médicale'} · {dash?.profile.facilityName || dash?.profile.city || 'Cabinet'} · Tarif unique{' '}
              {formatFcfa(dash?.profile.consultationFeeFcfa || 10000)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/medecin/agenda"
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4 text-emerald-700" />
              Gérer l’agenda
            </Link>
            <Link
              href="/medecin/forum"
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Users className="w-4 h-4 text-emerald-700" />
              Forum confrères
            </Link>
            <Link
              href="/medecin/confreres"
              className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5"
            >
              <MessageSquare className="w-4 h-4" />
              Messagerie confrères
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
        )}

        {dash && verifMeta && (
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${verifMeta.box}`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{verifMeta.title}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/80">
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
              className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold border border-current/20 hover:bg-slate-50 shrink-0 text-center"
            >
              {dash.verification.status === 'verified' ? 'Profil & justificatifs' : 'Compléter ma vérification'}
            </Link>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
              <span>Dossiers actifs</span>
              <FolderHeart className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{dash?.stats.activeCases ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">À traiter ou suivre</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
              <span>Consultations clôturées</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{dash?.stats.completedCases ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">Sur {dash?.stats.totalCases ?? 0} dossiers reçus</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
              <span>Actes payés</span>
              <Clock className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{dash?.stats.paidCount ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">9 000 FCFA net / consultation</p>
          </div>
          <Link
            href="/medecin/revenus"
            className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-emerald-300 transition"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
              <span>Revenus nets</span>
              <Wallet className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-800">{formatFcfa(dash?.stats.totalNetFcfa ?? 0)}</p>
            <p className="text-xs text-emerald-700 mt-1">Voir détail & reversements →</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active consultations */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Dossiers patients ({cases.length})</h2>
              <span className="text-xs text-slate-500">{activeQueue.length} en cours</span>
            </div>

            {cases.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 text-sm text-slate-600 text-center">
                Aucun dossier patient reçu pour le moment. Publiez vos créneaux dans{' '}
                <Link href="/medecin/agenda" className="text-emerald-700 font-semibold underline">
                  votre agenda
                </Link>{' '}
                pour accueillir des sportifs.
              </div>
            ) : (
              <div className="space-y-3">
                {cases.map((c) => {
                  const badge = CASE_STATUS_LABELS[c.status] || {
                    label: c.status,
                    cls: 'bg-slate-100 text-slate-700',
                  };
                  return (
                    <Link
                      key={c.id}
                      href={`/medecin/dossiers/${c.id}`}
                      className="block p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{c.athleteName}</span>
                          <span className="text-xs text-slate-500">· {c.reference}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {c.sport_context && (
                          <span className="px-2 py-0.5 rounded bg-slate-100">{c.sport_context}</span>
                        )}
                        {c.body_part && (
                          <span className="px-2 py-0.5 rounded bg-slate-100">Zone : {c.body_part}</span>
                        )}
                        {c.share_training_trends && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Tendances entraînement partagées
                          </span>
                        )}
                        {c.head_trauma_flagged && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Signalement choc crânien
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>Créé le {formatDateTimeFr(c.created_at)}</span>
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Rendez-vous</h2>
              <Link href="/medecin/agenda" className="text-xs text-emerald-700 font-semibold hover:underline">
                Agenda
              </Link>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun rendez-vous planifié pour l’instant.</p>
            ) : (
              <div className="space-y-2.5">
                {appointments.slice(0, 8).map((a) => (
                  <Link
                    key={a.id}
                    href={`/medecin/dossiers/${a.case_id}`}
                    className="block p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>{a.appointment_type === 'video' ? 'Téléconsultation Visio' : 'Consultation Cabinet'}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] ${
                          a.proposal_status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : a.proposal_status === 'proposed'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {a.proposal_status}
                      </span>
                    </div>
                    <p className="text-slate-600">{formatDateTimeFr(a.starts_at)}</p>
                    <p className="text-slate-500 truncate">{a.location_label}</p>
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
