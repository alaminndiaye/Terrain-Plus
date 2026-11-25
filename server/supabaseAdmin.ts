import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg, { type Pool } from 'pg';

// Ensure BIGINT/COUNT(*) (OID 20) and NUMERIC/AVG (OID 1700) parse as JS numbers instead of strings
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

let adminClient: SupabaseClient | null = null;
let pgPool: Pool | null = null;

export const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'coach-diplomas';
export const SUPABASE_VIDEO_BUCKET = process.env.SUPABASE_VIDEO_BUCKET || 'coach-videos';
export const COACH_VIDEO_MAX_BYTES = 15 * 1024 * 1024; // 15 Mo max par vidéo (adapté au forfait gratuit Supabase)
export const COACH_VIDEO_QUOTA_BYTES = 100 * 1024 * 1024; // 100 Mo max par coach sur le stockage gratuit

export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  if (!url || !serviceKey) return null;

  adminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClient;
}

export function getPgPool(): Pool | null {
  if (pgPool) return pgPool;
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) return null;

  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pgPool = new pg.Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: Boolean(process.env.VERCEL),
  });
  pgPool.on('error', (err) => {
    console.error('[Postgres Pool] Erreur client inactif:', err.message);
  });
  return pgPool;
}

export async function uploadDiplomaToSupabaseStorage(
  storedFilename: string,
  buffer: Buffer,
  contentType: string
): Promise<boolean> {
  const client = getSupabaseAdmin();
  if (!client) return false;

  const { error } = await client.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storedFilename, buffer, { contentType, upsert: true });

  if (error) {
    if (error.message.toLowerCase().includes('bucket') && error.message.toLowerCase().includes('not found')) {
      const { error: bucketErr } = await client.storage.createBucket(SUPABASE_STORAGE_BUCKET, {
        public: false,
        fileSizeLimit: 3145728,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      });
      if (!bucketErr) {
        const retry = await client.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .upload(storedFilename, buffer, { contentType, upsert: true });
        if (!retry.error) return true;
      }
    }
    console.warn('[Supabase Storage] Erreur upload diplôme:', error.message);
    return false;
  }
  return true;
}

export async function downloadDiplomaFromSupabaseStorage(storedFilename: string): Promise<Buffer | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client.storage.from(SUPABASE_STORAGE_BUCKET).download(storedFilename);
  if (error || !data) return null;
  const arrBuf = await data.arrayBuffer();
  return Buffer.from(arrBuf);
}

let videoBucketChecked = false;

async function ensureCoachVideosBucket(client: SupabaseClient): Promise<boolean> {
  if (videoBucketChecked) return true;
  try {
    const { data: buckets, error: listErr } = await client.storage.listBuckets();
    if (!listErr && Array.isArray(buckets)) {
      const exists = buckets.some(
        (b) => b.id === SUPABASE_VIDEO_BUCKET || b.name === SUPABASE_VIDEO_BUCKET
      );
      if (exists) {
        videoBucketChecked = true;
        return true;
      }
    }
    const { error: createErr } = await client.storage.createBucket(SUPABASE_VIDEO_BUCKET, {
      public: false,
      fileSizeLimit: COACH_VIDEO_MAX_BYTES,
      allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    });
    if (!createErr || createErr.message.toLowerCase().includes('already exists')) {
      videoBucketChecked = true;
      return true;
    }
    console.warn('[Supabase Storage] Erreur création bucket vidéo:', createErr.message);
    return false;
  } catch (err) {
    console.warn('[Supabase Storage] Exception ensureCoachVideosBucket:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function createCoachVideoSignedUploadUrl(
  storagePath: string
): Promise<{ signedUrl: string; token: string; path: string } | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  try {
    await ensureCoachVideosBucket(client);
    const { data, error } = await client.storage.from(SUPABASE_VIDEO_BUCKET).createSignedUploadUrl(storagePath);
    if (error || !data) {
      if (error?.message.toLowerCase().includes('bucket') && error.message.toLowerCase().includes('not found')) {
        videoBucketChecked = false;
        const created = await ensureCoachVideosBucket(client);
        if (created) {
          const retry = await client.storage.from(SUPABASE_VIDEO_BUCKET).createSignedUploadUrl(storagePath);
          if (!retry.error && retry.data) {
            return {
              signedUrl: retry.data.signedUrl,
              token: retry.data.token,
              path: retry.data.path,
            };
          }
        }
      }
      console.warn('[Supabase Storage] Erreur signed upload URL vidéo:', error?.message);
      return null;
    }
    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    };
  } catch (err) {
    console.warn('[Supabase Storage] Exception signed upload URL vidéo:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function createCoachVideoSignedReadUrl(
  storagePath: string,
  expiresInSec = 3600
): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client.storage.from(SUPABASE_VIDEO_BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function deleteCoachVideoFromSupabaseStorage(storagePath: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || !storagePath) return;
  await client.storage.from(SUPABASE_VIDEO_BUCKET).remove([storagePath]).catch(() => undefined);
}
