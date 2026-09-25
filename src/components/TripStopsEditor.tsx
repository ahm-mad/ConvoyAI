/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import OptionSelect from '@components/OptionSelect';
import { toDatetimeLocal, toIsoInstant } from '@utils/datetime';

/** One planned yard stop as the operator edits it (datetime fields are naive `datetime-local` strings). */
export type StopDraft = {
  /** Stable React key (a saved stop's id, or a client-side counter for a new one). */
  key: string;
  /** Present only for a stop that already exists on the trip (kept by id on save). */
  id?: string;
  yard_id: string;
  stop_purpose: string;
  planned_arrival_at: string;
  planned_departure_at: string;
  notes: string;
  /** Yard name of a saved stop — shown even if that yard is no longer in the (active-only) options. */
  yard_name?: string;
};

let counter = 0;

export const emptyStop = (): StopDraft => ({
  key: `new-${++counter}`,
  yard_id: '',
  stop_purpose: '',
  planned_arrival_at: '',
  planned_departure_at: '',
  notes: '',
});

/** The trip's saved stops in visit order. */
export const stopsFromTrip = (trip: any): StopDraft[] =>
  (Array.isArray(trip?.planned_yards) ? [...trip.planned_yards] : [])
    .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
    .map((s: any) => ({
      key: `stop-${s.id}`,
      id: String(s.id),
      yard_id: String(s.yard_id ?? s.yard?.id ?? ''),
      stop_purpose: s.stop_purpose ?? '',
      planned_arrival_at: s.planned_arrival_at ? toDatetimeLocal(s.planned_arrival_at) : '',
      planned_departure_at: s.planned_departure_at ? toDatetimeLocal(s.planned_departure_at) : '',
      notes: s.notes ?? '',
      yard_name: s.yard?.name,
    }));

/** A departure earlier than the arrival (same rule the backend enforces). */
export const stopTimeError = (s: StopDraft): string | null =>
  s.planned_arrival_at &&
  s.planned_departure_at &&
  new Date(s.planned_departure_at) < new Date(s.planned_arrival_at)
    ? "The planned departure can't be before the planned arrival."
    : null;

const FIELDS = [
  'yard_id',
  'stop_purpose',
  'planned_arrival_at',
  'planned_departure_at',
  'notes',
] as const;

const sameStops = (a: StopDraft[], b: StopDraft[]) =>
  a.length === b.length &&
  a.every((s, i) => s.id === b[i].id && FIELDS.every(f => s[f] === b[i][f]));

/** Has the operator changed the stop list (added, removed, reordered or edited a stop)? */
export const stopsChanged = (stops: StopDraft[], initial: StopDraft[]) =>
  !sameStops(stops, initial);

/**
 * The `planned_yards` array for `PUT /trips/{id}` (replace-the-list, flows/06 §22): the order sent is
 * the visit order; an entry with `id` keeps that stop and a key left out keeps its value, so a kept
 * stop only carries the fields the operator changed (re-sending an untouched datetime would round it
 * to the minute); an entry without `id` creates a stop; an unlisted stop is deleted. Returns
 * `undefined` when nothing changed (omit the key → stops untouched).
 */
export const stopsToPutPayload = (stops: StopDraft[], initial: StopDraft[]) => {
  if (!stopsChanged(stops, initial)) return undefined;

  const before = new Map(initial.map(s => [s.id, s]));

  return stops.map(s => {
    const old = s.id ? before.get(s.id) : undefined;
    const changed = (f: (typeof FIELDS)[number]) => !old || old[f] !== s[f];
    const entry: Record<string, unknown> = { yard_id: Number(s.yard_id) };

    if (s.id) entry.id = s.id;
    if (changed('stop_purpose')) entry.stop_purpose = s.stop_purpose.trim() || null;
    if (changed('planned_arrival_at'))
      entry.planned_arrival_at = toIsoInstant(s.planned_arrival_at);
    if (changed('planned_departure_at')) {
      entry.planned_departure_at = toIsoInstant(s.planned_departure_at);
    }
    if (changed('notes')) entry.notes = s.notes.trim() || null;

    return entry;
  });
};

/** The `planned_yards` array for `POST /trips` (every stop is new). */
export const stopsToCreatePayload = (stops: StopDraft[]) =>
  stops
    .filter(s => s.yard_id)
    .map(s => ({
      yard_id: Number(s.yard_id),
      stop_purpose: s.stop_purpose.trim() || null,
      planned_arrival_at: toIsoInstant(s.planned_arrival_at),
      planned_departure_at: toIsoInstant(s.planned_departure_at),
      notes: s.notes.trim() || null,
    }));

const inputCls = 'glass-strong  px-2.5 py-1.5 text-xs text-ink-0 min-w-0';
const iconBtn =
  'p-1 text-ink-2 hover:text-ink-0 disabled:opacity-30 disabled:hover:text-ink-2 rounded';

