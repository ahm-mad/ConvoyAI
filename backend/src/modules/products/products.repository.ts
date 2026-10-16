import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { getRequestContext, runAsSystemAsync } from '../../platform/http/request-context.js';
import { toProfile } from '../users/users.mapper.js';
import type { Profile } from '../users/users.types.js';
import {
  toAttributePreference,
  toAttributePreferenceSummary,
  toIngestionToken,
  toPreconfigureTemplate,
  toProduct,
  toProductDevice,
  toRawDeviceValue,
} from './products.mapper.js';
import type {
  AlertSettings,
  AttributePreferenceSettingsDetail,
  AttributeRole,
  CreateDeviceInput,
  CreateTemplateInput,
  ListProductsQuery,
  OwnPreferenceForSettingsCheck,
  Paginated,
  PreconfigureTemplate,
  Product,
  ProductAttributePreference,
  ProductAttributePreferenceSummary,
  ProductDevice,
  ProductDeviceDetail,
  RawDeviceValue,
} from './products.types.js';

const PREFERENCE_INCLUDE = { product_attribute_preference_settings: true } as const;

/**
 * All Prisma access for module 2.1. `products`/`product_attribute_
 * preferences`/`raw_packet_values`/`rules` are tenant-ruled and run under
 * the caller's own real context throughout. `devices` is `user`-ruled
 * (`tenant-rules.ts`) for its own future direct CRUD (module 2.3), but
 * this module only ever touches it two ways: (1) creating devices under a
 * product the caller is creating — real context, the extension correctly
 * assigns `user_id` from the caller; (2) listing ALL devices under an
 * already-tenant-verified product (any user in the company, matching
 * Laravel's `$product->devices()` — no per-user filter) — deliberately
 * `runAsSystemAsync`, since the real tenant check already happened when
 * the product itself was loaded under real context.
 */
