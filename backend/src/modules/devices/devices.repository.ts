import { Prisma, type device_positions as DevicePositionRow } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toProfile } from '../users/users.mapper.js';
import type { Profile } from '../users/users.types.js';
import {
  toDevice,
  toDevicePosition,
  toProductWithDevices,
  toUserDevice,
} from './devices.mapper.js';
import type {
  CreateDeviceInput,
  Device,
  DeviceBrief,
  AssignableTracker,
  DevicePosition,
  DeviceWithOwnerAndLatestValue,
  LatestDeviceValue,
  ListProductsWithDevicesQuery,
  ProductWithDevices,
  UpdateDeviceInput,
  UserDevice,
} from './devices.types.js';

/**
 * All Prisma access for module 2.3. `devices` is registered `user`-ruled
 * (`tenant-rules.ts`, added early for 11.37's regression tests), but
 * Laravel's real authorization boundary is wider — a device is the
 * caller's if it's directly attributed to them (`user_id`) **or** belongs
 * to a product owned by their company (D-0022's `authorizedDeviceQuery()`,
 * the live-app hotfix this module's whole method list is built to
 * structurally replicate). The blanket `user`-only tenant-scoping
 * extension can't express that OR, so every read/mutation past `create()`
 * runs under `runAsSystemAsync` with the OR expressed by hand in `where` —
 * same pattern as module 2.1's `findDevicesForProduct` (parent-verified
 * scoping, not a bypass: the caller-supplied `userId`/`companyId` always
 * come from the request's own verified JWT context, never client input).
 * `create()` is the one method that keeps real context, since forcing
 * `user_id` from the caller on create is exactly `tenant-scoping.ts`'s
 * job and matches Laravel's own `Device::create($validated + ['user_id' =>
 * $this->user->id])` precisely.
 */
