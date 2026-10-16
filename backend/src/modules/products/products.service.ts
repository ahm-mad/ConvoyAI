import { mapPayload } from '../../shared/utils/payload-mapper.js';
import { signIngestionToken } from '../../platform/crypto/ingestion-token.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { CsvParseError, parseDeviceCsv } from './device-csv-import.js';
import type { ProductsRepository } from './products.repository.js';
import type {
  AttributeRole,
  CreateAttributePreferenceInput,
  CreateDeviceInput,
  DeviceImportRowInput,
  CreateProductInput,
  CreateTemplateFromProductInput,
  CreateTemplateInput,
  DeviceImportError,
  DeviceImportRow,
  DeviceImportSummary,
  ListProductsQuery,
  Paginated,
  PreconfigureTemplate,
  Product,
  ProductAttributePreference,
  ProductDevice,
  ProductDeviceDetail,
  ProductSettings,
  StoreProductSettingsInput,
  UpdateAttributePreferenceInput,
  UpdateProductInput,
} from './products.types.js';

interface MappingPreviewResult {
  productId: string;
  mappedCount: number;
  availableCount: number;
  mapping: { sourceField: string; pointKey: string; value: unknown }[];
  unmappedFields: string[];
}

/** Module 2.2's `ProtocolsRepository` doubles as this (interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules"). */
export interface ProductsProtocolsLookup {
  findById(id: string): Promise<{ id: string } | undefined>;
}

