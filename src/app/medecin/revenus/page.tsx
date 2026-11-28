'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr, formatFcfa } from '@/lib/apiClient';

interface DoctorPayment {
  id: string;
  reference: string;
  case_id: string;
  gross_amount_fcfa: number;
  platform_commission_fcfa: number;
  doctor_net_fcfa: number;
  status: string;
  payout_id: string | null;
  paid_at: string | null;
  transferred_at: string | null;
  isTransferredAway: boolean;
  isTransferredIn: boolean;
}

export default function DoctorRevenuesPage() {
  const [payments, setPayments] = useState<DoctorPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ payments: DoctorPayment[] }>('/api/doctor/workspace')
      .then((res) => setPayments(res.payments || []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement revenus.'));
  }, []);

  const validPayments = payments.filter((p) => p.status === 'succeeded' && !p.isTransferredAway);
  const totalNet = validPayments.reduce((sum, p) => sum + Number(p.doctor_net_fcfa || 0), 0);
  const pendingPayoutNet = validPayments
    .filter((p) => !p.payout_id)
    .reduce((sum, p) => sum + Number(p.doctor_net_fcfa || 0), 0);

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenus & Reversements</h1>
          <p className="text-sm text-slate-600">
            Tarif fixe 10 000 FCFA TTC par consultation · Commission plateforme 10 % (1 000 FCFA) · Part nette médecin 9 000 FCFA.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white">
            <p className="text-xs text-slate-500">Total net acquis</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{formatFcfa(totalNet)}</p>
          </div>
          <div className="p-5 rounded-2xl border border-slate-200 bg-white">
            <p className="text-xs text-slate-500">En attente de reversement (après clôture)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatFcfa(pendingPayoutNet)}</p>
          </div>
          <div className="p-5 rounded-2xl border border-slate-200 bg-white">
            <p className="text-xs text-slate-500">Consultations créditées</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{validPayments.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 font-bold text-slate-900">
            <Wallet className="w-4 h-4 text-emerald-700" /> Historique détaillé des actes
          </div>
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Aucune transaction enregistrée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Référence</th>
                    <th className="px-4 py-3">Date paiement</th>
                    <th className="px-4 py-3">Brut</th>
                    <th className="px-4 py-3">Commission (10%)</th>
                    <th className="px-4 py-3">Net médecin</th>
                    <th className="px-4 py-3">Statut / Transfert</th>
                    <th className="px-4 py-3">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">{p.reference}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDateTimeFr(p.paid_at)}</td>
                      <td className="px-4 py-3">{formatFcfa(p.gross_amount_fcfa)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatFcfa(p.platform_commission_fcfa)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-800">
                        {p.isTransferredAway ? '0 FCFA' : formatFcfa(p.doctor_net_fcfa)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.isTransferredAway ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">
                            <ArrowRightLeft className="w-3 h-3" /> Transféré à un confrère
                          </span>
                        ) : p.isTransferredIn ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                            <ArrowRightLeft className="w-3 h-3" /> Reçu par transfert ({p.payout_id ? 'Reversé' : 'Acquis'})
                          </span>
                        ) : p.status === 'refunded' ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-medium">Remboursé</span>
                        ) : p.payout_id ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Reversé</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                            {p.status === 'succeeded' ? 'À reverser après clôture' : p.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/medecin/dossiers/${p.case_id}`}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Ouvrir →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
