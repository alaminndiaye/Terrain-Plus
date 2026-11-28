import { getAppConfig } from '@/lib/config';
import { requireAuth, consumeRateLimit } from '@/lib/auth/session';
import { sendOtpSms } from '@/lib/adapters/sms';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { randomNumericCode, sha256Hex } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const auth = await requireAuth();
    await consumeRateLimit(`resend_otp:${auth.user.id}`, 4, 180);

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    await admin
      .from('otp_verifications')
      .update({ consumed_at: nowIso })
      .eq('user_id', auth.user.id)
      .eq('purpose', 'signup_otp')
      .is('consumed_at', null);

    const code = randomNumericCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await admin.from('otp_verifications').insert({
      user_id: auth.user.id,
      phone: auth.user.phone,
      purpose: 'signup_otp',
      code_hash: sha256Hex(code),
      attempts: 0,
      max_attempts: 5,
      expires_at: expiresAt,
    });

    const smsResult = await sendOtpSms({
      phone: auth.user.phone,
      code,
      purpose: 'signup_otp',
    });
    const config = getAppConfig();

    return jsonOk({
      ok: true,
      ...(config.demoMode && smsResult.sandboxCode ? { sandboxOtpCode: smsResult.sandboxCode } : {}),
    });
  } catch (err) {
    return jsonError(err);
  }
}
