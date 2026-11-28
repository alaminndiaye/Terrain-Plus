import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const articleSchema = z.object({
  category: z.enum(['warmup', 'recovery', 'mobility', 'hydration', 'basketball', 'general']),
  title: z.string().trim().min(5).max(140),
  summary: z.string().trim().min(10).max(300),
  content: z.string().trim().min(20).max(4000),
  reviewerName: z.string().trim().min(3).max(100),
});

export async function GET() {
  try {
    await requireRole('admin');
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('prevention_articles')
      .select('*')
      .order('updated_at', { ascending: false });
    return jsonOk({ articles: data || [] });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole('admin');
    const body = await req.json().catch(() => ({}));
    const parsed = articleSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_ARTICLE', parsed.error.issues[0]?.message || 'Contenu invalide.');
    }

    const slug = `${parsed.data.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;

    const admin = getSupabaseAdmin();
    const { data: created } = await admin
      .from('prevention_articles')
      .insert({
        slug,
        category: parsed.data.category,
        title: parsed.data.title,
        summary: parsed.data.summary,
        content: parsed.data.content,
        reviewer_name: parsed.data.reviewerName,
        is_published: true,
      })
      .select('*')
      .single();

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'admin',
      action: 'PREVENTION_ARTICLE_PUBLISHED',
      targetType: 'prevention_article',
      targetId: String(created?.id || ''),
    });

    return jsonOk({ article: created }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
