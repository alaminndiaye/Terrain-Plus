import type { Request, Response } from 'express';
import { createApp, ensureAppReady } from '../server.ts';

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: Request, res: Response) {
  await ensureAppReady();
  if (!appPromise) {
    appPromise = createApp();
  }
  const app = await appPromise;
  return app(req, res);
}
