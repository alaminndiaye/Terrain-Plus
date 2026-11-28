-- Terrain+ : Schéma PostgreSQL complet pour Supabase Cloud
-- Architecture : Sportifs (18+) <-> Médecins vérifiés <-> Administrateur
-- Défense en profondeur : RLS activée sur 100 % des tables + RPC atomiques + chiffrement applicatif AES-256-GCM

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Comptes utilisateurs (liés à Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('athlete', 'doctor', 'admin')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text UNIQUE,
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT 'Dakar',
  birth_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  suspension_reason text,
  phone_verified boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  accepted_terms_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_athlete_adult CHECK (
    role <> 'athlete'
    OR (birth_date IS NOT NULL AND birth_date <= (CURRENT_DATE - INTERVAL '18 years'))
  )
);

CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup_otp', 'password_reset')),
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  hits int NOT NULL DEFAULT 1,
  window_reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Référentiel des spécialités médicales (géré par Admin)
CREATE TABLE IF NOT EXISTS public.specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'stethoscope',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Profil sportif privé (1ère connexion / onboarding) & Dossier médical longitudinal
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  sports_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_sport text NOT NULL DEFAULT 'football',
  practice_level text NOT NULL DEFAULT 'loisir',
  weekly_frequency text NOT NULL DEFAULT '',
  height_cm int,
  weight_kg numeric(5,2),
  dominant_side text,
  medical_goal text NOT NULL DEFAULT 'regular_followup'
    CHECK (medical_goal IN ('regular_followup', 'injury_advice', 'prevention', 'return_to_sport')),
  followup_frequency text NOT NULL DEFAULT 'monthly',
  allergies_conditions_enc text,
  prior_injuries_enc text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.athlete_medical_records (
  athlete_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_updated_by_doctor_id uuid REFERENCES public.profiles(id),
  clinical_summary_enc text NOT NULL,
  contraindications_enc text,
  fitness_guidance_enc text,
  next_followup_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.athlete_medical_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id uuid NOT NULL UNIQUE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  entry_summary_enc text NOT NULL,
  recommendations_enc text NOT NULL,
  fitness_status text NOT NULL DEFAULT 'suivi_en_cours',
  next_followup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Rubrique « Suivi & prévention » (journal manuel V1, fiches validées, retour après blessure)
CREATE TABLE IF NOT EXISTS public.training_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  sport text NOT NULL,
  session_type text NOT NULL CHECK (session_type IN ('training', 'match', 'conditioning', 'recovery', 'other')),
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  rpe_intensity int NOT NULL CHECK (rpe_intensity BETWEEN 1 AND 10),
  fatigue_score int NOT NULL CHECK (fatigue_score BETWEEN 1 AND 5),
  sleep_score int NOT NULL CHECK (sleep_score BETWEEN 1 AND 5),
  recovery_score int NOT NULL CHECK (recovery_score BETWEEN 1 AND 5),
  has_discomfort boolean NOT NULL DEFAULT false,
  discomfort_level int NOT NULL DEFAULT 0 CHECK (discomfort_level BETWEEN 0 AND 10),
  body_part text,
  performance_stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes_enc text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prevention_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('warmup', 'recovery', 'mobility', 'hydration', 'basketball', 'general')),
  title text NOT NULL,
  summary text NOT NULL,
  content text NOT NULL,
  reviewer_name text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  validated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_to_sport_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id uuid,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'medical_clearance_granted', 'archived')),
  cleared_by_doctor_id uuid REFERENCES public.profiles(id),
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_to_sport_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.return_to_sport_plans(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  label text NOT NULL,
  criteria text NOT NULL DEFAULT '',
  athlete_done_at timestamptz,
  athlete_note_enc text,
  doctor_validated_at timestamptz,
  doctor_note_enc text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Médecins, justificatifs privés & créneaux
CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES public.specialties(id),
  order_number text NOT NULL DEFAULT '',
  public_name text NOT NULL,
  other_specialties_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  city text NOT NULL DEFAULT 'Dakar',
  facility_name text NOT NULL DEFAULT '',
  facility_address text,
  languages_json jsonb NOT NULL DEFAULT '["Français"]'::jsonb,
  bio text NOT NULL DEFAULT '',
  supports_video boolean NOT NULL DEFAULT true,
  supports_physical boolean NOT NULL DEFAULT true,
  consultation_fee_fcfa int NOT NULL DEFAULT 10000 CHECK (consultation_fee_fcfa = 10000),
  verification_status text NOT NULL DEFAULT 'to_complete'
    CHECK (verification_status IN ('to_complete', 'pending', 'more_info_requested', 'verified', 'rejected', 'suspended')),
  verification_reason text,
  submitted_at timestamptz,
  sla_due_at timestamptz,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('professional_card', 'facility_proof', 'diploma', 'complement')),
  original_name_safe text NOT NULL,
  mime_type text NOT NULL,
  byte_size int NOT NULL,
  storage_path text NOT NULL UNIQUE,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_mode text NOT NULL DEFAULT 'both' CHECK (slot_mode IN ('video', 'physical', 'both')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location_label text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked', 'cancelled')),
  held_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Dossiers médicaux / consultations (10 000 FCFA TTC = 1 consultation), messages & médias
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  specialty_id uuid REFERENCES public.specialties(id),
  mode text NOT NULL DEFAULT 'video' CHECK (mode IN ('chat', 'video', 'physical')),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'open', 'in_discussion', 'appointment_confirmed', 'referral_proposed', 'transferred', 'completed', 'cancelled')),
  body_part text,
  sport_context text,
  initial_reason_enc text NOT NULL,
  head_trauma_flagged boolean NOT NULL DEFAULT false,
  share_training_trends boolean NOT NULL DEFAULT false,
  payment_unlocked boolean NOT NULL DEFAULT false,
  medical_record_updated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  sender_role text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'media', 'appointment_proposal', 'system')),
  body_enc text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.case_messages(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.profiles(id),
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'document')),
  original_name_safe text NOT NULL,
  mime_type text NOT NULL,
  byte_size int NOT NULL,
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Rendez-vous (Visio / Cabinet) & Sessions Visio WebRTC
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.availability_slots(id),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  appointment_type text NOT NULL CHECK (appointment_type IN ('video', 'physical')),
  proposed_by uuid NOT NULL REFERENCES public.profiles(id),
  proposal_status text NOT NULL DEFAULT 'proposed'
    CHECK (proposal_status IN ('proposed', 'confirmed', 'completed', 'declined', 'cancelled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location_label text NOT NULL,
  video_room_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_confirmed_slot
  ON public.appointments(slot_id)
  WHERE slot_id IS NOT NULL AND proposal_status IN ('confirmed', 'completed');

CREATE TABLE IF NOT EXISTS public.video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id),
  room_token text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'live', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Orientations / Transferts, Paiements (10 000 FCFA TTC) & Reversements
CREATE TABLE IF NOT EXISTS public.doctor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  total_net_fcfa int NOT NULL,
  cases_count int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payout_reference text,
  processed_by uuid REFERENCES public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  from_doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  to_doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  referral_type text NOT NULL CHECK (referral_type IN ('handoff_transfer', 'post_consult_referral')),
  reason_enc text NOT NULL,
  shared_fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent_text_version text NOT NULL DEFAULT 'referral-consent-v1',
  status text NOT NULL DEFAULT 'pending_consent' CHECK (status IN ('pending_consent', 'accepted', 'refused')),
  target_case_id uuid REFERENCES public.cases(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  original_doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  transfer_referral_id uuid REFERENCES public.referrals(id),
  gross_amount_fcfa int NOT NULL DEFAULT 10000 CHECK (gross_amount_fcfa = 10000),
  platform_commission_fcfa int NOT NULL DEFAULT 1000 CHECK (platform_commission_fcfa = 1000),
  doctor_net_fcfa int NOT NULL DEFAULT 9000 CHECK (doctor_net_fcfa = 9000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'refund_requested', 'refunded')),
  provider text NOT NULL DEFAULT 'sandbox',
  payment_channel text NOT NULL DEFAULT 'wave_sandbox',
  provider_event_id text UNIQUE,
  payout_id uuid REFERENCES public.doctor_payouts(id),
  refund_note text,
  paid_at timestamptz,
  transferred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Avis, Signalements, Consentements & Droits
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL,
  moderation_status text NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'hidden_flagged', 'removed')),
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_hidden', 'resolved_kept', 'resolved_removed')),
  admin_note text,
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('health_data_processing', 'training_trends_share', 'referral_transfer')),
  text_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted', 'refused')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('access', 'correction', 'deletion')),
  note text NOT NULL,
  status text NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Communauté Médecins vérifiés (Forum anonymisé & Chat privé 1-à-1)
