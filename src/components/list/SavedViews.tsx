'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Trash2 } from 'lucide-react';

interface ViewState {
  search: string;
  filters: Record<string, string>;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

/** The slice of `useListState` this needs. */
export interface ViewsList {
  storageKey: string;
  state: ViewState & { page: number; pageSize: number };
  applyView: (v: ViewState) => void;
  hasActiveFilters: boolean;
}

interface SavedView {
  name: string;
  view: ViewState;
}

const KEY = (k: string) => `views:${k}`;

const read = (k: string): SavedView[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY(k)) || '[]');
  } catch {
    return [];
  }
};

const same = (a: ViewState, b: ViewState) => JSON.stringify(a) === JSON.stringify(b);

/** Named filter presets for a list, kept per list in this browser (localStorage). */
export default function SavedViews({ list }: { list: ViewsList }) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current: ViewState = {
    search: list.state.search,
    filters: list.state.filters,
    sortBy: list.state.sortBy,
    sortDir: list.state.sortDir,
  };

  useEffect(() => setViews(read(list.storageKey)), [list.storageKey]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const persist = (next: SavedView[]) => {
    setViews(next);

    try {
      localStorage.setItem(KEY(list.storageKey), JSON.stringify(next));
    } catch {
      /* storage unavailable: views last for this session only */
    }
  };

  const save = () => {
    const n = name.trim();

    if (!n) return;

    persist([...views.filter(v => v.name !== n), { name: n, view: current }]);
    setName('');
  };

  const active = views.find(v => same(v.view, current));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="control flex items-center gap-1.5 hover:bg-surface-2"
      >
        <Bookmark size={13} className={active ? 'text-brand' : 'text-ink-2'} />
        {active ? active.name : 'Views'}
        {views.length > 0 && !active && <span className="text-ink-2">({views.length})</span>}
      </button>

      {open && (
        <div role="menu" className="glass-menu absolute left-0 top-[calc(100%+8px)] z-30 w-64 p-2">
          {views.length === 0 ? (
            <div className="px-2 py-2 text-xs text-ink-2">
              No saved views yet. Set filters, then save them here.
            </div>
          ) : (
            <ul className="mb-1 max-h-56 overflow-y-auto">
              {views.map(v => (
                <li key={v.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      list.applyView(v.view);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-0 hover:bg-brand-wash/60"
                  >
                    {active?.name === v.name ? (
                      <Check size={13} className="text-brand" />
                    ) : (
                      <span className="w-[13px]" />
                    )}
                    <span className="truncate">{v.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete view ${v.name}`}
                    onClick={() => persist(views.filter(x => x.name !== v.name))}
                    className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line-soft pt-2">
            {list.hasActiveFilters || list.state.sortBy ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  save();
                }}
                className="flex gap-1.5"
              >
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name this view"
                  aria-label="View name"
                  className="control min-w-0 flex-1"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="btn-brand rounded-full px-3 text-xs font-medium disabled:opacity-40"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="px-2 py-1 text-[11px] text-ink-2">
                Apply a filter, search or sort to save it as a view.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
