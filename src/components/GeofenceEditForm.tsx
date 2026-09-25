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

const INPUT = 'w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Edit a geofence (PUT /geofences/{id}, flows/05 §8): name, radius, alert trigger and — for a
 * MANUAL geofence only — its centre. A yard-linked geofence's centre follows the yard (backend 422:
 * "This geofence is linked to a yard. Change the yard's location to move it."), so the centre
 * fields are hidden for it.
 */
export default function GeofenceEditForm({
  geofence,
  onSaved,
  onCancel,
}: {
  geofence: any;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const conflict = useEditConflict(geofence, onCancel);
  const linked = !!geofence.yard_id;
  const [name, setName] = useState(str(geofence.name));
  const u = useUnits();
  // Stored in metres; shown and typed in the company's short-length unit (m or ft).
  const initialRadius = toDisplayString(u.length, geofence.radius_m, 0);
  const [radius, setRadius] = useState(initialRadius);
  const [alertOn, setAlertOn] = useState(str(geofence.alert_on) || 'both');
  const [lat, setLat] = useState(str(geofence.center_latitude));
  const [lng, setLng] = useState(str(geofence.center_longitude));
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    const payload: Record<string, unknown> = {};

    if (name.trim() !== str(geofence.name)) payload.name = name.trim();
    if (radius.trim() !== initialRadius && radius.trim() !== '') {
      payload.radius_m = Math.round(toMetric(u.length, radius) as number);
    }
    if (alertOn !== str(geofence.alert_on)) payload.alert_on = alertOn;

    if (
      !linked &&
      (lat.trim() !== str(geofence.center_latitude) ||
        lng.trim() !== str(geofence.center_longitude))
    ) {
      if (!lat.trim() || !lng.trim()) {
        toast.error('Enter both latitude and longitude for the centre.');

        return;
      }
      payload.center_latitude = Number(lat);
      payload.center_longitude = Number(lng);
    }

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSubmitting(true);
    const response: any = await put(
      `/api/geofences/${geofence.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );
    setSubmitting(false);

    if (conflict.handle(response)) return;

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not update the geofence.');

      return;
    }

    toast.success('Geofence updated.');
    invalidateFleetQueries(qc);
    onSaved?.();
  };

  return (
    <div className="bg-surface-2 border border-line-soft rounded-md p-3 mt-1 mb-1">
      {conflict.banner}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Geofence name"
          className={`${INPUT} col-span-2`}
        />
        <label className="block">
          <span className="block text-[10px] uppercase text-ink-2 mb-1">
            Radius ({u.length.label})
          </span>
          <input
            value={radius}
            onChange={e => setRadius(e.target.value)}
            type="number"
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase text-ink-2 mb-1">Alert on</span>
          <select value={alertOn} onChange={e => setAlertOn(e.target.value)} className={INPUT}>
            <option value="both">Enter and exit</option>
            <option value="enter">Enter only</option>
            <option value="exit">Exit only</option>
          </select>
        </label>

        {linked ? (
          <div className="col-span-2 text-[10px] text-ink-2">
            This geofence is linked to a yard — its centre follows the yard. Change the yard's
            location (Yards tab → Edit yard) to move it.
          </div>
        ) : (
          <>
            <input
              value={lat}
              onChange={e => setLat(e.target.value)}
              placeholder="Centre latitude"
              className={INPUT}
            />
            <input
              value={lng}
              onChange={e => setLng(e.target.value)}
              placeholder="Centre longitude"
              className={INPUT}
            />
            <PickOnMapButton
              latitude={lat}
              longitude={lng}
              title="Pick the geofence centre"
              onPick={(la, lo) => {
                setLat(String(la));
                setLng(String(lo));
              }}
              className="col-span-2"
            />
          </>
        )}
      </div>
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
