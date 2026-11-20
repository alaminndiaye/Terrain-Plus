export type UserRole = 'ATHLETE' | 'COACH' | 'ADMIN' | 'MINISTRE';

export type SportCode = 'football' | 'basket' | 'handball' | 'volleyball' | 'athletisme';

export type AthleteLevel = 'debutant' | 'intermediaire' | 'avance';

export type AthleteStatus = 'INSCRIT' | 'ACTIF' | 'SUIVI_ACTIF' | 'EN_PAUSE' | 'CLOTURE';

export type ValidationStatus = 'VALIDEE' | 'EN_RELECTURE' | 'BROUILLON';

export type AlertType = 'DOULEUR' | 'ABSENCE' | 'RAPPEL' | 'CHANGEMENT_COACH';

export type TestRating = 'Faible' | 'Moyen' | 'Bon pour le niveau';

export type AthletePlanTier = 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE';

export type CoachPlanType = 'MARKETPLACE' | 'COACH_PRO';

export interface ExerciseItem {
  id: string;
  nom: string;
  consigneFr: string;
  consigneWo: string;
  varianteFacile: string;
  varianteDifficile: string;
  mode: 'duree' | 'repetitions';
  dureeSec: number;
  repetitions?: number;
  reposSec: number;
  imageUrl?: string;
}

export interface SessionTemplate {
  id: number;
  sport_code: SportCode;
  titre: string;
  niveau: AthleteLevel;
  duree_min: number;
  objectif: string;
  prevention_focus: string;
  relue_par: string | null;
  validation_status: ValidationStatus;
  access_tier?: 'ESSENTIEL' | 'PROGRESSION';
  proposee_par_nom?: string | null;
  exercises: ExerciseItem[];
}

export interface ScheduledSession {
  id: number;
  program_id: number;
  session_id: number | null;
  jour_semaine: number;
  date_prevue: string;
  is_rest_day: boolean;
  ajustee_par_coach: boolean;
  motif_ajustement: string | null;
  date_ajustement: string | null;
  completed: boolean;
  ressenti_fatigue: number | null;
  difficulte: number | null;
  qualite_sommeil: number | null;
  completed_at: string | null;
  session?: SessionTemplate | null;
}

export interface WeightLog {
  id: number;
  poids_kg: number;
  date: string;
}

export interface TestResultItem {
  test_code: string;
  test_nom: string;
  valeur: number;
  unite: string;
  niveau_obtenu: TestRating;
}

export interface CoachComment {
  id: number;
  evaluation_id: number;
  coach_nom: string;
  texte: string;
  date: string;
}

export interface EvaluationRecord {
  id: number;
  athlete_user_id: number;
  type: 'INITIALE' | 'PERIODIQUE';
  sport_code: SportCode;
  date: string;
  score_global: number;
  results: TestResultItem[];
  comments: CoachComment[];
}

export interface AlertRecord {
  id: number;
  athlete_user_id: number;
  athlete_nom?: string;
  athlete_sport?: SportCode;
  type: AlertType;
  zone_douleur: string | null;
  intensite: number | null;
  message: string;
  date: string;
  traitee: boolean;
  note_traitement: string | null;
}

export interface GroupInfo {
  id: number;
  nom: string;
  partner_nom: string;
  partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
  zone: string;
  captain_name: string;
  sport_code: SportCode;
  member_count: number;
  joined: boolean;
}

export interface ChallengeInfo {
  id: number;
  partner_nom: string;
  titre: string;
  indicateur: string;
  periode: string;
  target_sessions: number;
  current_sessions: number;
}

export interface AuthUser {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  role: UserRole;
  date_naissance: string;
  langue: 'fr' | 'wo';
  statut: AthleteStatus;
  is_minor: boolean;
  verified: boolean;
}

export interface AthleteProfileData {
  sport_code: SportCode;
  niveau: AthleteLevel;
  taille_cm: number | null;
  poste: string | null;
  objectif: string | null;
  eco_data_mode: boolean;
  notifications_enabled: boolean;
  reminder_time?: string;
  reminder_lead_minutes?: number;
  plan_tier: AthletePlanTier;
  plan_fee_fcfa: number;
  plan_billing_cycle?: 'MENSUEL' | 'TRIMESTRIEL';
  coach_subscription_status: 'GRATUIT_BASE' | 'ACTIF_5000';
  coach_monthly_fee_fcfa: number;
  coach_subscribed_at: string | null;
}

