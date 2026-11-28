import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  stepId: z.string().uuid(),
  done: z.boolean(),
  note: z.string().trim().max(400).optional().default(''),
});

/**
 * Athlete can log subjective progress on a Return-to-Sport step,
 * NEVER set doctor_validated_at or medical_clearance_granted.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_STEP_UPDATE', 'Paramètres invalides.');
    }

    const admin = getSupabaseAdmin();
    const { data: step } = await admin
      .from('return_to_sport_steps')
      .select('id, plan_id, return_to_sport_plans!inner(athlete_id, status)')
      .eq('id', parsed.data.stepId)
      .single();

    const plan = step?.return_to_sport_plans as { athlete_id?: string; status?: string } | undefined;
    if (!step || plan?.athlete_id !== auth.user.id) {
      throw new AppError(404, 'STEP_NOT_FOUND', 'Étape introuvable.');
    }

    const nowIso = parsed.data.done ? new Date().toISOString() : null;
    await admin
      .from('return_to_sport_steps')
      .update({
        athlete_done_at: nowIso,
        athlete_note_enc: parsed.data.note ? encryptText(parsed.data.note) : null,
      })
      .eq('id', step.id);

    return jsonOk({
      ok: true,
      athleteDoneAt: nowIso,
      notice: 'Progression enregistrée. La validation médicale de reprise reste exclusivement réservée au praticien.',
    });
  } catch (err) {
    return jsonError(err);
  }
}
