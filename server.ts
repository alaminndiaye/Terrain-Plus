import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { db, initSchema, logAccess } from './server/db.ts';
import { buildDefaultScheduleForAthlete, seedIfEmpty } from './server/seed.ts';
import {
  checkRateLimit,
  clearSessionCookie,
  computeAge,
  generateOtpCode,
  generateSecureToken,
  hashPassword,
  hashToken,
  isStrongPassword,
  isValidEmail,
  isValidSenegalPhone,
  normalizePhone,
  parseCookies,
  sanitizeText,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  verifyPassword,
  verifyTokenHash,
} from './server/security.ts';
import { evaluateTestValue, SPORTS_CONFIG } from './src/data/sportsConfig.ts';
import type { AthleteLevel, SportCode, UserRole } from './src/types.ts';

initSchema();
seedIfEmpty();

interface AuthedUserRow {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  role: UserRole;
  date_naissance: string;
  langue: 'fr' | 'wo';
  statut: string;
  is_minor: number;
  verified: number;
}

interface AuthedRequest extends Request {
  authUser?: AuthedUserRow;
}

const SESSION_DURATION_SEC = 60 * 60 * 24 * 7;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const VALID_SPORT_CODES: SportCode[] = ['football', 'basket', 'handball', 'volleyball', 'athletisme'];

function createSessionForUser(req: Request, res: Response, userId: number): string {
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND datetime(expires_at) <= datetime('now')").run(userId);
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SEC * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt
  );
  setSessionCookie(req, res, rawToken, SESSION_DURATION_SEC);
  return rawToken;
}

function extractRawToken(req: Request): string | null {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return null;
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const rawToken = extractRawToken(req);
  if (!rawToken) {
    next();
    return;
  }
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.id, u.nom, u.prenom, u.telephone, u.email, u.role, u.date_naissance,
              u.langue, u.statut, u.is_minor, u.verified
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.statut != 'CLOTURE'`
    )
    .get(tokenHash) as AuthedUserRow | undefined;

  if (row) {
    req.authUser = row;
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (!req.authUser.verified) {
    res.status(403).json({ error: 'Compte en attente de validation par code.' });
    return;
  }
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Accès refusé pour ce rôle.' });
      return;
    }
    next();
  };
}

function authLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'local';
  const allowed = checkRateLimit(`auth:${ip}`, 30, 15 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    return;
  }
  next();
}

function otpLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'local';
  const body = (req.body || {}) as Record<string, unknown>;
  const id = sanitizeText(body.identifier, 120).toLowerCase() || 'anon';
  const allowed = checkRateLimit(`otp:${ip}:${id}`, 12, 15 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({ error: 'Trop de tentatives OTP. Patientez quelques minutes avant de réessayer.' });
    return;
  }
  next();
}

function verifySameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).host.toLowerCase() : '';
    if (originHost === requestHost || (appHost && originHost === appHost)) {
      next();
      return;
    }
  } catch {
    // Invalid Origin header
  }
  res.status(403).json({ error: 'Origine de requête non autorisée.' });
}

function mapUserPublic(u: AuthedUserRow) {
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    telephone: u.telephone,
    email: u.email,
    role: u.role,
    date_naissance: u.date_naissance,
    langue: u.langue,
    statut: u.statut,
    is_minor: Boolean(u.is_minor),
    verified: Boolean(u.verified),
  };
}

function getPublicCoachesList() {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.prenom, c.specialite, c.qualification, c.zone,
              c.coach_plan, c.commission_pct, c.athlete_payout_fcfa,
              c.athlete_monthly_fee_fcfa,
              (SELECT COUNT(*) FROM assignments a WHERE a.coach_user_id = u.id AND a.statut = 'ACTIF') as active_athletes_count
       FROM users u
       JOIN coaches c ON c.user_id = u.id
       WHERE u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'
       ORDER BY u.id ASC`
    )
    .all() as Array<{
    id: number;
    nom: string;
    prenom: string;
    specialite: string;
    qualification: string;
    zone: string;
    coach_plan: 'MARKETPLACE' | 'COACH_PRO';
    commission_pct: number;
    athlete_payout_fcfa: number;
    athlete_monthly_fee_fcfa: number;
    active_athletes_count: number;
  }>;
}

