'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateFr } from '@/lib/apiClient';
import type { PreventionArticle } from '@/lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Toutes les fiches',
  warmup: 'Échauffement',
  recovery: 'Récupération',
  mobility: 'Mobilité',
  hydration: 'Hydratation',
  basketball: 'Basketball',
  general: 'Général',
};

export default function PreventionLibraryPage() {
  const [articles, setArticles] = useState<PreventionArticle[]>([]);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    apiFetch<{ articles: PreventionArticle[] }>(`/api/public/prevention?category=${category}`)
      .then((res) => setArticles(res.articles || []))
      .catch(() => {});
  }, [category]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="surface-card rounded-xl p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-[#526057]">Prévention sportive validée</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#112118] mt-1">Bibliothèque Prévention Sportive</h1>
          <p className="text-sm text-[#526057] mt-1">
            Contenus généraux relus par des médecins pour préparer l’effort, récupérer et préserver vos appuis. Ne remplace jamais une consultation médicale.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(CATEGORY_LABELS).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  category === k
                    ? 'bg-[#0d3320] text-white border-[#0d3320]'
                    : 'bg-[#f4f5f0] text-[#112118] border-[#dcdfd6] hover:border-[#0d3320]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((art) => (
            <article key={art.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                {CATEGORY_LABELS[art.category] || art.category}
              </span>
              <h2 className="font-bold text-lg">{art.title}</h2>
              <p className="text-sm font-medium text-slate-700">{art.summary}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{art.content}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Validé par : {art.reviewer_name}</span>
                <span>{formatDateFr(art.validated_at)}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-sm text-[#0a2e1c]">Une gêne persiste à l’entraînement ?</p>
            <p className="text-xs text-slate-700">Demandez un avis à un médecin ou kinésithérapeute vérifié (10 000 FCFA).</p>
          </div>
          <Link href="/medecins" className="px-4 py-2 rounded-xl bg-[#0a2e1c] text-white text-sm font-bold">
            Demander un avis médical
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
