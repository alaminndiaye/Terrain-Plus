'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ShieldCheck, Star, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatFcfa } from '@/lib/apiClient';

interface Specialty {
  id: string;
  slug: string;
  name: string;
  doctorsCount: number;
}

interface Doctor {
  id: string;
  publicName: string;
  specialtyName: string;
  specialtySlug: string;
  city: string;
  facilityName: string;
  supportsVideo: boolean;
  supportsPhysical: boolean;
  consultationFeeFcfa: number;
  averageRating: number | null;
  reviewsCount: number;
  languages: string[];
}

function DirectoryContent() {
  const searchParams = useSearchParams();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState(searchParams.get('specialty') || '');
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ specialties: Specialty[] }>('/api/public/specialties')
      .then((res) => setSpecialties(res.specialties || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedSpecialty) params.set('specialty', selectedSpecialty);
    if (mode) params.set('mode', mode);
    if (q.trim()) params.set('q', q.trim());

    apiFetch<{ doctors: Doctor[] }>(`/api/public/doctors?${params.toString()}`)
      .then((res) => setDoctors(res.doctors || []))
      .finally(() => setLoading(false));
  }, [selectedSpecialty, mode, q]);

  return (
    <div className="space-y-6">
      <section className="obsidian-card rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#E2EBE5] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0D6E46]">Annuaire vérifié Terrain+</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] mt-0.5">Trouver un médecin vérifié</h1>
            <p className="text-sm text-[#475E52] mt-1">
              Tarif unique <strong className="text-[#063725] font-mono tabular-nums">10 000 FCFA TTC</strong> pour discuter, partager vos images/vidéos et fixer un rendez-vous (Visio ou Cabinet).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center bg-[#F1F6F3] border border-[#D5E2DA] text-[#063725] rounded-full px-4 py-2.5 gap-2">
            <Search className="w-4 h-4 text-[#5B7064]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom du médecin, spécialité, ville ou clinique..."
              className="w-full text-sm outline-none bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            {['', 'video', 'physical'].map((m) => (
              <button
                key={m || 'all'}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${
                  mode === m
                    ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                    : 'bg-white text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
                }`}
              >
                {m === '' ? 'Tous modes' : m === 'video' ? 'Visio' : 'Cabinet'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => setSelectedSpecialty('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              selectedSpecialty === ''
                ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                : 'bg-[#F1F6F3] text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
            }`}
          >
            Toutes les spécialités
          </button>
          {specialties.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => setSelectedSpecialty(sp.slug === selectedSpecialty ? '' : sp.slug)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                selectedSpecialty === sp.slug
                  ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                  : 'bg-[#F1F6F3] text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
              }`}
            >
              {sp.name} ({sp.doctorsCount})
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="obsidian-card rounded-2xl p-8 text-center text-sm text-[#475E52]">
          Recherche des médecins vérifiés...
        </div>
      ) : doctors.length === 0 ? (
        <div className="obsidian-card rounded-2xl p-8 text-center">
          <p className="text-[#475E52] text-sm">Aucun médecin vérifié ne correspond à ces filtres.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {doctors.map((doc) => (
            <article
              key={doc.id}
              className="obsidian-card rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#0D6E46]/40 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D6E46] bg-[#ECF7F1] border border-[#C3D6CA] px-2.5 py-0.5 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Médecin vérifié
                  </span>
                  <span className="font-display font-extrabold text-base text-[#063725] font-mono tabular-nums">
                    {formatFcfa(doc.consultationFeeFcfa)}
                  </span>
                </div>

                <h2 className="font-display font-bold text-lg text-[#063725]">{doc.publicName}</h2>
                <p className="text-sm text-[#063725] font-medium">
                  {doc.specialtyName} · {doc.city}
                </p>
                <p className="text-xs text-[#5B7064]">{doc.facilityName}</p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-[#475E52]">
                  {doc.supportsVideo && (
                    <span className="inline-flex items-center gap-1 bg-[#F1F6F3] border border-[#E2EBE5] px-2.5 py-0.5 rounded-full font-medium text-[#063725]">
                      <Video className="w-3.5 h-3.5 text-[#0D6E46]" /> Visio
                    </span>
                  )}
                  {doc.supportsPhysical && (
                    <span className="bg-[#F1F6F3] border border-[#E2EBE5] px-2.5 py-0.5 rounded-full font-medium text-[#063725]">
                      Cabinet
                    </span>
                  )}
                  {doc.averageRating ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#B45309] tabular-nums">
                      <Star className="w-3.5 h-3.5 fill-[#FBBF24] text-[#D97706]" />
                      {doc.averageRating}/5 ({doc.reviewsCount} avis)
                    </span>
                  ) : (
                    <span className="text-[#5B7064]">Nouveau praticien</span>
                  )}
                </div>
              </div>

              <Link
                href={`/medecins/${doc.id}`}
                className="w-full py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-center text-sm font-semibold transition"
              >
                Choisir ce médecin (10 000 FCFA)
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DoctorsDirectoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-sm text-[#475E52]">Chargement de l’annuaire...</div>}>
        <DirectoryContent />
      </Suspense>
    </AppShell>
  );
}
