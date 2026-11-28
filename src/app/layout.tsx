import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const plusJakarta = localFont({
  src: '../fonts/plus-jakarta-sans-latin.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
  display: 'swap',
});

const dmSans = localFont({
  src: '../fonts/dm-sans-latin.woff2',
  weight: '100 1000',
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  weight: '100 800',
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
