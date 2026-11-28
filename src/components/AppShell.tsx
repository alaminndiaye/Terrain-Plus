'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  Calendar,
  FolderHeart,
  Home,
  LogOut,
  MessageSquare,
  Search,
  Shield,
  Stethoscope,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatDateTimeFr } from '@/lib/apiClient';
import type { UserRole, VerificationStatus } from '@/lib/types';

export interface SessionUser {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  birthDate: string | null;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
}

interface SessionData {
  authenticated: boolean;
  user: SessionUser | null;
  doctorVerificationStatus: VerificationStatus | null;
  demoMode: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export function AppShell({
  children,
  requireAuthRole,
}: {
  children: React.ReactNode;
  requireAuthRole?: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    apiFetch<SessionData>('/api/auth/session')
      .then((res) => {
        setSession(res);
        if (res.authenticated && res.user) {
          if (!res.user.phoneVerified && pathname !== '/auth') {
            router.replace('/auth?step=otp');
            return;
          }
          if (
            res.user.role === 'athlete' &&
            res.user.phoneVerified &&
            !res.user.onboardingCompleted &&
            pathname !== '/sportif/onboarding'
          ) {
            router.replace('/sportif/onboarding');
            return;
          }
          if (requireAuthRole && res.user.role !== requireAuthRole) {
            router.replace('/');
          }
        } else if (requireAuthRole) {
          router.replace('/auth');
        }
      })
      .catch(() => {
        if (requireAuthRole) router.replace('/auth');
      });
  }, [pathname, requireAuthRole, router]);

  const user = session?.user;

  const navItems =
    user?.role === 'athlete'
      ? [
          { href: '/sportif', label: 'Accueil', icon: Home },
          { href: '/medecins', label: 'Médecins', icon: Search },
          { href: '/sportif/dossiers', label: 'Consultations', icon: FolderHeart },
          { href: '/sportif/suivi', label: 'Suivi & Prévention', icon: Activity },
          { href: '/sportif/profil', label: 'Profil', icon: User },
        ]
      : user?.role === 'doctor'
      ? [
          { href: '/medecin', label: 'Tableau de bord', icon: Stethoscope },
          { href: '/medecin/agenda', label: 'Agenda', icon: Calendar },
          { href: '/medecin/forum', label: 'Forum', icon: Users },
          { href: '/medecin/confreres', label: 'Confrères', icon: MessageSquare },
          { href: '/medecin/revenus', label: 'Revenus', icon: Wallet },
        ]
      : user?.role === 'admin'
      ? [
          { href: '/admin', label: 'Administration', icon: Shield },
          { href: '/medecins', label: 'Annuaire public', icon: Search },
        ]
      : [
          { href: '/', label: 'Accueil', icon: Home },
          { href: '/medecins', label: 'Spécialités & Médecins', icon: Search },
          { href: '/prevention', label: 'Prévention', icon: Activity },
          { href: '/urgence', label: 'Urgences', icon: Shield },
        ];

  async function openNotifications() {
    setNotifOpen((prev) => !prev);
    if (!notifOpen && user?.phoneVerified) {
      try {
        const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/account/privacy');
        setNotifications(res.notifications || []);
      } catch {
        setNotifications([]);
      }
    }
  }

  async function handleLogout() {
    await apiFetch('/api/auth/session', { method: 'POST', body: {} });
    setSession({ authenticated: false, user: null, doctorVerificationStatus: null, demoMode: Boolean(session?.demoMode) });
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      {session?.demoMode && (
        <div className="bg-[#081f13] text-[#d9f99d] text-xs px-4 py-1.5 flex items-center justify-between border-b border-[#184a31]">
          <span>Terrain+ · Mode démonstration (paiements 10 000 FCFA et OTP SMS sandbox) · 18+ uniquement</span>
          <span className="hidden sm:inline font-semibold">Sénégal</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-[#0d3320] text-white border-b border-[#184a31]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src="/brand/terrain-mark-light.png"
              alt="Terrain+"
              className="h-9 w-9 rounded-lg object-contain bg-[#14452c] border border-[#23543a] p-1"
            />
            <span className="font-bold text-lg tracking-tight">
              Terrain<span className="text-[#c8f62d]">+</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active ? 'bg-[#184a31] text-[#c8f62d]' : 'text-stone-200 hover:bg-[#14452c]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={openNotifications}
                    aria-label="Notifications"
                    className="p-2 rounded-lg bg-[#14452c] hover:bg-[#1b5739] border border-[#23543a] transition"
                  >
                    <Bell className="w-4 h-4" />
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white text-[#112118] rounded-xl shadow-sm border border-[#dcdfd6] p-3 z-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">Notifications (neutres)</span>
                        <button
                          type="button"
                          onClick={() => setNotifOpen(false)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >
                          Fermer
                        </button>
                      </div>
                      {notifications.length === 0 ? (
                        <p className="text-xs text-slate-500">Aucune notification récente.</p>
                      ) : (
                        <ul className="space-y-2 max-h-64 overflow-y-auto">
                          {notifications.map((n) => (
                            <li key={n.id} className="text-xs border-b border-slate-100 pb-2">
                              <p className="font-semibold">{n.title}</p>
                              <p className="text-slate-600">{n.body}</p>
                              <span className="text-[11px] text-slate-400">{formatDateTimeFr(n.created_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <span className="hidden sm:inline text-xs text-emerald-100 bg-white/10 px-2.5 py-1 rounded-full">
                  {user.firstName}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-xs font-semibold bg-[#c8f62d] text-[#0a2e1c] px-3 py-1.5 rounded-lg hover:brightness-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Déconnexion</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth?tab=login"
                  className="text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:bg-white/10"
                >
                  Se connecter
                </Link>
                <Link
                  href="/auth?tab=register"
                  className="text-sm font-semibold bg-[#c8f62d] text-[#0a2e1c] px-3.5 py-1.5 rounded-lg hover:brightness-95"
                >
                  S’inscrire
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>

      <footer className="hidden md:block bg-white border-t border-slate-200 py-5 text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <p>
            <strong>Terrain+</strong> — Plateforme de mise en relation et suivi médical sportif régulier (18+ uniquement,
            Sénégal). Ne génère aucun diagnostic automatisé ni avis d’aptitude.
          </p>
          <div className="flex items-center gap-4 font-medium">
            <Link href="/prevention" className="hover:text-[#0a2e1c]">
              Bibliothèque Prévention
            </Link>
            <Link href="/urgence" className="text-red-700 hover:underline">
              Consignes Urgences
            </Link>
          </div>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex justify-around py-1.5">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${
                active ? 'text-[#0a2e1c] font-bold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[68px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
