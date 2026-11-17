import { useEffect, useState } from 'react';
import { apiRequest, clearSessionToken } from './lib/api';
import type { AuthUser, SportCode } from './types';
import { AdminWorkspace } from './components/AdminWorkspace';
import { AthleteWorkspace } from './components/AthleteWorkspace';
import { AuthModal } from './components/AuthModal';
import { CoachWorkspace } from './components/CoachWorkspace';
import { MinisterWorkspace } from './components/MinisterWorkspace';
import { OfflineIndicator } from './components/PWAControls';
import { PublicLanding } from './components/PublicLanding';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authModal, setAuthModal] = useState<{
    mode: 'login' | 'register';
    sport?: SportCode;
    notice?: string;
  } | null>(null);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  useEffect(() => {
    apiRequest<{ user: AuthUser | null }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setCheckingSession(false);
      });
  }, []);

  const handleLoggedOut = () => {
    clearSessionToken();
    setUser(null);
    setShowGuidedTour(false);
  };

  const handleSessionExpired = () => {
    clearSessionToken();
    setUser(null);
    setShowGuidedTour(false);
    setAuthModal({
      mode: 'login',
      notice: 'Votre session a expiré ou n’a pas pu être vérifiée. Connectez-vous pour accéder à vos pages.',
    });
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center gap-3 p-6">
        <img
          src="/brand/terrain-logo.png"
          alt="Terrain+"
          referrerPolicy="no-referrer"
          className="h-10 w-auto object-contain"
        />
        <div className="text-sm text-neutral-600">Chargement de Terrain+...</div>
      </div>
    );
  }

  return (
    <>
      {!user && (
        <PublicLanding
          onOpenAuth={(mode, preselectedSport) =>
            setAuthModal({ mode, sport: preselectedSport })
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
          initialNotice={authModal.notice}
          onClose={() => setAuthModal(null)}
          onAuthenticated={(authedUser, isNewRegistration) => {
            setUser(authedUser);
            setAuthModal(null);
            setShowGuidedTour(isNewRegistration && authedUser.role === 'ATHLETE');
          }}
        />
      )}

      <OfflineIndicator />
    </>
  );
}
