import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const grantSchema = z.object({
  caseId: z.string().uuid('ID de dossier invalide.'),
  reason: z.string().trim().min(15, 'Motif détaillé requis (15 caractères minimum).').max(400),
});

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const { data: logs } = await admin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    return jsonOk({ logs: logs || [] });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'JUSTIFICATION_REQUIRED', parsed.error.issues[0]?.message || 'Motif invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: caseRow } = await admin
      .from('cases')
      .select('id')
      .eq('id', parsed.data.caseId)
      .single();

    if (!caseRow) throw new AppError(404, 'CASE_NOT_FOUND', 'Dossier introuvable.');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: grant } = await admin
      .from('exceptional_access_grants')
      .insert({
        admin_id: auth.user.id,
        case_id: parsed.data.caseId,
        reason: parsed.data.reason,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'ADMIN_EXCEPTIONAL_CASE_ACCESS_GRANTED',
      targetType: 'case',
      targetId: parsed.data.caseId,
      reason: parsed.data.reason,
      metadata: { expiresAt },
    });

    return jsonOk({ grant }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
