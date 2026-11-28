'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, PhoneCall, ShieldCheck, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/apiClient';

interface SpecialtyOption {
  id: string;
  name: string;
}

function AuthPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab =
    searchParams.get('step') === 'otp'
      ? 'otp'
      : searchParams.get('tab') === 'register'
      ? 'register'
      : 'login';

  const [tab, setTab] = useState<'login' | 'register' | 'otp' | 'forgot'>(initialTab);
  const [role, setRole] = useState<'athlete' | 'doctor'>('athlete');
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [sandboxOtpHint, setSandboxOtpHint] = useState<string | null>(null);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+221');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Dakar');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // OTP fields
  const [otpCode, setOtpCode] = useState('');

  // Reset password fields
  const [resetPhone, setResetPhone] = useState('+221');
  const [resetRequested, setResetRequested] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    apiFetch<{ specialties: SpecialtyOption[] }>('/api/public/specialties')
      .then((res) => {
        setSpecialties(res.specialties || []);
        if (res.specialties?.[0]?.id) setSpecialtyId(res.specialties[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{
        user: { role: string; phoneVerified: boolean; onboardingCompleted: boolean };
      }>('/api/auth/login', {
        method: 'POST',
        body: { identifier, password: loginPassword },
      });
      if (!res.user.phoneVerified) {
        setTab('otp');
        setFeedback({ type: 'err', msg: 'Votre numéro n’est pas encore vérifié par OTP SMS.' });
        return;
      }
      if (res.user.role === 'athlete') {
        router.push(res.user.onboardingCompleted ? '/sportif' : '/sportif/onboarding');
      } else if (res.user.role === 'doctor') {
        router.push('/medecin');
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Échec de connexion.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ sandboxOtpCode?: string }>('/api/auth/register', {
        method: 'POST',
        body: {
          role,
          firstName,
          lastName,
          phone,
          address,
          city,
          birthDate,
          email: email.trim() || undefined,
          password,
          acceptTerms,
          ...(role === 'doctor' ? { specialtyId, orderNumber, facilityName } : {}),
        },
      });
      if (res.sandboxOtpCode) {
        setSandboxOtpHint(res.sandboxOtpCode);
      }
      setTab('otp');
      setFeedback({
        type: 'ok',
        msg: 'Compte créé ! Saisissez le code OTP reçu par SMS pour accéder à la plateforme.',
      });
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erreur d’inscription.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ role: string; onboardingCompleted: boolean }>('/api/auth/verify-otp', {
        method: 'POST',
        body: { code: otpCode },
      });
      if (res.role === 'athlete') {
        router.push(res.onboardingCompleted ? '/sportif' : '/sportif/onboarding');
      } else if (res.role === 'doctor') {
        router.push('/medecin/verification');
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Code invalide.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setFeedback(null);
    try {
      const res = await apiFetch<{ sandboxOtpCode?: string }>('/api/auth/resend-otp', {
        method: 'POST',
        body: {},
      });
      if (res.sandboxOtpCode) setSandboxOtpHint(res.sandboxOtpCode);
      setFeedback({ type: 'ok', msg: 'Un nouveau code OTP SMS vient d’être envoyé.' });
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Impossible de renvoyer le code.' });
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      if (!resetRequested) {
        const res = await apiFetch<{ message: string; sandboxOtpCode?: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: { phone: resetPhone },
        });
        if (res.sandboxOtpCode) setSandboxOtpHint(res.sandboxOtpCode);
        setResetRequested(true);
        setFeedback({ type: 'ok', msg: res.message });
      } else {
        const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: { phone: resetPhone, code: resetCode, newPassword: resetPassword },
        });
        setFeedback({ type: 'ok', msg: res.message });
        setResetRequested(false);
        setTab('login');
      }
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erreur réinitialisation.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="obsidian-card rounded-2xl border-t-4 border-t-[#0D6E46] overflow-hidden">
        <div className="p-6 border-b border-[#E2EBE5] bg-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0D6E46]">
            Portail Terrain+ · 18+ uniquement
          </p>
          <h1 className="font-display text-2xl font-bold text-[#063725] mt-1">Connexion &amp; Inscription</h1>
          <p className="text-sm text-[#475E52] mt-1">
            Inscription par téléphone avec vérification OTP par SMS obligatoire avant votre première entrée.
          </p>
          {tab !== 'otp' && (
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                ['login', 'Connexion'],
                ['register', 'S’inscrire'],
                ['forgot', 'Mot de passe oublié'],
              ].map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTab(k as typeof tab);
                    setFeedback(null);
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                    tab === k
                      ? 'bg-[#0D6E46] text-white border-[#0D6E46]'
                      : 'bg-[#F1F6F3] text-[#063725] border-[#D5E2DA] hover:border-[#0D6E46]'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          {feedback && (
            <div
              className={`rounded-xl p-3 text-sm font-medium ${
                feedback.type === 'ok'
                  ? 'bg-[#ECF7F1] text-[#063725] border border-[#C3D6CA]'
                  : 'bg-red-50 text-red-900 border border-red-200'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          {sandboxOtpHint && (
            <div className="rounded-xl p-3 bg-amber-50 border border-amber-300 text-amber-950 text-sm">
              <strong>Code OTP SMS Sandbox :</strong>{' '}
              <span className="font-mono font-bold text-base tracking-widest">{sandboxOtpHint}</span>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#063725] mb-1">Numéro de téléphone (ou e-mail)</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="+221 77 000 00 00"
                  className="w-full rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#063725] mb-1">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('athlete')}
                  className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                    role === 'athlete'
                      ? 'border-[#0D6E46] bg-[#ECF7F1] text-[#0D6E46]'
                      : 'border-[#D5E2DA] bg-[#F6F8F5] text-[#475E52] hover:border-[#0D6E46]'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Sportif (18+)
                </button>
                <button
                  type="button"
                  onClick={() => setRole('doctor')}
                  className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                    role === 'doctor'
                      ? 'border-[#0D6E46] bg-[#ECF7F1] text-[#0D6E46]'
                      : 'border-[#D5E2DA] bg-[#F6F8F5] text-[#475E52] hover:border-[#0D6E46]'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Médecin
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Prénom *</label>
                  <input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Nom *</label>
                  <input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Numéro de téléphone (OTP SMS) *</label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+221771234567"
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Date de naissance (18+ obligatoire) *</label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Adresse *</label>
                  <input
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Quartier, rue..."
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#063725] mb-1">Ville *</label>
                  <input
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#063725] mb-1">
                  E-mail {role === 'doctor' ? '(obligatoire pour médecin) *' : '(facultatif pour sportif)'}
                </label>
                <input
                  type="email"
                  required={role === 'doctor'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                />
              </div>

              {role === 'doctor' && (
                <div className="obsidian-inset p-3.5 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-[#063725]">Informations professionnelles</p>
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Spécialité principale *</label>
                    <select
                      value={specialtyId}
                      onChange={(e) => setSpecialtyId(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                    >
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#063725] mb-1">N° Ordre des Médecins</label>
                      <input
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        placeholder="ONMSN-..."
                        className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#063725] mb-1">Clinique / Structure</label>
                      <input
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        placeholder="Centre médical..."
                        className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#063725] mb-1">Mot de passe (8 caractères min.) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-[#475E52] cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 accent-[#0D6E46]"
                />
                <span>
                  Je certifie avoir 18 ans ou plus et j’accepte les conditions d’utilisation de Terrain+.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {loading ? 'Création et envoi OTP...' : 'Créer mon compte & recevoir le code SMS'}
              </button>
            </form>
          )}

          {tab === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center gap-2 text-[#063725] font-display font-bold">
                <PhoneCall className="w-5 h-5 text-[#0D6E46]" />
                <span>Vérification SMS obligatoire</span>
              </div>
              <p className="text-sm text-[#475E52]">
                Saisissez le code à 6 chiffres envoyé par SMS pour accéder à la plateforme.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full text-center font-mono tabular-nums text-2xl tracking-[0.5em] rounded-xl border border-[#D5E2DA] py-3"
              />
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                Valider le code OTP
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                className="w-full py-2 text-xs font-semibold text-[#475E52] hover:text-[#0D6E46]"
              >
                Renvoyer un code par SMS
              </button>
            </form>
          )}

          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="flex items-center gap-2 text-[#063725] font-display font-bold">
                <KeyRound className="w-5 h-5 text-[#0D6E46]" />
                <span>Réinitialisation par OTP SMS</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#063725] mb-1">Numéro de téléphone</label>
                <input
                  required
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                />
              </div>
              {resetRequested && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Code OTP SMS reçu</label>
                    <input
                      required
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#063725] mb-1">Nouveau mot de passe (8 car. min.)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="w-full rounded-xl border border-[#D5E2DA] px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {resetRequested ? 'Confirmer le nouveau mot de passe' : 'Recevoir le code OTP SMS'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-sm text-[#475E52]">Chargement...</div>}>
        <AuthPageContent />
      </Suspense>
    </AppShell>
  );
}
