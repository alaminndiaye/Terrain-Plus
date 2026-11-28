import { z } from 'zod';
import { requireVerifiedPhoneAuth } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { assertCanAccessCase } from '@/lib/security/caseAccess';
import { randomId } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const actionSchema = z.object({
  action: z.enum(['start', 'end']),
  appointmentId: z.string().uuid().optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Paiement requis pour la visio.');
    }

    const admin = getSupabaseAdmin();
    let { data: session } = await admin
      .from('video_sessions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: created } = await admin
        .from('video_sessions')
        .insert({
          case_id: caseId,
          room_token: `room_${caseId.slice(0, 8)}_${randomId(4)}`,
          status: 'ready',
        })
        .select('*')
        .single();
      session = created;
    }

    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const parsed = JSON.parse(process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) iceServers = parsed;
    } catch {
      // Keep default public STUN
    }

    return jsonOk({
      videoSession: session,
      channelName: `case-video-${caseId}`,
      iceServers,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireVerifiedPhoneAuth();
    const { id: caseId } = await context.params;
    const { caseRow } = await assertCanAccessCase(auth, caseId, { allowExceptionalAdmin: false });

    if (!caseRow.payment_unlocked) {
      throw new AppError(403, 'PAYMENT_REQUIRED', 'Paiement requis.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_VIDEO_ACTION', 'Action invalide (start / end).');
    }

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: existing } = await admin
      .from('video_sessions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (parsed.data.action === 'start') {
      if (!existing) {
        const { data: created } = await admin
          .from('video_sessions')
          .insert({
            case_id: caseId,
            appointment_id: parsed.data.appointmentId || null,
            room_token: `room_${caseId.slice(0, 8)}_${randomId(4)}`,
            status: 'live',
            started_at: nowIso,
          })
          .select('*')
          .single();
        return jsonOk({ videoSession: created });
      }
      const { data: updated } = await admin
        .from('video_sessions')
        .update({ status: 'live', started_at: existing.started_at || nowIso })
        .eq('id', existing.id)
        .select('*')
        .single();
      return jsonOk({ videoSession: updated });
    }

    if (!existing) {
      return jsonOk({ videoSession: null });
    }
    const startMs = existing.started_at ? new Date(existing.started_at).getTime() : Date.now();
    const durationSec = Math.max(0, Math.round((Date.now() - startMs) / 1000));
    const { data: ended } = await admin
      .from('video_sessions')
      .update({
        status: 'ended',
        ended_at: nowIso,
        duration_seconds: existing.duration_seconds + durationSec,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    return jsonOk({ videoSession: ended });
  } catch (err) {
    return jsonError(err);
  }
}
