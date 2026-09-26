'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * Fades + rises its child into view the first time it scrolls into the viewport (once). `delay` (s) staggers siblings.
 * Used by the shared card frames so every dashboard section enters the same way.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 16,
  className = '',
  as = 'div',
  label,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section';
  /** aria-label of the wrapper (sections). */
  label?: string;
}) {
  const Tag = as === 'section' ? motion.section : motion.div;

  return (
    <Tag
      className={className}
      aria-label={label}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ type: 'spring', stiffness: 170, damping: 24, delay }}
    >
      {children}
    </Tag>
  );
}
