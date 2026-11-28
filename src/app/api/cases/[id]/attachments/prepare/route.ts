import { z } from 'zod';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { MAX_IMAGE_OR_DOC_BYTES, MAX_VIDEO_BYTES } from '@/lib/config';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { randomId } from '@/lib/security/crypto';
import { sanitizeDisplayFilename } from '@/lib/security/files';
import { createSignedUploadUrl } from '@/lib/supabase/admin';

const prepareSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  mediaKind: z.enum(['image', 'video', 'document']),
  byteSize: z.number().int().positive(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Paiement requis avant l’envoi de fichiers.');
    }
    if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status))) {
      throw new AppError(403, 'CASE_READ_ONLY', 'Consultation clôturée (lecture seule).');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_UPLOAD_METADATA', 'Métadonnées de fichier invalides.');
    }

    const maxBytes = parsed.data.mediaKind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_OR_DOC_BYTES;
    if (parsed.data.byteSize > maxBytes) {
      throw new AppError(
        413,
        'FILE_TOO_LARGE',
        parsed.data.mediaKind === 'video'
          ? 'La vidéo dépasse la limite de 25 Mo.'
          : 'Le fichier dépasse la limite de 10 Mo.'
      );
    }

    const safeName = sanitizeDisplayFilename(parsed.data.filename);
    const storagePath = `cases/${caseId}/${randomId(12)}_${safeName}`;
    const signed = await createSignedUploadUrl('case-media', storagePath);

    return jsonOk({
      storagePath,
      signedUrl: signed.signedUrl,
      token: signed.token,
      safeName,
    });
  } catch (err) {
    return jsonError(err);
  }
}
