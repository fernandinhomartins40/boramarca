import type { Metadata, Viewport } from 'next';
import { brand } from '@boramarca/shared/theme';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

const brandFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
});

// favicon.ico, icon.png, apple-icon.png and opengraph-image.png in this folder come from the kit.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Bora Marca — Você atende. Seu tempo volta.', template: '%s · Bora Marca' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: SITE_NAME,
    title: 'Bora Marca — Você atende. Seu tempo volta.',
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
  // Panel added to the home screen opens full screen, like an app (manifest.ts).
  appleWebApp: { capable: true, title: 'Bora Marca', statusBarStyle: 'default' },
};

// viewport-fit=cover: the panel's bottom bar pads itself with env(safe-area-inset-bottom).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brand.neutro },
    { media: '(prefers-color-scheme: dark)', color: brand.grafite },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={brandFont.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
