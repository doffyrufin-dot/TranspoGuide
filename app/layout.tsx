import React, { ReactNode } from 'react';
import '@/assets/styles/global.css';
import 'aos/dist/aos.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import SileoToaster from '@/components/SileoToaster';
import AOSInit from '@/components/AOSInit';

export const metadata = {
  title: 'TranspoGuide',
  description: 'Vehicle Fare and Route Guide',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="bg-dots">
        {/* Upskwela-style side glow orbs */}
        <div className="glow-orb-left" />
        <div className="glow-orb-right" />
        <ThemeProvider>
          <AOSInit />
          <div className="relative z-10">{children}</div>
        </ThemeProvider>
        <SileoToaster />
      </body>
    </html>
  );
};

export default RootLayout;
