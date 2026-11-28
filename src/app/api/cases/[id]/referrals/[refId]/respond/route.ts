import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { decryptText, encryptText, randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const respondSchema = z.object({
  decision: z.enum(['accepted', 'refused']),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; refId: string }> }
) {
  try {
    const auth = await requireRole('athlete');
    const { id: caseId, refId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    const body = await req.json().catch(() => ({}));
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_DECISION', 'Réponse attendue : accepted ou refused.');
    }

    const admin = getSupabaseAdmin();
    const { data: referral } = await admin
      .from('referrals')
      .select('*')
      .eq('id', refId)
      .eq('source_case_id', caseId)
      .single();

    if (!referral) {
      throw new AppError(404, 'REFERRAL_NOT_FOUND', 'Proposition introuvable.');
    }
    if (referral.status !== 'pending_consent') {
      throw new AppError(409, 'REFERRAL_ALREADY_DECIDED', 'Cette proposition a déjà reçu une réponse.');
    }

    const nowIso = new Date().toISOString();
    await admin.from('consents').insert({
      user_id: auth.user.id,
      case_id: caseId,
      consent_type: 'referral_transfer',
      text_version: referral.consent_text_version,
      decision: parsed.data.decision,
      metadata_json: { referralId: refId, toDoctorId: referral.to_doctor_id, referralType: referral.referral_type },
    });

    if (parsed.data.decision === 'refused') {
      await admin
        .from('referrals')
        .update({ status: 'refused', decided_at: nowIso })
        .eq('id', refId);
      await admin
        .from('cases')
        .update({ status: 'in_discussion', updated_at: nowIso })
        .eq('id', caseId);

      await recordAudit({
        actorId: auth.user.id,
        actorRole: 'athlete',
        action: 'REFERRAL_REFUSED',
        targetType: 'referral',
        targetId: refId,
      });

      return jsonOk({ status: 'refused', targetCaseId: null, paymentReallocated: false });
    }

    const sharedFields = (referral.shared_fields_json as string[]) || [];
    const reasonText = decryptText(referral.reason_enc);
    const originalComplaint = decryptText(String(caseRow.initial_reason_enc));
    const newSummaryText = [
      `Transfert / Orientation depuis dossier ${caseRow.reference}`,
      `Motif : ${reasonText}`,
      sharedFields.includes('initial_complaint') ? `Demande initiale : ${originalComplaint}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const newCaseRef = `TP-TR-${Date.now().toString(36).toUpperCase()}-${randomId(2).toUpperCase()}`;
    const { data: rpcRes, error } = await admin.rpc('rpc_accept_handoff_transfer', {
      p_referral_id: refId,
      p_athlete_id: auth.user.id,
      p_new_case_ref: newCaseRef,
      p_new_summary_enc: encryptText(newSummaryText),
    });

    if (error) {
      if (error.message?.includes('CONSULTATION_ALREADY_PERFORMED')) {
        throw new AppError(400, 'CONSULTATION_ALREADY_PERFORMED', 'La consultation initiale a déjà été effectuée.');
      }
      throw new AppError(500, 'REFERRAL_ACCEPT_FAILED', 'Impossible de finaliser le transfert.');
    }

    const result = rpcRes as {
      target_case_id: string;
      referral_type: string;
      payment_reallocated: boolean;
    };

    await sendNeutralNotification({
      userId: referral.to_doctor_id,
      channel: 'push',
      templateKey: 'case_update',
      targetRef: result.target_case_id,
    });

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'athlete',
      action: result.payment_reallocated
        ? 'HANDOFF_TRANSFER_ACCEPTED_PAYMENT_REALLOCATED'
        : 'POST_CONSULT_REFERRAL_ACCEPTED',
      targetType: 'referral',
      targetId: refId,
      metadata: {
        targetCaseId: result.target_case_id,
        toDoctorId: referral.to_doctor_id,
        paymentReallocated: result.payment_reallocated,
      },
    });

    return jsonOk({
      status: 'accepted',
      targetCaseId: result.target_case_id,
      paymentReallocated: result.payment_reallocated,
    });
  } catch (err) {
    return jsonError(err);
  }
}
