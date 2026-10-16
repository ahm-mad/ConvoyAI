import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { evaluate } from '../../shared/utils/rule-condition-evaluator.js';
import { isOffline } from '../../shared/utils/offline.js';
import { uploadObject, deleteObject, keyFromUrl } from '../../platform/storage/r2-storage.js';
import { imageSize } from 'image-size';
import type { AssetsRepository } from './assets.repository.js';
import type {
  AssetsCompanyLookup,
  AssetsDevicesLookup,
  AssetsProductsLookup,
  AssetsRulesLookup,
  AssetComponent,
  AssetComponentTree,
  Asset,
  CreateComponentInput,
  UpdateComponentInput,
} from './assets.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

/** Builds the `children` tree from a flat component list (Design notes — replaces Eloquent's self-eager-loading `children()` relation). */
function buildComponentTree(
  components: AssetComponent[],
  parentId: string | null
): AssetComponentTree[] {
  return components
    .filter(c => c.parentId === parentId)
    .map(c => ({ ...c, children: buildComponentTree(components, c.id) }));
}

type ComponentJson = Record<string, unknown>;

/** `formatComponent` — matches the old app's field set (including both snake_case DB names and the redundant `asset_id`) exactly. `latest_device_values` is fetched per-component, same N+1 pattern the old app has (Design notes: not batched — this endpoint isn't a hot path and the old app never batched it either). */
async function formatComponentJson(
  repo: AssetsRepository,
  node: AssetComponentTree
): Promise<ComponentJson> {
  const latest = node.deviceId ? await repo.findLatestDeviceValue(node.deviceId) : undefined;
  const children: ComponentJson[] = [];
  for (const child of node.children) {
    children.push(await formatComponentJson(repo, child));
  }
  // D-0129: Laravel's `formatComponent` emits the Eloquent model's casts — integer ids (never strings),
  // `inventory_check` as its `integer` cast (`0`/`1`/`null`), `position_*` as floats.
  const toInt = (value: string | null) => (value === null ? null : Number(value));
  return {
    id: Number(node.id),
    asset_id: Number(node.assetId),
    name: node.name,
    icon: node.icon,
    component_type: node.componentType,
    device_id: toInt(node.deviceId),
    product_id: toInt(node.productId),
    inventory_check: node.inventoryCheckValue,
    parent_id: toInt(node.parentId),
    floor_plan_id: toInt(node.floorPlanId),
    position_x: node.positionX,
    position_y: node.positionY,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    latest_device_values: latest?.values ?? null,
    children,
  };
}

/** `AssetController::formatAsset` (D-0129) — `index()` and `store()`: integer `id`/`asset_id`. */
function formatAssetJson(asset: Asset): ComponentJson {
  return { ...baseAssetJson(asset), id: Number(asset.id), asset_id: Number(asset.id) };
}

function baseAssetJson(asset: Asset): ComponentJson {
  return {
    id: asset.id,
    asset_id: asset.id,
    name: asset.name,
    type: asset.type,
    icon: asset.icon,
    description: asset.description,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
  };
}

export class AssetsService {
  constructor(
    private readonly repo: AssetsRepository,
    private readonly rulesLookup: AssetsRulesLookup,
    private readonly devicesLookup: AssetsDevicesLookup,
    private readonly productsLookup: AssetsProductsLookup,
    private readonly companyLookup: AssetsCompanyLookup
  ) {}

  // ===========================================================================
  // Assets
  // ===========================================================================

  async listAssets() {
    const assets = await this.repo.listForCaller();
    const formatted: ComponentJson[] = [];
    for (const asset of assets) {
      const components = await this.repo.listAllComponentsForAsset(asset.id);
      const tree = buildComponentTree(components, null);
      const children: ComponentJson[] = [];
      for (const node of tree) children.push(await formatComponentJson(this.repo, node));
      formatted.push({ ...formatAssetJson(asset), children });
    }
    return { success: true, assets: formatted };
  }

  async createAsset(input: {
    name: string;
    type: string;
    icon: string | null;
    description: string | null;
  }) {
    const context = requireContext();
    const asset = await this.repo.create(context.companyId ?? '', input);
    return {
      success: true,
      message: 'Asset created successfully.',
      asset: { ...formatAssetJson(asset), children: [] },
    };
  }

