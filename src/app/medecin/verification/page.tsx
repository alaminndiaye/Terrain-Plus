'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, ShieldCheck, Upload } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';
import type { VerificationStatus } from '@/lib/types';

interface EvidenceItem {
  id: string;
  doc_type: string;
  original_name_safe: string;
  mime_type: string;
  byte_size: number;
  uploaded_at: string;
}

interface SpecialtyItem {
  id: string;
  name: string;
}

interface DashboardResp {
  verification: {
    status: VerificationStatus;
    reason: string | null;
    submittedAt: string | null;
    slaDueAt: string | null;
    verifiedAt: string | null;
    evidence: EvidenceItem[];
  };
  profile: {
    publicName: string;
    specialtyId: string;
    orderNumber: string;
    city: string;
    facilityName: string;
    facilityAddress: string;
    languages: string[];
    bio: string;
    supportsVideo: boolean;
    supportsPhysical: boolean;
  };
  specialties: SpecialtyItem[];
}

const DOC_TYPE_LABELS: Record<string, string> = {
  professional_card: 'Carte professionnelle / Attestation Ordre',
  facility_proof: 'Justificatif établissement / cabinet',
  diploma: 'Diplôme / CES Médecine du sport',
  complement: 'Pièce complémentaire demandée',
};

export default function DoctorVerificationPage() {
  const [data, setData] = useState<DashboardResp | null>(null);
  const [publicName, setPublicName] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [city, setCity] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [facilityAddress, setFacilityAddress] = useState('');
  const [bio, setBio] = useState('');
  const [languagesText, setLanguagesText] = useState('Français');
  const [supportsVideo, setSupportsVideo] = useState(true);
  const [supportsPhysical, setSupportsPhysical] = useState(true);

  const [docType, setDocType] = useState<'professional_card' | 'facility_proof' | 'diploma' | 'complement'>(
    'professional_card'
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<DashboardResp>('/api/doctor/dashboard');
    setData(res);
    setPublicName(res.profile.publicName || '');
    setSpecialtyId(res.profile.specialtyId || '');
    setOrderNumber(res.profile.orderNumber || '');
    setCity(res.profile.city || '');
    setFacilityName(res.profile.facilityName || '');
    setFacilityAddress(res.profile.facilityAddress || '');
    setBio(res.profile.bio || '');
    setLanguagesText((res.profile.languages || ['Français']).join(', '));
    setSupportsVideo(Boolean(res.profile.supportsVideo));
    setSupportsPhysical(Boolean(res.profile.supportsPhysical));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement.'));
  }, [load]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/doctor/dashboard', {
        method: 'PUT',
        body: {
          publicName,
          specialtyId,
          orderNumber,
          city,
          facilityName,
          facilityAddress,
          bio,
          languages: languagesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          supportsVideo,
          supportsPhysical,
        },
      });
      setNotice('Profil praticien enregistré. Votre dossier reste suivi dans le délai cible de 72h.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadEvidence(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const prep = await apiFetch<{ storagePath: string; signedUrl: string }>('/api/doctor/evidence/prepare', {
        method: 'POST',
        body: { filename: file.name, byteSize: file.size },
      });

      const putRes = await fetch(prep.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error('Transfert du justificatif échoué.');

      await apiFetch('/api/doctor/evidence/commit', {
        method: 'POST',
        body: {
          storagePath: prep.storagePath,
          originalName: file.name,
          docType,
        },
      });
      setNotice('Justificatif déposé dans le coffre privé Terrain+ et soumis à vérification (SLA 72h).');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer ce justificatif.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <AppShell requireAuthRole="doctor">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#063725]">Profil praticien &amp; Vérification professionnelle</h1>
          <p className="text-sm text-[#475E52] mt-1">
            Pour protéger les sportifs, aucun médecin n’est publié ni autorisé à recevoir de paiement sans validation manuelle (objectif 72h ouvrées).
          </p>
        </div>

        {data && (
          <div className="p-4 rounded-2xl obsidian-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#0D6E46]" />
              <div>
                <p className="text-sm font-semibold text-[#063725]">
                  Statut actuel : <span className="uppercase text-[#0D6E46]">{data.verification.status}</span>
                </p>
                {data.verification.slaDueAt && data.verification.status === 'pending' && (
                  <p className="text-xs text-[#5B7064]">
                    Échéance cible (72h) : {formatDateTimeFr(data.verification.slaDueAt)}
                  </p>
                )}
                {data.verification.verifiedAt && (
                  <p className="text-xs text-[#0D6E46]">
                    Vérifié le {formatDateTimeFr(data.verification.verifiedAt)}
                  </p>
                )}
                {data.verification.reason && (
                  <p className="text-xs text-amber-800 mt-1">Motif / note admin : {data.verification.reason}</p>
                )}
              </div>
            </div>
            {data.verification.status === 'verified' && (
              <span className="px-3 py-1 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] text-xs font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Visible dans l’annuaire
              </span>
            )}
          </div>
        )}

        {notice && (
          <div className="p-3.5 rounded-xl border border-[#C3D6CA] bg-[#ECF7F1] text-sm text-[#063725]">{notice}</div>
        )}
        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">{error}</div>
        )}

        {/* Evidence upload */}
        <div className="p-5 rounded-2xl obsidian-card space-y-4">
          <h2 className="font-display font-bold text-[#063725]">1. Pièces justificatives confidentielles (PDF, JPG, PNG, WebP · 5 Mo max)</h2>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-[#063725] mb-1">Type de document</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as typeof docType)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D5E2DA] text-sm bg-white"
              >
                <option value="professional_card">{DOC_TYPE_LABELS.professional_card}</option>
                <option value="facility_proof">{DOC_TYPE_LABELS.facility_proof}</option>
                <option value="diploma">{DOC_TYPE_LABELS.diploma}</option>
                <option value="complement">{DOC_TYPE_LABELS.complement}</option>
              </select>
            </div>
            <label className="px-5 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold cursor-pointer flex items-center gap-2 shrink-0 transition">
              <Upload className="w-4 h-4" />
              <span>{uploading ? 'Chiffrement & envoi...' : 'Déposer une pièce'}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={handleUploadEvidence}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2">
            {(data?.verification.evidence || []).length === 0 ? (
              <p className="text-xs text-[#5B7064]">Aucun justificatif déposé pour l’instant.</p>
            ) : (
              (data?.verification.evidence || []).map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl obsidian-inset flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0D6E46]" />
                    <div>
                      <p className="font-semibold text-[#063725]">
                        {DOC_TYPE_LABELS[ev.doc_type] || ev.doc_type} · {ev.original_name_safe}
                      </p>
                      <p className="text-[#5B7064]">
                        {Math.round(ev.byte_size / 1024)} Ko · Déposé le {formatDateTimeFr(ev.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ECF7F1] border border-[#C3D6CA] text-[#0D6E46] font-semibold">
                    Stockage privé
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="p-5 rounded-2xl obsidian-card space-y-4">
          <h2 className="font-display font-bold text-[#063725]">2. Fiche publique &amp; coordonnées cabinet</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">Nom affiché (avec titre)</label>
              <input
                required
                value={publicName}
                onChange={(e) => setPublicName(e.target.value)}
                placeholder="Dr Moussa Diop"
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">Spécialité principale</label>
              <select
                required
                value={specialtyId}
                onChange={(e) => setSpecialtyId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm bg-white"
              >
                <option value="">Sélectionner...</option>
                {(data?.specialties || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">N° d’inscription / Ordre</label>
              <input
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">Ville</label>
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">Clinique / Cabinet</label>
              <input
                required
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#063725] mb-1">Adresse complète (visible après paiement)</label>
              <input
                required
                value={facilityAddress}
                onChange={(e) => setFacilityAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#063725] mb-1">Langues parlées (séparées par virgule)</label>
              <input
                value={languagesText}
                onChange={(e) => setLanguagesText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#063725] mb-1">Présentation clinique &amp; expérience sportive</label>
              <textarea
                required
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5E2DA] text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-[#475E52] pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={supportsVideo}
                onChange={(e) => setSupportsVideo(e.target.checked)}
                className="rounded border-[#D5E2DA] accent-[#0D6E46]"
              />
              Téléconsultation Visio (WebRTC)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={supportsPhysical}
                onChange={(e) => setSupportsPhysical(e.target.checked)}
                className="rounded border-[#D5E2DA] accent-[#0D6E46]"
              />
              Consultation au cabinet (présentiel)
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-full bg-[#0D6E46] hover:bg-[#095637] text-white text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer ma fiche praticien'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
