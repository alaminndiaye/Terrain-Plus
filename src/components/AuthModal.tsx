import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Check, Clock, FileText, RefreshCw, ShieldCheck, Upload, UserPlus, X } from 'lucide-react';
import { ApiError, apiRequest, setSessionToken } from '../lib/api';
import { ALL_SPORT_CODES, SPORTS_CONFIG } from '../data/sportsConfig';
import { OBJECTIVE_BY_CODE, TRAINING_OBJECTIVES } from '../data/objectivesConfig';
import {
  ACCEPTED_DIPLOMA_MIME_TYPES,
  COACH_LEGAL_STATUS_OPTIONS,
  MAX_DIPLOMA_FILE_BYTES,
  SPORT_DIPLOMA_FORMATS,
  SPORT_DIPLOMA_LIST,
  type CoachLegalStatusCode,
  type DiplomaTypeCode,
} from '../data/sportsDiplomas';
import type { AthleteLevel, AuthUser, ObjectiveCode, PublicCoachOption, SportCode } from '../types';
import { type LegalDocTab } from '../data/legalDocs';
import { LegalModal } from './LegalModal';

interface AuthModalProps {
  initialMode: 'login' | 'register';
  preselectedSport?: SportCode;
  preselectedObjective?: ObjectiveCode;
  initialRole?: 'athlete' | 'coach';
  initialNotice?: string;
  onClose: () => void;
  onOpenPartners?: () => void;
  onAuthenticated: (user: AuthUser, isNewRegistration: boolean) => void;
}

interface CoachDossierPrefill {
  specialite: string;
  qualification: string;
  zone: string;
  pro_card_number: string | null;
  pro_card_expiry: string | null;
  rc_pro_insurer: string | null;
  rc_pro_policy_number: string | null;
  legal_status: string | null;
  business_reg_number: string | null;
  honorability_attested: boolean;
  diploma_type: DiplomaTypeCode | null;
  issuing_organism: string | null;
  diploma_number: string | null;
  issue_year: number | null;
  original_filename: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode,
  preselectedSport,
  preselectedObjective = 'PERTE_POIDS',
  initialRole = 'athlete',
  initialNotice,
  onClose,
  onOpenPartners,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'resubmit'>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [regAccountType, setRegAccountType] = useState<'athlete' | 'coach'>(initialRole);

  // Login states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [accountNotFound, setAccountNotFound] = useState(false);

  // Forgot password states
  const [resetOtpRequested, setResetOtpRequested] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  // Available coaches for athlete selection (5 000 FCFA / mois)
  const [availableCoaches, setAvailableCoaches] = useState<PublicCoachOption[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Athlete Registration multi-step states
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [objectiveCode, setObjectiveCode] = useState<ObjectiveCode>(preselectedObjective);
  const [sportCode, setSportCode] = useState<SportCode>(
    preselectedSport || OBJECTIVE_BY_CODE[preselectedObjective].recommendedSports[0]
  );
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('+22177');
  const [email, setEmail] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [poidsKg, setPoidsKg] = useState('');
  const [tailleCm, setTailleCm] = useState('');
  const [niveau, setNiveau] = useState<AthleteLevel>('debutant');
  const [poste, setPoste] = useState('');
  const [langue, setLangue] = useState<'fr' | 'wo'>('fr');
  const [regPassword, setRegPassword] = useState('');
  const [consentSensible, setConsentSensible] = useState(false);
  const [consentNonMedical, setConsentNonMedical] = useState(false);
  const [consentCdpLegal, setConsentCdpLegal] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalDocTab | null>(null);
  const [parentalName, setParentalName] = useState('');
  const [parentalPhone, setParentalPhone] = useState('+22177');
  const [selectedPlanTier, setSelectedPlanTier] = useState<'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE'>('ESSENTIEL');
  const [billingCycle, setBillingCycle] = useState<'MENSUEL' | 'TRIMESTRIEL'>('MENSUEL');
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [confirmPlanChoice, setConfirmPlanChoice] = useState(false);

  // Coach Registration states (0 FCFA Marketplace vs 3 000 FCFA Coach Pro)
  const [coachPlan, setCoachPlan] = useState<'MARKETPLACE' | 'COACH_PRO'>('MARKETPLACE');
  const [coachSpecialite, setCoachSpecialite] = useState('');
  const [coachQualification, setCoachQualification] = useState('');
  const [coachZone, setCoachZone] = useState('');
  const [confirmCoachPlan, setConfirmCoachPlan] = useState(true);
  const [coachConsentNonMedical, setCoachConsentNonMedical] = useState(false);
  const [coachDateNaissance, setCoachDateNaissance] = useState('');
  const [diplomaType, setDiplomaType] = useState<DiplomaTypeCode>('LICENCE_CAF_FSF');
  const [issuingOrganism, setIssuingOrganism] = useState('FSF / CAF');
  const [diplomaNumber, setDiplomaNumber] = useState('');
  const [issueYear, setIssueYear] = useState(String(new Date().getFullYear()));
  const [diplomaFile, setDiplomaFile] = useState<{
    name: string;
    base64: string;
    sizeBytes: number;
    mimeType: string;
  } | null>(null);
  const [proCardNumber, setProCardNumber] = useState('');
  const [proCardExpiry, setProCardExpiry] = useState(
    new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10)
  );
  const [rcProInsurer, setRcProInsurer] = useState('');
  const [rcProPolicyNumber, setRcProPolicyNumber] = useState('');
  const [legalStatus, setLegalStatus] = useState<CoachLegalStatusCode>('MICRO_ENTREPRISE');
  const [businessRegNumber, setBusinessRegNumber] = useState('');
  const [honorabilityAttested, setHonorabilityAttested] = useState(false);

  const [pendingReviewNotice, setPendingReviewNotice] = useState<{
    message: string;
    status: 'EN_ATTENTE' | 'REFUSE';
    reason?: string | null;
    resubmitToken?: string;
    coachDossier?: CoachDossierPrefill;
  } | null>(null);
  const [resubmitToken, setResubmitToken] = useState<string | null>(null);
  const [existingDiplomaFilename, setExistingDiplomaFilename] = useState<string | null>(null);

