import {
  dbAll,
  dbGet,
  dbRun,
  getDefaultDbExecutor,
  type DbExecutor,
} from './db.ts';
import { resolveObjectiveSpec } from '../src/data/objectivesConfig.ts';
import { hashPassword, isStrongPassword, isValidEmail, isValidSenegalPhone, normalizePhone } from './security.ts';

export async function buildDefaultScheduleForAthlete(
  athleteUserId: number,
  sportCode: string,
  niveau: string,
  coachUserId: number | null,
  objectif: string,
  executor: DbExecutor = getDefaultDbExecutor()
): Promise<void> {
  const existingPlan = await executor.get<{ id: number }>(
    'SELECT id FROM program_plans WHERE athlete_user_id = ?',
    athleteUserId
  );

  if (existingPlan) {
    await executor.run('DELETE FROM scheduled_sessions WHERE athlete_user_id = ?', athleteUserId);
    await executor.run('DELETE FROM program_plans WHERE id = ?', existingPlan.id);
  }

  const objectiveSpec = resolveObjectiveSpec(objectif);
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  const planRes = await executor.run(
    `INSERT INTO program_plans (athlete_user_id, coach_user_id, sport_code, date_debut, duree_semaines, objectif, notes)
     VALUES (?, ?, ?, ?, 4, ?, ?)`,
    athleteUserId,
    coachUserId,
    sportCode,
    monday.toISOString().slice(0, 10),
    objectif,
    objectiveSpec.programSummary
  );
  const programId = Number(planRes.lastInsertRowid);

  const sessions = await executor.all<{
    id: number;
    niveau: string;
    titre: string;
    objectif: string;
    prevention_focus: string;
    access_tier: string;
  }>(
    `SELECT id, niveau, titre, objectif, prevention_focus, access_tier FROM sessions_library
     WHERE sport_code = ? AND validation_status = 'VALIDEE'
     ORDER BY id ASC`,
    sportCode
  );

  // Rank sessions by level match + objective keyword relevance across any sport
  const rankedSessions = [...sessions].sort((a, b) => {
    const scoreSession = (s: typeof a): number => {
      let score = 0;
      if (s.niveau === niveau) score += 20;
      if (s.access_tier === 'ESSENTIEL') score += 4;
      const haystack = `${s.titre} ${s.objectif} ${s.prevention_focus}`.toLowerCase();
      for (const kw of objectiveSpec.sessionKeywords) {
        if (haystack.includes(kw.toLowerCase())) score += 8;
      }
      return score;
    };
    return scoreSession(b) - scoreSession(a);
  });

  const fallback = await executor.all<{ id: number }>(
    `SELECT id FROM sessions_library WHERE validation_status = 'VALIDEE' LIMIT 3`
  );

  const pool = rankedSessions.length > 0 ? rankedSessions : fallback;
  const trainingDays = objectiveSpec.code === 'PREVENTION' ? [1, 3, 5] : [1, 2, 4, 6];

  for (let day = 1; day <= 7; day++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + (day - 1));
    const dateStr = d.toISOString().slice(0, 10);
    const isTraining = trainingDays.includes(day);
    const trainingIdx = trainingDays.indexOf(day);
    const picked = isTraining && pool.length > 0 ? pool[trainingIdx % pool.length].id : null;

    await executor.run(
      `INSERT INTO scheduled_sessions (
        program_id, athlete_user_id, session_id, jour_semaine, date_prevue,
        is_rest_day, ajustee_par_coach, completed
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      programId,
      athleteUserId,
      picked,
      day,
      dateStr,
      isTraining ? 0 : 1
    );
  }
}

function attachImagesToExerciseJson(rawJson: string): string {
  try {
    const list = JSON.parse(rawJson) as Array<Record<string, unknown>>;
    const updated = list.map((ex) => {
      const nom = String(ex.nom || '').toLowerCase();
      let imageUrl = ex.imageUrl as string | undefined;
      if (!imageUrl) {
        if (nom.includes('squat') && nom.includes('saut')) imageUrl = '/assets/aistudio/image_09378c32.png';
        else if (nom.includes('squat')) imageUrl = '/assets/aistudio/image_bbc9d397.png';
        else if (nom.includes('fente') || nom.includes('pont')) imageUrl = '/assets/aistudio/image_bbc9d397.png';
        else if (nom.includes('pompe') && nom.includes('scapulaire')) imageUrl = '/assets/aistudio/image_8527d860.png';
        else if (nom.includes('pompe') && nom.includes('rapproch')) imageUrl = '/assets/aistudio/image_090875a4.png';
        else if (nom.includes('pompe')) imageUrl = '/assets/aistudio/image_07428322.png';
        else if (nom.includes('gainage') || nom.includes('planche')) imageUrl = '/assets/aistudio/image_b6a22554.png';
      }
      return imageUrl ? { ...ex, imageUrl } : ex;
    });
    return JSON.stringify(updated);
  } catch {
    return rawJson;
  }
}

interface CatalogSessionSeed {
  sport: string;
  titre: string;
  niveau: string;
  duree: number;
  objectif: string;
  prevention: string;
  reluePar: string;
  accessTier: 'ESSENTIEL' | 'PROGRESSION';
  exercises: Array<Record<string, unknown>>;
}

const VALIDATED_CATALOG_SESSIONS: CatalogSessionSeed[] = [
  // ---------------- FOOTBALL ----------------
  {
    sport: 'football',
    titre: 'Appuis courts et explosivité terrain',
    niveau: 'intermediaire',
    duree: 22,
    objectif: 'Accélération et changements de direction',
    prevention: 'Cuisses et chevilles',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'fb-1-ex1',
        nom: 'Montées de genoux progressives',
        consigneFr: 'Dos droit, bras actifs à 90 degrés, attaquez le sol par l’avant du pied.',
        consigneWo: 'Taxawal jub, yëngal say loxo, daw ci kanamu tànk yi.',
        varianteFacile: 'Marche athlétique rapide sans saut',
        varianteDifficile: 'Rythme maximal avec blocage 1 seconde toutes les 5 montées',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
      },
      {
        id: 'fb-1-ex2',
        nom: 'Fentes alternées dynamiques',
        consigneFr: 'Avancez un pied, descendez le genou arrière vers le sol sans dépasser la pointe du pied avant.',
        consigneWo: 'Tégal benn tànk ci kanam, wàccal sa óom ba mu jege suuf, jubbanti.',
        varianteFacile: 'Fentes statiques amplitude réduite',
        varianteDifficile: 'Fentes sautées avec stabilisation 1 seconde',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 25,
      },
      {
        id: 'fb-1-ex3',
        nom: 'Navettes 5 m / 10 m en changement d’appuis',
        consigneFr: 'Baissez le centre de gravité avant chaque virage, poussez fort sur la jambe extérieure.',
        consigneWo: 'Wàccal sa yaram ci suuf balaa ngay walbatiku, bësël ci tànk bi ci biti.',
        varianteFacile: 'Aller-retour à 75 % de vitesse avec pause de 10 s',
        varianteDifficile: 'Enchaînement 4 navettes sans temps d’arrêt',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 30,
      },
      {
        id: 'fb-1-ex4',
        nom: 'Pont fessier unilatéral (prévention ischios)',
        consigneFr: 'Allongé sur le dos, une jambe fléchie au sol, montez le bassin en contractant l’arrière de la cuisse.',
        consigneWo: 'Tëddël ci sa ginnaaw, yëkkal sa ndigg ci benn tànk ngir aar sa yàpp.',
        varianteFacile: 'Pont fessier à deux pieds au sol',
        varianteDifficile: 'Descente lente contrôlée sur 4 secondes',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 20,
      },
    ],
  },
  {
    sport: 'football',
    titre: 'Endurance intermittente 15-15 sans matériel',
    niveau: 'debutant',
    duree: 18,
    objectif: 'Capacité aérobie de match',
    prevention: 'Chevilles et mollets',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'fb-2-ex1',
        nom: 'Talons-fesses rythmés',
        consigneFr: 'Gardez le buste droit et amenez les talons vers l’arrière sans tension dans le bas du dos.',
        consigneWo: 'Jubal sa yaram, jëmal say gëst ci ginnaaw ci jamono ju yam.',
        varianteFacile: 'Pas chassés légers sur place',
        varianteDifficile: 'Cadence haute avec déplacement latéral',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
      },
      {
        id: 'fb-2-ex2',
        nom: 'Fractionné 15 s course / 15 s marche',
        consigneFr: '15 secondes de course soutenue sur 25 mètres, puis 15 secondes de marche active.',
        consigneWo: 'Daw 15 simili ci kàttan, topp ci dox 15 simili ngir noyyi.',
        varianteFacile: '10 s course modérée / 20 s marche',
        varianteDifficile: '20 s sprint contrôlé / 10 s trot léger',
        mode: 'duree',
        dureeSec: 60,
        reposSec: 30,
      },
      {
        id: 'fb-2-ex3',
        nom: 'Gainage frontal en appui',
        consigneFr: 'Coudes sous les épaules, rentrez le nombril et respirez régulièrement.',
        consigneWo: 'Tekkal say conc ci suuf, tëye sa biir te noyyi bu baax.',
        varianteFacile: 'Gainage sur les genoux',
        varianteDifficile: 'Gainage avec lever de pied alterné',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 20,
      },
    ],
  },
  {
    sport: 'football',
    titre: 'Puissance des jambes et stabilité',
    niveau: 'avance',
    duree: 26,
    objectif: 'Force explosive et duels',
    prevention: 'Ischio-jambiers et genoux',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'fb-3-ex1',
        nom: 'Squats sautés avec réception silencieuse',
        consigneFr: 'Fléchissez à 90 degrés puis sautez verticalement. Amortissez en silence sur les pointes.',
        consigneWo: 'Wàccal ba yam, tëbël ci kaw te wàcc ci suuf ci ndànk.',
        varianteFacile: 'Squats rapides sans décoller les pieds',
        varianteDifficile: 'Enchaînement 6 sauts consécutifs sans pause',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 30,
      },
      {
        id: 'fb-3-ex2',
        nom: 'Équilibre unipodal yeux ouverts (chevilles)',
        consigneFr: 'Genou légèrement fléchi, tenez 20 s par jambe en gardant la hanche horizontale.',
        consigneWo: 'Taxawal ci benn tànk, jubal sa óom te bañ a yëngu.',
        varianteFacile: 'Main près d’un mur pour repère',
        varianteDifficile: 'Passer un ballon ou objet d’une main à l’autre',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 15,
      },
    ],
  },
  {
    sport: 'football',
    titre: 'Cycle Navétanes — Force jambes & gainage avancé',
    niveau: 'intermediaire',
    duree: 24,
    objectif: 'Préparation spécifique tournoi et tenue d’appuis',
    prevention: 'Quadriceps, fessiers et sangle abdominale',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'fb-prog-1',
        nom: 'Squats variés (écartement ciblé)',
        consigneFr: 'Alternez pieds largeur épaules puis écartés, dos neutre, descente contrôlée sur 3 secondes.',
        consigneWo: 'Wàccal sa yaram ci ndànk, jubal sa ginnaaw te bësël ci tànk yi.',
        varianteFacile: 'Squat amplitude moyenne sans pause en bas',
        varianteDifficile: 'Squat Goblet avec ballon ou charge devant le buste',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_76a64964.png',
      },
      {
        id: 'fb-prog-2',
        nom: 'Planche dynamique bras & jambes décollés',
        consigneFr: 'En appui sur avant-bras, stabilisez les hanches sans rotation lors du lever alterné.',
        consigneWo: 'Tekkal say conc ci suuf, yëkkal benn tànk walla benn loxo ci ndànk.',
        varianteFacile: 'Planche classique ou sur les genoux',
        varianteDifficile: 'Enchaîner bras décollé puis jambe opposée',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_b6a22554.png',
      },
    ],
  },

  // ---------------- BASKET ----------------
  {
    sport: 'basket',
    titre: 'Détente verticale et réception chevilles',
    niveau: 'intermediaire',
    duree: 20,
    objectif: 'Rebond, tir en suspension et protection articulaire',
    prevention: 'Chevilles et genoux',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'bk-1-ex1',
        nom: 'Sauts pogo élastiques sur place',
        consigneFr: 'Jambes presque tendues, rebondissez rapidement sur l’avant-pied comme un ressort.',
        consigneWo: 'Tëb-tëbal ci kanamu tànk yi ci gaawaay bu dëgër.',
        varianteFacile: 'Montées sur pointes de pieds rapides sans saut',
        varianteDifficile: 'Sauts pogo en avançant et reculant sur 3 mètres',
        mode: 'duree',
        dureeSec: 30,
        reposSec: 25,
      },
      {
        id: 'bk-1-ex2',
        nom: 'Pas chassés défensifs bas',
        consigneFr: 'Position basse, dos droit, ne croisez jamais les pieds lors des glissements latéraux.',
        consigneWo: 'Wàccal sa yaram, daw ci wet yi te bañ a jàppale say tànk.',
        varianteFacile: 'Déplacement latéral lent sur 2 mètres',
        varianteDifficile: 'Changement de direction au signal toutes les 3 secondes',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
      },
      {
        id: 'bk-1-ex3',
        nom: 'Squats sautés avec blocage à l’atterrissage',
        consigneFr: 'Après le saut, bloquez la réception 2 secondes genoux alignés avec les orteils.',
        consigneWo: 'Tëbël ci kaw te taxaw 2 simili bi ngay wàcc, say óom jub.',
        varianteFacile: 'Demi-squat suivi d’extension sur pointes',
        varianteDifficile: 'Saut avec rotation de 90 degrés et blocage',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 30,
      },
    ],
  },
  {
    sport: 'basket',
    titre: 'Réactivité premier pas et gainage court',
    niveau: 'debutant',
    duree: 18,
    objectif: 'Vitesse de réaction et posture défensive',
    prevention: 'Genoux et lombaires',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'bk-2-ex1',
        nom: 'Départs explosifs sur 4 mètres',
        consigneFr: 'Partez depuis une position fléchie, poussez fort sur la jambe arrière et freinez en 2 pas.',
        consigneWo: 'Tàmbali ci suuf, bësël ci sa tànk bi ci ginnaaw te taxaw ci ñaari jéego.',
        varianteFacile: 'Démarrage trottiné avec freinage doux',
        varianteDifficile: 'Enchaîner droite puis gauche toutes les 10 secondes',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
      },
      {
        id: 'bk-2-ex2',
        nom: 'Gainage latéral droit et gauche',
        consigneFr: 'Hanches hautes, corps aligné de la tête aux pieds sans laisser tomber le bassin.',
        consigneWo: 'Tëddël ci wet gi, yëkkal sa ndigg te jubal sa yaram.',
        varianteFacile: 'Genou du dessous posé au sol',
        varianteDifficile: 'Lever la jambe supérieure pendant 20 secondes',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
      },
    ],
  },
  {
    sport: 'basket',
    titre: 'Plyométrie contrôlée demi-terrain',
    niveau: 'avance',
    duree: 25,
    objectif: 'Explosivité en fin de match',
    prevention: 'Chevilles et tendons rotuliens',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'bk-3-ex1',
        nom: 'Sauts unipodaux avant avec stabilisation',
        consigneFr: 'Sautez d’un pied sur l’autre en contrôlant l’axe du genou à chaque réception.',
        consigneWo: 'Tëbël ci benn tànk jëm ci beneen bi, tëye sa óom bu baax.',
        varianteFacile: 'Petits bonds sur deux pieds',
        varianteDifficile: 'Enchaîner 3 bonds vers l’avant puis arrêt net',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 30,
      },
    ],
  },
  {
    sport: 'basket',
    titre: 'Cycle Détente — Squat Goblet & haut du corps',
    niveau: 'avance',
    duree: 25,
    objectif: 'Gain de puissance verticale et solidité au contact',
    prevention: 'Genoux, ceinture scapulaire et lombaires',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'bk-prog-1',
        nom: 'Squat Goblet ou barre contrôlé',
        consigneFr: 'Maintenez la charge près du buste ou sur le haut du dos, descendez hanches sous les genoux puis poussez fort.',
        consigneWo: 'Tëyeel li ngay jàpp ci kanam, wàccal ba mu yam te yëkkal ci kàttan.',
        varianteFacile: 'Squat sans charge bras tendus devant',
        varianteDifficile: 'Squat barre en club (position A vers B)',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_740f23a8.png',
      },
      {
        id: 'bk-prog-2',
        nom: 'Pompes posture alignée & positions variées',
        consigneFr: 'Corps aligné de la tête aux talons, variez l’écartement des mains entre chaque série.',
        consigneWo: 'Jubal sa yaram ci suuf, soppi say loxo ci biir liggéey bi.',
        varianteFacile: 'Pompes mains largeur épaules',
        varianteDifficile: 'Pompes mains serrées ciblant triceps',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_f97009a6.png',
      },
    ],
  },

  // ---------------- HANDBALL ----------------
  {
    sport: 'handball',
    titre: 'Solidité des épaules et vitesse courte',
    niveau: 'debutant',
    duree: 20,
    objectif: 'Préparation du lancer et stabilité du tronc',
    prevention: 'Épaules et genoux',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'hb-1-ex1',
        nom: 'Pompes scapulaires et pompes classiques',
        consigneFr: 'Coudes à 45 degrés du buste, descendez contrôlé sans laisser tomber la tête.',
        consigneWo: 'Tekkal say loxo ci suuf, wàccal ndànk te bañ a sëgg sa bopp.',
        varianteFacile: 'Pompes sur les genoux ou contre un mur',
        varianteDifficile: 'Pompes avec toucher d’épaule alterné en haut',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
      },
      {
        id: 'hb-1-ex2',
        nom: 'Rotations d’épaules et gainage en T',
        consigneFr: 'En position de planche haute, ouvrez un bras vers le ciel en gardant les hanches stables.',
        consigneWo: 'Ci taxawaayub planche, ubbil benn loxo jëm ci asamaan.',
        varianteFacile: 'Rotation debout sans appui au sol',
        varianteDifficile: 'Maintien 3 secondes en ouverture à chaque côté',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
      },
      {
        id: 'hb-1-ex3',
        nom: 'Sauts avec réception sur un pied (tir en suspension)',
        consigneFr: 'Décollez sur un appui, amortissez la réception genou souple et buste droit.',
        consigneWo: 'Tëbël ci benn tànk te wàcc ci ndànk ak sa óom bu ñakk dëgër.',
        varianteFacile: 'Réception sur deux pieds',
        varianteDifficile: 'Saut suivi d’un changement de direction rapide',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
      },
    ],
  },
  {
    sport: 'handball',
    titre: 'Contre-attaque et gainage anti-rotation',
    niveau: 'intermediaire',
    duree: 22,
    objectif: 'Vitesse sur 15 m et duels au contact',
    prevention: 'Épaules et lombaires',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'hb-2-ex1',
        nom: 'Sprints courts 15 m départ debout',
        consigneFr: 'Poussée horizontale sur les 3 premiers appuis, bras dynamiques.',
        consigneWo: 'Daw 15 meetar ci gaawaay, yëngal say loxo bu baax.',
        varianteFacile: 'Course à 80 % sans départ maximal',
        varianteDifficile: 'Départ après un appui latéral gauche ou droite',
        mode: 'duree',
        dureeSec: 30,
        reposSec: 30,
      },
      {
        id: 'hb-2-ex2',
        nom: 'Planche commando contrôlée',
        consigneFr: 'Passez des avant-bras aux mains en limitant le balancement du bassin.',
        consigneWo: 'Jóg ci conc jëm ci loxo yi te bañ a yëngal sa ndigg.',
        varianteFacile: 'Maintien statique mains au sol',
        varianteDifficile: 'Rythme soutenu 40 secondes',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
      },
    ],
  },
  {
    sport: 'handball',
    titre: 'Cycle Arrière/Ailier — Pompes ciblées & gainage',
    niveau: 'intermediaire',
    duree: 24,
    objectif: 'Puissance de tir au bras et protection d’épaule',
    prevention: 'Épaules, triceps et gainage latéral',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'hb-prog-1',
        nom: 'Pompes mains rapprochées (triceps & dentelés)',
        consigneFr: 'Mains rapprochées sous la poitrine, coudes proches des côtes, poussée explosive.',
        consigneWo: 'Jegeelel say loxo ci suuf, bësël ngir dëgëral say loxo ak sa dënn.',
        varianteFacile: 'Pompes classiques largeur épaules',
        varianteDifficile: 'Descente lente 3 s suivie d’une poussée rapide',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_090875a4.png',
      },
      {
        id: 'hb-prog-2',
        nom: 'Squat barre / appuis bas de tir',
        consigneFr: 'Stabilisez le bassin en flexion puis enchaînez sur une extension complète.',
        consigneWo: 'Wàccal sa ndigg bu baax balaa ngay tëb walla sànni.',
        varianteFacile: 'Squat au poids du corps',
        varianteDifficile: 'Squat avec charge ou barre légère en salle',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_7b2641ec.png',
      },
    ],
  },

  // ---------------- VOLLEYBALL ----------------
  {
    sport: 'volleyball',
    titre: 'Détente verticale et réception stable',
    niveau: 'debutant',
    duree: 22,
    objectif: 'Améliorer l’impulsion au filet et amortir les réceptions',
    prevention: 'Genoux (tendon rotulien) et chevilles',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'vb-ex1',
        nom: 'Squats contrôlés avec montée dynamique',
        consigneFr: 'Fléchissez à 90° genoux alignés, poussez fort sur les pointes sans sauter pour préparer les tendons.',
        consigneWo: 'Wàccal ci sa óom yi, nga yéeg ci kaw bu gaaw te jub.',
        varianteFacile: 'Demi-squats lents sans extension sur pointes',
        varianteDifficile: 'Ajoutez un blocage de 2 secondes en bas avant l’extension',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_09378c32.png',
      },
      {
        id: 'vb-ex2',
        nom: 'Sauts pogo chevilles et réception souple',
        consigneFr: 'Petits rebonds rapides sur l’avant-pied, suivis d’une réception stable genoux fléchis pendant 2 secondes.',
        consigneWo: 'Tëbël ndànk ci sa tànk yi, nga taxaw ci sa óom yi ngir aar sa tank.',
        varianteFacile: 'Montées de mollets dynamiques sans quitter le sol',
        varianteDifficile: 'Rebonds enchaînés avec saut haut toutes les 4 répétitions',
        mode: 'duree',
        dureeSec: 30,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_408868fa.png',
      },
      {
        id: 'vb-ex3',
        nom: 'Pompes protection d’épaule et gainage',
        consigneFr: 'Mains largeur d’épaules, coudes à 45°, descendez lentement puis repoussez fort pour stabiliser la coiffe des rotateurs.',
        consigneWo: 'Defal pomp yi ci ndànk ngir dëgëral say mbagg balaa ngay fëgg.',
        varianteFacile: 'Pompes mains surélevées contre un banc ou genoux au sol',
        varianteDifficile: 'Ajoutez une tape d’épaule alternée en haut de chaque pompe',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_07428322.png',
      },
    ],
  },
  {
    sport: 'volleyball',
    titre: 'Appuis défensifs bas et gainage aérien',
    niveau: 'intermediaire',
    duree: 24,
    objectif: 'Vitesse de déplacement sous le ballon et contrôle du tronc en extension',
    prevention: 'Épaules et bas du dos',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'vb2-ex1',
        nom: 'Pas chassés bas position manchette',
        consigneFr: 'Bassin bas, dos droit, glissez rapidement latéralement sur 4 mètres et stoppez net sur l’appui extérieur.',
        consigneWo: 'Wàccal sa ndigg, nga daw ci wet gi te taxaw bu baax ci sa tànk.',
        varianteFacile: 'Déplacement sur 2,5 mètres à rythme modéré',
        varianteDifficile: 'Touchez le sol à chaque extrémité et repartez sans redresser le buste',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_f97009a6.png',
      },
      {
        id: 'vb2-ex2',
        nom: 'Planche superman alternée (gainage smash)',
        consigneFr: 'En position de planche haute, levez bras droit et jambe gauche opposée sans vriller le bassin.',
        consigneWo: 'Tëddël ci say loxo, nga yékkati sa loxo ndijoor ak sa tànk càmmooñ.',
        varianteFacile: 'Genoux au sol et élévation des bras uniquement',
        varianteDifficile: 'Maintien 3 secondes à chaque extension',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_b6a22554.png',
      },
    ],
  },
  {
    sport: 'volleyball',
    titre: 'Cycle avancé · Impulsion block & puissance épaule',
    niveau: 'avance',
    duree: 28,
    objectif: 'Enchaîner plusieurs sauts de contre et frappes sans perte d’explosivité',
    prevention: 'Tendon rotulien et coiffe des rotateurs',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'vb3-ex1',
        nom: 'Squats sautés avec amorti silencieux',
        consigneFr: 'Descendez en squat gobelet à vide puis sautez verticalement mains vers le haut. Réception silencieuse.',
        consigneWo: 'Tëbël ci kaw ni ku fëgg balle bi, nga wàcc ci ndànk.',
        varianteFacile: 'Squats dynamiques sans saut',
        varianteDifficile: 'Enchaînement 3 sauts successifs avec pas chassé latéral',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_09378c32.png',
      },
      {
        id: 'vb3-ex2',
        nom: 'Pompes mains rapprochées & gainage',
        consigneFr: 'Coudes près du buste pour renforcer triceps et épaules de frappe.',
        consigneWo: 'Jegeelel say loxo ci suuf ngir dëgëral sa mbagg ak sa loxo.',
        varianteFacile: 'Pompes largeur épaules',
        varianteDifficile: 'Descente freinée 3 secondes, poussée explosive',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_090875a4.png',
      },
    ],
  },

  // ---------------- ATHLÉTISME ----------------
  {
    sport: 'athletisme',
    titre: 'Mécanique de course et réactivité Achille',
    niveau: 'debutant',
    duree: 22,
    objectif: 'Installer une foulée économique et renforcer mollets et pieds sans matériel',
    prevention: 'Tendons d’Achille et mollets',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'ath-ex1',
        nom: 'Montées de genoux rythmées (skipping)',
        consigneFr: 'Buste droit, bras à 90°, montez les genoux à hauteur de hanche avec rebond actif sous l’avant-pied.',
        consigneWo: 'Yékkatil say óom bu gaaw te sa bopp ak sa ginnaaw jub.',
        varianteFacile: 'Marche dynamique avec montée de genoux lente',
        varianteDifficile: 'Alternez 10 s rapides et 10 s en foulée ample',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_408868fa.png',
      },
      {
        id: 'ath-ex2',
        nom: 'Squats tempo et fentes d’alignement',
        consigneFr: 'Descente 3 secondes, poussée franche pour solidifier quadriceps et hanches.',
        consigneWo: 'Wàccal ci ndànk ngir dëgëral say tànk balaa ngay daw.',
        varianteFacile: 'Amplitude réduite selon confort',
        varianteDifficile: 'Fentes marchées enchaînées sur 15 mètres',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_740f23a8.png',
      },
      {
        id: 'ath-ex3',
        nom: 'Gainage latéral coureur',
        consigneFr: 'Maintenez bassin haut sur l’avant-bras (20 s chaque côté) pour éviter l’affaissement à chaque foulée.',
        consigneWo: 'Dëgëral sa ndigg ci wet gi ngir sa daw baña sëgg.',
        varianteFacile: 'Genou inférieur posé au sol',
        varianteDifficile: 'Élevez la jambe supérieure pendant le maintien',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_b6a22554.png',
      },
    ],
  },
  {
    sport: 'athletisme',
    titre: 'Fractionné court 15 s / 15 s & prévention ischios',
    niveau: 'intermediaire',
    duree: 25,
    objectif: 'Développer VMA et protection excentrique des ischio-jambiers',
    prevention: 'Ischio-jambiers et bas du dos',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'ath2-ex1',
        nom: 'Pont fessier unilatéral (protection ischios)',
        consigneFr: 'Allongé sur le dos, une jambe tendue, poussez fort dans le talon au sol pour monter les hanches.',
        consigneWo: 'Tëddël ci suuf, yékkatil sa ndigg ci benn tànk ngir aar sa tank.',
        varianteFacile: 'Pont fessier à deux pieds au sol',
        varianteDifficile: 'Avancez légèrement le talon au sol et freinez la descente 3 s',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_76a64964.png',
      },
      {
        id: 'ath2-ex2',
        nom: 'Accélérations progressives sur 20–30 m',
        consigneFr: 'Départ dynamique, montez en vitesse sur 20 m puis décélérez en douceur sur les 10 derniers mètres.',
        consigneWo: 'Tambalil ci ndànk, nga yokk sa daw ci 20 meetar, nga waññi ci ndànk.',
        varianteFacile: 'Course rythmée à 75 % de la vitesse max',
        varianteDifficile: 'Départ 3 appuis bas vers sprint fluide sur 30 m',
        mode: 'duree',
        dureeSec: 30,
        reposSec: 35,
        imageUrl: '/assets/aistudio/image_f97009a6.png',
      },
    ],
  },
  {
    sport: 'athletisme',
    titre: 'Cycle avancé · Puissance sprint & force sous-maximale',
    niveau: 'avance',
    duree: 28,
    objectif: 'Maximiser la poussée horizontale au départ et la rigidité de cheville',
    prevention: 'Tendons d’Achille et ischio-jambiers',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'ath3-ex1',
        nom: 'Fentes explosives alternées (foulée bondissante)',
        consigneFr: 'Poussez verticalement et vers l’avant depuis la position de fente, bras coordonnés comme au sprint.',
        consigneWo: 'Tëbël bu gaaw ci fente bi, say loxo di daw ni ci piste bi.',
        varianteFacile: 'Fentes alternées sans saut',
        varianteDifficile: 'Foulées bondissantes enchaînées sur 25 m',
        mode: 'duree',
        dureeSec: 30,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_09378c32.png',
      },
      {
        id: 'ath3-ex2',
        nom: 'Squats barre / charge contrôlée',
        consigneFr: 'Renforcement lourd ou tempo des extenseurs de hanche et genou pour la phase d’accélération.',
        consigneWo: 'Dëgëral say tànk ak sa ndigg ngir sa tambali daw gën a gaaw.',
        varianteFacile: 'Squat gobelet poids du corps',
        varianteDifficile: 'Charge modérée avec remontée explosive',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_7b2641ec.png',
      },
    ],
  },

  // ---------------- FITNESS ----------------
  {
    sport: 'fitness',
    titre: 'Brûle-graisses HIIT & cardio sans matériel',
    niveau: 'debutant',
    duree: 20,
    objectif: 'Perte de poids, dépense énergétique et souffle sans matériel',
    prevention: 'Genoux, chevilles et bas du dos',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'fit-1-ex1',
        nom: 'Montées de genoux actives (cardio)',
        consigneFr: 'Buste droit, montez les genoux à hauteur de hanche à rythme soutenu pendant 35 secondes.',
        consigneWo: 'Taxawal jub, yékkatil say óom bu gaaw ngir tàngal sa yaram.',
        varianteFacile: 'Marche dynamique rapide sans saut',
        varianteDifficile: 'Rythme maximal 45 secondes sans pause',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_408868fa.png',
      },
      {
        id: 'fit-1-ex2',
        nom: 'Squats tempo & flexion fluide',
        consigneFr: 'Pieds largeur épaules, descendez en gardant le poids sur les talons puis remontez sans bloquer les genoux.',
        consigneWo: 'Wàccal sa ndigg ci ndànk, say óom jub te yéeg ci kàttan.',
        varianteFacile: 'Demi-squats contrôlés',
        varianteDifficile: 'Squats enchaînés rapides 45 s',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_09378c32.png',
      },
      {
        id: 'fit-1-ex3',
        nom: 'Gainage frontal & respiration active',
        consigneFr: 'En appui sur les avant-bras, serrez les abdominaux et les fessiers sans creuser le dos.',
        consigneWo: 'Tekkal say conc ci suuf, tëye sa biir bu baax te noyyi.',
        varianteFacile: 'Planche sur les genoux',
        varianteDifficile: 'Planche avec montées de genoux alternées (mountain climber lent)',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_b6a22554.png',
      },
    ],
  },
  {
    sport: 'fitness',
    titre: 'Circuit perte de poids & gainage métabolique',
    niveau: 'intermediaire',
    duree: 24,
    objectif: 'Affûtage corporel, perte de masse grasse et tonus musculaire',
    prevention: 'Lombaires et articulations des membres inférieurs',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'ESSENTIEL',
    exercises: [
      {
        id: 'fit-2-ex1',
        nom: 'Fentes alternées cardio & équilibre',
        consigneFr: 'Enchaînez gauche et droite en gardant le buste vertical pour solliciter cuisses et fessiers.',
        consigneWo: 'Defal fente ci càmmooñ ak ndijoor te sa ginnaaw jub.',
        varianteFacile: 'Fentes statiques sans changement de pied',
        varianteDifficile: 'Fentes sautées contrôlées',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_bbc9d397.png',
      },
      {
        id: 'fit-2-ex2',
        nom: 'Pompes rythmées & gainage actif',
        consigneFr: 'Coudes à 45° du buste, poitrine frôle le sol puis poussée franche.',
        consigneWo: 'Defal pomp ci kàttan te sa yaram jub.',
        varianteFacile: 'Pompes sur les genoux ou contre un banc',
        varianteDifficile: 'Pompes enchaînées tempo 1-1 sans pause',
        mode: 'duree',
        dureeSec: 35,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_07428322.png',
      },
      {
        id: 'fit-2-ex3',
        nom: 'Pas chassés latéraux rapides (3 m)',
        consigneFr: 'Fléchissez légèrement les jambes et glissez rapidement de gauche à droite pour maintenir la fréquence cardiaque.',
        consigneWo: 'Wàccal sa yaram te daw ci wet gi ci gaawaay.',
        varianteFacile: 'Rythme modéré avec pause 2 s à chaque extrémité',
        varianteDifficile: 'Touchez le sol à chaque changement de direction',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
        imageUrl: '/assets/aistudio/image_f97009a6.png',
      },
    ],
  },
  {
    sport: 'fitness',
    titre: 'Prise de masse · Hypertrophie poids du corps',
    niveau: 'intermediaire',
    duree: 26,
    objectif: 'Croissance musculaire haut et bas du corps, volume et force fonctionnelle',
    prevention: 'Épaules, coudes et bas du dos',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'fit-3-ex1',
        nom: 'Pompes mains rapprochées & amplitude complète',
        consigneFr: 'Descente lente sur 3 secondes pour maximiser le temps sous tension sur pectoraux et triceps, poussée explosive.',
        consigneWo: 'Jegeelel say loxo ci suuf, wàccal ci 3 simili ngir yokk sa kàttan.',
        varianteFacile: 'Pompes largeur épaules',
        varianteDifficile: 'Pause de 1 seconde en bas avant de repousser',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_090875a4.png',
      },
      {
        id: 'fit-3-ex2',
        nom: 'Squats tempo lent & Goblet (croissance jambes)',
        consigneFr: 'Descendez sur 3 secondes, marquez 1 seconde en bas puis remontez fort pour stimuler quadriceps et fessiers.',
        consigneWo: 'Wàccal ci ndànk 3 simili, taxaw 1 simili ci suuf, yéeg ci kàttan.',
        varianteFacile: 'Squat poids du corps sans pause en bas',
        varianteDifficile: 'Squat avec charge devant le buste (Goblet)',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_740f23a8.png',
      },
      {
        id: 'fit-3-ex3',
        nom: 'Pont fessier unilatéral & gainage profond',
        consigneFr: 'Travail ciblé chaîne postérieure et abdominaux profonds en tension continue.',
        consigneWo: 'Yékkatil sa ndigg ci benn tànk ngir dëgëral sa ginnaaw ak say yàpp.',
        varianteFacile: 'Pont fessier à deux pieds',
        varianteDifficile: 'Contraction maintenue 3 secondes en haut',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_76a64964.png',
      },
    ],
  },
  {
    sport: 'fitness',
    titre: 'Force & volume musculaire complet (avancé)',
    niveau: 'avance',
    duree: 28,
    objectif: 'Prise de masse avancée, force globale et prévention articulaire',
    prevention: 'Coiffe des rotateurs, tendons rotuliens et lombaires',
    reluePar: 'Relecture technique Terrain+',
    accessTier: 'PROGRESSION',
    exercises: [
      {
        id: 'fit-4-ex1',
        nom: 'Squats variés & charge contrôlée',
        consigneFr: 'Alternez écartement serré et large pour recruter l’ensemble des muscles des jambes.',
        consigneWo: 'Soppil taxawaayu say tànk ci squat bi ngir dëgëral sa tànk yépp.',
        varianteFacile: 'Squat tempo poids du corps',
        varianteDifficile: 'Squat barre ou charge en salle',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_7b2641ec.png',
      },
      {
        id: 'fit-4-ex2',
        nom: 'Pompes scapulaires & positions variées',
        consigneFr: 'Enchaînez prise large et prise standard avec contrôle total des omoplates.',
        consigneWo: 'Soppil say loxo ci suuf ngir liggéey sa dënn ak say mbagg.',
        varianteFacile: 'Pompes standard rythmées',
        varianteDifficile: 'Descente 4 secondes + poussée maximale',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 30,
        imageUrl: '/assets/aistudio/image_8527d860.png',
      },
      {
        id: 'fit-4-ex3',
        nom: 'Planche dynamique gainage total',
        consigneFr: 'Maintenez la sangle abdominale verrouillée pendant les levers alternés bras/jambe.',
        consigneWo: 'Dëgëral sa biir te yékkal sa loxo ak sa tànk ci ndànk.',
        varianteFacile: 'Planche statique sur avant-bras',
        varianteDifficile: 'Lever bras + jambe opposée maintenu 2 secondes',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 25,
        imageUrl: '/assets/aistudio/image_b6a22554.png',
      },
    ],
  },
];

async function ensureSessionsLibraryCatalog(): Promise<void> {
  const existingRows = await dbAll<{ id: number; sport_code: string; titre: string; exercises_json: string }>(
    'SELECT id, sport_code, titre, exercises_json FROM sessions_library'
  );
  const existingKeys = new Set(existingRows.map((r) => `${r.sport_code}::${r.titre}`));

  await dbRun(
    "UPDATE sessions_library SET relue_par = 'Relecture technique Terrain+' WHERE relue_par LIKE '%Dr.%' OR relue_par LIKE '%STAPS%'"
  );

  for (const row of existingRows) {
    const withImages = attachImagesToExerciseJson(row.exercises_json);
    if (withImages !== row.exercises_json) {
      await dbRun('UPDATE sessions_library SET exercises_json = ? WHERE id = ?', withImages, row.id);
    }
  }

  for (const item of VALIDATED_CATALOG_SESSIONS) {
    const key = `${item.sport}::${item.titre}`;
    if (existingKeys.has(key)) continue;

    const exercisesJson = attachImagesToExerciseJson(JSON.stringify(item.exercises));
    await dbRun(
      `INSERT INTO sessions_library (
        sport_code, titre, niveau, duree_min, objectif, prevention_focus,
        relue_par, validation_status, proposee_par_user_id, access_tier, exercises_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'VALIDEE', NULL, ?, ?)`,
      item.sport,
      item.titre,
      item.niveau,
      item.duree,
      item.objectif,
      item.prevention,
      item.reluePar,
      item.accessTier,
      exercisesJson
    );
  }
}

async function provisionBootstrapUser(params: {
  role: 'ADMIN' | 'MINISTRE';
  email: string;
  password: string;
  phone: string;
  nom: string;
  prenom: string;
}): Promise<void> {
  if (!params.email && !params.password) return;
  if (!isValidEmail(params.email) || !isStrongPassword(params.password)) {
    console.warn(
      `[BOOTSTRAP ${params.role}] Variables ignorées : email invalide ou mot de passe trop faible (8+ caractères avec lettres et chiffres).`
    );
    return;
  }
  const normalizedPhone = normalizePhone(params.phone);
  if (!isValidSenegalPhone(normalizedPhone)) {
    console.warn(`[BOOTSTRAP ${params.role}] Numéro de téléphone Sénégal (+2217XXXXXXXX) invalide.`);
    return;
  }

  const existingRole = await dbGet<{ id: number }>('SELECT id FROM users WHERE role = ? LIMIT 1', params.role);
  if (existingRole) return;

  const existingIdentity = await dbGet<{ id: number }>(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ? LIMIT 1',
    params.email,
    normalizedPhone
  );
  if (existingIdentity) return;

  await dbRun(
    `INSERT INTO users (
      nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified
    ) VALUES (?, ?, ?, ?, ?, ?, '1985-01-01', 'fr', 'ACTIF', 0, 1)`,
    params.nom,
    params.prenom,
    normalizedPhone,
    params.email.toLowerCase(),
    hashPassword(params.password),
    params.role
  );
}

async function ensureBootstrapAccountsFromEnv(): Promise<void> {
  await provisionBootstrapUser({
    role: 'ADMIN',
    email: (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@terrainplus.sn').trim(),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin2026',
    phone: (process.env.BOOTSTRAP_ADMIN_PHONE || '+221770000001').trim(),
    nom: (process.env.BOOTSTRAP_ADMIN_NOM || 'Administration').trim(),
    prenom: (process.env.BOOTSTRAP_ADMIN_PRENOM || 'Terrain+').trim(),
  });

  await provisionBootstrapUser({
    role: 'MINISTRE',
    email: (process.env.BOOTSTRAP_MINISTER_EMAIL || '').trim(),
    password: process.env.BOOTSTRAP_MINISTER_PASSWORD || '',
    phone: (process.env.BOOTSTRAP_MINISTER_PHONE || '+221770000002').trim(),
    nom: (process.env.BOOTSTRAP_MINISTER_NOM || 'Observatoire').trim(),
    prenom: (process.env.BOOTSTRAP_MINISTER_PRENOM || 'Ministère').trim(),
  });
}

export async function seedIfEmpty(): Promise<void> {
  await ensureSessionsLibraryCatalog();
  await ensureBootstrapAccountsFromEnv();
}
