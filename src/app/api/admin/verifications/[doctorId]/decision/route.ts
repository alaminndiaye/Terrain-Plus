import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const decisionSchema = z.object({
  decision: z.enum(['verified', 'more_info_requested', 'rejected', 'suspended']),
  reason: z.string().trim().max(500).optional().default(''),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ doctorId: string }> }
) {
  try {
    const auth = await requireRole('admin');
    const { doctorId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_DECISION', 'Décision de vérification invalide.');
    }

    const { decision, reason } = parsed.data;
    if (decision !== 'verified' && reason.length < 5) {
      throw new AppError(
        400,
        'REASON_REQUIRED',
        'Un motif précis (5 caractères min.) est obligatoire pour demander un complément, refuser ou suspendre.'
      );
    }

    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from('doctor_profiles')
      .select('user_id, verified_at')
      .eq('user_id', doctorId)
      .single();

    if (!doc) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Médecin introuvable.');

    const nowIso = new Date().toISOString();
    await admin
      .from('doctor_profiles')
      .update({
        verification_status: decision,
        verification_reason: reason || null,
        verified_at: decision === 'verified' ? nowIso : doc.verified_at,
        verified_by: auth.user.id,
        updated_at: nowIso,
      })
      .eq('user_id', doctorId);

    if (decision === 'suspended') {
      await admin
        .from('profiles')
        .update({ status: 'suspended', suspension_reason: reason, updated_at: nowIso })
        .eq('id', doctorId);
      await admin.auth.admin.signOut(doctorId, 'global');
    } else if (decision === 'verified') {
      await admin
        .from('profiles')
        .update({ status: 'active', suspension_reason: null, updated_at: nowIso })
        .eq('id', doctorId);
    }

    await sendNeutralNotification({
      userId: doctorId,
      channel: 'email',
      templateKey: 'verification_updated',
      targetRef: doctorId,
    });

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: `DOCTOR_VERIFICATION_${decision.toUpperCase()}`,
      targetType: 'doctor_profile',
      targetId: doctorId,
      reason: reason || 'Validation manuelle conforme',
    });

    return jsonOk({ ok: true, verificationStatus: decision, reason: reason || null });
  } catch (err) {
    return jsonError(err);
  }
}
