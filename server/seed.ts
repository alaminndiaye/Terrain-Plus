import {
  dbAll,
  dbGet,
  dbRun,
  dbTransaction,
  getDefaultDbExecutor,
  type DbExecutor,
} from './db.ts';
import { buildSampleDiplomaPdfBuffer, storeCoachDiplomaDocument } from './diplomaStudy.ts';
import { hashPassword } from './security.ts';

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
    'Programme hebdomadaire progressif sans matériel obligatoire'
  );
  const programId = Number(planRes.lastInsertRowid);

  const sessions = await executor.all<{ id: number; niveau: string }>(
    `SELECT id, niveau FROM sessions_library
     WHERE sport_code = ? AND validation_status = 'VALIDEE'
     ORDER BY CASE WHEN niveau = ? THEN 0 ELSE 1 END, id ASC`,
    sportCode,
    niveau
  );

  const fallback = await executor.all<{ id: number }>(
    `SELECT id FROM sessions_library WHERE validation_status = 'VALIDEE' LIMIT 3`
  );

  const pool = sessions.length > 0 ? sessions : fallback;
  const trainingDays = [1, 2, 4, 6];

  for (let day = 1; day <= 7; day++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + (day - 1));
    const dateStr = d.toISOString().slice(0, 10);
    const isTraining = trainingDays.includes(day);
    const picked = isTraining && pool.length > 0 ? pool[(day - 1) % pool.length].id : null;

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

async function ensureMinisterPilotUser(): Promise<void> {
  const existingMinister = await dbGet(
    "SELECT id FROM users WHERE role = 'MINISTRE' OR LOWER(email) = 'ministre@terrainplus.sn' LIMIT 1"
  );
  if (!existingMinister) {
    await dbRun(
      `INSERT INTO users (nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified)
       VALUES (?, ?, ?, ?, ?, 'MINISTRE', ?, 'fr', 'ACTIF', 0, 1)
       ON CONFLICT DO NOTHING`,
      'Diallo',
      'Cheikh Tidiane',
      '+221776008899',
      'ministre@terrainplus.sn',
      hashPassword('Ministre2026!'),
      '1976-04-12'
    );
  }
}

async function ensureSecondCoachPilot(): Promise<void> {
  const existingCoach2 = await dbGet<{ id: number }>(
    "SELECT id FROM users WHERE LOWER(email) = 'coach.mbaye@terrainplus.sn' LIMIT 1"
  );
  if (!existingCoach2) {
    const coach2Res = await dbRun(
      `INSERT INTO users (nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified)
       VALUES (?, ?, ?, ?, ?, 'COACH', ?, 'fr', 'ACTIF', 0, 1)`,
      'Mbaye',
      'Fatou Kiné',
      '+221774009911',
      'coach.mbaye@terrainplus.sn',
      hashPassword('Coach2026!'),
      '1995-03-11'
    );
    const coach2Id = Number(coach2Res.lastInsertRowid);
    await dbRun(
      `INSERT INTO coaches (
        user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
        platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa
      ) VALUES (?, ?, ?, ?, 3000, 5000, ?, 'COACH_PRO', 0, 5000)`,
      coach2Id,
      'Explosivité, détente & prévention articulaire',
      'Master STAPS · Préparatrice physique',
      'Dakar & Rufisque',
      'ACTIF_1000'
    );
  }
}

