import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

let adminClient: SupabaseClient | null = null;
let pgPool: Pool | null = null;

export const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'coach-diplomas';

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

  pgPool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
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
