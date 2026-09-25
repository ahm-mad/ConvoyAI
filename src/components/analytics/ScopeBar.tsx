/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Filter, Plus, Search, X } from 'lucide-react';
import { get } from '@utils/apiHelper';
import { useOptions } from '@hooks/useOptions';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import type { AnalyticsScope, ScopeField } from './useAnalyticsScope';

/** How a field is presented and where its values come from. */
const FIELDS: Record<
  ScopeField,
  { label: string; plural: string; kind: 'static' | 'vehicle' | 'yard' | 'driver'; multi: boolean }
> = {
  category: { label: 'Category', plural: 'Categories', kind: 'static', multi: false },
  vehicle: { label: 'Vehicle', plural: 'Vehicles', kind: 'vehicle', multi: true },
  yard: { label: 'Yard', plural: 'Yards', kind: 'yard', multi: false },
  driver: { label: 'Driver', plural: 'Drivers', kind: 'driver', multi: true },
  costCentre: { label: 'Cost centre', plural: 'Cost centres', kind: 'static', multi: false },
};

const SEARCH_LIMIT = 50;

const useDebounced = <T,>(value: T, ms = 250) => {
  const [v, setV] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);

    return () => clearTimeout(t);
  }, [value, ms]);

  return v;
};

const fullName = (d: any) =>
  [d?.first_name, d?.last_name].filter(Boolean).join(' ') || d?.name || null;

/** id → display name. A picked name is written to the cache, so a chip is instant; a shared URL fetches it once. */
const labelQuery = (kind: 'vehicle' | 'yard' | 'driver', id: string) => ({
  queryKey: ['scope-label', kind, id],
  queryFn: async () => {
    const r: any = await get(`/api/${kind}s/${id}`);
    const d = r?.data;

    return (
      (kind === 'vehicle' ? d?.vehicle?.name : kind === 'driver' ? fullName(d) : d?.name) ?? null
    );
  },
  staleTime: Infinity,
  gcTime: Infinity,
  networkMode: 'always' as const,
});

function useLabels(field: ScopeField, values: string[]) {
  const kind = FIELDS[field].kind;
  const shown = values.slice(0, 2);
  const results = useQueries({
    queries: shown.map(id =>
      kind === 'static'
        ? { queryKey: ['scope-label', 'static', id], queryFn: () => id, staleTime: Infinity }
        : labelQuery(kind, id)
    ),
  });

  return shown.map((id, i) => (results[i].data as string | null | undefined) || `#${id}`);
}

/** One row of a picker: a checkbox (multi) or a tick (single) + name + a quiet second line. */
function Row({
  selected,
  multi,
  title,
  sub,
  badge,
  onSelect,
  value,
}: {
  selected: boolean;
  multi: boolean;
  title: string;
  sub?: string;
  badge?: string;
  onSelect: () => void;
  value: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer text-[13px] text-ink-0 data-[selected=true]:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className={`grid place-items-center shrink-0 w-4 h-4 border ${
          multi ? 'rounded-[5px]' : 'rounded-full'
        } ${selected ? 'bg-accent-cyan border-accent-cyan text-white' : 'border-line bg-surface-1'}`}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {sub && <span className="block truncate text-[11.5px] text-ink-2">{sub}</span>}
      </span>
      {badge && (
        <span className="text-[10.5px] text-ink-1 bg-surface-2 border border-line-soft rounded-full px-1.5 py-px capitalize shrink-0">
          {badge}
        </span>
      )}
    </Command.Item>
  );
}

