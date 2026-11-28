'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';

interface SlotItem {
  id: string;
  slot_mode: 'video' | 'physical' | 'both';
  starts_at: string;
  ends_at: string;
  location_label: string;
  status: string;
}

interface AppointmentItem {
  id: string;
  case_id: string;
  appointment_type: 'video' | 'physical';
  proposal_status: string;
  starts_at: string;
  location_label: string;
}

export default function DoctorAgendaPage() {
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 86400 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [durationMinutes, setDurationMinutes] = useState<30 | 45 | 60>(30);
  const [slotMode, setSlotMode] = useState<'video' | 'physical' | 'both'>('both');
  const [locationLabel, setLocationLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      apiFetch<{ slots: SlotItem[] }>('/api/doctor/slots'),
      apiFetch<{ appointments: AppointmentItem[] }>('/api/doctor/workspace'),
    ]);
    setSlots(s.slots || []);
    setAppointments(w.appointments || []);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement agenda.'));
  }, [load]);

  async function handlePublishSlots(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ createdCount: number }>('/api/doctor/slots', {
        method: 'POST',
        body: { date, startTime, endTime, durationMinutes, slotMode, locationLabel },
      });
      setNotice(`${res.createdCount} créneau(x) publié(s) dans votre agenda.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer les créneaux.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSlot(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/doctor/slots?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda & Créneaux de consultation</h1>
          <p className="text-sm text-slate-600">
            Publiez vos plages disponibles pour guider les demandes des sportifs (Visio et/ou Cabinet).
          </p>
        </div>

        {notice && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-900">{notice}</div>
        )}
        {error && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
        )}

        <form onSubmit={handlePublishSlots} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-700" /> Générer des créneaux sur une plage horaire
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Début</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fin</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Durée</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) as 30 | 45 | 60)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
              <select
                value={slotMode}
                onChange={(e) => setSlotMode(e.target.value as 'video' | 'physical' | 'both')}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="both">Visio ou Cabinet</option>
                <option value="video">Visio uniquement</option>
                <option value="physical">Cabinet uniquement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lieu (optionnel)</label>
              <input
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Cabinet / Visio"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? 'Publication...' : 'Publier les créneaux'}
          </button>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" /> Créneaux publiés ({slots.length})
            </h2>
            {slots.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun créneau publié.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {slots.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{formatDateTimeFr(s.starts_at)}</p>
                      <p className="text-slate-600">
                        Format : {s.slot_mode === 'both' ? 'Visio & Cabinet' : s.slot_mode} · {s.location_label || 'Selon dossier'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          s.status === 'available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {s.status}
                      </span>
                      {s.status === 'available' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(s.id)}
                          title="Supprimer ce créneau"
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
            <h2 className="font-bold text-slate-900">Rendez-vous associés aux dossiers ({appointments.length})</h2>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun rendez-vous proposé ou confirmé.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {appointments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/medecin/dossiers/${a.case_id}`}
                    className="block p-3 rounded-xl border border-slate-200 hover:border-emerald-300 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>{a.appointment_type === 'video' ? 'Téléconsultation Visio' : 'Consultation Cabinet'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100">{a.proposal_status}</span>
                    </div>
                    <p className="text-slate-600">{formatDateTimeFr(a.starts_at)}</p>
                    <p className="text-slate-500">{a.location_label}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
