import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
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
import { AnimatePresence, motion } from 'motion/react';
import { ALL_SPORT_CODES, SPORTS_CONFIG } from '../data/sportsConfig';
import { OBJECTIVE_BY_CODE, TRAINING_OBJECTIVES } from '../data/objectivesConfig';
import type { ObjectiveCode, SportCode } from '../types';
import { LegalFooter } from './LegalFooter';

interface PublicLandingProps {
  onOpenAuth: (
    mode: 'login' | 'register',
    preselectedSport?: SportCode,
    initialRole?: 'athlete' | 'coach',
    preselectedObjective?: ObjectiveCode
  ) => void;
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
            <a href="#formules" className="hover:text-[#063725] transition-colors whitespace-nowrap shrink-0">
              Formules
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

        <AnimatePresence>
          {mobileNavOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
                href="#formules"
                onClick={() => setMobileNavOpen(false)}
                className="col-span-2 rounded-xl bg-[#F6F8F5] px-3.5 py-2.5 hover:bg-[#ECF7F1]"
              >
                Formules
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
          </motion.nav>
          )}
        </AnimatePresence>
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
                <motion.img
                  key={code}
                  src={sport.imageUrl}
                  alt=""
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={idx === 0 ? 'high' : 'auto'}
                  referrerPolicy="no-referrer"
                  initial={false}
                  animate={{
                    opacity: isActive ? 1 : 0,
                    scale: isActive ? 1 : 1.03,
                  }}
                  transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 h-full w-full object-cover object-center"
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

              <AnimatePresence mode="wait">
                <motion.div
                  key={previewSport}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
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
                </motion.div>
              </AnimatePresence>

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
                      <motion.button
                        key={code}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleSelectCarouselSport(code)}
                        className={`relative snap-start inline-flex items-center gap-1 sm:gap-2 rounded-full px-2.5 py-1 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-semibold transition-colors min-h-[30px] sm:min-h-[42px] whitespace-nowrap shrink-0 ${
                          active
                            ? 'text-[#063725]'
                            : 'border border-white/25 bg-white/15 text-white hover:bg-white/25'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="hero-sport-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-full bg-white shadow-md"
                          />
                        )}
                        <span className="relative z-10 font-mono text-[10px] opacity-75">0{idx + 1}</span>
                        <span className="relative z-10">{SPORTS_CONFIG[code].nom}</span>
                      </motion.button>
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
                  Définissez votre priorité (perte de poids, prise de masse, endurance, explosivité ou performance complète). Terrain+ adapte automatiquement les séances sur votre discipline.
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
                    <motion.button
                      key={obj.code}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => {
                        setSelectedObjective(obj.code);
                        setPreviewSport(obj.recommendedSports[0]);
                        setCarouselPaused(true);
                      }}
                      className={`rounded-2xl border p-4 text-left transition-colors flex flex-col justify-between gap-2.5 min-h-[116px] ${
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
                    </motion.button>
                  );
                })}
              </div>

              {/* Active Objective & Sport Alignment Summary */}
              <div className="lg:col-span-5 rounded-2xl border border-[#D5E2DA] bg-[#F6F8F5] p-5 sm:p-6 flex flex-col justify-between gap-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${selectedObjective}-${previewSport}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-4"
                  >
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
                  </motion.div>
                </AnimatePresence>

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
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28, delay: 0 }}
              className="rounded-2xl obsidian-card p-4 sm:p-5"
            >
              <WifiOff className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Mode éco et hors ligne</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Fiches et guidage sans vidéo lourde, téléchargeables avant la séance sur terrain.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28, delay: 0.05 }}
              className="rounded-2xl obsidian-card p-4 sm:p-5"
            >
              <Smartphone className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">6 sports adaptés à votre but</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Football, Basket, Handball, Volleyball, Athlétisme et Fitness : programme calibré sur votre objectif.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28, delay: 0.1 }}
              className="rounded-2xl obsidian-card p-4 sm:p-5"
            >
              <Users className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Suivi par un coach</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Programme ajusté selon vos évaluations et votre niveau d’effort.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.28, delay: 0.15 }}
              className="rounded-2xl obsidian-card p-4 sm:p-5"
            >
              <Lock className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-bold text-[#063725]">Données protégées</h2>
              <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                Accès strict par rôle, journalisation des consultations et zéro classement public.
              </p>
            </motion.div>
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
                  Le sport choisi à l’inscription adapte les couleurs, les tests physiques sans matériel et les séances proposées.
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
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={activeSport.imageUrl}
                      src={activeSport.imageUrl}
                      alt={`Entraînement ${activeSport.nom}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      initial={{ opacity: 0.25, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0.25 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full w-full object-cover"
                    />
                  </AnimatePresence>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#063725]/60 via-transparent to-transparent" />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl obsidian-card-glow p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="font-display text-xl font-bold text-[#063725]">
                      Parcours {activeSport.nom}
                    </h3>
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
                Séance du jour, progression sur 4 semaines, courbe de poids et dernier retour de votre coach.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">02</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Programme</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Plan jour par jour structuré, ajustements datés du coach, variantes facile/exigeante et téléchargement hors ligne.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-bold text-[#0D6E46]">03</div>
              <h3 className="mt-2 text-base font-bold text-[#063725]">Évaluation</h3>
              <p className="mt-1.5 text-sm text-[#475E52] leading-relaxed">
                Tests chronométrés sans matériel toutes les 4 semaines et historique comparé de vos progrès.
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
                  Les données de poids et d’évaluation sont sensibles. Elles sont strictement cloisonnées entre l’athlète et son coach affecté, sans algorithme opaque ni partage commercial.
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
                    Chaque séance passe par un circuit de relecture par un préparateur physique ou un référent technique avant publication.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-inset p-4">
                  <h3 className="text-sm font-bold text-[#063725]">Vérification des dossiers coachs</h3>
                  <p className="mt-1 text-xs text-[#475E52] leading-relaxed">
                    Contrôle manuel des pièces déposées (diplôme, carte professionnelle, attestation d’honorabilité) avant activation du profil.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Simple 2-Offer Formules Strip */}
        <section id="formules" className="mx-auto max-w-6xl px-4 py-12 sm:py-14 sm:px-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#063725] text-balance">
                Deux formules claires : autonome gratuit ou accompagné par un coach
              </h2>
              <p className="mt-1.5 text-sm text-[#475E52] max-w-2xl">
                Démarrez gratuitement avec les bases FR/Wolof et le chronomètre. Passez au Suivi Coach quand vous voulez un accompagnement personnalisé.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('register', previewSport, 'coach')}
              className="rounded-full border border-[#C3D6CA] bg-white px-4 py-2.5 text-xs font-bold text-[#063725] hover:bg-[#F1F6F3] min-h-[42px] whitespace-nowrap self-start sm:self-auto"
            >
              Devenir Coach Terrain+ (0 FCFA fixe · 80 % reversés)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl obsidian-card p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D6E46]">Athlète · Essentiel</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#063725]">0 FCFA</span>
                </div>
                <h3 className="text-base font-bold text-[#063725]">Entraînement autonome gratuit</h3>
                <ul className="space-y-1.5 text-xs text-[#475E52]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Séances fondamentales FR/Wolof &amp; chronomètre guidé</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Auto-évaluation sans matériel et suivi du poids</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Jusqu&apos;à 2 séances enregistrées hors connexion</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete', selectedObjective)}
                className="w-full rounded-full border border-[#C3D6CA] bg-[#F6F8F5] px-4 py-2.5 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[42px]"
              >
                Démarrer gratuitement
              </button>
            </div>

            <div className="rounded-2xl obsidian-card-glow p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D6E46]">Athlète · Suivi Coach</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#0D6E46]">5 000 FCFA / mois</span>
                </div>
                <h3 className="text-base font-bold text-[#063725]">Programme complet et coach dédié</h3>
                <ul className="space-y-1.5 text-xs text-[#475E52]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Tous les cycles spécialisés sur les 6 sports &amp; hors-ligne illimité</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>Messagerie directe, vidéos et ajustement hebdomadaire par votre coach</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#0D6E46] mt-0.5 shrink-0" /><span>80 % reversés au coach (4 000 F) · 20 % plateforme (1 000 F)</span></li>
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
        </section>
      </main>

      <LegalFooter variant="full" />
    </div>
  );
};
