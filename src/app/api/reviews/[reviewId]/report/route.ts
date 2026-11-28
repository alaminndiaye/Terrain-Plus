import { z } from 'zod';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  reason: z.string().trim().min(5, 'Motif de signalement requis (5 car. min.).').max(400),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ reviewId: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { reviewId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_REASON', parsed.error.issues[0]?.message || 'Motif invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: review } = await admin.from('reviews').select('id').eq('id', reviewId).single();
    if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Avis introuvable.');

    const { data: report } = await admin
      .from('review_reports')
      .insert({
        review_id: reviewId,
        reporter_id: auth.user.id,
        reason: parsed.data.reason,
        status: 'open',
      })
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: auth.user.role,
      action: 'REVIEW_REPORTED',
      targetType: 'review',
      targetId: reviewId,
      reason: parsed.data.reason.slice(0, 200),
    });

    return jsonOk({ report }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
