import { z } from 'zod';
import { requireVerifiedDoctor } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const reportSchema = z.object({
  targetType: z.enum(['topic', 'post']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Précisez le motif (ex. donnée patient non anonymisée).').max(400),
});

export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedDoctor();
    const body = await req.json().catch(() => ({}));
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_FORUM_REPORT', parsed.error.issues[0]?.message || 'Signalement invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: report } = await admin
      .from('doctor_forum_reports')
      .insert({
        target_type: parsed.data.targetType,
        target_id: parsed.data.targetId,
        reporter_id: auth.user.id,
        reason: parsed.data.reason,
        status: 'open',
      })
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'doctor',
      action: 'FORUM_CONTENT_REPORTED',
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason.slice(0, 200),
    });

    return jsonOk({ report }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
