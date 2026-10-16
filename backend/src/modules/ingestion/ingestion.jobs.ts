/**
 * BullMQ job payloads for module 2.4's async pipeline (ARCHITECTURE.md §8:
 * the entrypoint does the minimum synchronously, then enqueues — no sync
 * fan-out). Three queues:
 *
 * 1. `"ingestion"` — the real worker this module owns: loads the raw
 *    packet, cleans it (`PayloadMapper`), writes `DeviceValue`, extracts a
 *    position if present, then fans out to the next two queues.
 * 2. `"rule-actions"` — module 2.5's real device-rule alarm evaluation
 *    (`modules/rules/rules.worker.ts`, replaced D-0055's stub).
 * 3. `"realtime"` — module 2.6's real Socket.IO bridge
 *    (`platform/realtime/realtime.worker.ts`, replaced D-0055's stub).
 *    `RealtimeJobData` below is the `"broadcast-packet"` job name's shape
 *    (module 2.4's own per-packet enqueue); `InitialPacketJobData` is a
 *    second, distinct job name (`"initial-packet"`) on the *same* queue,
 *    added by module 2.6 for the `IngestResult.kind === "initial_packet"`
 *    case (`ingestion.service.ts`'s `ingestResolvedPacket`) — the real,
 *    non-zero-id half of Laravel's `InitialPacketEvent` (`realtime-
 *    channels.md` §3.3; the productId=0/userId=0 error-branch broadcasts
 *    are deliberately not ported, see D-0066).
 *
 * `DashboardUpdateJobData`/`BuildingUpdateJobData` (D-0139, `realtime-
 * channels.md` §3.1/§3.2) are two more distinct job names on the same
 * `"realtime"` queue, added once module 2.7 (dashboards)/3.1 (assets)
 * existed for `IngestionService` to query — the per-packet widget-alert
 * loop and building/asset-component bridge Laravel's `DashboardEvent`/
 * `BuildingDevicesRealtimeEvent` broadcast, ported as one dashboard-scoped
 * and one building-scoped event instead of Laravel's per-id event names
 * (D-0066's naming scheme, unchanged).
 */
export interface IngestionJobData {
  rawPacketId: string;
}

export interface RuleActionsJobData {
  deviceId: string;
  productId: string;
  userId: string;
  cleanedPacket: Record<string, unknown>;
  flattenedPacket: Record<string, unknown>;
}

export interface RealtimeJobData {
  productId: string;
  userId: string;
  deviceId: string;
  cleanedPacket: Record<string, unknown>;
}

export interface InitialPacketJobData {
  productId: string;
  userId: string;
}

/** One entry per widget touched by this packet, grouped under its dashboard — `DashboardEvent`'s `widget_data`, one job per `dashboard_id` (§3.1). */
export interface DashboardUpdateJobData {
  userId: string;
  dashboardId: string;
  widgets: {
    widgetId: string;
    values: { attribute_name: string; attribute_value: unknown; is_alert: 0 | 1 }[];
  }[];
}

/** `BuildingDevicesRealtimeEvent`'s `buildingAssetData` (§3.2) — `asset` is `AssetsService.getAsset()`'s own `asset` shape (Laravel-parity snake_case field names), reused as-is. */
export interface BuildingUpdateJobData {
  userId: string;
  buildingId: string;
  deviceId: string;
  deviceIdentifier: string;
  asset: Record<string, unknown>;
}