export interface PublicCoachOption {
  id: number;
  nom: string;
  prenom: string;
  specialite: string;
  qualification: string;
  zone: string;
  coach_plan?: CoachPlanType;
  commission_pct?: number;
  athlete_payout_fcfa?: number;
  athlete_monthly_fee_fcfa: number;
  active_athletes_count: number;
}

export interface AssignedCoachInfo {
  id: number;
  nom: string;
  prenom: string;
  specialite: string;
  qualification: string;
  zone: string;
  coach_plan?: CoachPlanType;
  athlete_monthly_fee_fcfa?: number;
}

export interface ProgramPlanInfo {
  id: number;
  objectif: string;
  date_debut: string;
  duree_semaines: number;
  notes: string | null;
}

export type CoachVideoSourceType = 'SUPABASE_STORAGE' | 'LOCAL_STORAGE' | 'EXTERNAL_URL';

export interface CoachVideoItem {
  id: number;
  coach_user_id: number;
  coach_nom?: string;
  sport_code: SportCode;
  session_id: number | null;
  session_titre?: string | null;
  athlete_user_id: number | null;
  athlete_nom?: string | null;
  titre: string;
  description: string | null;
  source_type: CoachVideoSourceType;
  mime_type: string | null;
  file_size_bytes: number;
  playback_url: string;
  created_at: string;
}

export interface AthleteWorkspacePayload {
  user: AuthUser;
  profile: AthleteProfileData;
  coach: AssignedCoachInfo | null;
  availableCoaches: PublicCoachOption[];
  program: ProgramPlanInfo | null;
  schedule: ScheduledSession[];
  library: SessionTemplate[];
  coachVideos?: CoachVideoItem[];
  weights: WeightLog[];
  evaluations: EvaluationRecord[];
  alerts: AlertRecord[];
  groups: GroupInfo[];
  challenges: ChallengeInfo[];
  consents: Array<{ id: number; type: string; version: string; accepted_at: string }>;
  stats: {
    weeklyCompleted: number;
    weeklyTarget: number;
    fourWeekRegularityPct: number;
    avgRpe: number | null;
    avgSleep: number | null;
  };
}

export interface CoachAthleteSummary {
  id: number;
  nom: string;
  prenom: string;
  sport_code: SportCode;
  niveau: AthleteLevel;
  statut: AthleteStatus;
  is_minor: boolean;
  weeklyCompleted: number;
  weeklyTarget: number;
  lastEvaluationScore: number | null;
  openAlertsCount: number;
  hasPainAlert: boolean;
}

export interface AuditLogEntry {
  id: number;
  actor_nom: string;
  actor_role: UserRole;
  athlete_nom: string | null;
  action: string;
  resource: string;
  created_at: string;
}

export interface PartnerSummary {
  id: number;
  nom: string;
  type: 'ASC' | 'CAMPUS' | 'LIGUE';
  zone: string;
  groups_count: number;
  members_count: number;
}

export interface PartnerChallengeSummary extends ChallengeInfo {
  partner_id: number;
  partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
  zone: string;
}

export interface PublicPartnersPayload {
  partners: PartnerSummary[];
  groups: Array<{
    id: number;
    nom: string;
    partner_id: number;
    partner_nom: string;
    partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
    zone: string;
    captain_name: string;
    sport_code: SportCode;
    member_count: number;
  }>;
  challenges: PartnerChallengeSummary[];
}

export interface PartnerRequestRecord {
  id: number;
  organisation: string;
  type: 'ASC' | 'CAMPUS' | 'LIGUE';
  zone: string;
  contact_nom: string;
  contact_telephone: string;
  contact_email: string | null;
  sport_principal: string | null;
  nombre_athletes_estime: number | null;
  pack_souhaite?: string | null;
  message: string | null;
  statut: 'NOUVELLE' | 'EN_ETUDE' | 'VALIDEE';
  created_at: string;
}

export interface MinisterSportMetric {
  sport_code: SportCode;
  athletesCount: number;
  validatedSessionsCount: number;
  evaluationsCount: number;
  avgEvalScore: number | null;
  completedSessionsCount: number;
  groupsCount: number;
}

export interface MinisterZoneMetric {
  zone: string;
  partnersCount: number;
  partnerTypes: Array<'ASC' | 'CAMPUS' | 'LIGUE'>;
  groupsCount: number;
  membersCount: number;
  challengesCount: number;
  challengeCompletionPct: number;
}