async function ensureCoachDocumentsSeeded(): Promise<void> {
  const adminRow = await dbGet<{ id: number }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1");

  const coach1 = await dbGet<{ id: number; nom: string; prenom: string }>(
    "SELECT id, nom, prenom FROM users WHERE LOWER(email) = 'coach.ndiaye@terrainplus.sn' LIMIT 1"
  );
  if (coach1) {
    await dbRun(
      `UPDATE coaches
       SET pro_card_number = COALESCE(pro_card_number, ?),
           pro_card_expiry = COALESCE(pro_card_expiry, ?),
           rc_pro_insurer = COALESCE(rc_pro_insurer, ?),
           rc_pro_policy_number = COALESCE(rc_pro_policy_number, ?),
           legal_status = COALESCE(legal_status, ?),
           business_reg_number = COALESCE(business_reg_number, ?),
           honorability_attested = 1
       WHERE user_id = ?`,
      'CP-MJS-2023-0412',
      '2028-12-31',
      'AXA Sénégal Sport Pro',
      'RCP-SN-2026-4410',
      'MICRO_ENTREPRISE',
      'NINEA-008451290',
      coach1.id
    );

    const hasDoc1 = await dbGet('SELECT id FROM coach_documents WHERE coach_user_id = ? LIMIT 1', coach1.id);
    if (!hasDoc1) {
      const buf = buildSampleDiplomaPdfBuffer(
        `DIPLOME STAPS & LICENCE FEDERALE - ${coach1.prenom} ${coach1.nom}`,
        'Licence STAPS Entrainement Sportif - Football (INSEPS Dakar)',
        'STAPS-INSEPS-2021-0142'
      );
      const stored = await storeCoachDiplomaDocument({
        coachUserId: coach1.id,
        diplomaType: 'STAPS_LICENCE_MASTER',
        issuingOrganism: 'INSEPS Dakar',
        diplomaNumber: 'STAPS-INSEPS-2021-0142',
        issueYear: 2021,
        specialite: 'Préparation physique Football & appuis courts',
        qualification: 'Licence STAPS · Licence C FSF',
        originalFilename: 'diplome_staps_moussa_ndiaye.pdf',
        buffer: buf,
        proCardNumber: 'CP-MJS-2023-0412',
        proCardExpiry: '2028-12-31',
        rcProInsurer: 'AXA Sénégal Sport Pro',
        rcProPolicyNumber: 'RCP-SN-2026-4410',
        legalStatus: 'MICRO_ENTREPRISE',
        businessRegNumber: 'NINEA-008451290',
        honorabilityAttested: true,
      });
      if (adminRow) {
        await dbRun(
          `UPDATE coach_documents
           SET admin_review_note = ?, reviewed_by_user_id = ?, reviewed_at = datetime('now', '-10 days')
           WHERE id = ?`,
          'Diplôme, carte professionnelle et RC Pro vérifiés conformes.',
          adminRow.id,
          stored.docId
        );
      }
    }
  }

  const coach2 = await dbGet<{ id: number; nom: string; prenom: string }>(
    "SELECT id, nom, prenom FROM users WHERE LOWER(email) = 'coach.mbaye@terrainplus.sn' LIMIT 1"
  );
  if (coach2) {
    await dbRun(
      `UPDATE coaches
       SET pro_card_number = COALESCE(pro_card_number, ?),
           pro_card_expiry = COALESCE(pro_card_expiry, ?),
           rc_pro_insurer = COALESCE(rc_pro_insurer, ?),
           rc_pro_policy_number = COALESCE(rc_pro_policy_number, ?),
           legal_status = COALESCE(legal_status, ?),
           business_reg_number = COALESCE(business_reg_number, ?),
           honorability_attested = 1
       WHERE user_id = ?`,
      'CP-DRAJES-2024-1180',
      '2029-06-30',
      'Allianz Responsabilité Coach',
      'RCP-ALZ-2026-8821',
      'ENTREPRISE_INDIVIDUELLE',
      'NINEA-009124715',
      coach2.id
    );

    const hasDoc2 = await dbGet('SELECT id FROM coach_documents WHERE coach_user_id = ? LIMIT 1', coach2.id);
    if (!hasDoc2) {
      const buf = buildSampleDiplomaPdfBuffer(
        `MASTER STAPS - ${coach2.prenom} ${coach2.nom}`,
        'Master STAPS Preparation Physique & Prevention Articulaire (INSEPS Dakar)',
        'STAPS-INSEPS-2022-0309'
      );
      const stored = await storeCoachDiplomaDocument({
        coachUserId: coach2.id,
        diplomaType: 'STAPS_LICENCE_MASTER',
        issuingOrganism: 'INSEPS Dakar',
        diplomaNumber: 'STAPS-INSEPS-2022-0309',
        issueYear: 2022,
        specialite: 'Explosivité, détente & prévention articulaire',
        qualification: 'Master STAPS · Préparatrice physique',
        originalFilename: 'master_staps_fatou_mbaye.pdf',
        buffer: buf,
        proCardNumber: 'CP-DRAJES-2024-1180',
        proCardExpiry: '2029-06-30',
        rcProInsurer: 'Allianz Responsabilité Coach',
        rcProPolicyNumber: 'RCP-ALZ-2026-8821',
        legalStatus: 'ENTREPRISE_INDIVIDUELLE',
        businessRegNumber: 'NINEA-009124715',
        honorabilityAttested: true,
      });
      if (adminRow) {
        await dbRun(
          `UPDATE coach_documents
           SET admin_review_note = ?, reviewed_by_user_id = ?, reviewed_at = datetime('now', '-5 days')
           WHERE id = ?`,
          'Master STAPS, carte pro et RC Pro validés et conformes.',
          adminRow.id,
          stored.docId
        );
      }
    }
  }

  let pendingCoach = await dbGet<{ id: number; nom: string; prenom: string }>(
    "SELECT id, nom, prenom FROM users WHERE LOWER(email) = 'coach.diop.attente@terrainplus.sn' LIMIT 1"
  );
  if (!pendingCoach) {
    const pendingRes = await dbRun(
      `INSERT INTO users (nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified)
       VALUES (?, ?, ?, ?, ?, 'COACH', ?, 'fr', 'INSCRIT', 0, 1)`,
      'Diop',
      'Ousmane',
      '+221778884411',
      'coach.diop.attente@terrainplus.sn',
      hashPassword('Coach2026!'),
      '1993-08-24'
    );
    const pendingId = Number(pendingRes.lastInsertRowid);
    await dbRun(
      `INSERT INTO coaches (
        user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
        platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa, verification_status,
        pro_card_number, pro_card_expiry, rc_pro_insurer, rc_pro_policy_number, legal_status, business_reg_number, honorability_attested
      ) VALUES (?, ?, ?, ?, 0, 5000, 'ACTIF_1000', 'MARKETPLACE', 20, 4000, 'EN_ATTENTE', ?, ?, ?, ?, ?, ?, 1)`,
      pendingId,
      'Football & Préparation vitesse terrain',
      'Licence Entraîneur CAF C · FSF',
      'Kaolack',
      'CP-MJS-2025-0934',
      '2030-03-15',
      'NSIA Assurances Pro',
      'RCP-NSIA-2026-1194',
      'MICRO_ENTREPRISE',
      'NINEA-009874512'
    );
    pendingCoach = { id: pendingId, nom: 'Diop', prenom: 'Ousmane' };
  } else {
    await dbRun(
      `UPDATE coaches
       SET pro_card_number = COALESCE(pro_card_number, ?),
           pro_card_expiry = COALESCE(pro_card_expiry, ?),
           rc_pro_insurer = COALESCE(rc_pro_insurer, ?),
           rc_pro_policy_number = COALESCE(rc_pro_policy_number, ?),
           legal_status = COALESCE(legal_status, ?),
           business_reg_number = COALESCE(business_reg_number, ?),
           honorability_attested = 1
       WHERE user_id = ?`,
      'CP-MJS-2025-0934',
      '2030-03-15',
      'NSIA Assurances Pro',
      'RCP-NSIA-2026-1194',
      'MICRO_ENTREPRISE',
      'NINEA-009874512',
      pendingCoach.id
    );
  }

  const hasPendingDoc = await dbGet('SELECT id FROM coach_documents WHERE coach_user_id = ? LIMIT 1', pendingCoach.id);
  if (!hasPendingDoc) {
    const buf = buildSampleDiplomaPdfBuffer(
      `ATTESTATION LICENCE CAF C - ${pendingCoach.prenom} ${pendingCoach.nom}`,
      'Federation Senegalaise de Football - DTN / CAF (Specialite Football)',
      'CAF-C-SN-2024-0815'
    );
    await storeCoachDiplomaDocument({
      coachUserId: pendingCoach.id,
      diplomaType: 'LICENCE_CAF_FSF',
      issuingOrganism: 'FSF / DTN Football Sénégal',
      diplomaNumber: 'CAF-C-SN-2024-0815',
      issueYear: 2024,
      specialite: 'Football & Préparation vitesse terrain',
      qualification: 'Licence Entraîneur CAF C · FSF',
      originalFilename: 'licence_caf_c_ousmane_diop.pdf',
      buffer: buf,
      proCardNumber: 'CP-MJS-2025-0934',
      proCardExpiry: '2030-03-15',
      rcProInsurer: 'NSIA Assurances Pro',
      rcProPolicyNumber: 'RCP-NSIA-2026-1194',
      legalStatus: 'MICRO_ENTREPRISE',
      businessRegNumber: 'NINEA-009874512',
      honorabilityAttested: true,
    });
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

async function ensureBusinessModelBackfill(): Promise<void> {
  // Ensure coaches showcase both 0 FCFA Marketplace and Coach Pro (3 000 FCFA / 0% commission)
  const c1User = await dbGet<{ id: number }>(
    "SELECT id FROM users WHERE LOWER(email) = 'coach.ndiaye@terrainplus.sn'"
  );
  if (c1User) {
    await dbRun(
      `UPDATE coaches
       SET coach_plan = 'MARKETPLACE', monthly_fee_fcfa = 0, commission_pct = 20, athlete_payout_fcfa = 4000
       WHERE user_id = ?`,
      c1User.id
    );
  }
  const c2User = await dbGet<{ id: number }>(
    "SELECT id FROM users WHERE LOWER(email) = 'coach.mbaye@terrainplus.sn'"
  );
  if (c2User) {
    await dbRun(
      `UPDATE coaches
       SET coach_plan = 'COACH_PRO', monthly_fee_fcfa = 3000, commission_pct = 0, athlete_payout_fcfa = 5000
       WHERE user_id = ?`,
      c2User.id
    );
  }

  // Ensure seeded PROGRESSION sessions exist and existing advanced/intermediate sessions carry access_tier + exercise imageUrls
  const progressionTitles = [
    'Puissance des jambes et stabilité',
    'Plyométrie contrôlée demi-terrain',
    'Contre-attaque et gainage anti-rotation',
  ];
  for (const title of progressionTitles) {
    await dbRun("UPDATE sessions_library SET access_tier = 'PROGRESSION' WHERE titre = ?", title);
  }

  const allSessions = await dbAll<{ id: number; exercises_json: string }>(
    'SELECT id, exercises_json FROM sessions_library'
  );
  for (const s of allSessions) {
    const nextJson = attachImagesToExerciseJson(s.exercises_json);
    if (nextJson !== s.exercises_json) {
      await dbRun('UPDATE sessions_library SET exercises_json = ? WHERE id = ?', nextJson, s.id);
    }
  }

  const coachId = c1User?.id || null;

  const extraSessions: Array<{
    sport: string;
    titre: string;
    niveau: string;
    duree: number;
    objectif: string;
    prevention: string;
    exercises: Array<Record<string, unknown>>;
  }> = [
    {
      sport: 'football',
      titre: 'Cycle Navétanes — Force jambes & gainage avancé',
      niveau: 'intermediaire',
      duree: 24,
      objectif: 'Préparation spécifique tournoi et tenue d’appuis',
      prevention: 'Quadriceps, fessiers et sangle abdominale',
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
    {
      sport: 'basket',
      titre: 'Cycle Détente — Squat Goblet & haut du corps',
      niveau: 'avance',
      duree: 25,
      objectif: 'Gain de puissance verticale et solidité au contact',
      prevention: 'Genoux, ceinture scapulaire et lombaires',
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
    {
      sport: 'handball',
      titre: 'Cycle Arrière/Ailier — Pompes ciblées & gainage',
      niveau: 'intermediaire',
      duree: 24,
      objectif: 'Puissance de tir au bras et protection d’épaule',
      prevention: 'Épaules, triceps et gainage latéral',
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
  ];

  for (const item of extraSessions) {
    const exists = await dbGet('SELECT id FROM sessions_library WHERE titre = ?', item.titre);
    if (!exists) {
      await dbRun(
        `INSERT INTO sessions_library (
          sport_code, titre, niveau, duree_min, objectif, prevention_focus,
          relue_par, validation_status, proposee_par_user_id, access_tier, exercises_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'Dr. S. Diagne (Médecin du sport)', 'VALIDEE', ?, 'PROGRESSION', ?)`,
        item.sport,
        item.titre,
        item.niveau,
        item.duree,
        item.objectif,
        item.prevention,
        coachId,
        JSON.stringify(item.exercises)
      );
    }
  }
}

async function ensureExpandedSportsLibrary(): Promise<void> {
  const coachRow = await dbGet<{ id: number }>(
    "SELECT id FROM users WHERE role = 'COACH' ORDER BY id ASC LIMIT 1"
  );
  const coachId = coachRow ? coachRow.id : null;

  const newSportSessions = [
    {
      sport: 'volleyball',
      titre: 'Détente verticale et réception stable',
      niveau: 'debutant',
      duree: 22,
      objectif: 'Améliorer l’impulsion au filet et amortir les réceptions',
      prevention: 'Genoux (tendon rotulien) et chevilles',
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
    {
      sport: 'athletisme',
      titre: 'Mécanique de course et réactivité Achille',
      niveau: 'debutant',
      duree: 22,
      objectif: 'Installer une foulée économique et renforcer mollets et pieds sans matériel',
      prevention: 'Tendons d’Achille et mollets',
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
  ];

  for (const item of newSportSessions) {
    const exists = await dbGet('SELECT id FROM sessions_library WHERE titre = ?', item.titre);
    if (!exists) {
      await dbRun(
        `INSERT INTO sessions_library (
          sport_code, titre, niveau, duree_min, objectif, prevention_focus,
          relue_par, validation_status, proposee_par_user_id, access_tier, exercises_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'Dr. S. Diagne (Médecin du sport)', 'VALIDEE', ?, ?, ?)`,
        item.sport,
        item.titre,
        item.niveau,
        item.duree,
        item.objectif,
        item.prevention,
        coachId,
        item.accessTier,
        JSON.stringify(item.exercises)
      );
    }
  }

  // Ensure collective groups exist for Volleyball and Athlétisme
  const firstPartner = await dbGet<{ id: number }>('SELECT id FROM partners ORDER BY id ASC LIMIT 1');
  if (firstPartner) {
    const hasVolleyGroup = await dbGet("SELECT id FROM groups WHERE sport_code = 'volleyball' LIMIT 1");
    if (!hasVolleyGroup) {
      await dbRun(
        'INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)',
        'Collectif Volley Campus Dakar',
        firstPartner.id,
        'Mariama Ndiaye',
        'volleyball'
      );
    }
    const hasAthGroup = await dbGet("SELECT id FROM groups WHERE sport_code = 'athletisme' LIMIT 1");
    if (!hasAthGroup) {
      await dbRun(
        'INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)',
        'Collectif Athlétisme Piste Thiès',
        firstPartner.id,
        'Pape Moussa Fall',
        'athletisme'
      );
    }
  }
}

export async function seedIfEmpty(): Promise<void> {
  const countRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if (Number(countRow?.c || 0) > 0) {
    await ensureMinisterPilotUser();
    await ensureSecondCoachPilot();
    await ensureCoachDocumentsSeeded();
    await ensureBusinessModelBackfill();
    await ensureExpandedSportsLibrary();
    return;
  }

  await dbTransaction(async (tx) => {
    const recheck = await tx.get<{ c: number }>('SELECT COUNT(*) as c FROM users');
    if (Number(recheck?.c || 0) > 0) return;

    const pUidt = Number(
      (await tx.run('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)', 'Campus Université Iba Der Thiam', 'CAMPUS', 'Thiès')).lastInsertRowid
    );
    const pAsc = Number(
      (await tx.run('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)', 'ASC Jaraaf Quartier', 'ASC', 'Dakar')).lastInsertRowid
    );
    const pUgb = Number(
      (await tx.run('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)', 'Campus UGB Sanar', 'CAMPUS', 'Saint-Louis')).lastInsertRowid
    );

    const gFoot = Number(
      (await tx.run('INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)', 'Collectif Foot Thiès Campus', pUidt, 'Ousmane Bâ', 'football')).lastInsertRowid
    );
    const gBasket = Number(
      (await tx.run('INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)', 'Collectif Basket Saint-Louis', pUgb, 'Aïssatou Diallo', 'basket')).lastInsertRowid
    );
    const gHand = Number(
      (await tx.run('INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)', 'Collectif Handball Dakar Sud', pAsc, 'Cheikh Mbaye', 'handball')).lastInsertRowid
    );

    await tx.run('INSERT INTO challenges (partner_id, titre, indicateur, periode, target_sessions, current_sessions) VALUES (?, ?, ?, ?, ?, ?)', pUidt, 'Défi Régularité Campus Thiès', 'Séances collectives terminées', 'Novembre 2026', 120, 84);
    await tx.run('INSERT INTO challenges (partner_id, titre, indicateur, periode, target_sessions, current_sessions) VALUES (?, ?, ?, ?, ?, ?)', pUgb, 'Défi 3 séances par semaine', 'Régularité hebdomadaire du groupe', 'Novembre 2026', 90, 61);
    await tx.run('INSERT INTO challenges (partner_id, titre, indicateur, periode, target_sessions, current_sessions) VALUES (?, ?, ?, ?, ?, ?)', pAsc, 'Prépa Saison ASC sans blessure', 'Séances prévention complétées', 'Novembre 2026', 100, 72);

    const insertUser = (
      nom: string,
      prenom: string,
      telephone: string,
      email: string,
      passwordHash: string,
      role: string,
      dob: string,
      langue: string,
      statut: string
    ) =>
      tx.run(
        `INSERT INTO users (nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        nom,
        prenom,
        telephone,
        email,
        passwordHash,
        role,
        dob,
        langue,
        statut
      );

    const adminId = Number((await insertUser('Kambaye', 'Ndeye Amy', '+221775006677', 'admin@terrainplus.sn', hashPassword('Admin2026!'), 'ADMIN', '1999-05-14', 'fr', 'ACTIF')).lastInsertRowid);
    const coachId = Number((await insertUser('Ndiaye', 'Mamadou', '+221774005566', 'coach.ndiaye@terrainplus.sn', hashPassword('Coach2026!'), 'COACH', '1993-08-22', 'fr', 'ACTIF')).lastInsertRowid);
    const coach2Id = Number((await insertUser('Mbaye', 'Fatou Kiné', '+221774009911', 'coach.mbaye@terrainplus.sn', hashPassword('Coach2026!'), 'COACH', '1995-03-11', 'fr', 'ACTIF')).lastInsertRowid);
    const moussaId = Number((await insertUser('Diop', 'Moussa', '+221771001122', 'moussa.diop@terrainplus.sn', hashPassword('Terrain2026!'), 'ATHLETE', '2003-03-18', 'fr', 'SUIVI_ACTIF')).lastInsertRowid);
    const awaId = Number((await insertUser('Fall', 'Awa', '+221772003344', 'awa.fall@terrainplus.sn', hashPassword('Terrain2026!'), 'ATHLETE', '2004-11-09', 'fr', 'SUIVI_ACTIF')).lastInsertRowid);
    const ibrahimaId = Number((await insertUser('Sarr', 'Ibrahima', '+221773004455', 'ibrahima.sarr@terrainplus.sn', hashPassword('Terrain2026!'), 'ATHLETE', '2002-07-02', 'fr', 'ACTIF')).lastInsertRowid);

    await tx.run(
      `INSERT INTO coaches (
        user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
        platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa
      ) VALUES (?, ?, ?, ?, 0, 5000, ?, 'MARKETPLACE', 20, 4000)`,
      coachId,
      'Préparation physique sports collectifs',
      'Licence STAPS · Préparateur fédéral',
      'Thiès & Saint-Louis',
      'ACTIF_1000'
    );

    await tx.run(
      `INSERT INTO coaches (
        user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
        platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa
      ) VALUES (?, ?, ?, ?, 3000, 5000, ?, 'COACH_PRO', 0, 5000)`,
      coach2Id,
      'Explosivité, détente & prévention articulaire',
      'Master STAPS · Préparatrice physique',
      'Dakar & Rufisque',
      'ACTIF_1000'
    );

    for (const uid of [moussaId, awaId, ibrahimaId]) {
      await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', uid, 'DONNEES_SENSIBLES', 'v1.0');
      await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', uid, 'NON_MEDICAL', 'v1.0');
    }

    await tx.run(
      `INSERT INTO athlete_profiles (user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode, notifications_enabled, coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at, plan_tier, plan_fee_fcfa, plan_billing_cycle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIF_5000', 5000, datetime('now', '-15 days'), 'COACH_PRIVE', 5000, 'MENSUEL')`,
      moussaId,
      'football',
      'intermediaire',
      178,
      'Milieu',
      'Gagner en explosivité sur 15 m et régularité 4 semaines',
      0,
      1
    );

    await tx.run(
      `INSERT INTO athlete_profiles (user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode, notifications_enabled, coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at, plan_tier, plan_fee_fcfa, plan_billing_cycle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIF_5000', 5000, datetime('now', '-10 days'), 'COACH_PRIVE', 5000, 'MENSUEL')`,
      awaId,
      'basket',
      'intermediaire',
      173,
      'Meneur',
      'Améliorer la détente verticale et protéger les chevilles',
      0,
      1
    );

    await tx.run(
      `INSERT INTO athlete_profiles (user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode, notifications_enabled, coach_subscription_status, coach_monthly_fee_fcfa, plan_tier, plan_fee_fcfa, plan_billing_cycle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GRATUIT_BASE', 0, 'ESSENTIEL', 0, 'MENSUEL')`,
      ibrahimaId,
      'handball',
      'debutant',
      181,
      'Arrière',
      'Renforcer les épaules et tenir la cadence de match',
      1,
      1
    );

    await tx.run('INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, ?, ?)', coachId, moussaId, '2026-10-15', 'ACTIF');
    await tx.run('INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, ?, ?)', coachId, awaId, '2026-10-20', 'ACTIF');

    await tx.run('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)', moussaId, gFoot);
    await tx.run('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)', awaId, gBasket);
    await tx.run('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)', ibrahimaId, gHand);

    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', moussaId, 71.8, '2026-10-15');
    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', moussaId, 71.2, '2026-10-29');
    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', moussaId, 70.6, '2026-11-12');
    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', awaId, 63.4, '2026-10-20');
    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', awaId, 63.1, '2026-11-10');
    await tx.run('INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, ?)', ibrahimaId, 76.0, '2026-11-01');

    const insertSession = {
      run: (...params: unknown[]) =>
        tx.run(
          `INSERT INTO sessions_library (
            sport_code, titre, niveau, duree_min, objectif, prevention_focus,
            relue_par, validation_status, proposee_par_user_id, exercises_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...params
        ),
    };

  // Football Sessions
  await insertSession.run(
    'football',
    'Appuis courts et explosivité terrain',
    'intermediaire',
    22,
    'Accélération et changements de direction',
    'Cuisses et chevilles',
    'Dr. S. Diagne (Médecin du sport) · M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  await insertSession.run(
    'football',
    'Endurance intermittente 15-15 sans matériel',
    'debutant',
    18,
    'Capacité aérobie de match',
    'Chevilles et mollets',
    'M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  await insertSession.run(
    'football',
    'Puissance des jambes et stabilité',
    'avance',
    26,
    'Force explosive et duels',
    'Ischio-jambiers et genoux',
    'Dr. S. Diagne · M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  // Basket Sessions
  await insertSession.run(
    'basket',
    'Détente verticale et réception chevilles',
    'intermediaire',
    20,
    'Rebond, tir en suspension et protection articulaire',
    'Chevilles et genoux',
    'Dr. S. Diagne · M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  await insertSession.run(
    'basket',
    'Réactivité premier pas et gainage court',
    'debutant',
    18,
    'Vitesse de réaction et posture défensive',
    'Genoux et lombaires',
    'M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  await insertSession.run(
    'basket',
    'Plyométrie contrôlée demi-terrain',
    'avance',
    25,
    'Explosivité en fin de match',
    'Chevilles et tendons rotuliens',
    'Dr. S. Diagne',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  // Handball Sessions
  await insertSession.run(
    'handball',
    'Solidité des épaules et vitesse courte',
    'debutant',
    20,
    'Préparation du lancer et stabilité du tronc',
    'Épaules et genoux',
    'Dr. S. Diagne · M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  await insertSession.run(
    'handball',
    'Contre-attaque et gainage anti-rotation',
    'intermediaire',
    22,
    'Vitesse sur 15 m et duels au contact',
    'Épaules et lombaires',
    'M. Ndiaye (STAPS)',
    'VALIDEE',
    coachId,
    JSON.stringify([
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
    ])
  );

  // Pending review session (so Admin can test content validation gate)
  await insertSession.run(
    'handball',
    'Mobilité thoracique et prévention épaule de tir',
    'avance',
    16,
    'Amplitude de bras armé et récupération',
    'Épaules',
    null,
    'EN_RELECTURE',
    coachId,
    JSON.stringify([
      {
        id: 'hb-pending-ex1',
        nom: 'Ouverture thoracique au sol',
        consigneFr: 'Allongé sur le côté, genou supérieur posé au sol, ouvrez le bras opposé vers l’arrière.',
        consigneWo: 'Tëddël ci wet gi, ubbil sa loxo jëm ci ginnaaw ci ndànk.',
        varianteFacile: 'Amplitude réduite selon confort',
        varianteDifficile: 'Maintien 5 secondes en fin d’amplitude',
        mode: 'duree',
        dureeSec: 45,
        reposSec: 15,
      },
    ])
  );

    // Build weekly plans
    await buildDefaultScheduleForAthlete(moussaId, 'football', 'intermediaire', coachId, 'Explosivité et régularité 4 semaines', tx);
    await buildDefaultScheduleForAthlete(awaId, 'basket', 'intermediaire', coachId, 'Détente verticale et protection chevilles', tx);
    await buildDefaultScheduleForAthlete(ibrahimaId, 'handball', 'debutant', null, 'Renforcement épaules et endurance', tx);

    // Mark Day 1 of Moussa as completed and Day 4 as Coach-Adjusted with visible motif
    const moussaSched = await tx.all<{ id: number; jour_semaine: number }>(
      'SELECT id, jour_semaine FROM scheduled_sessions WHERE athlete_user_id = ? ORDER BY jour_semaine',
      moussaId
    );

    if (moussaSched[0]) {
      await tx.run(
        `UPDATE scheduled_sessions
         SET completed = 1, ressenti_fatigue = 5, difficulte = 6, qualite_sommeil = 8, completed_at = datetime('now', '-2 days')
         WHERE id = ?`,
        moussaSched[0].id
      );
    }
    if (moussaSched[3]) {
      await tx.run(
        `UPDATE scheduled_sessions
         SET ajustee_par_coach = 1,
             motif_ajustement = 'Allègement de charge avant match ASC de samedi — focus appuis courts',
             date_ajustement = datetime('now', '-1 day')
         WHERE id = ?`,
        moussaSched[3].id
      );
    }

    // Evaluations for Moussa (Initial + Periodic)
    const eval1Id = Number(
      (
        await tx.run(
          `INSERT INTO evaluations (athlete_user_id, type, sport_code, date, score_global, results_json)
           VALUES (?, 'INITIALE', 'football', date('now', '-28 days'), 64, ?)`,
          moussaId,
          JSON.stringify([
            { test_code: 'fb_squats_30s', test_nom: 'Squats en 30 s', valeur: 19, unite: 'répétitions', niveau_obtenu: 'Faible' },
            { test_code: 'fb_navette_courte', test_nom: 'Course navette courte (6 x 10 m)', valeur: 14.9, unite: 'secondes', niveau_obtenu: 'Moyen' },
            { test_code: 'fb_gainage_chrono', test_nom: 'Gainage frontal chronométré', valeur: 62, unite: 'secondes', niveau_obtenu: 'Moyen' },
          ])
        )
      ).lastInsertRowid
    );

    const eval2Id = Number(
      (
        await tx.run(
          `INSERT INTO evaluations (athlete_user_id, type, sport_code, date, score_global, results_json)
           VALUES (?, 'PERIODIQUE', 'football', date('now', '-2 days'), 78, ?)`,
          moussaId,
          JSON.stringify([
            { test_code: 'fb_squats_30s', test_nom: 'Squats en 30 s', valeur: 24, unite: 'répétitions', niveau_obtenu: 'Moyen' },
            { test_code: 'fb_navette_courte', test_nom: 'Course navette courte (6 x 10 m)', valeur: 13.5, unite: 'secondes', niveau_obtenu: 'Bon pour le niveau' },
            { test_code: 'fb_gainage_chrono', test_nom: 'Gainage frontal chronométré', valeur: 84, unite: 'secondes', niveau_obtenu: 'Moyen' },
          ])
        )
      ).lastInsertRowid
    );

    await tx.run(
      `INSERT INTO coach_comments (coach_user_id, evaluation_id, texte, date)
       VALUES (?, ?, ?, datetime('now', '-1 day'))`,
      coachId,
      eval1Id,
      'Bonne base de vitesse sur les appuis courts. On va renforcer l’endurance de force des cuisses sur les 4 prochaines semaines.'
    );
    await tx.run(
      `INSERT INTO coach_comments (coach_user_id, evaluation_id, texte, date)
       VALUES (?, ?, ?, datetime('now', '-12 hours'))`,
      coachId,
      eval2Id,
      'Net progrès sur la course navette (-1,4 s) et +5 squats en 30 s. Continue la régularité sur le gainage.'
    );

    // Evaluation for Awa
    await tx.run(
      `INSERT INTO evaluations (athlete_user_id, type, sport_code, date, score_global, results_json)
       VALUES (?, 'INITIALE', 'basket', date('now', '-14 days'), 70, ?)`,
      awaId,
      JSON.stringify([
        { test_code: 'bk_saut_vertical', test_nom: 'Saut vertical mesuré au mur', valeur: 41, unite: 'cm', niveau_obtenu: 'Moyen' },
        { test_code: 'bk_appuis_lateraux', test_nom: 'Appuis latéraux en 20 s', valeur: 11, unite: 'allers-retours', niveau_obtenu: 'Moyen' },
        { test_code: 'bk_gainage', test_nom: 'Gainage frontal stabilisé', valeur: 68, unite: 'secondes', niveau_obtenu: 'Moyen' },
      ])
    );

    // Alerts
    await tx.run(
      `INSERT INTO alerts (athlete_user_id, type, zone_douleur, intensite, message, date, traitee)
       VALUES (?, 'RAPPEL', NULL, NULL, 'Prochain bilan coach programmé dans 3 jours — pensez à noter votre poids.', datetime('now', '-1 day'), 0)`,
      moussaId
    );

    await tx.run(
      `INSERT INTO alerts (athlete_user_id, type, zone_douleur, intensite, message, date, traitee)
       VALUES (?, 'DOULEUR', 'Cheville droite', 5, 'Légère gêne ressentie à la réception après sauts pogo.', datetime('now', '-4 hours'), 0)`,
      awaId
    );

    // Initial Audit log entries
    await tx.run(
      `INSERT INTO access_audit_logs (actor_user_id, actor_role, athlete_user_id, action, resource, created_at)
       VALUES (?, 'COACH', ?, 'CONSULTATION_FICHE', 'evaluations,poids', datetime('now', '-12 hours'))`,
      coachId,
      moussaId
    );
    await tx.run(
      `INSERT INTO access_audit_logs (actor_user_id, actor_role, athlete_user_id, action, resource, created_at)
       VALUES (?, 'ADMIN', ?, 'AFFECTATION_COACH', 'assignments', datetime('now', '-14 days'))`,
      adminId,
      moussaId
    );
  });

  await ensureMinisterPilotUser();
  await ensureSecondCoachPilot();
  await ensureCoachDocumentsSeeded();
  await ensureBusinessModelBackfill();
  await ensureExpandedSportsLibrary();
}
