import { getSupabaseAdmin } from '../supabase/admin';

export async function recordAudit(params: {
  actorId?: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  await admin.from('audit_logs').insert({
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason ?? null,
    metadata_json: params.metadata ?? {},
  });
}
