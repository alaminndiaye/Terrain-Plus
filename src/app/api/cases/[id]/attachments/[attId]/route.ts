import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { createSignedDownloadUrl, getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; attId: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId, attId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId);

    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Dossier non réglé.');
    }

    const admin = getSupabaseAdmin();
    const { data: att } = await admin
      .from('case_attachments')
      .select('*')
      .eq('id', attId)
      .eq('case_id', caseId)
      .single();

    if (!att) {
      throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Pièce jointe introuvable.');
    }

    const signedUrl = await createSignedDownloadUrl('case-media', att.storage_path, 60);

    return jsonOk({
      signedUrl,
      mediaKind: att.media_kind,
      mimeType: att.mime_type,
      originalName: att.original_name_safe,
      expiresInSeconds: 60,
    });
  } catch (err) {
    return jsonError(err);
  }
}
