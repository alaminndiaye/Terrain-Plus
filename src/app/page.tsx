'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Stethoscope,
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
  consultationFeeFcfa: number;
}

type SportKey = 'football' | 'basketball' | 'athletisme' | 'handball' | 'volleyball' | 'fitness';

interface SportShowcase {
  code: SportKey;
  nom: string;
  subtitle: string;
  imageUrl: string;
  watchedZones: string[];
  recommendedFollowup: string[];
  indicators: string;
}

const SPORTS_LIST: SportShowcase[] = [
  {
    code: 'football',
    nom: 'Football',
    subtitle: 'Courses répétées, accélérations, appuis et récupération post-match',
    imageUrl: '/images/sports/football.jpg',
    watchedZones: [
      'Ischio-jambiers & quadriceps',
      'Cheville et ligaments du genou',
      'Adducteurs et pubalgie d’effort',
      'Chocs crâniens et duels aériens',
    ],
    recommendedFollowup: [
      'Bilan régulier Médecine du sport',
      'Suivi charge hebdomadaire (RPE & fatigue)',
      'Avis traumatologique rapide si entorse',
      'Protocole de reprise validé avant match',
    ],
    indicators: 'Charge · Fatigue · Gênes appuis',
  },
  {
    code: 'basketball',
    nom: 'Basketball',
    subtitle: 'Réceptions de saut, pivots rapides, doigts et charge de match',
    imageUrl: '/images/sports/basketball.jpg',
    watchedZones: [
      'Chevilles lors des réceptions',
      'Tendon rotulien et genoux',
      'Doigts, poignets et contacts',
      'Vigilance fatigue et commotions',
    ],
    recommendedFollowup: [
      'Prévention dédiée appuis & réceptions',
      'Suivi minutes jouées & récupération',
      'Kinésithérapie du sport & rééducation',
      'Feu vert médical avant retour collectif',
    ],
    indicators: 'Réceptions · Sommeil · Récupération',
  },
  {
    code: 'athletisme',
    nom: 'Athlétisme',
    subtitle: 'Volume de course, vitesse, gestion tendineuse et endurance sous chaleur',
    imageUrl: '/images/sports/athletisme.jpg',
    watchedZones: [
      'Tendon d’Achille et mollets',
      'Périostites tibiales et pieds',
      'Hydratation et bilan cardiaque à l’effort',
      'Signes de surcharge progressive',
    ],
    recommendedFollowup: [
      'Suivi cardiologie & médecine du sport',
      'Contrôle progressif du volume d’effort',
      'Hydratation adaptée au climat sénégalais',
      'Historique médical partagé entre praticiens',
    ],
    indicators: 'Volume · Hydratation · Récupération',
  },
  {
    code: 'handball',
    nom: 'Handball',
    subtitle: 'Lancers haute intensité, contacts, épaule et changements de direction',
    imageUrl: '/images/sports/handball.jpg',
    watchedZones: [
      'Épaule du bras lanceur et coude',
      'Genoux sur appuis bloqués',
      'Contacts et traumatismes articulaires',
      'Récupération entre entraînements',
    ],
    recommendedFollowup: [
      'Bilan orthopédique / médecine du sport',
      'Mobilité d’épaule et échauffement ciblé',
      'Partage images ou vidéos en consultation',
      'Étapes progressives de reprise encadrées',
    ],
    indicators: 'Épaule · Intensité · Récupération',
  },
  {
    code: 'volleyball',
    nom: 'Volleyball',
    subtitle: 'Sauts répétés, attaques au filet, épaules et lombaires',
    imageUrl: '/images/sports/volleyball.jpg',
    watchedZones: [
      'Épaule d’attaque et coiffe des rotateurs',
      'Genou du sauteur (tendon rotulien)',
      'Lombaires et gainage d’extension',
      'Doigts et chevilles sous le filet',
    ],
    recommendedFollowup: [
      'Journal d’entraînement & vigilance gênes',
      'Suivi kinésithérapie & mobilité articulaire',
      'Téléconsultation Visio ou Cabinet (10 000 F)',
      'Dossier patient conservé à chaque suivi',
    ],
    indicators: 'Sauts · Épaule · Fatigue',
  },
  {
    code: 'fitness',
    nom: 'Fitness & Prépa',
    subtitle: 'Renforcement musculaire, mobilité, posture et prévention des blessures',
    imageUrl: '/images/sports/fitness.jpg',
    watchedZones: [
      'Dos, lombaires et ceinture scapulaire',
      'Articulations sous charge (genou / hanche)',
      'Sommeil, fatigue et récupération nerveuse',
      'Hydratation et nutrition d’effort',
    ],
    recommendedFollowup: [
      'Suivi médical de forme et bilan d’aptitude',
      'Fiches validées d’échauffement & mobilité',
      'Journal de charge simple sur mobile',
      'Avis médical sur consentement uniquement',
    ],
    indicators: 'Charge · Sommeil · Mobilité',
  },
];

