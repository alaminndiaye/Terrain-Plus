import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const createSpecSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional().default(''),
  sortOrder: z.number().int().min(0).max(99).optional().default(10),
});

const patchSpecSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().max(300).optional(),
});

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('specialties').select('*').order('sort_order', { ascending: true });
    return jsonOk({ specialties: data || [] });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = createSpecSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_SPECIALTY', 'Nom de spécialité requis.');
    }

    const slug = parsed.data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const admin = getSupabaseAdmin();
    const { data: created, error } = await admin
      .from('specialties')
      .insert({
        slug,
        name: parsed.data.name,
        description: parsed.data.description,
        sort_order: parsed.data.sortOrder,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) throw new AppError(409, 'SPECIALTY_EXISTS', 'Cette spécialité existe déjà.');

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'SPECIALTY_CREATED',
      targetType: 'specialty',
      targetId: String(created.id),
    });

    return jsonOk({ specialty: created }, 201);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = patchSpecSchema.safeParse(body);
    if (!parsed.success) throw new AppError(400, 'INVALID_PATCH', 'Paramètres invalides.');

    const admin = getSupabaseAdmin();
    const updates: Record<string, unknown> = {};
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;

    const { data: updated } = await admin
      .from('specialties')
      .update(updates)
      .eq('id', parsed.data.id)
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'SPECIALTY_UPDATED',
      targetType: 'specialty',
      targetId: parsed.data.id,
    });

    return jsonOk({ specialty: updated });
  } catch (err) {
    return jsonError(err);
  }
}
