'use client';

import { useEffect } from 'react';

export default function AOSInit() {
  useEffect(() => {
    let active = true;
    (async () => {
      const mod = await import('aos');
      if (!active) return;
      mod.default.init({
        duration: 700,
        easing: 'ease-out-quad',
        once: true,
        offset: 60,
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}