const HEALTH_NEEDS: Array<{
  code: 'regular_followup' | 'injury_advice' | 'prevention' | 'return_to_sport';
  shortLabel: string;
  label: string;
  description: string;
  recommendedSpecialty: string;
  specialtySlug: string;
  summary: string;
}> = [
  {
    code: 'regular_followup',
    shortLabel: 'Suivi médical régulier',
    label: 'Bilan périodique et suivi continu (18+)',
    description: 'Faites le point régulièrement avec un médecin vérifié et gardez votre dossier à jour.',
    recommendedSpecialty: 'Médecine du sport',
    specialtySlug: 'medecine-du-sport',
    summary:
      'Votre médecin met à jour votre dossier médical longitudinal après chaque consultation pour assurer la continuité même avec d’autres spécialistes.',
  },
  {
    code: 'injury_advice',
    shortLabel: 'Douleur ou blessure',
    label: 'Avis rapide sur une douleur, entorse ou gêne',
    description: 'Discutez directement avec un spécialiste, partagez photos/vidéos et fixez un RDV.',
    recommendedSpecialty: 'Traumatologie & Orthopédie',
    specialtySlug: 'traumatologie-orthopedie',
    summary:
      'Pour 10 000 FCFA TTC, échangez dans un espace sécurisé, joignez vos examens ou vidéos de mouvement et prenez RDV en Visio ou au Cabinet.',
  },
  {
    code: 'prevention',
    shortLabel: 'Suivi & Prévention',
    label: 'Suivre entraînements, fatigue et charge',
    description: 'Journal personnel privé avec signaux de vigilance non diagnostiques et fiches validées.',
    recommendedSpecialty: 'Prévention & Médecine du sport',
    specialtySlug: 'medecine-du-sport',
    summary:
      'Enregistrez durée, intensité, sommeil et gênes éventuelles. Vous décidez librement quand partager vos courbes lors d’une consultation médicale.',
  },
  {
    code: 'return_to_sport',
    shortLabel: 'Retour après blessure',
    label: 'Reprendre le terrain par étapes validées',
    description: 'Un parcours graduel défini et validé uniquement par votre médecin ou kiné.',
    recommendedSpecialty: 'Kinésithérapie & Réadaptation',
    specialtySlug: 'kinesitherapie-readaptation',
    summary:
      'Progressez étape par étape sous contrôle clinique : la plateforme ne déclare jamais d’aptitude automatique, seul votre praticien valide la reprise.',
  },
];

