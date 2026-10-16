/**
 * Module 3.1 (KNOWN_ISSUES 11.15/11.24/§9/11.54, D-0075's structural
 * half). Domain types for `assets`/`asset_components`/`floor_plans` —
 * `component_values` is confirmed dead in the old app (no model,
 * controller, route, or frozen-contract operation anywhere) and is not
 * modeled here (Design notes).
 */
export interface Asset {
  id: string;
  companyId: string | null;
  name: string;
  type: string;
  icon: string | null;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AssetComponent {
  id: string;
  assetId: string;
  name: string;
  icon: string | null;
  componentType: string | null;
  deviceId: string | null;
  productId: string | null;
  /** Stored as a numeric-string `varchar` column (frozen schema); the old app's model casts it to `integer` on read — represented here as the same effective boolean the app treats it as (`=== 1`). */
  inventoryCheck: boolean;
  /** The model's `integer`-cast value as Laravel serialises it: `0`/`1`/… or `null` when never set (D-0129) — `inventoryCheck` above collapses null to false. */
  inventoryCheckValue: number | null;
  parentId: string | null;
  floorPlanId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface FloorPlan {
  id: string;
  assetComponentId: string;
  floorLevel: number;
  filePath: string;
  widthPx: number;
  heightPx: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AssetComponentTree extends AssetComponent {
  children: AssetComponentTree[];
}

export interface CreateComponentInput {
  name: string;
  componentType: string | null;
  icon: string | null;
  deviceId: string | null;
  productId: string | null;
  inventoryCheck: boolean | null;
  parentId: string | null;
  floorPlanId: string | null;
  positionX: number | null;
  positionY: number | null;
}

export interface UpdateComponentInput {
  name?: string | undefined;
  componentType?: string | null | undefined;
  icon?: string | null | undefined;
  deviceId?: string | null | undefined;
  productId?: string | null | undefined;
  inventoryCheck?: boolean | null | undefined;
  parentId?: string | null | undefined;
  floorPlanId?: string | null | undefined;
  positionX?: number | null | undefined;
  positionY?: number | null | undefined;
}

/** `checkComponentAlerts`'s two return values, matching `AssetController::checkComponentAlerts` exactly (Design notes). */
export interface ComponentAlertResult {
  isAlert: boolean;
  alertAttributes: string[];
}

/** Cross-module lookup this service depends on for the caller's own active non-widget rules (module 2.5/2.7's `RuleCondition` shape) — `dashboardsRepository` already implements this exact query, reused rather than duplicated (CONVENTIONS.md "Modules": interface-typed, not a direct repository import, same pattern as every other cross-module lookup in this codebase). */
export interface AssetsRulesLookup {
  listActiveNonWidgetRulesForUser(): Promise<
    {
      id: string;
      conditions: import('../../shared/utils/rule-condition-evaluator.js').RuleCondition[];
    }[]
  >;
}

/** `devicesRepository`/`productsRepository` double as this module's scoped-existence checks for `device_id`/`product_id` on component create/update — narrower than Laravel's own `exists:devices,id`/`exists:products,id` (global existence, no company scope at all), a deliberate tightening logged in this module's Decisions (not itself a KNOWN_ISSUES row — narrow FK-integrity gap, not an independently exploitable cross-tenant read/write). `findByIdUnscoped` is the read-side counterpart used by `getStatusSummary`/`componentsDevices` — matches `Device::find($comp->device_id)` exactly (no ownership check at all), since the *component* holding that `device_id` is already asset-ownership-scoped by the time these are reached. */
export interface AssetsDevicesLookup {
  findAuthorized(
    id: string,
    userId: string,
    companyId: string
  ): Promise<{ id: string } | undefined>;
  findByIdUnscoped(id: string): Promise<
    | {
        id: string;
        deviceUniqueIdentifier: string;
        name: string;
        status: string;
        createdAt: Date | null;
      }
    | undefined
  >;
}
export interface AssetsProductsLookup {
  findById(id: string): Promise<{ id: string } | undefined>;
}

/** `rbacRepository` doubles as this module's company-name lookup for `getCompanyAssetsTree` (CONVENTIONS.md "Modules" — interface-typed, not a direct repository import). */
export interface AssetsCompanyLookup {
  findById(id: string): Promise<{ id: string; name: string } | undefined>;
}
