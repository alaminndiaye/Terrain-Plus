import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { verifyWebhookSignature } from '@/lib/adapters/payment';
import { recordAudit } from '@/lib/audit/auditService';
import { getAppConfig } from '@/lib/config';
import { AppError } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function processVerifiedPaymentWebhook(
  rawPayload: string,
  signatureHeader: string
) {
  const config = getAppConfig();
  verifyWebhookSignature(rawPayload, signatureHeader, config.webhookSecret);

  let event: { eventId?: string; paymentId?: string; outcome?: string };
  try {
    event = JSON.parse(rawPayload);
  } catch {
    throw new AppError(400, 'INVALID_WEBHOOK_JSON', 'Payload webhook invalide.');
  }

  const eventId = String(event.eventId || '').trim();
  const paymentId = String(event.paymentId || '').trim();
  const outcome = String(event.outcome || '').trim();
  if (!eventId || !paymentId || !['succeeded', 'failed', 'cancelled'].includes(outcome)) {
    throw new AppError(400, 'INVALID_WEBHOOK_EVENT', 'Événement webhook incomplet.');
  }

  const admin = getSupabaseAdmin();
  const { data: rpcRes, error } = await admin.rpc('rpc_confirm_payment_and_unlock_case', {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_outcome: outcome,
  });

  if (error) {
    if (error.message?.includes('PAYMENT_NOT_FOUND')) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Paiement introuvable.');
    }
    throw new AppError(500, 'WEBHOOK_PROCESS_FAILED', 'Erreur lors de la confirmation serveur du paiement.');
  }

  const { data: payment } = await admin.from('payments').select('*').eq('id', paymentId).single();
  const result = rpcRes as { idempotent_replay?: boolean; status?: string };

  if (!result.idempotent_replay && payment) {
    if (outcome === 'succeeded') {
      await Promise.all([
        sendNeutralNotification({
          userId: payment.athlete_id,
          channel: 'push',
          templateKey: 'case_update',
          targetRef: payment.case_id,
        }),
        sendNeutralNotification({
          userId: payment.doctor_id,
          channel: 'push',
          templateKey: 'case_update',
          targetRef: payment.case_id,
        }),
      ]);
    }
    await recordAudit({
      actorId: payment.athlete_id,
      actorRole: 'athlete',
      action:
        outcome === 'succeeded'
          ? 'PAYMENT_SUCCEEDED_10000_FCFA'
          : `PAYMENT_${outcome.toUpperCase()}`,
      targetType: 'payment',
      targetId: payment.id,
      metadata: {
        grossAmountFcfa: payment.gross_amount_fcfa,
        doctorNetFcfa: payment.doctor_net_fcfa,
      },
    });
  }

  return {
    idempotentReplay: Boolean(result.idempotent_replay),
    payment,
  };
}
