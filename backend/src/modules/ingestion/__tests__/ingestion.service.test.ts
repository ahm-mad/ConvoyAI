import { describe, expect, it } from 'vitest';
import { signIngestionToken } from '../../../platform/crypto/ingestion-token.js';
import { IngestionService } from '../ingestion.service.js';
import {
  fakeDevicesLookup,
  fakeAssetsLookup,
  fakeGeofencesLookup,
  fakeIngestionRepository,
  fakeProductsLookup,
  fakeProtocolsLookup,
  fakeQueuePort,
  fakeWidgetsLookup,
} from './fakes.js';
import type { RuleCondition } from '../../../shared/utils/rule-condition-evaluator.js';

const TOKEN = signIngestionToken({ userId: '1', productId: '1', protocolId: '1' });

function buildService(opts: {
  tokens?: string[];
  products?: { id: string; companyId: string; deviceProtocolId: string | null }[];
  preferences?: Record<
    string,
    {
      attributeKey: string | null;
      label: string | null;
      unit: string | null;
      isSelected: boolean;
      isUniqueIdentifier: boolean;
    }[]
  >;
  devices?: { id: string; productId: string; userId: string; deviceUniqueIdentifier: string }[];
  protocols?: { id: string; name: string }[];
  widgetSettings?: {
    widgetId: string;
    dashboardId: string | null;
    ruleId: string;
    attributeKey: string;
    product: string | null;
  }[];
  widgetRules?: Record<string, RuleCondition[]>;
  assetIdByDeviceId?: Record<string, string>;
  assetsById?: Record<string, Record<string, unknown>>;
  widgetsLookup?: ReturnType<typeof fakeWidgetsLookup>;
}) {
  const { repository, state } = fakeIngestionRepository(opts.tokens ?? [TOKEN]);
  const productsLookup = fakeProductsLookup(
    opts.products ?? [{ id: '1', companyId: '1', deviceProtocolId: null }],
    opts.preferences ?? {}
  );
  const devicesLookup = fakeDevicesLookup(opts.devices ?? []);
  const protocolsLookup = fakeProtocolsLookup(opts.protocols ?? []);
  const queue = fakeQueuePort();
  const geofencesLookup = fakeGeofencesLookup();
  const widgetsLookup =
    opts.widgetsLookup ?? fakeWidgetsLookup(opts.widgetSettings, opts.widgetRules);
  const assetsLookup = fakeAssetsLookup(opts.assetIdByDeviceId, opts.assetsById);
  const service = new IngestionService(
    repository,
    productsLookup,
    devicesLookup,
    protocolsLookup,
    queue,
    geofencesLookup,
    widgetsLookup,
    assetsLookup
  );
  return { service, state, devicesLookup, queue, geofencesLookup };
}

const PREFS_WITH_UID = {
  '1': [
    {
      attributeKey: 'deviceInfo.uid',
      label: 'UID',
      unit: null,
      isSelected: true,
      isUniqueIdentifier: true,
    },
  ],
};

