'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sileo';
import 'sileo/styles.css';

export default function SileoToaster() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => {
      query.removeEventListener('change', sync);
    };
  }, []);

  return (
    <Toaster
      position={isMobile ? 'top-center' : 'top-right'}
      offset={isMobile ? { top: 10 } : { right: 8, top: 8 }}
      options={{
        duration: 4000,
        roundness: 14,
        fill: '#0b1220',
      }}
      theme="system"
    />
  );
}
