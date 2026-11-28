import { requireRole } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireRole('athlete');
    const admin = getSupabaseAdmin();

    const [{ data: appts }, { data: docs }] = await Promise.all([
      admin
        .from('appointments')
        .select('*')
        .eq('athlete_id', auth.user.id)
        .order('starts_at', { ascending: false }),
      admin.from('doctor_profiles').select('user_id, public_name, facility_name, specialties(name)'),
    ]);

    const docMap = new Map((docs || []).map((d) => [d.user_id, d]));

    return jsonOk({
      appointments: (appts || []).map((a) => {
        const dp = docMap.get(a.doctor_id) as
          | {
              public_name?: string;
              facility_name?: string;
              specialties?: { name?: string };
            }
          | undefined;
        return {
          id: a.id,
          caseId: a.case_id,
          appointmentType: a.appointment_type,
          proposalStatus: a.proposal_status,
          startsAt: a.starts_at,
          endsAt: a.ends_at,
          locationLabel: a.location_label,
          videoRoomId: a.video_room_id,
          doctorName: dp?.public_name || 'Médecin Terrain+',
          doctorSpecialty: dp?.specialties?.name || 'Médecine du sport',
          doctorFacility: dp?.facility_name || '',
        };
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}
