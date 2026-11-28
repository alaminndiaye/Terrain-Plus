import { requireVerifiedDoctor } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireVerifiedDoctor();
    const admin = getSupabaseAdmin();

    const [{ data: cases }, { data: appointments }, { data: payments }, { data: colleagues }] =
      await Promise.all([
        admin
          .from('cases')
          .select(`
            id, reference, athlete_id, mode, status, body_part, sport_context,
            head_trauma_flagged, medical_record_updated, share_training_trends,
            created_at, updated_at, completed_at,
            profiles!cases_athlete_id_fkey(full_name, city)
          `)
          .eq('doctor_id', auth.user.id)
          .eq('payment_unlocked', true)
          .order('updated_at', { ascending: false }),
        admin
          .from('appointments')
          .select('*, profiles!appointments_athlete_id_fkey(full_name)')
          .eq('doctor_id', auth.user.id)
          .order('starts_at', { ascending: true }),
        admin
          .from('payments')
          .select('*')
          .or(`doctor_id.eq.${auth.user.id},original_doctor_id.eq.${auth.user.id}`)
          .order('created_at', { ascending: false }),
        admin
          .from('doctor_profiles')
          .select('user_id, public_name, city, facility_name, specialties(name), profiles!doctor_profiles_user_id_fkey(status)')
          .eq('verification_status', 'verified')
          .neq('user_id', auth.user.id),
      ]);

    return jsonOk({
      cases: (cases || []).map((c) => {
        const ath = c.profiles as { full_name?: string; city?: string } | null;
        return {
          ...c,
          athleteName: ath?.full_name || 'Sportif',
          athleteCity: ath?.city || '',
        };
      }),
      appointments: (appointments || []).map((a) => ({
        ...a,
        athleteName: (a.profiles as { full_name?: string } | null)?.full_name || 'Sportif',
      })),
      payments: (payments || []).map((p) => ({
        ...p,
        isTransferredAway: p.original_doctor_id === auth.user.id && p.doctor_id !== auth.user.id,
        isTransferredIn: p.doctor_id === auth.user.id && p.original_doctor_id !== auth.user.id,
      })),
      colleagues: (colleagues || [])
        .filter((d) => (d.profiles as { status?: string } | null)?.status === 'active')
        .map((d) => ({
          id: d.user_id,
          publicName: d.public_name,
          city: d.city,
          facilityName: d.facility_name,
          specialtyName: (d.specialties as { name?: string } | null)?.name || 'Médecine du sport',
        })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
