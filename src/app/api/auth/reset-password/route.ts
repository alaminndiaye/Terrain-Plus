import { z } from 'zod';
import { getAppConfig } from '@/lib/config';
import { consumeRateLimit } from '@/lib/auth/session';
import { sendOtpSms } from '@/lib/adapters/sms';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, getClientIp, jsonError, jsonOk } from '@/lib/http/errors';
import { normalizePhone, randomNumericCode, sha256Hex } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const forgotSchema = z.object({
  phone: z.string().trim().min(7),
});

const resetSchema = z.object({
  phone: z.string().trim().min(7),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ip = getClientIp(req);

    // Step 1: Request password reset OTP
    if (!('code' in body)) {
      await consumeRateLimit(`forgot_pw:${ip}`, 10, 900);
      const parsed = forgotSchema.safeParse(body);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_PHONE', 'Numéro de téléphone invalide.');
      }
      const phone = normalizePhone(parsed.data.phone);
      const config = getAppConfig();
      let sandboxOtpCode: string | undefined;

      if (phone) {
        const admin = getSupabaseAdmin();
        const { data: user } = await admin
          .from('profiles')
          .select('id, role')
          .eq('phone', phone)
          .maybeSingle();

        if (user) {
          const code = randomNumericCode();
          const nowIso = new Date().toISOString();
          await admin
            .from('otp_verifications')
            .update({ consumed_at: nowIso })
            .eq('user_id', user.id)
            .eq('purpose', 'password_reset')
            .is('consumed_at', null);

          await admin.from('otp_verifications').insert({
            user_id: user.id,
            phone,
            purpose: 'password_reset',
            code_hash: sha256Hex(code),
            attempts: 0,
            max_attempts: 5,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

          const sms = await sendOtpSms({ phone, code, purpose: 'password_reset' });
          if (config.demoMode && sms.sandboxCode) sandboxOtpCode = sms.sandboxCode;

          await recordAudit({
            actorId: user.id,
            actorRole: user.role,
            action: 'PASSWORD_RESET_OTP_REQUESTED',
            targetType: 'profile',
            targetId: user.id,
          });
        }
      }

      return jsonOk({
        ok: true,
        message: 'Si ce numéro correspond à un compte, un code OTP SMS temporaire a été envoyé.',
        ...(sandboxOtpCode ? { sandboxOtpCode } : {}),
      });
    }

    // Step 2: Confirm password reset with OTP & revoke active sessions
    await consumeRateLimit(`reset_pw:${ip}`, 10, 900);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_RESET_PAYLOAD', 'Code à 6 chiffres et nouveau mot de passe (8 car. min.) requis.');
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) throw new AppError(400, 'RESET_INVALID', 'Code de réinitialisation invalide ou expiré.');

    const admin = getSupabaseAdmin();
    const { data: user } = await admin
      .from('profiles')
      .select('id, role')
      .eq('phone', phone)
      .maybeSingle();

    if (!user) throw new AppError(400, 'RESET_INVALID', 'Code de réinitialisation invalide ou expiré.');

    const { data: otpRow } = await admin
      .from('otp_verifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('purpose', 'password_reset')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      !otpRow ||
      otpRow.attempts >= otpRow.max_attempts ||
      new Date(otpRow.expires_at).getTime() <= Date.now()
    ) {
      throw new AppError(400, 'RESET_INVALID', 'Code de réinitialisation invalide ou expiré.');
    }

    if (otpRow.code_hash !== sha256Hex(parsed.data.code)) {
      await admin
        .from('otp_verifications')
        .update({ attempts: otpRow.attempts + 1 })
        .eq('id', otpRow.id);
      throw new AppError(400, 'RESET_INVALID', 'Code de réinitialisation invalide ou expiré.');
    }

    const nowIso = new Date().toISOString();
    await admin.from('otp_verifications').update({ consumed_at: nowIso }).eq('id', otpRow.id);
    await admin.auth.admin.updateUserById(user.id, { password: parsed.data.newPassword });
    await admin.auth.admin.signOut(user.id, 'global');

    await recordAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'PASSWORD_RESET_COMPLETED',
      targetType: 'profile',
      targetId: user.id,
    });

    return jsonOk({
      ok: true,
      message: 'Mot de passe mis à jour. Toutes les sessions actives ont été déconnectées.',
    });
  } catch (err) {
    return jsonError(err);
  }
}
