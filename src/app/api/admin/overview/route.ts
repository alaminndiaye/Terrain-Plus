import { requireRole } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [
      { count: pendingVerifications },
      { count: overdueSla },
      { count: openReviewReports },
      { count: openForumReports },
      { count: staleCases48h },
      { data: succeededPayments },
    ] = await Promise.all([
      admin
        .from('doctor_profiles')
        .select('user_id', { count: 'exact', head: true })
        .in('verification_status', ['pending', 'more_info_requested']),
      admin
        .from('doctor_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('verification_status', 'pending')
        .lt('sla_due_at', nowIso),
      admin
        .from('review_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      admin
        .from('doctor_forum_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      admin
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('payment_unlocked', true)
        .eq('status', 'open')
        .lt('updated_at', cutoff48h),
      admin
        .from('payments')
        .select('gross_amount_fcfa, platform_commission_fcfa, doctor_net_fcfa')
        .eq('status', 'succeeded'),
    ]);

    const grossVolume = (succeededPayments || []).reduce((s, p) => s + Number(p.gross_amount_fcfa || 0), 0);
    const commissionVolume = (succeededPayments || []).reduce(
      (s, p) => s + Number(p.platform_commission_fcfa || 0),
      0
    );

    return jsonOk({
      metrics: {
        pendingVerifications: pendingVerifications || 0,
        overdueSla: overdueSla || 0,
        openReviewReports: openReviewReports || 0,
        openForumReports: openForumReports || 0,
        staleCases48h: staleCases48h || 0,
        succeededPaymentsCount: (succeededPayments || []).length,
        grossVolumeFcfa: grossVolume,
        commissionVolumeFcfa: commissionVolume,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
