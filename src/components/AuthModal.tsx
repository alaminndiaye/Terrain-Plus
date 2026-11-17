import React, { useState } from 'react';
import { ArrowLeft, Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { ApiError, apiRequest, setSessionToken } from '../lib/api';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import type { AthleteLevel, AuthUser, SportCode } from '../types';

interface AuthModalProps {
  initialMode: 'login' | 'register';
  preselectedSport?: SportCode;
  initialNotice?: string;
  onClose: () => void;
  onAuthenticated: (user: AuthUser, isNewRegistration: boolean) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode,
  preselectedSport = 'football',
  initialNotice,
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // Login states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [demoHintCode, setDemoHintCode] = useState<string | null>(null);

  // Registration multi-step states
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [sportCode, setSportCode] = useState<SportCode>(preselectedSport);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('+22177');
  const [email, setEmail] = useState('');
  const [dateNaissance, setDateNaissance] = useState('2004-06-15');
  const [poidsKg, setPoidsKg] = useState('68');
  const [tailleCm, setTailleCm] = useState('175');
  const [niveau, setNiveau] = useState<AthleteLevel>('debutant');
  const [poste, setPoste] = useState('');
  const [langue, setLangue] = useState<'fr' | 'wo'>('fr');
  const [regPassword, setRegPassword] = useState('');
  const [consentSensible, setConsentSensible] = useState(false);
  const [consentNonMedical, setConsentNonMedical] = useState(false);
  const [parentalName, setParentalName] = useState('');
  const [parentalPhone, setParentalPhone] = useState('+22177');

  const [verifyIdentifier, setVerifyIdentifier] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialNotice || null);

  const isMinor = (() => {
    const d = new Date(dateNaissance);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age < 18;
  })();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      if (err instanceof ApiError && err.payload.needsVerification) {
        setVerifyIdentifier(String(err.payload.identifier || identifier));
        setDemoHintCode(
          typeof err.payload.demoVerificationCode === 'string' ? err.payload.demoVerificationCode : null
        );
        setVerifyCode('');
        setMode('verify');
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Échec de connexion.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string, demoPwd: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: demoEmail, password: demoPwd }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier.trim()) {
      setError('Entrez votre email ou votre numéro +221.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ demoOtpCode?: string }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setOtpRequested(true);
      setDemoHintCode(res.demoOtpCode || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de générer un code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, code: otpCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        email: string;
        demoVerificationCode?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nom,
          prenom,
          telephone,
          email,
          password: regPassword,
          date_naissance: dateNaissance,
          sport_code: sportCode,
          niveau,
          poids_kg: Number(poidsKg),
          taille_cm: tailleCm ? Number(tailleCm) : null,
          poste: poste || null,
          langue,
          consent_sensible: consentSensible,
          consent_non_medical: consentNonMedical,
          parental_consent_name: isMinor ? parentalName : null,
          parental_consent_phone: isMinor ? parentalPhone : null,
        }),
      });
      setVerifyIdentifier(res.email);
      setDemoHintCode(res.demoVerificationCode || null);
      setMode('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ identifier: verifyIdentifier, code: verifyCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerifyOtp = async () => {
    if (!verifyIdentifier.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ demoOtpCode?: string }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier: verifyIdentifier }),
      });
      setDemoHintCode(res.demoOtpCode || null);
      setVerifyCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de régénérer un code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl my-auto">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/terrain-mark.png"
              alt="Logo Terrain+"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-contain shrink-0"
            />
            <h2 className="font-display text-lg font-bold text-neutral-900">
              {mode === 'login'
                ? 'Connexion Terrain+'
                : mode === 'verify'
                  ? 'Validation du compte'
                  : 'Inscription Athlète'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {error}
          </div>
        )}

        {mode === 'login' && (
          <div className="mt-5 space-y-5">
            <div className="inline-flex w-full rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold min-h-[38px] ${
                  loginMethod === 'password' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                }`}
              >
                Mot de passe
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('otp');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold min-h-[38px] ${
                  loginMethod === 'otp' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
                }`}
              >
                Code à usage unique
              </button>
            </div>

            {loginMethod === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-id" className="block text-xs font-medium text-neutral-700 mb-1.5">
                    Adresse email ou téléphone (+221)
                  </label>
                  <input
                    id="login-id"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="moussa.diop@terrainplus.sn ou +221771001122"
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="login-pwd" className="block text-xs font-medium text-neutral-700 mb-1.5">
                    Mot de passe
                  </label>
                  <input
                    id="login-pwd"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpLogin} className="space-y-4">
                <div>
                  <label htmlFor="otp-id" className="block text-xs font-medium text-neutral-700 mb-1.5">
                    Email ou téléphone (+221)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="otp-id"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="+221771001122"
                      className="flex-1 rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={loading}
                      className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 min-h-[44px] whitespace-nowrap"
                    >
                      Envoyer code
                    </button>
                  </div>
                </div>

                {demoHintCode && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-emerald-900">
                        Code OTP visible (version prototype)
                      </div>
                      <div className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] tabular-nums text-emerald-950">
                        {demoHintCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtpCode(demoHintCode)}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 min-h-[38px]"
                    >
                      Utiliser ce code
                    </button>
                  </div>
                )}

                {otpRequested && (
                  <>
                    <div>
                      <label htmlFor="otp-code" className="block text-xs font-medium text-neutral-700 mb-1.5">
                        Saisissez le code OTP à 6 chiffres
                      </label>
                      <input
                        id="otp-code"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 font-mono text-base tracking-[0.2em] tabular-nums min-h-[44px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                    >
                      {loading ? 'Connexion...' : 'Valider et me connecter'}
                    </button>
                  </>
                )}
              </form>
            )}

            {/* Discreet Hackathon Evaluation Role Access */}
            <div className="border-t border-neutral-200 pt-4">
              <p className="text-xs font-medium text-neutral-500 mb-2.5">
                Accès rapide comptes pilotes (authentification serveur réelle)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemoLogin('moussa.diop@terrainplus.sn', 'Terrain2026!')}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 min-h-[40px]"
                >
                  Athlète Foot
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemoLogin('awa.fall@terrainplus.sn', 'Terrain2026!')}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 min-h-[40px]"
                >
                  Athlète Basket
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemoLogin('coach.ndiaye@terrainplus.sn', 'Coach2026!')}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 min-h-[40px]"
                >
                  Coach Prépa
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemoLogin('admin@terrainplus.sn', 'Admin2026!')}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 min-h-[40px]"
                >
                  Admin Terrain+
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemoLogin('ministre@terrainplus.sn', 'Ministre2026!')}
                  className="col-span-2 sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 min-h-[40px]"
                >
                  Ministère / Tutelle (Observatoire)
                </button>
              </div>
            </div>

            <div className="text-center text-xs text-neutral-600">
              Pas encore de compte ?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="font-semibold text-neutral-900 underline"
              >
                S'inscrire gratuitement
              </button>
            </div>
          </div>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-5">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {regStep === 1
                  ? '1. Choix du sport'
                  : regStep === 2
                    ? '2. Identité et profil physique'
                    : '3. Consentement et sécurité'}
              </span>
              <span className="font-mono tabular-nums">Étape {regStep}/3</span>
            </div>

            {regStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600">
                  Votre sport adapte votre interface, vos tests physiques et votre programme.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {(['football', 'basket', 'handball'] as SportCode[]).map((code) => {
                    const sp = SPORTS_CONFIG[code];
                    const selected = sportCode === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setSportCode(code)}
                        className={`flex items-center justify-between rounded-xl border p-4 text-left transition-colors min-h-[60px] ${
                          selected
                            ? 'border-neutral-900 bg-neutral-50'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">{sp.nom}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">{sp.subtitle}</div>
                        </div>
                        {selected && <Check className="h-5 w-5 text-neutral-900 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setRegStep(2)}
                  className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                >
                  Continuer avec {SPORTS_CONFIG[sportCode].nom}
                </button>
              </div>
            )}

            {regStep === 2 && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Prénom *</label>
                    <input
                      type="text"
                      required
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Nom *</label>
                    <input
                      type="text"
                      required
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Téléphone (+221) *</label>
                    <input
                      type="tel"
                      required
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      placeholder="+221771234567"
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Adresse email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Date de naissance *</label>
                    <input
                      type="date"
                      required
                      value={dateNaissance}
                      onChange={(e) => setDateNaissance(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Poids (kg) *</label>
                    <input
                      type="number"
                      step="0.1"
                      min={30}
                      max={220}
                      required
                      value={poidsKg}
                      onChange={(e) => setPoidsKg(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Taille (cm)</label>
                    <input
                      type="number"
                      min={110}
                      max={230}
                      value={tailleCm}
                      onChange={(e) => setTailleCm(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Niveau *</label>
                    <select
                      value={niveau}
                      onChange={(e) => setNiveau(e.target.value as AthleteLevel)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="debutant">Débutant</option>
                      <option value="intermediaire">Intermédiaire</option>
                      <option value="avance">Avancé</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Poste / Rôle</label>
                    <select
                      value={poste}
                      onChange={(e) => setPoste(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="">Non précisé</option>
                      {SPORTS_CONFIG[sportCode].positions.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Langue consignes</label>
                    <select
                      value={langue}
                      onChange={(e) => setLangue(e.target.value as 'fr' | 'wo')}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value="fr">Français</option>
                      <option value="wo">Wolof + Français</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Mot de passe (8 caractères min., lettres et chiffres) *
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setRegStep(1)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Retour</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const validPwd =
                        regPassword.length >= 8 &&
                        regPassword.length <= 128 &&
                        /[A-Za-z]/.test(regPassword) &&
                        /\d/.test(regPassword);
                      if (!prenom || !nom || !email || !telephone || !validPwd) {
                        setError(
                          'Complétez les champs obligatoires et choisissez un mot de passe d’au moins 8 caractères contenant lettres et chiffres.'
                        );
                        return;
                      }
                      setError(null);
                      setRegStep(3);
                    }}
                    className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
                  >
                    Étape suivante
                  </button>
                </div>
              </div>
            )}

            {regStep === 3 && (
              <div className="space-y-4">
                {isMinor && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="text-xs font-semibold text-amber-900">
                      Athlète mineur : accord d’un responsable légal obligatoire (visibilité privée par défaut)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Nom complet du parent / tuteur"
                        value={parentalName}
                        onChange={(e) => setParentalName(e.target.value)}
                        className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm min-h-[44px]"
                      />
                      <input
                        type="tel"
                        required
                        placeholder="+22177..."
                        value={parentalPhone}
                        onChange={(e) => setParentalPhone(e.target.value)}
                        className="rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-sm min-h-[44px]"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentSensible}
                    onChange={(e) => setConsentSensible(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-neutral-900"
                  />
                  <span className="text-xs text-neutral-700 leading-relaxed">
                    J’accepte la collecte minimale de mes données de suivi physique (poids, évaluations, ressenti, douleurs), accessibles uniquement à moi et au coach qui m’est affecté, sans partage commercial.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentNonMedical}
                    onChange={(e) => setConsentNonMedical(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-neutral-900"
                  />
                  <span className="text-xs text-neutral-700 leading-relaxed">
                    J’ai compris que Terrain+ propose une préparation physique générale et ne remplace ni un coach diplômé en présentiel ni un avis médical. En cas de douleur, j’arrête la pratique et consulte un professionnel de santé.
                  </span>
                </label>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setRegStep(2)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Retour</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[44px]"
                  >
                    {loading ? 'Création...' : 'Créer et recevoir le code'}
                  </button>
                </div>
              </div>
            )}

            <div className="text-center text-xs text-neutral-600 pt-2 border-t border-neutral-100">
              Déjà inscrit ?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="font-semibold text-neutral-900 underline"
              >
                Se connecter
              </button>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyAccount} className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 text-sm text-neutral-700">
              <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Compte créé pour <span className="font-semibold text-neutral-900">{verifyIdentifier}</span>. Saisissez le code OTP affiché ci-dessous pour activer votre accès et vous connecter directement.
              </span>
            </div>

            {demoHintCode ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-emerald-900">
                    Code OTP visible (version prototype)
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold tracking-[0.22em] tabular-nums text-emerald-950">
                    {demoHintCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVerifyCode(demoHintCode)}
                  className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 min-h-[40px]"
                >
                  Utiliser ce code
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-3">
                <span className="text-xs text-amber-900">Aucun code actif affiché.</span>
                <button
                  type="button"
                  onClick={handleResendVerifyOtp}
                  disabled={loading}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 min-h-[36px]"
                >
                  Afficher un code OTP
                </button>
              </div>
            )}

            <div>
              <label htmlFor="verify-code" className="block text-xs font-medium text-neutral-700 mb-1.5">
                Saisissez le code OTP à 6 chiffres
              </label>
              <input
                id="verify-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 font-mono text-base tracking-[0.2em] tabular-nums min-h-[44px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Validation et connexion...' : 'Valider et me connecter'}
            </button>

            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button
                type="button"
                onClick={handleResendVerifyOtp}
                disabled={loading}
                className="inline-flex items-center gap-1.5 font-medium text-neutral-700 hover:text-neutral-900 min-h-[36px]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Générer un nouveau code</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="font-medium text-neutral-600 underline hover:text-neutral-900 min-h-[36px]"
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
