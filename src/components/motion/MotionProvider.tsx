'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

/**
 * App-wide motion settings (T-006 B1): every `motion.*` element honours the operator's `prefers-reduced-motion`
 * (transform animations are dropped, opacity fades stay) and shares one spring character.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
    >
      {children}
    </MotionConfig>
  );
}