/** The searchable list behind one field. Single fields apply on click; multi fields apply with "Apply". */
function Picker({
  field,
  scope,
  staticValues,
  onDone,
}: {
  field: ScopeField;
  scope: AnalyticsScope;
  staticValues: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const def = FIELDS[field];
  const current: string[] =
    field === 'category'
      ? scope.values.category
        ? [scope.values.category]
        : []
      : field === 'costCentre'
        ? scope.values.costCentre
          ? [scope.values.costCentre]
          : []
        : field === 'yard'
          ? scope.values.yard
            ? [scope.values.yard]
            : []
          : (scope.values[field] as string[]);
  const [draft, setDraft] = useState<string[]>(current);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const server = def.kind !== 'static';
  const opts = useOptions(
    def.kind === 'static' ? 'vehicles' : (`${def.kind}s` as 'vehicles' | 'yards' | 'drivers'),
    { include_inactive: 1, limit: SEARCH_LIMIT },
    { search: term, enabled: server }
  );

  const remember = (id: string, name: string) =>
    qc.setQueryData(['scope-label', def.kind, id], name);
  const apply = (next: string[]) => {
    scope.set(field, def.multi ? next : (next[0] ?? null));
  };

  const toggle = (id: string, name: string) => {
    if (def.kind !== 'static') remember(id, name);

    if (!def.multi) {
      // Single: picking the same value again clears it.
      apply(current[0] === id ? [] : [id]);
      onDone();

      return;
    }

    setDraft(d => (d.includes(id) ? d.filter(x => x !== id) : [...d, id]));
  };

  const items: { id: string; title: string; sub?: string; badge?: string }[] = server
    ? (opts.items as any[]).map(i => ({
        id: String(i.id),
        title: (def.kind === 'driver' ? fullName(i) : i.name) ?? `#${i.id}`,
        sub:
          def.kind === 'vehicle'
            ? [i.plate, i.vehicle_category].filter(Boolean).join(' · ') || undefined
            : def.kind === 'yard'
              ? i.address || undefined
              : undefined,
        badge:
          def.kind === 'vehicle' && i.lifecycle_status && i.lifecycle_status !== 'active'
            ? String(i.lifecycle_status).replace('_', ' ')
            : def.kind === 'yard' && i.is_active === false
              ? 'inactive'
              : def.kind === 'driver' && i.status && i.status !== 'active'
                ? String(i.status).replace('_', ' ')
                : undefined,
      }))
    : staticValues.map(v => ({ id: v, title: v }));

  return (
    <Command
      shouldFilter={!server}
      loop
      label={`Choose ${def.plural.toLowerCase()}`}
      className="flex flex-col min-h-0 flex-1"
    >
      <div className="flex items-center gap-2 px-3 border-b border-line-soft">
        <Search size={14} className="text-ink-2 shrink-0" aria-hidden="true" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          autoFocus
          placeholder={`Search ${def.plural.toLowerCase()}`}
          className="h-10 w-full bg-transparent text-[13px] text-ink-0 outline-none placeholder:text-ink-2"
        />
      </div>
      <Command.List className="min-h-[96px] flex-1 overflow-y-auto overscroll-contain p-1">
        {server && opts.isLoading && (
          <div className="py-6 text-center text-xs text-ink-2">Loading…</div>
        )}
        {opts.error && (
          <div className="py-4 px-3 text-center text-xs text-danger">{opts.error}</div>
        )}
        {!(server && opts.isLoading) && (
          <Command.Empty className="py-6 text-center text-xs text-ink-2">
            No {def.plural.toLowerCase()} match
          </Command.Empty>
        )}
        {items.map(it => (
          <Row
            key={it.id}
            value={it.id === it.title ? it.title : `${it.title} ${it.id}`}
            multi={def.multi}
            selected={(def.multi ? draft : current).includes(it.id)}
            title={it.title}
            sub={it.sub}
            badge={it.badge}
            onSelect={() => toggle(it.id, it.title)}
          />
        ))}
      </Command.List>
      {server && opts.truncated && (
        <p className="px-3 py-1.5 text-[11px] text-ink-2 border-t border-line-soft">
          Showing the first {SEARCH_LIMIT} of {opts.meta.total.toLocaleString()} — type to narrow
          the list.
        </p>
      )}
      {def.multi ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-line-soft">
          <span className="text-[11.5px] text-ink-2 tabular-nums">{draft.length} selected</span>
          <span className="flex items-center gap-2">
            {draft.length > 0 && (
              <button
                type="button"
                onClick={() => setDraft([])}
                className="text-[12px] text-ink-1 hover:text-ink-0 rounded px-1.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                apply(draft);
                onDone();
              }}
              className="text-[12px] font-medium text-white bg-accent-cyan rounded-md px-3 py-1 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan"
            >
              Apply
            </button>
          </span>
        </div>
      ) : current.length > 0 ? (
        <div className="px-3 py-2 border-t border-line-soft">
          <button
            type="button"
            onClick={() => {
              apply([]);
              onDone();
            }}
            className="text-[12px] text-ink-1 hover:text-ink-0 rounded px-1.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
          >
            Clear {def.label.toLowerCase()}
          </button>
        </div>
      ) : null}
    </Command>
  );
}

/** Sized to the room the browser leaves (the list scrolls, the search and footer stay visible). */
const CONTENT =
  'z-[70] flex flex-col w-[320px] max-w-[calc(100vw-24px)] max-h-[min(440px,var(--radix-popover-content-available-height))] overflow-hidden rounded-xl border border-line bg-surface-1 shadow-[0_10px_32px_rgba(0,0,0,0.22)] focus:outline-none';

