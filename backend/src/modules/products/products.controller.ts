import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { UnauthenticatedError } from '../../platform/errors/app-error.js';
import { phpIntCast } from '../../shared/utils/php-cast.js';
import {
  buildCustomLinksPaginator,
  buildLaravelPaginator,
} from '../../shared/utils/laravel-paginator.js';
import {
  toAttributePreferenceResponse,
  toAttributePreferenceSettingsResponse,
  toDeviceImportSummaryResponse,
  toIngestionTokenResponse,
  toPreconfigureTemplateResponse,
  toProductDeviceDetailResponse,
  toProductDeviceResponse,
  toProductResponse,
} from './products.mapper.js';
import type { ProductsService } from './products.service.js';
import {
  AttributePreferenceIdParamSchema,
  BulkDeleteProductsRequestSchema,
  CreateAttributePreferenceRequestSchema,
  CreateProductRequestSchema,
  CreateTemplateFromProductRequestSchema,
  CreateTemplateRequestSchema,
  GetEncryptTokenRequestSchema,
  ListProductsRequestSchema,
  ListTemplatesRequestSchema,
  MappingPreviewRequestSchema,
  MarkRoleRequestSchema,
  MarkUniqueRequestSchema,
  UnmarkRoleRequestSchema,
  ProductDevicesRequestSchema,
  ProductIdParamSchema,
  StoreProductSettingsRequestSchema,
  StoreUserPreferenceAttributesRequestSchema,
  UpdateAttributePreferenceRequestSchema,
  UpdateProductRequestSchema,
} from './products.schemas.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new UnauthenticatedError();
  return context;
}

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // -- Products -------------------------------------------------------------

  listProducts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListProductsRequestSchema, req.query);
    const result = await this.productsService.listProducts({
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      // D-0146: deliberate deviation from Laravel's real offset-style `page` formula
      // (D-0107) — real frontend usage (conventional incrementing page numbers) made the
      // offset math unusable in practice, exactly the risk D-0107 flagged and left open.
      // Plain 1-based, clamped to 1 — same convention `getProductDevices`'s sibling
      // endpoint already uses (D-0118).
      page: Math.max(query.page, 1),
      perPage: query.per_page,
      userId: query.user_id !== undefined ? String(query.user_id) : undefined,
    });

    const filters = {
      user_id: query.user_id ?? null,
      search: query.search ?? null,
      sort_by: query.sort_by,
      sort_order: query.sort_order,
    };

    // ProductController.php:85-96 — a real, deliberate shape divergence: when a `user_id`
    // filter is applied and matches nothing, Laravel returns `success: false` with no `data`
    // key at all, just this message + the echoed filters, not the normal paginator envelope.
    if (query.user_id !== undefined && result.items.length === 0) {
      res.status(200).json({
        success: false,
        message: 'No products found for the specified user.',
        filters,
      });
      return;
    }

    // ProductController.php:98-108 — the real Laravel envelope: `data` is the full
    // `LengthAwarePaginator::toArray()` shape (current_page/data/links/etc.), not a lean
    // {items, pagination} — D-0013's "keep the Laravel envelope exact" applied consistently.
    res.status(200).json({
      success: true,
      message: 'Products fetched successfully.',
      data: buildLaravelPaginator({
        items: result.items.map(toProductResponse),
        page: result.pagination.page,
        perPage: result.pagination.perPage,
        total: result.pagination.total,
        path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      }),
      filters,
    });
  };

  createProduct = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const input = parseOrThrow(CreateProductRequestSchema, req.body);
    // D-0148: multer (`products.routes.ts`) puts an uploaded CSV here, not in `req.body` —
    // `undefined` when the request had no `file` field (manual-only, unchanged behavior) or wasn't
    // multipart at all (the original `application/json` path).
    const csvFile = req.file?.buffer;

    const { product, devices, importSummary } = await this.productsService.createProduct(
      {
        // D-0106: `null` and `undefined` both mean "not choosing this option" for create — Zod
        // already turns a bare-missing key into `undefined`; `== null` here also catches an
        // explicit `null` from the client (`.nullable()` on the schema lets it through as a real
        // `null`, not silently coerced to `0` anymore).
        existingProductId:
          input.existing_product_id == null ? undefined : String(input.existing_product_id),
        preconfigureTemplateId:
          input.preconfigure_template_id == null
            ? undefined
            : String(input.preconfigure_template_id),
        productName: input.product_name,
        deviceProtocolId:
          input.device_protocol_id == null ? undefined : String(input.device_protocol_id),
        // D-0148: each row may now be incomplete (`resolveDeviceImport` validates per-row instead
        // of the schema rejecting the whole request) — `device_unique_identifier`/`name`/`location`
        // all come through as possibly-`undefined`.
        devices: input.devices.map(device => ({
          deviceUniqueIdentifier: device.device_unique_identifier,
          name: device.name,
          location: device.location,
        })),
        csvFile,
      },
      context.companyId ?? '',
      context.userId
    );

    res.status(201).json({
      success: true,
      message: `${String(devices.length)} of ${String(importSummary.manualCount + importSummary.csvCount)} devices created.`,
      product: toProductResponse(product),
      devices: devices.map(toProductDeviceResponse),
      import_summary: toDeviceImportSummaryResponse(importSummary),
    });
  };

  getProductDevices = async (req: Request, res: Response): Promise<void> => {
    const { product } = parseOrThrow(ProductIdParamSchema, req.params);
    const query = parseOrThrow(ProductDevicesRequestSchema, req.query);

    const result = await this.productsService.getProductDevices(String(product), {
      type: query.type,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      perPage: query.per_page,
      page: query.page,
    });

    // D-0118: `ProductController::show()`'s own hand-rolled pagination shape (current_page/
    // last_page/from/to/has_more_pages/path/links:{first,last,prev,next}) — genuinely different
    // from `buildLaravelPaginator`'s flat/array-links shape used elsewhere in this module
    // (`/protocols`-style), matched exactly rather than reused.
    const pagination = buildCustomLinksPaginator({
      page: query.page,
      perPage: query.per_page,
      total: result.total,
      path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      query: {
        type: query.type,
        search: query.search,
        per_page: query.per_page,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        devices: result.items.map(toProductDeviceDetailResponse),
        pagination,
        // Laravel's `filters` always carries these 4 keys, `null` when unset — never omitted.
        filters: {
          type: query.type ?? null,
          search: query.search ?? null,
          sort_by: query.sort_by,
          sort_order: query.sort_order,
        },
      },
    });
  };

  updateProduct = async (req: Request, res: Response): Promise<void> => {
    const { product } = parseOrThrow(ProductIdParamSchema, req.params);
    const input = parseOrThrow(UpdateProductRequestSchema, req.body);

    const updated = await this.productsService.updateProduct(String(product), {
      name: input.name,
      // D-0106: `preconfigure_template_id` isn't nullable on update in Laravel — a `null` here
      // (however unlikely) still becomes a real (invalid) id string, which the service layer's
      // existence check now rejects with a clean 422 instead of reaching Prisma at all.
      preconfigureTemplateId:
        input.preconfigure_template_id !== undefined
          ? String(input.preconfigure_template_id)
          : undefined,
      // `device_protocol_id` genuinely is nullable here — `null` must reach the service/repository
      // as `null` (clear it), not get stringified into `"null"` or collapsed away.
      deviceProtocolId:
        input.device_protocol_id === undefined
          ? undefined
          : input.device_protocol_id === null
            ? null
            : String(input.device_protocol_id),
    });

    // NOTE: bare model, no envelope — matches the frozen contract's own note.
    res.status(200).json(toProductResponse(updated));
  };

  deleteProduct = async (req: Request, res: Response): Promise<void> => {
    const { product } = parseOrThrow(ProductIdParamSchema, req.params);
    await this.productsService.deleteProduct(String(product));
    res.status(204).send();
  };

  bulkDeleteProducts = async (req: Request, res: Response): Promise<void> => {
    const { product_ids } = parseOrThrow(BulkDeleteProductsRequestSchema, req.body);
    const deletedCount = await this.productsService.bulkDeleteProducts(product_ids.map(String));

    res.status(200).json({
      success: true,
      message: 'Products deleted.',
      data: { deleted_count: deletedCount, product_ids },
    });
  };

  getProductsByCompany = async (_req: Request, res: Response): Promise<void> => {
    const products = await this.productsService.getProductsForCallersCompany();
    if (products.length === 0) {
      res.status(404).json({ success: false, message: 'No products found.', data: [] });
      return;
    }
    res.status(200).json({
      success: true,
      message: 'Products retrieved.',
      data: products.map(toProductResponse),
    });
  };

  // -- Ingestion token (D-0047) ----------------------------------------------

  getEncryptToken = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(GetEncryptTokenRequestSchema, req.body);
    const token = await this.productsService.issueIngestionToken(
      String(input.product_id),
      String(input.protocol_id)
    );

    res.status(201).json({
      success: true,
      message: 'Encrypted token saved.',
      token: toIngestionTokenResponse(token),
    });
  };

  // -- Product settings -------------------------------------------------------

  getProductSettings = async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params['id']);
    const settings = await this.productsService.getProductSettings(id);

    res.status(200).json({
      success: true,
      // D-0121: Laravel's literal text (no trailing period), and `is_selected` is an integer 1/0 here —
      // that column has no boolean cast on `ProductAttributePreference` (only `is_unique_identifier`
      // does), so MySQL's tinyint comes through raw, confirmed live.
      message: 'Product settings retrieved successfully',
      product_id: Number(settings.productId),
      product_name: settings.productName,
      raw_packet: settings.rawPacket,
      user_preference_attributes: settings.userPreferenceAttributes.map(p => ({
        id: Number(p.id),
        label: p.label,
        unit: p.unit,
        attribute_key: p.attributeKey,
        is_selected: p.isSelected ? 1 : 0,
        is_unique_identifier: p.isUniqueIdentifier,
        attribute_role: p.attributeRole,
      })),
      token: settings.token,
    });
  };

  storeProductSettings = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(StoreProductSettingsRequestSchema, req.body);
    await this.productsService.storeProductSettings({
      productId: String(input.product_id),
      productName: input.product_name,
      preferenceToggle: input.preference_toggle
        ? Object.fromEntries(
            Object.entries(input.preference_toggle).map(([id, isSelected]) => [
              id,
              phpIntCast(isSelected) !== 0,
            ])
          )
        : undefined,
    });

    res.status(200).json({ success: true, message: 'Product settings stored successfully.' });
  };

  storeUserPreferenceAttributes = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(StoreUserPreferenceAttributesRequestSchema, req.body);
    await this.productsService.touchUserPreferenceAttributes(
      String(input.product_id),
      String(input.user_id)
    );

    res
      .status(200)
      .json({ success: true, message: 'User preferences packet attribute created successfully.' });
  };

  // -- Attribute preferences (D-0048) ---------------------------------------

  createAttributePreference = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const input = parseOrThrow(CreateAttributePreferenceRequestSchema, req.body);

    const preference = await this.productsService.createAttributePreference(
      {
        productId: String(input.product_id),
        attributeKey: input.attribute_key,
        label: input.label,
        widgetType: input.widget_type,
        unit: input.unit,
        alertSettings: input.alert_settings
          ? {
              enabled: input.alert_settings.enabled ?? false,
              conditions: input.alert_settings.conditions ?? [],
            }
          : undefined,
      },
      context.userId
    );

    res.status(201).json({
      message: 'Attribute preference created successfully',
      data: toAttributePreferenceResponse(preference),
    });
  };

  getAttributePreference = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AttributePreferenceIdParamSchema, req.params);
    const preference = await this.productsService.getAttributePreference(String(id));

    res.status(200).json({ data: toAttributePreferenceResponse(preference) });
  };

  getAttributePreferenceSettings = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AttributePreferenceIdParamSchema, req.params);
    const detail = await this.productsService.getAttributePreferenceSettings(String(id));

    if (!detail) {
      // Laravel's literal 404 body carries `success: true` (D-0122) — deliberate parity, not a typo.
      res.status(404).json({ success: true, message: 'Attribute preference not found' });
      return;
    }
    res.status(200).json(toAttributePreferenceSettingsResponse(detail));
  };

  updateAttributePreference = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const { id } = parseOrThrow(AttributePreferenceIdParamSchema, req.params);
    const input = parseOrThrow(UpdateAttributePreferenceRequestSchema, req.body);

    const preference = await this.productsService.updateAttributePreference(
      String(id),
      {
        productId: input.product_id !== undefined ? String(input.product_id) : undefined,
        attributeKey: input.attribute_key,
        unit: input.unit,
        label: input.label,
        widgetType: input.widget_type,
        alertSettings: input.alert_settings
          ? {
              enabled: input.alert_settings.enabled ?? false,
              conditions: input.alert_settings.conditions ?? [],
            }
          : undefined,
      },
      context.userId
    );

    res.status(200).json({
      message: 'Attribute preference updated successfully',
      data: toAttributePreferenceResponse(preference),
      success: true,
    });
  };

  deleteAttributePreference = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AttributePreferenceIdParamSchema, req.params);
    await this.productsService.deleteAttributePreference(String(id));

    res.status(200).json({ success: true, message: 'Attribute preference deleted successfully' });
  };

  markAsUniqueIdentifier = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const input = parseOrThrow(MarkUniqueRequestSchema, req.body);
    await this.productsService.markAsUniqueIdentifier(
      String(input.product_id),
      input.attribute_key,
      context.userId
    );

    res
      .status(200)
      .json({ success: true, message: 'Attribute marked as unique identifier successfully' });
  };

  unmarkAsUniqueIdentifier = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const input = parseOrThrow(MarkUniqueRequestSchema, req.body);
    await this.productsService.unmarkAsUniqueIdentifier(
      String(input.product_id),
      input.attribute_key,
      context.userId
    );

    res
      .status(200)
      .json({ success: true, message: 'Attribute unmarked as unique identifier successfully' });
  };

  markRole = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const input = parseOrThrow(MarkRoleRequestSchema, req.body);
    const result = await this.productsService.markRole(
      String(input.product_id),
      input.attribute_key,
      input.role,
      context.userId
    );

    res.status(200).json({
      success: true,
      message: `Attribute marked as ${result.attributeRole} successfully`,
      data: {
        product_id: Number(result.productId),
        attribute_key: result.attributeKey,
        attribute_role: result.attributeRole,
        replaced_attribute_key: result.replacedAttributeKey,
      },
    });
  };

  unmarkRole = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(UnmarkRoleRequestSchema, req.body);
    await this.productsService.unmarkRole(String(input.product_id), input.attribute_key);

    res.status(200).json({ success: true, message: 'Location role cleared successfully' });
  };

  previewMapping = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(MappingPreviewRequestSchema, req.body);
    const result = await this.productsService.previewMapping(
      String(input.product_id),
      input.sample_payload
    );

    res.status(200).json({
      success: true,
      message: 'Mapping preview generated.',
      data: {
        product_id: Number(result.productId),
        mapped_count: result.mappedCount,
        available_count: result.availableCount,
        mapping: result.mapping.map(m => ({
          source_field: m.sourceField,
          point_key: m.pointKey,
          value: m.value,
        })),
        unmapped_fields: result.unmappedFields,
      },
    });
  };

  // -- Preconfigure templates -------------------------------------------------

  listTemplates = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListTemplatesRequestSchema, req.query);
    const result = await this.productsService.listTemplates({
      manufacturer: query.manufacturer,
      search: query.search,
      perPage: query.per_page,
      page: query.page,
    });

    // PreconfigureTemplateController.php:63-67 — Laravel's real ->paginate() envelope, not a bare array.
    res.status(200).json({
      success: true,
      message: 'Templates retrieved.',
      data: buildLaravelPaginator({
        items: result.items.map(toPreconfigureTemplateResponse),
        page: query.page,
        perPage: query.per_page,
        total: result.total,
        path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      }),
    });
  };

  getTemplate = async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params['id']);
    const template = await this.productsService.getTemplate(id);

    res.status(200).json({
      success: true,
      message: 'Template retrieved.',
      data: toPreconfigureTemplateResponse(template),
    });
  };

  listManufacturers = async (_req: Request, res: Response): Promise<void> => {
    const manufacturers = await this.productsService.listManufacturers();
    res
      .status(200)
      .json({ success: true, message: 'Manufacturers retrieved.', data: manufacturers });
  };

  createTemplate = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateTemplateRequestSchema, req.body);
    const template = await this.productsService.createTemplate({
      name: input.name,
      manufacturer: input.manufacturer,
      description: input.description,
      image: input.image,
      fields: input.fields.map(field => ({
        attributeKey: field.attribute_key,
        label: field.label,
        unit: field.unit,
      })),
    });

    res.status(201).json({
      success: true,
      message: 'Template created.',
      data: toPreconfigureTemplateResponse(template),
    });
  };

  createTemplateFromProduct = async (req: Request, res: Response): Promise<void> => {
    const productId = String(req.params['productId']);
    const input = parseOrThrow(CreateTemplateFromProductRequestSchema, req.body);

    const template = await this.productsService.createTemplateFromProduct(productId, {
      name: input.name,
      manufacturer: input.manufacturer,
      description: input.description,
    });

    res.status(201).json({
      success: true,
      message: 'Template created from product.',
      data: toPreconfigureTemplateResponse(template),
    });
  };
}
