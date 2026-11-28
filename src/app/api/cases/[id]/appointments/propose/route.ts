import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText, randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const proposeSchema = z.object({
  appointmentType: z.enum(['video', 'physical']),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  locationLabel: z.string().trim().min(2).max(160).optional(),
  slotId: z.string().uuid().optional().nullable(),
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
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Paiement requis avant de fixer un rendez-vous.');
    }
    if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status))) {
      throw new AppError(403, 'CASE_READ_ONLY', 'Consultation clôturée.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = proposeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_APPOINTMENT', 'Date, horaire ou type de rendez-vous invalide.');
    }

    const start = new Date(parsed.data.startsAt);
    const end = new Date(parsed.data.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new AppError(400, 'INVALID_TIME_RANGE', 'Plage horaire invalide.');
    }

    const admin = getSupabaseAdmin();
    let locationLabel = parsed.data.locationLabel || '';
    if (parsed.data.appointmentType === 'video') {
      locationLabel = 'Téléconsultation Visio sécurisée Terrain+';
    } else if (!locationLabel) {
      const { data: doc } = await admin
        .from('doctor_profiles')
        .select('facility_name, facility_address')
        .eq('user_id', String(caseRow.doctor_id))
        .maybeSingle();
      locationLabel = doc?.facility_address || doc?.facility_name || 'Cabinet médical';
    }

    if (parsed.data.slotId) {
      const { data: slot } = await admin
        .from('availability_slots')
        .select('id, status')
        .eq('id', parsed.data.slotId)
        .eq('doctor_id', String(caseRow.doctor_id))
        .single();
      if (!slot || slot.status !== 'available') {
        throw new AppError(409, 'SLOT_UNAVAILABLE', 'Ce créneau n’est plus disponible.');
      }
    }

    const videoRoomId =
      parsed.data.appointmentType === 'video' ? `room_${caseId.slice(0, 8)}_${randomId(4)}` : null;

    const { data: appt, error } = await admin
      .from('appointments')
      .insert({
        case_id: caseId,
        slot_id: parsed.data.slotId || null,
        athlete_id: caseRow.athlete_id,
        doctor_id: caseRow.doctor_id,
        appointment_type: parsed.data.appointmentType,
        proposed_by: auth.user.id,
        proposal_status: 'proposed',
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location_label: locationLabel,
        video_room_id: videoRoomId,
      })
      .select('*')
      .single();

    if (error || !appt) {
      throw new AppError(500, 'APPT_PROPOSE_FAILED', 'Impossible de proposer le rendez-vous.');
    }

    const msgText = `Proposition de rendez-vous ${
      parsed.data.appointmentType === 'video' ? 'en Visio' : 'en Cabinet'
    } le ${start.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} (${locationLabel}).`;

    await admin.from('case_messages').insert({
      case_id: caseId,
      sender_id: auth.user.id,
      sender_role: auth.user.role,
      message_type: 'appointment_proposal',
      body_enc: encryptText(msgText),
      metadata_json: {
        appointmentId: appt.id,
        appointmentType: appt.appointment_type,
        startsAt: appt.starts_at,
        locationLabel,
      },
    });

    const recipientId =
      auth.user.id === caseRow.athlete_id ? String(caseRow.doctor_id) : String(caseRow.athlete_id);
    await sendNeutralNotification({
      userId: recipientId,
      channel: 'push',
      templateKey: 'appointment_updated',
      targetRef: caseId,
    });

    return jsonOk({ appointment: appt }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
