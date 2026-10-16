import { createHash } from 'node:crypto';
import { mapPayload } from '../../shared/utils/payload-mapper.js';
import { evaluate } from '../../shared/utils/rule-condition-evaluator.js';
import { verifyIngestionToken } from '../../platform/crypto/ingestion-token.js';
import { logger } from '../../platform/logging/logger.js';
import { runWithContextAsync } from '../../platform/http/request-context.js';
import type { IngestionRepository } from './ingestion.repository.js';
import type {
  IngestionAssetsLookup,
  IngestionDevicesLookup,
  IngestionGeofencesLookup,
  IngestionProductsLookup,
  IngestionProtocolsLookup,
  IngestionWidgetsLookup,
} from './lookups.js';
import type {
  BuildingUpdateJobData,
  DashboardUpdateJobData,
  IngestionJobData,
  InitialPacketJobData,
  RealtimeJobData,
  RuleActionsJobData,
} from './ingestion.jobs.js';
import type { AttributePreference, IngestResult } from './ingestion.types.js';

const DEDUP_WINDOW_MINUTES = 5;

export interface IngestionQueuePort {
  enqueueIngestion(data: IngestionJobData): Promise<void>;
  enqueueRuleActions(data: RuleActionsJobData): Promise<void>;
  enqueueRealtime(data: RealtimeJobData): Promise<void>;
  enqueueInitialPacket(data: InitialPacketJobData): Promise<void>;
  enqueueDashboardUpdate(data: DashboardUpdateJobData): Promise<void>;
  enqueueBuildingUpdate(data: BuildingUpdateJobData): Promise<void>;
}

/**
 * A deterministic, sorted-key JSON string — Node's `JSON.stringify` doesn't
 * sort object keys the way PHP's `json_encode(..., JSON_SORT_KEYS)` does.
 * Only needs to be *stable for the same logical input*, not byte-identical
 * to Laravel's own hash (11.31's `PacketIngestionService` was never wired
 * in, so no legacy row's hash ever needs to be matched against — this is a
 * new mechanism, not a port requiring cross-language parity).
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 11.31: port of `PacketIngestionService::generatePacketHash`'s intent — content + metadata + a per-minute time bucket, so identical packets sent in the same minute dedup, while distinct minutes don't false-positive. */
function computePacketHash(params: {
  productId: string;
  userId: string;
  protocolId: string;
  body: Record<string, unknown>;
  token: string | undefined;
}): string {
  const dataHash = createHash('md5').update(canonicalJson(params.body)).digest('hex');
  const timeWindow = new Date().toISOString().slice(0, 16); // minute resolution, UTC
  const hashInput = {
    product_id: params.productId,
    user_id: params.userId,
    protocol_id: params.protocolId,
    data_hash: dataHash,
    token: params.token ?? null,
    time_window: timeWindow,
  };
  return createHash('sha256').update(canonicalJson(hashInput)).digest('hex');
}

/**
 * Two genuinely different outcomes, kept distinct on purpose (a real
 * divergence found while porting `WebhookController::storePacketData`):
 * no `is_unique_identifier` preference configured at all is a **product
 * misconfiguration** (`no_unique_identifier`, 201 soft-fail) — but a
 * preference that IS configured, whose value just isn't present in *this*
 * packet's body, is not that case in Laravel: it proceeds straight to the
 * device lookup with a null/missing value, which simply finds no device
 * (404). Collapsing both into "no unique identifier" would be a real
 * behavior deviation, not a simplification.
 */
function findUniqueIdentifierAttributeKey(preferences: AttributePreference[]): string | undefined {
  return preferences.find(p => p.isUniqueIdentifier && p.attributeKey)?.attributeKey ?? undefined;
}

/** `$label = $preference ? ... : last(explode('.', $attrKey))` — same fallback `dashboards.service.ts`'s `resolveSettingLabel` uses when there's no preference-label override. */
function fallbackLabel(attributeKey: string): string {
  if (!attributeKey.includes('.')) return attributeKey;
  const segments = attributeKey.split('.');
  return segments[segments.length - 1] ?? attributeKey;
}

function readDottedValue(body: Record<string, unknown>, dottedKey: string): string | undefined {
  const value = dottedKey.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, body);

  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return undefined;
}

