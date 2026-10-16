import type {
  assets as AssetRow,
  asset_components as ComponentRow,
  floor_plans as FloorPlanRow,
} from '@prisma/client';
import { phpIntCast } from '../../shared/utils/php-cast.js';
import type { Asset, AssetComponent, FloorPlan } from './assets.types.js';

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id.toString(),
    companyId: row.company_id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `inventory_check` is a numeric-string `varchar` column; the old app's model casts it to `integer` and every comparison is `=== 1` (Design notes) — mirrored here as `=== "1"`. */
export function toComponent(row: ComponentRow): AssetComponent {
  return {
    id: row.id.toString(),
    assetId: row.asset_id.toString(),
    name: row.name,
    icon: row.icon,
    componentType: row.component_type,
    deviceId: row.device_id,
    productId: row.product_id,
    inventoryCheck: row.inventory_check === '1',
    inventoryCheckValue: row.inventory_check === null ? null : phpIntCast(row.inventory_check),
    parentId: row.parent_id?.toString() ?? null,
    floorPlanId: row.floor_plan_id?.toString() ?? null,
    positionX: row.position_x !== null ? Number(row.position_x) : null,
    positionY: row.position_y !== null ? Number(row.position_y) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toFloorPlan(row: FloorPlanRow): FloorPlan {
  return {
    id: row.id.toString(),
    assetComponentId: row.asset_component_id.toString(),
    floorLevel: row.floor_level,
    filePath: row.file_path,
    widthPx: row.width_px,
    heightPx: row.height_px,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Boolean input -> the numeric-string form the `varchar` column stores, matching the old app's `integer`-cast model (Design notes). Callers narrow away `undefined` before calling (e.g. `updateComponent`'s conditional spread) — `exactOptionalPropertyTypes` treats a statically-possible `undefined` return differently from an omitted key even when it can never actually occur, so this stays `boolean | null` only rather than also accepting `undefined`. */
export function inventoryCheckToColumn(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? '1' : '0';
}
