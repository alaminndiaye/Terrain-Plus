import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { evaluatePreventionSignals } from '@/lib/prevention/alerts';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { decryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { TrainingLog } from '@/lib/types';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const { id: caseId } = await context.params;
    const { caseRow, accessType, grantExpiresAt } = await assertCanAccessCase(auth, caseId);
    const admin = getSupabaseAdmin();

    const [
      { data: doctor },
      { data: athlete },
      { data: athleteProf },
      { data: payments },
      { data: appointments },
      { data: referrals },
      { data: review },
      { data: rtsPlan },
    ] = await Promise.all([
      admin
        .from('doctor_profiles')
        .select('user_id, public_name, city, facility_name, facility_address, specialties(name), profiles!doctor_profiles_user_id_fkey(phone)')
        .eq('user_id', String(caseRow.doctor_id))
        .single(),
      admin.from('profiles').select('id, full_name, city, birth_date').eq('id', String(caseRow.athlete_id)).single(),
      admin.from('athlete_profiles').select('*').eq('user_id', String(caseRow.athlete_id)).maybeSingle(),
      admin.from('payments').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
      admin.from('appointments').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
      admin.from('referrals').select('*').eq('source_case_id', caseId).order('created_at', { ascending: false }),
      admin.from('reviews').select('*').eq('case_id', caseId).maybeSingle(),
      admin
        .from('return_to_sport_plans')
        .select('*, return_to_sport_steps(*)')
        .eq('athlete_id', String(caseRow.athlete_id))
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const unlocked = Boolean(caseRow.payment_unlocked);
    let messages: Array<Record<string, unknown>> = [];
    let attachments: Array<Record<string, unknown>> = [];

    if (unlocked) {
      const [{ data: msgRows }, { data: attRows }] = await Promise.all([
        admin.from('case_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
        admin.from('case_attachments').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
      ]);
      const attByMsg = new Map<string, Array<Record<string, unknown>>>();
      for (const a of attRows || []) {
        const list = attByMsg.get(String(a.message_id)) || [];
        list.push({
          id: a.id,
          mediaKind: a.media_kind,
          originalName: a.original_name_safe,
          mimeType: a.mime_type,
          byteSize: a.byte_size,
        });
        attByMsg.set(String(a.message_id), list);
      }
      attachments = attRows || [];
      messages = (msgRows || []).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderRole: m.sender_role,
        messageType: m.message_type,
        body: decryptText(m.body_enc),
        metadata: m.metadata_json || {},
        attachments: attByMsg.get(m.id) || [],
        createdAt: m.created_at,
      }));
    }

    // Longitudinal medical record visible to athlete and to the doctor of an unlocked paid consultation (even from previous doctors!)
    let longitudinalRecord = null;
    let medicalEntries: Array<Record<string, unknown>> = [];
    if (unlocked || auth.user.role === 'athlete') {
      const [{ data: rec }, { data: entries }, { data: allDocs }] = await Promise.all([
        admin.from('athlete_medical_records').select('*').eq('athlete_id', String(caseRow.athlete_id)).maybeSingle(),
        admin
          .from('athlete_medical_entries')
          .select('*')
          .eq('athlete_id', String(caseRow.athlete_id))
          .order('created_at', { ascending: false })
          .limit(20),
        admin.from('doctor_profiles').select('user_id, public_name'),
      ]);
      const docMap = new Map((allDocs || []).map((d) => [d.user_id, d.public_name]));
      if (rec) {
        longitudinalRecord = {
          clinicalSummary: decryptText(rec.clinical_summary_enc),
          contraindications: rec.contraindications_enc ? decryptText(rec.contraindications_enc) : '',
          fitnessGuidance: rec.fitness_guidance_enc ? decryptText(rec.fitness_guidance_enc) : '',
          nextFollowupAt: rec.next_followup_at,
          lastUpdatedByDoctorName: rec.last_updated_by_doctor_id
            ? docMap.get(rec.last_updated_by_doctor_id) || 'Médecin Terrain+'
            : null,
          updatedAt: rec.updated_at,
        };
      }
      medicalEntries = (entries || []).map((e) => ({
        id: e.id,
        caseId: e.case_id,
        doctorName: docMap.get(e.doctor_id) || 'Médecin Terrain+',
        summary: decryptText(e.entry_summary_enc),
        recommendations: decryptText(e.recommendations_enc),
        fitnessStatus: e.fitness_status,
        nextFollowupAt: e.next_followup_at,
        createdAt: e.created_at,
      }));
    }

    // Selective sharing: doctor only sees athlete training trends when athlete explicitly enabled share_training_trends
    let sharedTrainingData: { logs: TrainingLog[]; signals: ReturnType<typeof evaluatePreventionSignals> } | null = null;
    if (unlocked && caseRow.share_training_trends) {
      const { data: logsRows } = await admin
        .from('training_logs')
        .select('*')
        .eq('athlete_id', String(caseRow.athlete_id))
        .order('session_date', { ascending: false })
        .limit(20);
      const formatted: TrainingLog[] = (logsRows || []).map((r) => ({
        id: r.id,
        athlete_id: r.athlete_id,
        session_date: r.session_date,
        sport: r.sport,
        session_type: r.session_type,
        duration_minutes: r.duration_minutes,
        rpe_intensity: r.rpe_intensity,
        fatigue_score: r.fatigue_score,
        sleep_score: r.sleep_score,
        recovery_score: r.recovery_score,
        has_discomfort: r.has_discomfort,
        discomfort_level: r.discomfort_level,
        body_part: r.body_part,
        performance_stats_json: r.performance_stats_json || {},
        created_at: r.created_at,
      }));
      sharedTrainingData = {
        logs: formatted,
        signals: evaluatePreventionSignals(formatted),
      };
    }

    const docSpec = doctor?.specialties as { name?: string } | null;
    const docProf = doctor?.profiles as { phone?: string } | null;
    const isClosed = ['completed', 'transferred', 'cancelled'].includes(String(caseRow.status));

    const referralDoctors = (referrals || []).length
      ? await admin
          .from('doctor_profiles')
          .select('user_id, public_name, facility_name, city, specialties(name)')
          .in(
            'user_id',
            (referrals || []).map((r) => r.to_doctor_id)
          )
      : { data: [] };
    const refDocMap = new Map((referralDoctors.data || []).map((d) => [d.user_id, d]));

    return jsonOk({
      accessType,
      ...(grantExpiresAt ? { exceptionalGrantExpiresAt: grantExpiresAt } : {}),
      case: {
        id: caseRow.id,
        reference: caseRow.reference,
        mode: caseRow.mode,
        status: caseRow.status,
        bodyPart: caseRow.body_part,
        sportContext: caseRow.sport_context,
        initialReason: decryptText(String(caseRow.initial_reason_enc)),
        headTraumaFlagged: Boolean(caseRow.head_trauma_flagged),
        shareTrainingTrends: Boolean(caseRow.share_training_trends),
        paymentUnlocked: unlocked,
        medicalRecordUpdated: Boolean(caseRow.medical_record_updated),
        canMessage: unlocked && !isClosed,
        canReview:
          auth.user.role === 'athlete' &&
          caseRow.status === 'completed' &&
          !review,
        athlete: {
          id: athlete?.id,
          fullName: athlete?.full_name || 'Sportif',
          city: athlete?.city || '',
          sports: athleteProf?.sports_json || [],
          primarySport: athleteProf?.primary_sport || '',
          practiceLevel: athleteProf?.practice_level || '',
          weeklyFrequency: athleteProf?.weekly_frequency || '',
          priorInjuries: athleteProf?.prior_injuries_enc ? decryptText(athleteProf.prior_injuries_enc) : '',
          allergiesConditions: athleteProf?.allergies_conditions_enc
            ? decryptText(athleteProf.allergies_conditions_enc)
            : '',
        },
        doctor: {
          id: doctor?.user_id,
          publicName: doctor?.public_name || 'Médecin Terrain+',
          specialtyName: docSpec?.name || 'Médecine du sport',
          city: doctor?.city || '',
          facilityName: doctor?.facility_name || '',
          ...(unlocked
            ? {
                phone: docProf?.phone || '',
                facilityAddress: doctor?.facility_address || doctor?.facility_name || '',
              }
            : { contactLockedNotice: 'Coordonnées masquées avant paiement des 10 000 FCFA.' }),
        },
        createdAt: caseRow.created_at,
        completedAt: caseRow.completed_at,
      },
      messages,
      attachmentsCount: attachments.length,
      payments: payments || [],
      appointments: appointments || [],
      referrals: (referrals || []).map((r) => {
        const td = refDocMap.get(r.to_doctor_id) as
          | { public_name?: string; facility_name?: string; city?: string; specialties?: { name?: string } }
          | undefined;
        return {
          id: r.id,
          referralType: r.referral_type,
          toDoctorId: r.to_doctor_id,
          toDoctorName: td?.public_name || 'Confrère vérifié',
          toDoctorSpecialty: td?.specialties?.name || '',
          toDoctorFacility: td?.facility_name || '',
          reason: decryptText(r.reason_enc),
          sharedFields: r.shared_fields_json || [],
          status: r.status,
          targetCaseId: r.target_case_id,
          createdAt: r.created_at,
          decidedAt: r.decided_at,
        };
      }),
      review,
      longitudinalRecord,
      medicalEntries,
      sharedTrainingData,
      returnToSportPlan: rtsPlan
        ? {
            ...rtsPlan,
            steps: ((rtsPlan.return_to_sport_steps as Array<Record<string, unknown>>) || []).sort(
              (a, b) => Number(a.step_order) - Number(b.step_order)
            ),
          }
        : null,
    });
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({
  shareTrainingTrends: z.boolean(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });
    if (auth.user.role !== 'athlete' || caseRow.athlete_id !== auth.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Seul le sportif peut modifier ce consentement.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_PATCH', 'Valeur invalide.');
    }

    const admin = getSupabaseAdmin();
    await admin
      .from('cases')
      .update({ share_training_trends: parsed.data.shareTrainingTrends, updated_at: new Date().toISOString() })
      .eq('id', caseId);

    await admin.from('consents').insert({
      user_id: auth.user.id,
      case_id: caseId,
      consent_type: 'training_trends_share',
      text_version: 'trends-share-v1',
      decision: parsed.data.shareTrainingTrends ? 'accepted' : 'refused',
    });

    return jsonOk({ ok: true, shareTrainingTrends: parsed.data.shareTrainingTrends });
  } catch (err) {
    return jsonError(err);
  }
}
