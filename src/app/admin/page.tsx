'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileCheck2,
  Flag,
  KeyRound,
  Shield,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr, formatFcfa } from '@/lib/apiClient';

interface OverviewMetrics {
  pendingVerifications: number;
  overdueSla: number;
  openReviewReports: number;
  openForumReports: number;
  staleCases48h: number;
  succeededPaymentsCount: number;
  grossVolumeFcfa: number;
  commissionVolumeFcfa: number;
}

interface VerificationItem {
  doctorId: string;
  fullName: string;
  publicName: string;
  email: string;
  phone: string;
  orderNumber: string;
  specialtyName: string;
  city: string;
  facilityName: string;
  verificationStatus: string;
  verificationReason: string | null;
  submittedAt: string | null;
  slaDueAt: string | null;
  isOverdue72h: boolean;
  evidence: Array<{ id: string; doc_type: string; original_name_safe: string; byte_size: number }>;
}

interface SpecialtyRow {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

interface ArticleRow {
  id: string;
  category: string;
  title: string;
  summary: string;
  reviewer_name: string;
  updated_at: string;
}

interface PaymentRow {
  id: string;
  reference: string;
  case_id: string;
  doctorName: string;
  gross_amount_fcfa: number;
  platform_commission_fcfa: number;
  doctor_net_fcfa: number;
  status: string;
  paid_at: string | null;
}

interface PendingPayout {
  doctorId: string;
  doctorName: string;
  totalNetFcfa: number;
  count: number;
}

interface StaleCase {
  id: string;
  reference: string;
  doctorName: string;
  updated_at: string;
}

interface ReviewReportRow {
  id: string;
  review_id: string;
  reason: string;
  status: string;
  reviews?: { id: string; rating: number; comment: string; moderation_status: string };
}

interface ForumReportRow {
  id: string;
  target_type: 'topic' | 'post';
  target_id: string;
  reason: string;
  status: string;
}

interface UserRow {
  id: string;
  role: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  status: 'active' | 'suspended';
  suspension_reason: string | null;
  phone_verified: boolean;
}

interface AuditLogRow {
  id: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  created_at: string;
}

type TabKey = 'verifications' | 'catalog' | 'payments' | 'moderation' | 'users' | 'audit';

export default function AdminPortalPage() {
  const [tab, setTab] = useState<TabKey>('verifications');
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [queue, setQueue] = useState<VerificationItem[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<PendingPayout[]>([]);
  const [staleCases, setStaleCases] = useState<StaleCase[]>([]);
  const [reviewReports, setReviewReports] = useState<ReviewReportRow[]>([]);
  const [forumReports, setForumReports] = useState<ForumReportRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  const [reasonInput, setReasonInput] = useState('');
  const [specName, setSpecName] = useState('');
  const [specDesc, setSpecDesc] = useState('');

  const [artCat, setArtCat] = useState<'warmup' | 'recovery' | 'mobility' | 'hydration' | 'basketball' | 'general'>('warmup');
  const [artTitle, setArtTitle] = useState('');
  const [artSummary, setArtSummary] = useState('');
  const [artContent, setArtContent] = useState('');
  const [artReviewer, setArtReviewer] = useState('Comité médical Terrain+');

  const [grantCaseId, setGrantCaseId] = useState('');
  const [grantReason, setGrantReason] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [ov, ver, sp, prev, pay, mod, usr, aud] = await Promise.all([
      apiFetch<{ metrics: OverviewMetrics }>('/api/admin/overview'),
      apiFetch<{ queue: VerificationItem[] }>('/api/admin/verifications'),
      apiFetch<{ specialties: SpecialtyRow[] }>('/api/admin/specialties'),
      apiFetch<{ articles: ArticleRow[] }>('/api/admin/prevention'),
      apiFetch<{ payments: PaymentRow[]; pendingPayouts: PendingPayout[]; staleCases48h: StaleCase[] }>('/api/admin/payments'),
      apiFetch<{ reviewReports: ReviewReportRow[]; forumReports: ForumReportRow[] }>('/api/admin/moderation'),
      apiFetch<{ users: UserRow[] }>('/api/admin/users'),
      apiFetch<{ logs: AuditLogRow[] }>('/api/admin/audit-logs'),
    ]);
    setMetrics(ov.metrics);
    setQueue(ver.queue || []);
    setSpecialties(sp.specialties || []);
    setArticles(prev.articles || []);
    setPayments(pay.payments || []);
    setPendingPayouts(pay.pendingPayouts || []);
    setStaleCases(pay.staleCases48h || []);
    setReviewReports(mod.reviewReports || []);
    setForumReports(mod.forumReports || []);
    setUsers(usr.users || []);
    setLogs(aud.logs || []);
  }, []);

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement administration.'));
  }, [loadAll]);

  async function viewEvidence(evidenceId: string) {
    setError(null);
    try {
      const res = await apiFetch<{ signedUrl: string }>(`/api/admin/evidence/${evidenceId}`);
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ouverture justificatif impossible.');
    }
  }

  async function decideDoctor(doctorId: string, decision: 'verified' | 'more_info_requested' | 'rejected' | 'suspended') {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/verifications/${doctorId}/decision`, {
        method: 'POST',
        body: { decision, reason: reasonInput.trim() },
      });
      setNotice(`Décision enregistrée (${decision}) et auditée.`);
      setReasonInput('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Décision impossible.');
    }
  }

  async function handleCreateSpecialty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/specialties', {
        method: 'POST',
        body: { name: specName, description: specDesc },
      });
      setSpecName('');
      setSpecDesc('');
      setNotice('Spécialité ajoutée.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ajout spécialité impossible.');
    }
  }

  async function toggleSpecialty(s: SpecialtyRow) {
    setError(null);
    await apiFetch('/api/admin/specialties', {
      method: 'PATCH',
      body: { id: s.id, isActive: !s.is_active },
    });
    await loadAll();
  }

  async function handlePublishArticle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/prevention', {
        method: 'POST',
        body: {
          category: artCat,
          title: artTitle,
          summary: artSummary,
          content: artContent,
          reviewerName: artReviewer,
        },
      });
      setArtTitle('');
      setArtSummary('');
      setArtContent('');
      setNotice('Contenu de prévention validé publié.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible.');
    }
  }

  async function executePayout(doctorId: string) {
    setError(null);
    try {
      const ref = `VIR-${Date.now().toString(36).toUpperCase()}`;
      await apiFetch('/api/admin/payments', {
        method: 'POST',
        body: { action: 'execute_payout', doctorId, payoutReference: ref },
      });
      setNotice(`Reversement ${ref} enregistré.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reversement impossible.');
    }
  }

  async function refundDispute(paymentId: string) {
    setError(null);
    try {
      await apiFetch('/api/admin/payments', {
        method: 'POST',
        body: {
          action: 'refund_dispute',
          paymentId,
          reason: reasonInput.trim() || 'Non-réponse médecin au-delà de 48h — remboursement sportif.',
        },
      });
      setNotice('Remboursement litige traité et audité.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remboursement impossible.');
    }
  }

  async function moderate(kind: 'review' | 'forum_topic' | 'forum_post', targetId: string, action: 'hide' | 'keep' | 'remove') {
    setError(null);
    try {
      await apiFetch('/api/admin/moderation', {
        method: 'POST',
        body: {
          kind,
          targetId,
          action,
          reason: reasonInput.trim() || 'Décision de modération administrative Terrain+.',
        },
      });
      setNotice('Modération appliquée et auditée.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modération impossible.');
    }
  }

  async function toggleUserStatus(u: UserRow) {
    setError(null);
    try {
      const next = u.status === 'active' ? 'suspended' : 'active';
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: {
          userId: u.id,
          status: next,
          reason: reasonInput.trim() || (next === 'suspended' ? 'Suspension administrative préventive.' : 'Réactivation après contrôle.'),
        },
      });
      setNotice(`Compte ${next}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour compte impossible.');
    }
  }

  async function grantExceptionalAccess(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/audit-logs', {
        method: 'POST',
        body: { caseId: grantCaseId, reason: grantReason },
      });
      setGrantCaseId('');
      setGrantReason('');
      setNotice('Accès support exceptionnel (15 min) accordé et consigné au journal immuable.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Octroi impossible.');
    }
  }

  return (
    <AppShell requireAuthRole="admin">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> Gouvernance & Sécurité Terrain+
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Portail Administrateur</h1>
          <p className="text-xs text-slate-600 mt-1">
            Accès strictement cloisonné aux données administratives, vérifications praticiens (SLA 72h), finances (10 %) et modération.
          </p>
        </div>

        {/* KPIs */}
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Médecins à vérifier</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.pendingVerifications}</p>
              {metrics.overdueSla > 0 && (
                <p className="text-xs text-rose-600 font-semibold mt-0.5">{metrics.overdueSla} hors SLA 72h</p>
              )}
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Signalements ouverts</p>
              <p className="text-2xl font-bold text-slate-900">
                {metrics.openReviewReports + metrics.openForumReports}
              </p>
              <p className="text-xs text-slate-500">
                {metrics.openReviewReports} avis · {metrics.openForumReports} forum
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Dossiers sans réponse &gt; 48h</p>
              <p className="text-2xl font-bold text-amber-700">{metrics.staleCases48h}</p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Volume brut encaissé</p>
              <p className="text-xl font-bold text-slate-900">{formatFcfa(metrics.grossVolumeFcfa)}</p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Commission plateforme (10%)</p>
              <p className="text-xl font-bold text-emerald-800">{formatFcfa(metrics.commissionVolumeFcfa)}</p>
            </div>
          </div>
        )}

        {/* Shared optional reason bar for quick admin decisions */}
        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-xs font-semibold text-slate-700 shrink-0">Motif / Note administrative (pour décisions & audits) :</label>
          <input
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            placeholder="Ex : Carte professionnelle expirée, propos contraires à l'anonymisation..."
            className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
          />
        </div>

        {notice && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-900">{notice}</div>
        )}
        {error && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['verifications', 'Vérifications (72h)', FileCheck2],
              ['catalog', 'Spécialités & Prévention', BookOpen],
              ['payments', 'Paiements & Litiges', Wallet],
              ['moderation', 'Modération Avis & Forum', Flag],
              ['users', 'Comptes utilisateurs', Users],
              ['audit', 'Journal d’audit & Support', KeyRound],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                tab === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Verifications */}
        {tab === 'verifications' && (
          <div className="space-y-3">
            {queue.map((item) => (
              <div key={item.doctorId} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{item.publicName || item.fullName}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {item.verificationStatus}
                      </span>
                      {item.isOverdue72h && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> SLA 72h dépassé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {item.specialtyName} · N° Ordre : <strong>{item.orderNumber}</strong> · {item.facilityName} ({item.city})
                    </p>
                    <p className="text-xs text-slate-500">
                      Tél : {item.phone} · Email : {item.email || '—'} · SLA : {formatDateTimeFr(item.slaDueAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decideDoctor(item.doctorId, 'verified')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => decideDoctor(item.doctorId, 'more_info_requested')}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                    >
                      Demander complément
                    </button>
                    <button
                      type="button"
                      onClick={() => decideDoctor(item.doctorId, 'rejected')}
                      className="px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-50"
                    >
                      Refuser
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.evidence.length === 0 ? (
                    <span className="text-xs text-slate-400">Aucune pièce justificative déposée.</span>
                  ) : (
                    item.evidence.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => viewEvidence(ev.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Voir {ev.doc_type} ({ev.original_name_safe})
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Specialties & Prevention */}
        {tab === 'catalog' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
              <h2 className="font-bold text-slate-900">Spécialités médicales ({specialties.length})</h2>
              <form onSubmit={handleCreateSpecialty} className="space-y-2">
                <input
                  required
                  value={specName}
                  onChange={(e) => setSpecName(e.target.value)}
                  placeholder="Nom de spécialité (ex : Cardiologie du sport)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  value={specDesc}
                  onChange={(e) => setSpecDesc(e.target.value)}
                  placeholder="Description courte"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">
                  Ajouter spécialité
                </button>
              </form>
              <div className="space-y-2">
                {specialties.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-slate-500">{s.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSpecialty(s)}
                      className={`px-2.5 py-1 rounded-lg font-semibold ${
                        s.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
              <h2 className="font-bold text-slate-900">Bibliothèque prévention validée ({articles.length})</h2>
              <form onSubmit={handlePublishArticle} className="space-y-2 text-sm">
                <select
                  value={artCat}
                  onChange={(e) => setArtCat(e.target.value as typeof artCat)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="warmup">Échauffement</option>
                  <option value="recovery">Récupération</option>
                  <option value="mobility">Mobilité</option>
                  <option value="hydration">Hydratation</option>
                  <option value="basketball">Spécifique Basketball</option>
                  <option value="general">Général</option>
                </select>
                <input
                  required
                  value={artTitle}
                  onChange={(e) => setArtTitle(e.target.value)}
                  placeholder="Titre de la fiche"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                <input
                  required
                  value={artSummary}
                  onChange={(e) => setArtSummary(e.target.value)}
                  placeholder="Résumé synthétique (10 car. min.)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                <textarea
                  required
                  rows={3}
                  value={artContent}
                  onChange={(e) => setArtContent(e.target.value)}
                  placeholder="Contenu détaillé validé par un professionnel de santé..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                <input
                  required
                  value={artReviewer}
                  onChange={(e) => setArtReviewer(e.target.value)}
                  placeholder="Professionnel relecteur"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold">
                  Publier le contenu validé
                </button>
              </form>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {articles.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-900">
                      [{a.category}] {a.title}
                    </p>
                    <p className="text-slate-500">Validé par {a.reviewer_name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Payments & Disputes */}
        {tab === 'payments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h2 className="font-bold text-slate-900">Reversements en attente (dossiers clôturés)</h2>
                {pendingPayouts.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun reversement en attente.</p>
                ) : (
                  pendingPayouts.map((po) => (
                    <div key={po.doctorId} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">{po.doctorName}</p>
                        <p className="text-slate-500">
                          {po.count} consultation(s) · <strong>{formatFcfa(po.totalNetFcfa)}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => executePayout(po.doctorId)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold"
                      >
                        Marquer reversé
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h2 className="font-bold text-slate-900">Dossiers sans réponse médecin &gt; 48h</h2>
                {staleCases.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun dossier en retard de 48h.</p>
                ) : (
                  staleCases.map((sc) => (
                    <div key={sc.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs">
                      <p className="font-semibold text-slate-900">
                        {sc.reference} · {sc.doctorName}
                      </p>
                      <p className="text-slate-600">Dernière activité : {formatDateTimeFr(sc.updated_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 overflow-x-auto">
              <h2 className="font-bold text-slate-900">Transactions (10 000 FCFA fixe · 10% plateforme)</h2>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Référence</th>
                    <th className="px-3 py-2">Médecin bénéficiaire</th>
                    <th className="px-3 py-2">Brut / Commission / Net</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Action litige</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-mono">{p.reference}</td>
                      <td className="px-3 py-2">{p.doctorName}</td>
                      <td className="px-3 py-2">
                        {formatFcfa(p.gross_amount_fcfa)} · -{formatFcfa(p.platform_commission_fcfa)} →{' '}
                        <strong>{formatFcfa(p.doctor_net_fcfa)}</strong>
                      </td>
                      <td className="px-3 py-2">{p.status}</td>
                      <td className="px-3 py-2">
                        {p.status === 'succeeded' && (
                          <button
                            type="button"
                            onClick={() => refundDispute(p.id)}
                            className="px-2.5 py-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            Rembourser litige
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Moderation */}
        {tab === 'moderation' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
              <h2 className="font-bold text-slate-900">Signalements d’avis patients ({reviewReports.length})</h2>
              {reviewReports.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun avis signalé.</p>
              ) : (
                reviewReports.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                    <p className="font-semibold text-slate-900">
                      Note {r.reviews?.rating ?? '—'}★ · Statut signalement : {r.status}
                    </p>
                    <p className="text-slate-700">Avis : « {r.reviews?.comment || '—'} »</p>
                    <p className="text-amber-800">Motif signalement : {r.reason}</p>
                    {r.status === 'open' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => moderate('review', r.review_id, 'hide')}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold"
                        >
                          Masquer
                        </button>
                        <button
                          type="button"
                          onClick={() => moderate('review', r.review_id, 'keep')}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700"
                        >
                          Maintenir
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
              <h2 className="font-bold text-slate-900">Signalements forum médical ({forumReports.length})</h2>
              {forumReports.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun signalement forum.</p>
              ) : (
                forumReports.map((fr) => (
                  <div key={fr.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                    <p className="font-semibold text-slate-900">
                      Cible : {fr.target_type} · Statut : {fr.status}
                    </p>
                    <p className="text-amber-800">Motif : {fr.reason}</p>
                    {fr.status === 'open' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            moderate(fr.target_type === 'topic' ? 'forum_topic' : 'forum_post', fr.target_id, 'remove')
                          }
                          className="px-2.5 py-1 rounded-lg bg-rose-700 text-white font-semibold"
                        >
                          Retirer
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            moderate(fr.target_type === 'topic' ? 'forum_topic' : 'forum_post', fr.target_id, 'keep')
                          }
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700"
                        >
                          Maintenir
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Users */}
        {tab === 'users' && (
          <div className="p-5 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Rôle</th>
                  <th className="px-3 py-2">Téléphone</th>
                  <th className="px-3 py-2">Ville</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{u.full_name}</td>
                    <td className="px-3 py-2 uppercase">{u.role}</td>
                    <td className="px-3 py-2">{u.phone}</td>
                    <td className="px-3 py-2">{u.city}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100"
                        >
                          {u.status === 'active' ? 'Suspendre' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 6: Audit Logs & Exceptional 15-min Support Grant */}
        {tab === 'audit' && (
          <div className="space-y-6">
            <form onSubmit={grantExceptionalAccess} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
              <h2 className="font-bold text-slate-900">Accès support exceptionnel à un dossier (15 minutes max, audité)</h2>
              <p className="text-xs text-slate-600">
                Par défaut, l’administrateur n’a aucun accès aux échanges médicaux. Utilisez ce mandat uniquement pour résoudre un litige technique ou de facturation avec motif explicite.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={grantCaseId}
                  onChange={(e) => setGrantCaseId(e.target.value)}
                  placeholder="UUID du dossier concerné"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  required
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="Motif détaillé (15 car. min.)"
                  className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">
                Autoriser l’accès temporaire (15 min)
              </button>
            </form>

            <div className="p-5 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
              <h2 className="font-bold text-slate-900 mb-3">Journal d’audit immuable ({logs.length} entrées récentes)</h2>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Acteur</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Cible</th>
                    <th className="px-3 py-2">Motif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{formatDateTimeFr(l.created_at)}</td>
                      <td className="px-3 py-2 uppercase">{l.actor_role}</td>
                      <td className="px-3 py-2 font-mono">{l.action}</td>
                      <td className="px-3 py-2">
                        {l.target_type} ({l.target_id.slice(0, 8)}…)
                      </td>
                      <td className="px-3 py-2 text-slate-600">{l.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