export class DevicesRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  private authorizedWhere(userId: string, companyId: string): Record<string, unknown> {
    return { OR: [{ user_id: BigInt(userId) }, { products: { company_id: BigInt(companyId) } }] };
  }

  /**
   * Module 2.4 (ingestion) — resolves a device from an inbound packet's
   * unique-identifier value, with **no tenant scoping at all**, matching
   * Laravel's `Device::where('device_unique_identifier', ...)->first()`
   * exactly (`ingestion.md` §2.3/§3.1): ingestion is a machine-to-machine
   * call authenticated by the ingestion token (HTTP) or the broker
   * connection (MQTT), not a user request with a company/user context to
   * scope by. Deliberately `runAsSystemAsync`, not a bypass of a check that
   * should exist — there is no user session here to check against.
   */
  async findByUniqueIdentifier(deviceUniqueIdentifier: string): Promise<Device | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({ where: { device_unique_identifier: deviceUniqueIdentifier } })
    );
    return row ? toDevice(row) : undefined;
  }

  /**
   * D-0142: `processIngestionJob`'s own device re-resolution — unlike `findByUniqueIdentifier`
   * above (kept unscoped for the two call sites that still need it, see that method's own callers),
   * this one is used exactly where the packet's `productId` is already known and a wrong match has a
   * real consequence (the `device_values` row, rule evaluation, and every realtime event this worker
   * enqueues all key off the returned `device.id`). Scoping by `product_id` here fixes a real
   * cross-product `device_unique_identifier` collision without touching Laravel parity — this
   * worker-side resolution has no live Laravel equivalent to stay parity with in the first place
   * (`raw_packet_values.device_ids`, which feeds it, is never populated by Laravel's own live
   * webhook/MQTT paths — only by `PacketIngestionService.php`, which is never actually wired to a
   * route, confirmed by grepping the whole Laravel app).
   */
  async findByUniqueIdentifierForProduct(
    productId: string,
    deviceUniqueIdentifier: string
  ): Promise<Device | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({
        where: { device_unique_identifier: deviceUniqueIdentifier, product_id: BigInt(productId) },
      })
    );
    return row ? toDevice(row) : undefined;
  }

  /**
   * Module 2.5 (rules) — the rule-actions worker resolves a device by the
   * numeric id `RuleActionsJobData.deviceId` already carries (ingestion
   * resolved it once already; no re-resolution by unique-identifier
   * needed). Same no-tenant-scoping reasoning as `findByUniqueIdentifier`:
   * the worker has no HTTP request/company context, only a job payload.
   */
  async findByIdUnscoped(id: string): Promise<Device | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findUnique({ where: { id: BigInt(id) } })
    );
    return row ? toDevice(row) : undefined;
  }

  /** `MqttService::handleDeviceStatus` equivalent — MQTT-exclusive, no HTTP route found for it in the 0.3 API catalog survey (`ingestion.md` §3.3). Same no-tenant-scoping reasoning as `findByUniqueIdentifier`. */
  async updateStatusByUniqueIdentifier(
    deviceUniqueIdentifier: string,
    status: string
  ): Promise<boolean> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.updateMany({
        where: { device_unique_identifier: deviceUniqueIdentifier },
        data: { status },
      })
    );
    return result.count > 0;
  }

  // -- index() (11.29): paginated Products with nested devices, company-scoped --

  async listProductsWithDevices(
    query: ListProductsWithDevicesQuery
  ): Promise<{ items: ProductWithDevices[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (query.search) {
      where['name'] = { contains: query.search, mode: 'insensitive' as const };
    }

    const devicesWhere = query.productId ? { product_id: BigInt(query.productId) } : undefined;
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.products.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.perPage,
        include: { devices: devicesWhere ? { where: devicesWhere } : true },
      }),
      this.prisma.products.count({ where }),
    ]);

    // D-0112: no Prisma relation exists from `devices` to `users` (only a scalar `user_id`) — batch
    // resolve every device owner in one extra query rather than adding an unmodeled relation to the
    // frozen schema.
    const userIds = [...new Set(rows.flatMap(row => row.devices.map(d => d.user_id)))];
    const userRows =
      userIds.length > 0
        ? await this.prisma.users.findMany({ where: { id: { in: userIds } } })
        : [];
    const usersById = new Map<string, Profile>(userRows.map(u => [u.id.toString(), toProfile(u)]));

    return { items: rows.map(row => toProductWithDevices(row, usersById)), total };
  }

  // -- create (D-0022 closes 11.5: sets user_id; product_id validated company-scoped by the caller) --

  /** Matches Laravel's `exists:devices,id` validation rule on bulk operations — a plain "does this id exist as any device row," unscoped by tenant (the actual authorization happens separately in the bulk update/delete's `authorizedWhere`). */
  async existingDeviceIdCount(ids: string[]): Promise<number> {
    return runAsSystemAsync(() =>
      this.prisma.devices.count({ where: { id: { in: ids.map(id => BigInt(id)) } } })
    );
  }

  /**
   * `RbacCompanyDevicesLookup` implementation (D-0100) — module 1.3's
   * `GET /companies`'s `devices_count` column matches Laravel's odd
   * `withCount(['users as devices_count' => fn ($q) => $q->join('devices', ...)])`:
   * the number of devices owned (via `user_id`) by any user in the target
   * company. `devices` has no `company_id` column at all (`user`-ruled,
   * not `company`-ruled, per `tenant-rules.ts`), so this takes the
   * company's already-resolved user ids rather than joining itself.
   */
  async countForUserIds(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    return runAsSystemAsync(() =>
      this.prisma.devices.count({ where: { user_id: { in: userIds.map(id => BigInt(id)) } } })
    );
  }

  async deviceUniqueIdentifierExists(
    identifier: string,
    excludeId: string | undefined
  ): Promise<boolean> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({
        where: {
          device_unique_identifier: identifier,
          ...(excludeId ? { id: { not: BigInt(excludeId) } } : {}),
        },
        select: { id: true },
      })
    );
    return row !== null;
  }

  /** `user_id` placeholder — overwritten by the tenant-scoping extension from the caller's own context. */
  async create(input: CreateDeviceInput): Promise<Device> {
    const row = await this.prisma.devices.create({
      data: {
        device_unique_identifier: input.deviceUniqueIdentifier,
        name: input.name,
        type: input.type ?? null,
        status: input.status ?? 'active',
        location: input.location ?? '',
        tags: input.tags ?? '',
        product_id: BigInt(input.productId),
        user_id: 0n,
      },
    });
    return toDevice(row);
  }

  // -- authorized single-device access (D-0022's authorizedDeviceQuery() equivalent) --

  async findAuthorized(id: string, userId: string, companyId: string): Promise<Device | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({
        where: { id: BigInt(id), ...this.authorizedWhere(userId, companyId) },
      })
    );
    if (!row) return undefined;
    const lastReportedAt = await this.latestDeviceValueTimestamp(row.device_unique_identifier);
    return toDevice(row, lastReportedAt);
  }

  async update(
    id: string,
    userId: string,
    companyId: string,
    input: UpdateDeviceInput
  ): Promise<Device | undefined> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.updateMany({
        where: { id: BigInt(id), ...this.authorizedWhere(userId, companyId) },
        data: {
          ...(input.deviceUniqueIdentifier !== undefined
            ? { device_unique_identifier: input.deviceUniqueIdentifier }
            : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
        },
      })
    );
    if (result.count === 0) return undefined;
    return this.findAuthorized(id, userId, companyId);
  }

  async delete(id: string, userId: string, companyId: string): Promise<boolean> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.deleteMany({
        where: { id: BigInt(id), ...this.authorizedWhere(userId, companyId) },
      })
    );
    return result.count > 0;
  }

  async setStatus(
    id: string,
    userId: string,
    companyId: string,
    status: 'active' | 'inactive'
  ): Promise<Device | undefined> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.updateMany({
        where: { id: BigInt(id), ...this.authorizedWhere(userId, companyId) },
        data: { status },
      })
    );
    if (result.count === 0) return undefined;
    return this.findAuthorized(id, userId, companyId);
  }

  async bulkSetStatus(
    ids: string[],
    userId: string,
    companyId: string,
    status: 'active' | 'inactive'
  ): Promise<number> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.updateMany({
        where: {
          id: { in: ids.map(id => BigInt(id)) },
          ...this.authorizedWhere(userId, companyId),
        },
        data: { status },
      })
    );
    return result.count;
  }

  async bulkDelete(ids: string[], userId: string, companyId: string): Promise<number> {
    const result = await runAsSystemAsync(() =>
      this.prisma.devices.deleteMany({
        where: {
          id: { in: ids.map(id => BigInt(id)) },
          ...this.authorizedWhere(userId, companyId),
        },
      })
    );
    return result.count;
  }

  /** For `sendCommand`/`sendBulkCommands` — same authorized-lookup shape, no state change. */
  async findManyAuthorized(ids: string[], userId: string, companyId: string): Promise<Device[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: {
          id: { in: ids.map(id => BigInt(id)) },
          ...this.authorizedWhere(userId, companyId),
        },
      })
    );
    return rows.map(row => toDevice(row));
  }

  // -- getByProduct (D-0022: whereHas product.company_id, closing 11.37 for this method) --

  async findByProductAuthorized(
    productId: string,
    companyId: string
  ): Promise<DeviceWithOwnerAndLatestValue[]> {
    return runAsSystemAsync(async () => {
      const rows = await this.prisma.devices.findMany({
        where: { product_id: BigInt(productId), products: { company_id: BigInt(companyId) } },
        orderBy: { id: 'asc' },
      });
      if (rows.length === 0) return [];

      // D-0128: Laravel eager-loads `latestDeviceValue` and (via the `created_at` accessor's side effect,
      // D-0119) the owner `user`. No Prisma relation exists devices→users, so batch both.
      const userRows = await this.prisma.users.findMany({
        where: { id: { in: [...new Set(rows.map(r => r.user_id))] } },
      });
      const usersById = new Map<string, Profile>(
        userRows.map(u => [u.id.toString(), toProfile(u)])
      );

      const identifiers = [...new Set(rows.map(r => r.device_unique_identifier))];
      const grouped = await this.prisma.device_values.groupBy({
        by: ['device_unique_identifier'],
        where: { device_unique_identifier: { in: identifiers } },
        _max: { id: true },
      });
      const latestIds = grouped.map(g => g._max.id).filter((id): id is bigint => id !== null);
      const latestRows =
        latestIds.length > 0
          ? await this.prisma.device_values.findMany({ where: { id: { in: latestIds } } })
          : [];
      const latestByIdentifier = new Map<string, LatestDeviceValue>(
        latestRows.map(r => [
          r.device_unique_identifier,
          {
            id: r.id.toString(),
            deviceId: r.device_id.toString(),
            deviceUniqueIdentifier: r.device_unique_identifier,
            values: (r.values ?? {}) as Record<string, unknown>,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
        ])
      );

      return rows.map(row => {
        const user = usersById.get(row.user_id.toString());
        if (!user)
          throw new Error(`devices.user_id ${row.user_id.toString()} not found in usersById map`);
        const latestDeviceValue = latestByIdentifier.get(row.device_unique_identifier) ?? null;
        return { ...toDevice(row, latestDeviceValue?.createdAt ?? null), user, latestDeviceValue };
      });
    });
  }

  /**
   * Matches Laravel's `AssetComponent::whereNotNull('device_id')->pluck('device_id')->unique()`
   * exactly — genuinely global, no company scoping in the live app either
   * (`asset_components` is `parent`-ruled; read-only here, 3.1 owns real
   * CRUD/tenant semantics for this table). Returned in component-id order,
   * first occurrence kept, like `pluck()->unique()` (D-0128 — the response
   * lists these ids verbatim, so order/dedup are now observable).
   */
  async assignedDeviceIds(): Promise<string[]> {
    const rows = await this.prisma.asset_components.findMany({
      where: { device_id: { not: null } },
      select: { device_id: true },
      orderBy: { id: 'asc' },
    });
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.device_id !== null) seen.add(row.device_id);
    }
    return [...seen];
  }

  // -- points() --

  /**
   * `created_at` is `@db.Timestamp(0)` — truncated to whole seconds, so
   * rapid successive ingests routinely tie. Laravel's own `latest('created_at')`
   * has the same ambiguity (undefined order on a tie); ordering by `id`
   * as a secondary key breaks the tie deterministically in favor of the
   * most-recently-inserted row without changing any case where the
   * timestamps genuinely differ — a correctness improvement, not a
   * behavior deviation worth a DECISIONS.md entry.
   */
  async latestDeviceValueTimestamp(deviceUniqueIdentifier: string): Promise<Date | null> {
    const row = await runAsSystemAsync(() =>
      this.prisma.device_values.findFirst({
        where: { device_unique_identifier: deviceUniqueIdentifier },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { created_at: true },
      })
    );
    return row?.created_at ?? null;
  }

  async findLatestValuesForDevice(
    deviceUniqueIdentifier: string
  ): Promise<Record<string, unknown>> {
    const row = await runAsSystemAsync(() =>
      this.prisma.device_values.findFirst({
        where: { device_unique_identifier: deviceUniqueIdentifier },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { values: true },
      })
    );
    if (!row || typeof row.values !== 'object' || row.values === null || Array.isArray(row.values))
      return {};
    return row.values;
  }

  // -- userDevices (11.48: scoped to the caller, never a client-suppliable user_id) --

  async listUserDevices(userId: string): Promise<UserDevice[]> {
    const rows = await this.prisma.user_devices.findMany({ where: { user_id: BigInt(userId) } });
    return rows.map(toUserDevice);
  }

  // -- module 4.8 (fleet-positions): FleetController::positions()'s real scope --
  // company-wide via `product.company_id`, deliberately NOT `authorizedWhere`'s
  // `user_id` OR-fallback (Laravel's own query here has no such fallback) --
  // so this runs unscoped past the blanket `user`-tenant rule, same reasoning
  // as every other method above past `create()`.

  async deviceIdsForCompany(companyId: string): Promise<string[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { products: { company_id: BigInt(companyId) } },
        select: { id: true },
      })
    );
    return rows.map(row => row.id.toString());
  }

  /** `device:id,name,device_unique_identifier,product_id` eager-load brief, by id list. */
  async findBriefByIds(ids: string[]): Promise<DeviceBrief[]> {
    if (ids.length === 0) return [];
    const rows = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: { id: { in: ids.map(id => BigInt(id)) } },
        select: { id: true, name: true, device_unique_identifier: true, product_id: true },
      })
    );
    return rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      deviceUniqueIdentifier: row.device_unique_identifier,
      productId: row.product_id.toString(),
    }));
  }

  /**
   * Latest recorded position per device id (the row with the newest `recorded_at`, ties by the highest `id`; for server-time packets that is
   * Laravel's own grouped-MAX(id) row). `device_positions` is `parent`-ruled (tenant-rules.ts), no scoping bypass needed here; the device ids passed
   * in are already company-scoped by the caller via `deviceIdsForCompany`.
   *
   * D-0196: one LATERAL index probe per device. The earlier "grouped MAX(id), then fetch by id" read the WHOLE history of every device and looked the
   * rows up by `id` alone — fast on a plain table, but on the compressed hypertable (`device_positions` keeps 12 months, compressed after 7 days) an
   * id-only lookup decompresses every chunk (measured on 2.6 million rows: 2.6 s vs 1 ms). This form is ~100x faster on both.
   */
  async latestPositionsForDeviceIds(deviceIds: string[]): Promise<DevicePosition[]> {
    if (deviceIds.length === 0) return [];
    const ids = deviceIds.map(id => BigInt(id));
    const rows = await this.prisma.$queryRaw<DevicePositionRow[]>(Prisma.sql`
      SELECT p.id, p.device_id, p.latitude, p.longitude, p.speed, p.heading, p.recorded_at, p.created_at, p.updated_at
      FROM unnest(ARRAY[${Prisma.join(ids)}]::bigint[]) AS d(device_id)
      CROSS JOIN LATERAL (
        SELECT * FROM device_positions WHERE device_id = d.device_id ORDER BY recorded_at DESC, id DESC LIMIT 1
      ) p
      ORDER BY p.device_id`);
    return rows.map(toDevicePosition);
  }
  /** `FleetController::history` — company-scoped device existence (`Device::whereHas('product', company_id)->find()`), no row needed beyond a yes/no. */
  async deviceInCompany(companyId: string, id: string): Promise<boolean> {
    if (!/^\d+$/.test(id)) return false;
    const row = await runAsSystemAsync(() =>
      this.prisma.devices.findFirst({
        where: { id: BigInt(id), products: { company_id: BigInt(companyId) } },
        select: { id: true },
      })
    );
    return row !== null;
  }

  /** `FleetController::history` — the most recent `limit` positions, returned oldest → newest (Laravel: `orderByDesc('recorded_at')->limit()->get()->reverse()`). `device_positions` is `parent`-ruled; the caller has already verified the device is in its company. */
  async positionHistory(deviceId: string, limit: number): Promise<DevicePosition[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId) },
      orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.reverse().map(toDevicePosition);
  }

  /**
   * "Assignable trackers" (frontend dropdown, D9): devices the caller may assign (same `authorizedWhere` OR-boundary as
   * `assign-device`'s own check) that are **not currently installed in any vehicle**. `has_position` = the device has ever
   * reported a GPS position.
   */
  async listAssignableTrackers(
    userId: string,
    companyId: string,
    options: { search: string | undefined; onlyWithPosition: boolean }
  ): Promise<AssignableTracker[]> {
    const search = options.search?.trim();
    const rows = await runAsSystemAsync(() =>
      this.prisma.devices.findMany({
        where: {
          AND: [
            this.authorizedWhere(userId, companyId),
            { vehicle_device_assignments: { none: { unassigned_at: null } } },
            ...(search
              ? [
                  {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' as const } },
                      {
                        device_unique_identifier: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                ]
              : []),
            ...(options.onlyWithPosition ? [{ device_positions: { some: {} } }] : []),
          ],
        },
        include: {
          products: { select: { id: true, name: true } },
          _count: { select: { device_positions: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      })
    );
    return rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      deviceUniqueIdentifier: row.device_unique_identifier,
      status: row.status,
      hasPosition: row._count.device_positions > 0,
      product: { id: row.products.id.toString(), name: row.products.name },
    }));
  }
}
