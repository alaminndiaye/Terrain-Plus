import { getAuthContext } from '@/lib/auth/session';
import { getFixedConsultationBreakdown } from '@/lib/adapters/payment';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: doctorId } = await context.params;
    const admin = getSupabaseAdmin();

    const { data: doc, error } = await admin
      .from('doctor_profiles')
      .select(`
        *,
        specialties(id, slug, name),
        profiles!doctor_profiles_user_id_fkey(status, phone)
      `)
      .eq('user_id', doctorId)
      .single();

    const prof = doc?.profiles as { status?: string; phone?: string } | undefined;
    if (error || !doc || doc.verification_status !== 'verified' || prof?.status !== 'active') {
      throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Médecin vérifié introuvable.');
    }

    const nowIso = new Date().toISOString();
    const [{ data: slots }, { data: reviews }] = await Promise.all([
      admin
        .from('availability_slots')
        .select('id, slot_mode, starts_at, ends_at, location_label, status')
        .eq('doctor_id', doctorId)
        .eq('status', 'available')
        .gt('ends_at', nowIso)
        .order('starts_at', { ascending: true }),
      admin
        .from('reviews')
        .select('id, rating, comment, created_at')
        .eq('doctor_id', doctorId)
        .eq('moderation_status', 'published')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    let contactUnlocked = false;
    let unlockedContact: { phone: string; facilityAddress: string } | null = null;

    const auth = await getAuthContext();
    if (auth?.user.role === 'athlete') {
      const { data: paidCase } = await admin
        .from('cases')
        .select('id')
        .eq('athlete_id', auth.user.id)
        .eq('doctor_id', doctorId)
        .eq('payment_unlocked', true)
        .limit(1)
        .maybeSingle();

      if (paidCase) {
        contactUnlocked = true;
        unlockedContact = {
          phone: prof?.phone || '',
          facilityAddress: doc.facility_address || doc.facility_name,
        };
      }
    }

    const revList = reviews || [];
    const avg = revList.length
      ? Number((revList.reduce((acc, r) => acc + r.rating, 0) / revList.length).toFixed(1))
      : null;

    const spec = doc.specialties as { id?: string; slug?: string; name?: string } | null;

    return jsonOk({
      doctor: {
        id: doc.user_id,
        publicName: doc.public_name,
        specialtyId: doc.specialty_id,
        specialtyName: spec?.name || 'Médecine du sport',
        otherSpecialties: doc.other_specialties_json || [],
        city: doc.city,
        facilityName: doc.facility_name,
        languages: doc.languages_json || ['Français'],
        bio: doc.bio,
        supportsVideo: Boolean(doc.supports_video),
        supportsPhysical: Boolean(doc.supports_physical),
        consultationFeeFcfa: 10000,
        verifiedBadge: 'Médecin vérifié',
        verifiedAt: doc.verified_at,
        contactUnlocked,
        unlockedContact,
        slots: slots || [],
        reviewsCount: revList.length,
        averageRating: avg,
        reviews: revList,
        pricing: getFixedConsultationBreakdown(),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
