'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Flag, MessageSquarePlus, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';

interface TopicItem {
  id: string;
  category: string;
  title: string;
  body: string;
  isPinned: boolean;
  repliesCount: number;
  lastActivityAt: string;
  createdAt: string;
  authorName: string;
  authorSpecialty: string;
}

interface PostItem {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorSpecialty: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tous les sujets',
  clinical_case_anon: 'Cas cliniques anonymisés',
  protocols: 'Protocoles & recommandations',
  prevention: 'Prévention & reprise',
  specialty: 'Par spécialité',
  platform: 'Vie de la plateforme',
};

export default function DoctorForumPage() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [rule, setRule] = useState('');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<{
    id: string;
    title: string;
    body: string;
    authorName: string;
    createdAt: string;
  } | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [replyBody, setReplyBody] = useState('');

  // New topic state
  const [showCreate, setShowCreate] = useState(false);
  const [newCat, setNewCat] = useState('clinical_case_anon');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const [notVerified, setNotVerified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (q.trim()) params.set('q', q.trim());
      const res = await apiFetch<{ anonymizationRule: string; topics: TopicItem[] }>(
        `/api/doctor/community/forum/topics?${params.toString()}`
      );
      setRule(res.anonymizationRule);
      setTopics(res.topics || []);
      setNotVerified(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accès refusé.';
      if (msg.toLowerCase().includes('vérifié')) {
        setNotVerified(true);
      } else {
        setError(msg);
      }
    }
  }, [category, q]);

  const loadThread = useCallback(async (topicId: string) => {
    const res = await apiFetch<{
      topic: { id: string; title: string; body: string; authorName: string; createdAt: string };
      posts: PostItem[];
    }>(`/api/doctor/community/forum/topics/${topicId}`);
    setActiveTopic(res.topic);
    setPosts(res.posts || []);
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  async function handleCreateTopic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ topic: { id: string } }>('/api/doctor/community/forum/topics', {
        method: 'POST',
        body: { category: newCat, title: newTitle, body: newBody },
      });
      setNewTitle('');
      setNewBody('');
      setShowCreate(false);
      setNotice('Sujet publié sur le forum médical anonymisé.');
      await loadTopics();
      setSelectedId(res.topic.id);
      await loadThread(res.topic.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible.');
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    setError(null);
    try {
      await apiFetch(`/api/doctor/community/forum/topics/${selectedId}`, {
        method: 'POST',
        body: { body: replyBody },
      });
      setReplyBody('');
      await Promise.all([loadThread(selectedId), loadTopics()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Réponse impossible.');
    }
  }

  async function handleReport(targetType: 'topic' | 'post', targetId: string) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/doctor/community/forum/report', {
        method: 'POST',
        body: {
          targetType,
          targetId,
          reason: 'Signalement pour non-respect de l’anonymisation ou modération requise.',
        },
      });
      setNotice('Signalement transmis à l’équipe de modération Terrain+.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signalement impossible.');
    }
  }

  return (
    <AppShell requireAuthRole="doctor">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Communauté réservée aux médecins vérifiés
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Forum médical entre confrères</h1>
          </div>
          {!notVerified && (
            <button
              type="button"
              onClick={() => setShowCreate((s) => !s)}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5"
            >
              <MessageSquarePlus className="w-4 h-4" /> Nouveau sujet
            </button>
          )}
        </div>

        {notVerified ? (
          <div className="p-6 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 space-y-3">
            <h2 className="font-bold text-base">Accès réservé aux praticiens vérifiés</h2>
            <p className="text-sm">
              Le forum médical n’est accessible qu’après validation de vos justificatifs professionnels par l’équipe Terrain+.
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
            {rule && (
              <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{rule}</span>
              </div>
            )}

            {notice && (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-900">{notice}</div>
            )}
            {error && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</div>
            )}

            {showCreate && (
              <form onSubmit={handleCreateTopic} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h2 className="font-bold text-slate-900">Publier un sujet anonymisé</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="clinical_case_anon">Cas clinique anonymisé</option>
                    <option value="protocols">Protocoles médicaux</option>
                    <option value="prevention">Prévention & reprise</option>
                    <option value="specialty">Échange par spécialité</option>
                    <option value="platform">Plateforme Terrain+</option>
                  </select>
                  <input
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Titre explicite (sans identité patient)"
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <textarea
                  required
                  rows={4}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Contexte clinique anonymisé (âge approx., sport, symptômes, question aux confrères)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Publier sur le forum
                </button>
              </form>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    category === k
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher..."
                  className="pl-8 pr-3 py-1.5 rounded-full border border-slate-300 text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-2.5">
                {topics.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
                    Aucun sujet dans cette catégorie.
                  </div>
                ) : (
                  topics.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(t.id);
                        loadThread(t.id);
                      }}
                      className={`w-full text-left p-4 rounded-2xl border transition ${
                        selectedId === t.id
                          ? 'border-emerald-500 bg-emerald-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-semibold text-emerald-700">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                        <span>{t.repliesCount} réponse(s)</span>
                      </div>
                      <p className="font-bold text-sm text-slate-900">{t.title}</p>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-1">{t.body}</p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Par {t.authorName} · {formatDateTimeFr(t.lastActivityAt)}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5">
                {!activeTopic ? (
                  <p className="text-sm text-slate-500 py-10 text-center">
                    Sélectionnez un sujet pour lire les échanges entre confrères et contribuer.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">{activeTopic.title}</h2>
                        <p className="text-xs text-slate-500">
                          Par {activeTopic.authorName} · {formatDateTimeFr(activeTopic.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReport('topic', activeTopic.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1"
                      >
                        <Flag className="w-3.5 h-3.5" /> Signaler
                      </button>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{activeTopic.body}</p>

                    <div className="space-y-2.5 pt-2">
                      {posts.map((p) => (
                        <div key={p.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-900">
                              {p.authorName} {p.authorSpecialty ? `· ${p.authorSpecialty}` : ''}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>{formatDateTimeFr(p.createdAt)}</span>
                              <button
                                type="button"
                                onClick={() => handleReport('post', p.id)}
                                title="Signaler cette réponse"
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{p.body}</p>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleReply} className="pt-3 border-t border-slate-200 space-y-2">
                      <textarea
                        required
                        rows={3}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Partager votre avis confraternel (sans information identifiante patient)..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
                      >
                        Publier la réponse
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
