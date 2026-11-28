'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';

export default function AthleteProfilePage() {
  const [account, setAccount] = useState<Record<string, string>>({});
  const [weeklyFrequency, setWeeklyFrequency] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [consents, setConsents] = useState<Array<{ id: string; consent_type: string; decision: string; created_at: string }>>([]);
  const [reqType, setReqType] = useState<'access' | 'correction' | 'deletion'>('access');
  const [reqNote, setReqNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ account: Record<string, string>; profile: { weeklyFrequency: string } | null }>('/api/athlete/profile'),
      apiFetch<{ consents: Array<{ id: string; consent_type: string; decision: string; created_at: string }> }>('/api/account/privacy'),
    ])
      .then(([pRes, privRes]) => {
        setAccount(pRes.account || {});
        setAddress(pRes.account?.address || '');
        setCity(pRes.account?.city || '');
        setWeeklyFrequency(pRes.profile?.weeklyFrequency || '');
        setConsents(privRes.consents || []);
      })
      .catch(() => {});
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/api/athlete/profile', {
      method: 'PUT',
      body: { address, city, weeklyFrequency },
    });
    setMsg('Profil mis à jour.');
  }

  async function sendDataRequest(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch<{ notice: string }>('/api/account/privacy', {
      method: 'POST',
      body: { requestType: reqType, note: reqNote },
    });
    setMsg(res.notice);
    setReqNote('');
  }

  return (
    <AppShell requireAuthRole="athlete">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Mon profil &amp; confidentialité</h1>
        {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-sm">{msg}</div>}

        <form onSubmit={saveProfile} className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
          <h2 className="font-bold text-lg">Coordonnées personnelles</h2>
          <p className="text-xs text-slate-600">
            {account.firstName} {account.lastName} · {account.phone}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Adresse</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Ville</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Fréquence d’entraînement</label>
            <input value={weeklyFrequency} onChange={(e) => setWeeklyFrequency(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0a2e1c] text-white text-sm font-bold">
            Enregistrer
          </button>
        </form>

        <section className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
          <h2 className="font-bold text-lg">Consentements enregistrés ({consents.length})</h2>
          <ul className="space-y-1 text-xs text-slate-600">
            {consents.slice(0, 8).map((c) => (
              <li key={c.id}>
                • {c.consent_type} : <strong>{c.decision}</strong> ({formatDateTimeFr(c.created_at)})
              </li>
            ))}
          </ul>

          <form onSubmit={sendDataRequest} className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="font-bold text-sm">Exercer mes droits (Accès, Correction, Suppression)</h3>
            <select
              value={reqType}
              onChange={(e) => setReqType(e.target.value as typeof reqType)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="access">Accès à mes données</option>
              <option value="correction">Correction</option>
              <option value="deletion">Suppression / Fermeture</option>
            </select>
            <textarea
              required
              minLength={5}
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Précisez votre demande..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold">
              Envoyer ma demande
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