/**
 * D-0154 (fleet completion step 3, owner decision D1): position fields are identified by the attribute's explicit
 * **role** ("Mark as location"), not by the user-typed label Laravel's `recordDevicePositionIfPresent` matched —
 * a typo or translation of the label used to disable tracking silently. A one-time migration backfilled roles from
 * the old labels (`prisma/manual-migrations/003-attribute-role.sql`), so existing products keep tracking. Reads the
 * value out of the CLEANED packet (not flattened), like Laravel.
 */
function findValueByRole(
  role: NonNullable<AttributePreference['attributeRole']>,
  cleaned: Record<string, unknown>,
  preferences: AttributePreference[]
): number | undefined {
  for (const preference of preferences) {
    if (preference.attributeRole === role && preference.attributeKey) {
      const value = cleaned[preference.attributeKey];
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))
        return Number(value);
    }
  }
  return undefined;
}

/** Business logic for module 2.4 (ARCHITECTURE.md §2). See `tasks/08-ingestion.md` for D-0054/D-0055/D-0056. */
export class IngestionService {
  constructor(
    private readonly repository: IngestionRepository,
    private readonly productsLookup: IngestionProductsLookup,
    private readonly devicesLookup: IngestionDevicesLookup,
    private readonly protocolsLookup: IngestionProtocolsLookup,
    private readonly queue: IngestionQueuePort,
    private readonly geofencesLookup: IngestionGeofencesLookup,
    private readonly widgetsLookup: IngestionWidgetsLookup,
    private readonly assetsLookup: IngestionAssetsLookup
  ) {}

  // -- HTTP path (`WebhookController::storePacketData` equivalent) -----------

  async ingestHttpPacket(token: string, body: Record<string, unknown>): Promise<IngestResult> {
    if (!(await this.repository.tokenExists(token))) {
      return { kind: 'unauthenticated' };
    }

    let claims;
    try {
      claims = verifyIngestionToken(token);
    } catch {
      return { kind: 'invalid_token' };
    }

    return this.ingestResolvedPacket({
      productId: claims.productId,
      userId: claims.userId,
      protocolId: claims.protocolId,
      body,
      token,
    });
  }

  // -- MQTT path (`MqttService::handleDeviceData`/`storePacketData` equivalent) --

  /** No HTTP response to shape — the caller (the MQTT consumer) only needs to know whether to log a failure; matches Laravel's MQTT path being silent-on-failure beyond a log line (`ingestion.md` §3.1/§3.2), unlike the HTTP path's `InitialPacketEvent` on every branch. */
  async ingestMqttPacket(
    deviceUniqueIdentifier: string,
    body: Record<string, unknown>
  ): Promise<IngestResult> {
    const device = await this.devicesLookup.findByUniqueIdentifier(deviceUniqueIdentifier);
    if (!device) {
      logger.warn({ deviceUniqueIdentifier }, 'MQTT ingestion: device not found');
      return { kind: 'device_not_found' };
    }

    const mqttProtocol = await this.protocolsLookup.findByName('MQTT');
    if (!mqttProtocol) {
      // ingestion.md §3.1: Laravel falls back to a hardcoded protocol id 2
      // here. Deliberately not ported — resolve or fail loudly instead of
      // silently mislabeling every MQTT packet's protocol.
      logger.error(
        "MQTT ingestion: no 'MQTT' row in the protocols catalog — cannot resolve protocol_id"
      );
      return { kind: 'invalid_token' };
    }

    return this.ingestResolvedPacket({
      productId: device.productId,
      userId: device.userId,
      protocolId: mqttProtocol.id,
      body,
      token: undefined,
    });
  }

  // -- Shared: 11.31's unified dedup entrypoint ---------------------------------

