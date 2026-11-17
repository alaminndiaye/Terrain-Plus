import React, { useState } from 'react';
import { AlertTriangle, PhoneCall, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface PainReportModalProps {
  onClose: () => void;
  onSubmitted: () => void;
}

const PAIN_ZONES = [
  'Cheville',
  'Genou',
  'Cuisse / Ischio-jambier',
  'Mollet',
  'Épaule',
  'Bas du dos',
  'Autre zone',
];

export const PainReportModal: React.FC<PainReportModalProps> = ({ onClose, onSubmitted }) => {
  const [zone, setZone] = useState('Genou');
  const [intensite, setIntensite] = useState(5);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Décrivez brièvement quand la douleur est apparue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/api/athlete/pain-alert', {
        method: 'POST',
        body: JSON.stringify({
          zone_douleur: zone,
          intensite,
          message: message.trim(),
        }),
      });
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le signalement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-neutral-200 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Signaler une douleur</h2>
              <p className="text-xs text-neutral-500">Protocole de sécurité · Alerte immédiate au coach</p>
            </div>
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

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 text-red-700 shrink-0" aria-hidden="true" />
                <span>Arrêtez immédiatement la séance en cours</span>
              </div>
              <p className="mt-2 text-sm text-red-900 leading-relaxed">
                Votre signalement a été transmis à votre coach pour adapter votre programme. Terrain+ et les coachs ne posent aucun diagnostic médical : en cas de douleur vive, de gonflement ou de gêne persistante, consultez un professionnel de santé ou un médecin du sport.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 flex items-center gap-3 text-sm text-neutral-700">
              <PhoneCall className="h-4 w-4 text-neutral-700 shrink-0" aria-hidden="true" />
              <span>Reposez la zone concernée et attendez le retour de votre coach avant de reprendre.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white hover:bg-neutral-800 min-h-[44px]"
            >
              Revenir au tableau de bord
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="pain-zone" className="block text-sm font-medium text-neutral-800 mb-1.5">
                Zone concernée
              </label>
              <select
                id="pain-zone"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 min-h-[44px]"
              >
                {PAIN_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="pain-intensity" className="text-sm font-medium text-neutral-800">
                  Intensité ressentie (1 à 10)
                </label>
                <span className="font-mono text-sm font-semibold tabular-nums text-red-700">
                  {intensite} / 10
                </span>
              </div>
              <input
                id="pain-intensity"
                type="range"
                min={1}
                max={10}
                value={intensite}
                onChange={(e) => setIntensite(Number(e.target.value))}
                className="w-full accent-red-700"
              />
            </div>

            <div>
              <label htmlFor="pain-msg" className="block text-sm font-medium text-neutral-800 mb-1.5">
                Circonstances et ressenti
              </label>
              <textarea
                id="pain-msg"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Exemple : tiraillement ressenti à la réception du saut..."
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm text-neutral-900"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 min-h-[44px] whitespace-nowrap"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
              >
                {submitting ? 'Envoi...' : "Envoyer l'alerte et arrêter"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
