import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  USE_POSTGRES,
  dbAll,
  dbGet,
  dbRun,
  dbTransaction,
  initSchema,
  logAccess,
} from './server/db.ts';
import {
  DIPLOMA_UPLOAD_DIR,
  detectMimeFromMagicBytes,
  storeCoachDiplomaDocument,
  storeCoachDocumentMetadataRevision,
} from './server/diplomaStudy.ts';
import {
  COACH_VIDEO_MAX_BYTES,
  COACH_VIDEO_QUOTA_BYTES,
  SUPABASE_VIDEO_BUCKET,
  createCoachVideoSignedReadUrl,
  createCoachVideoSignedUploadUrl,
  deleteCoachVideoFromSupabaseStorage,
  downloadDiplomaFromSupabaseStorage,
  getSupabaseAdmin,
} from './server/supabaseAdmin.ts';
import { buildDefaultScheduleForAthlete, seedIfEmpty } from './server/seed.ts';
import { deliverOtpCode, isOtpDeliveryConfigured } from './server/otpDelivery.ts';
import { buildAthleteObjectiveLabel, resolveObjectiveSpec } from './src/data/objectivesConfig.ts';
import {
  checkRateLimitDistributed,
  clearSessionCookie,
  computeAge,
  createScopedActionToken,
  generateOtpCode,
  generateSecureToken,
  getClientIp,
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
  verifyScopedActionToken,
  verifyTokenHash,
} from './server/security.ts';
import { evaluateTestValue, SPORTS_CONFIG } from './src/data/sportsConfig.ts';
import {
  COACH_LEGAL_STATUS_OPTIONS,
  MAX_DIPLOMA_FILE_BYTES,
  SPORT_DIPLOMA_FORMATS,
  type DiplomaTypeCode,
} from './src/data/sportsDiplomas.ts';
import type {
  AdminSystemOverviewPayload,
  AthleteLevel,
  CoachDocumentStudyReport,
  CoachDocumentSummary,
  CoachVideoItem,
  CoachVideoSourceType,
  SportCode,
  UserRole,
} from './src/types.ts';

let readyPromise: Promise<void> | null = null;

export function ensureAppReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initSchema();
      await seedIfEmpty();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

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

const asyncHandler =
  (fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown> | unknown) =>
  (req: AuthedRequest, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const SESSION_DURATION_SEC = 60 * 60 * 24 * 7;
const ADMIN_SESSION_DURATION_SEC = 60 * 60 * 12;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const VALID_SPORT_CODES: SportCode[] = ['football', 'basket', 'handball', 'volleyball', 'athletisme', 'fitness'];
const VIDEO_UPLOAD_DIR = path.resolve(process.env.VIDEO_UPLOAD_DIR || './uploads/coach-videos');
const ALLOWED_COACH_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function parsePositiveIntId(raw: unknown): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(num) || num <= 0 || num > 2_147_483_647) {
    return null;
  }
  return num;
}

function isRestrictedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.endsWith('.arpa')
  ) {
    return true;
  }
  // Reject IPv6 literals ([::1], [fe80::...], [fc00::...], etc.)
  if (host.startsWith('[') || host.includes(':')) {
    return true;
  }
  // Reject obfuscated single-integer or hex/octal numeric IP hosts
  if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)) {
    return true;
  }
  // Check dotted IPv4 private/loopback/link-local/CGNAT/reserved ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some((n) => n < 0 || n > 255)) return true;
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }
  return false;
}

function detectVideoMimeFromMagicBytes(buf: Buffer): 'video/mp4' | 'video/webm' | 'video/quicktime' | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm';
  }
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

function validateExternalVideoUrl(rawUrl: unknown): { valid: true; normalizedUrl: string } | { valid: false; error: string } {
  if (typeof rawUrl !== 'string') {
    return { valid: false, error: 'Lien vidéo externe invalide.' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) {
    return { valid: false, error: 'Le lien vidéo doit contenir entre 1 et 500 caractères.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Seuls les liens HTTPS sécurisés (YouTube, Vimeo ou vidéo HTTPS) sont autorisés.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, error: 'Les informations d’authentification dans l’URL ne sont pas autorisées.' };
    }
    if (isRestrictedHost(parsed.hostname)) {
      return { valid: false, error: 'Hôte local ou privé non autorisé pour un lien vidéo externe.' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'Format d’URL vidéo invalide (exemple : https://youtu.be/...).' };
  }
}

interface RawCoachVideoRow {
  id: number;
  coach_user_id: number;
  coach_nom?: string | null;
  sport_code: SportCode;
  session_id: number | null;
  session_titre?: string | null;
  athlete_user_id: number | null;
  athlete_nom?: string | null;
  titre: string;
  description: string | null;
  source_type: CoachVideoSourceType;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size_bytes: number;
  created_at: string;
}

function mapCoachVideoRow(row: RawCoachVideoRow, viewerUserId: number): CoachVideoItem {
  const videoId = Number(row.id);
  const streamToken = createScopedActionToken(viewerUserId, `video-stream:${videoId}`, 60 * 60 * 4);
  const playbackUrl =
    row.source_type === 'EXTERNAL_URL'
      ? String(row.external_url || '')
      : `/api/videos/${videoId}/stream?vt=${encodeURIComponent(streamToken)}`;

  return {
    id: videoId,
    coach_user_id: Number(row.coach_user_id),
    coach_nom: row.coach_nom ? String(row.coach_nom) : undefined,
    sport_code: String(row.sport_code) as SportCode,
    session_id: row.session_id ? Number(row.session_id) : null,
    session_titre: row.session_titre ? String(row.session_titre) : null,
    athlete_user_id: row.athlete_user_id ? Number(row.athlete_user_id) : null,
    athlete_nom: row.athlete_nom ? String(row.athlete_nom) : null,
    titre: String(row.titre),
    description: row.description ? String(row.description) : null,
    source_type: String(row.source_type) as CoachVideoSourceType,
    mime_type: row.mime_type ? String(row.mime_type) : null,
    file_size_bytes: Number(row.file_size_bytes || 0),
    playback_url: playbackUrl,
    created_at: String(row.created_at),
  };
}

async function createSessionForUser(req: Request, res: Response, userId: number, role?: UserRole): Promise<string> {
  await dbRun("DELETE FROM sessions WHERE user_id = ? AND datetime(expires_at) <= datetime('now')", userId);
  let resolvedRole = role;
  if (!resolvedRole) {
    const uRow = await dbGet<{ role: UserRole }>('SELECT role FROM users WHERE id = ?', userId);
    resolvedRole = uRow?.role;
  }
  const ttlSec = resolvedRole === 'ADMIN' ? ADMIN_SESSION_DURATION_SEC : SESSION_DURATION_SEC;
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  await dbRun(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    userId,
    tokenHash,
    expiresAt
  );
  setSessionCookie(req, res, rawToken, ttlSec);
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

const attachUser = asyncHandler(async (req: AuthedRequest, _res: Response, next: NextFunction) => {
  const rawToken = extractRawToken(req);
  if (!rawToken) {
    next();
    return;
  }
  const tokenHash = hashToken(rawToken);
  const row = await dbGet<AuthedUserRow>(
    `SELECT u.id, u.nom, u.prenom, u.telephone, u.email, u.role, u.date_naissance,
            u.langue, u.statut, u.is_minor, u.verified
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND datetime(s.expires_at) > datetime('now')
       AND u.statut != 'CLOTURE'
       AND (
         u.role != 'COACH'
         OR EXISTS(SELECT 1 FROM coaches c WHERE c.user_id = u.id AND c.verification_status = 'VERIFIE')
       )`,
    tokenHash
  );

  if (row) {
    req.authUser = row;
  }
  next();
});

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

function applyRateLimitHeaders(
  res: Response,
  limit: number,
  rl: { remaining: number; resetAtMs: number; retryAfterSec: number; allowed: boolean }
): void {
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(rl.remaining));
  res.setHeader('RateLimit-Reset', String(Math.max(1, Math.ceil((rl.resetAtMs - Date.now()) / 1000))));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
  }
}

const authLimiter = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);
  const rl = await checkRateLimitDistributed(`auth:${ip}`, 25, 15 * 60 * 1000);
  applyRateLimitHeaders(res, 25, rl);
  if (!rl.allowed) {
    res.status(429).json({
      error: `Trop de tentatives. Réessayez dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} minute(s).`,
    });
    return;
  }
  next();
});

const loginIpLimiter = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);
  const rl = await checkRateLimitDistributed(`login:${ip}`, 15, 15 * 60 * 1000);
  applyRateLimitHeaders(res, 15, rl);
  if (!rl.allowed) {
    res.status(429).json({
      error: `Trop de tentatives de connexion. Réessayez dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} minute(s).`,
    });
    return;
  }
  next();
});

const otpLimiter = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);
  const body = (req.body || {}) as Record<string, unknown>;
  const id = sanitizeText(body.identifier, 120).toLowerCase() || 'anon';
  const rl = await checkRateLimitDistributed(`otp:${ip}:${id}`, 8, 15 * 60 * 1000);
  applyRateLimitHeaders(res, 8, rl);
  if (!rl.allowed) {
    res.status(429).json({
      error: 'Trop de tentatives OTP. Patientez quelques minutes avant de réessayer.',
    });
    return;
  }
  next();
});

const uploadLimiter = asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);
  const actor = req.authUser?.id ? `u:${req.authUser.id}` : `ip:${ip}`;
  const rl = await checkRateLimitDistributed(`upload:${actor}`, 20, 15 * 60 * 1000);
  applyRateLimitHeaders(res, 20, rl);
  if (!rl.allowed) {
    res.status(429).json({
      error: 'Limite de téléversement atteinte momentanément. Patientez quelques minutes.',
    });
    return;
  }
  next();
});

function parseAllowedHost(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).host.toLowerCase();
    }
    return trimmed.replace(/\/.*$/, '');
  } catch {
    return '';
  }
}

function verifySameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }
  const sourceHeader = req.headers.origin || req.headers.referer;
  if (!sourceHeader) {
    next();
    return;
  }
  try {
    const sourceHost = new URL(sourceHeader).host.toLowerCase();
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const trustedHosts = new Set<string>([
      'terrain-plus.vercel.app',
      requestHost,
      parseAllowedHost(process.env.APP_URL),
      parseAllowedHost(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      parseAllowedHost(process.env.VERCEL_URL),
    ]);
    trustedHosts.delete('');

    if (trustedHosts.has(sourceHost)) {
      next();
      return;
    }
  } catch {
    // Invalid Origin/Referer header
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

async function getPublicCoachesList() {
  return dbAll<{
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
  }>(
    `SELECT u.id, u.nom, u.prenom, c.specialite, c.qualification, c.zone,
            c.coach_plan, c.commission_pct, c.athlete_payout_fcfa,
            c.athlete_monthly_fee_fcfa,
            COALESCE(ac.cnt, 0) as active_athletes_count
     FROM users u
     JOIN coaches c ON c.user_id = u.id
     LEFT JOIN (
       SELECT coach_user_id, COUNT(*) as cnt
       FROM assignments
       WHERE statut = 'ACTIF'
       GROUP BY coach_user_id
     ) ac ON ac.coach_user_id = u.id
     WHERE u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'
     ORDER BY u.id ASC`
  );
}

const DB_FILE_PATH = path.resolve(process.env.DB_PATH || './terrain_plus.db');
let trafficInsertCount = 0;

async function checkCoachAccessGate(userId: number): Promise<{
  blocked: boolean;
  verificationStatus: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
  rejectionReason: string | null;
  message: string;
}> {
  const coach = await dbGet<{
    verification_status: 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE';
    rejection_reason: string | null;
  }>('SELECT verification_status, rejection_reason FROM coaches WHERE user_id = ?', userId);

  if (!coach || coach.verification_status === 'EN_ATTENTE') {
    return {
      blocked: true,
      verificationStatus: 'EN_ATTENTE',
      rejectionReason: null,
      message:
        "Votre dossier et votre diplôme sont actuellement en cours d'étude par l'administrateur Terrain+. Veuillez patienter : votre accès coach sera activé dès validation.",
    };
  }
  if (coach.verification_status === 'REFUSE') {
    return {
      blocked: true,
      verificationStatus: 'REFUSE',
      rejectionReason: coach.rejection_reason || null,
      message: coach.rejection_reason
        ? `Votre dossier coach n'a pas été validé par l'administrateur : ${coach.rejection_reason}`
        : "Votre dossier coach n'a pas été validé par l'administrateur Terrain+. Contactez l'administration pour soumettre un nouveau justificatif.",
    };
  }
  return {
    blocked: false,
    verificationStatus: 'VERIFIE',
    rejectionReason: null,
    message: '',
  };
}

async function buildCoachGateDetails(
  userId: number,
  gate: Awaited<ReturnType<typeof checkCoachAccessGate>>
): Promise<{
  resubmitToken?: string;
  coachDossier?: {
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
  };
}> {
  if (gate.verificationStatus !== 'REFUSE') {
    return {};
  }

  const [coachRow, latestDoc] = await Promise.all([
    dbGet<{
      specialite: string;
      qualification: string;
      zone: string;
      pro_card_number: string | null;
      pro_card_expiry: string | null;
      rc_pro_insurer: string | null;
      rc_pro_policy_number: string | null;
      legal_status: string | null;
      business_reg_number: string | null;
      honorability_attested: number | boolean | null;
    }>(
      `SELECT specialite, qualification, zone, pro_card_number, pro_card_expiry,
              rc_pro_insurer, rc_pro_policy_number, legal_status, business_reg_number, honorability_attested
       FROM coaches
       WHERE user_id = ?`,
      userId
    ),
    dbGet<{
      diploma_type: DiplomaTypeCode;
      issuing_organism: string;
      diploma_number: string;
      issue_year: number;
      original_filename: string;
    }>(
      `SELECT diploma_type, issuing_organism, diploma_number, issue_year, original_filename
       FROM coach_documents
       WHERE coach_user_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      userId
    ),
  ]);

  return {
    resubmitToken: createScopedActionToken(userId, 'coach_resubmit', 1800),
    coachDossier: {
      specialite: coachRow?.specialite || '',
      qualification: coachRow?.qualification || '',
      zone: coachRow?.zone || '',
      pro_card_number: coachRow?.pro_card_number || null,
      pro_card_expiry: coachRow?.pro_card_expiry || null,
      rc_pro_insurer: coachRow?.rc_pro_insurer || null,
      rc_pro_policy_number: coachRow?.rc_pro_policy_number || null,
      legal_status: coachRow?.legal_status || null,
      business_reg_number: coachRow?.business_reg_number || null,
      honorability_attested: Boolean(coachRow?.honorability_attested),
      diploma_type: latestDoc?.diploma_type || null,
      issuing_organism: latestDoc?.issuing_organism || null,
      diploma_number: latestDoc?.diploma_number || null,
      issue_year: latestDoc?.issue_year ?? null,
      original_filename: latestDoc?.original_filename || null,
    },
  };
}

function normalizeTrafficPathGroup(rawPath: string): string {
  return rawPath
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

async function buildAdminSystemOverview(): Promise<AdminSystemOverviewPayload> {
  const mem = process.memoryUsage();
  let dbSizeKb = 0;
  try {
    if (USE_POSTGRES) {
      const pgSize = await dbGet<{ bytes: number }>('SELECT pg_database_size(current_database()) as bytes');
      dbSizeKb = Math.round(Number(pgSize?.bytes || 0) / 1024);
    } else if (fs.existsSync(DB_FILE_PATH)) {
      dbSizeKb = Math.round(fs.statSync(DB_FILE_PATH).size / 1024);
    }
  } catch {
    dbSizeKb = 0;
  }

  let uploadsCount = 0;
  let uploadsSizeKb = 0;
  try {
    const docsStats = await dbGet<{ c: number; total_bytes: number }>(
      'SELECT COUNT(*) as c, COALESCE(SUM(file_size_bytes), 0) as total_bytes FROM coach_documents'
    );
    uploadsCount = Number(docsStats?.c || 0);
    uploadsSizeKb = Math.round(Number(docsStats?.total_bytes || 0) / 1024);
    if (uploadsCount === 0 && fs.existsSync(DIPLOMA_UPLOAD_DIR)) {
      const files = fs.readdirSync(DIPLOMA_UPLOAD_DIR);
      let totalBytes = 0;
      for (const f of files) {
        const st = fs.statSync(path.join(DIPLOMA_UPLOAD_DIR, f));
        if (st.isFile()) {
          uploadsCount += 1;
          totalBytes += st.size;
        }
      }
      uploadsSizeKb = Math.round(totalBytes / 1024);
    }
  } catch {
    uploadsCount = 0;
    uploadsSizeKb = 0;
  }

  const [
    activeSessionsRow,
    lockedRow,
    unverifiedRow,
    pendingCoachRow,
    pendingSessionsRow,
    openPainAlertsRow,
    newPartnerReqRow,
    totalsRow,
    athletePlanRows,
    coachPlanRows,
    sportBreakdownRaw,
    traffic24h,
    hourlyLogs,
    topRoutesRaw,
    byRole,
    recentLogs,
  ] = await Promise.all([
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM sessions WHERE datetime(expires_at) > datetime('now')"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE locked_until IS NOT NULL AND datetime(locked_until) > datetime('now')"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE verified = 0 AND statut != 'CLOTURE'"),
    dbGet<{ c: number }>(
      `SELECT COUNT(*) as c
       FROM coaches c
       JOIN users u ON u.id = c.user_id
       WHERE u.statut != 'CLOTURE' AND c.verification_status = 'EN_ATTENTE'`
    ),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM sessions_library WHERE validation_status = 'EN_RELECTURE'"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM alerts WHERE type = 'DOULEUR' AND traitee = 0"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM partner_requests WHERE statut = 'NOUVELLE'"),
    dbGet<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE statut != 'CLOTURE') as "totalUsers",
         (SELECT COUNT(*) FROM users WHERE role = 'ATHLETE' AND statut != 'CLOTURE') as "athletesCount",
         (SELECT COUNT(*) FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.statut != 'CLOTURE' AND c.verification_status = 'VERIFIE') as "coachesVerifiedCount",
         (SELECT COUNT(*) FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.statut != 'CLOTURE' AND c.verification_status = 'EN_ATTENTE') as "coachesPendingCount",
         (SELECT COUNT(*) FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.statut != 'CLOTURE' AND c.verification_status = 'REFUSE') as "coachesRefusedCount",
         (SELECT COUNT(*) FROM partners) as "partnersCount",
         (SELECT COUNT(*) FROM scheduled_sessions WHERE completed = 1) as "completedSessionsCount",
         (SELECT COUNT(*) FROM evaluations) as "evaluationsCount",
         (SELECT COUNT(*) FROM groups) as "groupsCount",
         (SELECT COUNT(*) FROM challenges) as "challengesCount"`
    ),
    dbAll<{
      plan_tier: string | null;
      plan_fee_fcfa: number | null;
      plan_billing_cycle: string | null;
      coach_subscription_status: string | null;
      coach_monthly_fee_fcfa: number | null;
      assigned_commission_pct: number | null;
    }>(
      `SELECT ap.plan_tier, ap.plan_fee_fcfa, ap.plan_billing_cycle,
              ap.coach_subscription_status, ap.coach_monthly_fee_fcfa,
              (
                SELECT c.commission_pct
                FROM assignments a
                JOIN coaches c ON c.user_id = a.coach_user_id
                WHERE a.athlete_user_id = u.id AND a.statut = 'ACTIF'
                ORDER BY a.id DESC
                LIMIT 1
              ) as assigned_commission_pct
       FROM users u
       JOIN athlete_profiles ap ON ap.user_id = u.id
       WHERE u.role = 'ATHLETE' AND u.statut != 'CLOTURE'`
    ),
    dbAll<{
      coach_plan: string | null;
      monthly_fee_fcfa: number | null;
      verification_status: string | null;
    }>(
      `SELECT c.coach_plan, c.monthly_fee_fcfa, c.verification_status
       FROM users u
       JOIN coaches c ON c.user_id = u.id
       WHERE u.role = 'COACH' AND u.statut != 'CLOTURE'`
    ),
    dbAll<{ sport_code: SportCode; athletes_count: number }>(
      `SELECT ap.sport_code, COUNT(*) as athletes_count
       FROM athlete_profiles ap
       JOIN users u ON u.id = ap.user_id
       WHERE u.statut != 'CLOTURE'
       GROUP BY ap.sport_code
       ORDER BY athletes_count DESC`
    ),
    dbGet<{
      total: number;
      lastHour: number | null;
      avgLatencyMs: number | null;
      errorsCount: number | null;
      authBlocks24h: number | null;
      bytesOut: number | null;
    }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 hour') THEN 1 ELSE 0 END) as "lastHour",
         AVG(duration_ms) as "avgLatencyMs",
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as "errorsCount",
         SUM(CASE WHEN status_code IN (401, 403, 429) THEN 1 ELSE 0 END) as "authBlocks24h",
         SUM(bytes_out) as "bytesOut"
       FROM system_traffic_logs
       WHERE datetime(created_at) >= datetime('now', '-24 hours')`
    ),
    dbAll<{ status_code: number; duration_ms: number; created_at: string }>(
      `SELECT status_code, duration_ms, created_at
       FROM system_traffic_logs
       WHERE datetime(created_at) >= datetime('now', '-24 hours')
       ORDER BY id ASC`
    ),
    dbAll<{ method: string; path_group: string; hits: number; avg_ms: number; errors: number }>(
      `SELECT method, path_group, COUNT(*) as hits,
              AVG(duration_ms) as avg_ms,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
       FROM system_traffic_logs
       WHERE datetime(created_at) >= datetime('now', '-24 hours')
       GROUP BY method, path_group
       ORDER BY hits DESC
       LIMIT 12`
    ),
    dbAll<{ role: string; requests: number }>(
      `SELECT COALESCE(user_role, 'PUBLIC') as role, COUNT(*) as requests
       FROM system_traffic_logs
       WHERE datetime(created_at) >= datetime('now', '-24 hours')
       GROUP BY COALESCE(user_role, 'PUBLIC')
       ORDER BY requests DESC`
    ),
    dbAll<AdminSystemOverviewPayload['traffic']['recentLogs'][number]>(
      `SELECT id, method, full_path, status_code, duration_ms,
              COALESCE(user_role, 'PUBLIC') as user_role, bytes_out, created_at
       FROM system_traffic_logs
       ORDER BY id DESC
       LIMIT 45`
    ),
  ]);

  let freeAthletesCount = 0;
  let paidAthletesCount = 0;
  let progressionMonthlyCount = 0;
  let progressionQuarterlyCount = 0;
  let coachPrivateAthletesCount = 0;
  let progressionMonthlyRevenueFcfa = 0;
  let coachGrossMonthlyFcfa = 0;
  let coachCommissionRevenueFcfa = 0;
  let coachPayoutsMonthlyFcfa = 0;

  for (const row of athletePlanRows) {
    const tier = String(row.plan_tier || 'ESSENTIEL').toUpperCase();
    const hasCoachSub = tier === 'COACH_PRIVE' || row.coach_subscription_status === 'ACTIF_5000';
    if (hasCoachSub) {
      paidAthletesCount += 1;
      coachPrivateAthletesCount += 1;
      const fee = Number(row.coach_monthly_fee_fcfa || row.plan_fee_fcfa || 5000);
      const commissionPct = row.assigned_commission_pct !== null && row.assigned_commission_pct !== undefined
        ? Number(row.assigned_commission_pct)
        : 20;
      const commission = Math.round((fee * commissionPct) / 100);
      coachGrossMonthlyFcfa += fee;
      coachCommissionRevenueFcfa += commission;
      coachPayoutsMonthlyFcfa += Math.max(0, fee - commission);
    } else if (tier === 'PROGRESSION') {
      paidAthletesCount += 1;
      const cycle = String(row.plan_billing_cycle || 'MENSUEL').toUpperCase();
      const rawFee = Number(row.plan_fee_fcfa || (cycle === 'TRIMESTRIEL' ? 4000 : 1500));
      if (cycle === 'TRIMESTRIEL') {
        progressionQuarterlyCount += 1;
        progressionMonthlyRevenueFcfa += Math.round(rawFee / 3);
      } else {
        progressionMonthlyCount += 1;
        progressionMonthlyRevenueFcfa += rawFee;
      }
    } else {
      freeAthletesCount += 1;
    }
  }

  let freeCoachesCount = 0;
  let paidCoachesCount = 0;
  let coachProLicenseRevenueFcfa = 0;
  for (const c of coachPlanRows) {
    const plan = String(c.coach_plan || 'MARKETPLACE').toUpperCase();
    const isVerified = c.verification_status === 'VERIFIE';
    if (plan === 'COACH_PRO' && isVerified) {
      paidCoachesCount += 1;
      coachProLicenseRevenueFcfa += Number(c.monthly_fee_fcfa || 3000);
    } else if (isVerified) {
      freeCoachesCount += 1;
    }
  }

  const netPlatformMonthlyRevenueFcfa =
    progressionMonthlyRevenueFcfa + coachCommissionRevenueFcfa + coachProLicenseRevenueFcfa;
  const grossMonthlyVolumeFcfa =
    progressionMonthlyRevenueFcfa + coachGrossMonthlyFcfa + coachProLicenseRevenueFcfa;

  const sportBreakdown = sportBreakdownRaw.map((s) => ({
    sport_code: s.sport_code,
    athletes_count: Number(s.athletes_count || 0),
  }));

  const hourlyBuckets = new Map<string, { hour: string; requests: number; errors: number; latencySum: number }>();
  for (const row of hourlyLogs) {
    const rawTs = String(row.created_at || '');
    const iso = rawTs.includes('T') ? rawTs : rawTs.replace(' ', 'T') + 'Z';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) continue;
    const bucketKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')} ${String(dt.getUTCHours()).padStart(2, '0')}`;
    const hourLabel = `${String(dt.getUTCHours()).padStart(2, '0')}:00`;
    const cur = hourlyBuckets.get(bucketKey) || { hour: hourLabel, requests: 0, errors: 0, latencySum: 0 };
    cur.requests += 1;
    if (Number(row.status_code) >= 400) cur.errors += 1;
    cur.latencySum += Number(row.duration_ms || 0);
    hourlyBuckets.set(bucketKey, cur);
  }
  const hourlySeries = Array.from(hourlyBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, b]) => ({
      hour: b.hour,
      requests: b.requests,
      errors: b.errors,
      avgLatencyMs: b.requests > 0 ? Math.round(b.latencySum / b.requests) : 0,
    }));

  const topRoutes = topRoutesRaw.map((r) => ({
    method: r.method,
    path_group: r.path_group,
    hits: Number(r.hits || 0),
    avg_ms: Number(Number(r.avg_ms || 0).toFixed(1)),
    errors: Number(r.errors || 0),
  }));

  const total24 = Number(traffic24h?.total || 0);
  const err24 = Number(traffic24h?.errorsCount || 0);

  return {
    generatedAt: new Date().toISOString(),
    system: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
      memoryHeapMb: Math.round(mem.heapUsed / (1024 * 1024)),
      dbSizeKb,
      uploadsCount,
      uploadsSizeKb,
      activeSessionsCount: Number(activeSessionsRow?.c || 0),
      lockedAccountsCount: Number(lockedRow?.c || 0),
      unverifiedAccountsCount: Number(unverifiedRow?.c || 0),
    },
    queues: {
      pendingCoachDossiers: Number(pendingCoachRow?.c || 0),
      pendingSessionsReview: Number(pendingSessionsRow?.c || 0),
      openPainAlerts: Number(openPainAlertsRow?.c || 0),
      newPartnerRequests: Number(newPartnerReqRow?.c || 0),
    },
    platformTotals: {
      totalUsers: Number(totalsRow?.totalUsers || 0),
      athletesCount: Number(totalsRow?.athletesCount || 0),
      coachesVerifiedCount: Number(totalsRow?.coachesVerifiedCount || 0),
      coachesPendingCount: Number(totalsRow?.coachesPendingCount || 0),
      coachesRefusedCount: Number(totalsRow?.coachesRefusedCount || 0),
      partnersCount: Number(totalsRow?.partnersCount || 0),
      completedSessionsCount: Number(totalsRow?.completedSessionsCount || 0),
      evaluationsCount: Number(totalsRow?.evaluationsCount || 0),
      groupsCount: Number(totalsRow?.groupsCount || 0),
      challengesCount: Number(totalsRow?.challengesCount || 0),
    },
    monetization: {
      freeAthletesCount,
      paidAthletesCount,
      progressionMonthlyCount,
      progressionQuarterlyCount,
      coachPrivateAthletesCount,
      freeCoachesCount,
      paidCoachesCount,
      totalFreeUsers: freeAthletesCount + freeCoachesCount,
      totalPaidUsers: paidAthletesCount + paidCoachesCount,
      grossMonthlyVolumeFcfa,
      netPlatformMonthlyRevenueFcfa,
      coachPayoutsMonthlyFcfa,
      breakdown: {
        progressionMonthlyRevenueFcfa,
        coachCommissionRevenueFcfa,
        coachProLicenseRevenueFcfa,
      },
    },
    sportBreakdown,
    traffic: {
      requestsLast24h: total24,
      requestsLastHour: Number(traffic24h?.lastHour || 0),
      avgLatencyMs: Math.round(Number(traffic24h?.avgLatencyMs || 0)),
      errorRatePct: total24 > 0 ? Number(((err24 / total24) * 100).toFixed(1)) : 0,
      authBlocks24h: Number(traffic24h?.authBlocks24h || 0),
      bandwidthOutKb24h: Math.round(Number(traffic24h?.bytesOut || 0) / 1024),
      hourlySeries,
      topRoutes,
      byRole: byRole.map((r) => ({ role: r.role, requests: Number(r.requests || 0) })),
      recentLogs,
    },
  };
}

