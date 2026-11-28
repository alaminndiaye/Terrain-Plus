'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';

interface CaseRow {
  id: string;
  reference: string;
  doctorName: string;
  doctorSpecialty: string;
  mode: string;
  status: string;
  paymentUnlocked: boolean;
  createdAt: string;
}

export default function AthleteCasesListPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);

  useEffect(() => {
    apiFetch<{ cases: CaseRow[] }>('/api/athlete/cases')
      .then((res) => setCases(res.cases || []))
      .catch(() => {});
  }, []);

  return (
    <AppShell requireAuthRole="athlete">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#063725]">Mes consultations</h1>
            <p className="text-sm text-[#475E52]">
              Discussions, partage images/vidéos, rendez-vous Visio/Cabinet et avis médecins.
            </p>
          </div>
          <Link href="/medecins" className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition">
            + Nouvelle consultation (10 000 FCFA)
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="obsidian-card rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm text-[#475E52]">Aucune consultation pour le moment.</p>
            <Link href="/medecins" className="inline-block px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition">
              Choisir une spécialité
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <div
                key={c.id}
                className="obsidian-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="font-display text-base text-[#063725]">{c.doctorName}</strong>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] font-semibold">
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#475E52] mt-1 font-mono tabular-nums">
                    {c.doctorSpecialty} · {c.reference} · {formatDateTimeFr(c.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!c.paymentUnlocked && (
                    <Link
                      href={`/sportif/paiement/${c.id}`}
                      className="px-4 py-2 rounded-full bg-[#FEF3C7] border border-[#F59E0B]/40 text-[#92400E] hover:bg-[#FDE68A] text-xs font-bold transition"
                    >
                      Payer 10 000 FCFA
                    </Link>
                  )}
                  <Link
                    href={`/sportif/dossiers/${c.id}`}
                    className="px-4 py-2 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-xs font-semibold transition"
                  >
                    Ouvrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
