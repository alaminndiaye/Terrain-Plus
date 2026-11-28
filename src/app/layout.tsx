import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Terrain+ · Suivi médical & prévention sportive',
  description:
    'Mise en relation entre sportifs majeurs (18+) et médecins vérifiés avec suivi médical régulier, visio, partage sécurisé et suivi & prévention.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/pwa-192x192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#063725',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className={`${dmSans.className} min-h-screen antialiased bg-[#f6f8f5] text-[#063725]`}>
        {children}
      </body>
    </html>
  );
}
