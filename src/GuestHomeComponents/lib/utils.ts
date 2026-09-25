import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
/**
 * Merge Tailwind class names safely, resolving conflicting utility
 * classes (e.g. "p-2 p-4" -> "p-4").
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Icon / badge color classes for a given accent, used by feature-card
 * grids (capabilities, why-choose, industries, etc).
 */
export const accentClasses = {
  cyan: {
    text: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/25',
  },
  blue: {
    text: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    border: 'border-accent-blue/25',
  },
  green: {
    text: 'text-accent-green',
    bg: 'bg-accent-green/10',
    border: 'border-accent-green/25',
  },
  purple: {
    text: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/25',
  },
  yellow: {
    text: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/25',
  },
  red: {
    text: 'text-rose-400',
    bg: 'bg-rose-400/10',
    border: 'border-rose-400/25',
  },
  pink: {
    text: 'text-pink-400',
    bg: 'bg-pink-400/10',
    border: 'border-pink-400/25',
  },
};
