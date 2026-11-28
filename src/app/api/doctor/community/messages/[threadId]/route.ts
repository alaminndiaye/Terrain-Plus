import { z } from 'zod';
import { requireVerifiedDoctor } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { decryptText, encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const msgSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const auth = await requireVerifiedDoctor();
    const { threadId } = await context.params;
    const admin = getSupabaseAdmin();

    const { data: thread } = await admin
      .from('doctor_dm_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (!thread || (thread.doctor_a_id !== auth.user.id && thread.doctor_b_id !== auth.user.id)) {
      throw new AppError(403, 'FORBIDDEN_THREAD', 'Accès refusé à cette discussion entre confrères.');
    }

    const { data: msgs } = await admin
      .from('doctor_dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    return jsonOk({
      thread,
      messages: (msgs || []).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        body: decryptText(m.body_enc),
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const auth = await requireVerifiedDoctor();
    const { threadId } = await context.params;
    const admin = getSupabaseAdmin();

    const { data: thread } = await admin
      .from('doctor_dm_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (!thread || (thread.doctor_a_id !== auth.user.id && thread.doctor_b_id !== auth.user.id)) {
      throw new AppError(403, 'FORBIDDEN_THREAD', 'Accès refusé à cette discussion.');
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = msgSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_MESSAGE', 'Message invalide.');
    }

    const nowIso = new Date().toISOString();
    const { data: msg } = await admin
      .from('doctor_dm_messages')
      .insert({
        thread_id: threadId,
        sender_id: auth.user.id,
        body_enc: encryptText(parsed.data.body),
      })
      .select('*')
      .single();

    await admin
      .from('doctor_dm_threads')
      .update({ last_message_at: nowIso })
      .eq('id', threadId);

    return jsonOk(
      {
        message: {
          id: msg?.id,
          senderId: auth.user.id,
          body: parsed.data.body,
          createdAt: msg?.created_at || nowIso,
        },
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
