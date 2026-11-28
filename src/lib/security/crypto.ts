import crypto from 'node:crypto';
import { getAppConfig } from '../config';

export function randomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomNumericCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signHmacHex(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(String(payload)).digest('hex');
}

export function verifyHmacHex(payload: string, signatureHex: string, secret: string): boolean {
  if (!signatureHex || typeof signatureHex !== 'string') return false;
  const expectedHex = signHmacHex(payload, secret);
  const actualBuf = Buffer.from(signatureHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function encryptText(plainText: string | null | undefined, keyBuffer?: Buffer): string {
  if (plainText === null || plainText === undefined) return '';
  const key = keyBuffer ?? getAppConfig().encryptionKeyBuffer;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptText(cipherPayload: string | null | undefined, keyBuffer?: Buffer): string {
  if (!cipherPayload) return '';
  const parts = String(cipherPayload).split(':');
  if (parts.length !== 3) return String(cipherPayload);
  const key = keyBuffer ?? getAppConfig().encryptionKeyBuffer;
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Normalize Senegalese / E.164 phone numbers cleanly.
 * Accepts local 9-digit numbers starting with 70/75/76/77/78/33 and normalizes to +221XXXXXXXXX.
 */
export function normalizePhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s().-]/g, '');
  if (/^\+221[0-9]{9}$/.test(cleaned)) return cleaned;
  if (/^00221[0-9]{9}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^221[0-9]{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^(70|75|76|77|78|33)[0-9]{7}$/.test(cleaned)) return `+221${cleaned}`;
  if (/^\+[1-9][0-9]{7,14}$/.test(cleaned)) return cleaned;
  return '';
}

export function computeAgeFromBirthDate(birthDateStr: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDateStr || ''))) return null;
  const [y, m, d] = birthDateStr.split('-').map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dob.getTime())) return null;

  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) {
    age -= 1;
  }
  return age;
}

export function isAdultBirthDate(birthDateStr: string, now = new Date()): boolean {
  const age = computeAgeFromBirthDate(birthDateStr, now);
  return age !== null && age >= 18 && age <= 110;
}

/**
 * Derive an internal synthetic email for Supabase Auth when athlete registers solely via phone + password,
 * ensuring compatibility with Supabase Cloud projects where Phone Auth provider is disabled.
 */
export function deriveAuthEmail(phone: string, optionalEmail?: string | null): string {
  const cleanEmail = String(optionalEmail || '').trim().toLowerCase();
  if (cleanEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return cleanEmail;
  }
  const digits = phone.replace(/[^0-9]/g, '');
  return `sportif_${digits}@phone.terrainplus.local`;
}