describe('IngestionService.ingestHttpPacket (WebhookController::storePacketData equivalent)', () => {
  it("returns unauthenticated when the token doesn't exist in raw_packet_values", async () => {
    const { service } = buildService({ tokens: [] });

    const result = await service.ingestHttpPacket(TOKEN, {});

    expect(result).toEqual({ kind: 'unauthenticated' });
  });

  it('returns invalid_token for a token that exists but fails to decrypt', async () => {
    const { service } = buildService({ tokens: ['garbage-token'] });

    const result = await service.ingestHttpPacket('garbage-token', {});

    expect(result).toEqual({ kind: 'invalid_token' });
  });

  it('returns no_preferences when the product has no configured attribute preferences', async () => {
    const { service } = buildService({ preferences: {} });

    const result = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'dev-1' } });

    expect(result).toEqual({ kind: 'no_preferences' });
  });

  it('returns no_unique_identifier when no preference is flagged is_unique_identifier', async () => {
    const { service } = buildService({
      preferences: {
        '1': [
          {
            attributeKey: 'temp',
            label: 'Temp',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      },
    });

    const result = await service.ingestHttpPacket(TOKEN, { temp: 21 });

    expect(result).toEqual({ kind: 'no_unique_identifier' });
  });

  it("returns device_not_found when the unique-identifier value doesn't match any device (proceeds even if the value is missing from the body — a real Laravel parity case, not collapsed into no_unique_identifier)", async () => {
    const { service } = buildService({ preferences: PREFS_WITH_UID, devices: [] });

    const missingValue = await service.ingestHttpPacket(TOKEN, {}); // no deviceInfo.uid in body at all
    expect(missingValue).toEqual({ kind: 'device_not_found' });

    const wrongValue = await service.ingestHttpPacket(TOKEN, {
      deviceInfo: { uid: 'unknown-device' },
    });
    expect(wrongValue).toEqual({ kind: 'device_not_found' });
  });

  it("D-0120: a brand-new token's first packet returns initial_packet even with NO preferences and NO devices yet (the normal state before the user has mapped any fields)", async () => {
    const { service, state, queue } = buildService({ preferences: {}, devices: [] });
    state.rawPackets.set('placeholder-1', {
      id: 'placeholder-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: null,
      deviceIds: [],
      token: TOKEN,
      packetHash: null,
    });

    const first = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'dev-1' } });

    expect(first).toEqual({ kind: 'initial_packet', productId: '1', userId: '1' });
    expect(state.rawPackets.get('placeholder-1')?.jsonBody).toEqual({
      deviceInfo: { uid: 'dev-1' },
    });
    expect(state.rawPackets.get('placeholder-1')?.deviceIds).toEqual([]);
    expect(queue.ingestionJobs).toHaveLength(0);
    expect(queue.initialPacketJobs).toEqual([{ productId: '1', userId: '1' }]);

    // The placeholder is now filled: the NEXT (different) packet falls through to the normal path,
    // which correctly reports missing preferences — matching Laravel's `empty($existingPacket->json_body)` gate.
    const second = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'dev-2' } });
    expect(second).toEqual({ kind: 'no_preferences' });
  });

  it("returns initial_packet, fills the legacy placeholder row's json_body, enqueues only the module 2.6 initial-packet realtime job (not an ingestion processing job)", async () => {
    const { service, state, queue } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });
    state.rawPackets.set('placeholder-1', {
      id: 'placeholder-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: null,
      deviceIds: [],
      token: TOKEN,
      packetHash: null,
    });

    const result = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'dev-1' } });

    expect(result).toEqual({ kind: 'initial_packet', productId: '1', userId: '1' });
    expect(state.rawPackets.get('placeholder-1')?.jsonBody).toEqual({
      deviceInfo: { uid: 'dev-1' },
    });
    expect(queue.ingestionJobs).toHaveLength(0);
    expect(queue.initialPacketJobs).toEqual([{ productId: '1', userId: '1' }]);
  });

  it("D-0142: backfills the initial-packet placeholder's empty device_ids once a later packet on the same token resolves a real device", async () => {
    const { service, state } = buildService({
      preferences: {},
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'f7c4' }],
    });
    state.rawPackets.set('placeholder-1', {
      id: 'placeholder-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: null,
      deviceIds: [],
      token: TOKEN,
      packetHash: null,
    });

    // First packet: fills the placeholder's json_body, still no preferences configured — matches
    // the frontend's real repro (packet `id:3`, `device_ids: []` forever, before this fix).
    const initial = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'f7c4' } });
    expect(initial).toEqual({ kind: 'initial_packet', productId: '1', userId: '1' });
    expect(state.rawPackets.get('placeholder-1')?.deviceIds).toEqual([]);

    // Unique-identifier preference gets configured sometime after (the user hits "mark as unique
    // identifier"), then the next packet arrives — a normal `accepted` flow.
    const { service: service2, state: state2 } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'f7c4' }],
    });
    const placeholderRow = state.rawPackets.get('placeholder-1');
    if (!placeholderRow) throw new Error('expected placeholder row to exist');
    state2.rawPackets.set('placeholder-1', placeholderRow);

    const second = await service2.ingestHttpPacket(TOKEN, {
      deviceInfo: { uid: 'f7c4' },
      temp: 22,
    });

    expect(second.kind).toBe('accepted');
    // The OLD placeholder row (not the new one just created) is backfilled in place.
    expect(state2.rawPackets.get('placeholder-1')?.deviceIds).toEqual(['f7c4']);
  });

  it("D-0142 (regression): backfills the placeholder from ITS OWN body, not the triggering packet's device, when two devices share one token", async () => {
    // Repro: product 2's shared webhook token sees dev2-beta's Initial Packet first (placeholder,
    // device_ids: []), then f7c4's packet later on the SAME token. The placeholder must be backfilled
    // as dev2-beta's own device -- not f7c4's, just because f7c4's packet happened to trigger the check.
    const { service, state } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [
        { id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev2-beta' },
        { id: '2', productId: '1', userId: '1', deviceUniqueIdentifier: 'f7c4' },
      ],
    });
    state.rawPackets.set('placeholder-1', {
      id: 'placeholder-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { deviceInfo: { uid: 'dev2-beta' } },
      deviceIds: [],
      token: TOKEN,
      packetHash: 'hash-0',
    });

    const result = await service.ingestHttpPacket(TOKEN, { deviceInfo: { uid: 'f7c4' }, temp: 22 });

    expect(result.kind).toBe('accepted');
    // The placeholder re-resolves from its OWN body (dev2-beta), never inherits f7c4 from the
    // triggering packet. The new row created for THIS packet correctly gets f7c4.
    expect(state.rawPackets.get('placeholder-1')?.deviceIds).toEqual(['dev2-beta']);
    if (result.kind !== 'accepted') throw new Error('expected accepted');
    expect(state.rawPackets.get(result.rawPacketId)?.deviceIds).toEqual(['f7c4']);
  });

  it('accepts a normal packet: persists it and enqueues an ingestion job', async () => {
    const { service, state, queue } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });

    const result = await service.ingestHttpPacket(TOKEN, {
      deviceInfo: { uid: 'dev-1' },
      temp: 21.5,
    });

    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted') throw new Error('expected accepted');
    expect(state.rawPackets.get(result.rawPacketId)?.deviceIds).toEqual(['dev-1']);
    expect(queue.ingestionJobs).toEqual([{ rawPacketId: result.rawPacketId }]);
  });

  it('11.31: a second identical packet within the dedup window is reported as a duplicate, not persisted again', async () => {
    const { service, state } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });
    const body = { deviceInfo: { uid: 'dev-1' }, temp: 21.5 };

    const first = await service.ingestHttpPacket(TOKEN, body);
    expect(first.kind).toBe('accepted');

    const second = await service.ingestHttpPacket(TOKEN, body);
    expect(second.kind).toBe('duplicate');

    expect(state.rawPackets.size).toBe(1);
  });
});

