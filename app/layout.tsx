import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Nav } from '../components/Nav';
import { ogImageUrl } from '../lib/og';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' });

const TITLE = 'Caesar Demos: live search, four ways';
const DESCRIPTION =
  'Four free, no-signup demos of Caesar search: verify a claim, research anything with receipts, watch a topic for what is new, and find a product to buy it. Powered by Caesar search.';
const HUB_OG_IMAGE = ogImageUrl('hub');

export const metadata: Metadata = {
  metadataBase: new URL('https://caesar-demo.fly.dev'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    siteName: 'Caesar Demos',
    type: 'website',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: HUB_OG_IMAGE, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [HUB_OG_IMAGE],
  },
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-canvas font-body text-ink antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
