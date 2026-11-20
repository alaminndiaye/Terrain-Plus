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
  onReportPain: () => void;
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
  onReportPain,
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
  const [sommeil, setSommeil] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex flex-col obsidian-ambient text-[#F5F7F1] overflow-y-auto">
      <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] bg-[#080A07]/75 backdrop-blur-md px-4 py-3 md:px-8">
        <div className="min-w-0">
          <div className="text-xs text-[#9AA491]">
            <span className="text-[#C8F62D] font-semibold">SÉANCE EN DIRECT</span> · {sportTheme.nom} · {session.duree_min} min
          </div>
          <h2 className="text-base font-semibold truncate text-[#F5F7F1]">{session.titre}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAudioEnabled((a) => !a)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/12 bg-[#161B13] text-[#D6DDD0] hover:bg-[#1E251A]"
            aria-label={audioEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {audioEnabled ? <Volume2 className="h-5 w-5 text-[#C8F62D]" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/12 bg-[#161B13] text-[#D6DDD0] hover:bg-[#1E251A]"
            aria-label="Quitter la séance"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-between max-w-2xl w-full mx-auto px-4 py-6 md:py-8 gap-6">
        {phase === 'feedback' ? (
          <form onSubmit={handleSubmitFeedback} className="rounded-3xl obsidian-card-glow p-6 space-y-5 my-auto">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#C8F62D] shrink-0" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-semibold text-[#F5F7F1]">Séance terminée</h3>
                <p className="text-sm text-[#9AA491]">Notez votre ressenti pour ajuster le suivi avec votre coach.</p>
              </div>
            </div>

            {saveMessage && (
              <div className="rounded-2xl border border-[#C8F62D]/30 bg-[#C8F62D]/10 p-3 text-sm text-[#E9FCD0]">
                {saveMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-fatigue" className="text-[#D6DDD0]">Fatigue ressentie (1 = frais · 10 = épuisé)</label>
                  <span className="font-mono tabular-nums font-semibold text-[#C8F62D]">{fatigue}/10</span>
                </div>
                <input
                  id="rpe-fatigue"
                  type="range"
                  min={1}
                  max={10}
                  value={fatigue}
                  onChange={(e) => setFatigue(Number(e.target.value))}
                  className="w-full accent-[#C8F62D]"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-diff" className="text-[#D6DDD0]">Difficulté de la séance (1 à 10)</label>
                  <span className="font-mono tabular-nums font-semibold text-[#C8F62D]">{difficulte}/10</span>
                </div>
                <input
                  id="rpe-diff"
                  type="range"
                  min={1}
                  max={10}
                  value={difficulte}
                  onChange={(e) => setDifficulte(Number(e.target.value))}
                  className="w-full accent-[#C8F62D]"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <label htmlFor="rpe-sleep" className="text-[#D6DDD0]">Qualité du sommeil la nuit dernière (1 à 10)</label>
                  <span className="font-mono tabular-nums font-semibold text-[#C8F62D]">{sommeil}/10</span>
                </div>
                <input
                  id="rpe-sleep"
                  type="range"
                  min={1}
                  max={10}
                  value={sommeil}
                  onChange={(e) => setSommeil(Number(e.target.value))}
                  className="w-full accent-[#C8F62D]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-full bg-[#C8F62D] px-5 py-3 text-sm font-semibold text-[#080A07] hover:bg-[#D7FA59] min-h-[48px]"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer et terminer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopSpeech();
                  onReportPain();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-red-500/35 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-200 hover:bg-red-900/60 min-h-[48px]"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Signaler une douleur</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#9AA491]">
                <span>
                  Exercice <span className="font-mono tabular-nums text-[#F5F7F1] font-semibold">{stepIdx + 1}/{totalSteps}</span> · Prévention {session.prevention_focus}
                </span>
                <div className="flex items-center gap-1 rounded-full bg-[#121610] p-1 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setCueLang('fr')}
                    className={`px-3 py-1 rounded-full text-xs font-medium min-h-[30px] ${
                      cueLang === 'fr' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
                    }`}
                  >
                    Français
                  </button>
                  <button
                    type="button"
                    onClick={() => setCueLang('wo')}
                    className={`px-3 py-1 rounded-full text-xs font-medium min-h-[30px] ${
                      cueLang === 'wo' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
                    }`}
                  >
                    Wolof
                  </button>
                </div>
              </div>

              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#C8F62D] transition-all"
                  style={{ width: `${((stepIdx + (phase === 'rest' ? 0.5 : 0.2)) / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-4 my-auto">
              {/* Visual / Video Viewport */}
              {phase === 'rest' ? (
                <div className="space-y-3 text-center">
                  <div className="space-y-1">
                    <p className="text-lg font-medium text-[#C8F62D]">Respirez et relâchez les appuis</p>
                    <p className="text-sm text-[#9AA491]">
                      À suivre : {session.exercises[stepIdx + 1]?.nom}
                    </p>
                  </div>
                  {session.exercises[stepIdx + 1] && (
                    <div className="mx-auto max-w-md text-left">
                      <ExerciseVideoGuide
                        exerciseName={session.exercises[stepIdx + 1].nom}
                        accentHex="#C8F62D"
                        theme="dark"
                        compact
                        showCues={false}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-center">
                  <div className="space-y-1">
                    <h3 className="text-xl sm:text-2xl font-semibold text-[#F5F7F1]">{currentEx?.nom}</h3>
                    {currentEx && (
                      <div className="text-xs font-mono tabular-nums text-[#9AA491]">
                        {currentEx.mode === 'repetitions' && currentEx.repetitions
                          ? `Objectif : ${currentEx.repetitions} répétitions`
                          : `Effort guidé : ${currentEx.dureeSec} s`}
                      </div>
                    )}
                  </div>

                  {(currentVisual || selectedCoachVideo) && (
                    <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-[#121610] p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setVisualMode('video')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] ${
                          visualMode === 'video' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
                        }`}
                      >
                        Vidéo guidée
                      </button>
                      {currentVisual && (
                        <button
                          type="button"
                          onClick={() => setVisualMode('photo')}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium min-h-[34px] ${
                            visualMode === 'photo' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
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
                            visualMode === 'coach' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
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
                                  ? 'bg-[#C8F62D] text-[#080A07] font-semibold'
                                  : 'border border-white/10 bg-[#161B13] text-[#D6DDD0]'
                              }`}
                            >
                              {vid.titre}
                            </button>
                          ))}
                        </div>
                      )}
                      <CoachVideoPlayer video={selectedCoachVideo} ecoMode={ecoMode} theme="dark" />
                      {selectedCoachVideo.description && (
                        <p className="text-xs text-[#B4BCA9] leading-relaxed">{selectedCoachVideo.description}</p>
                      )}
                    </div>
                  ) : visualMode === 'photo' && currentVisual ? (
                    !ecoMode ? (
                      <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#F5F7F1] p-2.5 text-neutral-900">
                        <img
                          src={currentVisual.imageUrl}
                          alt={currentVisual.label}
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="mx-auto max-h-44 w-auto object-contain"
                        />
                        <div className="mt-1.5 text-[11px] font-medium text-neutral-700 px-1">
                          {currentVisual.label}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#9AA491]">
                        Planche photo masquée (mode éco données actif) — basculez sur « Vidéo guidée » (0 Ko réseau).
                      </div>
                    )
                  ) : (
                    <div className="mx-auto max-w-lg">
                      <ExerciseVideoGuide
                        exerciseName={currentEx?.nom || ''}
                        accentHex="#C8F62D"
                        theme="dark"
                        syncPlaying={running}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Screen 3 inspired Duration Card + Telemetry Grid */}
              <div className="rounded-3xl obsidian-card p-5 space-y-4">
                <div className="text-center border-b border-white/[0.08] pb-4">
                  <div className="text-[11px] font-medium tracking-wider text-[#9AA491] uppercase">
                    {phase === 'rest' ? 'Temps de récupération' : 'Durée restante'}
                  </div>
                  <div className="mt-1 font-mono text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight text-[#F5F7F1]">
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                    {String(secondsLeft % 60).padStart(2, '0')}
                  </div>
                </div>

                {phase === 'work' && (
                  <>
                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#8E9784]">Repos prévu</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#F5F7F1]">
                          {currentEx?.reposSec || 20}s
                        </div>
                      </div>
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#8E9784]">Étape</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#C8F62D]">
                          {stepIdx + 1}/{totalSteps}
                        </div>
                      </div>
                      <div className="rounded-2xl obsidian-inset p-2.5">
                        <div className="text-[10px] text-[#8E9784]">Langue</div>
                        <div className="mt-0.5 text-xs font-semibold text-[#F5F7F1]">
                          {cueLang === 'wo' ? 'Wolof' : 'Français'}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-[#D6DDD0] leading-relaxed text-center">
                      {cueLang === 'wo' ? currentEx?.consigneWo : currentEx?.consigneFr}
                    </p>
                    {cueLang === 'wo' && (
                      <p className="text-xs text-[#8E9784] text-center">
                        Français : {currentEx?.consigneFr}
                      </p>
                    )}

                    <div className="text-center pt-1">
                      <div className="inline-flex items-center gap-1 rounded-full bg-[#181D15] p-1 border border-white/10">
                        <button
                          type="button"
                          onClick={() => setVariant('facile')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'facile' ? 'bg-emerald-600 text-white' : 'text-[#9AA491]'
                          }`}
                        >
                          Facile
                        </button>
                        <button
                          type="button"
                          onClick={() => setVariant('standard')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'standard' ? 'bg-[#C8F62D] text-[#080A07] font-semibold' : 'text-[#9AA491]'
                          }`}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          onClick={() => setVariant('difficile')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium min-h-[34px] whitespace-nowrap ${
                            variant === 'difficile' ? 'bg-orange-600 text-white' : 'text-[#9AA491]'
                          }`}
                        >
                          Exigeante
                        </button>
                      </div>
                      {variant !== 'standard' && (
                        <p className="mt-2 text-xs text-[#B4BCA9] max-w-lg mx-auto">
                          {variant === 'facile' ? currentEx?.varianteFacile : currentEx?.varianteDifficile}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setSecondsLeft(phase === 'rest' ? currentEx?.reposSec || 20 : currentEx?.dureeSec || 30);
                  }}
                  className="h-12 w-12 flex items-center justify-center rounded-full border border-white/12 bg-[#161B13] text-[#D6DDD0] hover:bg-[#1E251A]"
                  aria-label="Réinitialiser le chrono"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label={running ? 'Pause' : 'Démarrer le chrono'}
                  className="h-16 w-16 inline-flex items-center justify-center rounded-full bg-[#C8F62D] text-[#080A07] hover:bg-[#D7FA59] shadow-lg shadow-[#C8F62D]/20 transition-transform active:scale-95"
                >
                  {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="h-12 px-4 inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-[#161B13] text-xs font-semibold text-[#D6DDD0] hover:bg-[#1E251A] whitespace-nowrap"
                >
                  <span>Suivant</span>
                  <SkipForward className="h-4 w-4 text-[#C8F62D]" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
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
                  <span>Douleur ? Arrêter et alerter</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setRunning(false);
                    setPhase('feedback');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#C8F62D] hover:text-[#D7FA59] min-h-[44px]"
                >
                  <span>Terminer la séance</span>
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
