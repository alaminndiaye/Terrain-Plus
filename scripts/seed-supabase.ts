import fs from 'node:fs';
import path from 'node:path';
import { getAppConfig } from '../src/lib/config';
import { getSupabaseAdmin } from '../src/lib/supabase/admin';
import { deriveAuthEmail, encryptText } from '../src/lib/security/crypto';

for (const envFile of ['.env.local', '.env']) {
  const full = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(full)) {
    const content = fs.readFileSync(full, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

async function ensureAuthUser(params: {
  email: string;
  password: string;
  phone: string;
  role: 'athlete' | 'doctor' | 'admin';
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  birthDate: string;
  onboardingCompleted?: boolean;
}) {
  const admin = getSupabaseAdmin();
  const { data: existingProf } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', params.phone)
    .maybeSingle();

  let userId = existingProf?.id as string | undefined;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: { role: params.role, phone: params.phone },
    });
    if (error || !data.user) {
      throw new Error(`Impossible de créer ${params.email}: ${error?.message}`);
    }
    userId = data.user.id;
  }

  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    role: params.role,
    first_name: params.firstName,
    last_name: params.lastName,
    full_name: `${params.firstName} ${params.lastName}`,
    phone: params.phone,
    email: params.email,
    address: params.address,
    city: params.city,
    birth_date: params.birthDate,
    status: 'active',
    phone_verified: true,
    onboarding_completed: params.onboardingCompleted ?? true,
  });
  if (profErr) throw new Error(`Erreur upsert profiles (${params.email}): ${profErr.message}`);

  return userId;
}