  const [verifyIdentifier, setVerifyIdentifier] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialNotice || null);

  useEffect(() => {
    setLoadingCoaches(true);
    apiRequest<{ coaches: PublicCoachOption[] }>('/api/public/coaches')
      .then((res) => {
        setAvailableCoaches(res.coaches || []);
      })
      .catch(() => undefined)
      .finally(() => setLoadingCoaches(false));
  }, []);

  const isMinor = (() => {
    const d = new Date(dateNaissance);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age < 18;
  })();

  const switchToCreateFromMissingAccount = () => {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      setEmail(trimmed);
    } else if (trimmed) {
      setTelephone(trimmed);
    }
    setAccountNotFound(false);
    setError(null);
    setRegStep(1);
    setMode('register');
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    setAccountNotFound(false);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      if (err instanceof ApiError && err.payload.needsVerification) {
        setVerifyIdentifier(String(err.payload.identifier || identifier));
        setVerifyCode('');
        setMode('verify');
        setError(null);
      } else if (err instanceof ApiError && err.payload.pendingAdminReview) {
        setPendingReviewNotice({
          message: err.message,
          status: err.payload.verificationStatus === 'REFUSE' ? 'REFUSE' : 'EN_ATTENTE',
          reason: typeof err.payload.rejectionReason === 'string' ? err.payload.rejectionReason : null,
          resubmitToken: typeof err.payload.resubmitToken === 'string' ? err.payload.resubmitToken : undefined,
          coachDossier: (err.payload.coachDossier as CoachDossierPrefill | undefined) || undefined,
        });
      } else if (err instanceof ApiError && err.payload.accountNotFound) {
        setAccountNotFound(true);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Échec de connexion.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier.trim()) {
      setError('Entrez votre email ou votre numéro +221.');
      return;
    }
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    setAccountNotFound(false);
    try {
      await apiRequest<{ ok: boolean }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, purpose: 'CONNEXION' }),
      });
      setOtpRequested(true);
    } catch (err) {
      if (err instanceof ApiError && err.payload.accountNotFound) {
        setAccountNotFound(true);
      }
      setError(err instanceof Error ? err.message : 'Impossible de générer un code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, code: otpCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      if (err instanceof ApiError && err.payload.pendingAdminReview) {
        setPendingReviewNotice({
          message: err.message,
          status: err.payload.verificationStatus === 'REFUSE' ? 'REFUSE' : 'EN_ATTENTE',
          reason: typeof err.payload.rejectionReason === 'string' ? err.payload.rejectionReason : null,
          resubmitToken: typeof err.payload.resubmitToken === 'string' ? err.payload.resubmitToken : undefined,
          coachDossier: (err.payload.coachDossier as CoachDossierPrefill | undefined) || undefined,
        });
      } else {
        setError(err instanceof Error ? err.message : 'Code invalide.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setError(null);
    setPendingReviewNotice(null);
    setAccountNotFound(false);
    setResetOtpRequested(false);
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setMode('forgot');
  };

  const handleRequestResetOtp = async () => {
    if (!identifier.trim()) {
      setError('Entrez votre adresse email ou numéro +221.');
      return;
    }
    setLoading(true);
    setError(null);
    setAccountNotFound(false);
    try {
      await apiRequest<{ ok: boolean }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, purpose: 'REINITIALISATION' }),
      });
      setResetOtpRequested(true);
    } catch (err) {
      if (err instanceof ApiError && err.payload.accountNotFound) {
        setAccountNotFound(true);
      }
      setError(err instanceof Error ? err.message : 'Impossible de générer un code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          code: resetCode,
          new_password: resetNewPassword,
        }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      if (err instanceof ApiError && err.payload.pendingAdminReview) {
        setPendingReviewNotice({
          message: err.message,
          status: err.payload.verificationStatus === 'REFUSE' ? 'REFUSE' : 'EN_ATTENTE',
          reason: typeof err.payload.rejectionReason === 'string' ? err.payload.rejectionReason : null,
          resubmitToken: typeof err.payload.resubmitToken === 'string' ? err.payload.resubmitToken : undefined,
          coachDossier: (err.payload.coachDossier as CoachDossierPrefill | undefined) || undefined,
        });
        setPassword('');
        setMode('login');
      } else {
        setError(err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe.');
      }
    } finally {
      setLoading(false);
    }
  };

  const startCoachResubmit = () => {
    if (!pendingReviewNotice?.resubmitToken) return;
    const d = pendingReviewNotice.coachDossier;
    if (d) {
      if (d.specialite) setCoachSpecialite(d.specialite);
      if (d.qualification) setCoachQualification(d.qualification);
      if (d.zone) setCoachZone(d.zone);
      if (d.diploma_type && Object.prototype.hasOwnProperty.call(SPORT_DIPLOMA_FORMATS, d.diploma_type)) {
        setDiplomaType(d.diploma_type);
      }
      if (d.issuing_organism) setIssuingOrganism(d.issuing_organism);
      if (d.diploma_number) setDiplomaNumber(d.diploma_number);
      if (d.issue_year) setIssueYear(String(d.issue_year));
      if (d.pro_card_number) setProCardNumber(d.pro_card_number);
      if (d.pro_card_expiry) setProCardExpiry(d.pro_card_expiry);
      if (d.rc_pro_insurer) setRcProInsurer(d.rc_pro_insurer);
      if (d.rc_pro_policy_number) setRcProPolicyNumber(d.rc_pro_policy_number);
      if (
        d.legal_status &&
        COACH_LEGAL_STATUS_OPTIONS.some((opt) => opt.code === d.legal_status)
      ) {
        setLegalStatus(d.legal_status as CoachLegalStatusCode);
      }
      if (d.business_reg_number) setBusinessRegNumber(d.business_reg_number);
      setHonorabilityAttested(Boolean(d.honorability_attested));
      setExistingDiplomaFilename(d.original_filename || null);
    }
    setDiplomaFile(null);
    setResubmitToken(pendingReviewNotice.resubmitToken);
    setError(null);
    setMode('resubmit');
  };

  const handleCoachResubmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resubmitToken) {
      setError('Session de resoumission expirée. Reconnectez-vous pour relancer la correction.');
      return;
    }
    if (!honorabilityAttested) {
      setError("Veuillez cocher l'attestation sur l'honneur d'honorabilité.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/coach-resubmit', {
        method: 'POST',
        body: JSON.stringify({
          resubmit_token: resubmitToken,
          specialite: coachSpecialite,
          qualification: coachQualification,
          zone: coachZone,
          diploma_type: diplomaType,
          issuing_organism: issuingOrganism,
          diploma_number: diplomaNumber,
          issue_year: Number(issueYear),
          pro_card_number: proCardNumber,
          pro_card_expiry: proCardExpiry,
          rc_pro_insurer: rcProInsurer,
          rc_pro_policy_number: rcProPolicyNumber,
          legal_status: legalStatus,
          business_reg_number: businessRegNumber,
          honorability_attested: honorabilityAttested,
          diploma_file: diplomaFile
            ? {
                name: diplomaFile.name,
                base64: diplomaFile.base64,
              }
            : null,
        }),
      });
      setResubmitToken(null);
      setPendingReviewNotice({
        status: 'EN_ATTENTE',
        reason: null,
        message: res.message,
      });
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de resoumettre le dossier.');
    } finally {
      setLoading(false);
    }
  };

  const handleAthleteRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlanTier === 'COACH_PRIVE') {
      if (!selectedCoachId) {
        setError('Veuillez choisir un coach dans la liste ou sélectionner Essentiel / Progression+.');
        return;
      }
      if (!confirmPlanChoice) {
        setError('Veuillez confirmer la formule Suivi Coach à 5 000 FCFA / mois.');
        return;
      }
    }
    if (selectedPlanTier === 'PROGRESSION' && !confirmPlanChoice) {
      setError('Veuillez confirmer la formule Progression+.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        requiresVerification?: boolean;
        email: string;
        user?: AuthUser | null;
        sessionToken?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          account_type: 'ATHLETE',
          nom,
          prenom,
          telephone,
          email,
          password: regPassword,
          date_naissance: dateNaissance,
          sport_code: sportCode,
          objectif_code: objectiveCode,
          niveau,
          poids_kg: Number(poidsKg),
          taille_cm: tailleCm ? Number(tailleCm) : null,
          poste: poste || null,
          langue,
          consent_sensible: consentSensible,
          consent_non_medical: consentNonMedical,
          consent_cdp_legal: consentCdpLegal,
          parental_consent_name: isMinor ? parentalName : null,
          parental_consent_phone: isMinor ? parentalPhone : null,
          plan_tier: selectedPlanTier,
          plan_billing_cycle: billingCycle,
          selected_coach_id: selectedPlanTier === 'COACH_PRIVE' ? selectedCoachId : null,
          confirm_plan_choice: selectedPlanTier !== 'ESSENTIEL' ? confirmPlanChoice : true,
        }),
      });
      if (res.requiresVerification === false && res.user) {
        if (res.sessionToken) setSessionToken(res.sessionToken);
        onAuthenticated(res.user, true);
        return;
      }
      setVerifyIdentifier(res.email);
      setVerifyCode('');
      setMode('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const handleDiplomaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setDiplomaFile(null);
      return;
    }
    if (file.size < 400 || file.size > MAX_DIPLOMA_FILE_BYTES) {
      setError('Le document diplôme doit peser entre 1 Ko et 3 Mo maximum.');
      setDiplomaFile(null);
      return;
    }
    if (
      file.type &&
      !(ACCEPTED_DIPLOMA_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      setError('Format non accepté. Envoyez un document PDF, JPG, PNG ou WEBP.');
      setDiplomaFile(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setError('Impossible de lire le fichier sélectionné.');
        return;
      }
      setError(null);
      setDiplomaFile({
        name: file.name,
        base64: result,
        sizeBytes: file.size,
        mimeType: file.type || 'application/pdf',
      });
    };
    reader.onerror = () => {
      setError('Erreur de lecture du document diplôme.');
    };
    reader.readAsDataURL(file);
  };

  const handleCoachRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diplomaFile) {
      setError('Veuillez joindre le fichier de votre diplôme ou licence sportive (PDF, JPG, PNG ou WEBP).');
      return;
    }
    if (!honorabilityAttested) {
      setError("Veuillez cocher l'attestation sur l'honneur d'honorabilité pour exercer comme éducateur sportif.");
      return;
    }
    if (!consentCdpLegal) {
      setError('Veuillez accepter les CGU, CGV et la Politique de confidentialité (CDP Sénégal).');
      return;
    }
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    try {
      const res = await apiRequest<{
        requiresVerification?: boolean;
        pendingAdminReview?: boolean;
        verificationStatus?: 'EN_ATTENTE' | 'REFUSE';
        message?: string;
        email: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          account_type: 'COACH',
          nom,
          prenom,
          telephone,
          email,
          password: regPassword,
          date_naissance: coachDateNaissance,
          langue,
          specialite: coachSpecialite,
          qualification: coachQualification,
          zone: coachZone,
          coach_plan: coachPlan,
          confirm_coach_plan: confirmCoachPlan,
          consent_non_medical: coachConsentNonMedical,
          consent_cdp_legal: consentCdpLegal,
          diploma_type: diplomaType,
          issuing_organism: issuingOrganism,
          diploma_number: diplomaNumber,
          issue_year: Number(issueYear),
          pro_card_number: proCardNumber,
          pro_card_expiry: proCardExpiry,
          rc_pro_insurer: rcProInsurer,
          rc_pro_policy_number: rcProPolicyNumber,
          legal_status: legalStatus,
          business_reg_number: businessRegNumber,
          honorability_attested: honorabilityAttested,
          diploma_file: {
            name: diplomaFile.name,
            base64: diplomaFile.base64,
          },
        }),
      });
      if (res.requiresVerification === false) {
        setPendingReviewNotice({
          status: res.verificationStatus === 'REFUSE' ? 'REFUSE' : 'EN_ATTENTE',
          message:
            res.message ||
            "Votre dossier coach et votre diplôme sont en cours d'étude par l'administrateur Terrain+.",
        });
        setMode('login');
        return;
      }
      setVerifyIdentifier(res.email);
      setVerifyCode('');
      setMode('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription Coach.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPendingReviewNotice(null);
    try {
      const res = await apiRequest<{
        user: AuthUser | null;
        sessionToken?: string;
        pendingAdminReview?: boolean;
        verificationStatus?: 'EN_ATTENTE' | 'REFUSE';
        rejectionReason?: string | null;
        resubmitToken?: string;
        coachDossier?: CoachDossierPrefill;
        message?: string;
      }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ identifier: verifyIdentifier, code: verifyCode }),
      });

      if (res.pendingAdminReview) {
        setPendingReviewNotice({
          status: res.verificationStatus === 'REFUSE' ? 'REFUSE' : 'EN_ATTENTE',
          reason: res.rejectionReason || null,
          resubmitToken: res.resubmitToken,
          coachDossier: res.coachDossier,
          message:
            res.message ||
            "Votre dossier et votre diplôme sont en cours d'étude par l'administrateur Terrain+. Veuillez patienter avant de vous connecter.",
        });
        return;
      }

      if (res.sessionToken) setSessionToken(res.sessionToken);
      if (res.user) {
        onAuthenticated(res.user, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerifyOtp = async () => {
    if (!verifyIdentifier.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest<{ ok: boolean }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier: verifyIdentifier, purpose: 'VERIFICATION' }),
      });
      setVerifyCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de régénérer un code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl obsidian-card-glow p-6 shadow-2xl my-auto text-[#063725]">
        <div className="flex items-center justify-between gap-4 border-b border-[#E2EBE5] pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/terrain-mark-light.png"
              alt="Logo Terrain+"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-contain shrink-0"
            />
            <h2 className="font-display text-lg font-bold text-[#063725]">
              {mode === 'login'
                ? 'Connexion sécurisée Terrain+'
                : mode === 'forgot'
                  ? 'Réinitialiser le mot de passe'
                  : mode === 'resubmit'
                    ? 'Corriger mon dossier Coach'
                    : mode === 'verify'
                      ? 'Validation du compte'
                      : regAccountType === 'coach'
                        ? 'Inscription Coach Prépa'
                        : 'Inscription Jeune Sportif'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#5B7064] hover:bg-[#F1F6F3] hover:text-[#063725]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {pendingReviewNotice && mode !== 'resubmit' && (
          <div
            className={`mt-4 rounded-2xl border p-4 space-y-3 ${
              pendingReviewNotice.status === 'REFUSE'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {pendingReviewNotice.status === 'REFUSE'
                    ? 'Dossier coach non validé par l’administrateur'
                    : 'Dossier coach en cours d’étude par l’administrateur'}
                </div>
                <p className="text-xs leading-relaxed opacity-90">{pendingReviewNotice.message}</p>
                {pendingReviewNotice.reason && (
                  <p className="text-xs font-medium pt-1">Motif : {pendingReviewNotice.reason}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {pendingReviewNotice.status === 'REFUSE' && pendingReviewNotice.resubmitToken && (
                <button
                  type="button"
                  onClick={startCoachResubmit}
                  className="rounded-full bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 min-h-[38px]"
                >
                  Corriger et resoumettre mon dossier
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPendingReviewNotice(null);
                  setMode('login');
                  setError(null);
                }}
                className="rounded-full bg-[#0D6E46] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[38px]"
              >
                Compris, fermer cet avis
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[#C3D6CA] bg-white px-3.5 py-2 text-xs font-medium text-[#063725] hover:bg-[#F1F6F3] min-h-[38px]"
              >
                Revenir à l’accueil
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900 space-y-2.5">
            <div>{error}</div>
            {accountNotFound && mode === 'login' && (
              <button
                type="button"
                onClick={switchToCreateFromMissingAccount}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0D6E46] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[38px]"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Créer un compte maintenant</span>
              </button>
            )}
          </div>
        )}

        {mode === 'login' && (
          <div className="mt-5 space-y-5">
            <p className="text-xs text-[#475E52] leading-relaxed">
              Par sécurité, saisissez vos identifiants personnels. Si aucun compte n’est trouvé, vous serez invité à créer un compte Terrain+.
            </p>

            <div className="inline-flex w-full rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] p-1">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password');
                  setError(null);
                  setAccountNotFound(false);
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold min-h-[38px] transition-colors ${
                  loginMethod === 'password' ? 'bg-[#0D6E46] text-white shadow-sm' : 'text-[#475E52] hover:text-[#063725]'
                }`}
              >
                Mot de passe
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('otp');
                  setError(null);
                  setAccountNotFound(false);
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold min-h-[38px] transition-colors ${
                  loginMethod === 'otp' ? 'bg-[#0D6E46] text-white shadow-sm' : 'text-[#475E52] hover:text-[#063725]'
                }`}
              >
                Code à usage unique
              </button>
            </div>

            {loginMethod === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-id" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                    Adresse email ou téléphone (+221) *
                  </label>
                  <input
                    id="login-id"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (accountNotFound) setAccountNotFound(false);
                    }}
                    placeholder="Adresse email ou téléphone (+221)"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] placeholder:text-[#788D81] px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label htmlFor="login-pwd" className="block text-xs font-medium text-[#3D5246]">
                      Mot de passe *
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenForgotPassword}
                      className="text-xs font-semibold text-[#0D6E46] hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <input
                    id="login-pwd"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Saisissez votre mot de passe"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] placeholder:text-[#788D81] px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
                >
                  {loading ? 'Vérification...' : 'Se connecter'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpLogin} className="space-y-4">
                <div>
                  <label htmlFor="otp-id" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                    Email ou téléphone (+221) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="otp-id"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (accountNotFound) setAccountNotFound(false);
                      }}
                      placeholder="Numéro +221 ou email"
                      className="flex-1 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] placeholder:text-[#788D81] px-3.5 py-2.5 text-sm min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={loading}
                      className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[44px] whitespace-nowrap"
                    >
                      Envoyer code
                    </button>
                  </div>
                </div>

                {otpRequested && (
                  <>
                    <div className="rounded-xl border border-[#BFE0CD] bg-[#ECF7F1] px-3.5 py-2.5 text-xs text-[#063725]">
                      Code envoyé à votre contact enregistré (valable 15 minutes).
                    </div>
                    <div>
                      <label htmlFor="otp-code" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                        Saisissez le code OTP à 6 chiffres
                      </label>
                      <input
                        id="otp-code"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 font-mono text-base tracking-[0.2em] tabular-nums min-h-[44px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] min-h-[44px] shadow-sm"
                    >
                      {loading ? 'Connexion...' : 'Valider et me connecter'}
                    </button>
                  </>
                )}
              </form>
            )}

            <div className="border-t border-[#E2EBE5] pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#475E52]">
              <span>
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setAccountNotFound(false);
                    setError(null);
                  }}
                  className="font-bold text-[#063725] underline"
                >
                  Créer un compte
                </button>
              </span>
              {onOpenPartners && (
                <button
                  type="button"
                  onClick={onOpenPartners}
                  className="inline-flex items-center gap-1 font-semibold text-[#0D6E46] hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Espace Partenaire (ASC / Campus)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'register' && (
          <div className="mt-5 space-y-5">
            {/* Role selector for registration */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] p-1">
              <button
                type="button"
                onClick={() => {
                  setRegAccountType('athlete');
                  setError(null);
                }}
                className={`rounded-xl px-3 py-2 text-left transition-colors min-h-[44px] ${
                  regAccountType === 'athlete' ? 'bg-[#0D6E46] text-white shadow-sm' : 'text-[#475E52] hover:text-[#063725]'
                }`}
              >
                <div className="text-xs font-bold">Jeune Sportif</div>
                <div className={`text-[11px] ${regAccountType === 'athlete' ? 'text-emerald-50' : 'text-[#5B7064]'}`}>
                  Essentiel 0 F · Progression+ · Coach
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegAccountType('coach');
                  setError(null);
                }}
                className={`rounded-xl px-3 py-2 text-left transition-colors min-h-[44px] ${
                  regAccountType === 'coach' ? 'bg-[#0D6E46] text-white shadow-sm' : 'text-[#475E52] hover:text-[#063725]'
                }`}
              >
                <div className="text-xs font-bold">Coach Prépa</div>
                <div className={`text-[11px] ${regAccountType === 'coach' ? 'text-emerald-50' : 'text-[#5B7064]'}`}>
                  Inscription gratuite · 0 FCFA
                </div>
              </button>
            </div>

            {onOpenPartners && (
              <div className="rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#475E52]">
                  Vous représentez une ASC, un Campus ou une Ligue ?
                </span>
                <button
                  type="button"
                  onClick={onOpenPartners}
                  className="font-bold text-[#0D6E46] underline hover:text-[#095637]"
                >
                  Inscrire un partenaire
                </button>
              </div>
            )}

            {regAccountType === 'athlete' ? (
              <form onSubmit={handleAthleteRegisterSubmit} className="space-y-5">
                <div className="flex items-center justify-between text-xs text-[#5B7064]">
                  <span>
                    {regStep === 1
                      ? '1. Objectif & discipline'
                      : regStep === 2
                        ? '2. Profil rapide'
                        : '3. Formule & accord'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#0D6E46]">Étape {regStep}/3</span>
                </div>

                {regStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#063725]">
                          1. Quel est votre objectif principal ?
                        </span>
                        <span className="text-[11px] font-semibold text-[#0D6E46]">Base votre programme</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {TRAINING_OBJECTIVES.map((obj) => {
                          const selected = objectiveCode === obj.code;
                          return (
                            <button
                              key={obj.code}
                              type="button"
                              onClick={() => {
                                setObjectiveCode(obj.code);
                                setSportCode(obj.recommendedSports[0]);
                              }}
                              className={`rounded-xl border p-2.5 text-left transition-colors min-h-[54px] ${
                                selected
                                  ? 'border-[#0D6E46] bg-[#ECF7F1] shadow-sm'
                                  : 'border-[#D5E2DA] bg-white hover:border-[#0D6E46]/45'
                              }`}
                            >
                              <div className="text-xs font-bold text-[#063725]">{obj.shortLabel}</div>
                              <div className="text-[10px] text-[#5B7064] mt-0.5 line-clamp-1">
                                Conseillé : {SPORTS_CONFIG[obj.recommendedSports[0]].nom}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#063725]">
                          2. Choisissez votre sport (6 disciplines compatibles)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {ALL_SPORT_CODES.map((code) => {
                          const sp = SPORTS_CONFIG[code];
                          const selected = sportCode === code;
                          const isTopMatch = OBJECTIVE_BY_CODE[objectiveCode].recommendedSports
                            .slice(0, 2)
                            .includes(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => setSportCode(code)}
                              className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-left transition-colors min-h-[56px] ${
                                selected
                                  ? 'border-[#0D6E46] bg-[#ECF7F1] shadow-sm'
                                  : 'border-[#D5E2DA] bg-white hover:border-[#0D6E46]/45'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-[#063725]">{sp.nom}</span>
                                  {isTopMatch && (
                                    <span className="text-[10px] font-bold text-[#0D6E46]">Recommandé</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#5B7064] mt-0.5 truncate">{sp.subtitle}</div>
                              </div>
                              {selected && <Check className="h-4 w-4 text-[#0D6E46] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] px-3 py-2 text-xs text-[#3D5246]">
                        <strong className="text-[#0D6E46]">{OBJECTIVE_BY_CODE[objectiveCode].shortLabel}</strong> ·{' '}
                        {OBJECTIVE_BY_CODE[objectiveCode].sportGuidance[sportCode]}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRegStep(2)}
                      className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] min-h-[44px] shadow-sm"
                    >
                      Continuer ({OBJECTIVE_BY_CODE[objectiveCode].shortLabel} · {SPORTS_CONFIG[sportCode].nom})
                    </button>
                  </div>
                )}

                {regStep === 2 && (
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Prénom *</label>
                        <input
                          type="text"
                          required
                          value={prenom}
                          onChange={(e) => setPrenom(e.target.value)}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Nom *</label>
                        <input
                          type="text"
                          required
                          value={nom}
                          onChange={(e) => setNom(e.target.value)}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Téléphone (+221) *</label>
                        <input
                          type="tel"
                          required
                          value={telephone}
                          onChange={(e) => setTelephone(e.target.value)}
                          placeholder="+221 7X XXX XX XX"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Adresse email *</label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Votre adresse email"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Date de naissance *</label>
                        <input
                          type="date"
                          required
                          value={dateNaissance}
                          onChange={(e) => setDateNaissance(e.target.value)}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Poids (kg) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min={30}
                          max={220}
                          required
                          value={poidsKg}
                          onChange={(e) => setPoidsKg(e.target.value)}
                          placeholder="Poids (kg)"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Taille (cm)</label>
                        <input
                          type="number"
                          min={110}
                          max={230}
                          value={tailleCm}
                          onChange={(e) => setTailleCm(e.target.value)}
                          placeholder="Taille (cm)"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Niveau *</label>
                        <select
                          value={niveau}
                          onChange={(e) => setNiveau(e.target.value as AthleteLevel)}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        >
                          <option value="debutant">Débutant</option>
                          <option value="intermediaire">Intermédiaire</option>
                          <option value="avance">Avancé</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Poste / Rôle</label>
                        <select
                          value={poste}
                          onChange={(e) => setPoste(e.target.value)}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        >
                          <option value="">Non précisé</option>
                          {SPORTS_CONFIG[sportCode].positions.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Langue consignes</label>
                        <select
                          value={langue}
                          onChange={(e) => setLangue(e.target.value as 'fr' | 'wo')}
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                        >
                          <option value="fr">Français</option>
                          <option value="wo">Wolof + Français</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        Mot de passe (8 caractères min., lettres et chiffres) *
                      </label>
                      <input
                        type="password"
                        minLength={8}
                        maxLength={128}
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setRegStep(1)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#C3D6CA] bg-[#F1F6F3] px-4 py-2.5 text-sm font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[44px]"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Retour</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const validPwd =
                            regPassword.length >= 8 &&
                            regPassword.length <= 128 &&
                            /[A-Za-z]/.test(regPassword) &&
                            /\d/.test(regPassword);
                          if (!prenom || !nom || !email || !telephone || !validPwd) {
                            setError(
                              'Complétez les champs obligatoires et choisissez un mot de passe d’au moins 8 caractères contenant lettres et chiffres.'
                            );
                            return;
                          }
                          setError(null);
                          setRegStep(3);
                        }}
                        className="rounded-full bg-[#0D6E46] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#095637] min-h-[44px] shadow-sm"
                      >
                        Étape suivante
                      </button>
                    </div>
                  </div>
                )}

                {regStep === 3 && (
                  <div className="space-y-4">
                    {/* 3-Tier Freemium Athlete Plan Selection */}
                    <div className="rounded-2xl obsidian-inset p-4 space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-[#063725]">
                          Choisissez votre formule d’entraînement
                        </div>
                        <p className="text-[11px] text-[#475E52] mt-0.5">
                          Toutes vos bases sportives et le signalement douleur sont gratuits à vie. Vous pouvez faire évoluer votre formule à tout moment.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlanTier('ESSENTIEL');
                            setSelectedCoachId(null);
                            setConfirmPlanChoice(true);
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selectedPlanTier === 'ESSENTIEL'
                              ? 'border-[#0D6E46] bg-[#ECF7F1]'
                              : 'border-[#D5E2DA] bg-white hover:border-[#0D6E46]/45'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-[#063725]">Essentiel</span>
                            <span className="font-mono text-xs font-bold text-[#0D6E46]">0 F</span>
                          </div>
                          <div className="mt-1 text-[11px] text-[#475E52]">
                            Programme, séances FR/Wolof, 2 téléchargements hors ligne.
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlanTier('PROGRESSION');
                            setSelectedCoachId(null);
                            setConfirmPlanChoice(false);
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selectedPlanTier === 'PROGRESSION'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-[#D5E2DA] bg-white hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-[#063725]">Progression+</span>
                            <span className="font-mono text-xs font-bold text-[#B45309]">1 500 F</span>
                          </div>
                          <div className="mt-1 text-[11px] text-[#475E52]">
                            Cycles spécialisés, hors-ligne illimité & bilans comparés.
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlanTier('COACH_PRIVE');
                            setConfirmPlanChoice(false);
                            if (!selectedCoachId && availableCoaches[0]) {
                              setSelectedCoachId(availableCoaches[0].id);
                            }
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selectedPlanTier === 'COACH_PRIVE'
                              ? 'border-[#0D6E46] bg-[#ECF7F1]'
                              : 'border-[#D5E2DA] bg-white hover:border-[#0D6E46]/45'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-[#063725]">Suivi Coach</span>
                            <span className="font-mono text-xs font-bold text-[#0D6E46]">5 000 F</span>
                          </div>
                          <div className="mt-1 text-[11px] text-[#475E52]">
                            Progression+ inclus + coach personnel qui ajuste vos séances.
                          </div>
                        </button>
                      </div>

                      {selectedPlanTier === 'PROGRESSION' && (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setBillingCycle('MENSUEL')}
                              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                                billingCycle === 'MENSUEL'
                                  ? 'border-amber-500 bg-amber-50 text-[#063725]'
                                  : 'border-[#D5E2DA] bg-white text-[#475E52]'
                              }`}
                            >
                              1 500 FCFA / mois
                            </button>
                            <button
                              type="button"
                              onClick={() => setBillingCycle('TRIMESTRIEL')}
                              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                                billingCycle === 'TRIMESTRIEL'
                                  ? 'border-amber-500 bg-amber-50 text-[#063725]'
                                  : 'border-[#D5E2DA] bg-white text-[#475E52]'
                              }`}
                            >
                              4 000 FCFA / trimestre (-11 %)
                            </button>
                          </div>
                          <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-white p-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={confirmPlanChoice}
                              onChange={(e) => setConfirmPlanChoice(e.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                            />
                            <span className="text-[11px] text-[#475E52] leading-relaxed">
                              Je confirme la formule <strong className="text-[#063725]">Progression+</strong> ({billingCycle === 'TRIMESTRIEL' ? '4 000 FCFA / trimestre' : '1 500 FCFA / mois'}), résiliable à tout moment.
                            </span>
                          </label>
                        </div>
                      )}

                      {selectedPlanTier === 'COACH_PRIVE' && (
                        <div className="space-y-2.5 pt-1">
                          <div className="text-xs font-medium text-[#063725]">
                            Choisissez votre Coach Prépa (5 000 FCFA / mois · 80 % reversés au coach) :
                          </div>
                          {loadingCoaches ? (
                            <div className="text-xs text-[#5B7064]">Chargement des coachs disponibles...</div>
                          ) : availableCoaches.length === 0 ? (
                            <div className="text-xs text-[#B45309]">
                              Aucun coach vérifié disponible pour l’instant. Choisissez Essentiel ou Progression+ pour commencer.
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                              {availableCoaches.map((c) => {
                                const isChosen = selectedCoachId === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setSelectedCoachId(c.id)}
                                    className={`w-full rounded-xl border p-3 text-left flex items-center justify-between gap-3 ${
                                      isChosen
                                        ? 'border-[#0D6E46] bg-[#ECF7F1]'
                                        : 'border-[#D5E2DA] bg-white hover:border-[#0D6E46]/45'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-[#063725]">
                                        {c.prenom} {c.nom} · {c.zone}
                                      </div>
                                      <div className="text-[11px] text-[#5B7064] truncate">
                                        {c.specialite} · {c.qualification}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="font-mono text-xs font-bold text-[#0D6E46]">
                                        {c.athlete_monthly_fee_fcfa.toLocaleString('fr-FR')} F/mois
                                      </div>
                                      {isChosen && <Check className="h-4 w-4 text-[#0D6E46] ml-auto mt-0.5" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {selectedCoachId && (
                            <label className="flex items-start gap-2.5 rounded-xl border border-[#BFE0CD] bg-white p-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={confirmPlanChoice}
                                onChange={(e) => setConfirmPlanChoice(e.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                              />
                              <span className="text-[11px] text-[#475E52] leading-relaxed">
                                Je confirme mon choix de suivi coach Privilège Jeunes à <strong className="text-[#063725]">5 000 FCFA / mois</strong> (inclut tous les modules Progression+, résiliable à tout moment).
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>

                    {isMinor && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                        <div className="text-xs font-semibold text-amber-900">
                          Athlète mineur : accord d’un responsable légal obligatoire (visibilité privée par défaut)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            required
                            placeholder="Nom complet du parent / tuteur"
                            value={parentalName}
                            onChange={(e) => setParentalName(e.target.value)}
                            className="rounded-xl border border-amber-300 bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                          />
                          <input
                            type="tel"
                            required
                            placeholder="+22177..."
                            value={parentalPhone}
                            onChange={(e) => setParentalPhone(e.target.value)}
                            className="rounded-xl border border-amber-300 bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                          />
                        </div>
                      </div>
                    )}

                    <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-[#F6F8F5] p-3.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentSensible}
                        onChange={(e) => setConsentSensible(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#0D6E46]"
                      />
                      <span className="text-xs text-[#3D5246] leading-relaxed">
                        J’accepte la collecte minimale de mes données de suivi physique (poids, évaluations, ressenti, douleurs), accessibles uniquement à moi et au coach que je choisis, sans partage commercial.
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-[#F6F8F5] p-3.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentNonMedical}
                        onChange={(e) => setConsentNonMedical(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#0D6E46]"
                      />
                      <span className="text-xs text-[#3D5246] leading-relaxed">
                        J’ai compris que Terrain+ propose une préparation physique générale et ne remplace ni un coach diplômé en présentiel ni un avis médical. En cas de douleur, j’arrête la pratique et consulte un professionnel de santé.
                      </span>
                    </label>

                    <div className="rounded-xl border border-[#D5E2DA] bg-[#F6F8F5] p-3.5 space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consentCdpLegal}
                          onChange={(e) => setConsentCdpLegal(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#0D6E46]"
                        />
                        <span className="text-xs text-[#3D5246] leading-relaxed">
                          J’ai lu et j’accepte les <strong className="text-[#063725]">CGU</strong>, les <strong className="text-[#063725]">CGV</strong> et la <strong className="text-[#063725]">Politique de confidentialité (CDP Sénégal — Loi n° 2008-12)</strong>.
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-3 pl-7 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setLegalTab('confidentialite')}
                          className="font-semibold text-[#0D6E46] hover:underline"
                        >
                          Confidentialité CDP
                        </button>
                        <button
                          type="button"
                          onClick={() => setLegalTab('cgu')}
                          className="font-semibold text-[#0D6E46] hover:underline"
                        >
                          CGU
                        </button>
                        <button
                          type="button"
                          onClick={() => setLegalTab('cgv')}
                          className="font-semibold text-[#0D6E46] hover:underline"
                        >
                          CGV
                        </button>
                        <button
                          type="button"
                          onClick={() => setLegalTab('mentions')}
                          className="font-semibold text-[#0D6E46] hover:underline"
                        >
                          Mentions légales
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setRegStep(2)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#C3D6CA] bg-[#F1F6F3] px-4 py-2.5 text-sm font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[44px]"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Retour</span>
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="rounded-full bg-[#0D6E46] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
                      >
                        {loading ? 'Création...' : 'Créer mon compte'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            ) : (
              /* Coach Registration Form (Zero-Friction Marketplace 0 FCFA vs Coach Pro) */
              <form onSubmit={handleCoachRegisterSubmit} className="space-y-4">
                <div className="rounded-2xl border border-[#BFE0CD] bg-[#ECF7F1] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#063725]">
                      Choisissez votre modèle Coach Prépa
                    </span>
                    <span className="font-mono text-xs font-bold text-[#0D6E46]">0 FCFA à l’entrée</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCoachPlan('MARKETPLACE')}
                      className={`rounded-xl border p-2.5 text-left transition-colors ${
                        coachPlan === 'MARKETPLACE'
                          ? 'border-[#0D6E46] bg-white shadow-sm'
                          : 'border-[#D5E2DA] bg-white/70 hover:border-[#BFE0CD]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-semibold text-[#063725]">
                        <span>Marketplace</span>
                        <span className="font-mono text-[#0D6E46]">0 F / mois</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#3D5246]">
                        Inscription gratuite. Vous percevez <strong className="text-[#063725]">4 000 F (80 %)</strong> par athlète suivi.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCoachPlan('COACH_PRO')}
                      className={`rounded-xl border p-2.5 text-left transition-colors ${
                        coachPlan === 'COACH_PRO'
                          ? 'border-[#0D6E46] bg-white shadow-sm'
                          : 'border-[#D5E2DA] bg-white/70 hover:border-[#BFE0CD]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-semibold text-[#063725]">
                        <span>Coach Pro</span>
                        <span className="font-mono text-[#0D6E46]">3 000 F / mois</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#3D5246]">
                        Licence fixe à <strong className="text-[#063725]">0 % commission</strong> : vous conservez 5 000 F / athlète.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Prénom *</label>
                    <input
                      type="text"
                      required
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Nom *</label>
                    <input
                      type="text"
                      required
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Téléphone (+221) *</label>
                    <input
                      type="tel"
                      required
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      placeholder="+221 7X XXX XX XX"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Adresse email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Date de naissance (18+) *</label>
                    <input
                      type="date"
                      required
                      value={coachDateNaissance}
                      onChange={(e) => setCoachDateNaissance(e.target.value)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Zone / Ville *</label>
                    <input
                      type="text"
                      required
                      value={coachZone}
                      onChange={(e) => setCoachZone(e.target.value)}
                      placeholder="Ex: Dakar, Thiès"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Langue</label>
                    <select
                      value={langue}
                      onChange={(e) => setLangue(e.target.value as 'fr' | 'wo')}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="fr">Français</option>
                      <option value="wo">Wolof + Français</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Spécialité sportive *</label>
                    <input
                      type="text"
                      required
                      value={coachSpecialite}
                      onChange={(e) => setCoachSpecialite(e.target.value)}
                      placeholder="Ex: Football & Prépa athlétique"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Intitulé de qualification *</label>
                    <input
                      type="text"
                      required
                      value={coachQualification}
                      onChange={(e) => setCoachQualification(e.target.value)}
                      placeholder="Intitulé officiel du diplôme"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Official Sport Diploma Format & Document Study Upload */}
                <div className="rounded-2xl obsidian-inset p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#063725]">
                        Diplôme officiel & étude documentaire (obligatoire avant activation)
                      </div>
                      <p className="text-[11px] text-[#5B7064] mt-0.5">
                        Votre document est pré-analysé puis vérifié par l’administrateur avant votre première connexion.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Format du diplôme sportif *</label>
                    <select
                      value={diplomaType}
                      onChange={(e) => {
                        const next = e.target.value as DiplomaTypeCode;
                        setDiplomaType(next);
                        const spec = SPORT_DIPLOMA_FORMATS[next];
                        if (spec?.acceptedOrganisms[0]) {
                          setIssuingOrganism(spec.acceptedOrganisms[0]);
                        }
                      }}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[42px]"
                    >
                      {SPORT_DIPLOMA_LIST.map((spec) => (
                        <option key={spec.code} value={spec.code}>
                          {spec.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[#5B7064]">
                      {SPORT_DIPLOMA_FORMATS[diplomaType].summary} Organismes :{' '}
                      {SPORT_DIPLOMA_FORMATS[diplomaType].acceptedOrganisms.join(', ')}.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">Organisme émetteur *</label>
                      <input
                        type="text"
                        required
                        value={issuingOrganism}
                        onChange={(e) => setIssuingOrganism(e.target.value)}
                        placeholder="Ex: FSF / INSEPS"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">N° de diplôme / licence *</label>
                      <input
                        type="text"
                        required
                        value={diplomaNumber}
                        onChange={(e) => setDiplomaNumber(e.target.value)}
                        placeholder="CAF-C-SN-2024-0815"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">Année d’obtention *</label>
                      <input
                        type="number"
                        required
                        min={1980}
                        max={new Date().getFullYear()}
                        value={issueYear}
                        onChange={(e) => setIssueYear(e.target.value)}
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] font-mono text-[#5B7064]">
                    {SPORT_DIPLOMA_FORMATS[diplomaType].formatExample}
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Copie scannée ou PDF du diplôme (PDF, JPG, PNG ou WEBP · max 3 Mo) *
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#BFE0CD] bg-white px-3.5 py-3 cursor-pointer hover:border-[#0D6E46]">
                      <span className="flex items-center gap-2.5 min-w-0 text-xs text-[#3D5246]">
                        {diplomaFile ? (
                          <FileText className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />
                        ) : (
                          <Upload className="h-4 w-4 text-[#5B7064] shrink-0" aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {diplomaFile
                            ? `${diplomaFile.name} (${Math.max(1, Math.round(diplomaFile.sizeBytes / 1024))} Ko)`
                            : 'Sélectionner votre diplôme ou attestation fédérale'}
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold text-[#0D6E46] shrink-0">
                        {diplomaFile ? 'Changer' : 'Parcourir'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                        onChange={handleDiplomaFileChange}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {/* Regulatory Compliance: Carte Pro, RC Pro, Legal Status & Honorability */}
                <div className="rounded-2xl obsidian-inset p-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-[#063725]">
                      Conformité réglementaire d’exercice (Éducateur sportif)
                    </div>
                    <p className="text-[11px] text-[#5B7064] mt-0.5">
                      Carte professionnelle (renouvellement 5 ans), assurance RC Pro et immatriculation juridique obligatoires pour encadrer contre rémunération.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        N° Carte professionnelle *
                      </label>
                      <input
                        type="text"
                        required
                        value={proCardNumber}
                        onChange={(e) => setProCardNumber(e.target.value)}
                        placeholder="Ex: CPRO-SN-2025-1104"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        Validité carte pro (5 ans) *
                      </label>
                      <input
                        type="date"
                        required
                        value={proCardExpiry}
                        onChange={(e) => setProCardExpiry(e.target.value)}
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        Assureur RC Pro *
                      </label>
                      <input
                        type="text"
                        required
                        value={rcProInsurer}
                        onChange={(e) => setRcProInsurer(e.target.value)}
                        placeholder="Nom de votre assureur"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        N° Police RC Pro *
                      </label>
                      <input
                        type="text"
                        required
                        value={rcProPolicyNumber}
                        onChange={(e) => setRcProPolicyNumber(e.target.value)}
                        placeholder="Numéro de police RC Pro"
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        Statut juridique *
                      </label>
                      <select
                        value={legalStatus}
                        onChange={(e) => setLegalStatus(e.target.value as CoachLegalStatusCode)}
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                      >
                        {COACH_LEGAL_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#3D5246] mb-1">
                        Immatriculation (SIRET / NINEA / RNA) *
                      </label>
                      <input
                        type="text"
                        required
                        value={businessRegNumber}
                        onChange={(e) => setBusinessRegNumber(e.target.value)}
                        placeholder={
                          COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === legalStatus)?.idHint ||
                          'N° SIRET / NINEA'
                        }
                        className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-white p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={honorabilityAttested}
                      onChange={(e) => setHonorabilityAttested(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                    />
                    <span className="text-[11px] text-[#3D5246] leading-relaxed">
                      J’atteste sur l’honneur satisfaire aux conditions d’honorabilité (aucune condamnation incompatible avec l’encadrement sportif et l’accompagnement de mineurs) et disposer d’une carte professionnelle valide.
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">
                    Mot de passe (8 caractères min., lettres et chiffres) *
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCoachPlan}
                    onChange={(e) => setConfirmCoachPlan(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                  />
                  <span className="text-xs text-[#3D5246] leading-relaxed">
                    {coachPlan === 'COACH_PRO' ? (
                      <>
                        Je choisis la licence <strong className="text-[#063725]">Coach Pro (3 000 FCFA / mois)</strong> avec 0 % de commission sur mes athlètes suivis.
                      </>
                    ) : (
                      <>
                        J’active mon profil <strong className="text-[#063725]">Coach Marketplace (0 FCFA / mois fixe)</strong> et accepte le partage 80 % Coach (4 000 F) / 20 % Terrain+ (1 000 F) par élève actif.
                      </>
                    )}
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coachConsentNonMedical}
                    onChange={(e) => setCoachConsentNonMedical(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                  />
                  <span className="text-xs text-[#3D5246] leading-relaxed">
                    Je m’engage à respecter la charte éthique Terrain+ : encadrement non médical, protection stricte des mineurs et orientation médicale immédiate en cas de douleur signalée.
                  </span>
                </label>

                <div className="rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] p-3 space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentCdpLegal}
                      onChange={(e) => setConsentCdpLegal(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                    />
                    <span className="text-xs text-[#3D5246] leading-relaxed">
                      J’ai lu et j’accepte les <strong className="text-[#063725]">CGU</strong>, les <strong className="text-[#063725]">CGV</strong> et la <strong className="text-[#063725]">Politique de confidentialité (CDP Sénégal — Loi n° 2008-12)</strong>.
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-3 pl-7 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setLegalTab('confidentialite')}
                      className="font-medium text-[#0D6E46] hover:underline"
                    >
                      Confidentialité CDP
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegalTab('cgu')}
                      className="font-medium text-[#0D6E46] hover:underline"
                    >
                      CGU
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegalTab('cgv')}
                      className="font-medium text-[#0D6E46] hover:underline"
                    >
                      CGV
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegalTab('mentions')}
                      className="font-medium text-[#0D6E46] hover:underline"
                    >
                      Mentions légales
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
                >
                  {loading
                    ? 'Création du compte Coach...'
                    : coachPlan === 'COACH_PRO'
                      ? 'Créer mon compte Coach Pro (3 000 F / mois)'
                      : 'Inscrire mon profil Coach gratuitement (0 FCFA)'}
                </button>
              </form>
            )}

            <div className="text-center text-xs text-[#3D5246] pt-2 border-t border-[#E2EBE5]">
              Déjà inscrit ?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setAccountNotFound(false);
                }}
                className="font-semibold text-[#0D6E46] underline"
              >
                Se connecter
              </button>
            </div>
          </div>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyAccount} className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 text-sm text-[#3D5246]">
              <ShieldCheck className="h-5 w-5 text-[#0D6E46] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Compte créé pour <span className="font-semibold text-[#063725]">{verifyIdentifier}</span>. Saisissez le code OTP à 6 chiffres pour activer votre accès et vous connecter directement.
              </span>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-900">
                Saisissez le code envoyé à votre contact enregistré (valable 15 minutes).
              </span>
              <button
                type="button"
                onClick={handleResendVerifyOtp}
                disabled={loading}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 min-h-[36px] shrink-0"
              >
                Renvoyer un code
              </button>
            </div>

            <div>
              <label htmlFor="verify-code" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                Saisissez le code OTP à 6 chiffres
              </label>
              <input
                id="verify-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 font-mono text-base tracking-[0.2em] tabular-nums min-h-[44px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
            >
              {loading ? 'Validation et connexion...' : 'Valider et me connecter'}
            </button>

            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button
                type="button"
                onClick={handleResendVerifyOtp}
                disabled={loading}
                className="inline-flex items-center gap-1.5 font-medium text-[#3D5246] hover:text-[#063725] min-h-[36px]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Générer un nouveau code</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="font-medium text-[#5B7064] underline hover:text-[#063725] min-h-[36px]"
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleResetPasswordSubmit} className="mt-5 space-y-4">
            <p className="text-xs text-[#3D5246] leading-relaxed">
              Saisissez votre adresse email ou votre numéro +221 pour recevoir un code OTP à 6 chiffres et choisir un nouveau mot de passe.
            </p>

            <div>
              <label htmlFor="forgot-id" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                Adresse email ou téléphone (+221) *
              </label>
              <div className="flex gap-2">
                <input
                  id="forgot-id"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (accountNotFound) setAccountNotFound(false);
                  }}
                  placeholder="Adresse email ou téléphone (+221)"
                  className="flex-1 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 text-sm min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={handleRequestResetOtp}
                  disabled={loading}
                  className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[44px] whitespace-nowrap"
                >
                  {resetOtpRequested ? 'Renvoyer code' : 'Envoyer code'}
                </button>
              </div>
            </div>

            {resetOtpRequested && (
              <>
                <div className="rounded-xl border border-[#BFE0CD] bg-[#ECF7F1] px-3.5 py-2.5 text-xs text-[#063725]">
                  Code de réinitialisation envoyé à votre contact enregistré (valable 15 minutes).
                </div>
                <div>
                  <label htmlFor="forgot-code" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                    Code OTP à 6 chiffres *
                  </label>
                  <input
                    id="forgot-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 font-mono text-base tracking-[0.2em] tabular-nums min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="forgot-pwd" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                    Nouveau mot de passe (8 caractères min., lettres et chiffres) *
                  </label>
                  <input
                    id="forgot-pwd"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Saisissez un nouveau mot de passe"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="forgot-pwd-confirm" className="block text-xs font-medium text-[#3D5246] mb-1.5">
                    Confirmer le nouveau mot de passe *
                  </label>
                  <input
                    id="forgot-pwd-confirm"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Confirmez le nouveau mot de passe"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
                >
                  {loading ? 'Réinitialisation...' : 'Réinitialiser et me connecter'}
                </button>
              </>
            )}

            <div className="border-t border-[#E2EBE5] pt-3 text-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="font-medium text-[#3D5246] underline hover:text-[#063725]"
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}

        {mode === 'resubmit' && (
          <form onSubmit={handleCoachResubmitSubmit} className="mt-5 space-y-4">
            {pendingReviewNotice?.reason && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-900">
                <div className="font-semibold">Motif du refus précédent :</div>
                <p className="mt-1 leading-relaxed">{pendingReviewNotice.reason}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Spécialité sportive *</label>
                <input
                  type="text"
                  required
                  value={coachSpecialite}
                  onChange={(e) => setCoachSpecialite(e.target.value)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Qualification *</label>
                <input
                  type="text"
                  required
                  value={coachQualification}
                  onChange={(e) => setCoachQualification(e.target.value)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Zone / Ville *</label>
                <input
                  type="text"
                  required
                  value={coachZone}
                  onChange={(e) => setCoachZone(e.target.value)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
            </div>

            <div className="rounded-2xl obsidian-inset p-4 space-y-3">
              <div className="text-xs font-semibold text-[#063725]">
                Diplôme sportif et justificatif
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Format du diplôme sportif *</label>
                <select
                  value={diplomaType}
                  onChange={(e) => {
                    const next = e.target.value as DiplomaTypeCode;
                    setDiplomaType(next);
                    const spec = SPORT_DIPLOMA_FORMATS[next];
                    if (spec?.acceptedOrganisms[0]) {
                      setIssuingOrganism(spec.acceptedOrganisms[0]);
                    }
                  }}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[42px]"
                >
                  {SPORT_DIPLOMA_LIST.map((spec) => (
                    <option key={spec.code} value={spec.code}>
                      {spec.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Organisme émetteur *</label>
                  <input
                    type="text"
                    required
                    value={issuingOrganism}
                    onChange={(e) => setIssuingOrganism(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">N° de diplôme / licence *</label>
                  <input
                    type="text"
                    required
                    value={diplomaNumber}
                    onChange={(e) => setDiplomaNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Année d’obtention *</label>
                  <input
                    type="number"
                    required
                    min={1980}
                    max={new Date().getFullYear()}
                    value={issueYear}
                    onChange={(e) => setIssueYear(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">
                  Remplacer le justificatif (optionnel si votre document actuel est déjà conforme)
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#BFE0CD] bg-white px-3.5 py-3 cursor-pointer hover:border-[#0D6E46]">
                  <span className="flex items-center gap-2.5 min-w-0 text-xs text-[#3D5246]">
                    {diplomaFile ? (
                      <FileText className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />
                    ) : (
                      <Upload className="h-4 w-4 text-[#5B7064] shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {diplomaFile
                        ? `${diplomaFile.name} (${Math.max(1, Math.round(diplomaFile.sizeBytes / 1024))} Ko)`
                        : existingDiplomaFilename
                          ? `Document conservé : ${existingDiplomaFilename}`
                          : 'Sélectionner un nouveau PDF, JPG, PNG ou WEBP'}
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold text-[#0D6E46] shrink-0">
                    {diplomaFile ? 'Changer' : 'Remplacer'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleDiplomaFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl obsidian-inset p-4 space-y-3">
              <div className="text-xs font-semibold text-[#063725]">
                Conformité réglementaire (Carte pro, RC Pro, Statut)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">N° Carte professionnelle *</label>
                  <input
                    type="text"
                    required
                    value={proCardNumber}
                    onChange={(e) => setProCardNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Validité carte pro *</label>
                  <input
                    type="date"
                    required
                    value={proCardExpiry}
                    onChange={(e) => setProCardExpiry(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Assureur RC Pro *</label>
                  <input
                    type="text"
                    required
                    value={rcProInsurer}
                    onChange={(e) => setRcProInsurer(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">N° Police RC Pro *</label>
                  <input
                    type="text"
                    required
                    value={rcProPolicyNumber}
                    onChange={(e) => setRcProPolicyNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Statut juridique *</label>
                  <select
                    value={legalStatus}
                    onChange={(e) => setLegalStatus(e.target.value as CoachLegalStatusCode)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 text-xs min-h-[40px]"
                  >
                    {COACH_LEGAL_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Immatriculation (SIRET / NINEA / RNA) *</label>
                  <input
                    type="text"
                    required
                    value={businessRegNumber}
                    onChange={(e) => setBusinessRegNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white text-[#063725] px-3 py-2 font-mono text-xs min-h-[40px]"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-[#D5E2DA] bg-white p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={honorabilityAttested}
                  onChange={(e) => setHonorabilityAttested(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#0D6E46]"
                />
                <span className="text-[11px] text-[#3D5246] leading-relaxed">
                  Je confirme l’exactitude des pièces corrigées et maintiens mon attestation sur l’honneur d’honorabilité.
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="rounded-full border border-[#C3D6CA] bg-[#F1F6F3] px-4 py-2.5 text-sm font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-full bg-[#0D6E46] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
              >
                {loading ? 'Envoi du dossier corrigé...' : 'Resoumettre mon dossier pour étude'}
              </button>
            </div>
          </form>
        )}
      </div>

      <LegalModal
        open={legalTab !== null}
        activeTab={legalTab || 'confidentialite'}
        onChangeTab={(next) => setLegalTab(next)}
        onClose={() => setLegalTab(null)}
      />
    </div>
  );
};
