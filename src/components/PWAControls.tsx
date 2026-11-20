import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#161B13] px-3.5 py-2 text-xs font-medium text-[#F5F7F1] hover:bg-[#1E251A] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="w-4 h-4 text-[#C8F62D]" aria-hidden="true" />
        <span>{compact ? 'Installer' : "Installer l'application"}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#161B13] px-3.5 py-2 text-xs font-medium text-[#F5F7F1] hover:bg-[#1E251A] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <Download className="w-4 h-4 text-[#C8F62D]" aria-hidden="true" />
          <span>Installer sur iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#121610] p-6 border border-white/10 text-[#F5F7F1]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#F5F7F1]">Installer Terrain+ sur iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 text-[#9AA491] hover:text-[#F5F7F1] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#B4BCA9] list-decimal list-inside">
                <li>Appuyez sur le bouton Partager dans la barre Safari.</li>
                <li>Sélectionnez Sur l’écran d’accueil pour accéder aux séances hors ligne.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-full bg-[#C8F62D] py-2.5 text-sm font-semibold text-[#080A07] hover:bg-[#D7FA59] min-h-[44px]"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-[#1B170C]/95 backdrop-blur-md px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Mode hors ligne actif — séances téléchargées disponibles</span>
    </div>
  );
};