async function runSeed() {
  const config = getAppConfig();
  const admin = getSupabaseAdmin();

  // 1. Spécialités & Articles de prévention
  const specialtiesData = [
    { slug: 'medecine-du-sport', name: 'Médecine du sport', description: 'Suivi médical régulier, bilans d’aptitude, surcharge et prévention des blessures.', icon: 'activity', sort_order: 1 },
    { slug: 'traumatologie-orthopedie', name: 'Traumatologie & Orthopédie', description: 'Entorses, genou, cheville, épaule et traumatismes articulaires.', icon: 'bone', sort_order: 2 },
    { slug: 'kinesitherapie-readaptation', name: 'Kinésithérapie & Réadaptation', description: 'Rééducation fonctionnelle, reprise progressive après blessure et mobilité.', icon: 'heart-pulse', sort_order: 3 },
    { slug: 'cardiologie-du-sport', name: 'Cardiologie du sport', description: 'Bilan cardiovasculaire à l’effort, essoufflement et suivi d’endurance.', icon: 'heart', sort_order: 4 },
    { slug: 'nutrition-sportive', name: 'Nutrition & Hydratation sportive', description: 'Récupération énergétique et hydratation en climat chaud.', icon: 'apple', sort_order: 5 },
    { slug: 'medecine-generale-sportive', name: 'Médecine générale sportive', description: 'Première orientation médicale et suivi général du pratiquant.', icon: 'stethoscope', sort_order: 6 },
  ];

  for (const sp of specialtiesData) {
    await admin.from('specialties').upsert({ ...sp, is_active: true }, { onConflict: 'slug' });
  }

  const { data: specialties } = await admin.from('specialties').select('*');
  const specBySlug = new Map((specialties || []).map((s) => [s.slug, s.id]));

  // 2. Comptes utilisateurs de démonstration (18+)
  const adminId = await ensureAuthUser({
    email: config.adminEmail,
    password: config.adminPassword,
    phone: config.adminPhone,
    role: 'admin',
    firstName: 'Admin',
    lastName: 'Terrain+',
    address: 'Plateau, Dakar',
    city: 'Dakar',
    birthDate: '1988-01-15',
  });

  const athlete1Id = await ensureAuthUser({
    email: deriveAuthEmail('+221771111111', 'sportif@terrainplus.sn'),
    password: 'Demo1234!',
    phone: '+221771111111',
    role: 'athlete',
    firstName: 'Moussa',
    lastName: 'Diallo',
    address: 'Mermoz Pyrotechnie',
    city: 'Dakar',
    birthDate: '1999-05-12',
    onboardingCompleted: true,
  });

  const doc1Id = await ensureAuthUser({
    email: 'medecin@terrainplus.sn',
    password: 'Demo1234!',
    phone: '+221773333333',
    role: 'doctor',
    firstName: 'Cheikh',
    lastName: 'Fall',
    address: 'Avenue Abdoulaye Fadiga, Plateau',
    city: 'Dakar',
    birthDate: '1982-03-20',
  });

  const doc2Id = await ensureAuthUser({
    email: 'medecin2@terrainplus.sn',
    password: 'Demo1234!',
    phone: '+221774444444',
    role: 'doctor',
    firstName: 'Mariama',
    lastName: 'Sarr',
    address: 'Route des Almadies',
    city: 'Dakar',
    birthDate: '1985-08-14',
  });

  const doc3Id = await ensureAuthUser({
    email: 'medecin3@terrainplus.sn',
    password: 'Demo1234!',
    phone: '+221775555555',
    role: 'doctor',
    firstName: 'Abdoulaye',
    lastName: 'Diop',
    address: 'Quartier Escale',
    city: 'Thiès',
    birthDate: '1980-11-02',
  });

  const docPendingId = await ensureAuthUser({
    email: 'medecin.attente@terrainplus.sn',
    password: 'Demo1234!',
    phone: '+221776666666',
    role: 'doctor',
    firstName: 'Fatou',
    lastName: 'Bâ',
    address: 'Quartier Nord',
    city: 'Saint-Louis',
    birthDate: '1989-07-04',
  });

  // 3. Profils médecins, forum anonymisé & profil sportif
  const nowIso = new Date().toISOString();
  const doctorSeeds = [
    {
      user_id: doc1Id,
      specialty_id: specBySlug.get('medecine-du-sport'),
      order_number: 'ONMSN-2014-0842',
      public_name: 'Dr. Cheikh Fall',
      other_specialties_json: ['Suivi athlètes collectifs'],
      city: 'Dakar',
      facility_name: 'Centre Médico-Sportif du Plateau',
      facility_address: 'Avenue Abdoulaye Fadiga, Dakar Plateau',
      languages_json: ['Français', 'Wolof'],
      bio: 'Médecin du sport spécialisé dans le suivi régulier des pratiquants de basketball, football et athlétisme.',
      supports_video: true,
      supports_physical: true,
      consultation_fee_fcfa: 10000,
      verification_status: 'verified',
      submitted_at: nowIso,
      sla_due_at: null,
      verified_at: nowIso,
      verified_by: adminId,
    },
    {
      user_id: doc2Id,
      specialty_id: specBySlug.get('traumatologie-orthopedie'),
      order_number: 'ONMSN-2016-1190',
      public_name: 'Dr. Mariama Sarr',
      other_specialties_json: ['Genou & cheville'],
      city: 'Dakar',
      facility_name: 'Clinique Sportive Almadies',
      facility_address: 'Route des Almadies, Dakar',
      languages_json: ['Français', 'Anglais'],
      bio: 'Prise en charge des traumatismes articulaires et plans de retour progressif au sport.',
      supports_video: true,
      supports_physical: true,
      consultation_fee_fcfa: 10000,
      verification_status: 'verified',
      submitted_at: nowIso,
      sla_due_at: null,
      verified_at: nowIso,
      verified_by: adminId,
    },
    {
      user_id: doc3Id,
      specialty_id: specBySlug.get('kinesitherapie-readaptation'),
      order_number: 'ONMSN-2013-0512',
      public_name: 'Dr. Abdoulaye Diop',
      other_specialties_json: ['Rééducation tendineuse'],
      city: 'Thiès',
      facility_name: 'Polyclinique du Rail Thiès',
      facility_address: 'Quartier Escale, Thiès',
      languages_json: ['Français', 'Wolof'],
      bio: 'Réadaptation fonctionnelle, gestion des tendinopathies et reprise encadrée.',
      supports_video: true,
      supports_physical: true,
      consultation_fee_fcfa: 10000,
      verification_status: 'verified',
      submitted_at: nowIso,
      sla_due_at: null,
      verified_at: nowIso,
      verified_by: adminId,
    },
    {
      user_id: docPendingId,
      specialty_id: specBySlug.get('cardiologie-du-sport'),
      order_number: 'ONMSN-2021-2044',
      public_name: 'Dr. Fatou Bâ',
      other_specialties_json: [],
      city: 'Saint-Louis',
      facility_name: 'Centre Hospitalier Régional Saint-Louis',
      facility_address: 'Quartier Nord, Saint-Louis',
      languages_json: ['Français'],
      bio: 'Cardiologie du sport et bilans d’endurance.',
      supports_video: true,
      supports_physical: true,
      consultation_fee_fcfa: 10000,
      verification_status: 'pending',
      submitted_at: nowIso,
      sla_due_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      verified_at: null,
      verified_by: null,
    },
  ];
  const { error: docProfErr } = await admin.from('doctor_profiles').upsert(doctorSeeds);
  if (docProfErr) throw new Error(`Erreur upsert doctor_profiles: ${docProfErr.message}`);

  // 4. Sujet forum anonymisé de démonstration (réservé aux médecins vérifiés)
  const { count: topicCount } = await admin
    .from('doctor_forum_topics')
    .select('id', { count: 'exact', head: true });
  if (!topicCount) {
    const { error: topicErr } = await admin.from('doctor_forum_topics').insert({
      author_doctor_id: doc1Id,
      specialty_id: specBySlug.get('medecine-du-sport'),
      category: 'protocols',
      title: 'Protocole de reprise graduelle après entorse latérale de cheville en basketball',
      body: 'Rappel de bonnes pratiques confraternelles : avant de valider la reprise collective, évaluer la stabilité en appui unipodal et la charge progressive sur 2 à 3 séances sans gonflement. Partagez vos retours de terrain (cas strictement anonymisés).',
      is_pinned: true,
      moderation_status: 'published',
    });
    if (topicErr) throw new Error(`Erreur insert doctor_forum_topics: ${topicErr.message}`);
  }

  // 5. Profil sportif (nécessite le schéma Terrain+ de athlete_profiles)
  const { error: athProfErr } = await admin.from('athlete_profiles').upsert({
    user_id: athlete1Id,
    sports_json: ['basketball', 'football'],
    primary_sport: 'basketball',
    practice_level: 'club',
    weekly_frequency: '4 séances / semaine',
    height_cm: 186,
    weight_kg: 81.5,
    dominant_side: 'droite',
    medical_goal: 'regular_followup',
    followup_frequency: 'monthly',
    prior_injuries_enc: encryptText('Entorse cheville droite en 2024 (résolue).', config.encryptionKeyBuffer),
  });
  if (athProfErr) {
    throw new Error(
      `Erreur upsert athlete_profiles (${athProfErr.message}). Exécutez supabase/migrations/0002_fix_legacy_collisions.sql dans Supabase Dashboard -> SQL Editor puis relancez npm run seed.`
    );
  }

  console.log('[Terrain+] Seed Supabase terminé avec succès.');
}

runSeed().catch((err) => {
  console.error('[Terrain+] Erreur seed:', err);
  process.exit(1);
});
