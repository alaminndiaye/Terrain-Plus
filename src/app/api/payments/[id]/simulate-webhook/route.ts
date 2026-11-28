import { z } from 'zod';
import { signSandboxWebhook } from '@/lib/adapters/payment';
import { requireRole } from '@/lib/auth/session';
import { getAppConfig } from '@/lib/config';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { processVerifiedPaymentWebhook } from '@/lib/payments/processWebhook';
import { randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  outcome: z.enum(['succeeded', 'failed', 'cancelled']),
  eventId: z.string().trim().optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const config = getAppConfig();
    if (!config.demoMode) {
      throw new AppError(403, 'SANDBOX_DISABLED', 'Simulation désactivée hors mode démonstration.');
    }

    const auth = await requireRole('athlete');
    const { id: paymentId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_OUTCOME', 'Résultat attendu : succeeded, failed ou cancelled.');
    }

    const admin = getSupabaseAdmin();
    const { data: payment } = await admin
      .from('payments')
      .select('id, athlete_id')
      .eq('id', paymentId)
      .eq('athlete_id', auth.user.id)
      .single();

    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Paiement introuvable.');
    }

    const eventId = parsed.data.eventId || `evt_${randomId(10)}`;
    const { rawPayload, signature } = signSandboxWebhook(
      { eventId, paymentId, outcome: parsed.data.outcome },
      config.webhookSecret
    );
    const result = await processVerifiedPaymentWebhook(rawPayload, signature);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
