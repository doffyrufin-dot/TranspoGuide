'use client';

import { Toaster } from 'sileo';
import 'sileo/styles.css';

export default function SileoToaster() {
  return (
    <Toaster
      position="top-right"
      offset={{ right: 8, top: 8 }}
      options={{
        duration: 4000,
        roundness: 14,
        fill: '#0b1220',
      }}
      theme="system"
    />
  );
}
