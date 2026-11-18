import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const key = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  browserClient = createClient(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