export default function HomePage() {
  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [selectedNeed, setSelectedNeed] = useState<(typeof HEALTH_NEEDS)[number]['code']>('regular_followup');

  useEffect(() => {
    Promise.all([
      apiFetch<{ specialties: SpecialtyItem[] }>('/api/public/specialties').catch(() => ({ specialties: [] })),
      apiFetch<{ doctors: DoctorItem[] }>('/api/public/doctors').catch(() => ({ doctors: [] })),
    ]).then(([spRes, docRes]) => {
      setSpecialties(spRes.specialties || []);
      setDoctors((docRes.doctors || []).slice(0, 3));
    });
  }, []);

  useEffect(() => {
    if (carouselPaused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setPreviewIdx((prev) => (prev + 1) % SPORTS_LIST.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

  const activeSport = SPORTS_LIST[previewIdx];
  const activeNeed = HEALTH_NEEDS.find((n) => n.code === selectedNeed) || HEALTH_NEEDS[0];

  function selectSport(idx: number) {
    setPreviewIdx(idx);
    setCarouselPaused(true);
  }

  function stepCarousel(delta: -1 | 1) {
    setPreviewIdx((prev) => (prev + delta + SPORTS_LIST.length) % SPORTS_LIST.length);
    setCarouselPaused(true);
  }

  return (
    <AppShell fullBleedMain>
      {/* SECTION 1 : Hero Carrousel photo plein cadre (6 sports, voile uniforme sans dégradé) */}
      <section aria-label="Présentation des 6 disciplines Terrain+" className="relative overflow-hidden bg-[#063725]">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          {SPORTS_LIST.map((sport, idx) => (
            <img
              key={sport.code}
              src={sport.imageUrl}
              alt=""
              loading={idx === 0 ? 'eager' : 'lazy'}
              className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
                idx === previewIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]'
              }`}
            />
          ))}
          {/* Voile uni de contraste sans dégradé */}
          <div className="absolute inset-0 bg-[#063725]/72" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:pt-12 sm:pb-14 lg:py-16">
          <div className="max-w-3xl text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-semibold tracking-wide text-[#FBBF24] tabular-nums truncate">
                0{previewIdx + 1} / 06 · {activeSport.nom} · Adultes 18+ · 10 000 FCFA / consultation
              </p>

              <div className="inline-flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => stepCarousel(-1)}
                  aria-label="Discipline précédente"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-white/30 bg-white/15 text-white hover:bg-white/25 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCarouselPaused((p) => !p)}
                  aria-label={carouselPaused ? 'Relancer le carrousel' : 'Mettre en pause le carrousel'}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-white/30 bg-white/15 text-white hover:bg-white/25 transition-colors"
                >
                  {carouselPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => stepCarousel(1)}
                  aria-label="Discipline suivante"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-white/30 bg-white/15 text-white hover:bg-white/25 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <h1 className="mt-4 text-2xl leading-[1.15] sm:text-4xl lg:text-[3rem] font-extrabold tracking-tight text-white">
              Votre suivi médical et votre forme <span className="text-[#FBBF24]">{activeSport.nom}</span> entre bonnes mains
            </h1>

            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-white/95 leading-relaxed max-w-2xl">
              {activeSport.subtitle}. Consultez un médecin vérifié par spécialité pour{' '}
              <strong className="text-[#FBBF24] tabular-nums">10 000 FCFA</strong> (chat, partage photos/vidéos, RDV
              Visio ou Cabinet) et suivez votre charge dans votre espace <strong>Suivi &amp; prévention</strong>.
            </p>

            <div className="hidden sm:flex sm:mt-4 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/90">
              <span>Vérification SMS OTP (18+)</span>
              <span aria-hidden="true" className="text-white/50">·</span>
              <span>Médecins contrôlés manuellement</span>
              <span aria-hidden="true" className="text-white/50">·</span>
              <span className="text-[#FBBF24] font-semibold">Suivi : {activeSport.indicators}</span>
            </div>

            <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/auth?tab=register"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-xs sm:text-sm font-bold text-[#063725] hover:bg-[#ECF7F1] transition-colors min-h-[44px] shadow-sm whitespace-nowrap"
              >
                <span>S’inscrire (Sportif ou Médecin)</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
              <Link
                href="/medecins"
                className="inline-flex items-center justify-center rounded-full border border-white/35 bg-white/15 px-5 py-3 text-xs sm:text-sm font-semibold text-white hover:bg-white/25 transition-colors min-h-[44px] whitespace-nowrap"
              >
                Choisir un médecin par spécialité
              </Link>
            </div>

            {/* Barre de sélection des 6 sports en bas du carrousel */}
            <div className="mt-6 pt-4 border-t border-white/20">
              <div className="hidden sm:flex items-center justify-between text-[11px] text-white/80 mb-2.5">
                <span>6 disciplines suivies sur Terrain+ · Touchez pour changer d’aperçu</span>
                <span className="font-mono">6 sports</span>
              </div>
              <div
                role="tablist"
                aria-label="Carrousel des 6 sports"
                className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap"
              >
                {SPORTS_LIST.map((sport, idx) => {
                  const active = idx === previewIdx;
                  return (
                    <button
                      key={sport.code}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => selectSport(idx)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors min-h-[38px] whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white text-[#063725] shadow-sm'
                          : 'border border-white/25 bg-white/15 text-white hover:bg-white/25'
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-75">0{idx + 1}</span>
                      <span>{sport.nom}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 : Votre besoin médical et sportif d'abord (grille 7/5 fidèle à l'ancien #objectif) */}
      <section id="objectif" className="border-b border-[#D5E2DA] bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#0D6E46]">
              Étape 1 · Parcours personnalisé · Sportifs 18+ &amp; Médecins vérifiés
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#063725]">
              Quel est votre besoin aujourd’hui ?
            </h2>
            <p className="text-sm text-[#475E52] max-w-2xl">
              Après votre inscription par code OTP SMS et votre questionnaire sportif de première connexion, sélectionnez le suivi médical ou préventif adapté.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HEALTH_NEEDS.map((need) => {
                const active = selectedNeed === need.code;
                return (
                  <button
                    key={need.code}
                    type="button"
                    onClick={() => setSelectedNeed(need.code)}
                    className={`rounded-2xl border p-4 text-left transition-colors flex flex-col justify-between gap-2.5 min-h-[120px] ${
                      active
                        ? 'border-[#0D6E46] bg-[#ECF7F1]'
                        : 'border-[#D5E2DA] bg-[#F6F8F5] hover:border-[#0D6E46]/45 hover:bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#063725]">{need.shortLabel}</span>
                        {active && <CheckCircle2 className="h-4 w-4 text-[#0D6E46] shrink-0" />}
                      </div>
                      <p className="text-xs text-[#475E52] leading-relaxed">{need.description}</p>
                    </div>
                    <div className="text-[11px] font-semibold text-[#0D6E46]">
                      Orientation : {need.recommendedSpecialty}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#D5E2DA] bg-[#F6F8F5] p-5 sm:p-6 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#5B7064]">Votre parcours Terrain+</div>
                  <h3 className="text-lg font-bold text-[#063725]">{activeNeed.label}</h3>
                  <p className="text-xs text-[#475E52] leading-relaxed">{activeNeed.summary}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#3D5246]">Votre discipline principale</span>
                    <span className="font-semibold text-[#0D6E46]">{activeSport.nom}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SPORTS_LIST.map((sp, idx) => {
                      const isSportActive = idx === previewIdx;
                      return (
                        <button
                          key={sp.code}
                          type="button"
                          onClick={() => selectSport(idx)}
                          className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors min-h-[38px] truncate ${
                            isSportActive
                              ? 'bg-[#0D6E46] text-white'
                              : 'border border-[#D5E2DA] bg-white text-[#3D5246] hover:text-[#063725]'
                          }`}
                        >
                          {sp.nom}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#E2EBE5]">
                <Link
                  href={
                    selectedNeed === 'prevention'
                      ? '/prevention'
                      : `/medecins?specialty=${encodeURIComponent(activeNeed.specialtySlug)}`
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0D6E46] px-5 py-3 text-xs sm:text-sm font-bold text-white hover:bg-[#095637] transition-colors min-h-[44px]"
                >
                  <span className="truncate">
                    {selectedNeed === 'prevention'
                      ? `Ouvrir Prévention (${activeSport.nom})`
                      : `Voir les spécialistes · ${activeNeed.recommendedSpecialty}`}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
                <p className="text-[11px] text-[#5B7064] leading-snug">
                  Plateforme réservée aux majeurs (18+). Tarif unique 10 000 FCFA par consultation avec un médecin vérifié.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3 : Bandeau 4 cartes sur fond #F6F8F5 */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl obsidian-card p-5">
            <Smartphone className="h-5 w-5 text-[#0D6E46]" />
            <h2 className="mt-3 text-sm font-bold text-[#063725]">Vérification SMS OTP (18+)</h2>
            <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
              Inscription simple (prénom, nom, numéro, adresse) avec code OTP reçu par SMS avant l’entrée.
            </p>
          </div>
          <div className="rounded-2xl obsidian-card p-5">
            <Stethoscope className="h-5 w-5 text-[#0D6E46]" />
            <h2 className="mt-3 text-sm font-bold text-[#063725]">Médecins vérifiés 72 h</h2>
            <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
              Contrôle des justificatifs professionnels avant publication. Recherche filtrée par spécialité.
            </p>
          </div>
          <div className="rounded-2xl obsidian-card p-5">
            <Activity className="h-5 w-5 text-[#0D6E46]" />
            <h2 className="mt-3 text-sm font-bold text-[#063725]">Suivi &amp; prévention privé</h2>
            <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
              Journal d’entraînement, courbes de fatigue/gênes et contenus validés sans partage club automatique.
            </p>
          </div>
          <div className="rounded-2xl obsidian-card p-5">
            <Lock className="h-5 w-5 text-[#0D6E46]" />
            <h2 className="mt-3 text-sm font-bold text-[#063725]">Dossier médical partagé</h2>
            <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
              Mis à jour obligatoirement à chaque clôture pour vos futures consultations, même avec un autre médecin.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4 : Vitrine photo & prévention par sport (grille 5/7 fidèle à l'ancien #sports) */}
      <section id="sports" className="border-y border-[#D5E2DA] bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#063725]">
                Un suivi et des repères de prévention adaptés à chaque sport
              </h2>
              <p className="mt-2 text-sm text-[#475E52] max-w-2xl">
                Choisissez votre discipline pour voir les zones surveillées, les conseils de prévention et les spécialités médicales associées.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] p-1 self-start">
              {SPORTS_LIST.map((sp, idx) => (
                <button
                  key={sp.code}
                  type="button"
                  onClick={() => selectSport(idx)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors min-h-[38px] whitespace-nowrap ${
                    idx === previewIdx
                      ? 'bg-[#0D6E46] text-white'
                      : 'text-[#3D5246] hover:text-[#063725]'
                  }`}
                >
                  {sp.nom}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5">
              <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] overflow-hidden rounded-3xl border border-[#D5E2DA] bg-[#F1F6F3]">
                <img
                  src={activeSport.imageUrl}
                  alt={`Terrain ${activeSport.nom}`}
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-3 left-3 bg-[#063725] text-white px-3.5 py-1.5 rounded-full text-xs font-bold">
                  Discipline : {activeSport.nom}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl border border-[#0D6E46]/25 bg-white p-6 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-[#063725]">Suivi sportif &amp; médical · {activeSport.nom}</h3>
                <p className="mt-1.5 text-sm text-[#475E52]">{activeSport.subtitle}</p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-semibold text-[#5B7064] uppercase tracking-wider">
                      Zones surveillées fréquemment
                    </h4>
                    <ul className="mt-2.5 space-y-2 text-sm text-[#063725]">
                      {activeSport.watchedZones.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#0D6E46]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-[#5B7064] uppercase tracking-wider">
                      Accompagnement Terrain+
                    </h4>
                    <ul className="mt-2.5 space-y-2 text-sm text-[#063725]">
                      {activeSport.recommendedFollowup.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#0D6E46]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[#E2EBE5] flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-[#475E52]">
                  Indicateurs du journal : <strong className="text-[#063725]">{activeSport.indicators}</strong>
                </div>
                <Link
                  href="/medecins"
                  className="rounded-full bg-[#0D6E46] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#095637] transition-colors min-h-[40px] inline-flex items-center whitespace-nowrap"
                >
                  Consulter un spécialiste ({formatFcfa(10000)})
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 : Les 4 étapes + Spécialités & Médecins en direct depuis Supabase */}
      <section id="programme" className="mx-auto max-w-6xl px-4 py-12 sm:py-14 sm:px-6 space-y-10">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#063725]">
            Un parcours simple du premier clic jusqu’au suivi régulier
          </h2>
          <p className="mt-2 text-sm text-[#475E52] max-w-2xl">
            Du contrôle d’identité par SMS jusqu’au rendez-vous en Visio ou au Cabinet, tout se passe dans un espace chiffré et structuré.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">01</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Inscription OTP SMS</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Prénom, nom, numéro, adresse, majorité 18+ et code OTP par SMS obligatoire avant la première entrée.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">02</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Profil &amp; Journal sportif</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Questions de première connexion (sport, niveau, fréquence) puis suivi privé de vos séances et gênes.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">03</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Spécialité &amp; 10 000 FCFA</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Choisissez votre médecin selon sa spécialité et réglez 10 000 FCFA pour débloquer le dossier de consultation.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">04</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Chat, Médias, Visio &amp; Dossier</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Échangez images/vidéos, fixez le RDV Visio ou Cabinet, mettez à jour le dossier partagé et notez le médecin.
              </p>
            </div>
          </div>
        </div>

        {/* Spécialités médicales live depuis Supabase */}
        {specialties.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[#063725]">Spécialités disponibles</h3>
              <Link href="/medecins" className="text-xs font-bold text-[#0D6E46] hover:underline">
                Voir tout l’annuaire →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {specialties.map((sp) => (
                <Link
                  key={sp.id}
                  href={`/medecins?specialty=${encodeURIComponent(sp.slug)}`}
                  className="rounded-2xl obsidian-card p-5 hover:border-[#0D6E46] transition flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="p-2 rounded-xl bg-[#ECF7F1] text-[#0D6E46]">
                        <Stethoscope className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-semibold text-[#5B7064] tabular-nums">
                        {sp.doctorsCount} médecin{sp.doctorsCount > 1 ? 's' : ''} vérifié{sp.doctorsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <h4 className="font-bold text-base text-[#063725]">{sp.name}</h4>
                    <p className="text-xs text-[#475E52] mt-1">{sp.description}</p>
                  </div>
                  <span className="text-xs font-bold text-[#0D6E46] pt-1">Consulter →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Médecins vérifiés live */}
        {doctors.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-[#063725] mb-4">Praticiens vérifiés disponibles</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {doctors.map((doc) => (
                <div key={doc.id} className="rounded-2xl obsidian-card p-5 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0D6E46] bg-[#ECF7F1] px-2.5 py-0.5 rounded-full">
                        <ShieldCheck className="w-3.5 h-3.5" /> Vérifié
                      </span>
                      <span className="font-mono text-sm font-bold text-[#063725] tabular-nums">
                        {formatFcfa(doc.consultationFeeFcfa)}
                      </span>
                    </div>
                    <h4 className="font-bold text-base text-[#063725]">{doc.publicName}</h4>
                    <p className="text-xs text-[#475E52] mt-0.5">
                      {doc.specialtyName} · {doc.city}
                    </p>
                    <p className="text-xs text-[#5B7064] mt-1">{doc.facilityName}</p>
                  </div>
                  <Link
                    href={`/medecins/${doc.id}`}
                    className="w-full text-center py-2.5 rounded-full bg-[#0D6E46] text-white text-xs font-bold hover:bg-[#095637] transition"
                  >
                    Voir le profil &amp; consulter
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 6 : Sécurité & Confidentialité médicale (grille 5/7 fidèle à l'ancien #securite) */}
      <section id="securite" className="border-y border-[#D5E2DA] bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0D6E46]">
                <ShieldCheck className="h-4 w-4 text-[#0D6E46]" />
                <span>Secret médical, confidentialité &amp; gouvernance</span>
              </div>
              <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-[#063725]">
                Vos données de santé et vos performances ne dépendent d’aucun club
              </h2>
              <p className="mt-3 text-sm text-[#475E52] leading-relaxed">
                Les douleurs déclarées, les échanges médicaux et les vidéos restent strictement privés entre vous et le médecin choisi. Les discussions du forum professionnel entre médecins sont anonymisées par défaut.
              </p>
              <Link
                href="/urgence"
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-800 hover:bg-red-100 transition"
              >
                <ShieldAlert className="h-4 w-4" />
                Consignes d’urgence (choc crânien / malaise)
              </Link>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl obsidian-inset p-4">
                <h3 className="text-sm font-bold text-[#063725]">Cloisonnement strict &amp; chiffrement</h3>
                <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                  L’administrateur n’a aucun accès par défaut au contenu médical. Tout accès support exceptionnel (15 min max) est justifié et tracé.
                </p>
              </div>
              <div className="rounded-2xl obsidian-inset p-4">
                <h3 className="text-sm font-bold text-[#063725]">Réservé aux adultes (18+)</h3>
                <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                  Contrôle strict de l’âge à l’inscription et à la première connexion : les mineurs ne font pas partie de la plateforme pour le moment.
                </p>
              </div>
              <div className="rounded-2xl obsidian-inset p-4">
                <h3 className="text-sm font-bold text-[#063725]">Dossier mis à jour avant clôture</h3>
                <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                  Un médecin ne peut clôturer une consultation qu’après avoir rempli votre dossier médical pour vos futurs suivis et débloqué votre notation.
                </p>
              </div>
              <div className="rounded-2xl obsidian-inset p-4">
                <h3 className="text-sm font-bold text-[#063725]">Transfert protégé financièrement</h3>
                <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                  Si un médecin transfère votre dossier avant d’avoir effectué la consultation, les 10 000 FCFA sont reversés au médecin receveur sans surcoût.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 : Offre claire 2 cartes (#formules fidèle à l'ancien squelette) */}
      <section id="formules" className="mx-auto max-w-6xl px-4 py-12 sm:py-14 sm:px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#063725]">
              Tarif transparent : Suivi gratuit et consultation unique à 10 000 FCFA
            </h2>
            <p className="mt-1.5 text-sm text-[#475E52] max-w-2xl">
              Suivez vos séances gratuitement dans votre espace personnel. Réglez uniquement lorsqu’une consultation médicale complète est ouverte.
            </p>
          </div>
          <Link
            href="/auth?tab=register"
            className="rounded-full border border-[#C3D6CA] bg-white px-4 py-2.5 text-xs font-bold text-[#063725] hover:bg-[#F1F6F3] min-h-[42px] inline-flex items-center whitespace-nowrap self-start sm:self-auto"
          >
            Inscription Médecin (Forum confrères &amp; suivi)
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl obsidian-card p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0D6E46]">Espace Sportif · Suivi &amp; Prévention</span>
                <span className="font-mono text-sm font-bold tabular-nums text-[#063725]">0 FCFA</span>
              </div>
              <h3 className="text-base font-bold text-[#063725]">Journal d’entraînement &amp; fiches validées</h3>
              <ul className="space-y-1.5 text-xs text-[#475E52]">
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Journal des séances/matchs, fatigue, sommeil, récupération et gênes</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Courbes d’évolution et signaux de vigilance non diagnostiques</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Partage sélectif au médecin uniquement avec votre accord</span>
                </li>
              </ul>
            </div>
            <Link
              href="/auth?tab=register"
              className="w-full text-center rounded-full border border-[#C3D6CA] bg-[#F6F8F5] px-4 py-2.5 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[42px] inline-flex items-center justify-center"
            >
              Créer mon espace sportif (18+)
            </Link>
          </div>

          <div className="rounded-2xl border border-[#0D6E46]/30 bg-[#ECF7F1] p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0D6E46]">Consultation unique tout compris</span>
                <span className="font-mono text-sm font-bold tabular-nums text-[#063725]">10 000 FCFA TTC</span>
              </div>
              <h3 className="text-base font-bold text-[#063725]">Échange direct, médias &amp; rendez-vous médecin</h3>
              <ul className="space-y-1.5 text-xs text-[#3D5246]">
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Messagerie sécurisée, photos, examens PDF et vidéos en consultation</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Rendez-vous au Cabinet ou en téléconsultation Visio intégrée</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" />
                  <span>Dossier médical mis à jour avant clôture + notation du médecin</span>
                </li>
              </ul>
            </div>
            <Link
              href="/medecins"
              className="w-full text-center rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[42px] inline-flex items-center justify-center"
            >
              Choisir un médecin vérifié
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
