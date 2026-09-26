import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe, Search, X } from 'lucide-react';

const FIELD =
  'w-full bg-surface-2 border rounded-lg text-[13px] text-ink-0 placeholder:text-ink-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan disabled:opacity-50';

/* --------------------------------------------------------------------------------- NumberField */

/**
 * A number input with a unit suffix, ↑ / ↓ stepping and an inline error. The value is kept as a string
 * (so "" = cleared, which is a valid "no target" for nullable fields) and validated by the caller.
 */
export function NumberField({
  id,
  value,
  onChange,
  unit,
  placeholder,
  step = 1,
  min,
  max,
  invalid,
  describedBy,
  clearable,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  invalid?: boolean;
  describedBy?: string;
  clearable?: boolean;
}) {
  const nudge = (dir: 1 | -1) => {
    const cur = value.trim() === '' ? (min ?? 0) - (dir === 1 ? step : 0) : Number(value);

    if (Number.isNaN(cur)) return;

    let next = Math.round((cur + dir * step) * 1000) / 1000;

    if (min !== undefined) next = Math.max(min, next);

    if (max !== undefined) next = Math.min(max, next);

    onChange(String(next));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(-1);
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onKeyDown={onKey}
        onChange={e => onChange(e.target.value.replace(/[^\d.,-]/g, '').replace(',', '.'))}
        className={`${FIELD} h-9 pl-3 tabular-nums ${unit ? 'pr-16' : 'pr-3'} ${
          invalid ? 'border-danger/60' : 'border-line hover:border-ink-2'
        }`}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1.5 pointer-events-none">
        {clearable && value !== '' && (
          <button
            type="button"
            aria-label="Clear value"
            onClick={() => onChange('')}
            className="pointer-events-auto text-ink-2 hover:text-ink-0 rounded p-0.5"
          >
            <X size={12} />
          </button>
        )}
        {unit && <span className="text-[11.5px] text-ink-2 select-none">{unit}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ Timezone combobox */

interface Zone {
  id: string;
  region: string;
  city: string;
  offset: string; // "UTC+05:00"
  minutes: number;
}

const offsetOf = (timeZone: string): { label: string; minutes: number } => {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value; // "GMT+05:00" | "GMT"
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '');

    if (!m) return { label: 'UTC±00:00', minutes: 0 };

    const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));

    return { label: `UTC${m[1]}${m[2]}:${m[3]}`, minutes };
  } catch {
    return { label: 'UTC', minutes: 0 };
  }
};

/** Every IANA zone the browser knows, with its current UTC offset (memoised — computed once). */
let zoneCache: Zone[] | null = null;

export const listZones = (): Zone[] => {
  if (zoneCache) return zoneCache;

  let ids: string[] = [];

  try {
    ids = (Intl as any).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    ids = [];
  }

  if (!ids.includes('UTC')) ids = ['UTC', ...ids];

  zoneCache = ids.map(id => {
    const [region, ...rest] = id.split('/');
    const o = offsetOf(id);

    return {
      id,
      region: rest.length ? region : 'UTC',
      city: (rest.length ? rest.join(' / ') : id).replace(/_/g, ' '),
      offset: o.label,
      minutes: o.minutes,
    };
  });

  return zoneCache;
};

/** The current wall-clock time in a zone, e.g. "Fri 25 Sep · 09:45". */
export const nowIn = (timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(new Date())
      .replace(',', ' ·');
  } catch {
    return '—';
  }
};

/**
 * Searchable timezone picker (WAI-ARIA combobox): type a city, region or offset ("karachi", "+05:00"),
 * ↑ / ↓ to move, Enter to choose, Esc to close. Grouped by region, each option shows its UTC offset.
 */
export function TimezoneCombobox({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const zones = useMemo(listZones, []);
  const current = zones.find(z => z.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const hits = q
      ? zones.filter(z =>
          `${z.id} ${z.city} ${z.region} ${z.offset}`.toLowerCase().replace(/_/g, ' ').includes(q)
        )
      : zones;

    return hits.slice(0, 250);
  }, [zones, query]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', onDown);

    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [active, open]);

  const pick = (z: Zone) => {
    onChange(z.id);
    setOpen(false);
    setQuery('');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(i => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  let lastRegion = '';

  return (
    <div ref={root} className="relative">
      <Globe
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
      />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={open ? query : (current?.id ?? value)}
        placeholder={open ? 'Search city, region or offset…' : 'Select a timezone'}
        onFocus={() => {
          setOpen(true);
          setActive(
            Math.max(
              0,
              results.findIndex(z => z.id === value)
            )
          );
        }}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKey}
        className={`${FIELD} h-9 pl-9 pr-24 ${
          invalid ? 'border-danger/60' : 'border-line hover:border-ink-2'
        }`}
      />
      <div className="absolute inset-y-0 right-2.5 flex items-center gap-1.5 pointer-events-none text-ink-2">
        {!open && current && (
          <span className="text-[11.5px] tabular-nums">{current.offset.replace('UTC', '')}</span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-40 left-0 right-0 top-full mt-1.5 glass-menu overflow-hidden">
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label="Timezones"
            className="max-h-[300px] overflow-y-auto py-1"
          >
            {results.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-6 justify-center text-xs text-ink-2">
                <Search size={13} /> No timezone matches “{query}”
              </li>
            )}
            {results.map((z, i) => {
              const header = z.region !== lastRegion;

              lastRegion = z.region;

              return (
                <li key={z.id} role="presentation">
                  {header && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-2">
                      {z.region}
                    </div>
                  )}
                  <div
                    id={`${listId}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={z.id === value}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => pick(z)}
                    className={`flex items-center gap-2 px-3 py-1.5 mx-1 rounded-md text-[13px] cursor-pointer ${
                      i === active ? 'bg-surface-2' : ''
                    }`}
                  >
                    <span className="w-3.5 shrink-0 text-accent-cyan">
                      {z.id === value && <Check size={14} />}
                    </span>
                    <span className="flex-1 truncate text-ink-0">{z.city}</span>
                    <span className="text-[11.5px] tabular-nums text-ink-2">
                      {z.offset.replace('UTC', '')}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
