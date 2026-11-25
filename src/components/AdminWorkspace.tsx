import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookCheck,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ApiError,
  apiRequest,
  clearAllWorkspaceCaches,
  clearSessionToken,
  getSessionToken,
  readJsonCache,
  writeJsonCache,
} from '../lib/api';
import { ALL_SPORT_CODES, LEVEL_LABELS, SPORTS_CONFIG } from '../data/sportsConfig';
import { COACH_LEGAL_STATUS_OPTIONS } from '../data/sportsDiplomas';
import { LegalFooter } from './LegalFooter';
import type {
  AdminFinancesPayload,
  AdminSystemOverviewPayload,
  AthleteLevel,
  AthleteStatus,
  AuditLogEntry,
  CoachDocumentSummary,
  ExerciseItem,
  PaymentTransactionCategory,
  PaymentTransactionMethod,
  PaymentTransactionStatus,
  SportCode,
  UserRole,
  ValidationStatus,
} from '../types';

const ADMIN_OVERVIEW_CACHE_KEY = 'terrain_plus_admin_overview_v1';

type AdminTab = 'overview' | 'finances' | 'comptes' | 'contenus';

interface AdminUserRow {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: UserRole;
  statut: AthleteStatus;
  is_minor: number;
  verified: number;
  sport_code: SportCode | null;
  niveau: AthleteLevel | null;
  plan_tier?: 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE';
  plan_fee_fcfa?: number;
  assigned_coach_id: number | null;
}

interface AdminCoachRow {
  id: number;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  statut?: AthleteStatus;
  verified?: number;
  specialite: string;
  qualification: string;
  zone: string;
  coach_plan?: string;
  verification_status?: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
  rejection_reason?: string | null;
  pro_card_number?: string | null;
  pro_card_expiry?: string | null;
  rc_pro_insurer?: string | null;
  rc_pro_policy_number?: string | null;
  legal_status?: string | null;
  business_reg_number?: string | null;
  honorability_attested?: number | boolean;
  document?: CoachDocumentSummary | null;
}

interface AdminSessionRow {
  id: number;
  sport_code: SportCode;
  titre: string;
  niveau: AthleteLevel;
  duree_min: number;
  objectif: string;
  prevention_focus?: string;
  access_tier?: 'ESSENTIEL' | 'PROGRESSION';
  exercises_json?: string;
  relue_par: string | null;
  validation_status: ValidationStatus;
  proposee_par_nom: string | null;
}

interface AdminOverviewResponse {
  users: AdminUserRow[];
  coaches: AdminCoachRow[];
  sessions: AdminSessionRow[];
  auditLogs: AuditLogEntry[];
  systemOverview?: AdminSystemOverviewPayload;
}

interface EditableExercise {
  id: string;
  nom: string;
  consigneFr: string;
  consigneWo: string;
  mode: 'duree' | 'repetitions';
  dureeSec: number;
  repetitions: number;
  reposSec: number;
}

