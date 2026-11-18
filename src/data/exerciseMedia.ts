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

export type ExerciseMotionType =
  | 'squat'
  | 'jump_squat'
  | 'lunge'
  | 'pushup'
  | 'plank'
  | 'side_plank'
  | 'glute_bridge'
  | 'high_knees'
  | 'lateral_shuffle'
  | 'pogo_hop'
  | 'single_leg_balance'
  | 'shoulder_rotation';

export interface ExerciseDemoPhase {
  label: string;
  breath: string;
  start: number;
  end: number;
}

export interface ExerciseDemoSpec {
  motion: ExerciseMotionType;
  title: string;
  tempoLabel: string;
  preventionZone: string;
  breathing: string;
  cues: [string, string, string];
  phases: ExerciseDemoPhase[];
}

export function resolveExerciseDemoSpec(exerciseName: string): ExerciseDemoSpec {
  const lower = exerciseName.toLowerCase();

  if (lower.includes('pont') || lower.includes('ischio')) {
    return {
      motion: 'glute_bridge',
      title: 'Pont fessier & protection ischio-jambiers',
      tempoLabel: '1.5s montée · 1.5s maintien haut · 1.5s descente',
      preventionZone: 'Ischio-jambiers, fessiers & bas du dos',
      breathing: 'Soufflez en décollant le bassin, inspirez à la descente',
      cues: [
        'Pousser uniquement à travers le talon au sol',
        'Aligner genoux, hanches et épaules au sommet sans cambrer',
        'Contrôler la descente jusqu’au frôlement du sol',
      ],
      phases: [
        { label: 'Extension hanche', breath: 'Soufflez en montant', start: 0, end: 0.4 },
        { label: 'Verrouillage haut', breath: 'Maintenez 1.5s', start: 0.4, end: 0.7 },
        { label: 'Descente freinée', breath: 'Inspirez doucement', start: 0.7, end: 1 },
      ],
    };
  }

  if (lower.includes('pompe')) {
    return {
      motion: 'pushup',
      title: 'Pompes — Alignement & poussée',
      tempoLabel: '2s descente · 0.5s pause · Poussée nette',
      preventionZone: 'Épaules, coudes & gainage lombaire',
      breathing: 'Inspirez à la descente vers le sol, soufflez sur la poussée',
      cues: [
        'Coudes orientés à 45 degrés du buste (pas écartés à 90 degrés)',
        'Bassin et talons alignés en permanence sans cambrure',
        'Poitrine frôle le sol puis extension complète des bras',
      ],
      phases: [
        { label: 'Descente contrôlée', breath: 'Inspirez à la descente', start: 0, end: 0.42 },
        { label: 'Position basse', breath: 'Gainage actif', start: 0.42, end: 0.58 },
        { label: 'Poussée dynamique', breath: 'Soufflez fort', start: 0.58, end: 1 },
      ],
    };
  }

  if (lower.includes('rotation') || lower.includes('scapulaire')) {
    return {
      motion: 'shoulder_rotation',
      title: 'Mobilité d’épaule & contrôle scapulaire',
      tempoLabel: 'Amplitude progressive · Sans à-coup',
      preventionZone: 'Coiffe des rotateurs & omoplates',
      breathing: 'Inspirez à l’ouverture du buste, soufflez au retour',
      cues: [
        'Garder le bassin fixe et la nuque longue pendant la rotation',
        'Fixer les omoplates vers le bas sans hausser les trapèzes',
        'Chercher la fluidité articulaire sans forcer au-delà du confort',
      ],
      phases: [
        { label: 'Ouverture contrôlée', breath: 'Inspirez à l’ouverture', start: 0, end: 0.45 },
        { label: 'Fixation omoplate', breath: 'Maintenez 1 seconde', start: 0.45, end: 0.65 },
        { label: 'Retour fluide', breath: 'Soufflez doucement', start: 0.65, end: 1 },
      ],
    };
  }

  if (
    lower.includes('gainage latéral') ||
    lower.includes('planche latérale') ||
    lower.includes('gainage en t')
  ) {
    return {
      motion: 'side_plank',
      title: 'Gainage latéral & alignement bassin',
      tempoLabel: 'Maintien isométrique · Sans affaissement',
      preventionZone: 'Hanches, obliques & rachis lombaire',
      breathing: 'Respiration abdominale fluide et continue sans bloquer le souffle',
      cues: [
        'Coude exactement sous l’épaule d’appui',
        'Aligner oreille, hanche et cheville sur une même droite',
        'Repousser le sol avec l’avant-bras sans laisser tomber le bassin',
      ],
      phases: [
        { label: 'Mise en tension', breath: 'Inspirez en gainant', start: 0, end: 0.25 },
        { label: 'Alignement maintenu', breath: 'Soufflez lentement', start: 0.25, end: 0.75 },
        { label: 'Contrôle postural', breath: 'Inspirez profond', start: 0.75, end: 1 },
      ],
    };
  }

  if (lower.includes('gainage') || lower.includes('planche')) {
    return {
      motion: 'plank',
      title: 'Planche & stabilité profonde du tronc',
      tempoLabel: 'Maintien contrôlé · Bassin neutre',
      preventionZone: 'Bas du dos & ceinture abdominale',
      breathing: 'Expiration longue par la bouche en gardant le nombril rentré',
      cues: [
        'Serrer les fessiers et les abdominaux pour éviter de creuser les lombaires',
        'Épaules abaissées loin des oreilles, regard entre les mains',
        'Talons poussés vers l’arrière, corps tendu de la tête aux pieds',
      ],
      phases: [
        { label: 'Ancrage appuis', breath: 'Inspirez par le nez', start: 0, end: 0.3 },
        { label: 'Gainage maximal', breath: 'Soufflez 4 secondes', start: 0.3, end: 0.75 },
        { label: 'Stabilité maintenue', breath: 'Respirez régulier', start: 0.75, end: 1 },
      ],
    };
  }

  if (lower.includes('pogo') || lower.includes('unipodaux') || lower.includes('rebond')) {
    return {
      motion: 'pogo_hop',
      title: 'Rebonds élastiques cheville-mollet',
      tempoLabel: 'Contacts brefs au sol · Chevilles toniques',
      preventionZone: 'Tendons d’Achille & stabilité cheville',
      breathing: 'Respiration rythmée sur la cadence des rebonds',
      cues: [
        'Rebondir sur l’avant-pied sans laisser le talon s’écraser',
        'Genoux quasi tendus mais déverrouillés, buste droit',
        'Réduire le temps de contact au sol à chaque impulsion',
      ],
      phases: [
        { label: 'Pré-tension cheville', breath: 'Regard horizontal', start: 0, end: 0.3 },
        { label: 'Rebond réactif', breath: 'Souffle court', start: 0.3, end: 0.7 },
        { label: 'Contact élastique', breath: 'Rythme régulier', start: 0.7, end: 1 },
      ],
    };
  }

  if (lower.includes('équilibre') || lower.includes('unipodal')) {
    return {
      motion: 'single_leg_balance',
      title: 'Proprioception & ancrage cheville',
      tempoLabel: 'Stabilisation fine · Genou déverrouillé',
      preventionZone: 'Cheville & articulation du genou',
      breathing: 'Respiration lente et calme pour stabiliser le centre de gravité',
      cues: [
        'Ancrer gros orteil, petit orteil et talon au sol (trépied du pied)',
        'Maintenir le bassin horizontal sans bascule latérale',
        'Genou légèrement fléchi et aligné dans l’axe du deuxième orteil',
      ],
      phases: [
        { label: 'Ancrage trépied', breath: 'Inspirez calme', start: 0, end: 0.35 },
        { label: 'Micro-ajustements', breath: 'Soufflez lentement', start: 0.35, end: 0.7 },
        { label: 'Fixation axiale', breath: 'Fixez un point devant', start: 0.7, end: 1 },
      ],
    };
  }

  if (lower.includes('sauté') || lower.includes('suspension') || lower.includes('impulsion')) {
    return {
      motion: 'jump_squat',
      title: 'Impulsion verticale & amorti silencieux',
      tempoLabel: 'Descente 1.5s · Saut explosif · Amorti 1s',
      preventionZone: 'Tendons rotuliens, genoux & chevilles',
      breathing: 'Inspirez en chargeant, soufflez à l’impulsion, amortissez souple',
      cues: [
        'Fléchir hanches et genoux dans l’axe sans rentrée vers l’intérieur',
        'Pousser fort sur l’avant-pied avec balancier tonique des bras',
        'Réceptionner sans bruit sur pointes puis talons, genoux fléchis',
      ],
      phases: [
        { label: 'Armement hanches', breath: 'Inspirez en fléchissant', start: 0, end: 0.3 },
        { label: 'Extension & envol', breath: 'Soufflez à l’impulsion', start: 0.3, end: 0.62 },
        { label: 'Amorti silencieux', breath: 'Stabilisez l’appui', start: 0.62, end: 1 },
      ],
    };
  }

  if (lower.includes('fente') || lower.includes('foulée')) {
    return {
      motion: 'lunge',
      title: 'Fente contrôlée & alignement hanche-genou',
      tempoLabel: '2s descente · 0.5s bas · Remontée tonique',
      preventionZone: 'Genoux, hanches & ischio-jambiers',
      breathing: 'Inspirez en descendant, soufflez en repoussant sur le pied avant',
      cues: [
        'Grand pas avant, buste vertical et regard à l’horizon',
        'Genou avant au-dessus de la cheville (ne rentre pas vers l’intérieur)',
        'Genou arrière descend près du sol avant de repousser fort',
      ],
      phases: [
        { label: 'Pas & descente', breath: 'Inspirez contrôlé', start: 0, end: 0.45 },
        { label: 'Angle 90° / 90°', breath: 'Buste droit', start: 0.45, end: 0.6 },
        { label: 'Poussée retour', breath: 'Soufflez en montant', start: 0.6, end: 1 },
      ],
    };
  }

  if (lower.includes('chassé') || lower.includes('navette') || lower.includes('défensif') || lower.includes('manchette')) {
    return {
      motion: 'lateral_shuffle',
      title: 'Appuis latéraux bas & changements de direction',
      tempoLabel: 'Centre de gravité bas · Poussée jambe externe',
      preventionZone: 'Adducteurs, genoux & chevilles',
      breathing: 'Respiration tonique à chaque poussée latérale',
      cues: [
        'Garder les hanches basses et les genoux fléchis pendant tout le déplacement',
        'Ne jamais croiser les pieds lors des pas chassés',
        'Freiner fort sur la jambe extérieure avant de repartir',
      ],
      phases: [
        { label: 'Position basse', breath: 'Appuis actifs', start: 0, end: 0.25 },
        { label: 'Poussée latérale', breath: 'Soufflez à l’appui', start: 0.25, end: 0.6 },
        { label: 'Freinage & relance', breath: 'Buste stable', start: 0.6, end: 1 },
      ],
    };
  }

  if (
    lower.includes('genoux') ||
    lower.includes('talons') ||
    lower.includes('fractionné') ||
    lower.includes('accélération') ||
    lower.includes('départ') ||
    lower.includes('skipping')
  ) {
    return {
      motion: 'high_knees',
      title: 'Dynamique de course & fréquence d’appuis',
      tempoLabel: 'Appuis sous le bassin · Bras actifs à 90°',
      preventionZone: 'Ischio-jambiers, fléchisseurs de hanche & mollets',
      breathing: 'Rythme respiratoire calé sur le balancier des bras',
      cues: [
        'Poser le pied sous le centre de gravité sur l’avant-pied',
        'Coudes fléchis à 90° entraînant le rythme des genoux',
        'Buste légèrement incliné vers l’avant, tête haute et relâchée',
      ],
      phases: [
        { label: 'Attaque avant-pied', breath: 'Cadence tonique', start: 0, end: 0.35 },
        { label: 'Montée genou actif', breath: 'Bras à 90°', start: 0.35, end: 0.7 },
        { label: 'Cycle alternatif', breath: 'Souffle rythmé', start: 0.7, end: 1 },
      ],
    };
  }

  return {
    motion: 'squat',
    title: 'Squat — Contrôle postural & flexion axiale',
    tempoLabel: '2s descente · 1s contrôle bas · Poussée complète',
    preventionZone: 'Genoux, hanches & rachis neutre',
    breathing: 'Inspirez à la descente, soufflez en poussant vers le haut',
    cues: [
      'Pieds ancrés largeur d’épaules, pointes légèrement ouvertes',
      'Reculer d’abord les hanches, dos droit et poitrine ouverte',
      'Genoux orientés vers les orteils sans jamais rentrer vers l’intérieur',
    ],
    phases: [
      { label: 'Descente contrôlée', breath: 'Inspirez par le nez', start: 0, end: 0.42 },
      { label: 'Maintien posture basse', breath: 'Dos neutre', start: 0.42, end: 0.6 },
      { label: 'Poussée talons', breath: 'Soufflez en montant', start: 0.6, end: 1 },
    ],
  };
}

