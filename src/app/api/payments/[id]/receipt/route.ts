import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: paymentId } = await context.params;
    const admin = getSupabaseAdmin();

    const { data: payment } = await admin
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Reçu introuvable.');
    }

    const allowed =
      payment.athlete_id === auth.user.id ||
      payment.doctor_id === auth.user.id ||
      payment.original_doctor_id === auth.user.id ||
      auth.user.role === 'admin';

    if (!allowed) {
      throw new AppError(403, 'FORBIDDEN', 'Accès non autorisé à ce reçu.');
    }

    const [{ data: caseRow }, { data: doc }, { data: athlete }] = await Promise.all([
      admin.from('cases').select('reference, mode').eq('id', payment.case_id).maybeSingle(),
      admin.from('doctor_profiles').select('public_name, facility_name').eq('user_id', payment.doctor_id).maybeSingle(),
      admin.from('profiles').select('full_name').eq('id', payment.athlete_id).maybeSingle(),
    ]);

    return jsonOk({
      receipt: {
        id: payment.id,
        reference: payment.reference,
        caseId: payment.case_id,
        caseReference: caseRow?.reference || '',
        status: payment.status,
        paymentChannel: payment.payment_channel,
        athleteName: athlete?.full_name || 'Sportif',
        doctorName: doc?.public_name || 'Médecin',
        doctorFacility: doc?.facility_name || '',
        grossAmountFcfa: payment.gross_amount_fcfa,
        platformCommissionFcfa: payment.platform_commission_fcfa,
        doctorNetFcfa: payment.doctor_net_fcfa,
        reallocatedFromAnotherDoctor: payment.doctor_id !== payment.original_doctor_id,
        transferredAt: payment.transferred_at,
        paidAt: payment.paid_at,
        createdAt: payment.created_at,
        demoLabel: 'REÇU DE CONSULTATION UNIQUE (10 000 FCFA TTC)',
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
