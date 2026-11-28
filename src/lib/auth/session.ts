import { AppError } from '../http/errors';
import { getSupabaseAdmin } from '../supabase/admin';
import { createSupabaseServerClient } from '../supabase/server';
import type { UserProfile, UserRole, VerificationStatus } from '../types';

export interface AuthContext {
  user: UserProfile;
  doctorVerificationStatus?: VerificationStatus | null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    const admin = getSupabaseAdmin();
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profErr || !profile) return null;
    if (profile.status === 'suspended') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu par l’administration.');
    }

    let doctorVerificationStatus: VerificationStatus | null = null;
    if (profile.role === 'doctor') {
      const { data: dp } = await admin
        .from('doctor_profiles')
        .select('verification_status')
        .eq('user_id', profile.id)
        .single();
      doctorVerificationStatus = (dp?.verification_status as VerificationStatus) ?? 'to_complete';
    }

    return {
      user: profile as UserProfile,
      doctorVerificationStatus,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    return null;
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Connexion requise.');
  }
  return ctx;
}

export async function requireVerifiedPhoneAuth(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.user.phone_verified) {
    throw new AppError(
      403,
      'PHONE_OTP_REQUIRED',
      'Veuillez d’abord vérifier votre numéro de téléphone par code OTP SMS.'
    );
  }
  return ctx;
}

export async function requireRole(role: UserRole | UserRole[]): Promise<AuthContext> {
  const ctx = await requireVerifiedPhoneAuth();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(ctx.user.role)) {
    throw new AppError(403, 'FORBIDDEN_ROLE', 'Accès réservé à un autre profil utilisateur.');
  }
  return ctx;
}

export async function requireVerifiedDoctor(): Promise<AuthContext> {
  const ctx = await requireRole('doctor');
  if (ctx.doctorVerificationStatus !== 'verified') {
    throw new AppError(
      403,
      'DOCTOR_NOT_VERIFIED',
      'Cette fonctionnalité est réservée aux médecins vérifiés par l’administration.'
    );
  }
  return ctx;
}

export async function consumeRateLimit(
  key: string,
  maxHits: number,
  windowSeconds: number
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('rpc_consume_rate_limit', {
    p_key: key,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    throw new AppError(503, 'RATE_LIMIT_CHECK_FAILED', 'Service temporairement indisponible.');
  }
  if (!data) {
    throw new AppError(
      429,
      'TOO_MANY_REQUESTS',
      'Trop de tentatives. Merci de patienter avant de réessayer.'
    );
  }
}
