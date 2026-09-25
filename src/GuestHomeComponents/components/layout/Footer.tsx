// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { footerColumns } from '../../data/footer';
import convoyaiLogo from '../../assets/convoyainew.png';

export function Footer() {
  return (
    <footer className="bg-[#030712]">
      <div className="w-full px-4 py-8 sm:px-6 sm:py-12 md:py-16 lg:px-8">
        <div className="grid gap-8 sm:gap-10 md:gap-12 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Logo + description — mobile pe short tagline, desktop pe full description */}
          <div>
            <img src={convoyaiLogo} alt="ConvoyAI" className="h-10 w-auto" />

            {/* Mobile: short one-liner */}
            <p className="mt-4 text-sm leading-relaxed text-ink-1 sm:hidden">
              The Enterprise Digital Twin Platform for Smart Buildings &amp; Cities.
            </p>

            {/* Desktop/tablet: full description */}
            <p className="mt-4 hidden max-w-xs text-sm leading-relaxed text-ink-1 sm:block">
              The Enterprise Digital Twin Platform for Smart Buildings, Cities &amp; Infrastructure.
              Unifying IoT, AI, GIS, and operations into one intelligence layer.
            </p>
          </div>

          {/* Columns — mobile pe hidden, sm aur upar se visible */}
          {footerColumns.map(column => (
            <div key={column.title} className="hidden sm:block">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.15em] text-ink-0">
                {column.title}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map(link => (
                  <li key={link.label}>
                    <a href="#" className="text-sm text-ink-1 transition-colors hover:text-ink-0">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-line-soft pt-6">
          <p className="text-xs text-ink-2">© 2026 ConvoyAI Inc. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