describe('IngestionService.ingestMqttPacket (MqttService::handleDeviceData equivalent)', () => {
  it("returns device_not_found and never reaches the dedup/persist path when the device doesn't resolve", async () => {
    const { service, state } = buildService({ devices: [] });

    const result = await service.ingestMqttPacket('unknown-dev', { temp: 1 });

    expect(result).toEqual({ kind: 'device_not_found' });
    expect(state.rawPackets.size).toBe(0);
  });

  it("fails loudly (not a magic-number fallback) when no 'MQTT' protocol row exists", async () => {
    const { service } = buildService({
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
      protocols: [],
    });

    const result = await service.ingestMqttPacket('dev-1', { temp: 1 });

    expect(result).toEqual({ kind: 'invalid_token' });
  });

  it('resolves product/user from the device row (no token) and accepts the packet', async () => {
    const { service, queue } = buildService({
      preferences: PREFS_WITH_UID,
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
      protocols: [{ id: '2', name: 'MQTT' }],
    });

    const result = await service.ingestMqttPacket('dev-1', { deviceInfo: { uid: 'dev-1' } });

    expect(result.kind).toBe('accepted');
    expect(queue.ingestionJobs).toHaveLength(1);
  });
});

describe('IngestionService.updateDeviceStatusFromMqtt (handleDeviceStatus equivalent)', () => {
  it("updates the device's status when found", async () => {
    const { service, devicesLookup } = buildService({
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });

    await service.updateDeviceStatusFromMqtt('dev-1', 'inactive');

    expect(devicesLookup.statusUpdates).toEqual([{ identifier: 'dev-1', status: 'inactive' }]);
  });

  it("is silent (no throw) when the device doesn't exist", async () => {
    const { service } = buildService({ devices: [] });

    await expect(
      service.updateDeviceStatusFromMqtt('unknown', 'inactive')
    ).resolves.toBeUndefined();
  });
});

