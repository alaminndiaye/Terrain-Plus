import React, { useEffect, useState } from 'react';
import {
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
import { AnimatePresence, motion } from 'motion/react';
import { apiRequest } from '../lib/api';
import { prefetchCue, speakCue, stopSpeech } from '../lib/audioCues';
import { queueOfflineCompletion } from '../lib/offlineCache';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import { getExerciseVisual } from '../data/exerciseMedia';
import { ExerciseVideoGuide } from './ExerciseVideoGuide';
import { CoachVideoPlayer } from './CoachVideoPlayer';
import type { CoachVideoItem, SessionTemplate } from '../types';

interface GuidedSessionPlayerProps {
  session: SessionTemplate;
  scheduledId: number | null;
  defaultLangue: 'fr' | 'wo';
  ecoMode?: boolean;
  coachVideos?: CoachVideoItem[];
  onClose: () => void;
  onCompleted: () => void;
}

type VariantMode = 'standard' | 'facile' | 'difficile';

export const GuidedSessionPlayer: React.FC<GuidedSessionPlayerProps> = ({
  session,
  scheduledId,
  defaultLangue,
  ecoMode = false,
  coachVideos = [],
  onClose,
  onCompleted,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<'work' | 'rest' | 'feedback'>('work');
  const [secondsLeft, setSecondsLeft] = useState(() => session.exercises[0]?.dureeSec || 30);
  const [running, setRunning] = useState(false);
  const [variant, setVariant] = useState<VariantMode>('standard');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cueLang, setCueLang] = useState<'fr' | 'wo'>(defaultLangue);
  const [visualMode, setVisualMode] = useState<'video' | 'photo' | 'coach'>('video');
  const [coachVideoIdx, setCoachVideoIdx] = useState(0);

  const [fatigue, setFatigue] = useState(5);
  const [difficulte, setDifficulte] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const sportTheme = SPORTS_CONFIG[session.sport_code];
  const currentEx = session.exercises[stepIdx];
  const currentVisual = currentEx ? getExerciseVisual(currentEx.nom, currentEx.imageUrl) : null;
  const totalSteps = session.exercises.length;
  const matchingCoachVideos = React.useMemo(() => {
    const exact = coachVideos.filter((v) => v.session_id === session.id);
    if (exact.length > 0) return exact;
    return coachVideos.filter((v) => v.session_id === null && v.sport_code === session.sport_code);
  }, [coachVideos, session.id, session.sport_code]);
  const selectedCoachVideo = matchingCoachVideos[coachVideoIdx] || matchingCoachVideos[0] || null;

  const formatExerciseCue = React.useCallback(
    (ex?: (typeof session.exercises)[number]) => {
      if (!ex) return '';
      return cueLang === 'wo' ? `${ex.nom}. ${ex.consigneWo}` : `${ex.nom}. ${ex.consigneFr}`;
    },
    [cueLang]
  );

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  useEffect(() => {
    if (!audioEnabled) {
      stopSpeech();
      setVoiceNotice(null);
      return;
    }
    if (currentEx) {
      prefetchCue(formatExerciseCue(currentEx), cueLang);
      if (stepIdx < totalSteps - 1 && (currentEx.reposSec || 20) > 0) {
        prefetchCue(`Pause pendant ${currentEx.reposSec || 20} secondes.`, 'fr');
      }
    }
    const nextEx = session.exercises[stepIdx + 1];
    if (nextEx) {
      prefetchCue(formatExerciseCue(nextEx), cueLang);
    } else {
      prefetchCue('Séance terminée. Pensez à noter votre ressenti.', 'fr');
    }
  }, [audioEnabled, cueLang, currentEx, formatExerciseCue, session.exercises, stepIdx, totalSteps]);

  useEffect(() => {
    if (!running || phase === 'feedback') return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        if (phase === 'work') {
          const restSec = currentEx?.reposSec || 20;
          if (stepIdx < totalSteps - 1 && restSec > 0) {
            void speakCue(`Pause pendant ${restSec} secondes.`, audioEnabled, 'fr', (msg) => setVoiceNotice(msg));
            setPhase('rest');
            return restSec;
          }
        }

        if (stepIdx < totalSteps - 1) {
          const nextIdx = stepIdx + 1;
          const nextEx = session.exercises[nextIdx];
          setStepIdx(nextIdx);
          setPhase('work');
          if (nextEx) {
            void speakCue(formatExerciseCue(nextEx), audioEnabled, cueLang, (msg) => setVoiceNotice(msg));
          }
          return nextEx?.dureeSec || 30;
        }

        void speakCue('Séance terminée. Pensez à noter votre ressenti.', audioEnabled, 'fr', (msg) =>
          setVoiceNotice(msg)
        );
        setRunning(false);
        setPhase('feedback');
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running, phase, stepIdx, totalSteps, currentEx, session.exercises, audioEnabled, cueLang, formatExerciseCue]);

  const handleTogglePlay = () => {
    if (!running && currentEx) {
      setVoiceNotice(null);
      if (phase === 'work') {
        void speakCue(formatExerciseCue(currentEx), audioEnabled, cueLang, (msg) => setVoiceNotice(msg));
      }
    } else if (running) {
      stopSpeech();
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 flex flex-col obsidian-ambient text-[#063725] overflow-y-auto"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[#D5E2DA] bg-white/95 backdrop-blur-md px-4 py-3 md:px-8">
        <div className="min-w-0">
          <div className="text-xs text-[#5B7064]">
            <span className="text-[#0D6E46] font-bold">SÉANCE EN DIRECT</span> · {sportTheme.nom} · {session.duree_min} min
          </div>
          <h2 className="text-base font-bold truncate text-[#063725]">{session.titre}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAudioEnabled((a) => !a)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3]"
            aria-label={audioEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {audioEnabled ? <Volume2 className="h-5 w-5 text-[#0D6E46]" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3]"
            aria-label="Quitter la séance"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-between max-w-2xl w-full mx-auto px-4 py-6 md:py-8 gap-6">
        <AnimatePresence mode="wait">
        {phase === 'feedback' ? (
          <motion.form
            key="feedback-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={handleSubmitFeedback}
            className="rounded-3xl obsidian-card-glow p-6 space-y-5 my-auto"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#0D6E46] shrink-0" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-bold text-[#063725]">Séance terminée</h3>
                <p className="text-sm text-[#475E52]">Notez votre ressenti pour ajuster le suivi avec votre coach.</p>
              </div>
            </div>

            {saveMessage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {saveMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-fatigue" className="text-[#3D5246] font-medium">Fatigue ressentie (1 = frais · 10 = épuisé)</label>
                  <span className="font-mono tabular-nums font-bold text-[#0D6E46]">{fatigue}/10</span>
                </div>
                <input
                  id="rpe-fatigue"
                  type="range"
                  min={1}
                  max={10}
                  value={fatigue}
                  onChange={(e) => setFatigue(Number(e.target.value))}
                  className="w-full accent-[#0D6E46]"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-diff" className="text-[#3D5246] font-medium">Difficulté de la séance (1 à 10)</label>
                  <span className="font-mono tabular-nums font-bold text-[#0D6E46]">{difficulte}/10</span>
                </div>
                <input
                  id="rpe-diff"
                  type="range"
                  min={1}
                  max={10}
                  value={difficulte}
                  onChange={(e) => setDifficulte(Number(e.target.value))}
                  className="w-full accent-[#0D6E46]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-full bg-[#0D6E46] px-5 py-3 text-sm font-bold text-white hover:bg-[#095637] min-h-[48px] shadow-sm"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer et terminer'}
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="session-active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex-1 flex flex-col justify-between gap-6"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#475E52]">
                <span>
                  Exercice <span className="font-mono tabular-nums text-[#063725] font-bold">{stepIdx + 1}/{totalSteps}</span> · {sportTheme.nom}
                </span>
                <div className="flex items-center gap-1 rounded-full bg-white p-1 border border-[#D5E2DA]">
                  <button
                    type="button"
                    onClick={() => setCueLang('fr')}
                    className={`px-3 py-1 rounded-full text-xs font-medium min-h-[30px] ${
                      cueLang === 'fr' ? 'bg-[#0D6E46] text-white font-semibold' : 'text-[#5B7064]'
                    }`}
                  >
                    Français
                  </button>
                  <button
                    type="button"
                    onClick={() => setCueLang('wo')}
                    className={`px-3 py-1 rounded-full text-xs font-medium min-h-[30px] ${
                      cueLang === 'wo' ? 'bg-[#0D6E46] text-white font-semibold' : 'text-[#5B7064]'
                    }`}
                  >
                    Wolof
                  </button>
                </div>
              </div>

              <div className="w-full h-1.5 rounded-full bg-[#D5E2DA] overflow-hidden">
                <motion.div
                  className="h-full bg-[#0D6E46]"
                  animate={{ width: `${((stepIdx + (phase === 'rest' ? 0.5 : 0.2)) / totalSteps) * 100}%` }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${phase}-${stepIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4 my-auto"
              >
              {/* Visual / Video Viewport */}
              {phase === 'rest' ? (
                <div className="space-y-3 text-center">
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-[#0D6E46]">Préparez l’exercice suivant</p>
                    <p className="text-sm text-[#475E52]">
                      À suivre : {session.exercises[stepIdx + 1]?.nom}
                    </p>
                  </div>
                  {session.exercises[stepIdx + 1] && (
                    <div className="mx-auto max-w-md text-left">
                      <ExerciseVideoGuide
                        exerciseName={session.exercises[stepIdx + 1].nom}
                        accentHex="#0D6E46"
                        theme="light"
                        compact
                        showCues={false}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-center">
                  <div className="space-y-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-[#063725]">{currentEx?.nom}</h3>
                    {currentEx && (
                      <div className="text-xs font-mono tabular-nums text-[#475E52]">
                        {currentEx.mode === 'repetitions' && currentEx.repetitions
                          ? `Objectif : ${currentEx.repetitions} répétitions`
                          : `Effort guidé : ${currentEx.dureeSec} s`}
                      </div>
                    )}
                  </div>

                  {(currentVisual || selectedCoachVideo) && (
                    <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-white p-1 border border-[#D5E2DA]">
                      <button
                        type="button"
                        onClick={() => setVisualMode('video')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] ${
                          visualMode === 'video' ? 'bg-[#0D6E46] text-white font-semibold' : 'text-[#475E52]'
                        }`}
                      >
                        Vidéo guidée
                      </button>
                      {currentVisual && (
                        <button
                          type="button"
                          onClick={() => setVisualMode('photo')}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] ${
                            visualMode === 'photo' ? 'bg-[#0D6E46] text-white font-semibold' : 'text-[#475E52]'
                          }`}
                        >
                          Planche anatomique
                        </button>
                      )}
                      {selectedCoachVideo && (
                        <button
                          type="button"
                          onClick={() => setVisualMode('coach')}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] ${
                            visualMode === 'coach' ? 'bg-[#0D6E46] text-white font-semibold' : 'text-[#475E52]'
                          }`}
                        >
                          Vidéo du coach ({matchingCoachVideos.length})
                        </button>
                      )}
                    </div>
                  )}

                  {visualMode === 'coach' && selectedCoachVideo ? (
                    <div className="mx-auto max-w-lg space-y-2.5 text-left">
                      {matchingCoachVideos.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                          {matchingCoachVideos.map((vid, idx) => (
                            <button
                              key={vid.id}
                              type="button"
                              onClick={() => setCoachVideoIdx(idx)}
                              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                                coachVideoIdx === idx
                                  ? 'bg-[#0D6E46] text-white font-semibold'
                                  : 'border border-[#D5E2DA] bg-white text-[#3D5246]'
                              }`}
                            >
                              {vid.titre}
                            </button>
                          ))}
                        </div>
                      )}
                      <CoachVideoPlayer video={selectedCoachVideo} ecoMode={ecoMode} theme="light" />
                      {selectedCoachVideo.description && (
                        <p className="text-xs text-[#475E52] leading-relaxed">{selectedCoachVideo.description}</p>
                      )}
                    </div>
                  ) : visualMode === 'photo' && currentVisual ? (
                    !ecoMode ? (
                      <div className="mx-auto max-w-sm rounded-2xl border border-[#D5E2DA] bg-white p-2.5 text-[#063725] shadow-sm">
                        <img
                          src={currentVisual.imageUrl}
                          alt={currentVisual.label}
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="mx-auto max-h-44 w-auto object-contain"
                        />
                        <div className="mt-1.5 text-[11px] font-medium text-[#3D5246] px-1">
                          {currentVisual.label}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#5B7064]">
                        Planche photo masquée (mode éco données actif) — basculez sur « Vidéo guidée » (0 Ko réseau).
                      </div>
                    )
                  ) : (
                    <div className="mx-auto max-w-lg">
                      <ExerciseVideoGuide
                        exerciseName={currentEx?.nom || ''}
                        accentHex="#0D6E46"
                        theme="light"
                        syncPlaying={running}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Duration Card + Step Metrics Grid */}
              {voiceNotice && audioEnabled && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 flex items-center justify-between gap-2">
                  <span>{voiceNotice}</span>
                  <button
                    type="button"
                    onClick={() => setVoiceNotice(null)}
                    className="font-semibold text-[#063725] hover:underline shrink-0"
                  >
                    Fermer
                  </button>
                </div>
              )}
              <div className="rounded-3xl obsidian-card p-5 space-y-4">
                <div className="text-center border-b border-[#E2EBE5] pb-4">
                  <div className="text-[11px] font-medium tracking-wider text-[#5B7064] uppercase">
                    {phase === 'rest' ? 'Temps de pause' : 'Durée restante'}
                  </div>
                  <div className="mt-1 font-mono text-5xl sm:text-6xl font-bold tabular-nums tracking-tight text-[#063725]">
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                    {String(secondsLeft % 60).padStart(2, '0')}
                  </div>
                </div>

                {phase === 'work' && (
                  <>
                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#5B7064]">Pause prévue</div>
                        <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[#063725]">
                          {currentEx?.reposSec || 20}s
                        </div>
                      </div>
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#5B7064]">Étape</div>
                        <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[#0D6E46]">
                          {stepIdx + 1}/{totalSteps}
                        </div>
                      </div>
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#5B7064]">Langue</div>
                        <div className="mt-0.5 text-xs font-bold text-[#063725]">
                          {cueLang === 'wo' ? 'Wolof' : 'Français'}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-[#063725] leading-relaxed text-center font-medium">
                      {cueLang === 'wo' ? currentEx?.consigneWo : currentEx?.consigneFr}
                    </p>
                    {cueLang === 'wo' && (
                      <p className="text-xs text-[#5B7064] text-center">
                        Français : {currentEx?.consigneFr}
                      </p>
                    )}

                    <div className="text-center pt-1">
                      <div className="inline-flex items-center gap-1 rounded-full bg-[#F1F6F3] p-1 border border-[#D5E2DA]">
                        <button
                          type="button"
                          onClick={() => setVariant('facile')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'facile' ? 'bg-[#0D6E46] text-white' : 'text-[#475E52]'
                          }`}
                        >
                          Facile
                        </button>
                        <button
                          type="button"
                          onClick={() => setVariant('standard')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'standard' ? 'bg-[#063725] text-white font-semibold' : 'text-[#475E52]'
                          }`}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          onClick={() => setVariant('difficile')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'difficile' ? 'bg-amber-600 text-white' : 'text-[#475E52]'
                          }`}
                        >
                          Exigeante
                        </button>
                      </div>
                      {variant !== 'standard' && (
                        <p className="mt-2 text-xs text-[#475E52] max-w-lg mx-auto">
                          {variant === 'facile' ? currentEx?.varianteFacile : currentEx?.varianteDifficile}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
            </AnimatePresence>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setSecondsLeft(phase === 'rest' ? currentEx?.reposSec || 20 : currentEx?.dureeSec || 30);
                  }}
                  className="h-12 w-12 flex items-center justify-center rounded-full border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3]"
                  aria-label="Réinitialiser le chrono"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
                <div className="relative flex items-center justify-center">
                  {running && (
                    <motion.span
                      aria-hidden="true"
                      animate={{ scale: [1, 1.24, 1], opacity: [0.35, 0, 0.35] }}
                      transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                      className="absolute inset-0 rounded-full bg-[#0D6E46]"
                    />
                  )}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={handleTogglePlay}
                    aria-label={running ? 'Pause' : 'Démarrer le chrono'}
                    className="relative z-10 h-16 w-16 inline-flex items-center justify-center rounded-full bg-[#0D6E46] text-white hover:bg-[#095637] shadow-lg shadow-[#0D6E46]/25"
                  >
                    {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                  </motion.button>
                </div>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="h-12 px-4 inline-flex items-center justify-center gap-1.5 rounded-full border border-[#C3D6CA] bg-white text-xs font-bold text-[#063725] hover:bg-[#F1F6F3] whitespace-nowrap"
                >
                  <span>Suivant</span>
                  <SkipForward className="h-4 w-4 text-[#0D6E46]" />
                </button>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-[#D5E2DA]">
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setRunning(false);
                    setPhase('feedback');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0D6E46] hover:text-[#095637] min-h-[44px]"
                >
                  <span>Terminer la séance</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </main>
    </motion.div>
  );
};
