import { Suspense, lazy, useEffect, useState } from 'react';
import {
  ApiError,
  apiRequest,
  CACHED_USER_KEY,
  clearAllWorkspaceCaches,
  clearSessionToken,
  readJsonCache,
  writeJsonCache,
} from './lib/api';
import type { AuthUser, SportCode } from './types';
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
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center gap-3 p-6">
      <img
        src="/brand/terrain-logo.png"
        alt="Terrain+"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-9 w-auto object-contain"
      />
      <div className="text-xs text-neutral-600">Chargement de l’espace Terrain+...</div>
    </div>
  );
}

function isValidAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return typeof candidate.id === 'number' && typeof candidate.role === 'string' && typeof candidate.email === 'string';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => readJsonCache<AuthUser>(CACHED_USER_KEY, isValidAuthUser));
  const [authModal, setAuthModal] = useState<{
    mode: 'login' | 'register';
    sport?: SportCode;
    role?: 'athlete' | 'coach';
    notice?: string;
  } | null>(null);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

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
    setShowGuidedTour(false);
  };

  const handleSessionExpired = () => {
    clearSessionToken();
    clearAllWorkspaceCaches();
    setUser(null);
    setShowGuidedTour(false);
    setAuthModal({
      mode: 'login',
      notice: 'Votre session a expiré ou n’a pas pu être vérifiée. Connectez-vous pour accéder à vos pages.',
    });
  };

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>
        {!user && (
          <PublicLanding
            onOpenAuth={(mode, preselectedSport, initialRole) =>
              setAuthModal({ mode, sport: preselectedSport, role: initialRole })
            }
          />
        )}

        {user && user.role === 'ATHLETE' && (
          <AthleteWorkspace
            showGuidedTourOnMount={showGuidedTour}
            onDismissGuidedTour={() => setShowGuidedTour(false)}
            onLoggedOut={handleLoggedOut}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {user && user.role === 'COACH' && (
          <CoachWorkspace
            onLoggedOut={handleLoggedOut}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {user && user.role === 'ADMIN' && (
          <AdminWorkspace
            onLoggedOut={handleLoggedOut}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {user && user.role === 'MINISTRE' && (
          <MinisterWorkspace
            onLoggedOut={handleLoggedOut}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {authModal && (
          <AuthModal
            initialMode={authModal.mode}
            preselectedSport={authModal.sport}
            initialRole={authModal.role}
            initialNotice={authModal.notice}
            onClose={() => setAuthModal(null)}
            onOpenPartners={() => {
              setAuthModal(null);
              window.setTimeout(() => {
                document.getElementById('partenaires')?.scrollIntoView({ behavior: 'smooth' });
              }, 80);
            }}
            onAuthenticated={(authedUser, isNewRegistration) => {
              if (user && user.id !== authedUser.id) {
                clearAllWorkspaceCaches();
              }
              writeJsonCache(CACHED_USER_KEY, authedUser);
              setUser(authedUser);
              setAuthModal(null);
              setShowGuidedTour(isNewRegistration && authedUser.role === 'ATHLETE');
            }}
          />
        )}
      </Suspense>

      <OfflineIndicator />
    </>
  );
}