function buildAthleteWorkspace(athleteUserId: number) {
  const user = db
    .prepare(
      `SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified
       FROM users WHERE id = ?`
    )
    .get(athleteUserId) as AuthedUserRow | undefined;
  if (!user) return null;

  const profileRow = db
    .prepare(
      `SELECT sport_code, niveau, taille_cm, poste, objectif, eco_data_mode, notifications_enabled,
              reminder_time, reminder_lead_minutes,
              coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
              plan_tier, plan_fee_fcfa, plan_billing_cycle
       FROM athlete_profiles WHERE user_id = ?`
    )
    .get(athleteUserId) as
    | {
        sport_code: SportCode;
        niveau: AthleteLevel;
        taille_cm: number | null;
        poste: string | null;
        objectif: string | null;
        eco_data_mode: number;
        notifications_enabled: number;
        reminder_time: string | null;
        reminder_lead_minutes: number | null;
        coach_subscription_status: 'GRATUIT_BASE' | 'ACTIF_5000';
        coach_monthly_fee_fcfa: number;
        coach_subscribed_at: string | null;
        plan_tier: 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE';
        plan_fee_fcfa: number;
        plan_billing_cycle: 'MENSUEL' | 'TRIMESTRIEL';
      }
    | undefined;

  if (!profileRow) return null;

  const coachRow = db
    .prepare(
      `SELECT u.id, u.nom, u.prenom, c.specialite, c.qualification, c.zone, c.coach_plan, c.athlete_monthly_fee_fcfa
       FROM assignments a
       JOIN users u ON u.id = a.coach_user_id
       JOIN coaches c ON c.user_id = u.id
       WHERE a.athlete_user_id = ? AND a.statut = 'ACTIF'
       LIMIT 1`
    )
    .get(athleteUserId) as
    | {
        id: number;
        nom: string;
        prenom: string;
        specialite: string;
        qualification: string;
        zone: string;
        coach_plan: 'MARKETPLACE' | 'COACH_PRO';
        athlete_monthly_fee_fcfa: number;
      }
    | undefined;

  const programRow = db
    .prepare(
      `SELECT id, objectif, date_debut, duree_semaines, notes
       FROM program_plans WHERE athlete_user_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(athleteUserId) as
    | { id: number; objectif: string; date_debut: string; duree_semaines: number; notes: string | null }
    | undefined;

  const schedRows = db
    .prepare(
      `SELECT ss.*, sl.sport_code as s_sport_code, sl.titre as s_titre, sl.niveau as s_niveau,
              sl.duree_min as s_duree_min, sl.objectif as s_objectif, sl.prevention_focus as s_prevention_focus,
              sl.relue_par as s_relue_par, sl.validation_status as s_validation_status,
              sl.access_tier as s_access_tier, sl.exercises_json as s_exercises_json
       FROM scheduled_sessions ss
       LEFT JOIN sessions_library sl ON sl.id = ss.session_id
       WHERE ss.athlete_user_id = ?
       ORDER BY ss.jour_semaine ASC`
    )
    .all(athleteUserId) as Array<Record<string, unknown>>;

  const schedule = schedRows.map((r) => ({
    id: Number(r.id),
    program_id: Number(r.program_id),
    session_id: r.session_id ? Number(r.session_id) : null,
    jour_semaine: Number(r.jour_semaine),
    date_prevue: String(r.date_prevue),
    is_rest_day: Boolean(r.is_rest_day),
    ajustee_par_coach: Boolean(r.ajustee_par_coach),
    motif_ajustement: r.motif_ajustement ? String(r.motif_ajustement) : null,
    date_ajustement: r.date_ajustement ? String(r.date_ajustement) : null,
    completed: Boolean(r.completed),
    ressenti_fatigue: r.ressenti_fatigue !== null ? Number(r.ressenti_fatigue) : null,
    difficulte: r.difficulte !== null ? Number(r.difficulte) : null,
    qualite_sommeil: r.qualite_sommeil !== null ? Number(r.qualite_sommeil) : null,
    completed_at: r.completed_at ? String(r.completed_at) : null,
    session: r.session_id
      ? {
          id: Number(r.session_id),
          sport_code: String(r.s_sport_code) as SportCode,
          titre: String(r.s_titre),
          niveau: String(r.s_niveau) as AthleteLevel,
          duree_min: Number(r.s_duree_min),
          objectif: String(r.s_objectif),
          prevention_focus: String(r.s_prevention_focus),
          relue_par: r.s_relue_par ? String(r.s_relue_par) : null,
          validation_status: String(r.s_validation_status),
          access_tier: String(r.s_access_tier || 'ESSENTIEL') as 'ESSENTIEL' | 'PROGRESSION',
          exercises: JSON.parse(String(r.s_exercises_json || '[]')),
        }
      : null,
  }));

  const libraryRows = db
    .prepare(
      `SELECT id, sport_code, titre, niveau, duree_min, objectif, prevention_focus, relue_par, validation_status, access_tier, exercises_json
       FROM sessions_library
       WHERE sport_code = ? AND validation_status = 'VALIDEE'
       ORDER BY CASE WHEN access_tier = 'ESSENTIEL' THEN 0 ELSE 1 END, id ASC`
    )
    .all(profileRow.sport_code) as Array<Record<string, unknown>>;

  const library = libraryRows.map((s) => ({
    id: Number(s.id),
    sport_code: String(s.sport_code) as SportCode,
    titre: String(s.titre),
    niveau: String(s.niveau) as AthleteLevel,
    duree_min: Number(s.duree_min),
    objectif: String(s.objectif),
    prevention_focus: String(s.prevention_focus),
    relue_par: s.relue_par ? String(s.relue_par) : null,
    validation_status: String(s.validation_status),
    access_tier: String(s.access_tier || 'ESSENTIEL') as 'ESSENTIEL' | 'PROGRESSION',
    exercises: JSON.parse(String(s.exercises_json || '[]')),
  }));

  const weights = db
    .prepare('SELECT id, poids_kg, date FROM weight_logs WHERE athlete_user_id = ? ORDER BY date ASC, id ASC')
    .all(athleteUserId) as Array<{ id: number; poids_kg: number; date: string }>;

  const evalRows = db
    .prepare('SELECT id, athlete_user_id, type, sport_code, date, score_global, results_json FROM evaluations WHERE athlete_user_id = ? ORDER BY date DESC, id DESC')
    .all(athleteUserId) as Array<Record<string, unknown>>;

  const evaluations = evalRows.map((ev) => {
    const comments = db
      .prepare(
        `SELECT cc.id, cc.evaluation_id, (u.prenom || ' ' || u.nom) as coach_nom, cc.texte, cc.date
         FROM coach_comments cc
         JOIN users u ON u.id = cc.coach_user_id
         WHERE cc.evaluation_id = ?
         ORDER BY cc.date DESC`
      )
      .all(Number(ev.id));

    return {
      id: Number(ev.id),
      athlete_user_id: Number(ev.athlete_user_id),
      type: String(ev.type),
      sport_code: String(ev.sport_code),
      date: String(ev.date),
      score_global: Number(ev.score_global),
      results: JSON.parse(String(ev.results_json || '[]')),
      comments,
    };
  });

  const alerts = db
    .prepare(
      `SELECT id, athlete_user_id, type, zone_douleur, intensite, message, date, traitee, note_traitement
       FROM alerts WHERE athlete_user_id = ? ORDER BY traitee ASC, date DESC LIMIT 20`
    )
    .all(athleteUserId)
    .map((a: unknown) => {
      const row = a as Record<string, unknown>;
      return {
        ...row,
        traitee: Boolean(row.traitee),
      };
    });

  const groupRows = db
    .prepare(
      `SELECT g.id, g.nom, p.nom as partner_nom, p.type as partner_type, p.zone, g.captain_name, g.sport_code,
              (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) as member_count,
              EXISTS(SELECT 1 FROM group_memberships gm2 WHERE gm2.group_id = g.id AND gm2.user_id = ?) as joined
       FROM groups g
       JOIN partners p ON p.id = g.partner_id
       ORDER BY g.id ASC`
    )
    .all(athleteUserId) as Array<Record<string, unknown>>;

  const groups = groupRows.map((g) => ({
    id: Number(g.id),
    nom: String(g.nom),
    partner_nom: String(g.partner_nom),
    partner_type: String(g.partner_type),
    zone: String(g.zone),
    captain_name: String(g.captain_name),
    sport_code: String(g.sport_code) as SportCode,
    member_count: Number(g.member_count),
    joined: Boolean(g.joined),
  }));

  const challenges = db
    .prepare(
      `SELECT c.id, p.nom as partner_nom, c.titre, c.indicateur, c.periode, c.target_sessions, c.current_sessions
       FROM challenges c
       JOIN partners p ON p.id = c.partner_id
       ORDER BY c.id ASC`
    )
    .all();

  const consents = db
    .prepare('SELECT id, type, version, accepted_at FROM consents WHERE user_id = ? ORDER BY id DESC')
    .all(athleteUserId);

  const trainingSessions = schedule.filter((s) => !s.is_rest_day);
  const weeklyCompleted = trainingSessions.filter((s) => s.completed).length;
  const weeklyTarget = trainingSessions.length || 4;
  const rated = trainingSessions.filter((s) => s.completed && s.difficulte !== null);
  const avgRpe =
    rated.length > 0
      ? Number((rated.reduce((acc, s) => acc + (s.difficulte || 0), 0) / rated.length).toFixed(1))
      : null;
  const avgSleep =
    rated.length > 0
      ? Number((rated.reduce((acc, s) => acc + (s.qualite_sommeil || 0), 0) / rated.length).toFixed(1))
      : null;

  const fourWeekRegularityPct = Math.min(100, Math.round(((weeklyCompleted + 8) / (weeklyTarget * 4)) * 100));

  return {
    user: mapUserPublic(user),
    profile: {
      sport_code: profileRow.sport_code,
      niveau: profileRow.niveau,
      taille_cm: profileRow.taille_cm,
      poste: profileRow.poste,
      objectif: profileRow.objectif,
      eco_data_mode: Boolean(profileRow.eco_data_mode),
      notifications_enabled: Boolean(profileRow.notifications_enabled),
      reminder_time: profileRow.reminder_time || '18:00',
      reminder_lead_minutes: Number(profileRow.reminder_lead_minutes ?? 30),
      plan_tier: profileRow.plan_tier || (profileRow.coach_subscription_status === 'ACTIF_5000' ? 'COACH_PRIVE' : 'ESSENTIEL'),
      plan_fee_fcfa: Number(profileRow.plan_fee_fcfa ?? profileRow.coach_monthly_fee_fcfa ?? 0),
      plan_billing_cycle: profileRow.plan_billing_cycle || 'MENSUEL',
      coach_subscription_status: profileRow.coach_subscription_status || 'GRATUIT_BASE',
      coach_monthly_fee_fcfa: Number(profileRow.coach_monthly_fee_fcfa || 0),
      coach_subscribed_at: profileRow.coach_subscribed_at || null,
    },
    coach: coachRow || null,
    availableCoaches: getPublicCoachesList(),
    program: programRow || null,
    schedule,
    library,
    weights,
    evaluations,
    alerts,
    groups,
    challenges,
    consents,
    stats: {
      weeklyCompleted,
      weeklyTarget,
      fourWeekRegularityPct,
      avgRpe,
      avgSleep,
    },
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression({ threshold: 512 }));
  app.use(express.json({ limit: '512kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'"
    );
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (
      req.method === 'GET' &&
      (req.path.startsWith('/assets/aistudio/') ||
        req.path.startsWith('/src/assets/images/') ||
        req.path.startsWith('/brand/'))
    ) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
    next();
  });

  app.use('/api', verifySameOrigin);
  app.use(attachUser);

  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    if (!req.authUser) {
      res.json({ user: null });
      return;
    }
    res.json({ user: mapUserPublic(req.authUser) });
  });

  app.post('/api/auth/register', authLimiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const accountType = body.account_type === 'COACH' ? 'COACH' : 'ATHLETE';
    const nom = sanitizeText(body.nom, 80);
    const prenom = sanitizeText(body.prenom, 80);
    const email = sanitizeText(body.email, 120).toLowerCase();
    const telephone = normalizePhone(sanitizeText(body.telephone, 30));
    const password = typeof body.password === 'string' ? body.password : '';
    const date_naissance = sanitizeText(body.date_naissance, 20);
    const langue = body.langue === 'wo' ? 'wo' : 'fr';
    const consentNonMedical = Boolean(body.consent_non_medical);

    if (!nom || !prenom || !isValidEmail(email)) {
      res.status(400).json({ error: 'Nom, prénom et adresse email valide sont obligatoires.' });
      return;
    }
    if (!isValidSenegalPhone(telephone)) {
      res.status(400).json({ error: 'Numéro de téléphone Sénégal (+221 7X XXX XX XX) requis.' });
      return;
    }
    if (!isStrongPassword(password)) {
      res.status(400).json({ error: 'Le mot de passe doit contenir entre 8 et 128 caractères avec des lettres et des chiffres.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?')
      .get(email, telephone);
    if (existing) {
      res.status(409).json({ error: 'Un compte existe déjà avec cet email ou ce numéro.' });
      return;
    }

    if (accountType === 'COACH') {
      const specialite = sanitizeText(body.specialite, 120);
      const qualification = sanitizeText(body.qualification, 140);
      const zone = sanitizeText(body.zone, 80);
      const rawCoachPlan = sanitizeText(body.coach_plan, 30).toUpperCase();
      const coachPlan = rawCoachPlan === 'COACH_PRO' ? 'COACH_PRO' : 'MARKETPLACE';
      const confirmCoachTerms = Boolean(body.confirm_coach_plan ?? body.confirm_coach_platform_fee);

      const age = computeAge(date_naissance);
      if (age < 18 || age > 90) {
        res.status(400).json({ error: 'Un coach doit être majeur (18 ans minimum).' });
        return;
      }
      if (!specialite || !qualification || !zone) {
        res.status(400).json({ error: 'Spécialité, qualification et zone d’intervention sont obligatoires pour un coach.' });
        return;
      }
      if (!consentNonMedical || !confirmCoachTerms) {
        res.status(400).json({
          error: 'La confirmation des conditions Coach Terrain+ et de la charte non médicale est obligatoire.',
        });
        return;
      }

      const monthlyFee = coachPlan === 'COACH_PRO' ? 3000 : 0;
      const commissionPct = coachPlan === 'COACH_PRO' ? 0 : 20;
      const athletePayout = coachPlan === 'COACH_PRO' ? 5000 : 4000;

      const otp = generateOtpCode();
      const otpHash = hashToken(otp);
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const txCoach = db.transaction(() => {
        const uRes = db
          .prepare(
            `INSERT INTO users (
              nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
              statut, is_minor, verified, otp_code_hash, otp_expires_at
            ) VALUES (?, ?, ?, ?, ?, 'COACH', ?, ?, 'INSCRIT', 0, 0, ?, ?)`
          )
          .run(nom, prenom, telephone, email, hashPassword(password), date_naissance, langue, otpHash, otpExpires);
        const userId = Number(uRes.lastInsertRowid);

        db.prepare(
          `INSERT INTO coaches (
            user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
            platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa, verification_status
          ) VALUES (?, ?, ?, ?, ?, 5000, 'ACTIF_1000', ?, ?, ?, 'EN_ATTENTE')`
        ).run(userId, specialite, qualification, zone, monthlyFee, coachPlan, commissionPct, athletePayout);

        const insConsent = db.prepare('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)');
        insConsent.run(userId, 'NON_MEDICAL', 'v1.0');
        insConsent.run(userId, `COACH_PLAN_${coachPlan}`, 'v2.0');

        return userId;
      });

      const userId = txCoach();
      res.status(201).json({
        userId,
        email,
        telephone,
        role: 'COACH',
        coach_plan: coachPlan,
        message:
          coachPlan === 'COACH_PRO'
            ? 'Compte Coach Pro créé (3 000 FCFA / mois · 0 % commission). Validez le code OTP puis votre profil sera vérifié par un administrateur.'
            : 'Compte Coach Marketplace créé gratuitement (0 FCFA fixe · 4 000 F/athlète). Validez le code OTP puis votre profil sera vérifié par un administrateur.',
        ...(IS_PRODUCTION ? {} : { demoVerificationCode: otp }),
      });
      return;
    }

    // ATHLETE Registration
    const sport_code = sanitizeText(body.sport_code, 20) as SportCode;
    const niveau = (sanitizeText(body.niveau, 20) || 'debutant') as AthleteLevel;
    const poids_kg = Number(body.poids_kg);
    const taille_cm = body.taille_cm ? Number(body.taille_cm) : null;
    const poste = sanitizeText(body.poste, 60) || null;
    const consentSensible = Boolean(body.consent_sensible);
    const parentalName = sanitizeText(body.parental_consent_name, 100);
    const parentalPhone = normalizePhone(sanitizeText(body.parental_consent_phone, 30));
    const selectedCoachId = body.selected_coach_id ? Number(body.selected_coach_id) : null;
    const requestedPlan = sanitizeText(body.plan_tier, 20).toUpperCase();
    const billingCycle = sanitizeText(body.plan_billing_cycle, 20).toUpperCase() === 'TRIMESTRIEL' ? 'TRIMESTRIEL' : 'MENSUEL';
    const confirmPlanChoice = Boolean(body.confirm_coach_contribution || body.confirm_plan_choice);

    const planTier: 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE' =
      requestedPlan === 'COACH_PRIVE' || selectedCoachId !== null
        ? 'COACH_PRIVE'
        : requestedPlan === 'PROGRESSION'
          ? 'PROGRESSION'
          : 'ESSENTIEL';

    if (!VALID_SPORT_CODES.includes(sport_code)) {
      res.status(400).json({ error: 'Sport invalide.' });
      return;
    }
    if (!['debutant', 'intermediaire', 'avance'].includes(niveau)) {
      res.status(400).json({ error: 'Niveau invalide.' });
      return;
    }
    if (!Number.isFinite(poids_kg) || poids_kg < 30 || poids_kg > 220) {
      res.status(400).json({ error: 'Veuillez renseigner un poids valide (entre 30 et 220 kg).' });
      return;
    }
    if (taille_cm !== null && (!Number.isInteger(taille_cm) || taille_cm < 100 || taille_cm > 240)) {
      res.status(400).json({ error: 'La taille doit être comprise entre 100 et 240 cm.' });
      return;
    }
    if (!consentSensible || !consentNonMedical) {
      res.status(400).json({ error: 'Les consentements explicites sont obligatoires.' });
      return;
    }

    const age = computeAge(date_naissance);
    if (age < 12 || age > 90) {
      res.status(400).json({ error: 'Date de naissance invalide (âge minimum 12 ans).' });
      return;
    }
    const isMinor = age < 18;
    if (isMinor && (!parentalName || !isValidSenegalPhone(parentalPhone))) {
      res.status(400).json({ error: "L'accord et le téléphone (+221) d'un responsable légal sont obligatoires pour les mineurs." });
      return;
    }

    let validCoachId: number | null = null;
    if (planTier === 'COACH_PRIVE') {
      if (!selectedCoachId || !Number.isInteger(selectedCoachId) || selectedCoachId <= 0) {
        res.status(400).json({ error: 'Veuillez choisir un coach pour la formule Suivi Coach.' });
        return;
      }
      const coachExists = db
        .prepare(
          `SELECT u.id FROM users u
           JOIN coaches c ON c.user_id = u.id
           WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`
        )
        .get(selectedCoachId) as { id: number } | undefined;
      if (!coachExists) {
        res.status(404).json({ error: 'Le coach sélectionné est introuvable ou indisponible.' });
        return;
      }
      if (!confirmPlanChoice) {
        res.status(400).json({
          error: 'Confirmez la formule Suivi Coach à 5 000 FCFA / mois pour activer l’accompagnement.',
        });
        return;
      }
      validCoachId = coachExists.id;
    } else if (planTier === 'PROGRESSION' && !confirmPlanChoice) {
      res.status(400).json({
        error: 'Confirmez la formule Progression+ pour finaliser votre choix.',
      });
      return;
    }

    const planFeeFcfa =
      planTier === 'COACH_PRIVE'
        ? 5000
        : planTier === 'PROGRESSION'
          ? billingCycle === 'TRIMESTRIEL'
            ? 4000
            : 1500
          : 0;

    const otp = generateOtpCode();
    const otpHash = hashToken(otp);
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const tx = db.transaction(() => {
      const uRes = db
        .prepare(
          `INSERT INTO users (
            nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
            statut, is_minor, parental_consent_name, parental_consent_phone,
            verified, otp_code_hash, otp_expires_at
          ) VALUES (?, ?, ?, ?, ?, 'ATHLETE', ?, ?, 'INSCRIT', ?, ?, ?, 0, ?, ?)`
        )
        .run(
          nom,
          prenom,
          telephone,
          email,
          hashPassword(password),
          date_naissance,
          langue,
          isMinor ? 1 : 0,
          isMinor ? parentalName : null,
          isMinor ? parentalPhone : null,
          otpHash,
          otpExpires
        );
      const userId = Number(uRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO athlete_profiles (
          user_id, sport_code, niveau, taille_cm, poste, objectif,
          coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
          plan_tier, plan_fee_fcfa, plan_billing_cycle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${validCoachId ? "datetime('now')" : 'NULL'}, ?, ?, ?)`
      ).run(
        userId,
        sport_code,
        niveau,
        taille_cm,
        poste,
        `Régularité ${SPORTS_CONFIG[sport_code].nom}`,
        validCoachId ? 'ACTIF_5000' : 'GRATUIT_BASE',
        validCoachId ? 5000 : 0,
        planTier,
        planFeeFcfa,
        billingCycle
      );

      db.prepare("INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, date('now'))").run(
        userId,
        poids_kg
      );

      const insConsent = db.prepare('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)');
      insConsent.run(userId, 'DONNEES_SENSIBLES', 'v1.0');
      insConsent.run(userId, 'NON_MEDICAL', 'v1.0');
      if (isMinor) {
        insConsent.run(userId, 'ACCORD_PARENTAL', 'v1.0');
      }
      if (planTier !== 'ESSENTIEL') {
        insConsent.run(userId, `FORMULE_${planTier}`, 'v2.0');
      }
      if (validCoachId) {
        db.prepare("INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')").run(
          validCoachId,
          userId
        );
      }

      buildDefaultScheduleForAthlete(
        userId,
        sport_code,
        niveau,
        validCoachId,
        `Programme initial ${SPORTS_CONFIG[sport_code].nom}`
      );
      return userId;
    });

    const userId = tx();
    res.status(201).json({
      userId,
      email,
      telephone,
      role: 'ATHLETE',
      plan_tier: planTier,
      message: 'Compte créé. Validez votre inscription avec le code envoyé.',
      ...(IS_PRODUCTION ? {} : { demoVerificationCode: otp }),
    });
  });

  app.post('/api/auth/verify', authLimiter, otpLimiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const identifier = sanitizeText(body.identifier, 120).toLowerCase();
    const code = sanitizeText(body.code, 12).replace(/\s+/g, '');

    const user = db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?')
      .get(identifier, normalizePhone(identifier)) as
      | (AuthedUserRow & { otp_code_hash: string | null; otp_expires_at: string | null; otp_attempts: number })
      | undefined;

    if (!user || !user.otp_code_hash || !user.otp_expires_at) {
      res.status(400).json({ error: 'Aucune validation en attente pour cet identifiant.' });
      return;
    }
    if (user.otp_attempts >= 5) {
      db.prepare('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?').run(user.id);
      res.status(429).json({ error: 'Trop de codes incorrects. Demandez un nouveau code OTP.' });
      return;
    }
    if (new Date(user.otp_expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Code expiré. Demandez un nouveau code.' });
      return;
    }
    if (!verifyTokenHash(code, user.otp_code_hash)) {
      const nextAttempts = user.otp_attempts + 1;
      if (nextAttempts >= 5) {
        db.prepare('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?').run(user.id);
        res.status(429).json({ error: 'Code incorrect. Limite atteinte, demandez un nouveau code OTP.' });
        return;
      }
      db.prepare('UPDATE users SET otp_attempts = ? WHERE id = ?').run(nextAttempts, user.id);
      res.status(400).json({ error: 'Code de validation incorrect.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET verified = 1, statut = 'ACTIF', otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0
       WHERE id = ?`
    ).run(user.id);

    const sessionToken = createSessionForUser(req, res, user.id);
    const updated = db
      .prepare('SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?')
      .get(user.id) as AuthedUserRow;
    res.json({ user: mapUserPublic(updated), sessionToken });
  });

  app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const identifier = sanitizeText(body.identifier, 120);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password || password.length > 128) {
      res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?')
      .get(identifier, normalizePhone(identifier)) as
      | (AuthedUserRow & {
          password_hash: string;
          failed_login_attempts: number;
          locked_until: string | null;
        })
      | undefined;

    if (!user) {
      res.status(404).json({
        error: "Ces identifiants n'existent pas sur Terrain+. Veuillez créer un compte pour accéder à votre espace.",
        accountNotFound: true,
      });
      return;
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      res.status(429).json({
        error: 'Compte temporairement verrouillé après plusieurs tentatives échouées. Réessayez dans quelques minutes.',
      });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      const nextFails = (user.failed_login_attempts || 0) + 1;
      const shouldLock = nextFails >= 5;
      const lockUntil = shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString() : null;
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
        shouldLock ? 0 : nextFails,
        lockUntil,
        user.id
      );
      if (shouldLock) {
        logAccess(user.id, user.role, null, 'VERROUILLAGE_COMPTE', 'tentatives_connexion_echouees');
        res.status(429).json({
          error: 'Compte verrouillé pendant 15 minutes suite à 5 mots de passe incorrects.',
        });
        return;
      }
      const remaining = 5 - nextFails;
      res.status(401).json({
        error:
          remaining <= 2
            ? `Mot de passe incorrect. Il reste ${remaining} tentative${remaining > 1 ? 's' : ''} avant verrouillage de 15 minutes.`
            : 'Mot de passe incorrect.',
      });
      return;
    }

    if (user.statut === 'CLOTURE') {
      res.status(403).json({ error: 'Ce compte a été clôturé.' });
      return;
    }

    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    if (!user.verified) {
      const otp = generateOtpCode();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?').run(
        hashToken(otp),
        otpExpires,
        user.id
      );
      res.status(403).json({
        error: 'Compte en attente de validation. Saisissez votre code OTP pour vous connecter.',
        needsVerification: true,
        identifier: user.email,
        ...(IS_PRODUCTION ? {} : { demoVerificationCode: otp }),
      });
      return;
    }

    const sessionToken = createSessionForUser(req, res, user.id);
    res.json({ user: mapUserPublic(user), sessionToken });
  });

  app.post('/api/auth/request-otp', authLimiter, otpLimiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const identifier = sanitizeText(body.identifier, 120);
    const user = db
      .prepare("SELECT id, email, telephone FROM users WHERE (LOWER(email) = LOWER(?) OR telephone = ?) AND statut != 'CLOTURE'")
      .get(identifier, normalizePhone(identifier)) as { id: number; email: string; telephone: string } | undefined;

    if (!user) {
      res.status(404).json({
        error: "Ces identifiants n'existent pas sur Terrain+. Veuillez créer un compte.",
        accountNotFound: true,
      });
      return;
    }
    const otp = generateOtpCode();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?').run(
      hashToken(otp),
      otpExpires,
      user.id
    );

    res.json({
      message: 'Code à usage unique généré.',
      ...(IS_PRODUCTION ? {} : { demoOtpCode: otp }),
    });
  });

  app.post('/api/auth/login-otp', authLimiter, otpLimiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const identifier = sanitizeText(body.identifier, 120);
    const code = sanitizeText(body.code, 12).replace(/\s+/g, '');

    const user = db
      .prepare("SELECT * FROM users WHERE (LOWER(email) = LOWER(?) OR telephone = ?) AND statut != 'CLOTURE'")
      .get(identifier, normalizePhone(identifier)) as
      | (AuthedUserRow & { otp_code_hash: string | null; otp_expires_at: string | null; otp_attempts: number })
      | undefined;

    if (!user || !user.otp_code_hash || !user.otp_expires_at) {
      res.status(401).json({ error: 'Code invalide ou expiré.' });
      return;
    }
    if (user.otp_attempts >= 5) {
      db.prepare('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?').run(user.id);
      res.status(429).json({ error: 'Trop de codes incorrects. Demandez un nouveau code OTP.' });
      return;
    }
    if (new Date(user.otp_expires_at).getTime() < Date.now()) {
      res.status(401).json({ error: 'Code expiré. Demandez un nouveau code.' });
      return;
    }
    if (!verifyTokenHash(code, user.otp_code_hash)) {
      const nextAttempts = user.otp_attempts + 1;
      if (nextAttempts >= 5) {
        db.prepare('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?').run(user.id);
        res.status(429).json({ error: 'Code incorrect. Limite atteinte, demandez un nouveau code OTP.' });
        return;
      }
      db.prepare('UPDATE users SET otp_attempts = ? WHERE id = ?').run(nextAttempts, user.id);
      res.status(401).json({ error: 'Code incorrect ou expiré.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET verified = 1,
           statut = CASE WHEN statut = 'INSCRIT' THEN 'ACTIF' ELSE statut END,
           otp_code_hash = NULL,
           otp_expires_at = NULL,
           otp_attempts = 0,
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE id = ?`
    ).run(user.id);

    const sessionToken = createSessionForUser(req, res, user.id);
    const refreshed = db
      .prepare('SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?')
      .get(user.id) as AuthedUserRow;
    res.json({ user: mapUserPublic(refreshed), sessionToken });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res: Response) => {
    const rawToken = extractRawToken(req);
    if (rawToken) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (!currentPassword || !isStrongPassword(newPassword)) {
      res.status(400).json({
        error: 'Mot de passe actuel requis et nouveau mot de passe d’au moins 8 caractères avec lettres et chiffres.',
      });
      return;
    }
    if (currentPassword === newPassword) {
      res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l’actuel.' });
      return;
    }

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
      return;
    }

    const userId = req.authUser!.id;
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    const sessionToken = createSessionForUser(req, res, userId);
    logAccess(userId, req.authUser!.role, null, 'CHANGEMENT_MOT_DE_PASSE', 'securite_compte');
    res.json({
      ok: true,
      sessionToken,
      message: 'Mot de passe mis à jour et anciennes sessions révoquées.',
    });
  });

  // ---------------- PUBLIC COACHES & PARTNER ECOSYSTEM ROUTES (AGGREGATED ONLY) ----------------
  app.get('/api/public/coaches', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    res.json({ coaches: getPublicCoachesList() });
  });

  app.get('/api/public/partners', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    const partners = db
      .prepare(
        `SELECT p.id, p.nom, p.type, p.zone,
                (SELECT COUNT(*) FROM groups g WHERE g.partner_id = p.id) as groups_count,
                (SELECT COUNT(*) FROM group_memberships gm JOIN groups g2 ON g2.id = gm.group_id WHERE g2.partner_id = p.id) as members_count
         FROM partners p
         ORDER BY p.id ASC`
      )
      .all();

    const groups = db
      .prepare(
        `SELECT g.id, g.nom, g.partner_id, p.nom as partner_nom, p.type as partner_type, p.zone,
                g.captain_name, g.sport_code,
                (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) as member_count
         FROM groups g
         JOIN partners p ON p.id = g.partner_id
         ORDER BY g.id ASC`
      )
      .all();

    const challenges = db
      .prepare(
        `SELECT c.id, c.partner_id, p.nom as partner_nom, p.type as partner_type, p.zone,
                c.titre, c.indicateur, c.periode, c.target_sessions, c.current_sessions
         FROM challenges c
         JOIN partners p ON p.id = c.partner_id
         ORDER BY c.id ASC`
      )
      .all();

    res.json({ partners, groups, challenges });
  });

  app.post('/api/public/partner-requests', (req: Request, res: Response) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`partner_req:${ip}`, 10, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Trop de demandes envoyées. Réessayez dans quelques minutes.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const organisation = sanitizeText(body.organisation, 140);
    const type = sanitizeText(body.type, 20).toUpperCase();
    const zone = sanitizeText(body.zone, 80);
    const contactNom = sanitizeText(body.contact_nom, 100);
    const contactPhone = normalizePhone(sanitizeText(body.contact_telephone, 30));
    const contactEmail = sanitizeText(body.contact_email, 120).toLowerCase();
    const sportPrincipal = sanitizeText(body.sport_principal, 40);
    const nombreAthletes = body.nombre_athletes_estime ? Number(body.nombre_athletes_estime) : null;
    const message = sanitizeText(body.message, 600);
    const packSouhaite = sanitizeText(body.pack_souhaite, 60) || 'PACK_ASC_CAMPUS';

    if (!organisation || !zone || !contactNom) {
      res.status(400).json({ error: 'Organisation, zone et nom du responsable sont obligatoires.' });
      return;
    }
    if (!['ASC', 'CAMPUS', 'LIGUE'].includes(type)) {
      res.status(400).json({ error: 'Type de structure invalide (ASC, CAMPUS ou LIGUE).' });
      return;
    }
    if (!isValidSenegalPhone(contactPhone)) {
      res.status(400).json({ error: 'Numéro de téléphone Sénégal (+221 7X XXX XX XX) requis.' });
      return;
    }
    if (contactEmail && !isValidEmail(contactEmail)) {
      res.status(400).json({ error: 'Adresse email invalide.' });
      return;
    }

    db.prepare(
      `INSERT INTO partner_requests (
        organisation, type, zone, contact_nom, contact_telephone, contact_email,
        sport_principal, nombre_athletes_estime, pack_souhaite, message, statut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOUVELLE')`
    ).run(
      organisation,
      type,
      zone,
      contactNom,
      contactPhone,
      contactEmail || null,
      sportPrincipal || null,
      nombreAthletes && Number.isFinite(nombreAthletes) ? Math.max(1, Math.min(5000, Math.round(nombreAthletes))) : null,
      packSouhaite,
      message || null
    );

    res.status(201).json({
      ok: true,
      message: 'Demande de partenariat enregistrée. L’équipe Terrain+ vous contactera sous 48 h.',
    });
  });

  // ---------------- ATHLETE ROUTES ----------------
  app.get('/api/athlete/workspace', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const data = buildAthleteWorkspace(req.authUser!.id);
    if (!data) {
      res.status(404).json({ error: 'Profil athlète introuvable.' });
      return;
    }
    res.json(data);
  });

  app.post('/api/athlete/complete-session', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const scheduledId = body.scheduled_id ? Number(body.scheduled_id) : null;
    const sessionId = body.session_id ? Number(body.session_id) : null;
    const fatigue = Number(body.ressenti_fatigue);
    const difficulte = Number(body.difficulte);
    const sommeil = Number(body.qualite_sommeil);

    if (
      !Number.isInteger(fatigue) || fatigue < 1 || fatigue > 10 ||
      !Number.isInteger(difficulte) || difficulte < 1 || difficulte > 10 ||
      !Number.isInteger(sommeil) || sommeil < 1 || sommeil > 10
    ) {
      res.status(400).json({ error: 'Les notes de ressenti, difficulté et sommeil doivent être comprises entre 1 et 10.' });
      return;
    }

    const userId = req.authUser!.id;
    if (scheduledId) {
      const owned = db
        .prepare('SELECT id FROM scheduled_sessions WHERE id = ? AND athlete_user_id = ?')
        .get(scheduledId, userId);
      if (!owned) {
        res.status(403).json({ error: 'Séance non autorisée.' });
        return;
      }
      db.prepare(
        `UPDATE scheduled_sessions
         SET completed = 1, ressenti_fatigue = ?, difficulte = ?, qualite_sommeil = ?, completed_at = datetime('now')
         WHERE id = ?`
      ).run(fatigue, difficulte, sommeil, scheduledId);
    } else if (sessionId) {
      const plan = db
        .prepare('SELECT id FROM program_plans WHERE athlete_user_id = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { id: number } | undefined;
      if (plan) {
        const day = ((new Date().getDay() + 6) % 7) + 1;
        db.prepare(
          `INSERT INTO scheduled_sessions (
            program_id, athlete_user_id, session_id, jour_semaine, date_prevue,
            is_rest_day, completed, ressenti_fatigue, difficulte, qualite_sommeil, completed_at
          ) VALUES (?, ?, ?, ?, date('now'), 0, 1, ?, ?, ?, datetime('now'))`
        ).run(plan.id, userId, sessionId, day, fatigue, difficulte, sommeil);
      }
    }

    // Increment collective challenge counter
    db.prepare('UPDATE challenges SET current_sessions = current_sessions + 1 WHERE id = 1').run();
    res.json({ ok: true });
  });

  app.post('/api/athlete/evaluations', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const values = body.values as Record<string, number> | undefined;
    if (!values || typeof values !== 'object') {
      res.status(400).json({ error: 'Valeurs des tests requises.' });
      return;
    }

    const userId = req.authUser!.id;
    const profile = db
      .prepare('SELECT sport_code, niveau FROM athlete_profiles WHERE user_id = ?')
      .get(userId) as { sport_code: SportCode; niveau: AthleteLevel } | undefined;
    if (!profile) {
      res.status(404).json({ error: 'Profil introuvable.' });
      return;
    }

    const sportConf = SPORTS_CONFIG[profile.sport_code];
    const results = [];
    let totalScore = 0;

    for (const testSpec of sportConf.tests) {
      const rawVal = Number(values[testSpec.code]);
      if (!Number.isFinite(rawVal) || rawVal <= 0 || rawVal > 1000) {
        res.status(400).json({ error: `Valeur invalide pour ${testSpec.nom}.` });
        return;
      }
      const { rating, score100 } = evaluateTestValue(testSpec, profile.niveau, rawVal);
      totalScore += score100;
      results.push({
        test_code: testSpec.code,
        test_nom: testSpec.nom,
        valeur: Number(rawVal.toFixed(1)),
        unite: testSpec.unite,
        niveau_obtenu: rating,
      });
    }

    const prevCount = (db.prepare('SELECT COUNT(*) as c FROM evaluations WHERE athlete_user_id = ?').get(userId) as { c: number }).c;
    const evalType = prevCount === 0 ? 'INITIALE' : 'PERIODIQUE';
    const scoreGlobal = Math.round(totalScore / sportConf.tests.length);

    db.prepare(
      `INSERT INTO evaluations (athlete_user_id, type, sport_code, date, score_global, results_json)
       VALUES (?, ?, ?, date('now'), ?, ?)`
    ).run(userId, evalType, profile.sport_code, scoreGlobal, JSON.stringify(results));

    db.prepare("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'").run(userId);
    res.status(201).json({ score_global: scoreGlobal, results, type: evalType });
  });

  app.post('/api/athlete/pain-alert', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const zone = sanitizeText(body.zone_douleur, 80);
    const intensite = Number(body.intensite);
    const message = sanitizeText(body.message, 400);

    if (!zone || !Number.isInteger(intensite) || intensite < 1 || intensite > 10 || !message) {
      res.status(400).json({ error: 'Zone, intensité (1-10) et description requises.' });
      return;
    }

    db.prepare(
      `INSERT INTO alerts (athlete_user_id, type, zone_douleur, intensite, message)
       VALUES (?, 'DOULEUR', ?, ?, ?)`
    ).run(req.authUser!.id, zone, intensite, message);

    res.status(201).json({ ok: true });
  });

  app.post('/api/athlete/weight', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const poids = Number((req.body as Record<string, unknown>).poids_kg);
    if (!Number.isFinite(poids) || poids < 30 || poids > 220) {
      res.status(400).json({ error: 'Poids invalide (entre 30 et 220 kg).' });
      return;
    }
    db.prepare("INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, date('now'))").run(
      req.authUser!.id,
      Number(poids.toFixed(1))
    );
    res.status(201).json({ ok: true });
  });

  app.patch('/api/athlete/profile', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const userId = req.authUser!.id;

    const nom = sanitizeText(body.nom, 80);
    const prenom = sanitizeText(body.prenom, 80);
    const langue = body.langue === 'wo' ? 'wo' : 'fr';
    const niveau = sanitizeText(body.niveau, 20) as AthleteLevel;
    const poste = sanitizeText(body.poste, 60);
    const taille_cm = body.taille_cm ? Number(body.taille_cm) : null;
    const eco_data_mode = body.eco_data_mode ? 1 : 0;
    const notifications_enabled = body.notifications_enabled ? 1 : 0;
    const rawReminderTime = sanitizeText(body.reminder_time, 10);
    const reminder_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawReminderTime) ? rawReminderTime : undefined;
    const rawLead = Number(body.reminder_lead_minutes);
    const reminder_lead_minutes = [0, 15, 30, 60, 120].includes(rawLead) ? rawLead : undefined;

    if (!nom || !prenom || !['debutant', 'intermediaire', 'avance'].includes(niveau)) {
      res.status(400).json({ error: 'Champs de profil invalides.' });
      return;
    }
    if (taille_cm !== null && (!Number.isInteger(taille_cm) || taille_cm < 100 || taille_cm > 240)) {
      res.status(400).json({ error: 'La taille doit être comprise entre 100 et 240 cm.' });
      return;
    }

    db.prepare('UPDATE users SET nom = ?, prenom = ?, langue = ? WHERE id = ?').run(nom, prenom, langue, userId);
    db.prepare(
      `UPDATE athlete_profiles
       SET niveau = ?, poste = ?, taille_cm = ?, eco_data_mode = ?, notifications_enabled = ?,
           reminder_time = COALESCE(?, reminder_time),
           reminder_lead_minutes = COALESCE(?, reminder_lead_minutes)
       WHERE user_id = ?`
    ).run(niveau, poste || null, taille_cm, eco_data_mode, notifications_enabled, reminder_time ?? null, reminder_lead_minutes ?? null, userId);

    res.json({ ok: true });
  });

  app.patch('/api/athlete/reminders', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const userId = req.authUser!.id;
    const notifications_enabled = body.notifications_enabled ? 1 : 0;
    const reminder_time = sanitizeText(body.reminder_time, 10) || '18:00';
    const reminder_lead_minutes = Number(body.reminder_lead_minutes);

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder_time)) {
      res.status(400).json({ error: 'Heure de rappel invalide (format HH:MM requis).' });
      return;
    }
    if (![0, 15, 30, 60, 120].includes(reminder_lead_minutes)) {
      res.status(400).json({ error: 'Délai de rappel invalide.' });
      return;
    }

    db.prepare(
      `UPDATE athlete_profiles
       SET notifications_enabled = ?, reminder_time = ?, reminder_lead_minutes = ?
       WHERE user_id = ?`
    ).run(notifications_enabled, reminder_time, reminder_lead_minutes, userId);

    res.json({
      ok: true,
      notifications_enabled: Boolean(notifications_enabled),
      reminder_time,
      reminder_lead_minutes,
    });
  });

  app.post('/api/athlete/change-sport', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const sportCode = sanitizeText(body.sport_code, 20) as SportCode;
    if (!VALID_SPORT_CODES.includes(sportCode)) {
      res.status(400).json({ error: 'Sport invalide.' });
      return;
    }
    const userId = req.authUser!.id;
    const prof = db.prepare('SELECT niveau FROM athlete_profiles WHERE user_id = ?').get(userId) as { niveau: AthleteLevel } | undefined;
    const coach = db
      .prepare("SELECT coach_user_id FROM assignments WHERE athlete_user_id = ? AND statut = 'ACTIF' LIMIT 1")
      .get(userId) as { coach_user_id: number } | undefined;

    db.prepare('UPDATE athlete_profiles SET sport_code = ?, poste = NULL WHERE user_id = ?').run(sportCode, userId);
    buildDefaultScheduleForAthlete(
      userId,
      sportCode,
      prof ? prof.niveau : 'debutant',
      coach ? coach.coach_user_id : null,
      `Nouveau cycle ${SPORTS_CONFIG[sportCode].nom}`
    );
    res.json({ ok: true });
  });

  app.post('/api/athlete/select-plan', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const rawPlan = sanitizeText(body.plan_tier, 20).toUpperCase();
    const billingCycle = sanitizeText(body.billing_cycle, 20).toUpperCase() === 'TRIMESTRIEL' ? 'TRIMESTRIEL' : 'MENSUEL';
    const coachUserId = body.coach_user_id ? Number(body.coach_user_id) : null;
    const confirmPlan = Boolean(body.confirm_plan);

    if (!['ESSENTIEL', 'PROGRESSION', 'COACH_PRIVE'].includes(rawPlan)) {
      res.status(400).json({ error: 'Formule invalide (ESSENTIEL, PROGRESSION ou COACH_PRIVE).' });
      return;
    }
    const planTier = rawPlan as 'ESSENTIEL' | 'PROGRESSION' | 'COACH_PRIVE';

    if (planTier !== 'ESSENTIEL' && !confirmPlan) {
      res.status(400).json({ error: 'Veuillez confirmer la formule sélectionnée.' });
      return;
    }

    let validCoach: { id: number; prenom: string; nom: string } | null = null;
    if (planTier === 'COACH_PRIVE') {
      if (!coachUserId || !Number.isInteger(coachUserId) || coachUserId <= 0) {
        res.status(400).json({ error: 'Choisissez un coach vérifié pour activer Suivi Coach.' });
        return;
      }
      const coachRow = db
        .prepare(
          `SELECT u.id, u.prenom, u.nom
           FROM users u
           JOIN coaches c ON c.user_id = u.id
           WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`
        )
        .get(coachUserId) as { id: number; prenom: string; nom: string } | undefined;
      if (!coachRow) {
        res.status(404).json({ error: 'Coach introuvable ou indisponible.' });
        return;
      }
      validCoach = coachRow;
    }

    const athleteId = req.authUser!.id;
    const planFee =
      planTier === 'COACH_PRIVE'
        ? 5000
        : planTier === 'PROGRESSION'
          ? billingCycle === 'TRIMESTRIEL'
            ? 4000
            : 1500
          : 0;

    const tx = db.transaction(() => {
      if (validCoach) {
        db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'").run(athleteId);
        db.prepare("INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')").run(
          validCoach.id,
          athleteId
        );
        db.prepare('UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?').run(validCoach.id, athleteId);
        db.prepare(
          `UPDATE athlete_profiles
           SET plan_tier = 'COACH_PRIVE',
               plan_fee_fcfa = 5000,
               plan_billing_cycle = 'MENSUEL',
               coach_subscription_status = 'ACTIF_5000',
               coach_monthly_fee_fcfa = 5000,
               coach_subscribed_at = datetime('now')
           WHERE user_id = ?`
        ).run(athleteId);
        db.prepare("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'").run(athleteId);
      } else {
        db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'").run(athleteId);
        db.prepare('UPDATE program_plans SET coach_user_id = NULL WHERE athlete_user_id = ?').run(athleteId);
        db.prepare(
          `UPDATE athlete_profiles
           SET plan_tier = ?,
               plan_fee_fcfa = ?,
               plan_billing_cycle = ?,
               coach_subscription_status = 'GRATUIT_BASE',
               coach_monthly_fee_fcfa = 0,
               coach_subscribed_at = NULL
           WHERE user_id = ?`
        ).run(planTier, planFee, billingCycle, athleteId);
      }

      logAccess(athleteId, 'ATHLETE', athleteId, `CHANGEMENT_FORMULE_${planTier}`, `fee:${planFee}`);
    });
    tx();

    res.json({
      ok: true,
      plan_tier: planTier,
      plan_fee_fcfa: planFee,
      message:
        planTier === 'COACH_PRIVE' && validCoach
          ? `Formule Suivi Coach activée avec ${validCoach.prenom} ${validCoach.nom} (5 000 FCFA / mois).`
          : planTier === 'PROGRESSION'
            ? `Formule Progression+ activée (${planFee.toLocaleString('fr-FR')} FCFA / ${billingCycle === 'TRIMESTRIEL' ? 'trimestre' : 'mois'}).`
            : 'Vous êtes sur l’accès Essentiel 100 % gratuit (0 FCFA).',
    });
  });

  app.post('/api/athlete/select-coach', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const coachUserId = Number(body.coach_user_id);
    const confirmContribution = Boolean(body.confirm_contribution);

    if (!Number.isInteger(coachUserId) || coachUserId <= 0) {
      res.status(400).json({ error: 'Identifiant du coach invalide.' });
      return;
    }
    if (!confirmContribution) {
      res.status(400).json({
        error: 'Veuillez confirmer la contribution Privilège Jeunes de 5 000 FCFA / mois pour activer le suivi coach.',
      });
      return;
    }

    const coach = db
      .prepare(
        `SELECT u.id, u.prenom, u.nom
         FROM users u
         JOIN coaches c ON c.user_id = u.id
         WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`
      )
      .get(coachUserId) as { id: number; prenom: string; nom: string } | undefined;

    if (!coach) {
      res.status(404).json({ error: 'Coach introuvable ou indisponible.' });
      return;
    }

    const athleteId = req.authUser!.id;
    const tx = db.transaction(() => {
      db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'").run(athleteId);
      db.prepare("INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')").run(
        coachUserId,
        athleteId
      );
      db.prepare('UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?').run(coachUserId, athleteId);
      db.prepare(
        `UPDATE athlete_profiles
         SET plan_tier = 'COACH_PRIVE',
             plan_fee_fcfa = 5000,
             plan_billing_cycle = 'MENSUEL',
             coach_subscription_status = 'ACTIF_5000',
             coach_monthly_fee_fcfa = 5000,
             coach_subscribed_at = datetime('now')
         WHERE user_id = ?`
      ).run(athleteId);
      db.prepare("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'").run(athleteId);

      const hasConsent = db
        .prepare("SELECT id FROM consents WHERE user_id = ? AND type = 'COACH_PRIVILEGE_5000'")
        .get(athleteId);
      if (!hasConsent) {
        db.prepare("INSERT INTO consents (user_id, type, version) VALUES (?, 'COACH_PRIVILEGE_5000', 'v1.0')").run(athleteId);
      }
      logAccess(athleteId, 'ATHLETE', athleteId, 'SELECTION_COACH_5000', `coach:${coachUserId}`);
    });
    tx();

    res.json({
      ok: true,
      message: `Suivi activé avec ${coach.prenom} ${coach.nom} (Privilège Jeunes · 5 000 FCFA / mois).`,
    });
  });

  app.post('/api/athlete/cancel-coach', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const athleteId = req.authUser!.id;
    const tx = db.transaction(() => {
      db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'").run(athleteId);
      db.prepare('UPDATE program_plans SET coach_user_id = NULL WHERE athlete_user_id = ?').run(athleteId);
      db.prepare(
        `UPDATE athlete_profiles
         SET plan_tier = 'ESSENTIEL',
             plan_fee_fcfa = 0,
             plan_billing_cycle = 'MENSUEL',
             coach_subscription_status = 'GRATUIT_BASE',
             coach_monthly_fee_fcfa = 0,
             coach_subscribed_at = NULL
         WHERE user_id = ?`
      ).run(athleteId);
      logAccess(athleteId, 'ATHLETE', athleteId, 'RETOUR_BASE_GRATUITE', 'coach_suivi_desactive');
    });
    tx();

    res.json({
      ok: true,
      message: 'Vous êtes repassé sur l’accès Essentiel 100 % gratuit. Votre programme et vos tests restent actifs.',
    });
  });

  app.post('/api/athlete/request-coach-change', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const motif = sanitizeText((req.body as Record<string, unknown>).motif, 300) || 'Demande de réaffectation de coach';
    db.prepare(
      `INSERT INTO alerts (athlete_user_id, type, message) VALUES (?, 'CHANGEMENT_COACH', ?)`
    ).run(req.authUser!.id, motif);
    res.status(201).json({ ok: true });
  });

  app.post('/api/athlete/groups/:groupId/toggle', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      res.status(400).json({ error: 'Identifiant de groupe invalide.' });
      return;
    }
    const groupExists = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
    if (!groupExists) {
      res.status(404).json({ error: 'Groupe introuvable.' });
      return;
    }
    const userId = req.authUser!.id;
    const exists = db.prepare('SELECT id FROM group_memberships WHERE user_id = ? AND group_id = ?').get(userId, groupId);
    if (exists) {
      db.prepare('DELETE FROM group_memberships WHERE user_id = ? AND group_id = ?').run(userId, groupId);
      res.json({ joined: false });
    } else {
      db.prepare('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)').run(userId, groupId);
      res.json({ joined: true });
    }
  });

  app.get('/api/athlete/export', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const data = buildAthleteWorkspace(req.authUser!.id);
    logAccess(req.authUser!.id, 'ATHLETE', req.authUser!.id, 'EXPORT_DONNEES', 'profil,poids,evaluations');
    res.json({
      exported_at: new Date().toISOString(),
      platform: 'Terrain+',
      data,
    });
  });

  app.delete('/api/athlete/account', requireAuth, requireRole('ATHLETE'), (req: AuthedRequest, res: Response) => {
    const userId = req.authUser!.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Saisissez votre mot de passe actuel pour confirmer la suppression du compte.' });
      return;
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Mot de passe incorrect : suppression annulée.' });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logAccess(null, 'ATHLETE', null, 'SUPPRESSION_COMPTE', 'donnees_personnelles');
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // ---------------- COACH ROUTES ----------------
  app.get('/api/coach/overview', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const coachId = req.authUser!.id;
    const athleteRows = db
      .prepare(
        `SELECT u.id, u.nom, u.prenom, u.statut, u.is_minor, ap.sport_code, ap.niveau
         FROM assignments a
         JOIN users u ON u.id = a.athlete_user_id
         JOIN athlete_profiles ap ON ap.user_id = u.id
         WHERE a.coach_user_id = ? AND a.statut = 'ACTIF' AND u.statut != 'CLOTURE'
         ORDER BY u.nom ASC`
      )
      .all(coachId) as Array<Record<string, unknown>>;

    const athletes = athleteRows.map((a) => {
      const aid = Number(a.id);
      const sched = db
        .prepare('SELECT completed, is_rest_day FROM scheduled_sessions WHERE athlete_user_id = ?')
        .all(aid) as Array<{ completed: number; is_rest_day: number }>;
      const train = sched.filter((s) => !s.is_rest_day);
      const weeklyCompleted = train.filter((s) => s.completed).length;
      const lastEval = db
        .prepare('SELECT score_global FROM evaluations WHERE athlete_user_id = ? ORDER BY date DESC, id DESC LIMIT 1')
        .get(aid) as { score_global: number } | undefined;
      const openAlerts = db
        .prepare('SELECT type FROM alerts WHERE athlete_user_id = ? AND traitee = 0')
        .all(aid) as Array<{ type: string }>;

      return {
        id: aid,
        nom: String(a.nom),
        prenom: String(a.prenom),
        sport_code: String(a.sport_code) as SportCode,
        niveau: String(a.niveau) as AthleteLevel,
        statut: String(a.statut),
        is_minor: Boolean(a.is_minor),
        weeklyCompleted,
        weeklyTarget: train.length || 4,
        lastEvaluationScore: lastEval ? lastEval.score_global : null,
        openAlertsCount: openAlerts.length,
        hasPainAlert: openAlerts.some((al) => al.type === 'DOULEUR'),
      };
    });

    const alerts = db
      .prepare(
        `SELECT al.*, (u.prenom || ' ' || u.nom) as athlete_nom, ap.sport_code as athlete_sport
         FROM alerts al
         JOIN assignments a ON a.athlete_user_id = al.athlete_user_id AND a.coach_user_id = ? AND a.statut = 'ACTIF'
         JOIN users u ON u.id = al.athlete_user_id
         JOIN athlete_profiles ap ON ap.user_id = u.id
         ORDER BY al.traitee ASC, al.date DESC`
      )
      .all(coachId)
      .map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return { ...row, traitee: Boolean(row.traitee) };
      });

    const library = db
      .prepare('SELECT id, sport_code, titre, niveau, duree_min, objectif, prevention_focus, relue_par, validation_status FROM sessions_library ORDER BY sport_code, id')
      .all();

    const coachProfile = db
      .prepare(
        `SELECT specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
                platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa, verification_status
         FROM coaches WHERE user_id = ?`
      )
      .get(coachId) as
      | {
          specialite: string;
          qualification: string;
          zone: string;
          monthly_fee_fcfa: number;
          athlete_monthly_fee_fcfa: number;
          platform_subscription_status: string;
          coach_plan: 'MARKETPLACE' | 'COACH_PRO';
          commission_pct: number;
          athlete_payout_fcfa: number;
          verification_status: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
        }
      | undefined;

    res.json({
      coach: mapUserPublic(req.authUser!),
      coachProfile: coachProfile || null,
      athletes,
      alerts,
      library,
    });
  });

  app.patch('/api/coach/plan', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const rawPlan = sanitizeText((req.body as Record<string, unknown>).coach_plan, 30).toUpperCase();
    if (!['MARKETPLACE', 'COACH_PRO'].includes(rawPlan)) {
      res.status(400).json({ error: 'Formule coach invalide (MARKETPLACE ou COACH_PRO).' });
      return;
    }
    const coachPlan = rawPlan as 'MARKETPLACE' | 'COACH_PRO';
    const monthlyFee = coachPlan === 'COACH_PRO' ? 3000 : 0;
    const commissionPct = coachPlan === 'COACH_PRO' ? 0 : 20;
    const athletePayout = coachPlan === 'COACH_PRO' ? 5000 : 4000;

    db.prepare(
      `UPDATE coaches
       SET coach_plan = ?, monthly_fee_fcfa = ?, commission_pct = ?, athlete_payout_fcfa = ?
       WHERE user_id = ?`
    ).run(coachPlan, monthlyFee, commissionPct, athletePayout, req.authUser!.id);

    logAccess(req.authUser!.id, 'COACH', null, `COACH_PLAN_${coachPlan}`, `fee:${monthlyFee}`);
    res.json({
      ok: true,
      coach_plan: coachPlan,
      message:
        coachPlan === 'COACH_PRO'
          ? 'Licence Coach Pro activée (3 000 FCFA / mois · 0 % commission sur vos athlètes).'
          : 'Option Marketplace activée (0 FCFA fixe · 4 000 FCFA reversés par athlète suivi).',
    });
  });

  app.get('/api/coach/athletes/:athleteId', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const coachId = req.authUser!.id;
    const athleteId = Number(req.params.athleteId);

    const assigned = db
      .prepare("SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'")
      .get(coachId, athleteId);
    if (!assigned) {
      res.status(403).json({ error: "Cet athlète ne vous est pas affecté." });
      return;
    }

    logAccess(coachId, 'COACH', athleteId, 'CONSULTATION_FICHE', 'evaluations,programme,poids,alertes');
    const workspace = buildAthleteWorkspace(athleteId);
    if (!workspace) {
      res.status(404).json({ error: 'Fiche athlète introuvable.' });
      return;
    }
    res.json(workspace);
  });

  app.post('/api/coach/evaluations/:evalId/comment', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const evalId = Number(req.params.evalId);
    const coachId = req.authUser!.id;
    const texte = sanitizeText((req.body as Record<string, unknown>).texte, 500);
    if (!texte) {
      res.status(400).json({ error: 'Commentaire vide.' });
      return;
    }

    const ev = db.prepare('SELECT athlete_user_id FROM evaluations WHERE id = ?').get(evalId) as { athlete_user_id: number } | undefined;
    if (!ev) {
      res.status(404).json({ error: 'Évaluation introuvable.' });
      return;
    }
    const assigned = db
      .prepare("SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'")
      .get(coachId, ev.athlete_user_id);
    if (!assigned) {
      res.status(403).json({ error: 'Non autorisé pour cet athlète.' });
      return;
    }

    db.prepare('INSERT INTO coach_comments (coach_user_id, evaluation_id, texte) VALUES (?, ?, ?)').run(
      coachId,
      evalId,
      texte
    );
    logAccess(coachId, 'COACH', ev.athlete_user_id, 'COMMENTAIRE_EVALUATION', `evaluation:${evalId}`);
    res.status(201).json({ ok: true });
  });

  app.patch('/api/coach/athletes/:athleteId/objectives', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const coachId = req.authUser!.id;
    const athleteId = Number(req.params.athleteId);
    const objectif = sanitizeText((req.body as Record<string, unknown>).objectif, 200);

    const assigned = db
      .prepare("SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'")
      .get(coachId, athleteId);
    if (!assigned || !objectif) {
      res.status(403).json({ error: 'Opération non autorisée ou objectif vide.' });
      return;
    }

    db.prepare('UPDATE athlete_profiles SET objectif = ? WHERE user_id = ?').run(objectif, athleteId);
    db.prepare('UPDATE program_plans SET objectif = ? WHERE athlete_user_id = ?').run(objectif, athleteId);
    logAccess(coachId, 'COACH', athleteId, 'MAJ_OBJECTIFS', 'programme');
    res.json({ ok: true });
  });

  app.patch('/api/coach/scheduled/:schedId/adjust', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const coachId = req.authUser!.id;
    const schedId = Number(req.params.schedId);
    const body = req.body as Record<string, unknown>;
    const isRest = Boolean(body.is_rest_day);
    const sessionId = body.session_id ? Number(body.session_id) : null;
    const motif = sanitizeText(body.motif_ajustement, 240);

    if (!motif) {
      res.status(400).json({ error: 'Le motif de modification visible par l’athlète est obligatoire.' });
      return;
    }

    const row = db.prepare('SELECT athlete_user_id FROM scheduled_sessions WHERE id = ?').get(schedId) as { athlete_user_id: number } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Créneau introuvable.' });
      return;
    }
    const assigned = db
      .prepare("SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'")
      .get(coachId, row.athlete_user_id);
    if (!assigned) {
      res.status(403).json({ error: 'Non autorisé pour cet athlète.' });
      return;
    }

    if (!isRest) {
      if (!sessionId || !Number.isInteger(sessionId)) {
        res.status(400).json({ error: 'Séance invalide.' });
        return;
      }
      const sess = db
        .prepare("SELECT id FROM sessions_library WHERE id = ? AND validation_status = 'VALIDEE'")
        .get(sessionId);
      if (!sess) {
        res.status(400).json({ error: 'Seules les séances validées peuvent être programmées.' });
        return;
      }
    }

    db.prepare(
      `UPDATE scheduled_sessions
       SET is_rest_day = ?, session_id = ?, ajustee_par_coach = 1, motif_ajustement = ?, date_ajustement = datetime('now')
       WHERE id = ?`
    ).run(isRest ? 1 : 0, isRest ? null : sessionId, motif, schedId);

    logAccess(coachId, 'COACH', row.athlete_user_id, 'AJUSTEMENT_PROGRAMME', `scheduled:${schedId}`);
    res.json({ ok: true });
  });

  app.post('/api/coach/alerts/:alertId/resolve', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const coachId = req.authUser!.id;
    const alertId = Number(req.params.alertId);
    const note = sanitizeText((req.body as Record<string, unknown>).note_traitement, 300) || 'Alerte prise en charge et séance adaptée.';

    const al = db.prepare('SELECT athlete_user_id FROM alerts WHERE id = ?').get(alertId) as { athlete_user_id: number } | undefined;
    if (!al) {
      res.status(404).json({ error: 'Alerte introuvable.' });
      return;
    }
    const assigned = db
      .prepare("SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'")
      .get(coachId, al.athlete_user_id);
    if (!assigned) {
      res.status(403).json({ error: 'Non autorisé.' });
      return;
    }

    db.prepare(
      `UPDATE alerts SET traitee = 1, traitee_par_user_id = ?, note_traitement = ? WHERE id = ?`
    ).run(coachId, note, alertId);
    logAccess(coachId, 'COACH', al.athlete_user_id, 'TRAITEMENT_ALERTE', `alert:${alertId}`);
    res.json({ ok: true });
  });

  app.post('/api/coach/sessions/propose', requireAuth, requireRole('COACH'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const sport_code = sanitizeText(body.sport_code, 20) as SportCode;
    const titre = sanitizeText(body.titre, 120);
    const niveau = sanitizeText(body.niveau, 20) as AthleteLevel;
    const duree_min = Number(body.duree_min);
    const objectif = sanitizeText(body.objectif, 160);
    const prevention_focus = sanitizeText(body.prevention_focus, 120);
    const consigneFr = sanitizeText(body.consigneFr, 300);
    const consigneWo = sanitizeText(body.consigneWo, 300);

    if (!VALID_SPORT_CODES.includes(sport_code) || !titre || !objectif || !consigneFr) {
      res.status(400).json({ error: 'Complétez tous les champs de la proposition.' });
      return;
    }

    const exercises = [
      {
        id: `prop-${Date.now()}`,
        nom: titre,
        consigneFr,
        consigneWo: consigneWo || 'Toppal ndigal yi ci ndànk.',
        varianteFacile: 'Amplitude réduite, rythme contrôlé',
        varianteDifficile: 'Cadence soutenue sans pause',
        mode: 'duree',
        dureeSec: 40,
        reposSec: 20,
      },
    ];

    db.prepare(
      `INSERT INTO sessions_library (
        sport_code, titre, niveau, duree_min, objectif, prevention_focus,
        relue_par, validation_status, proposee_par_user_id, exercises_json
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'EN_RELECTURE', ?, ?)`
    ).run(
      sport_code,
      titre,
      ['debutant', 'intermediaire', 'avance'].includes(niveau) ? niveau : 'debutant',
      Number.isFinite(duree_min) ? Math.min(60, Math.max(10, duree_min)) : 20,
      objectif,
      prevention_focus || 'Général',
      req.authUser!.id,
      JSON.stringify(exercises)
    );
    res.status(201).json({ ok: true });
  });

  // ---------------- ADMIN ROUTES ----------------
  app.get('/api/admin/overview', requireAuth, requireRole('ADMIN'), (_req: AuthedRequest, res: Response) => {
    const users = db
      .prepare(
        `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.role, u.statut, u.is_minor, u.verified, u.created_at,
                ap.sport_code, ap.niveau,
                (SELECT a.coach_user_id FROM assignments a WHERE a.athlete_user_id = u.id AND a.statut = 'ACTIF' LIMIT 1) as assigned_coach_id
         FROM users u
         LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
         ORDER BY u.role ASC, u.id DESC`
      )
      .all();

    const coaches = db
      .prepare(
        `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.statut, u.verified,
                c.specialite, c.qualification, c.zone, c.coach_plan, c.verification_status
         FROM users u JOIN coaches c ON c.user_id = u.id
         WHERE u.role = 'COACH' AND u.statut != 'CLOTURE'
         ORDER BY CASE WHEN c.verification_status = 'EN_ATTENTE' THEN 0 ELSE 1 END, u.id DESC`
      )
      .all();

    const sessions = db
      .prepare(
        `SELECT sl.*, (u.prenom || ' ' || u.nom) as proposee_par_nom
         FROM sessions_library sl
         LEFT JOIN users u ON u.id = sl.proposee_par_user_id
         ORDER BY CASE WHEN sl.validation_status = 'EN_RELECTURE' THEN 0 ELSE 1 END, sl.id DESC`
      )
      .all();

    const auditLogs = db
      .prepare(
        `SELECT al.id, COALESCE(ua.prenom || ' ' || ua.nom, 'Système') as actor_nom, al.actor_role,
                CASE WHEN ut.id IS NOT NULL THEN (ut.prenom || ' ' || ut.nom) ELSE NULL END as athlete_nom,
                al.action, al.resource, al.created_at
         FROM access_audit_logs al
         LEFT JOIN users ua ON ua.id = al.actor_user_id
         LEFT JOIN users ut ON ut.id = al.athlete_user_id
         ORDER BY al.id DESC LIMIT 60`
      )
      .all();

    const partners = db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM groups g WHERE g.partner_id = p.id) as groups_count,
                (SELECT COUNT(*) FROM group_memberships gm JOIN groups g2 ON g2.id = gm.group_id WHERE g2.partner_id = p.id) as members_count
         FROM partners p
         ORDER BY p.id ASC`
      )
      .all();
    const groups = db
      .prepare(
        `SELECT g.*, p.nom as partner_nom, p.type as partner_type, p.zone,
                (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) as member_count
         FROM groups g
         JOIN partners p ON p.id = g.partner_id
         ORDER BY g.id ASC`
      )
      .all();
    const challenges = db
      .prepare(
        `SELECT c.*, p.nom as partner_nom FROM challenges c JOIN partners p ON p.id = c.partner_id ORDER BY c.id ASC`
      )
      .all();
    const partnerRequests = db
      .prepare('SELECT * FROM partner_requests ORDER BY id DESC LIMIT 40')
      .all();

    res.json({ users, coaches, sessions, auditLogs, partners, groups, challenges, partnerRequests });
  });

  app.post('/api/admin/partners', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const nom = sanitizeText(body.nom, 140);
    const type = sanitizeText(body.type, 20).toUpperCase();
    const zone = sanitizeText(body.zone, 80);

    if (!nom || !zone || !['ASC', 'CAMPUS', 'LIGUE'].includes(type)) {
      res.status(400).json({ error: 'Nom, type (ASC/CAMPUS/LIGUE) et zone requis.' });
      return;
    }

    const ins = db.prepare('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)').run(nom, type, zone);
    logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_PARTENAIRE', `partner:${ins.lastInsertRowid}`);
    res.status(201).json({ id: Number(ins.lastInsertRowid) });
  });

  app.post('/api/admin/groups', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const nom = sanitizeText(body.nom, 140);
    const partnerId = Number(body.partner_id);
    const captainName = sanitizeText(body.captain_name, 100);
    const sportCode = sanitizeText(body.sport_code, 20) as SportCode;

    if (!nom || !captainName || !Number.isInteger(partnerId) || !VALID_SPORT_CODES.includes(sportCode)) {
      res.status(400).json({ error: 'Nom du groupe, partenaire, Capitaine Prépa et sport requis.' });
      return;
    }
    const partnerExists = db.prepare('SELECT id FROM partners WHERE id = ?').get(partnerId);
    if (!partnerExists) {
      res.status(404).json({ error: 'Partenaire introuvable.' });
      return;
    }
    const ins = db
      .prepare('INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)')
      .run(nom, partnerId, captainName, sportCode);
    logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_GROUPE', `group:${ins.lastInsertRowid}`);
    res.status(201).json({ id: Number(ins.lastInsertRowid) });
  });

  app.post('/api/admin/challenges', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const partnerId = Number(body.partner_id);
    const titre = sanitizeText(body.titre, 140);
    const indicateur = sanitizeText(body.indicateur, 140);
    const periode = sanitizeText(body.periode, 60);
    const targetSessions = Number(body.target_sessions);

    if (!titre || !indicateur || !periode || !Number.isInteger(partnerId) || !Number.isFinite(targetSessions) || targetSessions < 10) {
      res.status(400).json({ error: 'Partenaire, titre, indicateur, période et objectif (>= 10) requis.' });
      return;
    }
    const partnerExists = db.prepare('SELECT id FROM partners WHERE id = ?').get(partnerId);
    if (!partnerExists) {
      res.status(404).json({ error: 'Partenaire introuvable.' });
      return;
    }
    const ins = db
      .prepare('INSERT INTO challenges (partner_id, titre, indicateur, periode, target_sessions, current_sessions) VALUES (?, ?, ?, ?, ?, 0)')
      .run(partnerId, titre, indicateur, periode, Math.round(targetSessions));
    logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_DEFI', `challenge:${ins.lastInsertRowid}`);
    res.status(201).json({ id: Number(ins.lastInsertRowid) });
  });

  app.patch('/api/admin/partner-requests/:id', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const reqId = Number(req.params.id);
    const statut = sanitizeText((req.body as Record<string, unknown>).statut, 20).toUpperCase();
    if (!Number.isInteger(reqId) || !['NOUVELLE', 'EN_ETUDE', 'VALIDEE'].includes(statut)) {
      res.status(400).json({ error: 'Statut ou identifiant invalide.' });
      return;
    }
    const row = db.prepare('SELECT * FROM partner_requests WHERE id = ?').get(reqId) as
      | { id: number; organisation: string; type: string; zone: string; statut: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Demande introuvable.' });
      return;
    }
    db.prepare('UPDATE partner_requests SET statut = ? WHERE id = ?').run(statut, reqId);
    if (statut === 'VALIDEE' && row.statut !== 'VALIDEE') {
      const existing = db.prepare('SELECT id FROM partners WHERE LOWER(nom) = LOWER(?)').get(row.organisation);
      if (!existing) {
        db.prepare('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)').run(row.organisation, row.type, row.zone);
      }
    }
    logAccess(req.authUser!.id, 'ADMIN', null, 'STATUT_PARTENARIAT', `request:${reqId}:${statut}`);
    res.json({ ok: true });
  });

  app.post('/api/admin/assign', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const athleteId = Number(body.athlete_user_id);
    const coachId = Number(body.coach_user_id);

    const athlete = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'ATHLETE'").get(athleteId);
    const coach = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'COACH'").get(coachId);
    if (!athlete || !coach) {
      res.status(400).json({ error: 'Athlète ou coach invalide.' });
      return;
    }

    db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'").run(athleteId);
    db.prepare("INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')").run(coachId, athleteId);
    db.prepare("UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?").run(coachId, athleteId);
    db.prepare("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'").run(athleteId);

    logAccess(req.authUser!.id, 'ADMIN', athleteId, 'AFFECTATION_COACH', `coach:${coachId}`);
    res.json({ ok: true });
  });

  app.patch('/api/admin/users/:userId/status', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const userId = Number(req.params.userId);
    const statut = sanitizeText((req.body as Record<string, unknown>).statut, 30);
    if (!Number.isInteger(userId) || userId <= 0 || !['ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE'].includes(statut)) {
      res.status(400).json({ error: 'Statut ou identifiant invalide.' });
      return;
    }
    if (userId === req.authUser!.id && statut === 'CLOTURE') {
      res.status(400).json({ error: 'Impossible de clôturer votre propre session administrateur.' });
      return;
    }
    const upd = db.prepare('UPDATE users SET statut = ? WHERE id = ?').run(statut, userId);
    if (upd.changes === 0) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }
    if (statut === 'CLOTURE') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }
    logAccess(req.authUser!.id, 'ADMIN', userId, 'CHANGEMENT_STATUT', statut);
    res.json({ ok: true });
  });

  app.patch('/api/admin/coaches/:coachUserId/verification', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const coachUserId = Number(req.params.coachUserId);
    const verificationStatus = sanitizeText((req.body as Record<string, unknown>).verification_status, 20).toUpperCase();
    if (!Number.isInteger(coachUserId) || coachUserId <= 0 || !['VERIFIE', 'EN_ATTENTE', 'REFUSE'].includes(verificationStatus)) {
      res.status(400).json({ error: 'Statut de vérification coach invalide.' });
      return;
    }
    const upd = db
      .prepare('UPDATE coaches SET verification_status = ? WHERE user_id = ?')
      .run(verificationStatus, coachUserId);
    if (upd.changes === 0) {
      res.status(404).json({ error: 'Profil coach introuvable.' });
      return;
    }
    if (verificationStatus === 'REFUSE') {
      db.prepare("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE coach_user_id = ? AND statut = 'ACTIF'").run(
        coachUserId
      );
    }
    logAccess(req.authUser!.id, 'ADMIN', coachUserId, 'VERIFICATION_COACH', verificationStatus);
    res.json({ ok: true, verification_status: verificationStatus });
  });

  app.patch('/api/admin/sessions/:sessionId/review', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const body = req.body as Record<string, unknown>;
    const validationStatus = sanitizeText(body.validation_status, 20);
    const reluePar = sanitizeText(body.relue_par, 140);

    if (!Number.isInteger(sessionId) || sessionId <= 0 || !['VALIDEE', 'BROUILLON', 'EN_RELECTURE'].includes(validationStatus)) {
      res.status(400).json({ error: 'Statut de relecture ou séance invalide.' });
      return;
    }
    if (validationStatus === 'VALIDEE' && !reluePar) {
      res.status(400).json({ error: 'Indiquez le nom du professionnel relecteur avant validation.' });
      return;
    }

    const upd = db.prepare('UPDATE sessions_library SET validation_status = ?, relue_par = ? WHERE id = ?').run(
      validationStatus,
      reluePar || null,
      sessionId
    );
    if (upd.changes === 0) {
      res.status(404).json({ error: 'Séance introuvable.' });
      return;
    }
    logAccess(req.authUser!.id, 'ADMIN', null, 'RELECTURE_CONTENU', `session:${sessionId}:${validationStatus}`);
    res.json({ ok: true });
  });

  // ---------------- MINISTERIAL / INSTITUTIONAL OBSERVATORY ROUTE ----------------
  app.get('/api/minister/overview', requireAuth, requireRole('MINISTRE', 'ADMIN'), (req: AuthedRequest, res: Response) => {
    const athleteCounts = db
      .prepare(
        `SELECT
           COUNT(*) as totalAthletes,
           SUM(CASE WHEN statut = 'SUIVI_ACTIF' THEN 1 ELSE 0 END) as activeFollowUpAthletes,
           SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verifiedAthletes,
           SUM(CASE WHEN is_minor = 1 THEN 1 ELSE 0 END) as minorProtectedCount
         FROM users
         WHERE role = 'ATHLETE' AND statut != 'CLOTURE'`
      )
      .get() as Record<string, number | null>;

    const coachCountRow = db
      .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'COACH' AND statut != 'CLOTURE'")
      .get() as { c: number };

    const sessionsCounts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN validation_status = 'VALIDEE' THEN 1 ELSE 0 END) as validatedSessionsCount,
           SUM(CASE WHEN validation_status = 'EN_RELECTURE' THEN 1 ELSE 0 END) as pendingReviewSessionsCount,
           SUM(CASE WHEN validation_status = 'VALIDEE' AND relue_par IS NOT NULL AND TRIM(relue_par) != '' THEN 1 ELSE 0 END) as reviewedCount,
           COUNT(*) as totalLibraryCount
         FROM sessions_library`
      )
      .get() as Record<string, number | null>;

    const evalStats = db
      .prepare('SELECT AVG(score_global) as avgScore FROM evaluations')
      .get() as { avgScore: number | null };

    const schedStats = db
      .prepare(
        `SELECT
           SUM(CASE WHEN is_rest_day = 0 AND completed = 1 THEN 1 ELSE 0 END) as completedTotal,
           SUM(CASE WHEN is_rest_day = 0 THEN 1 ELSE 0 END) as plannedTotal
         FROM scheduled_sessions`
      )
      .get() as { completedTotal: number | null; plannedTotal: number | null };

    const partnerCounts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM partners) as totalPartners,
           (SELECT COUNT(*) FROM groups) as totalGroups,
           (SELECT COUNT(*) FROM group_memberships) as totalGroupMemberships,
           (SELECT COUNT(*) FROM challenges) as totalChallenges,
           (SELECT COUNT(*) FROM partner_requests WHERE statut != 'VALIDEE') as pendingPartnerRequests`
      )
      .get() as Record<string, number>;

    const totalAthletes = Number(athleteCounts.totalAthletes || 0);
    const totalCoaches = Number(coachCountRow.c || 0);
    const ratioNum = totalCoaches > 0 ? Math.max(1, Math.round(totalAthletes / totalCoaches)) : totalAthletes;
    const completedSessionsTotal = Number(schedStats.completedTotal || 0);
    const plannedTrainingSessionsTotal = Number(schedStats.plannedTotal || 0);
    const avgWeeklyCompletionPct =
      plannedTrainingSessionsTotal > 0
        ? Math.min(100, Math.round((completedSessionsTotal / plannedTrainingSessionsTotal) * 100))
        : 0;

    const bySport = VALID_SPORT_CODES.map((sportCode) => {
      const ath = db
        .prepare(
          `SELECT COUNT(*) as c
           FROM athlete_profiles ap
           JOIN users u ON u.id = ap.user_id
           WHERE ap.sport_code = ? AND u.role = 'ATHLETE' AND u.statut != 'CLOTURE'`
        )
        .get(sportCode) as { c: number };
      const lib = db
        .prepare("SELECT COUNT(*) as c FROM sessions_library WHERE sport_code = ? AND validation_status = 'VALIDEE'")
        .get(sportCode) as { c: number };
      const ev = db
        .prepare('SELECT COUNT(*) as c, AVG(score_global) as avgScore FROM evaluations WHERE sport_code = ?')
        .get(sportCode) as { c: number; avgScore: number | null };
      const done = db
        .prepare(
          `SELECT COUNT(*) as c
           FROM scheduled_sessions ss
           JOIN program_plans pp ON pp.id = ss.program_id
           WHERE pp.sport_code = ? AND ss.is_rest_day = 0 AND ss.completed = 1`
        )
        .get(sportCode) as { c: number };
      const grp = db
        .prepare('SELECT COUNT(*) as c FROM groups WHERE sport_code = ?')
        .get(sportCode) as { c: number };

      return {
        sport_code: sportCode,
        athletesCount: Number(ath.c || 0),
        validatedSessionsCount: Number(lib.c || 0),
        evaluationsCount: Number(ev.c || 0),
        avgEvalScore: ev.avgScore !== null && ev.avgScore !== undefined ? Math.round(ev.avgScore) : null,
        completedSessionsCount: Number(done.c || 0),
        groupsCount: Number(grp.c || 0),
      };
    });

    const partnerRows = db
      .prepare(
        `SELECT p.id, p.nom, p.type, p.zone,
                (SELECT COUNT(*) FROM groups g WHERE g.partner_id = p.id) as groups_count,
                (SELECT COUNT(*) FROM group_memberships gm JOIN groups g2 ON g2.id = gm.group_id WHERE g2.partner_id = p.id) as members_count
         FROM partners p
         ORDER BY p.zone ASC, p.id ASC`
      )
      .all() as Array<{
      id: number;
      nom: string;
      type: 'ASC' | 'CAMPUS' | 'LIGUE';
      zone: string;
      groups_count: number;
      members_count: number;
    }>;

    const challengeRows = db
      .prepare(
        `SELECT c.id, c.titre, p.nom as partner_nom, p.type as partner_type, p.zone,
                c.periode, c.indicateur, c.target_sessions, c.current_sessions
         FROM challenges c
         JOIN partners p ON p.id = c.partner_id
         ORDER BY c.id ASC`
      )
      .all() as Array<{
      id: number;
      titre: string;
      partner_nom: string;
      partner_type: 'ASC' | 'CAMPUS' | 'LIGUE';
      zone: string;
      periode: string;
      indicateur: string;
      target_sessions: number;
      current_sessions: number;
    }>;

    const zoneMap = new Map<
      string,
      {
        zone: string;
        partnersCount: number;
        partnerTypes: Set<'ASC' | 'CAMPUS' | 'LIGUE'>;
        groupsCount: number;
        membersCount: number;
        challengesCount: number;
        targetSum: number;
        currentSum: number;
      }
    >();

    for (const p of partnerRows) {
      const entry = zoneMap.get(p.zone) || {
        zone: p.zone,
        partnersCount: 0,
        partnerTypes: new Set<'ASC' | 'CAMPUS' | 'LIGUE'>(),
        groupsCount: 0,
        membersCount: 0,
        challengesCount: 0,
        targetSum: 0,
        currentSum: 0,
      };
      entry.partnersCount += 1;
      entry.partnerTypes.add(p.type);
      entry.groupsCount += Number(p.groups_count || 0);
      entry.membersCount += Number(p.members_count || 0);
      zoneMap.set(p.zone, entry);
    }

    for (const c of challengeRows) {
      const entry = zoneMap.get(c.zone);
      if (entry) {
        entry.challengesCount += 1;
        entry.targetSum += Number(c.target_sessions || 0);
        entry.currentSum += Number(c.current_sessions || 0);
      }
    }

    const byZone = Array.from(zoneMap.values()).map((z) => ({
      zone: z.zone,
      partnersCount: z.partnersCount,
      partnerTypes: Array.from(z.partnerTypes),
      groupsCount: z.groupsCount,
      membersCount: z.membersCount,
      challengesCount: z.challengesCount,
      challengeCompletionPct:
        z.targetSum > 0 ? Math.min(100, Math.round((z.currentSum / z.targetSum) * 100)) : 0,
    }));

    const painStats = db
      .prepare(
        `SELECT
           SUM(CASE WHEN type = 'DOULEUR' AND traitee = 0 THEN 1 ELSE 0 END) as openPainAlerts,
           SUM(CASE WHEN type = 'DOULEUR' AND traitee = 1 THEN 1 ELSE 0 END) as resolvedPainAlerts,
           SUM(CASE WHEN type = 'DOULEUR' THEN 1 ELSE 0 END) as totalPainAlerts
         FROM alerts`
      )
      .get() as Record<string, number | null>;

    const openPainAlerts = Number(painStats.openPainAlerts || 0);
    const resolvedPainAlerts = Number(painStats.resolvedPainAlerts || 0);
    const totalPainAlerts = Number(painStats.totalPainAlerts || 0);
    const painResolutionRatePct =
      totalPainAlerts > 0 ? Math.round((resolvedPainAlerts / totalPainAlerts) * 100) : 100;

    const minorProtectedCount = Number(athleteCounts.minorProtectedCount || 0);
    const minorConsentsRow = db
      .prepare("SELECT COUNT(DISTINCT user_id) as c FROM consents WHERE type = 'ACCORD_PARENTAL'")
      .get() as { c: number };
    const nonMedicalConsentsRow = db
      .prepare("SELECT COUNT(DISTINCT user_id) as c FROM consents WHERE type = 'NON_MEDICAL'")
      .get() as { c: number };
    const auditEventsRow = db.prepare('SELECT COUNT(*) as c FROM access_audit_logs').get() as { c: number };
    const coachCommentsRow = db.prepare('SELECT COUNT(*) as c FROM coach_comments').get() as { c: number };

    const totalLibraryCount = Number(sessionsCounts.totalLibraryCount || 0);
    const reviewedCount = Number(sessionsCounts.reviewedCount || 0);
    const reviewCompliancePct =
      totalLibraryCount > 0 ? Math.round((reviewedCount / totalLibraryCount) * 100) : 100;

    const parentalConsentCompliancePct =
      minorProtectedCount > 0
        ? Math.min(100, Math.round((Number(minorConsentsRow.c || 0) / minorProtectedCount) * 100))
        : 100;

    const reqRows = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN statut = 'NOUVELLE' THEN 1 ELSE 0 END) as nouvelle,
           SUM(CASE WHEN statut = 'EN_ETUDE' THEN 1 ELSE 0 END) as enEtude,
           SUM(CASE WHEN statut = 'VALIDEE' THEN 1 ELSE 0 END) as validee
         FROM partner_requests`
      )
      .get() as Record<string, number | null>;

    const validatedSessionsCount = Number(sessionsCounts.validatedSessionsCount || 0);
    const phase1Progress = Math.min(
      100,
      Math.round(
        ((Math.min(validatedSessionsCount, 8) / 8) * 50) +
          ((Math.min(byZone.length, 3) / 3) * 50)
      )
    );
    const readinessScorePct = Math.round((reviewCompliancePct + parentalConsentCompliancePct + phase1Progress) / 3);

    logAccess(
      req.authUser!.id,
      req.authUser!.role,
      null,
      'CONSULTATION_OBSERVATOIRE',
      'indicateurs_agreges_sans_pii'
    );

    res.json({
      generatedAt: new Date().toISOString(),
      kpis: {
        totalAthletes,
        activeFollowUpAthletes: Number(athleteCounts.activeFollowUpAthletes || 0),
        verifiedAthletes: Number(athleteCounts.verifiedAthletes || 0),
        minorProtectedCount,
        totalCoaches,
        coachAthleteRatio: `1 : ${ratioNum}`,
        validatedSessionsCount,
        pendingReviewSessionsCount: Number(sessionsCounts.pendingReviewSessionsCount || 0),
        avgGlobalEvalScore:
          evalStats.avgScore !== null && evalStats.avgScore !== undefined
            ? Math.round(evalStats.avgScore)
            : null,
        completedSessionsTotal,
        plannedTrainingSessionsTotal,
        avgWeeklyCompletionPct,
        totalPartners: Number(partnerCounts.totalPartners || 0),
        totalGroups: Number(partnerCounts.totalGroups || 0),
        totalGroupMemberships: Number(partnerCounts.totalGroupMemberships || 0),
        totalChallenges: Number(partnerCounts.totalChallenges || 0),
        pendingPartnerRequests: Number(partnerCounts.pendingPartnerRequests || 0),
      },
      bySport,
      byZone,
      preventionAndSafety: {
        openPainAlerts,
        resolvedPainAlerts,
        totalPainAlerts,
        painResolutionRatePct,
        minorParentalConsentCount: Number(minorConsentsRow.c || 0),
        parentalConsentCompliancePct,
        nonMedicalConsentCount: Number(nonMedicalConsentsRow.c || 0),
        reviewCompliancePct,
        auditEventsCount: Number(auditEventsRow.c || 0),
        coachCommentsCount: Number(coachCommentsRow.c || 0),
      },
      challenges: challengeRows.map((c) => ({
        ...c,
        pct: c.target_sessions > 0 ? Math.min(100, Math.round((c.current_sessions / c.target_sessions) * 100)) : 0,
      })),
      partnerRequestsSummary: {
        total: Number(reqRows.total || 0),
        nouvelle: Number(reqRows.nouvelle || 0),
        enEtude: Number(reqRows.enEtude || 0),
        validee: Number(reqRows.validee || 0),
      },
      perspectives: {
        readinessScorePct,
        phases: [
          {
            code: 'Phase 1',
            horizon: 'T1 – T2 2026',
            titre: 'Socle pilote Campus & ASC vérifié',
            statut: 'EN_COURS',
            progressionPct: phase1Progress,
            resume:
              'Déploiement sur les pôles universitaires (Thiès, Saint-Louis) et ASC de Dakar avec protocole non médical validé par STAPS.',
            livrables: [
              `${validatedSessionsCount} séances validées sans matériel obligatoire`,
              `${byZone.length} zones territoriales actives (${partnerCounts.totalPartners} structures)`,
              'Guidage bilingue Français / Wolof et cache hors-ligne opérationnel',
            ],
          },
          {
            code: 'Phase 2',
            horizon: 'T3 – T4 2026',
            titre: 'Extension aux Ligues Régionales & Navétanes',
            statut: 'PLANIFIEE',
            progressionPct: Math.min(100, Math.round((Number(reqRows.validee || 0) + Number(partnerCounts.totalPartners || 0)) * 12)),
            resume:
              'Ouverture des collectifs aux ligues régionales (Kaolack, Ziguinchor, Diourbel, Tambacounda) et formation des Capitaines Prépa.',
            livrables: [
              'Relais de proximité dans les zones à faible densité d’encadrement',
              'Protocoles de reprise pré-compétition et prévention des chevilles/genoux',
              'Tableau territorial consolidé sans exposition de données individuelles',
            ],
          },
          {
            code: 'Phase 3',
            horizon: '2027',
            titre: 'Observatoire National Sport-Santé & Jeunesse',
            statut: 'CIBLE',
            progressionPct: 15,
            resume:
              'Suivi longitudinal agrégé des progrès physiques amateurs à l’échelle des 14 régions avec protection stricte des mineurs.',
            livrables: [
              'Indicateurs de régularité inter-régions anonymisés pour les politiques publiques',
              'Orientation systématique vers les centres médico-sportifs sur alerte douleur',
              'Interopérabilité fédérale pour licences amateurs et sport scolaire',
            ],
          },
        ],
        axes: [
          {
            id: 'acces',
            titre: 'Équité territoriale & bas débit',
            indicateurActuel: '100 % des séances téléchargeables hors ligne',
            orientation: 'Réduire l’écart d’encadrement hors Dakar grâce aux parcours sans matériel et à l’éco-données.',
          },
          {
            id: 'langue',
            titre: 'Inclusion linguistique FR / Wolof',
            indicateurActuel: `${validatedSessionsCount} séances bilingues actives`,
            orientation: 'Étendre les consignes audio et visuelles aux langues locales pour lever les barrières de compréhension.',
          },
          {
            id: 'prevention',
            titre: 'Prévention & protection des mineurs',
            indicateurActuel: `${parentalConsentCompliancePct}% conformité parentale`,
            orientation: 'Maintenir la séparation stricte entre préparation générale et acte médical, avec traçabilité d’accès.',
          },
          {
            id: 'ethique',
            titre: 'Éthique sportive sans classement public',
            indicateurActuel: `${partnerCounts.totalChallenges} défis collectifs solidaires`,
            orientation: 'Valoriser la régularité de groupe (ASC, Campus, Ligues) plutôt que la comparaison individuelle publique.',
          },
        ],
      },
    });
  });

  // Central API error handler (prevents stack trace leaks and handles invalid JSON cleanly)
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Format JSON invalide.' });
      return;
    }
    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route API introuvable.' });
  });

  // ---------------- VITE / STATIC SERVING ----------------
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist/index.html'));

  if (isProd) {
    app.use(
      express.static(path.resolve('dist'), {
        maxAge: '30d',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`) && /\.(js|css|woff2)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    app.use('/brand', express.static(path.resolve('public/brand'), { maxAge: '1d' }));
    app.use('/assets/aistudio', express.static(path.resolve('public/assets/aistudio'), { maxAge: '7d' }));
    app.use('/src/assets/images', express.static(path.resolve('src/assets/images'), { maxAge: '7d' }));
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) {
          next();
          return;
        }
        const safeCode = result.code.replace(
          /const transport = normalizeModuleRunnerTransport\([\s\S]*?let willUnload = false;/,
          'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, async send() {} });\nlet willUnload = false;'
        );
        res.type('application/javascript').send(safeCode);
      } catch {
        next();
      }
    });
    app.use(vite.middlewares);
  }

  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : NaN;
  const nginxOwnsEnvPort = Boolean(process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT);
  const port =
    Number.isFinite(cliPort) && cliPort > 0
      ? cliPort
      : isProd && !nginxOwnsEnvPort && process.env.PORT
        ? Number(process.env.PORT)
        : Number(process.env.DEFAULT_APP_PORT || 3000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Terrain+ server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Terrain+ server:', err);
  process.exit(1);
});
