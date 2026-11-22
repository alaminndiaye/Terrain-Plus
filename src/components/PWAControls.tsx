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
        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#C3D6CA] bg-white px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
      >
        <Download className="w-4 h-4 text-[#0D6E46]" aria-hidden="true" />
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
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#C3D6CA] bg-white px-3.5 py-2 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
        >
          <Download className="w-4 h-4 text-[#0D6E46]" aria-hidden="true" />
          <span>Installer sur iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 border border-[#D5E2DA] text-[#063725] shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#063725]">Installer Terrain+ sur iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 text-[#5B7064] hover:text-[#063725] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#3D5246] list-decimal list-inside">
                <li>Appuyez sur le bouton Partager dans la barre Safari.</li>
                <li>Sélectionnez Sur l’écran d’accueil pour accéder aux séances hors ligne.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-full bg-[#0D6E46] py-2.5 text-sm font-bold text-white hover:bg-[#095637] min-h-[44px]"
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
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/95 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>Mode hors ligne actif — séances téléchargées disponibles</span>
    </div>
  );
};