/** First backend 422 message for `planned_yards.<index>.<field>` (or the list-level key). */
const backendError = (errors: Record<string, string[] | string> | undefined, key: string) => {
  const e = errors?.[key];

  return Array.isArray(e) ? e[0] : e;
};

/**
 * The planned-yards editor shared by New trip and Edit trip: add / remove / reorder stops, each with
 * yard, purpose, planned arrival / departure and notes. `errors` are the backend's 422 field errors
 * (`planned_yards.N.<field>`), shown under the stop they belong to.
 */
export default function TripStopsEditor({
  stops,
  onChange,
  errors,
  disabled,
}: {
  stops: StopDraft[];
  onChange: (stops: StopDraft[]) => void;
  errors?: Record<string, string[] | string>;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<StopDraft>) =>
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const remove = (index: number) => onChange(stops.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const next = [...stops];
    const [item] = next.splice(index, 1);

    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const listError = backendError(errors, 'planned_yards');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-2">Planned Yards</div>

        <button
          type="button"
          onClick={() => onChange([...stops, emptyStop()])}
          disabled={disabled}
          className="flex items-center gap-1 text-[10px] text-accent-cyan border border-line rounded-md px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
        >
          <Plus size={11} />
          Add Yard
        </button>
      </div>

      {listError && <div className="text-[11px] text-danger mb-2">{listError}</div>}

      {stops.length === 0 && (
        <div className="text-[11px] text-ink-2 italic bg-surface-2 rounded-md px-3 py-2 mb-3">
          No planned yards added. You can add one or more stopping points for this trip.
        </div>
      )}

      {stops.map((stop, index) => {
        const timeError =
          stopTimeError(stop) ||
          backendError(errors, `planned_yards.${index}.planned_departure_at`);
        const yardError = backendError(errors, `planned_yards.${index}.yard_id`);
        const idError = backendError(errors, `planned_yards.${index}.id`);

        return (
          <div
            key={stop.key}
            data-testid="trip-stop"
            className="bg-surface-2 border border-line-soft rounded-md p-3 mb-2"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-ink-2">
                Yard Stop {index + 1}
                {!stop.id && <span className="ml-2 normal-case text-accent-cyan">new</span>}
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  className={iconBtn}
                  title="Move up"
                  aria-label={`Move stop ${index + 1} up`}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === stops.length - 1}
                  className={iconBtn}
                  title="Move down"
                  aria-label={`Move stop ${index + 1} down`}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  className="p-1 text-danger hover:opacity-80 disabled:opacity-30"
                  title="Remove yard"
                  aria-label={`Remove stop ${index + 1}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <OptionSelect
                kind="yards"
                value={stop.yard_id}
                onChange={id => update(index, { yard_id: id })}
                placeholder="Select yard"
                emptyLabel="No yards available"
                wrapperClassName="col-span-2"
                className="w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0"
                getOption={y => ({ label: y.name || `Yard #${y.id}` })}
                selectedLabel={stop.yard_name || `Yard #${stop.yard_id}`}
                ariaLabel={`Yard for stop ${index + 1}`}
                disabled={disabled}
              />
              {yardError && <div className="col-span-2 text-[11px] text-danger">{yardError}</div>}
              {idError && <div className="col-span-2 text-[11px] text-danger">{idError}</div>}

              <input
                value={stop.stop_purpose}
                onChange={e => update(index, { stop_purpose: e.target.value })}
                placeholder="Stop purpose (e.g. refuel, loading)"
                maxLength={255}
                aria-label={`Purpose of stop ${index + 1}`}
                disabled={disabled}
                className={`${inputCls} col-span-2`}
              />

              <label className="flex flex-col">
                <span className="text-[10px] text-ink-2 mb-0.5">Planned arrival</span>
                <input
                  value={stop.planned_arrival_at}
                  onChange={e => update(index, { planned_arrival_at: e.target.value })}
                  type="datetime-local"
                  aria-label={`Planned arrival of stop ${index + 1}`}
                  disabled={disabled}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col">
                <span className="text-[10px] text-ink-2 mb-0.5">Planned departure</span>
                <input
                  value={stop.planned_departure_at}
                  onChange={e => update(index, { planned_departure_at: e.target.value })}
                  type="datetime-local"
                  aria-label={`Planned departure of stop ${index + 1}`}
                  disabled={disabled}
                  className={inputCls}
                />
              </label>

              {timeError && <div className="col-span-2 text-[11px] text-danger">{timeError}</div>}

              <input
                value={stop.notes}
                onChange={e => update(index, { notes: e.target.value })}
                placeholder="Notes (optional)"
                aria-label={`Notes for stop ${index + 1}`}
                disabled={disabled}
                className={`${inputCls} col-span-2`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