function makeBlankExercise(idx = 1): EditableExercise {
  return {
    id: `ex-${Date.now()}-${idx}`,
    nom: '',
    consigneFr: '',
    consigneWo: 'Toppal ndigal yi ci ndànk.',
    mode: 'duree',
    dureeSec: 40,
    repetitions: 12,
    reposSec: 20,
  };
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const escapeCell = (val: string | number | boolean | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\r\n;]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [cachedAdmin] = useState<AdminOverviewResponse | null>(() =>
    readJsonCache<AdminOverviewResponse>(
      ADMIN_OVERVIEW_CACHE_KEY,
      (v): v is AdminOverviewResponse => {
        if (!v || typeof v !== 'object') return false;
        const cand = v as AdminOverviewResponse;
        if (!Array.isArray(cand.users) || !Array.isArray(cand.coaches)) return false;
        if (cand.systemOverview && (!cand.systemOverview.monetization || !Array.isArray(cand.systemOverview.sportBreakdown))) {
          return false;
        }
        return true;
      }
    )
  );
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewResponse | null>(cachedAdmin);
  const [financesData, setFinancesData] = useState<AdminFinancesPayload | null>(null);
  const [financesLoading, setFinancesLoading] = useState(false);
  const [loading, setLoading] = useState(!cachedAdmin);
  const [refreshingSystem, setRefreshingSystem] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reviewerBySession, setReviewerBySession] = useState<Record<number, string>>({});

  // Comptes & Dossiers filtering
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');

  // Edit User modal
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editUserRole, setEditUserRole] = useState<UserRole>('ATHLETE');
  const [editUserStatut, setEditUserStatut] = useState<AthleteStatus>('ACTIF');
  const [editUserSport, setEditUserSport] = useState<SportCode>('football');
  const [editUserNiveau, setEditUserNiveau] = useState<AthleteLevel>('debutant');
  const [editUserPlan, setEditUserPlan] = useState<'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE'>('ESSENTIEL');
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Create Admin modal
  const [adminCreateOpen, setAdminCreateOpen] = useState(false);
  const [newAdminPrenom, setNewAdminPrenom] = useState('');
  const [newAdminNom, setNewAdminNom] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Coach document inspection modal state
  const [inspectedCoach, setInspectedCoach] = useState<AdminCoachRow | null>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState<string | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  // Finances manual transaction & payout forms
  const [txLabel, setTxLabel] = useState('');
  const [txCategory, setTxCategory] = useState<PaymentTransactionCategory>('COACH_PRIVATE_FEE');
  const [txAmount, setTxAmount] = useState('5000');
  const [txMethod, setTxMethod] = useState<PaymentTransactionMethod>('WAVE');
  const [txStatus, setTxStatus] = useState<PaymentTransactionStatus>('PAYE');
  const [txUserId, setTxUserId] = useState('');
  const [txCoachId, setTxCoachId] = useState('');
  const [txReference, setTxReference] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [savingTx, setSavingTx] = useState(false);
  const [payoutMethodByCoach, setPayoutMethodByCoach] = useState<Record<number, 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT' | 'ESPECES'>>({});
  const [payoutRefByCoach, setPayoutRefByCoach] = useState<Record<number, string>>({});

  // Session create / edit modal
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [sessSport, setSessSport] = useState<SportCode>('football');
  const [sessTitre, setSessTitre] = useState('');
  const [sessNiveau, setSessNiveau] = useState<AthleteLevel>('debutant');
  const [sessDuree, setSessDuree] = useState('30');
  const [sessObjectif, setSessObjectif] = useState('');
  const [sessAccessTier, setSessAccessTier] = useState<'ESSENTIEL' | 'PROGRESSION'>('ESSENTIEL');
  const [sessValidationStatus, setSessValidationStatus] = useState<ValidationStatus>('VALIDEE');
  const [sessReluePar, setSessReluePar] = useState('Direction Technique Terrain+');
  const [sessExercises, setSessExercises] = useState<EditableExercise[]>([makeBlankExercise(1)]);
  const [savingSession, setSavingSession] = useState(false);

  const loadFinances = useCallback(async () => {
    setFinancesLoading(true);
    try {
      const res = await apiRequest<AdminFinancesPayload>('/api/admin/finances');
      setFinancesData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      setNotice(err instanceof Error ? err.message : 'Impossible de charger les finances.');
    } finally {
      setFinancesLoading(false);
    }
  }, [onSessionExpired]);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await apiRequest<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      writeJsonCache(ADMIN_OVERVIEW_CACHE_KEY, res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      const cached = readJsonCache<AdminOverviewResponse>(ADMIN_OVERVIEW_CACHE_KEY);
      if (cached) {
        setData(cached);
        setNotice('Connexion instable ou hors ligne : affichage des dernières données synchronisées.');
      } else {
        setNotice(err instanceof Error ? err.message : 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadAdmin();
    loadFinances();
  }, [loadAdmin, loadFinances]);

  useEffect(() => {
    if (tab === 'finances') {
      void loadFinances();
    }
  }, [tab, loadFinances]);

  useEffect(() => {
    if (tab !== 'overview') return;
    let cancelled = false;

    const refreshRealtimeOverview = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const freshOverview = await apiRequest<AdminSystemOverviewPayload>('/api/admin/system-overview');
        if (cancelled) return;
        setData((prev) => {
          if (!prev) return prev;
          const next = { ...prev, systemOverview: freshOverview };
          writeJsonCache(ADMIN_OVERVIEW_CACHE_KEY, next);
          return next;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAllWorkspaceCaches();
          onSessionExpired();
        }
      }
    };

    const intervalId = window.setInterval(refreshRealtimeOverview, 30_000);
    const onFocusOrVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        void refreshRealtimeOverview();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [tab, onSessionExpired]);

  useEffect(() => {
    if (!inspectedCoach?.document) {
      setDocPreviewUrl(null);
      setDocPreviewError(null);
      setDocPreviewLoading(false);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setDocPreviewLoading(true);
    setDocPreviewError(null);
    setDocPreviewUrl(null);

    const token = getSessionToken();
    fetch(`/api/admin/coach-documents/${inspectedCoach.document.id}/file`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Impossible de charger l’aperçu du document diplôme.');
        }
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setDocPreviewUrl(objectUrl);
      })
      .catch((err) => {
        if (!active) return;
        setDocPreviewError(err instanceof Error ? err.message : 'Erreur de prévisualisation.');
      })
      .finally(() => {
        if (active) setDocPreviewLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inspectedCoach]);

  const handleAssignCoach = async (athleteId: number, coachId: number) => {
    if (!coachId) return;
    try {
      await apiRequest('/api/admin/assign', {
        method: 'POST',
        body: JSON.stringify({ athlete_user_id: athleteId, coach_user_id: coachId }),
      });
      setNotice('Affectation coach-athlète enregistrée et journalisée.');
      await Promise.all([loadAdmin(), loadFinances()]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleStatusChange = async (userId: number, statut: AthleteStatus) => {
    try {
      await apiRequest(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      });
      setNotice('Statut du compte mis à jour.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const openEditUserModal = (u: AdminUserRow) => {
    setEditingUser(u);
    setEditUserRole(u.role);
    setEditUserStatut(u.statut);
    setEditUserSport(u.sport_code || 'football');
    setEditUserNiveau(u.niveau || 'debutant');
    setEditUserPlan(u.plan_tier || 'ESSENTIEL');
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || savingUserEdit) return;
    setSavingUserEdit(true);
    try {
      await apiRequest(`/api/admin/users/${editingUser.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editUserRole,
          statut: editUserStatut,
          sport_code: editUserRole === 'ATHLETE' ? editUserSport : undefined,
          niveau: editUserRole === 'ATHLETE' ? editUserNiveau : undefined,
          plan_tier: editUserRole === 'ATHLETE' ? editUserPlan : undefined,
        }),
      });
      setNotice(`Compte de ${editingUser.prenom} ${editingUser.nom} mis à jour.`);
      setEditingUser(null);
      await Promise.all([loadAdmin(), loadFinances()]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du compte.');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleCreateAdminAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingAdmin) return;
    setCreatingAdmin(true);
    try {
      await apiRequest('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          prenom: newAdminPrenom.trim(),
          nom: newAdminNom.trim(),
          email: newAdminEmail.trim(),
          telephone: newAdminPhone.trim(),
          password: newAdminPassword,
          role: 'ADMIN',
        }),
      });
      setNotice('Compte Administrateur créé avec succès.');
      setAdminCreateOpen(false);
      setNewAdminPrenom('');
      setNewAdminNom('');
      setNewAdminEmail('');
      setNewAdminPhone('');
      setNewAdminPassword('');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Impossible de créer ce compte.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleCoachVerification = async (
    coachUserId: number,
    verificationStatus: 'VERIFIE' | 'EN_ATTENTE' | 'REFUSE',
    options?: { adminReviewNote?: string; rejectionReason?: string; closeModal?: boolean }
  ) => {
    try {
      await apiRequest(`/api/admin/coaches/${coachUserId}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({
          verification_status: verificationStatus,
          admin_review_note: options?.adminReviewNote || undefined,
          rejection_reason: options?.rejectionReason || undefined,
        }),
      });
      setNotice(
        verificationStatus === 'VERIFIE'
          ? 'Dossier coach validé : le compte est désormais actif et visible dans le catalogue.'
          : verificationStatus === 'REFUSE'
            ? 'Dossier coach refusé : accès bloqué et décision journalisée.'
            : 'Dossier coach replacé en étude : accès suspendu jusqu’à validation.'
      );
      if (options?.closeModal) {
        setInspectedCoach(null);
      }
      await Promise.all([loadAdmin(), loadFinances()]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const openCoachInspection = (coach: AdminCoachRow) => {
    setInspectedCoach(coach);
    setReviewNoteInput(coach.document?.admin_review_note || '');
    setRejectionReasonInput(coach.rejection_reason || '');
  };

  const handleReviewSession = async (sessionId: number, status: ValidationStatus) => {
    const reviewer = reviewerBySession[sessionId]?.trim() || '';
    if (status === 'VALIDEE' && !reviewer) {
      setNotice('Indiquez le nom du professionnel relecteur avant de publier la séance.');
      return;
    }
    try {
      await apiRequest(`/api/admin/sessions/${sessionId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          validation_status: status,
          relue_par: reviewer || null,
        }),
      });
      setNotice('Statut de relecture mis à jour.');
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const openNewSessionModal = () => {
    setEditingSessionId(null);
    setSessSport('football');
    setSessTitre('');
    setSessNiveau('debutant');
    setSessDuree('30');
    setSessObjectif('');
    setSessAccessTier('ESSENTIEL');
    setSessValidationStatus('VALIDEE');
    setSessReluePar('Direction Technique Terrain+');
    setSessExercises([makeBlankExercise(1)]);
    setSessionModalOpen(true);
  };

  const openEditSessionModal = (s: AdminSessionRow) => {
    setEditingSessionId(s.id);
    setSessSport(s.sport_code);
    setSessTitre(s.titre);
    setSessNiveau(s.niveau);
    setSessDuree(String(s.duree_min));
    setSessObjectif(s.objectif);
    setSessAccessTier(s.access_tier === 'PROGRESSION' ? 'PROGRESSION' : 'ESSENTIEL');
    setSessValidationStatus(s.validation_status);
    setSessReluePar(s.relue_par || 'Direction Technique Terrain+');
    let parsed: EditableExercise[] = [makeBlankExercise(1)];
    if (s.exercises_json) {
      try {
        const arr = JSON.parse(s.exercises_json) as ExerciseItem[];
        if (Array.isArray(arr) && arr.length > 0) {
          parsed = arr.map((ex, idx) => ({
            id: ex.id || `ex-${idx + 1}`,
            nom: ex.nom || '',
            consigneFr: ex.consigneFr || '',
            consigneWo: ex.consigneWo || 'Toppal ndigal yi ci ndànk.',
            mode: ex.mode === 'repetitions' ? 'repetitions' : 'duree',
            dureeSec: Number(ex.dureeSec || 40),
            repetitions: Number(ex.repetitions || 12),
            reposSec: Number(ex.reposSec || 20),
          }));
        }
      } catch {
        // Keep single blank fallback
      }
    }
    setSessExercises(parsed);
    setSessionModalOpen(true);
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSession) return;
    setSavingSession(true);
    try {
      const payload = {
        sport_code: sessSport,
        titre: sessTitre.trim(),
        niveau: sessNiveau,
        duree_min: Number(sessDuree) || 30,
        objectif: sessObjectif.trim(),
        prevention_focus: 'Général',
        access_tier: sessAccessTier,
        validation_status: sessValidationStatus,
        relue_par: sessReluePar.trim() || 'Direction Technique Terrain+',
        exercises: sessExercises.map((ex) => ({
          id: ex.id,
          nom: ex.nom.trim(),
          consigneFr: ex.consigneFr.trim(),
          consigneWo: ex.consigneWo.trim() || 'Toppal ndigal yi ci ndànk.',
          mode: ex.mode,
          dureeSec: Number(ex.dureeSec) || 40,
          repetitions: ex.mode === 'repetitions' ? Number(ex.repetitions) || 12 : undefined,
          reposSec: Number(ex.reposSec) || 20,
        })),
      };
      if (editingSessionId) {
        await apiRequest(`/api/admin/sessions/${editingSessionId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotice('Séance officielle mise à jour.');
      } else {
        await apiRequest('/api/admin/sessions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice('Nouvelle séance officielle créée et ajoutée à la bibliothèque.');
      }
      setSessionModalOpen(false);
      await loadAdmin();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde de la séance.');
    } finally {
      setSavingSession(false);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTx) return;
    setSavingTx(true);
    try {
      await apiRequest('/api/admin/transactions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: txUserId ? Number(txUserId) : null,
          coach_user_id: txCoachId ? Number(txCoachId) : null,
          category: txCategory,
          label: txLabel.trim(),
          amount_fcfa: Number(txAmount),
          payment_method: txMethod,
          reference: txReference.trim() || null,
          status: txStatus,
          notes: txNotes.trim() || null,
        }),
      });
      setTxLabel('');
      setTxReference('');
      setTxNotes('');
      setNotice('Transaction enregistrée dans le grand livre.');
      await loadFinances();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors de la création de la transaction.');
    } finally {
      setSavingTx(false);
    }
  };

  const handleUpdateTransactionStatus = async (txId: number, status: PaymentTransactionStatus) => {
    try {
      await apiRequest(`/api/admin/transactions/${txId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice('Statut de transaction mis à jour.');
      await loadFinances();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleRecordCoachPayout = async (
    coachUserId: number,
    status: 'VERSE' | 'EN_ATTENTE'
  ) => {
    if (!financesData) return;
    try {
      await apiRequest('/api/admin/coach-payouts', {
        method: 'POST',
        body: JSON.stringify({
          coach_user_id: coachUserId,
          period_month: financesData.currentPeriodMonth,
          payment_method: payoutMethodByCoach[coachUserId] || 'WAVE',
          reference: payoutRefByCoach[coachUserId]?.trim() || null,
          status,
        }),
      });
      setNotice(
        status === 'VERSE'
          ? 'Reversement coach enregistré comme versé.'
          : 'Reversement coach enregistré en attente.'
      );
      await loadFinances();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur lors du reversement.');
    }
  };

  const handleUpdatePayoutStatus = async (payoutId: number, status: 'VERSE' | 'EN_ATTENTE') => {
    try {
      await apiRequest(`/api/admin/coach-payouts/${payoutId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice('Statut du reversement mis à jour.');
      await loadFinances();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const handleExportUsersCsv = () => {
    if (!data) return;
    const rows = data.users.map((u) => [
      u.id,
      u.prenom,
      u.nom,
      u.email,
      u.telephone,
      u.role,
      u.statut,
      u.sport_code ? SPORTS_CONFIG[u.sport_code].nom : '',
      u.niveau || '',
      u.plan_tier || '',
      u.plan_fee_fcfa ?? '',
      u.is_minor ? 'Oui' : 'Non',
    ]);
    downloadCsv(
      `terrain-plus-utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Rôle', 'Statut', 'Sport', 'Niveau', 'Formule', 'Tarif FCFA', 'Mineur'],
      rows
    );
    setNotice('Export CSV des utilisateurs téléchargé.');
  };

  const handleExportAuditCsv = () => {
    if (!data) return;
    const rows = data.auditLogs.map((l) => [
      l.id,
      l.created_at,
      l.actor_nom,
      l.actor_role,
      l.action,
      l.athlete_nom || '',
      l.resource,
    ]);
    downloadCsv(
      `terrain-plus-journal-cdp-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Horodatage', 'Acteur', 'Rôle', 'Action', 'Athlète concerné', 'Ressource'],
      rows
    );
    setNotice('Journal d’audit CDP exporté en CSV.');
  };

  const handleExportTransactionsCsv = () => {
    if (!financesData) return;
    const rows = financesData.transactions.map((t) => [
      t.id,
      t.created_at,
      t.category,
      t.label,
      t.user_nom || '',
      t.coach_nom || '',
      t.amount_fcfa,
      t.platform_share_fcfa,
      t.coach_share_fcfa,
      t.payment_method,
      t.reference || '',
      t.status,
      t.notes || '',
    ]);
    downloadCsv(
      `terrain-plus-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'ID',
        'Date',
        'Catégorie',
        'Libellé',
        'Utilisateur',
        'Coach',
        'Montant FCFA',
        'Part Plateforme FCFA',
        'Part Coach FCFA',
        'Moyen',
        'Référence',
        'Statut',
        'Notes',
      ],
      rows
    );
    setNotice('Export CSV des transactions téléchargé.');
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    clearAllWorkspaceCaches();
    onLoggedOut();
  };

  const handleRefreshOverview = async () => {
    setRefreshingSystem(true);
    try {
      const [freshOverview] = await Promise.all([
        apiRequest<AdminSystemOverviewPayload>('/api/admin/system-overview'),
        loadFinances(),
      ]);
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, systemOverview: freshOverview };
        writeJsonCache(ADMIN_OVERVIEW_CACHE_KEY, next);
        return next;
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Actualisation impossible.');
    } finally {
      setRefreshingSystem(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userSearch.trim().toLowerCase();
    return data.users.filter((u) => {
      if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.telephone.toLowerCase().includes(q)
      );
    });
  }, [data, userSearch, userRoleFilter]);

  if (loading && !data) {
    return (
      <div className="min-h-screen obsidian-ambient flex items-center justify-center text-sm text-[#3D5246]">
        Chargement de l'administration Terrain+...
      </div>
    );
  }

  const pendingSessionsCount = data?.sessions.filter((s) => s.validation_status === 'EN_RELECTURE').length || 0;
  const pendingCoachesCount =
    data?.coaches.filter((c) => c.verification_status === 'EN_ATTENTE').length || 0;
  const pendingFinancesCount = financesData
    ? financesData.transactions.filter((t) => t.status === 'EN_ATTENTE').length +
      financesData.monthlyCoachEstimates.filter((c) => c.net_payout_fcfa > 0 && c.existing_payout?.status !== 'VERSE').length
    : 0;

  const adminNavItems: Array<{
    id: AdminTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'overview',
      label: 'Vue d’ensemble',
      mobileLabel: 'Vue',
      icon: BarChart3,
    },
    {
      id: 'finances',
      label: 'Finances & Coachs',
      mobileLabel: 'Finances',
      icon: Wallet,
      badge: pendingFinancesCount,
    },
    {
      id: 'comptes',
      label: 'Comptes & Dossiers',
      mobileLabel: 'Dossiers',
      icon: Users,
      badge: pendingCoachesCount,
    },
    {
      id: 'contenus',
      label: 'Contenus & Séances',
      mobileLabel: 'Contenus',
      icon: BookCheck,
      badge: pendingSessionsCount,
    },
  ];

  return (
    <div className="min-h-screen obsidian-ambient text-[#063725] flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-[#D5E2DA] bg-white">
        <div className="p-5 border-b border-[#E2EBE5]">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-9 w-auto object-contain"
          />
          <div className="mt-2.5 text-xs font-medium text-[#5B7064]">Administration & Gouvernance</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] text-left transition-colors ${
                  active
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#3D5246] hover:bg-[#ECF7F1] hover:text-[#063725]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 rounded-md px-1.5 py-0.5 ${
                      active ? 'bg-white text-[#0D6E46]' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2EBE5] space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#3D5246]">
            <ShieldCheck className="h-4 w-4 text-[#0D6E46] shrink-0" aria-hidden="true" />
            <span>Traçabilité CDP & gestion active</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-medium text-[#063725] hover:bg-[#E7F1EC] min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Top Header with Hamburger Menu */}
        <header className="md:hidden border-b border-[#D5E2DA] bg-white/95 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 h-[52px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={mobileMenuOpen}
                className="p-2 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3] min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
              <img
                src="/brand/terrain-logo.png"
                alt="Terrain+"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-7 w-auto object-contain shrink-0"
              />
              <span className="text-xs font-semibold text-[#5B7064] truncate">
                · Administration
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-[#3D5246] hover:text-[#063725] min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.nav
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                aria-label="Menu administration mobile"
                className="border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-1.5"
              >
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold min-h-[40px] ${
                        active ? 'bg-[#0D6E46] text-white' : 'bg-[#F6F8F5] text-[#063725]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && item.badge > 0 ? (
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-xs font-semibold text-[#3D5246] min-h-[40px]"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Déconnexion</span>
                </button>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <AnimatePresence>
              {notice && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="obsidian-card rounded-xl px-4 py-3 text-sm text-[#063725] flex items-center justify-between gap-3"
                >
                  <span>{notice}</span>
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    className="text-xs font-semibold text-[#0D6E46] hover:text-[#095637] shrink-0"
                  >
                    Fermer
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >

          {/* ---------------- VUE D'ENSEMBLE ---------------- */}
          {tab === 'overview' && data && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">
                    Vue d’ensemble
                  </h1>
                  <p className="text-sm text-[#3D5246]">
                    Statistiques métier en temps réel : athlètes inscrits, coachs actifs, ratio payants vs gratuits et chiffre d’affaires mensuel estimé.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {data.systemOverview?.generatedAt && (
                    <span className="font-mono text-xs tabular-nums text-[#5B7064]">
                      Temps réel · {new Date(data.systemOverview.generatedAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshOverview}
                    disabled={refreshingSystem}
                    className="inline-flex items-center gap-2 rounded-full border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] min-h-[42px] shrink-0"
                  >
                    <RefreshCw className={`h-4 w-4 text-[#0D6E46] ${refreshingSystem ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>{refreshingSystem ? 'Actualisation...' : 'Actualiser les données'}</span>
                  </button>
                </div>
              </div>

              {data.systemOverview ? (
                <>
                  {/* 4 Real-Time Business KPIs */}
                  {(() => {
                    const m = data.systemOverview.monetization;
                    const p = data.systemOverview.platformTotals;
                    const ratioTotal = m.totalPaidUsers + m.totalFreeUsers;
                    const paidPct = ratioTotal > 0 ? Math.round((m.totalPaidUsers / ratioTotal) * 100) : 0;
                    const freePct = ratioTotal > 0 ? 100 - paidPct : 0;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: 0 }}
                          className="obsidian-card rounded-2xl p-5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-[#5B7064]">
                            <span>Athlètes inscrits</span>
                            <Users className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                          </div>
                          <div className="font-mono text-2xl font-bold tabular-nums text-[#063725]">
                            {p.athletesCount.toLocaleString('fr-FR')}
                          </div>
                          <div className="text-xs font-mono text-[#3D5246] tabular-nums">
                            {p.totalUsers.toLocaleString('fr-FR')} comptes totaux
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: 0.04 }}
                          className="obsidian-card rounded-2xl p-5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-[#5B7064]">
                            <span>Coachs actifs</span>
                            <ShieldCheck className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                          </div>
                          <div className="font-mono text-2xl font-bold tabular-nums text-[#063725]">
                            {p.coachesVerifiedCount.toLocaleString('fr-FR')}
                          </div>
                          <div className="text-xs font-mono text-[#3D5246] tabular-nums">
                            {p.coachesPendingCount} en attente · {p.coachesRefusedCount} refusés
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: 0.08 }}
                          className="obsidian-card rounded-2xl p-5 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs text-[#5B7064]">
                            <span>Ratio payants vs gratuits</span>
                            <Users className="h-4 w-4 text-[#B45309]" aria-hidden="true" />
                          </div>
                          <div className="font-mono text-2xl font-bold tabular-nums text-[#063725]">
                            {paidPct}% / {freePct}%
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#E2EBE5] overflow-hidden" aria-hidden="true">
                            <motion.div
                              className="h-full rounded-full bg-[#0D6E46]"
                              initial={{ width: 0 }}
                              animate={{ width: `${paidPct}%` }}
                              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </div>
                          <div className="text-xs font-mono text-[#3D5246] tabular-nums">
                            {m.totalPaidUsers} payants · {m.totalFreeUsers} gratuits
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: 0.12 }}
                          className="obsidian-card rounded-2xl p-5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-[#5B7064]">
                            <span>Estimation CA mensuel</span>
                            <Wallet className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
                          </div>
                          <div className="font-mono text-2xl font-bold tabular-nums text-[#0D6E46]">
                            {m.netPlatformMonthlyRevenueFcfa.toLocaleString('fr-FR')} FCFA
                          </div>
                          <div className="text-xs font-mono text-[#3D5246] tabular-nums">
                            Brut : {m.grossMonthlyVolumeFcfa.toLocaleString('fr-FR')} F · Coachs : {m.coachPayoutsMonthlyFcfa.toLocaleString('fr-FR')} F
                          </div>
                        </motion.div>
                      </div>
                    );
                  })()}

                  {/* Monetization Table & 6-Sport Distribution */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 obsidian-card rounded-2xl overflow-x-auto">
                      <div className="px-5 py-4 border-b border-[#E2EBE5] flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-base font-semibold text-[#063725]">
                            Répartition Gratuits / Payants & Valeur mensuelle perçue
                          </h2>
                          <p className="text-xs text-[#5B7064]">
                            Calculée en direct à partir des formules actives en base (FCFA / mois).
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold tabular-nums text-[#0D6E46]">
                          Net : {data.systemOverview.monetization.netPlatformMonthlyRevenueFcfa.toLocaleString('fr-FR')} FCFA/mois
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Formule / Segment</th>
                            <th className="px-4 py-2.5 font-medium">Tarif unitaire</th>
                            <th className="px-4 py-2.5 font-medium text-right">Comptes</th>
                            <th className="px-4 py-2.5 font-medium text-right">Part perçue / mois</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2EBE5]">
                          <tr className="hover:bg-[#F6F8F5]">
                            <td className="px-4 py-2.5 font-medium text-[#063725]">Athlètes · Essentiel (Gratuit)</td>
                            <td className="px-4 py-2.5 font-mono text-[#5B7064]">0 FCFA</td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#063725]">
                              {data.systemOverview.monetization.freeAthletesCount}
                            </td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#5B7064]">0 FCFA</td>
                          </tr>
                          {(data.systemOverview.monetization.progressionMonthlyCount > 0 ||
                            data.systemOverview.monetization.progressionQuarterlyCount > 0) && (
                            <tr className="hover:bg-[#F6F8F5]">
                              <td className="px-4 py-2.5 font-medium text-[#063725]">Athlètes · Ancienne formule</td>
                              <td className="px-4 py-2.5 font-mono text-[#3D5246]">Héritée</td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#063725]">
                                {data.systemOverview.monetization.progressionMonthlyCount +
                                  data.systemOverview.monetization.progressionQuarterlyCount}
                              </td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#0D6E46]">
                                {data.systemOverview.monetization.breakdown.progressionMonthlyRevenueFcfa.toLocaleString('fr-FR')} FCFA
                              </td>
                            </tr>
                          )}
                          <tr className="hover:bg-[#F6F8F5]">
                            <td className="px-4 py-2.5 font-medium text-[#063725]">Athlètes · Suivi Coach</td>
                            <td className="px-4 py-2.5 font-mono text-[#3D5246]">5 000 F / mois (20 % plat.)</td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#063725]">
                              {data.systemOverview.monetization.coachPrivateAthletesCount}
                            </td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#0D6E46]">
                              {data.systemOverview.monetization.breakdown.coachCommissionRevenueFcfa.toLocaleString('fr-FR')} FCFA
                            </td>
                          </tr>
                          <tr className="hover:bg-[#F6F8F5]">
                            <td className="px-4 py-2.5 font-medium text-[#063725]">Coachs vérifiés (Modèle 80 / 20)</td>
                            <td className="px-4 py-2.5 font-mono text-[#5B7064]">0 FCFA fixe</td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold text-[#063725]">
                              {data.systemOverview.monetization.freeCoachesCount + data.systemOverview.monetization.paidCoachesCount}
                            </td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#5B7064]">
                              {data.systemOverview.monetization.breakdown.coachProLicenseRevenueFcfa > 0
                                ? `${data.systemOverview.monetization.breakdown.coachProLicenseRevenueFcfa.toLocaleString('fr-FR')} FCFA`
                                : '0 FCFA'}
                            </td>
                          </tr>
                        </tbody>
                        <tfoot className="border-t border-[#D5E2DA] bg-[#ECF7F1]/70 font-semibold text-[#063725]">
                          <tr>
                            <td className="px-4 py-3" colSpan={2}>
                              Total consolidé mensuel (Volume brut : {data.systemOverview.monetization.grossMonthlyVolumeFcfa.toLocaleString('fr-FR')} FCFA · Reversé coachs : {data.systemOverview.monetization.coachPayoutsMonthlyFcfa.toLocaleString('fr-FR')} FCFA)
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-right">
                              {data.systemOverview.monetization.totalFreeUsers + data.systemOverview.monetization.totalPaidUsers}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-right text-[#0D6E46]">
                              {data.systemOverview.monetization.netPlatformMonthlyRevenueFcfa.toLocaleString('fr-FR')} FCFA
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="lg:col-span-5 obsidian-card rounded-2xl p-5 flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-base font-semibold text-[#063725]">Répartition sur les 6 sports</h2>
                          <span className="font-mono text-xs tabular-nums text-[#5B7064]">
                            {data.systemOverview.platformTotals.athletesCount} athlètes
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {ALL_SPORT_CODES.map((code) => {
                            const entry = data.systemOverview?.sportBreakdown.find((s) => s.sport_code === code);
                            const count = entry?.athletes_count || 0;
                            const totalAthletes = Math.max(1, data.systemOverview?.platformTotals.athletesCount || 0);
                            const pct = Math.round((count / totalAthletes) * 100);
                            return (
                              <div key={code} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-[#063725]">{SPORTS_CONFIG[code].nom}</span>
                                  <span className="font-mono tabular-nums text-[#3D5246]">
                                    {count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-[#E2EBE5] overflow-hidden">
                                  <div className="h-full bg-[#0D6E46]" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E2EBE5] grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-[#5B7064]">Séances réalisées</div>
                          <div className="font-mono text-base font-bold tabular-nums text-[#063725]">
                            {data.systemOverview.platformTotals.completedSessionsCount.toLocaleString('fr-FR')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#5B7064]">Évaluations enregistrées</div>
                          <div className="font-mono text-base font-bold tabular-nums text-[#063725]">
                            {data.systemOverview.platformTotals.evaluationsCount.toLocaleString('fr-FR')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Operational Action Queues */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setTab('comptes')}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        data.systemOverview.queues.pendingCoachDossiers > 0
                          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
                          : 'border-[#D5E2DA] bg-white hover:bg-[#F6F8F5]'
                      }`}
                    >
                      <div className="text-xs font-medium text-[#3D5246]">Dossiers Coachs en étude</div>
                      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#063725]">
                        {data.systemOverview.queues.pendingCoachDossiers}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-[#0D6E46]">
                        {data.systemOverview.queues.pendingCoachDossiers > 0
                          ? 'Ouvrir l’étude des diplômes ->'
                          : 'Aucun dossier en attente'}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTab('contenus')}
                      className="obsidian-card rounded-2xl p-4 text-left hover:bg-[#F6F8F5] transition-colors"
                    >
                      <div className="text-xs font-medium text-[#3D5246]">Séances en relecture</div>
                      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#063725]">
                        {data.systemOverview.queues.pendingSessionsReview}
                      </div>
                      <div className="mt-1 text-[11px] text-[#5B7064]">Validation technique & bibliothèque</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTab('finances')}
                      className="obsidian-card rounded-2xl p-4 text-left hover:bg-[#F6F8F5] transition-colors"
                    >
                      <div className="text-xs font-medium text-[#3D5246]">Encaissements enregistrés</div>
                      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0D6E46]">
                        {(financesData?.summary.collectedTotalFcfa ?? 0).toLocaleString('fr-FR')} F
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-[#0D6E46]">
                        Ouvrir Finances & Reversements -&gt;
                      </div>
                    </button>
                  </div>
                </>
              ) : (
                <div className="obsidian-card rounded-2xl p-6 text-sm text-[#3D5246]">
                  Données indisponibles hors ligne. Cliquez sur « Actualiser les données » une fois reconnecté.
                </div>
              )}
            </div>
          )}

          {/* ---------------- FINANCES & REVERSIONS COACH ---------------- */}
          {tab === 'finances' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">
                    Finances, paiements et reversements coachs
                  </h1>
                  <p className="text-sm text-[#3D5246]">
                    Grand livre des encaissements Wave / Orange Money / manuels et suivi mensuel des parts reversées aux coachs.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleExportTransactionsCsv}
                    disabled={!financesData || financesData.transactions.length === 0}
                    className="inline-flex items-center gap-2 rounded-full border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] disabled:opacity-50 min-h-[40px]"
                  >
                    <Download className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                    <span>Exporter Transactions (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadFinances}
                    disabled={financesLoading}
                    className="inline-flex items-center gap-2 rounded-full border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] min-h-[40px]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-[#0D6E46] ${financesLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>Actualiser</span>
                  </button>
                </div>
              </div>

              {financesData ? (
                <>
                  {/* Finance KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="obsidian-card rounded-2xl p-4 space-y-1">
                      <div className="text-[11px] text-[#5B7064]">Encaissé total</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-[#063725]">
                        {financesData.summary.collectedTotalFcfa.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                    <div className="obsidian-card rounded-2xl p-4 space-y-1">
                      <div className="text-[11px] text-[#5B7064]">Revenu net plateforme</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-[#0D6E46]">
                        {financesData.summary.collectedPlatformFcfa.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                    <div className="obsidian-card rounded-2xl p-4 space-y-1">
                      <div className="text-[11px] text-[#5B7064]">En attente / Échoués</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-amber-800">
                        {financesData.summary.pendingTotalFcfa.toLocaleString('fr-FR')} F
                      </div>
                      <div className="text-[11px] font-mono text-[#5B7064]">
                        {financesData.summary.failedCount} échec(s)
                      </div>
                    </div>
                    <div className="obsidian-card rounded-2xl p-4 space-y-1">
                      <div className="text-[11px] text-[#5B7064]">À reverser ({financesData.currentPeriodMonth})</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-[#063725]">
                        {financesData.summary.estimatedMonthlyCoachPayoutFcfa.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                    <div className="obsidian-card rounded-2xl p-4 space-y-1">
                      <div className="text-[11px] text-[#5B7064]">Déjà versé ce mois</div>
                      <div className="font-mono text-xl font-bold tabular-nums text-[#0D6E46]">
                        {financesData.summary.paidOutCurrentMonthFcfa.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                  </div>

                  {/* Monthly Coach Payouts Table */}
                  <div className="obsidian-card rounded-2xl overflow-x-auto">
                    <div className="px-5 py-4 border-b border-[#E2EBE5] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-[#063725]">
                          Reversements mensuels des coachs · Période {financesData.currentPeriodMonth}
                        </h2>
                        <p className="text-xs text-[#5B7064]">
                          Calcul automatique sur les athlètes affectés actifs (5 000 F/athlète : 80 % reversés au coach, 20 % plateforme).
                        </p>
                      </div>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                        <tr>
                          <th className="px-4 py-3 font-medium">Coach</th>
                          <th className="px-4 py-3 font-medium">Formule</th>
                          <th className="px-4 py-3 font-medium text-right">Athlètes</th>
                          <th className="px-4 py-3 font-medium text-right">Brut</th>
                          <th className="px-4 py-3 font-medium text-right">Commission</th>
                          <th className="px-4 py-3 font-medium text-right">Net à reverser</th>
                          <th className="px-4 py-3 font-medium">Statut & Versement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2EBE5]">
                        {financesData.monthlyCoachEstimates.map((est) => {
                          const existing = est.existing_payout;
                          return (
                            <tr key={est.coach_user_id} className="hover:bg-[#F6F8F5]">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-[#063725]">{est.coach_nom}</div>
                                <div className="font-mono text-[11px] text-[#5B7064]">{est.coach_telephone}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-[#3D5246]">{est.coach_plan}</td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right font-semibold text-[#063725]">
                                {est.active_athletes_count}
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right text-[#3D5246]">
                                {est.gross_amount_fcfa.toLocaleString('fr-FR')} F
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right text-[#5B7064]">
                                {est.commission_fcfa.toLocaleString('fr-FR')} F
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right font-bold text-[#0D6E46]">
                                {est.net_payout_fcfa.toLocaleString('fr-FR')} F
                              </td>
                              <td className="px-4 py-3">
                                {existing ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                                        existing.status === 'VERSE'
                                          ? 'border border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                                          : 'border border-amber-200 bg-amber-50 text-amber-800'
                                      }`}
                                    >
                                      {existing.status} · {existing.payment_method}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdatePayoutStatus(
                                          existing.id,
                                          existing.status === 'VERSE' ? 'EN_ATTENTE' : 'VERSE'
                                        )
                                      }
                                      className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1 text-[11px] font-medium text-[#063725] hover:bg-[#ECF7F1]"
                                    >
                                      {existing.status === 'VERSE' ? 'Repasser en attente' : 'Marquer versé'}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <select
                                      value={payoutMethodByCoach[est.coach_user_id] || 'WAVE'}
                                      onChange={(e) =>
                                        setPayoutMethodByCoach((prev) => ({
                                          ...prev,
                                          [est.coach_user_id]: e.target.value as 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT' | 'ESPECES',
                                        }))
                                      }
                                      className="rounded-lg border border-[#C3D6CA] bg-white px-2 py-1 text-[11px] text-[#063725]"
                                    >
                                      <option value="WAVE">Wave</option>
                                      <option value="ORANGE_MONEY">Orange Money</option>
                                      <option value="VIREMENT">Virement</option>
                                      <option value="ESPECES">Espèces</option>
                                    </select>
                                    <input
                                      type="text"
                                      value={payoutRefByCoach[est.coach_user_id] || ''}
                                      onChange={(e) =>
                                        setPayoutRefByCoach((prev) => ({
                                          ...prev,
                                          [est.coach_user_id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Réf."
                                      className="w-24 rounded-lg border border-[#C3D6CA] bg-white px-2 py-1 font-mono text-[11px] text-[#063725]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRecordCoachPayout(est.coach_user_id, 'VERSE')}
                                      className="rounded-full bg-[#0D6E46] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#095637]"
                                    >
                                      Marquer versé
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {financesData.monthlyCoachEstimates.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-6 text-center text-xs text-[#5B7064]">
                              Aucun coach vérifié actif à reverser pour cette période.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Manual Payment Entry + Ledger */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <form onSubmit={handleCreateTransaction} className="lg:col-span-4 obsidian-card rounded-2xl p-5 space-y-3 h-fit">
                      <h2 className="text-base font-semibold text-[#063725]">Enregistrer un paiement manuel</h2>
                      <p className="text-xs text-[#5B7064]">
                        Ajoutez un encaissement reçu par Wave, Orange Money, espèces ou virement.
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-[#3D5246] mb-1">Libellé *</label>
                        <input
                          type="text"
                          required
                          value={txLabel}
                          onChange={(e) => setTxLabel(e.target.value)}
                          placeholder="Ex: Suivi Coach mensuel Moussa"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[38px]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-[#3D5246] mb-1">Catégorie</label>
                          <select
                            value={txCategory}
                            onChange={(e) => setTxCategory(e.target.value as PaymentTransactionCategory)}
                            className="w-full rounded-xl border border-[#C3D6CA] bg-white px-2.5 py-2 text-xs text-[#063725] min-h-[38px]"
                          >
                            <option value="COACH_PRIVATE_FEE">Suivi Coach (5 000 F)</option>
                            <option value="ATHLETE_PLAN">Formule Athlète</option>
                            <option value="AUTRE">Autre</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#3D5246] mb-1">Montant (FCFA) *</label>
                          <input
                            type="number"
                            min={100}
                            required
                            value={txAmount}
                            onChange={(e) => setTxAmount(e.target.value)}
                            className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 font-mono text-xs text-[#063725] min-h-[38px]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-[#3D5246] mb-1">Moyen</label>
                          <select
                            value={txMethod}
                            onChange={(e) => setTxMethod(e.target.value as PaymentTransactionMethod)}
                            className="w-full rounded-xl border border-[#C3D6CA] bg-white px-2.5 py-2 text-xs text-[#063725] min-h-[38px]"
                          >
                            <option value="WAVE">Wave</option>
                            <option value="ORANGE_MONEY">Orange Money</option>
                            <option value="FREE_MONEY">Free Money</option>
                            <option value="CARTE">Carte</option>
                            <option value="ESPECES">Espèces</option>
                            <option value="MANUEL">Manuel</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#3D5246] mb-1">Statut</label>
                          <select
                            value={txStatus}
                            onChange={(e) => setTxStatus(e.target.value as PaymentTransactionStatus)}
                            className="w-full rounded-xl border border-[#C3D6CA] bg-white px-2.5 py-2 text-xs text-[#063725] min-h-[38px]"
                          >
                            <option value="PAYE">PAYE</option>
                            <option value="EN_ATTENTE">EN_ATTENTE</option>
                            <option value="ECHOUE">ECHOUE</option>
                            <option value="REMBOURSE">REMBOURSE</option>
                          </select>
                        </div>
                      </div>

                      {data && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-[#3D5246] mb-1">Compte lié</label>
                            <select
                              value={txUserId}
                              onChange={(e) => setTxUserId(e.target.value)}
                              className="w-full rounded-xl border border-[#C3D6CA] bg-white px-2 py-2 text-xs text-[#063725] min-h-[38px]"
                            >
                              <option value="">Aucun</option>
                              {data.users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.prenom} {u.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#3D5246] mb-1">Coach lié</label>
                            <select
                              value={txCoachId}
                              onChange={(e) => setTxCoachId(e.target.value)}
                              className="w-full rounded-xl border border-[#C3D6CA] bg-white px-2 py-2 text-xs text-[#063725] min-h-[38px]"
                            >
                              <option value="">Aucun</option>
                              {data.coaches.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.prenom} {c.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={txReference}
                          onChange={(e) => setTxReference(e.target.value)}
                          placeholder="Référence Wave/OM"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 font-mono text-xs text-[#063725] min-h-[38px]"
                        />
                        <input
                          type="text"
                          value={txNotes}
                          onChange={(e) => setTxNotes(e.target.value)}
                          placeholder="Note interne"
                          className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[38px]"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingTx}
                        className="w-full rounded-full bg-[#0D6E46] py-2.5 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[40px]"
                      >
                        {savingTx ? 'Enregistrement...' : 'Ajouter la transaction'}
                      </button>
                    </form>

                    <div className="lg:col-span-8 obsidian-card rounded-2xl overflow-x-auto">
                      <div className="px-5 py-4 border-b border-[#E2EBE5] flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-[#063725]">
                          Journal des transactions ({financesData.transactions.length})
                        </h2>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Date</th>
                            <th className="px-4 py-2.5 font-medium">Libellé & Acteur</th>
                            <th className="px-4 py-2.5 font-medium text-right">Montant</th>
                            <th className="px-4 py-2.5 font-medium">Moyen / Réf</th>
                            <th className="px-4 py-2.5 font-medium">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2EBE5]">
                          {financesData.transactions.map((t) => (
                            <tr key={t.id} className="hover:bg-[#F6F8F5]">
                              <td className="px-4 py-3 font-mono tabular-nums text-[#5B7064] whitespace-nowrap">
                                {t.created_at.slice(0, 16).replace('T', ' ')}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-[#063725]">{t.label}</div>
                                <div className="text-[11px] text-[#5B7064]">
                                  {t.user_nom || 'Système'}
                                  {t.coach_nom ? ` -> Coach ${t.coach_nom}` : ''}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-right">
                                <div className="font-bold text-[#063725]">{t.amount_fcfa.toLocaleString('fr-FR')} F</div>
                                <div className="text-[10px] text-[#5B7064]">
                                  Plat. {t.platform_share_fcfa.toLocaleString('fr-FR')} / Coach {t.coach_share_fcfa.toLocaleString('fr-FR')}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-[#3D5246]">
                                <div>{t.payment_method}</div>
                                {t.reference && <div className="text-[10px] text-[#5B7064]">{t.reference}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={t.status}
                                  onChange={(e) =>
                                    handleUpdateTransactionStatus(t.id, e.target.value as PaymentTransactionStatus)
                                  }
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                                    t.status === 'PAYE'
                                      ? 'border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                                      : t.status === 'EN_ATTENTE'
                                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                                        : 'border-red-200 bg-red-50 text-red-700'
                                  }`}
                                >
                                  <option value="PAYE">PAYE</option>
                                  <option value="EN_ATTENTE">EN_ATTENTE</option>
                                  <option value="ECHOUE">ECHOUE</option>
                                  <option value="REMBOURSE">REMBOURSE</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                          {financesData.transactions.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-xs text-[#5B7064]">
                                Aucune transaction enregistrée pour le moment. Les souscriptions et paiements manuels apparaîtront ici.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="obsidian-card rounded-2xl p-6 text-sm text-[#3D5246]">
                  Chargement des données financières...
                </div>
              )}
            </div>
          )}

          {/* ---------------- COMPTES & DOSSIERS ---------------- */}
          {tab === 'comptes' && data && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">Comptes, dossiers coachs et affectations</h1>
                  <p className="text-sm text-[#3D5246]">
                    Étudiez obligatoirement le diplôme d’un coach avant activation, gérez les comptes et exportez vos journaux CDP.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAdminCreateOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Nouveau compte Administrateur</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUsersCsv}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#C3D6CA] bg-white px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] min-h-[40px]"
                  >
                    <Download className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                    <span>Exporter Utilisateurs (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportAuditCsv}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#C3D6CA] bg-white px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] min-h-[40px]"
                  >
                    <Download className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                    <span>Exporter Journal CDP (CSV)</span>
                  </button>
                </div>
              </div>

              {/* Coach Verification Section */}
              <div className="obsidian-card rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[#063725]">Étude des dossiers & diplômes Coachs</h2>
                    <p className="text-xs text-[#5B7064]">
                      Un coach reste bloqué en attente de validation tant que l’administrateur n’a pas validé son diplôme (« VERIFIE »).
                    </p>
                  </div>
                  {pendingCoachesCount > 0 && (
                    <span className="font-mono text-xs font-bold text-amber-800">
                      {pendingCoachesCount} en attente d’étude
                    </span>
                  )}
                </div>

                <div className="divide-y divide-[#E2EBE5]">
                  {data.coaches.map((c) => (
                    <div key={c.id} className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#063725]">
                            {c.prenom} {c.nom} · {c.zone}
                          </span>
                          {c.document ? (
                            <span
                              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                c.document.study_status === 'CONFORME_PRE_ETUDE'
                                  ? 'border border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                                  : c.document.study_status === 'ANOMALIE'
                                    ? 'border border-red-200 bg-red-50 text-red-700'
                                    : 'border border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              Pré-étude {c.document.study_score}/100 · {c.document.study_status}
                            </span>
                          ) : (
                            <span className="rounded bg-[#F1F6F3] px-2 py-0.5 font-mono text-[10px] text-[#5B7064]">
                              Aucun document joint
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#3D5246]">
                          {c.specialite} · {c.qualification}
                        </div>
                        <div className="text-[11px] font-mono text-[#5B7064]">
                          {c.coach_plan || 'MARKETPLACE'} {c.telephone ? `· ${c.telephone}` : ''}
                          {c.document ? ` · Diplôme ${c.document.diploma_number} (${c.document.issuing_organism})` : ''}
                        </div>
                        <div className="text-[11px] text-[#5B7064] flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Carte pro : <strong className="font-mono text-[#063725]">{c.pro_card_number || 'Non renseignée'}</strong>
                            {c.pro_card_expiry ? ` (exp. ${c.pro_card_expiry})` : ''}
                          </span>
                          <span>
                            RC Pro : <strong className="text-[#063725]">{c.rc_pro_insurer || '—'}</strong>
                            {c.rc_pro_policy_number ? ` (${c.rc_pro_policy_number})` : ''}
                          </span>
                          <span>
                            Statut : <strong className="text-[#063725]">{COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === c.legal_status)?.label || c.legal_status || 'Non déclaré'}</strong>
                            {c.business_reg_number ? ` · ${c.business_reg_number}` : ''}
                          </span>
                        </div>
                        {c.rejection_reason && c.verification_status === 'REFUSE' && (
                          <div className="text-xs text-red-700 font-medium">Motif du refus : {c.rejection_reason}</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openCoachInspection(c)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#E2EBE5] min-h-[36px]"
                        >
                          <Eye className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                          <span>Étudier le dossier</span>
                        </button>
                        <select
                          value={c.verification_status || 'VERIFIE'}
                          onChange={(e) =>
                            handleCoachVerification(
                              c.id,
                              e.target.value as 'VERIFIE' | 'EN_ATTENTE' | 'REFUSE'
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold min-h-[36px] ${
                            c.verification_status === 'EN_ATTENTE'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : c.verification_status === 'REFUSE'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                          }`}
                        >
                          <option value="VERIFIE">VERIFIE</option>
                          <option value="EN_ATTENTE">EN_ATTENTE</option>
                          <option value="REFUSE">REFUSE</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Searchable Users Directory */}
              <div className="obsidian-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2EBE5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#063725]">
                      Répertoire des comptes ({filteredUsers.length} / {data.users.length})
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-[#5B7064] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Nom, email ou téléphone..."
                        className="rounded-xl border border-[#C3D6CA] bg-white pl-8 pr-3 py-1.5 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[38px] w-56"
                      />
                    </div>
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | UserRole)}
                      className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-1.5 text-xs font-medium text-[#063725] min-h-[38px]"
                    >
                      <option value="ALL">Tous les rôles</option>
                      <option value="ATHLETE">ATHLETE</option>
                      <option value="COACH">COACH</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-xs text-[#5B7064]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Utilisateur</th>
                        <th className="px-4 py-3 font-medium">Rôle & Sport</th>
                        <th className="px-4 py-3 font-medium">Contact</th>
                        <th className="px-4 py-3 font-medium">Coach affecté</th>
                        <th className="px-4 py-3 font-medium">Statut</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2EBE5]">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F6F8F5]">
                          <td className="px-4 py-3.5 font-medium text-[#063725]">
                            <div>
                              {u.prenom} {u.nom}
                              {u.is_minor ? <span className="ml-2 text-xs text-amber-700 font-semibold">(Mineur)</span> : null}
                            </div>
                            {u.role === 'ATHLETE' && u.plan_tier && (
                              <div className="mt-0.5 inline-block rounded border border-[#D5E2DA] bg-[#F1F6F3] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0D6E46]">
                                {u.plan_tier}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[#3D5246]">
                            <span className="font-semibold text-[#063725]">{u.role}</span>
                            {u.sport_code ? ` · ${SPORTS_CONFIG[u.sport_code].nom}` : ''}
                            {u.niveau ? ` (${LEVEL_LABELS[u.niveau]})` : ''}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[#3D5246]">
                            <div className="font-mono">{u.telephone}</div>
                            <div className="text-[11px] text-[#5B7064]">{u.email}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            {u.role === 'ATHLETE' ? (
                              <select
                                value={u.assigned_coach_id || ''}
                                onChange={(e) => handleAssignCoach(u.id, Number(e.target.value))}
                                className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725] min-h-[36px]"
                              >
                                <option value="">Non affecté</option>
                                {data.coaches
                                  .filter((c) => (c.verification_status || 'VERIFIE') === 'VERIFIE')
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.prenom} {c.nom} ({c.zone})
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <span className="text-xs text-[#5B7064]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {u.role !== 'ADMIN' ? (
                              <select
                                value={u.statut}
                                onChange={(e) => handleStatusChange(u.id, e.target.value as AthleteStatus)}
                                className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725] min-h-[36px]"
                              >
                                <option value="ACTIF">ACTIF</option>
                                <option value="SUIVI_ACTIF">SUIVI_ACTIF</option>
                                <option value="EN_PAUSE">EN_PAUSE</option>
                                <option value="CLOTURE">CLOTURE</option>
                              </select>
                            ) : (
                              <span className="text-xs font-semibold text-[#0D6E46]">{u.statut}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1] min-h-[34px]"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                              <span>Modifier</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#5B7064]">
                            Aucun utilisateur ne correspond aux filtres sélectionnés.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- CONTENUS & SEANCES ---------------- */}
          {tab === 'contenus' && data && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#063725]">
                    Contenus & Bibliothèque des séances
                  </h1>
                  <p className="text-sm text-[#3D5246]">
                    Créez ou éditez les séances officielles Terrain+ et validez les propositions en relecture.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewSessionModal}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[42px] shrink-0"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Nouvelle séance officielle</span>
                </button>
              </div>

              <div className="space-y-4">
                {data.sessions.map((s) => (
                  <div key={s.id} className="obsidian-card rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#5B7064] flex flex-wrap items-center gap-1.5">
                          <span>
                            {SPORTS_CONFIG[s.sport_code].nom} · {LEVEL_LABELS[s.niveau]} · {s.duree_min} min
                          </span>
                          <span className="rounded border border-[#D5E2DA] bg-[#F1F6F3] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0D6E46]">
                            {s.access_tier || 'ESSENTIEL'}
                          </span>
                          {s.proposee_par_nom ? <span>· Proposée par {s.proposee_par_nom}</span> : null}
                        </div>
                        <h2 className="text-base font-semibold text-[#063725] mt-0.5">{s.titre}</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            s.validation_status === 'VALIDEE'
                              ? 'text-[#0D6E46]'
                              : s.validation_status === 'EN_RELECTURE'
                                ? 'text-amber-700'
                                : 'text-[#5B7064]'
                          }`}
                        >
                          {s.validation_status}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditSessionModal(s)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#ECF7F1]"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                          <span>Éditer</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#3D5246]">
                      Objectif : {s.objectif}
                    </p>
                    {s.relue_par && (
                      <p className="text-xs text-[#0D6E46] font-semibold">Relue et validée par : {s.relue_par}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[#E2EBE5]">
                      <input
                        type="text"
                        value={reviewerBySession[s.id] ?? s.relue_par ?? ''}
                        onChange={(e) =>
                          setReviewerBySession((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        placeholder="Nom et qualification du relecteur"
                        className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'VALIDEE')}
                        className="rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                      >
                        Valider et publier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewSession(s.id, 'BROUILLON')}
                        className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-medium text-[#3D5246] hover:text-[#063725] hover:bg-[#E2EBE5] min-h-[40px]"
                      >
                        Renvoyer en brouillon
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </motion.div>
          </AnimatePresence>
            <LegalFooter />
          </div>
        </main>
      </div>

      {/* Floating Light Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile administration"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-[#D5E2DA] bg-white/95 backdrop-blur-md p-1.5 shadow-xl"
      >
        <div className="grid grid-cols-4 gap-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 px-0.5 text-[10px] transition-colors ${
                  active
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#5B7064] hover:text-[#063725] font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`absolute -top-1.5 -right-2 font-mono text-[9px] font-bold tabular-nums rounded px-1 leading-tight ${
                        active ? 'bg-white text-[#0D6E46]' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Edit User Modal */}
      <AnimatePresence>
      {editingUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4"
        >
          <motion.form
            onSubmit={handleSaveUserEdit}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            className="obsidian-card-glow w-full max-w-md rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#063725]">
                  Modifier le compte
                </h2>
                <p className="text-xs text-[#5B7064]">
                  {editingUser.prenom} {editingUser.nom} ({editingUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-2 rounded-xl text-[#5B7064] hover:bg-[#F1F6F3]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Rôle</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  <option value="ATHLETE">ATHLETE</option>
                  <option value="COACH">COACH</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Statut</label>
                <select
                  value={editUserStatut}
                  onChange={(e) => setEditUserStatut(e.target.value as AthleteStatus)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  <option value="ACTIF">ACTIF</option>
                  <option value="SUIVI_ACTIF">SUIVI_ACTIF</option>
                  <option value="EN_PAUSE">EN_PAUSE</option>
                  <option value="CLOTURE">CLOTURE</option>
                </select>
              </div>
            </div>

            {editUserRole === 'ATHLETE' && (
              <div className="space-y-3 pt-2 border-t border-[#E2EBE5]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Sport</label>
                    <select
                      value={editUserSport}
                      onChange={(e) => setEditUserSport(e.target.value as SportCode)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                    >
                      {ALL_SPORT_CODES.map((code) => (
                        <option key={code} value={code}>
                          {SPORTS_CONFIG[code].nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">Niveau</label>
                    <select
                      value={editUserNiveau}
                      onChange={(e) => setEditUserNiveau(e.target.value as AthleteLevel)}
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                    >
                      <option value="debutant">Débutant</option>
                      <option value="intermediaire">Intermédiaire</option>
                      <option value="avance">Avancé</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D5246] mb-1">Formule</label>
                  <select
                    value={editUserPlan}
                    onChange={(e) =>
                      setEditUserPlan(e.target.value as 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE')
                    }
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                  >
                    <option value="ESSENTIEL">ESSENTIEL (0 FCFA)</option>
                    <option value="COACH_PRIVE">SUIVI COACH (5 000 FCFA/mois)</option>
                    {editingUser?.plan_tier === 'PROGRESSION' && (
                      <option value="PROGRESSION">PROGRESSION (hérité)</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-xl border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-medium text-[#3D5246]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingUserEdit}
                className="rounded-full bg-[#0D6E46] px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50"
              >
                {savingUserEdit ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Create Admin Modal */}
      <AnimatePresence>
      {adminCreateOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4"
        >
          <motion.form
            onSubmit={handleCreateAdminAccount}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            className="obsidian-card-glow w-full max-w-md rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#063725]">
                  Nouveau compte Administrateur
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Crée un compte administrateur vérifié sans passer par l’inscription publique.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminCreateOpen(false)}
                className="p-2 rounded-xl text-[#5B7064] hover:bg-[#F1F6F3]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={newAdminPrenom}
                onChange={(e) => setNewAdminPrenom(e.target.value)}
                placeholder="Prénom *"
                className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
              />
              <input
                type="text"
                required
                value={newAdminNom}
                onChange={(e) => setNewAdminNom(e.target.value)}
                placeholder="Nom *"
                className="rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
              />
            </div>

            <input
              type="email"
              required
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="Email professionnel *"
              className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
            />

            <input
              type="tel"
              required
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
              placeholder="+221770000000 *"
              className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 font-mono text-xs text-[#063725] min-h-[40px]"
            />

            <input
              type="password"
              required
              value={newAdminPassword}
              onChange={(e) => setNewAdminPassword(e.target.value)}
              placeholder="Mot de passe fort (8+ car., Maj, min, chiffre) *"
              className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdminCreateOpen(false)}
                className="rounded-xl border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-medium text-[#3D5246]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creatingAdmin}
                className="rounded-full bg-[#0D6E46] px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50"
              >
                {creatingAdmin ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Session Creator / Editor Modal */}
      <AnimatePresence>
      {sessionModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <motion.form
            onSubmit={handleSaveSession}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            className="obsidian-card-glow w-full max-w-3xl rounded-3xl my-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#E2EBE5] pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#063725]">
                  {editingSessionId ? 'Éditer la séance officielle' : 'Créer une séance officielle'}
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Définissez les paramètres, le palier d’accès et la liste des exercices guidés (FR / Wolof).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSessionModalOpen(false)}
                className="p-2 rounded-xl text-[#5B7064] hover:bg-[#F1F6F3]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Sport *</label>
                <select
                  value={sessSport}
                  onChange={(e) => setSessSport(e.target.value as SportCode)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  {ALL_SPORT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {SPORTS_CONFIG[code].nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Niveau *</label>
                <select
                  value={sessNiveau}
                  onChange={(e) => setSessNiveau(e.target.value as AthleteLevel)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  <option value="debutant">Débutant</option>
                  <option value="intermediaire">Intermédiaire</option>
                  <option value="avance">Avancé</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Durée (min)</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={sessDuree}
                  onChange={(e) => setSessDuree(e.target.value)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 font-mono text-xs text-[#063725] min-h-[40px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Titre de la séance *</label>
                <input
                  type="text"
                  required
                  value={sessTitre}
                  onChange={(e) => setSessTitre(e.target.value)}
                  placeholder="Ex: Appuis explosifs et vitesse"
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Palier d’accès</label>
                <select
                  value={sessAccessTier}
                  onChange={(e) => setSessAccessTier(e.target.value as 'ESSENTIEL' | 'PROGRESSION')}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  <option value="ESSENTIEL">ESSENTIEL (Gratuit)</option>
                  <option value="PROGRESSION">SUIVI COACH (Payant)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D5246] mb-1">Objectif *</label>
              <input
                type="text"
                required
                value={sessObjectif}
                onChange={(e) => setSessObjectif(e.target.value)}
                className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Statut de validation</label>
                <select
                  value={sessValidationStatus}
                  onChange={(e) => setSessValidationStatus(e.target.value as ValidationStatus)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                >
                  <option value="VALIDEE">VALIDEE (Publiée)</option>
                  <option value="EN_RELECTURE">EN_RELECTURE</option>
                  <option value="BROUILLON">BROUILLON</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3D5246] mb-1">Relecteur / Référent</label>
                <input
                  type="text"
                  value={sessReluePar}
                  onChange={(e) => setSessReluePar(e.target.value)}
                  className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] min-h-[40px]"
                />
              </div>
            </div>

            {/* Exercises List */}
            <div className="space-y-2.5 pt-2 border-t border-[#E2EBE5]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#063725]">
                  Exercices de la séance ({sessExercises.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSessExercises((prev) => [...prev, makeBlankExercise(prev.length + 1)])
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-1 text-xs font-semibold text-[#063725] hover:bg-[#E2EBE5]"
                >
                  <Plus className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
                  <span>Ajouter un exercice</span>
                </button>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {sessExercises.map((ex, idx) => (
                  <div key={ex.id} className="obsidian-inset rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-bold text-[#0D6E46]">
                        Exercice {idx + 1}
                      </span>
                      {sessExercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSessExercises((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-red-700 hover:text-red-900 p-1"
                          aria-label={`Supprimer exercice ${idx + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        required
                        value={ex.nom}
                        onChange={(e) =>
                          setSessExercises((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, nom: e.target.value } : item))
                          )
                        }
                        placeholder="Nom de l'exercice *"
                        className="sm:col-span-2 rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725]"
                      />
                      <select
                        value={ex.mode}
                        onChange={(e) =>
                          setSessExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, mode: e.target.value as 'duree' | 'repetitions' }
                                : item
                            )
                          )
                        }
                        className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725]"
                      >
                        <option value="duree">Durée (sec)</option>
                        <option value="repetitions">Répétitions</option>
                      </select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={ex.mode === 'repetitions' ? ex.repetitions : ex.dureeSec}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setSessExercises((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? ex.mode === 'repetitions'
                                    ? { ...item, repetitions: val }
                                    : { ...item, dureeSec: val }
                                  : item
                              )
                            );
                          }}
                          title={ex.mode === 'repetitions' ? 'Répétitions' : 'Durée en secondes'}
                          className="rounded-lg border border-[#C3D6CA] bg-white px-2 py-1.5 font-mono text-xs text-[#063725]"
                        />
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={ex.reposSec}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 15;
                            setSessExercises((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, reposSec: val } : item))
                            );
                          }}
                          title="Repos (sec)"
                          className="rounded-lg border border-[#C3D6CA] bg-white px-2 py-1.5 font-mono text-xs text-[#063725]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        value={ex.consigneFr}
                        onChange={(e) =>
                          setSessExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, consigneFr: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Consigne Français *"
                        className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725]"
                      />
                      <input
                        type="text"
                        value={ex.consigneWo}
                        onChange={(e) =>
                          setSessExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, consigneWo: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Consigne Wolof"
                        className="rounded-lg border border-[#C3D6CA] bg-white px-2.5 py-1.5 text-xs text-[#063725]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2EBE5]">
              <button
                type="button"
                onClick={() => setSessionModalOpen(false)}
                className="rounded-xl border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-medium text-[#3D5246]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingSession}
                className="rounded-full bg-[#0D6E46] px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] disabled:opacity-50"
              >
                {savingSession
                  ? 'Enregistrement...'
                  : editingSessionId
                    ? 'Enregistrer les modifications'
                    : 'Créer la séance'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Coach Diploma Study & Inspection Modal */}
      <AnimatePresence>
      {inspectedCoach && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="obsidian-card-glow w-full max-w-4xl rounded-3xl my-auto overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#E2EBE5] px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#063725]">
                  Étude du dossier Coach · {inspectedCoach.prenom} {inspectedCoach.nom}
                </h2>
                <p className="text-xs text-[#5B7064]">
                  {inspectedCoach.zone} · {inspectedCoach.specialite} · {inspectedCoach.qualification}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedCoach(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5B7064] hover:bg-[#F1F6F3] hover:text-[#063725]"
                aria-label="Fermer l’étude"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* Left: Automated Conformity Study Report + Decision Controls */}
              <div className="space-y-4">
                {inspectedCoach.document ? (
                  <>
                    <div className="obsidian-inset rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#063725]">
                          {inspectedCoach.document.study_report.formatLabel}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                            inspectedCoach.document.study_status === 'CONFORME_PRE_ETUDE'
                              ? 'border border-[#BFE0CD] bg-[#ECF7F1] text-[#0D6E46]'
                              : inspectedCoach.document.study_status === 'ANOMALIE'
                                ? 'border border-red-200 bg-red-50 text-red-700'
                                : 'border border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {inspectedCoach.document.study_score} / 100
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#3D5246] pt-1">
                        <div>
                          <span className="text-[#5B7064]">Organisme : </span>
                          <span className="font-medium text-[#063725]">{inspectedCoach.document.issuing_organism}</span>
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Année : </span>
                          <span className="font-mono font-medium text-[#063725]">{inspectedCoach.document.issue_year}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[#5B7064]">Référence : </span>
                          <span className="font-mono font-semibold text-[#0D6E46]">
                            {inspectedCoach.document.diploma_number}
                          </span>
                        </div>
                        <div className="col-span-2 truncate">
                          <span className="text-[#5B7064]">Empreinte SHA-256 : </span>
                          <span className="font-mono text-[11px]">{inspectedCoach.document.sha256_hash}</span>
                        </div>
                      </div>
                    </div>

                    <div className="obsidian-inset rounded-xl p-4 space-y-2 text-xs">
                      <div className="font-semibold text-[#063725]">
                        Conformité réglementaire (Carte Pro · RC Pro · Statut juridique · Honorabilité)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3D5246]">
                        <div>
                          <span className="text-[#5B7064]">Carte pro : </span>
                          <span className="font-mono font-semibold text-[#063725]">
                            {inspectedCoach.pro_card_number || 'Non renseignée'}
                          </span>
                          {inspectedCoach.pro_card_expiry && (
                            <span className="text-[#5B7064]"> (exp. {inspectedCoach.pro_card_expiry})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Honorabilité : </span>
                          <span
                            className={`font-semibold ${
                              inspectedCoach.honorability_attested ? 'text-[#0D6E46]' : 'text-amber-700'
                            }`}
                          >
                            {inspectedCoach.honorability_attested ? 'Attestée sur l’honneur' : 'Non attestée'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Assurance RC Pro : </span>
                          <span className="font-medium text-[#063725]">
                            {inspectedCoach.rc_pro_insurer || 'Non renseignée'}
                          </span>
                          {inspectedCoach.rc_pro_policy_number && (
                            <span className="font-mono text-[#5B7064]"> ({inspectedCoach.rc_pro_policy_number})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[#5B7064]">Structure & ID : </span>
                          <span className="font-medium text-[#063725]">
                            {COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === inspectedCoach.legal_status)?.label ||
                              inspectedCoach.legal_status ||
                              'Non déclaré'}
                          </span>
                          {inspectedCoach.business_reg_number && (
                            <span className="font-mono text-[#5B7064]"> · {inspectedCoach.business_reg_number}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[#063725]">
                        Contrôles automatiques de pré-étude
                      </div>
                      <div className="space-y-2">
                        {inspectedCoach.document.study_report.checks.map((chk) => (
                          <div
                            key={chk.id}
                            className={`rounded-xl border px-3 py-2.5 text-xs flex items-start gap-2.5 ${
                              chk.passed
                                ? 'border-[#BFE0CD] bg-[#ECF7F1] text-[#063725]'
                                : 'border-amber-200 bg-amber-50 text-amber-900'
                            }`}
                          >
                            {chk.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-[#0D6E46] shrink-0 mt-0.5" aria-hidden="true" />
                            ) : (
                              <XCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                            )}
                            <div>
                              <div className="font-semibold">{chk.label}</div>
                              <div className="text-[11px] opacity-90">{chk.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    Aucun justificatif numérique n’a été déposé pour ce profil. Vous pouvez laisser le dossier en attente ou le refuser.
                  </div>
                )}

                <div className="space-y-2.5 pt-2 border-t border-[#E2EBE5]">
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Note d’étude administrative (interne)
                    </label>
                    <input
                      type="text"
                      value={reviewNoteInput}
                      onChange={(e) => setReviewNoteInput(e.target.value)}
                      placeholder="Référence ou note de validation"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3D5246] mb-1">
                      Motif de refus (affiché au coach si refusé)
                    </label>
                    <input
                      type="text"
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      placeholder="Ex: Numéro de diplôme illisible ou non reconnu"
                      className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs text-[#063725] placeholder:text-[#5B7064] min-h-[40px]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'VERIFIE', {
                          adminReviewNote: reviewNoteInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-full bg-[#0D6E46] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px]"
                    >
                      Valider le diplôme et activer le coach
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'EN_ATTENTE', {
                          adminReviewNote: reviewNoteInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3.5 py-2.5 text-xs font-medium text-[#063725] hover:bg-[#E2EBE5] min-h-[40px]"
                    >
                      Laisser en étude
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCoachVerification(inspectedCoach.id, 'REFUSE', {
                          adminReviewNote: reviewNoteInput,
                          rejectionReason: rejectionReasonInput,
                          closeModal: true,
                        })
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 min-h-[40px]"
                    >
                      Refuser le dossier
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Live Document Preview */}
              <div className="flex flex-col rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] overflow-hidden min-h-[380px]">
                <div className="flex items-center justify-between gap-2 border-b border-[#E2EBE5] bg-white px-4 py-2.5 text-xs">
                  <span className="font-medium text-[#063725] truncate">
                    {inspectedCoach.document?.original_filename || 'Aperçu du justificatif'}
                  </span>
                  {docPreviewUrl && inspectedCoach.document && (
                    <a
                      href={docPreviewUrl}
                      download={inspectedCoach.document.original_filename}
                      className="inline-flex items-center gap-1 font-semibold text-[#0D6E46] hover:underline shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Télécharger</span>
                    </a>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center p-3">
                  {!inspectedCoach.document ? (
                    <div className="text-xs text-[#5B7064]">Aucun fichier joint.</div>
                  ) : docPreviewLoading ? (
                    <div className="text-xs text-[#3D5246]">Chargement sécurisé du document...</div>
                  ) : docPreviewError ? (
                    <div className="text-xs text-red-700 px-4 text-center">{docPreviewError}</div>
                  ) : docPreviewUrl ? (
                    inspectedCoach.document.mime_type === 'application/pdf' ? (
                      <iframe
                        src={docPreviewUrl}
                        title={`Aperçu diplôme ${inspectedCoach.prenom} ${inspectedCoach.nom}`}
                        className="w-full h-[460px] rounded-lg border border-[#D5E2DA] bg-white"
                      />
                    ) : (
                      <img
                        src={docPreviewUrl}
                        alt={`Diplôme ${inspectedCoach.prenom} ${inspectedCoach.nom}`}
                        className="max-h-[460px] w-auto object-contain rounded-lg border border-[#D5E2DA] bg-white"
                      />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};
