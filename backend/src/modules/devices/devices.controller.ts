import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import { AppError } from '../../platform/errors/app-error.js';
import {
  toDeviceResponse,
  toDeviceWithAssignmentResponse,
  toUserPreferenceResponse,
  toProductWithDevicesResponse,
  toUserDeviceResponse,
} from './devices.mapper.js';
import type { DevicesService } from './devices.service.js';
import {
  BulkDeviceIdsRequestSchema,
  CreateDeviceRequestSchema,
  DeviceIdParamSchema,
  ListDevicesRequestSchema,
  ProductIdParamSchema,
  SendBulkCommandsRequestSchema,
  SendCommandRequestSchema,
  UpdateDeviceRequestSchema,
  UserDevicesListRequestSchema,
} from './devices.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // -- index() (11.29) -------------------------------------------------------

  listDevices = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListDevicesRequestSchema, req.query);
    const { items, total } = await this.devicesService.listProductsWithDevices({
      productId: query.product_id !== undefined ? String(query.product_id) : undefined,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
    });

    const paginator = buildLaravelPaginator({
      items: items.map(toProductWithDevicesResponse),
      page: query.page,
      perPage: query.per_page,
      total,
      path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      query: { product_id: query.product_id, search: query.search },
    });

    res
      .status(200)
      .json({ success: true, message: 'Products fetched successfully.', data: paginator });
  };

  createDevice = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateDeviceRequestSchema, req.body);
    const device = await this.devicesService.createDevice({
      deviceUniqueIdentifier: input.device_unique_identifier,
      name: input.name,
      type: input.type,
      status: input.status,
      location: input.location,
      tags: input.tags,
      productId: String(input.product_id),
    });

    res.status(201).json({
      success: true,
      message: 'Device created successfully.',
      data: toDeviceResponse(device),
    });
  };

  updateDevice = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    const input = parseOrThrow(UpdateDeviceRequestSchema, req.body);

    const updated = await this.devicesService.updateDevice(String(id), {
      deviceUniqueIdentifier: input.device_unique_identifier,
      name: input.name,
      location: input.location,
      tags: input.tags,
    });

    res.status(200).json({
      success: true,
      message: 'Device updated successfully.',
      data: toDeviceResponse(updated),
    });
  };

  deleteDevice = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    await this.devicesService.deleteDevice(String(id));
    res.status(204).send();
  };

  getDevicePoints = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    const points = await this.devicesService.getDevicePoints(String(id));

    res.status(200).json({
      success: true,
      message: 'Points retrieved.',
      data: {
        device_id: Number(points.deviceId),
        device_unique_identifier: points.deviceUniqueIdentifier,
        last_reported_at: points.lastReportedAt,
        points: points.points.map(p => ({
          point_key: p.pointKey,
          label: p.label,
          unit: p.unit,
          is_unique_identifier: p.isUniqueIdentifier,
          is_selected: p.isSelected,
          semantic_type: null,
          commandable: null,
          last_value: p.lastValue,
        })),
      },
    });
  };

  getDevicesByProduct = async (req: Request, res: Response): Promise<void> => {
    const { product_id } = parseOrThrow(ProductIdParamSchema, req.params);
    const result = await this.devicesService.getDevicesByProduct(String(product_id));

    if (result.devices.length === 0) {
      res
        .status(404)
        .json({ success: false, message: 'No devices found for this product.', data: [] });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Devices retrieved successfully.',
      data: result.devices.map(toDeviceWithAssignmentResponse),
      userPreference: toUserPreferenceResponse(result.userPreference),
      assigned_device_ids: result.assignedDeviceIds.map(Number),
    });
  };

  enableDevice = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    const device = await this.devicesService.setDeviceStatus(String(id), 'active');
    res.status(200).json({
      success: true,
      message: 'Device enabled successfully.',
      data: toDeviceResponse(device),
    });
  };

  disableDevice = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    const device = await this.devicesService.setDeviceStatus(String(id), 'inactive');
    res.status(200).json({
      success: true,
      message: 'Device disabled successfully.',
      data: toDeviceResponse(device),
    });
  };

  bulkEnable = async (req: Request, res: Response): Promise<void> => {
    const { device_ids } = parseOrThrow(BulkDeviceIdsRequestSchema, req.body);
    const updatedCount = await this.devicesService.bulkSetStatus(device_ids.map(String), 'active');
    res.status(200).json({
      success: true,
      message: 'Devices enabled successfully.',
      data: { updated_count: updatedCount, device_ids },
    });
  };

  bulkDisable = async (req: Request, res: Response): Promise<void> => {
    const { device_ids } = parseOrThrow(BulkDeviceIdsRequestSchema, req.body);
    const updatedCount = await this.devicesService.bulkSetStatus(
      device_ids.map(String),
      'inactive'
    );
    res.status(200).json({
      success: true,
      message: 'Devices disabled successfully.',
      data: { updated_count: updatedCount, device_ids },
    });
  };

  bulkDestroy = async (req: Request, res: Response): Promise<void> => {
    const { device_ids } = parseOrThrow(BulkDeviceIdsRequestSchema, req.body);
    const deletedCount = await this.devicesService.bulkDeleteDevices(device_ids.map(String));
    res.status(200).json({
      success: true,
      message: 'Devices deleted successfully.',
      data: { deleted_count: deletedCount, device_ids },
    });
  };

  sendCommand = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DeviceIdParamSchema, req.params);
    const input = parseOrThrow(SendCommandRequestSchema, req.body);

    const result = await this.devicesService.sendCommand(
      String(id),
      input.command,
      input.parameters ?? {}
    );
    if (!result.success) {
      throw new AppError({
        code: 'COMMAND_SEND_FAILED',
        httpStatus: 500,
        message: 'Command send failed.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Command sent successfully.',
      data: {
        device_id: id,
        command: input.command,
        parameters: input.parameters ?? {},
        mqtt_source: result.source,
      },
    });
  };

  sendBulkCommands = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(SendBulkCommandsRequestSchema, req.body);
    const results = await this.devicesService.sendBulkCommands(
      input.device_ids.map(String),
      input.command,
      input.parameters ?? {}
    );

    const successCount = results.filter(r => r.result.success).length;
    res.status(200).json({
      success: true,
      message: 'Bulk commands sent.',
      data: {
        total_devices: results.length,
        successful: successCount,
        failed: results.length - successCount,
        results: results.map(r => ({
          device_id: Number(r.device.id),
          device_name: r.device.name,
          success: r.result.success,
          mqtt_source: r.result.source,
        })),
        command: { command: input.command, parameters: input.parameters ?? {} },
      },
    });
  };

  listUserDevices = async (req: Request, res: Response): Promise<void> => {
    parseOrThrow(UserDevicesListRequestSchema, req.query); // accepted for contract parity, unused (11.48)
    const devices = await this.devicesService.listUserDevices();

    if (devices.length === 0) {
      res.status(404).json({ success: false, message: 'No record found.' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Devices fetched successfully.',
      data: devices.map(toUserDeviceResponse),
    });
  };
}
