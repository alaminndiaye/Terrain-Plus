import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const [{ data: specialties }, { data: verifiedDoctors }] = await Promise.all([
      admin.from('specialties').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      admin
        .from('doctor_profiles')
        .select('user_id, specialty_id, profiles!doctor_profiles_user_id_fkey!inner(status)')
        .eq('verification_status', 'verified')
        .eq('profiles.status', 'active'),
    ]);

    const counts = new Map<string, number>();
    for (const d of verifiedDoctors || []) {
      if (d.specialty_id) {
        counts.set(d.specialty_id, (counts.get(d.specialty_id) || 0) + 1);
      }
    }

    return jsonOk({
      specialties: (specialties || []).map((sp) => ({
        ...sp,
        doctorsCount: counts.get(sp.id) || 0,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