  /** `formatAssetWithAlerts` — every component gets `is_alert`/`alert_attributes` (only actually evaluated when `inventory_check === true && device_id && product_id`, matching the old app's exact gate); `alerts_count` sums every `is_alert` branch's attribute count, recursively. */
  async getAsset(id: string) {
    const asset = await this.repo.findById(id);
    if (!asset) throw new NotFoundError('Asset not found.');
    const components = await this.repo.listAllComponentsForAsset(id);
    const tree = buildComponentTree(components, null);
    const rules = await this.rulesLookup.listActiveNonWidgetRulesForUser();

    let alertsCount = 0;
    const formatNode = async (node: AssetComponentTree): Promise<ComponentJson> => {
      const latest = node.deviceId
        ? await this.repo.findLatestDeviceValue(node.deviceId)
        : undefined;
      let isAlert = false;
      let alertAttributes: string[] = [];
      if (node.inventoryCheck && node.deviceId && node.productId && latest) {
        const result = this.checkComponentAlerts(rules, node.productId, latest.values);
        isAlert = result.isAlert;
        alertAttributes = result.alertAttributes;
        alertsCount += alertAttributes.length;
      }
      const children: ComponentJson[] = [];
      for (const child of node.children) children.push(await formatNode(child));
      return {
        id: node.id,
        asset_id: node.assetId,
        name: node.name,
        icon: node.icon,
        component_type: node.componentType,
        device_id: node.deviceId,
        product_id: node.productId,
        inventory_check: node.inventoryCheck,
        parent_id: node.parentId,
        floor_plan_id: node.floorPlanId,
        position_x: node.positionX,
        position_y: node.positionY,
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        latest_device_values: latest?.values ?? null,
        is_alert: isAlert,
        alert_attributes: alertAttributes,
        children,
      };
    };
    const children: ComponentJson[] = [];
    for (const node of tree) children.push(await formatNode(node));

    return {
      success: true,
      asset: { ...baseAssetJson(asset), children, alerts_count: alertsCount },
    };
  }

  async updateAsset(
    id: string,
    data: {
      name: string;
      type?: string | undefined;
      icon?: string | undefined;
      description?: string | undefined;
      components?: unknown;
    }
  ) {
    const updated = await this.repo.update(id, {
      name: data.name,
      type: data.type,
      icon: data.icon,
      description: data.description,
    });
    if (!updated) throw new NotFoundError('Asset not found.');
    const components = await this.repo.listTopLevelComponents(id);
    return {
      success: true,
      message: 'Asset updated successfully.',
      asset: {
        ...baseAssetJson(updated),
        components: components.map(c => this.rawComponentJson(c)),
      },
    };
  }

  async deleteAsset(id: string) {
    const ok = await this.repo.deleteCascade(id);
    if (!ok) throw new NotFoundError('Asset not found.');
    return { success: true, message: 'Asset deleted successfully.' };
  }

  async bulkDeleteAssets(assetIds: string[]) {
    await this.repo.bulkDeleteCascade(assetIds);
    return { success: true, message: 'Assets deleted successfully.' };
  }

