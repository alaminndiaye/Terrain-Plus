import type { AthleteLevel, SportCode, TestRating } from '../types';

export interface SportTestSpec {
  code: string;
  nom: string;
  consigne: string;
  unite: string;
  dureeChronoSec?: number;
  thresholds: {
    debutant: { medium: number; good: number };
    intermediaire: { medium: number; good: number };
    avance: { medium: number; good: number };
  };
  lowerIsBetter?: boolean;
}

export interface SportThemeConfig {
  code: SportCode;
  nom: string;
  subtitle: string;
  imageUrl: string;
  accentHex: string;
  accentHoverHex: string;
  accentBgClass: string;
  accentHoverBgClass: string;
  accentTextClass: string;
  accentSoftBgClass: string;
  accentBorderClass: string;
  qualities: string[];
  preventionZones: string[];
  dashboardMetrics: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  positions: string[];
  tests: SportTestSpec[];
}

export const SPORTS_CONFIG: Record<SportCode, SportThemeConfig> = {
  football: {
    code: 'football',
    nom: 'Football',
    subtitle: 'Endurance intermittente, accélération et changements de direction',
    imageUrl: '/src/assets/images/sport_football_field_1794878271599.jpg',
    accentHex: '#15803D',
    accentHoverHex: '#166534',
    accentBgClass: 'bg-emerald-700',
    accentHoverBgClass: 'hover:bg-emerald-800',
    accentTextClass: 'text-emerald-700',
    accentSoftBgClass: 'bg-emerald-50',
    accentBorderClass: 'border-emerald-200',
    qualities: [
      'Endurance intermittente',
      'Accélération sur 10-20 m',
      'Changements de direction',
      'Force des jambes',
    ],
    preventionZones: ['Cuisses (ischio-jambiers)', 'Chevilles'],
    dashboardMetrics: {
      primary: 'Régularité',
      secondary: "Score d'endurance",
      tertiary: 'Score de puissance',
    },
    positions: ['Gardien', 'Défenseur', 'Milieu', 'Attaquant', 'Polyvalent'],
    tests: [
      {
        code: 'fb_squats_30s',
        nom: 'Squats en 30 s',
        consigne: 'Pieds largeur d’épaules, descendez cuisses parallèles au sol puis remontez complètement pendant 30 secondes.',
        unite: 'répétitions',
        dureeChronoSec: 30,
        thresholds: {
          debutant: { medium: 16, good: 22 },
          intermediaire: { medium: 20, good: 26 },
          avance: { medium: 24, good: 30 },
        },
      },
      {
        code: 'fb_navette_courte',
        nom: 'Course navette courte (6 x 10 m)',
        consigne: 'Placez deux repères à 10 mètres. Effectuez 3 allers-retours à intensité maximale en touchant la ligne.',
        unite: 'secondes',
        lowerIsBetter: true,
        thresholds: {
          debutant: { medium: 16.5, good: 14.8 },
          intermediaire: { medium: 15.2, good: 13.6 },
          avance: { medium: 14.0, good: 12.6 },
        },
      },
      {
        code: 'fb_gainage_chrono',
        nom: 'Gainage frontal chronométré',
        consigne: 'En appui sur les avant-bras, alignez tête, bassin et chevilles sans creuser le dos. Maintenez le plus longtemps possible.',
        unite: 'secondes',
        thresholds: {
          debutant: { medium: 40, good: 65 },
          intermediaire: { medium: 60, good: 90 },
          avance: { medium: 80, good: 120 },
        },
      },
    ],
  },
  basket: {
    code: 'basket',
    nom: 'Basket',
    subtitle: 'Détente verticale, appuis latéraux et réactivité sur demi-terrain',
    imageUrl: '/src/assets/images/sport_basket_court_1794878271147.jpg',
    accentHex: '#C2410C',
    accentHoverHex: '#9A3412',
    accentBgClass: 'bg-orange-700',
    accentHoverBgClass: 'hover:bg-orange-800',
    accentTextClass: 'text-orange-700',
    accentSoftBgClass: 'bg-orange-50',
    accentBorderClass: 'border-orange-200',
    qualities: [
      'Détente verticale',
      'Appuis latéraux défensifs',
      'Réactivité et premier pas',
      'Force des jambes et stabilité',
    ],
    preventionZones: ['Chevilles', 'Genoux'],
    dashboardMetrics: {
      primary: 'Régularité',
      secondary: 'Score de détente',
      tertiary: 'Score de réactivité',
    },
    positions: ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'],
    tests: [
      {
        code: 'bk_saut_vertical',
        nom: 'Saut vertical mesuré au mur',
        consigne: 'Marquez votre portée bras levé contre un mur, puis sautez pieds joints sans élan et mesurez l’écart.',
        unite: 'cm',
        thresholds: {
          debutant: { medium: 32, good: 42 },
          intermediaire: { medium: 40, good: 50 },
          avance: { medium: 48, good: 60 },
        },
      },
      {
        code: 'bk_appuis_lateraux',
        nom: 'Appuis latéraux en 20 s',
        consigne: 'Entre deux lignes espacées de 3 mètres, réalisez des pas chassés défensifs sans croiser les pieds pendant 20 secondes.',
        unite: 'allers-retours',
        dureeChronoSec: 20,
        thresholds: {
          debutant: { medium: 8, good: 11 },
          intermediaire: { medium: 10, good: 13 },
          avance: { medium: 12, good: 15 },
        },
      },
      {
        code: 'bk_gainage',
        nom: 'Gainage frontal stabilisé',
        consigne: 'Planche sur avant-bras, hanches stables, respiration régulière jusqu’à fatigue technique.',
        unite: 'secondes',
        thresholds: {
          debutant: { medium: 40, good: 65 },
          intermediaire: { medium: 60, good: 90 },
          avance: { medium: 80, good: 115 },
        },
      },
    ],
  },
  handball: {
    code: 'handball',
    nom: 'Handball',
    subtitle: 'Lancer, détente, vitesse courte et solidité des épaules',
    imageUrl: '/src/assets/images/sport_handball_court_1794878272432.jpg',
    accentHex: '#1D4ED8',
    accentHoverHex: '#1E40AF',
    accentBgClass: 'bg-blue-700',
    accentHoverBgClass: 'hover:bg-blue-800',
    accentTextClass: 'text-blue-700',
    accentSoftBgClass: 'bg-blue-50',
    accentBorderClass: 'border-blue-200',
    qualities: [
      'Puissance de lancer',
      'Détente et réception',
      'Vitesse sur courte distance',
      'Force des épaules et du tronc',
    ],
    preventionZones: ['Épaules', 'Genoux'],
    dashboardMetrics: {
      primary: 'Régularité',
      secondary: 'Score puissance haut du corps',
      tertiary: 'Score de vitesse',
    },
    positions: ['Gardien', 'Ailier', 'Arrière', 'Demi-centre', 'Pivot'],
    tests: [
      {
        code: 'hb_pompes_max',
        nom: 'Pompes maximales continues',
        consigne: 'Corps gainé, descendez la poitrine près du sol puis poussez bras tendus sans pause de plus de 2 secondes.',
        unite: 'répétitions',
        thresholds: {
          debutant: { medium: 10, good: 18 },
          intermediaire: { medium: 18, good: 28 },
          avance: { medium: 26, good: 38 },
        },
      },
      {
        code: 'hb_saut_longueur',
        nom: 'Saut en longueur sans élan',
        consigne: 'Pieds parallèles derrière la ligne, fléchissez et sautez vers l’avant en amortissant sur deux pieds.',
        unite: 'cm',
        thresholds: {
          debutant: { medium: 165, good: 195 },
          intermediaire: { medium: 190, good: 220 },
          avance: { medium: 215, good: 245 },
        },
      },
      {
        code: 'hb_gainage_lateral',
        nom: 'Gainage latéral (cumul G + D)',
        consigne: 'Maintenez l’alignement sur un avant-bras côté droit puis côté gauche. Additionnez les deux temps.',
        unite: 'secondes',
        thresholds: {
          debutant: { medium: 50, good: 80 },
          intermediaire: { medium: 75, good: 110 },
          avance: { medium: 100, good: 140 },
        },
      },
    ],
  },
};

export function evaluateTestValue(
  spec: SportTestSpec,
  level: AthleteLevel,
  value: number
): { rating: TestRating; score100: number } {
  const th = spec.thresholds[level];
  if (spec.lowerIsBetter) {
    if (value <= th.good) {
      return { rating: 'Bon pour le niveau', score100: 90 };
    }
    if (value <= th.medium) {
      return { rating: 'Moyen', score100: 70 };
    }
    return { rating: 'Faible', score100: 45 };
  }

  if (value >= th.good) {
    return { rating: 'Bon pour le niveau', score100: 90 };
  }
  if (value >= th.medium) {
    return { rating: 'Moyen', score100: 70 };
  }
  return { rating: 'Faible', score100: 45 };
}

export const LEVEL_LABELS: Record<AthleteLevel, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
};
