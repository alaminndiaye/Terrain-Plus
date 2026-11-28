import { z } from 'zod';
import { requireVerifiedDoctor } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const replySchema = z.object({
  body: z.string().trim().min(3, 'Réponse trop courte.').max(3000),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ topicId: string }> }
) {
  try {
    await requireVerifiedDoctor();
    const { topicId } = await context.params;
    const admin = getSupabaseAdmin();

    const [{ data: topic }, { data: posts }, { data: docs }] = await Promise.all([
      admin
        .from('doctor_forum_topics')
        .select('*')
        .eq('id', topicId)
        .eq('moderation_status', 'published')
        .single(),
      admin
        .from('doctor_forum_posts')
        .select('*')
        .eq('topic_id', topicId)
        .eq('moderation_status', 'published')
        .order('created_at', { ascending: true }),
      admin.from('doctor_profiles').select('user_id, public_name, specialties(name)'),
    ]);

    if (!topic) throw new AppError(404, 'TOPIC_NOT_FOUND', 'Sujet introuvable.');
    const docMap = new Map((docs || []).map((d) => [d.user_id, d]));
    const topicAuthor = docMap.get(topic.author_doctor_id) as
      | { public_name?: string; specialties?: { name?: string } }
      | undefined;

    return jsonOk({
      topic: {
        id: topic.id,
        category: topic.category,
        title: topic.title,
        body: topic.body,
        createdAt: topic.created_at,
        authorName: topicAuthor?.public_name || 'Médecin vérifié',
      },
      posts: (posts || []).map((p) => {
        const dp = docMap.get(p.author_doctor_id) as
          | { public_name?: string; specialties?: { name?: string } }
          | undefined;
        return {
          id: p.id,
          body: p.body,
          createdAt: p.created_at,
          authorName: dp?.public_name || 'Médecin vérifié',
          authorSpecialty: dp?.specialties?.name || '',
        };
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ topicId: string }> }
) {
  try {
    const auth = await requireVerifiedDoctor();
    const { topicId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_POST', parsed.error.issues[0]?.message || 'Réponse invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: topic } = await admin
      .from('doctor_forum_topics')
      .select('id, replies_count')
      .eq('id', topicId)
      .eq('moderation_status', 'published')
      .single();

    if (!topic) throw new AppError(404, 'TOPIC_NOT_FOUND', 'Sujet introuvable.');

    const nowIso = new Date().toISOString();
    const { data: post } = await admin
      .from('doctor_forum_posts')
      .insert({
        topic_id: topicId,
        author_doctor_id: auth.user.id,
        body: parsed.data.body,
        moderation_status: 'published',
      })
      .select('*')
      .single();

    await admin
      .from('doctor_forum_topics')
      .update({
        replies_count: (topic.replies_count || 0) + 1,
        last_activity_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', topicId);

    return jsonOk({ post }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
