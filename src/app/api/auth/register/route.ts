import { z } from 'zod';
import { getAppConfig } from '@/lib/config';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/auth/session';
import { sendOtpSms } from '@/lib/adapters/sms';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, getClientIp, jsonError, jsonOk } from '@/lib/http/errors';
import {
  deriveAuthEmail,
  isAdultBirthDate,
  normalizePhone,
  randomNumericCode,
  sha256Hex,
} from '@/lib/security/crypto';

const registerSchema = z.object({
  role: z.string().trim(),
  firstName: z.string().trim().min(2, 'Prénom requis (min. 2 caractères).').max(60),
  lastName: z.string().trim().min(2, 'Nom requis (min. 2 caractères).').max(60),
  phone: z.string().trim().min(7, 'Numéro de téléphone requis.'),
  address: z.string().trim().min(4, 'Adresse requise.').max(160),
  city: z.string().trim().min(2).max(60).default('Dakar'),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de naissance invalide (AAAA-MM-JJ).'),
  email: z.string().trim().email('Adresse e-mail invalide.').optional().or(z.literal('')),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(100),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Vous devez accepter les conditions d’utilisation.' }) }),
  specialtyId: z.string().uuid().optional().or(z.literal('')),
  orderNumber: z.string().trim().max(60).optional(),
  facilityName: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    await consumeRateLimit(`register:${ip}`, 15, 900);

    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_SIGNUP_FIELDS', parsed.error.issues[0]?.message || 'Champs invalides.');
    }

    const input = parsed.data;
    if (input.role === 'admin') {
      await recordAudit({
        actorRole: 'anonymous',
        action: 'ADMIN_SELF_REGISTER_BLOCKED',
        targetType: 'auth',
        targetId: input.phone,
        reason: 'Tentative création rôle administrateur via inscription publique',
      });
      throw new AppError(403, 'ADMIN_SIGNUP_FORBIDDEN', 'Le rôle administrateur ne peut pas être créé publiquement.');
    }
    if (input.role !== 'athlete' && input.role !== 'doctor') {
      throw new AppError(400, 'INVALID_ROLE', 'Veuillez choisir le profil Sportif ou Médecin.');
    }

    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new AppError(400, 'INVALID_PHONE', 'Numéro de téléphone Sénégal invalide (ex. +221 77 000 00 00).');
    }

    if (!isAdultBirthDate(input.birthDate)) {
      throw new AppError(
        400,
        'UNDERAGE_FORBIDDEN',
        'La plateforme est réservée aux personnes majeures (18 ans et plus) pour le moment.'
      );
    }

    if (input.role === 'doctor' && !input.email) {
      throw new AppError(400, 'DOCTOR_EMAIL_REQUIRED', 'Une adresse e-mail professionnelle est requise pour les médecins.');
    }

    const admin = getSupabaseAdmin();
    const { data: existingPhone } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existingPhone) {
      throw new AppError(409, 'PHONE_EXISTS', 'Un compte existe déjà avec ce numéro de téléphone.');
    }

    const cleanEmail = input.email ? input.email.toLowerCase() : null;
    if (cleanEmail) {
      const { data: existingEmail } = await admin
        .from('profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();
      if (existingEmail) {
        throw new AppError(409, 'EMAIL_EXISTS', 'Un compte existe déjà avec cette adresse e-mail.');
      }
    }

    const authEmail = deriveAuthEmail(phone, cleanEmail);
    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: { role: input.role, phone },
    });

    if (authErr || !createdAuth.user) {
      throw new AppError(400, 'AUTH_CREATE_FAILED', authErr?.message || 'Impossible de créer le compte.');
    }

    const userId = createdAuth.user.id;
    const fullName = `${input.firstName} ${input.lastName}`;
    const nowIso = new Date().toISOString();

    const { error: profErr } = await admin.from('profiles').insert({
      id: userId,
      role: input.role,
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: fullName,
      phone,
      email: cleanEmail,
      address: input.address,
      city: input.city,
      birth_date: input.birthDate,
      status: 'active',
      phone_verified: false,
      onboarding_completed: input.role !== 'athlete',
      accepted_terms_at: nowIso,
    });

    if (profErr) {
      await admin.auth.admin.deleteUser(userId);
      throw new AppError(400, 'PROFILE_CREATE_FAILED', 'Impossible d’enregistrer le profil.');
    }

    if (input.role === 'athlete') {
      await admin.from('athlete_profiles').insert({
        user_id: userId,
        sports_json: [],
        primary_sport: 'football',
      });
    } else {
      await admin.from('doctor_profiles').insert({
        user_id: userId,
        specialty_id: input.specialtyId || null,
        order_number: input.orderNumber || '',
        public_name: `Dr. ${fullName}`,
        city: input.city,
        facility_name: input.facilityName || '',
        facility_address: input.address,
        consultation_fee_fcfa: 10000,
        verification_status: 'to_complete',
      });
    }

    const otpCode = randomNumericCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await admin.from('otp_verifications').insert({
      user_id: userId,
      phone,
      purpose: 'signup_otp',
      code_hash: sha256Hex(otpCode),
      attempts: 0,
      max_attempts: 5,
      expires_at: expiresAt,
    });

    const smsResult = await sendOtpSms({ phone, code: otpCode, purpose: 'signup_otp' });

    // Create SSR session cookie so the user can submit OTP verification immediately,
    // while phone_verified=false blocks all protected workspace routes until verified.
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithPassword({ email: authEmail, password: input.password });

    await recordAudit({
      actorId: userId,
      actorRole: input.role,
      action: 'USER_REGISTERED_PENDING_OTP',
      targetType: 'profile',
      targetId: userId,
    });

    const config = getAppConfig();
    return jsonOk(
      {
        user: {
          id: userId,
          role: input.role,
          firstName: input.firstName,
          lastName: input.lastName,
          fullName,
          phone,
          phoneVerified: false,
          onboardingCompleted: input.role !== 'athlete',
        },
        otpRequired: true,
        ...(config.demoMode && smsResult.sandboxCode ? { sandboxOtpCode: smsResult.sandboxCode } : {}),
      },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
