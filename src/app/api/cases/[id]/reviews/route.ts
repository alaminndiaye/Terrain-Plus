import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, 'Votre avis doit contenir au moins 5 caractères.').max(600),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole('athlete');
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (caseRow.status !== 'completed') {
      throw new AppError(
        400,
        'CONSULTATION_NOT_COMPLETED',
        'Vous ne pouvez noter et commenter le médecin qu’après la clôture de la consultation.'
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_REVIEW', parsed.error.issues[0]?.message || 'Avis invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('reviews')
      .select('id')
      .eq('case_id', caseId)
      .maybeSingle();

    if (existing) {
      throw new AppError(409, 'REVIEW_ALREADY_EXISTS', 'Vous avez déjà noté cette consultation.');
    }

    const { data: created, error } = await admin
      .from('reviews')
      .insert({
        case_id: caseId,
        athlete_id: auth.user.id,
        doctor_id: caseRow.doctor_id,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        moderation_status: 'published',
      })
      .select('*')
      .single();

    if (error || !created) {
      throw new AppError(500, 'REVIEW_SAVE_FAILED', 'Impossible d’enregistrer votre avis.');
    }

    return jsonOk({ review: created }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
