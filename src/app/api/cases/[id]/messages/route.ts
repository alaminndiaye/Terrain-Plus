import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  body: z.string().trim().min(1, 'Le message ne peut pas être vide.').max(2000),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'La messagerie est verrouillée avant confirmation des 10 000 FCFA.');
    }
    if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status))) {
      throw new AppError(
        403,
        'CASE_READ_ONLY',
        'Cette consultation est clôturée et passée en lecture seule. Démarrez une nouvelle consultation (10 000 FCFA) pour un nouveau suivi.'
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_MESSAGE', parsed.error.issues[0]?.message || 'Message invalide.');
    }

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data: msg, error } = await admin
      .from('case_messages')
      .insert({
        case_id: caseId,
        sender_id: auth.user.id,
        sender_role: auth.user.role,
        message_type: 'text',
        body_enc: encryptText(parsed.data.body),
      })
      .select('*')
      .single();

    if (error || !msg) {
      throw new AppError(500, 'MESSAGE_SAVE_FAILED', 'Impossible d’envoyer le message.');
    }

    const nextStatus = caseRow.status === 'open' ? 'in_discussion' : String(caseRow.status);
    await admin.from('cases').update({ status: nextStatus, updated_at: nowIso }).eq('id', caseId);

    const recipientId =
      auth.user.id === caseRow.athlete_id ? String(caseRow.doctor_id) : String(caseRow.athlete_id);
    await sendNeutralNotification({
      userId: recipientId,
      channel: 'push',
      templateKey: 'message_received',
      targetRef: caseId,
    });

    return jsonOk(
      {
        message: {
          id: msg.id,
          senderId: msg.sender_id,
          senderRole: msg.sender_role,
          messageType: 'text',
          body: parsed.data.body,
          attachments: [],
          createdAt: msg.created_at,
        },
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
