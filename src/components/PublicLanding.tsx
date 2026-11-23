import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Menu,
  Pause,
  Play,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { ALL_SPORT_CODES, SPORTS_CONFIG } from '../data/sportsConfig';
import { OBJECTIVE_BY_CODE, TRAINING_OBJECTIVES } from '../data/objectivesConfig';
import { TECHNIQUE_FICHES } from '../data/exerciseMedia';
import { apiRequest, readJsonCache, writeJsonCache } from '../lib/api';
import type { ObjectiveCode, PublicPartnersPayload, SportCode } from '../types';
import { LegalFooter } from './LegalFooter';

const PUBLIC_PARTNERS_CACHE_KEY = 'terrain_plus_public_partners_v1';

interface PublicLandingProps {
  onOpenAuth: (
    mode: 'login' | 'register',
    preselectedSport?: SportCode,
    initialRole?: 'athlete' | 'coach',
    preselectedObjective?: ObjectiveCode
  ) => void;
}

const PARTNER_TYPE_LABELS: Record<'ASC' | 'CAMPUS' | 'LIGUE', string> = {
  ASC: 'ASC de quartier',
  CAMPUS: 'Campus universitaire',
  LIGUE: 'Ligue / Club',
};

function isValidPartnersPayload(value: unknown): value is PublicPartnersPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PublicPartnersPayload>;
  return (
    Array.isArray(candidate.partners) &&
    Array.isArray(candidate.groups) &&
    Array.isArray(candidate.challenges)
  );
}

