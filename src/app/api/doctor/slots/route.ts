import { z } from 'zod';
import { requireRole, requireVerifiedDoctor } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const bulkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().refine((v) => [30, 45, 60].includes(v)),
  slotMode: z.enum(['video', 'physical', 'both']).default('both'),
  locationLabel: z.string().trim().min(2).max(160),
});

export async function GET() {
  try {
    const auth = await requireRole('doctor');
    const admin = getSupabaseAdmin();
    const { data: slots } = await admin
      .from('availability_slots')
      .select('*')
      .eq('doctor_id', auth.user.id)
      .order('starts_at', { ascending: true });
    return jsonOk({ slots: slots || [] });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedDoctor();
    const body = await req.json().catch(() => ({}));
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_SLOT_PARAMS', 'Paramètres de plage horaire invalides.');
    }

    const d = parsed.data;
    const windowStart = new Date(`${d.date}T${d.startTime}:00`);
    const windowEnd = new Date(`${d.date}T${d.endTime}:00`);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime()) || windowEnd <= windowStart) {
      throw new AppError(400, 'INVALID_RANGE', 'Plage horaire invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('availability_slots')
      .select('starts_at, ends_at')
      .eq('doctor_id', auth.user.id)
      .neq('status', 'cancelled');

    const existingRanges = (existing || []).map((e) => ({
      s: new Date(e.starts_at).getTime(),
      e: new Date(e.ends_at).getTime(),
    }));

    const stepMs = d.durationMinutes * 60 * 1000;
    const nowMs = Date.now();
    const toInsert = [];

    let cursor = windowStart.getTime();
    while (cursor + stepMs <= windowEnd.getTime() && toInsert.length < 20) {
      const sMs = cursor;
      const eMs = cursor + stepMs;
      cursor += stepMs;
      if (eMs <= nowMs) continue;
      if (existingRanges.some((r) => sMs < r.e && eMs > r.s)) continue;
      toInsert.push({
        doctor_id: auth.user.id,
        slot_mode: d.slotMode,
        starts_at: new Date(sMs).toISOString(),
        ends_at: new Date(eMs).toISOString(),
        location_label: d.locationLabel,
        status: 'available',
      });
    }

    if (toInsert.length === 0) {
      return jsonOk({ createdCount: 0, slots: [] }, 201);
    }

    const { data: inserted, error } = await admin
      .from('availability_slots')
      .insert(toInsert)
      .select('*');

    if (error) throw new AppError(500, 'SLOTS_INSERT_FAILED', 'Impossible de créer les créneaux.');
    return jsonOk({ createdCount: (inserted || []).length, slots: inserted || [] }, 201);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireVerifiedDoctor();
    const url = new URL(req.url);
    const slotId = (url.searchParams.get('id') || '').trim();
    if (!slotId) throw new AppError(400, 'MISSING_SLOT_ID', 'Créneau manquant.');

    const admin = getSupabaseAdmin();
    const { data: slot } = await admin
      .from('availability_slots')
      .select('id, status')
      .eq('id', slotId)
      .eq('doctor_id', auth.user.id)
      .single();

    if (!slot) throw new AppError(404, 'SLOT_NOT_FOUND', 'Créneau introuvable.');
    if (slot.status === 'booked' || slot.status === 'held') {
      throw new AppError(409, 'SLOT_IN_USE', 'Impossible de supprimer un créneau déjà réservé.');
    }

    await admin.from('availability_slots').delete().eq('id', slotId);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
