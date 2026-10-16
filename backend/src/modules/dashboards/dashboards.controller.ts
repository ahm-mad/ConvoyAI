import type { Request, Response } from 'express';
import type { z } from 'zod';
import { parseOrThrow } from '../../platform/http/validate.js';
import { NotFoundError } from '../../platform/errors/app-error.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { DashboardsService } from './dashboards.service.js';
import {
  toDashboardDetailResponse,
  toDashboardListItemResponse,
  toDashboardResponse,
  toDashboardSummaryResponse,
  toWidgetResponse,
  toWidgetSettingResponse,
} from './dashboards.mapper.js';
import {
  AnalyticsRequestSchema,
  CreateDashboardRequestSchema,
  CreateWidgetRequestSchema,
  DashboardIdParamSchema,
  GraphDataRequestSchema,
  ListDashboardsRequestSchema,
  MonthlyRegistrationsRequestSchema,
  PacketHistoryRequestSchema,
  StoreWidgetSettingsRequestSchema,
  StoreWidgetSettingsResourceRequestSchema,
  UpdateDashboardRequestSchema,
  UpdateWidgetRequestSchema,
  UpdateWidgetSettingsRequestSchema,
  UserIdParamSchema,
  WidgetIdParamSchema,
  WidgetSettingIdParamSchema,
} from './dashboards.schemas.js';
import type { WidgetSettingEntryInput } from './dashboards.types.js';

