import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText } from '@/lib/security/crypto';
import { validateCaseAttachment } from '@/lib/security/files';
import {
  deleteStorageObject,
  getSupabaseAdmin,
  readStorageFileHeader,
} from '@/lib/supabase/admin';

const commitSchema = z.object({
  storagePath: z.string().trim().min(5).max(300),
  originalName: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(1000).optional().default(''),
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
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Paiement requis.');
    }
    if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status))) {
      throw new AppError(403, 'CASE_READ_ONLY', 'Consultation clôturée.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = commitSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_COMMIT', 'Données du fichier manquantes.');
    }

    const expectedPrefix = `cases/${caseId}/`;
    if (!parsed.data.storagePath.startsWith(expectedPrefix) || parsed.data.storagePath.includes('..')) {
      throw new AppError(400, 'INVALID_STORAGE_PATH', 'Chemin de stockage invalide.');
    }

    const { headerBytes, totalBytes } = await readStorageFileHeader('case-media', parsed.data.storagePath);

    let validated;
    try {
      validated = validateCaseAttachment(headerBytes, totalBytes, parsed.data.originalName);
    } catch (fileErr) {
      await deleteStorageObject('case-media', parsed.data.storagePath);
      const code = fileErr instanceof Error ? fileErr.message : 'UNSUPPORTED_FILE_TYPE';
      throw new AppError(
        code === 'FILE_TOO_LARGE' ? 413 : 400,
        code,
        code === 'FILE_TOO_LARGE'
          ? 'Fichier trop volumineux.'
          : 'Format de fichier non autorisé (images JPEG/PNG/WebP, PDF ou vidéos MP4/MOV/WebM uniquement).'
      );
    }

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const msgBody = parsed.data.caption || `Fichier partagé : ${validated.safeName}`;

    const { data: msg } = await admin
      .from('case_messages')
      .insert({
        case_id: caseId,
        sender_id: auth.user.id,
        sender_role: auth.user.role,
        message_type: 'media',
        body_enc: encryptText(msgBody),
        metadata_json: { mediaKind: validated.mediaKind },
      })
      .select('*')
      .single();

    const { data: att } = await admin
      .from('case_attachments')
      .insert({
        case_id: caseId,
        message_id: msg?.id,
        uploader_id: auth.user.id,
        media_kind: validated.mediaKind,
        original_name_safe: validated.safeName,
        mime_type: validated.mimeType,
        byte_size: totalBytes,
        storage_path: parsed.data.storagePath,
      })
      .select('*')
      .single();

    const nextStatus = caseRow.status === 'open' ? 'in_discussion' : String(caseRow.status);
    await admin.from('cases').update({ status: nextStatus, updated_at: nowIso }).eq('id', caseId);

    const recipientId =
      auth.user.id === caseRow.athlete_id ? String(caseRow.doctor_id) : String(caseRow.athlete_id);
    await sendNeutralNotification({
      userId: recipientId,
      channel: 'push',
      templateKey: 'message_received',
      targetRef: caseId,
    });

    return jsonOk(
      {
        message: {
          id: msg?.id,
          senderId: auth.user.id,
          senderRole: auth.user.role,
          messageType: 'media',
          body: msgBody,
          attachments: [
            {
              id: att?.id,
              mediaKind: validated.mediaKind,
              originalName: validated.safeName,
              mimeType: validated.mimeType,
              byteSize: totalBytes,
            },
          ],
          createdAt: msg?.created_at || nowIso,
        },
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
