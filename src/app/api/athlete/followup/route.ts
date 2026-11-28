import { requireRole } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { decryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireRole('athlete');
    const admin = getSupabaseAdmin();

    const [{ data: record }, { data: entries }, { data: plans }, { data: docs }] = await Promise.all([
      admin
        .from('athlete_medical_records')
        .select('*')
        .eq('athlete_id', auth.user.id)
        .maybeSingle(),
      admin
        .from('athlete_medical_entries')
        .select('*')
        .eq('athlete_id', auth.user.id)
        .order('created_at', { ascending: false }),
      admin
        .from('return_to_sport_plans')
        .select('*, return_to_sport_steps(*)')
        .eq('athlete_id', auth.user.id)
        .order('created_at', { ascending: false }),
      admin.from('doctor_profiles').select('user_id, public_name'),
    ]);

    const docNames = new Map((docs || []).map((d) => [d.user_id, d.public_name]));

    return jsonOk({
      medicalRecord: record
        ? {
            lastUpdatedByDoctorName: record.last_updated_by_doctor_id
              ? docNames.get(record.last_updated_by_doctor_id) || 'Médecin Terrain+'
              : null,
            clinicalSummary: decryptText(record.clinical_summary_enc),
            contraindications: record.contraindications_enc
              ? decryptText(record.contraindications_enc)
              : '',
            fitnessGuidance: record.fitness_guidance_enc
              ? decryptText(record.fitness_guidance_enc)
              : '',
            nextFollowupAt: record.next_followup_at,
            updatedAt: record.updated_at,
          }
        : null,
      entries: (entries || []).map((e) => ({
        id: e.id,
        caseId: e.case_id,
        doctorName: docNames.get(e.doctor_id) || 'Médecin Terrain+',
        summary: decryptText(e.entry_summary_enc),
        recommendations: decryptText(e.recommendations_enc),
        fitnessStatus: e.fitness_status,
        nextFollowupAt: e.next_followup_at,
        createdAt: e.created_at,
      })),
      returnToSportPlans: (plans || []).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        doctorName: docNames.get(p.doctor_id) || 'Médecin Terrain+',
        clearedAt: p.cleared_at,
        disclaimer:
          'Votre progression aide au suivi avec votre praticien. Seul le médecin ou kinésithérapeute valide la reprise finale.',
        steps: ((p.return_to_sport_steps as Array<Record<string, unknown>>) || [])
          .sort((a, b) => Number(a.step_order) - Number(b.step_order))
          .map((s) => ({
            id: s.id,
            stepOrder: s.step_order,
            label: s.label,
            criteria: s.criteria,
            athleteDoneAt: s.athlete_done_at,
            athleteNote: s.athlete_note_enc ? decryptText(String(s.athlete_note_enc)) : '',
            doctorValidatedAt: s.doctor_validated_at,
            doctorNote: s.doctor_note_enc ? decryptText(String(s.doctor_note_enc)) : '',
          })),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
