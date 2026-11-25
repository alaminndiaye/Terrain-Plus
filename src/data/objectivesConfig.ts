import type { ObjectiveCode, SportCode } from '../types';

export interface TrainingObjectiveSpec {
  code: ObjectiveCode;
  label: string;
  shortLabel: string;
  description: string;
  programSummary: string;
  recommendedSports: SportCode[];
  sportGuidance: Record<SportCode, string>;
  sessionKeywords: string[];
}

export const TRAINING_OBJECTIVES: TrainingObjectiveSpec[] = [
  {
    code: 'PERTE_POIDS',
    label: 'Perte de poids & affûtage',
    shortLabel: 'Perte de poids',
    description: 'Brûler des calories, améliorer le cardio et affiner la silhouette sans perdre de tonus.',
    programSummary: 'Circuit cardio-métabolique, intervalles courts et renforcement global',
    recommendedSports: ['fitness', 'athletisme', 'football', 'basket', 'handball', 'volleyball'],
    sportGuidance: {
      fitness: 'Circuits HIIT et cardio sans matériel très efficaces pour la dépense calorique.',
      athletisme: 'Fractionné 15/15 et allure active pour maximiser le souffle et la dépense.',
      football: 'Endurance intermittente et appuis rythmés pour fondre sur le terrain.',
      basket: 'Enchaînements rapides et pas chassés haute fréquence cardiaque.',
      handball: 'Transitions rapides, gainage actif et sprints courts répétés.',
      volleyball: 'Déplacements défensifs continus et sauts dynamiques maîtrisés.',
    },
    sessionKeywords: ['intermittent', '15', 'hiit', 'brûle', 'perte', 'cardio', 'endurance', 'appuis', 'aérobie', 'vma'],
  },
  {
    code: 'PRISE_MASSE',
    label: 'Croissance musculaire & prise de masse',
    shortLabel: 'Prise de masse',
    description: 'Prendre du muscle, gagner en force fonctionnelle et solidifier le haut et bas du corps.',
    programSummary: 'Hypertrophie au poids du corps, tempo contrôlé et force progressive',
    recommendedSports: ['fitness', 'handball', 'basket', 'football', 'volleyball', 'athletisme'],
    sportGuidance: {
      fitness: 'Séances ciblées hypertrophie (squats, pompes variées, gainage sous tension).',
      handball: 'Travail puissant du haut du corps, des épaules et des appuis de duel.',
      basket: 'Force des jambes, squats gobelet et solidité au rebond.',
      football: 'Renforcement quadriceps, ischios et sangle abdominale pour les duels.',
      volleyball: 'Puissance des membres inférieurs et gainage de frappe.',
      athletisme: 'Force sous-maximale jambes et explosivité du bassin.',
    },
    sessionKeywords: ['masse', 'hypertrophie', 'force', 'puissance', 'squat', 'pompe', 'haut du corps', 'jambes', 'barre', 'goblet'],
  },
  {
    code: 'ENDURANCE',
    label: 'Endurance & souffle',
    shortLabel: 'Endurance',
    description: 'Tenir tout un match ou une longue course sans baisse de régime ni essoufflement.',
    programSummary: 'Développement VMA, intermittents progressifs et tenue d’effort',
    recommendedSports: ['athletisme', 'football', 'fitness', 'basket', 'handball', 'volleyball'],
    sportGuidance: {
      athletisme: 'Mécanique de foulée économique et fractionné VMA structuré.',
      football: 'Intermittent 15-15 et tenue d’effort sur 90 minutes.',
      fitness: 'Circuits métaboliques longs et rythme cardiaque soutenu.',
      basket: 'Répétition d’allers-retours sans perte de lucidité.',
      handball: 'Enchaînements attaque / repli et tenue de rythme.',
      volleyball: 'Endurance de saut et mobilité sur longs échanges.',
    },
    sessionKeywords: ['endurance', 'aérobie', 'vma', 'intermittent', 'fractionné', 'foulée', 'course', 'cardio'],
  },
  {
    code: 'EXPLOSIVITE',
    label: 'Vitesse, détente & explosivité',
    shortLabel: 'Explosivité',
    description: 'Sauter plus haut, démarrer plus vite et gagner vos premiers mètres.',
    programSummary: 'Plyométrie maîtrisée, départs rapides et réactivité neuromusculaire',
    recommendedSports: ['basket', 'volleyball', 'athletisme', 'football', 'handball', 'fitness'],
    sportGuidance: {
      basket: 'Détente verticale, pogo élastique et premier pas explosif.',
      volleyball: 'Impulsion au filet, block et vitesse d’extension.',
      athletisme: 'Accélérations 30 m et poussée horizontale au départ.',
      football: 'Appuis courts, changements de direction et sprints courts.',
      handball: 'Détente de tir en suspension et démarrage en contre-attaque.',
      fitness: 'Squats sautés, travail dynamique et gainage réactif.',
    },
    sessionKeywords: ['explosiv', 'détente', 'sprint', 'vitesse', 'impulsion', 'plyométrie', 'accélération', 'réactivité', 'saut'],
  },
  {
    code: 'PERFORMANCE',
    label: 'Préparation physique complète',
    shortLabel: 'Performance globale',
    description: 'Combiner force, vitesse, endurance et explosivité pour votre meilleure forme.',
    programSummary: 'Cycle complet équilibré et adapté à votre discipline',
    recommendedSports: ['football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness'],
    sportGuidance: {
      football: 'Mix complet appuis, endurance de match et puissance.',
      basket: 'Mix détente, appuis défensifs et solidité physique.',
      handball: 'Mix puissance de tir, vitesse et gainage anti-rotation.',
      volleyball: 'Mix impulsion verticale, défense basse et épaule.',
      athletisme: 'Mix foulée, VMA et puissance de départ.',
      fitness: 'Mix cardio métabolique, force fonctionnelle et mobilité.',
    },
    sessionKeywords: ['complet', 'tournoi', 'cycle', 'préparation', 'puissance', 'endurance'],
  },
];

