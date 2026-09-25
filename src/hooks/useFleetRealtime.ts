/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@contexts/SocketContext';
import { invalidateFleetQueries, isFleetKey } from '@utils/fleetCache';
import { parseBbox, pointInBbox } from '@utils/mapViewport';

const invalidateByName = invalidateFleetQueries;

/**
 * Live Fleet updates (flows/05 step 6, API_CONTRACT §4.6). Mounted once by the Fleet Management page:
 *  - fleet:position  → move the vehicle in the cached positions / vehicle detail / trip route in place
 *                      (positions are frequent — never refetch per packet);
 *  - trip:update     → refetch the trip list + its status counts, the trip's detail + route, and the dashboard;
 *  - geofence:event  → refetch the geofence events list;
 *  - reconnect       → refetch everything fleet-related (the server never replays events).
 * Delivery is best-effort, so the screens keep a slow safety poll and react-query still refetches on
 * window focus. Handlers are idempotent — our own actions echo back as events, so they re-fetch state
 * instead of appending to it.
 */

// A bulk action (up to 500 records) emits one fleet:changed / trip:update per record. Invalidating per
// event refetched the lists once per record (61 requests for a 60-record bulk — flows/06 §16), so the
// rules of a burst are collected and applied ONCE after a short quiet period (never later than
// MAX_WAIT_MS after the first event of the burst, so a steady stream still refreshes).
const QUIET_MS = 350;
const MAX_WAIT_MS = 1500;

const patchPosition = (p: any, recordedAt: string) => ({
  latitude: p.latitude,
  longitude: p.longitude,
  speed: p.speed,
  heading: p.heading,
  recorded_at: recordedAt,
});

