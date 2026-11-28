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
        <section className="obsidian-card rounded-2xl p-6 border-l-4 border-l-[#0D6E46] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0D6E46]">
              Espace Sportif (18+)
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] mt-1">Mon suivi médical &amp; sportif</h1>
            <p className="text-sm text-[#475E52] mt-1">
              Consultez un spécialiste (<strong className="font-mono tabular-nums text-[#063725]">10 000 FCFA</strong>), suivez vos séances et consultez votre dossier partagé.
            </p>
          </div>
          <Link
            href="/medecins"
            className="px-5 py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm inline-flex items-center gap-2 shrink-0 transition"
          >
            <Search className="w-4 h-4 text-[#FBBF24]" />
            Consulter un médecin (10 000 FCFA)
          </Link>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/sportif/suivi"
            className="obsidian-card rounded-2xl p-5 hover:border-[#0D6E46]/40 transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <Activity className="w-6 h-6 text-[#0D6E46]" />
              {signalsCount > 0 && (
                <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                  {signalsCount} signal{signalsCount > 1 ? 'x' : ''} vigilance
                </span>
              )}
            </div>
            <h2 className="font-display font-bold text-base text-[#063725]">Suivi &amp; Prévention</h2>
            <p className="text-xs text-[#475E52]">
              Journal d’entraînement, graphiques de fatigue, retour après blessure et dossier médical.
            </p>
            <span className="text-xs font-bold text-[#0D6E46] inline-flex items-center gap-1">
              Ouvrir <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link
            href="/sportif/dossiers"
            className="obsidian-card rounded-2xl p-5 hover:border-[#0D6E46]/40 transition space-y-2"
          >
            <FolderHeart className="w-6 h-6 text-[#0D6E46]" />
            <h2 className="font-display font-bold text-base text-[#063725]">Mes consultations ({cases.length})</h2>
            <p className="text-xs text-[#475E52]">
              Messagerie temps réel, partage images/vidéos, visio WebRTC et avis médecins.
            </p>
            <span className="text-xs font-bold text-[#0D6E46] inline-flex items-center gap-1">
              Voir mes dossiers <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>

          <div className="obsidian-card rounded-2xl p-5 space-y-2">
            <CalendarClock className="w-6 h-6 text-[#0D6E46]" />
            <h2 className="font-display font-bold text-base text-[#063725]">Prochain suivi recommandé</h2>
            <p className="text-sm font-semibold text-[#063725]">
              {nextFollowup ? formatDateFr(nextFollowup) : 'Aucun bilan planifié'}
            </p>
            <Link href="/medecins" className="text-xs font-bold text-[#475E52] hover:text-[#0D6E46] inline-flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5" /> Planifier une consultation
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
