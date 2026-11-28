import { z } from 'zod';
import { consumeRateLimit } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, getClientIp, jsonError, jsonOk } from '@/lib/http/errors';
import { deriveAuthEmail, normalizePhone } from '@/lib/security/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Téléphone ou e-mail requis.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_LOGIN_INPUT', parsed.error.issues[0]?.message || 'Identifiants requis.');
    }

    const rawId = parsed.data.identifier;
    const ip = getClientIp(req);
    await consumeRateLimit(`login:${ip}:${rawId.toLowerCase()}`, 12, 600);

    const admin = getSupabaseAdmin();
    const normalizedPhone = normalizePhone(rawId);

    let profileQuery = admin.from('profiles').select('*');
    if (normalizedPhone) {
      profileQuery = profileQuery.eq('phone', normalizedPhone);
    } else {
      profileQuery = profileQuery.eq('email', rawId.toLowerCase());
    }
    const { data: profile } = await profileQuery.maybeSingle();

    if (!profile) {
      await recordAudit({
        actorRole: 'anonymous',
        action: 'LOGIN_FAILED',
        targetType: 'auth',
        targetId: rawId.slice(0, 40),
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides.');
    }

    if (profile.status === 'suspended') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu. Contactez l’administration.');
    }

    const authEmail = deriveAuthEmail(profile.phone, profile.email);
    const supabase = await createSupabaseServerClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: parsed.data.password,
    });

    if (signInErr) {
      await recordAudit({
        actorId: profile.id,
        actorRole: profile.role,
        action: 'LOGIN_FAILED',
        targetType: 'profile',
        targetId: profile.id,
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides.');
    }

    let doctorVerificationStatus: string | null = null;
    if (profile.role === 'doctor') {
      const { data: dp } = await admin
        .from('doctor_profiles')
        .select('verification_status')
        .eq('user_id', profile.id)
        .maybeSingle();
      doctorVerificationStatus = dp?.verification_status ?? 'to_complete';
    }

    await recordAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'LOGIN_SUCCEEDED',
      targetType: 'profile',
      targetId: profile.id,
    });

    return jsonOk({
      user: {
        id: profile.id,
        role: profile.role,
        firstName: profile.first_name,
        lastName: profile.last_name,
        fullName: profile.full_name,
        phone: profile.phone,
        email: profile.email,
        address: profile.address,
        city: profile.city,
        phoneVerified: profile.phone_verified,
        onboardingCompleted: profile.onboarding_completed,
      },
      doctorVerificationStatus,
    });
  } catch (err) {
    return jsonError(err);
  }
}
