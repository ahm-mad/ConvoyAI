import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import {
  laravelBoolean,
  laravelInteger,
  laravelUnitInterval,
  laravelUntypedFlag,
  normalizeLaravelInput,
} from '../../shared/utils/laravel-input.js';

/**
 * Zod schemas for module 3.1 (assets/asset_components/floor_plans).
 * Request shapes match `AssetController`/`FloorPlanController`'s
 * validation exactly (`reference/openapi.yaml`'s `/assets*`/`/components*`/
 * `/floor-plans*`/`/devices/{id}` (GET) paths, `13-assets.md`'s Design
 * notes).
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const AssetIdParamSchema = z.object({ id: z.string() });
export const ComponentIdParamSchema = z.object({ componentId: z.string() });
export const ComponentBareIdParamSchema = z.object({ id: z.string() });
export const CompanyIdParamSchema = z.object({ companyId: z.string() });
export const AssetComponentIdParamSchema = z.object({ assetComponentId: z.string() });
export const BuildingAssetIdParamSchema = z.object({ assetId: z.string() });

// -- GET /assets, POST /assets ------------------------------------------------

export const CreateAssetRequestSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  icon: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
});

// -- PUT /assets/{id} ----------------------------------------------------------

export const UpdateAssetRequestSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  components: z.array(z.unknown()).optional(),
});

// -- DELETE /bulk-delete ---------------------------------------------------------

export const BulkDeleteAssetsRequestSchema = z.object({
  asset_ids: z.array(z.union([z.number(), z.string()])),
});

// -- GET /assets/{companyId}/tree ----------------------------------------------

export const AssetsCompanyTreeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().max(255).optional(),
});

// -- POST /assets/{id}/components -------------------------------------------

// D-0126: `AssetController::addComponent` validates each entry as `nullable|integer`/`nullable|boolean`/
// `numeric|between:0,1`, behind Laravel's TrimStrings + ConvertEmptyStringsToNull — the real frontend sends
// `inventory_check: "0"` and `""` for unset ids/type, so the entry is normalised first.
const ComponentInputSchema = z.preprocess(
  normalizeLaravelInput,
  z.object({
    name: z.string().min(1),
    component_type: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    parent_id: laravelInteger.nullable().optional(),
    device_id: laravelInteger.nullable().optional(),
    product_id: laravelInteger.nullable().optional(),
    inventory_check: laravelBoolean.nullable().optional(),
    floor_plan_id: laravelInteger.nullable().optional(),
    position_x: laravelUnitInterval.nullable().optional(),
    position_y: laravelUnitInterval.nullable().optional(),
  })
);

export const AddComponentsRequestSchema = z.object({
  components: z.array(ComponentInputSchema).min(1),
});

// -- PUT /components/{componentId} ---------------------------------------------

// D-0127: same Laravel input semantics as POST (D-0126). `inventory_check` here is `sometimes|nullable` with NO type
// rule (any scalar); bulk-update's `parent_id`/`id` are `integer|exists`, `id` required.
export const UpdateComponentRequestSchema = z.preprocess(
  normalizeLaravelInput,
  z.object({
    name: z.string().min(1).max(255).optional(),
    component_type: z.string().max(100).nullable().optional(),
    icon: z.string().max(255).nullable().optional(),
    device_id: laravelInteger.nullable().optional(),
    product_id: laravelInteger.nullable().optional(),
    inventory_check: laravelUntypedFlag.nullable().optional(),
    parent_id: laravelInteger.nullable().optional(),
    floor_plan_id: laravelInteger.nullable().optional(),
    position_x: laravelUnitInterval.nullable().optional(),
    position_y: laravelUnitInterval.nullable().optional(),
  })
);

// -- PUT /components/bulk-update -------------------------------------------------

const BulkComponentUpdateEntrySchema = z.preprocess(
  normalizeLaravelInput,
  z.object({
    id: laravelInteger,
    name: z.string().min(1).max(255).optional(),
    component_type: z.string().max(100).nullable().optional(),
    icon: z.string().max(255).nullable().optional(),
    parent_id: laravelInteger.nullable().optional(),
  })
);

export const BulkUpdateComponentsRequestSchema = z.object({
  components: z.array(BulkComponentUpdateEntrySchema).min(1),
});

// -- GET /devices/{id} (11.24 — the real handler is componentsDevices) -----------

export const ComponentsDevicesQuerySchema = z.object({
  type: z.string().default('component'),
  search: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

// -- POST /floor-plans (multipart) -----------------------------------------------

export const UploadFloorPlanRequestSchema = z.object({
  asset_component_id: z.union([z.number(), z.string()]),
  floor_level: z.coerce.number().int().optional(),
});

for (const [method, path, summary] of [
  ['get', '/assets', "Own company's assets, full component hierarchy"],
  ['post', '/assets', "Create an asset (company_id from the caller's own)"],
  ['get', '/assets/{id}', 'Single asset + alert badges (D-0075: company-scoped)'],
  ['put', '/assets/{id}', 'D-0075: company-scoped'],
  ['delete', '/assets/{id}', 'Recursively deletes all components via real FK CASCADE'],
  ['delete', '/bulk-delete', 'Top-level path, NOT /assets/bulk-delete'],
  ['get', '/assets/{companyId}/tree', "companyId must equal the caller's own (D-0075)"],
  ['post', '/assets/{id}/components', 'Rejects adding a child under a locked parent'],
  ['get', '/components/{componentId}', 'D-0075: company-scoped via the owning asset'],
  ['put', '/components/{componentId}', 'Guards self-parenting, circular refs, locked parents'],
  ['delete', '/components/{id}', 'Cascades children via real FK CASCADE'],
  ['put', '/components/bulk-update', 'D-0075: each id company-scoped'],
  ['get', '/assets/{id}/status-summary', '11.15/§9: unified 30min isOffline() threshold'],
  [
    'get',
    '/devices/{id}',
    '11.24 (resolved): the real handler is componentsDevices, not a device lookup',
  ],
  ['get', '/components/{id}/status-and-devices', 'Composes status-summary + componentsDevices'],
  ['post', '/floor-plans', 'One floor plan per asset_component_id; re-upload replaces'],
  [
    'get',
    '/floor-plans/component/{assetComponentId}',
    'Includes positioned_components, device/alarm counts',
  ],
  [
    'get',
    '/floor-plans/building/{assetId}',
    'Every floor under a building, ordered by floor_level',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['assets'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}
