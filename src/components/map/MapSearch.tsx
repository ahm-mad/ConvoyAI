'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Warehouse, X } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useViewportList } from '@hooks/useViewportList';
import { isShowcase } from '@utils/showcase';
import { vehicleFromPosition, type LiveVehicle } from './vehicle/vehicleKinds';

type Hit =
  | {
      kind: 'vehicle';
      key: string;
      title: string;
      sub: string;
      state: LiveVehicle['state'];
      v: LiveVehicle;
    }
  | { kind: 'yard'; key: string; title: string; sub: string; y: any };

const STATE_DOT: Record<LiveVehicle['state'], string> = {
  moving: 'bg-moving',
  idle: 'bg-gold',
  parked: 'bg-chart-neutral',
  offline: 'bg-ink-2',
};

const norm = (s: unknown) => String(s ?? '').toLowerCase();

/**
 * "Find a vehicle or yard" box for the big map: searches the whole fleet (not just what is in view), keyboard
 * friendly (/ focuses it, arrows + Enter pick, Esc closes) and hands the pick back so the screen can fly there.
 */
export default function MapSearch({
  onPickVehicle,
  onPickYard,
  className = '',
}: {
  onPickVehicle: (v: LiveVehicle) => void;
  onPickYard: (y: any) => void;
  className?: string;
}) {
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [wanted, setWanted] = useState(false);

  // Data is only fetched once the box has been used.
  const positions = useSimpleQuery<any>(
    'fleet-positions-search',
    '/api/fleet/positions',
    { limit: 500 },
    { enabled: wanted, refetchInterval: isShowcase() ? 4000 : 60000 }
  );
  const yards = useViewportList('fleet-yards-search', '/api/yards', {}, wanted, 3);

  const hits: Hit[] = useMemo(() => {
    const needle = norm(q).trim();
    const vs = (positions.data?.success ? positions.data.data : [])
      .map(vehicleFromPosition)
      .filter(Boolean) as LiveVehicle[];
    const vehicleHits: Hit[] = vs
      .filter(v => !needle || [v.name, v.plate, v.category].some(f => norm(f).includes(needle)))
      .slice(0, needle ? 8 : 5)
      .map(v => ({
        kind: 'vehicle',
        key: `v${v.id}`,
        title: v.name,
        sub: [v.category, v.plate, v.state].filter(Boolean).join(' · '),
        state: v.state,
        v,
      }));
    const yardHits: Hit[] = yards.items
      .filter(y => Number.isFinite(Number(y.latitude)))
      .filter(y => !needle || [y.name, y.city, y.address].some(f => norm(f).includes(needle)))
      .slice(0, needle ? 5 : 3)
      .map(y => ({
        kind: 'yard',
        key: `y${y.id}`,
        title: y.name,
        sub: [y.city, y.address].filter(Boolean).join(' · ') || 'Yard',
        y,
      }));

    return [...vehicleHits, ...yardHits];
  }, [q, positions.data, yards.items]);

  // "/" focuses the box from anywhere on the page (unless the user is typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;

      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

      e.preventDefault();
      box.current?.focus();
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (h: Hit | undefined) => {
    if (!h) return;
    if (h.kind === 'vehicle') onPickVehicle(h.v);
    else onPickYard(h.y);
    setOpen(false);
    setQ('');
    box.current?.blur();
  };

  const listId = `${id}-list`;

  return (
    <div className={`relative ${className}`}>
      <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5">
        <Search size={14} className="shrink-0 text-ink-2" aria-hidden />
        <input
          ref={box}
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setWanted(true);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(a => Math.min(hits.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(a => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              setQ('');
              box.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && hits[active] ? `${id}-${hits[active].key}` : undefined}
          aria-label="Find a vehicle or yard on the map"
          placeholder="Find a vehicle or yard…"
          className="w-40 bg-transparent text-[12.5px] text-ink-0 outline-none placeholder:text-ink-2 sm:w-52"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setQ('');
              box.current?.focus();
            }}
            className="grid size-5 place-items-center rounded-full text-ink-2 hover:bg-black/[0.06]"
          >
            <X size={12} />
          </button>
        ) : (
          <kbd className="hidden rounded border border-line px-1.5 text-[10px] text-ink-2 sm:block">
            /
          </kbd>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="glass-strong absolute left-0 top-[calc(100%+6px)] z-20 max-h-[320px] w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-1.5 shadow-card"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-[12.5px] text-ink-2">
              {positions.isLoading ? 'Searching the fleet…' : `Nothing matches “${q}”.`}
            </li>
          ) : (
            hits.map((h, i) => (
              <li
                key={h.key}
                id={`${id}-${h.key}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(h)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                  i === active ? 'bg-brand-wash' : ''
                }`}
              >
                {h.kind === 'vehicle' ? (
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${STATE_DOT[h.state]}`}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-md bg-brand-wash text-brand-text"
                    aria-hidden
                  >
                    <Warehouse size={12} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-0">
                    {h.title}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-2">{h.sub}</span>
                </span>
                <span className="ml-auto shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-ink-2">
                  {h.kind}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
