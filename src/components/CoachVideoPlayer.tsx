import React, { useMemo, useState } from 'react';
import { ExternalLink, Play, Video } from 'lucide-react';
import type { CoachVideoItem } from '../types';

interface CoachVideoPlayerProps {
  video: CoachVideoItem;
  ecoMode?: boolean;
  theme?: 'light' | 'dark';
}

function parseEmbedTarget(url: string): {
  kind: 'youtube' | 'vimeo' | 'direct';
  src: string;
  thumbnailUrl?: string;
} {
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        return {
          kind: 'youtube',
          src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1&modestbranding=1`,
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        };
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
        return {
          kind: 'youtube',
          src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1&modestbranding=1`,
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        };
      }
    }

    if (host.includes('vimeo.com')) {
      const match = /\/(?:video\/)?(\d{5,15})/.exec(parsed.pathname);
      if (match?.[1]) {
        return { kind: 'vimeo', src: `https://player.vimeo.com/video/${match[1]}?autoplay=1` };
      }
    }
  } catch {
    // Fallback to direct HTML5 player
  }

  return { kind: 'direct', src: url };
}

export function formatVideoSizeMb(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Version légère · 0 Mo';
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${mb.toFixed(1)} Mo`;
}

export const CoachVideoPlayer: React.FC<CoachVideoPlayerProps> = ({
  video,
  ecoMode = false,
}) => {
  const [activated, setActivated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const embed = useMemo(() => parseEmbedTarget(video.playback_url), [video.playback_url]);

  // Ultra-lightweight click-to-load facade: mounts 0 iframes and 0 video bytes until user clicks Play
  if (!activated) {
    const showThumb = Boolean(!ecoMode && embed.thumbnailUrl && !thumbFailed);

    if (showThumb && embed.thumbnailUrl) {
      return (
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label={`Lire la vidéo : ${video.titre}`}
          className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] text-left focus:outline-none focus:ring-2 focus:ring-[#0D6E46]"
        >
          <img
            src={embed.thumbnailUrl}
            alt={video.titre}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#063725]/85 via-[#063725]/35 to-[#063725]/15" />

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#0D6E46] text-white shadow-lg ring-4 ring-white/30 transition-transform group-hover:scale-105">
              <Play className="h-5 w-5 fill-current ml-0.5" aria-hidden="true" />
            </span>
          </div>

          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-white">
            <span className="text-xs font-bold truncate drop-shadow">{video.titre}</span>
            <span className="shrink-0 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold">
              Lire
            </span>
          </div>
        </button>
      );
    }

    return (
      <div className="aspect-video w-full rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] text-[#063725] flex flex-col items-center justify-center gap-3 p-5 text-center">
        <div className="h-11 w-11 rounded-full bg-[#ECF7F1] border border-[#BFE0CD] flex items-center justify-center">
          <Video className="h-5 w-5 text-[#0D6E46]" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-sm">
          <div className="text-xs font-bold truncate">{video.titre}</div>
          <p className="text-[11px] text-[#5B7064]">
            {ecoMode
              ? `Mode éco actif — aucun chargement avant lecture (${formatVideoSizeMb(video.file_size_bytes)}).`
              : `Chargement léger à la demande (${formatVideoSizeMb(video.file_size_bytes)}).`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActivated(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[40px] shadow-sm"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Lire la vidéo</span>
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="aspect-video w-full rounded-2xl border border-[#D5E2DA] bg-[#F1F6F3] text-[#3D5246] flex flex-col items-center justify-center gap-2.5 p-5 text-center">
        <p className="text-xs font-medium">Impossible de lire ce flux vidéo directement dans le lecteur.</p>
        {video.source_type === 'EXTERNAL_URL' && (
          <a
            href={video.playback_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#C3D6CA] bg-white px-3 py-1.5 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[36px]"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#0D6E46]" aria-hidden="true" />
            <span>Ouvrir le lien vidéo</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[#D5E2DA] bg-black">
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
          autoPlay
          playsInline
          preload="none"
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
