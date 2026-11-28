import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { detectHeadTraumaKeywords } from '@/lib/prevention/alerts';
import { encryptText, randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const createCaseSchema = z.object({
  doctorId: z.string().uuid('Médecin invalide.'),
  mode: z.enum(['chat', 'video', 'physical']).default('video'),
  bodyPart: z.string().trim().max(60).optional().default('general'),
  sportContext: z.string().trim().max(120).optional().default('Suivi sportif régulier'),
  initialReason: z.string().trim().min(10, 'Expliquez brièvement votre besoin (10 caractères minimum).').max(2000),
  headRedFlags: z
    .object({
      lossOfConsciousness: z.boolean().optional(),
      confusion: z.boolean().optional(),
      vomiting: z.boolean().optional(),
      chestPain: z.boolean().optional(),
    })
    .optional(),
  shareTrainingTrends: z.boolean().default(false),
  healthDataConsentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Le consentement au traitement des données de santé est requis.' }),
  }),
});

export async function GET() {
  try {
    const auth = await requireRole('athlete');
    const admin = getSupabaseAdmin();

    const [{ data: rows }, { data: docs }] = await Promise.all([
      admin
        .from('cases')
        .select(`
          id, reference, doctor_id, specialty_id, mode, status, body_part, sport_context,
          share_training_trends, payment_unlocked, medical_record_updated, created_at, updated_at, completed_at
        `)
        .eq('athlete_id', auth.user.id)
        .order('created_at', { ascending: false }),
      admin.from('doctor_profiles').select('user_id, public_name, city, facility_name, specialties(name)'),
    ]);

    const docMap = new Map((docs || []).map((d) => [d.user_id, d]));

    return jsonOk({
      cases: (rows || []).map((r) => {
        const dp = docMap.get(r.doctor_id) as
          | {
              public_name?: string;
              city?: string;
              facility_name?: string;
              specialties?: { name?: string };
            }
          | undefined;
        return {
          id: r.id,
          reference: r.reference,
          doctorId: r.doctor_id,
          doctorName: dp?.public_name || 'Médecin Terrain+',
          doctorSpecialty: dp?.specialties?.name || 'Médecine du sport',
          doctorCity: dp?.city || '',
          doctorFacility: dp?.facility_name || '',
          mode: r.mode,
          status: r.status,
          bodyPart: r.body_part,
          sportContext: r.sport_context,
          shareTrainingTrends: r.share_training_trends,
          paymentUnlocked: r.payment_unlocked,
          medicalRecordUpdated: r.medical_record_updated,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          completedAt: r.completed_at,
        };
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('athlete');
    if (!auth.user.onboarding_completed) {
      throw new AppError(
        403,
        'ONBOARDING_REQUIRED',
        'Veuillez d’abord compléter le questionnaire sportif de première connexion.'
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createCaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_CASE_REQUEST', parsed.error.issues[0]?.message || 'Demande invalide.');
    }

    const d = parsed.data;
    const flags = d.headRedFlags || {};
    if (flags.lossOfConsciousness || flags.confusion || flags.vomiting || flags.chestPain) {
      throw new AppError(
        422,
        'URGENT_ESCALATION_REQUIRED',
        'Signes d’alerte urgents signalés : ce parcours asynchrone ne convient pas. Contactez immédiatement les urgences médicales locales (SAMU 1515 / Pompiers 18).'
      );
    }

    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from('doctor_profiles')
      .select('user_id, specialty_id, supports_video, supports_physical, verification_status, profiles!doctor_profiles_user_id_fkey(status)')
      .eq('user_id', d.doctorId)
      .single();

    const docAcc = doc?.profiles as { status?: string } | undefined;
    if (!doc || doc.verification_status !== 'verified' || docAcc?.status !== 'active') {
      throw new AppError(400, 'DOCTOR_NOT_VERIFIED', 'Le médecin sélectionné n’est pas vérifié ou n’est pas disponible.');
    }

    const headFlagged = d.bodyPart === 'tete' || detectHeadTraumaKeywords(d.initialReason);
    const reference = `TP-${Date.now().toString(36).toUpperCase()}-${randomId(2).toUpperCase()}`;

    const { data: created, error } = await admin
      .from('cases')
      .insert({
        reference,
        athlete_id: auth.user.id,
        doctor_id: d.doctorId,
        specialty_id: doc.specialty_id,
        mode: d.mode,
        status: 'awaiting_payment',
        body_part: d.bodyPart,
        sport_context: d.sportContext,
        initial_reason_enc: encryptText(d.initialReason),
        head_trauma_flagged: headFlagged,
        share_training_trends: d.shareTrainingTrends,
        payment_unlocked: false,
      })
      .select('*')
      .single();

    if (error || !created) {
      throw new AppError(500, 'CASE_CREATE_FAILED', 'Impossible de créer le dossier de consultation.');
    }

    await admin.from('consents').insert([
      {
        user_id: auth.user.id,
        case_id: created.id,
        consent_type: 'health_data_processing',
        text_version: 'health-case-v1',
        decision: 'accepted',
        metadata_json: { doctorId: d.doctorId, mode: d.mode },
      },
      {
        user_id: auth.user.id,
        case_id: created.id,
        consent_type: 'training_trends_share',
        text_version: 'trends-share-v1',
        decision: d.shareTrainingTrends ? 'accepted' : 'refused',
        metadata_json: { doctorId: d.doctorId },
      },
    ]);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'athlete',
      action: 'CASE_CREATED_AWAITING_PAYMENT',
      targetType: 'case',
      targetId: created.id,
      metadata: { doctorId: d.doctorId, mode: d.mode },
    });

    return jsonOk(
      {
        case: {
          id: created.id,
          reference: created.reference,
          status: created.status,
          amountFcfa: 10000,
          paymentUnlocked: false,
          headTraumaFlagged: headFlagged,
        },
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
