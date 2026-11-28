'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Video,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatFcfa } from '@/lib/apiClient';

interface SpecialtyItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  doctorsCount: number;
}

interface DoctorItem {
  id: string;
  publicName: string;
  specialtyName: string;
  city: string;
  facilityName: string;
  supportsVideo: boolean;
  supportsPhysical: boolean;
  consultationFeeFcfa: number;
  averageRating: number | null;
  reviewsCount: number;
}

export default function HomePage() {
  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ specialties: SpecialtyItem[] }>('/api/public/specialties').catch(() => ({ specialties: [] })),
      apiFetch<{ doctors: DoctorItem[] }>('/api/public/doctors').catch(() => ({ doctors: [] })),
    ]).then(([spRes, docRes]) => {
      setSpecialties(spRes.specialties || []);
      setDoctors((docRes.doctors || []).slice(0, 3));
    });
  }, []);

  return (
    <AppShell>
      {/* Présentation plateforme — aplat net sans dégradé */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-10">
        <div className="lg:col-span-8 panel-forest text-white rounded-xl p-6 sm:p-9 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-[#14452c] border border-[#23543a] rounded-md px-3 py-1 text-xs font-semibold text-[#c8f62d]">
              <ShieldCheck className="w-4 h-4" />
              Suivi médical sportif régulier · Adultes 18+ · Sénégal
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15]">
              Vos médecins du sport vérifiés et votre suivi d’entraînement, au même endroit.
            </h1>

            <p className="text-stone-200 text-base leading-relaxed max-w-2xl">
              Échangez avec un spécialiste vérifié, partagez vos images ou vidéos et fixez votre rendez-vous en{' '}
              <strong className="text-white">visio intégrée</strong> ou en{' '}
              <strong className="text-white">cabinet</strong> pour un forfait unique de{' '}
              <strong className="text-[#c8f62d] tabular-nums">10 000 FCFA</strong> par consultation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/auth?tab=register"
              className="px-5 py-3 rounded-lg bg-[#c8f62d] text-[#0d3320] font-bold text-sm hover:bg-[#bce827] transition inline-flex items-center gap-2"
            >
              S’inscrire (Sportif ou Médecin)
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth?tab=login"
              className="px-5 py-3 rounded-lg bg-[#14452c] hover:bg-[#1b5739] text-white font-semibold text-sm transition border border-[#275d41]"
            >
              Se connecter
            </Link>
            <Link
              href="/medecins"
              className="px-3 py-2 text-sm font-semibold text-stone-200 hover:text-[#c8f62d] underline-offset-4 hover:underline"
            >
              Parcourir les spécialités →
            </Link>
          </div>
        </div>

        <aside className="lg:col-span-4 surface-card rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#526057]">
              Repères Terrain+
            </p>
            <div className="border-t border-[#dcdfd6] pt-3">
              <p className="text-2xl font-extrabold text-[#0d3320] tabular-nums">10 000 FCFA</p>
              <p className="text-xs text-[#526057] mt-0.5">
                Tarif fixe TTC pour une consultation complète (discussion, médias, RDV visio ou cabinet).
              </p>
            </div>
            <div className="border-t border-[#dcdfd6] pt-3">
              <p className="text-sm font-bold text-[#112118]">Médecins vérifiés manuellement</p>
              <p className="text-xs text-[#526057] mt-0.5">
                Contrôle de l’inscription à l’Ordre et des pièces justificatives sous 72 h ouvrées.
              </p>
            </div>
            <div className="border-t border-[#dcdfd6] pt-3">
              <p className="text-sm font-bold text-[#112118]">Dossier médical longitudinal</p>
              <p className="text-xs text-[#526057] mt-0.5">
                Synthèse remplie avant clôture et consultable par vos prochains praticiens sur Terrain+.
              </p>
            </div>
          </div>
          <Link
            href="/prevention"
            className="text-xs font-bold text-[#0d3320] hover:underline pt-2 border-t border-[#dcdfd6] flex items-center justify-between"
          >
            <span>Découvrir la rubrique Suivi &amp; prévention</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </aside>
      </section>

      {/* Parcours en 4 étapes claires */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          {
            step: '01 · OTP SMS',
            title: 'Compte vérifié (18+)',
            desc: 'Prénom, nom, numéro, adresse et code OTP reçu par SMS avant votre première entrée.',
            icon: CheckCircle2,
          },
          {
            step: '02 · Première entrée',
            title: 'Profil & Suivi sportif',
            desc: 'Indiquez vos sports, votre fréquence et vos antécédents pour un suivi continu.',
            icon: Activity,
          },
          {
            step: '03 · 10 000 FCFA',
            title: 'Accès direct au médecin',
            desc: 'Choisissez par spécialité et réglez 10 000 FCFA pour ouvrir le chat et fixer le RDV.',
            icon: Video,
          },
          {
            step: '04 · Dossier partagé',
            title: 'Suivi médical régulier',
            desc: 'Compte-rendu structuré conservé pour vos futures consultations, même avec un autre médecin.',
            icon: CalendarCheck,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.step} className="surface-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-[#0d3320] bg-[#f4f5f0] border border-[#dcdfd6] px-2.5 py-0.5 rounded-md tabular-nums">
                  {card.step}
                </span>
                <Icon className="w-4 h-4 text-[#0d3320]" />
              </div>
              <h2 className="font-bold text-base mb-1">{card.title}</h2>
              <p className="text-sm text-[#526057] leading-relaxed">{card.desc}</p>
            </div>
          );
        })}
      </section>

      {/* Grille des spécialités médicales */}
      {specialties.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Choisir par spécialité médicale</h2>
              <p className="text-sm text-slate-600">
                Tous nos praticiens sont vérifiés manuellement avant publication · Consultation unique à 10 000 FCFA.
              </p>
            </div>
            <Link href="/medecins" className="text-sm font-semibold text-[#0a2e1c] hover:underline">
              Tout voir →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {specialties.map((sp) => (
              <Link
                key={sp.id}
                href={`/medecins?specialty=${encodeURIComponent(sp.slug)}`}
                className="surface-card rounded-xl p-5 hover:border-[#0d3320] transition flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-lg bg-[#f4f5f0] border border-[#dcdfd6] text-[#0d3320]">
                      <Stethoscope className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-semibold text-[#526057] tabular-nums">
                      {sp.doctorsCount} médecin{sp.doctorsCount > 1 ? 's' : ''} vérifié{sp.doctorsCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <h3 className="font-bold text-base">{sp.name}</h3>
                  <p className="text-sm text-[#526057] mt-1">{sp.description}</p>
                </div>
                <span className="text-xs font-bold text-[#0d3320]">Consulter les praticiens →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Aperçu médecins vérifiés */}
      {doctors.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Médecins vérifiés disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {doctors.map((doc) => (
              <div key={doc.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Médecin vérifié
                    </span>
                    <span className="text-sm font-extrabold text-[#0a2e1c]">{formatFcfa(doc.consultationFeeFcfa)}</span>
                  </div>
                  <h3 className="font-bold text-lg">{doc.publicName}</h3>
                  <p className="text-sm text-slate-600">
                    {doc.specialtyName} · {doc.city}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{doc.facilityName}</p>
                </div>
                <Link
                  href={`/medecins/${doc.id}`}
                  className="w-full text-center py-2.5 rounded-xl bg-[#0a2e1c] text-white text-sm font-semibold hover:bg-[#13472d] transition"
                >
                  Voir le profil &amp; consulter
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Encarts Prévention & Urgences */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 flex flex-col justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
              Suivi &amp; Prévention
            </span>
            <h3 className="font-bold text-lg mt-2">Journal d’entraînement &amp; fiches validées</h3>
            <p className="text-sm text-slate-600 mt-1">
              Suivez votre charge d’entraînement, votre fatigue et vos éventuelles gênes en toute confidentialité, avec
              des fiches prévention relues par des médecins.
            </p>
          </div>
          <Link
            href="/prevention"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0a2e1c] hover:underline"
          >
            Explorer la bibliothèque prévention <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="bg-red-50 rounded-2xl p-6 border border-red-200 flex flex-col justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">
              <ShieldAlert className="w-3.5 h-3.5" />
              Vigilance Urgences
            </span>
            <h3 className="font-bold text-lg text-red-950 mt-2">Choc à la tête ou douleur thoracique à l’effort ?</h3>
            <p className="text-sm text-red-900 mt-1">
              Accédez librement aux consignes d’arrêt immédiat et aux contacts d’urgence sans créer de compte ni attendre
              une réponse de messagerie.
            </p>
          </div>
          <Link
            href="/urgence"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-red-800 hover:underline"
          >
            Consulter les consignes d’urgence <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
