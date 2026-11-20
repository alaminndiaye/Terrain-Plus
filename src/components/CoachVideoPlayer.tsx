import React, { useMemo, useState } from 'react';
import { ExternalLink, Play, Video } from 'lucide-react';
import type { CoachVideoItem } from '../types';

interface CoachVideoPlayerProps {
  video: CoachVideoItem;
  ecoMode?: boolean;
  theme?: 'light' | 'dark';
}

function parseEmbedTarget(url: string): { kind: 'youtube' | 'vimeo' | 'native'; src: string } {
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
      }
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      let id = parsed.searchParams.get('v') || '';
      if (!id && parsed.pathname.startsWith('/shorts/')) {
        id = parsed.pathname.split('/')[2] || '';
      }
      if (!id && parsed.pathname.startsWith('/embed/')) {
        id = parsed.pathname.split('/')[2] || '';
      }
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
      }
    }

    if (host.includes('vimeo.com')) {
      const match = /\/(?:video\/)?(\d{5,15})/.exec(parsed.pathname);
      if (match?.[1]) {
        return { kind: 'vimeo', src: `https://player.vimeo.com/video/${match[1]}` };
      }
    }
  } catch {
    // Fallback to native HTML5 player
  }

  return { kind: 'native', src: url };
}

export function formatVideoSizeMb(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Lien externe · 0 Mo';
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${mb.toFixed(1)} Mo`;
}

export const CoachVideoPlayer: React.FC<CoachVideoPlayerProps> = ({
  video,
  ecoMode = false,
  theme = 'dark',
}) => {
  const [unlockedInEco, setUnlockedInEco] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const embed = useMemo(() => parseEmbedTarget(video.playback_url), [video.playback_url]);
  const isDark = theme === 'dark';

  if (ecoMode && !unlockedInEco) {
    return (
      <div
        className={`aspect-video w-full rounded-2xl border flex flex-col items-center justify-center gap-3 p-5 text-center ${
          isDark
            ? 'border-white/10 bg-[#161B13] text-[#F5F7F1]'
            : 'border-white/10 bg-[#161B13] text-[#F5F7F1]'
        }`}
      >
        <Video className="h-7 w-7 text-[#C8F62D]" aria-hidden="true" />
        <div className="space-y-1 max-w-sm">
          <div className="text-xs font-semibold">Mode éco données actif — vidéo en attente</div>
          <p className="text-[11px] text-[#9AA491]">
            Aucun octet n’est téléchargé tant que vous ne lancez pas la lecture ({formatVideoSizeMb(video.file_size_bytes)}).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUnlockedInEco(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#C8F62D] px-4 py-2 text-xs font-semibold text-[#080A07] hover:bg-[#D7FA59] min-h-[40px]"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Charger et lire la vidéo</span>
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="aspect-video w-full rounded-2xl border border-white/10 bg-[#161B13] text-[#B4BCA9] flex flex-col items-center justify-center gap-2.5 p-5 text-center">
        <p className="text-xs font-medium">Impossible de lire ce flux vidéo directement dans le lecteur.</p>
        {video.source_type === 'EXTERNAL_URL' && (
          <a
            href={video.playback_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#1C2318] px-3 py-1.5 text-xs font-medium text-[#F5F7F1] hover:bg-[#242D1F] min-h-[36px]"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#C8F62D]" aria-hidden="true" />
            <span>Ouvrir le lien vidéo</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      {embed.kind === 'youtube' || embed.kind === 'vimeo' ? (
        <iframe
          src={embed.src}
          title={video.titre}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <video
          controls
          playsInline
          preload="metadata"
          src={embed.src}
          onError={() => setLoadError(true)}
          className="h-full w-full object-contain bg-black"
        >
          Votre navigateur ne supporte pas la lecture vidéo HTML5.
        </video>
      )}
    </div>
  );
};
