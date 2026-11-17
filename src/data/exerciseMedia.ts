export type TechniqueCategory = 'Pompes' | 'Squats' | 'Gainage';

export interface TechniqueFiche {
  id: string;
  titre: string;
  category: TechniqueCategory;
  muscles: string;
  caption: string;
  imageUrl: string;
  tier: 'ESSENTIEL' | 'PROGRESSION';
}

export const TECHNIQUE_FICHES: TechniqueFiche[] = [
  {
    id: 'squat-sans-materiel',
    titre: 'Squat sans matériel — Posture de base',
    category: 'Squats',
    muscles: 'Quadriceps, fessiers, sangle abdominale',
    caption: 'Bras tendus devant pour l’équilibre, dos neutre, genoux dans l’axe des pointes de pieds.',
    imageUrl: '/assets/aistudio/image_09378c32.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'squat-muscles-travailles',
    titre: 'Squat fessier — Anatomie sollicitée',
    category: 'Squats',
    muscles: 'Abdominaux, Quadriceps, Ischio-jambiers, Fessiers',
    caption: 'Repères visuels des groupes musculaires activés lors de la flexion complète et du maintien du buste.',
    imageUrl: '/assets/aistudio/image_bbc9d397.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'squat-ecartement-pieds',
    titre: 'Squats — Écartement des pieds',
    category: 'Squats',
    muscles: 'Adducteurs, quadriceps internes ou externes',
    caption: 'Adapter l’écartement (écarté, standard ou serré) selon l’objectif de puissance ou de mobilité.',
    imageUrl: '/assets/aistudio/image_76a64964.png',
    tier: 'PROGRESSION',
  },
  {
    id: 'squat-goblet-charge',
    titre: 'Squat avec charge avant (Goblet)',
    category: 'Squats',
    muscles: 'Quadriceps, haut du dos, gainage profond',
    caption: 'Variante exigeante avec charge tenue devant la poitrine (ou ballon lesté) pour stabiliser le buste.',
    imageUrl: '/assets/aistudio/image_740f23a8.png',
    tier: 'PROGRESSION',
  },
  {
    id: 'squat-barre-club',
    titre: 'Squat barre en club (Position A → B)',
    category: 'Squats',
    muscles: 'Chaîne postérieure, quadriceps, tronc',
    caption: 'Référence technique pour les séances en salle équipée ou préparation athlétique avancée.',
    imageUrl: '/assets/aistudio/image_7b2641ec.png',
    tier: 'PROGRESSION',
  },
  {
    id: 'pompes-amplitude',
    titre: 'Pompes — Mouvement complet (bas → haut)',
    category: 'Pompes',
    muscles: 'Pectoraux, triceps, deltoïdes, gainage',
    caption: 'Descendre contrôlé près du sol puis pousser bras tendus en gardant bassin et talons alignés.',
    imageUrl: '/assets/aistudio/image_07428322.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'pompes-position-basse',
    titre: 'Pompe classique — Alignement en position basse',
    category: 'Pompes',
    muscles: 'Pectoraux, épaules, sangle abdominale',
    caption: 'Coudes à 45 degrés du buste, nuque alignée avec la colonne sans creuser le bas du dos.',
    imageUrl: '/assets/aistudio/image_408868fa.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'pompes-positions-mains',
    titre: 'Pompes — Positions des mains et cibles',
    category: 'Pompes',
    muscles: 'Pectoraux, triceps, gainage, deltoïdes antérieurs',
    caption: 'Classiques (compromis), serrées (triceps), larges (pectoraux) ou asymétriques selon le besoin du sport.',
    imageUrl: '/assets/aistudio/image_8527d860.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'pompes-mains-rapprochees',
    titre: 'Pompes mains rapprochées — Anatomie',
    category: 'Pompes',
    muscles: 'Grands dentelés, pectoraux et triceps',
    caption: 'Visualisation anatomique du recrutement des triceps et grands dentelés sur appui serré.',
    imageUrl: '/assets/aistudio/image_090875a4.png',
    tier: 'ESSENTIEL',
  },
  {
    id: 'pompes-alignement-3d',
    titre: 'Pompes — Contrôle postural et plan d’appui',
    category: 'Pompes',
    muscles: 'Deltoïdes, faisceaux claviculaires & sternaux, tronc',
    caption: 'Maintenir le torse parfaitement droit de la tête aux chevilles sur chaque répétition exigeante.',
    imageUrl: '/assets/aistudio/image_f97009a6.png',
    tier: 'PROGRESSION',
  },
  {
    id: 'planche-et-variantes',
    titre: 'Planche et variantes de gainage',
    category: 'Gainage',
    muscles: 'Abdominaux, obliques, fessiers, épaules',
    caption: '6 progressions : planche classique, sur les genoux, latérale, bras décollé, jambe décollée et bras tendus.',
    imageUrl: '/assets/aistudio/image_b6a22554.png',
    tier: 'ESSENTIEL',
  },
];

export function getExerciseVisual(
  exerciseName: string,
  explicitUrl?: string
): { imageUrl: string; label: string; caption: string } | null {
  if (explicitUrl) {
    const match = TECHNIQUE_FICHES.find((f) => f.imageUrl === explicitUrl);
    return {
      imageUrl: explicitUrl,
      label: match ? match.titre : exerciseName,
      caption: match ? match.caption : 'Repère visuel d’exécution technique.',
    };
  }

  const lower = exerciseName.toLowerCase();
  if (lower.includes('gainage') || lower.includes('planche')) {
    const f = TECHNIQUE_FICHES.find((x) => x.id === 'planche-et-variantes')!;
    return { imageUrl: f.imageUrl, label: f.titre, caption: f.caption };
  }
  if (lower.includes('pompe') || lower.includes('épaule') || lower.includes('lancer')) {
    const id = lower.includes('serré') || lower.includes('rapproch')
      ? 'pompes-mains-rapprochees'
      : lower.includes('position') || lower.includes('scapulaire')
        ? 'pompes-positions-mains'
        : 'pompes-amplitude';
    const f = TECHNIQUE_FICHES.find((x) => x.id === id)!;
    return { imageUrl: f.imageUrl, label: f.titre, caption: f.caption };
  }
  if (lower.includes('squat') || lower.includes('fente') || lower.includes('saut') || lower.includes('pont')) {
    const id = lower.includes('goblet') || lower.includes('charge')
      ? 'squat-goblet-charge'
      : lower.includes('barre')
        ? 'squat-barre-club'
        : lower.includes('fessier')
          ? 'squat-muscles-travailles'
          : 'squat-sans-materiel';
    const f = TECHNIQUE_FICHES.find((x) => x.id === id)!;
    return { imageUrl: f.imageUrl, label: f.titre, caption: f.caption };
  }
  return null;
}
