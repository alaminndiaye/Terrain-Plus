import { z } from 'zod';
import { sendNeutralNotification } from '@/lib/adapters/notifications';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const completeSchema = z.object({
  entrySummary: z
    .string()
    .trim()
    .min(15, 'Veuillez renseigner la synthèse de la consultation (15 caractères min.) avant de clôturer.')
    .max(3000),
  recommendations: z
    .string()
    .trim()
    .min(10, 'Veuillez préciser les recommandations sportives / médicales (10 caractères min.).')
    .max(3000),
  clinicalSummary: z
    .string()
    .trim()
    .min(15, 'Le dossier médical partagé du sportif doit être rempli ou mis à jour (15 caractères min.).')
    .max(3000),
  contraindications: z.string().trim().max(1500).optional().default(''),
  fitnessGuidance: z.string().trim().max(1500).optional().default(''),
  fitnessStatus: z
    .enum(['apte_sans_restriction', 'reprise_progressive', 'repos_sportif', 'suivi_en_cours'])
    .default('suivi_en_cours'),
  nextFollowupAt: z.string().datetime().optional().nullable(),
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
      throw new AppError(400, 'CASE_NOT_PAID', 'Impossible de clôturer une consultation non réglée.');
    }
    if (['completed', 'transferred', 'cancelled'].includes(String(caseRow.status))) {
      throw new AppError(409, 'CASE_ALREADY_CLOSED', 'Cette consultation est déjà clôturée.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'MEDICAL_RECORD_UPDATE_REQUIRED',
        parsed.error.issues[0]?.message ||
          'Vous devez remplir le compte-rendu et mettre à jour le dossier médical du patient avant de clôturer.'
      );
    }

    const d = parsed.data;
    const admin = getSupabaseAdmin();

    const { data: rpcRes, error } = await admin.rpc('rpc_complete_case_with_record', {
      p_case_id: caseId,
      p_doctor_id: auth.user.id,
      p_entry_summary_enc: encryptText(d.entrySummary),
      p_recommendations_enc: encryptText(d.recommendations),
      p_clinical_summary_enc: encryptText(d.clinicalSummary),
      p_contraindications_enc: d.contraindications ? encryptText(d.contraindications) : null,
      p_fitness_guidance_enc: d.fitnessGuidance ? encryptText(d.fitnessGuidance) : null,
      p_fitness_status: d.fitnessStatus,
      p_next_followup_at: d.nextFollowupAt || null,
    });

    if (error) {
      throw new AppError(500, 'COMPLETE_CASE_FAILED', 'Impossible de clôturer la consultation.');
    }

    await admin.from('case_messages').insert({
      case_id: caseId,
      sender_id: auth.user.id,
      sender_role: 'doctor',
      message_type: 'system',
      body_enc: encryptText(
        'Consultation clôturée et dossier médical mis à jour. Cette discussion passe en lecture seule ; vous pouvez maintenant noter le médecin.'
      ),
    });

    await sendNeutralNotification({
      userId: String(caseRow.athlete_id),
      channel: 'push',
      templateKey: 'case_update',
      targetRef: caseId,
    });

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'doctor',
      action: 'CASE_COMPLETED_WITH_MEDICAL_RECORD',
      targetType: 'case',
      targetId: caseId,
    });

    return jsonOk({
      ok: true,
      ...(rpcRes as Record<string, unknown>),
    });
  } catch (err) {
    return jsonError(err);
  }
}
