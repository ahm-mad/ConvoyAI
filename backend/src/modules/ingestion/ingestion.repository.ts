import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toRawPacket } from './ingestion.mapper.js';
import type { CreateRawPacketInput, RawPacket } from './ingestion.types.js';

/**
 * All Prisma access for module 2.4. `raw_packet_values` is `user`-ruled
 * (`tenant-rules.ts`) but ingestion has no request-context user at all —
 * the HTTP path authenticates via the ingestion token (D-0047/D-0053's
 * `verifyIngestionToken`), the MQTT path via the broker connection
 * (D-0050's carried-forward trust model), neither of which populates a JWT
 * session context. Every query here runs under `runAsSystemAsync`
 * deliberately — there is no user session to check against, not a bypass
 * of one that should exist.
 */
export class IngestionRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async tokenExists(token: string): Promise<boolean> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({ where: { token }, select: { id: true } })
    );
    return row !== null;
  }

  /** 11.31: the unified dedup mechanism — a hash over product/user/protocol/body/token within a rolling time window, replacing both live paths' ad hoc "empty json_body" checks (11.32's no-`orderBy` ambiguity included). */
  async findRecentByHash(
    packetHash: string,
    sinceMinutesAgo: number
  ): Promise<RawPacket | undefined> {
    const since = new Date(Date.now() - sinceMinutesAgo * 60_000);
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: { packet_hash: packetHash, created_at: { gte: since } },
        orderBy: { id: 'desc' },
      })
    );
    return row ? toRawPacket(row) : undefined;
  }

  /** The "token was just issued, first packet since issuance" placeholder row created by `get-encrypt-token` (module 2.1) — `token` is only present on the HTTP path. */
  /**
   * The real placeholder row (`ProductsRepository.createIngestionToken`,
   * module 2.1) omits `json_body` from its `data` entirely, which Prisma
   * persists as a genuine SQL NULL — **not** the JSON `null` literal. A
   * nullable `Json` column needs `Prisma.AnyNull` (matches either DB NULL
   * or JSON null) to catch that; `{ equals: Prisma.JsonNull }` only matches
   * the JSON-null literal and silently misses every real placeholder row
   * (confirmed empirically: a row created the same way `createIngestionToken`
   * does never matched `JsonNull`, only `AnyNull`). A real bug found by
   * `ingestion.service.integration.test.ts`'s end-to-end suite, not by this
   * file's own narrower integration test (which had created its placeholder
   * fixture with `Prisma.JsonNull` explicitly, matching the old, wrong
   * filter on both sides).
   */
  async findLegacyPlaceholder(
    productId: string,
    protocolId: string,
    userId: string,
    token: string | undefined
  ): Promise<RawPacket | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findFirst({
        where: {
          product_id: BigInt(productId),
          protocol_id: BigInt(protocolId),
          user_id: BigInt(userId),
          ...(token !== undefined ? { token } : {}),
          json_body: { equals: Prisma.AnyNull },
        },
        orderBy: { id: 'desc' },
      })
    );
    return row ? toRawPacket(row) : undefined;
  }

  async updatePlaceholder(
    id: string,
    jsonBody: Record<string, unknown>,
    packetHash: string,
    deviceIds: string[]
  ): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.update({
        where: { id: BigInt(id) },
        data: { json_body: jsonBody, packet_hash: packetHash, device_ids: deviceIds },
      })
    );
  }

  /**
   * D-0142, corrected: finds the row(s) D-0120's HTTP "initial packet" short-circuit left with
   * `device_ids: []` (no device was resolvable yet at that point) for this exact token — at most
   * one in practice, since a token gets exactly one placeholder row, but the caller re-resolves
   * each one's device from **its own** `json_body`, never from whichever packet triggered this
   * check. (An earlier version of this fix took the triggering packet's own resolved device and
   * stamped it onto the stale row directly — correct only by coincidence when a token happens to
   * see one device; silently wrong the moment two+ devices share a token, this app's normal case
   * — a real bug the frontend caught live-testing a multi-device product. Fixed same-session.)
   */
  async findPlaceholdersNeedingDeviceIdBackfill(
    productId: string,
    protocolId: string,
    userId: string,
    token: string
  ): Promise<{ id: string; jsonBody: Record<string, unknown> | null }[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findMany({
        where: {
          product_id: BigInt(productId),
          protocol_id: BigInt(protocolId),
          user_id: BigInt(userId),
          token,
          device_ids: { equals: [] },
        },
        select: { id: true, json_body: true },
      })
    );
    return rows.map(r => ({
      id: r.id.toString(),
      jsonBody: r.json_body as Record<string, unknown> | null,
    }));
  }

  async updatePlaceholderDeviceIdsById(id: string, deviceIds: string[]): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.update({
        where: { id: BigInt(id) },
        data: { device_ids: deviceIds },
      })
    );
  }

  async create(input: CreateRawPacketInput): Promise<RawPacket> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.create({
        data: {
          product_id: BigInt(input.productId),
          protocol_id: BigInt(input.protocolId),
          device_protocol_id: input.deviceProtocolId ? BigInt(input.deviceProtocolId) : null,
          user_id: BigInt(input.userId),
          json_body: input.jsonBody,
          device_ids: input.deviceIds,
          token: input.token ?? null,
          packet_hash: input.packetHash,
        },
      })
    );
    return toRawPacket(row);
  }

  async findById(id: string): Promise<RawPacket | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.raw_packet_values.findUnique({ where: { id: BigInt(id) } })
    );
    return row ? toRawPacket(row) : undefined;
  }

  /**
   * `device_unique_identifier` is taken from the already-resolved `Device`
   * row, not re-derived from a `deviceInfo.devEui` packet field like
   * `ProductController::storeCleanedPacket` does (a real bug found this
   * session — see `tasks/08-ingestion.md`'s Design notes / KNOWN_ISSUES
   * 11.49: that field is absent on non-LoRaWAN payloads, silently writing
   * `device_unique_identifier: null` and breaking every "latest value for
   * this device" lookup elsewhere in the app). Matching the device that
   * was actually resolved is always correct; re-deriving it from a raw
   * packet subfield is not.
   */
  async createDeviceValue(
    deviceId: string,
    deviceUniqueIdentifier: string,
    values: Record<string, unknown>
  ): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.device_values.create({
        data: {
          device_id: BigInt(deviceId),
          device_unique_identifier: deviceUniqueIdentifier,
          values,
        },
      })
    );
  }

  /**
   * `DeviceValue::where('device_unique_identifier', $id)->latest('created_at')->first()->values`
   * (D-0139's widget-alert loop, `realtime-channels.md` §3.1) — deliberately re-reads by
   * `device_unique_identifier` alone, matching Laravel exactly (the row `createDeviceValue` just
   * wrote), not `findLatestDeviceValues`'s `device_id` + `device_unique_identifier` pair
   * (`dashboards.repository.ts`, a different call site with different inputs available). `parent`-
   * ruled (`device_values`), `runAsSystemAsync` kept for consistency with the rest of this file.
   */
  async findLatestDeviceValueByUniqueIdentifier(
    deviceUniqueIdentifier: string
  ): Promise<Record<string, unknown> | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.device_values.findFirst({
        where: { device_unique_identifier: deviceUniqueIdentifier },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { values: true },
      })
    );
    if (!row) return undefined;
    return typeof row.values === 'object' && row.values !== null && !Array.isArray(row.values)
      ? row.values
      : {};
  }

  /**
   * `ConnectivityPacketsLookup` implementation (D-0104) — `/connectors/
   * health`'s real per-transport-protocol totals. Laravel's own MQTT
   * adapter counts a separate `device_packets`/`DevicePacket` table
   * (legacy, never ported — Node's unified ingestion pipeline already
   * writes every packet, MQTT or webhook, to this same `raw_packet_values`
   * table with `protocol_id` set to the resolved transport protocol,
   * D-0054), so this queries that instead — the real signal for Node's
   * actual architecture, not a re-derivation of a table this app doesn't
   * have. Matches Laravel's own webhook adapter exactly (`RawPacketValue::
   * where('protocol_id', ...)`).
   */
  async countAndLatestByProtocolId(
    protocolId: string
  ): Promise<{ total: number; lastMessageAt: Date | null }> {
    const [total, latest] = await runAsSystemAsync(() =>
      Promise.all([
        this.prisma.raw_packet_values.count({ where: { protocol_id: BigInt(protocolId) } }),
        this.prisma.raw_packet_values.findFirst({
          where: { protocol_id: BigInt(protocolId) },
          orderBy: { created_at: 'desc' },
        }),
      ])
    );
    return { total, lastMessageAt: latest?.created_at ?? null };
  }

  async createDevicePosition(
    deviceId: string,
    latitude: number,
    longitude: number,
    speed: number | undefined,
    heading: number | undefined
  ): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.device_positions.create({
        data: {
          device_id: BigInt(deviceId),
          latitude,
          longitude,
          speed: speed ?? null,
          heading: heading ?? null,
          recorded_at: new Date(),
        },
      })
    );
  }
}
