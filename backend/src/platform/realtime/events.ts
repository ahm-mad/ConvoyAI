/**
 * Typed Socket.IO event registry for module 2.6 (D-0066). Replaces the old
 * app's 3 different per-resource-id event-**name** conventions
 * (`dashboard-values-event.{id}`, `building_values_event.{id}`,
 * `initial-packet-event.{id}` — `reference/deep-dives/realtime-channels.md`
 * §3/§4) with one consistent name per concern; the resource id travels in
 * the payload instead, letting clients filter client-side.
 *
 * D-0066 also resolves `DashboardEvent`'s two-different-producer-shapes
 * divergence (§3.1) by NOT reusing one ambiguous event for both: `ALARM_STATE`
 * (rule-triggered alert/normal transitions, module 2.5's
 * `RuleAlarmRealtimeJobData`) is its own distinct, always-real event instead
 * of being conflated into the same event Laravel did.
 *
 * `DASHBOARD_UPDATE`/`BUILDING_UPDATE` (D-0139) are the real
 * `dashboard:update`/`building:update` events this doc originally deferred
 * to "2.7/3.1's job" — added once those modules existed for module 2.4's
 * per-packet pipeline to query (`ingestion.service.ts`'s
 * `enqueueDashboardUpdates`/`enqueueBuildingUpdate`, `realtime-channels.md`
 * §3.1/§3.2). Kept as their own distinct events (not folded into
 * `DEVICE_VALUE`) for the same reason `ALARM_STATE` is separate: each has
 * its own real producer and payload shape.
 */
export const REALTIME_EVENTS = {
  /** Ingestion's per-packet cleaned-value update (module 2.4's `"broadcast-packet"` job). */
  DEVICE_VALUE: 'device:value',
  /** Rules' alarm-state transition (module 2.5's `RuleAlarmRealtimeJobData`, D-0063). */
  ALARM_STATE: 'alarm:state',
  /** The "token's first packet since issuance" case (`InitialPacketEvent`'s real, non-zero-id success path only — see D-0066's Design notes on why the error-branch broadcasts aren't ported). */
  PACKET_INITIAL: 'packet:initial',
  /** Module 6.1's real in-app notification delivery (D-0089/D-0014's `systemNotification` rule action, module 2.5's `RuleNotificationRealtimeJobData`). The durable row already exists by the time this fires — `notificationId` lets a connected client dedupe against a `GET /notifications` it may have already fetched. */
  NOTIFICATION_NEW: 'notification:new',
  /** Per-dashboard widget-alert update (D-0139, `DashboardEvent`'s `dashboard-values-event.{id}` — `realtime-channels.md` §3.1). One event per `dashboard_id` touched by the packet, same as Laravel's own per-dashboard broadcast loop. */
  DASHBOARD_UPDATE: 'dashboard:update',
  /** Per-building asset-tree update (D-0139, `BuildingDevicesRealtimeEvent`'s `building_values_event.{id}` — `realtime-channels.md` §3.2). Fires only when the packet's device is linked via an `AssetComponent` to an asset. */
  BUILDING_UPDATE: 'building:update',
  /**
   * Fleet events (D-0161, `05-fleet-api-design.md` §7) — sent to the `company:{companyId}` room, NOT to a user: every socket
   * of that company that holds the fleet permission receives them. A tracker's position, but only for trackers currently installed in a vehicle.
   */
  FLEET_POSITION: 'fleet:position',
  /** A geofence enter/exit by a vehicle (every real transition is broadcast, regardless of the geofence's `alert_on` — that only filters `GET /geofences/events`). */
  GEOFENCE_EVENT: 'geofence:event',
  /** A trip changed: started / a stop was arrived, departed or corrected / destination reached / completed / cancelled. `awaitingCompletion: true` + `reason: "destination_reached"` is the "prompt the operator to confirm completion" signal. */
  TRIP_UPDATE: 'trip:update',
  /**
   * D-0163: a fleet record was created/edited/deactivated/reactivated/deleted (vehicle, driver, yard, yard slot, geofence) — a lightweight "refetch that
   * list" signal to the company room so a second operator's screens stay live without polling. Trips have their own richer `trip:update`.
   */
  FLEET_CHANGED: 'fleet:changed',
  /**
   * D-0185 (flow 07 A9): the exclusive fleet status counts, sent to the company room whenever they CHANGE (checked once a minute by a scheduled job,
   * so a tracker going silent — a timer-driven moving → offline change — is announced too). Counts only; refetch `GET /fleet/status-summary` for detail.
   */
  FLEET_STATUS_SUMMARY: 'fleet:status_summary',
} as const;

