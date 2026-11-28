import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { decryptText, encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const updateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  address: z.string().trim().min(4).max(160).optional(),
  city: z.string().trim().min(2).max(60).optional(),
  sports: z.array(z.string().trim().min(1)).min(1).max(10).optional(),
  primarySport: z.string().trim().min(2).optional(),
  practiceLevel: z.enum(['loisir', 'scolaire_universitaire', 'club', 'competition']).optional(),
  weeklyFrequency: z.string().trim().max(80).optional(),
  heightCm: z.number().int().min(120).max(240).nullable().optional(),
  weightKg: z.number().min(35).max(200).nullable().optional(),
  dominantSide: z.string().trim().max(30).nullable().optional(),
  medicalGoal: z.enum(['regular_followup', 'injury_advice', 'prevention', 'return_to_sport']).optional(),
  followupFrequency: z.enum(['monthly', 'quarterly', 'as_needed']).optional(),
  allergiesConditions: z.string().trim().max(800).optional(),
  priorInjuries: z.string().trim().max(1200).optional(),
});

export async function GET() {
  try {
    const auth = await requireRole('athlete');
    const admin = getSupabaseAdmin();
    const { data: ap } = await admin
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    return jsonOk({
      account: {
        firstName: auth.user.first_name,
        lastName: auth.user.last_name,
        phone: auth.user.phone,
        email: auth.user.email,
        address: auth.user.address,
        city: auth.user.city,
        birthDate: auth.user.birth_date,
        onboardingCompleted: auth.user.onboarding_completed,
      },
      profile: ap
        ? {
            sports: ap.sports_json || [],
            primarySport: ap.primary_sport,
            practiceLevel: ap.practice_level,
            weeklyFrequency: ap.weekly_frequency,
            heightCm: ap.height_cm,
            weightKg: ap.weight_kg,
            dominantSide: ap.dominant_side,
            medicalGoal: ap.medical_goal,
            followupFrequency: ap.followup_frequency,
            allergiesConditions: ap.allergies_conditions_enc
              ? decryptText(ap.allergies_conditions_enc)
              : '',
            priorInjuries: ap.prior_injuries_enc ? decryptText(ap.prior_injuries_enc) : '',
          }
        : null,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_PROFILE', parsed.error.issues[0]?.message || 'Données invalides.');
    }

    const input = parsed.data;
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    if (input.firstName || input.lastName || input.address || input.city) {
      const fn = input.firstName ?? auth.user.first_name;
      const ln = input.lastName ?? auth.user.last_name;
      await admin
        .from('profiles')
        .update({
          first_name: fn,
          last_name: ln,
          full_name: `${fn} ${ln}`,
          address: input.address ?? auth.user.address,
          city: input.city ?? auth.user.city,
          updated_at: nowIso,
        })
        .eq('id', auth.user.id);
    }

    const { data: existing } = await admin
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    await admin.from('athlete_profiles').upsert({
      user_id: auth.user.id,
      sports_json: input.sports ?? existing?.sports_json ?? [],
      primary_sport: input.primarySport ?? existing?.primary_sport ?? 'football',
      practice_level: input.practiceLevel ?? existing?.practice_level ?? 'loisir',
      weekly_frequency: input.weeklyFrequency ?? existing?.weekly_frequency ?? '',
      height_cm: input.heightCm !== undefined ? input.heightCm : (existing?.height_cm ?? null),
      weight_kg: input.weightKg !== undefined ? input.weightKg : (existing?.weight_kg ?? null),
      dominant_side: input.dominantSide !== undefined ? input.dominantSide : (existing?.dominant_side ?? null),
      medical_goal: input.medicalGoal ?? existing?.medical_goal ?? 'regular_followup',
      followup_frequency: input.followupFrequency ?? existing?.followup_frequency ?? 'monthly',
      allergies_conditions_enc:
        input.allergiesConditions !== undefined
          ? (input.allergiesConditions ? encryptText(input.allergiesConditions) : null)
          : (existing?.allergies_conditions_enc ?? null),
      prior_injuries_enc:
        input.priorInjuries !== undefined
          ? (input.priorInjuries ? encryptText(input.priorInjuries) : null)
          : (existing?.prior_injuries_enc ?? null),
      updated_at: nowIso,
    });

    return jsonOk({ ok: true, updatedAt: nowIso });
  } catch (err) {
    return jsonError(err);
  }
}
