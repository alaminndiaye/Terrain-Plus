export const CONSULTATION_PRICE_FCFA = 10000;
export const PLATFORM_COMMISSION_RATE = 0.1;
export const PLATFORM_COMMISSION_FCFA = 1000;
export const DOCTOR_NET_FCFA = 9000;

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 Mo
export const MAX_IMAGE_OR_DOC_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 Mo

export const SUPPORTED_SPORTS = [
  { code: 'football', label: 'Football' },
  { code: 'basketball', label: 'Basketball' },
  { code: 'athletisme', label: 'Athlétisme / Course' },
  { code: 'lutte_arts_martiaux', label: 'Lutte / Arts martiaux' },
  { code: 'handball', label: 'Handball' },
  { code: 'volleyball', label: 'Volleyball' },
  { code: 'fitness_musculation', label: 'Fitness / Musculation' },
  { code: 'tennis_padel', label: 'Tennis / Padel' },
  { code: 'natation', label: 'Natation' },
  { code: 'autre', label: 'Autre sport' },
] as const;

export const BODY_PART_OPTIONS = [
  { code: 'cheville_pied', label: 'Cheville / Pied' },
  { code: 'genou', label: 'Genou' },
  { code: 'cuisse_ischio', label: 'Cuisse / Ischios / Quadriceps' },
  { code: 'mollet_achille', label: 'Mollet / Tendon d’Achille' },
  { code: 'hanche_adducteurs', label: 'Hanche / Bassin / Adducteurs' },
  { code: 'dos_lombaires', label: 'Dos / Lombaires' },
  { code: 'epaule_bras', label: 'Épaule / Bras' },
  { code: 'coude_poignet_main', label: 'Coude / Poignet / Main' },
  { code: 'tete', label: 'Tête / Choc crânien' },
  { code: 'autre', label: 'Autre localisation' },
] as const;

export function getAppConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const demoMode = (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true';

  const rawEncKey = (process.env.DATA_ENCRYPTION_KEY || '').trim();
  let encryptionKeyBuffer: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(rawEncKey)) {
    encryptionKeyBuffer = Buffer.from(rawEncKey, 'hex');
  } else if (!isProd) {
    // Fallback strictly for local dev/test without configured key
    encryptionKeyBuffer = Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'hex'
    );
  } else {
    throw new Error('DATA_ENCRYPTION_KEY (64 hex chars) is required in production.');
  }

  const sessionSecret =
    (process.env.SESSION_SECRET || '').trim() ||
    (isProd ? '' : 'dev-session-secret-change-in-production-64-chars-minimum-value');
  if (isProd && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET (>= 32 chars) is required in production.');
  }

  const webhookSecret =
    (process.env.PAYMENT_WEBHOOK_SECRET || '').trim() ||
    (isProd ? '' : 'dev-webhook-secret-change-in-production');

  return {
    isProduction: isProd,
    demoMode,
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    encryptionKeyBuffer,
    sessionSecret,
    webhookSecret,
    paymentAdapter: (process.env.PAYMENT_ADAPTER || 'sandbox').trim(),
    smsAdapter: (process.env.SMS_ADAPTER || 'sandbox').trim(),
    smsWebhookUrl: (process.env.SMS_WEBHOOK_URL || '').trim(),
    smsWebhookToken: (process.env.SMS_WEBHOOK_TOKEN || '').trim(),
    adminEmail: (process.env.ADMIN_EMAIL || 'admin@terrainplus.sn').trim().toLowerCase(),
    adminPhone: (process.env.ADMIN_PHONE || '+221770000001').trim(),
    adminPassword: process.env.ADMIN_PASSWORD || 'Admin1234!',
  };
}