  private async ingestResolvedPacket(params: {
    productId: string;
    userId: string;
    protocolId: string;
    body: Record<string, unknown>;
    token: string | undefined;
  }): Promise<IngestResult> {
    const packetHash = computePacketHash(params);

    const duplicate = await this.repository.findRecentByHash(packetHash, DEDUP_WINDOW_MINUTES);
    if (duplicate) {
      return { kind: 'duplicate', existingId: duplicate.id };
    }

    const placeholder = await this.repository.findLegacyPlaceholder(
      params.productId,
      params.protocolId,
      params.userId,
      params.token
    );

    // D-0120: the HTTP path's "initial packet" short-circuit (deep-dive §2.2) runs right after the
    // token check, BEFORE preferences/unique-identifier/device resolution — its whole purpose is to
    // capture a brand-new token's first payload so the user can pick fields from it, so a product
    // with no preferences yet (the normal state at this point) must still get `initial_packet`,
    // never `no_preferences`. Scoped to token-bearing (HTTP) packets: a token uniquely identifies
    // "the" placeholder row; the MQTT path has no token and keeps its existing behavior below
    // (11.32). `device_ids` stays empty — no device is known at this point, exactly like Laravel,
    // which only fills `json_body` here.
    if (placeholder && params.token !== undefined) {
      await this.repository.updatePlaceholder(placeholder.id, params.body, packetHash, []);
      await this.queue.enqueueInitialPacket({ productId: params.productId, userId: params.userId });
      return { kind: 'initial_packet', productId: params.productId, userId: params.userId };
    }

    const preferences = await this.productsLookup.listPreferencesForProduct(params.productId);
    if (preferences.length === 0) {
      return { kind: 'no_preferences' };
    }

    const uniqueIdentifierKey = findUniqueIdentifierAttributeKey(preferences);
    if (!uniqueIdentifierKey) {
      return { kind: 'no_unique_identifier' };
    }

    // A value missing from *this* packet's body (not "no preference
    // configured") falls straight through to the device lookup below —
    // matching Laravel exactly, see `readDottedValue`'s doc comment.
    const uniqueIdentifierValue = readDottedValue(params.body, uniqueIdentifierKey) ?? '';
    const device = await this.devicesLookup.findByUniqueIdentifier(uniqueIdentifierValue);
    if (!device) {
      return { kind: 'device_not_found' };
    }

    // Only reachable for the MQTT path now (token undefined) — HTTP returned above (D-0120).
    if (placeholder) {
      await this.repository.updatePlaceholder(placeholder.id, params.body, packetHash, [
        device.deviceUniqueIdentifier,
      ]);
      // Module 2.6: the real, non-zero-id half of Laravel's InitialPacketEvent
      // (`realtime-channels.md` §3.3) — the token's first packet since issuance.
      await this.queue.enqueueInitialPacket({ productId: params.productId, userId: params.userId });
      return { kind: 'initial_packet', productId: params.productId, userId: params.userId };
    }

    // D-0142: this is the first packet to reach here with a real, resolved device on this token —
    // meaning D-0120's earlier "initial packet" short-circuit (above) already ran once for this same
    // token and left its own row's `device_ids` empty (no device was resolvable back then). Backfill
    // that earlier row now that preferences/unique-identifier config exists — but re-resolve it from
    // ITS OWN `json_body`, never from *this* triggering packet's device: on a product with 2+ devices
    // sharing one token (the normal case — one shared webhook token per product), a later packet can
    // belong to a different device than the stale placeholder did, and stamping the wrong one on would
    // silently mislabel real data. No-op once already backfilled; MQTT (no token) never reaches this
    // branch with `placeholder` unset the way HTTP does, so this only runs for the HTTP path D-0120
    // itself is scoped to.
    if (params.token !== undefined) {
      const stalePlaceholders = await this.repository.findPlaceholdersNeedingDeviceIdBackfill(
        params.productId,
        params.protocolId,
        params.userId,
        params.token
      );
      for (const stale of stalePlaceholders) {
        const staleIdentifierValue = readDottedValue(stale.jsonBody ?? {}, uniqueIdentifierKey);
        if (!staleIdentifierValue) continue;
        const staleDevice = await this.devicesLookup.findByUniqueIdentifierForProduct(
          params.productId,
          staleIdentifierValue
        );
        if (!staleDevice) continue;
        await this.repository.updatePlaceholderDeviceIdsById(stale.id, [
          staleDevice.deviceUniqueIdentifier,
        ]);
      }
    }

    const product = await this.productsLookup.findByIdUnscoped(params.productId);
    const rawPacket = await this.repository.create({
      productId: params.productId,
      protocolId: params.protocolId,
      deviceProtocolId: product?.deviceProtocolId ?? null,
      userId: params.userId,
      jsonBody: params.body,
      deviceIds: [device.deviceUniqueIdentifier],
      token: params.token,
      packetHash,
    });

    await this.queue.enqueueIngestion({ rawPacketId: rawPacket.id });

    return { kind: 'accepted', rawPacketId: rawPacket.id };
  }

  // -- MQTT device-status updates (`handleDeviceStatus` equivalent, §3.3) -----

  /** MQTT-exclusive, no packet storage, no rule evaluation, no broadcast — a plain device-row field update. Silent on a missing device, matching Laravel's log-only failure handling for this path. */
  async updateDeviceStatusFromMqtt(deviceUniqueIdentifier: string, status: string): Promise<void> {
    const updated = await this.devicesLookup.updateStatusByUniqueIdentifier(
      deviceUniqueIdentifier,
      status
    );
    if (!updated) {
      logger.warn({ deviceUniqueIdentifier }, 'MQTT device-status update: device not found');
    }
  }

