import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAppConfig } from '../config';
import { AppError } from '../http/errors';

let cachedAdmin: SupabaseClient | null = null;

/**
 * Privileged server-only Supabase client (uses SUPABASE_SERVICE_ROLE_KEY).
 * Never expose this client or key to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const { supabaseUrl, supabaseServiceRoleKey } = getAppConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new AppError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
    );
  }
  cachedAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdmin;
}

export async function createSignedUploadUrl(
  bucket: 'doctor-evidence' | 'case-media',
  storagePath: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(storagePath);
  if (error || !data) {
    throw new AppError(500, 'STORAGE_SIGN_ERROR', `Impossible de préparer l’envoi vers ${bucket}.`);
  }
  return data;
}

export async function createSignedDownloadUrl(
  bucket: 'doctor-evidence' | 'case-media',
  storagePath: string,
  expiresInSeconds = 60
): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new AppError(500, 'STORAGE_READ_ERROR', 'Impossible de générer le lien sécurisé du fichier.');
  }
  return data.signedUrl;
}

export async function readStorageFileHeader(
  bucket: 'doctor-evidence' | 'case-media',
  storagePath: string
): Promise<{ headerBytes: Buffer; totalBytes: number }> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new AppError(404, 'FILE_NOT_FOUND_IN_STORAGE', 'Fichier introuvable dans le stockage sécurisé.');
  }
  const fullBuf = Buffer.from(await data.arrayBuffer());
  return {
    headerBytes: fullBuf.subarray(0, 64),
    totalBytes: fullBuf.length,
  };
}

export async function deleteStorageObject(
  bucket: 'doctor-evidence' | 'case-media',
  storagePath: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.storage.from(bucket).remove([storagePath]);
}
