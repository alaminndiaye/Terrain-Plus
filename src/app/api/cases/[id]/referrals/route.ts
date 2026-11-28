import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const referralSchema = z.object({
  toDoctorId: z.string().uuid(),
  referralType: z.enum(['handoff_transfer', 'post_consult_referral']).default('handoff_transfer'),
  reason: z.string().trim().min(5, 'Motif requis (5 caractères min.).').max(1000),
  sharedFields: z
    .array(z.enum(['initial_complaint', 'medical_record', 'training_trends']))
    .min(1, 'Sélectionnez au moins un élément à transmettre.'),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole('doctor');
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (!caseRow.payment_unlocked) {
      throw new AppError(400, 'CASE_NOT_PAID', 'Le dossier doit être réglé avant toute orientation.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = referralSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_REFERRAL', parsed.error.issues[0]?.message || 'Orientation invalide.');
    }

    const d = parsed.data;
    if (d.toDoctorId === auth.user.id) {
      throw new AppError(400, 'INVALID_TARGET_DOCTOR', 'Veuillez choisir un autre médecin vérifié.');
    }

    const admin = getSupabaseAdmin();

    // If handoff_transfer (transferring payment before performing consultation), ensure no completed appointment or medical entry exists!
    if (d.referralType === 'handoff_transfer') {
      if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status)) || caseRow.medical_record_updated) {
        throw new AppError(
          400,
          'CONSULTATION_ALREADY_PERFORMED',
          'Le transfert financier sans consultation n’est possible que si la consultation n’a pas encore été effectuée.'
        );
      }
      const { count: completedAppts } = await admin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('proposal_status', 'completed');

      if ((completedAppts || 0) > 0) {
        throw new AppError(
          400,
          'CONSULTATION_ALREADY_PERFORMED',
          'Un rendez-vous a déjà été effectué sur ce dossier : utilisez une orientation post-consultation.'
        );
      }
    }

    const { data: targetDoc } = await admin
      .from('doctor_profiles')
      .select('user_id, public_name, verification_status, profiles!doctor_profiles_user_id_fkey(status)')
      .eq('user_id', d.toDoctorId)
      .single();

    const targetAcc = targetDoc?.profiles as { status?: string } | undefined;
    if (!targetDoc || targetDoc.verification_status !== 'verified' || targetAcc?.status !== 'active') {
      throw new AppError(404, 'TARGET_DOCTOR_NOT_VERIFIED', 'Médecin destinataire non vérifié.');
    }

    const { data: referral, error } = await admin
      .from('referrals')
      .insert({
        source_case_id: caseId,
        from_doctor_id: auth.user.id,
        to_doctor_id: d.toDoctorId,
        referral_type: d.referralType,
        reason_enc: encryptText(d.reason),
        shared_fields_json: d.sharedFields,
        status: 'pending_consent',
      })
      .select('*')
      .single();

    if (error || !referral) {
      throw new AppError(500, 'REFERRAL_CREATE_FAILED', 'Impossible de créer la proposition.');
    }

    await admin
      .from('cases')
      .update({ status: 'referral_proposed', updated_at: new Date().toISOString() })
      .eq('id', caseId);

    await sendNeutralNotification({
      userId: String(caseRow.athlete_id),
      channel: 'push',
      templateKey: 'referral_proposed',
      targetRef: caseId,
    });

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'doctor',
      action:
        d.referralType === 'handoff_transfer'
          ? 'HANDOFF_TRANSFER_PROPOSED'
          : 'POST_CONSULT_REFERRAL_PROPOSED',
      targetType: 'referral',
      targetId: referral.id,
      metadata: { sourceCaseId: caseId, toDoctorId: d.toDoctorId },
    });

    return jsonOk(
      {
        referral: {
          id: referral.id,
          referralType: referral.referral_type,
          toDoctorId: d.toDoctorId,
          toDoctorName: targetDoc.public_name,
          status: referral.status,
        },
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
