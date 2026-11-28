import { z } from 'zod';
import { requireVerifiedDoctor } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const topicSchema = z.object({
  category: z.enum(['clinical_case_anon', 'protocols', 'prevention', 'platform', 'specialty']),
  specialtyId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(6, 'Titre trop court (6 car. min.).').max(160),
  body: z.string().trim().min(15, 'Contenu trop court (15 car. min.).').max(4000),
});

export async function GET(req: Request) {
  try {
    await requireVerifiedDoctor();
    const url = new URL(req.url);
    const category = (url.searchParams.get('category') || '').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const admin = getSupabaseAdmin();
    let query = admin
      .from('doctor_forum_topics')
      .select('*, specialties(name)')
      .eq('moderation_status', 'published')
      .order('is_pinned', { ascending: false })
      .order('last_activity_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const [{ data: topics }, { data: docs }] = await Promise.all([
      query,
      admin.from('doctor_profiles').select('user_id, public_name, specialties(name)'),
    ]);
    const docMap = new Map((docs || []).map((d) => [d.user_id, d]));

    const filtered = (topics || [])
      .filter((t) =>
        q ? `${t.title} ${t.body}`.toLowerCase().includes(q) : true
      )
      .map((t) => {
        const author = docMap.get(t.author_doctor_id) as
          | { public_name?: string; specialties?: { name?: string } }
          | undefined;
        const spec = t.specialties as { name?: string } | null;
        return {
          id: t.id,
          category: t.category,
          title: t.title,
          body: t.body,
          isPinned: t.is_pinned,
          repliesCount: t.replies_count,
          lastActivityAt: t.last_activity_at,
          createdAt: t.created_at,
          authorName: author?.public_name || 'Médecin vérifié',
          authorSpecialty: author?.specialties?.name || '',
          specialtyName: spec?.name || '',
        };
      });

    return jsonOk({
      anonymizationRule:
        'Secret médical obligatoire : ne publiez aucun nom, numéro, club précis ni élément permettant d’identifier un patient.',
      topics: filtered,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedDoctor();
    const body = await req.json().catch(() => ({}));
    const parsed = topicSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_TOPIC', parsed.error.issues[0]?.message || 'Sujet invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: created, error } = await admin
      .from('doctor_forum_topics')
      .insert({
        author_doctor_id: auth.user.id,
        specialty_id: parsed.data.specialtyId || null,
        category: parsed.data.category,
        title: parsed.data.title,
        body: parsed.data.body,
        moderation_status: 'published',
      })
      .select('*')
      .single();

    if (error || !created) {
      throw new AppError(500, 'TOPIC_CREATE_FAILED', 'Impossible de publier le sujet.');
    }

    return jsonOk({ topic: created }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
