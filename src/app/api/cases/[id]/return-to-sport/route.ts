import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const createPlanSchema = z.object({
  title: z.string().trim().min(4).max(120),
  steps: z
    .array(
      z.object({
        label: z.string().trim().min(3).max(160),
        criteria: z.string().trim().max(300).optional().default(''),
      })
    )
    .min(2)
    .max(8),
});

const validateStepSchema = z.object({
  stepId: z.string().uuid(),
  validated: z.boolean(),
  note: z.string().trim().max(400).optional().default(''),
  grantMedicalClearance: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole('doctor');
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });
    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Dossier non réglé.');
    }

    const body = await req.json().catch(() => ({}));
    const admin = getSupabaseAdmin();

    // Validate an existing step or grant medical clearance
    if ('stepId' in body) {
      const parsed = validateStepSchema.safeParse(body);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_VALIDATION', 'Données invalides.');
      }

      const { data: step } = await admin
        .from('return_to_sport_steps')
        .select('*, return_to_sport_plans!inner(id, athlete_id, doctor_id)')
        .eq('id', parsed.data.stepId)
        .single();

      const plan = step?.return_to_sport_plans as { id?: string; athlete_id?: string; doctor_id?: string } | undefined;
      if (!step || plan?.athlete_id !== caseRow.athlete_id) {
        throw new AppError(404, 'STEP_NOT_FOUND', 'Étape introuvable.');
      }

      const nowIso = new Date().toISOString();
      await admin
        .from('return_to_sport_steps')
        .update({
          doctor_validated_at: parsed.data.validated ? nowIso : null,
          doctor_note_enc: parsed.data.note ? encryptText(parsed.data.note) : null,
        })
        .eq('id', step.id);

      if (parsed.data.grantMedicalClearance && plan?.id) {
        await admin
          .from('return_to_sport_plans')
          .update({
            status: 'medical_clearance_granted',
            cleared_by_doctor_id: auth.user.id,
            cleared_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', plan.id);

        await recordAudit({
          actorId: auth.user.id,
          actorRole: 'doctor',
          action: 'RETURN_TO_SPORT_CLEARED_BY_DOCTOR',
          targetType: 'return_to_sport_plan',
          targetId: plan.id,
        });
      }

      return jsonOk({ ok: true });
    }

    // Create new Return-to-Sport plan
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_PLAN', parsed.error.issues[0]?.message || 'Plan invalide.');
    }

    const { data: plan, error } = await admin
      .from('return_to_sport_plans')
      .insert({
        athlete_id: caseRow.athlete_id,
        case_id: caseId,
        doctor_id: auth.user.id,
        title: parsed.data.title,
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !plan) {
      throw new AppError(500, 'PLAN_CREATE_FAILED', 'Impossible de créer le parcours de reprise.');
    }

    await admin.from('return_to_sport_steps').insert(
      parsed.data.steps.map((s, idx) => ({
        plan_id: plan.id,
        step_order: idx + 1,
        label: s.label,
        criteria: s.criteria,
      }))
    );

    return jsonOk({ planId: plan.id }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
