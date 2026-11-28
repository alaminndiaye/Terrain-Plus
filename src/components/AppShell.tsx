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
  Menu,
  MessageSquare,
  Search,
  Shield,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
  Wallet,
  X,
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
  fullBleedMain = false,
}: {
  children: React.ReactNode;
  requireAuthRole?: UserRole;
  fullBleedMain?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const isPortalRoute =
    Boolean(requireAuthRole) ||
    pathname.startsWith('/sportif') ||
    pathname.startsWith('/medecin/') ||
    pathname === '/medecin' ||
    pathname.startsWith('/admin');

  const navItems =
    user?.role === 'athlete'
      ? [
          { href: '/sportif', label: 'Tableau', icon: Home },
          { href: '/medecins', label: 'Médecins', icon: Search },
          { href: '/sportif/dossiers', label: 'Consultations', icon: FolderHeart },
          { href: '/sportif/suivi', label: 'Suivi & Prévention', icon: Activity },
          { href: '/sportif/profil', label: 'Profil', icon: User },
        ]
      : user?.role === 'doctor'
      ? [
          { href: '/medecin', label: 'Mes dossiers', icon: Stethoscope },
          { href: '/medecin/agenda', label: 'Agenda', icon: Calendar },
          { href: '/medecin/forum', label: 'Forum confrères', icon: Users },
          { href: '/medecin/confreres', label: 'Messagerie directe', icon: MessageSquare },
          { href: '/medecin/revenus', label: 'Revenus', icon: Wallet },
          { href: '/medecin/verification', label: 'Vérification 72h', icon: ShieldCheck },
        ]
      : user?.role === 'admin'
      ? [
          { href: '/admin', label: 'Administration', icon: BarChartIconFallback },
          { href: '/medecins', label: 'Annuaire public', icon: Search },
        ]
      : [
          { href: '/', label: 'Accueil', icon: Home },
          { href: '/medecins', label: 'Spécialités & Médecins', icon: Search },
          { href: '/prevention', label: 'Prévention', icon: Activity },
          { href: '/urgence', label: 'Urgences', icon: Shield },
        ];

  const portalSubtitle =
    user?.role === 'athlete'
      ? 'Espace Sportif · 18+'
      : user?.role === 'doctor'
      ? session?.doctorVerificationStatus === 'verified'
        ? 'Espace Médecin · Vérifié'
        : 'Espace Médecin · Vérification'
      : user?.role === 'admin'
      ? 'Administration & Gouvernance'
      : 'Terrain+ Santé Sportive';

  const portalHomeHref =
    user?.role === 'athlete'
      ? '/sportif'
      : user?.role === 'doctor'
      ? '/medecin'
      : user?.role === 'admin'
      ? '/admin'
      : '/';

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
    setSession({
      authenticated: false,
      user: null,
      doctorVerificationStatus: null,
      demoMode: Boolean(session?.demoMode),
    });
    router.push('/');
    router.refresh();
  }

  const notifPopover = notifOpen ? (
    <div className="w-80 bg-white text-[#063725] rounded-2xl shadow-lg border border-[#D5E2DA] p-3.5 z-50">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#E2EBE5]">
        <span className="font-bold text-xs uppercase tracking-wider text-[#063725]">Notifications (neutres)</span>
        <button
          type="button"
          onClick={() => setNotifOpen(false)}
          className="text-xs text-[#5B7064] hover:text-[#063725]"
        >
          Fermer
        </button>
      </div>
      {notifications.length === 0 ? (
        <p className="text-xs text-[#5B7064] py-2">Aucune notification récente.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {notifications.map((n) => (
            <li key={n.id} className="text-xs border-b border-[#E2EBE5] pb-2 last:border-b-0">
              <p className="font-semibold text-[#063725]">{n.title}</p>
              <p className="text-[#475E52]">{n.body}</p>
              <span className="text-[11px] text-[#5B7064]">{formatDateTimeFr(n.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  // Detached Left Sidebar Layout for Authenticated Workspaces (Athlete / Doctor / Admin) matching 9e714be
  if (isPortalRoute) {
    return (
      <div className="min-h-screen obsidian-ambient text-[#063725] flex flex-col md:flex-row pb-16 md:pb-0">
        {/* Desktop & Tablet Detached Sidebar */}
        <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-[#D5E2DA] bg-white">
          <div className="p-5 border-b border-[#E2EBE5]">
            <Link href="/" className="inline-flex items-center">
              <img
                src="/brand/terrain-logo.png"
                alt="Terrain+"
                className="h-9 w-auto max-w-[165px] object-contain shrink-0"
              />
            </Link>
            <div className="mt-2.5 text-xs font-semibold text-[#0D6E46]">{portalSubtitle}</div>
            {user && (
              <div className="mt-0.5 font-mono text-[11px] font-medium text-[#5B7064] truncate">
                {user.fullName} · {user.city || 'Sénégal'}
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== '/' &&
                  item.href !== '/sportif' &&
                  item.href !== '/medecin' &&
                  pathname.startsWith(item.href + '/'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm min-h-[44px] transition-colors ${
                    active
                      ? 'bg-[#0D6E46] text-white font-bold shadow-[0_6px_18px_rgba(13,110,70,0.20)]'
                      : 'font-medium text-[#3D5246] hover:bg-[#ECF7F1] hover:text-[#063725]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#E2EBE5] space-y-2.5">
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={openNotifications}
                  className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] px-3 py-2 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[40px]"
                >
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#0D6E46]" />
                    <span>Notifications</span>
                  </span>
                </button>
                {notifPopover && <div className="fixed left-64 bottom-16 ml-2 z-50">{notifPopover}</div>}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#C3D6CA] bg-white px-3 py-2 text-xs font-semibold text-[#3D5246] hover:bg-[#F1F6F3] hover:text-[#063725] min-h-[40px] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {/* Main Column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {session?.demoMode && (
            <div className="bg-[#063725] text-[#FBBF24] text-xs px-4 py-1.5 flex items-center justify-between">
              <span>Terrain+ · Mode démonstration (OTP SMS &amp; paiement 10 000 FCFA sandbox) · 18+</span>
              <span className="hidden sm:inline font-semibold text-white">Sénégal</span>
            </div>
          )}

          {/* Mobile Header + Hamburger Drawer */}
          <header className="md:hidden sticky top-0 z-30 border-b border-[#D5E2DA] bg-white">
            <div className="flex items-center justify-between gap-3 px-4 h-[56px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  aria-label="Menu"
                  className="p-2 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3] min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                >
                  {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
                <Link href="/" className="shrink-0">
                  <img src="/brand/terrain-logo.png" alt="Terrain+" className="h-7 w-auto object-contain" />
                </Link>
                <span className="text-xs font-semibold text-[#0D6E46] truncate">· {user?.firstName || 'Espace'}</span>
              </div>
              <div className="flex items-center gap-1.5 relative">
                {user && (
                  <button
                    type="button"
                    onClick={openNotifications}
                    aria-label="Notifications"
                    className="p-2 rounded-xl border border-[#D5E2DA] bg-[#F1F6F3] text-[#063725]"
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                )}
                {notifPopover && <div className="absolute right-0 top-12 z-50">{notifPopover}</div>}
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Déconnexion"
                  className="p-2 text-[#3D5246] hover:text-[#063725]"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>

            {mobileMenuOpen && (
              <nav className="border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                        active ? 'bg-[#0D6E46] text-white font-bold' : 'text-[#3D5246] hover:bg-[#ECF7F1]'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </header>

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">{children}</main>

          <footer className="hidden md:flex border-t border-[#D5E2DA] bg-white px-6 py-4 flex-wrap items-center justify-between gap-3 text-xs text-[#5B7064]">
            <span>
              <strong className="text-[#063725]">terrainplus.sn</strong> · Suivi médical sportif régulier (18+ uniquement)
            </span>
            <div className="flex items-center gap-4 font-medium">
              <Link href="/prevention" className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4">
                Prévention
              </Link>
              <Link href="/urgence" className="text-red-700 hover:underline font-semibold">
                Consignes Urgences
              </Link>
            </div>
          </footer>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#D5E2DA] flex justify-around py-1.5">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] ${
                  active ? 'text-[#0D6E46] font-bold' : 'text-[#5B7064] font-medium'
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

  // Public Top Bar Layout matching 9e714be:PublicLanding
  return (
    <div className="min-h-screen obsidian-ambient text-[#063725] flex flex-col pb-16 md:pb-0">
      {session?.demoMode && (
        <div className="bg-[#063725] text-[#FBBF24] text-xs px-4 py-1.5 flex items-center justify-between">
          <span>Terrain+ · Mode démonstration (paiements 10 000 FCFA et OTP SMS sandbox) · 18+ uniquement</span>
          <span className="hidden sm:inline font-semibold text-white">Sénégal</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white text-[#063725] border-b border-[#D5E2DA]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Terrain+ Accueil">
            <img src="/brand/terrain-logo.png" alt="Terrain+" className="h-8 sm:h-9 w-auto object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#3D5246]">
            <Link
              href="/"
              className={`hover:text-[#063725] transition-colors whitespace-nowrap ${
                pathname === '/' ? 'text-[#0D6E46] font-bold' : ''
              }`}
            >
              Accueil
            </Link>
            <Link
              href="/medecins"
              className={`hover:text-[#063725] transition-colors whitespace-nowrap ${
                pathname.startsWith('/medecins') ? 'text-[#0D6E46] font-bold' : ''
              }`}
            >
              Spécialités &amp; Médecins
            </Link>
            <Link
              href="/prevention"
              className={`hover:text-[#063725] transition-colors whitespace-nowrap ${
                pathname.startsWith('/prevention') ? 'text-[#0D6E46] font-bold' : ''
              }`}
            >
              Prévention
            </Link>
            <Link
              href="/urgence"
              className={`hover:text-red-700 transition-colors whitespace-nowrap ${
                pathname.startsWith('/urgence') ? 'text-red-700 font-bold' : ''
              }`}
            >
              Urgences
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={openNotifications}
                    aria-label="Notifications"
                    className="p-2 rounded-full bg-[#F1F6F3] hover:bg-[#E2EBE5] border border-[#D5E2DA] text-[#063725] transition"
                  >
                    <Bell className="w-4 h-4" />
                  </button>
                  {notifPopover && <div className="absolute right-0 mt-2 z-50">{notifPopover}</div>}
                </div>
                <Link
                  href={portalHomeHref}
                  className="rounded-full bg-[#0D6E46] px-4 py-2 text-xs font-bold text-white hover:bg-[#095637] transition whitespace-nowrap"
                >
                  Mon espace ({user.firstName})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Déconnexion"
                  className="rounded-full border border-[#C3D6CA] bg-white p-2 text-[#3D5246] hover:bg-[#F1F6F3]"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth?tab=login"
                  className="rounded-full border border-[#C3D6CA] bg-white px-4 py-2 text-xs font-semibold text-[#063725] hover:bg-[#F1F6F3] transition min-h-[38px] inline-flex items-center"
                >
                  Se connecter
                </Link>
                <Link
                  href="/auth?tab=register"
                  className="rounded-full bg-[#0D6E46] px-4 sm:px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] transition min-h-[38px] inline-flex items-center shadow-sm"
                >
                  S’inscrire
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={fullBleedMain ? 'flex-1 w-full' : 'flex-1 max-w-6xl w-full mx-auto px-4 py-6'}>
        {children}
      </main>

      <footer className="border-t border-[#D5E2DA] bg-white py-7">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#475E52]">
            <div className="flex flex-wrap items-center gap-3">
              <img src="/brand/terrain-logo.png" alt="Terrain+" className="h-7 w-auto object-contain shrink-0" />
              <span>Suivi médical sportif régulier · Adultes 18+ uniquement · Sénégal</span>
            </div>
            <span className="font-mono text-[#0D6E46] font-semibold">terrainplus.sn</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-[#E2EBE5] pt-4 text-xs">
            <div className="flex flex-wrap gap-4">
              <Link href="/medecins" className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4">
                Annuaire des médecins vérifiés
              </Link>
              <Link href="/prevention" className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4">
                Bibliothèque Prévention
              </Link>
              <Link href="/urgence" className="text-red-700 hover:underline font-semibold">
                Consignes Urgences
              </Link>
            </div>
            <span className="text-[#5B7064]">Ne génère aucun diagnostic automatisé ni avis d’aptitude.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BarChartIconFallback({ className }: { className?: string }) {
  return <Shield className={className} />;
}
