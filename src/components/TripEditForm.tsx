/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { put } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useUnits } from '@hooks/useUnits';
import { toDisplayString, toMetric, type Units } from '@utils/units';
import { useEditConflict } from '@hooks/useEditConflict';
import { toDatetimeLocal, toIsoInstant } from '@utils/datetime';
import PickOnMapButton from '@components/CoordinatePicker';
import TripStopsEditor, {
  stopsFromTrip,
  stopsToPutPayload,
  stopTimeError,
  type StopDraft,
} from '@components/TripStopsEditor';

const inputCls = 'bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0';
const labelCls = 'text-[10px] uppercase tracking-wider text-ink-2 mb-1';

type Values = Record<string, string>;

const tripToValues = (trip: any, u: Units): Values => ({
  trip_reference: trip.trip_reference ?? '',
  purpose: trip.purpose ?? '',
  origin_address: trip.origin_address ?? '',
  origin_latitude: trip.origin_latitude != null ? String(trip.origin_latitude) : '',
  origin_longitude: trip.origin_longitude != null ? String(trip.origin_longitude) : '',
  destination_address: trip.destination_address ?? '',
  destination_latitude: trip.destination_latitude != null ? String(trip.destination_latitude) : '',
  destination_longitude:
    trip.destination_longitude != null ? String(trip.destination_longitude) : '',
  planned_start_at: trip.planned_start_at ? toDatetimeLocal(trip.planned_start_at) : '',
  planned_end_at: trip.planned_end_at ? toDatetimeLocal(trip.planned_end_at) : '',
  // Distances are stored in km: shown (and typed) in the company's distance unit, converted back on save.
  planned_distance_km: toDisplayString(u.distance, trip.planned_distance_km),
  odometer_start_km: toDisplayString(u.distance, trip.odometer_start_km),
  notes: trip.notes ?? '',
});

const TEXT_FIELDS = [
  'trip_reference',
  'purpose',
  'origin_address',
  'destination_address',
  'notes',
] as const;
const NUMBER_FIELDS = [
  'origin_latitude',
  'origin_longitude',
  'destination_latitude',
  'destination_longitude',
  'planned_distance_km',
  'odometer_start_km',
] as const;
const DATE_FIELDS = ['planned_start_at', 'planned_end_at'] as const;

/** Only the fields the operator changed (an emptied optional field is sent as null to clear it). */
const DISTANCE_FIELDS: string[] = ['planned_distance_km', 'odometer_start_km'];

const tripToPayload = (values: Values, initial: Values, u: Units) => {
  const payload: Record<string, unknown> = {};

  TEXT_FIELDS.forEach(k => {
    if (values[k] !== initial[k]) payload[k] = values[k].trim() || null;
  });
  NUMBER_FIELDS.forEach(k => {
    if (values[k] !== initial[k])
      payload[k] =
        values[k] === ''
          ? null
          : DISTANCE_FIELDS.includes(k)
            ? toMetric(u.distance, values[k])
            : Number(values[k]);
  });
  DATE_FIELDS.forEach(k => {
    if (values[k] !== initial[k]) payload[k] = toIsoInstant(values[k]);
  });

  return payload;
};

/**
 * Edit trip (PUT /trips/{id}, planned or in-progress only). Vehicle and driver are not editable
 * through this endpoint — to change those, cancel/delete and create a new trip. The planned yard
 * stops are editable (add / remove / reorder) while the trip is still planned (flows/06 §22).
 */
