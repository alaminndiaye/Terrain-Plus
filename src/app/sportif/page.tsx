'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, CalendarClock, FolderHeart, Search, Stethoscope } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateFr } from '@/lib/apiClient';

interface CaseSummary {
  id: string;
  reference: string;
  doctorName: string;
  doctorSpecialty: string;
  status: string;
  paymentUnlocked: boolean;
}

export default function AthleteDashboardPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [nextFollowup, setNextFollowup] = useState<string | null>(null);
  const [signalsCount, setSignalsCount] = useState(0);

  useEffect(() => {
    Promise.all([
      apiFetch<{ cases: CaseSummary[] }>('/api/athlete/cases').catch(() => ({ cases: [] })),
      apiFetch<{ medicalRecord: { nextFollowupAt?: string | null } | null }>('/api/athlete/followup').catch(() => ({
        medicalRecord: null,
      })),
      apiFetch<{ signals: Array<unknown> }>('/api/athlete/training-logs').catch(() => ({ signals: [] })),
    ]).then(([cRes, fRes, tRes]) => {
      setCases(cRes.cases || []);
      setNextFollowup(fRes.medicalRecord?.nextFollowupAt || null);
      setSignalsCount((tRes.signals || []).length);
    });
  }, []);

  return (
    <AppShell requireAuthRole="athlete">
      <div className="space-y-6">
        <section className="surface-card rounded-xl p-6 border-l-4 border-l-[#0d3320] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#526057]">
              Espace Sportif (18+)
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#112118] mt-1">Mon suivi médical &amp; sportif</h1>
            <p className="text-sm text-[#526057] mt-1">
              Consultez un spécialiste (<strong className="tabular-nums text-[#0d3320]">10 000 FCFA</strong>), suivez vos séances et consultez votre dossier partagé.
            </p>
          </div>
          <Link
            href="/medecins"
            className="px-5 py-3 rounded-lg bg-[#0d3320] hover:bg-[#14452c] text-white font-bold text-sm inline-flex items-center gap-2 shrink-0 transition"
          >
            <Search className="w-4 h-4 text-[#c8f62d]" />
            Consulter un médecin (10 000 FCFA)
          </Link>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/sportif/suivi"
            className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-[#0a2e1c] transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <Activity className="w-6 h-6 text-[#0a2e1c]" />
              {signalsCount > 0 && (
                <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  {signalsCount} signal{signalsCount > 1 ? 'x' : ''} vigilance
                </span>
              )}
            </div>
            <h2 className="font-bold text-base">Suivi &amp; Prévention</h2>
            <p className="text-xs text-slate-600">
              Journal d’entraînement, graphiques de fatigue, retour après blessure et dossier médical.
            </p>
            <span className="text-xs font-bold text-[#0a2e1c] inline-flex items-center gap-1">
              Ouvrir <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link
            href="/sportif/dossiers"
            className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-[#0a2e1c] transition space-y-2"
          >
            <FolderHeart className="w-6 h-6 text-[#0a2e1c]" />
            <h2 className="font-bold text-base">Mes consultations ({cases.length})</h2>
            <p className="text-xs text-slate-600">
              Messagerie temps réel, partage images/vidéos, visio WebRTC et avis médecins.
            </p>
            <span className="text-xs font-bold text-[#0a2e1c] inline-flex items-center gap-1">
              Voir mes dossiers <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-2">
            <CalendarClock className="w-6 h-6 text-[#0a2e1c]" />
            <h2 className="font-bold text-base">Prochain suivi recommandé</h2>
            <p className="text-sm font-semibold text-[#0a2e1c]">
              {nextFollowup ? formatDateFr(nextFollowup) : 'Aucun bilan planifié'}
            </p>
            <Link href="/medecins" className="text-xs font-bold text-slate-600 hover:text-[#0a2e1c] inline-flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5" /> Planifier une consultation
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
