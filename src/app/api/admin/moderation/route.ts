import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const modSchema = z.object({
  kind: z.enum(['review', 'forum_topic', 'forum_post']),
  targetId: z.string().uuid(),
  action: z.enum(['hide', 'keep', 'remove']),
  reason: z.string().trim().min(5, 'Motif de modération requis.').max(400),
});

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();

    const [{ data: reviewReports }, { data: forumReports }] = await Promise.all([
      admin
        .from('review_reports')
        .select('*, reviews!inner(id, rating, comment, moderation_status, doctor_id)')
        .order('created_at', { ascending: false }),
      admin
        .from('doctor_forum_reports')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    return jsonOk({
      reviewReports: reviewReports || [],
      forumReports: forumReports || [],
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = modSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_MODERATION', parsed.error.issues[0]?.message || 'Action invalide.');
    }

    const { kind, targetId, action, reason } = parsed.data;
    const modStatus = action === 'hide' ? 'hidden_flagged' : action === 'remove' ? 'removed' : 'published';
    const reportStatus =
      action === 'hide' ? 'resolved_hidden' : action === 'remove' ? 'resolved_removed' : 'resolved_kept';

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    if (kind === 'review') {
      await admin
        .from('reviews')
        .update({ moderation_status: modStatus, moderation_reason: reason, updated_at: nowIso })
        .eq('id', targetId);
      await admin
        .from('review_reports')
        .update({ status: reportStatus, admin_note: reason, resolved_by: auth.user.id, resolved_at: nowIso })
        .eq('review_id', targetId)
        .eq('status', 'open');
    } else {
      const table = kind === 'forum_topic' ? 'doctor_forum_topics' : 'doctor_forum_posts';
      await admin.from(table).update({ moderation_status: modStatus, updated_at: nowIso }).eq('id', targetId);
      await admin
        .from('doctor_forum_reports')
        .update({ status: reportStatus, admin_note: reason, resolved_by: auth.user.id, resolved_at: nowIso })
        .eq('target_id', targetId)
        .eq('status', 'open');
    }

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: `${kind.toUpperCase()}_MODERATED_${action.toUpperCase()}`,
      targetType: kind,
      targetId,
      reason,
    });

    return jsonOk({ ok: true, moderationStatus: modStatus });
  } catch (err) {
    return jsonError(err);
  }
}