export const PublicLanding: React.FC<PublicLandingProps> = ({ onOpenAuth }) => {
  const [selectedObjective, setSelectedObjective] = useState<ObjectiveCode>('PERTE_POIDS');
  const [previewSport, setPreviewSport] = useState<SportCode>('football');
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeObjective = OBJECTIVE_BY_CODE[selectedObjective];
  const activeSport = SPORTS_CONFIG[previewSport];
  const activeSlideIndex = Math.max(0, ALL_SPORT_CODES.indexOf(previewSport));

  // Auto-advance the 6-sport Hero background carousel (pauses on user interaction or reduced-motion)
  useEffect(() => {
    if (carouselPaused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setPreviewSport((prev) => {
        const idx = ALL_SPORT_CODES.indexOf(prev);
        const nextIdx = (idx + 1) % ALL_SPORT_CODES.length;
        return ALL_SPORT_CODES[nextIdx];
      });
    }, 5500);
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

  const handleSelectCarouselSport = (code: SportCode) => {
    setPreviewSport(code);
    setCarouselPaused(true);
  };

  const handleStepCarousel = (direction: -1 | 1) => {
    const nextIdx =
      (activeSlideIndex + direction + ALL_SPORT_CODES.length) % ALL_SPORT_CODES.length;
    setPreviewSport(ALL_SPORT_CODES[nextIdx]);
    setCarouselPaused(true);
  };

  // Live aggregated partner data (hydrated from cache for instant offline/3G render)
  const [partnerData, setPartnerData] = useState<PublicPartnersPayload | null>(() =>
    readJsonCache<PublicPartnersPayload>(PUBLIC_PARTNERS_CACHE_KEY, isValidPartnersPayload)
  );
  const [partnerTypeFilter, setPartnerTypeFilter] = useState<'ALL' | 'ASC' | 'CAMPUS' | 'LIGUE'>('ALL');
  const [showPartnerForm, setShowPartnerForm] = useState(false);

  // Partner onboarding form state
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<'ASC' | 'CAMPUS' | 'LIGUE'>('ASC');
  const [orgZone, setOrgZone] = useState('');
  const [contactNom, setContactNom] = useState('');
  const [contactPhone, setContactPhone] = useState('+22177');
  const [contactEmail, setContactEmail] = useState('');
  const [sportPrincipal, setSportPrincipal] = useState('Football');
  const [estAthletes, setEstAthletes] = useState('40');
  const [packSouhaite, setPackSouhaite] = useState('PACK_ASC_CAMPUS');
  const [orgMessage, setOrgMessage] = useState('');
  const [partnerSubmitting, setPartnerSubmitting] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [partnerSuccess, setPartnerSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<PublicPartnersPayload>('/api/public/partners', { timeoutMs: 8000 })
      .then((res) => {
        if (isValidPartnersPayload(res)) {
          setPartnerData(res);
          writeJsonCache(PUBLIC_PARTNERS_CACHE_KEY, res);
        }
      })
      .catch(() => undefined);
  }, []);

  const filteredPartners = useMemo(() => {
    const partners = Array.isArray(partnerData?.partners) ? partnerData.partners : [];
    if (partnerTypeFilter === 'ALL') return partners;
    return partners.filter((p) => p.type === partnerTypeFilter);
  }, [partnerData, partnerTypeFilter]);

  const filteredChallenges = useMemo(() => {
    const challenges = Array.isArray(partnerData?.challenges) ? partnerData.challenges : [];
    if (partnerTypeFilter === 'ALL') return challenges;
    return challenges.filter((c) => c.partner_type === partnerTypeFilter);
  }, [partnerData, partnerTypeFilter]);

  const totalMembersAggregated = useMemo(() => {
    const partners = Array.isArray(partnerData?.partners) ? partnerData.partners : [];
    return partners.reduce((acc, p) => acc + (p.members_count || 0), 0);
  }, [partnerData]);

  const handleSubmitPartnerRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartnerSubmitting(true);
    setPartnerError(null);
    setPartnerSuccess(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/public/partner-requests', {
        method: 'POST',
        body: JSON.stringify({
          organisation: orgName,
          type: orgType,
          zone: orgZone,
          contact_nom: contactNom,
          contact_telephone: contactPhone,
          contact_email: contactEmail,
          sport_principal: sportPrincipal,
          nombre_athletes_estime: estAthletes ? Number(estAthletes) : null,
          pack_souhaite: packSouhaite,
          message: orgMessage,
        }),
      });
      setPartnerSuccess(res.message);
      setOrgName('');
      setOrgZone('');
      setContactNom('');
      setContactPhone('+22177');
      setContactEmail('');
      setOrgMessage('');
    } catch (err) {
      setPartnerError(err instanceof Error ? err.message : "Impossible d'envoyer la demande.");
    } finally {
      setPartnerSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen obsidian-ambient text-[#063725] overflow-x-hidden">
      {/* Top Bar Contract: crisp white header with original Terrain+ logo */}
      <header className="sticky top-0 z-30 border-b border-[#D5E2DA] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 py-3 sm:px-6">
          <a href="#top" className="inline-flex items-center shrink-0" aria-label="Terrain+ Accueil">
            <img
              src="/brand/terrain-logo.png"
              alt="Terrain+"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-8 sm:h-9 w-auto object-contain"
            />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#3D5246]">
            <a href="#objectif" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Objectifs
            </a>
            <a href="#sports" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Sports
            </a>
            <a href="#programme" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Programme
            </a>
            <a href="#securite" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Sécurité
            </a>
            <a href="#partenaires" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Partenaires
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hidden sm:inline-flex items-center rounded-full border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] transition-colors min-h-[40px] whitespace-nowrap"
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
              className="rounded-full bg-[#0D6E46] px-4 sm:px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] transition-colors whitespace-nowrap shrink-0 min-h-[40px] shadow-sm"
            >
              S&apos;inscrire
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileNavOpen}
              className="md:hidden inline-flex items-center justify-center rounded-xl border border-[#C3D6CA] bg-white p-2 text-[#063725] hover:bg-[#F1F6F3] min-h-[40px] min-w-[40px]"
            >
              {mobileNavOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <nav
            aria-label="Navigation mobile"
            className="md:hidden border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-2"
          >
            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-[#063725]">
              <a
                href="#objectif"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Objectifs
              </a>
              <a
                href="#sports"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Sports
              </a>
              <a
                href="#programme"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Programme
              </a>
              <a
                href="#securite"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Sécurité
              </a>
              <a
                href="#partenaires"
                onClick={() => setMobileNavOpen(false)}
                className="col-span-2 rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Partenaires
              </a>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenAuth('login');
                }}
                className="flex-1 rounded-full border border-[#C3D6CA] bg-white py-2.5 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] min-h-[40px]"
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenAuth('register', previewSport, 'athlete', selectedObjective);
                }}
                className="flex-1 rounded-full bg-[#0D6E46] py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
              >
                Créer un compte
              </button>
            </div>
          </nav>
        )}
      </header>

      <main id="top">
        {/* Section 1: Responsive Background Image Carousel structuring all 6 sports + Goal-First Card */}
        <section
          aria-label="Présentation des 6 disciplines Terrain+"
          className="relative overflow-hidden bg-[#063725]"
        >
          {/* Full-Bleed 6-Sport Background Carousel Images */}
          <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
            {ALL_SPORT_CODES.map((code, idx) => {
              const sport = SPORTS_CONFIG[code];
              const isActive = code === previewSport;
              return (
                <img
                  key={code}
                  src={sport.imageUrl}
                  alt=""
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={idx === 0 ? 'high' : 'auto'}
                  referrerPolicy="no-referrer"
                  className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
                    isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]'
                  }`}
                />
              );
            })}
            {/* Directional Terrain Green contrast scrim for crisp mobile & desktop readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#063725]/88 via-[#063725]/72 to-[#063725]/92 lg:bg-gradient-to-r lg:from-[#063725]/92 lg:via-[#063725]/76 lg:to-[#063725]/55" />
          </div>

          {/* Responsive Carousel Content: ultra-compact on mobile phones, full-scale on tablet/desktop */}
          <div className="relative z-10 mx-auto max-w-6xl px-4 py-3.5 sm:px-6 sm:pt-12 sm:pb-14 lg:py-16">
            <div className="max-w-3xl text-white">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <p className="font-mono text-[10px] sm:text-xs font-semibold tracking-wide text-[#FBBF24] tabular-nums truncate">
                  0{activeSlideIndex + 1} / 06 · {activeSport.nom}
                  <span className="hidden sm:inline"> · {activeSport.preventionZones[0]}</span>
                </p>

                {/* Carousel Transport Controls */}
                <div className="inline-flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStepCarousel(-1)}
                    aria-label="Discipline précédente"
                    className="h-7 w-7 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCarouselPaused((p) => !p)}
                    aria-label={carouselPaused ? 'Relancer le carrousel' : 'Mettre en pause le carrousel'}
                    className="h-7 w-7 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 transition-colors"
                  >
                    {carouselPaused ? <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepCarousel(1)}
                    aria-label="Discipline suivante"
                    className="h-7 w-7 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
                </div>
              </div>

              <h1 className="mt-1.5 sm:mt-4 font-display text-lg leading-[1.16] sm:text-4xl lg:text-[3rem] font-bold tracking-tight text-white text-balance">
                Votre objectif d’abord, votre parcours{' '}
                <span className="text-[#FBBF24]">{activeSport.nom}</span> adapté
              </h1>

              <p className="mt-1 sm:mt-4 text-[11px] sm:text-base text-white/90 leading-snug sm:leading-relaxed max-w-2xl line-clamp-1 sm:line-clamp-none">
                {activeSport.subtitle}. Séances courtes sans matériel en français et wolof, encadrement coach et accès hors ligne.
              </p>

              {/* Desktop Discipline Metrics Summary */}
              <div className="hidden sm:flex sm:mt-4 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/90">
                <span>{activeSport.qualities[0]}</span>
                {activeSport.qualities[1] && (
                  <>
                    <span aria-hidden="true" className="text-white/50">·</span>
                    <span>{activeSport.qualities[1]}</span>
                  </>
                )}
                <span aria-hidden="true" className="text-white/50">·</span>
                <span className="text-[#FBBF24] font-medium">
                  Suivi : {activeSport.dashboardMetrics.primary}
                </span>
              </div>

              {/* Primary Hero Actions */}
              <div className="mt-2.5 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
                <a
                  href="#objectif"
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-full bg-white px-3.5 py-1.5 sm:px-5 sm:py-3 text-[11px] sm:text-sm font-bold text-[#063725] hover:bg-[#ECF7F1] transition-colors min-h-[34px] sm:min-h-[44px] shadow-md whitespace-nowrap"
                >
                  <span>Choisir mon objectif</span>
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 sm:px-5 sm:py-3 text-[11px] sm:text-sm font-semibold text-white hover:bg-white/25 transition-colors min-h-[34px] sm:min-h-[44px] whitespace-nowrap"
                >
                  Se connecter
                </button>
              </div>

              {/* Horizontal Scrollable 6-Sport Carousel Selector (ultra-compact on mobile) */}
              <div className="mt-3 pt-2.5 sm:mt-7 sm:pt-5 border-t border-white/15">
                <div className="hidden sm:flex items-center justify-between text-[11px] text-white/75 mb-2.5">
                  <span>Structure des 6 sports · Touchez pour changer d’aperçu</span>
                  <span className="font-mono">6 disciplines</span>
                </div>
                <div
                  role="tablist"
                  aria-label="Carrousel des 6 sports"
                  className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5 sm:pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible"
                >
                  {ALL_SPORT_CODES.map((code, idx) => {
                    const active = previewSport === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleSelectCarouselSport(code)}
                        className={`snap-start inline-flex items-center gap-1 sm:gap-2 rounded-full px-2.5 py-1 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-semibold transition-all min-h-[30px] sm:min-h-[42px] whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-white text-[#063725] shadow-md'
                            : 'border border-white/25 bg-white/15 text-white hover:bg-white/25'
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-75">0{idx + 1}</span>
                        <span>{SPORTS_CONFIG[code].nom}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Dedicated Goal-First Section ("Choisissez votre objectif") */}
        <section id="objectif" className="border-b border-[#D5E2DA] bg-white py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#0D6E46]">
                  Étape 1 · Calibration du parcours · Compatible 6 sports
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
                  Choisissez votre objectif
                </h2>
                <p className="text-sm text-[#475E52] max-w-2xl">
                  Définissez votre priorité (perte de poids, prise de masse, endurance, explosivité, prévention ou performance complète). Terrain+ adapte automatiquement les séances sur votre discipline.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Interactive Objective Cards */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TRAINING_OBJECTIVES.map((obj) => {
                  const active = selectedObjective === obj.code;
                  const recommendedSport = SPORTS_CONFIG[obj.recommendedSports[0]].nom;
                  return (
                    <button
                      key={obj.code}
                      type="button"
                      onClick={() => {
                        setSelectedObjective(obj.code);
                        setPreviewSport(obj.recommendedSports[0]);
                        setCarouselPaused(true);
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all flex flex-col justify-between gap-2.5 min-h-[116px] ${
                        active
                          ? 'border-[#0D6E46] bg-[#ECF7F1] shadow-sm'
                          : 'border-[#D5E2DA] bg-[#F6F8F5] hover:border-[#0D6E46]/45 hover:bg-white'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#063725]">{obj.shortLabel}</span>
                          {active && <CheckCircle2 className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />}
                        </div>
                        <p className="text-xs text-[#475E52] leading-relaxed">{obj.description}</p>
                      </div>
                      <div className="text-[11px] font-medium text-[#0D6E46]">
                        Sport conseillé : {recommendedSport}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Objective & Sport Alignment Summary */}
              <div className="lg:col-span-5 rounded-2xl border border-[#D5E2DA] bg-[#F6F8F5] p-5 sm:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#5B7064]">Votre programme calibré</div>
                    <h3 className="font-display text-lg font-bold text-[#063725]">
                      {activeObjective.label}
                    </h3>
                    <p className="text-xs text-[#475E52] leading-relaxed">
                      {activeObjective.programSummary}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#3D5246]">Associer à votre discipline</span>
                      <span className="font-semibold text-[#0D6E46]">{activeSport.nom}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ALL_SPORT_CODES.map((code) => {
                        const isSportActive = previewSport === code;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => handleSelectCarouselSport(code)}
                            className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors min-h-[38px] truncate ${
                              isSportActive
                                ? 'bg-[#0D6E46] text-white shadow-sm'
                                : 'border border-[#D5E2DA] bg-white text-[#3D5246] hover:text-[#063725]'
                            }`}
                          >
                            {SPORTS_CONFIG[code].nom}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E2EBE5] space-y-1">
                    <div className="text-xs font-semibold text-[#063725]">
                      Adaptation {activeSport.nom}
                    </div>
                    <p className="text-xs text-[#475E52] leading-relaxed">
                      {activeObjective.sportGuidance[previewSport]}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-[#E2EBE5]">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0D6E46] px-5 py-3 text-xs sm:text-sm font-bold text-white hover:bg-[#095637] transition-colors min-h-[44px] shadow-sm"
                  >
                    <span className="truncate">
                      Démarrer ({activeObjective.shortLabel} · {activeSport.nom})
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                  <p className="text-[11px] text-[#5B7064] leading-snug">
                    Terrain+ accompagne la régularité sportive et ne remplace ni un coach diplômé ni un avis médical.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4-column Strip below hero on crisp off-white canvas */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl obsidian-card p-4 sm:p-5">
              <WifiOff className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Mode éco et hors ligne</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Fiches et guidage sans vidéo lourde, téléchargeables avant la séance sur terrain.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4 sm:p-5">
              <Smartphone className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">6 sports adaptés à votre but</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Football, Basket, Handball, Volleyball, Athlétisme et Fitness : programme calibré sur votre objectif.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4 sm:p-5">
              <Users className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Suivi par un coach</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Programme ajusté selon vos évaluations, votre fatigue et vos alertes de douleur.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4 sm:p-5">
              <Lock className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Données protégées</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Accès strict par rôle, journalisation des consultations et zéro classement public.
              </p>
            </div>
          </div>
        </section>

        {/* Adaptive Sport Showcase on Pure White Surface */}
        <section id="sports" className="border-y border-[#D5E2DA] bg-white py-12 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
                  Une interface et des tests dédiés à chaque discipline
                </h2>
                <p className="mt-2 text-sm text-[#475E52] max-w-2xl">
                  Le sport choisi à l’inscription adapte les couleurs, les tests physiques sans matériel, les zones de prévention et les séances proposées.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] p-1 self-start">
                {ALL_SPORT_CODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelectCarouselSport(code)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                      previewSport === code
                        ? 'bg-[#0D6E46] text-white shadow-sm'
                        : 'text-[#3D5246] hover:text-[#063725]'
                    }`}
                  >
                    {SPORTS_CONFIG[code].nom}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-5">
                <div className="relative h-64 sm:h-80 lg:h-full overflow-hidden rounded-3xl border border-[#D5E2DA] bg-[#F1F6F3]">
                  <img
                    src={activeSport.imageUrl}
                    alt={`Entraînement ${activeSport.nom}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#063725]/60 via-transparent to-transparent" />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl obsidian-card-glow p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="font-display text-xl font-bold text-[#063725]">
                      Parcours {activeSport.nom}
                    </h3>
                    <span className={`text-xs font-semibold ${activeSport.accentTextClass}`}>
                      Prévention : {activeSport.preventionZones.join(' · ')}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#475E52]">{activeSport.subtitle}</p>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-semibold text-[#5B7064]">Qualités physiques visées</h4>
                      <ul className="mt-2.5 space-y-2 text-sm text-[#063725]">
                        {activeSport.qualities.map((q) => (
                          <li key={q} className="flex items-start gap-2">
                            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${activeSport.accentTextClass}`} aria-hidden="true" />
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-[#5B7064]">Auto-évaluation sans matériel</h4>
                      <ul className="mt-2.5 space-y-2 text-sm text-[#063725]">
                        {activeSport.tests.map((t) => (
                          <li key={t.code} className="flex items-start gap-2">
                            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${activeSport.accentTextClass}`} aria-hidden="true" />
                            <span>{t.nom}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-[#E2EBE5] flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-[#475E52]">
                    Indicateurs suivis : {activeSport.dashboardMetrics.primary} · {activeSport.dashboardMetrics.secondary} · {activeSport.dashboardMetrics.tertiary}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                    className="rounded-full bg-[#0D6E46] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#095637] transition-colors min-h-[40px] whitespace-nowrap shadow-sm"
                  >
                    Choisir {activeSport.nom}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture & Programme */}
        <section id="programme" className="mx-auto max-w-6xl px-4 py-12 sm:py-14 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
            Quatre espaces simples sur mobile et ordinateur
          </h2>
          <p className="mt-2 text-sm text-[#475E52] max-w-2xl">
            Une navigation pensée pour aller droit à la séance du jour sur le terrain, tout en offrant un espace de suivi dédié aux coachs diplômés.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">01</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Dashboard</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Séance du jour, progression sur 4 semaines, courbe de poids, dernier retour du coach et défis collectifs.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">02</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Programme</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Plan jour par jour avec repos, ajustements datés du coach, variantes facile/exigeante et téléchargement hors ligne.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">03</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Évaluation</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Tests chronométrés sans matériel toutes les 4 semaines, historique comparé et alerte douleur immédiate.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">04</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Profil & Confidentialité</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Historique du poids, mode éco données, changement de coach, export intégral JSON et suppression de compte.
              </p>
            </div>
          </div>

          {/* Curated Posture & Anatomy Technique Previews */}
          <div className="mt-10 rounded-3xl obsidian-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#063725]">
                  Fiches techniques illustrées sans matériel
                </h3>
                <p className="mt-1 text-xs text-[#475E52]">
                  Des repères anatomiques et posturaux clairs (Squats, Pompes, Planche & variantes) intégrés directement dans vos séances et tests, désactivables en mode éco-données.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                className="text-xs font-bold text-[#0D6E46] underline hover:text-[#095637] self-start sm:self-auto"
              >
                Accéder aux 11 fiches illustrées
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                TECHNIQUE_FICHES.find((f) => f.id === 'squat-muscles-travailles'),
                TECHNIQUE_FICHES.find((f) => f.id === 'pompes-positions-mains'),
                TECHNIQUE_FICHES.find((f) => f.id === 'planche-et-variantes'),
                TECHNIQUE_FICHES.find((f) => f.id === 'pompes-amplitude'),
              ]
                .filter(Boolean)
                .map((fiche) => (
                  <div
                    key={fiche!.id}
                    className="rounded-2xl obsidian-inset overflow-hidden flex flex-col"
                  >
                    <div className="h-40 bg-white border-b border-[#D5E2DA] flex items-center justify-center p-2">
                      <img
                        src={fiche!.imageUrl}
                        alt={fiche!.titre}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="max-h-full w-auto object-contain"
                      />
                    </div>
                    <div className="p-3.5 space-y-1 flex-1">
                      <div className="text-[11px] font-bold text-[#0D6E46]">{fiche!.category}</div>
                      <h4 className="text-xs font-bold text-[#063725]">{fiche!.titre}</h4>
                      <p className="text-[11px] text-[#475E52] leading-relaxed">{fiche!.muscles}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {/* Security & Governance */}
        <section id="securite" className="border-y border-[#D5E2DA] bg-white py-12 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0D6E46]">
                  <ShieldCheck className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                  <span>Sécurité et protection des données de santé</span>
                </div>
                <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
                  Conçu pour la confiance des athlètes, des familles et des clubs
                </h2>
                <p className="mt-3 text-sm text-[#475E52] leading-relaxed">
                  Les données de poids, de douleur et d’évaluation sont sensibles. Elles sont strictement cloisonnées entre l’athlète et son coach affecté, sans algorithme opaque ni partage commercial.
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl obsidian-inset p-4">
                  <h3 className="text-sm font-bold text-[#063725]">Cloisonnement par rôle (RBAC)</h3>
                  <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                    Un coach ne consulte que les athlètes qui lui sont officiellement affectés. Chaque consultation de fiche est enregistrée dans un journal d’audit.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-inset p-4">
                  <h3 className="text-sm font-bold text-[#063725]">Protection des mineurs</h3>
                  <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                    Accord explicite et téléphone d’un responsable légal exigés en dessous de 18 ans, avec visibilité privée par défaut.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-inset p-4">
                  <h3 className="text-sm font-bold text-[#063725]">Contenus relus avant diffusion</h3>
                  <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                    Chaque séance passe par un circuit de relecture par un préparateur physique ou un professionnel de santé avant publication.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-inset p-4">
                  <h3 className="text-sm font-bold text-[#063725]">Protocole arrêt douleur</h3>
                  <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                    Un signalement de douleur affiche l’arrêt immédiat et l’orientation médicale, tout en créant une alerte prioritaire chez le coach.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Partners / Ecosystem Section */}
        <section id="partenaires" className="mx-auto max-w-6xl px-4 py-12 sm:py-14 sm:px-6 space-y-8">
          <div className="rounded-3xl obsidian-card-glow p-6 sm:p-10 text-[#063725]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/brand/terrain-mark.png"
                    alt="Terrain+ Partenaires"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-xl object-contain shrink-0"
                  />
                  <span className="text-xs font-bold text-[#B45309]">
                    Privilège Jeunes Sportifs · ASC, Campus universitaires & Ligues
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
                  Un accès libre pour les jeunes, juste pour les coachs et durable pour les clubs
                </h2>
                <p className="text-sm text-[#475E52] leading-relaxed max-w-2xl">
                  Votre socle d’entraînement quotidien (séances FR/Wolof, chronomètre, test du jour, alerte douleur, défis ASC) est gratuit à vie. Evoluez à votre rythme vers <strong className="text-[#063725]">Progression+</strong> ou le <strong className="text-[#063725]">Suivi Coach</strong>, pendant que les coachs s’inscrivent à <strong className="text-[#0D6E46]">0 FCFA</strong>.
                </p>
                {partnerData && ((partnerData.partners ?? []).length > 0 || (partnerData.groups ?? []).length > 0) && (
                  <div className="pt-2 flex flex-wrap items-center gap-6 font-mono text-xs font-semibold tabular-nums text-[#0D6E46]">
                    <span>{(partnerData.partners ?? []).length} partenaires actifs</span>
                    <span>{(partnerData.groups ?? []).length} groupes encadrés</span>
                    <span>{totalMembersAggregated} sportifs rattachés</span>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowPartnerForm((v) => !v)}
                  className="rounded-full bg-[#0D6E46] px-5 py-3 text-sm font-bold text-white hover:bg-[#095637] transition-colors min-h-[44px] text-center shadow-sm"
                >
                  {showPartnerForm ? 'Fermer le formulaire partenaire' : 'Demander un Pack ASC / Campus'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', previewSport, 'coach')}
                  className="rounded-full border border-[#C3D6CA] bg-white px-5 py-3 text-sm font-semibold text-[#063725] hover:bg-[#F1F6F3] transition-colors min-h-[44px] text-center"
                >
                  Devenir Coach Prépa (0 FCFA à l’inscription)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="rounded-full border border-[#D5E2DA] bg-[#F6F8F5] px-5 py-3 text-sm font-medium text-[#3D5246] hover:text-[#063725] hover:bg-[#ECF3EE] transition-colors min-h-[44px] text-center"
                >
                  Se connecter à mon espace
                </button>
              </div>
            </div>
          </div>

          {/* 3-Tier Freemium Sportifs + Zero-Friction Coach & B2B Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl obsidian-card p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D6E46]">Athlète · Essentiel</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#063725]">0 FCFA</span>
                </div>
                <h3 className="text-base font-bold text-[#063725]">Socle sportif gratuit à vie</h3>
                <ul className="space-y-1.5 text-xs text-[#475E52]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Séance du jour & lecteur FR/Wolof + chrono</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Protocole d’alerte douleur 100 % gratuit</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>2 séances téléchargeables hors ligne & groupes ASC</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                className="w-full rounded-full border border-[#C3D6CA] bg-[#F6F8F5] px-4 py-2.5 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[42px]"
              >
                Créer mon accès gratuit
              </button>
            </div>

            <div className="rounded-2xl obsidian-card border-[#F59E0B]/60 bg-[#FFFDF7] p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#B45309]">Athlète · Progression+</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#063725]">1 500 FCFA / mois</span>
                </div>
                <h3 className="text-base font-bold text-[#063725]">Bibliothèque complète & hors-ligne illimité</h3>
                <ul className="space-y-1.5 text-xs text-[#475E52]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#D97706] mt-0.5 shrink-0" /><span>Cycles spécialisés (Navétanes, Détente, Tir) & tous niveaux</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#D97706] mt-0.5 shrink-0" /><span>Téléchargements hors connexion illimités</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#D97706] mt-0.5 shrink-0" /><span>Comparatif multi-bilans · 4 000 F / trimestre</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                className="w-full rounded-full bg-[#F59E0B] px-4 py-2.5 text-xs font-bold text-[#063725] hover:bg-[#FBBF24] min-h-[42px] shadow-sm"
              >
                Démarrer avec Progression+
              </button>
            </div>

            <div className="rounded-2xl obsidian-card-glow p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D6E46]">Privilège Jeunes · Suivi Coach</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#0D6E46]">5 000 FCFA / mois</span>
                </div>
                <h3 className="text-base font-bold text-[#063725]">Progression+ et votre coach dédié</h3>
                <ul className="space-y-1.5 text-xs text-[#475E52]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Tous les modules Progression+ inclus sans surcoût</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Ajustements hebdomadaires datés & avis sur vos bilans</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>80 % reversés au coach (4 000 F) · 20 % plateforme</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                className="w-full rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[42px] shadow-sm"
              >
                Choisir mon coach
              </button>
            </div>
          </div>

          {/* Coach Zero-Friction + B2B Packs Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl obsidian-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#0D6E46]">Coach Prépa · Modèle sans friction</div>
                <h3 className="text-base font-bold text-[#063725]">
                  0 FCFA à l’inscription (Marketplace 80 %) ou Coach Pro 3 000 F/mois
                </h3>
                <p className="text-xs text-[#475E52] leading-relaxed">
                  Rejoignez l’annuaire gratuitement et percevez 4 000 FCFA/mois par athlète suivi, ou passez à la licence Coach Pro (0 % de commission sur votre effectif).
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'coach')}
                className="rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[42px] whitespace-nowrap shrink-0"
              >
                Inscrire mon profil Coach
              </button>
            </div>

            <div className="rounded-2xl obsidian-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#5B7064]">Partenaires B2B · ASC, Campus & Ligues</div>
                <h3 className="text-base font-bold text-[#063725]">
                  Pack Collectif dès 15 000 – 30 000 FCFA / mois pour vos sportifs
                </h3>
                <p className="text-xs text-[#475E52] leading-relaxed">
                  Offrez Progression+ à vos effectifs, désignez vos Capitaines Prépa et suivez la régularité agrégée sans classement individuel public.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPartnerForm(true)}
                className="rounded-full border border-[#C3D6CA] bg-[#F6F8F5] px-4 py-2.5 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[42px] whitespace-nowrap shrink-0"
              >
                Demander un devis B2B
              </button>
            </div>
          </div>

          {/* Interactive Partner Onboarding Form */}
          {showPartnerForm && (
            <form
              onSubmit={handleSubmitPartnerRequest}
              className="rounded-2xl obsidian-card p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2EBE5] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#063725]">
                    Demander le déploiement pour votre ASC, Campus ou Ligue
                  </h3>
                  <p className="mt-1 text-xs text-[#475E52]">
                    Enregistrée directement auprès de l’équipe Terrain+ pour créer vos groupes et désigner vos Capitaines Prépa.
                  </p>
                </div>
                <Building2 className="h-5 w-5 text-[#0D6E46] shrink-0" aria-hidden="true" />
              </div>

              {partnerError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
                  {partnerError}
                </div>
              )}

              {partnerSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />
                  <span>{partnerSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Nom de l’organisation *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Nom officiel de votre structure"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Type de structure *
                  </label>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as 'ASC' | 'CAMPUS' | 'LIGUE')}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="ASC">ASC (Association Sportive et Culturelle)</option>
                    <option value="CAMPUS">Campus universitaire</option>
                    <option value="LIGUE">Ligue ou club fédéral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Ville / Zone *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgZone}
                    onChange={(e) => setOrgZone(e.target.value)}
                    placeholder="Ville ou commune"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Responsable / Contact *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactNom}
                    onChange={(e) => setContactNom(e.target.value)}
                    placeholder="Prénom et nom"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Téléphone Sénégal (+221) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+221 7X XXX XX XX"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Email professionnel
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Email de contact officiel"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Discipline principale
                  </label>
                  <select
                    value={sportPrincipal}
                    onChange={(e) => setSportPrincipal(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="Football">Football</option>
                    <option value="Basket">Basket</option>
                    <option value="Handball">Handball</option>
                    <option value="Volleyball">Volleyball</option>
                    <option value="Athlétisme">Athlétisme</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Multi-sports">Multi-disciplines</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Effectif estimé (athlètes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={5000}
                    value={estAthletes}
                    onChange={(e) => setEstAthletes(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Formule partenaire B2B
                  </label>
                  <select
                    value={packSouhaite}
                    onChange={(e) => setPackSouhaite(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="PACK_ASC_CAMPUS">Pack ASC / Campus (15 000 – 30 000 F/mois)</option>
                    <option value="OBSERVATOIRE_LIGUE">Observatoire Ligue & Collectivité</option>
                    <option value="DEFI_SPONSORISE">Défi Collectif Sponsorisé</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">
                  Précisions sur vos besoins
                </label>
                <input
                  type="text"
                  value={orgMessage}
                  onChange={(e) => setOrgMessage(e.target.value)}
                  placeholder="Précisez vos disciplines ou besoins d'encadrement"
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPartnerForm(false)}
                  className="rounded-full border border-[#C3D6CA] px-4 py-2.5 text-xs font-medium text-[#3D5246] hover:text-[#063725] hover:bg-[#F1F6F3] min-h-[42px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={partnerSubmitting}
                  className="rounded-full bg-[#0D6E46] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[42px]"
                >
                  {partnerSubmitting ? 'Envoi...' : 'Envoyer la demande partenaire'}
                </button>
              </div>
            </form>
          )}

          {/* Active Partners & Collective Challenges Grid (shown only when real partners or challenges exist) */}
          {partnerData && ((partnerData.partners ?? []).length > 0 || (partnerData.challenges ?? []).length > 0) && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-[#063725]">
                    Réseau partenaire actif et défis collectifs
                  </h3>
                  <p className="text-xs text-[#475E52] mt-1">
                    Chaque groupe est rattaché à une structure partenaire et animé par un Capitaine Prépa. Indicateurs agrégés uniquement.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 rounded-2xl border border-[#D5E2DA] bg-white p-1 self-start">
                  {(
                    [
                      { id: 'ALL', label: 'Tous' },
                      { id: 'ASC', label: 'ASC' },
                      { id: 'CAMPUS', label: 'Campus' },
                      { id: 'LIGUE', label: 'Ligues' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPartnerTypeFilter(item.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] whitespace-nowrap ${
                        partnerTypeFilter === item.id
                          ? 'bg-[#0D6E46] text-white'
                          : 'text-[#475E52] hover:text-[#063725]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredPartners.map((partner) => {
                  const partnerGroups = (partnerData.groups ?? []).filter((g) => g.partner_id === partner.id);
                  return (
                    <div
                      key={partner.id}
                      className="rounded-2xl obsidian-card p-5 flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#0D6E46]">
                          {PARTNER_TYPE_LABELS[partner.type]} · {partner.zone}
                        </div>
                        <h4 className="mt-1 text-base font-bold text-[#063725]">{partner.nom}</h4>
                        <div className="mt-3 space-y-2 border-t border-[#E2EBE5] pt-3">
                          {partnerGroups.length === 0 ? (
                            <p className="text-xs text-[#5B7064]">Groupes en cours de constitution.</p>
                          ) : (
                            partnerGroups.map((g) => (
                              <div key={g.id} className="text-xs text-[#3D5246]">
                                <div className="font-semibold text-[#063725]">{g.nom}</div>
                                <div className="text-[#5B7064] font-mono tabular-nums">
                                  {SPORTS_CONFIG[g.sport_code].nom} · Capitaine : {g.captain_name} · {g.member_count} membres
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[#E2EBE5] flex items-center justify-between text-xs text-[#475E52] font-mono tabular-nums">
                        <span>{partner.groups_count} groupe(s)</span>
                        <span>{partner.members_count} inscrit(s)</span>
                      </div>
                    </div>
                  );
                })}
                {filteredPartners.length === 0 && (
                  <div className="md:col-span-3 rounded-2xl obsidian-card p-6 text-center text-xs text-[#475E52]">
                    Aucune organisation partenaire dans cette catégorie pour le moment. Utilisez « Demander un Pack ASC / Campus » ci-dessus pour en proposer une.
                  </div>
                )}
              </div>

              {filteredChallenges.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredChallenges.map((ch) => {
                    const pct = Math.min(100, Math.round((ch.current_sessions / ch.target_sessions) * 100));
                    return (
                      <div key={ch.id} className="rounded-2xl obsidian-card p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#5B7064]">
                          <span className="truncate">{ch.partner_nom} · {ch.periode}</span>
                          <span className="font-mono font-bold tabular-nums text-[#0D6E46]">{pct}%</span>
                        </div>
                        <div className="text-sm font-bold text-[#063725]">{ch.titre}</div>
                        <div className="h-1.5 w-full rounded-full bg-[#E2EBE5] overflow-hidden">
                          <div className="h-full bg-[#0D6E46]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="font-mono text-xs tabular-nums text-[#475E52]">
                          {ch.current_sessions} / {ch.target_sessions} · {ch.indicateur}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <LegalFooter variant="full" />
    </div>
  );
};
