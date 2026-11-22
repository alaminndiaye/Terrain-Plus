import {
  USE_POSTGRES,
  dbAll,
  dbExec,
  dbGet,
  dbPragma,
  dbRun,
  dbTransaction,
  getDefaultDbExecutor,
  type DbExecutor,
  type DbRunResult,
} from './database.ts';

export { USE_POSTGRES, dbAll, dbExec, dbGet, dbRun, dbTransaction, getDefaultDbExecutor, type DbExecutor, type DbRunResult };

const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ATHLETE', 'COACH', 'ADMIN', 'MINISTRE')),
  date_naissance TEXT NOT NULL,
  langue TEXT NOT NULL DEFAULT 'fr' CHECK (langue IN ('fr', 'wo')),
  statut TEXT NOT NULL DEFAULT 'INSCRIT' CHECK (statut IN ('INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE')),
  is_minor INTEGER NOT NULL DEFAULT 0,
  parental_consent_name TEXT,
  parental_consent_phone TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  otp_code_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.athlete_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
  niveau TEXT NOT NULL CHECK (niveau IN ('debutant', 'intermediaire', 'avance')),
  taille_cm INTEGER,
  poste TEXT,
  objectif TEXT,
  eco_data_mode INTEGER NOT NULL DEFAULT 0,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_time TEXT NOT NULL DEFAULT '18:00',
  reminder_lead_minutes INTEGER NOT NULL DEFAULT 30,
  coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE' CHECK (coach_subscription_status IN ('GRATUIT_BASE', 'ACTIF_5000')),
  coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
  coach_subscribed_at TIMESTAMPTZ,
  plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
  plan_fee_fcfa INTEGER NOT NULL DEFAULT 0,
  plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL'
);

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id BIGSERIAL PRIMARY KEY,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  poids_kg DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coaches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  specialite TEXT NOT NULL,
  qualification TEXT NOT NULL,
  zone TEXT NOT NULL,
  monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
  athlete_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 5000,
  platform_subscription_status TEXT NOT NULL DEFAULT 'ACTIF_1000' CHECK (platform_subscription_status IN ('EN_ATTENTE', 'ACTIF_1000')),
  coach_plan TEXT NOT NULL DEFAULT 'MARKETPLACE',
  commission_pct INTEGER NOT NULL DEFAULT 20,
  athlete_payout_fcfa INTEGER NOT NULL DEFAULT 4000,
  verification_status TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (verification_status IN ('EN_ATTENTE', 'VERIFIE', 'REFUSE')),
  rejection_reason TEXT,
  pro_card_number TEXT,
  pro_card_expiry TEXT,
  rc_pro_insurer TEXT,
  rc_pro_policy_number TEXT,
  legal_status TEXT,
  business_reg_number TEXT,
  honorability_attested INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.coach_documents (
  id BIGSERIAL PRIMARY KEY,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  diploma_type TEXT NOT NULL,
  issuing_organism TEXT NOT NULL,
  diploma_number TEXT NOT NULL,
  issue_year INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sha256_hash TEXT NOT NULL,
  study_score INTEGER NOT NULL DEFAULT 0,
  study_status TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK (study_status IN ('CONFORME_PRE_ETUDE', 'A_VERIFIER', 'ANOMALIE')),
  study_report_json TEXT NOT NULL,
  admin_review_note TEXT,
  reviewed_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id BIGSERIAL PRIMARY KEY,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date_debut TEXT NOT NULL,
  date_fin TEXT,
  statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'TERMINE'))
);

