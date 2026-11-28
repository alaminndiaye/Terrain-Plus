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
            <h1 className="text-2xl font-bold">Mes consultations</h1>
            <p className="text-sm text-slate-600">
              Discussions, partage images/vidéos, rendez-vous Visio/Cabinet et avis médecins.
            </p>
          </div>
          <Link href="/medecins" className="px-4 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-sm font-bold">
            + Nouvelle consultation (10 000 FCFA)
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
            <p className="text-sm text-slate-600">Aucune consultation pour le moment.</p>
            <Link href="/medecins" className="inline-block px-5 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-sm font-bold">
              Choisir une spécialité
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-base">{c.doctorName}</strong>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 font-semibold">{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {c.doctorSpecialty} · {c.reference} · {formatDateTimeFr(c.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!c.paymentUnlocked && (
                    <Link
                      href={`/sportif/paiement/${c.id}`}
                      className="px-4 py-2 rounded-xl bg-[#c8f62d] text-[#0a2e1c] text-xs font-bold"
                    >
                      Payer 10 000 FCFA
                    </Link>
                  )}
                  <Link
                    href={`/sportif/dossiers/${c.id}`}
                    className="px-4 py-2 rounded-xl bg-[#0a2e1c] text-white text-xs font-bold"
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
