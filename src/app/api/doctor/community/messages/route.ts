import { z } from 'zod';
import { requireVerifiedDoctor } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const startSchema = z.object({
  peerDoctorId: z.string().uuid(),
});

export async function GET() {
  try {
    const auth = await requireVerifiedDoctor();
    const admin = getSupabaseAdmin();

    const [{ data: threads }, { data: peers }] = await Promise.all([
      admin
        .from('doctor_dm_threads')
        .select('*')
        .or(`doctor_a_id.eq.${auth.user.id},doctor_b_id.eq.${auth.user.id}`)
        .order('last_message_at', { ascending: false }),
      admin
        .from('doctor_profiles')
        .select('user_id, public_name, city, facility_name, specialties(name), profiles!doctor_profiles_user_id_fkey(status)')
        .eq('verification_status', 'verified')
        .neq('user_id', auth.user.id),
    ]);

    const activePeers = (peers || [])
      .filter((p) => (p.profiles as { status?: string } | null)?.status === 'active')
      .map((p) => ({
        id: p.user_id,
        publicName: p.public_name,
        city: p.city,
        facilityName: p.facility_name,
        specialtyName: (p.specialties as { name?: string } | null)?.name || 'Médecine du sport',
      }));

    const peerMap = new Map(activePeers.map((p) => [p.id, p]));

    return jsonOk({
      threads: (threads || []).map((t) => {
        const peerId = t.doctor_a_id === auth.user.id ? t.doctor_b_id : t.doctor_a_id;
        return {
          id: t.id,
          peerDoctorId: peerId,
          peer: peerMap.get(peerId) || { id: peerId, publicName: 'Confrère vérifié', specialtyName: '' },
          lastMessageAt: t.last_message_at,
        };
      }),
      colleagues: activePeers,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedDoctor();
    const body = await req.json().catch(() => ({}));
    const parsed = startSchema.safeParse(body);
    if (!parsed.success || parsed.data.peerDoctorId === auth.user.id) {
      throw new AppError(400, 'INVALID_PEER_DOCTOR', 'Veuillez choisir un autre médecin vérifié.');
    }

    const admin = getSupabaseAdmin();
    const { data: peer } = await admin
      .from('doctor_profiles')
      .select('user_id, verification_status, profiles!doctor_profiles_user_id_fkey(status)')
      .eq('user_id', parsed.data.peerDoctorId)
      .single();

    const peerAcc = peer?.profiles as { status?: string } | undefined;
    if (!peer || peer.verification_status !== 'verified' || peerAcc?.status !== 'active') {
      throw new AppError(404, 'PEER_NOT_VERIFIED', 'Confrère introuvable ou non vérifié.');
    }

    const [doctorA, doctorB] =
      auth.user.id < parsed.data.peerDoctorId
        ? [auth.user.id, parsed.data.peerDoctorId]
        : [parsed.data.peerDoctorId, auth.user.id];

    const { data: existing } = await admin
      .from('doctor_dm_threads')
      .select('*')
      .eq('doctor_a_id', doctorA)
      .eq('doctor_b_id', doctorB)
      .maybeSingle();

    if (existing) {
      return jsonOk({ thread: existing });
    }

    const { data: created, error } = await admin
      .from('doctor_dm_threads')
      .insert({ doctor_a_id: doctorA, doctor_b_id: doctorB })
      .select('*')
      .single();

    if (error || !created) {
      throw new AppError(500, 'THREAD_CREATE_FAILED', 'Impossible d’ouvrir la discussion.');
    }

    return jsonOk({ thread: created }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