export class ProductsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // -- Products -------------------------------------------------------------

  async list(query: ListProductsQuery): Promise<Paginated<Product>> {
    const where: Record<string, unknown> = {};
    if (query.search) {
      where['name'] = { contains: query.search, mode: 'insensitive' as const };
    }
    if (query.userId) {
      where['created_by'] = BigInt(query.userId);
    }

    const skip = (query.page - 1) * query.perPage;
    // D-0147: a single-column `orderBy` has no guaranteed order among rows that tie on it (e.g.
    // several products created in the same second) — `LIMIT`/`OFFSET` can then return a
    // different, overlapping slice for the same page on repeated/adjacent-page calls, silently
    // duplicating some rows and dropping others. `id` is always unique, so appending it as a
    // secondary sort key makes the order fully deterministic regardless of ties on `sortBy`.
    const orderBy =
      query.sortBy === 'id'
        ? [{ id: query.sortOrder }]
        : [{ [query.sortBy]: query.sortOrder }, { id: query.sortOrder }];
    const [rows, total] = await Promise.all([
      this.prisma.products.findMany({
        where,
        orderBy,
        skip,
        take: query.perPage,
        include: { _count: { select: { devices: true, product_attribute_preferences: true } } },
      }),
      this.prisma.products.count({ where }),
    ]);

    return {
      items: rows.map(toProduct),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async findById(id: string): Promise<Product | undefined> {
    const row = await this.prisma.products.findUnique({
      where: { id: BigInt(id) },
      include: { _count: { select: { devices: true, product_attribute_preferences: true } } },
    });
    return row ? toProduct(row) : undefined;
  }

  /**
   * Module 2.4 (ingestion)'s `IngestionProductsLookup` — ingestion has no
   * request-context user at all (device-facing, token/broker-authenticated,
   * `ingestion.md`), so the normal `findById()`'s real-context tenant
   * scoping would throw ("no request context") rather than silently
   * misbehave. The ingestion token/device row already encodes which
   * product this belongs to; there is no separate "caller's own company"
   * to check against here, so this deliberately reads unscoped.
   */
  async findByIdUnscoped(id: string): Promise<Product | undefined> {
    return runAsSystemAsync(() => this.findById(id));
  }

  async findByIdRaw(id: string) {
    return this.prisma.products.findUnique({ where: { id: BigInt(id) } });
  }

  /**
   * `RbacCompanyProductsLookup` implementation (D-0100) — module 1.3's
   * `GET /companies` eager-loads `products` for an arbitrary target
   * company via `Company::products()` (`hasMany`, exact `company_id`
   * match — unlike this repository's own OR-global-visibility methods
   * elsewhere, which answer a different question: "can this caller see
   * this product"). `runAsSystemAsync` + explicit filter, same posture as
   * `AuthRepository`/`AssetsRepository`'s equivalents.
   */
  async findAllForCompanyExact(companyId: string) {
    const rows = await runAsSystemAsync(() =>
      this.prisma.products.findMany({ where: { company_id: BigInt(companyId) } })
    );
    return rows.map(row => ({
      id: row.id.toString(),
      createdBy: row.created_by.toString(),
      name: row.name,
      status: row.status,
      companyId: row.company_id.toString(),
      deviceProtocolId: row.device_protocol_id === null ? null : row.device_protocol_id.toString(),
      preconfigureTemplateId:
        row.preconfigure_template_id === null ? null : row.preconfigure_template_id.toString(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async countForCompanyExact(companyId: string): Promise<number> {
    return runAsSystemAsync(() =>
      this.prisma.products.count({ where: { company_id: BigInt(companyId) } })
    );
  }

  /**
   * See class doc comment — devices under an already-tenant-verified
   * product, any user, matching Laravel's `$product->devices()->with(
   * 'latestDeviceValue')`. D-0118: also batch-resolves each device's real
   * owner (`user`) — the same real Laravel side effect D-0112 already
   * found for `/devices` (`Device::getCreatedAtAttribute()` touches
   * `$this->user`) — and its `latestDeviceValue`, both `null`/never-set
   * if the device has never reported a value or (structurally impossible
   * here, `devices.user_id` is always populated) has no owner.
   */
  async findDevicesForProduct(
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
    const where: Record<string, unknown> = { product_id: BigInt(productId) };
    if (params.type) {
      where['type'] = params.type;
    }
    // D-0146: deliberate deviation from Laravel's real `name`-only search
    // (`ProductController::show()`, D-0118) — the frontend's own search placeholder advertises
    // device name, Dev EUI, and location as all searchable, so this extends the match to all
    // three rather than silently under-delivering on what the UI already promises.
    if (params.search) {
      const contains = { contains: params.search, mode: 'insensitive' as const };
      where['OR'] = [
        { name: contains },
        { device_unique_identifier: contains },
        { location: contains },
      ];
    }

    // D-0118: `ProductController::show()` passes `page` straight into Laravel's real
    // `paginate($perPage, ['*'], 'page', $page)` — a standard 1-indexed page number, clamped to
    // 1 for anything below it (`LengthAwarePaginator::setCurrentPage`). `GET /products`
    // (`listProducts` in `products.controller.ts`) used to use a different, offset-style `page`
    // convention here (real Laravel's own `index()` formula) — since D-0146 that endpoint also
    // uses this same plain 1-based clamp, so the two are no longer different conventions, just
    // two separate call sites doing the same thing. `Math.max(params.page, 1)` is that clamp; the
    // prior `params.page * params.perPage` was off by one page for every real caller (a real
    // device disappeared: `page=1` skipped past the first `perPage` rows instead of 0).
    const currentPage = Math.max(params.page, 1);

    // D-0147: real Laravel already has this tie-breaker (`ProductController::show()`:
    // `$query->orderBy($sortField, $sortDirection); if ($sortField !== 'id') { $query->orderBy('id', 'desc'); }`)
    // — a real parity gap the D-0118 port missed, not a new deviation. Always `desc` on `id`
    // regardless of the primary sort direction, matching Laravel's own hardcoded literal.
    const orderBy: Record<string, 'asc' | 'desc'>[] =
      params.sortBy === 'id'
        ? [{ id: params.sortOrder }]
        : [{ [params.sortBy]: params.sortOrder }, { id: 'desc' }];

    return runAsSystemAsync(async () => {
      const [rows, total] = await Promise.all([
        this.prisma.devices.findMany({
          where,
          orderBy,
          skip: (currentPage - 1) * params.perPage,
          take: params.perPage,
        }),
        this.prisma.devices.count({ where }),
      ]);

      const userIds = [...new Set(rows.map(row => row.user_id))];
      const userRows =
        userIds.length > 0
          ? await this.prisma.users.findMany({ where: { id: { in: userIds } } })
          : [];
      const usersById = new Map<string, Profile>(
        userRows.map(u => [u.id.toString(), toProfile(u)])
      );

      const uniqueIdentifiers = [...new Set(rows.map(row => row.device_unique_identifier))];
      const latestByUniqueIdentifier =
        uniqueIdentifiers.length > 0
          ? await this.latestDeviceValuesFor(uniqueIdentifiers)
          : new Map<string, RawDeviceValue>();

      const items = rows.map(row => {
        const user = usersById.get(row.user_id.toString());
        if (!user)
          throw new Error(`devices.user_id ${row.user_id.toString()} not found in usersById map`);
        return {
          ...toProductDevice(row),
          user,
          latestDeviceValue: latestByUniqueIdentifier.get(row.device_unique_identifier) ?? null,
        };
      });

      return { items, total };
    });
  }

  /** Latest `device_values` row per `device_unique_identifier`, batched (avoids N+1) — same grouped-MAX(id) tiebreak as `DevicesRepository.latestDeviceValueTimestamp`. */
  private async latestDeviceValuesFor(
    deviceUniqueIdentifiers: string[]
  ): Promise<Map<string, RawDeviceValue>> {
    const grouped = await this.prisma.device_values.groupBy({
      by: ['device_unique_identifier'],
      where: { device_unique_identifier: { in: deviceUniqueIdentifiers } },
      _max: { id: true },
    });
    const latestIds = grouped.map(g => g._max.id).filter((id): id is bigint => id !== null);
    if (latestIds.length === 0) return new Map();

    const rows = await this.prisma.device_values.findMany({ where: { id: { in: latestIds } } });
    return new Map(rows.map(row => [row.device_unique_identifier, toRawDeviceValue(row)]));
  }

  /** `company_id` placeholder — always overwritten by the tenant-scoping extension from the caller's own context (same pattern as `RbacRepository.createRole`). */
  async create(input: {
    name: string;
    deviceProtocolId: string | undefined;
    preconfigureTemplateId: string | undefined;
    createdBy: string;
  }): Promise<Product> {
    const row = await this.prisma.products.create({
      data: {
        name: input.name,
        status: 'active',
        created_by: BigInt(input.createdBy),
        company_id: 0n,
        device_protocol_id:
          input.deviceProtocolId !== undefined ? BigInt(input.deviceProtocolId) : null,
        preconfigure_template_id:
          input.preconfigureTemplateId !== undefined ? BigInt(input.preconfigureTemplateId) : null,
      },
      include: { _count: { select: { devices: true, product_attribute_preferences: true } } },
    });
    return toProduct(row);
  }

  /**
   * D-0046 — real context; the extension assigns `user_id` from the caller (matches Laravel's
   * `'user_id' => $userId`). D-0148: switched from N individual `create()` calls to one
   * `createManyAndReturn` — the CSV
   * bulk-import feature can submit up to 500 rows in one request, and N round trips at that size
   * was a real timeout risk at that scale (N round trips, not just N inserts). The tenant-
   * scoping extension already handles `createManyAndReturn` the same way it handles `create`
   * (`tenant-scoping.ts`'s `CREATE_MANY_OPS`/`forceData` — `user_id` gets injected on every row in
   * the array), so this needed no change to how real request context flows through.
   */
  async createDevices(
    productId: string,
    userId: string,
    devices: CreateDeviceInput[]
  ): Promise<ProductDevice[]> {
    if (devices.length === 0) return [];
    const rows = await this.prisma.devices.createManyAndReturn({
      data: devices.map(device => ({
        device_unique_identifier: device.deviceUniqueIdentifier,
        name: device.name,
        status: 'active',
        location: device.location,
        // D-0144: `tags` no longer accepted from the client on device create — the column
        // itself is untouched (`NOT NULL`, no DB default), so this write still needs a value.
        tags: '',
        product_id: BigInt(productId),
        user_id: BigInt(userId),
      })),
    });
    return rows.map(toProductDevice);
  }

  /**
   * D-0148: restores a real Laravel parity gap found while building the CSV bulk-import feature —
   * `ProductController::store()` has always validated `devices.*.device_unique_identifier` with
   * `unique:devices,device_unique_identifier`, Laravel's standard *unscoped* uniqueness rule (the
   * whole table, every company) — Node's `createDevices` never enforced this at all. Deliberately
   * `runAsSystemAsync`: matching Laravel's own unscoped check means this must see every company's
   * devices, not just the caller's.
   */
  async findExistingDeviceIdentifiers(identifiers: string[]): Promise<Set<string>> {
    if (identifiers.length === 0) return new Set();
    const rows = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { device_unique_identifier: { in: identifiers } },
        select: { device_unique_identifier: true },
      })
    );
    return new Set(rows.map(r => r.device_unique_identifier));
  }

  async update(
    id: string,
    input: {
      name: string | undefined;
      preconfigureTemplateId: string | undefined;
      /** D-0106: `undefined` = not in the request (don't touch), `null` = explicitly clear it, string = set it. */
      deviceProtocolId: string | null | undefined;
    }
  ): Promise<Product> {
    const row = await this.prisma.products.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.preconfigureTemplateId !== undefined
          ? { preconfigure_template_id: BigInt(input.preconfigureTemplateId) }
          : {}),
        ...(input.deviceProtocolId !== undefined
          ? {
              device_protocol_id:
                input.deviceProtocolId === null ? null : BigInt(input.deviceProtocolId),
            }
          : {}),
      },
      include: { _count: { select: { devices: true, product_attribute_preferences: true } } },
    });
    return toProduct(row);
  }

  /** Cascades device_values/devices/attribute preferences/raw_packet_values, matching Laravel's manual cascade — the frozen schema has no DB-level cascade from products to these. */
  async delete(id: string): Promise<void> {
    const productId = BigInt(id);
    const deviceIds = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { product_id: productId },
        select: { device_unique_identifier: true },
      })
    );
    await runAsSystemAsync(() =>
      this.prisma.device_values.deleteMany({
        where: { device_unique_identifier: { in: deviceIds.map(d => d.device_unique_identifier) } },
      })
    );
    await runAsSystemAsync(() =>
      this.prisma.devices.deleteMany({ where: { product_id: productId } })
    );
    await this.prisma.product_attribute_preferences.deleteMany({
      where: { product_id: productId },
    });
    await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.deleteMany({ where: { product_id: productId } })
    );
    await this.prisma.products.delete({ where: { id: productId } });
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const productIds = ids.map(id => BigInt(id));
    const deviceIds = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { product_id: { in: productIds } },
        select: { device_unique_identifier: true },
      })
    );
    await runAsSystemAsync(() =>
      this.prisma.device_values.deleteMany({
        where: { device_unique_identifier: { in: deviceIds.map(d => d.device_unique_identifier) } },
      })
    );
    await runAsSystemAsync(() =>
      this.prisma.devices.deleteMany({ where: { product_id: { in: productIds } } })
    );
    await this.prisma.product_attribute_preferences.deleteMany({
      where: { product_id: { in: productIds } },
    });
    await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.deleteMany({ where: { product_id: { in: productIds } } })
    );
    const result = await this.prisma.products.deleteMany({ where: { id: { in: productIds } } });
    return result.count;
  }

  /**
   * The frozen contract's `GET /products/company/{company_id}` takes
   * `company_id` as a path param, but its *value* is never read for
   * scoping — same D-0042/D-0045 pattern as this session's other
   * client-suppliable-tenant-key fixes. The real query is always the
   * caller's own company via the extension.
   */
  async findAllForCallersCompany(): Promise<Product[]> {
    const rows = await this.prisma.products.findMany({
      include: { _count: { select: { devices: true, product_attribute_preferences: true } } },
    });
    return rows.map(toProduct);
  }

  // -- Attribute preferences (D-0048) --------------------------------------

  async findPreferenceById(id: string): Promise<ProductAttributePreference | undefined> {
    const row = await this.prisma.product_attribute_preferences.findUnique({
      where: { id: BigInt(id) },
      include: PREFERENCE_INCLUDE,
    });
    return row ? toAttributePreference(row) : undefined;
  }

  /** `AttributePreferenceController::showSettings` equivalent — the raw preference/setting rows plus the linked Rule/Widget's real details (D-0122). */
  async findPreferenceSettingsDetail(
    id: string
  ): Promise<AttributePreferenceSettingsDetail | undefined> {
    const row = await this.prisma.product_attribute_preferences.findUnique({
      where: { id: BigInt(id) },
      include: {
        product_attribute_preference_settings: { orderBy: { id: 'asc' }, take: 1 },
      },
    });
    if (!row) return undefined;
    const setting = row.product_attribute_preference_settings[0];

    const [rule, widget] = await Promise.all([
      setting
        ? this.prisma.rules.findUnique({
            where: { id: setting.rule_id },
            select: { conditions: true, is_for_all: true },
          })
        : null,
      setting
        ? this.prisma.widgets.findUnique({
            where: { id: setting.widget_id },
            select: { type: true },
          })
        : null,
    ]);

    return {
      preference: {
        id: row.id.toString(),
        productId: row.product_id.toString(),
        userId: row.user_id.toString(),
        isUniqueIdentifier: row.is_unique_identifier,
        attributeKey: row.attribute_key,
        isSelected: row.is_selected,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      setting: setting
        ? {
            id: setting.id.toString(),
            label: setting.label,
            unit: setting.unit,
            productAttributePreferenceId: setting.product_attribute_preference_id.toString(),
            ruleId: setting.rule_id.toString(),
            widgetId: setting.widget_id.toString(),
            createdAt: setting.created_at,
            updatedAt: setting.updated_at,
          }
        : null,
      ruleConditions: rule?.conditions ?? null,
      ruleIsForAll: rule?.is_for_all ?? null,
      widgetType: widget?.type ?? null,
    };
  }

  async listPreferencesForProduct(productId: string): Promise<ProductAttributePreferenceSummary[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.findMany({
        where: { product_id: BigInt(productId) },
        include: PREFERENCE_INCLUDE,
      })
    );
    return rows.map(toAttributePreferenceSummary);
  }

  /**
   * `ProductController::storeProductSettings`'s reads (D-0124): only the
   * *caller's own* rows for the product (`where user_id = auth id`, not
   * tenant-scoped — hence `runAsSystemAsync` + the explicit filter, same
   * posture as `deviceExists`), each with whether a `product_attribute_
   * preference_settings` row exists.
   */
  async listOwnPreferencesForSettingsCheck(
    productId: string,
    userId: string
  ): Promise<OwnPreferenceForSettingsCheck[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.findMany({
        where: { product_id: BigInt(productId), user_id: BigInt(userId) },
        orderBy: { id: 'asc' },
        include: { product_attribute_preference_settings: { select: { id: true }, take: 1 } },
      })
    );
    return rows.map(row => ({
      id: row.id.toString(),
      attributeKey: row.attribute_key,
      isSelected: row.is_selected,
      isUniqueIdentifier: row.is_unique_identifier,
      hasSettings: row.product_attribute_preference_settings.length > 0,
    }));
  }

  /**
   * No compound unique constraint exists on `(product_id, user_id,
   * attribute_key)` in the frozen schema — Laravel's own
   * `updateOrCreate()` doesn't rely on one either (it's a manual
   * find-then-create/update, not a DB-level upsert), so this matches
   * that exactly rather than using Prisma's native `upsert` (which
   * requires a real unique key). `user_id` placeholder on create —
   * overwritten by the extension from the caller's own context.
   */
  async upsertPreference(
    productId: string,
    userId: string,
    attributeKey: string
  ): Promise<ProductAttributePreference> {
    const existing = await this.prisma.product_attribute_preferences.findFirst({
      where: {
        product_id: BigInt(productId),
        user_id: BigInt(userId),
        attribute_key: attributeKey,
      },
      include: PREFERENCE_INCLUDE,
    });
    if (existing) {
      const row = await this.prisma.product_attribute_preferences.update({
        where: { id: existing.id },
        data: { is_selected: true },
        include: PREFERENCE_INCLUDE,
      });
      return toAttributePreference(row);
    }
    const row = await this.prisma.product_attribute_preferences.create({
      data: {
        product_id: BigInt(productId),
        user_id: 0n,
        attribute_key: attributeKey,
        is_selected: true,
      },
      include: PREFERENCE_INCLUDE,
    });
    return toAttributePreference(row);
  }

  async updatePreferenceFields(
    id: string,
    fields: { productId?: string | undefined; attributeKey?: string | undefined }
  ): Promise<void> {
    if (Object.keys(fields).length === 0) return;
    await this.prisma.product_attribute_preferences.update({
      where: { id: BigInt(id) },
      data: {
        ...(fields.productId !== undefined ? { product_id: BigInt(fields.productId) } : {}),
        ...(fields.attributeKey !== undefined ? { attribute_key: fields.attributeKey } : {}),
      },
    });
  }

  async setPreferenceSelected(id: string, isSelected: boolean): Promise<void> {
    await this.prisma.product_attribute_preferences.update({
      where: { id: BigInt(id) },
      data: { is_selected: isSelected },
    });
  }

  async deletePreference(id: string): Promise<{ ruleId: string | null; widgetId: string | null }> {
    const preference = await this.prisma.product_attribute_preferences.findUnique({
      where: { id: BigInt(id) },
      include: PREFERENCE_INCLUDE,
    });
    const setting = preference?.product_attribute_preference_settings[0];
    if (setting) {
      await this.prisma.product_attribute_preference_settings.delete({ where: { id: setting.id } });
    }
    await this.prisma.product_attribute_preferences.delete({ where: { id: BigInt(id) } });
    return {
      ruleId: setting ? setting.rule_id.toString() : null,
      widgetId: setting ? setting.widget_id.toString() : null,
    };
  }

  /**
   * D-0154 — every preference row of a product for one attribute key, **any user**'s (`runAsSystemAsync`): the
   * unique-identifier/role mutual-exclusion rule is about the attribute itself, not about who configured it.
   */
  async findPreferenceFlagsForKey(
    productId: string,
    attributeKey: string
  ): Promise<{ isUniqueIdentifier: boolean; attributeRole: AttributeRole | null }[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.findMany({
        where: { product_id: BigInt(productId), attribute_key: attributeKey },
        select: { is_unique_identifier: true, attribute_role: true },
      })
    );
    return rows.map(row => ({
      isUniqueIdentifier: row.is_unique_identifier,
      attributeRole: row.attribute_role,
    }));
  }

  /**
   * D-0154 ("Mark as location", owner decision D1): gives one attribute a GPS role. One attribute per role per
   * product (also enforced by a partial unique index) — choosing a role another attribute already holds **moves**
   * it, and that attribute's key comes back as `replacedAttributeKey`. Marks the caller's own non-identifier row for
   * the key, creating it when the attribute has never been configured (like `marked-as-unique`, no label/unit/alert
   * settings needed). Other holders are found/cleared with `runAsSystemAsync` because the role is per *product*, not
   * per user, while `product_attribute_preferences` is `user`-ruled.
   */
  async markRole(
    productId: string,
    userId: string,
    attributeKey: string,
    role: AttributeRole
  ): Promise<{ replacedAttributeKey: string | null }> {
    const holders = await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.findMany({
        where: { product_id: BigInt(productId), attribute_role: role },
        select: { id: true, attribute_key: true },
      })
    );

    const own = await this.prisma.product_attribute_preferences.findFirst({
      where: {
        product_id: BigInt(productId),
        user_id: BigInt(userId),
        attribute_key: attributeKey,
        is_unique_identifier: false,
      },
      select: { id: true },
    });

    const others = holders.filter(holder => holder.id !== own?.id);
    if (others.length > 0) {
      await runAsSystemAsync(() =>
        this.prisma.product_attribute_preferences.updateMany({
          where: { id: { in: others.map(holder => holder.id) } },
          data: { attribute_role: null },
        })
      );
    }

    if (own) {
      await this.prisma.product_attribute_preferences.update({
        where: { id: own.id },
        data: { attribute_role: role, is_selected: true },
      });
    } else {
      await this.prisma.product_attribute_preferences.create({
        data: {
          product_id: BigInt(productId),
          user_id: BigInt(userId),
          attribute_key: attributeKey,
          is_selected: true,
          attribute_role: role,
        },
      });
    }

    const replaced = others.find(holder => holder.attribute_key !== attributeKey);
    return { replacedAttributeKey: replaced?.attribute_key ?? null };
  }

  /**
   * D-0154 — clears the role from every row of this product/key (any user's — the caller was already verified to be
   * able to see the product). A row that only existed to carry the role (no settings row, not the unique identifier)
   * is deleted rather than left behind as an empty "selected" attribute. Returns whether anything was cleared.
   */
  async unmarkRole(productId: string, attributeKey: string): Promise<boolean> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.findMany({
        where: {
          product_id: BigInt(productId),
          attribute_key: attributeKey,
          attribute_role: { not: null },
        },
        include: PREFERENCE_INCLUDE,
      })
    );
    if (rows.length === 0) return false;

    await runAsSystemAsync(() =>
      this.prisma.product_attribute_preferences.updateMany({
        where: { id: { in: rows.map(row => row.id) } },
        data: { attribute_role: null },
      })
    );
    const roleOnlyIds = rows
      .filter(
        row => !row.is_unique_identifier && row.product_attribute_preference_settings.length === 0
      )
      .map(row => row.id);
    if (roleOnlyIds.length > 0) {
      await runAsSystemAsync(() =>
        this.prisma.product_attribute_preferences.deleteMany({ where: { id: { in: roleOnlyIds } } })
      );
    }
    return true;
  }

  async markAsUniqueIdentifier(
    productId: string,
    userId: string,
    attributeKey: string
  ): Promise<void> {
    await this.prisma.product_attribute_preferences.deleteMany({
      where: { product_id: BigInt(productId), is_unique_identifier: true },
    });
    await this.prisma.product_attribute_preferences.create({
      data: {
        product_id: BigInt(productId),
        user_id: BigInt(userId),
        attribute_key: attributeKey,
        is_unique_identifier: true,
        is_selected: true,
      },
    });
  }

  async unmarkAsUniqueIdentifier(
    productId: string,
    userId: string,
    attributeKey: string
  ): Promise<boolean> {
    const result = await this.prisma.product_attribute_preferences.deleteMany({
      where: {
        product_id: BigInt(productId),
        user_id: BigInt(userId),
        attribute_key: attributeKey,
        is_unique_identifier: true,
      },
    });
    return result.count > 0;
  }

  /**
   * D-0048 — always ensures both a `Rule` and a `Widget`+`WidgetSetting`
   * (one per device on the product) exist, closing the NOT-NULL bug
   * (11.45) rather than replicating it. `rules`/`widgets`/`widget_settings`
   * are `user`/`parent`/`parent`-ruled respectively (`tenant-rules.ts`) —
   * `widgets` needs no scoping here (dashboard-less stub, D-0048's own
   * note); `rules` runs under real context so the extension assigns
   * `user_id` from the caller correctly.
   */
  async ensureRuleAndWidget(params: {
    userId: string;
    productId: string;
    attributeKey: string;
    label: string;
    unit: string | undefined;
    widgetType: string | undefined;
    alertSettings: AlertSettings | undefined;
    existingRuleId: string | undefined;
    existingWidgetId: string | undefined;
  }): Promise<{ ruleId: string; widgetId: string }> {
    const ruleId = await this.upsertRule({
      id: params.existingRuleId,
      userId: params.userId,
      conditions: params.alertSettings?.conditions ?? [],
      isForAll: params.alertSettings?.enabled ?? false,
    });

    const widgetId = await this.upsertWidget({
      id: params.existingWidgetId,
      userId: params.userId,
      productId: params.productId,
      attributeKey: params.attributeKey,
      label: params.label,
      widgetType: params.widgetType ?? 'value',
      unit: params.unit,
      ruleId,
    });

    return { ruleId, widgetId };
  }

  /** `user_id` placeholder in `data` on create — overwritten by the extension. */
  private async upsertRule(params: {
    id: string | undefined;
    userId: string;
    conditions: unknown[];
    isForAll: boolean;
  }): Promise<string> {
    if (params.id) {
      const row = await this.prisma.rules.update({
        where: { id: BigInt(params.id) },
        data: {
          conditions: params.conditions as object,
          is_active: true,
          is_for_building: true,
          is_for_all: params.isForAll,
        },
      });
      return row.id.toString();
    }
    const row = await this.prisma.rules.create({
      data: {
        user_id: 0n,
        name: '',
        conditions: params.conditions as object,
        is_active: true,
        is_for_building: true,
        is_for_all: params.isForAll,
      },
    });
    return row.id.toString();
  }

  /** Creates/updates one `Widget` + one `WidgetSetting` per device on the product (matching `createWidgetByType`/`updateWidgetByType` exactly). */
  private async upsertWidget(params: {
    id: string | undefined;
    userId: string;
    productId: string;
    attributeKey: string;
    label: string;
    widgetType: string;
    unit: string | undefined;
    ruleId: string;
  }): Promise<string> {
    const widgetId = params.id
      ? (
          await this.prisma.widgets.update({
            where: { id: BigInt(params.id) },
            data: { type: params.widgetType, created_by: BigInt(params.userId) },
          })
        ).id
      : (
          await this.prisma.widgets.create({
            data: { type: params.widgetType, created_by: BigInt(params.userId) },
          })
        ).id;

    const devices = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { product_id: BigInt(params.productId) },
        select: { id: true },
      })
    );

    // No compound unique constraint on `(widget_id, device)` in the frozen
    // schema — Laravel's own `updateOrCreate()` here is the same manual
    // find-then-create/update, not a DB upsert; matched exactly.
    for (const device of devices) {
      const deviceKey = device.id.toString();
      const existingSetting = await this.prisma.widget_settings.findFirst({
        where: { widget_id: widgetId, device: deviceKey },
      });
      const data = {
        rule_id: BigInt(params.ruleId),
        widget_name: `productAttribute |${params.label}`,
        attributes: params.attributeKey,
        unit: params.unit ?? '%',
        product: params.productId,
      };
      if (existingSetting) {
        await this.prisma.widget_settings.update({ where: { id: existingSetting.id }, data });
      } else {
        await this.prisma.widget_settings.create({
          data: {
            widget_id: widgetId,
            device: deviceKey,
            icon: 'humidity',
            background_color: '#ffffff',
            value_color: '#000000',
            text_color: '#000000',
            ...data,
          },
        });
      }
    }

    return widgetId.toString();
  }

  async upsertPreferenceSetting(
    preferenceId: string,
    fields: { label?: string; unit?: string | null; ruleId?: string; widgetId?: string }
  ): Promise<void> {
    const existing = await this.prisma.product_attribute_preference_settings.findFirst({
      where: { product_attribute_preference_id: BigInt(preferenceId) },
    });

    if (existing) {
      await this.prisma.product_attribute_preference_settings.update({
        where: { id: existing.id },
        data: {
          ...(fields.label !== undefined ? { label: fields.label } : {}),
          ...(fields.unit !== undefined ? { unit: fields.unit } : {}),
          ...(fields.ruleId !== undefined ? { rule_id: BigInt(fields.ruleId) } : {}),
          ...(fields.widgetId !== undefined ? { widget_id: BigInt(fields.widgetId) } : {}),
        },
      });
      return;
    }

    if (fields.ruleId === undefined || fields.widgetId === undefined) {
      throw new Error(
        'upsertPreferenceSetting: ruleId/widgetId required to create a new settings row (NOT NULL columns)'
      );
    }
    await this.prisma.product_attribute_preference_settings.create({
      data: {
        product_attribute_preference_id: BigInt(preferenceId),
        label: fields.label ?? null,
        unit: fields.unit ?? null,
        rule_id: BigInt(fields.ruleId),
        widget_id: BigInt(fields.widgetId),
      },
    });
  }

  // -- Preconfigure templates (deliberately `none`-ruled — see tenant-rules.ts) --

  /** Manual "global (company_id null) OR caller's own company" filter — matches Laravel exactly, see `tenant-rules.ts`'s note on why this table can't use the blanket extension. */
  async listTemplates(params: {
    companyId: string | undefined;
    manufacturer: string | undefined;
    search: string | undefined;
    perPage: number;
    page: number;
  }): Promise<{ items: PreconfigureTemplate[]; total: number }> {
    const where: Record<string, unknown> = {
      OR: params.companyId
        ? [{ company_id: null }, { company_id: BigInt(params.companyId) }]
        : [{ company_id: null }],
    };
    if (params.manufacturer) where['manufacturer'] = params.manufacturer;
    if (params.search) {
      where['AND'] = [
        {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' as const } },
            { manufacturer: { contains: params.search, mode: 'insensitive' as const } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.preconfigure_templates.findMany({
        where,
        orderBy: [{ manufacturer: 'asc' }, { name: 'asc' }],
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      this.prisma.preconfigure_templates.count({ where }),
    ]);
    return { items: rows.map(toPreconfigureTemplate), total };
  }

  async findTemplateById(
    id: string,
    companyId: string | undefined
  ): Promise<PreconfigureTemplate | undefined> {
    const row = await this.prisma.preconfigure_templates.findUnique({ where: { id: BigInt(id) } });
    if (!row) return undefined;
    if (row.company_id !== null && row.company_id.toString() !== companyId) return undefined;
    return toPreconfigureTemplate(row);
  }

  async listManufacturers(companyId: string | undefined): Promise<string[]> {
    const where: Record<string, unknown> = {
      OR: companyId
        ? [{ company_id: null }, { company_id: BigInt(companyId) }]
        : [{ company_id: null }],
      manufacturer: { not: null },
    };
    const rows = await this.prisma.preconfigure_templates.findMany({
      where,
      distinct: ['manufacturer'],
      orderBy: { manufacturer: 'asc' },
      select: { manufacturer: true },
    });
    return rows.map(r => r.manufacturer).filter((m): m is string => m !== null);
  }

  async createTemplate(
    companyId: string,
    createdBy: string,
    input: CreateTemplateInput
  ): Promise<PreconfigureTemplate> {
    const row = await this.prisma.preconfigure_templates.create({
      data: {
        company_id: BigInt(companyId),
        created_by: BigInt(createdBy),
        name: input.name,
        manufacturer: input.manufacturer ?? null,
        description: input.description ?? null,
        image: input.image ?? null,
        configuration: {
          fields: input.fields.map(f => ({
            attribute_key: f.attributeKey,
            label: f.label,
            unit: f.unit,
          })),
        },
      },
    });
    return toPreconfigureTemplate(row);
  }

  async createTemplateFromFields(
    companyId: string,
    createdBy: string,
    input: { name: string; manufacturer: string | undefined; description: string | undefined },
    fields: { attributeKey: string; label: string; unit: string | undefined }[]
  ): Promise<PreconfigureTemplate> {
    const row = await this.prisma.preconfigure_templates.create({
      data: {
        company_id: BigInt(companyId),
        created_by: BigInt(createdBy),
        name: input.name,
        manufacturer: input.manufacturer ?? null,
        description: input.description ?? null,
        configuration: {
          fields: fields.map(f => ({
            attribute_key: f.attributeKey,
            label: f.label,
            unit: f.unit,
          })),
        },
      },
    });
    return toPreconfigureTemplate(row);
  }

  async findTemplateConfiguration(
    id: string
  ): Promise<{ fields: { attribute_key: string; label?: string; unit?: string }[] } | undefined> {
    const row = await this.prisma.preconfigure_templates.findUnique({ where: { id: BigInt(id) } });
    if (!row?.configuration) return undefined;
    return row.configuration as {
      fields: { attribute_key: string; label?: string; unit?: string }[];
    };
  }

  // -- Ingestion token / raw_packet_values (D-0047) --------------------------

  async protocolExists(id: string): Promise<boolean> {
    const row = await this.prisma.protocols.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    return row !== null;
  }

  /** `user_id` placeholder — overwritten by the extension from the caller's own context. */
  async createIngestionToken(productId: string, protocolId: string, token: string) {
    const row = await this.prisma.raw_packet_values.create({
      data: { product_id: BigInt(productId), protocol_id: BigInt(protocolId), user_id: 0n, token },
    });
    return toIngestionToken(row);
  }

  /**
   * Unlike Laravel's `get_encrypt_token` — whose IV is derived from
   * `hash('sha256', json_encode($triple))`, so it hands back the exact same
   * token string on every call for the same product/protocol/user "by
   * accident" — `signIngestionToken` (D-0047) uses a random IV on purpose
   * (a real hardening, Laravel's deterministic one leaks structure), so
   * without this lookup every re-call of `POST /get-encrypt-token` (the
   * frontend calls it automatically whenever a protocol is (re)selected,
   * `01-product-onboarding.md` step 5) would silently mint a brand-new
   * token + an unconsumed placeholder row alongside the one the real
   * device already has configured — that placeholder's own next packet
   * then reads as a fresh "Initial Packet" even though the product's
   * attributes have been configured for weeks. Reusing the existing token
   * for this exact triple restores Laravel's real *intent* (one stable
   * token per product) without giving back its accidental determinism.
   * Prefers a row that's already been consumed by a real packet (the one
   * a device is demonstrably using) over an as-yet-unused one, and the
   * oldest row within either group — so re-issuing never grows the zombie
   * placeholder set further, it only ever reuses what's already there.
   */
  async findIngestionToken(productId: string, protocolId: string, userId: string) {
    const consumed = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: {
          product_id: BigInt(productId),
          protocol_id: BigInt(protocolId),
          user_id: BigInt(userId),
          NOT: { json_body: { equals: Prisma.AnyNull } },
        },
        orderBy: { id: 'asc' },
      })
    );
    if (consumed) return toIngestionToken(consumed);

    const any = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: {
          product_id: BigInt(productId),
          protocol_id: BigInt(protocolId),
          user_id: BigInt(userId),
        },
        orderBy: { id: 'asc' },
      })
    );
    return any ? toIngestionToken(any) : undefined;
  }

  async findRawPacketForProduct(productId: string): Promise<{ jsonBody: unknown } | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: {
          product_id: BigInt(productId),
          json_body: { not: Prisma.JsonNull },
          token: { not: null },
        },
        select: { json_body: true },
      })
    );
    return row ? { jsonBody: row.json_body } : undefined;
  }

  async findLatestTokenForProduct(productId: string): Promise<string | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: { product_id: BigInt(productId), NOT: { token: null } },
        orderBy: { id: 'desc' },
        select: { token: true },
      })
    );
    return row?.token ?? undefined;
  }

  async findLatestRawPacketForUser(
    productId: string,
    userId: string
  ): Promise<{ jsonBody: unknown } | undefined> {
    const row = await this.prisma.raw_packet_values.findFirst({
      where: { product_id: BigInt(productId), user_id: BigInt(userId) },
      orderBy: { id: 'desc' },
      select: { json_body: true },
    });
    return row ? { jsonBody: row.json_body } : undefined;
  }

  async deviceExists(
    productId: string,
    userId: string,
    deviceUniqueIdentifier: string
  ): Promise<boolean> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({
        where: {
          product_id: BigInt(productId),
          user_id: BigInt(userId),
          device_unique_identifier: deviceUniqueIdentifier,
        },
        select: { id: true },
      })
    );
    return row !== null;
  }

  async updateProductName(id: string, name: string): Promise<void> {
    await this.prisma.products.update({ where: { id: BigInt(id) }, data: { name } });
  }

  /**
   * KNOWN_ISSUES 11.46 — Laravel's `storeUserPreferenceAttributes` calls
   * `updateOrCreate(['product_id','user_id'], ['user_preference_packet_
   * values' => ...])`, but that column **does not exist anywhere in the
   * frozen schema** and isn't in the model's `$fillable` either — the
   * submitted payload is silently discarded by Eloquent's mass-assignment
   * guard, not an error. The call still finds-or-creates a preference row
   * matching only `(product_id, user_id)` — no `attribute_key` in the
   * match criteria at all, unlike every other preference-creation path in
   * this controller. Matched exactly (including the odd match criteria)
   * since there is no column to actually persist the submitted values
   * into and inventing one would violate README prime directive #3.
   */
  async touchUserPreferenceRow(productId: string, userId: string): Promise<void> {
    const existing = await this.prisma.product_attribute_preferences.findFirst({
      where: { product_id: BigInt(productId), user_id: BigInt(userId) },
    });
    if (existing) return;
    await this.prisma.product_attribute_preferences.create({
      data: { product_id: BigInt(productId), user_id: 0n },
    });
  }
}

export function currentUserId(): string {
  const context = getRequestContext();
  if (!context) throw new Error('no request context');
  return context.userId;
}
