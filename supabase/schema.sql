-- Terrain+ — Schéma PostgreSQL complet pour Supabase
-- À exécuter dans : Supabase Dashboard -> SQL Editor -> New Query

-- 1. Utilisateurs & sécurité d'authentification
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

-- 2. Profils athlètes & suivi poids
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

-- 3. Profils coachs & conformité réglementaire (Carte Pro, RC Pro, Statut, Honorabilité)
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

-- 4. Partenaires ASC, Campus, Ligues & défis collectifs
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

-- 5. Bibliothèque de séances, programmes, évaluations & prévention
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

-- 6. Audit des accès & télémétrie système
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

CREATE TABLE IF NOT EXISTS public.coach_messages (
  id BIGSERIAL PRIMARY KEY,
  athlete_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('ATHLETE', 'COACH')),
  body TEXT NOT NULL,
  read_by_athlete INTEGER NOT NULL DEFAULT 0,
  read_by_coach INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  coach_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('ATHLETE_PLAN', 'COACH_PRO_LICENSE', 'COACH_PRIVATE_FEE', 'AUTRE')),
  label TEXT NOT NULL,
  amount_fcfa INTEGER NOT NULL,
  platform_share_fcfa INTEGER NOT NULL DEFAULT 0,
  coach_share_fcfa INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'WAVE' CHECK (payment_method IN ('WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'CARTE', 'ESPECES', 'MANUEL')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'PAYE' CHECK (status IN ('PAYE', 'EN_ATTENTE', 'ECHOUE', 'REMBOURSE')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coach_payouts (
  id BIGSERIAL PRIMARY KEY,
  coach_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  active_athletes_count INTEGER NOT NULL DEFAULT 0,
  gross_amount_fcfa INTEGER NOT NULL,
  commission_fcfa INTEGER NOT NULL DEFAULT 0,
  net_payout_fcfa INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'WAVE' CHECK (payment_method IN ('WAVE', 'ORANGE_MONEY', 'VIREMENT', 'ESPECES')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'VERSE' CHECK (status IN ('EN_ATTENTE', 'VERSE')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(coach_user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_traffic_created_at ON public.system_traffic_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at ON public.rate_limit_buckets(reset_at);
CREATE INDEX IF NOT EXISTS idx_coach_docs_user ON public.coach_documents(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_videos_coach ON public.coach_videos(coach_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_videos_athlete ON public.coach_videos(athlete_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_videos_session ON public.coach_videos(session_id);
CREATE INDEX IF NOT EXISTS idx_coach_messages_thread ON public.coach_messages(athlete_user_id, coach_user_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON public.payment_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_payouts_period ON public.coach_payouts(period_month DESC, coach_user_id);
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

-- 7. Sécurité Row Level Security (RLS) : bloque l'accès direct via la clé publique anon
-- Seul le backend serveur (connexion Postgres / service_role) manipule ces tables.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_traffic_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_payouts ENABLE ROW LEVEL SECURITY;

-- 8. Buckets Supabase Storage privés (diplômes coachs & vidéos de séances <= 15 Mo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-diplomas',
  'coach-diplomas',
  FALSE,
  3145728,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-videos',
  'coach-videos',
  FALSE,
  15728640,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- 9. Migration idempotente pour bases existantes (ajout du sport 'fitness')
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
