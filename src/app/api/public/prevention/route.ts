import { jsonError, jsonOk } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = (url.searchParams.get('category') || '').trim();
    const admin = getSupabaseAdmin();

    let query = admin
      .from('prevention_articles')
      .select('*')
      .eq('is_published', true)
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data } = await query;
    return jsonOk({
      disclaimer:
        'Contenus éducatifs validés : repères généraux de prévention ne remplaçant jamais une consultation médicale.',
      articles: data || [],
    });
  } catch (err) {
    return jsonError(err);
  }
}
