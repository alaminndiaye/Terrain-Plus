import { z } from 'zod';
import { requireAuth, consumeRateLimit } from '@/lib/auth/session';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { sha256Hex } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { recordAudit } from '@/lib/audit/auditService';

const schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Le code OTP doit contenir 6 chiffres.'),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    await consumeRateLimit(`verify_otp:${auth.user.id}`, 15, 600);

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_OTP_FORMAT', parsed.error.issues[0]?.message || 'Code invalide.');
    }

    const admin = getSupabaseAdmin();
    const { data: otpRow } = await admin
      .from('otp_verifications')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('purpose', 'signup_otp')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRow) {
      throw new AppError(400, 'OTP_NOT_FOUND', 'Aucun code actif. Demandez un nouvel envoi par SMS.');
    }
    if (otpRow.attempts >= otpRow.max_attempts) {
      throw new AppError(429, 'OTP_MAX_ATTEMPTS', 'Nombre maximal d’essais atteint. Demandez un nouveau code.');
    }
    if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
      throw new AppError(400, 'OTP_EXPIRED', 'Code OTP expiré. Demandez un nouvel envoi.');
    }

    const expectedHash = sha256Hex(parsed.data.code);
    if (otpRow.code_hash !== expectedHash) {
      await admin
        .from('otp_verifications')
        .update({ attempts: otpRow.attempts + 1 })
        .eq('id', otpRow.id);
      throw new AppError(400, 'INVALID_OTP_CODE', 'Code OTP incorrect.');
    }

    const nowIso = new Date().toISOString();
    await admin
      .from('otp_verifications')
      .update({ consumed_at: nowIso })
      .eq('id', otpRow.id);
    await admin
      .from('profiles')
      .update({ phone_verified: true, updated_at: nowIso })
      .eq('id', auth.user.id);

    await recordAudit({
      actorId: auth.user.id,
      actorRole: auth.user.role,
      action: 'PHONE_OTP_VERIFIED',
      targetType: 'profile',
      targetId: auth.user.id,
    });

    return jsonOk({
      phoneVerified: true,
      onboardingCompleted: auth.user.onboarding_completed,
      role: auth.user.role,
    });
  } catch (err) {
    return jsonError(err);
  }
}
