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
      <section className="surface-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#dcdfd6] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#526057]">Annuaire vérifié Terrain+</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#112118] mt-0.5">Trouver un médecin vérifié</h1>
            <p className="text-sm text-[#526057] mt-1">
              Tarif unique <strong className="text-[#0d3320] tabular-nums">10 000 FCFA TTC</strong> pour discuter, partager vos images/vidéos et fixer un rendez-vous (Visio ou Cabinet).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center bg-[#f4f5f0] border border-[#dcdfd6] text-[#112118] rounded-lg px-3.5 py-2.5 gap-2">
            <Search className="w-4 h-4 text-[#526057]" />
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
                className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition ${
                  mode === m
                    ? 'bg-[#0d3320] text-white border-[#0d3320]'
                    : 'bg-white text-[#112118] border-[#dcdfd6] hover:border-[#0d3320]'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              selectedSpecialty === ''
                ? 'bg-[#0d3320] text-white border-[#0d3320]'
                : 'bg-[#f4f5f0] text-[#112118] border-[#dcdfd6] hover:border-[#0d3320]'
            }`}
          >
            Toutes les spécialités
          </button>
          {specialties.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => setSelectedSpecialty(sp.slug === selectedSpecialty ? '' : sp.slug)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                selectedSpecialty === sp.slug
                  ? 'bg-[#0d3320] text-white border-[#0d3320]'
                  : 'bg-[#f4f5f0] text-[#112118] border-[#dcdfd6] hover:border-[#0d3320]'
              }`}
            >
              {sp.name} ({sp.doctorsCount})
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Recherche des médecins vérifiés...</p>
      ) : doctors.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <p className="text-slate-600 text-sm">Aucun médecin vérifié ne correspond à ces filtres.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {doctors.map((doc) => (
            <article
              key={doc.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Médecin vérifié
                  </span>
                  <span className="font-extrabold text-base text-[#0a2e1c]">
                    {formatFcfa(doc.consultationFeeFcfa)}
                  </span>
                </div>

                <h2 className="font-bold text-lg">{doc.publicName}</h2>
                <p className="text-sm text-slate-700 font-medium">
                  {doc.specialtyName} · {doc.city}
                </p>
                <p className="text-xs text-slate-500">{doc.facilityName}</p>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                  {doc.supportsVideo && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                      <Video className="w-3.5 h-3.5 text-[#0a2e1c]" /> Visio
                    </span>
                  )}
                  {doc.supportsPhysical && (
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md">Cabinet</span>
                  )}
                  {doc.averageRating ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      {doc.averageRating}/5 ({doc.reviewsCount} avis)
                    </span>
                  ) : (
                    <span className="text-slate-400">Nouveau praticien</span>
                  )}
                </div>
              </div>

              <Link
                href={`/medecins/${doc.id}`}
                className="w-full py-2.5 rounded-xl bg-[#0a2e1c] text-white text-center text-sm font-bold hover:bg-[#13472d] transition"
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
      <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Chargement de l’annuaire...</div>}>
        <DirectoryContent />
      </Suspense>
    </AppShell>
  );
}
