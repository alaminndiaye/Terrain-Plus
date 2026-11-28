import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getFixedConsultationBreakdown, signSandboxWebhook, verifyWebhookSignature } from '@/lib/adapters/payment';
import { assertNeutralNotificationText, NEUTRAL_TEMPLATES } from '@/lib/adapters/notifications';
import { detectHeadTraumaKeywords, evaluatePreventionSignals } from '@/lib/prevention/alerts';
import {
  computeAgeFromBirthDate,
  decryptText,
  deriveAuthEmail,
  encryptText,
  hashPassword,
  isAdultBirthDate,
  normalizePhone,
  verifyPassword,
} from '@/lib/security/crypto';
import { detectMediaFromMagicBytes, validateCaseAttachment, validateDoctorEvidence } from '@/lib/security/files';
import type { TrainingLog } from '@/lib/types';

describe('Domain Security, Age Gate, Encryption & Media Validation', () => {
  it('enforces 18+ adult birth date gate accurately across boundary dates', () => {
    const refNow = new Date('2026-06-15T12:00:00Z');
    expect(computeAgeFromBirthDate('2008-06-15', refNow)).toBe(18);
    expect(isAdultBirthDate('2008-06-15', refNow)).toBe(true);
    expect(isAdultBirthDate('2008-06-16', refNow)).toBe(false);
    expect(isAdultBirthDate('2012-01-01', refNow)).toBe(false);
    expect(isAdultBirthDate('invalid-date', refNow)).toBe(false);
  });

  it('normalizes Senegalese phone numbers and derives internal auth email safely', () => {
    expect(normalizePhone('77 123 45 67')).toBe('+221771234567');
    expect(normalizePhone('00221 78-999-00-11')).toBe('+221789990011');
    expect(normalizePhone('1234')).toBe('');
    expect(deriveAuthEmail('+221771234567')).toBe('sportif_221771234567@phone.terrainplus.local');
    expect(deriveAuthEmail('+221771234567', 'Athlete@Example.SN')).toBe('athlete@example.sn');
  });

  it('encrypts and decrypts medical strings with AES-256-GCM without leaking plaintext', () => {
    const key = crypto.randomBytes(32);
    const secret = 'Entorse grade 2 cheville droite après réception rebond';
    const cipher = encryptText(secret, key);
    expect(cipher).not.toContain('Entorse');
    expect(cipher.split(':')).toHaveLength(3);
    expect(decryptText(cipher, key)).toBe(secret);

    const hashed = hashPassword('MonMotDePasse8!');
    expect(verifyPassword('MonMotDePasse8!', hashed)).toBe(true);
    expect(verifyPassword('MauvaisMotDePasse', hashed)).toBe(false);
  });

  it('validates media files strictly by magic bytes (images, PDF, MP4/WebM) and rejects spoofed binaries', () => {
    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const pdfHeader = Buffer.from('%PDF-1.7\n1 0 obj', 'ascii');
    const mp4Header = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42', 'ascii'), Buffer.alloc(16)]);
    const exeSpoofAsPng = Buffer.from('MZ\x90\x00ThisIsExecutableNotPng');

    expect(detectMediaFromMagicBytes(jpgHeader)?.mimeType).toBe('image/jpeg');
    expect(detectMediaFromMagicBytes(pdfHeader)?.mimeType).toBe('application/pdf');
    expect(detectMediaFromMagicBytes(mp4Header)?.mimeType).toBe('video/mp4');
    expect(detectMediaFromMagicBytes(exeSpoofAsPng)).toBeNull();

    expect(() => validateCaseAttachment(exeSpoofAsPng, 1024, 'radio.png')).toThrow('UNSUPPORTED_FILE_TYPE');
    expect(() => validateCaseAttachment(jpgHeader, 15 * 1024 * 1024, 'big.jpg')).toThrow('FILE_TOO_LARGE');
    expect(validateCaseAttachment(mp4Header, 20 * 1024 * 1024, 'match.mp4').mediaKind).toBe('video');
    expect(() => validateDoctorEvidence(mp4Header, 1024, 'carte.mp4')).toThrow('UNSUPPORTED_FILE_TYPE');
    expect(validateDoctorEvidence(pdfHeader, 1024, 'carte_ordre.pdf').mimeType).toBe('application/pdf');
  });

  it('enforces fixed 10 000 FCFA fee breakdown (10% fee / 9 000 FCFA net) and HMAC webhook verification', () => {
    const breakdown = getFixedConsultationBreakdown();
    expect(breakdown.grossAmountFcfa).toBe(10000);
    expect(breakdown.platformCommissionFcfa).toBe(1000);
    expect(breakdown.doctorNetFcfa).toBe(9000);
    expect(breakdown.commissionRatePercent).toBe(10);

    const { rawPayload, signature } = signSandboxWebhook(
      { eventId: 'evt_1', paymentId: 'pay_1', outcome: 'succeeded' },
      'secret-test'
    );
    expect(() => verifyWebhookSignature(rawPayload, signature, 'secret-test')).not.toThrow();
    expect(() => verifyWebhookSignature(rawPayload, signature, 'wrong-secret')).toThrow();
  });

  it('blocks medical leaks in push/SMS notifications', () => {
    for (const tpl of Object.values(NEUTRAL_TEMPLATES)) {
      expect(() => assertNeutralNotificationText(tpl.title, tpl.body)).not.toThrow();
    }
    expect(() =>
      assertNeutralNotificationText('Alerte Terrain+', 'Votre douleur au genou nécessite un examen')
    ).toThrow();
  });

  it('produces deterministic non-diagnostic prevention vigilance signals and head trauma detection', () => {
    const sampleLogs: TrainingLog[] = [
      {
        id: '1',
        athlete_id: 'a1',
        session_date: '2026-06-15',
        sport: 'basketball',
        session_type: 'match',
        duration_minutes: 60,
        rpe_intensity: 9,
        fatigue_score: 5,
        sleep_score: 2,
        recovery_score: 2,
        has_discomfort: true,
        discomfort_level: 4,
        body_part: 'cheville_pied',
        performance_stats_json: {},
        created_at: '2026-06-15T18:00:00Z',
      },
      {
        id: '2',
        athlete_id: 'a1',
        session_date: '2026-06-13',
        sport: 'basketball',
        session_type: 'training',
        duration_minutes: 75,
        rpe_intensity: 8,
        fatigue_score: 4,
        sleep_score: 3,
        recovery_score: 2,
        has_discomfort: true,
        discomfort_level: 3,
        body_part: 'cheville_pied',
        performance_stats_json: {},
        created_at: '2026-06-13T18:00:00Z',
      },
      {
        id: '3',
        athlete_id: 'a1',
        session_date: '2026-06-10',
        sport: 'basketball',
        session_type: 'training',
        duration_minutes: 60,
        rpe_intensity: 6,
        fatigue_score: 2,
        sleep_score: 4,
        recovery_score: 4,
        has_discomfort: false,
        discomfort_level: 1,
        body_part: null,
        performance_stats_json: {},
        created_at: '2026-06-10T18:00:00Z',
      },
    ];

    const signals = evaluatePreventionSignals(sampleLogs);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals.some((s) => s.id === 'discomfort_cheville_pied')).toBe(true);
    expect(signals.some((s) => s.id === 'rising_fatigue')).toBe(true);
    for (const s of signals) {
      expect(s.disclaimer.toLowerCase()).toContain('diagnostic');
      expect(s.message.toLowerCase()).not.toContain('apte');
    }

    expect(detectHeadTraumaKeywords('Choc à la tête lors du duel')).toBe(true);
    expect(detectHeadTraumaKeywords('Simple tiraillement mollet')).toBe(false);
  });
});
