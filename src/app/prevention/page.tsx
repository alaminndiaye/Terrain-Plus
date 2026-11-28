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
        <section className="obsidian-card rounded-2xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0D6E46]">Prévention sportive validée</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] mt-1">Bibliothèque Prévention Sportive</h1>
          <p className="text-sm text-[#475E52] mt-1">
            Contenus généraux relus par des médecins pour préparer l’effort, récupérer et préserver vos appuis. Ne remplace jamais une consultation médicale.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(CATEGORY_LABELS).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                  category === k
                    ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                    : 'bg-[#F1F6F3] text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((art) => (
            <article key={art.id} className="obsidian-card rounded-2xl p-5 space-y-2.5">
              <span className="inline-block text-xs font-semibold text-[#0D6E46] bg-[#ECF7F1] border border-[#C3D6CA] px-2.5 py-0.5 rounded-full">
                {CATEGORY_LABELS[art.category] || art.category}
              </span>
              <h2 className="font-display font-bold text-lg text-[#063725]">{art.title}</h2>
              <p className="text-sm font-medium text-[#063725]">{art.summary}</p>
              <p className="text-sm text-[#475E52] leading-relaxed">{art.content}</p>
              <div className="pt-2.5 border-t border-[#E2EBE5] flex items-center justify-between text-xs text-[#5B7064]">
                <span>Validé par : {art.reviewer_name}</span>
                <span>{formatDateFr(art.validated_at)}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="obsidian-inset rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-[#C3D6CA]">
          <div>
            <p className="font-display font-bold text-sm text-[#063725]">Une gêne persiste à l’entraînement ?</p>
            <p className="text-xs text-[#475E52]">Demandez un avis à un médecin ou kinésithérapeute vérifié (10 000 FCFA).</p>
          </div>
          <Link href="/medecins" className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition">
            Demander un avis médical
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
