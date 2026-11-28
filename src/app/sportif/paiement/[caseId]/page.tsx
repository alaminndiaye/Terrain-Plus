'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr, formatFcfa } from '@/lib/apiClient';

interface PaymentRecord {
  id: string;
  reference: string;
  status: string;
  gross_amount_fcfa: number;
  platform_commission_fcfa: number;
  doctor_net_fcfa: number;
}

interface ReceiptRecord {
  reference: string;
  caseReference: string;
  doctorName: string;
  grossAmountFcfa: number;
  platformCommissionFcfa: number;
  doctorNetFcfa: number;
  paidAt: string;
  demoLabel: string;
}

export default function AthletePaymentPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseInfo, setCaseInfo] = useState<{ reference: string; doctor: { publicName: string }; paymentUnlocked: boolean } | null>(null);
  const [channel, setChannel] = useState<'wave_sandbox' | 'orange_money_sandbox' | 'card_sandbox'>('wave_sandbox');
  const [pendingPay, setPendingPay] = useState<PaymentRecord | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{
      case: { reference: string; doctor: { publicName: string }; paymentUnlocked: boolean };
      payments: PaymentRecord[];
    }>(`/api/cases/${caseId}`)
      .then(async (res) => {
        setCaseInfo(res.case);
        const okPay = res.payments.find((p) => p.status === 'succeeded');
        if (okPay) {
          const rec = await apiFetch<{ receipt: ReceiptRecord }>(`/api/payments/${okPay.id}/receipt`);
          setReceipt(rec.receipt);
        } else {
          const pend = res.payments.find((p) => p.status === 'pending');
          if (pend) setPendingPay(pend);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement paiement.'));
  }, [caseId]);

  async function initCheckout() {
    setError(null);
    try {
      const res = await apiFetch<{ payment: PaymentRecord }>('/api/payments/checkout', {
        method: 'POST',
        body: { caseId, paymentChannel: channel },
      });
      setPendingPay(res.payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec initialisation paiement.');
    }
  }

  async function simulateOutcome(outcome: 'succeeded' | 'failed') {
    if (!pendingPay) return;
    setError(null);
    try {
      await apiFetch(`/api/payments/${pendingPay.id}/simulate-webhook`, {
        method: 'POST',
        body: { outcome },
      });
      if (outcome === 'succeeded') {
        const rec = await apiFetch<{ receipt: ReceiptRecord }>(`/api/payments/${pendingPay.id}/receipt`);
        setReceipt(rec.receipt);
        setPendingPay(null);
      } else {
        setPendingPay(null);
        setError('Paiement échoué : la messagerie reste verrouillée.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur confirmation.');
    }
  }

  return (
    <AppShell requireAuthRole="athlete">
      <div className="max-w-xl mx-auto space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 text-sm">{error}</div>
        )}

        {receipt ? (
          <div className="surface-card rounded-xl border-t-4 border-t-[#0d3320] overflow-hidden">
            <div className="p-6 border-b border-[#dcdfd6] bg-white">
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-[#f4f5f0] border border-[#0d3320] text-[#0d3320] px-2.5 py-0.5 rounded-md">
                <CheckCircle2 className="w-3.5 h-3.5" /> {receipt.demoLabel}
              </span>
              <h1 className="text-2xl font-bold text-[#112118] mt-2 tabular-nums">
                Paiement confirmé · {receipt.reference}
              </h1>
              <p className="text-sm text-[#526057] mt-1">
                Votre consultation avec {receipt.doctorName} est déverrouillée.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#f4f5f0] border border-[#dcdfd6] rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Dossier</span>
                  <strong>{receipt.caseReference}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Forfait consultation unique</span>
                  <strong className="tabular-nums">{formatFcfa(receipt.grossAmountFcfa)}</strong>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Dont commission plateforme (10 %)</span>
                  <span className="tabular-nums">{formatFcfa(receipt.platformCommissionFcfa)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Part nette médecin (versée après clôture)</span>
                  <span className="tabular-nums">{formatFcfa(receipt.doctorNetFcfa)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-[#dcdfd6]">
                  <span>Date confirmation</span>
                  <span>{formatDateTimeFr(receipt.paidAt)}</span>
                </div>
              </div>

              <Link
                href={`/sportif/dossiers/${caseId}`}
                className="block w-full py-3.5 rounded-lg bg-[#0d3320] text-white text-center font-bold text-sm hover:bg-[#14452c]"
              >
                Ouvrir la discussion &amp; fixer le RDV →
              </Link>
            </div>
          </div>
        ) : (
          <div className="surface-card rounded-xl border-t-4 border-t-[#0d3320] overflow-hidden">
            <div className="p-6 border-b border-[#dcdfd6] bg-white">
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-[#f4f5f0] border border-[#dcdfd6] px-2.5 py-0.5 rounded-md text-[#0d3320]">
                <ShieldCheck className="w-3.5 h-3.5" /> Tarif unique · 1 seule consultation
              </span>
              <h1 className="text-2xl font-bold text-[#112118] mt-2 tabular-nums">
                Régler la consultation — 10 000 FCFA
              </h1>
              {caseInfo && (
                <p className="text-sm text-[#526057] mt-1">
                  {caseInfo.doctor.publicName} · Dossier {caseInfo.reference}
                </p>
              )}
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-slate-50 rounded-2xl p-4 text-sm space-y-1.5 border border-slate-200">
                <div className="flex justify-between font-bold text-base">
                  <span>Total TTC à régler</span>
                  <span className="text-[#0a2e1c]">{formatFcfa(10000)}</span>
                </div>
                <p className="text-xs text-slate-600">
                  Inclut : chat temps réel, partage d’images/vidéos/documents et rendez-vous Visio ou Cabinet avec ce
                  médecin pour cet épisode de consultation.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ['wave_sandbox', 'Wave'],
                  ['orange_money_sandbox', 'Orange Money'],
                  ['card_sandbox', 'Carte'],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={Boolean(pendingPay)}
                    onClick={() => setChannel(k as typeof channel)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 ${
                      channel === k ? 'border-[#0a2e1c] bg-emerald-50 text-[#0a2e1c]' : 'border-slate-200'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    {lbl}
                  </button>
                ))}
              </div>

              {!pendingPay ? (
                <button
                  type="button"
                  onClick={initCheckout}
                  className="w-full py-3.5 rounded-xl bg-[#0a2e1c] text-white font-bold text-sm hover:bg-[#13472d]"
                >
                  Procéder au paiement (10 000 FCFA)
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-bold text-amber-950">
                    Transaction {pendingPay.reference} initiée (Sandbox PSP) :
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => simulateOutcome('succeeded')}
                      className="flex-1 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-xs font-bold"
                    >
                      Confirmer le paiement (Webhook)
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateOutcome('failed')}
                      className="px-3 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold"
                    >
                      Simuler échec
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
