-- Correction des 2 tables de l'ancien prototype Coach/Ministre qui bloquaient CREATE TABLE IF NOT EXISTS
-- À exécuter une fois dans Supabase Dashboard -> SQL Editor si la base contient d'anciennes tables du prototype Coach/Ministre

DROP TABLE IF EXISTS public.athlete_profiles CASCADE;
CREATE TABLE public.athlete_profiles (
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
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public.consents CASCADE;
CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('health_data_processing', 'training_trends_share', 'referral_transfer')),
  text_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted', 'refused')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
