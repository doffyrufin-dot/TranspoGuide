import React, { ReactNode } from 'react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '@/assets/styles/global.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import SileoToaster from '@/components/SileoToaster';

const inter = localFont({
  src: [
    {
      path: '../assets/fonts/Arial-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
  ],
  preload: false,
  display: 'optional',
  variable: '--font-inter',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'TranspoGuide',
  description: 'Vehicle Fare and Route Guide',
  icons: {
    icon: [
      { url: '/icons/transpoguide-mark.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
      {
        url: '/icons/icons8-tracking-32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/icons/icons8-tracking-80.png',
        type: 'image/png',
        sizes: '80x80',
      },
    ],
    apple: [
      {
        url: '/icons/icons8-tracking-80.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcut: ['/icon.svg', '/icon.png'],
  },
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} bg-dots`}>
        {/* Upskwela-style side glow orbs */}
        <div className="glow-orb-left" />
        <div className="glow-orb-right" />
        <ThemeProvider>
          <div className="relative z-10">{children}</div>
        </ThemeProvider>
        <SileoToaster />
      </body>
    </html>
  );
};

export default RootLayout;
