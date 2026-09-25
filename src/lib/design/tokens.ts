/**
 * Runtime access to the design tokens declared in src/styles/tokens.css, for code that needs real colour
 * strings (Leaflet path options, ApexCharts, canvas, inline SVG attributes). Prefer Tailwind utilities /
 * semantic classes in JSX; use this only when a CSS class cannot be applied.
 */
const FALLBACKS: Record<string, string> = {
  '--color-brand': '#e8590c',
  '--color-success': '#2e9e5b',
  '--color-gold': '#f5b700',
  '--color-chart-neutral': '#9aa7a4',
  '--color-surface-3': '#eee3d4',
  '--color-ink-0': '#0e1b1a',
  '--color-surface-1': '#ffffff',
  '--color-danger': '#e0523f',
  '--color-line': '#e8dccb',
  '--color-ink-2': '#667572',
  '--color-brand-bright': '#ff7a1a',
  '--color-ai': '#5b5be6',
};

export function token(name: string, fallback?: string): string {
  const fb = fallback ?? FALLBACKS[name] ?? '';

  if (typeof window === 'undefined') return fb;

  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  return v || fb;
}
