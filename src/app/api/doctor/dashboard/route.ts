import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const applicationSchema = z.object({
  publicName: z.string().trim().min(3).max(100),
  specialtyId: z.string().uuid('Veuillez choisir une spécialité.'),
  orderNumber: z.string().trim().min(3, 'Numéro d’inscription à l’Ordre requis.').max(60),
  city: z.string().trim().min(2).max(60),
  facilityName: z.string().trim().min(3, 'Structure d’exercice requise.').max(120),
  facilityAddress: z.string().trim().max(180).optional().default(''),
  bio: z.string().trim().max(800).optional().default(''),
  languages: z.array(z.string().trim()).min(1).max(6).optional().default(['Français']),
  supportsVideo: z.boolean().optional().default(true),
  supportsPhysical: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const auth = await requireRole('doctor');
    const admin = getSupabaseAdmin();

    const [{ data: profile }, { data: evidence }, { data: cases }, { data: payments }, { data: specialties }] =
      await Promise.all([
        admin
          .from('doctor_profiles')
          .select('*, specialties(id, name, slug)')
          .eq('user_id', auth.user.id)
          .single(),
        admin
          .from('doctor_evidence')
          .select('id, doc_type, original_name_safe, mime_type, byte_size, uploaded_at')
          .eq('doctor_id', auth.user.id)
          .order('uploaded_at', { ascending: false }),
        admin
          .from('cases')
          .select('id, status, payment_unlocked')
          .eq('doctor_id', auth.user.id)
          .eq('payment_unlocked', true),
        admin
          .from('payments')
          .select('doctor_net_fcfa, status, payout_id, doctor_id, original_doctor_id')
          .or(`doctor_id.eq.${auth.user.id},original_doctor_id.eq.${auth.user.id}`),
        admin.from('specialties').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      ]);

    const activeCases = (cases || []).filter((c) =>
      ['open', 'in_discussion', 'appointment_confirmed', 'referral_proposed'].includes(c.status)
    ).length;
    const completedCases = (cases || []).filter((c) => c.status === 'completed').length;
    const completedIds = new Set((cases || []).filter((c) => c.status === 'completed').map((c) => c.id));
    void completedIds;

    const myEarnedPayments = (payments || []).filter(
      (p) => p.doctor_id === auth.user.id && p.status === 'succeeded'
    );
    const totalNetFcfa = myEarnedPayments.reduce((s, p) => s + Number(p.doctor_net_fcfa || 0), 0);

    return jsonOk({
      verification: {
        status: profile?.verification_status || 'to_complete',
        reason: profile?.verification_reason || null,
        submittedAt: profile?.submitted_at || null,
        slaDueAt: profile?.sla_due_at || null,
        slaTargetHours: 72,
        verifiedAt: profile?.verified_at || null,
        evidence: evidence || [],
      },
      profile: {
        publicName: profile?.public_name || `Dr. ${auth.user.full_name}`,
        specialtyId: profile?.specialty_id || null,
        specialtyName: (profile?.specialties as { name?: string } | null)?.name || '',
        orderNumber: profile?.order_number || '',
        city: profile?.city || auth.user.city,
        facilityName: profile?.facility_name || '',
        facilityAddress: profile?.facility_address || '',
        languages: profile?.languages_json || ['Français'],
        bio: profile?.bio || '',
        supportsVideo: Boolean(profile?.supports_video ?? true),
        supportsPhysical: Boolean(profile?.supports_physical ?? true),
        consultationFeeFcfa: 10000,
      },
      stats: {
        totalCases: (cases || []).length,
        activeCases,
        completedCases,
        paidCount: myEarnedPayments.length,
        totalNetFcfa,
      },
      specialties: specialties || [],
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireRole('doctor');
    const admin = getSupabaseAdmin();

    const { data: current } = await admin
      .from('doctor_profiles')
      .select('verification_status, submitted_at, sla_due_at')
      .eq('user_id', auth.user.id)
      .single();

    if (current?.verification_status === 'suspended') {
      throw new AppError(403, 'DOCTOR_SUSPENDED', 'Compte médecin suspendu.');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = applicationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INCOMPLETE_APPLICATION', parsed.error.issues[0]?.message || 'Données invalides.');
    }

    const d = parsed.data;
    if (!d.supportsVideo && !d.supportsPhysical) {
      throw new AppError(400, 'NO_MODE_SELECTED', 'Sélectionnez au moins un mode de consultation (Visio ou Cabinet).');
    }

    const { count: evCount } = await admin
      .from('doctor_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', auth.user.id);

    const now = new Date();
    const nowIso = now.toISOString();
    let nextStatus = current?.verification_status || 'to_complete';
    let submittedAt = current?.submitted_at || null;
    let slaDueAt = current?.sla_due_at || null;

    if (nextStatus !== 'verified') {
      if ((evCount || 0) > 0) {
        nextStatus = 'pending';
        submittedAt = submittedAt || nowIso;
        slaDueAt = slaDueAt || new Date(now.getTime() + 72 * 3600 * 1000).toISOString();
      } else {
        nextStatus = 'to_complete';
      }
    }

    await admin
      .from('doctor_profiles')
      .update({
        public_name: d.publicName,
        specialty_id: d.specialtyId,
        order_number: d.orderNumber,
        city: d.city,
        facility_name: d.facilityName,
        facility_address: d.facilityAddress,
        languages_json: d.languages,
        bio: d.bio,
        supports_video: d.supportsVideo,
        supports_physical: d.supportsPhysical,
        consultation_fee_fcfa: 10000,
        verification_status: nextStatus,
        submitted_at: submittedAt,
        sla_due_at: slaDueAt,
        updated_at: nowIso,
      })
      .eq('user_id', auth.user.id);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'doctor',
      action: 'DOCTOR_PROFILE_UPDATED',
      targetType: 'doctor_profile',
      targetId: auth.user.id,
      metadata: { verificationStatus: nextStatus },
    });

    return jsonOk({ ok: true, verificationStatus: nextStatus, slaDueAt });
  } catch (err) {
    return jsonError(err);
  }
}
