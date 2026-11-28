import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { MAX_EVIDENCE_BYTES } from '@/lib/config';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { randomId } from '@/lib/security/crypto';
import { sanitizeDisplayFilename } from '@/lib/security/files';
import { createSignedUploadUrl, getSupabaseAdmin } from '@/lib/supabase/admin';

const prepareSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(MAX_EVIDENCE_BYTES, 'Justificatif trop volumineux (5 Mo max).'),
});

export async function POST(req: Request) {
  try {
    const auth = await requireRole('doctor');
    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from('doctor_profiles')
      .select('verification_status')
      .eq('user_id', auth.user.id)
      .single();

    if (doc?.verification_status === 'suspended') {
      throw new AppError(403, 'DOCTOR_SUSPENDED', 'Compte médecin suspendu.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_EVIDENCE_UPLOAD', parsed.error.issues[0]?.message || 'Fichier invalide.');
    }

    const safeName = sanitizeDisplayFilename(parsed.data.filename);
    const storagePath = `doctors/${auth.user.id}/${randomId(10)}_${safeName}`;
    const signed = await createSignedUploadUrl('doctor-evidence', storagePath);

    return jsonOk({ storagePath, signedUrl: signed.signedUrl, safeName });
  } catch (err) {
    return jsonError(err);
  }
}
