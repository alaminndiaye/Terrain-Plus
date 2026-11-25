import type { Request, Response } from 'express';
import { createApp, ensureAppReady } from '../server.ts';

let appPromise: ReturnType<typeof createApp> | null = null;

function extractSafeErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'UNKNOWN_ERROR';
  const rec = err as { code?: unknown; message?: unknown };
  if (typeof rec.code === 'string' && rec.code.trim()) return rec.code.trim();
  const msg = typeof rec.message === 'string' ? rec.message : '';
  if (msg.includes('DATABASE_URL')) return 'MISSING_DATABASE_URL';
  if (msg.includes('EROFS')) return 'READONLY_FILESYSTEM';
  if (msg.includes('ENETUNREACH')) return 'IPV6_UNREACHABLE_USE_POOLER_6543';
  if (msg.includes('password authentication failed')) return 'INVALID_DB_PASSWORD';
  if (msg.includes('SELF_SIGNED_CERT')) return 'TLS_CERT_ERROR';
  return 'STARTUP_ERROR';
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureAppReady();
    if (!appPromise) {
      appPromise = createApp();
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    appPromise = null;
    const errCode = extractSafeErrorCode(err);
    console.error('[Vercel Handler] Startup failure:', errCode, err instanceof Error ? err.message : err);
    const reqUrl = typeof req.url === 'string' ? req.url : '';
    if (reqUrl.startsWith('/api/health')) {
      res.status(503).json({
        ok: false,
        code: errCode,
        hasDatabaseUrl: Boolean((process.env.DATABASE_URL || '').trim()),
        hasSessionSecret: Boolean((process.env.SESSION_SECRET || '').trim()),
        hasSupabaseUrl: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()),
        hasSupabaseSecretKey: Boolean((process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
      });
      return;
    }
    res.status(503).json({
      error: 'Service temporairement indisponible. Vérifiez la configuration base de données.',
      code: errCode,
    });
  }
}
