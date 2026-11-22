import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { USE_POSTGRES, dbGet, dbRun } from './database.ts';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  return `${salt}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const EPHEMERAL_RUNTIME_SECRET = crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
  console.warn('[SECURITY] SESSION_SECRET manquant en production : définissez SESSION_SECRET dans les variables d’environnement Vercel.');
}

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const envSeed = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL;
  if (envSeed) {
    return crypto.createHash('sha256').update(`terrain-plus-session-key:${envSeed}`).digest('hex');
  }
  return EPHEMERAL_RUNTIME_SECRET;
}

export function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', resolveSessionSecret()).update(rawToken).digest('hex');
}

export function verifyTokenHash(rawToken: string, expectedHexHash: string): boolean {
  if (!rawToken || !expectedHexHash) return false;
  const actualBuf = Buffer.from(hashToken(rawToken), 'hex');
  const expectedBuf = Buffer.from(expectedHexHash, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function createScopedActionToken(userId: number, purpose: string, ttlSec = 1800): string {
  const payload = {
    userId,
    purpose,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', resolveSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyScopedActionToken(token: string, expectedPurpose: string): { userId: number } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', resolveSessionSecret()).update(encoded).digest('base64url');
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      userId?: unknown;
      purpose?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.userId !== 'number' ||
      !Number.isInteger(parsed.userId) ||
      parsed.userId <= 0 ||
      parsed.purpose !== expectedPurpose ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export function isStrongPassword(password: string): boolean {
  if (password.length < 8 || password.length > 128) return false;
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export const SESSION_COOKIE_NAME = 'tp_session';

export function setSessionCookie(req: Request, res: Response, rawToken: string, maxAgeSec: number): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const flags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps) {
    flags.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const flags = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) {
    flags.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00221')) {
    return '+221' + cleaned.slice(5);
  }
  if (/^7[05678]\d{7}$/.test(cleaned)) {
    return '+221' + cleaned;
  }
  return cleaned;
}

export function isValidSenegalPhone(phone: string): boolean {
  const norm = normalizePhone(phone);
  return /^\+2217[05678]\d{7}$/.test(norm);
}

export function computeAge(dateNaissance: string): number {
  const dob = new Date(dateNaissance);
  if (Number.isNaN(dob.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function sanitizeText(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
  backend: 'upstash' | 'postgres' | 'sqlite' | 'memory';
}

const buckets = new Map<string, RateBucket>();
let rateLimitOpsCount = 0;

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim().slice(0, 64);
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim().slice(0, 64);
  }
  return (req.ip || req.socket?.remoteAddress || 'local').slice(0, 64);
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 2000) {
    for (const [bKey, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(bKey);
      }
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  return true;
}

function checkRateLimitMemoryResult(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const allowed = checkRateLimit(key, maxRequests, windowMs);
  const current = buckets.get(key);
  const resetAtMs = current ? current.resetAt : now + windowMs;
  const count = current ? current.count : 1;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - count),
    resetAtMs,
    retryAfterSec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
    backend: 'memory',
  };
}

async function checkUpstashRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const restUrl = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const restToken = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!restUrl || !restToken) return null;

  const redisKey = `tp:rl:${key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PTTL', redisKey],
      ]),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as Array<{ result?: number | string | null; error?: string }>;
    const count = Number(payload?.[0]?.result ?? 0);
    let pttl = Number(payload?.[1]?.result ?? -1);
    if (!Number.isFinite(count) || count <= 0) return null;

    if (pttl < 0 || count === 1) {
      pttl = windowMs;
      void fetch(`${restUrl}/pexpire/${encodeURIComponent(redisKey)}/${windowMs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${restToken}` },
      }).catch(() => undefined);
    }

    const now = Date.now();
    const resetAtMs = now + Math.max(1000, pttl);
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetAtMs,
      retryAfterSec: Math.max(1, Math.ceil(pttl / 1000)),
      backend: 'upstash',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkRateLimitDistributed(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const upstashRes = await checkUpstashRateLimit(key, maxRequests, windowMs);
  if (upstashRes) return upstashRes;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nextResetIso = new Date(now + windowMs).toISOString();
  const safeKey = key.slice(0, 180);

  try {
    let row: { count: number; reset_at: string } | undefined;
    if (USE_POSTGRES) {
      row = await dbGet<{ count: number; reset_at: string }>(
        `INSERT INTO rate_limit_buckets (key, count, reset_at, updated_at)
         VALUES (?, 1, ?::timestamptz, NOW())
         ON CONFLICT (key) DO UPDATE SET
           count = CASE
             WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
             ELSE rate_limit_buckets.count + 1
           END,
           reset_at = CASE
             WHEN rate_limit_buckets.reset_at <= NOW() THEN ?::timestamptz
             ELSE rate_limit_buckets.reset_at
           END,
           updated_at = NOW()
         RETURNING count, reset_at`,
        safeKey,
        nextResetIso,
        nextResetIso
      );
    } else {
      row = await dbGet<{ count: number; reset_at: string }>(
        `INSERT INTO rate_limit_buckets (key, count, reset_at, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE
             WHEN rate_limit_buckets.reset_at <= ? THEN 1
             ELSE rate_limit_buckets.count + 1
           END,
           reset_at = CASE
             WHEN rate_limit_buckets.reset_at <= ? THEN ?
             ELSE rate_limit_buckets.reset_at
           END,
           updated_at = ?
         RETURNING count, reset_at`,
        safeKey,
        nextResetIso,
        nowIso,
        nowIso,
        nowIso,
        nextResetIso,
        nowIso
      );
    }

    rateLimitOpsCount += 1;
    if (rateLimitOpsCount % 120 === 0) {
      if (USE_POSTGRES) {
        void dbRun('DELETE FROM rate_limit_buckets WHERE reset_at < NOW()').catch(() => undefined);
      } else {
        void dbRun('DELETE FROM rate_limit_buckets WHERE reset_at < ?', nowIso).catch(() => undefined);
      }
    }

    if (row) {
      const count = Number(row.count) || 1;
      const parsedResetMs = new Date(row.reset_at).getTime();
      const resetAtMs = Number.isFinite(parsedResetMs) ? parsedResetMs : now + windowMs;
      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetAtMs,
        retryAfterSec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
        backend: USE_POSTGRES ? 'postgres' : 'sqlite',
      };
    }
  } catch (err) {
    console.warn('[SECURITY] Rate limiter DB indisponible, repli mémoire:', err instanceof Error ? err.message : err);
  }

  return checkRateLimitMemoryResult(safeKey, maxRequests, windowMs);
}
