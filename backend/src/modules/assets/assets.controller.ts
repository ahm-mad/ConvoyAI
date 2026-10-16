import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { AssetsService } from './assets.service.js';
import type { CreateComponentInput } from './assets.types.js';
import {
  AddComponentsRequestSchema,
  AssetComponentIdParamSchema,
  AssetIdParamSchema,
  AssetsCompanyTreeQuerySchema,
  BuildingAssetIdParamSchema,
  BulkDeleteAssetsRequestSchema,
  BulkUpdateComponentsRequestSchema,
  ComponentBareIdParamSchema,
  ComponentIdParamSchema,
  ComponentsDevicesQuerySchema,
  CompanyIdParamSchema,
  CreateAssetRequestSchema,
  UpdateAssetRequestSchema,
  UpdateComponentRequestSchema,
  UploadFloorPlanRequestSchema,
} from './assets.schemas.js';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function toComponentInput(raw: {
  name: string;
  component_type?: string | null | undefined;
  icon?: string | null | undefined;
  parent_id?: number | string | null | undefined;
  device_id?: number | string | null | undefined;
  product_id?: number | string | null | undefined;
  inventory_check?: boolean | null | undefined;
  floor_plan_id?: number | string | null | undefined;
  position_x?: number | null | undefined;
  position_y?: number | null | undefined;
}): CreateComponentInput {
  return {
    name: raw.name,
    componentType: raw.component_type ?? null,
    icon: raw.icon ?? null,
    deviceId: raw.device_id !== undefined && raw.device_id !== null ? String(raw.device_id) : null,
    productId:
      raw.product_id !== undefined && raw.product_id !== null ? String(raw.product_id) : null,
    inventoryCheck: raw.inventory_check ?? null,
    parentId: raw.parent_id !== undefined && raw.parent_id !== null ? String(raw.parent_id) : null,
    floorPlanId:
      raw.floor_plan_id !== undefined && raw.floor_plan_id !== null
        ? String(raw.floor_plan_id)
        : null,
    positionX: raw.position_x ?? null,
    positionY: raw.position_y ?? null,
  };
}

export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  // -- Assets --

  listAssets = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.listAssets());
  };

  createAsset = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateAssetRequestSchema, req.body);
    const result = await this.service.createAsset({
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
      description: input.description ?? null,
    });
    res.status(201).json(result);
  };

  getAsset = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    res.status(200).json(await this.service.getAsset(id));
  };

  updateAsset = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    const input = parseOrThrow(UpdateAssetRequestSchema, req.body);
    res.status(200).json(await this.service.updateAsset(id, input));
  };

  deleteAsset = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteAsset(id));
  };

  bulkDeleteAssets = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(BulkDeleteAssetsRequestSchema, req.body);
    res.status(200).json(await this.service.bulkDeleteAssets(input.asset_ids.map(String)));
  };

  getCompanyAssetsTree = async (req: Request, res: Response): Promise<void> => {
    const { companyId } = parseOrThrow(CompanyIdParamSchema, req.params);
    const query = parseOrThrow(AssetsCompanyTreeQuerySchema, req.query);
    res.status(200).json(
      await this.service.getCompanyAssetsTree(companyId, {
        page: query.page,
        limit: query.limit,
        search: query.search,
      })
    );
  };

  // -- Components --

  addComponents = async (req: Request, res: Response): Promise<void> => {
    const { id: assetId } = parseOrThrow(AssetIdParamSchema, req.params);
    const input = parseOrThrow(AddComponentsRequestSchema, req.body);
    res
      .status(201)
      .json(await this.service.addComponents(assetId, input.components.map(toComponentInput)));
  };

  getComponent = async (req: Request, res: Response): Promise<void> => {
    const { componentId } = parseOrThrow(ComponentIdParamSchema, req.params);
    res.status(200).json(await this.service.getComponent(componentId));
  };

  updateComponent = async (req: Request, res: Response): Promise<void> => {
    const { componentId } = parseOrThrow(ComponentIdParamSchema, req.params);
    const input = parseOrThrow(UpdateComponentRequestSchema, req.body);
    const result = await this.service.updateComponent(componentId, {
      name: input.name,
      componentType: input.component_type,
      icon: input.icon,
      deviceId:
        input.device_id !== undefined && input.device_id !== null
          ? String(input.device_id)
          : input.device_id,
      productId:
        input.product_id !== undefined && input.product_id !== null
          ? String(input.product_id)
          : input.product_id,
      inventoryCheck: input.inventory_check,
      parentId:
        input.parent_id !== undefined && input.parent_id !== null
          ? String(input.parent_id)
          : input.parent_id,
      floorPlanId:
        input.floor_plan_id !== undefined && input.floor_plan_id !== null
          ? String(input.floor_plan_id)
          : input.floor_plan_id,
      positionX: input.position_x,
      positionY: input.position_y,
    });
    res.status(200).json(result);
  };

  deleteComponent = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ComponentBareIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteComponent(id));
  };

  bulkUpdateComponents = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(BulkUpdateComponentsRequestSchema, req.body);
    const result = await this.service.bulkUpdateComponents(
      // Laravel does `array_filter($updateData, fn ($v) => $v !== null)` — a null (incl. a frontend `""`) means "leave as is",
      // never "clear" (D-0127).
      input.components.map(c => ({
        id: String(c.id),
        name: c.name,
        componentType: c.component_type ?? undefined,
        icon: c.icon ?? undefined,
        parentId:
          c.parent_id !== undefined && c.parent_id !== null ? String(c.parent_id) : undefined,
      }))
    );
    res.status(200).json(result);
  };

  // -- Status / devices --

  getStatusSummary = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    res.status(200).json(await this.service.getStatusSummary(id));
  };

  componentsDevices = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    const query = parseOrThrow(ComponentsDevicesQuerySchema, req.query);
    res.status(200).json(
      await this.service.componentsDevices(id, {
        type: query.type,
        search: query.search,
        perPage: query.per_page,
        page: query.page,
      })
    );
  };

  statusAndDevices = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AssetIdParamSchema, req.params);
    res.status(200).json(await this.service.statusAndDevices(id));
  };

  // -- Floor plans --

  uploadFloorPlan = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(UploadFloorPlanRequestSchema, req.body);
    const file = req.file;
    if (!file) {
      throw new ValidationError('Validation failed', { image: ['The image field is required.'] });
    }
    const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];
    if (!extension) {
      throw new ValidationError('Validation failed', {
        image: ['The image must be a file of type: jpeg, png, jpg, webp, gif.'],
      });
    }
    const { status, body } = await this.service.uploadFloorPlan({
      assetComponentId: String(input.asset_component_id),
      floorLevel: input.floor_level,
      image: { buffer: file.buffer, contentType: file.mimetype, extension },
    });
    res.status(status).json(body);
  };

  getFloorPlan = async (req: Request, res: Response): Promise<void> => {
    const { assetComponentId } = parseOrThrow(AssetComponentIdParamSchema, req.params);
    res.status(200).json(await this.service.getFloorPlan(assetComponentId));
  };

  getBuildingFloorPlans = async (req: Request, res: Response): Promise<void> => {
    const { assetId } = parseOrThrow(BuildingAssetIdParamSchema, req.params);
    res.status(200).json(await this.service.getBuildingFloorPlans(assetId));
  };
}
