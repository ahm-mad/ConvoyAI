/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { put } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useEditConflict } from '@hooks/useEditConflict';
import PickOnMapButton from '@components/CoordinatePicker';

const INPUT = 'w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-xs text-ink-0';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Edit a yard (PUT /yards/{id}, flows/05 §8): name, address, location and detection radius. Moving or
 * resizing it also moves/resizes the yard's linked geofence in the same call (backend does that), and
 * a yard that gains coordinates gets a geofence created. Latitude and longitude are always sent
 * together — backend answers 422 for just one.
 */
export default function YardEditForm({
  yard,
  onSaved,
  onCancel,
}: {
  yard: any;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const conflict = useEditConflict(yard, onCancel);
  const [name, setName] = useState(str(yard.name));
  const [address, setAddress] = useState(str(yard.address));
  const [lat, setLat] = useState(str(yard.latitude));
  const [lng, setLng] = useState(str(yard.longitude));
  const u = useUnits();
  // Stored in metres; shown and typed in the company's short-length unit (m or ft).
  const initialRadius = toDisplayString(u.length, yard.radius_m, 0);
  const [radius, setRadius] = useState(initialRadius);
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    const payload: Record<string, unknown> = {};

    if (name.trim() !== str(yard.name)) payload.name = name.trim();
    if (address.trim() !== str(yard.address)) payload.address = address.trim() || null;

    if (lat.trim() !== str(yard.latitude) || lng.trim() !== str(yard.longitude)) {
      if (!lat.trim() || !lng.trim()) {
        toast.error('Enter both latitude and longitude (or leave both as they were).');

        return;
      }
      payload.latitude = Number(lat);
      payload.longitude = Number(lng);
    }

    if (radius.trim() !== initialRadius && radius.trim() !== '') {
      const r = Math.round(toMetric(u.length, radius) ?? NaN);

      if (!Number.isFinite(r) || r < 10) {
        toast.error(`Radius must be at least ${formatQty(u.length, 10, 0)}.`);

        return;
      }
      payload.radius_m = r;
    }

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSubmitting(true);
    const response: any = await put(
      `/api/yards/${yard.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );
    setSubmitting(false);

    if (conflict.handle(response)) return;

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not update the yard.');

      return;
    }

    toast.success('Yard updated.');
    invalidateFleetQueries(qc);
    onSaved?.();
  };

  return (
    <div className="w-full max-w-md mx-auto bg-surface-1 border border-line-soft rounded-md p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-3">Edit yard</div>
      {conflict.banner}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Yard name"
        className={`${INPUT} mb-2`}
      />
      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="Address (optional)"
        className={`${INPUT} mb-2`}
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          value={lat}
          onChange={e => setLat(e.target.value)}
          placeholder="Latitude"
          className={INPUT}
        />
        <input
          value={lng}
          onChange={e => setLng(e.target.value)}
          placeholder="Longitude"
          className={INPUT}
        />
        <PickOnMapButton
          latitude={lat}
          longitude={lng}
          title="Pick the yard location"
          onPick={(la, lo) => {
            setLat(String(la));
            setLng(String(lo));
          }}
          className="col-span-2"
        />
      </div>
      <label className="block mb-3">
        <span className="block text-[10px] uppercase tracking-wide text-ink-2 mb-1">
          Detection radius ({u.length.label}, min {toDisplayString(u.length, 10, 0)})
        </span>
        <input
          value={radius}
          onChange={e => setRadius(e.target.value)}
          type="number"
          min={10}
          className={INPUT}
        />
        <span className="block text-[10px] text-ink-2 mt-1">
          Sensors detect vehicles entering/leaving this yard within this radius.
        </span>
      </label>
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
          disabled={submitting || conflict.conflicted || !name.trim()}
          className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