  // -- Async worker: the actual "cleaned packet" step -----------------------

  /**
   * Consumes the `"ingestion"` queue. `PayloadMapper` (D-0049) clean +
   * `DeviceValue` write + position extraction, then fans out to
   * `"rule-actions"`/`"realtime"` (module 2.5/2.6). Geofence checking
   * (`GeofenceService::checkPosition` equivalent, `shared/utils/geo.ts`'s
   * `deriveGeofenceTransition`/11.35's fix, module 4.3, D-0079) now runs
   * whenever a position was extracted — `companyId` resolved from the
   * packet's own product (same pattern module 2.5 used to fix
   * `alarms.company_id` via its own `RulesProductsLookup`), not from any
   * request context (there is none on this worker path).
   */
  async processIngestionJob(data: IngestionJobData): Promise<void> {
    const rawPacket = await this.repository.findById(data.rawPacketId);
    if (!rawPacket) {
      logger.error({ rawPacketId: data.rawPacketId }, 'Ingestion worker: raw packet not found');
      return;
    }
    const deviceUniqueIdentifier = rawPacket.deviceIds[0];
    if (!deviceUniqueIdentifier) {
      logger.error(
        { rawPacketId: data.rawPacketId },
        'Ingestion worker: raw packet has no resolved device'
      );
      return;
    }
    // D-0142: scoped by the packet's own product — `device_unique_identifier` is not guaranteed
    // unique across products (nothing rejects the duplicate on device/product creation), and an
    // unscoped lookup here previously misattributed the `device_values` write, rule evaluation, and
    // every realtime event this worker enqueues to a different product's device row whenever a
    // collision existed. See `findByUniqueIdentifierForProduct`'s doc comment for the full story.
    const device = await this.devicesLookup.findByUniqueIdentifierForProduct(
      rawPacket.productId,
      deviceUniqueIdentifier
    );
    if (!device) {
      logger.error(
        { rawPacketId: data.rawPacketId, productId: rawPacket.productId, deviceUniqueIdentifier },
        'Ingestion worker: device no longer found for this product'
      );
      return;
    }

    const preferences = await this.productsLookup.listPreferencesForProduct(rawPacket.productId);
    const attributeKeys = preferences
      .map(p => p.attributeKey)
      .filter((k): k is string => k !== null);
    const body = (rawPacket.jsonBody ?? {}) as Record<string, unknown>;
    const { cleaned, flattened } = mapPayload(body, attributeKeys);

    await this.repository.createDeviceValue(device.id, device.deviceUniqueIdentifier, cleaned);

    const product = await this.productsLookup.findByIdUnscoped(rawPacket.productId);

    const latitude = findValueByRole('latitude', cleaned, preferences);
    const longitude = findValueByRole('longitude', cleaned, preferences);
    if (latitude !== undefined && longitude !== undefined) {
      const speed = findValueByRole('speed', cleaned, preferences);
      const heading = findValueByRole('heading', cleaned, preferences);
      await this.repository.createDevicePosition(device.id, latitude, longitude, speed, heading);

      if (product) {
        await this.geofencesLookup.checkPosition(
          product.companyId,
          device.id,
          latitude,
          longitude,
          {
            speed: speed ?? null,
            heading: heading ?? null,
            recordedAt: new Date(), // `device_positions.recorded_at` is server `now()` (Laravel parity)
          }
        );
      }
    }

    await this.queue.enqueueRuleActions({
      deviceId: device.id,
      productId: rawPacket.productId,
      userId: rawPacket.userId,
      cleanedPacket: cleaned,
      flattenedPacket: flattened,
    });
    await this.queue.enqueueRealtime({
      productId: rawPacket.productId,
      userId: rawPacket.userId,
      deviceId: device.id,
      cleanedPacket: cleaned,
    });

    // D-0139: the widget-alert loop + building/asset bridge (`realtime-channels.md` §3.1/§3.2) —
    // best-effort, matching Laravel's own try/catch around the building half (WebhookController);
    // a failure here must never fail packet ingestion itself, which is already durably stored.
    try {
      await this.enqueueLiveUpdates(
        rawPacket.userId,
        product?.companyId,
        device.id,
        deviceUniqueIdentifier
      );
    } catch (err) {
      logger.error(
        { err, rawPacketId: data.rawPacketId },
        'Ingestion worker: dashboard/building live update failed'
      );
    }
  }

