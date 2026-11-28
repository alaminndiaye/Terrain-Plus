import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { encryptText, isAdultBirthDate } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const onboardingSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sports: z.array(z.string().trim().min(1)).min(1, 'Sélectionnez au moins un sport pratiqué.').max(10),
  primarySport: z.string().trim().min(2),
  practiceLevel: z.enum(['loisir', 'scolaire_universitaire', 'club', 'competition']),
  weeklyFrequency: z.string().trim().min(1, 'Précisez votre fréquence hebdomadaire.').max(80),
  heightCm: z.number().int().min(120).max(240).nullable().optional(),
  weightKg: z.number().min(35).max(200).nullable().optional(),
  dominantSide: z.string().trim().max(30).nullable().optional(),
  medicalGoal: z.enum(['regular_followup', 'injury_advice', 'prevention', 'return_to_sport']),
  followupFrequency: z.enum(['monthly', 'quarterly', 'as_needed']).default('monthly'),
  allergiesConditions: z.string().trim().max(800).optional().default(''),
  priorInjuries: z.string().trim().max(1200).optional().default(''),
  healthDataConsentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Votre consentement au traitement des données de santé est requis.' }),
  }),
});

export async function POST(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const body = await req.json().catch(() => ({}));
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_ONBOARDING', parsed.error.issues[0]?.message || 'Informations incomplètes.');
    }

    const input = parsed.data;
    const effectiveBirthDate = input.birthDate || auth.user.birth_date || '';
    if (!isAdultBirthDate(effectiveBirthDate)) {
      throw new AppError(
        400,
        'UNDERAGE_FORBIDDEN',
        'La plateforme est réservée aux pratiquants majeurs (18 ans et plus).'
      );
    }

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    await admin.from('athlete_profiles').upsert({
      user_id: auth.user.id,
      sports_json: input.sports,
      primary_sport: input.primarySport,
      practice_level: input.practiceLevel,
      weekly_frequency: input.weeklyFrequency,
      height_cm: input.heightCm ?? null,
      weight_kg: input.weightKg ?? null,
      dominant_side: input.dominantSide ?? null,
      medical_goal: input.medicalGoal,
      followup_frequency: input.followupFrequency,
      allergies_conditions_enc: input.allergiesConditions ? encryptText(input.allergiesConditions) : null,
      prior_injuries_enc: input.priorInjuries ? encryptText(input.priorInjuries) : null,
      updated_at: nowIso,
    });

    await admin.from('consents').insert({
      user_id: auth.user.id,
      consent_type: 'health_data_processing',
      text_version: 'health-onboarding-v1',
      decision: 'accepted',
      metadata_json: { primarySport: input.primarySport, medicalGoal: input.medicalGoal },
    });

    await admin
      .from('profiles')
      .update({
        birth_date: effectiveBirthDate,
        onboarding_completed: true,
        updated_at: nowIso,
      })
      .eq('id', auth.user.id);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'athlete',
      action: 'ATHLETE_ONBOARDING_COMPLETED',
      targetType: 'athlete_profile',
      targetId: auth.user.id,
    });

    return jsonOk({ ok: true, onboardingCompleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
