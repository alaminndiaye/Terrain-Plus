import { requireRole } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    await requireRole('admin');
    const url = new URL(req.url);
    const statusFilter = (url.searchParams.get('status') || '').trim();
    const admin = getSupabaseAdmin();

    let query = admin
      .from('doctor_profiles')
      .select(`
        *,
        specialties(name),
        profiles!doctor_profiles_user_id_fkey(email, phone, full_name, status, phone_verified)
      `)
      .order('sla_due_at', { ascending: true, nullsFirst: false });

    if (statusFilter) {
      query = query.eq('verification_status', statusFilter);
    }

    const [{ data: docs }, { data: evidence }] = await Promise.all([
      query,
      admin.from('doctor_evidence').select('*').order('uploaded_at', { ascending: false }),
    ]);

    const evByDoc = new Map<string, Array<Record<string, unknown>>>();
    for (const ev of evidence || []) {
      const arr = evByDoc.get(ev.doctor_id) || [];
      arr.push(ev);
      evByDoc.set(ev.doctor_id, arr);
    }

    const nowMs = Date.now();
    const queue = (docs || []).map((d) => {
      const prof = d.profiles as {
        email?: string;
        phone?: string;
        full_name?: string;
        status?: string;
      } | null;
      const spec = d.specialties as { name?: string } | null;
      return {
        doctorId: d.user_id,
        fullName: prof?.full_name || d.public_name,
        publicName: d.public_name,
        email: prof?.email || '',
        phone: prof?.phone || '',
        orderNumber: d.order_number,
        specialtyName: spec?.name || '',
        city: d.city,
        facilityName: d.facility_name,
        verificationStatus: d.verification_status,
        verificationReason: d.verification_reason,
        accountStatus: prof?.status || 'active',
        submittedAt: d.submitted_at,
        slaDueAt: d.sla_due_at,
        isOverdue72h:
          d.verification_status === 'pending' && d.sla_due_at
            ? new Date(d.sla_due_at).getTime() < nowMs
            : false,
        verifiedAt: d.verified_at,
        evidence: evByDoc.get(d.user_id) || [],
      };
    });

    return jsonOk({ queue });
  } catch (err) {
    return jsonError(err);
  }
}