export const OBJECTIVE_BY_CODE: Record<ObjectiveCode, TrainingObjectiveSpec> = TRAINING_OBJECTIVES.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<ObjectiveCode, TrainingObjectiveSpec>
);

export const OBJECTIVE_CODES: ObjectiveCode[] = TRAINING_OBJECTIVES.map((o) => o.code);

export function resolveObjectiveSpec(codeOrText?: string | null): TrainingObjectiveSpec {
  if (!codeOrText) return OBJECTIVE_BY_CODE.PERFORMANCE;
  const upper = codeOrText.trim().toUpperCase();
  if (upper in OBJECTIVE_BY_CODE) {
    return OBJECTIVE_BY_CODE[upper as ObjectiveCode];
  }
  const lower = codeOrText.toLowerCase();
  if (lower.includes('poids') || lower.includes('maigrir') || lower.includes('affût') || lower.includes('affut')) {
    return OBJECTIVE_BY_CODE.PERTE_POIDS;
  }
  if (lower.includes('masse') || lower.includes('musc') || lower.includes('hypertrophie') || lower.includes('volume')) {
    return OBJECTIVE_BY_CODE.PRISE_MASSE;
  }
  if (lower.includes('endurance') || lower.includes('souffle') || lower.includes('cardio')) {
    return OBJECTIVE_BY_CODE.ENDURANCE;
  }
  if (lower.includes('explos') || lower.includes('vitesse') || lower.includes('détente') || lower.includes('detente')) {
    return OBJECTIVE_BY_CODE.EXPLOSIVITE;
  }
  return OBJECTIVE_BY_CODE.PERFORMANCE;
}

export function buildAthleteObjectiveLabel(objectiveCode: ObjectiveCode, sportName: string): string {
  const spec = OBJECTIVE_BY_CODE[objectiveCode] || OBJECTIVE_BY_CODE.PERFORMANCE;
  return `${spec.shortLabel} · ${sportName}`;
}
