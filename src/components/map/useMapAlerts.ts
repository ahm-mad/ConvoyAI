'use client';

import { useMemo } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { isShowcase } from '@utils/showcase';
import type { LiveVehicle } from './vehicle/vehicleKinds';

/** Speed above which a moving vehicle raises an alert (km/h, the API's unit). There is no per-company limit setting yet. */
export const SPEED_ALERT_KMH = 80;

export interface MapAlert {
  id: string;
  kind: 'speed' | 'late' | 'geofence';
  tone: 'danger' | 'warn' | 'info';
  title: string;
  /** Extra text; for speed alerts the caller formats the speed itself (company units), so it is passed as `kmh`. */
  sub: string;
  kmh?: number;
  vehicleId?: string;
  /** ms since epoch, for ordering and "x ago". */
  at: number;
}

const TONE_RANK = { danger: 0, warn: 1, info: 2 } as const;

/**
 * What needs an operator's eye right now, derived from data the map already has: vehicles over the speed limit, trips
 * running past their planned end and recent geofence entries / exits. Newest and most severe first.
 */
export function useMapAlerts(vehicles: LiveVehicle[], activeTrips: any[]): MapAlert[] {
  const events = useSimpleQuery<any>(
    'geofence-events-map',
    '/api/geofences/events',
    { limit: 6, sort_by: 'occurred_at', sort_order: 'desc' },
    { refetchInterval: isShowcase() ? 20_000 : 60_000 }
  );
  // List envelope: `{ items, pagination }` (also tolerate a bare array or `{ data: [...] }`).
  const payload = events.data?.success ? events.data.data : null;
  const rows: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return useMemo(() => {
    const out: MapAlert[] = [];
    const now = Date.now();

    vehicles.forEach(v => {
      if (v.state === 'moving' && v.speed > SPEED_ALERT_KMH)
        out.push({
          id: `speed-${v.id}`,
          kind: 'speed',
          tone: 'danger',
          title: v.name.split(' · ')[0],
          sub: 'over the speed limit',
          kmh: v.speed,
          vehicleId: v.id,
          at: now,
        });
    });
    activeTrips.forEach(t => {
      const end = Date.parse(t.planned_end_at);

      if (t.status === 'in_progress' && Number.isFinite(end) && end < now)
        out.push({
          id: `late-${t.id}`,
          kind: 'late',
          tone: 'warn',
          title: `${t.trip_reference || `Trip #${t.id}`} is running late`,
          sub: `${Math.max(1, Math.round((now - end) / 60000))} min past the planned end · ${t.vehicle?.name?.split(' · ')[0] ?? 'vehicle'}`,
          vehicleId: t.vehicle_id ? String(t.vehicle_id) : undefined,
          at: end,
        });
    });
    // Geofence traffic is routine: only the three most recent entries / exits, so real problems stay the focus.
    rows.slice(0, 3).forEach(e => {
      const at = Date.parse(e.occurred_at);

      if (!Number.isFinite(at) || now - at > 24 * 3600_000) return;

      out.push({
        id: `geo-${e.id}`,
        kind: 'geofence',
        tone: 'info',
        title: `${e.vehicle?.name?.split(' · ')[0] ?? 'A vehicle'} ${e.event_type === 'exit' ? 'left' : 'entered'} ${e.geofence?.name ?? 'a geofence'}`,
        sub: '',
        vehicleId: e.vehicle_id ? String(e.vehicle_id) : undefined,
        at,
      });
    });

    return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.at - a.at);
  }, [vehicles, activeTrips, rows]);
}
