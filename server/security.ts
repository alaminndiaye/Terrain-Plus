import crypto from 'node:crypto';
import type { Request, Response } from 'express';

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

export function hashToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'terrain-plus-dev-secret-change-in-production';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function verifyTokenHash(rawToken: string, expectedHexHash: string): boolean {
  if (!rawToken || !expectedHexHash) return false;
  const actualBuf = Buffer.from(hashToken(rawToken), 'hex');
  const expectedBuf = Buffer.from(expectedHexHash, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
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

const buckets = new Map<string, RateBucket>();

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