  async getCompanyAssetsTree(
    companyId: string,
    query: { page: number; limit: number; search: string | undefined }
  ) {
    const context = requireContext();
    // D-0075's `getCompanyAssetsTree` fix, structural equivalent: the
    // {companyId} route param must equal the caller's own — never trust
    // a client-supplied id to select which company's tree is returned.
    if (companyId !== (context.companyId ?? '')) {
      throw new NotFoundError('Company not found.');
    }
    const company = await this.companyLookup.findById(companyId);
    if (!company) throw new NotFoundError('Company not found.');

    const { items, total } = await this.repo.findAssetTreeForCompany(companyId, query);
    const assets: ComponentJson[] = [];
    for (const asset of items) {
      const allComponents = await this.repo.listAllComponentsForAsset(asset.id);
      const tree = buildComponentTree(allComponents, null);
      const children: ComponentJson[] = [];
      for (const node of tree) children.push(await formatComponentJson(this.repo, node));
      assets.push({
        asset_id: asset.id,
        asset_name: asset.name,
        asset_type: asset.type,
        total_children: allComponents.filter(c => c.parentId !== null).length,
        total_layers: this.hierarchyDepth(allComponents),
        total_devices_assigned: allComponents.filter(c => c.deviceId !== null).length,
        components: children,
      });
    }
    return {
      success: true,
      company_id: companyId,
      company_name: company.name,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        last_page: Math.max(1, Math.ceil(total / query.limit)),
      },
      assets,
    };
  }

  private hierarchyDepth(components: AssetComponent[]): number {
    const byId = new Map(components.map(c => [c.id, c]));
    let maxDepth = 1;
    for (const component of components) {
      let depth = 1;
      let current = component.parentId ? byId.get(component.parentId) : undefined;
      while (current) {
        depth += 1;
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      maxDepth = Math.max(maxDepth, depth);
    }
    return maxDepth;
  }

  // ===========================================================================
  // Components
  // ===========================================================================

  async addComponents(assetId: string, inputs: CreateComponentInput[]) {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new NotFoundError('Asset not found.');

    for (const [index, input] of inputs.entries()) {
      if (input.parentId) {
        const result = await this.repo.validateParent(assetId, input.parentId);
        if (!result.ok) {
          throw new ValidationError('Validation failed', {
            parent_id: [
              result.reason === 'invalid'
                ? 'Invalid parent component for this asset.'
                : 'Parent component already has a device assigned and inventory_check enabled — cannot add child under this component.',
            ],
          });
        }
      }
      await this.assertValidDeviceAndProduct(input.deviceId, input.productId, index);
      await this.assertFloorPlanExists(
        input.floorPlanId,
        `components.${String(index)}.floor_plan_id`
      );
    }

    const created = await this.repo.createComponents(assetId, inputs);
    const components: ComponentJson[] = [];
    for (const component of created) {
      components.push(await formatComponentJson(this.repo, { ...component, children: [] }));
    }
    return { success: true, message: 'Component(s) added successfully.', components };
  }

  private async assertFloorPlanExists(
    floorPlanId: string | null | undefined,
    field: string
  ): Promise<void> {
    if (floorPlanId && !(await this.repo.floorPlanExists(floorPlanId))) {
      throw new ValidationError('Validation failed', {
        [field]: ['The selected floor plan id is invalid.'],
      });
    }
  }

  private async assertValidDeviceAndProduct(
    deviceId: string | null,
    productId: string | null,
    index: number
  ): Promise<void> {
    if (deviceId) {
      const context = requireContext();
      if (
        !/^\d+$/.test(deviceId) ||
        !(await this.devicesLookup.findAuthorized(
          deviceId,
          context.userId,
          context.companyId ?? ''
        ))
      ) {
        throw new ValidationError('Validation failed', {
          [`components.${String(index)}.device_id`]: ['The selected device id is invalid.'],
        });
      }
    }
    if (productId) {
      if (!/^\d+$/.test(productId) || !(await this.productsLookup.findById(productId))) {
        throw new ValidationError('Validation failed', {
          [`components.${String(index)}.product_id`]: ['The selected product id is invalid.'],
        });
      }
    }
  }

  async getComponent(id: string) {
    const context = requireContext();
    const component = await this.repo.findComponentById(id, context.companyId ?? '');
    if (!component) throw new NotFoundError('Component not found.');
    const children = await this.repo.listAllComponentsForAsset(component.assetId);
    const tree = buildComponentTree(children, component.id);
    const json = await formatComponentJson(this.repo, { ...component, children: tree });
    return { success: true, component: json };
  }

  async updateComponent(id: string, data: UpdateComponentInput) {
    const context = requireContext();
    const component = await this.repo.findComponentById(id, context.companyId ?? '');
    if (!component) throw new NotFoundError('Component not found.');

    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        throw new ValidationError('A component cannot be its own parent.');
      }
      if (await this.repo.wouldCreateCircularReference(id, data.parentId)) {
        throw new ValidationError('This would create a circular reference.');
      }
      const result = await this.repo.validateParent(component.assetId, data.parentId);
      if (!result.ok) {
        throw new ValidationError(
          result.reason === 'invalid'
            ? 'Parent component must belong to the same asset.'
            : 'Parent component already has a device assigned and inventory_check enabled — cannot move this component under it.'
        );
      }
    }
    if (data.deviceId !== undefined && data.deviceId !== null) {
      await this.assertValidDeviceAndProduct(data.deviceId, null, 0);
    }
    if (data.productId !== undefined && data.productId !== null) {
      await this.assertValidDeviceAndProduct(null, data.productId, 0);
    }
    await this.assertFloorPlanExists(data.floorPlanId, 'floor_plan_id');

    const updated = await this.repo.updateComponent(id, data);
    if (!updated) throw new NotFoundError('Component not found.');
    const latest = updated.deviceId
      ? await this.repo.findLatestDeviceValue(updated.deviceId)
      : undefined;
    const json = await formatComponentJson(this.repo, { ...updated, children: [] });
    return {
      success: true,
      message: 'Component updated successfully.',
      component: json,
      DevicelatestPacket: latest?.values ?? null,
    };
  }

  async deleteComponent(id: string) {
    const context = requireContext();
    const component = await this.repo.findComponentById(id, context.companyId ?? '');
    if (!component) throw new NotFoundError('Component not found.');
    await this.repo.deleteComponentCascade(id);
    return { success: true, message: 'Component deleted successfully.' };
  }

  async bulkUpdateComponents(
    updates: {
      id: string;
      name?: string | undefined;
      componentType?: string | null | undefined;
      icon?: string | null | undefined;
      parentId?: string | null | undefined;
    }[]
  ) {
    const context = requireContext();
    const results: ComponentJson[] = [];
    for (const update of updates) {
      const component = await this.repo.findComponentById(update.id, context.companyId ?? '');
      if (!component) throw new NotFoundError('Component not found.');
      if (update.parentId && !(await this.repo.componentExists(update.parentId))) {
        throw new ValidationError('Validation failed', {
          parent_id: ['The selected parent id is invalid.'],
        });
      }
      if (
        update.parentId &&
        (await this.repo.wouldCreateCircularReference(update.id, update.parentId))
      ) {
        throw new ValidationError('One or more updates would create a circular reference.');
      }
      const updated = await this.repo.updateComponent(update.id, {
        name: update.name,
        componentType: update.componentType,
        icon: update.icon,
        parentId: update.parentId,
      });
      if (updated) results.push(await formatComponentJson(this.repo, { ...updated, children: [] }));
    }
    return { success: true, message: 'Component(s) updated successfully.', components: results };
  }

  private rawComponentJson(component: AssetComponent): ComponentJson {
    return {
      id: component.id,
      asset_id: component.assetId,
      name: component.name,
      icon: component.icon,
      component_type: component.componentType,
      device_id: component.deviceId,
      product_id: component.productId,
      inventory_check: component.inventoryCheck,
      parent_id: component.parentId,
      floor_plan_id: component.floorPlanId,
      position_x: component.positionX,
      position_y: component.positionY,
      created_at: component.createdAt,
      updated_at: component.updatedAt,
    };
  }

  // ===========================================================================
  // Status / devices ("API #1"/"API #2"/combined)
  // ===========================================================================

  /** `checkComponentAlerts` — evaluates the caller's own active non-widget rules against a device's flattened values via the canonical evaluator (11.10), returning which attributes triggered. `device_values.values` is already flat/pre-filtered at write time (module 2.4/2.8's own research) — no `mapPayload` flatten step needed. */
  private checkComponentAlerts(
    rules: {
      id: string;
      conditions: import('../../shared/utils/rule-condition-evaluator.js').RuleCondition[];
    }[],
    productId: string,
    values: Record<string, unknown>
  ): { isAlert: boolean; alertAttributes: string[] } {
    const alertAttributes = new Set<string>();
    for (const rule of rules) {
      if (rule.conditions.length === 0) continue;
      const result = evaluate(rule.conditions, values, productId);
      if (result.matched) {
        for (const index of result.matchedConditionIndices) {
          const attr = rule.conditions[index]?.selectedAttribute;
          if (attr) alertAttributes.add(attr);
        }
      }
    }
    return { isAlert: alertAttributes.size > 0, alertAttributes: [...alertAttributes] };
  }

  async getStatusSummary(id: string) {
    const context = requireContext();
    const companyId = context.companyId ?? '';
    const asset = await this.repo.findById(id);
    const component = asset ?? (await this.repo.findComponentById(id, companyId));
    if (!component) throw new NotFoundError('Asset/Component not found');

    const devices = asset
      ? await this.repo.lastChildDevicesForAsset(id)
      : await this.repo.lastChildDevicesForComponent(id);
    const rules = await this.rulesLookup.listActiveNonWidgetRulesForUser();
    const now = new Date();
    // `alerts_last_24h` stays a real, separate 24h window — not part of the
    // offline-threshold unification (D-0069's own precedent: 2.7's
    // `active_in_last_24h` was kept distinct from the unified `isOffline()`
    // threshold too).
    const alertsWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let alertsCount = 0;
    let alertsLast24h = 0;
    let onlineDevices = 0;
    let offlineDevices = 0;
    const seen = new Set<string>();

    for (const device of devices) {
      if (seen.has(device.deviceId)) continue;
      seen.add(device.deviceId);

      const latest = await this.repo.findLatestDeviceValue(device.deviceId);
      // 11.15/§9: the old 24h-only ad hoc threshold is replaced by the
      // shared, unified 30min `isOffline()` helper (D-0069) here.
      if (!latest || !latest.createdAt || isOffline(latest.createdAt, now)) {
        offlineDevices += 1;
        if (!latest) continue;
      } else {
        onlineDevices += 1;
      }

      if (device.productId) {
        const result = this.checkComponentAlerts(rules, device.productId, latest.values);
        alertsCount += result.alertAttributes.length;

        const lastDay = await this.repo.countLastDayValues(device.deviceId, alertsWindowStart);
        for (const packet of lastDay) {
          const packetResult = this.checkComponentAlerts(rules, device.productId, packet.values);
          if (packetResult.isAlert) alertsLast24h += 1;
        }
      }
    }

    return {
      success: true,
      id,
      alerts_count: alertsCount,
      alerts_last_24h: alertsLast24h,
      online_devices: onlineDevices,
      offline_devices: offlineDevices,
    };
  }

  /** `buildParentChain` — walks up from the device-bearing component to the tree root, matching the old app's `[self, parent, ..., top]` -> `array_reverse` -> `child_id_1..N` (top-down) shape exactly. `allComponents` is the asset's full flat set, already fetched by the caller. */
  private buildParentChain(
    allComponents: AssetComponent[],
    componentId: string
  ): { assetId: string; childIds: string[] } {
    const byId = new Map(allComponents.map(c => [c.id, c]));
    const chain: string[] = [];
    let current: AssetComponent | undefined = byId.get(componentId);
    const assetId = current?.assetId ?? '';
    while (current) {
      chain.push(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { assetId, childIds: chain.reverse() };
  }

  async componentsDevices(
    id: string,
    query: { type: string; search: string | undefined; perPage: number; page: number }
  ) {
    const context = requireContext();
    const companyId = context.companyId ?? '';
    const isAssetType = ['asset', 'assets'].includes(query.type.toLowerCase());
    const asset = isAssetType ? await this.repo.findById(id) : undefined;
    const component = isAssetType ? undefined : await this.repo.findComponentById(id, companyId);
    if (isAssetType ? !asset : !component) {
      throw new NotFoundError(`${isAssetType ? 'Asset' : 'Component'} not found`);
    }
    const assetId = asset?.id ?? component?.assetId ?? '';

    const devices = asset
      ? await this.repo.lastChildDevicesForAsset(id)
      : await this.repo.lastChildDevicesForComponent(id);
    const allComponents = await this.repo.listAllComponentsForAsset(assetId);
    const rules = await this.rulesLookup.listActiveNonWidgetRulesForUser();
    const seen = new Set<string>();
    const entries: ComponentJson[] = [];

    for (const device of devices) {
      if (seen.has(device.deviceId)) continue;
      seen.add(device.deviceId);

      const deviceRow = await this.devicesLookup.findByIdUnscoped(device.deviceId);
      if (!deviceRow) continue;
      if (
        query.search &&
        !`${deviceRow.name}${deviceRow.deviceUniqueIdentifier}`
          .toLowerCase()
          .includes(query.search.toLowerCase())
      ) {
        continue;
      }

      const latest = await this.repo.findLatestDeviceValue(device.deviceId);
      const values = latest?.values ?? {};

      const attributeKeys = device.productId
        ? await this.repo.listSelectedAttributeKeys(device.productId)
        : [];
      const attributes: ComponentJson[] = [];
      for (const key of attributeKeys) {
        const val = values[key] ?? null;
        const alertResult =
          device.productId && latest
            ? this.checkComponentAlerts(rules, device.productId, { [key]: val })
            : { isAlert: false };
        const widgetSetting = await this.repo.findWidgetSettingForDeviceAttribute(
          device.deviceId,
          key
        );
        attributes.push({
          label: key.replace('deviceInfo.', '').replace('object.', ''),
          widgetType: widgetSetting?.widgetType ?? 'default',
          last_packet_value: val,
          isAlert: alertResult.isAlert,
          unit: widgetSetting?.unit ?? null,
        });
      }

      const chain = this.buildParentChain(allComponents, device.componentId);
      const entry: ComponentJson = {
        id: deviceRow.id,
        uuid: deviceRow.deviceUniqueIdentifier,
        name: deviceRow.name,
        status: deviceRow.status,
        created_at: deviceRow.createdAt,
        attributes,
        asset_id: chain.assetId,
      };
      chain.childIds.forEach((childId, index) => {
        entry[`child_id_${String(index + 1)}`] = childId;
      });
      entries.push(entry);
    }

    const total = entries.length;
    const offset = (query.page - 1) * query.perPage;
    const paginated = entries.slice(offset, offset + query.perPage);

    return {
      success: true,
      devices: paginated,
      pagination: {
        total,
        per_page: query.perPage,
        current_page: query.page,
        last_page: Math.max(1, Math.ceil(total / query.perPage)),
      },
      filters: { search: query.search ?? null },
    };
  }

  async statusAndDevices(id: string) {
    const status = await this.getStatusSummary(id);
    const devices = await this.componentsDevices(id, {
      type: 'component',
      search: undefined,
      perPage: 25,
      page: 1,
    });
    return { success: true, status, devices: devices.devices };
  }

  // ===========================================================================
  // Floor plans
  // ===========================================================================

  /** `FloorPlanController::store` — one floor plan per `asset_component_id` (schema `@unique`); re-uploading replaces the file + row, preserving `floor_level` unless a new one is given. Ownership check matches D-0075's live-app fix (`authorizedComponentQuery()`), the structural equivalent here. */
  async uploadFloorPlan(input: {
    assetComponentId: string;
    floorLevel: number | undefined;
    image: { buffer: Buffer; contentType: string; extension: string };
  }): Promise<{ status: 200 | 201; body: ComponentJson }> {
    const context = requireContext();
    const component = await this.repo.findComponentById(
      input.assetComponentId,
      context.companyId ?? ''
    );
    if (!component) throw new NotFoundError('Component not found.');

    // `required|image|...` (Laravel) validates the real file content, not
    // just the client-suppliable MIME type header — `imageSize` throws on
    // unparseable bytes (confirmed live: a plain text file posing as
    // image/png), which is exactly that same real-content check.
    let dimensions: { width?: number; height?: number };
    try {
      dimensions = imageSize(input.image.buffer);
    } catch {
      throw new ValidationError('The image must be a valid image file.', {
        image: ['The image must be a valid image file.'],
      });
    }
    if (!dimensions.width || !dimensions.height) {
      throw new ValidationError('The image could not be read.', {
        image: ['The image could not be read.'],
      });
    }

    const existing = await this.repo.findFloorPlanByComponentId(input.assetComponentId);
    if (existing) {
      const key = keyFromUrl(existing.filePath) ?? existing.filePath;
      await deleteObject(key).catch(() => undefined);
    }

    const uploaded = await uploadObject({ prefix: 'floor-plans', ...input.image });
    const { floorPlan } = await this.repo.upsertFloorPlan(input.assetComponentId, {
      filePath: uploaded.url,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
      floorLevel: input.floorLevel ?? existing?.floorLevel ?? 0,
    });

    return {
      status: existing ? 200 : 201,
      body: {
        success: true,
        message: existing ? 'Floor plan replaced.' : 'Floor plan uploaded.',
        data: {
          id: floorPlan.id,
          asset_component_id: floorPlan.assetComponentId,
          floor_level: floorPlan.floorLevel,
          url: floorPlan.filePath,
          width_px: floorPlan.widthPx,
          height_px: floorPlan.heightPx,
        },
      },
    };
  }

  async getFloorPlan(assetComponentId: string) {
    const context = requireContext();
    const component = await this.repo.findComponentById(assetComponentId, context.companyId ?? '');
    if (!component) throw new NotFoundError('No floor plan uploaded for this component yet.');
    const floorPlan = await this.repo.findFloorPlanByComponentId(assetComponentId);
    if (!floorPlan) throw new NotFoundError('No floor plan uploaded for this component yet.');
    return {
      success: true,
      message: 'Floor plan retrieved.',
      data: await this.serializeFloorPlan(floorPlan.id, floorPlan),
    };
  }

  /** `showBuilding` — D-0075's hotfix returns an empty (not 404) result for an asset the caller doesn't own, matched here exactly rather than throwing. */
  async getBuildingFloorPlans(assetId: string) {
    const context = requireContext();
    const asset = await this.repo.findById(assetId);
    if (!asset || asset.companyId !== (context.companyId ?? '')) {
      return { success: true, message: 'Building floor plans retrieved.', data: [] };
    }

    const allComponents = await this.repo.listAllComponentsForAsset(assetId);
    const withPlans: {
      componentId: string;
      floorPlan: Awaited<ReturnType<AssetsRepository['findFloorPlanByComponentId']>>;
    }[] = [];
    for (const component of allComponents) {
      const floorPlan = await this.repo.findFloorPlanByComponentId(component.id);
      if (floorPlan) withPlans.push({ componentId: component.id, floorPlan });
    }
    withPlans.sort((a, b) => (a.floorPlan?.floorLevel ?? 0) - (b.floorPlan?.floorLevel ?? 0));

    const data: ComponentJson[] = [];
    for (const entry of withPlans) {
      if (!entry.floorPlan) continue;
      data.push(await this.serializeFloorPlan(entry.floorPlan.id, entry.floorPlan));
    }
    return { success: true, message: 'Building floor plans retrieved.', data };
  }

  /**
   * Shared by `getFloorPlan`/`getBuildingFloorPlans`. `online_count` matches
   * the old app's own definition literally: has this device *ever* reported
   * a value (`last_updated !== 'never'`), not a 30min-recency check — a
   * distinct concept from `isOffline()`, not folded into that unification.
   * `alarmsByDevice`: the old app's `sortByDesc('triggered_at')->keyBy
   * ('device_id')` combination actually keeps the *oldest* alarm per
   * device (Laravel's `keyBy` keeps the last-iterated match, and iteration
   * runs newest-to-oldest) — the doc comment there claims "most recent" is
   * kept; this deliberately implements the stated intent (true most-recent
   * per device) rather than porting the accidental bug (Design notes).
   */
  private async serializeFloorPlan(
    floorPlanId: string,
    floorPlan: NonNullable<Awaited<ReturnType<AssetsRepository['findFloorPlanByComponentId']>>>
  ): Promise<ComponentJson> {
    const positioned = await this.repo.listPositionedComponentsOnFloorPlan(floorPlanId);
    const deviceIds = [
      ...new Set(positioned.map(c => c.deviceId).filter((id): id is string => id !== null)),
    ];

    const devices = new Map<
      string,
      {
        id: string;
        deviceUniqueIdentifier: string;
        name: string;
        status: string;
        createdAt: Date | null;
      }
    >();
    for (const deviceId of deviceIds) {
      const device = await this.devicesLookup.findByIdUnscoped(deviceId);
      if (device) devices.set(deviceId, device);
    }
    const onlineCount = positioned.filter(c => c.deviceId && devices.has(c.deviceId)).length;

    const alarms = await this.repo.listActiveAlarmsForDevices(deviceIds);
    const alarmByDevice = new Map<string, (typeof alarms)[number]>();
    for (const alarm of alarms) {
      const existing = alarmByDevice.get(alarm.deviceId);
      if (
        !existing ||
        (alarm.triggeredAt && existing.triggeredAt && alarm.triggeredAt > existing.triggeredAt)
      ) {
        alarmByDevice.set(alarm.deviceId, alarm);
      }
    }

    const positionedComponents = positioned.map(c => {
      const alarm = c.deviceId ? alarmByDevice.get(c.deviceId) : undefined;
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        component_type: c.componentType,
        device_id: c.deviceId,
        position_x: c.positionX,
        position_y: c.positionY,
        active_alarm: alarm
          ? {
              condition_snapshot: alarm.conditionSnapshot,
              triggered_value: alarm.triggeredValue,
              triggered_at: alarm.triggeredAt,
            }
          : null,
      };
    });

    return {
      id: floorPlan.id,
      asset_component_id: floorPlan.assetComponentId,
      floor_level: floorPlan.floorLevel,
      url: floorPlan.filePath,
      width_px: floorPlan.widthPx,
      height_px: floorPlan.heightPx,
      positioned_components: positionedComponents,
      device_count: deviceIds.length,
      online_count: onlineCount,
      active_alarm_count: alarms.length,
    };
  }
}
