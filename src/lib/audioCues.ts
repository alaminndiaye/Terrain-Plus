import { getSessionToken } from './api';

let currentAudio: HTMLAudioElement | null = null;
let activePlaySeq = 0;
let activeController: AbortController | null = null;

const MAX_CACHED_CUES = 60;
const audioUrlCache = new Map<string, string>();
const inflightCueFetches = new Map<string, Promise<{ url: string | null; error?: string }>>();

function storeCachedAudioUrl(cacheKey: string, objectUrl: string): void {
  if (audioUrlCache.has(cacheKey)) {
    audioUrlCache.delete(cacheKey);
  } else if (audioUrlCache.size >= MAX_CACHED_CUES) {
    const oldestKey = audioUrlCache.keys().next().value;
    if (oldestKey) {
      const oldUrl = audioUrlCache.get(oldestKey);
      audioUrlCache.delete(oldestKey);
      if (oldUrl && (!currentAudio || currentAudio.src !== oldUrl)) {
        URL.revokeObjectURL(oldUrl);
      }
    }
  }
  audioUrlCache.set(cacheKey, objectUrl);
}

async function fetchCueAudioUrl(
  text: string,
  lang: 'fr' | 'wo',
  signal?: AbortSignal
): Promise<{ url: string | null; error?: string }> {
  const clean = text.trim();
  if (!clean) return { url: null };

  const cacheKey = `${lang}:${clean}`;
  const cached = audioUrlCache.get(cacheKey);
  if (cached) {
    // Refresh LRU order
    audioUrlCache.delete(cacheKey);
    audioUrlCache.set(cacheKey, cached);
    return { url: cached };
  }

  const existing = inflightCueFetches.get(cacheKey);
  if (existing) {
    return existing;
  }

  const token = getSessionToken();
  const promise = (async () => {
    try {
      const res = await fetch('/api/tts/cue', {
        method: 'POST',
        credentials: 'include',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: clean, lang }),
      });

      if (!res.ok) {
        let errMessage = 'Voix de coaching momentanément indisponible.';
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) errMessage = errJson.error;
        } catch {
          // keep default message
        }
        return { url: null, error: errMessage };
      }

      const wavBlob = await res.blob();
      if (!wavBlob || wavBlob.size < 100) {
        return { url: null, error: 'Flux audio vide reçu.' };
      }

      const objectUrl = URL.createObjectURL(wavBlob);
      storeCachedAudioUrl(cacheKey, objectUrl);
      return { url: objectUrl };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { url: null };
      }
      return { url: null, error: 'Connexion réseau insuffisante pour charger le guidage vocal.' };
    } finally {
      inflightCueFetches.delete(cacheKey);
    }
  })();

  inflightCueFetches.set(cacheKey, promise);
  return promise;
}

export function prefetchCue(text: string, lang: 'fr' | 'wo' = 'fr'): void {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  const clean = text.trim();
  if (!clean) return;
  const cacheKey = `${lang}:${clean}`;
  if (audioUrlCache.has(cacheKey) || inflightCueFetches.has(cacheKey)) return;
  void fetchCueAudioUrl(clean, lang);
}

export function stopSpeech(): void {
  activePlaySeq += 1;
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // Ignore cleanup errors
    }
    currentAudio = null;
  }
}

export async function speakCue(
  text: string,
  enabled: boolean,
  lang: 'fr' | 'wo' = 'fr',
  onError?: (message: string) => void
): Promise<void> {
  if (!enabled || typeof window === 'undefined') return;
  const clean = text.trim();
  if (!clean) return;

  stopSpeech();
  const playSeq = activePlaySeq;
  const controller = new AbortController();
  activeController = controller;

  const { url, error } = await fetchCueAudioUrl(clean, lang, controller.signal);
  if (playSeq !== activePlaySeq) return;

  if (!url) {
    if (error && onError) {
      onError(error);
    }
    return;
  }

  try {
    const audio = new Audio(url);
    audio.preload = 'auto';
    currentAudio = audio;
    await audio.play();
  } catch {
    // Ignore autoplay restriction if triggered outside user gesture
  }
}