CREATE TABLE IF NOT EXISTS public.doctor_forum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  specialty_id uuid REFERENCES public.specialties(id),
  category text NOT NULL CHECK (category IN ('clinical_case_anon', 'protocols', 'prevention', 'platform', 'specialty')),
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  moderation_status text NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'hidden_flagged', 'removed')),
  replies_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.doctor_forum_topics(id) ON DELETE CASCADE,
  author_doctor_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  moderation_status text NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'hidden_flagged', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_forum_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('topic', 'post')),
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_hidden', 'resolved_kept', 'resolved_removed')),
  admin_note text,
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_a_id uuid NOT NULL REFERENCES public.profiles(id),
  doctor_b_id uuid NOT NULL REFERENCES public.profiles(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dm_order CHECK (doctor_a_id < doctor_b_id),
  CONSTRAINT uq_dm_pair UNIQUE (doctor_a_id, doctor_b_id)
);

CREATE TABLE IF NOT EXISTS public.doctor_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.doctor_dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  body_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Audit immuable, Accès exceptionnel support (15 min) & Notifications neutres
CREATE TABLE IF NOT EXISTS public.exceptional_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('push', 'sms', 'email')),
  title text NOT NULL,
  body text NOT NULL,
  target_ref text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_cases_athlete ON public.cases(athlete_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_doctor ON public.cases(doctor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_messages_case ON public.case_messages(case_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_training_logs_athlete ON public.training_logs(athlete_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON public.payments(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_forum_topics_activity ON public.doctor_forum_topics(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON public.doctor_dm_messages(thread_id, created_at ASC);

-- 12. Activation RLS sur toutes les tables (accès par défaut verrouillé, API Next.js via service_role + garde métier)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'otp_verifications', 'rate_limits', 'specialties', 'athlete_profiles',
    'athlete_medical_records', 'athlete_medical_entries', 'training_logs', 'prevention_articles',
    'return_to_sport_plans', 'return_to_sport_steps', 'doctor_profiles', 'doctor_evidence',
    'availability_slots', 'cases', 'case_messages', 'case_attachments', 'appointments',
    'video_sessions', 'doctor_payouts', 'referrals', 'payments', 'reviews', 'review_reports',
    'consents', 'data_requests', 'doctor_forum_topics', 'doctor_forum_posts',
    'doctor_forum_reports', 'doctor_dm_threads', 'doctor_dm_messages',
    'exceptional_access_grants', 'audit_logs', 'notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Politiques de lecture directe autorisées (second niveau de défense)
CREATE POLICY "Public reads active specialties" ON public.specialties
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public reads published prevention" ON public.prevention_articles
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public reads verified doctors" ON public.doctor_profiles
  FOR SELECT USING (verification_status = 'verified');

CREATE POLICY "Public reads published reviews" ON public.reviews
  FOR SELECT USING (moderation_status = 'published');

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Case participants read case" ON public.cases
  FOR SELECT USING (auth.uid() = athlete_id OR auth.uid() = doctor_id);

CREATE POLICY "Verified doctors read forum topics" ON public.doctor_forum_topics
  FOR SELECT USING (
    moderation_status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid() AND dp.verification_status = 'verified'
    )
  );

-- 13. Buckets Supabase Storage strictement privés
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-evidence',
  'doctor-evidence',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-media',
  'case-media',
  false,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- 14. Fonctions RPC transactionnelles ACID
CREATE OR REPLACE FUNCTION public.rpc_consume_rate_limit(
  p_key text,
  p_max_hits int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.rate_limits WHERE key = p_key FOR UPDATE;
  IF NOT FOUND OR v_row.window_reset_at <= v_now THEN
    INSERT INTO public.rate_limits (key, hits, window_reset_at, updated_at)
    VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
    ON CONFLICT (key) DO UPDATE
      SET hits = 1,
          window_reset_at = v_now + make_interval(secs => p_window_seconds),
          updated_at = v_now;
    RETURN true;
  END IF;

  IF v_row.hits >= p_max_hits THEN
    RETURN false;
  END IF;

  UPDATE public.rate_limits
    SET hits = hits + 1, updated_at = v_now
    WHERE key = p_key;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_confirm_payment_and_unlock_case(
  p_payment_id uuid,
  p_event_id text,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE provider_event_id = p_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object('idempotent_replay', true, 'payment_id', v_pay.id, 'status', v_pay.status);
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  IF v_pay.status = 'succeeded' THEN
    RETURN jsonb_build_object('idempotent_replay', true, 'payment_id', v_pay.id, 'status', v_pay.status);
  END IF;

  IF p_outcome = 'succeeded' THEN
    UPDATE public.payments
      SET status = 'succeeded', provider_event_id = p_event_id, paid_at = v_now, updated_at = v_now
      WHERE id = v_pay.id;
    UPDATE public.cases
      SET payment_unlocked = true,
          status = CASE WHEN status = 'awaiting_payment' THEN 'open' ELSE status END,
          updated_at = v_now
      WHERE id = v_pay.case_id;
    RETURN jsonb_build_object('idempotent_replay', false, 'payment_id', v_pay.id, 'status', 'succeeded');
  ELSE
    UPDATE public.payments
      SET status = p_outcome, provider_event_id = p_event_id, updated_at = v_now
      WHERE id = v_pay.id;
    RETURN jsonb_build_object('idempotent_replay', false, 'payment_id', v_pay.id, 'status', p_outcome);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_accept_handoff_transfer(
  p_referral_id uuid,
  p_athlete_id uuid,
  p_new_case_ref text,
  p_new_summary_enc text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ref public.referrals%ROWTYPE;
  v_src public.cases%ROWTYPE;
  v_new_case_id uuid := gen_random_uuid();
  v_completed_appts int;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND OR v_ref.status <> 'pending_consent' THEN
    RAISE EXCEPTION 'REFERRAL_INVALID_OR_DECIDED';
  END IF;

  SELECT * INTO v_src FROM public.cases WHERE id = v_ref.source_case_id FOR UPDATE;
  IF NOT FOUND OR v_src.athlete_id <> p_athlete_id THEN
    RAISE EXCEPTION 'FORBIDDEN_CASE_ACCESS';
  END IF;

  IF v_ref.referral_type = 'handoff_transfer' THEN
    SELECT COUNT(*) INTO v_completed_appts
      FROM public.appointments
      WHERE case_id = v_src.id AND proposal_status = 'completed';
    IF v_src.medical_record_updated OR v_completed_appts > 0 THEN
      RAISE EXCEPTION 'CONSULTATION_ALREADY_PERFORMED';
    END IF;
  END IF;

  INSERT INTO public.cases (
    id, reference, athlete_id, doctor_id, specialty_id, mode, status,
    body_part, sport_context, initial_reason_enc, head_trauma_flagged,
    share_training_trends, payment_unlocked, created_at, updated_at
  )
  SELECT
    v_new_case_id, p_new_case_ref, v_src.athlete_id, v_ref.to_doctor_id, dp.specialty_id,
    v_src.mode, 'open', v_src.body_part, v_src.sport_context, p_new_summary_enc,
    v_src.head_trauma_flagged, v_src.share_training_trends,
    CASE WHEN v_ref.referral_type = 'handoff_transfer' THEN true ELSE false END,
    v_now, v_now
  FROM public.doctor_profiles dp
  WHERE dp.user_id = v_ref.to_doctor_id;

  IF v_ref.referral_type = 'handoff_transfer' THEN
    UPDATE public.cases SET status = 'transferred', updated_at = v_now WHERE id = v_src.id;
    UPDATE public.payments
      SET doctor_id = v_ref.to_doctor_id,
          case_id = v_new_case_id,
          transfer_referral_id = v_ref.id,
          transferred_at = v_now,
          updated_at = v_now
      WHERE case_id = v_src.id AND status = 'succeeded';
  ELSE
    UPDATE public.cases SET status = 'in_discussion', updated_at = v_now WHERE id = v_src.id;
  END IF;

  UPDATE public.referrals
    SET status = 'accepted', target_case_id = v_new_case_id, decided_at = v_now
    WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'target_case_id', v_new_case_id,
    'referral_type', v_ref.referral_type,
    'payment_reallocated', (v_ref.referral_type = 'handoff_transfer')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_complete_case_with_record(
  p_case_id uuid,
  p_doctor_id uuid,
  p_entry_summary_enc text,
  p_recommendations_enc text,
  p_clinical_summary_enc text,
  p_contraindications_enc text,
  p_fitness_guidance_enc text,
  p_fitness_status text,
  p_next_followup_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_case public.cases%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.doctor_id <> p_doctor_id THEN
    RAISE EXCEPTION 'FORBIDDEN_CASE_ACCESS';
  END IF;
  IF NOT v_case.payment_unlocked THEN
    RAISE EXCEPTION 'CASE_NOT_PAID';
  END IF;
  IF v_case.status IN ('completed', 'transferred', 'cancelled') THEN
    RAISE EXCEPTION 'CASE_ALREADY_CLOSED';
  END IF;

  INSERT INTO public.athlete_medical_entries (
    athlete_id, case_id, doctor_id, entry_summary_enc, recommendations_enc,
    fitness_status, next_followup_at, created_at
  )
  VALUES (
    v_case.athlete_id, v_case.id, p_doctor_id, p_entry_summary_enc, p_recommendations_enc,
    p_fitness_status, p_next_followup_at, v_now
  )
  ON CONFLICT (case_id) DO UPDATE SET
    entry_summary_enc = EXCLUDED.entry_summary_enc,
    recommendations_enc = EXCLUDED.recommendations_enc,
    fitness_status = EXCLUDED.fitness_status,
    next_followup_at = EXCLUDED.next_followup_at;

  INSERT INTO public.athlete_medical_records (
    athlete_id, last_updated_by_doctor_id, clinical_summary_enc,
    contraindications_enc, fitness_guidance_enc, next_followup_at, updated_at
  )
  VALUES (
    v_case.athlete_id, p_doctor_id, p_clinical_summary_enc,
    p_contraindications_enc, p_fitness_guidance_enc, p_next_followup_at, v_now
  )
  ON CONFLICT (athlete_id) DO UPDATE SET
    last_updated_by_doctor_id = EXCLUDED.last_updated_by_doctor_id,
    clinical_summary_enc = EXCLUDED.clinical_summary_enc,
    contraindications_enc = EXCLUDED.contraindications_enc,
    fitness_guidance_enc = EXCLUDED.fitness_guidance_enc,
    next_followup_at = EXCLUDED.next_followup_at,
    updated_at = v_now;

  UPDATE public.cases
    SET status = 'completed',
        medical_record_updated = true,
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_case.id;

  UPDATE public.appointments
    SET proposal_status = 'completed', updated_at = v_now
    WHERE case_id = v_case.id AND proposal_status = 'confirmed';

  RETURN jsonb_build_object('status', 'completed', 'completed_at', v_now);
END;
$$;
