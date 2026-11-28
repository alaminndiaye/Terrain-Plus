'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, MessageCircle, Send } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface Colleague {
  id: string;
  publicName: string;
  city: string;
  facilityName: string;
  specialtyName: string;
}

interface ThreadItem {
  id: string;
  peerDoctorId: string;
  peer: { id: string; publicName: string; specialtyName: string };
  lastMessageAt: string;
}

interface DmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export default function DoctorColleaguesChatPage() {
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [myId, setMyId] = useState('');
  const [text, setText] = useState('');
  const [notVerified, setNotVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    try {
      const [res, sess] = await Promise.all([
        apiFetch<{ threads: ThreadItem[]; colleagues: Colleague[] }>('/api/doctor/community/messages'),
        apiFetch<{ user: { id: string } | null }>('/api/auth/session'),
      ]);
      setThreads(res.threads || []);
      setColleagues(res.colleagues || []);
      setMyId(sess.user?.id || '');
      setNotVerified(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accès refusé.';
      if (msg.toLowerCase().includes('vérifié')) setNotVerified(true);
      else setError(msg);
    }
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    const res = await apiFetch<{ messages: DmMessage[] }>(`/api/doctor/community/messages/${threadId}`);
    setMessages(res.messages || []);
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadThread(activeThreadId).catch(() => {});
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel(`dm-${activeThreadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_dm_messages', filter: `thread_id=eq.${activeThreadId}` },
        () => loadThread(activeThreadId).catch(() => {})
      )
      .subscribe();

    return () => {
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [activeThreadId, loadThread]);

  async function startConversation(peerDoctorId: string) {
    setError(null);
    try {
      const res = await apiFetch<{ thread: { id: string } }>('/api/doctor/community/messages', {
        method: 'POST',
        body: { peerDoctorId },
      });
      await loadDirectory();
      setActiveThreadId(res.thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ouverture discussion impossible.');
    }
  }

  async function sendDm(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThreadId || !text.trim()) return;
    setError(null);
    try {
      await apiFetch(`/api/doctor/community/messages/${activeThreadId}`, {
        method: 'POST',
        body: { body: text },
      });
      setText('');
      await loadThread(activeThreadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  }

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Messagerie privée chiffrée entre confrères vérifiés
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Discussions directes confrères</h1>
        </div>

        {notVerified ? (
          <div className="p-6 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 space-y-3">
            <p className="font-bold">Vérification professionnelle requise</p>
            <p className="text-sm">
              Seuls les médecins vérifiés peuvent échanger directement entre confrères sur Terrain+.
            </p>
            <Link
              href="/medecin/verification"
              className="inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Compléter ma vérification
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                  <h2 className="font-bold text-sm text-slate-900">Discussions actives ({threads.length})</h2>
                  {threads.length === 0 ? (
                    <p className="text-xs text-slate-500">Sélectionnez un confrère ci-dessous pour démarrer.</p>
                  ) : (
                    threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveThreadId(t.id)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                          activeThreadId === t.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <p className="font-semibold text-slate-900">{t.peer.publicName}</p>
                        <p className="text-slate-500">{t.peer.specialtyName}</p>
                      </button>
                    ))
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                  <h2 className="font-bold text-sm text-slate-900">Confrères vérifiés ({colleagues.length})</h2>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {colleagues.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => startConversation(c.id)}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{c.publicName}</p>
                          <p className="text-slate-500">
                            {c.specialtyName} · {c.city}
                          </p>
                        </div>
                        <MessageCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 bg-white flex flex-col min-h-[460px]">
                {!activeThread ? (
                  <p className="text-sm text-slate-500 m-auto">
                    Choisissez un confrère pour échanger de manière confidentielle (orientation, protocole, avis).
                  </p>
                ) : (
                  <>
                    <div className="pb-3 border-b border-slate-200">
                      <h2 className="font-bold text-slate-900">{activeThread.peer.publicName}</h2>
                      <p className="text-xs text-slate-500">{activeThread.peer.specialtyName}</p>
                    </div>

                    <div className="flex-1 py-4 space-y-3 overflow-y-auto max-h-[380px]">
                      {messages.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-8">Aucun message pour l’instant.</p>
                      ) : (
                        messages.map((m) => {
                          const mine = m.senderId === myId;
                          return (
                            <div
                              key={m.id}
                              className={`p-3 rounded-xl text-sm max-w-[85%] ${
                                mine
                                  ? 'ml-auto bg-emerald-50 border border-emerald-200'
                                  : 'mr-auto bg-slate-50 border border-slate-200'
                              }`}
                            >
                              <p className="text-slate-800 whitespace-pre-wrap">{m.body}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{formatDateTimeFr(m.createdAt)}</p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form onSubmit={sendDm} className="pt-3 border-t border-slate-200 flex gap-2">
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Écrire au confrère (ne mentionnez jamais l'identité complète d'un patient sans nécessité de transfert)..."
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5"
                      >
                        <Send className="w-4 h-4" /> Envoyer
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