describe('IngestionService.processIngestionJob (the async worker — PayloadMapper clean + DeviceValue + position)', () => {
  it('writes a cleaned DeviceValue and enqueues rule-actions/realtime jobs', async () => {
    const { service, state, queue } = buildService({
      preferences: {
        '1': [
          {
            attributeKey: 'temp',
            label: 'Temperature',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      },
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });
    state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { temp: 21.5, unrelated: 'x' },
      deviceIds: ['dev-1'],
      token: TOKEN,
      packetHash: 'hash',
    });

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.deviceValues).toEqual([
      { deviceId: '1', deviceUniqueIdentifier: 'dev-1', values: { temp: 21.5 } },
    ]);
    expect(queue.ruleActionsJobs).toHaveLength(1);
    expect(queue.ruleActionsJobs[0]?.flattenedPacket).toEqual({ temp: 21.5, unrelated: 'x' });
    expect(queue.realtimeJobs).toHaveLength(1);
  });

  function positionPacketService(
    preferences: Record<string, unknown>[],
    body: Record<string, unknown>
  ) {
    const built = buildService({
      preferences: { '1': preferences as never },
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });
    built.state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: body,
      deviceIds: ['dev-1'],
      token: TOKEN,
      packetHash: 'hash',
    });
    return built;
  }

  it('D-0154: extracts a DevicePosition row from the attributes carrying the latitude/longitude ROLES (numeric)', async () => {
    const { service, state } = positionPacketService(
      [
        {
          attributeKey: 'gps.lat',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'latitude',
        },
        {
          attributeKey: 'gps.lng',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'longitude',
        },
      ],
      { gps: { lat: 40.7128, lng: -74.006 } }
    );

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.devicePositions).toEqual([
      {
        deviceId: '1',
        latitude: 40.7128,
        longitude: -74.006,
        speed: undefined,
        heading: undefined,
      },
    ]);
  });

  it('D-0161: the detector is handed the rest of the position (speed, heading, server-now recordedAt) so it can broadcast fleet:position', async () => {
    const built = positionPacketService(
      [
        {
          attributeKey: 'lat',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'latitude',
        },
        {
          attributeKey: 'lng',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'longitude',
        },
        {
          attributeKey: 'spd',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'speed',
        },
      ],
      { lat: 31.5, lng: 74.3, spd: 12 }
    );
    const before = Date.now();

    await built.service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(built.geofencesLookup.calls).toHaveLength(1);
    const call = built.geofencesLookup.calls[0];
    expect(call).toMatchObject({
      latitude: 31.5,
      longitude: 74.3,
      position: { speed: 12, heading: null },
    });
    expect(call?.position?.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('D-0154: speed and heading roles are read too; numeric strings are accepted', async () => {
    const { service, state } = positionPacketService(
      [
        {
          attributeKey: 'lat',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'latitude',
        },
        {
          attributeKey: 'lng',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'longitude',
        },
        {
          attributeKey: 'spd',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'speed',
        },
        {
          attributeKey: 'hdg',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'heading',
        },
      ],
      { lat: '31.5', lng: '74.3', spd: 55.5, hdg: 270 }
    );

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.devicePositions).toEqual([
      { deviceId: '1', latitude: 31.5, longitude: 74.3, speed: 55.5, heading: 270 },
    ]);
  });

  it('D-0154: the LABEL alone no longer identifies a coordinate (role-only) — labelled Latitude/Longitude without roles stores nothing', async () => {
    const { service, state } = positionPacketService(
      [
        {
          attributeKey: 'gps.lat',
          label: 'Latitude',
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
        },
        {
          attributeKey: 'gps.lng',
          label: 'Longitude',
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
        },
      ],
      { gps: { lat: 40.7128, lng: -74.006 } }
    );

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.devicePositions).toHaveLength(0);
  });

  it('D-0154: a position needs BOTH latitude and longitude roles — one alone stores nothing', async () => {
    const { service, state } = positionPacketService(
      [
        {
          attributeKey: 'gps.lat',
          label: null,
          unit: null,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: 'latitude',
        },
      ],
      { gps: { lat: 40.7128, lng: -74.006 } }
    );

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.devicePositions).toHaveLength(0);
  });

  it("does not write a position row when lat/lng preferences aren't configured or aren't numeric", async () => {
    const { service, state } = buildService({
      preferences: {
        '1': [
          {
            attributeKey: 'temp',
            label: 'Temperature',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      },
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });
    state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { temp: 21.5 },
      deviceIds: ['dev-1'],
      token: TOKEN,
      packetHash: 'hash',
    });

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.devicePositions).toHaveLength(0);
  });

  it("D-0142: resolves the device scoped to the packet's own product, not the first cross-product match", async () => {
    // Same `device_unique_identifier` under two different products — "f7c4" collision repro.
    const { service, state, queue } = buildService({
      products: [
        { id: '1', companyId: '1', deviceProtocolId: null },
        { id: '2', companyId: '1', deviceProtocolId: null },
      ],
      preferences: {
        '2': [
          {
            attributeKey: 'temp',
            label: 'Temperature',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      },
      devices: [
        { id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'f7c4' },
        { id: '2', productId: '2', userId: '1', deviceUniqueIdentifier: 'f7c4' },
      ],
    });
    state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '2',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { temp: 21.5, deviceInfo: { devEui: 'f7c4' } },
      deviceIds: ['f7c4'],
      token: TOKEN,
      packetHash: 'hash',
    });

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.deviceValues).toEqual([
      { deviceId: '2', deviceUniqueIdentifier: 'f7c4', values: { temp: 21.5 } },
    ]);
    expect(queue.ruleActionsJobs[0]?.deviceId).toBe('2');
    expect(queue.realtimeJobs[0]?.deviceId).toBe('2');
  });

  it('D-0142: logs and drops the job (no misattribution) when the product has no device with that identifier', async () => {
    const { service, state, queue } = buildService({
      products: [
        { id: '1', companyId: '1', deviceProtocolId: null },
        { id: '2', companyId: '1', deviceProtocolId: null },
      ],
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'f7c4' }],
    });
    state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '2',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { temp: 21.5 },
      deviceIds: ['f7c4'],
      token: TOKEN,
      packetHash: 'hash',
    });

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(state.deviceValues).toHaveLength(0);
    expect(queue.ruleActionsJobs).toHaveLength(0);
  });
});

