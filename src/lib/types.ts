export type UserRole = 'athlete' | 'doctor' | 'admin';

export type AccountStatus = 'active' | 'suspended';

export type VerificationStatus =
  | 'to_complete'
  | 'pending'
  | 'more_info_requested'
  | 'verified'
  | 'rejected'
  | 'suspended';

export type CaseStatus =
  | 'awaiting_payment'
  | 'open'
  | 'in_discussion'
  | 'appointment_confirmed'
  | 'referral_proposed'
  | 'transferred'
  | 'completed'
  | 'cancelled';

export type ConsultationMode = 'chat' | 'video' | 'physical';

export type MedicalGoal =
  | 'regular_followup'
  | 'injury_advice'
  | 'prevention'
  | 'return_to_sport';

export type SessionType = 'training' | 'match' | 'conditioning' | 'recovery' | 'other';

export type PreventionCategory =
  | 'warmup'
  | 'recovery'
  | 'mobility'
  | 'hydration'
  | 'basketball'
  | 'general';

export type ForumCategory =
  | 'clinical_case_anon'
  | 'protocols'
  | 'prevention'
  | 'platform'
  | 'specialty';

export type ReferralType = 'handoff_transfer' | 'post_consult_referral';

export interface UserProfile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  birth_date: string | null;
  status: AccountStatus;
  suspension_reason: string | null;
  phone_verified: boolean;
  onboarding_completed: boolean;
  accepted_terms_at: string;
  created_at: string;
  updated_at: string;
}

export interface Specialty {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

export interface AthleteProfile {
  user_id: string;
  sports_json: string[];
  primary_sport: string;
  practice_level: string;
  weekly_frequency: string;
  height_cm: number | null;
  weight_kg: number | null;
  dominant_side: string | null;
  medical_goal: MedicalGoal;
  followup_frequency: string;
  allergies_conditions?: string;
  prior_injuries?: string;
  updated_at: string;
}

export interface TrainingLog {
  id: string;
  athlete_id: string;
  session_date: string;
  sport: string;
  session_type: SessionType;
  duration_minutes: number;
  rpe_intensity: number;
  fatigue_score: number;
  sleep_score: number;
  recovery_score: number;
  has_discomfort: boolean;
  discomfort_level: number;
  body_part: string | null;
  performance_stats_json: Record<string, string | number>;
  notes?: string;
  created_at: string;
}

export interface PreventionSignal {
  id: string;
  severity: 'info' | 'attention';
  title: string;
  message: string;
  disclaimer: string;
  recommendedCategory: PreventionCategory;
  suggestedBodyPart?: string | null;
}

export interface PreventionArticle {
  id: string;
  slug: string;
  category: PreventionCategory;
  title: string;
  summary: string;
  content: string;
  reviewer_name: string;
  is_published: boolean;
  validated_at: string;
}

export interface ReturnToSportStep {
  id: string;
  plan_id: string;
  step_order: number;
  label: string;
  criteria: string;
  athlete_done_at: string | null;
  athlete_note?: string;
  doctor_validated_at: string | null;
  doctor_note?: string;
}

export interface ReturnToSportPlan {
  id: string;
  athlete_id: string;
  case_id: string | null;
  doctor_id: string;
  doctor_name?: string;
  title: string;
  status: 'active' | 'medical_clearance_granted' | 'archived';
  cleared_by_doctor_id: string | null;
  cleared_at: string | null;
  steps: ReturnToSportStep[];
  created_at: string;
}

export interface DoctorPublicCard {
  id: string;
  public_name: string;
  specialty_id: string | null;
  specialty_name: string;
  other_specialties: string[];
  city: string;
  facility_name: string;
  languages: string[];
  bio: string;
  supports_video: boolean;
  supports_physical: boolean;
  consultation_fee_fcfa: number;
  verification_status: VerificationStatus;
  available_slots_count: number;
  next_slot_at: string | null;
  reviews_count: number;
  average_rating: number | null;
}
