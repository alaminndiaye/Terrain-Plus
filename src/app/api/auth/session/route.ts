import { getAppConfig } from '@/lib/config';
import { getAuthContext } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/http/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const auth = await getAuthContext();
    const config = getAppConfig();
    return jsonOk({
      authenticated: Boolean(auth),
      user: auth
        ? {
            id: auth.user.id,
            role: auth.user.role,
            firstName: auth.user.first_name,
            lastName: auth.user.last_name,
            fullName: auth.user.full_name,
            phone: auth.user.phone,
            email: auth.user.email,
            address: auth.user.address,
            city: auth.user.city,
            birthDate: auth.user.birth_date,
            phoneVerified: auth.user.phone_verified,
            onboardingCompleted: auth.user.onboarding_completed,
          }
        : null,
      doctorVerificationStatus: auth?.doctorVerificationStatus ?? null,
      demoMode: config.demoMode,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