export default function TripEditForm({
  trip,
  onSaved,
  onCancel,
}: {
  trip: any;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const conflict = useEditConflict(trip, onCancel);
  const u = useUnits();
  const [initial] = useState(() => tripToValues(trip, u));
  const [values, setValues] = useState<Values>(initial);
  const [submitting, setSubmitting] = useState(false);
  const canEditStops = trip.status === 'planned';
  const [initialStops] = useState(() => stopsFromTrip(trip));
  const [stops, setStops] = useState<StopDraft[]>(initialStops);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | string> | undefined>();

  const set = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const invalidRange =
    !!values.planned_start_at &&
    !!values.planned_end_at &&
    new Date(values.planned_end_at) < new Date(values.planned_start_at);
  const stopsInvalid = canEditStops && stops.some(s => !s.yard_id || !!stopTimeError(s));
  const canSave =
    !submitting && !!values.origin_address.trim() && !!values.destination_address.trim();

  const save = async () => {
    if (!canSave) return;

    if (invalidRange) {
      toast.error('The planned end cannot be before the planned start.');

      return;
    }

    if (stopsInvalid) {
      toast.error('Choose a yard for every stop and fix the stop times.');

      return;
    }

    const payload = tripToPayload(values, initial, u);
    const plannedYards = canEditStops ? stopsToPutPayload(stops, initialStops) : undefined;

    if (plannedYards) payload.planned_yards = plannedYards;

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSubmitting(true);
    setFieldErrors(undefined);
    const response: any = await put(
      `/api/trips/${trip.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );
    setSubmitting(false);

    if (conflict.handle(response)) return;

    if (response?.error || response?.success === false) {
      setFieldErrors(response?.errors);
      toast.error(response?.message || 'Could not update the trip.');

      return;
    }

    toast.success('Trip updated.');
    invalidateFleetQueries(qc);
    onSaved?.();
  };

  const field = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className="flex flex-col">
      <span className={labelCls}>{label}</span>
      <input
        value={values[key]}
        onChange={e => set(key, e.target.value)}
        className={inputCls}
        {...props}
      />
    </label>
  );

  return (
    <div>
      {conflict.banner}
      <div className="text-[11px] text-ink-2 bg-surface-2 rounded-md px-3 py-2 mb-3">
        Vehicle and driver can't be changed on an existing trip — cancel it and create a new one for
        that.
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {field('trip_reference', 'Trip reference', { maxLength: 100 })}
        {field('purpose', 'Purpose', { maxLength: 255 })}
      </div>

      <div className={`${labelCls} mt-1`}>Origin</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          {field('origin_address', 'Origin address *', { maxLength: 500 })}
        </div>
        {field('origin_latitude', 'Latitude', { type: 'number', step: 'any' })}
        {field('origin_longitude', 'Longitude', { type: 'number', step: 'any' })}
        <PickOnMapButton
          latitude={values.origin_latitude}
          longitude={values.origin_longitude}
          title="Pick the trip origin"
          onPick={(la, lo) => {
            set('origin_latitude', String(la));
            set('origin_longitude', String(lo));
          }}
          className="col-span-2"
        />
      </div>

      <div className={`${labelCls} mt-1`}>Destination</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          {field('destination_address', 'Destination address *', { maxLength: 500 })}
        </div>
        {field('destination_latitude', 'Latitude', { type: 'number', step: 'any' })}
        {field('destination_longitude', 'Longitude', { type: 'number', step: 'any' })}
        <PickOnMapButton
          latitude={values.destination_latitude}
          longitude={values.destination_longitude}
          title="Pick the trip destination"
          onPick={(la, lo) => {
            set('destination_latitude', String(la));
            set('destination_longitude', String(lo));
          }}
          className="col-span-2"
        />
      </div>

      {canEditStops ? (
        <div className="mb-3">
          <TripStopsEditor
            stops={stops}
            onChange={setStops}
            errors={fieldErrors}
            disabled={submitting}
          />
        </div>
      ) : (
        <div className="text-[11px] text-ink-2 bg-surface-2 rounded-md px-3 py-2 mb-3">
          Stops can only be edited while the trip is planned.
        </div>
      )}

      <div className={`${labelCls} mt-1`}>Planning</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {field('planned_start_at', 'Planned start', { type: 'datetime-local' })}
        {field('planned_end_at', 'Planned end', { type: 'datetime-local' })}
        {field('planned_distance_km', `Planned distance (${u.distance.label})`, {
          type: 'number',
          step: 'any',
          min: 0,
        })}
        {field('odometer_start_km', `Starting odometer (${u.distance.label})`, {
          type: 'number',
          step: 'any',
          min: 0,
        })}
        <label className="flex flex-col col-span-2">
          <span className={labelCls}>Notes</span>
          <textarea
            value={values.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </label>
      </div>

      {invalidRange && (
        <div className="text-[11px] text-danger mb-2">
          The planned end cannot be before the planned start.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs text-ink-2 border border-line rounded-md py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave || invalidRange || stopsInvalid || conflict.conflicted}
          className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
