'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

interface MediaUploaderProps {
  caseId: string;
  disabled?: boolean;
  onUploaded: (message: Record<string, unknown>) => void;
  onError: (msg: string) => void;
}

export function MediaUploader({ caseId, disabled, onUploaded, onError }: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaKind = file.type.startsWith('video/')
      ? 'video'
      : file.type === 'application/pdf'
      ? 'document'
      : 'image';

    setUploading(true);
    try {
      const prep = await apiFetch<{ storagePath: string; signedUrl: string; safeName: string }>(
        `/api/cases/${caseId}/attachments/prepare`,
        {
          method: 'POST',
          body: {
            filename: file.name,
            mediaKind,
            byteSize: file.size,
          },
        }
      );

      const putRes = await fetch(prep.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error('Échec du transfert vers le stockage sécurisé.');
      }

      const committed = await apiFetch<{ message: Record<string, unknown> }>(
        `/api/cases/${caseId}/attachments/commit`,
        {
          method: 'POST',
          body: {
            storagePath: prep.storagePath,
            originalName: file.name,
            caption: `Pièce partagée (${mediaKind === 'video' ? 'vidéo' : mediaKind === 'document' ? 'document PDF' : 'image'})`,
          },
        }
      );

      onUploaded(committed.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossible d’envoyer ce fichier.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        title="Partager une image, vidéo ou PDF (stockage privé sécurisé)"
        className="px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
      >
        {uploading ? <Upload className="w-4 h-4 animate-pulse" /> : <Paperclip className="w-4 h-4" />}
        <span className="hidden sm:inline">{uploading ? 'Envoi...' : 'Image / Vidéo'}</span>
      </button>
    </>
  );
}