export interface MinisterPerspectivePhase {
  code: string;
  horizon: string;
  titre: string;
  statut: 'EN_COURS' | 'PLANIFIEE' | 'CIBLE';
  progressionPct: number;
  resume: string;
  livrables: string[];
}

export interface MinisterOverviewPayload {
  generatedAt: string;
  kpis: {
    totalAthletes: number;
    activeFollowUpAthletes: number;
    verifiedAthletes: number;
    minorProtectedCount: number;
    totalCoaches: number;
    coachAthleteRatio: string;
    validatedSessionsCount: number;
    pendingReviewSessionsCount: number;
    avgGlobalEvalScore: number | null;
    completedSessionsTotal: number;
    plannedTrainingSessionsTotal: number;
    avgWeeklyCompletionPct: number;
    totalPartners: number;
    totalGroups: number;
    totalGroupMemberships: number;
    totalChallenges: number;
    pendingPartnerRequests: number;
  };
  bySport: MinisterSportMetric[];
  byZone: MinisterZoneMetric[];
  preventionAndSafety: {
    openPainAlerts: number;
    resolvedPainAlerts: number;
    totalPainAlerts: number;
    painResolutionRatePct: number;
    minorParentalConsentCount: number;
    parentalConsentCompliancePct: number;
    nonMedicalConsentCount: number;
    reviewCompliancePct: number;
    auditEventsCount: number;
    coachCommentsCount: number;
  };
  challenges: Array<{
    id: number;
    titre: string;
    partner_nom: string;
    partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
    zone: string;
    periode: string;
    indicateur: string;
    target_sessions: number;
    current_sessions: number;
    pct: number;
  }>;
  partnerRequestsSummary: {
    total: number;
    nouvelle: number;
    enEtude: number;
    validee: number;
  };
  perspectives: {
    readinessScorePct: number;
    phases: MinisterPerspectivePhase[];
    axes: Array<{
      id: string;
      titre: string;
      indicateurActuel: string;
      orientation: string;
    }>;
  };
}

export interface CoachDocumentStudyCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface CoachDocumentStudyReport {
  formatLabel: string;
  detectedMime: string;
  isDuplicateHash: boolean;
  checks: CoachDocumentStudyCheck[];
}

export interface CoachComplianceInfo {
  pro_card_number: string | null;
  pro_card_expiry: string | null;
  rc_pro_insurer: string | null;
  rc_pro_policy_number: string | null;
  legal_status: string | null;
  business_reg_number: string | null;
  honorability_attested: boolean;
}

export interface CoachDocumentSummary {
  id: number;
  coach_user_id: number;
  diploma_type: string;
  issuing_organism: string;
  diploma_number: string;
  issue_year: number;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  study_score: number;
  study_status: 'CONFORME_PRE_ETUDE' | 'A_VERIFIER' | 'ANOMALIE';
  study_report: CoachDocumentStudyReport;
  admin_review_note: string | null;
  reviewed_by_nom: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
}

export interface AdminSystemOverviewPayload {
  generatedAt: string;
  system: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryRssMb: number;
    memoryHeapMb: number;
    dbSizeKb: number;
    uploadsCount: number;
    uploadsSizeKb: number;
    activeSessionsCount: number;
    lockedAccountsCount: number;
    unverifiedAccountsCount: number;
  };
  queues: {
    pendingCoachDossiers: number;
    pendingSessionsReview: number;
    openPainAlerts: number;
    newPartnerRequests: number;
  };
  platformTotals: {
    totalUsers: number;
    athletesCount: number;
    coachesVerifiedCount: number;
    coachesPendingCount: number;
    completedSessionsCount: number;
    evaluationsCount: number;
    groupsCount: number;
    challengesCount: number;
  };
  traffic: {
    requestsLast24h: number;
    requestsLastHour: number;
    avgLatencyMs: number;
    errorRatePct: number;
    authBlocks24h: number;
    bandwidthOutKb24h: number;
    hourlySeries: Array<{
      hour: string;
      requests: number;
      errors: number;
      avgLatencyMs: number;
    }>;
    topRoutes: Array<{
      method: string;
      path_group: string;
      hits: number;
      avg_ms: number;
      errors: number;
    }>;
    byRole: Array<{
      role: string;
      requests: number;
    }>;
    recentLogs: Array<{
      id: number;
      method: string;
      full_path: string;
      status_code: number;
      duration_ms: number;
      user_role: string;
      bytes_out: number;
      created_at: string;
    }>;
  };
}



