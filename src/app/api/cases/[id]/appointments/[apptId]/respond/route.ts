import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText, randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const respondSchema = z.object({
  decision: z.enum(['confirmed', 'declined', 'cancelled']),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; apptId: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId, apptId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    const body = await req.json().catch(() => ({}));
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_DECISION', 'Décision attendue : confirmed, declined ou cancelled.');
    }

    const admin = getSupabaseAdmin();
    const { data: appt } = await admin
      .from('appointments')
      .select('*')
      .eq('id', apptId)
      .eq('case_id', caseId)
      .single();

    if (!appt) {
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Rendez-vous introuvable.');
    }

    if (parsed.data.decision === 'confirmed' && appt.proposed_by === auth.user.id) {
      throw new AppError(400, 'CANNOT_SELF_CONFIRM', 'L’autre participant doit confirmer cette proposition.');
    }

    const nowIso = new Date().toISOString();

    if (parsed.data.decision === 'confirmed') {
      if (appt.slot_id) {
        const { data: bookedSlot } = await admin
          .from('availability_slots')
          .update({ status: 'booked' })
          .eq('id', appt.slot_id)
          .eq('status', 'available')
          .select('id')
          .maybeSingle();

        if (!bookedSlot) {
          throw new AppError(409, 'SLOT_ALREADY_TAKEN', 'Ce créneau vient d’être réservé par un autre patient.');
        }
      }

      if (appt.appointment_type === 'video') {
        await admin.from('video_sessions').insert({
          case_id: caseId,
          appointment_id: appt.id,
          room_token: appt.video_room_id || `room_${randomId(6)}`,
          status: 'ready',
        });
      }

      await admin
        .from('cases')
        .update({ status: 'appointment_confirmed', updated_at: nowIso })
        .eq('id', caseId);
    } else if (appt.slot_id && appt.proposal_status === 'confirmed') {
      await admin
        .from('availability_slots')
        .update({ status: 'available' })
        .eq('id', appt.slot_id);
    }

    const { data: updated } = await admin
      .from('appointments')
      .update({ proposal_status: parsed.data.decision, updated_at: nowIso })
      .eq('id', apptId)
      .select('*')
      .single();

    await admin.from('case_messages').insert({
      case_id: caseId,
      sender_id: auth.user.id,
      sender_role: auth.user.role,
      message_type: 'system',
      body_enc: encryptText(
        parsed.data.decision === 'confirmed'
          ? `Rendez-vous confirmé (${appt.appointment_type === 'video' ? 'Visio' : 'Cabinet'}).`
          : 'Proposition de rendez-vous annulée / déclinée.'
      ),
    });

    const recipientId =
      auth.user.id === caseRow.athlete_id ? String(caseRow.doctor_id) : String(caseRow.athlete_id);
    await sendNeutralNotification({
      userId: recipientId,
      channel: 'push',
      templateKey: 'appointment_updated',
      targetRef: caseId,
    });

    return jsonOk({ appointment: updated });
  } catch (err) {
    return jsonError(err);
  }
}
