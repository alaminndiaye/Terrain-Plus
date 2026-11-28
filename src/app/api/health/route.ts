import { jsonOk } from '@/lib/http/errors';

export async function GET() {
  return jsonOk({
    ok: true,
    service: 'terrain-plus',
    hasSupabaseUrl: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()),
    hasServiceKey: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true',
  });
}
