import type { RuleCondition } from '../../shared/utils/rule-condition-evaluator.js';
import type { AttributePreference } from './ingestion.types.js';

/**
 * Cross-module interfaces module 2.4 (ingestion) depends on — implemented
 * by modules 2.1 (products), 2.2 (protocols), and 2.3 (devices)'
 * repositories, wired together in `container.ts`. Kept as their own
 * interfaces (rather than importing another module's repository directly)
 * per `CONVENTIONS.md` "Modules": cross-module calls go through
 * services/interfaces via the container — same pattern as `RoleLookup`/
 * `ClaimsResolver`/`ProductsLookup` (devices module).
 */
export interface IngestionProductsLookup {
  /** No tenant scoping — ingestion has no request-context user, see `ProductsRepository.findByIdUnscoped`'s doc comment. `companyId` (module 4.3, D-0079) resolves the geofence detector's tenant — the packet's product is the only thing on this no-request-context path that carries it. */
  findByIdUnscoped(
    id: string
  ): Promise<{ id: string; companyId: string; deviceProtocolId: string | null } | undefined>;
  listPreferencesForProduct(productId: string): Promise<AttributePreference[]>;
}

export interface IngestionDevicesLookup {
  /** No tenant scoping — ingestion is a machine-to-machine call, see `DevicesRepository.findByUniqueIdentifier`'s doc comment. */
  findByUniqueIdentifier(
    deviceUniqueIdentifier: string
  ): Promise<
    { id: string; productId: string; userId: string; deviceUniqueIdentifier: string } | undefined
  >;
  /** D-0142: scoped by product — see `DevicesRepository.findByUniqueIdentifierForProduct`'s doc comment. Used only by `processIngestionJob`'s device re-resolution. */
  findByUniqueIdentifierForProduct(
    productId: string,
    deviceUniqueIdentifier: string
  ): Promise<
    { id: string; productId: string; userId: string; deviceUniqueIdentifier: string } | undefined
  >;
  /** `MqttService::handleDeviceStatus` equivalent — returns false if no device matched. */
  updateStatusByUniqueIdentifier(deviceUniqueIdentifier: string, status: string): Promise<boolean>;
}

export interface IngestionProtocolsLookup {
  findByName(name: string): Promise<{ id: string } | undefined>;
}

/** `fleetGeofencesService` doubles as this module's `GeofenceService::checkPosition` equivalent (interface-typed, not a direct service import — CONVENTIONS.md "Modules"), module 4.3, D-0079. */
export interface IngestionGeofencesLookup {
  checkPosition(
    companyId: string,
    deviceId: string,
    latitude: number,
    longitude: number,
    /** D-0161: the rest of the position, so the detector can broadcast `fleet:position`. */
    position?: { speed: number | null; heading: number | null; recordedAt: Date }
  ): Promise<void>;
}

/**
 * `dashboardsRepository` doubles as this module's widget-alert-loop lookup (D-0139, `WebhookController::storePacketData`'s
 * `foreach ($device->widgetsettings as $setting)` block, `realtime-channels.md` §3.1). `listWidgetSettingsForDevice` is
 * `WidgetSetting::where('device', $deviceId)->whereNotNull('attributes')->with('widget')` — `parent`-ruled (`widgets`/
 * `widget_settings`, tenant-rules.ts), no request context required. `findWidgetRuleConditions` already exists (module
 * 2.7, `dashboards.service.ts`'s `getDashboard`) — reused as-is, run inside the real per-packet user context module
 * 2.4 establishes (D-0139). No preference-label lookup here (unlike `getDashboard`'s own `resolveSettingLabel`): the
 * Laravel loop this ports reads `$setting->product_id`, an attribute `WidgetSetting` doesn't have (the real column is
 * `product`) — Eloquent silently returns null for it, so that lookup never matches in production (KNOWN_ISSUES 11.76,
 * confirmed by reading the code). `ingestion.service.ts` always uses the dot-path fallback label instead.
 */
export interface IngestionWidgetsLookup {
  listWidgetSettingsForDevice(deviceId: string): Promise<
    {
      widgetId: string;
      dashboardId: string | null;
      ruleId: string;
      attributeKey: string;
      product: string | null;
    }[]
  >;
  findWidgetRuleConditions(ruleId: string): Promise<RuleCondition[] | undefined>;
}

/**
 * `assetsService` doubles as this module's building-live-update lookup (D-0139, `WebhookController::storePacketData`'s
 * asset-component bridge + `AssetController::formatAssetWithAlerts`, `realtime-channels.md` §3.2). `getAssetWithAlerts`
 * is `AssetsService.getAsset` itself, run inside the real per-packet user+company context module 2.4 establishes —
 * unlike Laravel, whose equivalent call runs with no authenticated user at all (`auth()->id()` is null on `/webhook`,
 * a confirmed bug, KNOWN_ISSUES 11.75) and so never actually raises `is_alert` on the live push; D-0139 is a
 * deliberate improvement, not a byte-parity port.
 */
export interface IngestionAssetsLookup {
  /** `AssetComponent::where('device_id', $deviceId)->with('asset')->first()`, `parent`-ruled, first match, unscoped. */
  findAssetIdForDevice(deviceId: string): Promise<string | undefined>;
  getAssetWithAlerts(assetId: string): Promise<{ asset: Record<string, unknown> } | undefined>;
}
