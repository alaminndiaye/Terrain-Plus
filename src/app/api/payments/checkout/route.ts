import { z } from 'zod';
import { getFixedConsultationBreakdown } from '@/lib/adapters/payment';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const checkoutSchema = z.object({
  caseId: z.string().uuid('Dossier invalide.'),
  paymentChannel: z.enum(['wave_sandbox', 'orange_money_sandbox', 'card_sandbox']).default('wave_sandbox'),
  idempotencyKey: z.string().trim().min(6).max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const body = await req.json().catch(() => ({}));
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_CHECKOUT', parsed.error.issues[0]?.message || 'Paramètres invalides.');
    }

    const { caseId, paymentChannel } = parsed.data;
    const idempotencyKey = parsed.data.idempotencyKey || `idem_${caseId}_${randomId(6)}`;
    const admin = getSupabaseAdmin();

    const { data: existingIdem } = await admin
      .from('payments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingIdem) {
      if (existingIdem.athlete_id !== auth.user.id) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Clé de transaction déjà utilisée.');
      }
      return jsonOk({ idempotentReplay: true, payment: existingIdem });
    }

    const { data: caseRow } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('athlete_id', auth.user.id)
      .single();

    if (!caseRow) {
      throw new AppError(404, 'CASE_NOT_FOUND', 'Dossier introuvable.');
    }
    if (caseRow.payment_unlocked) {
      throw new AppError(409, 'CASE_ALREADY_PAID', 'Cette consultation est déjà réglée et déverrouillée.');
    }

    const { data: doc } = await admin
      .from('doctor_profiles')
      .select('verification_status, profiles!doctor_profiles_user_id_fkey(status)')
      .eq('user_id', caseRow.doctor_id)
      .single();

    const docAcc = doc?.profiles as { status?: string } | undefined;
    if (!doc || doc.verification_status !== 'verified' || docAcc?.status !== 'active') {
      throw new AppError(400, 'DOCTOR_UNAVAILABLE', 'Ce médecin n’est actuellement pas disponible.');
    }

    const breakdown = getFixedConsultationBreakdown();
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${randomId(2).toUpperCase()}`;

    const { data: payment, error } = await admin
      .from('payments')
      .insert({
        reference,
        idempotency_key: idempotencyKey,
        case_id: caseRow.id,
        athlete_id: auth.user.id,
        doctor_id: caseRow.doctor_id,
        original_doctor_id: caseRow.doctor_id,
        gross_amount_fcfa: breakdown.grossAmountFcfa,
        platform_commission_fcfa: breakdown.platformCommissionFcfa,
        doctor_net_fcfa: breakdown.doctorNetFcfa,
        status: 'pending',
        provider: 'sandbox',
        payment_channel: paymentChannel,
      })
      .select('*')
      .single();

    if (error || !payment) {
      throw new AppError(500, 'CHECKOUT_FAILED', 'Impossible d’initier la transaction.');
    }

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'athlete',
      action: 'PAYMENT_CHECKOUT_INITIATED',
      targetType: 'payment',
      targetId: payment.id,
      metadata: { grossAmountFcfa: 10000, paymentChannel },
    });

    return jsonOk({ idempotentReplay: false, payment, breakdown }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
