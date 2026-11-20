import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
} from 'lucide-react';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import { TECHNIQUE_FICHES } from '../data/exerciseMedia';
import { apiRequest, readJsonCache, writeJsonCache } from '../lib/api';
import type { PublicPartnersPayload, SportCode } from '../types';
import { PWAInstallButton } from './PWAControls';

const PUBLIC_PARTNERS_CACHE_KEY = 'terrain_plus_public_partners_v1';

interface PublicLandingProps {
  onOpenAuth: (
    mode: 'login' | 'register',
    preselectedSport?: SportCode,
    initialRole?: 'athlete' | 'coach'
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
  const [previewSport, setPreviewSport] = useState<SportCode>('football');
  const activeSport = SPORTS_CONFIG[previewSport];

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
    <div className="min-h-screen obsidian-ambient text-[#F5F7F1]">
      {/* Top Bar Contract: exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080A07]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            className="font-display text-lg font-extrabold tracking-tight text-[#F5F7F1] whitespace-nowrap shrink-0"
          >
            Terrain<span className="text-[#C8F62D]">+</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B4BCA9]">
            <a href="#sports" className="hover:text-[#F5F7F1] transition-colors whitespace-nowrap shrink-0">
              Sports
            </a>
            <a href="#programme" className="hover:text-[#F5F7F1] transition-colors whitespace-nowrap shrink-0">
              Programme
            </a>
            <a href="#securite" className="hover:text-[#F5F7F1] transition-colors whitespace-nowrap shrink-0">
              Sécurité
            </a>
            <a href="#partenaires" className="hover:text-[#F5F7F1] transition-colors whitespace-nowrap shrink-0">
              Partenaires
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('register', previewSport)}
              className="rounded-full bg-[#C8F62D] px-5 py-2 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              S'inscrire
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                <p className="text-xs font-medium text-[#B4BCA9]">
                  Thiès · Saint-Louis · Dakar · Football, Basket & Handball
                </p>
                <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#F5F7F1] leading-[1.08] text-balance">
                  La préparation physique vient au terrain
                </h1>
                <p className="mt-5 text-base text-[#B4BCA9] leading-relaxed max-w-xl">
                  Un suivi physique structuré sans salle ni matériel obligatoire. Séances courtes en français et wolof, auto-évaluations encadrées par un coach et fonctionnement hors connexion.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', previewSport)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C8F62D] px-6 py-3 text-sm font-bold text-[#080A07] hover:bg-[#D7FA59] transition-colors min-h-[44px] whitespace-nowrap"
                  >
                    <span>Commencer mon suivi</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login')}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-[#121610] px-5 py-3 text-sm font-medium text-[#F5F7F1] hover:bg-[#1B2217] transition-colors min-h-[44px] whitespace-nowrap"
                  >
                    Se connecter
                  </button>
                  <PWAInstallButton compact />
                </div>
              </div>

              <p className="mt-8 text-xs text-[#8E9784] border-t border-white/[0.08] pt-4">
                Terrain+ accompagne la régularité et l’encadrement sportif. La plateforme ne remplace ni un coach diplômé ni un avis médical.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] overflow-hidden rounded-3xl border border-white/[0.1] bg-[#121610]">
                <img
                  src="/src/assets/images/hero_terrain_campus_1794878270523.jpg"
                  alt="Jeunes athlètes sénégalais en séance de préparation physique sur terrain extérieur"
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080A07]/90 via-[#080A07]/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/[0.1] bg-[#121610]/85 backdrop-blur-md p-4 text-[#F5F7F1]">
                  <p className="text-xs font-medium text-[#C8F62D]">
                    Université Iba Der Thiam · Relais ASC & Campus
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#F5F7F1]">
                    Conçu pour les jeunes sportifs de 15 à 25 ans, débutants et compétiteurs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column Strip below hero */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-white/[0.08] pt-8">
            <div className="rounded-2xl obsidian-card p-4">
              <WifiOff className="h-5 w-5 text-[#C8F62D]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-[#F5F7F1]">Mode éco et hors ligne</h2>
              <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                Fiches et guidage sans vidéo lourde, téléchargeables avant la séance sur terrain.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4">
              <Smartphone className="h-5 w-5 text-[#C8F62D]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-[#F5F7F1]">Interface par sport</h2>
              <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                Football, Basket ou Handball : tests, prévention et repères adaptés dès l’inscription.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4">
              <Users className="h-5 w-5 text-[#C8F62D]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-[#F5F7F1]">Suivi par un coach</h2>
              <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                Programme ajusté selon vos évaluations, votre fatigue et vos alertes de douleur.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-4">
              <Lock className="h-5 w-5 text-[#C8F62D]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-[#F5F7F1]">Données protégées</h2>
              <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                Accès strict par rôle, journalisation des consultations et zéro classement public.
              </p>
            </div>
          </div>
        </section>

        {/* Adaptive Sport Showcase */}
        <section id="sports" className="border-t border-white/[0.08] bg-[#0B0E09] py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F7F1] text-balance">
                  Une interface et des tests dédiés à chaque discipline
                </h2>
                <p className="mt-2 text-sm text-[#B4BCA9] max-w-2xl">
                  Le sport choisi à l’inscription adapte les couleurs, les tests physiques sans matériel, les zones de prévention et les séances proposées.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#121610] p-1 self-start">
                {(['football', 'basket', 'handball', 'volleyball', 'athletisme'] as SportCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setPreviewSport(code)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                      previewSport === code
                        ? 'bg-[#C8F62D] text-[#080A07]'
                        : 'text-[#B4BCA9] hover:text-[#F5F7F1]'
                    }`}
                  >
                    {SPORTS_CONFIG[code].nom}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-5">
                <div className="relative h-64 sm:h-80 lg:h-full overflow-hidden rounded-3xl border border-white/[0.08] bg-[#121610]">
                  <img
                    src={activeSport.imageUrl}
                    alt={`Entraînement ${activeSport.nom}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080A07]/70 via-transparent to-transparent" />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl obsidian-card-glow p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="font-display text-xl font-bold text-[#F5F7F1]">
                      Parcours {activeSport.nom}
                    </h3>
                    <span className={`text-xs font-semibold ${activeSport.accentTextClass}`}>
                      Prévention : {activeSport.preventionZones.join(' · ')}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#B4BCA9]">{activeSport.subtitle}</p>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-semibold text-[#8E9784]">Qualités physiques visées</h4>
                      <ul className="mt-2.5 space-y-2 text-sm text-[#E2E7DA]">
                        {activeSport.qualities.map((q) => (
                          <li key={q} className="flex items-start gap-2">
                            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${activeSport.accentTextClass}`} aria-hidden="true" />
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-[#8E9784]">Auto-évaluation sans matériel</h4>
                      <ul className="mt-2.5 space-y-2 text-sm text-[#E2E7DA]">
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

                <div className="mt-6 pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-[#B4BCA9]">
                    Indicateurs suivis : {activeSport.dashboardMetrics.primary} · {activeSport.dashboardMetrics.secondary} · {activeSport.dashboardMetrics.tertiary}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', previewSport)}
                    className="rounded-full bg-[#C8F62D] px-5 py-2.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] transition-colors min-h-[40px] whitespace-nowrap"
                  >
                    Choisir {activeSport.nom}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture & Programme */}
        <section id="programme" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F7F1] text-balance">
            Quatre espaces simples sur mobile et ordinateur
          </h2>
          <p className="mt-2 text-sm text-[#B4BCA9] max-w-2xl">
            Une navigation pensée pour aller droit à la séance du jour sur le terrain, tout en offrant un poste complet aux coachs et administrateurs.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-semibold text-[#C8F62D]">01</div>
              <h3 className="mt-2 text-base font-semibold text-[#F5F7F1]">Dashboard</h3>
              <p className="mt-1.5 text-sm text-[#B4BCA9] leading-relaxed">
                Séance du jour, progression sur 4 semaines, courbe de poids, dernier retour du coach et défis collectifs.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-semibold text-[#C8F62D]">02</div>
              <h3 className="mt-2 text-base font-semibold text-[#F5F7F1]">Programme</h3>
              <p className="mt-1.5 text-sm text-[#B4BCA9] leading-relaxed">
                Plan jour par jour avec repos, ajustements datés du coach, variantes facile/exigeante et téléchargement hors ligne.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-semibold text-[#C8F62D]">03</div>
              <h3 className="mt-2 text-base font-semibold text-[#F5F7F1]">Évaluation</h3>
              <p className="mt-1.5 text-sm text-[#B4BCA9] leading-relaxed">
                Tests chronométrés sans matériel toutes les 4 semaines, historique comparé et alerte douleur immédiate.
              </p>
            </div>
            <div className="rounded-2xl obsidian-card p-5">
              <div className="font-mono text-xs font-semibold text-[#C8F62D]">04</div>
              <h3 className="mt-2 text-base font-semibold text-[#F5F7F1]">Profil & Confidentialité</h3>
              <p className="mt-1.5 text-sm text-[#B4BCA9] leading-relaxed">
                Historique du poids, mode éco données, changement de coach, export intégral JSON et suppression de compte.
              </p>
            </div>
          </div>

          {/* Curated Posture & Anatomy Technique Previews */}
          <div className="mt-10 rounded-3xl obsidian-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#F5F7F1]">
                  Fiches techniques illustrées sans matériel
                </h3>
                <p className="mt-1 text-xs text-[#B4BCA9]">
                  Des repères anatomiques et posturaux clairs (Squats, Pompes, Planche & variantes) intégrés directement dans vos séances et tests, désactivables en mode éco-données.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete')}
                className="text-xs font-semibold text-[#C8F62D] underline hover:text-[#D7FA59] self-start sm:self-auto"
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
                    <div className="h-40 bg-[#F5F7F1] border-b border-white/[0.08] flex items-center justify-center p-2">
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
                      <div className="text-[11px] font-semibold text-[#C8F62D]">{fiche!.category}</div>
                      <h4 className="text-xs font-semibold text-[#F5F7F1]">{fiche!.titre}</h4>
                      <p className="text-[11px] text-[#B4BCA9] leading-relaxed">{fiche!.muscles}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {/* Security & Governance */}
        <section id="securite" className="border-t border-white/[0.08] bg-[#0B0E09] py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#C8F62D]">
                  <ShieldCheck className="h-4 w-4 text-[#C8F62D]" aria-hidden="true" />
                  <span>Sécurité et protection des données de santé</span>
                </div>
                <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#F5F7F1] text-balance">
                  Conçu pour la confiance des athlètes, des familles et des clubs
                </h2>
                <p className="mt-3 text-sm text-[#B4BCA9] leading-relaxed">
                  Les données de poids, de douleur et d’évaluation sont sensibles. Elles sont strictement cloisonnées entre l’athlète et son coach affecté, sans algorithme opaque ni partage commercial.
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl obsidian-card p-4">
                  <h3 className="text-sm font-semibold text-[#F5F7F1]">Cloisonnement par rôle (RBAC)</h3>
                  <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                    Un coach ne consulte que les athlètes qui lui sont officiellement affectés. Chaque consultation de fiche est enregistrée dans un journal d’audit.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-card p-4">
                  <h3 className="text-sm font-semibold text-[#F5F7F1]">Protection des mineurs</h3>
                  <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                    Accord explicite et téléphone d’un responsable légal exigés en dessous de 18 ans, avec visibilité privée par défaut.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-card p-4">
                  <h3 className="text-sm font-semibold text-[#F5F7F1]">Contenus relus avant diffusion</h3>
                  <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                    Chaque séance passe par un circuit de relecture par un préparateur physique ou un professionnel de santé avant publication.
                  </p>
                </div>
                <div className="rounded-2xl obsidian-card p-4">
                  <h3 className="text-sm font-semibold text-[#F5F7F1]">Protocole arrêt douleur</h3>
                  <p className="mt-1 text-xs text-[#B4BCA9] leading-relaxed">
                    Un signalement de douleur affiche l’arrêt immédiat et l’orientation médicale, tout en créant une alerte prioritaire chez le coach.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Partners / Ecosystem Section */}
        <section id="partenaires" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 space-y-8">
          <div className="rounded-3xl obsidian-card-glow p-6 sm:p-10 text-[#F5F7F1]">
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
                  <span className="text-xs font-semibold text-[#C8F62D]">
                    Privilège Jeunes Sportifs · ASC, Campus universitaires & Ligues
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F7F1] text-balance">
                  Un accès libre pour les jeunes, juste pour les coachs et durable pour les clubs
                </h2>
                <p className="text-sm text-[#B4BCA9] leading-relaxed max-w-2xl">
                  Votre socle d’entraînement quotidien (séances FR/Wolof, chronomètre, test du jour, alerte douleur, défis ASC) est gratuit à vie. Evoluez à votre rythme vers <strong className="text-[#F5F7F1]">Progression+</strong> ou le <strong className="text-[#F5F7F1]">Suivi Coach</strong>, pendant que les coachs s’inscrivent à <strong className="text-[#C8F62D]">0 FCFA</strong>.
                </p>
                {partnerData && (
                  <div className="pt-2 flex flex-wrap items-center gap-6 font-mono text-xs tabular-nums text-[#C8F62D]">
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
                  className="rounded-full bg-[#C8F62D] px-5 py-3 text-sm font-bold text-[#080A07] hover:bg-[#D7FA59] transition-colors min-h-[44px] text-center"
                >
                  {showPartnerForm ? 'Fermer le formulaire partenaire' : 'Demander un Pack ASC / Campus'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', previewSport, 'coach')}
                  className="rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-[#F5F7F1] hover:bg-white/[0.12] transition-colors min-h-[44px] text-center"
                >
                  Devenir Coach Prépa (0 FCFA à l’inscription)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="rounded-full border border-white/12 px-5 py-3 text-sm font-medium text-[#B4BCA9] hover:text-[#F5F7F1] hover:bg-white/[0.06] transition-colors min-h-[44px] text-center"
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
                  <span className="text-xs font-semibold text-[#C8F62D]">Athlète · Essentiel</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#F5F7F1]">0 FCFA</span>
                </div>
                <h3 className="text-base font-semibold text-[#F5F7F1]">Socle sportif gratuit à vie</h3>
                <ul className="space-y-1.5 text-xs text-[#B4BCA9]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>Séance du jour & lecteur FR/Wolof + chrono</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>Protocole d’alerte douleur 100 % gratuit</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>2 séances téléchargeables hors ligne & groupes ASC</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete')}
                className="w-full rounded-full border border-white/15 bg-[#181D15] px-4 py-2.5 text-xs font-semibold text-[#F5F7F1] hover:bg-[#22291E] min-h-[42px]"
              >
                Créer mon accès gratuit
              </button>
            </div>

            <div className="rounded-2xl obsidian-card border-orange-400/35 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-orange-300">Athlète · Progression+</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#F5F7F1]">1 500 FCFA / mois</span>
                </div>
                <h3 className="text-base font-semibold text-[#F5F7F1]">Bibliothèque complète & hors-ligne illimité</h3>
                <ul className="space-y-1.5 text-xs text-[#B4BCA9]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" /><span>Cycles spécialisés (Navétanes, Détente, Tir) & tous niveaux</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" /><span>Téléchargements hors connexion illimités</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" /><span>Comparatif multi-bilans · 4 000 F / trimestre</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete')}
                className="w-full rounded-full bg-orange-400 px-4 py-2.5 text-xs font-bold text-[#080A07] hover:bg-orange-300 min-h-[42px]"
              >
                Démarrer avec Progression+
              </button>
            </div>

            <div className="rounded-2xl obsidian-card-glow border-[#C8F62D]/40 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#C8F62D]">Privilège Jeunes · Suivi Coach</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#C8F62D]">5 000 FCFA / mois</span>
                </div>
                <h3 className="text-base font-semibold text-[#F5F7F1]">Progression+ et votre coach dédié</h3>
                <ul className="space-y-1.5 text-xs text-[#B4BCA9]">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>Tous les modules Progression+ inclus sans surcoût</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>Ajustements hebdomadaires datés & avis sur vos bilans</span></li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-[#C8F62D] mt-0.5 shrink-0" /><span>80 % reversés au coach (4 000 F) · 20 % plateforme</span></li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'athlete')}
                className="w-full rounded-full bg-[#C8F62D] px-4 py-2.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[42px]"
              >
                Choisir mon coach
              </button>
            </div>
          </div>

          {/* Coach Zero-Friction + B2B Packs Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl obsidian-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#C8F62D]">Coach Prépa · Modèle sans friction</div>
                <h3 className="text-base font-semibold text-[#F5F7F1]">
                  0 FCFA à l’inscription (Marketplace 80 %) ou Coach Pro 3 000 F/mois
                </h3>
                <p className="text-xs text-[#B4BCA9] leading-relaxed">
                  Rejoignez l’annuaire gratuitement et percevez 4 000 FCFA/mois par athlète suivi, ou passez à la licence Coach Pro (0 % de commission sur votre effectif).
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('register', previewSport, 'coach')}
                className="rounded-full bg-[#C8F62D] px-4 py-2.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] min-h-[42px] whitespace-nowrap shrink-0"
              >
                Inscrire mon profil Coach
              </button>
            </div>

            <div className="rounded-2xl obsidian-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#8E9784]">Partenaires B2B · ASC, Campus & Ligues</div>
                <h3 className="text-base font-semibold text-[#F5F7F1]">
                  Pack Collectif dès 15 000 – 30 000 FCFA / mois pour vos sportifs
                </h3>
                <p className="text-xs text-[#B4BCA9] leading-relaxed">
                  Offrez Progression+ à vos effectifs, désignez vos Capitaines Prépa et suivez la régularité agrégée sans classement individuel public.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPartnerForm(true)}
                className="rounded-full border border-white/15 bg-[#181D15] px-4 py-2.5 text-xs font-semibold text-[#F5F7F1] hover:bg-[#22291E] min-h-[42px] whitespace-nowrap shrink-0"
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
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#F5F7F1]">
                    Demander le déploiement pour votre ASC, Campus ou Ligue
                  </h3>
                  <p className="mt-1 text-xs text-[#B4BCA9]">
                    Enregistrée directement auprès de l’administrateur Terrain+ pour créer vos groupes et désigner vos Capitaines Prépa.
                  </p>
                </div>
                <Building2 className="h-5 w-5 text-[#C8F62D] shrink-0" aria-hidden="true" />
              </div>

              {partnerError && (
                <div className="rounded-xl border border-red-400/30 bg-red-950/60 px-3.5 py-2.5 text-xs text-red-200">
                  {partnerError}
                </div>
              )}

              {partnerSuccess && (
                <div className="rounded-xl border border-[#C8F62D]/35 bg-[#C8F62D]/10 px-4 py-3 text-xs text-[#E7FAC4] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#C8F62D] shrink-0" aria-hidden="true" />
                  <span>{partnerSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Nom de l’organisation *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex: ASC Diamono Thiès"
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Type de structure *
                  </label>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as 'ASC' | 'CAMPUS' | 'LIGUE')}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="ASC">ASC (Association Sportive et Culturelle)</option>
                    <option value="CAMPUS">Campus universitaire</option>
                    <option value="LIGUE">Ligue ou club fédéral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Ville / Zone *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgZone}
                    onChange={(e) => setOrgZone(e.target.value)}
                    placeholder="Ex: Thiès, Dakar, Saint-Louis..."
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Responsable / Contact *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactNom}
                    onChange={(e) => setContactNom(e.target.value)}
                    placeholder="Prénom et nom"
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Téléphone Sénégal (+221) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+221771234567"
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 font-mono text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Email professionnel
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="contact@structure.sn"
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Discipline principale
                  </label>
                  <select
                    value={sportPrincipal}
                    onChange={(e) => setSportPrincipal(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="Football">Football</option>
                    <option value="Basket">Basket</option>
                    <option value="Handball">Handball</option>
                    <option value="Volleyball">Volleyball</option>
                    <option value="Athlétisme">Athlétisme</option>
                    <option value="Multi-sports">Multi-disciplines</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Effectif estimé (athlètes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={5000}
                    value={estAthletes}
                    onChange={(e) => setEstAthletes(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 font-mono text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                    Formule partenaire B2B
                  </label>
                  <select
                    value={packSouhaite}
                    onChange={(e) => setPackSouhaite(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="PACK_ASC_CAMPUS">Pack ASC / Campus (15 000 – 30 000 F/mois)</option>
                    <option value="OBSERVATOIRE_LIGUE">Observatoire Ligue & Collectivité</option>
                    <option value="DEFI_SPONSORISE">Défi Collectif Sponsorisé</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#B4BCA9] mb-1">
                  Précisions sur vos besoins
                </label>
                <input
                  type="text"
                  value={orgMessage}
                  onChange={(e) => setOrgMessage(e.target.value)}
                  placeholder="Ex: Prépa navétanes, suivi campus..."
                  className="w-full rounded-xl border border-white/15 bg-[#181D15] text-[#F5F7F1] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPartnerForm(false)}
                  className="rounded-full border border-white/15 px-4 py-2.5 text-xs font-medium text-[#B4BCA9] hover:text-[#F5F7F1] hover:bg-white/[0.06] min-h-[42px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={partnerSubmitting}
                  className="rounded-full bg-[#C8F62D] px-5 py-2.5 text-xs font-bold text-[#080A07] hover:bg-[#D7FA59] disabled:opacity-50 min-h-[42px]"
                >
                  {partnerSubmitting ? 'Envoi...' : 'Envoyer la demande partenaire'}
                </button>
              </div>
            </form>
          )}

          {/* Active Partners & Collective Challenges Grid */}
          {partnerData && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-[#F5F7F1]">
                    Réseau partenaire actif et défis collectifs
                  </h3>
                  <p className="text-xs text-[#B4BCA9] mt-1">
                    Chaque groupe est rattaché à une structure partenaire et animé par un Capitaine Prépa. Indicateurs agrégés uniquement.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#121610] p-1 self-start">
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
                          ? 'bg-[#C8F62D] text-[#080A07]'
                          : 'text-[#B4BCA9] hover:text-[#F5F7F1]'
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
                        <div className="text-xs font-medium text-[#C8F62D]">
                          {PARTNER_TYPE_LABELS[partner.type]} · {partner.zone}
                        </div>
                        <h4 className="mt-1 text-base font-semibold text-[#F5F7F1]">{partner.nom}</h4>
                        <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-3">
                          {partnerGroups.length === 0 ? (
                            <p className="text-xs text-[#8E9784]">Groupes en cours de constitution.</p>
                          ) : (
                            partnerGroups.map((g) => (
                              <div key={g.id} className="text-xs text-[#E2E7DA]">
                                <div className="font-semibold text-[#F5F7F1]">{g.nom}</div>
                                <div className="text-[#8E9784] font-mono tabular-nums">
                                  {SPORTS_CONFIG[g.sport_code].nom} · Capitaine : {g.captain_name} · {g.member_count} membres
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#B4BCA9] font-mono tabular-nums">
                        <span>{partner.groups_count} groupe(s)</span>
                        <span>{partner.members_count} inscrit(s)</span>
                      </div>
                    </div>
                  );
                })}
                {filteredPartners.length === 0 && (
                  <div className="md:col-span-3 rounded-2xl obsidian-card p-6 text-center text-xs text-[#B4BCA9]">
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
                        <div className="flex items-center justify-between gap-2 text-xs text-[#8E9784]">
                          <span className="truncate">{ch.partner_nom} · {ch.periode}</span>
                          <span className="font-mono font-bold tabular-nums text-[#C8F62D]">{pct}%</span>
                        </div>
                        <div className="text-sm font-semibold text-[#F5F7F1]">{ch.titre}</div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                          <div className="h-full bg-[#C8F62D]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="font-mono text-xs tabular-nums text-[#B4BCA9]">
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

      <footer className="border-t border-white/[0.08] bg-[#0B0E09] py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#8E9784]">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-md object-contain shrink-0"
            />
            <span>Terrain+ · Ndeye Amy Kambaye & Mouhamadou Al Amin Ndiaye · Université Iba Der Thiam de Thiès</span>
          </div>
          <span>Suivi sportif encadré · Ne remplace pas un avis médical</span>
        </div>
      </footer>
    </div>
  );
};
