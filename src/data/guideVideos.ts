import type { SportCode } from '../types';

export interface CuratedGuideVideo {
  id: string;
  sport_code: SportCode | 'all';
  titre: string;
  description: string;
  url: string;
  source_type?: 'EXTERNAL_URL' | 'LOCAL_STORAGE';
  size_bytes?: number;
  durationLabel?: string;
}

/**
 * Catalogue léger de vidéos de guidage sportif (chargées uniquement au clic = 0 Mo au chargement).
 */
export const CURATED_GUIDE_VIDEOS: CuratedGuideVideo[] = [
  {
    id: 'guide-vitesse-appuis',
    sport_code: 'football',
    titre: 'Vitesse, appuis courts et coordination',
    description:
      'Travail dynamique des appuis et relances explosives pour protéger les chevilles lors des changements de direction.',
    url: 'https://www.youtube.com/watch?v=PTZZP6kQiHs',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-athletisme-appuis',
    sport_code: 'athletisme',
    titre: 'Fréquence d’appuis et vitesse de course',
    description:
      'Placement du pied, poussée active et rythme d’exécution pour améliorer la foulée sans surcharge articulaire.',
    url: 'https://www.youtube.com/watch?v=PTZZP6kQiHs',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-mobilite-coordination',
    sport_code: 'basket',
    titre: 'Mobilité articulaire et coordination globale',
    description:
      'Échauffement fluide des hanches, genoux et épaules avant les sauts, réceptions et déplacements latéraux.',
    url: 'https://www.youtube.com/watch?v=LXPKkWmWqbo',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-volley-coordination',
    sport_code: 'volleyball',
    titre: 'Mobilité, coordination et détente contrôlée',
    description:
      'Fluidité des chaînes musculaires et synchronisation bras-jambes pour préparer les impulsions et réceptions.',
    url: 'https://www.youtube.com/watch?v=LXPKkWmWqbo',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-handball-epaules',
    sport_code: 'handball',
    titre: 'Posture et protection des épaules',
    description:
      'Ouverture thoracique et stabilisation des omoplates pour prévenir l’enroulement des épaules lors des tirs répétés.',
    url: 'https://www.youtube.com/watch?v=xj7_hKX9aLI',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-handball-circuit',
    sport_code: 'handball',
    titre: 'Circuit training et mobilité sans matériel',
    description:
      'Enchaînement complet d’endurance musculaire et de gainage dynamique adapté aux entraînements en plein air.',
    url: 'https://www.youtube.com/watch?v=jTkDZ42dWK8',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-fitness-cardio',
    sport_code: 'fitness',
    titre: 'Circuit cardio poids du corps',
    description:
      'Séquence rythmée sans matériel pour stimuler la dépense énergétique, le souffle et l’endurance générale.',
    url: 'https://www.youtube.com/watch?v=5khuDHiz5Kw',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-fitness-squats',
    sport_code: 'fitness',
    titre: 'Squat, renforcement cuisses et fessiers',
    description:
      'Alignement genoux-hanches et contrôle de la descente pour développer force et maintien du bas du corps.',
    url: 'https://www.youtube.com/watch?v=SJ0Q5CWdMLY',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-gainage-posture',
    sport_code: 'all',
    titre: 'Gainage : les erreurs de posture à éviter',
    description:
      'Alignement tête-bassin et engagement abdominal pour renforcer la sangle abdominale sans creuser le dos.',
    url: 'https://www.youtube.com/watch?v=_tgM4p6sv4k',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
  {
    id: 'guide-gainage-dynamique',
    sport_code: 'all',
    titre: 'Renforcement du tronc et stabilité',
    description:
      'Variantes progressives de gainage pour sécuriser la colonne vertébrale dans toutes les disciplines.',
    url: 'https://www.youtube.com/watch?v=RkG2OJjCc4k',
    source_type: 'EXTERNAL_URL',
    size_bytes: 0,
  },
];

export function getCuratedVideosForSport(sport: SportCode): CuratedGuideVideo[] {
  return CURATED_GUIDE_VIDEOS.filter((v) => v.sport_code === sport || v.sport_code === 'all');
}