async function buildAthleteWorkspace(athleteUserId: number, viewerUserId = athleteUserId) {
  const user = await dbGet<AuthedUserRow>(
    `SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified
     FROM users WHERE id = ?`,
    athleteUserId
  );
  if (!user) return null;

  const profileRow = await dbGet<{
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
  }>(
    `SELECT sport_code, niveau, taille_cm, poste, objectif, eco_data_mode, notifications_enabled,
            reminder_time, reminder_lead_minutes,
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
     FROM athlete_profiles WHERE user_id = ?`,
    athleteUserId
  );

  if (!profileRow) return null;

  const [coachRow, programRow, schedRows, libraryRows, weights, evalRows, evalCommentsRows, alertsRaw, groupRows, challenges, consents, availableCoaches] =
    await Promise.all([
      dbGet<{
        id: number;
        nom: string;
        prenom: string;
        specialite: string;
        qualification: string;
        zone: string;
        coach_plan: 'MARKETPLACE' | 'COACH_PRO';
        athlete_monthly_fee_fcfa: number;
      }>(
        `SELECT u.id, u.nom, u.prenom, c.specialite, c.qualification, c.zone, c.coach_plan, c.athlete_monthly_fee_fcfa
         FROM assignments a
         JOIN users u ON u.id = a.coach_user_id
         JOIN coaches c ON c.user_id = u.id
         WHERE a.athlete_user_id = ? AND a.statut = 'ACTIF'
         LIMIT 1`,
        athleteUserId
      ),
      dbGet<{ id: number; objectif: string; date_debut: string; duree_semaines: number; notes: string | null }>(
        `SELECT id, objectif, date_debut, duree_semaines, notes
         FROM program_plans WHERE athlete_user_id = ? ORDER BY id DESC LIMIT 1`,
        athleteUserId
      ),
      dbAll<Record<string, unknown>>(
        `SELECT ss.*, sl.sport_code as s_sport_code, sl.titre as s_titre, sl.niveau as s_niveau,
                sl.duree_min as s_duree_min, sl.objectif as s_objectif, sl.prevention_focus as s_prevention_focus,
                sl.relue_par as s_relue_par, sl.validation_status as s_validation_status,
                sl.access_tier as s_access_tier, sl.exercises_json as s_exercises_json
         FROM scheduled_sessions ss
         LEFT JOIN sessions_library sl ON sl.id = ss.session_id
         WHERE ss.athlete_user_id = ?
         ORDER BY ss.jour_semaine ASC`,
        athleteUserId
      ),
      dbAll<Record<string, unknown>>(
        `SELECT id, sport_code, titre, niveau, duree_min, objectif, prevention_focus, relue_par, validation_status, access_tier, exercises_json
         FROM sessions_library
         WHERE sport_code = ? AND validation_status = 'VALIDEE'
         ORDER BY CASE WHEN access_tier = 'ESSENTIEL' THEN 0 ELSE 1 END, id ASC`,
        profileRow.sport_code
      ),
      dbAll<{ id: number; poids_kg: number; date: string }>(
        'SELECT id, poids_kg, date FROM weight_logs WHERE athlete_user_id = ? ORDER BY date ASC, id ASC',
        athleteUserId
      ),
      dbAll<Record<string, unknown>>(
        'SELECT id, athlete_user_id, type, sport_code, date, score_global, results_json FROM evaluations WHERE athlete_user_id = ? ORDER BY date DESC, id DESC',
        athleteUserId
      ),
      dbAll<{ id: number; evaluation_id: number; coach_nom: string; texte: string; date: string }>(
        `SELECT cc.id, cc.evaluation_id, (u.prenom || ' ' || u.nom) as coach_nom, cc.texte, cc.date
         FROM coach_comments cc
         JOIN evaluations e ON e.id = cc.evaluation_id
         JOIN users u ON u.id = cc.coach_user_id
         WHERE e.athlete_user_id = ?
         ORDER BY cc.date DESC`,
        athleteUserId
      ),
      dbAll<Record<string, unknown>>(
        `SELECT id, athlete_user_id, type, zone_douleur, intensite, message, date, traitee, note_traitement
         FROM alerts WHERE athlete_user_id = ? AND type != 'DOULEUR' ORDER BY traitee ASC, date DESC LIMIT 20`,
        athleteUserId
      ),
      dbAll<Record<string, unknown>>(
        `SELECT g.id, g.nom, p.nom as partner_nom, p.type as partner_type, p.zone, g.captain_name, g.sport_code,
                COALESCE(gm_counts.member_count, 0) as member_count,
                CASE WHEN gm_self.id IS NOT NULL THEN 1 ELSE 0 END as joined
         FROM groups g
         JOIN partners p ON p.id = g.partner_id
         LEFT JOIN (
           SELECT group_id, COUNT(*) as member_count
           FROM group_memberships
           GROUP BY group_id
         ) gm_counts ON gm_counts.group_id = g.id
         LEFT JOIN group_memberships gm_self ON gm_self.group_id = g.id AND gm_self.user_id = ?
         ORDER BY g.id ASC`,
        athleteUserId
      ),
      dbAll(
        `SELECT c.id, p.nom as partner_nom, c.titre, c.indicateur, c.periode, c.target_sessions, c.current_sessions
         FROM challenges c
         JOIN partners p ON p.id = c.partner_id
         ORDER BY c.id ASC`
      ),
      dbAll('SELECT id, type, version, accepted_at FROM consents WHERE user_id = ? ORDER BY id DESC', athleteUserId),
      getPublicCoachesList(),
    ]);

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

  const commentsByEvalId = new Map<number, typeof evalCommentsRows>();
  for (const c of evalCommentsRows) {
    const eid = Number(c.evaluation_id);
    const list = commentsByEvalId.get(eid) || [];
    list.push(c);
    commentsByEvalId.set(eid, list);
  }

  const evaluations = evalRows.map((ev) => ({
    id: Number(ev.id),
    athlete_user_id: Number(ev.athlete_user_id),
    type: String(ev.type),
    sport_code: String(ev.sport_code),
    date: String(ev.date),
    score_global: Number(ev.score_global),
    results: JSON.parse(String(ev.results_json || '[]')),
    comments: commentsByEvalId.get(Number(ev.id)) || [],
  }));

  const alerts = alertsRaw.map((row) => ({
    ...row,
    traitee: Boolean(row.traitee),
  }));

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

  const fourWeekRegularityPct =
    weeklyTarget > 0 ? Math.min(100, Math.round((weeklyCompleted / weeklyTarget) * 100)) : 0;

  const coachVideoRows = coachRow
    ? await dbAll<RawCoachVideoRow>(
        `SELECT cv.*,
                sl.titre as session_titre,
                (uc.prenom || ' ' || uc.nom) as coach_nom
         FROM coach_videos cv
         LEFT JOIN sessions_library sl ON sl.id = cv.session_id
         JOIN users uc ON uc.id = cv.coach_user_id
         WHERE cv.coach_user_id = ?
           AND (cv.athlete_user_id IS NULL OR cv.athlete_user_id = ?)
         ORDER BY cv.created_at DESC, cv.id DESC`,
        coachRow.id,
        athleteUserId
      )
    : [];

  const coachVideos = coachVideoRows.map((v) => mapCoachVideoRow(v, viewerUserId));

  const coachMessageRows = coachRow
    ? await dbAll<{
        id: number;
        athlete_user_id: number;
        coach_user_id: number;
        sender_user_id: number;
        sender_role: 'ATHLETE' | 'COACH';
        sender_nom: string;
        body: string;
        read_by_athlete: number;
        read_by_coach: number;
        created_at: string;
      }>(
        `SELECT cm.*, (u.prenom || ' ' || u.nom) as sender_nom
         FROM coach_messages cm
         JOIN users u ON u.id = cm.sender_user_id
         WHERE cm.athlete_user_id = ? AND cm.coach_user_id = ?
         ORDER BY cm.id DESC
         LIMIT 80`,
        athleteUserId,
        coachRow.id
      )
    : [];

  const coachMessages = [...coachMessageRows].reverse().map((m) => ({
    id: Number(m.id),
    athlete_user_id: Number(m.athlete_user_id),
    coach_user_id: Number(m.coach_user_id),
    sender_user_id: Number(m.sender_user_id),
    sender_role: m.sender_role,
    sender_nom: String(m.sender_nom),
    body: String(m.body),
    read_by_athlete: Boolean(m.read_by_athlete),
    read_by_coach: Boolean(m.read_by_coach),
    created_at: String(m.created_at),
  }));

  const unreadCoachMessagesCount = coachMessages.filter(
    (m) => m.sender_role === 'COACH' && !m.read_by_athlete
  ).length;

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
    availableCoaches,
    program: programRow || null,
    schedule,
    library,
    coachVideos,
    coachMessages,
    unreadCoachMessagesCount,
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

export async function createApp(): Promise<Express> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression({ threshold: 512 }));
  const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const scriptSrcDirective = IS_PROD
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  app.use(
    '/api/coach/videos/local-upload',
    express.raw({
      type: ['video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream'],
      limit: '16mb',
    })
  );
  app.use('/api/auth/register', express.json({ limit: '5mb' }));
  app.use('/api/auth/coach-resubmit', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '512kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; ${scriptSrcDirective}; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' https: blob:; frame-src 'self' blob: https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'`
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

  app.use(
    '/api',
    asyncHandler(async (_req: Request, _res: Response, next: NextFunction) => {
      await ensureAppReady();
      next();
    })
  );

  app.use('/api', verifySameOrigin);
  app.use(attachUser);

  // HTTP/API traffic telemetry middleware
  app.use('/api', (req: AuthedRequest, res: Response, next: NextFunction) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      void (async () => {
        try {
          const durationMs = Math.max(0, Math.round(Number(process.hrtime.bigint() - startNs) / 1_000_000));
          const fullPath = req.originalUrl.split('?')[0].slice(0, 180);
          const pathGroup = normalizeTrafficPathGroup(fullPath);
          const ipRaw = req.ip || 'local';
          const ipHash = crypto.createHash('sha256').update(ipRaw).digest('hex').slice(0, 12);
          const bytesOutHeader = res.getHeader('content-length');
          const bytesOut = typeof bytesOutHeader === 'number'
            ? bytesOutHeader
            : typeof bytesOutHeader === 'string'
              ? parseInt(bytesOutHeader, 10) || 0
              : 0;

          await dbRun(
            `INSERT INTO system_traffic_logs (
              method, path_group, full_path, status_code, duration_ms, user_role, user_id, ip_hash, bytes_out
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            req.method,
            pathGroup,
            fullPath,
            res.statusCode,
            durationMs,
            req.authUser?.role || 'PUBLIC',
            req.authUser?.id || null,
            ipHash,
            bytesOut
          );

          trafficInsertCount += 1;
          if (trafficInsertCount % 150 === 0) {
            await dbRun("DELETE FROM system_traffic_logs WHERE datetime(created_at) < datetime('now', '-7 days')");
            await dbRun(
              `DELETE FROM system_traffic_logs
               WHERE id NOT IN (SELECT id FROM system_traffic_logs ORDER BY id DESC LIMIT 5000)`
            );
          }
        } catch {
          // Ignore telemetry write error to never disrupt API responses
        }
      })();
    });
    next();
  });

  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    if (!req.authUser) {
      res.json({ user: null });
      return;
    }
    res.json({ user: mapUserPublic(req.authUser) });
  });

  app.post(
    '/api/auth/register',
    authLimiter,
    asyncHandler(async (req: Request, res: Response) => {
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
      const consentCdpLegal = Boolean(body.consent_cdp_legal);

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

      const existing = await dbGet('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?', email, telephone);
      if (existing) {
        res.status(409).json({ error: 'Un compte existe déjà avec cet email ou ce numéro.' });
        return;
      }

      if (accountType === 'COACH') {
        const specialite = sanitizeText(body.specialite, 120);
        const qualification = sanitizeText(body.qualification, 140);
        const zone = sanitizeText(body.zone, 80);
        const coachPlan = 'MARKETPLACE' as const;
        const confirmCoachTerms = Boolean(body.confirm_coach_plan ?? body.confirm_coach_platform_fee);

        const diplomaTypeRaw = sanitizeText(body.diploma_type, 50).toUpperCase() as DiplomaTypeCode;
        const issuingOrganism = sanitizeText(body.issuing_organism, 120);
        const diplomaNumber = sanitizeText(body.diploma_number, 60);
        const issueYear = Number(body.issue_year);
        const diplomaFile = (body.diploma_file || null) as { name?: unknown; base64?: unknown } | null;

        const proCardNumber = sanitizeText(body.pro_card_number, 60);
        const proCardExpiry = sanitizeText(body.pro_card_expiry, 20);
        const rcProInsurer = sanitizeText(body.rc_pro_insurer, 100);
        const rcProPolicyNumber = sanitizeText(body.rc_pro_policy_number, 60);
        const legalStatusRaw = sanitizeText(body.legal_status, 40).toUpperCase();
        const businessRegNumber = sanitizeText(body.business_reg_number, 60);
        const honorabilityAttested = Boolean(body.honorability_attested);

        const age = computeAge(date_naissance);
        if (age < 18 || age > 90) {
          res.status(400).json({ error: 'Un coach doit être majeur (18 ans minimum).' });
          return;
        }
        if (!specialite || !qualification || !zone) {
          res.status(400).json({ error: 'Spécialité, qualification et zone d’intervention sont obligatoires pour un coach.' });
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(SPORT_DIPLOMA_FORMATS, diplomaTypeRaw)) {
          res.status(400).json({ error: 'Veuillez sélectionner un format officiel de diplôme sportif.' });
          return;
        }
        if (!issuingOrganism || issuingOrganism.length < 2 || !diplomaNumber || diplomaNumber.length < 4) {
          res.status(400).json({ error: 'Organisme émetteur et numéro de diplôme ou licence requis.' });
          return;
        }
        const currentYear = new Date().getFullYear();
        if (!Number.isInteger(issueYear) || issueYear < 1980 || issueYear > currentYear) {
          res.status(400).json({ error: `Année d'obtention invalide (attendue entre 1980 et ${currentYear}).` });
          return;
        }
        if (!proCardNumber || proCardNumber.length < 4) {
          res.status(400).json({ error: "Le numéro de carte professionnelle d'éducateur sportif est obligatoire." });
          return;
        }
        const proCardExpiryDate = proCardExpiry ? new Date(proCardExpiry) : null;
        if (!proCardExpiryDate || Number.isNaN(proCardExpiryDate.getTime()) || proCardExpiryDate.getTime() <= Date.now()) {
          res.status(400).json({ error: 'La date de validité de la carte professionnelle doit être valide et non expirée.' });
          return;
        }
        if (!rcProInsurer || rcProInsurer.length < 2 || !rcProPolicyNumber || rcProPolicyNumber.length < 4) {
          res.status(400).json({ error: 'L’assureur et le numéro de police RC Pro sont obligatoires.' });
          return;
        }
        if (!COACH_LEGAL_STATUS_OPTIONS.some((o) => o.code === legalStatusRaw)) {
          res.status(400).json({ error: 'Veuillez sélectionner un statut juridique d’exercice valide.' });
          return;
        }
        if (!businessRegNumber || businessRegNumber.length < 5) {
          res.status(400).json({ error: 'Le numéro SIRET, NINEA, RCCM ou RNA est obligatoire (5 caractères min.).' });
          return;
        }
        if (!honorabilityAttested) {
          res.status(400).json({ error: "L'attestation sur l'honneur d'honorabilité (casier judiciaire vierge) est obligatoire." });
          return;
        }
        if (!diplomaFile || typeof diplomaFile.base64 !== 'string' || !diplomaFile.base64.trim()) {
          res.status(400).json({
            error: 'Le dépôt du justificatif de diplôme (PDF, JPG, PNG ou WEBP, max 3 Mo) est obligatoire.',
          });
          return;
        }

        const rawBase64 = diplomaFile.base64.includes(',')
          ? diplomaFile.base64.split(',').slice(1).join(',')
          : diplomaFile.base64;
        const fileBuffer = Buffer.from(rawBase64.replace(/\s+/g, ''), 'base64');
        if (fileBuffer.length < 400 || fileBuffer.length > MAX_DIPLOMA_FILE_BYTES) {
          res.status(400).json({
            error: 'Le fichier diplôme est invalide ou dépasse la limite autorisée de 3 Mo.',
          });
          return;
        }
        const detectedMime = detectMimeFromMagicBytes(fileBuffer);
        if (!detectedMime) {
          res.status(400).json({
            error: 'Format binaire non reconnu. Veuillez uploader un véritable fichier PDF, JPG, PNG ou WEBP.',
          });
          return;
        }
        const originalFilename = sanitizeText(diplomaFile.name, 120) || 'diplome_coach';

        if (!consentNonMedical || !confirmCoachTerms || !consentCdpLegal) {
          res.status(400).json({
            error:
              'La confirmation des conditions Coach Terrain+, de la charte non médicale et de la politique de confidentialité (CDP Sénégal) est obligatoire.',
          });
          return;
        }

        const monthlyFee = 0;
        const commissionPct = 20;
        const athletePayout = 4000;
        const otpEnabled = isOtpDeliveryConfigured();
        const otp = otpEnabled ? generateOtpCode() : null;
        const otpHash = otp ? hashToken(otp) : null;
        const otpExpires = otp ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

        const { userId, docRes } = await dbTransaction(async (tx) => {
          const uRes = await tx.run(
            `INSERT INTO users (
              nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
              statut, is_minor, verified, otp_code_hash, otp_expires_at
            ) VALUES (?, ?, ?, ?, ?, 'COACH', ?, ?, 'INSCRIT', 0, ?, ?, ?)`,
            nom,
            prenom,
            telephone,
            email,
            hashPassword(password),
            date_naissance,
            langue,
            otpEnabled ? 0 : 1,
            otpHash,
            otpExpires
          );
          const userId = Number(uRes.lastInsertRowid);

          await tx.run(
            `INSERT INTO coaches (
              user_id, specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
              platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa, verification_status,
              pro_card_number, pro_card_expiry, rc_pro_insurer, rc_pro_policy_number,
              legal_status, business_reg_number, honorability_attested
            ) VALUES (?, ?, ?, ?, ?, 5000, 'ACTIF_1000', ?, ?, ?, 'EN_ATTENTE', ?, ?, ?, ?, ?, ?, ?)`,
            userId,
            specialite,
            qualification,
            zone,
            monthlyFee,
            coachPlan,
            commissionPct,
            athletePayout,
            proCardNumber,
            proCardExpiry,
            rcProInsurer,
            rcProPolicyNumber,
            legalStatusRaw,
            businessRegNumber,
            honorabilityAttested ? 1 : 0
          );

          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'NON_MEDICAL', 'v1.0');
          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'CGU_CONFIDENTIALITE_CDP', 'v1.0');
          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, `COACH_PLAN_${coachPlan}`, 'v2.0');
          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'COACH_HONORABILITY', 'v1.0');

          const docRes = await storeCoachDiplomaDocument(
            {
              coachUserId: userId,
              diplomaType: diplomaTypeRaw,
              issuingOrganism,
              diplomaNumber,
              issueYear,
              specialite,
              qualification,
              originalFilename,
              buffer: fileBuffer,
              proCardNumber,
              proCardExpiry,
              rcProInsurer,
              rcProPolicyNumber,
              legalStatus: legalStatusRaw,
              businessRegNumber,
              honorabilityAttested,
            },
            tx
          );

          await logAccess(userId, 'COACH', null, 'DEPOT_DIPLOME_COACH', `doc:${docRes.docId}:${docRes.studyStatus}`, tx);

          return { userId, docRes };
        });

        if (otpEnabled && otp) {
          const delivery = await deliverOtpCode({
            email,
            telephone,
            prenom,
            code: otp,
            purpose: 'VERIFICATION',
          });
          res.status(201).json({
            requiresVerification: true,
            userId,
            email,
            telephone,
            role: 'COACH',
            coach_plan: coachPlan,
            studyStatus: docRes.studyStatus,
            studyScore: docRes.studyScore,
            message: delivery.delivered
              ? 'Dossier Coach Terrain+ déposé (0 FCFA fixe · 4 000 F/athlète). Validez le code envoyé ; votre compte restera ensuite en étude jusqu’à validation de votre diplôme par l’administrateur.'
              : "Dossier enregistré, mais l'envoi du code OTP a échoué. Cliquez sur « Renvoyer un code ».",
          });
          return;
        }

        res.status(201).json({
          requiresVerification: false,
          pendingAdminReview: true,
          verificationStatus: 'EN_ATTENTE',
          userId,
          email,
          telephone,
          role: 'COACH',
          coach_plan: coachPlan,
          studyStatus: docRes.studyStatus,
          studyScore: docRes.studyScore,
          message:
            'Dossier Coach Terrain+ déposé (0 FCFA fixe · 4 000 F/athlète). Votre diplôme et vos pièces sont en cours de vérification par l’administrateur Terrain+.',
        });
        return;
      }

      // ATHLETE Registration
      const sport_code = sanitizeText(body.sport_code, 20) as SportCode;
      const niveau = (sanitizeText(body.niveau, 20) || 'debutant') as AthleteLevel;
      const poids_kg = Number(body.poids_kg);
      const taille_cm = body.taille_cm ? Number(body.taille_cm) : null;
      const poste = sanitizeText(body.poste, 60) || null;
      const rawObjectiveInput = sanitizeText(body.objectif_code || body.objectif, 120);
      const consentSensible = Boolean(body.consent_sensible);
      const parentalName = sanitizeText(body.parental_consent_name, 100);
      const parentalPhone = normalizePhone(sanitizeText(body.parental_consent_phone, 30));
      const selectedCoachId = body.selected_coach_id ? Number(body.selected_coach_id) : null;
      const requestedPlan = sanitizeText(body.plan_tier, 20).toUpperCase();
      const confirmPlanChoice = Boolean(body.confirm_coach_contribution || body.confirm_plan_choice);

      const planTier: 'ESSENTIEL' | 'COACH_PRIVE' =
        requestedPlan === 'COACH_PRIVE' || selectedCoachId !== null ? 'COACH_PRIVE' : 'ESSENTIEL';

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
      if (!consentSensible || !consentNonMedical || !consentCdpLegal) {
        res.status(400).json({
          error:
            'Les consentements explicites (données physiques, clause non médicale, CGU & confidentialité CDP Sénégal) sont obligatoires.',
        });
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
        const coachExists = await dbGet<{ id: number }>(
          `SELECT u.id FROM users u
           JOIN coaches c ON c.user_id = u.id
           WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`,
          selectedCoachId
        );
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
      }

      const planFeeFcfa = planTier === 'COACH_PRIVE' ? 5000 : 0;

      const otpEnabled = isOtpDeliveryConfigured();
      const otp = otpEnabled ? generateOtpCode() : null;
      const otpHash = otp ? hashToken(otp) : null;
      const otpExpires = otp ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

      const userId = await dbTransaction(async (tx) => {
        const uRes = await tx.run(
          `INSERT INTO users (
            nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
            statut, is_minor, parental_consent_name, parental_consent_phone,
            verified, otp_code_hash, otp_expires_at
          ) VALUES (?, ?, ?, ?, ?, 'ATHLETE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          nom,
          prenom,
          telephone,
          email,
          hashPassword(password),
          date_naissance,
          langue,
          otpEnabled ? 'INSCRIT' : 'ACTIF',
          isMinor ? 1 : 0,
          isMinor ? parentalName : null,
          isMinor ? parentalPhone : null,
          otpEnabled ? 0 : 1,
          otpHash,
          otpExpires
        );
        const userId = Number(uRes.lastInsertRowid);

        const objectiveSpec = resolveObjectiveSpec(rawObjectiveInput);
        const athleteObjectiveLabel = buildAthleteObjectiveLabel(objectiveSpec.code, SPORTS_CONFIG[sport_code].nom);

        await tx.run(
          `INSERT INTO athlete_profiles (
            user_id, sport_code, niveau, taille_cm, poste, objectif,
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${validCoachId ? "datetime('now')" : 'NULL'}, ?, ?, 'MENSUEL')`,
          userId,
          sport_code,
          niveau,
          taille_cm,
          poste,
          athleteObjectiveLabel,
          validCoachId ? 'ACTIF_5000' : 'GRATUIT_BASE',
          validCoachId ? 5000 : 0,
          planTier,
          planFeeFcfa
        );

        await tx.run("INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, date('now'))", userId, poids_kg);

        await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'DONNEES_SENSIBLES', 'v1.0');
        await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'NON_MEDICAL', 'v1.0');
        await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'CGU_CONFIDENTIALITE_CDP', 'v1.0');
        if (isMinor) {
          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, 'ACCORD_PARENTAL', 'v1.0');
        }
        if (planTier !== 'ESSENTIEL') {
          await tx.run('INSERT INTO consents (user_id, type, version) VALUES (?, ?, ?)', userId, `FORMULE_${planTier}`, 'v2.0');
        }
        if (validCoachId) {
          await tx.run(
            "INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')",
            validCoachId,
            userId
          );
        }

        await buildDefaultScheduleForAthlete(
          userId,
          sport_code,
          niveau,
          validCoachId,
          athleteObjectiveLabel,
          tx
        );
        return userId;
      });

      if (otpEnabled && otp) {
        const delivery = await deliverOtpCode({
          email,
          telephone,
          prenom,
          code: otp,
          purpose: 'VERIFICATION',
        });
        res.status(201).json({
          requiresVerification: true,
          userId,
          email,
          telephone,
          role: 'ATHLETE',
          plan_tier: planTier,
          message: delivery.delivered
            ? 'Compte créé. Validez votre inscription avec le code envoyé.'
            : "Compte créé, mais l'envoi du code a échoué. Cliquez sur « Renvoyer un code ».",
        });
        return;
      }

      const sessionToken = await createSessionForUser(req, res, userId);
      const createdUser = await dbGet<AuthedUserRow>(
        'SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?',
        userId
      );
      res.status(201).json({
        requiresVerification: false,
        user: createdUser ? mapUserPublic(createdUser) : null,
        sessionToken,
        userId,
        email,
        telephone,
        role: 'ATHLETE',
        plan_tier: planTier,
        message: 'Compte créé et activé.',
      });
    })
  );

  app.post(
    '/api/auth/verify',
    authLimiter,
    otpLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const identifier = sanitizeText(body.identifier, 120).toLowerCase();
      const code = sanitizeText(body.code, 12).replace(/\s+/g, '');
      if (identifier.length < 3 || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: 'Identifiant et code OTP à 6 chiffres requis.' });
        return;
      }

      const user = await dbGet<
        AuthedUserRow & { otp_code_hash: string | null; otp_expires_at: string | null; otp_attempts: number }
      >('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?', identifier, normalizePhone(identifier));

      if (!user || !user.otp_code_hash || !user.otp_expires_at) {
        res.status(400).json({ error: 'Aucune validation en attente pour cet identifiant.' });
        return;
      }
      if (user.otp_attempts >= 5) {
        await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
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
          await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
          res.status(429).json({ error: 'Code incorrect. Limite atteinte, demandez un nouveau code OTP.' });
          return;
        }
        await dbRun('UPDATE users SET otp_attempts = ? WHERE id = ?', nextAttempts, user.id);
        res.status(400).json({ error: 'Code de validation incorrect.' });
        return;
      }

      if (user.role === 'COACH') {
        const gate = await checkCoachAccessGate(user.id);
        if (gate.blocked) {
          await dbRun(
            `UPDATE users
             SET verified = 1, otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0
             WHERE id = ?`,
            user.id
          );
          await logAccess(user.id, 'COACH', null, 'INSCRIPTION_COACH_EN_ETUDE', `verification:${gate.verificationStatus}`);
          const gateDetails = await buildCoachGateDetails(user.id, gate);
          res.json({
            user: null,
            pendingAdminReview: true,
            verificationStatus: gate.verificationStatus,
            rejectionReason: gate.rejectionReason,
            ...gateDetails,
            message:
              gate.verificationStatus === 'EN_ATTENTE'
                ? "Contact vérifié avec succès. Votre diplôme et votre dossier sont maintenant en cours d'étude par l'administrateur Terrain+. Veuillez patienter avant de vous connecter."
                : gate.message,
          });
          return;
        }
      }

      await dbRun(
        `UPDATE users
         SET verified = 1, statut = 'ACTIF', otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0
         WHERE id = ?`,
        user.id
      );

      const sessionToken = await createSessionForUser(req, res, user.id);
      const updated = await dbGet<AuthedUserRow>(
        'SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?',
        user.id
      );
      if (!updated) {
        res.status(500).json({ error: 'Erreur lors de la récupération du compte.' });
        return;
      }
      res.json({ user: mapUserPublic(updated), sessionToken });
    })
  );

  app.post(
    '/api/auth/login',
    authLimiter,
    loginIpLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const identifier = sanitizeText(body.identifier, 120);
      const password = typeof body.password === 'string' ? body.password : '';
      const portal = body.portal === 'admin' ? 'admin' : 'public';

      if (!identifier || !password || password.length > 128) {
        res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
        return;
      }

      const user = await dbGet<
        AuthedUserRow & {
          password_hash: string;
          failed_login_attempts: number;
          locked_until: string | null;
        }
      >('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?', identifier, normalizePhone(identifier));

      if (!user) {
        res.status(404).json({
          error: "Ces identifiants n'existent pas sur Terrain+. Veuillez créer un compte pour accéder à votre espace.",
          accountNotFound: true,
        });
        return;
      }

      if (portal !== 'admin' && user.role === 'ADMIN') {
        res.status(403).json({ error: "Ce compte ne peut pas se connecter depuis l'espace public." });
        return;
      }
      if (portal === 'admin' && user.role !== 'ADMIN') {
        res.status(403).json({ error: "Accès réservé exclusivement aux comptes administrateur." });
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
        await dbRun(
          'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
          shouldLock ? 0 : nextFails,
          lockUntil,
          user.id
        );
        if (shouldLock) {
          await logAccess(user.id, user.role, null, 'VERROUILLAGE_COMPTE', 'tentatives_connexion_echouees');
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

      await dbRun('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', user.id);

      if (!user.verified) {
        if (!isOtpDeliveryConfigured()) {
          await dbRun(
            "UPDATE users SET verified = 1, statut = CASE WHEN statut = 'INSCRIT' THEN 'ACTIF' ELSE statut END, otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?",
            user.id
          );
          user.verified = 1;
          if (user.statut === 'INSCRIT') {
            user.statut = 'ACTIF';
          }
        } else {
          const otp = generateOtpCode();
          const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          await dbRun(
            'UPDATE users SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?',
            hashToken(otp),
            otpExpires,
            user.id
          );
          const delivery = await deliverOtpCode({
            email: user.email,
            telephone: user.telephone,
            prenom: user.prenom,
            code: otp,
            purpose: 'VERIFICATION',
          });
          if (!delivery.delivered) {
            res.status(502).json({
              error: delivery.error || "Impossible d'envoyer le code de validation pour le moment.",
            });
            return;
          }
          res.status(403).json({
            error: 'Compte en attente de validation. Saisissez le code OTP envoyé à votre contact enregistré.',
            needsVerification: true,
            identifier: user.email,
          });
          return;
        }
      }

      if (user.role === 'COACH') {
        const gate = await checkCoachAccessGate(user.id);
        if (gate.blocked) {
          await logAccess(user.id, 'COACH', null, 'CONNEXION_BLOQUEE_DOSSIER', `verification:${gate.verificationStatus}`);
          const gateDetails = await buildCoachGateDetails(user.id, gate);
          res.status(403).json({
            error: gate.message,
            pendingAdminReview: true,
            verificationStatus: gate.verificationStatus,
            rejectionReason: gate.rejectionReason,
            ...gateDetails,
          });
          return;
        }
      }

      const sessionToken = await createSessionForUser(req, res, user.id);
      res.json({ user: mapUserPublic(user), sessionToken });
    })
  );

  app.post(
    '/api/auth/request-otp',
    authLimiter,
    otpLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      if (!isOtpDeliveryConfigured()) {
        res.status(503).json({
          error:
            "Aucun service d'envoi Email/SMS (OTP) n'est configuré sur le serveur. Utilisez votre mot de passe ou contactez l'administration.",
        });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const identifier = sanitizeText(body.identifier, 120);
      const portal = body.portal === 'admin' ? 'admin' : 'public';
      const rawPurpose = sanitizeText(body.purpose, 30).toUpperCase();
      const purpose =
        rawPurpose === 'REINITIALISATION'
          ? 'REINITIALISATION'
          : rawPurpose === 'VERIFICATION'
            ? 'VERIFICATION'
            : 'CONNEXION';

      if (identifier.length < 3) {
        res.status(400).json({ error: 'Identifiant invalide.' });
        return;
      }

      const user = await dbGet<{ id: number; email: string; telephone: string; prenom: string; role: UserRole }>(
        "SELECT id, email, telephone, prenom, role FROM users WHERE (LOWER(email) = LOWER(?) OR telephone = ?) AND statut != 'CLOTURE'",
        identifier,
        normalizePhone(identifier)
      );

      if (!user) {
        res.status(404).json({
          error: "Ces identifiants n'existent pas sur Terrain+. Veuillez créer un compte.",
          accountNotFound: true,
        });
        return;
      }
      if (portal !== 'admin' && user.role === 'ADMIN') {
        res.status(403).json({ error: "Ce compte ne peut pas se connecter depuis l'espace public." });
        return;
      }
      if (portal === 'admin' && user.role !== 'ADMIN') {
        res.status(403).json({ error: "Accès réservé exclusivement aux comptes administrateur." });
        return;
      }
      const otp = generateOtpCode();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await dbRun(
        'UPDATE users SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?',
        hashToken(otp),
        otpExpires,
        user.id
      );

      const delivery = await deliverOtpCode({
        email: user.email,
        telephone: user.telephone,
        prenom: user.prenom,
        code: otp,
        purpose,
      });

      if (!delivery.delivered) {
        res.status(502).json({
          error: delivery.error || "Impossible d'envoyer le code OTP pour le moment.",
        });
        return;
      }

      res.json({
        ok: true,
        channel: delivery.channel,
        message: 'Code à usage unique envoyé à votre contact enregistré (valable 15 minutes).',
      });
    })
  );

  app.post(
    '/api/auth/login-otp',
    authLimiter,
    otpLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const identifier = sanitizeText(body.identifier, 120);
      const code = sanitizeText(body.code, 12).replace(/\s+/g, '');
      const portal = body.portal === 'admin' ? 'admin' : 'public';
      if (identifier.length < 3 || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: 'Identifiant et code OTP à 6 chiffres requis.' });
        return;
      }

      const user = await dbGet<
        AuthedUserRow & { otp_code_hash: string | null; otp_expires_at: string | null; otp_attempts: number }
      >(
        "SELECT * FROM users WHERE (LOWER(email) = LOWER(?) OR telephone = ?) AND statut != 'CLOTURE'",
        identifier,
        normalizePhone(identifier)
      );

      if (user && portal !== 'admin' && user.role === 'ADMIN') {
        res.status(403).json({ error: "Ce compte ne peut pas se connecter depuis l'espace public." });
        return;
      }
      if (user && portal === 'admin' && user.role !== 'ADMIN') {
        res.status(403).json({ error: "Accès réservé exclusivement aux comptes administrateur." });
        return;
      }

      if (!user || !user.otp_code_hash || !user.otp_expires_at) {
        res.status(401).json({ error: 'Code invalide ou expiré.' });
        return;
      }
      if (user.otp_attempts >= 5) {
        await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
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
          await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
          res.status(429).json({ error: 'Code incorrect. Limite atteinte, demandez un nouveau code OTP.' });
          return;
        }
        await dbRun('UPDATE users SET otp_attempts = ? WHERE id = ?', nextAttempts, user.id);
        res.status(401).json({ error: 'Code incorrect ou expiré.' });
        return;
      }

      const coachGate = user.role === 'COACH' ? await checkCoachAccessGate(user.id) : null;
      const nextStatusExpr = coachGate?.blocked
        ? 'statut'
        : "CASE WHEN statut = 'INSCRIT' THEN 'ACTIF' ELSE statut END";

      await dbRun(
        `UPDATE users
         SET verified = 1,
             statut = ${nextStatusExpr},
             otp_code_hash = NULL,
             otp_expires_at = NULL,
             otp_attempts = 0,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE id = ?`,
        user.id
      );

      if (coachGate?.blocked) {
        await logAccess(user.id, 'COACH', null, 'CONNEXION_OTP_BLOQUEE_DOSSIER', `verification:${coachGate.verificationStatus}`);
        const gateDetails = await buildCoachGateDetails(user.id, coachGate);
        res.status(403).json({
          error: coachGate.message,
          pendingAdminReview: true,
          verificationStatus: coachGate.verificationStatus,
          rejectionReason: coachGate.rejectionReason,
          ...gateDetails,
        });
        return;
      }

      const sessionToken = await createSessionForUser(req, res, user.id);
      const refreshed = await dbGet<AuthedUserRow>(
        'SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?',
        user.id
      );
      if (!refreshed) {
        res.status(500).json({ error: 'Erreur lors de la récupération du compte.' });
        return;
      }
      res.json({ user: mapUserPublic(refreshed), sessionToken });
    })
  );

  app.post(
    '/api/auth/reset-password',
    authLimiter,
    otpLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const identifier = sanitizeText(body.identifier, 120);
      const code = sanitizeText(body.code, 12).replace(/\s+/g, '');
      const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

      if (identifier.length < 3 || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: 'Identifiant et code OTP à 6 chiffres requis.' });
        return;
      }
      if (!isStrongPassword(newPassword)) {
        res.status(400).json({
          error: 'Le nouveau mot de passe doit contenir entre 8 et 128 caractères avec des lettres et des chiffres.',
        });
        return;
      }

      const user = await dbGet<
        AuthedUserRow & { otp_code_hash: string | null; otp_expires_at: string | null; otp_attempts: number }
      >(
        "SELECT * FROM users WHERE (LOWER(email) = LOWER(?) OR telephone = ?) AND statut != 'CLOTURE'",
        identifier,
        normalizePhone(identifier)
      );

      if (!user || !user.otp_code_hash || !user.otp_expires_at) {
        res.status(400).json({ error: 'Aucun code OTP actif pour cet identifiant. Demandez un nouveau code.' });
        return;
      }
      if (user.otp_attempts >= 5) {
        await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
        res.status(429).json({ error: 'Trop de codes incorrects. Demandez un nouveau code OTP.' });
        return;
      }
      if (new Date(user.otp_expires_at).getTime() < Date.now()) {
        res.status(400).json({ error: 'Code expiré. Demandez un nouveau code OTP.' });
        return;
      }
      if (!verifyTokenHash(code, user.otp_code_hash)) {
        const nextAttempts = user.otp_attempts + 1;
        if (nextAttempts >= 5) {
          await dbRun('UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', user.id);
          res.status(429).json({ error: 'Code incorrect. Limite atteinte, demandez un nouveau code OTP.' });
          return;
        }
        await dbRun('UPDATE users SET otp_attempts = ? WHERE id = ?', nextAttempts, user.id);
        res.status(400).json({ error: 'Code OTP incorrect.' });
        return;
      }

      const coachGate = user.role === 'COACH' ? await checkCoachAccessGate(user.id) : null;
      const nextStatusExpr = coachGate?.blocked
        ? 'statut'
        : "CASE WHEN statut = 'INSCRIT' THEN 'ACTIF' ELSE statut END";

      await dbTransaction(async (tx) => {
        await tx.run(
          `UPDATE users
           SET password_hash = ?,
               verified = 1,
               statut = ${nextStatusExpr},
               otp_code_hash = NULL,
               otp_expires_at = NULL,
               otp_attempts = 0,
               failed_login_attempts = 0,
               locked_until = NULL
           WHERE id = ?`,
          hashPassword(newPassword),
          user.id
        );
        await tx.run('DELETE FROM sessions WHERE user_id = ?', user.id);
        await logAccess(user.id, user.role, null, 'REINITIALISATION_MOT_DE_PASSE', 'otp_valide', tx);
      });

      if (coachGate?.blocked) {
        const gateDetails = await buildCoachGateDetails(user.id, coachGate);
        res.status(403).json({
          error: `Mot de passe mis à jour. ${coachGate.message}`,
          passwordReset: true,
          pendingAdminReview: true,
          verificationStatus: coachGate.verificationStatus,
          rejectionReason: coachGate.rejectionReason,
          ...gateDetails,
        });
        return;
      }

      const sessionToken = await createSessionForUser(req, res, user.id);
      const refreshed = await dbGet<AuthedUserRow>(
        'SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?',
        user.id
      );
      if (!refreshed) {
        res.status(500).json({ error: 'Erreur lors de la récupération du compte.' });
        return;
      }
      res.json({
        user: mapUserPublic(refreshed),
        sessionToken,
        message: 'Mot de passe réinitialisé avec succès.',
      });
    })
  );

  app.post(
    '/api/auth/coach-resubmit',
    authLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const resubmitToken = typeof body.resubmit_token === 'string' ? body.resubmit_token.trim() : '';
      const verifiedToken = verifyScopedActionToken(resubmitToken, 'coach_resubmit');
      if (!verifiedToken) {
        res.status(401).json({
          error: 'Session de resoumission expirée ou invalide. Reconnectez-vous pour relancer la correction de votre dossier.',
        });
        return;
      }

      const user = await dbGet<AuthedUserRow>(
        'SELECT id, nom, prenom, telephone, email, role, date_naissance, langue, statut, is_minor, verified FROM users WHERE id = ?',
        verifiedToken.userId
      );
      if (!user || user.role !== 'COACH' || user.statut === 'CLOTURE') {
        res.status(403).json({ error: 'Compte coach introuvable ou clôturé.' });
        return;
      }

      const coachRow = await dbGet<{ verification_status: string }>(
        'SELECT verification_status FROM coaches WHERE user_id = ?',
        user.id
      );
      if (!coachRow || coachRow.verification_status !== 'REFUSE') {
        res.status(400).json({ error: "Votre dossier coach n'est pas en attente de correction (statut non refusé)." });
        return;
      }

      const specialite = sanitizeText(body.specialite, 120);
      const qualification = sanitizeText(body.qualification, 140);
      const zone = sanitizeText(body.zone, 80);
      const diplomaTypeRaw = sanitizeText(body.diploma_type, 50).toUpperCase() as DiplomaTypeCode;
      const issuingOrganism = sanitizeText(body.issuing_organism, 120);
      const diplomaNumber = sanitizeText(body.diploma_number, 60);
      const issueYear = Number(body.issue_year);
      const diplomaFile = (body.diploma_file || null) as { name?: unknown; base64?: unknown } | null;

      const proCardNumber = sanitizeText(body.pro_card_number, 60);
      const proCardExpiry = sanitizeText(body.pro_card_expiry, 20);
      const rcProInsurer = sanitizeText(body.rc_pro_insurer, 100);
      const rcProPolicyNumber = sanitizeText(body.rc_pro_policy_number, 60);
      const legalStatusRaw = sanitizeText(body.legal_status, 40).toUpperCase();
      const businessRegNumber = sanitizeText(body.business_reg_number, 60);
      const honorabilityAttested = Boolean(body.honorability_attested);

      if (!specialite || !qualification || !zone) {
        res.status(400).json({ error: 'Spécialité, qualification et zone d’intervention sont obligatoires.' });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(SPORT_DIPLOMA_FORMATS, diplomaTypeRaw)) {
        res.status(400).json({ error: 'Veuillez sélectionner un format officiel de diplôme sportif.' });
        return;
      }
      if (!issuingOrganism || issuingOrganism.length < 2 || !diplomaNumber || diplomaNumber.length < 4) {
        res.status(400).json({ error: 'Organisme émetteur et numéro de diplôme ou licence requis.' });
        return;
      }
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(issueYear) || issueYear < 1980 || issueYear > currentYear) {
        res.status(400).json({ error: `Année d'obtention invalide (attendue entre 1980 et ${currentYear}).` });
        return;
      }
      if (!proCardNumber || proCardNumber.length < 4) {
        res.status(400).json({ error: "Le numéro de carte professionnelle d'éducateur sportif est obligatoire." });
        return;
      }
      const proCardExpiryDate = proCardExpiry ? new Date(proCardExpiry) : null;
      if (!proCardExpiryDate || Number.isNaN(proCardExpiryDate.getTime()) || proCardExpiryDate.getTime() <= Date.now()) {
        res.status(400).json({ error: 'La date de validité de la carte professionnelle doit être valide et non expirée.' });
        return;
      }
      if (!rcProInsurer || rcProInsurer.length < 2 || !rcProPolicyNumber || rcProPolicyNumber.length < 4) {
        res.status(400).json({ error: 'L’assureur et le numéro de police RC Pro sont obligatoires.' });
        return;
      }
      if (!COACH_LEGAL_STATUS_OPTIONS.some((o) => o.code === legalStatusRaw)) {
        res.status(400).json({ error: 'Veuillez sélectionner un statut juridique d’exercice valide.' });
        return;
      }
      if (!businessRegNumber || businessRegNumber.length < 5) {
        res.status(400).json({ error: 'Le numéro SIRET, NINEA, RCCM ou RNA est obligatoire (5 caractères min.).' });
        return;
      }
      if (!honorabilityAttested) {
        res.status(400).json({ error: "L'attestation sur l'honneur d'honorabilité est obligatoire." });
        return;
      }

      let fileBuffer: Buffer | null = null;
      let originalFilename = 'diplome_coach';
      if (diplomaFile && typeof diplomaFile.base64 === 'string' && diplomaFile.base64.trim()) {
        const rawBase64 = diplomaFile.base64.includes(',')
          ? diplomaFile.base64.split(',').slice(1).join(',')
          : diplomaFile.base64;
        fileBuffer = Buffer.from(rawBase64.replace(/\s+/g, ''), 'base64');
        if (fileBuffer.length < 400 || fileBuffer.length > MAX_DIPLOMA_FILE_BYTES) {
          res.status(400).json({ error: 'Le fichier diplôme est invalide ou dépasse la limite autorisée de 3 Mo.' });
          return;
        }
        const detectedMime = detectMimeFromMagicBytes(fileBuffer);
        if (!detectedMime) {
          res.status(400).json({ error: 'Format binaire non reconnu. Envoyez un fichier PDF, JPG, PNG ou WEBP.' });
          return;
        }
        originalFilename = sanitizeText(diplomaFile.name, 120) || 'diplome_coach';
      }

      const latestDoc = fileBuffer
        ? null
        : await dbGet<{
            original_filename: string;
            stored_filename: string;
            mime_type: string;
            file_size_bytes: number;
            sha256_hash: string;
          }>(
            `SELECT original_filename, stored_filename, mime_type, file_size_bytes, sha256_hash
             FROM coach_documents
             WHERE coach_user_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            user.id
          );

      if (!fileBuffer && !latestDoc) {
        res.status(400).json({
          error: 'Aucun justificatif existant trouvé : veuillez joindre votre diplôme (PDF, JPG, PNG ou WEBP).',
        });
        return;
      }

      const docRes = await dbTransaction(async (tx) => {
        await tx.run(
          `UPDATE coaches
           SET specialite = ?,
               qualification = ?,
               zone = ?,
               pro_card_number = ?,
               pro_card_expiry = ?,
               rc_pro_insurer = ?,
               rc_pro_policy_number = ?,
               legal_status = ?,
               business_reg_number = ?,
               honorability_attested = ?,
               verification_status = 'EN_ATTENTE',
               rejection_reason = NULL
           WHERE user_id = ?`,
          specialite,
          qualification,
          zone,
          proCardNumber,
          proCardExpiry,
          rcProInsurer,
          rcProPolicyNumber,
          legalStatusRaw,
          businessRegNumber,
          1,
          user.id
        );

        const nextDoc = fileBuffer
          ? await storeCoachDiplomaDocument(
              {
                coachUserId: user.id,
                diplomaType: diplomaTypeRaw,
                issuingOrganism,
                diplomaNumber,
                issueYear,
                specialite,
                qualification,
                originalFilename,
                buffer: fileBuffer,
                proCardNumber,
                proCardExpiry,
                rcProInsurer,
                rcProPolicyNumber,
                legalStatus: legalStatusRaw,
                businessRegNumber,
                honorabilityAttested,
              },
              tx
            )
          : await storeCoachDocumentMetadataRevision(
              {
                coachUserId: user.id,
                diplomaType: diplomaTypeRaw,
                issuingOrganism,
                diplomaNumber,
                issueYear,
                specialite,
                qualification,
                existingOriginalFilename: latestDoc!.original_filename,
                existingStoredFilename: latestDoc!.stored_filename,
                existingMimeType: latestDoc!.mime_type,
                existingFileSizeBytes: Number(latestDoc!.file_size_bytes),
                existingSha256Hash: latestDoc!.sha256_hash,
                proCardNumber,
                proCardExpiry,
                rcProInsurer,
                rcProPolicyNumber,
                legalStatus: legalStatusRaw,
                businessRegNumber,
                honorabilityAttested,
              },
              tx
            );

        await logAccess(
          user.id,
          'COACH',
          null,
          'RESOUMISSION_DOSSIER_COACH',
          `doc:${nextDoc.docId}:${nextDoc.studyStatus}`,
          tx
        );

        return nextDoc;
      });

      res.json({
        ok: true,
        verificationStatus: 'EN_ATTENTE',
        studyStatus: docRes.studyStatus,
        studyScore: docRes.studyScore,
        message:
          "Votre dossier corrigé a bien été resoumis. Il est de nouveau en cours d'étude par l'administrateur Terrain+.",
      });
    })
  );

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const rawToken = extractRawToken(req);
      if (rawToken) {
        await dbRun('DELETE FROM sessions WHERE token_hash = ?', hashToken(rawToken));
      }
      clearSessionCookie(req, res);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/auth/change-password',
    authLimiter,
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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

      const row = await dbGet<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', req.authUser!.id);
      if (!row || !verifyPassword(currentPassword, row.password_hash)) {
        res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
        return;
      }

      const userId = req.authUser!.id;
      await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), userId);
      await dbRun('DELETE FROM sessions WHERE user_id = ?', userId);
      const sessionToken = await createSessionForUser(req, res, userId);
      await logAccess(userId, req.authUser!.role, null, 'CHANGEMENT_MOT_DE_PASSE', 'securite_compte');
      res.json({
        ok: true,
        sessionToken,
        message: 'Mot de passe mis à jour et anciennes sessions révoquées.',
      });
    })
  );

  // ---------------- HEALTHCHECK & PUBLIC COACHES ROUTES ----------------
  app.get(
    '/api/health',
    asyncHandler(async (_req: Request, res: Response) => {
      await dbGet('SELECT 1 as ok');
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        database: USE_POSTGRES ? 'supabase_postgres' : 'sqlite_local',
        sessionSecretConfigured: Boolean((process.env.SESSION_SECRET || '').trim()),
        supabaseStorageConfigured: Boolean(getSupabaseAdmin()),
      });
    })
  );

  app.get(
    '/api/public/coaches',
    asyncHandler(async (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      res.json({ coaches: await getPublicCoachesList() });
    })
  );

  app.get(
    '/api/public/partners',
    asyncHandler(async (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      const [partners, groups, challenges] = await Promise.all([
        dbAll(
          `SELECT p.id, p.nom, p.type, p.zone,
                  COALESCE(gc.groups_count, 0) as groups_count,
                  COALESCE(mc.members_count, 0) as members_count
           FROM partners p
           LEFT JOIN (
             SELECT partner_id, COUNT(*) as groups_count
             FROM groups
             GROUP BY partner_id
           ) gc ON gc.partner_id = p.id
           LEFT JOIN (
             SELECT g.partner_id, COUNT(*) as members_count
             FROM group_memberships gm
             JOIN groups g ON g.id = gm.group_id
             GROUP BY g.partner_id
           ) mc ON mc.partner_id = p.id
           ORDER BY p.id ASC`
        ),
        dbAll(
          `SELECT g.id, g.nom, g.partner_id, p.nom as partner_nom, p.type as partner_type, p.zone,
                  g.captain_name, g.sport_code,
                  COALESCE(gm_counts.member_count, 0) as member_count
           FROM groups g
           JOIN partners p ON p.id = g.partner_id
           LEFT JOIN (
             SELECT group_id, COUNT(*) as member_count
             FROM group_memberships
             GROUP BY group_id
           ) gm_counts ON gm_counts.group_id = g.id
           ORDER BY g.id ASC`
        ),
        dbAll(
          `SELECT c.id, c.partner_id, p.nom as partner_nom, p.type as partner_type, p.zone,
                  c.titre, c.indicateur, c.periode, c.target_sessions, c.current_sessions
           FROM challenges c
           JOIN partners p ON p.id = c.partner_id
           ORDER BY c.id ASC`
        ),
      ]);

      res.json({ partners, groups, challenges });
    })
  );

  app.post(
    '/api/public/partner-requests',
    asyncHandler(async (req: Request, res: Response) => {
      const ip = getClientIp(req);
      const rl = await checkRateLimitDistributed(`partner_req:${ip}`, 10, 15 * 60 * 1000);
      applyRateLimitHeaders(res, 10, rl);
      if (!rl.allowed) {
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

      await dbRun(
        `INSERT INTO partner_requests (
          organisation, type, zone, contact_nom, contact_telephone, contact_email,
          sport_principal, nombre_athletes_estime, pack_souhaite, message, statut
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOUVELLE')`,
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
    })
  );

  // ---------------- ATHLETE ROUTES ----------------
  app.get(
    '/api/athlete/workspace',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const data = await buildAthleteWorkspace(req.authUser!.id);
      if (!data) {
        res.status(404).json({ error: 'Profil athlète introuvable.' });
        return;
      }
      res.json(data);
    })
  );

  app.post(
    '/api/athlete/complete-session',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const scheduledId = body.scheduled_id !== undefined && body.scheduled_id !== null ? parsePositiveIntId(body.scheduled_id) : null;
      const sessionId = body.session_id !== undefined && body.session_id !== null ? parsePositiveIntId(body.session_id) : null;
      const fatigue = Number(body.ressenti_fatigue);
      const difficulte = Number(body.difficulte);
      const rawSleep = body.qualite_sommeil;
      const sommeil =
        rawSleep !== undefined && rawSleep !== null && rawSleep !== '' ? Number(rawSleep) : null;

      if (
        !Number.isInteger(fatigue) || fatigue < 1 || fatigue > 10 ||
        !Number.isInteger(difficulte) || difficulte < 1 || difficulte > 10 ||
        (sommeil !== null && (!Number.isInteger(sommeil) || sommeil < 1 || sommeil > 10))
      ) {
        res.status(400).json({ error: 'Les notes de ressenti et difficulté doivent être comprises entre 1 et 10.' });
        return;
      }

      const userId = req.authUser!.id;
      if (scheduledId) {
        const owned = await dbGet('SELECT id FROM scheduled_sessions WHERE id = ? AND athlete_user_id = ?', scheduledId, userId);
        if (!owned) {
          res.status(403).json({ error: 'Séance non autorisée.' });
          return;
        }
        await dbRun(
          `UPDATE scheduled_sessions
           SET completed = 1, ressenti_fatigue = ?, difficulte = ?, qualite_sommeil = ?, completed_at = datetime('now')
           WHERE id = ?`,
          fatigue,
          difficulte,
          sommeil,
          scheduledId
        );
      } else if (sessionId) {
        const validLibSession = await dbGet("SELECT id FROM sessions_library WHERE id = ? AND validation_status = 'VALIDEE'", sessionId);
        if (!validLibSession) {
          res.status(400).json({ error: 'Séance introuvable ou non validée.' });
          return;
        }
        const plan = await dbGet<{ id: number }>('SELECT id FROM program_plans WHERE athlete_user_id = ? ORDER BY id DESC LIMIT 1', userId);
        if (plan) {
          const day = ((new Date().getDay() + 6) % 7) + 1;
          await dbRun(
            `INSERT INTO scheduled_sessions (
              program_id, athlete_user_id, session_id, jour_semaine, date_prevue,
              is_rest_day, completed, ressenti_fatigue, difficulte, qualite_sommeil, completed_at
            ) VALUES (?, ?, ?, ?, date('now'), 0, 1, ?, ?, ?, datetime('now'))`,
            plan.id,
            userId,
            sessionId,
            day,
            fatigue,
            difficulte,
            sommeil
          );
        }
      } else {
        res.status(400).json({ error: 'Identifiant de séance requis.' });
        return;
      }

      // Increment collective challenge counter only for partner structures the athlete belongs to
      await dbRun(
        `UPDATE challenges
         SET current_sessions = current_sessions + 1
         WHERE partner_id IN (
           SELECT DISTINCT g.partner_id
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
           WHERE gm.user_id = ?
         )`,
        userId
      );
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/athlete/evaluations',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const values = body.values as Record<string, number> | undefined;
      if (!values || typeof values !== 'object') {
        res.status(400).json({ error: 'Valeurs des tests requises.' });
        return;
      }

      const userId = req.authUser!.id;
      const profile = await dbGet<{ sport_code: SportCode; niveau: AthleteLevel }>(
        'SELECT sport_code, niveau FROM athlete_profiles WHERE user_id = ?',
        userId
      );
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

      const prevRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM evaluations WHERE athlete_user_id = ?', userId);
      const prevCount = Number(prevRow?.c || 0);
      const evalType = prevCount === 0 ? 'INITIALE' : 'PERIODIQUE';
      const scoreGlobal = Math.round(totalScore / sportConf.tests.length);

      await dbRun(
        `INSERT INTO evaluations (athlete_user_id, type, sport_code, date, score_global, results_json)
         VALUES (?, ?, ?, date('now'), ?, ?)`,
        userId,
        evalType,
        profile.sport_code,
        scoreGlobal,
        JSON.stringify(results)
      );

      await dbRun("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'", userId);
      res.status(201).json({ score_global: scoreGlobal, results, type: evalType });
    })
  );

  app.post(
    '/api/athlete/weight',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const poids = Number((req.body as Record<string, unknown>).poids_kg);
      if (!Number.isFinite(poids) || poids < 30 || poids > 220) {
        res.status(400).json({ error: 'Poids invalide (entre 30 et 220 kg).' });
        return;
      }
      await dbRun(
        "INSERT INTO weight_logs (athlete_user_id, poids_kg, date) VALUES (?, ?, date('now'))",
        req.authUser!.id,
        Number(poids.toFixed(1))
      );
      res.status(201).json({ ok: true });
    })
  );

  app.patch(
    '/api/athlete/profile',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const userId = req.authUser!.id;

      const nom = sanitizeText(body.nom, 80);
      const prenom = sanitizeText(body.prenom, 80);
      const langue = body.langue === 'wo' ? 'wo' : 'fr';
      const niveau = sanitizeText(body.niveau, 20) as AthleteLevel;
      const poste = sanitizeText(body.poste, 60);
      const rawObjectiveInput = sanitizeText(body.objectif_code || body.objectif, 120);
      const adaptProgram = Boolean(body.adapt_program);
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

      const existingProf = await dbGet<{ sport_code: SportCode; objectif: string | null }>(
        'SELECT sport_code, objectif FROM athlete_profiles WHERE user_id = ?',
        userId
      );
      const sportForLabel = existingProf?.sport_code || 'football';
      const nextObjectiveLabel = rawObjectiveInput
        ? buildAthleteObjectiveLabel(resolveObjectiveSpec(rawObjectiveInput).code, SPORTS_CONFIG[sportForLabel].nom)
        : existingProf?.objectif || null;

      await dbRun('UPDATE users SET nom = ?, prenom = ?, langue = ? WHERE id = ?', nom, prenom, langue, userId);
      await dbRun(
        `UPDATE athlete_profiles
         SET niveau = ?, poste = ?, objectif = ?, taille_cm = ?, eco_data_mode = ?, notifications_enabled = ?,
             reminder_time = COALESCE(?, reminder_time),
             reminder_lead_minutes = COALESCE(?, reminder_lead_minutes)
         WHERE user_id = ?`,
        niveau,
        poste || null,
        nextObjectiveLabel,
        taille_cm,
        eco_data_mode,
        notifications_enabled,
        reminder_time ?? null,
        reminder_lead_minutes ?? null,
        userId
      );

      if (adaptProgram && nextObjectiveLabel && existingProf) {
        const coach = await dbGet<{ coach_user_id: number }>(
          "SELECT coach_user_id FROM assignments WHERE athlete_user_id = ? AND statut = 'ACTIF' LIMIT 1",
          userId
        );
        await buildDefaultScheduleForAthlete(
          userId,
          existingProf.sport_code,
          niveau,
          coach ? coach.coach_user_id : null,
          nextObjectiveLabel
        );
      }

      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/athlete/reminders',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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

      await dbRun(
        `UPDATE athlete_profiles
         SET notifications_enabled = ?, reminder_time = ?, reminder_lead_minutes = ?
         WHERE user_id = ?`,
        notifications_enabled,
        reminder_time,
        reminder_lead_minutes,
        userId
      );

      res.json({
        ok: true,
        notifications_enabled: Boolean(notifications_enabled),
        reminder_time,
        reminder_lead_minutes,
      });
    })
  );

  app.post(
    '/api/athlete/change-sport',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const sportCode = sanitizeText(body.sport_code, 20) as SportCode;
      if (!VALID_SPORT_CODES.includes(sportCode)) {
        res.status(400).json({ error: 'Sport invalide.' });
        return;
      }
      const userId = req.authUser!.id;
      await dbTransaction(async (tx) => {
        const prof = await tx.get<{ niveau: AthleteLevel; objectif: string | null }>(
          'SELECT niveau, objectif FROM athlete_profiles WHERE user_id = ?',
          userId
        );
        const coach = await tx.get<{ coach_user_id: number }>(
          "SELECT coach_user_id FROM assignments WHERE athlete_user_id = ? AND statut = 'ACTIF' LIMIT 1",
          userId
        );

        const rawGoal = sanitizeText(body.objectif_code, 120) || prof?.objectif || 'PERFORMANCE';
        const goalLabel = buildAthleteObjectiveLabel(resolveObjectiveSpec(rawGoal).code, SPORTS_CONFIG[sportCode].nom);

        await tx.run(
          'UPDATE athlete_profiles SET sport_code = ?, poste = NULL, objectif = ? WHERE user_id = ?',
          sportCode,
          goalLabel,
          userId
        );
        await buildDefaultScheduleForAthlete(
          userId,
          sportCode,
          prof ? prof.niveau : 'debutant',
          coach ? coach.coach_user_id : null,
          goalLabel,
          tx
        );
      });
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/athlete/select-plan',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const rawPlan = sanitizeText(body.plan_tier, 20).toUpperCase();
      const coachUserId = body.coach_user_id ? Number(body.coach_user_id) : null;
      const confirmPlan = Boolean(body.confirm_plan);

      if (!['ESSENTIEL', 'COACH_PRIVE'].includes(rawPlan)) {
        res.status(400).json({ error: 'Formule invalide (ESSENTIEL ou COACH_PRIVE).' });
        return;
      }
      const planTier = rawPlan as 'ESSENTIEL' | 'COACH_PRIVE';

      if (planTier !== 'ESSENTIEL' && !confirmPlan) {
        res.status(400).json({ error: 'Veuillez confirmer la formule sélectionnée.' });
        return;
      }

      let validCoach: { id: number; prenom: string; nom: string; commission_pct: number } | null = null;
      if (planTier === 'COACH_PRIVE') {
        if (!coachUserId || !Number.isInteger(coachUserId) || coachUserId <= 0) {
          res.status(400).json({ error: 'Choisissez un coach vérifié pour activer Suivi Coach.' });
          return;
        }
        const coachRow = await dbGet<{ id: number; prenom: string; nom: string; commission_pct: number }>(
          `SELECT u.id, u.prenom, u.nom, COALESCE(c.commission_pct, 20) as commission_pct
           FROM users u
           JOIN coaches c ON c.user_id = u.id
           WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`,
          coachUserId
        );
        if (!coachRow) {
          res.status(404).json({ error: 'Coach introuvable ou indisponible.' });
          return;
        }
        validCoach = coachRow;
      }

      const athleteId = req.authUser!.id;
      const planFee = planTier === 'COACH_PRIVE' ? 5000 : 0;

      await dbTransaction(async (tx) => {
        if (validCoach) {
          await tx.run("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'", athleteId);
          await tx.run(
            "INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')",
            validCoach.id,
            athleteId
          );
          await tx.run('UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?', validCoach.id, athleteId);
          await tx.run(
            `UPDATE athlete_profiles
             SET plan_tier = 'COACH_PRIVE',
                 plan_fee_fcfa = 5000,
                 plan_billing_cycle = 'MENSUEL',
                 coach_subscription_status = 'ACTIF_5000',
                 coach_monthly_fee_fcfa = 5000,
                 coach_subscribed_at = datetime('now')
             WHERE user_id = ?`,
            athleteId
          );
          await tx.run("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'", athleteId);
          const commissionPct = Number(validCoach.commission_pct ?? 20);
          const platformShare = Math.round((5000 * commissionPct) / 100);
          const coachShare = Math.max(0, 5000 - platformShare);
          await tx.run(
            `INSERT INTO payment_transactions (
              user_id, coach_user_id, category, label, amount_fcfa, platform_share_fcfa, coach_share_fcfa, payment_method, status
            ) VALUES (?, ?, 'COACH_PRIVATE_FEE', ?, 5000, ?, ?, 'WAVE', 'PAYE')`,
            athleteId,
            validCoach.id,
            `Suivi Coach (${validCoach.prenom} ${validCoach.nom})`,
            platformShare,
            coachShare
          );
        } else {
          await tx.run("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'", athleteId);
          await tx.run('UPDATE program_plans SET coach_user_id = NULL WHERE athlete_user_id = ?', athleteId);
          await tx.run(
            `UPDATE athlete_profiles
             SET plan_tier = 'ESSENTIEL',
                 plan_fee_fcfa = 0,
                 plan_billing_cycle = 'MENSUEL',
                 coach_subscription_status = 'GRATUIT_BASE',
                 coach_monthly_fee_fcfa = 0,
                 coach_subscribed_at = NULL
             WHERE user_id = ?`,
            athleteId
          );
        }

        await logAccess(athleteId, 'ATHLETE', athleteId, `CHANGEMENT_FORMULE_${planTier}`, `fee:${planFee}`, tx);
      });

      res.json({
        ok: true,
        plan_tier: planTier,
        plan_fee_fcfa: planFee,
        message:
          planTier === 'COACH_PRIVE' && validCoach
            ? `Formule Suivi Coach activée avec ${validCoach.prenom} ${validCoach.nom} (5 000 FCFA / mois).`
            : 'Vous êtes sur l’accès Essentiel 100 % gratuit (0 FCFA).',
      });
    })
  );

  app.post(
    '/api/athlete/select-coach',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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

      const coach = await dbGet<{ id: number; prenom: string; nom: string; commission_pct: number }>(
        `SELECT u.id, u.prenom, u.nom, COALESCE(c.commission_pct, 20) as commission_pct
         FROM users u
         JOIN coaches c ON c.user_id = u.id
         WHERE u.id = ? AND u.role = 'COACH' AND u.statut != 'CLOTURE' AND u.verified = 1 AND c.verification_status = 'VERIFIE'`,
        coachUserId
      );

      if (!coach) {
        res.status(404).json({ error: 'Coach introuvable ou indisponible.' });
        return;
      }

      const athleteId = req.authUser!.id;
      const commissionPct = Number(coach.commission_pct ?? 20);
      const platformShare = Math.round((5000 * commissionPct) / 100);
      const coachShare = Math.max(0, 5000 - platformShare);

      await dbTransaction(async (tx) => {
        await tx.run("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'", athleteId);
        await tx.run(
          "INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')",
          coachUserId,
          athleteId
        );
        await tx.run('UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?', coachUserId, athleteId);
        await tx.run(
          `UPDATE athlete_profiles
           SET plan_tier = 'COACH_PRIVE',
               plan_fee_fcfa = 5000,
               plan_billing_cycle = 'MENSUEL',
               coach_subscription_status = 'ACTIF_5000',
               coach_monthly_fee_fcfa = 5000,
               coach_subscribed_at = datetime('now')
           WHERE user_id = ?`,
          athleteId
        );
        await tx.run("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'", athleteId);
        await tx.run(
          `INSERT INTO payment_transactions (
            user_id, coach_user_id, category, label, amount_fcfa, platform_share_fcfa, coach_share_fcfa, payment_method, status
          ) VALUES (?, ?, 'COACH_PRIVATE_FEE', ?, 5000, ?, ?, 'WAVE', 'PAYE')`,
          athleteId,
          coachUserId,
          `Suivi Coach (${coach.prenom} ${coach.nom})`,
          platformShare,
          coachShare
        );

        const hasConsent = await tx.get("SELECT id FROM consents WHERE user_id = ? AND type = 'COACH_PRIVILEGE_5000'", athleteId);
        if (!hasConsent) {
          await tx.run("INSERT INTO consents (user_id, type, version) VALUES (?, 'COACH_PRIVILEGE_5000', 'v1.0')", athleteId);
        }
        await logAccess(athleteId, 'ATHLETE', athleteId, 'SELECTION_COACH_5000', `coach:${coachUserId}`, tx);
      });

      res.json({
        ok: true,
        message: `Suivi activé avec ${coach.prenom} ${coach.nom} (Privilège Jeunes · 5 000 FCFA / mois).`,
      });
    })
  );

  app.post(
    '/api/athlete/cancel-coach',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const athleteId = req.authUser!.id;
      await dbTransaction(async (tx) => {
        await tx.run("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'", athleteId);
        await tx.run('UPDATE program_plans SET coach_user_id = NULL WHERE athlete_user_id = ?', athleteId);
        await tx.run(
          `UPDATE athlete_profiles
           SET plan_tier = 'ESSENTIEL',
               plan_fee_fcfa = 0,
               plan_billing_cycle = 'MENSUEL',
               coach_subscription_status = 'GRATUIT_BASE',
               coach_monthly_fee_fcfa = 0,
               coach_subscribed_at = NULL
           WHERE user_id = ?`,
          athleteId
        );
        await logAccess(athleteId, 'ATHLETE', athleteId, 'RETOUR_BASE_GRATUITE', 'coach_suivi_desactive', tx);
      });

      res.json({
        ok: true,
        message: 'Vous êtes repassé sur l’accès Essentiel 100 % gratuit. Votre programme et vos tests restent actifs.',
      });
    })
  );

  app.post(
    '/api/athlete/request-coach-change',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const motif = sanitizeText((req.body as Record<string, unknown>).motif, 300) || 'Demande de réaffectation de coach';
      await dbRun(`INSERT INTO alerts (athlete_user_id, type, message) VALUES (?, 'CHANGEMENT_COACH', ?)`, req.authUser!.id, motif);
      res.status(201).json({ ok: true });
    })
  );

  app.get(
    '/api/athlete/messages',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const athleteId = req.authUser!.id;
      const activeCoach = await dbGet<{ coach_user_id: number }>(
        "SELECT coach_user_id FROM assignments WHERE athlete_user_id = ? AND statut = 'ACTIF' LIMIT 1",
        athleteId
      );
      if (!activeCoach) {
        res.json({ messages: [], unreadCount: 0 });
        return;
      }
      const rows = await dbAll<Record<string, unknown>>(
        `SELECT cm.*, (u.prenom || ' ' || u.nom) as sender_nom
         FROM coach_messages cm
         JOIN users u ON u.id = cm.sender_user_id
         WHERE cm.athlete_user_id = ? AND cm.coach_user_id = ?
         ORDER BY cm.id ASC
         LIMIT 100`,
        athleteId,
        activeCoach.coach_user_id
      );
      const messages = rows.map((m) => ({
        id: Number(m.id),
        athlete_user_id: Number(m.athlete_user_id),
        coach_user_id: Number(m.coach_user_id),
        sender_user_id: Number(m.sender_user_id),
        sender_role: String(m.sender_role) as 'ATHLETE' | 'COACH',
        sender_nom: String(m.sender_nom),
        body: String(m.body),
        read_by_athlete: Boolean(m.read_by_athlete),
        read_by_coach: Boolean(m.read_by_coach),
        created_at: String(m.created_at),
      }));
      const unreadCount = messages.filter((m) => m.sender_role === 'COACH' && !m.read_by_athlete).length;
      res.json({ messages, unreadCount });
    })
  );

  app.post(
    '/api/athlete/messages',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const athleteId = req.authUser!.id;
      const bodyText = sanitizeText((req.body as Record<string, unknown>).body, 1000);
      if (!bodyText) {
        res.status(400).json({ error: 'Le message ne peut pas être vide.' });
        return;
      }
      const activeCoach = await dbGet<{ coach_user_id: number }>(
        "SELECT coach_user_id FROM assignments WHERE athlete_user_id = ? AND statut = 'ACTIF' LIMIT 1",
        athleteId
      );
      if (!activeCoach) {
        res.status(400).json({ error: 'Aucun coach actif assigné pour le moment.' });
        return;
      }
      const ins = await dbRun(
        `INSERT INTO coach_messages (
          athlete_user_id, coach_user_id, sender_user_id, sender_role, body, read_by_athlete, read_by_coach
        ) VALUES (?, ?, ?, 'ATHLETE', ?, 1, 0)`,
        athleteId,
        activeCoach.coach_user_id,
        athleteId,
        bodyText
      );
      await dbRun(
        "UPDATE coach_messages SET read_by_athlete = 1 WHERE athlete_user_id = ? AND coach_user_id = ? AND sender_role = 'COACH' AND read_by_athlete = 0",
        athleteId,
        activeCoach.coach_user_id
      );
      const created = await dbGet<Record<string, unknown>>(
        `SELECT cm.*, (u.prenom || ' ' || u.nom) as sender_nom
         FROM coach_messages cm
         JOIN users u ON u.id = cm.sender_user_id
         WHERE cm.id = ?`,
        ins.lastInsertRowid
      );
      res.status(201).json({
        message: created
          ? {
              id: Number(created.id),
              athlete_user_id: Number(created.athlete_user_id),
              coach_user_id: Number(created.coach_user_id),
              sender_user_id: Number(created.sender_user_id),
              sender_role: String(created.sender_role),
              sender_nom: String(created.sender_nom),
              body: String(created.body),
              read_by_athlete: Boolean(created.read_by_athlete),
              read_by_coach: Boolean(created.read_by_coach),
              created_at: String(created.created_at),
            }
          : null,
      });
    })
  );

  app.post(
    '/api/athlete/messages/read',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      await dbRun(
        "UPDATE coach_messages SET read_by_athlete = 1 WHERE athlete_user_id = ? AND sender_role = 'COACH' AND read_by_athlete = 0",
        req.authUser!.id
      );
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/athlete/groups/:groupId/toggle',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const groupId = Number(req.params.groupId);
      if (!Number.isInteger(groupId) || groupId <= 0) {
        res.status(400).json({ error: 'Identifiant de groupe invalide.' });
        return;
      }
      const groupExists = await dbGet('SELECT id FROM groups WHERE id = ?', groupId);
      if (!groupExists) {
        res.status(404).json({ error: 'Groupe introuvable.' });
        return;
      }
      const userId = req.authUser!.id;
      const exists = await dbGet('SELECT id FROM group_memberships WHERE user_id = ? AND group_id = ?', userId, groupId);
      if (exists) {
        await dbRun('DELETE FROM group_memberships WHERE user_id = ? AND group_id = ?', userId, groupId);
        res.json({ joined: false });
      } else {
        await dbRun('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)', userId, groupId);
        res.json({ joined: true });
      }
    })
  );

  app.get(
    '/api/athlete/export',
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const data = await buildAthleteWorkspace(req.authUser!.id);
      await logAccess(req.authUser!.id, 'ATHLETE', req.authUser!.id, 'EXPORT_DONNEES', 'profil,poids,evaluations');
      res.json({
        exported_at: new Date().toISOString(),
        platform: 'Terrain+',
        domain: 'https://terrain-plus.vercel.app',
        legal_framework: 'Loi n° 2008-12 du 25 janvier 2008 (CDP Sénégal — Portabilité et accès aux données personnelles)',
        data,
      });
    })
  );

  app.delete(
    '/api/athlete/account',
    authLimiter,
    requireAuth,
    requireRole('ATHLETE'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = req.authUser!.id;
      const body = (req.body || {}) as Record<string, unknown>;
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) {
        res.status(400).json({ error: 'Saisissez votre mot de passe actuel pour confirmer la suppression du compte.' });
        return;
      }
      const row = await dbGet<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', userId);
      if (!row || !verifyPassword(password, row.password_hash)) {
        res.status(401).json({ error: 'Mot de passe incorrect : suppression annulée.' });
        return;
      }
      await dbRun('DELETE FROM users WHERE id = ?', userId);
      await logAccess(null, 'ATHLETE', null, 'SUPPRESSION_COMPTE', 'donnees_personnelles');
      clearSessionCookie(req, res);
      res.json({ ok: true });
    })
  );

  // ---------------- COACH ROUTES ----------------
  app.get(
    '/api/coach/overview',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const [athleteRows, schedStatsRows, evalScoreRows, alertsRaw, unreadMsgRows, library, coachProfile] = await Promise.all([
        dbAll<Record<string, unknown>>(
          `SELECT u.id, u.nom, u.prenom, u.statut, u.is_minor, ap.sport_code, ap.niveau
           FROM assignments a
           JOIN users u ON u.id = a.athlete_user_id
           JOIN athlete_profiles ap ON ap.user_id = u.id
           WHERE a.coach_user_id = ? AND a.statut = 'ACTIF' AND u.statut != 'CLOTURE'
           ORDER BY u.nom ASC`,
          coachId
        ),
        dbAll<{ athlete_user_id: number; planned_count: number; completed_count: number }>(
          `SELECT ss.athlete_user_id,
                  COUNT(CASE WHEN ss.is_rest_day = 0 THEN 1 END) as planned_count,
                  COUNT(CASE WHEN ss.is_rest_day = 0 AND ss.completed = 1 THEN 1 END) as completed_count
           FROM scheduled_sessions ss
           JOIN assignments a ON a.athlete_user_id = ss.athlete_user_id
           WHERE a.coach_user_id = ? AND a.statut = 'ACTIF'
           GROUP BY ss.athlete_user_id`,
          coachId
        ),
        dbAll<{ athlete_user_id: number; score_global: number }>(
          `SELECT e.athlete_user_id, e.score_global
           FROM evaluations e
           JOIN assignments a ON a.athlete_user_id = e.athlete_user_id
           WHERE a.coach_user_id = ? AND a.statut = 'ACTIF'
           ORDER BY e.athlete_user_id ASC, e.date DESC, e.id DESC`,
          coachId
        ),
        dbAll<Record<string, unknown>>(
          `SELECT al.*, (u.prenom || ' ' || u.nom) as athlete_nom, ap.sport_code as athlete_sport
           FROM alerts al
           JOIN assignments a ON a.athlete_user_id = al.athlete_user_id AND a.coach_user_id = ? AND a.statut = 'ACTIF'
           JOIN users u ON u.id = al.athlete_user_id
           JOIN athlete_profiles ap ON ap.user_id = u.id
           ORDER BY al.traitee ASC, al.date DESC`,
          coachId
        ),
        dbAll<{ athlete_user_id: number; unread_count: number }>(
          `SELECT athlete_user_id, COUNT(*) as unread_count
           FROM coach_messages
           WHERE coach_user_id = ? AND sender_role = 'ATHLETE' AND read_by_coach = 0
           GROUP BY athlete_user_id`,
          coachId
        ),
        dbAll(
          'SELECT id, sport_code, titre, niveau, duree_min, objectif, prevention_focus, relue_par, validation_status FROM sessions_library ORDER BY sport_code, id'
        ),
        dbGet<{
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
        }>(
          `SELECT specialite, qualification, zone, monthly_fee_fcfa, athlete_monthly_fee_fcfa,
                  platform_subscription_status, coach_plan, commission_pct, athlete_payout_fcfa, verification_status
           FROM coaches WHERE user_id = ?`,
          coachId
        ),
      ]);

      const schedByAthlete = new Map<number, { planned: number; completed: number }>();
      for (const s of schedStatsRows) {
        schedByAthlete.set(Number(s.athlete_user_id), {
          planned: Number(s.planned_count || 0),
          completed: Number(s.completed_count || 0),
        });
      }

      const unreadByAthlete = new Map<number, number>();
      for (const um of unreadMsgRows) {
        unreadByAthlete.set(Number(um.athlete_user_id), Number(um.unread_count || 0));
      }

      const lastEvalByAthlete = new Map<number, number>();
      for (const ev of evalScoreRows) {
        const aid = Number(ev.athlete_user_id);
        if (!lastEvalByAthlete.has(aid)) {
          lastEvalByAthlete.set(aid, Number(ev.score_global));
        }
      }

      const openAlertsByAthlete = new Map<number, { count: number; hasPain: boolean }>();
      const alerts = alertsRaw.map((row) => {
        const traitee = Boolean(row.traitee);
        if (!traitee) {
          const aid = Number(row.athlete_user_id);
          const cur = openAlertsByAthlete.get(aid) || { count: 0, hasPain: false };
          cur.count += 1;
          if (row.type === 'DOULEUR') cur.hasPain = true;
          openAlertsByAthlete.set(aid, cur);
        }
        return { ...row, traitee };
      });

      const athletes = athleteRows.map((a) => {
        const aid = Number(a.id);
        const sched = schedByAthlete.get(aid) || { planned: 0, completed: 0 };
        const openAlerts = openAlertsByAthlete.get(aid) || { count: 0, hasPain: false };
        return {
          id: aid,
          nom: String(a.nom),
          prenom: String(a.prenom),
          sport_code: String(a.sport_code) as SportCode,
          niveau: String(a.niveau) as AthleteLevel,
          statut: String(a.statut),
          is_minor: Boolean(a.is_minor),
          weeklyCompleted: sched.completed,
          weeklyTarget: sched.planned || 4,
          lastEvaluationScore: lastEvalByAthlete.has(aid) ? lastEvalByAthlete.get(aid)! : null,
          openAlertsCount: openAlerts.count,
          hasPainAlert: openAlerts.hasPain,
          unreadMessagesCount: unreadByAthlete.get(aid) || 0,
        };
      });

      res.json({
        coach: mapUserPublic(req.authUser!),
        coachProfile: coachProfile || null,
        athletes,
        alerts,
        library,
      });
    })
  );

  app.patch(
    '/api/coach/plan',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      await dbTransaction(async (tx) => {
        await tx.run(
          `UPDATE coaches
           SET coach_plan = 'MARKETPLACE', monthly_fee_fcfa = 0, commission_pct = 20, athlete_payout_fcfa = 4000
           WHERE user_id = ?`,
          req.authUser!.id
        );
        await logAccess(req.authUser!.id, 'COACH', null, 'COACH_PLAN_MARKETPLACE', 'fee:0', tx);
      });

      res.json({
        ok: true,
        coach_plan: 'MARKETPLACE',
        message: 'Modèle Coach Terrain+ actif (0 FCFA fixe · 4 000 FCFA reversés par athlète suivi).',
      });
    })
  );

  app.get(
    '/api/coach/athletes/:athleteId',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const athleteId = parsePositiveIntId(req.params.athleteId);
      if (!athleteId) {
        res.status(400).json({ error: 'Identifiant athlète invalide.' });
        return;
      }

      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        athleteId
      );
      if (!assigned) {
        res.status(403).json({ error: 'Cet athlète ne vous est pas affecté.' });
        return;
      }

      await logAccess(coachId, 'COACH', athleteId, 'CONSULTATION_FICHE', 'evaluations,programme,poids,alertes');
      const workspace = await buildAthleteWorkspace(athleteId, coachId);
      if (!workspace) {
        res.status(404).json({ error: 'Fiche athlète introuvable.' });
        return;
      }
      res.json(workspace);
    })
  );

  app.get(
    '/api/coach/athletes/:athleteId/messages',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const athleteId = parsePositiveIntId(req.params.athleteId);
      if (!athleteId) {
        res.status(400).json({ error: 'Identifiant athlète invalide.' });
        return;
      }
      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        athleteId
      );
      if (!assigned) {
        res.status(403).json({ error: 'Cet athlète ne vous est pas affecté.' });
        return;
      }
      const rows = await dbAll<Record<string, unknown>>(
        `SELECT cm.*, (u.prenom || ' ' || u.nom) as sender_nom
         FROM coach_messages cm
         JOIN users u ON u.id = cm.sender_user_id
         WHERE cm.athlete_user_id = ? AND cm.coach_user_id = ?
         ORDER BY cm.id ASC
         LIMIT 100`,
        athleteId,
        coachId
      );
      const messages = rows.map((m) => ({
        id: Number(m.id),
        athlete_user_id: Number(m.athlete_user_id),
        coach_user_id: Number(m.coach_user_id),
        sender_user_id: Number(m.sender_user_id),
        sender_role: String(m.sender_role) as 'ATHLETE' | 'COACH',
        sender_nom: String(m.sender_nom),
        body: String(m.body),
        read_by_athlete: Boolean(m.read_by_athlete),
        read_by_coach: Boolean(m.read_by_coach),
        created_at: String(m.created_at),
      }));
      res.json({ messages });
    })
  );

  app.post(
    '/api/coach/athletes/:athleteId/messages',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const athleteId = parsePositiveIntId(req.params.athleteId);
      if (!athleteId) {
        res.status(400).json({ error: 'Identifiant athlète invalide.' });
        return;
      }
      const bodyText = sanitizeText((req.body as Record<string, unknown>).body, 1000);
      if (!bodyText) {
        res.status(400).json({ error: 'Le message ne peut pas être vide.' });
        return;
      }
      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        athleteId
      );
      if (!assigned) {
        res.status(403).json({ error: 'Cet athlète ne vous est pas affecté.' });
        return;
      }
      const ins = await dbRun(
        `INSERT INTO coach_messages (
          athlete_user_id, coach_user_id, sender_user_id, sender_role, body, read_by_athlete, read_by_coach
        ) VALUES (?, ?, ?, 'COACH', ?, 0, 1)`,
        athleteId,
        coachId,
        coachId,
        bodyText
      );
      await dbRun(
        "UPDATE coach_messages SET read_by_coach = 1 WHERE athlete_user_id = ? AND coach_user_id = ? AND sender_role = 'ATHLETE' AND read_by_coach = 0",
        athleteId,
        coachId
      );
      await logAccess(coachId, 'COACH', athleteId, 'MESSAGE_DIRECT_ATHLETE', 'coach_messages');
      const created = await dbGet<Record<string, unknown>>(
        `SELECT cm.*, (u.prenom || ' ' || u.nom) as sender_nom
         FROM coach_messages cm
         JOIN users u ON u.id = cm.sender_user_id
         WHERE cm.id = ?`,
        ins.lastInsertRowid
      );
      res.status(201).json({
        message: created
          ? {
              id: Number(created.id),
              athlete_user_id: Number(created.athlete_user_id),
              coach_user_id: Number(created.coach_user_id),
              sender_user_id: Number(created.sender_user_id),
              sender_role: String(created.sender_role),
              sender_nom: String(created.sender_nom),
              body: String(created.body),
              read_by_athlete: Boolean(created.read_by_athlete),
              read_by_coach: Boolean(created.read_by_coach),
              created_at: String(created.created_at),
            }
          : null,
      });
    })
  );

  app.post(
    '/api/coach/athletes/:athleteId/messages/read',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const athleteId = parsePositiveIntId(req.params.athleteId);
      if (!athleteId) {
        res.status(400).json({ error: 'Identifiant athlète invalide.' });
        return;
      }
      await dbRun(
        "UPDATE coach_messages SET read_by_coach = 1 WHERE athlete_user_id = ? AND coach_user_id = ? AND sender_role = 'ATHLETE' AND read_by_coach = 0",
        athleteId,
        coachId
      );
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/coach/evaluations/:evalId/comment',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const evalId = parsePositiveIntId(req.params.evalId);
      if (!evalId) {
        res.status(400).json({ error: 'Identifiant d’évaluation invalide.' });
        return;
      }
      const coachId = req.authUser!.id;
      const texte = sanitizeText((req.body as Record<string, unknown>).texte, 500);
      if (!texte) {
        res.status(400).json({ error: 'Commentaire vide.' });
        return;
      }

      const ev = await dbGet<{ athlete_user_id: number }>('SELECT athlete_user_id FROM evaluations WHERE id = ?', evalId);
      if (!ev) {
        res.status(404).json({ error: 'Évaluation introuvable.' });
        return;
      }
      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        ev.athlete_user_id
      );
      if (!assigned) {
        res.status(403).json({ error: 'Non autorisé pour cet athlète.' });
        return;
      }

      await dbRun('INSERT INTO coach_comments (coach_user_id, evaluation_id, texte) VALUES (?, ?, ?)', coachId, evalId, texte);
      await logAccess(coachId, 'COACH', ev.athlete_user_id, 'COMMENTAIRE_EVALUATION', `evaluation:${evalId}`);
      res.status(201).json({ ok: true });
    })
  );

  app.patch(
    '/api/coach/athletes/:athleteId/objectives',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const athleteId = parsePositiveIntId(req.params.athleteId);
      if (!athleteId) {
        res.status(400).json({ error: 'Identifiant athlète invalide.' });
        return;
      }
      const objectif = sanitizeText((req.body as Record<string, unknown>).objectif, 200);

      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        athleteId
      );
      if (!assigned || !objectif) {
        res.status(403).json({ error: 'Opération non autorisée ou objectif vide.' });
        return;
      }

      await dbRun('UPDATE athlete_profiles SET objectif = ? WHERE user_id = ?', objectif, athleteId);
      await dbRun('UPDATE program_plans SET objectif = ? WHERE athlete_user_id = ?', objectif, athleteId);
      await logAccess(coachId, 'COACH', athleteId, 'MAJ_OBJECTIFS', 'programme');
      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/coach/scheduled/:schedId/adjust',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const schedId = parsePositiveIntId(req.params.schedId);
      if (!schedId) {
        res.status(400).json({ error: 'Identifiant de créneau invalide.' });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const isRest = Boolean(body.is_rest_day);
      const sessionId = body.session_id ? Number(body.session_id) : null;
      const motif = sanitizeText(body.motif_ajustement, 240);

      if (!motif) {
        res.status(400).json({ error: 'Le motif de modification visible par l’athlète est obligatoire.' });
        return;
      }

      const row = await dbGet<{ athlete_user_id: number }>('SELECT athlete_user_id FROM scheduled_sessions WHERE id = ?', schedId);
      if (!row) {
        res.status(404).json({ error: 'Créneau introuvable.' });
        return;
      }
      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        row.athlete_user_id
      );
      if (!assigned) {
        res.status(403).json({ error: 'Non autorisé pour cet athlète.' });
        return;
      }

      if (!isRest) {
        if (!sessionId || !Number.isInteger(sessionId)) {
          res.status(400).json({ error: 'Séance invalide.' });
          return;
        }
        const sess = await dbGet("SELECT id FROM sessions_library WHERE id = ? AND validation_status = 'VALIDEE'", sessionId);
        if (!sess) {
          res.status(400).json({ error: 'Seules les séances validées peuvent être programmées.' });
          return;
        }
      }

      await dbRun(
        `UPDATE scheduled_sessions
         SET is_rest_day = ?, session_id = ?, ajustee_par_coach = 1, motif_ajustement = ?, date_ajustement = datetime('now')
         WHERE id = ?`,
        isRest ? 1 : 0,
        isRest ? null : sessionId,
        motif,
        schedId
      );

      await logAccess(coachId, 'COACH', row.athlete_user_id, 'AJUSTEMENT_PROGRAMME', `scheduled:${schedId}`);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/coach/alerts/:alertId/resolve',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const alertId = parsePositiveIntId(req.params.alertId);
      if (!alertId) {
        res.status(400).json({ error: 'Identifiant d’alerte invalide.' });
        return;
      }
      const note = sanitizeText((req.body as Record<string, unknown>).note_traitement, 300) || 'Alerte prise en charge et séance adaptée.';

      const al = await dbGet<{ athlete_user_id: number }>('SELECT athlete_user_id FROM alerts WHERE id = ?', alertId);
      if (!al) {
        res.status(404).json({ error: 'Alerte introuvable.' });
        return;
      }
      const assigned = await dbGet(
        "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
        coachId,
        al.athlete_user_id
      );
      if (!assigned) {
        res.status(403).json({ error: 'Non autorisé.' });
        return;
      }

      await dbRun(`UPDATE alerts SET traitee = 1, traitee_par_user_id = ?, note_traitement = ? WHERE id = ?`, coachId, note, alertId);
      await logAccess(coachId, 'COACH', al.athlete_user_id, 'TRAITEMENT_ALERTE', `alert:${alertId}`);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/coach/sessions/propose',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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

      await dbRun(
        `INSERT INTO sessions_library (
          sport_code, titre, niveau, duree_min, objectif, prevention_focus,
          relue_par, validation_status, proposee_par_user_id, exercises_json
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'EN_RELECTURE', ?, ?)`,
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
    })
  );

  // ---------------- COACH SESSION VIDEOS (SUPABASE FREE TIER AWARE) ----------------
  app.get(
    '/api/coach/videos',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const rows = await dbAll<RawCoachVideoRow>(
        `SELECT cv.*,
                sl.titre as session_titre,
                (ua.prenom || ' ' || ua.nom) as athlete_nom,
                (uc.prenom || ' ' || uc.nom) as coach_nom
         FROM coach_videos cv
         LEFT JOIN sessions_library sl ON sl.id = cv.session_id
         LEFT JOIN users ua ON ua.id = cv.athlete_user_id
         JOIN users uc ON uc.id = cv.coach_user_id
         WHERE cv.coach_user_id = ?
         ORDER BY cv.created_at DESC, cv.id DESC`,
        coachId
      );

      const usedBytes = rows.reduce((acc, r) => {
        if (r.source_type === 'SUPABASE_STORAGE' || r.source_type === 'LOCAL_STORAGE') {
          return acc + Number(r.file_size_bytes || 0);
        }
        return acc;
      }, 0);

      res.json({
        videos: rows.map((r) => mapCoachVideoRow(r, coachId)),
        quota: {
          usedBytes,
          maxBytes: COACH_VIDEO_QUOTA_BYTES,
          maxFileBytes: COACH_VIDEO_MAX_BYTES,
          storageMode: getSupabaseAdmin() ? 'supabase' : 'local',
        },
      });
    })
  );

  app.post(
    '/api/coach/videos/upload-url',
    requireAuth,
    requireRole('COACH'),
    uploadLimiter,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const coachRow = await dbGet<{ verification_status: string }>('SELECT verification_status FROM coaches WHERE user_id = ?', coachId);
      if (!coachRow || coachRow.verification_status !== 'VERIFIE') {
        res.status(403).json({ error: 'Votre dossier coach doit être vérifié par l’administration avant de publier des vidéos.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const mimeType = sanitizeText(body.mime_type, 60).toLowerCase();
      const fileSizeBytes = Number(body.file_size_bytes);

      if (!ALLOWED_COACH_VIDEO_MIMES.has(mimeType)) {
        res.status(400).json({ error: 'Format vidéo non supporté. Utilisez MP4, WebM ou MOV (.mov).' });
        return;
      }
      if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > COACH_VIDEO_MAX_BYTES) {
        res.status(400).json({
          error: `Taille max par vidéo : ${Math.round(COACH_VIDEO_MAX_BYTES / (1024 * 1024))} Mo (optimisé Supabase gratuit). Pour une vidéo plus longue, utilisez un lien HTTPS (YouTube/Vimeo).`,
        });
        return;
      }

      const quotaRow = await dbGet<{ used_bytes: number }>(
        `SELECT COALESCE(SUM(file_size_bytes), 0) as used_bytes
         FROM coach_videos
         WHERE coach_user_id = ? AND source_type IN ('SUPABASE_STORAGE', 'LOCAL_STORAGE')`,
        coachId
      );
      const usedBytes = Number(quotaRow?.used_bytes || 0);
      if (usedBytes + fileSizeBytes > COACH_VIDEO_QUOTA_BYTES) {
        res.status(400).json({
          error: `Quota stockage coach atteint (${Math.round(COACH_VIDEO_QUOTA_BYTES / (1024 * 1024))} Mo max). Supprimez une ancienne vidéo ou utilisez un lien HTTPS externe.`,
        });
        return;
      }

      const ext = mimeType === 'video/webm' ? 'webm' : mimeType === 'video/quicktime' ? 'mov' : 'mp4';
      const objectPath = `coach_${coachId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

      if (getSupabaseAdmin()) {
        const signed = await createCoachVideoSignedUploadUrl(objectPath);
        if (signed) {
          res.json({
            uploadMode: 'supabase_signed',
            signedUrl: signed.signedUrl,
            token: signed.token,
            objectPath: signed.path,
            maxFileBytes: COACH_VIDEO_MAX_BYTES,
          });
          return;
        }
        if (process.env.VERCEL) {
          res.status(502).json({ error: 'Impossible de générer l’URL de téléversement Supabase Storage.' });
          return;
        }
      }

      const uploadToken = createScopedActionToken(coachId, `coach-video-upload:${objectPath}`, 900);
      res.json({
        uploadMode: 'local_proxy',
        uploadUrl: '/api/coach/videos/local-upload',
        uploadToken,
        objectPath,
        maxFileBytes: COACH_VIDEO_MAX_BYTES,
      });
    })
  );

  app.put(
    '/api/coach/videos/local-upload',
    requireAuth,
    requireRole('COACH'),
    uploadLimiter,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const objectPath = sanitizeText(req.headers['x-object-path'] || req.query.objectPath, 160);
      const uploadToken = String(req.headers['x-upload-token'] || req.query.uploadToken || '').trim();

      if (!objectPath || !objectPath.startsWith(`coach_${coachId}/`) || objectPath.includes('..')) {
        res.status(400).json({ error: 'Chemin de stockage vidéo invalide.' });
        return;
      }
      const tokenVerified = verifyScopedActionToken(uploadToken, `coach-video-upload:${objectPath}`);
      if (!tokenVerified || tokenVerified.userId !== coachId) {
        res.status(403).json({ error: 'Jeton de téléversement vidéo expiré ou invalide.' });
        return;
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Fichier vidéo vide ou manquant.' });
        return;
      }
      if (req.body.length > COACH_VIDEO_MAX_BYTES) {
        res.status(413).json({ error: `Fichier trop volumineux (max ${Math.round(COACH_VIDEO_MAX_BYTES / (1024 * 1024))} Mo).` });
        return;
      }

      const detectedMime = detectVideoMimeFromMagicBytes(req.body);
      if (!detectedMime) {
        res.status(400).json({ error: 'Signature binaire non reconnue (MP4, WebM ou MOV valide requis).' });
        return;
      }

      const targetPath = path.resolve(VIDEO_UPLOAD_DIR, objectPath);
      if (!targetPath.startsWith(VIDEO_UPLOAD_DIR + path.sep)) {
        res.status(400).json({ error: 'Chemin de destination invalide.' });
        return;
      }

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, req.body);

      res.json({
        ok: true,
        objectPath,
        sizeBytes: req.body.length,
        mimeType: detectedMime,
      });
    })
  );

  app.post(
    '/api/coach/videos',
    requireAuth,
    requireRole('COACH'),
    uploadLimiter,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const coachRow = await dbGet<{ verification_status: string }>('SELECT verification_status FROM coaches WHERE user_id = ?', coachId);
      if (!coachRow || coachRow.verification_status !== 'VERIFIE') {
        res.status(403).json({ error: 'Votre dossier coach doit être vérifié par l’administration avant de publier des vidéos.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const titre = sanitizeText(body.titre, 140);
      const description = sanitizeText(body.description, 600) || null;
      const sportCode = sanitizeText(body.sport_code, 20) as SportCode;
      const sessionId = body.session_id ? Number(body.session_id) : null;
      const athleteUserId = body.athlete_user_id ? Number(body.athlete_user_id) : null;
      const sourceType = sanitizeText(body.source_type, 30).toUpperCase() as CoachVideoSourceType;

      if (!titre || titre.length < 3) {
        res.status(400).json({ error: 'Le titre de la vidéo doit contenir au moins 3 caractères.' });
        return;
      }
      if (!VALID_SPORT_CODES.includes(sportCode)) {
        res.status(400).json({ error: 'Sport invalide.' });
        return;
      }
      if (!['SUPABASE_STORAGE', 'LOCAL_STORAGE', 'EXTERNAL_URL'].includes(sourceType)) {
        res.status(400).json({ error: 'Type de source vidéo invalide.' });
        return;
      }

      if (sessionId !== null) {
        if (!Number.isInteger(sessionId) || sessionId <= 0) {
          res.status(400).json({ error: 'Séance associée invalide.' });
          return;
        }
        const sess = await dbGet('SELECT id FROM sessions_library WHERE id = ?', sessionId);
        if (!sess) {
          res.status(404).json({ error: 'Séance de bibliothèque introuvable.' });
          return;
        }
      }

      if (athleteUserId !== null) {
        if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) {
          res.status(400).json({ error: 'Athlète ciblé invalide.' });
          return;
        }
        const assigned = await dbGet(
          "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
          coachId,
          athleteUserId
        );
        if (!assigned) {
          res.status(403).json({ error: 'Vous ne pouvez publier des vidéos que pour vos athlètes affectés.' });
          return;
        }
      }

      let storagePath: string | null = null;
      let externalUrl: string | null = null;
      let mimeType: string | null = null;
      let fileSizeBytes = 0;

      if (sourceType === 'EXTERNAL_URL') {
        const urlCheck = validateExternalVideoUrl(body.external_url);
        if (!urlCheck.valid) {
          res.status(400).json({ error: urlCheck.error });
          return;
        }
        externalUrl = urlCheck.normalizedUrl;
      } else {
        const rawPath = sanitizeText(body.storage_path, 160);
        const rawMime = sanitizeText(body.mime_type, 60).toLowerCase();
        const rawSize = Number(body.file_size_bytes);

        if (!rawPath || !rawPath.startsWith(`coach_${coachId}/`) || rawPath.includes('..')) {
          res.status(400).json({ error: 'Chemin de stockage vidéo invalide.' });
          return;
        }
        if (!ALLOWED_COACH_VIDEO_MIMES.has(rawMime)) {
          res.status(400).json({ error: 'Type MIME vidéo invalide.' });
          return;
        }

        if (sourceType === 'LOCAL_STORAGE') {
          const targetPath = path.resolve(VIDEO_UPLOAD_DIR, rawPath);
          if (!targetPath.startsWith(VIDEO_UPLOAD_DIR + path.sep) || !fs.existsSync(targetPath)) {
            res.status(400).json({ error: 'Fichier vidéo introuvable après téléversement.' });
            return;
          }
          const st = await fs.promises.stat(targetPath);
          fileSizeBytes = st.size;
        } else {
          const supabase = getSupabaseAdmin();
          if (!supabase) {
            res.status(400).json({ error: 'Supabase Storage non configuré sur cet environnement.' });
            return;
          }
          const fileName = rawPath.slice(`coach_${coachId}/`.length);
          const { data: listed } = await supabase.storage
            .from(SUPABASE_VIDEO_BUCKET)
            .list(`coach_${coachId}`, { search: fileName });
          const found = Array.isArray(listed) ? listed.find((item) => item.name === fileName) : null;
          if (!found) {
            res.status(400).json({ error: 'Fichier introuvable dans Supabase Storage. Relancez le téléversement.' });
            return;
          }
          const metaSize = Number((found.metadata as { size?: unknown } | null)?.size || rawSize);
          fileSizeBytes = Number.isFinite(metaSize) && metaSize > 0 ? metaSize : rawSize;
        }

        if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > COACH_VIDEO_MAX_BYTES) {
          res.status(400).json({ error: `Taille vidéo invalide (max ${Math.round(COACH_VIDEO_MAX_BYTES / (1024 * 1024))} Mo).` });
          return;
        }

        const quotaRow = await dbGet<{ used_bytes: number }>(
          `SELECT COALESCE(SUM(file_size_bytes), 0) as used_bytes
           FROM coach_videos
           WHERE coach_user_id = ? AND source_type IN ('SUPABASE_STORAGE', 'LOCAL_STORAGE')`,
          coachId
        );
        const usedBytes = Number(quotaRow?.used_bytes || 0);
        if (usedBytes + fileSizeBytes > COACH_VIDEO_QUOTA_BYTES) {
          res.status(400).json({ error: 'Quota stockage coach dépassé.' });
          return;
        }

        storagePath = rawPath;
        mimeType = rawMime;
      }

      const insertRes = await dbRun(
        `INSERT INTO coach_videos (
          coach_user_id, sport_code, session_id, athlete_user_id, titre, description,
          source_type, storage_path, external_url, mime_type, file_size_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        coachId,
        sportCode,
        sessionId,
        athleteUserId,
        titre,
        description,
        sourceType,
        storagePath,
        externalUrl,
        mimeType,
        fileSizeBytes
      );

      const createdRow = await dbGet<RawCoachVideoRow>(
        `SELECT cv.*,
                sl.titre as session_titre,
                (ua.prenom || ' ' || ua.nom) as athlete_nom,
                (uc.prenom || ' ' || uc.nom) as coach_nom
         FROM coach_videos cv
         LEFT JOIN sessions_library sl ON sl.id = cv.session_id
         LEFT JOIN users ua ON ua.id = cv.athlete_user_id
         JOIN users uc ON uc.id = cv.coach_user_id
         WHERE cv.id = ?`,
        insertRes.lastInsertRowid
      );

      await logAccess(
        coachId,
        'COACH',
        athleteUserId,
        'AJOUT_VIDEO_COACH',
        `video:${insertRes.lastInsertRowid}:${sourceType}`
      );

      res.status(201).json({
        ok: true,
        video: createdRow ? mapCoachVideoRow(createdRow, coachId) : null,
      });
    })
  );

  app.delete(
    '/api/coach/videos/:videoId',
    requireAuth,
    requireRole('COACH'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachId = req.authUser!.id;
      const videoId = Number(req.params.videoId);
      if (!Number.isInteger(videoId) || videoId <= 0) {
        res.status(400).json({ error: 'Identifiant vidéo invalide.' });
        return;
      }

      const video = await dbGet<RawCoachVideoRow>(
        'SELECT * FROM coach_videos WHERE id = ?',
        videoId
      );
      if (!video) {
        res.status(404).json({ error: 'Vidéo introuvable.' });
        return;
      }
      if (Number(video.coach_user_id) !== coachId) {
        res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres vidéos.' });
        return;
      }

      if (video.source_type === 'SUPABASE_STORAGE' && video.storage_path) {
        await deleteCoachVideoFromSupabaseStorage(video.storage_path);
      } else if (video.source_type === 'LOCAL_STORAGE' && video.storage_path) {
        const localPath = path.resolve(VIDEO_UPLOAD_DIR, video.storage_path);
        if (localPath.startsWith(VIDEO_UPLOAD_DIR + path.sep)) {
          await fs.promises.unlink(localPath).catch(() => undefined);
        }
      }

      await dbRun('DELETE FROM coach_videos WHERE id = ?', videoId);
      await logAccess(
        coachId,
        'COACH',
        video.athlete_user_id ? Number(video.athlete_user_id) : null,
        'SUPPRESSION_VIDEO_COACH',
        `video:${videoId}`
      );

      res.json({ ok: true });
    })
  );

  app.get(
    '/api/videos/:videoId/stream',
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const videoId = Number(req.params.videoId);
      if (!Number.isInteger(videoId) || videoId <= 0) {
        res.status(400).json({ error: 'Identifiant vidéo invalide.' });
        return;
      }

      let viewerUserId: number | null = req.authUser ? req.authUser.id : null;
      let viewerRole: UserRole | null = req.authUser ? req.authUser.role : null;

      if (!viewerUserId || !viewerRole) {
        const vt = typeof req.query.vt === 'string' ? req.query.vt.trim() : '';
        const verified = verifyScopedActionToken(vt, `video-stream:${videoId}`);
        if (!verified) {
          res.status(401).json({ error: 'Authentification requise pour lire cette vidéo.' });
          return;
        }
        const userRow = await dbGet<{ id: number; role: UserRole; statut: string; verified: number }>(
          'SELECT id, role, statut, verified FROM users WHERE id = ?',
          verified.userId
        );
        if (!userRow || userRow.statut === 'CLOTURE' || !userRow.verified) {
          res.status(401).json({ error: 'Session vidéo invalide.' });
          return;
        }
        viewerUserId = Number(userRow.id);
        viewerRole = userRow.role;
      }

      const video = await dbGet<RawCoachVideoRow>('SELECT * FROM coach_videos WHERE id = ?', videoId);
      if (!video) {
        res.status(404).json({ error: 'Vidéo introuvable.' });
        return;
      }

      if (viewerRole === 'ADMIN') {
        // Admin authorized
      } else if (viewerRole === 'COACH') {
        if (Number(video.coach_user_id) !== viewerUserId) {
          res.status(403).json({ error: 'Accès non autorisé à cette vidéo.' });
          return;
        }
      } else if (viewerRole === 'ATHLETE') {
        const assigned = await dbGet(
          "SELECT id FROM assignments WHERE coach_user_id = ? AND athlete_user_id = ? AND statut = 'ACTIF'",
          video.coach_user_id,
          viewerUserId
        );
        const targetedToOther = video.athlete_user_id !== null && Number(video.athlete_user_id) !== viewerUserId;
        if (!assigned || targetedToOther) {
          res.status(403).json({ error: 'Cette vidéo ne fait pas partie de votre suivi coach.' });
          return;
        }
      } else {
        res.status(403).json({ error: 'Accès non autorisé.' });
        return;
      }

      if (video.source_type === 'EXTERNAL_URL' && video.external_url) {
        const urlCheck = validateExternalVideoUrl(video.external_url);
        if (!urlCheck.valid) {
          res.status(400).json({ error: 'Lien vidéo externe bloqué par la politique de sécurité.' });
          return;
        }
        res.redirect(302, urlCheck.normalizedUrl);
        return;
      }

      if (video.source_type === 'SUPABASE_STORAGE' && video.storage_path) {
        const signedUrl = await createCoachVideoSignedReadUrl(video.storage_path, 3600);
        if (!signedUrl) {
          res.status(502).json({ error: 'Impossible d’accéder au flux vidéo Supabase Storage.' });
          return;
        }
        res.setHeader('Cache-Control', 'private, no-store');
        res.redirect(302, signedUrl);
        return;
      }

      if (video.source_type === 'LOCAL_STORAGE' && video.storage_path) {
        const localPath = path.resolve(VIDEO_UPLOAD_DIR, video.storage_path);
        if (!localPath.startsWith(VIDEO_UPLOAD_DIR + path.sep) || !fs.existsSync(localPath)) {
          res.status(404).json({ error: 'Fichier vidéo local introuvable.' });
          return;
        }
        const stat = await fs.promises.stat(localPath);
        const total = stat.size;
        const mime = video.mime_type || 'video/mp4';
        const rangeHeader = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=300');

        if (rangeHeader) {
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
          if (!match) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
            return;
          }
          const start = parseInt(match[1], 10);
          const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
          if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
            return;
          }
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', String(end - start + 1));
          res.setHeader('Content-Type', mime);
          fs.createReadStream(localPath, { start, end }).pipe(res);
          return;
        }

        res.status(200);
        res.setHeader('Content-Length', String(total));
        res.setHeader('Content-Type', mime);
        fs.createReadStream(localPath).pipe(res);
        return;
      }

      res.status(404).json({ error: 'Source vidéo non disponible.' });
    })
  );

  // ---------------- ADMIN ROUTES ----------------
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (_req: AuthedRequest, res: Response) => {
      const [users, coachesRaw, docRows, sessions, auditLogs, partners, groups, challenges, partnerRequests, systemOverview] =
        await Promise.all([
          dbAll(
            `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.role, u.statut, u.is_minor, u.verified, u.created_at,
                    ap.sport_code, ap.niveau, ap.plan_tier, ap.plan_fee_fcfa,
                    act_asg.coach_user_id as assigned_coach_id
             FROM users u
             LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
             LEFT JOIN (
               SELECT athlete_user_id, MAX(coach_user_id) as coach_user_id
               FROM assignments
               WHERE statut = 'ACTIF'
               GROUP BY athlete_user_id
             ) act_asg ON act_asg.athlete_user_id = u.id
             ORDER BY u.role ASC, u.id DESC`
          ),
          dbAll<Record<string, unknown>>(
            `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.statut, u.verified,
                    c.specialite, c.qualification, c.zone, c.coach_plan, c.verification_status, c.rejection_reason,
                    c.pro_card_number, c.pro_card_expiry, c.rc_pro_insurer, c.rc_pro_policy_number,
                    c.legal_status, c.business_reg_number, c.honorability_attested
             FROM users u JOIN coaches c ON c.user_id = u.id
             WHERE u.role = 'COACH' AND u.statut != 'CLOTURE'
             ORDER BY CASE WHEN c.verification_status = 'EN_ATTENTE' THEN 0 WHEN c.verification_status = 'REFUSE' THEN 1 ELSE 2 END, u.id DESC`
          ),
          dbAll<{
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
            study_report_json: string;
            admin_review_note: string | null;
            reviewed_by_nom: string | null;
            reviewed_at: string | null;
            uploaded_at: string;
          }>(
            `SELECT cd.*, (ur.prenom || ' ' || ur.nom) as reviewed_by_nom
             FROM coach_documents cd
             LEFT JOIN users ur ON ur.id = cd.reviewed_by_user_id
             ORDER BY cd.id DESC`
          ),
          dbAll(
            `SELECT sl.*, (u.prenom || ' ' || u.nom) as proposee_par_nom
             FROM sessions_library sl
             LEFT JOIN users u ON u.id = sl.proposee_par_user_id
             ORDER BY CASE WHEN sl.validation_status = 'EN_RELECTURE' THEN 0 ELSE 1 END, sl.id DESC`
          ),
          dbAll(
            `SELECT al.id, COALESCE(ua.prenom || ' ' || ua.nom, 'Système') as actor_nom, al.actor_role,
                    CASE WHEN ut.id IS NOT NULL THEN (ut.prenom || ' ' || ut.nom) ELSE NULL END as athlete_nom,
                    al.action, al.resource, al.created_at
             FROM access_audit_logs al
             LEFT JOIN users ua ON ua.id = al.actor_user_id
             LEFT JOIN users ut ON ut.id = al.athlete_user_id
             ORDER BY al.id DESC LIMIT 250`
          ),
          dbAll(
            `SELECT p.*,
                    COALESCE(gc.groups_count, 0) as groups_count,
                    COALESCE(mc.members_count, 0) as members_count
             FROM partners p
             LEFT JOIN (
               SELECT partner_id, COUNT(*) as groups_count
               FROM groups
               GROUP BY partner_id
             ) gc ON gc.partner_id = p.id
             LEFT JOIN (
               SELECT g.partner_id, COUNT(*) as members_count
               FROM group_memberships gm
               JOIN groups g ON g.id = gm.group_id
               GROUP BY g.partner_id
             ) mc ON mc.partner_id = p.id
             ORDER BY p.id ASC`
          ),
          dbAll(
            `SELECT g.*, p.nom as partner_nom, p.type as partner_type, p.zone,
                    COALESCE(gm_counts.member_count, 0) as member_count
             FROM groups g
             JOIN partners p ON p.id = g.partner_id
             LEFT JOIN (
               SELECT group_id, COUNT(*) as member_count
               FROM group_memberships
               GROUP BY group_id
             ) gm_counts ON gm_counts.group_id = g.id
             ORDER BY g.id ASC`
          ),
          dbAll(
            `SELECT c.*, p.nom as partner_nom FROM challenges c JOIN partners p ON p.id = c.partner_id ORDER BY c.id ASC`
          ),
          dbAll('SELECT * FROM partner_requests ORDER BY id DESC LIMIT 40'),
          buildAdminSystemOverview(),
        ]);

      const latestDocByCoach = new Map<number, CoachDocumentSummary>();
      for (const d of docRows) {
        if (!latestDocByCoach.has(d.coach_user_id)) {
          let parsedReport: CoachDocumentStudyReport = {
            formatLabel: d.diploma_type,
            detectedMime: d.mime_type,
            isDuplicateHash: false,
            checks: [],
          };
          try {
            parsedReport = JSON.parse(d.study_report_json) as CoachDocumentStudyReport;
          } catch {
            // keep fallback
          }
          latestDocByCoach.set(d.coach_user_id, {
            id: d.id,
            coach_user_id: d.coach_user_id,
            diploma_type: d.diploma_type,
            issuing_organism: d.issuing_organism,
            diploma_number: d.diploma_number,
            issue_year: d.issue_year,
            original_filename: d.original_filename,
            mime_type: d.mime_type,
            file_size_bytes: d.file_size_bytes,
            sha256_hash: d.sha256_hash,
            study_score: d.study_score,
            study_status: d.study_status,
            study_report: parsedReport,
            admin_review_note: d.admin_review_note,
            reviewed_by_nom: d.reviewed_by_nom,
            reviewed_at: d.reviewed_at,
            uploaded_at: d.uploaded_at,
          });
        }
      }

      const coaches = coachesRaw.map((c) => ({
        ...c,
        document: latestDocByCoach.get(Number(c.id)) || null,
      }));

      res.json({ users, coaches, sessions, auditLogs, partners, groups, challenges, partnerRequests, systemOverview });
    })
  );

  app.get(
    '/api/admin/system-overview',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (_req: AuthedRequest, res: Response) => {
      res.json(await buildAdminSystemOverview());
    })
  );

  app.get(
    '/api/admin/coach-documents/:docId/file',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const docId = Number(req.params.docId);
      if (!Number.isInteger(docId) || docId <= 0) {
        res.status(400).json({ error: 'Identifiant de document invalide.' });
        return;
      }
      const doc = await dbGet<{
        id: number;
        coach_user_id: number;
        original_filename: string;
        stored_filename: string;
        mime_type: string;
      }>('SELECT id, coach_user_id, original_filename, stored_filename, mime_type FROM coach_documents WHERE id = ?', docId);

      if (!doc) {
        res.status(404).json({ error: 'Document introuvable.' });
        return;
      }

      const safeFile = path.basename(doc.stored_filename);
      const fullPath = path.join(DIPLOMA_UPLOAD_DIR, safeFile);
      let buf: Buffer | null = fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : null;
      if (!buf) {
        buf = await downloadDiplomaFromSupabaseStorage(safeFile);
      }
      if (!buf) {
        res.status(404).json({ error: 'Fichier physique introuvable sur le serveur.' });
        return;
      }

      await logAccess(req.authUser!.id, 'ADMIN', doc.coach_user_id, 'CONSULTATION_DIPLOME', `doc:${doc.id}`);
      const safeMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']).has(doc.mime_type)
        ? doc.mime_type
        : 'application/octet-stream';
      const safeDownloadName =
        doc.original_filename.replace(/[\r\n"\\;/\x00-\x1f\x7f]/g, '_').slice(0, 120) || 'justificatif';
      res.setHeader('Content-Type', safeMime);
      res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', 'sandbox');
      res.send(buf);
    })
  );

  app.post(
    '/api/admin/partners',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const nom = sanitizeText(body.nom, 140);
      const type = sanitizeText(body.type, 20).toUpperCase();
      const zone = sanitizeText(body.zone, 80);

      if (!nom || !zone || !['ASC', 'CAMPUS', 'LIGUE'].includes(type)) {
        res.status(400).json({ error: 'Nom, type (ASC/CAMPUS/LIGUE) et zone requis.' });
        return;
      }

      const ins = await dbRun('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)', nom, type, zone);
      await logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_PARTENAIRE', `partner:${ins.lastInsertRowid}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid) });
    })
  );

  app.post(
    '/api/admin/groups',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const nom = sanitizeText(body.nom, 140);
      const partnerId = Number(body.partner_id);
      const captainName = sanitizeText(body.captain_name, 100);
      const sportCode = sanitizeText(body.sport_code, 20) as SportCode;

      if (!nom || !captainName || !Number.isInteger(partnerId) || !VALID_SPORT_CODES.includes(sportCode)) {
        res.status(400).json({ error: 'Nom du groupe, partenaire, Capitaine Prépa et sport requis.' });
        return;
      }
      const partnerExists = await dbGet('SELECT id FROM partners WHERE id = ?', partnerId);
      if (!partnerExists) {
        res.status(404).json({ error: 'Partenaire introuvable.' });
        return;
      }
      const ins = await dbRun(
        'INSERT INTO groups (nom, partner_id, captain_name, sport_code) VALUES (?, ?, ?, ?)',
        nom,
        partnerId,
        captainName,
        sportCode
      );
      await logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_GROUPE', `group:${ins.lastInsertRowid}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid) });
    })
  );

  app.post(
    '/api/admin/challenges',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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
      const partnerExists = await dbGet('SELECT id FROM partners WHERE id = ?', partnerId);
      if (!partnerExists) {
        res.status(404).json({ error: 'Partenaire introuvable.' });
        return;
      }
      const ins = await dbRun(
        'INSERT INTO challenges (partner_id, titre, indicateur, periode, target_sessions, current_sessions) VALUES (?, ?, ?, ?, ?, 0)',
        partnerId,
        titre,
        indicateur,
        periode,
        Math.round(targetSessions)
      );
      await logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_DEFI', `challenge:${ins.lastInsertRowid}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid) });
    })
  );

  app.patch(
    '/api/admin/partner-requests/:id',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const reqId = parsePositiveIntId(req.params.id);
      const statut = sanitizeText((req.body as Record<string, unknown>).statut, 20).toUpperCase();
      if (!reqId || !['NOUVELLE', 'EN_ETUDE', 'VALIDEE'].includes(statut)) {
        res.status(400).json({ error: 'Statut ou identifiant invalide.' });
        return;
      }
      const row = await dbGet<{ id: number; organisation: string; type: string; zone: string; statut: string }>(
        'SELECT * FROM partner_requests WHERE id = ?',
        reqId
      );
      if (!row) {
        res.status(404).json({ error: 'Demande introuvable.' });
        return;
      }
      await dbRun('UPDATE partner_requests SET statut = ? WHERE id = ?', statut, reqId);
      if (statut === 'VALIDEE' && row.statut !== 'VALIDEE') {
        const existing = await dbGet('SELECT id FROM partners WHERE LOWER(nom) = LOWER(?)', row.organisation);
        if (!existing) {
          await dbRun('INSERT INTO partners (nom, type, zone) VALUES (?, ?, ?)', row.organisation, row.type, row.zone);
        }
      }
      await logAccess(req.authUser!.id, 'ADMIN', null, 'STATUT_PARTENARIAT', `request:${reqId}:${statut}`);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/assign',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const athleteId = Number(body.athlete_user_id);
      const coachId = Number(body.coach_user_id);

      const [athlete, coach] = await Promise.all([
        dbGet("SELECT id FROM users WHERE id = ? AND role = 'ATHLETE'", athleteId),
        dbGet("SELECT id FROM users WHERE id = ? AND role = 'COACH'", coachId),
      ]);
      if (!athlete || !coach) {
        res.status(400).json({ error: 'Athlète ou coach invalide.' });
        return;
      }

      await dbTransaction(async (tx) => {
        await tx.run("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE athlete_user_id = ? AND statut = 'ACTIF'", athleteId);
        await tx.run("INSERT INTO assignments (coach_user_id, athlete_user_id, date_debut, statut) VALUES (?, ?, date('now'), 'ACTIF')", coachId, athleteId);
        await tx.run('UPDATE program_plans SET coach_user_id = ? WHERE athlete_user_id = ?', coachId, athleteId);
        await tx.run("UPDATE users SET statut = 'SUIVI_ACTIF' WHERE id = ? AND statut = 'ACTIF'", athleteId);
        await logAccess(req.authUser!.id, 'ADMIN', athleteId, 'AFFECTATION_COACH', `coach:${coachId}`, tx);
      });

      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/users/:userId/status',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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
      const upd = await dbRun('UPDATE users SET statut = ? WHERE id = ?', statut, userId);
      if (upd.changes === 0) {
        res.status(404).json({ error: 'Utilisateur introuvable.' });
        return;
      }
      if (statut === 'CLOTURE') {
        await dbRun('DELETE FROM sessions WHERE user_id = ?', userId);
      }
      await logAccess(req.authUser!.id, 'ADMIN', userId, 'CHANGEMENT_STATUT', statut);
      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/coaches/:coachUserId/verification',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const coachUserId = Number(req.params.coachUserId);
      const body = (req.body || {}) as Record<string, unknown>;
      const verificationStatus = sanitizeText(body.verification_status, 20).toUpperCase();
      const adminReviewNote = sanitizeText(body.admin_review_note, 300) || null;
      const rejectionReasonInput = sanitizeText(body.rejection_reason, 240);

      if (!Number.isInteger(coachUserId) || coachUserId <= 0 || !['VERIFIE', 'EN_ATTENTE', 'REFUSE'].includes(verificationStatus)) {
        res.status(400).json({ error: 'Statut de vérification coach invalide.' });
        return;
      }

      const nextRejectionReason =
        verificationStatus === 'REFUSE'
          ? rejectionReasonInput || 'Justificatif ou diplôme non conforme aux critères Terrain+.'
          : null;

      const upd = await dbRun(
        'UPDATE coaches SET verification_status = ?, rejection_reason = ? WHERE user_id = ?',
        verificationStatus,
        nextRejectionReason,
        coachUserId
      );
      if (upd.changes === 0) {
        res.status(404).json({ error: 'Profil coach introuvable.' });
        return;
      }

      if (verificationStatus === 'VERIFIE') {
        await dbRun("UPDATE users SET statut = 'ACTIF' WHERE id = ? AND role = 'COACH' AND statut = 'INSCRIT'", coachUserId);
      } else {
        await dbRun('DELETE FROM sessions WHERE user_id = ?', coachUserId);
        await dbRun("UPDATE users SET statut = 'INSCRIT' WHERE id = ? AND role = 'COACH' AND statut = 'ACTIF'", coachUserId);
        if (verificationStatus === 'REFUSE') {
          await dbRun("UPDATE assignments SET statut = 'TERMINE', date_fin = date('now') WHERE coach_user_id = ? AND statut = 'ACTIF'", coachUserId);
        }
      }

      const latestDoc = await dbGet<{ id: number }>(
        'SELECT id FROM coach_documents WHERE coach_user_id = ? ORDER BY id DESC LIMIT 1',
        coachUserId
      );
      if (latestDoc) {
        await dbRun(
          `UPDATE coach_documents
           SET admin_review_note = COALESCE(?, admin_review_note),
               reviewed_by_user_id = ?,
               reviewed_at = datetime('now')
           WHERE id = ?`,
          adminReviewNote || nextRejectionReason,
          req.authUser!.id,
          latestDoc.id
        );
      }

      await logAccess(req.authUser!.id, 'ADMIN', coachUserId, 'VERIFICATION_COACH', verificationStatus);
      res.json({ ok: true, verification_status: verificationStatus, rejection_reason: nextRejectionReason });
    })
  );

  app.patch(
    '/api/admin/sessions/:sessionId/review',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
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

      const upd = await dbRun(
        'UPDATE sessions_library SET validation_status = ?, relue_par = ? WHERE id = ?',
        validationStatus,
        reluePar || null,
        sessionId
      );
      if (upd.changes === 0) {
        res.status(404).json({ error: 'Séance introuvable.' });
        return;
      }
      await logAccess(req.authUser!.id, 'ADMIN', null, 'RELECTURE_CONTENU', `session:${sessionId}:${validationStatus}`);
      res.json({ ok: true });
    })
  );

  // Admin: Direct Creation & Editing of Official Library Sessions
  app.post(
    '/api/admin/sessions',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const sport_code = sanitizeText(body.sport_code, 20) as SportCode;
      const titre = sanitizeText(body.titre, 140);
      const niveau = sanitizeText(body.niveau, 20) as AthleteLevel;
      const duree_min = Number(body.duree_min);
      const objectif = sanitizeText(body.objectif, 200);
      const prevention_focus = sanitizeText(body.prevention_focus, 140) || 'Général';
      const access_tier = sanitizeText(body.access_tier, 20).toUpperCase() === 'PROGRESSION' ? 'PROGRESSION' : 'ESSENTIEL';
      const validation_status = ['VALIDEE', 'EN_RELECTURE', 'BROUILLON'].includes(String(body.validation_status || ''))
        ? String(body.validation_status)
        : 'VALIDEE';
      const relue_par = sanitizeText(body.relue_par, 140) || 'Direction Technique Terrain+';
      const rawExercises = Array.isArray(body.exercises) ? body.exercises : [];

      if (!VALID_SPORT_CODES.includes(sport_code) || !titre || !['debutant', 'intermediaire', 'avance'].includes(niveau) || !objectif) {
        res.status(400).json({ error: 'Sport, titre, niveau et objectif sont requis.' });
        return;
      }

      const exercises = rawExercises
        .map((ex, idx) => {
          const item = (ex || {}) as Record<string, unknown>;
          const nom = sanitizeText(item.nom, 120);
          const consigneFr = sanitizeText(item.consigneFr, 400);
          if (!nom || !consigneFr) return null;
          return {
            id: sanitizeText(item.id, 60) || `adm-${Date.now()}-${idx + 1}`,
            nom,
            consigneFr,
            consigneWo: sanitizeText(item.consigneWo, 400) || 'Toppal ndigal yi ci ndànk.',
            varianteFacile: sanitizeText(item.varianteFacile, 200) || 'Rythme progressif et amplitude modérée',
            varianteDifficile: sanitizeText(item.varianteDifficile, 200) || 'Cadence soutenue',
            mode: item.mode === 'repetitions' ? 'repetitions' : 'duree',
            dureeSec: Math.min(300, Math.max(10, Number(item.dureeSec || 40))),
            repetitions: item.mode === 'repetitions' ? Math.min(100, Math.max(1, Number(item.repetitions || 12))) : undefined,
            reposSec: Math.min(180, Math.max(5, Number(item.reposSec || 20))),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (exercises.length === 0) {
        res.status(400).json({ error: 'Ajoutez au moins un exercice avec un nom et une consigne.' });
        return;
      }

      const ins = await dbRun(
        `INSERT INTO sessions_library (
          sport_code, titre, niveau, duree_min, objectif, prevention_focus,
          relue_par, validation_status, access_tier, proposee_par_user_id, exercises_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sport_code,
        titre,
        niveau,
        Number.isFinite(duree_min) ? Math.min(120, Math.max(10, Math.round(duree_min))) : 35,
        objectif,
        prevention_focus,
        validation_status === 'VALIDEE' ? relue_par : null,
        validation_status,
        access_tier,
        req.authUser!.id,
        JSON.stringify(exercises)
      );

      await logAccess(req.authUser!.id, 'ADMIN', null, 'CREATION_SEANCE_OFFICIELLE', `session:${ins.lastInsertRowid}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid), ok: true });
    })
  );

  app.put(
    '/api/admin/sessions/:sessionId',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const sessionId = parsePositiveIntId(req.params.sessionId);
      if (!sessionId) {
        res.status(400).json({ error: 'Identifiant de séance invalide.' });
        return;
      }
      const existing = await dbGet<{ id: number; exercises_json: string }>('SELECT id, exercises_json FROM sessions_library WHERE id = ?', sessionId);
      if (!existing) {
        res.status(404).json({ error: 'Séance introuvable.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const sport_code = sanitizeText(body.sport_code, 20) as SportCode;
      const titre = sanitizeText(body.titre, 140);
      const niveau = sanitizeText(body.niveau, 20) as AthleteLevel;
      const duree_min = Number(body.duree_min);
      const objectif = sanitizeText(body.objectif, 200);
      const prevention_focus = sanitizeText(body.prevention_focus, 140) || 'Général';
      const access_tier = sanitizeText(body.access_tier, 20).toUpperCase() === 'PROGRESSION' ? 'PROGRESSION' : 'ESSENTIEL';
      const validation_status = ['VALIDEE', 'EN_RELECTURE', 'BROUILLON'].includes(String(body.validation_status || ''))
        ? String(body.validation_status)
        : 'VALIDEE';
      const relue_par = sanitizeText(body.relue_par, 140) || 'Direction Technique Terrain+';

      if (!VALID_SPORT_CODES.includes(sport_code) || !titre || !['debutant', 'intermediaire', 'avance'].includes(niveau) || !objectif) {
        res.status(400).json({ error: 'Sport, titre, niveau et objectif sont requis.' });
        return;
      }

      let exercisesJson = existing.exercises_json;
      if (Array.isArray(body.exercises)) {
        const exercises = body.exercises
          .map((ex, idx) => {
            const item = (ex || {}) as Record<string, unknown>;
            const nom = sanitizeText(item.nom, 120);
            const consigneFr = sanitizeText(item.consigneFr, 400);
            if (!nom || !consigneFr) return null;
            return {
              id: sanitizeText(item.id, 60) || `adm-${Date.now()}-${idx + 1}`,
              nom,
              consigneFr,
              consigneWo: sanitizeText(item.consigneWo, 400) || 'Toppal ndigal yi ci ndànk.',
              varianteFacile: sanitizeText(item.varianteFacile, 200) || 'Rythme progressif et amplitude modérée',
              varianteDifficile: sanitizeText(item.varianteDifficile, 200) || 'Cadence soutenue',
              mode: item.mode === 'repetitions' ? 'repetitions' : 'duree',
              dureeSec: Math.min(300, Math.max(10, Number(item.dureeSec || 40))),
              repetitions: item.mode === 'repetitions' ? Math.min(100, Math.max(1, Number(item.repetitions || 12))) : undefined,
              reposSec: Math.min(180, Math.max(5, Number(item.reposSec || 20))),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (exercises.length === 0) {
          res.status(400).json({ error: 'La séance doit contenir au moins un exercice valide.' });
          return;
        }
        exercisesJson = JSON.stringify(exercises);
      }

      await dbRun(
        `UPDATE sessions_library
         SET sport_code = ?, titre = ?, niveau = ?, duree_min = ?, objectif = ?, prevention_focus = ?,
             access_tier = ?, validation_status = ?, relue_par = ?, exercises_json = ?
         WHERE id = ?`,
        sport_code,
        titre,
        niveau,
        Number.isFinite(duree_min) ? Math.min(120, Math.max(10, Math.round(duree_min))) : 35,
        objectif,
        prevention_focus,
        access_tier,
        validation_status,
        validation_status === 'VALIDEE' ? relue_par : null,
        exercisesJson,
        sessionId
      );

      await logAccess(req.authUser!.id, 'ADMIN', null, 'MODIFICATION_SEANCE_OFFICIELLE', `session:${sessionId}`);
      res.json({ ok: true });
    })
  );

  // Admin: Edit User Profile / Role / Tier Safely
  app.patch(
    '/api/admin/users/:userId/profile',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const userId = parsePositiveIntId(req.params.userId);
      if (!userId) {
        res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
        return;
      }
      const target = await dbGet<{ id: number; role: UserRole; statut: string }>('SELECT id, role, statut FROM users WHERE id = ?', userId);
      if (!target) {
        res.status(404).json({ error: 'Utilisateur introuvable.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const nextRole = sanitizeText(body.role || target.role, 20).toUpperCase() as UserRole;
      const nextStatut = sanitizeText(body.statut || target.statut, 20).toUpperCase();
      const sportCode = body.sport_code ? (sanitizeText(body.sport_code, 20) as SportCode) : null;
      const niveau = body.niveau ? (sanitizeText(body.niveau, 20) as AthleteLevel) : null;
      const planTier = body.plan_tier ? sanitizeText(body.plan_tier, 20).toUpperCase() : null;

      if (!['ATHLETE', 'COACH', 'ADMIN'].includes(nextRole)) {
        res.status(400).json({ error: 'Rôle invalide.' });
        return;
      }
      if (!['INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE'].includes(nextStatut)) {
        res.status(400).json({ error: 'Statut invalide.' });
        return;
      }

      if (userId === req.authUser!.id && (nextRole !== 'ADMIN' || nextStatut === 'CLOTURE')) {
        res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur.' });
        return;
      }

      if (target.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatut === 'CLOTURE')) {
        const activeAdmins = await dbGet<{ c: number }>(
          "SELECT COUNT(*) as c FROM users WHERE role = 'ADMIN' AND statut != 'CLOTURE' AND id != ?",
          userId
        );
        if (Number(activeAdmins?.c || 0) === 0) {
          res.status(400).json({ error: 'Action refusée : au moins un compte Administrateur actif doit rester sur la plateforme.' });
          return;
        }
      }

      await dbTransaction(async (tx) => {
        await tx.run('UPDATE users SET role = ?, statut = ? WHERE id = ?', nextRole, nextStatut, userId);
        if (nextStatut === 'CLOTURE') {
          await tx.run('DELETE FROM sessions WHERE user_id = ?', userId);
        }

        if (nextRole === 'ATHLETE') {
          const existingProfile = await tx.get<{ sport_code: SportCode; niveau: AthleteLevel; plan_tier: string; plan_fee_fcfa: number }>(
            'SELECT sport_code, niveau, plan_tier, plan_fee_fcfa FROM athlete_profiles WHERE user_id = ?',
            userId
          );
          const safeSport = sportCode && VALID_SPORT_CODES.includes(sportCode) ? sportCode : existingProfile?.sport_code || 'football';
          const safeNiveau = niveau && ['debutant', 'intermediaire', 'avance'].includes(niveau) ? niveau : existingProfile?.niveau || 'debutant';
          const safePlan = planTier && ['ESSENTIEL', 'PROGRESSION', 'COACH_PRIVE'].includes(planTier)
            ? planTier
            : existingProfile?.plan_tier || 'ESSENTIEL';
          const safeFee = safePlan === 'COACH_PRIVE' ? 5000 : safePlan === 'PROGRESSION' ? 1500 : 0;

          if (existingProfile) {
            await tx.run(
              `UPDATE athlete_profiles
               SET sport_code = ?, niveau = ?, plan_tier = ?, plan_fee_fcfa = ?,
                   coach_subscription_status = ?
               WHERE user_id = ?`,
              safeSport,
              safeNiveau,
              safePlan,
              safeFee,
              safePlan === 'COACH_PRIVE' ? 'ACTIF_5000' : 'GRATUIT_BASE',
              userId
            );
          } else {
            await tx.run(
              `INSERT INTO athlete_profiles (user_id, sport_code, niveau, plan_tier, plan_fee_fcfa, coach_subscription_status)
               VALUES (?, ?, ?, ?, ?, ?)`,
              userId,
              safeSport,
              safeNiveau,
              safePlan,
              safeFee,
              safePlan === 'COACH_PRIVE' ? 'ACTIF_5000' : 'GRATUIT_BASE'
            );
          }
        }

        await logAccess(req.authUser!.id, 'ADMIN', userId, 'EDITION_PROFIL_ADMIN', `role:${nextRole}:statut:${nextStatut}`, tx);
      });

      res.json({ ok: true });
    })
  );

  // Admin: Create Multi-Admin Account
  app.post(
    '/api/admin/admins',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const nom = sanitizeText(body.nom, 80);
      const prenom = sanitizeText(body.prenom, 80);
      const email = sanitizeText(body.email, 140).toLowerCase();
      const telephone = normalizePhone(sanitizeText(body.telephone, 30));
      const password = typeof body.password === 'string' ? body.password : '';
      const role = 'ADMIN';

      if (!nom || !prenom || !isValidEmail(email) || !isValidSenegalPhone(telephone)) {
        res.status(400).json({ error: 'Nom, prénom, email valide et numéro sénégalais (+221...) requis.' });
        return;
      }
      if (!isStrongPassword(password)) {
        res.status(400).json({ error: 'Mot de passe requis (8 caractères min, majuscule, minuscule et chiffre).' });
        return;
      }
      const existing = await dbGet('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR telephone = ?', email, telephone);
      if (existing) {
        res.status(409).json({ error: 'Un compte existe déjà avec cet email ou téléphone.' });
        return;
      }

      const pwHash = hashPassword(password);
      const ins = await dbRun(
        `INSERT INTO users (
          nom, prenom, telephone, email, password_hash, role, date_naissance, langue, statut, is_minor, verified
        ) VALUES (?, ?, ?, ?, ?, ?, '1990-01-01', 'fr', 'ACTIF', 0, 1)`,
        nom,
        prenom,
        telephone,
        email,
        pwHash,
        role
      );

      await logAccess(req.authUser!.id, 'ADMIN', Number(ins.lastInsertRowid), 'CREATION_COMPTE_ADMIN', `role:${role}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid), ok: true });
    })
  );

  // Admin: Finances, Transactions & Coach Payouts
  app.get(
    '/api/admin/finances',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (_req: AuthedRequest, res: Response) => {
      const now = new Date();
      const currentPeriodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const [txRows, payoutRows, coachEstimateRows] = await Promise.all([
        dbAll<Record<string, unknown>>(
          `SELECT pt.*,
                  (u.prenom || ' ' || u.nom) as user_nom,
                  u.email as user_email,
                  (uc.prenom || ' ' || uc.nom) as coach_nom
           FROM payment_transactions pt
           LEFT JOIN users u ON u.id = pt.user_id
           LEFT JOIN users uc ON uc.id = pt.coach_user_id
           ORDER BY pt.id DESC
           LIMIT 200`
        ),
        dbAll<Record<string, unknown>>(
          `SELECT cp.*,
                  (u.prenom || ' ' || u.nom) as coach_nom,
                  u.email as coach_email,
                  c.coach_plan
           FROM coach_payouts cp
           JOIN users u ON u.id = cp.coach_user_id
           JOIN coaches c ON c.user_id = cp.coach_user_id
           ORDER BY cp.period_month DESC, cp.id DESC
           LIMIT 120`
        ),
        dbAll<{
          coach_user_id: number;
          coach_nom: string;
          coach_email: string;
          coach_telephone: string;
          coach_plan: 'MARKETPLACE' | 'COACH_PRO';
          commission_pct: number;
          active_athletes_count: number;
        }>(
          `SELECT u.id as coach_user_id,
                  (u.prenom || ' ' || u.nom) as coach_nom,
                  u.email as coach_email,
                  u.telephone as coach_telephone,
                  c.coach_plan,
                  COALESCE(c.commission_pct, 20) as commission_pct,
                  COUNT(a.id) as active_athletes_count
           FROM users u
           JOIN coaches c ON c.user_id = u.id
           LEFT JOIN assignments a ON a.coach_user_id = u.id AND a.statut = 'ACTIF'
           WHERE u.role = 'COACH' AND u.statut != 'CLOTURE' AND c.verification_status = 'VERIFIE'
           GROUP BY u.id, u.prenom, u.nom, u.email, u.telephone, c.coach_plan, c.commission_pct
           ORDER BY active_athletes_count DESC, u.nom ASC`
        ),
      ]);

      const transactions = txRows.map((r) => ({
        id: Number(r.id),
        user_id: r.user_id ? Number(r.user_id) : null,
        user_nom: r.user_nom ? String(r.user_nom) : null,
        user_email: r.user_email ? String(r.user_email) : null,
        coach_user_id: r.coach_user_id ? Number(r.coach_user_id) : null,
        coach_nom: r.coach_nom ? String(r.coach_nom) : null,
        category: String(r.category),
        label: String(r.label),
        amount_fcfa: Number(r.amount_fcfa || 0),
        platform_share_fcfa: Number(r.platform_share_fcfa || 0),
        coach_share_fcfa: Number(r.coach_share_fcfa || 0),
        payment_method: String(r.payment_method),
        reference: r.reference ? String(r.reference) : null,
        status: String(r.status),
        notes: r.notes ? String(r.notes) : null,
        created_at: String(r.created_at),
      }));

      const payouts = payoutRows.map((p) => ({
        id: Number(p.id),
        coach_user_id: Number(p.coach_user_id),
        coach_nom: String(p.coach_nom),
        coach_email: String(p.coach_email),
        coach_plan: String(p.coach_plan),
        period_month: String(p.period_month),
        active_athletes_count: Number(p.active_athletes_count || 0),
        gross_amount_fcfa: Number(p.gross_amount_fcfa || 0),
        commission_fcfa: Number(p.commission_fcfa || 0),
        net_payout_fcfa: Number(p.net_payout_fcfa || 0),
        payment_method: String(p.payment_method),
        reference: p.reference ? String(p.reference) : null,
        status: String(p.status),
        paid_at: p.paid_at ? String(p.paid_at) : null,
        created_at: String(p.created_at),
      }));

      const currentPayoutByCoach = new Map<number, (typeof payouts)[number]>();
      for (const p of payouts) {
        if (p.period_month === currentPeriodMonth) {
          currentPayoutByCoach.set(p.coach_user_id, p);
        }
      }

      const monthlyCoachEstimates = coachEstimateRows.map((c) => {
        const activeCount = Number(c.active_athletes_count || 0);
        const gross = activeCount * 5000;
        const pct = c.coach_plan === 'COACH_PRO' ? 0 : Number(c.commission_pct ?? 20);
        const commission = Math.round((gross * pct) / 100);
        const net = Math.max(0, gross - commission);
        return {
          coach_user_id: Number(c.coach_user_id),
          coach_nom: String(c.coach_nom),
          coach_email: String(c.coach_email),
          coach_telephone: String(c.coach_telephone),
          coach_plan: c.coach_plan,
          active_athletes_count: activeCount,
          gross_amount_fcfa: gross,
          commission_fcfa: commission,
          net_payout_fcfa: net,
          existing_payout: currentPayoutByCoach.get(Number(c.coach_user_id)) || null,
        };
      });

      const collectedTotalFcfa = transactions
        .filter((t) => t.status === 'PAYE')
        .reduce((acc, t) => acc + t.amount_fcfa, 0);
      const collectedPlatformFcfa = transactions
        .filter((t) => t.status === 'PAYE')
        .reduce((acc, t) => acc + t.platform_share_fcfa, 0);
      const pendingTotalFcfa = transactions
        .filter((t) => t.status === 'EN_ATTENTE')
        .reduce((acc, t) => acc + t.amount_fcfa, 0);
      const failedCount = transactions.filter((t) => t.status === 'ECHOUE').length;
      const estimatedMonthlyCoachPayoutFcfa = monthlyCoachEstimates.reduce((acc, e) => acc + e.net_payout_fcfa, 0);
      const paidOutCurrentMonthFcfa = payouts
        .filter((p) => p.period_month === currentPeriodMonth && p.status === 'VERSE')
        .reduce((acc, p) => acc + p.net_payout_fcfa, 0);

      res.json({
        currentPeriodMonth,
        summary: {
          collectedTotalFcfa,
          collectedPlatformFcfa,
          pendingTotalFcfa,
          failedCount,
          estimatedMonthlyCoachPayoutFcfa,
          paidOutCurrentMonthFcfa,
        },
        transactions,
        payouts,
        monthlyCoachEstimates,
      });
    })
  );

  app.post(
    '/api/admin/transactions',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const userId = body.user_id ? parsePositiveIntId(body.user_id) : null;
      const coachUserId = body.coach_user_id ? parsePositiveIntId(body.coach_user_id) : null;
      const category = sanitizeText(body.category || 'AUTRE', 30).toUpperCase();
      const label = sanitizeText(body.label, 140);
      const amount = Math.round(Number(body.amount_fcfa || 0));
      const paymentMethod = sanitizeText(body.payment_method || 'WAVE', 20).toUpperCase();
      const reference = sanitizeText(body.reference, 80) || null;
      const status = sanitizeText(body.status || 'PAYE', 20).toUpperCase();
      const notes = sanitizeText(body.notes, 240) || null;

      if (
        !label ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !['ATHLETE_PLAN', 'COACH_PRO_LICENSE', 'COACH_PRIVATE_FEE', 'AUTRE'].includes(category) ||
        !['WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'CARTE', 'ESPECES', 'MANUEL'].includes(paymentMethod) ||
        !['PAYE', 'EN_ATTENTE', 'ECHOUE', 'REMBOURSE'].includes(status)
      ) {
        res.status(400).json({ error: 'Libellé, montant positif, catégorie et méthode de paiement valides requis.' });
        return;
      }

      let platformShare = amount;
      let coachShare = 0;
      if (category === 'COACH_PRIVATE_FEE' && coachUserId) {
        const cRow = await dbGet<{ commission_pct: number }>('SELECT commission_pct FROM coaches WHERE user_id = ?', coachUserId);
        const pct = Number(cRow?.commission_pct ?? 20);
        platformShare = Math.round((amount * pct) / 100);
        coachShare = Math.max(0, amount - platformShare);
      }

      const ins = await dbRun(
        `INSERT INTO payment_transactions (
          user_id, coach_user_id, category, label, amount_fcfa, platform_share_fcfa, coach_share_fcfa,
          payment_method, reference, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        coachUserId,
        category,
        label,
        amount,
        platformShare,
        coachShare,
        paymentMethod,
        reference,
        status,
        notes
      );

      await logAccess(req.authUser!.id, 'ADMIN', userId, 'ENREGISTREMENT_TRANSACTION', `tx:${ins.lastInsertRowid}:${amount}`);
      res.status(201).json({ id: Number(ins.lastInsertRowid), ok: true });
    })
  );

  app.patch(
    '/api/admin/transactions/:id',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const txId = parsePositiveIntId(req.params.id);
      const status = sanitizeText((req.body as Record<string, unknown>).status, 20).toUpperCase();
      if (!txId || !['PAYE', 'EN_ATTENTE', 'ECHOUE', 'REMBOURSE'].includes(status)) {
        res.status(400).json({ error: 'Transaction ou statut invalide.' });
        return;
      }
      const upd = await dbRun('UPDATE payment_transactions SET status = ? WHERE id = ?', status, txId);
      if (upd.changes === 0) {
        res.status(404).json({ error: 'Transaction introuvable.' });
        return;
      }
      await logAccess(req.authUser!.id, 'ADMIN', null, 'STATUT_TRANSACTION', `tx:${txId}:${status}`);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/coach-payouts',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const coachUserId = parsePositiveIntId(body.coach_user_id);
      const periodMonth = sanitizeText(body.period_month, 7);
      const paymentMethod = sanitizeText(body.payment_method || 'WAVE', 20).toUpperCase();
      const reference = sanitizeText(body.reference, 80) || null;
      const status = sanitizeText(body.status || 'VERSE', 20).toUpperCase() === 'EN_ATTENTE' ? 'EN_ATTENTE' : 'VERSE';

      if (
        !coachUserId ||
        !/^\d{4}-\d{2}$/.test(periodMonth) ||
        !['WAVE', 'ORANGE_MONEY', 'VIREMENT', 'ESPECES'].includes(paymentMethod)
      ) {
        res.status(400).json({ error: 'Coach, période (YYYY-MM) et moyen de versement requis.' });
        return;
      }

      const coachInfo = await dbGet<{ coach_plan: string; commission_pct: number; active_count: number }>(
        `SELECT c.coach_plan, COALESCE(c.commission_pct, 20) as commission_pct,
                (SELECT COUNT(*) FROM assignments a WHERE a.coach_user_id = c.user_id AND a.statut = 'ACTIF') as active_count
         FROM coaches c
         WHERE c.user_id = ?`,
        coachUserId
      );
      if (!coachInfo) {
        res.status(404).json({ error: 'Coach introuvable.' });
        return;
      }

      const activeCount = Number(coachInfo.active_count || 0);
      const grossAmount = activeCount * 5000;
      const pct = coachInfo.coach_plan === 'COACH_PRO' ? 0 : Number(coachInfo.commission_pct ?? 20);
      const commission = Math.round((grossAmount * pct) / 100);
      const netPayout = Math.max(0, grossAmount - commission);

      await dbRun(
        `INSERT INTO coach_payouts (
          coach_user_id, period_month, active_athletes_count, gross_amount_fcfa, commission_fcfa, net_payout_fcfa,
          payment_method, reference, status, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(coach_user_id, period_month) DO UPDATE SET
          active_athletes_count = excluded.active_athletes_count,
          gross_amount_fcfa = excluded.gross_amount_fcfa,
          commission_fcfa = excluded.commission_fcfa,
          net_payout_fcfa = excluded.net_payout_fcfa,
          payment_method = excluded.payment_method,
          reference = COALESCE(excluded.reference, coach_payouts.reference),
          status = excluded.status,
          paid_at = CASE WHEN excluded.status = 'VERSE' THEN datetime('now') ELSE NULL END`,
        coachUserId,
        periodMonth,
        activeCount,
        grossAmount,
        commission,
        netPayout,
        paymentMethod,
        reference,
        status,
        status === 'VERSE' ? new Date().toISOString() : null
      );

      await logAccess(req.authUser!.id, 'ADMIN', coachUserId, 'REVERSEMENT_COACH', `${periodMonth}:${netPayout}:${status}`);
      res.status(201).json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/coach-payouts/:id',
    requireAuth,
    requireRole('ADMIN'),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const payoutId = parsePositiveIntId(req.params.id);
      const body = (req.body || {}) as Record<string, unknown>;
      const status = sanitizeText(body.status, 20).toUpperCase();
      if (!payoutId || !['EN_ATTENTE', 'VERSE'].includes(status)) {
        res.status(400).json({ error: 'Reversement ou statut invalide.' });
        return;
      }
      const upd = await dbRun(
        `UPDATE coach_payouts
         SET status = ?, paid_at = CASE WHEN ? = 'VERSE' THEN datetime('now') ELSE NULL END
         WHERE id = ?`,
        status,
        status,
        payoutId
      );
      if (upd.changes === 0) {
        res.status(404).json({ error: 'Reversement introuvable.' });
        return;
      }
      await logAccess(req.authUser!.id, 'ADMIN', null, 'STATUT_REVERSEMENT', `payout:${payoutId}:${status}`);
      res.json({ ok: true });
    })
  );


  // ---------------- SERVER-SIDE GEMINI TTS CUE GENERATION ----------------
  const ttsCueCache = new Map<string, Buffer>();
  const TTS_CACHE_MAX = 140;

  app.post(
    '/api/tts/cue',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        res.status(503).json({ error: 'Voix de coaching serveur non configurée.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const rawText = sanitizeText(body.text, 280);
      const lang: 'fr' | 'wo' = body.lang === 'wo' ? 'wo' : 'fr';

      if (!rawText || rawText.length < 2) {
        res.status(400).json({ error: 'Texte de consigne vocale requis.' });
        return;
      }

      const rl = await checkRateLimitDistributed(`tts:${req.authUser!.id}`, 120, 15 * 60 * 1000);
      if (!rl.allowed) {
        res.status(429).json({ error: 'Limite de synthèse vocale atteinte momentanément.' });
        return;
      }

      const voiceName = 'Kore';
      const cacheKey = `${lang}:${voiceName}:${rawText}`;
      const cached = ttsCueCache.get(cacheKey);
      if (cached) {
        // Refresh LRU position
        ttsCueCache.delete(cacheKey);
        ttsCueCache.set(cacheKey, cached);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.send(cached);
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const stylePrompt =
        lang === 'wo'
          ? 'Coach sportif professionnel sénégalais, voix posée, fluide, chaleureuse et dynamique, diction naturelle et rythme entraînant'
          : 'Coach sportif francophone professionnel, voix fluide, posée, chaleureuse et dynamique, élocution claire et rythme naturel sans lenteur';

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: rawText,
                  speechMetadata: {
                    style: stylePrompt,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          res.status(502).json({ error: 'Réponse audio vide du service vocal.' });
          return;
        }

        const audioBuffer = Buffer.from(base64Audio, 'base64');
        if (ttsCueCache.size >= TTS_CACHE_MAX) {
          const oldestKey = ttsCueCache.keys().next().value;
          if (oldestKey) ttsCueCache.delete(oldestKey);
        }
        ttsCueCache.set(cacheKey, audioBuffer);

        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.send(audioBuffer);
      } catch (err) {
        console.error('[TTS] Erreur de synthèse vocale:', err instanceof Error ? err.message : err);
        res.status(502).json({ error: 'Service de synthèse vocale momentanément indisponible.' });
      }
    })
  );

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

  // ---------------- VITE / STATIC SERVING (disabled on Vercel CDN) ----------------
  if (!process.env.VERCEL) {
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
      const { createServer: createViteServer } = await import('vite');
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
  }

  return app;
}

if (!process.env.VERCEL && import.meta?.url && process.argv[1]) {
  const currentFilePath = fileURLToPath(import.meta.url);
  const isMainModule = path.resolve(process.argv[1]) === currentFilePath;
  if (isMainModule) {
    (async () => {
      await ensureAppReady();
      const app = await createApp();
      const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist/index.html'));
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
        console.log(`Terrain+ server listening on http://0.0.0.0:${port} (${USE_POSTGRES ? 'Supabase Postgres' : 'SQLite local'})`);
      });
    })().catch((err) => {
      console.error('Failed to start Terrain+ server:', err);
      process.exit(1);
    });
  }
}