export interface DeviceValueEvent {
  deviceId: string;
  productId: string;
  cleanedPacket: Record<string, unknown>;
}

export interface AlarmStateEvent {
  ruleId: string;
  deviceId: string;
  state: 'alert' | 'normal';
  message: string;
}

export interface PacketInitialEvent {
  productId: string;
}

export interface NotificationEvent {
  notificationId: string;
  title: string;
  message: string;
}

export interface DashboardUpdateEvent {
  dashboardId: string;
  widgets: {
    widgetId: string;
    values: { attribute_name: string; attribute_value: unknown; is_alert: 0 | 1 }[];
  }[];
}

export interface BuildingUpdateEvent {
  buildingId: string;
  deviceId: string;
  deviceIdentifier: string;
  /** `AssetsService.getAsset()`'s own `asset` shape (Laravel-parity snake_case field names: `id`, `name`, `type`, `children[].is_alert`, …) — reused as-is, not re-cased to match this event's own camelCase envelope. */
  asset: Record<string, unknown>;
}

/** D-0161. Dates are ISO 8601 strings (`…Z`); ids are strings like every `/trips` and fleet CRUD response. `tripId` is `null` when the vehicle had no trip in progress. */
export interface FleetPositionEvent {
  vehicleId: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  tripId: string | null;
}

export interface GeofenceEventPayload {
  id: string;
  geofenceId: string;
  geofenceName: string;
  yardId: string | null;
  vehicleId: string;
  vehicleName: string | null;
  eventType: 'enter' | 'exit';
  occurredAt: string;
  tripId: string | null;
}

export type TripUpdateReason =
  | 'created'
  | 'started'
  | 'stop_arrived'
  | 'stop_departed'
  | 'stop_updated'
  | 'updated'
  | 'destination_reached'
  | 'completed'
  | 'cancelled'
  | 'deleted';

export interface TripUpdateEvent {
  tripId: string;
  reason: TripUpdateReason;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  awaitingCompletion: boolean;
  destinationReachedAt: string | null;
  /** The full stop object (`05` §5 4.4) for the three `stop_*` reasons; `null` otherwise. */
  stop: Record<string, unknown> | null;
  occurredAt: string;
}

/** D-0163. `id` is a string like every fleet id; a vehicle/driver assignment change (tracker or driver assigned/unassigned) is reported as `updated` on the vehicle and/or driver. */
export type FleetChangedEntity = 'vehicle' | 'driver' | 'yard' | 'yard_slot' | 'geofence';
/** D-0182 (L3): `checked_in` / `checked_out` are sent with entity `yard_slot` (id = the slot) when a vehicle is checked in / out of a yard slot. */
export type FleetChangedAction =
  'created' | 'updated' | 'deactivated' | 'reactivated' | 'deleted' | 'checked_in' | 'checked_out';

export interface FleetChangedEvent {
  entity: FleetChangedEntity;
  id: string;
  action: FleetChangedAction;
  occurredAt: string;
}

/** D-0185 (A9): the same five exclusive states as `GET /fleet/dashboard` → `fleet_status` (they sum to `total`). */
export interface FleetStatusSummaryEvent {
  total: number;
  moving: number;
  idle: number;
  parked: number;
  offline: number;
  no_tracker: number;
  occurredAt: string;
}