CREATE TABLE IF NOT EXISTS public.partners (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ASC', 'CAMPUS', 'LIGUE')),
  zone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.groups (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  partner_id BIGINT NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  captain_name TEXT NOT NULL,
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness'))
);

CREATE TABLE IF NOT EXISTS public.group_memberships (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.challenges (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  indicateur TEXT NOT NULL,
  periode TEXT NOT NULL,
  target_sessions INTEGER NOT NULL,
  current_sessions INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.partner_requests (
  id BIGSERIAL PRIMARY KEY,
  organisation TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ASC', 'CAMPUS', 'LIGUE')),
  zone TEXT NOT NULL,
  contact_nom TEXT NOT NULL,
  contact_telephone TEXT NOT NULL,
  contact_email TEXT,
  sport_principal TEXT,
  nombre_athletes_estime INTEGER,
  pack_souhaite TEXT,
  message TEXT,
  statut TEXT NOT NULL DEFAULT 'NOUVELLE' CHECK (statut IN ('NOUVELLE', 'EN_ETUDE', 'VALIDEE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions_library (
  id BIGSERIAL PRIMARY KEY,
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
  titre TEXT NOT NULL,
  niveau TEXT NOT NULL CHECK (niveau IN ('debutant', 'intermediaire', 'avance')),
  duree_min INTEGER NOT NULL,
  objectif TEXT NOT NULL,
  prevention_focus TEXT NOT NULL,
  relue_par TEXT,
  validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK (validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
  proposee_par_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
  exercises_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.program_plans (
  id BIGSERIAL PRIMARY KEY,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
  date_debut TEXT NOT NULL,
  duree_semaines INTEGER NOT NULL DEFAULT 4,
  objectif TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.scheduled_sessions (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES public.program_plans(id) ON DELETE CASCADE,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES public.sessions_library(id) ON DELETE SET NULL,
  jour_semaine INTEGER NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
  date_prevue TEXT NOT NULL,
  is_rest_day INTEGER NOT NULL DEFAULT 0,
  ajustee_par_coach INTEGER NOT NULL DEFAULT 0,
  motif_ajustement TEXT,
  date_ajustement TIMESTAMPTZ,
  completed INTEGER NOT NULL DEFAULT 0,
  ressenti_fatigue INTEGER,
  difficulte INTEGER,
  qualite_sommeil INTEGER,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.evaluations (
  id BIGSERIAL PRIMARY KEY,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('INITIALE', 'PERIODIQUE')),
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
  date TEXT NOT NULL,
  score_global INTEGER NOT NULL,
  results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coach_comments (
  id BIGSERIAL PRIMARY KEY,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  evaluation_id BIGINT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  texte TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.alerts (
  id BIGSERIAL PRIMARY KEY,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('DOULEUR', 'ABSENCE', 'RAPPEL', 'CHANGEMENT_COACH')),
  zone_douleur TEXT,
  intensite INTEGER,
  message TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  traitee INTEGER NOT NULL DEFAULT 0,
  traitee_par_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  note_traitement TEXT
);

CREATE TABLE IF NOT EXISTS public.access_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  athlete_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_traffic_logs (
  id BIGSERIAL PRIMARY KEY,
  method TEXT NOT NULL,
  path_group TEXT NOT NULL,
  full_path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_role TEXT,
  user_id BIGINT,
  ip_hash TEXT,
  bytes_out INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coach_videos (
  id BIGSERIAL PRIMARY KEY,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport_code TEXT NOT NULL CHECK (sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
  session_id BIGINT REFERENCES public.sessions_library(id) ON DELETE SET NULL,
  athlete_user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('SUPABASE_STORAGE', 'LOCAL_STORAGE', 'EXTERNAL_URL')),
  storage_path TEXT,
  external_url TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traffic_created_at ON public.system_traffic_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at ON public.rate_limit_buckets(reset_at);
CREATE INDEX IF NOT EXISTS idx_coach_docs_user ON public.coach_documents(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_videos_coach ON public.coach_videos(coach_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_videos_athlete ON public.coach_videos(athlete_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_videos_session ON public.coach_videos(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_scheduled_athlete ON public.scheduled_sessions(athlete_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_coach_statut ON public.assignments(coach_user_id, statut);
CREATE INDEX IF NOT EXISTS idx_assignments_athlete_statut ON public.assignments(athlete_user_id, statut);
CREATE INDEX IF NOT EXISTS idx_evaluations_athlete_date ON public.evaluations(athlete_user_id, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_coach_comments_eval ON public.coach_comments(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_alerts_athlete_traitee ON public.alerts(athlete_user_id, traitee);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON public.group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_athlete ON public.weight_logs(athlete_user_id, date, id);
CREATE INDEX IF NOT EXISTS idx_sessions_library_sport_status ON public.sessions_library(sport_code, validation_status);

ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS pro_card_number TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS pro_card_expiry TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS rc_pro_insurer TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS rc_pro_policy_number TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS legal_status TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS business_reg_number TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS honorability_attested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sessions_library ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL';
ALTER TABLE public.partner_requests ADD COLUMN IF NOT EXISTS pack_souhaite TEXT;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['athlete_profiles', 'groups', 'sessions_library', 'program_plans', 'evaluations', 'coach_videos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_sport_code_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (sport_code IN (''football'', ''basket'', ''handball'', ''volleyball'', ''athletisme'', ''fitness''))',
      tbl,
      tbl || '_sport_code_check'
    );
  END LOOP;
END $$;
`;

export async function initSchema(): Promise<void> {
  if (USE_POSTGRES) {
    await dbExec(POSTGRES_SCHEMA_SQL);
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      telephone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ATHLETE', 'COACH', 'ADMIN', 'MINISTRE')),
      date_naissance TEXT NOT NULL,
      langue TEXT NOT NULL DEFAULT 'fr' CHECK(langue IN ('fr', 'wo')),
      statut TEXT NOT NULL DEFAULT 'INSCRIT' CHECK(statut IN ('INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE')),
      is_minor INTEGER NOT NULL DEFAULT 0,
      parental_consent_name TEXT,
      parental_consent_phone TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      otp_code_hash TEXT,
      otp_expires_at TEXT,
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      version TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS athlete_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      taille_cm INTEGER,
      poste TEXT,
      objectif TEXT,
      eco_data_mode INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_time TEXT NOT NULL DEFAULT '18:00',
      reminder_lead_minutes INTEGER NOT NULL DEFAULT 30,
      coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE' CHECK(coach_subscription_status IN ('GRATUIT_BASE', 'ACTIF_5000')),
      coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      coach_subscribed_at TEXT,
      plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
      plan_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL'
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poids_kg REAL NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coaches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      specialite TEXT NOT NULL,
      qualification TEXT NOT NULL,
      zone TEXT NOT NULL,
      monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      athlete_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 5000,
      platform_subscription_status TEXT NOT NULL DEFAULT 'ACTIF_1000' CHECK(platform_subscription_status IN ('EN_ATTENTE', 'ACTIF_1000')),
      coach_plan TEXT NOT NULL DEFAULT 'MARKETPLACE',
      commission_pct INTEGER NOT NULL DEFAULT 20,
      athlete_payout_fcfa INTEGER NOT NULL DEFAULT 4000,
      verification_status TEXT NOT NULL DEFAULT 'VERIFIE' CHECK(verification_status IN ('EN_ATTENTE', 'VERIFIE', 'REFUSE'))
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_debut TEXT NOT NULL,
      date_fin TEXT,
      statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK(statut IN ('ACTIF', 'TERMINE'))
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ASC', 'CAMPUS', 'LIGUE')),
      zone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      captain_name TEXT NOT NULL,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness'))
    );

    CREATE TABLE IF NOT EXISTS group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      titre TEXT NOT NULL,
      indicateur TEXT NOT NULL,
      periode TEXT NOT NULL,
      target_sessions INTEGER NOT NULL,
      current_sessions INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
      titre TEXT NOT NULL,
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      duree_min INTEGER NOT NULL,
      objectif TEXT NOT NULL,
      prevention_focus TEXT NOT NULL,
      relue_par TEXT,
      validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK(validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
      proposee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
      exercises_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
      date_debut TEXT NOT NULL,
      duree_semaines INTEGER NOT NULL DEFAULT 4,
      objectif TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES program_plans(id) ON DELETE CASCADE,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES sessions_library(id) ON DELETE SET NULL,
      jour_semaine INTEGER NOT NULL CHECK(jour_semaine BETWEEN 1 AND 7),
      date_prevue TEXT NOT NULL,
      is_rest_day INTEGER NOT NULL DEFAULT 0,
      ajustee_par_coach INTEGER NOT NULL DEFAULT 0,
      motif_ajustement TEXT,
      date_ajustement TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      ressenti_fatigue INTEGER,
      difficulte INTEGER,
      qualite_sommeil INTEGER,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('INITIALE', 'PERIODIQUE')),
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
      date TEXT NOT NULL,
      score_global INTEGER NOT NULL,
      results_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      texte TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('DOULEUR', 'ABSENCE', 'RAPPEL', 'CHANGEMENT_COACH')),
      zone_douleur TEXT,
      intensite INTEGER,
      message TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      traitee INTEGER NOT NULL DEFAULT 0,
      traitee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note_traitement TEXT
    );

    CREATE TABLE IF NOT EXISTS access_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL,
      athlete_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ASC', 'CAMPUS', 'LIGUE')),
      zone TEXT NOT NULL,
      contact_nom TEXT NOT NULL,
      contact_telephone TEXT NOT NULL,
      contact_email TEXT,
      sport_principal TEXT,
      nombre_athletes_estime INTEGER,
      pack_souhaite TEXT,
      message TEXT,
      statut TEXT NOT NULL DEFAULT 'NOUVELLE' CHECK(statut IN ('NOUVELLE', 'EN_ETUDE', 'VALIDEE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coach_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      diploma_type TEXT NOT NULL,
      issuing_organism TEXT NOT NULL,
      diploma_number TEXT NOT NULL,
      issue_year INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      study_score INTEGER NOT NULL DEFAULT 0,
      study_status TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK(study_status IN ('CONFORME_PRE_ETUDE', 'A_VERIFIER', 'ANOMALIE')),
      study_report_json TEXT NOT NULL,
      admin_review_note TEXT,
      reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_traffic_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      path_group TEXT NOT NULL,
      full_path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      user_role TEXT,
      user_id INTEGER,
      ip_hash TEXT,
      bytes_out INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coach_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
      session_id INTEGER REFERENCES sessions_library(id) ON DELETE SET NULL,
      athlete_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      titre TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL CHECK(source_type IN ('SUPABASE_STORAGE', 'LOCAL_STORAGE', 'EXTERNAL_URL')),
      storage_path TEXT,
      external_url TEXT,
      mime_type TEXT,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      reset_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_traffic_created_at ON system_traffic_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at ON rate_limit_buckets(reset_at);
    CREATE INDEX IF NOT EXISTS idx_coach_docs_user ON coach_documents(coach_user_id);
    CREATE INDEX IF NOT EXISTS idx_coach_videos_coach ON coach_videos(coach_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_coach_videos_athlete ON coach_videos(athlete_user_id);
    CREATE INDEX IF NOT EXISTS idx_coach_videos_session ON coach_videos(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_scheduled_athlete ON scheduled_sessions(athlete_user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_coach_statut ON assignments(coach_user_id, statut);
    CREATE INDEX IF NOT EXISTS idx_assignments_athlete_statut ON assignments(athlete_user_id, statut);
    CREATE INDEX IF NOT EXISTS idx_evaluations_athlete_date ON evaluations(athlete_user_id, date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_coach_comments_eval ON coach_comments(evaluation_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_athlete_traitee ON alerts(athlete_user_id, traitee);
    CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON group_memberships(group_id);
    CREATE INDEX IF NOT EXISTS idx_weight_logs_athlete ON weight_logs(athlete_user_id, date, id);
    CREATE INDEX IF NOT EXISTS idx_sessions_library_sport_status ON sessions_library(sport_code, validation_status);
  `);

  // Safe idempotent column migrations for existing SQLite databases
  const userCols = await dbAll<{ name: string }>('PRAGMA table_info(users)');
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('otp_attempts')) {
    await dbExec('ALTER TABLE users ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('failed_login_attempts')) {
    await dbExec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('locked_until')) {
    await dbExec('ALTER TABLE users ADD COLUMN locked_until TEXT;');
  }

  const athCols = await dbAll<{ name: string }>('PRAGMA table_info(athlete_profiles)');
  const athColNames = new Set(athCols.map((c) => c.name));
  if (!athColNames.has('coach_subscription_status')) {
    await dbExec("ALTER TABLE athlete_profiles ADD COLUMN coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE';");
  }
  if (!athColNames.has('coach_monthly_fee_fcfa')) {
    await dbExec('ALTER TABLE athlete_profiles ADD COLUMN coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
  }
  if (!athColNames.has('coach_subscribed_at')) {
    await dbExec('ALTER TABLE athlete_profiles ADD COLUMN coach_subscribed_at TEXT;');
  }
  if (!athColNames.has('plan_tier')) {
    await dbExec("ALTER TABLE athlete_profiles ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL';");
    await dbExec("UPDATE athlete_profiles SET plan_tier = 'COACH_PRIVE', plan_fee_fcfa = 5000 WHERE coach_subscription_status = 'ACTIF_5000';");
  }
  if (!athColNames.has('plan_fee_fcfa')) {
    await dbExec('ALTER TABLE athlete_profiles ADD COLUMN plan_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
    await dbExec("UPDATE athlete_profiles SET plan_tier = 'COACH_PRIVE', plan_fee_fcfa = 5000 WHERE coach_subscription_status = 'ACTIF_5000';");
  }
  if (!athColNames.has('plan_billing_cycle')) {
    await dbExec("ALTER TABLE athlete_profiles ADD COLUMN plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL';");
  }
  if (!athColNames.has('reminder_time')) {
    await dbExec("ALTER TABLE athlete_profiles ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '18:00';");
  }
  if (!athColNames.has('reminder_lead_minutes')) {
    await dbExec('ALTER TABLE athlete_profiles ADD COLUMN reminder_lead_minutes INTEGER NOT NULL DEFAULT 30;');
  }

  const coachCols = await dbAll<{ name: string }>('PRAGMA table_info(coaches)');
  const coachColNames = new Set(coachCols.map((c) => c.name));
  if (!coachColNames.has('monthly_fee_fcfa')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
  }
  if (!coachColNames.has('athlete_monthly_fee_fcfa')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN athlete_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 5000;');
  }
  if (!coachColNames.has('platform_subscription_status')) {
    await dbExec("ALTER TABLE coaches ADD COLUMN platform_subscription_status TEXT NOT NULL DEFAULT 'ACTIF_1000';");
  }
  if (!coachColNames.has('coach_plan')) {
    await dbExec("ALTER TABLE coaches ADD COLUMN coach_plan TEXT NOT NULL DEFAULT 'MARKETPLACE';");
    await dbExec("UPDATE coaches SET coach_plan = 'MARKETPLACE', monthly_fee_fcfa = 0, commission_pct = 20, athlete_payout_fcfa = 4000;");
  }
  if (!coachColNames.has('commission_pct')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN commission_pct INTEGER NOT NULL DEFAULT 20;');
  }
  if (!coachColNames.has('athlete_payout_fcfa')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN athlete_payout_fcfa INTEGER NOT NULL DEFAULT 4000;');
  }
  if (!coachColNames.has('verification_status')) {
    await dbExec("ALTER TABLE coaches ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIE';");
  }
  if (!coachColNames.has('rejection_reason')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN rejection_reason TEXT;');
  }
  if (!coachColNames.has('pro_card_number')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN pro_card_number TEXT;');
  }
  if (!coachColNames.has('pro_card_expiry')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN pro_card_expiry TEXT;');
  }
  if (!coachColNames.has('rc_pro_insurer')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN rc_pro_insurer TEXT;');
  }
  if (!coachColNames.has('rc_pro_policy_number')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN rc_pro_policy_number TEXT;');
  }
  if (!coachColNames.has('legal_status')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN legal_status TEXT;');
  }
  if (!coachColNames.has('business_reg_number')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN business_reg_number TEXT;');
  }
  if (!coachColNames.has('honorability_attested')) {
    await dbExec('ALTER TABLE coaches ADD COLUMN honorability_attested INTEGER NOT NULL DEFAULT 0;');
  }

  const sessCols = await dbAll<{ name: string }>('PRAGMA table_info(sessions_library)');
  const sessColNames = new Set(sessCols.map((c) => c.name));
  if (!sessColNames.has('access_tier')) {
    await dbExec("ALTER TABLE sessions_library ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL';");
  }

  const prCols = await dbAll<{ name: string }>('PRAGMA table_info(partner_requests)');
  const prColNames = new Set(prCols.map((c) => c.name));
  if (!prColNames.has('pack_souhaite')) {
    await dbExec('ALTER TABLE partner_requests ADD COLUMN pack_souhaite TEXT;');
  }

  // Safe idempotent role CHECK constraint migration to include MINISTRE
  const usersSqlRow = await dbGet<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  );
  if (usersSqlRow && !usersSqlRow.sql.includes("'MINISTRE'")) {
    await dbPragma('foreign_keys = OFF');
    await dbTransaction(async (tx) => {
      await tx.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          prenom TEXT NOT NULL,
          telephone TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ATHLETE', 'COACH', 'ADMIN', 'MINISTRE')),
          date_naissance TEXT NOT NULL,
          langue TEXT NOT NULL DEFAULT 'fr' CHECK(langue IN ('fr', 'wo')),
          statut TEXT NOT NULL DEFAULT 'INSCRIT' CHECK(statut IN ('INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE')),
          is_minor INTEGER NOT NULL DEFAULT 0,
          parental_consent_name TEXT,
          parental_consent_phone TEXT,
          verified INTEGER NOT NULL DEFAULT 0,
          otp_code_hash TEXT,
          otp_expires_at TEXT,
          otp_attempts INTEGER NOT NULL DEFAULT 0,
          failed_login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO users_new (
          id, nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
          statut, is_minor, parental_consent_name, parental_consent_phone, verified,
          otp_code_hash, otp_expires_at, otp_attempts, failed_login_attempts, locked_until, created_at
        )
        SELECT
          id, nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
          statut, is_minor, parental_consent_name, parental_consent_phone, verified,
          otp_code_hash, otp_expires_at, otp_attempts, failed_login_attempts, locked_until, created_at
        FROM users;

        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    await dbPragma('foreign_keys = ON');
  }

  // Safe idempotent sport_code CHECK constraint migration to include volleyball, athletisme and fitness
  const checkSportsTable = async (tableName: string): Promise<boolean> => {
    const row = await dbGet<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      tableName
    );
    return Boolean(row && (!row.sql.includes("'volleyball'") || !row.sql.includes("'athletisme'") || !row.sql.includes("'fitness'")));
  };

  if (
    (await checkSportsTable('athlete_profiles')) ||
    (await checkSportsTable('groups')) ||
    (await checkSportsTable('sessions_library')) ||
    (await checkSportsTable('program_plans')) ||
    (await checkSportsTable('evaluations')) ||
    (await checkSportsTable('coach_videos'))
  ) {
    await dbPragma('foreign_keys = OFF');
    await dbTransaction(async (tx) => {
      if (await checkSportsTable('athlete_profiles')) {
        await tx.exec(`
          CREATE TABLE athlete_profiles_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
            niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
            taille_cm INTEGER,
            poste TEXT,
            objectif TEXT,
            eco_data_mode INTEGER NOT NULL DEFAULT 0,
            notifications_enabled INTEGER NOT NULL DEFAULT 1,
            reminder_time TEXT NOT NULL DEFAULT '18:00',
            reminder_lead_minutes INTEGER NOT NULL DEFAULT 30,
            coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE' CHECK(coach_subscription_status IN ('GRATUIT_BASE', 'ACTIF_5000')),
            coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
            coach_subscribed_at TEXT,
            plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
            plan_fee_fcfa INTEGER NOT NULL DEFAULT 0,
            plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL'
          );
          INSERT INTO athlete_profiles_new (
            id, user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode,
            notifications_enabled, reminder_time, reminder_lead_minutes,
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
          )
          SELECT
            id, user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode,
            notifications_enabled, COALESCE(reminder_time, '18:00'), COALESCE(reminder_lead_minutes, 30),
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
          FROM athlete_profiles;
          DROP TABLE athlete_profiles;
          ALTER TABLE athlete_profiles_new RENAME TO athlete_profiles;
        `);
      }

      if (await checkSportsTable('groups')) {
        await tx.exec(`
          CREATE TABLE groups_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
            captain_name TEXT NOT NULL,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness'))
          );
          INSERT INTO groups_new (id, nom, partner_id, captain_name, sport_code)
          SELECT id, nom, partner_id, captain_name, sport_code FROM groups;
          DROP TABLE groups;
          ALTER TABLE groups_new RENAME TO groups;
        `);
      }

      if (await checkSportsTable('sessions_library')) {
        await tx.exec(`
          CREATE TABLE sessions_library_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
            titre TEXT NOT NULL,
            niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
            duree_min INTEGER NOT NULL,
            objectif TEXT NOT NULL,
            prevention_focus TEXT NOT NULL,
            relue_par TEXT,
            validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK(validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
            proposee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
            exercises_json TEXT NOT NULL
          );
          INSERT INTO sessions_library_new (
            id, sport_code, titre, niveau, duree_min, objectif, prevention_focus,
            relue_par, validation_status, proposee_par_user_id, access_tier, exercises_json
          )
          SELECT
            id, sport_code, titre, niveau, duree_min, objectif, prevention_focus,
            relue_par, validation_status, proposee_par_user_id, COALESCE(access_tier, 'ESSENTIEL'), exercises_json
          FROM sessions_library;
          DROP TABLE sessions_library;
          ALTER TABLE sessions_library_new RENAME TO sessions_library;
        `);
      }

      if (await checkSportsTable('program_plans')) {
        await tx.exec(`
          CREATE TABLE program_plans_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            coach_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
            date_debut TEXT NOT NULL,
            duree_semaines INTEGER NOT NULL DEFAULT 4,
            objectif TEXT NOT NULL,
            notes TEXT
          );
          INSERT INTO program_plans_new (id, athlete_user_id, coach_user_id, sport_code, date_debut, duree_semaines, objectif, notes)
          SELECT id, athlete_user_id, coach_user_id, sport_code, date_debut, duree_semaines, objectif, notes FROM program_plans;
          DROP TABLE program_plans;
          ALTER TABLE program_plans_new RENAME TO program_plans;
        `);
      }

      if (await checkSportsTable('evaluations')) {
        await tx.exec(`
          CREATE TABLE evaluations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK(type IN ('INITIALE', 'PERIODIQUE')),
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
            date TEXT NOT NULL,
            score_global INTEGER NOT NULL,
            results_json TEXT NOT NULL
          );
          INSERT INTO evaluations_new (id, athlete_user_id, type, sport_code, date, score_global, results_json)
          SELECT id, athlete_user_id, type, sport_code, date, score_global, results_json FROM evaluations;
          DROP TABLE evaluations;
          ALTER TABLE evaluations_new RENAME TO evaluations;
        `);
      }

      if (await checkSportsTable('coach_videos')) {
        await tx.exec(`
          CREATE TABLE coach_videos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness')),
            session_id INTEGER REFERENCES sessions_library(id) ON DELETE SET NULL,
            athlete_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            titre TEXT NOT NULL,
            description TEXT,
            source_type TEXT NOT NULL CHECK(source_type IN ('SUPABASE_STORAGE', 'LOCAL_STORAGE', 'EXTERNAL_URL')),
            storage_path TEXT,
            external_url TEXT,
            mime_type TEXT,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO coach_videos_new (
            id, coach_user_id, sport_code, session_id, athlete_user_id, titre, description,
            source_type, storage_path, external_url, mime_type, file_size_bytes, created_at
          )
          SELECT
            id, coach_user_id, sport_code, session_id, athlete_user_id, titre, description,
            source_type, storage_path, external_url, mime_type, file_size_bytes, created_at
          FROM coach_videos;
          DROP TABLE coach_videos;
          ALTER TABLE coach_videos_new RENAME TO coach_videos;
        `);
      }
    });
    await dbPragma('foreign_keys = ON');
  }
}

export async function logAccess(
  actorUserId: number | null,
  actorRole: string,
  athleteUserId: number | null,
  action: string,
  resource: string,
  executor: DbExecutor = getDefaultDbExecutor()
): Promise<void> {
  await executor.run(
    `INSERT INTO access_audit_logs (actor_user_id, actor_role, athlete_user_id, action, resource)
     VALUES (?, ?, ?, ?, ?)`,
    actorUserId,
    actorRole,
    athleteUserId,
    action,
    resource
  );
}