describe('IngestionService.processIngestionJob -> dashboard/building live updates (D-0139)', () => {
  function base() {
    return {
      preferences: {
        '1': [
          {
            attributeKey: 'temp',
            label: 'Temperature',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      },
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    };
  }

  function seedPacket(state: ReturnType<typeof buildService>['state']) {
    state.rawPackets.set('packet-1', {
      id: 'packet-1',
      productId: '1',
      protocolId: '1',
      deviceProtocolId: null,
      userId: '1',
      jsonBody: { temp: 99 },
      deviceIds: ['dev-1'],
      token: TOKEN,
      packetHash: 'hash',
    });
  }

  it('groups a matched widget under its dashboard, evaluates its rule, and enqueues one job per dashboard', async () => {
    const { service, state, queue } = buildService({
      ...base(),
      widgetSettings: [
        { widgetId: 'w1', dashboardId: 'd1', ruleId: 'r1', attributeKey: 'temp', product: '1' },
      ],
      widgetRules: {
        r1: [
          { selectedAttribute: 'temp', selectedCondition: 'greater_than', conditionValue: '50' },
        ],
      },
    });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.dashboardUpdateJobs).toEqual([
      {
        userId: '1',
        dashboardId: 'd1',
        widgets: [
          {
            widgetId: 'w1',
            values: [{ attribute_name: 'temp', attribute_value: 99, is_alert: 1 }],
          },
        ],
      },
    ]);
  });

  it("is_alert is 0 when the widget has no active/applicable rule (`widgetRule()`'s empty case)", async () => {
    const { service, state, queue } = buildService({
      ...base(),
      widgetSettings: [
        { widgetId: 'w1', dashboardId: 'd1', ruleId: 'r1', attributeKey: 'temp', product: '1' },
      ],
      widgetRules: {},
    });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.dashboardUpdateJobs[0]?.widgets[0]?.values[0]?.is_alert).toBe(0);
  });

  it("skips a widget_setting whose attribute isn't present in the latest device value", async () => {
    const { service, state, queue } = buildService({
      ...base(),
      widgetSettings: [
        { widgetId: 'w1', dashboardId: 'd1', ruleId: 'r1', attributeKey: 'humidity', product: '1' },
      ],
    });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.dashboardUpdateJobs).toHaveLength(0);
  });

  it("skips a widget_setting with no dashboard_id, matching Laravel's `?? null` fallthrough", async () => {
    const { service, state, queue } = buildService({
      ...base(),
      widgetSettings: [
        { widgetId: 'w1', dashboardId: null, ruleId: 'r1', attributeKey: 'temp', product: '1' },
      ],
    });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.dashboardUpdateJobs).toHaveLength(0);
  });

  it('no widget_settings for the device -> no dashboard job, no crash', async () => {
    const { service, state, queue } = buildService({ ...base(), widgetSettings: [] });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.dashboardUpdateJobs).toHaveLength(0);
    expect(queue.realtimeJobs).toHaveLength(1); // the rest of the pipeline still ran
  });

  it('a device linked to an asset component enqueues one building-update job with the formatted asset', async () => {
    const asset = {
      id: '77',
      name: 'HQ',
      children: [{ id: '1', is_alert: true, alert_attributes: ['temp'] }],
    };
    const { service, state, queue } = buildService({
      ...base(),
      assetIdByDeviceId: { '1': '77' },
      assetsById: { '77': asset },
    });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.buildingUpdateJobs).toEqual([
      { userId: '1', buildingId: '77', deviceId: '1', deviceIdentifier: 'dev-1', asset },
    ]);
  });

  it('a device with no linked asset component enqueues no building-update job', async () => {
    const { service, state, queue } = buildService({ ...base() });
    seedPacket(state);

    await service.processIngestionJob({ rawPacketId: 'packet-1' });

    expect(queue.buildingUpdateJobs).toHaveLength(0);
  });

  it('a lookup failure is caught and logged — packet ingestion itself must not fail', async () => {
    const { service, state, queue } = buildService({
      ...base(),
      widgetsLookup: {
        listWidgetSettingsForDevice: () => Promise.reject(new Error('boom')),
        findWidgetRuleConditions: () => Promise.resolve(undefined),
      },
    });
    seedPacket(state);

    await expect(service.processIngestionJob({ rawPacketId: 'packet-1' })).resolves.toBeUndefined();

    expect(queue.realtimeJobs).toHaveLength(1); // the durable half of the pipeline still completed
    expect(queue.dashboardUpdateJobs).toHaveLength(0);
  });
});