/** The applied filter as a pill: click to change it, × to remove it. */
function Chip({
  field,
  scope,
  staticValues,
  hint,
}: {
  field: ScopeField;
  scope: AnalyticsScope;
  staticValues: string[];
  hint?: string;
}) {
  const def = FIELDS[field];
  const [open, setOpen] = useState(false);
  const raw: string[] =
    field === 'category'
      ? scope.values.category
        ? [scope.values.category]
        : []
      : field === 'costCentre'
        ? scope.values.costCentre
          ? [scope.values.costCentre]
          : []
        : field === 'yard'
          ? scope.values.yard
            ? [scope.values.yard]
            : []
          : (scope.values[field] as string[]);
  const names = useLabels(field, raw);
  const text =
    raw.length === 0
      ? ''
      : raw.length <= 2
        ? names.join(', ')
        : `${names.join(', ')} +${raw.length - 2}`;

  if (raw.length === 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <span
        title={hint}
        className="inline-flex items-center h-8 rounded-full border border-accent-cyan/50 bg-accent-cyan/10 text-[12.5px] text-ink-0"
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`${raw.length > 1 ? def.plural : def.label}: ${text}. Change`}
            className="inline-flex items-center gap-1.5 h-full pl-3 pr-1.5 rounded-l-full hover:bg-accent-cyan/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
          >
            <span className="text-ink-1">{raw.length > 1 ? def.plural : def.label}</span>
            <span className="font-medium truncate max-w-[220px]">{text}</span>
            <ChevronDown size={12} className="text-ink-2" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <button
          type="button"
          onClick={() => scope.set(field, null)}
          aria-label={`Remove the ${def.label.toLowerCase()} filter`}
          className="grid place-items-center h-full w-7 rounded-r-full text-ink-1 hover:text-ink-0 hover:bg-accent-cyan/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          <X size={13} />
        </button>
      </span>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={CONTENT}>
          <Picker
            field={field}
            scope={scope}
            staticValues={staticValues}
            onDone={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * "Add filter" — first a short menu of the fields not yet applied, then that field's picker in the same
 * popover.
 */
function AddFilter({
  fields,
  scope,
  staticValues,
  hints,
}: {
  fields: ScopeField[];
  scope: AnalyticsScope;
  staticValues: Partial<Record<ScopeField, string[]>>;
  hints: Partial<Record<ScopeField, string>>;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ScopeField | null>(null);

  if (fields.length === 0) return null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={o => {
        setOpen(o);

        if (!o) setField(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 rounded-full border border-dashed border-line px-3 text-[12.5px] text-ink-1 hover:text-ink-0 hover:border-ink-2 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          <Plus size={13} aria-hidden="true" /> Add filter
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={CONTENT}>
          {field ? (
            <Picker
              field={field}
              scope={scope}
              staticValues={staticValues[field] ?? []}
              onDone={() => {
                setOpen(false);
                setField(null);
              }}
            />
          ) : (
            <ul role="menu" aria-label="Add a filter" className="p-1">
              {fields.map(f => (
                <li key={f} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setField(f)}
                    className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="block text-[13px] text-ink-0">{FIELDS[f].label}</span>
                    {hints[f] && <span className="block text-[11.5px] text-ink-2">{hints[f]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The scope row of a report page (FLEET_ANALYTICS_DESIGN.md §2): which vehicles the numbers are about.
 * Applied filters are pills (click to change, × to remove); "Add filter" offers the rest. It sits under the
 * date range and applies to EVERY chart and table on the page — a page only offers the fields it can honour
 * everywhere. The cost-centre filter appears only when the company has cost centres to choose from.
 */
export default function ScopeBar({
  scope,
  hints = {},
  note,
}: {
  scope: AnalyticsScope;
  /** One line per field explaining what it means on THIS page (shown in the menu and as a tooltip). */
  hints?: Partial<Record<ScopeField, string>>;
  note?: ReactNode;
}) {
  const options = useSimpleQuery<any>(
    'fleet-options-scope',
    '/api/fleet/options',
    {},
    {
      staleTime: 300_000,
    }
  );
  const data = options.data?.success ? options.data.data : null;
  const categories: string[] = useMemo(() => data?.vehicle_categories ?? [], [data]);
  const costCentres: string[] | null = Array.isArray(data?.cost_centres) ? data.cost_centres : null;
  const staticValues = { category: categories, costCentre: costCentres ?? [] };
  const offered = scope.fields.filter(f => {
    if (f === 'costCentre') return costCentres !== null;

    if (f === 'category') return categories.length > 0 || !!scope.values.category;

    return true;
  });
  const applied = offered.filter(f =>
    f === 'category'
      ? !!scope.values.category
      : f === 'costCentre'
        ? !!scope.values.costCentre
        : f === 'yard'
          ? !!scope.values.yard
          : (scope.values[f] as string[]).length > 0
  );
  const free = offered.filter(f => !applied.includes(f));

  if (offered.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Scope filters"
      className="flex flex-wrap items-center gap-2"
      data-testid="scope-bar"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-2 mr-1">
        <Filter size={13} aria-hidden="true" /> Scope
      </span>
      {applied.length === 0 && <span className="text-[12.5px] text-ink-1">Whole fleet</span>}
      {applied.map(f => (
        <Chip
          key={f}
          field={f}
          scope={scope}
          staticValues={(staticValues as any)[f] ?? []}
          hint={hints[f]}
        />
      ))}
      <AddFilter fields={free} scope={scope} staticValues={staticValues} hints={hints} />
      {applied.length > 0 && (
        <button
          type="button"
          onClick={scope.clear}
          className="text-[12px] text-ink-2 hover:text-ink-0 underline-offset-2 hover:underline rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          Clear all
        </button>
      )}
      {note && <span className="ml-auto text-[11.5px] text-ink-2">{note}</span>}
    </div>
  );
}
