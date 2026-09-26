'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

const OPS = '/fleet-management/operations';
const AN = '/fleet-management/analytics';

/** `g` then a letter jumps to a screen (like the tools power users already know). */
const GO: { key: string; label: string; href: string }[] = [
  { key: 'o', label: 'Overview', href: `${OPS}/overview` },
  { key: 'm', label: 'Live map', href: `${OPS}/map` },
  { key: 'v', label: 'Vehicles', href: `${OPS}/vehicles` },
  { key: 'd', label: 'Drivers', href: `${OPS}/drivers` },
  { key: 't', label: 'Trips', href: `${OPS}/trips` },
  { key: 'y', label: 'Yards', href: `${OPS}/yards` },
  { key: 'f', label: 'Geofences', href: `${OPS}/geofences` },
  { key: 'i', label: 'Incidents', href: `${OPS}/incidents` },
  { key: 'a', label: 'Analytics', href: `${AN}/utilisation` },
  { key: 'p', label: 'Products & devices', href: '/manage-product' },
  { key: 'r', label: 'Roles & permissions', href: '/roles-permission' },
  { key: 's', label: 'Fleet settings', href: '/fleet-management/settings' },
  { key: 'c', label: 'AI workspace', href: '/ai' },
];

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;

  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

/** Global shortcuts: `?` opens this sheet, `g` + letter navigates. ⌘K / Ctrl+K is handled by the palette. */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape' && open) {
        setOpen(false);

        return;
      }

      if (
        isTyping(e.target) ||
        document.querySelector('[role=dialog]:not([aria-label="Keyboard shortcuts"]),[cmdk-root]')
      )
        return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setOpen(v => !v);

        return;
      }

      if (pendingG.current) {
        clearTimeout(pendingG.current);
        pendingG.current = null;

        const hit = GO.find(g => g.key === e.key.toLowerCase());

        if (hit) {
          e.preventDefault();
          router.push(hit.href);
        }

        return;
      }

      if (e.key.toLowerCase() === 'g') {
        pendingG.current = setTimeout(() => (pendingG.current = null), 1200);
      }
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-0/30 px-4 backdrop-blur-sm"
      onMouseDown={e => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="glass-modal w-full max-w-xl p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="eyebrow">Keyboard</div>
            <h2 className="card-title mt-0.5">Shortcuts</h2>
          </div>
          <button
            type="button"
            aria-label="Close shortcuts"
            onClick={() => setOpen(false)}
            className="grid size-8 place-items-center rounded-full border border-line bg-white text-ink-1"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mb-4 space-y-2 text-sm">
          {[
            ['⌘ K  /  Ctrl K', 'Search screens and records, ask the copilot'],
            ['?', 'Show or hide this sheet'],
            ['Esc', 'Close a dialog, menu or panel'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <span className="text-ink-1">{d}</span>
              <kbd className="status-bar__kbd whitespace-nowrap">{k}</kbd>
            </div>
          ))}
        </div>

        <div className="eyebrow mb-2">Go to (press G, then…)</div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {GO.map(g => (
            <div key={g.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-0">{g.label}</span>
              <span className="flex items-center gap-1">
                <kbd className="status-bar__kbd">G</kbd>
                <kbd className="status-bar__kbd uppercase">{g.key}</kbd>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
