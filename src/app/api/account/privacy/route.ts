import { z } from 'zod';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const reqSchema = z.object({
  requestType: z.enum(['access', 'correction', 'deletion']),
  note: z.string().trim().min(5).max(500),
});

export async function GET() {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const admin = getSupabaseAdmin();

    const [{ data: consents }, { data: requests }, { data: notifications }] = await Promise.all([
      admin.from('consents').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false }),
      admin.from('data_requests').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false }),
      admin
        .from('notifications')
        .select('id, channel, title, body, target_ref, is_read, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    return jsonOk({
      consents: consents || [],
      dataRequests: requests || [],
      notifications: notifications || [],
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const body = await req.json().catch(() => ({}));
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_DATA_REQUEST', 'Type ou précision insuffisante (5 car. min.).');
    }

    const admin = getSupabaseAdmin();
    const { data: created } = await admin
      .from('data_requests')
      .insert({
        user_id: auth.user.id,
        request_type: parsed.data.requestType,
        note: parsed.data.note,
      })
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: auth.user.role,
      action: 'DATA_SUBJECT_REQUEST_CREATED',
      targetType: 'data_request',
      targetId: String(created?.id || 'unknown'),
      metadata: { requestType: parsed.data.requestType },
    });

    return jsonOk(
      {
        request: created,
        notice:
          'Demande enregistrée. Le traitement respecte les obligations applicables aux dossiers médicaux.',
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
