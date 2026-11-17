import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { playTone, speakCue, stopSpeech } from '../lib/audioCues';
import { queueOfflineCompletion } from '../lib/offlineCache';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import type { SessionTemplate } from '../types';

interface GuidedSessionPlayerProps {
  session: SessionTemplate;
  scheduledId: number | null;
  defaultLangue: 'fr' | 'wo';
  onClose: () => void;
  onCompleted: () => void;
  onReportPain: () => void;
}

type VariantMode = 'standard' | 'facile' | 'difficile';

export const GuidedSessionPlayer: React.FC<GuidedSessionPlayerProps> = ({
  session,
  scheduledId,
  defaultLangue,
  onClose,
  onCompleted,
  onReportPain,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<'work' | 'rest' | 'feedback'>('work');
  const [secondsLeft, setSecondsLeft] = useState(() => session.exercises[0]?.dureeSec || 30);
  const [running, setRunning] = useState(false);
  const [variant, setVariant] = useState<VariantMode>('standard');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cueLang, setCueLang] = useState<'fr' | 'wo'>(defaultLangue);

  const [fatigue, setFatigue] = useState(5);
  const [difficulte, setDifficulte] = useState(5);
  const [sommeil, setSommeil] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const sportTheme = SPORTS_CONFIG[session.sport_code];
  const currentEx = session.exercises[stepIdx];
  const totalSteps = session.exercises.length;

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  useEffect(() => {
    if (!running || phase === 'feedback') return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        if (phase === 'work') {
          const restSec = currentEx?.reposSec || 20;
          if (stepIdx < totalSteps - 1 && restSec > 0) {
            playTone('rest');
            speakCue(`Repos pendant ${restSec} secondes`, audioEnabled);
            setPhase('rest');
            return restSec;
          }
        }

        if (stepIdx < totalSteps - 1) {
          const nextIdx = stepIdx + 1;
          const nextEx = session.exercises[nextIdx];
          setStepIdx(nextIdx);
          setPhase('work');
          playTone('start');
          if (nextEx) {
            speakCue(`${nextEx.nom}. ${nextEx.consigneFr}`, audioEnabled);
          }
          return nextEx?.dureeSec || 30;
        }

        playTone('finish');
        speakCue('Séance terminée. Pensez à noter votre ressenti.', audioEnabled);
        setRunning(false);
        setPhase('feedback');
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running, phase, stepIdx, totalSteps, currentEx, session.exercises, audioEnabled]);

  const handleTogglePlay = () => {
    if (!running && currentEx) {
      playTone('start');
      if (phase === 'work') {
        speakCue(`${currentEx.nom}. ${currentEx.consigneFr}`, audioEnabled);
      }
    }
    setRunning((r) => !r);
  };

  const handleSkip = () => {
    if (phase === 'rest') {
      const nextIdx = stepIdx + 1;
      if (nextIdx < totalSteps) {
        const nextEx = session.exercises[nextIdx];
        setStepIdx(nextIdx);
        setPhase('work');
        setSecondsLeft(nextEx?.dureeSec || 30);
        return;
      }
    }
    if (stepIdx < totalSteps - 1) {
      const nextIdx = stepIdx + 1;
      const nextEx = session.exercises[nextIdx];
      setStepIdx(nextIdx);
      setPhase('work');
      setSecondsLeft(nextEx?.dureeSec || 30);
    } else {
      setRunning(false);
      setPhase('feedback');
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    const payload = {
      scheduled_id: scheduledId,
      session_id: session.id,
      ressenti_fatigue: fatigue,
      difficulte,
      qualite_sommeil: sommeil,
    };

    try {
      if (!navigator.onLine) {
        queueOfflineCompletion(payload);
        setSaveMessage('Séance enregistrée localement (mode hors ligne). Synchronisation automatique au retour du réseau.');
        window.setTimeout(() => onCompleted(), 1200);
        return;
      }
      await apiRequest('/api/athlete/complete-session', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCompleted();
    } catch {
      queueOfflineCompletion(payload);
      setSaveMessage('Connexion instable : séance sauvegardée localement pour synchronisation.');
      window.setTimeout(() => onCompleted(), 1200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white overflow-y-auto">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3 md:px-8">
        <div className="min-w-0">
          <div className="text-xs text-neutral-400">
            {sportTheme.nom} · {session.duree_min} min · Prévention : {session.prevention_focus}
          </div>
          <h2 className="text-base font-semibold truncate text-white">{session.titre}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAudioEnabled((a) => !a)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
            aria-label={audioEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
            aria-label="Quitter la séance"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-between max-w-2xl w-full mx-auto px-4 py-6 md:py-10 gap-6">
        {phase === 'feedback' ? (
          <form onSubmit={handleSubmitFeedback} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-semibold text-white">Séance terminée</h3>
                <p className="text-sm text-neutral-400">Notez votre ressenti pour ajuster le suivi avec votre coach.</p>
              </div>
            </div>

            {saveMessage && (
              <div className="rounded-xl border border-emerald-700 bg-emerald-950/60 p-3 text-sm text-emerald-200">
                {saveMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-fatigue" className="text-neutral-200">Fatigue ressentie (1 = frais · 10 = épuisé)</label>
                  <span className="font-mono tabular-nums font-semibold">{fatigue}/10</span>
                </div>
                <input
                  id="rpe-fatigue"
                  type="range"
                  min={1}
                  max={10}
                  value={fatigue}
                  onChange={(e) => setFatigue(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-diff" className="text-neutral-200">Difficulté de la séance (1 à 10)</label>
                  <span className="font-mono tabular-nums font-semibold">{difficulte}/10</span>
                </div>
                <input
                  id="rpe-diff"
                  type="range"
                  min={1}
                  max={10}
                  value={difficulte}
                  onChange={(e) => setDifficulte(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-sleep" className="text-neutral-200">Qualité du sommeil la nuit dernière (1 à 10)</label>
                  <span className="font-mono tabular-nums font-semibold">{sommeil}/10</span>
                </div>
                <input
                  id="rpe-sleep"
                  type="range"
                  min={1}
                  max={10}
                  value={sommeil}
                  onChange={(e) => setSommeil(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 min-h-[48px]"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer et terminer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopSpeech();
                  onReportPain();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm font-medium text-red-200 hover:bg-red-900/60 min-h-[48px]"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Signaler une douleur</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>
                  Exercice <span className="font-mono tabular-nums text-white">{stepIdx + 1}/{totalSteps}</span>
                </span>
                <div className="flex items-center gap-1 rounded-lg bg-neutral-900 p-1 border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setCueLang('fr')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium min-h-[32px] ${
                      cueLang === 'fr' ? 'bg-white text-neutral-950' : 'text-neutral-300'
                    }`}
                  >
                    Français
                  </button>
                  <button
                    type="button"
                    onClick={() => setCueLang('wo')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium min-h-[32px] ${
                      cueLang === 'wo' ? 'bg-white text-neutral-950' : 'text-neutral-300'
                    }`}
                  >
                    Wolof
                  </button>
                </div>
              </div>

              <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-transform"
                  style={{ width: `${((stepIdx + (phase === 'rest' ? 0.5 : 0.2)) / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-center space-y-4 my-auto py-4">
              <div className="text-xs font-medium tracking-wide text-neutral-400">
                {phase === 'rest' ? 'TEMPS DE RÉCUPÉRATION' : 'EXERCICE EN COURS'}
              </div>
              <div className="font-mono text-6xl sm:text-7xl font-semibold tabular-nums tracking-tight text-white">
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </div>

              {phase === 'rest' ? (
                <div className="space-y-1">
                  <p className="text-lg font-medium text-emerald-300">Respirez et relâchez les appuis</p>
                  <p className="text-sm text-neutral-400">
                    À suivre : {session.exercises[stepIdx + 1]?.nom}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold text-white">{currentEx?.nom}</h3>
                  <p className="text-base text-neutral-200 leading-relaxed max-w-xl mx-auto">
                    {cueLang === 'wo' ? currentEx?.consigneWo : currentEx?.consigneFr}
                  </p>
                  {cueLang === 'wo' && (
                    <p className="text-xs text-neutral-400 max-w-xl mx-auto">
                      Français : {currentEx?.consigneFr}
                    </p>
                  )}

                  <div className="pt-2">
                    <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-900 p-1 border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setVariant('facile')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[38px] whitespace-nowrap ${
                          variant === 'facile' ? 'bg-emerald-700 text-white' : 'text-neutral-300'
                        }`}
                      >
                        Variante facile
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariant('standard')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[38px] whitespace-nowrap ${
                          variant === 'standard' ? 'bg-white text-neutral-950' : 'text-neutral-300'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariant('difficile')}
                        className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[38px] whitespace-nowrap ${
                          variant === 'difficile' ? 'bg-orange-700 text-white' : 'text-neutral-300'
                        }`}
                      >
                        Variante exigeante
                      </button>
                    </div>
                    {variant !== 'standard' && (
                      <p className="mt-2.5 text-sm text-neutral-300 max-w-lg mx-auto">
                        {variant === 'facile' ? currentEx?.varianteFacile : currentEx?.varianteDifficile}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setSecondsLeft(phase === 'rest' ? currentEx?.reposSec || 20 : currentEx?.dureeSec || 30);
                  }}
                  className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                  aria-label="Réinitialiser le chrono"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="flex-1 max-w-xs inline-flex items-center justify-center gap-2 rounded-xl bg-white text-neutral-950 px-6 py-3.5 text-sm font-semibold hover:bg-neutral-200 min-h-[48px]"
                >
                  {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  <span>{running ? 'Pause' : 'Démarrer le chrono'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="min-h-[48px] px-4 inline-flex items-center justify-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 text-sm text-neutral-200 hover:bg-neutral-800 whitespace-nowrap"
                >
                  <span>Suivant</span>
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setRunning(false);
                    onReportPain();
                  }}
                  className="inline-flex items-center gap-2 text-xs font-medium text-red-400 hover:text-red-300 min-h-[44px]"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>Ressenti d’une douleur ? Arrêter et alerter</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setRunning(false);
                    setPhase('feedback');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-neutral-300 hover:text-white min-h-[44px]"
                >
                  <span>Terminer maintenant</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
