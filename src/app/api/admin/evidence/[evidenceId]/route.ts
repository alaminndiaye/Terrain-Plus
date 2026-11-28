import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { createSignedDownloadUrl, getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  context: { params: Promise<{ evidenceId: string }> }
) {
  try {
    const auth = await requireRole('admin');
    const { evidenceId } = await context.params;
    const admin = getSupabaseAdmin();

    const { data: ev } = await admin
      .from('doctor_evidence')
      .select('*')
      .eq('id', evidenceId)
      .single();

    if (!ev) throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Justificatif introuvable.');

    const signedUrl = await createSignedDownloadUrl('doctor-evidence', ev.storage_path, 60);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'ADMIN_VIEWED_EVIDENCE',
      targetType: 'doctor_evidence',
      targetId: evidenceId,
      metadata: { doctorId: ev.doctor_id },
    });

    return jsonOk({
      signedUrl,
      mimeType: ev.mime_type,
      originalName: ev.original_name_safe,
      expiresInSeconds: 60,
    });
  } catch (err) {
    return jsonError(err);
  }
}
