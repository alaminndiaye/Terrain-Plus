'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Wifi } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface VideoCallRoomProps {
  caseId: string;
  userId: string;
  peerName: string;
  onClose: () => void;
}

export function VideoCallRoom({ caseId, userId, peerName, onClose }: VideoCallRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(
    null
  );

  const [statusText, setStatusText] = useState('Initialisation caméra & micro...');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function startCall() {
      try {
        const cfg = await apiFetch<{ channelName: string; iceServers: RTCIceServer[] }>(
          `/api/cases/${caseId}/video`
        );
        await apiFetch(`/api/cases/${caseId}/video`, {
          method: 'POST',
          body: { action: 'start' },
        });

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }

        const pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
        pcRef.current = pc;
        mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setStatusText(`En ligne avec ${peerName}`);
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') setStatusText(`Visio connectée · ${peerName}`);
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setStatusText('Connexion instable — vous pouvez continuer via la messagerie.');
          }
        };

        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          setStatusText('Salle locale prête (configurez Supabase Realtime pour la visio distante).');
          return;
        }

        const channel = supabase.channel(cfg.channelName, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { from: userId, type: 'ice', candidate: event.candidate },
            });
          }
        };

        channel
          .on('broadcast', { event: 'signal' }, async ({ payload }) => {
            if (!payload || payload.from === userId) return;
            try {
              if (payload.type === 'ready') {
                setStatusText('Participant détecté, connexion en cours...');
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: { from: userId, type: 'offer', sdp: offer },
                });
              } else if (payload.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: { from: userId, type: 'answer', sdp: answer },
                });
              } else if (payload.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              } else if (payload.type === 'ice' && payload.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } else if (payload.type === 'hangup') {
                setStatusText(`${peerName} a quitté la visio.`);
              }
            } catch {
              // Ignore transient negotiation race
            }
          })
          .subscribe((subStatus) => {
            if (subStatus === 'SUBSCRIBED') {
              setStatusText(`En attente de ${peerName}...`);
              channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { from: userId, type: 'ready' },
              });
            }
          });
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Impossible d’accéder à la caméra ou au microphone. Vérifiez les permissions du navigateur.'
        );
      }
    }

    startCall();

    return () => {
      active = false;
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: { from: userId, type: 'hangup' },
      });
      channelRef.current?.unsubscribe();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      apiFetch(`/api/cases/${caseId}/video`, {
        method: 'POST',
        body: { action: 'end' },
      }).catch(() => {});
    };
  }, [caseId, peerName, userId]);

  function toggleMic() {
    const tracks = streamRef.current?.getAudioTracks() || [];
    tracks.forEach((t) => {
      t.enabled = !micOn;
    });
    setMicOn(!micOn);
  }

  function toggleCam() {
    const tracks = streamRef.current?.getVideoTracks() || [];
    tracks.forEach((t) => {
      t.enabled = !camOn;
    });
    setCamOn(!camOn);
  }

  return (
    <div className="bg-[#063725] text-white rounded-2xl p-4 border border-[#18523A] space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Wifi className="w-4 h-4 text-[#FBBF24]" />
          <span className="font-semibold">{statusText}</span>
        </div>
        <span className="text-[11px] bg-[#0D6E46]/40 border border-[#18523A] text-[#ECF7F1] px-2.5 py-0.5 rounded-full">
          WebRTC P2P sécurisé (non enregistré)
        </span>
      </div>

      {errorMsg && (
        <div className="bg-red-950 border border-red-700 text-red-100 rounded-xl p-3 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="relative bg-[#042418] rounded-xl overflow-hidden aspect-video max-h-[380px] border border-[#18523A]">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 right-3 w-32 sm:w-44 aspect-video rounded-xl object-cover border-2 border-[#FBBF24] bg-[#063725]"
        />
      </div>

      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={toggleMic}
          className={`p-3 rounded-full transition ${micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-[#D97706]'}`}
          aria-label="Basculer microphone"
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={toggleCam}
          className={`p-3 rounded-full transition ${camOn ? 'bg-white/15 hover:bg-white/25' : 'bg-[#D97706]'}`}
          aria-label="Basculer caméra"
        >
          {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-full bg-red-600 hover:bg-red-700 font-semibold text-sm flex items-center gap-2 transition"
        >
          <PhoneOff className="w-4 h-4" />
          Quitter la visio
        </button>
      </div>
    </div>
  );
}