export function useFleetRealtime() {
  const qc = useQueryClient();
  const { subscribeFleetEvent } = useSocket();

  useEffect(() => {
    let firstConnect = true;
    let positionsRefetchTimer: ReturnType<typeof setTimeout> | null = null;

    // Coalesced invalidation (see QUIET_MS): callers pass the rule for THEIR event; one flush applies all.
    const pendingRules: ((name: string) => boolean)[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let burstStart = 0;

    const flushInvalidations = () => {
      flushTimer = null;

      const rules = pendingRules.splice(0);

      if (rules.length) invalidateByName(qc, n => rules.some(rule => rule(n)));
    };

    const scheduleInvalidate = (rule: (name: string) => boolean) => {
      const now = Date.now();

      pendingRules.push(rule);

      if (flushTimer) clearTimeout(flushTimer);
      else burstStart = now;

      flushTimer = setTimeout(
        flushInvalidations,
        Math.min(QUIET_MS, Math.max(0, MAX_WAIT_MS - (now - burstStart)))
      );
    };

    const offPosition = subscribeFleetEvent('fleet:position', (p: any) => {
      const point = patchPosition(p, p.recordedAt);

      // 1. Fleet map markers. The map requests positions per viewport (`bbox`, flows/06 §29), so there
      //    can be several cached variants: patch the tracker wherever it is cached; a tracker that is not
      //    cached but now lies inside the box on screen (newly assigned, or moved into view) triggers ONE
      //    debounced refetch of that variant; one outside every box is ignored (no refetch per packet).
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      let refetchNeeded = false;

      qc.getQueriesData<any>({ queryKey: ['fleet-positions'] }).forEach(([key, old]) => {
        if (!old?.success || !Array.isArray(old.data)) return;

        let found = false;
        const data = old.data.map((row: any) => {
          if (String(row.device_id) !== String(p.deviceId)) return row;
          found = true;

          return { ...row, ...point };
        });

        if (found) {
          qc.setQueryData(key, { ...old, data });

          return;
        }

        // Only the view on screen decides (earlier pans stay cached but inactive; they just go stale).
        if (!qc.getQueryCache().find({ queryKey: key, exact: true })?.isActive()) return;

        const box = parseBbox((key[1] as any)?.bbox);

        if (!box || pointInBbox(lat, lng, box)) refetchNeeded = true;
      });

      if (refetchNeeded && !positionsRefetchTimer) {
        positionsRefetchTimer = setTimeout(() => {
          positionsRefetchTimer = null;
          invalidateByName(qc, n => n === 'fleet-positions');
        }, 1500);
      }

      // 2. Open vehicle detail: current position.
      qc.setQueryData([`vehicle-detail-${p.vehicleId}`, {}], (old: any) => {
        if (!old?.success || !old.data) return old;

        return {
          ...old,
          data: {
            ...old.data,
            current_position: { ...(old.data.current_position || {}), ...point },
          },
        };
      });

      // 3. Selected trip's route: extend the driven trail + move the vehicle.
      if (p.tripId) {
        qc.setQueryData([`trip-route-${p.tripId}`, {}], (old: any) => {
          if (!old?.success || !old.data) return old;

          const trail = old.data.trail;
          const next = {
            latitude: p.latitude,
            longitude: p.longitude,
            speed: p.speed,
            heading: p.heading,
            recorded_at: p.recordedAt,
          };

          return {
            ...old,
            data: {
              ...old.data,
              current_position: next,
              trail: trail
                ? {
                    ...trail,
                    total_points: (trail.total_points ?? trail.positions?.length ?? 0) + 1,
                    positions: [...(trail.positions || []), next],
                  }
                : trail,
            },
          };
        });
      }

      // 4. Marker-click trail for that vehicle's tracker.
      qc.setQueryData([`fleet-history-${p.deviceId}`, {}], (old: any) => {
        if (!old?.success || !Array.isArray(old.data)) return old;

        return {
          ...old,
          data: [
            ...old.data,
            {
              device_id: Number(p.deviceId),
              latitude: p.latitude,
              longitude: p.longitude,
              speed: p.speed,
              heading: p.heading,
              recorded_at: p.recordedAt,
            },
          ],
        };
      });
    });

    const offGeofence = subscribeFleetEvent('geofence:event', () => {
      scheduleInvalidate(n => n === 'geofence-events');
    });

    const offTrip = subscribeFleetEvent('trip:update', (u: any) => {
      const id = String(u.tripId);

      scheduleInvalidate(
        n =>
          n.startsWith('trips-list') ||
          n.startsWith('trips-counts') ||
          n === 'fleet-map-trips' ||
          n === `trip-${id}` ||
          n === `trip-route-${id}` ||
          n.startsWith('fleet-dashboard')
      );
    });

    // fleet:changed { entity, id, action } is a "refetch that list" signal (no record data): a
    // vehicle/driver/yard/slot/geofence was created, edited, (de)activated or deleted — or a tracker /
    // driver assignment changed — possibly by another operator. Our own action echoes back too, so
    // this only invalidates (idempotent) and never appends.
    const offChanged = subscribeFleetEvent('fleet:changed', (c: any) => {
      const has = (n: string, ...prefixes: string[]) => prefixes.some(p => n.startsWith(p));

      scheduleInvalidate(n => {
        // Every entity can change what the dashboard counts.
        if (n.startsWith('fleet-dashboard')) return true;

        switch (c.entity) {
          case 'vehicle':
            // Assigned-only positions and the assignable-tracker list depend on vehicles too.
            // (`driver…` too: a driver's `assigned` flag in the options / list follows the vehicle.)
            return has(n, 'vehicle', 'driver', 'fleet-positions', 'assignable-trackers');
          case 'driver':
            // A driver's assignment is shown on the vehicle rows and in the trip form.
            return has(n, 'driver', 'vehicle');
          case 'yard':
            // Creating/editing a yard also creates/edits its linked geofence.
            return has(n, 'yard', 'fleet-yards', 'geofence', 'fleet-geofences');
          case 'yard_slot':
            return has(n, 'yard');
          case 'geofence':
            return has(n, 'geofence', 'fleet-geofences');
          default:
            return isFleetKey(n);
        }
      });
    });

    // fleet:status_summary { total, moving, idle, parked, offline, no_tracker, occurredAt }: sent by the
    // backend once a minute and only when the counts changed (a tracker that simply went quiet produces no
    // other event). Counts only — refetch the status summary and the attention feed behind it.
    const offStatus = subscribeFleetEvent('fleet:status_summary', () => {
      scheduleInvalidate(
        n =>
          n.startsWith('fleet-dashboard-ov-status') || n.startsWith('fleet-dashboard-ov-attention')
      );
    });

    // Raised on every (re)connect: the first one is the initial load (already fresh), later ones
    // mean we may have missed events while offline.
    const offConnected = subscribeFleetEvent('fleet:connected', () => {
      if (firstConnect) {
        firstConnect = false;

        return;
      }

      invalidateByName(qc, isFleetKey);
    });

    return () => {
      offPosition();
      offGeofence();
      offTrip();
      offChanged();
      offStatus();
      offConnected();
      if (positionsRefetchTimer) clearTimeout(positionsRefetchTimer);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [qc, subscribeFleetEvent]);
}
