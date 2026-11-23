import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import {
  ApiError,
  apiRequest,
  CACHED_USER_KEY,
  clearAllWorkspaceCaches,
  clearSessionToken,
  readJsonCache,
  setSessionToken,
  writeJsonCache,
} from './lib/api';
import type { AuthUser, ObjectiveCode, SportCode } from './types';
import { OfflineIndicator } from './components/PWAControls';

const PublicLanding = lazy(() =>
  import('./components/PublicLanding').then((m) => ({ default: m.PublicLanding }))
);
const AthleteWorkspace = lazy(() =>
  import('./components/AthleteWorkspace').then((m) => ({ default: m.AthleteWorkspace }))
);
const CoachWorkspace = lazy(() =>
  import('./components/CoachWorkspace').then((m) => ({ default: m.CoachWorkspace }))
);
const AdminWorkspace = lazy(() =>
  import('./components/AdminWorkspace').then((m) => ({ default: m.AdminWorkspace }))
);
const MinisterWorkspace = lazy(() =>
  import('./components/MinisterWorkspace').then((m) => ({ default: m.MinisterWorkspace }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);

function ScreenFallback() {
  return (
    <div className="min-h-screen obsidian-ambient flex flex-col items-center justify-center gap-3 p-6">
      <img
        src="/brand/terrain-logo.png"
        alt="Terrain+"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-10 w-auto object-contain"
      />
      <div className="text-xs font-medium text-[#475E52]">Chargement de l’espace Terrain+...</div>
    </div>
  );
}

function isValidAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return typeof candidate.id === 'number' && typeof candidate.role === 'string' && typeof candidate.email === 'string';
}

function checkIsAdminHash(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash.trim().toLowerCase() === '#admin';
}

function clearAdminHash(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

const AdminLoginGate: React.FC<{
  onAuthenticated: (user: AuthUser) => void;
  onExit: () => void;
}> = ({ onAuthenticated, onExit }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, portal: 'admin' }),
      });
      if (res.user.role !== 'ADMIN') {
        setError('Accès réservé exclusivement aux comptes administrateur.');
        return;
      }
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentification impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier.trim()) {
      setError('Saisissez votre identifiant administrateur.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, purpose: 'CONNEXION', portal: 'admin' }),
      });
      setOtpRequested(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer le code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: AuthUser; sessionToken?: string }>('/api/auth/login-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, code: otpCode, portal: 'admin' }),
      });
      if (res.user.role !== 'ADMIN') {
        setError('Accès réservé exclusivement aux comptes administrateur.');
        return;
      }
      if (res.sessionToken) setSessionToken(res.sessionToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen obsidian-ambient flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md rounded-3xl obsidian-card-glow p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-9 w-auto object-contain"
          />
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#C3D6CA] bg-white px-3 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] min-h-[36px]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
            <span>Accueil</span>
          </button>
        </div>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D6E46]">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Portail d’administration Terrain+</span>
          </div>
          <h1 className="font-display text-xl font-bold text-[#063725]">
            Connexion administrateur
          </h1>
          <p className="text-xs text-[#475E52]">
            Accès dédié à la gestion des comptes, validation des dossiers coachs et relecture des contenus.
          </p>
        </div>

        <div className="flex rounded-full bg-[#F1F6F3] p-1 border border-[#D5E2DA]">
          <button
            type="button"
            onClick={() => {
              setOtpMode(false);
              setError(null);
            }}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              !otpMode ? 'bg-[#0D6E46] text-white' : 'text-[#475E52] hover:text-[#063725]'
            }`}
          >
            Mot de passe
          </button>
          <button
            type="button"
            onClick={() => {
              setOtpMode(true);
              setError(null);
            }}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              otpMode ? 'bg-[#0D6E46] text-white' : 'text-[#475E52] hover:text-[#063725]'
            }`}
          >
            Code OTP
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
            {error}
          </div>
        )}

        {!otpMode ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-id" className="block text-xs font-medium text-[#3D5246] mb-1">
                Email ou téléphone administrateur *
              </label>
              <input
                id="admin-id"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Identifiant administrateur"
                className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3.5 py-2.5 text-sm text-[#063725] min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="admin-pwd" className="block text-xs font-medium text-[#3D5246] mb-1">
                Mot de passe *
              </label>
              <input
                id="admin-pwd"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3.5 py-2.5 text-sm text-[#063725] min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
            >
              {loading ? 'Vérification...' : 'Accéder à l’administration'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-otp-id" className="block text-xs font-medium text-[#3D5246] mb-1">
                Email ou téléphone administrateur *
              </label>
              <div className="flex gap-2">
                <input
                  id="admin-otp-id"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Identifiant administrateur"
                  className="flex-1 rounded-xl border border-[#C3D6CA] bg-white px-3.5 py-2.5 text-sm text-[#063725] min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading}
                  className="rounded-xl border border-[#C3D6CA] bg-[#F1F6F3] px-3 py-2 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[44px] whitespace-nowrap"
                >
                  Envoyer code
                </button>
              </div>
            </div>
            {otpRequested && (
              <>
                <div>
                  <label htmlFor="admin-otp-code" className="block text-xs font-medium text-[#3D5246] mb-1">
                    Code OTP à 6 chiffres *
                  </label>
                  <input
                    id="admin-otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="000000"
                    className="w-full rounded-xl border border-[#C3D6CA] bg-white px-3.5 py-2.5 font-mono text-sm text-[#063725] min-h-[44px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0D6E46] py-3 text-sm font-bold text-white hover:bg-[#095637] disabled:opacity-50 min-h-[44px] shadow-sm"
                >
                  {loading ? 'Vérification...' : 'Valider l’accès'}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [isAdminHash, setIsAdminHash] = useState<boolean>(() => checkIsAdminHash());
  const [user, setUser] = useState<AuthUser | null>(() => readJsonCache<AuthUser>(CACHED_USER_KEY, isValidAuthUser));
  const [authModal, setAuthModal] = useState<{
    mode: 'login' | 'register';
    sport?: SportCode;
    role?: 'athlete' | 'coach';
    objective?: ObjectiveCode;
    notice?: string;
  } | null>(null);

  useEffect(() => {
    const syncHash = () => setIsAdminHash(checkIsAdminHash());
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, []);

  useEffect(() => {
    apiRequest<{ user: AuthUser | null }>('/api/auth/me', { timeoutMs: 6000, retries: 1 })
      .then((res) => {
        if (res.user) {
          setUser((prev) => {
            if (prev && prev.id !== res.user!.id) {
              clearAllWorkspaceCaches();
            }
            return res.user;
          });
          writeJsonCache(CACHED_USER_KEY, res.user);
        } else {
          setUser(null);
          clearAllWorkspaceCaches();
        }
      })
      .catch((err) => {
        // Only invalidate session when explicitly unauthorized; keep cached user offline/on flaky 3G
        if (err instanceof ApiError && err.status === 401) {
          clearSessionToken();
          clearAllWorkspaceCaches();
          setUser(null);
        }
      });
  }, []);

  const handleLoggedOut = () => {
    clearSessionToken();
    clearAllWorkspaceCaches();
    setUser(null);
  };

  const handleSessionExpired = () => {
    clearSessionToken();
    clearAllWorkspaceCaches();
    setUser(null);
    if (!isAdminHash) {
      setAuthModal({
        mode: 'login',
        notice: 'Votre session a expiré ou n’a pas pu être vérifiée. Connectez-vous pour accéder à vos pages.',
      });
    }
  };

  const renderPublicOrUserWorkspace = () => {
    if (!user || user.role === 'ADMIN') {
      return (
        <PublicLanding
          onOpenAuth={(mode, preselectedSport, initialRole, preselectedObjective) =>
            setAuthModal({
              mode,
              sport: preselectedSport,
              role: initialRole,
              objective: preselectedObjective,
            })
          }
        />
      );
    }

    if (user.role === 'ATHLETE') {
      return (
        <AthleteWorkspace
          onLoggedOut={handleLoggedOut}
          onSessionExpired={handleSessionExpired}
        />
      );
    }

    if (user.role === 'COACH') {
      return (
        <CoachWorkspace
          onLoggedOut={handleLoggedOut}
          onSessionExpired={handleSessionExpired}
        />
      );
    }

    if (user.role === 'MINISTRE') {
      return (
        <MinisterWorkspace
          onLoggedOut={handleLoggedOut}
          onSessionExpired={handleSessionExpired}
        />
      );
    }

    return null;
  };

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>
        {isAdminHash ? (
          user && user.role === 'ADMIN' ? (
            <AdminWorkspace
              onLoggedOut={() => {
                handleLoggedOut();
                clearAdminHash();
              }}
              onSessionExpired={handleSessionExpired}
            />
          ) : (
            <AdminLoginGate
              onAuthenticated={(adminUser) => {
                if (user && user.id !== adminUser.id) {
                  clearAllWorkspaceCaches();
                }
                writeJsonCache(CACHED_USER_KEY, adminUser);
                setUser(adminUser);
              }}
              onExit={clearAdminHash}
            />
          )
        ) : (
          renderPublicOrUserWorkspace()
        )}

        {!isAdminHash && authModal && (
          <AuthModal
            initialMode={authModal.mode}
            preselectedSport={authModal.sport}
            preselectedObjective={authModal.objective}
            initialRole={authModal.role}
            initialNotice={authModal.notice}
            onClose={() => setAuthModal(null)}
            onOpenPartners={() => {
              setAuthModal(null);
              window.setTimeout(() => {
                document.getElementById('partenaires')?.scrollIntoView({ behavior: 'smooth' });
              }, 80);
            }}
            onAuthenticated={(authedUser) => {
              if (user && user.id !== authedUser.id) {
                clearAllWorkspaceCaches();
              }
              writeJsonCache(CACHED_USER_KEY, authedUser);
              setUser(authedUser);
              setAuthModal(null);
            }}
          />
        )}
      </Suspense>

      <OfflineIndicator />
    </>
  );
}
