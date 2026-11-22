/**
 * Client-side video compression utility using HTML5 Video + Canvas + MediaRecorder.
 * Reduces large raw mobile clips (30-80 Mo) into lightweight 720p WebM/MP4 streams
 * under the 15 Mo Supabase Free Tier ceiling before upload.
 */

export interface VideoCompressionResult {
  file: File;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
  reason?: string;
}

export interface VideoCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  videoBitsPerSecond?: number;
  maxDurationSec?: number;
  skipBelowBytes?: number;
  onProgress?: (pct: number) => void;
}

function pickSupportedRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

export async function compressVideoFile(
  inputFile: File,
  options: VideoCompressionOptions = {}
): Promise<VideoCompressionResult> {
  const originalBytes = inputFile.size;
  const skipBelowBytes = options.skipBelowBytes ?? 4 * 1024 * 1024; // <= 4 Mo already light

  if (originalBytes <= skipBelowBytes) {
    return {
      file: inputFile,
      compressed: false,
      originalBytes,
      finalBytes: originalBytes,
      reason: 'Fichier déjà léger (<= 4 Mo)',
    };
  }

  const targetMime = pickSupportedRecorderMime();
  if (!targetMime || typeof document === 'undefined') {
    return {
      file: inputFile,
      compressed: false,
      originalBytes,
      finalBytes: originalBytes,
      reason: 'Compression navigateur indisponible',
    };
  }

  const maxWidth = options.maxWidth ?? 960;
  const maxHeight = options.maxHeight ?? 540;
  const videoBitsPerSecond = options.videoBitsPerSecond ?? 950_000; // ~0.95 Mbps = ~7 Mo/min
  const maxDurationSec = options.maxDurationSec ?? 90;

  const objectUrl = URL.createObjectURL(inputFile);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Délai lecture vidéo dépassé')), 15000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Impossible de décoder la vidéo dans le navigateur'));
      };
    });

    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;
    const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
    const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexte canvas indisponible');
    }

    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, {
      mimeType: targetMime,
      videoBitsPerSecond,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stoppedPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: targetMime.split(';')[0] }));
      };
      recorder.onerror = () => reject(new Error('Erreur MediaRecorder'));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, maxDurationSec) : maxDurationSec;
    let rafId = 0;

    const drawLoop = () => {
      if (video.paused || video.ended || video.currentTime >= maxDurationSec) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }
      ctx.drawImage(video, 0, 0, outW, outH);
      if (options.onProgress && duration > 0) {
        options.onProgress(Math.min(99, Math.round((video.currentTime / duration) * 100)));
      }
      rafId = window.requestAnimationFrame(drawLoop);
    };

    recorder.start(500);
    await video.play();
    rafId = window.requestAnimationFrame(drawLoop);

    const outBlob = await stoppedPromise;
    window.cancelAnimationFrame(rafId);
    stream.getTracks().forEach((t) => t.stop());

    if (outBlob.size > 0 && outBlob.size < originalBytes) {
      const baseMime = targetMime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
      const ext = baseMime === 'video/mp4' ? '.mp4' : '.webm';
      const baseName = inputFile.name.replace(/\.[^.]+$/, '') || 'seance';
      const compressedFile = new File([outBlob], `${baseName}-opt${ext}`, { type: baseMime });
      options.onProgress?.(100);
      return {
        file: compressedFile,
        compressed: true,
        originalBytes,
        finalBytes: compressedFile.size,
      };
    }

    return {
      file: inputFile,
      compressed: false,
      originalBytes,
      finalBytes: originalBytes,
      reason: 'Le fichier original est déjà optimal',
    };
  } catch {
    return {
      file: inputFile,
      compressed: false,
      originalBytes,
      finalBytes: originalBytes,
      reason: 'Fallback sur le fichier original',
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
