import { getFixedConsultationBreakdown } from '@/lib/adapters/payment';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const specialtyFilter = (url.searchParams.get('specialty') || '').trim().toLowerCase();
    const cityFilter = (url.searchParams.get('city') || '').trim().toLowerCase();
    const modeFilter = (url.searchParams.get('mode') || '').trim().toLowerCase();
    const availableOnly = url.searchParams.get('available') === 'true';

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const [{ data: docs }, { data: specialties }, { data: slots }, { data: reviews }] = await Promise.all([
      admin
        .from('doctor_profiles')
        .select(`
          user_id, specialty_id, public_name, other_specialties_json, city, facility_name,
          languages_json, bio, supports_video, supports_physical, consultation_fee_fcfa,
          verification_status, verified_at, profiles!doctor_profiles_user_id_fkey!inner(status)
        `)
        .eq('verification_status', 'verified')
        .eq('profiles.status', 'active')
        .order('public_name', { ascending: true }),
      admin.from('specialties').select('id, slug, name'),
      admin
        .from('availability_slots')
        .select('id, doctor_id, slot_mode, starts_at, ends_at, location_label')
        .eq('status', 'available')
        .gt('ends_at', nowIso)
        .order('starts_at', { ascending: true }),
      admin
        .from('reviews')
        .select('doctor_id, rating')
        .eq('moderation_status', 'published'),
    ]);

    const specMap = new Map((specialties || []).map((s) => [s.id, s]));
    const slotsByDoc = new Map<string, Array<Record<string, unknown>>>();
    for (const s of slots || []) {
      const arr = slotsByDoc.get(s.doctor_id) || [];
      arr.push(s);
      slotsByDoc.set(s.doctor_id, arr);
    }

    const reviewsByDoc = new Map<string, number[]>();
    for (const r of reviews || []) {
      const arr = reviewsByDoc.get(r.doctor_id) || [];
      arr.push(r.rating);
      reviewsByDoc.set(r.doctor_id, arr);
    }

    const doctors = [];
    for (const row of docs || []) {
      const sp = row.specialty_id ? specMap.get(row.specialty_id) : null;
      const specName = sp?.name || 'Médecine du sport';
      const specSlug = sp?.slug || '';
      const otherSpecs: string[] = Array.isArray(row.other_specialties_json) ? row.other_specialties_json : [];

      if (q) {
        const hay = `${row.public_name} ${specName} ${otherSpecs.join(' ')} ${row.city} ${row.facility_name}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (specialtyFilter) {
        const matchesSpec =
          specSlug.toLowerCase() === specialtyFilter ||
          String(row.specialty_id || '').toLowerCase() === specialtyFilter ||
          specName.toLowerCase().includes(specialtyFilter);
        if (!matchesSpec) continue;
      }
      if (cityFilter && !String(row.city || '').toLowerCase().includes(cityFilter)) continue;
      if (modeFilter === 'video' && !row.supports_video) continue;
      if (modeFilter === 'physical' && !row.supports_physical) continue;

      const docSlots = slotsByDoc.get(row.user_id) || [];
      if (availableOnly && docSlots.length === 0 && !row.supports_video) continue;

      const docRatings = reviewsByDoc.get(row.user_id) || [];
      const avgRating = docRatings.length
        ? Number((docRatings.reduce((a, b) => a + b, 0) / docRatings.length).toFixed(1))
        : null;

      doctors.push({
        id: row.user_id,
        publicName: row.public_name,
        specialtyId: row.specialty_id,
        specialtySlug: specSlug,
        specialtyName: specName,
        otherSpecialties: otherSpecs,
        city: row.city,
        facilityName: row.facility_name,
        languages: Array.isArray(row.languages_json) ? row.languages_json : ['Français'],
        bio: row.bio,
        supportsVideo: Boolean(row.supports_video),
        supportsPhysical: Boolean(row.supports_physical),
        consultationFeeFcfa: 10000,
        verifiedBadge: 'Médecin vérifié',
        availableSlotsCount: docSlots.length,
        nextSlotAt: (docSlots[0]?.starts_at as string) || null,
        reviewsCount: docRatings.length,
        averageRating: avgRating,
      });
    }

    return jsonOk({
      pricing: getFixedConsultationBreakdown(),
      disclaimer:
        'Les profils présentés sont des médecins vérifiés. La plateforme facilite la mise en relation et le suivi sans poser de diagnostic automatique.',
      doctors,
    });
  } catch (err) {
    return jsonError(err);
  }
}
