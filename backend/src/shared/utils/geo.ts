/**
 * Ported ahead of module 4.3 (fleet-geofences), for module 2.4's
 * position→geofence bridge (`ingestion.md` §4.2, `reference/deep-dives/
 * geofence-detection.md`). Pure math + the enter/exit decision only — no
 * DB access, no `geofences`/`geofence_events`/`vehicle_device_assignments`
 * table reads (those tables don't exist as CRUD yet; 4.1/4.3 own wiring
 * this into real data). Module 2.4's own ingestion pipeline writes
 * `DevicePosition` rows but does not yet call `deriveGeofenceTransition` —
 * there is nothing to check positions against until then.
 *
 * `GeoMath::haversine()` ported as-is (correct, per the deep-dive's
 * algebraic verification). `deriveGeofenceTransition` is **not** a literal
 * port of `GeofenceService::checkPosition`'s step 7 — that version has a
 * real bug (KNOWN_ISSUES 11.35): filtering *which* events get written by
 * `alert_on` while also using *only the written events* as the source of
 * truth for current state means an `alert_on: 'enter'`-only or `'exit'`-
 * only geofence permanently loses track of state after its first
 * transition (see the deep-dive §2 for the exact failure sequence). This
 * implementation separates the two concerns as the deep-dive's own fix
 * recommendation (§2.3) describes: `wasInside` must always be derived from
 * the *true, unfiltered* transition history, and `alert_on` only decides
 * whether to persist/surface the event — never whether state changed.
 */
const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export type GeofenceAlertOn = 'enter' | 'exit' | 'both';
export type GeofenceEventType = 'enter' | 'exit';

export interface GeofenceTransitionInput {
  isInside: boolean;
  /** Derived from the true, unfiltered transition history — never from only the events `alert_on` allowed through. Must be `false` when there is no prior event (no history = treated as outside, matching Laravel's own convention). */
  wasInside: boolean;
  alertOn: GeofenceAlertOn;
}

export interface GeofenceTransitionResult {
  /** True whenever the true state flipped — record this for every future call's `wasInside`, regardless of `shouldPersist`. */
  stateChanged: boolean;
  eventType: GeofenceEventType;
  /** Whether this geofence is configured to care about this direction (`alert_on`) — only this decides persistence/notification, never `stateChanged`. */
  shouldPersist: boolean;
}

/**
 * Laravel's original has one more guard here — `if (!$lastEvent && !
 * $isInside) continue;` (a bare first-ever "exit" is never persisted).
 * Confirmed against `GeofenceService.php` directly: it is unreachable dead
 * code. Reaching it requires having already passed the dedup check just
 * above it with `$isInside !== $wasInside`, but `$wasInside` is hard-coded
 * `false` whenever there's no prior event — so passing the dedup check
 * with no prior event forces `$isInside === true`, which contradicts the
 * guard's own `!$isInside` condition. Not ported; the dedup check below
 * already covers the only reachable case (no history, still outside).
 */
export function deriveGeofenceTransition(
  input: GeofenceTransitionInput
): GeofenceTransitionResult | undefined {
  if (input.isInside === input.wasInside) return undefined; // no real transition — dedup, matches step 5

  const eventType: GeofenceEventType = input.isInside ? 'enter' : 'exit';
  const shouldPersist = input.alertOn === 'both' || input.alertOn === eventType;
  return { stateChanged: true, eventType, shouldPersist };
}
