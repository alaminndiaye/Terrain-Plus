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
  imageUrl?: string;
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
    accentHex: '#C8F62D',
    accentHoverHex: '#A3E635',
    accentBgClass: 'bg-emerald-700',
    accentHoverBgClass: 'hover:bg-emerald-600',
    accentTextClass: 'text-[#C8F62D]',
    accentSoftBgClass: 'bg-[#C8F62D]/10',
    accentBorderClass: 'border-[#C8F62D]/25',
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
        imageUrl: '/assets/aistudio/image_09378c32.png',
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
        imageUrl: '/assets/aistudio/image_b6a22554.png',
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
    accentHex: '#FB923C',
    accentHoverHex: '#F97316',
    accentBgClass: 'bg-orange-700',
    accentHoverBgClass: 'hover:bg-orange-600',
    accentTextClass: 'text-orange-400',
    accentSoftBgClass: 'bg-orange-500/10',
    accentBorderClass: 'border-orange-400/25',
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
        imageUrl: '/assets/aistudio/image_b6a22554.png',
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
    accentHex: '#38BDF8',
    accentHoverHex: '#0EA5E9',
    accentBgClass: 'bg-sky-700',
    accentHoverBgClass: 'hover:bg-sky-600',
    accentTextClass: 'text-sky-400',
    accentSoftBgClass: 'bg-sky-500/10',
    accentBorderClass: 'border-sky-400/25',
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
        imageUrl: '/assets/aistudio/image_07428322.png',
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
        imageUrl: '/assets/aistudio/image_b6a22554.png',
        thresholds: {
          debutant: { medium: 50, good: 80 },
          intermediaire: { medium: 75, good: 110 },
          avance: { medium: 100, good: 140 },
        },
      },
    ],
  },
  volleyball: {
    code: 'volleyball',
    nom: 'Volleyball',
    subtitle: 'Détente verticale, réceptions stables et protection d’épaule au smash',
    imageUrl: '/src/assets/images/sport_volleyball_court_1795004642446.jpg',
    accentHex: '#2DD4BF',
    accentHoverHex: '#14B8A6',
    accentBgClass: 'bg-teal-700',
    accentHoverBgClass: 'hover:bg-teal-600',
    accentTextClass: 'text-teal-300',
    accentSoftBgClass: 'bg-teal-500/10',
    accentBorderClass: 'border-teal-400/25',
    qualities: [
      'Détente verticale et impulsion',
      'Stabilité à la réception de saut',
      'Déplacements latéraux courts',
      'Solidité et endurance de l’épaule',
    ],
    preventionZones: ['Genoux (tendon rotulien)', 'Épaules', 'Chevilles'],
    dashboardMetrics: {
      primary: 'Régularité',
      secondary: 'Score de détente',
      tertiary: 'Score épaule & appuis',
    },
    positions: ['Passeur', 'Réceptionneur-Attaquant', 'Central', 'Pointu', 'Libéro'],
    tests: [
      {
        code: 'vb_saut_vertical',
        nom: 'Détente verticale contre un mur',
        consigne: 'Marquez votre portée bras levé contre un mur, puis sautez sans élan en visant le point le plus haut possible.',
        unite: 'cm',
        imageUrl: '/assets/aistudio/image_09378c32.png',
        thresholds: {
          debutant: { medium: 34, good: 44 },
          intermediaire: { medium: 42, good: 52 },
          avance: { medium: 50, good: 62 },
        },
      },
      {
        code: 'vb_pompes_explosives',
        nom: 'Pompes dynamiques en 20 s',
        consigne: 'Corps gainé, effectuez un maximum de pompes contrôlées avec poussée dynamique en 20 secondes.',
        unite: 'répétitions',
        dureeChronoSec: 20,
        imageUrl: '/assets/aistudio/image_07428322.png',
        thresholds: {
          debutant: { medium: 8, good: 13 },
          intermediaire: { medium: 12, good: 18 },
          avance: { medium: 16, good: 23 },
        },
      },
      {
        code: 'vb_navette_laterale',
        nom: 'Navette latérale défense (4 x 5 m)',
        consigne: 'Entre deux lignes espacées de 5 mètres, enchaînez 4 trajets en pas chassés bas et touchez la ligne.',
        unite: 'secondes',
        lowerIsBetter: true,
        thresholds: {
          debutant: { medium: 9.8, good: 8.6 },
          intermediaire: { medium: 8.8, good: 7.7 },
          avance: { medium: 7.9, good: 6.9 },
        },
      },
    ],
  },
  athletisme: {
    code: 'athletisme',
    nom: 'Athlétisme',
    subtitle: 'Sprint, demi-fond, gestion de charge et prévention ischio-Achille',
    imageUrl: '/src/assets/images/hero_terrain_campus_1794878270523.jpg',
    accentHex: '#FBBF24',
    accentHoverHex: '#F59E0B',
    accentBgClass: 'bg-amber-700',
    accentHoverBgClass: 'hover:bg-amber-600',
    accentTextClass: 'text-amber-300',
    accentSoftBgClass: 'bg-amber-500/10',
    accentBorderClass: 'border-amber-400/25',
    qualities: [
      'Accélération et vitesse de pointe',
      'Puissance des appuis et réactivité',
      'Stabilité du bassin à pleine foulée',
      'Endurance aérobie et récupération',
    ],
    preventionZones: ['Ischio-jambiers', 'Tendons d’Achille', 'Bas du dos'],
    dashboardMetrics: {
      primary: 'Régularité',
      secondary: 'Score vitesse & appuis',
      tertiary: 'Score d’endurance',
    },
    positions: ['Sprint (60–400 m)', 'Demi-fond (800–1500 m)', 'Haies', 'Sauts'],
    tests: [
      {
        code: 'ath_accel_30m',
        nom: 'Accélération 30 m départ arrêté',
        consigne: 'Sur piste ou terrain plat balisé à 30 m, partez en position haute et chronométrez votre sprint maximal.',
        unite: 'secondes',
        lowerIsBetter: true,
        thresholds: {
          debutant: { medium: 5.2, good: 4.7 },
          intermediaire: { medium: 4.8, good: 4.35 },
          avance: { medium: 4.45, good: 4.05 },
        },
      },
      {
        code: 'ath_squats_30s',
        nom: 'Squats explosifs en 30 s',
        consigne: 'Descente contrôlée cuisses parallèles au sol et remontée tonique pendant 30 secondes.',
        unite: 'répétitions',
        dureeChronoSec: 30,
        imageUrl: '/assets/aistudio/image_09378c32.png',
        thresholds: {
          debutant: { medium: 17, good: 23 },
          intermediaire: { medium: 21, good: 27 },
          avance: { medium: 25, good: 32 },
        },
      },
      {
        code: 'ath_gainage_lateral',
        nom: 'Gainage latéral (cumul G + D)',
        consigne: 'Maintenez le bassin aligné sur l’avant-bras droit puis gauche pour stabiliser la foulée.',
        unite: 'secondes',
        imageUrl: '/assets/aistudio/image_b6a22554.png',
        thresholds: {
          debutant: { medium: 55, good: 85 },
          intermediaire: { medium: 80, good: 115 },
          avance: { medium: 105, good: 145 },
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
