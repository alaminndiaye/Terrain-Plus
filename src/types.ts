export type UserRole = 'ATHLETE' | 'COACH' | 'ADMIN' | 'MINISTRE';

export type SportCode = 'football' | 'basket' | 'handball';

export type AthleteLevel = 'debutant' | 'intermediaire' | 'avance';

export type AthleteStatus = 'INSCRIT' | 'ACTIF' | 'SUIVI_ACTIF' | 'EN_PAUSE' | 'CLOTURE';

export type ValidationStatus = 'VALIDEE' | 'EN_RELECTURE' | 'BROUILLON';

export type AlertType = 'DOULEUR' | 'ABSENCE' | 'RAPPEL' | 'CHANGEMENT_COACH';

export type TestRating = 'Faible' | 'Moyen' | 'Bon pour le niveau';

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
}

export interface AssignedCoachInfo {
  id: number;
  nom: string;
  prenom: string;
  specialite: string;
  qualification: string;
  zone: string;
}

export interface ProgramPlanInfo {
  id: number;
  objectif: string;
  date_debut: string;
  duree_semaines: number;
  notes: string | null;
}

export interface AthleteWorkspacePayload {
  user: AuthUser;
  profile: AthleteProfileData;
  coach: AssignedCoachInfo | null;
  program: ProgramPlanInfo | null;
  schedule: ScheduledSession[];
  library: SessionTemplate[];
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