  /**
   * `WebhookController::storePacketData`'s widget-alert loop (§3.1) + building/asset bridge (§3.2),
   * run together under one real per-packet user context (D-0139) — `rules`/`assets`/
   * `product_attribute_preferences` are tenant-scoped models (tenant-rules.ts) that throw without
   * one; `widgets`/`widget_settings`/`asset_components`/`device_values` are `parent`-ruled and don't
   * need it. `companyId` is only used for the building half (`assets` is `company`-ruled); the
   * widget half only ever needs `userId` (`rules`/`product_attribute_preferences` are `user`-ruled).
   */
  private async enqueueLiveUpdates(
    userId: string,
    companyId: string | undefined,
    deviceId: string,
    deviceUniqueIdentifier: string
  ): Promise<void> {
    await runWithContextAsync(
      { userId, companyId, roles: [], perms: [], jti: 'ingestion', exp: Number.MAX_SAFE_INTEGER },
      async () => {
        await this.enqueueDashboardUpdates(userId, deviceId, deviceUniqueIdentifier);
        await this.enqueueBuildingUpdate(userId, deviceId, deviceUniqueIdentifier);
      }
    );
  }

  private async enqueueDashboardUpdates(
    userId: string,
    deviceId: string,
    deviceUniqueIdentifier: string
  ): Promise<void> {
    const settings = await this.widgetsLookup.listWidgetSettingsForDevice(deviceId);
    if (settings.length === 0) return;

    // Re-reads the latest device value per Laravel's own `DeviceValue::where(...)->latest()->first()`
    // inside the loop (deep-dive §2.5) — the row `createDeviceValue` above just wrote.
    const latest =
      await this.repository.findLatestDeviceValueByUniqueIdentifier(deviceUniqueIdentifier);
    if (!latest) return;

    const byDashboard = new Map<string, Map<string, DashboardUpdateJobData['widgets'][number]>>();
    for (const setting of settings) {
      if (!(setting.attributeKey in latest)) continue;
      const dashboardId = setting.dashboardId;
      if (dashboardId === null) continue;

      const value = latest[setting.attributeKey] ?? null;
      const conditions = await this.widgetsLookup.findWidgetRuleConditions(setting.ruleId);
      const isAlert = conditions
        ? evaluate(conditions, { [setting.attributeKey]: value }, setting.product ?? '').matched
        : false;

      // Laravel's own equivalent (`$setting->product_id`, WebhookController) reads an attribute
      // `WidgetSetting` doesn't have (the real column is `product`, not `product_id`) — Eloquent's
      // magic getter silently returns null for it, so the preference-label lookup's `where('product_id',
      // null)` never matches and this label is ALWAYS the dot-path fallback in production, confirmed
      // by reading the code (KNOWN_ISSUES 11.76). Not a byte-parity port: `setting.product` would be
      // the *correct* column and skipping the lookup entirely is simpler than deliberately calling it
      // with `undefined` to reproduce a typo — but the outcome, an always-unused lookup, is identical.
      const label = fallbackLabel(setting.attributeKey);

      const widgets =
        byDashboard.get(dashboardId) ??
        new Map<string, DashboardUpdateJobData['widgets'][number]>();
      byDashboard.set(dashboardId, widgets);
      const entry = widgets.get(setting.widgetId) ?? { widgetId: setting.widgetId, values: [] };
      entry.values.push({
        attribute_name: label,
        attribute_value: value,
        is_alert: isAlert ? 1 : 0,
      });
      widgets.set(setting.widgetId, entry);
    }

    for (const [dashboardId, widgets] of byDashboard) {
      await this.queue.enqueueDashboardUpdate({
        userId,
        dashboardId,
        widgets: [...widgets.values()],
      });
    }
  }

  private async enqueueBuildingUpdate(
    userId: string,
    deviceId: string,
    deviceUniqueIdentifier: string
  ): Promise<void> {
    const buildingId = await this.assetsLookup.findAssetIdForDevice(deviceId);
    if (!buildingId) return;

    const result = await this.assetsLookup.getAssetWithAlerts(buildingId);
    if (!result) return;

    await this.queue.enqueueBuildingUpdate({
      userId,
      buildingId,
      deviceId,
      deviceIdentifier: deviceUniqueIdentifier,
      asset: result.asset,
    });
  }
}
