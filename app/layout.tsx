import type { Metadata, Viewport } from 'next';

// Global stylesheets (previously imported from src/main.jsx / src/App.jsx).
// src/index.css is the real design-token source (dark-first CSS vars + @theme).
import '../src/index.css';
import 'driver.js/dist/driver.css';
import 'nprogress/nprogress.css';

import Providers from './providers';

export const metadata: Metadata = {
  title: 'ConvoyAI',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Anti-FOUC theme script — ported verbatim from index.html <head>.
// Runs before first paint so a light-mode user never flashes the dark default.
const themeInitScript = `(function () {
  try {
    // ConvoyAI is a light-only product; the stored key is kept for compatibility.
    document.documentElement.classList.add('light');
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="cv-grad-brand" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--color-brand-bright)' }} />
              <stop offset="1" style={{ stopColor: 'var(--color-brand)' }} />
            </linearGradient>
            <linearGradient id="cv-grad-ai" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--color-ai)' }} />
              <stop offset="1" style={{ stopColor: 'var(--color-ai-bright)' }} />
            </linearGradient>
          </defs>
        </svg>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