function requestPath(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`;
}

function toEntryInput(
  raw: z.infer<typeof StoreWidgetSettingsRequestSchema>['widget_settings'][number]
): WidgetSettingEntryInput {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    settings: raw.settings,
    attributes: raw.attributes,
    yAxisLabel: raw.y_axis_label,
    device: raw.device,
    data: raw.data,
    unit: raw.unit,
    icon: raw.icon,
    decimal: raw.decimal,
    showTimestamp: raw.show_timestamp,
    product: raw.product,
    label: raw.label,
    backgroundColor: raw.background_color,
    valueColor: raw.value_color,
    textColor: raw.text_color,
    maxValue: raw.max_value,
    tankType: raw.tank_type,
    graphType: raw.graph_type,
    enabled: raw.enabled === undefined ? undefined : [true, 1, '1'].includes(raw.enabled),
    conditions: raw.conditions,
  };
}

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  // -- Dashboards CRUD --

  listDashboards = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListDashboardsRequestSchema, req.query);
    const { items, total } = await this.service.listDashboards({
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
    });
    const paginator = buildLaravelPaginator({
      items: items.map(toDashboardListItemResponse),
      page: query.page,
      perPage: query.per_page,
      total,
      path: requestPath(req),
      query: { search: query.search, sort_by: query.sort_by, sort_order: query.sort_order },
    });
    res
      .status(200)
      .json({ success: true, message: 'Dashboards fetched successfully.', data: paginator });
  };

  listAdminDashboards = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListDashboardsRequestSchema, req.query);
    const { items, total } = await this.service.listAdminDashboards({
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
    });
    const paginator = buildLaravelPaginator({
      items: items.map(toDashboardListItemResponse),
      page: query.page,
      perPage: query.per_page,
      total,
      path: requestPath(req),
      query: { search: query.search, sort_by: query.sort_by, sort_order: query.sort_order },
    });
    res
      .status(200)
      .json({ success: true, message: 'Dashboards fetched successfully.', data: paginator });
  };

  createDashboard = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(CreateDashboardRequestSchema, req.body);
    const dashboard = await this.service.createDashboard(body.name);
    res.status(201).json({
      success: true,
      message: 'Dashboard created successfully.',
      data: toDashboardResponse(dashboard),
    });
  };

  /** `DashboardController::show()`'s 404 uses the frozen contract's own `{error,status,code}` shape (Design notes) — handled locally, not via the global error handler's standard envelope. */
  getDashboard = async (
    req: Request,
    res: Response,
    next: (err?: unknown) => void
  ): Promise<void> => {
    const { id } = parseOrThrow(DashboardIdParamSchema, req.params);
    try {
      const { dashboard, widgets } = await this.service.getDashboard(String(id));
      res.status(200).json(toDashboardDetailResponse(dashboard, widgets));
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, status: 'error', code: 404 });
        return;
      }
      next(err);
    }
  };

  updateDashboard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DashboardIdParamSchema, req.params);
    const body = parseOrThrow(UpdateDashboardRequestSchema, req.body);
    const dashboard = await this.service.updateDashboard(String(id), body.name ?? undefined);
    res.status(200).json({
      success: true,
      message: 'Dashboard updated successfully.',
      data: toDashboardResponse(dashboard),
    });
  };

  deleteDashboard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DashboardIdParamSchema, req.params);
    await this.service.deleteDashboard(String(id));
    res.status(200).json({ success: true, message: 'Dashboard deleted successfully.' });
  };

  getUserDashboards = async (req: Request, res: Response): Promise<void> => {
    const { userId } = parseOrThrow(UserIdParamSchema, req.params);
    const dashboards = await this.service.getUserDashboards(String(userId));
    res.status(200).json({
      success: true,
      data: dashboards.map(toDashboardSummaryResponse),
      message: 'User dashboards fetched successfully.',
    });
  };

  // -- Global stats / admin-adjacent --

  manageUsers = (_req: Request, res: Response): void => {
    res.status(200).json({ message: 'User management access granted.', status: 'success' });
  };

  countAll = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.countAll();
    res.status(200).json({ success: true, data });
  };

  listAllUsers = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.listAllUsers();
    res.status(200).json({ success: true, data });
  };

  monthlyRegistrations = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(MonthlyRegistrationsRequestSchema, req.query);
    const data = await this.service.monthlyRegistrations(query.range);
    res.status(200).json({ success: true, data });
  };

  // -- Analytics / packet history --

  getAnalytics = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(AnalyticsRequestSchema, req.query);
    const result = await this.service.getAnalytics(
      query.user_id !== undefined ? String(query.user_id) : undefined
    );
    res.status(200).json(result);
  };

  getPacketHistory = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(PacketHistoryRequestSchema, req.query);
    const sortBy = query.sort_by === 'received_at' ? 'created_at' : query.sort_by;
    const sortDir = query.sort_dir ?? query.sort_order ?? 'desc';
    const result = await this.service.getPacketHistory(
      {
        productId: query.product_id !== undefined ? String(query.product_id) : undefined,
        protocolId: query.protocol_id !== undefined ? String(query.protocol_id) : undefined,
        deviceId: query.device_id,
        status: query.status,
        search: query.search,
        dateFrom: query.date_from,
        dateTo: query.date_to,
        perPage: query.per_page,
        page: query.page,
        sortBy,
        sortDir,
      },
      requestPath(req)
    );
    res.status(200).json(result);
  };

  // -- Widgets --

  listWidgets = async (_req: Request, res: Response): Promise<void> => {
    const widgets = await this.service.listWidgets();
    res.status(200).json({
      success: true,
      message: 'Widgets fetched successfully.',
      data: widgets.map(toWidgetResponse),
    });
  };

  createWidget = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(CreateWidgetRequestSchema, req.body);
    const widget = await this.service.createWidget({
      dashboardId: String(body.dashboard_id),
      x: body.x,
      y: body.y,
      w: body.w,
      h: body.h,
      type: body.type,
    });
    res.status(201).json({
      success: true,
      message: 'Widget created successfully.',
      data: toWidgetResponse(widget),
    });
  };

  getWidget = async (req: Request, res: Response): Promise<void> => {
    const { widget } = parseOrThrow(WidgetIdParamSchema, req.params);
    const result = await this.service.getWidget(String(widget));
    res.status(200).json(result);
  };

  updateWidget = async (req: Request, res: Response): Promise<void> => {
    const { widget } = parseOrThrow(WidgetIdParamSchema, req.params);
    const body = parseOrThrow(UpdateWidgetRequestSchema, req.body);
    const updated = await this.service.updateWidget(String(widget), body);
    res.status(200).json({
      success: true,
      message: 'Widget updated successfully.',
      data: toWidgetResponse(updated),
    });
  };

  deleteWidget = async (req: Request, res: Response): Promise<void> => {
    const { widget } = parseOrThrow(WidgetIdParamSchema, req.params);
    await this.service.deleteWidget(String(widget));
    res.status(200).json({ success: true, message: 'Widget deleted successfully.' });
  };

  // -- Widget settings --

  storeWidgetSettings = async (req: Request, res: Response): Promise<void> => {
    const { widget } = parseOrThrow(WidgetIdParamSchema, req.params);
    const body = parseOrThrow(StoreWidgetSettingsRequestSchema, req.body);
    const result = await this.service.storeWidgetSettings(String(widget), {
      widgetName: body.widget_name ?? undefined,
      graphInterval: body.graph_interval ?? undefined,
      widgetSettings: body.widget_settings.map(toEntryInput),
    });
    res.status(201).json(result);
  };

  /** `POST /widget-settings` — accepts `widget_id` in the body (D-0070, no `{widget}` route param exists in Laravel to satisfy). */
  storeWidgetSettingsResource = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(StoreWidgetSettingsResourceRequestSchema, req.body);
    const result = await this.service.storeWidgetSettings(String(body.widget_id), {
      widgetName: body.widget_name ?? undefined,
      graphInterval: body.graph_interval ?? undefined,
      widgetSettings: body.widget_settings.map(toEntryInput),
    });
    res.status(201).json(result);
  };

  listWidgetSettings = async (_req: Request, res: Response): Promise<void> => {
    const settings = await this.service.listWidgetSettings();
    res.status(200).json({ success: true, data: settings.map(toWidgetSettingResponse) });
  };

  getWidgetSetting = async (req: Request, res: Response): Promise<void> => {
    const { widgetSetting } = parseOrThrow(WidgetSettingIdParamSchema, req.params);
    const setting = await this.service.getWidgetSetting(String(widgetSetting));
    res.status(200).json(toWidgetSettingResponse(setting));
  };

  updateWidgetSettings = async (req: Request, res: Response): Promise<void> => {
    parseOrThrow(WidgetSettingIdParamSchema, req.params);
    const body = parseOrThrow(UpdateWidgetSettingsRequestSchema, req.body);
    const result = await this.service.updateWidgetSettings({
      widgetId: body.widget_id !== undefined ? String(body.widget_id) : undefined,
      widgetName: body.widget_name ?? undefined,
      graphInterval: body.graph_interval ?? undefined,
      widgetSettings: body.widget_settings.map(toEntryInput),
    });
    res.status(200).json(result);
  };

  deleteWidgetSetting = async (req: Request, res: Response): Promise<void> => {
    const { widgetSetting } = parseOrThrow(WidgetSettingIdParamSchema, req.params);
    await this.service.deleteWidgetSetting(String(widgetSetting));
    res.status(200).json({ success: true, message: 'Widget settings deleted successfully.' });
  };

  // -- Unauthenticated --

  graphData = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(GraphDataRequestSchema, req.body);
    const result = await this.service.graphData(body.graph_widget);
    res.status(200).json(result);
  };
}
