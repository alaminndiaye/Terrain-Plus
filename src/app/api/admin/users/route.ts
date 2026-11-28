import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const statusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(5, 'Motif obligatoire (5 car. min.).').max(400),
});

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const { data: users } = await admin
      .from('profiles')
      .select('id, role, first_name, last_name, full_name, phone, email, city, status, suspension_reason, phone_verified, onboarding_completed, created_at')
      .order('created_at', { ascending: false });
    return jsonOk({ users: users || [] });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_STATUS_UPDATE', parsed.error.issues[0]?.message || 'Données invalides.');
    }
    if (parsed.data.userId === auth.user.id) {
      throw new AppError(400, 'CANNOT_SUSPEND_SELF', 'Impossible de suspendre votre propre compte.');
    }

    const admin = getSupabaseAdmin();
    const { data: target } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', parsed.data.userId)
      .single();
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Utilisateur introuvable.');

    const nowIso = new Date().toISOString();
    await admin
      .from('profiles')
      .update({
        status: parsed.data.status,
        suspension_reason: parsed.data.status === 'suspended' ? parsed.data.reason : null,
        updated_at: nowIso,
      })
      .eq('id', target.id);

    if (parsed.data.status === 'suspended') {
      await admin.auth.admin.signOut(target.id, 'global');
      if (target.role === 'doctor') {
        await admin
          .from('doctor_profiles')
          .update({
            verification_status: 'suspended',
            verification_reason: parsed.data.reason,
            updated_at: nowIso,
          })
          .eq('user_id', target.id);
      }
    }

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: parsed.data.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED',
      targetType: 'profile',
      targetId: target.id,
      reason: parsed.data.reason,
    });

    return jsonOk({ ok: true, status: parsed.data.status });
  } catch (err) {
    return jsonError(err);
  }
}
