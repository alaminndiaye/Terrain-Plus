import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('execute_payout'),
    doctorId: z.string().uuid(),
    payoutReference: z.string().trim().min(3).max(80),
  }),
  z.object({
    action: z.literal('refund_dispute'),
    paymentId: z.string().uuid(),
    reason: z.string().trim().min(8).max(400),
  }),
]);

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [{ data: payments }, { data: payouts }, { data: docs }, { data: completedCases }, { data: staleCases }] =
      await Promise.all([
        admin.from('payments').select('*').order('created_at', { ascending: false }).limit(100),
        admin.from('doctor_payouts').select('*').order('created_at', { ascending: false }).limit(50),
        admin.from('doctor_profiles').select('user_id, public_name'),
        admin.from('cases').select('id').eq('status', 'completed'),
        admin
          .from('cases')
          .select('id, reference, athlete_id, doctor_id, created_at, updated_at')
          .eq('payment_unlocked', true)
          .eq('status', 'open')
          .lt('updated_at', cutoff48h),
      ]);

    const docNames = new Map((docs || []).map((d) => [d.user_id, d.public_name]));
    const completedSet = new Set((completedCases || []).map((c) => c.id));

    // Aggregate eligible pending payout per doctor (completed cases with succeeded payment and no payout_id)
    const pendingByDoctor = new Map<string, { doctorId: string; doctorName: string; totalNetFcfa: number; count: number }>();
    for (const p of payments || []) {
      if (p.status === 'succeeded' && !p.payout_id && completedSet.has(p.case_id)) {
        const prev = pendingByDoctor.get(p.doctor_id) || {
          doctorId: p.doctor_id,
          doctorName: docNames.get(p.doctor_id) || 'Médecin',
          totalNetFcfa: 0,
          count: 0,
        };
        prev.totalNetFcfa += Number(p.doctor_net_fcfa || 0);
        prev.count += 1;
        pendingByDoctor.set(p.doctor_id, prev);
      }
    }

    return jsonOk({
      payments: (payments || []).map((p) => ({
        ...p,
        doctorName: docNames.get(p.doctor_id) || 'Médecin',
      })),
      pendingPayouts: Array.from(pendingByDoctor.values()),
      payoutHistory: (payouts || []).map((po) => ({
        ...po,
        doctorName: docNames.get(po.doctor_id) || 'Médecin',
      })),
      staleCases48h: (staleCases || []).map((sc) => ({
        ...sc,
        doctorName: docNames.get(sc.doctor_id) || 'Médecin',
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FINANCE_ACTION', 'Action financière invalide.');
    }

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    if (parsed.data.action === 'execute_payout') {
      const { doctorId, payoutReference } = parsed.data;
      const { data: completedCases } = await admin
        .from('cases')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed');
      const caseIds = (completedCases || []).map((c) => c.id);
      if (!caseIds.length) {
        throw new AppError(400, 'NO_ELIGIBLE_PAYOUT', 'Aucune consultation clôturée éligible.');
      }

      const { data: eligiblePayments } = await admin
        .from('payments')
        .select('id, doctor_net_fcfa')
        .eq('doctor_id', doctorId)
        .eq('status', 'succeeded')
        .is('payout_id', null)
        .in('case_id', caseIds);

      if (!eligiblePayments || eligiblePayments.length === 0) {
        throw new AppError(400, 'NO_ELIGIBLE_PAYOUT', 'Aucun reversement en attente pour ce médecin.');
      }

      const totalNet = eligiblePayments.reduce((s, p) => s + Number(p.doctor_net_fcfa || 0), 0);
      const { data: payout } = await admin
        .from('doctor_payouts')
        .insert({
          doctor_id: doctorId,
          total_net_fcfa: totalNet,
          cases_count: eligiblePayments.length,
          status: 'paid',
          payout_reference: payoutReference,
          processed_by: auth.user.id,
          paid_at: nowIso,
        })
        .select('*')
        .single();

      await admin
        .from('payments')
        .update({ payout_id: payout?.id, updated_at: nowIso })
        .in(
          'id',
          eligiblePayments.map((p) => p.id)
        );

      await recordAudit({
        actorId: auth.user.id,
        actorRole: 'admin',
        action: 'DOCTOR_PAYOUT_EXECUTED',
        targetType: 'doctor_payout',
        targetId: String(payout?.id || doctorId),
        reason: payoutReference,
        metadata: { totalNet, count: eligiblePayments.length },
      });

      return jsonOk({ ok: true, payout }, 201);
    }

    // Dispute / 48h non-response refund
    const { paymentId, reason } = parsed.data;
    const { data: pay } = await admin.from('payments').select('*').eq('id', paymentId).single();
    if (!pay || pay.status !== 'succeeded') {
      throw new AppError(400, 'INVALID_REFUND_STATE', 'Paiement introuvable ou non remboursable.');
    }

    await admin
      .from('payments')
      .update({ status: 'refunded', refund_note: reason, updated_at: nowIso })
      .eq('id', paymentId);
    await admin
      .from('cases')
      .update({ status: 'cancelled', payment_unlocked: false, updated_at: nowIso })
      .eq('id', pay.case_id);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'DISPUTE_PAYMENT_REFUNDED',
      targetType: 'payment',
      targetId: paymentId,
      reason,
    });

    return jsonOk({ ok: true, status: 'refunded' });
  } catch (err) {
    return jsonError(err);
  }
}