/** Business logic for module 2.1 (ARCHITECTURE.md §2). See `tasks/05-products.md` and D-0046/D-0047/D-0048/D-0049 for the design decisions behind this module's shape. */
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly protocolsLookup: ProductsProtocolsLookup
  ) {}

  // -- Products -------------------------------------------------------------

  async listProducts(query: ListProductsQuery): Promise<Paginated<Product>> {
    return this.productsRepository.list(query);
  }

  async getProduct(id: string): Promise<Product> {
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  async getProductDevices(
    productId: string,
    params: {
      type: string | undefined;
      search: string | undefined;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
      perPage: number;
      page: number;
    }
  ): Promise<{ items: ProductDeviceDetail[]; total: number }> {
    await this.getProduct(productId); // 404s if missing/cross-tenant
    return this.productsRepository.findDevicesForProduct(productId, params);
  }

  /** D-0046: 3 creation modes (existing product / from template / brand new), plus the required inline device(s). */
  async createProduct(
    input: CreateProductInput,
    companyId: string,
    userId: string
  ): Promise<{ product: Product; devices: ProductDevice[]; importSummary: DeviceImportSummary }> {
    let product: Product;
    let templateFields: { attribute_key: string; label?: string; unit?: string }[] = [];

    // D-0106: Laravel validates `device_protocol_id` (`sometimes|nullable|exists:protocols,id`)
    // before any creation-mode branching — a bad/nonexistent id must never reach
    // `productsRepository.create()`, which would otherwise let Postgres's real FK constraint
    // throw an unhandled 500 instead of a clean validation error.
    if (input.deviceProtocolId !== undefined) {
      const protocol = await this.protocolsLookup.findById(input.deviceProtocolId);
      if (!protocol) {
        throw new ValidationError('Selected device protocol was not found.', {
          device_protocol_id: ['Selected device protocol was not found.'],
        });
      }
    }

    // D-0148: resolved/validated before any product is created or selected — a malformed CSV or a
    // fully-empty submission must never leave a product behind with zero devices. Per-row failures
    // (missing fields, in-submission duplicates, already-used identifiers) do NOT throw here — a
    // deliberate deviation from Laravel's all-or-nothing `$request->validate()`, since the whole
    // point of the CSV bulk-import feature is graceful partial success, not failing the entire
    // batch over one bad row. See `communication/flows/03-device-bulk-csv-import.md`.
    const { validRows, summary } = await this.resolveDeviceImport(input.devices, input.csvFile);

    if (input.existingProductId) {
      product = await this.getProduct(input.existingProductId);
    } else if (input.preconfigureTemplateId) {
      const template = await this.productsRepository.findTemplateConfiguration(
        input.preconfigureTemplateId
      );
      const templateRow = await this.productsRepository.findTemplateById(
        input.preconfigureTemplateId,
        companyId
      );
      if (!templateRow) throw new NotFoundError('Selected template was not found.');
      templateFields = template?.fields ?? [];
      product = await this.productsRepository.create({
        name: input.productName ?? templateRow.name,
        deviceProtocolId: input.deviceProtocolId,
        preconfigureTemplateId: input.preconfigureTemplateId,
        createdBy: userId,
      });
    } else {
      if (!input.productName) {
        throw new ValidationError('The product name field is required.', {
          product_name: ['The product name field is required.'],
        });
      }
      product = await this.productsRepository.create({
        name: input.productName,
        deviceProtocolId: input.deviceProtocolId,
        preconfigureTemplateId: undefined,
        createdBy: userId,
      });
    }

    const devices = await this.productsRepository.createDevices(product.id, userId, validRows);
    summary.createdCount = devices.length;

    for (const field of templateFields) {
      if (!field.attribute_key) continue;
      const preference = await this.productsRepository.upsertPreference(
        product.id,
        userId,
        field.attribute_key
      );
      const { ruleId, widgetId } = await this.productsRepository.ensureRuleAndWidget({
        userId,
        productId: product.id,
        attributeKey: field.attribute_key,
        label: field.label ?? field.attribute_key,
        unit: field.unit,
        widgetType: undefined,
        alertSettings: undefined,
        existingRuleId: undefined,
        existingWidgetId: undefined,
      });
      await this.productsRepository.upsertPreferenceSetting(preference.id, {
        label: field.label ?? field.attribute_key,
        unit: field.unit ?? null,
        ruleId,
        widgetId,
      });
    }

    return { product: await this.getProduct(product.id), devices, importSummary: summary };
  }

  /**
   * D-0148: merges manual (`devices[]`) + CSV rows into one list, validates each independently
   * (required fields, in-submission duplicate identifiers, then a batched check against the whole
   * `devices` table — restoring the real Laravel `unique:devices,device_unique_identifier` rule
   * Node never had, see `products.repository.ts`'s `findExistingDeviceIdentifiers`), and returns
   * only the rows that passed, plus a full accounting of every row and why it was rejected if it
   * was. Never throws for a per-row problem — only for something that invalidates the whole
   * request (an unparseable/oversized CSV, or nothing submitted at all).
   */
  private async resolveDeviceImport(
    devices: DeviceImportRowInput[],
    csvFile: Buffer | undefined
  ): Promise<{ validRows: CreateDeviceInput[]; summary: DeviceImportSummary }> {
    const manualRows: DeviceImportRow[] = devices.map((d, index) => ({
      source: 'manual',
      index,
      row: undefined,
      deviceUniqueIdentifier: d.deviceUniqueIdentifier,
      name: d.name,
      location: d.location,
    }));

    let csvRows: DeviceImportRow[] = [];
    if (csvFile) {
      let parsed;
      try {
        parsed = parseDeviceCsv(csvFile);
      } catch (err) {
        if (!(err instanceof CsvParseError)) throw err;
        throw new ValidationError(err.message, { file: [err.message] });
      }
      csvRows = parsed.map(r => ({
        source: 'csv',
        index: undefined,
        row: r.row,
        deviceUniqueIdentifier: r.deviceUniqueIdentifier,
        name: r.name,
        location: r.location,
      }));
    }

    if (manualRows.length === 0 && csvRows.length === 0) {
      throw new ValidationError('At least one device is required.', {
        devices: ['At least one device is required.'],
      });
    }

    const errors: DeviceImportError[] = [];
    const candidates: { entry: DeviceImportRow; data: CreateDeviceInput }[] = [];
    const seenInSubmission = new Set<string>();

    for (const entry of [...manualRows, ...csvRows]) {
      const rowErrors: string[] = [];
      if (!entry.deviceUniqueIdentifier) rowErrors.push('device_unique_identifier is required');
      if (!entry.name) rowErrors.push('name is required');
      if (!entry.location) rowErrors.push('location is required');

      if (entry.deviceUniqueIdentifier) {
        if (seenInSubmission.has(entry.deviceUniqueIdentifier)) {
          rowErrors.push('duplicate device_unique_identifier within this submission');
        } else {
          seenInSubmission.add(entry.deviceUniqueIdentifier);
        }
      }

      if (rowErrors.length > 0) {
        errors.push({
          source: entry.source,
          index: entry.index,
          row: entry.row,
          deviceUniqueIdentifier: entry.deviceUniqueIdentifier ?? null,
          errors: rowErrors,
        });
      } else {
        candidates.push({
          entry,
          data: {
            deviceUniqueIdentifier: entry.deviceUniqueIdentifier as string,
            name: entry.name as string,
            location: entry.location as string,
          },
        });
      }
    }

    const alreadyUsed = await this.productsRepository.findExistingDeviceIdentifiers(
      candidates.map(c => c.data.deviceUniqueIdentifier)
    );

    const validRows: CreateDeviceInput[] = [];
    for (const { entry, data } of candidates) {
      if (alreadyUsed.has(data.deviceUniqueIdentifier)) {
        errors.push({
          source: entry.source,
          index: entry.index,
          row: entry.row,
          deviceUniqueIdentifier: data.deviceUniqueIdentifier,
          errors: ['device_unique_identifier has already been used'],
        });
      } else {
        validRows.push(data);
      }
    }

    return {
      validRows,
      summary: {
        manualCount: manualRows.length,
        csvCount: csvRows.length,
        createdCount: validRows.length,
        failedCount: errors.length,
        errors,
      },
    };
  }

  /**
   * D-0106: same class of gap as `createProduct`'s `device_protocol_id` fix, plus one Laravel
   * never had — `preconfigure_template_id` had **no existence check at all** on update (only on
   * create). Laravel's own update validation: `device_protocol_id` is `nullable` (may be cleared),
   * `preconfigure_template_id` is not (its bare `exists:preconfigure_templates,id` rejects a
   * missing/invalid id as a real validation failure, not silently ignored).
   */
  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    await this.getProduct(id);

    if (input.preconfigureTemplateId !== undefined) {
      const companyId = getRequestContext()?.companyId;
      const template = await this.productsRepository.findTemplateById(
        input.preconfigureTemplateId,
        companyId
      );
      if (!template) throw new NotFoundError('Selected template was not found.');
    }
    if (input.deviceProtocolId !== undefined && input.deviceProtocolId !== null) {
      const protocol = await this.protocolsLookup.findById(input.deviceProtocolId);
      if (!protocol) {
        throw new ValidationError('Selected device protocol was not found.', {
          device_protocol_id: ['Selected device protocol was not found.'],
        });
      }
    }

    return this.productsRepository.update(id, input);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.getProduct(id);
    await this.productsRepository.delete(id);
  }

  async bulkDeleteProducts(ids: string[]): Promise<number> {
    return this.productsRepository.bulkDelete(ids);
  }

  async getProductsForCallersCompany(): Promise<Product[]> {
    return this.productsRepository.findAllForCallersCompany();
  }

  // -- Ingestion token (D-0047) ---------------------------------------------

  async issueIngestionToken(productId: string, protocolId: string) {
    const context = getRequestContext();
    if (!context) throw new ForbiddenError();

    const product = await this.productsRepository.findById(productId);
    if (!product || !(await this.productsRepository.protocolExists(protocolId))) {
      throw new NotFoundError('Resource not found');
    }

    // Deviation from Laravel's literal "always INSERT a new row" — restores its real intent (one
    // stable token per product) without its accidental determinism. See the repository method's own
    // doc comment for the full story.
    const existing = await this.productsRepository.findIngestionToken(
      productId,
      protocolId,
      context.userId
    );
    if (existing) return existing;

    const token = signIngestionToken({ userId: context.userId, productId, protocolId });
    return this.productsRepository.createIngestionToken(productId, protocolId, token);
  }

  // -- Product settings -------------------------------------------------------

  async getProductSettings(productId: string): Promise<ProductSettings> {
    const context = getRequestContext();
    if (!context) throw new ForbiddenError();

    // D-0121: both messages are Laravel's literal `messages.php` strings for `productSettings()`
    // (`product_not_found` really is "No products found for this company." there).
    const product = await this.productsRepository.findByIdRaw(productId);
    if (!product) throw new NotFoundError('No products found for this company.');

    const isOwner = product.created_by.toString() === context.userId;
    const isAdmin = context.roles.includes('admin') || context.roles.includes('super_admin');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Unauthorized to access this product');
    }

    const [rawPacket, preferences, token] = await Promise.all([
      this.productsRepository.findRawPacketForProduct(productId),
      this.productsRepository.listPreferencesForProduct(productId),
      this.productsRepository.findLatestTokenForProduct(productId),
    ]);

    return {
      productId: product.id.toString(),
      productName: product.name,
      rawPacket: rawPacket?.jsonBody ?? null,
      userPreferenceAttributes: preferences,
      token: token ?? null,
    };
  }

  /**
   * `ProductController::storeProductSettings` (D-0124). Laravel runs all of
   * this inside `DB::transaction`, so any failure rolls back the toggles
   * and the rename. Node has no transaction facility here, so every check
   * runs first against the in-memory *post-toggle* state and the writes
   * happen only once all of them pass — same observable outcome.
   */
  async storeProductSettings(input: StoreProductSettingsInput): Promise<void> {
    const context = getRequestContext();
    if (!context) throw new ForbiddenError();

    const product = await this.productsRepository.findByIdRaw(input.productId);
    if (!product) {
      throw new ValidationError('The selected product id is invalid.', {
        product_id: ['The selected product id is invalid.'],
      });
    }

    const own = await this.productsRepository.listOwnPreferencesForSettingsCheck(
      input.productId,
      context.userId
    );
    const uniqueAttr = own.find(p => p.isUniqueIdentifier);
    if (!uniqueAttr) {
      throw new ValidationError(
        'At least one attribute must be marked as unique identifier before saving product settings'
      );
    }

    const selected = new Map(own.map(p => [p.id, p.isSelected]));
    const toggles: Array<[string, boolean]> = [];
    for (const [id, isSelected] of Object.entries(input.preferenceToggle ?? {})) {
      if (!selected.has(id)) {
        throw new ValidationError('Preference record for attribute not found.');
      }
      selected.set(id, isSelected);
      toggles.push([id, isSelected]);
    }

    for (const preference of own) {
      if (
        !preference.isUniqueIdentifier &&
        selected.get(preference.id) === true &&
        !preference.hasSettings
      ) {
        throw new ValidationError(
          `The attribute '${preference.id}' doesn't have its setting. Please save them for further processing.`
        );
      }
    }

    if (uniqueAttr.attributeKey) {
      const rawPacket = await this.productsRepository.findLatestRawPacketForUser(
        input.productId,
        context.userId
      );
      const value = extractDottedValue(rawPacket?.jsonBody, uniqueAttr.attributeKey);
      const stringValue =
        typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
      if (stringValue) {
        const deviceExists = await this.productsRepository.deviceExists(
          input.productId,
          context.userId,
          stringValue
        );
        if (!deviceExists) {
          throw new ValidationError(
            `Please select a suitable unique identifier. The selected unique identifier '${uniqueAttr.attributeKey}' value '${stringValue}' does not match any of your device values.`
          );
        }
      }
    }

    for (const [id, isSelected] of toggles) {
      await this.productsRepository.setPreferenceSelected(id, isSelected);
    }
    await this.productsRepository.updateProductName(input.productId, input.productName);
  }

  async touchUserPreferenceAttributes(productId: string, userId: string): Promise<void> {
    // 11.46 — matches Laravel's actual (accidental) no-op behavior exactly; see repository doc comment.
    await this.productsRepository.touchUserPreferenceRow(productId, userId);
  }

  // -- Attribute preferences (D-0048) ---------------------------------------

  async createAttributePreference(
    input: CreateAttributePreferenceInput,
    userId: string
  ): Promise<ProductAttributePreference> {
    const preference = await this.productsRepository.upsertPreference(
      input.productId,
      userId,
      input.attributeKey
    );

    const { ruleId, widgetId } = await this.productsRepository.ensureRuleAndWidget({
      userId,
      productId: input.productId,
      attributeKey: input.attributeKey,
      label: input.label,
      unit: input.unit,
      widgetType: input.widgetType,
      alertSettings: input.alertSettings,
      existingRuleId: undefined,
      existingWidgetId: undefined,
    });

    await this.productsRepository.upsertPreferenceSetting(preference.id, {
      label: input.label,
      unit: input.unit ?? null,
      ruleId,
      widgetId,
    });

    const withSettings = await this.productsRepository.findPreferenceById(preference.id);
    if (!withSettings) throw new NotFoundError('Attribute preference not found');
    return withSettings;
  }

  async getAttributePreference(id: string): Promise<ProductAttributePreference> {
    const preference = await this.productsRepository.findPreferenceById(id);
    if (!preference) throw new NotFoundError('Attribute preference not found');
    return preference;
  }

  /** `AttributePreferenceController::showSettings` equivalent. */
  async getAttributePreferenceSettings(id: string) {
    return this.productsRepository.findPreferenceSettingsDetail(id);
  }

  async updateAttributePreference(
    id: string,
    input: UpdateAttributePreferenceInput,
    userId: string
  ): Promise<ProductAttributePreference> {
    const existing = await this.getAttributePreference(id);

    await this.productsRepository.updatePreferenceFields(id, {
      productId: input.productId,
      attributeKey: input.attributeKey,
    });

    if (
      input.label !== undefined ||
      input.widgetType !== undefined ||
      input.alertSettings !== undefined
    ) {
      const { ruleId, widgetId } = await this.productsRepository.ensureRuleAndWidget({
        userId,
        productId: input.productId ?? existing.productId,
        attributeKey: input.attributeKey ?? existing.attributeKey ?? '',
        label: input.label ?? existing.label ?? '',
        unit: input.unit,
        widgetType: input.widgetType,
        alertSettings: input.alertSettings,
        existingRuleId: existing.ruleId ?? undefined,
        existingWidgetId: existing.widgetId ?? undefined,
      });
      await this.productsRepository.upsertPreferenceSetting(id, {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ruleId,
        widgetId,
      });
    }

    return this.getAttributePreference(id);
  }

  async deleteAttributePreference(id: string): Promise<void> {
    await this.getAttributePreference(id);
    await this.productsRepository.deletePreference(id);
  }

  async markAsUniqueIdentifier(
    productId: string,
    attributeKey: string,
    userId: string
  ): Promise<void> {
    // D-0154: a location (GPS role) attribute can't also be the unique identifier.
    const flags = await this.productsRepository.findPreferenceFlagsForKey(productId, attributeKey);
    if (flags.some(flag => flag.attributeRole !== null)) {
      throw new ValidationError(
        "This attribute is a location attribute and can't also be the unique identifier."
      );
    }
    await this.productsRepository.markAsUniqueIdentifier(productId, userId, attributeKey);
  }

  /** D-0154 ("Mark as location", owner decision D1): the product must be visible to the caller (their company's), else 404. */
  async markRole(
    productId: string,
    attributeKey: string,
    role: AttributeRole,
    userId: string
  ): Promise<{
    productId: string;
    attributeKey: string;
    attributeRole: AttributeRole;
    replacedAttributeKey: string | null;
  }> {
    const product = await this.productsRepository.findById(productId);
    if (!product) throw new NotFoundError('Product not found.');

    const flags = await this.productsRepository.findPreferenceFlagsForKey(productId, attributeKey);
    if (flags.some(flag => flag.isUniqueIdentifier)) {
      throw new ValidationError(
        "This attribute is the unique identifier and can't also be a location attribute."
      );
    }

    const { replacedAttributeKey } = await this.productsRepository.markRole(
      productId,
      userId,
      attributeKey,
      role
    );
    return { productId, attributeKey, attributeRole: role, replacedAttributeKey };
  }

  async unmarkRole(productId: string, attributeKey: string): Promise<void> {
    const product = await this.productsRepository.findById(productId);
    if (!product) throw new NotFoundError('Product not found.');

    const cleared = await this.productsRepository.unmarkRole(productId, attributeKey);
    if (!cleared) throw new NotFoundError('No location role found for this attribute.');
  }

  async unmarkAsUniqueIdentifier(
    productId: string,
    attributeKey: string,
    userId: string
  ): Promise<void> {
    const removed = await this.productsRepository.unmarkAsUniqueIdentifier(
      productId,
      userId,
      attributeKey
    );
    if (!removed) throw new NotFoundError('No matching unique identifier found for this attribute');
  }

  // -- Mapping preview (D-0049) ------------------------------------------------

  async previewMapping(
    productId: string,
    samplePayload: Record<string, unknown>
  ): Promise<MappingPreviewResult> {
    const preferences = await this.productsRepository.listPreferencesForProduct(productId);
    const attributeKeys = preferences
      .map(p => p.attributeKey)
      .filter((key): key is string => key !== null);

    const result = mapPayload(samplePayload, attributeKeys);

    return {
      productId,
      mappedCount: result.matchedKeys.length,
      availableCount: result.availableKeys.length,
      mapping: result.matchedKeys.map(key => ({
        sourceField: key,
        pointKey: key,
        value: result.flattened[key],
      })),
      unmappedFields: result.availableKeys.filter(key => !result.matchedKeys.includes(key)),
    };
  }

  // -- Preconfigure templates -------------------------------------------------

  async listTemplates(params: {
    manufacturer: string | undefined;
    search: string | undefined;
    perPage: number;
    page: number;
  }): Promise<{ items: PreconfigureTemplate[]; total: number }> {
    const context = getRequestContext();
    return this.productsRepository.listTemplates({
      companyId: context?.companyId,
      manufacturer: params.manufacturer,
      search: params.search,
      perPage: params.perPage,
      page: params.page,
    });
  }

  async getTemplate(id: string): Promise<PreconfigureTemplate> {
    const context = getRequestContext();
    const template = await this.productsRepository.findTemplateById(id, context?.companyId);
    if (!template) throw new NotFoundError('Template not found.');
    return template;
  }

  async listManufacturers(): Promise<string[]> {
    const context = getRequestContext();
    return this.productsRepository.listManufacturers(context?.companyId);
  }

  async createTemplate(input: CreateTemplateInput): Promise<PreconfigureTemplate> {
    const context = getRequestContext();
    if (!context?.companyId) throw new ForbiddenError();
    return this.productsRepository.createTemplate(context.companyId, context.userId, input);
  }

  async createTemplateFromProduct(
    productId: string,
    input: CreateTemplateFromProductInput
  ): Promise<PreconfigureTemplate> {
    const context = getRequestContext();
    if (!context?.companyId) throw new ForbiddenError();

    const product = await this.productsRepository.findById(productId);
    if (!product) throw new NotFoundError('Product not found.');

    const preferences = await this.productsRepository.listPreferencesForProduct(productId);
    if (preferences.length === 0) {
      throw new ValidationError('This product has no configured fields to save as a template yet.');
    }

    const fields = preferences.map(p => ({
      attributeKey: p.attributeKey ?? '',
      label: p.label ?? p.attributeKey ?? '',
      unit: p.unit ?? undefined,
    }));

    return this.productsRepository.createTemplateFromFields(
      context.companyId,
      context.userId,
      input,
      fields
    );
  }
}

function extractDottedValue(source: unknown, dottedKey: string): unknown {
  const keys = dottedKey.split('.');
  let value: unknown = source;
  for (const key of keys) {
    if (value !== null && typeof value === 'object' && key in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}
