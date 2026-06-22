import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Nav } from '../components/Nav';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Caesar Demos — free search, three ways',
  description:
    'Three free, no-signup demos of Caesar search — verify a claim, research anything with receipts, and watch a topic for what is new. Powered by Caesar search.',
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
