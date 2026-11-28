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
          <h1 className="font-display text-2xl font-bold text-[#063725]">Revenus &amp; Reversements</h1>
          <p className="text-sm text-[#475E52]">
            Tarif fixe <span className="font-mono tabular-nums font-semibold text-[#063725]">10 000 FCFA TTC</span> par consultation · Commission plateforme 10 % (1 000 FCFA) · Part nette médecin 9 000 FCFA.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl obsidian-card">
            <p className="text-xs text-[#5B7064]">Total net acquis</p>
            <p className="font-display text-2xl font-bold text-[#0D6E46] mt-1 font-mono tabular-nums">{formatFcfa(totalNet)}</p>
          </div>
          <div className="p-5 rounded-2xl obsidian-card">
            <p className="text-xs text-[#5B7064]">En attente de reversement (après clôture)</p>
            <p className="font-display text-2xl font-bold text-[#063725] mt-1 font-mono tabular-nums">{formatFcfa(pendingPayoutNet)}</p>
          </div>
          <div className="p-5 rounded-2xl obsidian-card">
            <p className="text-xs text-[#5B7064]">Consultations créditées</p>
            <p className="font-display text-2xl font-bold text-[#063725] mt-1 font-mono tabular-nums">{validPayments.length}</p>
          </div>
        </div>

        <div className="rounded-2xl obsidian-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2EBE5] flex items-center gap-2 font-display font-bold text-[#063725]">
            <Wallet className="w-4 h-4 text-[#0D6E46]" /> Historique détaillé des actes
          </div>
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-[#5B7064]">Aucune transaction enregistrée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#F1F6F3] text-xs text-[#475E52] uppercase">
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
                <tbody className="divide-y divide-[#E2EBE5]">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F6F8F5]">
                      <td className="px-4 py-3 font-mono text-xs text-[#063725] tabular-nums">{p.reference}</td>
                      <td className="px-4 py-3 text-xs text-[#475E52]">{formatDateTimeFr(p.paid_at)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{formatFcfa(p.gross_amount_fcfa)}</td>
                      <td className="px-4 py-3 text-[#5B7064] font-mono tabular-nums">{formatFcfa(p.platform_commission_fcfa)}</td>
                      <td className="px-4 py-3 font-semibold text-[#0D6E46] font-mono tabular-nums">
                        {p.isTransferredAway ? '0 FCFA' : formatFcfa(p.doctor_net_fcfa)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.isTransferredAway ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-semibold">
                            <ArrowRightLeft className="w-3 h-3" /> Transféré à un confrère
                          </span>
                        ) : p.isTransferredIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] font-semibold">
                            <ArrowRightLeft className="w-3 h-3" /> Reçu par transfert ({p.payout_id ? 'Reversé' : 'Acquis'})
                          </span>
                        ) : p.status === 'refunded' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 font-semibold">Remboursé</span>
                        ) : p.payout_id ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] font-semibold">Reversé</span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
                            {p.status === 'succeeded' ? 'À reverser après clôture' : p.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/medecin/dossiers/${p.case_id}`}
                          className="text-xs font-semibold text-[#0D6E46] hover:underline"
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
