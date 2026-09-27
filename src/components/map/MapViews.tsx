'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as GLMap } from 'maplibre-gl';
import { Bookmark, Check, Crosshair, Trash2 } from 'lucide-react';
import { isShowcase } from '@utils/showcase';

export interface CameraView {
  id: string;
  name: string;
  center: [number, number]; // [lon, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}

const KEY = 'convoyai-map-views';
const MAX = 12;

/** Views a first-time showcase visitor gets, so the popover is never empty in screenshots. */
const SHOWCASE_VIEWS: CameraView[] = [
  { id: 's1', name: 'Lahore core', center: [74.3436, 31.5204], zoom: 12.4, pitch: 0, bearing: 0 },
  {
    id: 's2',
    name: 'Karachi port · 3D',
    center: [66.9963, 24.8465],
    zoom: 13.4,
    pitch: 58,
    bearing: -17,
  },
  {
    id: 's3',
    name: 'Islamabad hills · 3D',
    center: [73.0479, 33.6844],
    zoom: 12.6,
    pitch: 58,
    bearing: -17,
  },
];

const read = (): CameraView[] => {
  try {
    const raw = window.localStorage.getItem(KEY);

    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }

  return isShowcase() ? SHOWCASE_VIEWS : [];
};

/**
 * Camera bookmarks for the big map: "Whole fleet" plus views the operator saves (name + centre, zoom, tilt, bearing),
 * remembered in this browser. Click a view to fly there; the tilt also switches the 2D/3D toolbar state.
 */
export default function MapViews({
  map,
  onFit,
  onTilt,
  className = '',
}: {
  map: GLMap | null;
  onFit: () => void;
  /** Called with true when a view is tilted, so the toolbar's 3D state follows the camera. */
  onTilt: (tilted: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<CameraView[]>([]);
  const [name, setName] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setViews(read()), []);

  const persist = useCallback((next: CameraView[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;

    const down = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    input.current?.focus();

    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const fly = (v: CameraView) => {
    if (!map) return;

    // The toolbar's 3D state follows AFTER the flight: changing it starts its own camera move and would cancel this one.
    map.once('moveend', () => onTilt(v.pitch > 10));
    map.flyTo({
      center: v.center,
      zoom: v.zoom,
      pitch: v.pitch,
      bearing: v.bearing,
      duration: 2000,
      essential: false,
    });
    setOpen(false);
  };

  const save = () => {
    if (!map) return;

    const label = name.trim() || `View ${views.length + 1}`;
    const c = map.getCenter();
    const v: CameraView = {
      id: `${Date.now()}`,
      name: label.slice(0, 32),
      center: [+c.lng.toFixed(5), +c.lat.toFixed(5)],
      zoom: +map.getZoom().toFixed(2),
      pitch: Math.round(map.getPitch()),
      bearing: Math.round(map.getBearing()),
    };

    persist([v, ...views].slice(0, MAX));
    setName('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1400);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="glass-strong inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-ink-1 hover:text-ink-0"
      >
        <Bookmark size={14} aria-hidden /> Views
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Camera views"
          className="glass-strong absolute left-0 top-[calc(100%+6px)] z-20 w-[min(300px,calc(100vw-2rem))] rounded-2xl p-2 shadow-card"
        >
          <div className="eyebrow px-2 pb-1 pt-1">Camera views</div>
          <button
            type="button"
            onClick={() => {
              onFit();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-brand-wash"
          >
            <span className="grid size-6 place-items-center rounded-md bg-brand-wash text-brand-text">
              <Crosshair size={13} aria-hidden />
            </span>
            <span className="text-[13px] font-semibold text-ink-0">Whole fleet</span>
          </button>

          <ul className="max-h-[210px] overflow-y-auto">
            {views.map(v => (
              <li key={v.id} className="group flex items-center rounded-xl hover:bg-brand-wash">
                <button
                  type="button"
                  onClick={() => fly(v)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-1">
                    <Bookmark size={12} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink-0">
                      {v.name}
                    </span>
                    <span className="block text-[11px] text-ink-2">
                      Zoom {v.zoom.toFixed(1)}
                      {v.pitch > 10 ? ' · 3D' : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  onClick={() => persist(views.filter(x => x.id !== v.id))}
                  className="mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-ink-2 opacity-0 hover:bg-black/[0.06] hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>

          <form
            className="mt-1 flex items-center gap-1.5 border-t border-line-soft px-1 pt-2"
            onSubmit={e => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={input}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={32}
              aria-label="Name for the new view"
              placeholder="Name this view…"
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-0 outline-none placeholder:text-ink-2 focus:border-brand"
            />
            <button
              type="submit"
              className="btn-brand inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold"
            >
              {justSaved ? <Check size={13} /> : null}
              {justSaved ? 'Saved' : 'Save'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
