import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toAsset, toComponent, toFloorPlan, inventoryCheckToColumn } from './assets.mapper.js';
import type {
  Asset,
  AssetComponent,
  CreateComponentInput,
  FloorPlan,
  UpdateComponentInput,
} from './assets.types.js';

/**
 * All Prisma access for module 3.1. `assets` is `company`-ruled
 * (tenant-rules.ts, D-0075's structural half) — every query below either
 * relies on the default scoping extension (ambient request context) or,
 * for `asset_components`/`floor_plans` (`parent`-ruled, no own tenant
 * column), joins explicitly through the owning `asset.company_id`,
 * mirroring D-0075's live-app hotfix and D-0072's `widgets`/
 * `widget_settings` treatment in module 2.7.
 */
export class AssetsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Assets
  // ===========================================================================

  async listForCaller(): Promise<Asset[]> {
    const rows = await this.prisma.assets.findMany({ orderBy: { id: 'asc' } });
    return rows.map(toAsset);
  }

  /**
   * `RbacCompanyAssetsLookup` implementation (D-0100) — module 1.3's
   * `GET /companies` eager-loads `assets` for an arbitrary target company,
   * never the caller's own scoped context, so `runAsSystemAsync` + an
   * explicit `company_id` filter (same posture as `findAllForCompany` on
   * module 1.2's `AuthRepository`).
   */
  async findAllForCompany(companyId: string): Promise<Asset[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.assets.findMany({ where: { company_id: companyId } })
    );
    return rows.map(toAsset);
  }

  async countForCompany(companyId: string): Promise<number> {
    return runAsSystemAsync(() => this.prisma.assets.count({ where: { company_id: companyId } }));
  }

  async create(
    companyId: string,
    input: { name: string; type: string; icon: string | null; description: string | null }
  ): Promise<Asset> {
    const row = await this.prisma.assets.create({
      data: {
        name: input.name,
        type: input.type,
        icon: input.icon ?? '',
        description: input.description,
        company_id: companyId,
      },
    });
    return toAsset(row);
  }

  async findById(id: string): Promise<Asset | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.assets.findFirst({ where: { id: BigInt(id) } });
    return row ? toAsset(row) : undefined;
  }

  /**
   * `AssetComponent::where('device_id', $deviceId)->with('asset')->first()` (module 2.4's per-packet
   * building bridge, D-0139) — `asset_components` is `parent`-ruled, unscoped, first match, exactly as
   * Laravel has no company/user check here at all (the ingestion pipeline has already resolved this
   * device; the containing asset's own `company`-ruled read is what actually scopes the result).
   */
  async findAssetIdForDevice(deviceId: string): Promise<string | undefined> {
    // `asset_components.device_id` is a plain varchar id (Design notes), not a real FK — string match.
    const row = await runAsSystemAsync(() =>
      this.prisma.asset_components.findFirst({
        where: { device_id: deviceId },
        select: { asset_id: true },
      })
    );
    return row?.asset_id.toString();
  }

  async update(
    id: string,
    data: {
      name?: string | undefined;
      type?: string | undefined;
      icon?: string | null | undefined;
      description?: string | null | undefined;
    }
  ): Promise<Asset | undefined> {
    if (!(await this.findById(id))) return undefined;
    const row = await this.prisma.assets.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.icon !== undefined ? { icon: data.icon ?? '' } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
    return toAsset(row);
  }

  /**
   * Deletes the asset — and, via a real `ON DELETE CASCADE` FK chain
   * (`asset_components.asset_id -> assets.id`, and `asset_components.
   * parent_id -> asset_components.id` self-referentially), every
   * component under it regardless of depth, and (via `floor_plans.
   * asset_component_id -> asset_components.id`, also CASCADE) every
   * floor plan attached to any of them. Verified against the real FK
   * `confdeltype` in the dev database before writing this (D-0073's own
   * discipline, not assumed from `schema.prisma`/`schema.sql` alone) —
   * a single `DELETE FROM assets` replaces `AssetComponent::
   * recursiveDelete()`'s PHP-side recursion entirely, no application-
   * level walk needed.
   */
  async deleteCascade(id: string): Promise<boolean> {
    if (!(await this.findById(id))) return false;
    await this.prisma.assets.delete({ where: { id: BigInt(id) } });
    return true;
  }

  /** Bulk variant of `deleteCascade` — only ids the caller owns are affected (D-0075's `authorizedAssetQuery()->whereIn(...)` pattern), silently skipping the rest rather than erroring. */
  async bulkDeleteCascade(ids: string[]): Promise<number> {
    const numericIds = ids.filter(id => /^\d+$/.test(id));
    const owned = await this.prisma.assets.findMany({
      where: { id: { in: numericIds.map(id => BigInt(id)) } },
      select: { id: true },
    });
    if (owned.length === 0) return 0;
    await this.prisma.assets.deleteMany({ where: { id: { in: owned.map(r => r.id) } } });
    return owned.length;
  }

  /** `getCompanyAssetsTree` — caller's `companyId` already verified equal to the requested one (D-0075's `getCompanyAssetsTree` fix) before this is called, so a plain company-scoped, non-context-dependent query is correct here (this repository's other methods rely on the ambient tenant-scoping extension; this one is explicit since the frozen contract's own pagination page/limit shape needs manual `skip`/`take`, not the extension's implicit scoping alone). */
  async findAssetTreeForCompany(
    companyId: string,
    query: { page: number; limit: number; search: string | undefined }
  ): Promise<{ items: Asset[]; total: number }> {
    const where: Prisma.assetsWhereInput = {
      company_id: companyId,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await runAsSystemAsync(() =>
      Promise.all([
        this.prisma.assets.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: { id: 'asc' },
        }),
        this.prisma.assets.count({ where }),
      ])
    );
    return { items: rows.map(toAsset), total };
  }

  // ===========================================================================
  // Components
  // ===========================================================================

  /** Ownership-scoped: joins through the owning asset's `company_id` — mirrors D-0075's `authorizedComponentQuery()` (live-app hotfix), the structural equivalent for the new app. */
  async findComponentById(id: string, companyId: string): Promise<AssetComponent | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await runAsSystemAsync(() =>
      this.prisma.asset_components.findFirst({
        where: { id: BigInt(id), assets: { company_id: companyId } },
      })
    );
    return row ? toComponent(row) : undefined;
  }

  /** Unscoped by design — used only after the caller's parent asset/component has already been verified owned (matches the old app's own `AssetComponent::find($parentId)` inner lookups, which never re-check ownership either, relying on the `asset_id` cross-check that follows). */
  private async findComponentByIdUnscoped(id: string): Promise<
    | {
        id: bigint;
        asset_id: bigint;
        device_id: string | null;
        inventory_check: string | null;
        parent_id: bigint | null;
      }
    | undefined
  > {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await runAsSystemAsync(() =>
      this.prisma.asset_components.findFirst({
        where: { id: BigInt(id) },
        select: {
          id: true,
          asset_id: true,
          device_id: true,
          inventory_check: true,
          parent_id: true,
        },
      })
    );
    return row ?? undefined;
  }

  /** Returns `{ ok: false }` when the chosen parent doesn't belong to the same asset, or is itself locked (has a device + inventory_check). Mirrors `addComponent`/`updateComponent`'s identical parent-validation block (Design notes: kept as one helper rather than duplicated in both call sites). */
  async validateParent(
    assetId: string,
    parentId: string
  ): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'locked' }> {
    const parent = await this.findComponentByIdUnscoped(parentId);
    if (!parent || parent.asset_id.toString() !== assetId) return { ok: false, reason: 'invalid' };
    if (parent.device_id && parent.inventory_check === '1') return { ok: false, reason: 'locked' };
    return { ok: true };
  }

  /** `exists:asset_components,id` — unscoped, like Laravel's rule (D-0127). */
  async componentExists(id: string): Promise<boolean> {
    return /^\d+$/.test(id) && (await this.findComponentByIdUnscoped(id)) !== undefined;
  }

  /** `exists:floor_plans,id` (D-0127). */
  async floorPlanExists(id: string): Promise<boolean> {
    if (!/^\d+$/.test(id)) return false;
    const row = await this.prisma.floor_plans.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    return row !== null;
  }

  async createComponents(
    assetId: string,
    inputs: CreateComponentInput[]
  ): Promise<AssetComponent[]> {
    return this.prisma.$transaction(async tx => {
      const created: AssetComponent[] = [];
      for (const input of inputs) {
        const row = await tx.asset_components.create({
          data: {
            asset_id: BigInt(assetId),
            name: input.name,
            component_type: input.componentType,
            icon: input.icon ?? '',
            device_id: input.deviceId,
            product_id: input.productId,
            inventory_check: inventoryCheckToColumn(input.inventoryCheck),
            parent_id: input.parentId ? BigInt(input.parentId) : null,
            floor_plan_id: input.floorPlanId ? BigInt(input.floorPlanId) : null,
            position_x: input.positionX,
            position_y: input.positionY,
          },
        });
        created.push(toComponent(row));
      }
      return created;
    });
  }

  async updateComponent(
    id: string,
    data: UpdateComponentInput
  ): Promise<AssetComponent | undefined> {
    const existing = await this.findComponentByIdUnscoped(id);
    if (!existing) return undefined;
    const row = await this.prisma.asset_components.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.componentType !== undefined ? { component_type: data.componentType } : {}),
        ...(data.icon !== undefined ? { icon: data.icon ?? '' } : {}),
        ...(data.deviceId !== undefined ? { device_id: data.deviceId } : {}),
        ...(data.productId !== undefined ? { product_id: data.productId } : {}),
        ...(data.inventoryCheck !== undefined
          ? { inventory_check: inventoryCheckToColumn(data.inventoryCheck) }
          : {}),
        ...(data.parentId !== undefined
          ? { parent_id: data.parentId ? BigInt(data.parentId) : null }
          : {}),
        ...(data.floorPlanId !== undefined
          ? { floor_plan_id: data.floorPlanId ? BigInt(data.floorPlanId) : null }
          : {}),
        ...(data.positionX !== undefined ? { position_x: data.positionX } : {}),
        ...(data.positionY !== undefined ? { position_y: data.positionY } : {}),
      },
    });
    return toComponent(row);
  }

  /** `wouldCreateCircularReference` — walks the parent chain from `newParentId` looking for `componentId`, matching the old app's loop exactly (Design notes). */
  async wouldCreateCircularReference(componentId: string, newParentId: string): Promise<boolean> {
    const visited = new Set<string>();
    let current: string | null = newParentId;
    while (current && !visited.has(current)) {
      if (current === componentId) return true;
      visited.add(current);
      const parent = await this.findComponentByIdUnscoped(current);
      current = parent?.parent_id ? parent.parent_id.toString() : null;
    }
    return false;
  }

  /** `AssetComponent::recursiveDelete()` — the real FK cascade (`parent_id -> id`, `ON DELETE CASCADE`, verified live) handles every descendant; this deletes only the root. */
  async deleteComponentCascade(id: string): Promise<boolean> {
    const existing = await this.findComponentByIdUnscoped(id);
    if (!existing) return false;
    await this.prisma.asset_components.delete({ where: { id: existing.id } });
    return true;
  }

  // ===========================================================================
  // Alert rollup / status ("last child components with a device", per branch)
  // ===========================================================================

  /**
   * `getLastChildComponentsWithDevices` — for each branch of the tree,
   * the first component (root included) that has a `device_id`; branches
   * without one recurse into children (Design notes: a real product/
   * ownership-check semantics port, not "every descendant with a
   * device"). One recursive CTE replaces the old app's PHP-side
   * recursion — `w.device_id IS NULL` in the join condition is exactly
   * the "stop recursing once a device is found" rule.
   */
  private async lastChildDevices(
    seed: Prisma.Sql
  ): Promise<{ componentId: string; deviceId: string; productId: string | null }[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.$queryRaw<
        { id: bigint; device_id: string; product_id: string | null }[]
      >(Prisma.sql`
        WITH RECURSIVE seed AS (
          SELECT id, device_id, product_id FROM asset_components WHERE ${seed}
        ),
        walk AS (
          SELECT id, device_id, product_id FROM seed
          UNION ALL
          SELECT c.id, c.device_id, c.product_id
          FROM asset_components c
          INNER JOIN walk w ON c.parent_id = w.id
          WHERE w.device_id IS NULL
        )
        SELECT id, device_id, product_id FROM walk WHERE device_id IS NOT NULL
      `)
    );
    return rows.map(r => ({
      componentId: r.id.toString(),
      deviceId: r.device_id,
      productId: r.product_id,
    }));
  }

  async lastChildDevicesForAsset(
    assetId: string
  ): Promise<{ componentId: string; deviceId: string; productId: string | null }[]> {
    return this.lastChildDevices(Prisma.sql`asset_id = ${BigInt(assetId)} AND parent_id IS NULL`);
  }

  async lastChildDevicesForComponent(
    componentId: string
  ): Promise<{ componentId: string; deviceId: string; productId: string | null }[]> {
    return this.lastChildDevices(Prisma.sql`id = ${BigInt(componentId)}`);
  }

  async findLatestDeviceValue(
    deviceId: string
  ): Promise<{ createdAt: Date | null; values: Record<string, unknown> } | undefined> {
    if (!/^\d+$/.test(deviceId)) return undefined;
    const row = await runAsSystemAsync(() =>
      this.prisma.device_values.findFirst({
        where: { device_id: BigInt(deviceId) },
        orderBy: { created_at: 'desc' },
      })
    );
    return row
      ? { createdAt: row.created_at, values: row.values as Record<string, unknown> }
      : undefined;
  }

  async countLastDayValues(
    deviceId: string,
    since: Date
  ): Promise<{ createdAt: Date | null; values: Record<string, unknown> }[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.device_values.findMany({
        where: { device_id: BigInt(deviceId), created_at: { gte: since } },
      })
    );
    return rows.map(r => ({
      createdAt: r.created_at,
      values: r.values as Record<string, unknown>,
    }));
  }

  /** The caller's own selected, non-unique-identifier attribute preferences for a product — `product_attribute_preferences` is `user`-ruled (tenant-rules.ts), so the default extension already scopes this to the caller under the ambient request context, matching `->where('user_id', auth()->id())` without a manual filter. */
  async listSelectedAttributeKeys(productId: string): Promise<string[]> {
    if (!/^\d+$/.test(productId)) return [];
    const rows = await this.prisma.product_attribute_preferences.findMany({
      where: { product_id: BigInt(productId), is_selected: true, is_unique_identifier: false },
      select: { attribute_key: true },
    });
    return rows.map(r => r.attribute_key).filter((k): k is string => k !== null);
  }

  /**
   * `WidgetSetting::where('device', $device->id)->where('attributes', 'like', "%$key%")->first()`
   * — a global lookup with no scoping in the old app either (Design
   * notes: not tightened here, matches real behavior exactly; this is
   * read-only display metadata, not a tenant-owned record being
   * mutated). `widget_settings` is `parent`-ruled — `runAsSystemAsync`
   * is not a bypass of a check that should exist, there is none in the
   * old app to replicate.
   */
  async findWidgetSettingForDeviceAttribute(
    deviceId: string,
    attributeKey: string
  ): Promise<{ widgetType: string; unit: string | null } | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.widget_settings.findFirst({
        where: { device: deviceId, attributes: { contains: attributeKey } },
        include: { widgets: { select: { type: true } } },
      })
    );
    return row ? { widgetType: row.widgets.type, unit: row.unit } : undefined;
  }

  // ===========================================================================
  // Floor plans
  // ===========================================================================

  async findFloorPlanByComponentId(componentId: string): Promise<FloorPlan | undefined> {
    const row = await this.prisma.floor_plans.findFirst({
      where: { asset_component_id: BigInt(componentId) },
    });
    return row ? toFloorPlan(row) : undefined;
  }

  async upsertFloorPlan(
    componentId: string,
    input: { filePath: string; widthPx: number; heightPx: number; floorLevel: number }
  ): Promise<{ floorPlan: FloorPlan; replaced: boolean }> {
    const existing = await this.findFloorPlanByComponentId(componentId);
    const row = await this.prisma.floor_plans.upsert({
      where: { asset_component_id: BigInt(componentId) },
      create: {
        asset_component_id: BigInt(componentId),
        file_path: input.filePath,
        width_px: input.widthPx,
        height_px: input.heightPx,
        floor_level: input.floorLevel,
      },
      update: {
        file_path: input.filePath,
        width_px: input.widthPx,
        height_px: input.heightPx,
        floor_level: input.floorLevel,
      },
    });
    return { floorPlan: toFloorPlan(row), replaced: existing !== undefined };
  }

  /**
   * Every component under an asset, flat, regardless of depth — the old
   * app's `AssetComponent::children()` relation eager-loads itself
   * (`->with(['children'])`), which Eloquent resolves lazily to
   * unbounded depth; Prisma has no equivalent recursive `include`, so
   * this fetches the flat set in one query and the service layer
   * (`buildComponentTree`) assembles the nested shape in memory —
   * simpler and cheaper than guessing a fixed nesting depth.
   */
  async listAllComponentsForAsset(assetId: string): Promise<AssetComponent[]> {
    const rows = await this.prisma.asset_components.findMany({
      where: { asset_id: BigInt(assetId) },
      orderBy: { id: 'asc' },
    });
    return rows.map(toComponent);
  }

  async listTopLevelComponents(assetId: string): Promise<AssetComponent[]> {
    const rows = await this.prisma.asset_components.findMany({
      where: { asset_id: BigInt(assetId), parent_id: null },
    });
    return rows.map(toComponent);
  }

  async listPositionedComponentsOnFloorPlan(floorPlanId: string): Promise<AssetComponent[]> {
    const rows = await this.prisma.asset_components.findMany({
      where: {
        floor_plan_id: BigInt(floorPlanId),
        position_x: { not: null },
        position_y: { not: null },
      },
    });
    return rows.map(toComponent);
  }

  /** `alarms` is `company`-ruled; `runAsSystemAsync` here matches the old app's own unscoped `Alarm::whereIn('device_id', $deviceIds)->where('state', 'active')->get()` exactly — not a bypass of a check that should exist, since every `deviceId` passed in has already been through an ownership-verified asset/component lookup upstream. */
  async listActiveAlarmsForDevices(deviceIds: string[]): Promise<
    {
      deviceId: string;
      conditionSnapshot: unknown;
      triggeredValue: unknown;
      triggeredAt: Date | null;
    }[]
  > {
    if (deviceIds.length === 0) return [];
    const rows = await runAsSystemAsync(() =>
      this.prisma.alarms.findMany({
        where: { device_id: { in: deviceIds.map(id => BigInt(id)) }, state: 'active' },
        orderBy: { triggered_at: 'desc' },
      })
    );
    return rows.map(r => ({
      deviceId: r.device_id.toString(),
      conditionSnapshot: r.condition_snapshot,
      triggeredValue: r.triggered_value,
      triggeredAt: r.triggered_at,
    }));
  }
}
