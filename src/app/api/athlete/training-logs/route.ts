import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { evaluatePreventionSignals } from '@/lib/prevention/alerts';
import { decryptText, encryptText } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { TrainingLog } from '@/lib/types';

const logSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sport: z.string().trim().min(2).max(50),
  sessionType: z.enum(['training', 'match', 'conditioning', 'recovery', 'other']),
  durationMinutes: z.number().int().min(1).max(600),
  rpeIntensity: z.number().int().min(1).max(10),
  fatigueScore: z.number().int().min(1).max(5),
  sleepScore: z.number().int().min(1).max(5),
  recoveryScore: z.number().int().min(1).max(5),
  hasDiscomfort: z.boolean().default(false),
  discomfortLevel: z.number().int().min(0).max(10).default(0),
  bodyPart: z.string().trim().max(60).nullable().optional(),
  performanceStats: z.record(z.union([z.string(), z.number()])).optional().default({}),
  notes: z.string().trim().max(800).optional().default(''),
});

function formatLogRow(row: Record<string, unknown>): TrainingLog {
  return {
    id: String(row.id),
    athlete_id: String(row.athlete_id),
    session_date: String(row.session_date),
    sport: String(row.sport),
    session_type: row.session_type as TrainingLog['session_type'],
    duration_minutes: Number(row.duration_minutes),
    rpe_intensity: Number(row.rpe_intensity),
    fatigue_score: Number(row.fatigue_score),
    sleep_score: Number(row.sleep_score),
    recovery_score: Number(row.recovery_score),
    has_discomfort: Boolean(row.has_discomfort),
    discomfort_level: Number(row.discomfort_level),
    body_part: row.body_part ? String(row.body_part) : null,
    performance_stats_json: (row.performance_stats_json as Record<string, string | number>) || {},
    notes: row.notes_enc ? decryptText(String(row.notes_enc)) : '',
    created_at: String(row.created_at),
  };
}

export async function GET() {
  try {
    const auth = await requireRole('athlete');
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('training_logs')
      .select('*')
      .eq('athlete_id', auth.user.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw new AppError(500, 'FETCH_LOGS_FAILED', 'Impossible de charger votre journal.');
    const logs = (data || []).map(formatLogRow);
    const signals = evaluatePreventionSignals(logs);

    return jsonOk({
      logs,
      signals,
      privacyNotice:
        'Vos séances et douleurs déclarées sont privées par défaut et ne sont jamais partagées aux clubs ou entraîneurs.',
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const body = await req.json().catch(() => ({}));
    const parsed = logSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TRAINING_LOG', parsed.error.issues[0]?.message || 'Saisie invalide.');
    }
    const d = parsed.data;
    const admin = getSupabaseAdmin();

    const { data: inserted, error } = await admin
      .from('training_logs')
      .insert({
        athlete_id: auth.user.id,
        session_date: d.sessionDate,
        sport: d.sport,
        session_type: d.sessionType,
        duration_minutes: d.durationMinutes,
        rpe_intensity: d.rpeIntensity,
        fatigue_score: d.fatigueScore,
        sleep_score: d.sleepScore,
        recovery_score: d.recoveryScore,
        has_discomfort: d.hasDiscomfort,
        discomfort_level: d.hasDiscomfort ? Math.max(1, d.discomfortLevel) : 0,
        body_part: d.hasDiscomfort ? (d.bodyPart || 'autre') : null,
        performance_stats_json: d.performanceStats,
        notes_enc: d.notes ? encryptText(d.notes) : null,
      })
      .select('*')
      .single();

    if (error || !inserted) {
      throw new AppError(500, 'SAVE_LOG_FAILED', 'Impossible d’enregistrer la séance.');
    }

    const { data: recent } = await admin
      .from('training_logs')
      .select('*')
      .eq('athlete_id', auth.user.id)
      .order('session_date', { ascending: false })
      .limit(20);

    const logs = (recent || []).map(formatLogRow);
    return jsonOk(
      {
        log: formatLogRow(inserted),
        signals: evaluatePreventionSignals(logs),
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireRole('athlete');
    const url = new URL(req.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) throw new AppError(400, 'MISSING_ID', 'Identifiant de séance manquant.');

    const admin = getSupabaseAdmin();
    await admin.from('training_logs').delete().eq('id', id).eq('athlete_id', auth.user.id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
