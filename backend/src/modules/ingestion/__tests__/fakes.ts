import type { IngestionRepository } from '../ingestion.repository.js';
import type { IngestionQueuePort } from '../ingestion.service.js';
import type {
  IngestionAssetsLookup,
  IngestionDevicesLookup,
  IngestionGeofencesLookup,
  IngestionProductsLookup,
  IngestionProtocolsLookup,
  IngestionWidgetsLookup,
} from '../lookups.js';
import type { CreateRawPacketInput, RawPacket } from '../ingestion.types.js';
import type {
  BuildingUpdateJobData,
  DashboardUpdateJobData,
  IngestionJobData,
  InitialPacketJobData,
  RealtimeJobData,
  RuleActionsJobData,
} from '../ingestion.jobs.js';
import type { RuleCondition } from '../../../shared/utils/rule-condition-evaluator.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  rawPackets: Map<string, RawPacket>;
  deviceValues: {
    deviceId: string;
    deviceUniqueIdentifier: string;
    values: Record<string, unknown>;
  }[];
  devicePositions: {
    deviceId: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
  }[];
  enqueuedIngestion: IngestionJobData[];
  enqueuedRuleActions: RuleActionsJobData[];
  enqueuedRealtime: RealtimeJobData[];
}

/** In-memory stand-in for `IngestionRepository` — module 2.4's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeIngestionRepository(seedTokens: string[] = []): {
  repository: IngestionRepository;
  state: FakeState;
} {
  const state: FakeState = {
    rawPackets: new Map(),
    deviceValues: [],
    devicePositions: [],
    enqueuedIngestion: [],
    enqueuedRuleActions: [],
    enqueuedRealtime: [],
  };
  const tokens = new Set(seedTokens);

  const repo = {
    tokenExists: (token: string) => Promise.resolve(tokens.has(token)),

    findRecentByHash: (packetHash: string, _sinceMinutesAgo: number) =>
      Promise.resolve([...state.rawPackets.values()].find(p => p.packetHash === packetHash)),

    findLegacyPlaceholder: (
      productId: string,
      protocolId: string,
      userId: string,
      token: string | undefined
    ) =>
      Promise.resolve(
        [...state.rawPackets.values()].find(
          p =>
            p.productId === productId &&
            p.protocolId === protocolId &&
            p.userId === userId &&
            (token === undefined || p.token === token) &&
            (p.jsonBody === null || p.jsonBody === undefined)
        )
      ),

    updatePlaceholder: (
      id: string,
      jsonBody: Record<string, unknown>,
      packetHash: string,
      deviceIds: string[]
    ) => {
      const existing = state.rawPackets.get(id);
      if (existing) state.rawPackets.set(id, { ...existing, jsonBody, packetHash, deviceIds });
      return Promise.resolve();
    },

    create: (input: CreateRawPacketInput) => {
      const packet: RawPacket = {
        id: newId(),
        productId: input.productId,
        protocolId: input.protocolId,
        deviceProtocolId: input.deviceProtocolId,
        userId: input.userId,
        jsonBody: input.jsonBody,
        deviceIds: input.deviceIds,
        token: input.token ?? null,
        packetHash: input.packetHash,
      };
      state.rawPackets.set(packet.id, packet);
      return Promise.resolve(packet);
    },

    findById: (id: string) => Promise.resolve(state.rawPackets.get(id)),

    createDeviceValue: (
      deviceId: string,
      deviceUniqueIdentifier: string,
      values: Record<string, unknown>
    ) => {
      state.deviceValues.push({ deviceId, deviceUniqueIdentifier, values });
      return Promise.resolve();
    },

    findLatestDeviceValueByUniqueIdentifier: (deviceUniqueIdentifier: string) =>
      Promise.resolve(
        [...state.deviceValues]
          .reverse()
          .find(v => v.deviceUniqueIdentifier === deviceUniqueIdentifier)?.values
      ),

    createDevicePosition: (
      deviceId: string,
      latitude: number,
      longitude: number,
      speed?: number,
      heading?: number
    ) => {
      state.devicePositions.push({
        deviceId,
        latitude,
        longitude,
        ...(speed !== undefined ? { speed } : {}),
        ...(heading !== undefined ? { heading } : {}),
      });
      return Promise.resolve();
    },

    findPlaceholdersNeedingDeviceIdBackfill: (
      productId: string,
      protocolId: string,
      userId: string,
      token: string
    ) =>
      Promise.resolve(
        [...state.rawPackets.values()]
          .filter(
            p =>
              p.productId === productId &&
              p.protocolId === protocolId &&
              p.userId === userId &&
              p.token === token &&
              Array.isArray(p.deviceIds) &&
              p.deviceIds.length === 0
          )
          .map(p => ({ id: p.id, jsonBody: p.jsonBody as Record<string, unknown> | null }))
      ),

    updatePlaceholderDeviceIdsById: (id: string, deviceIds: string[]) => {
      const existing = state.rawPackets.get(id);
      if (existing) state.rawPackets.set(id, { ...existing, deviceIds });
      return Promise.resolve();
    },
  };

  return { repository: repo as unknown as IngestionRepository, state };
}

export function fakeProductsLookup(
  products: { id: string; companyId: string; deviceProtocolId: string | null }[] = [],
  preferences: Record<
    string,
    {
      attributeKey: string | null;
      label: string | null;
      unit: string | null;
      isSelected: boolean;
      isUniqueIdentifier: boolean;
      /** D-0154 — defaults to no role. */
      attributeRole?: 'latitude' | 'longitude' | 'speed' | 'heading' | null;
    }[]
  > = {}
): IngestionProductsLookup {
  return {
    findByIdUnscoped: (id: string) => Promise.resolve(products.find(p => p.id === id)),
    listPreferencesForProduct: (productId: string) =>
      Promise.resolve(
        (preferences[productId] ?? []).map(p => ({ ...p, attributeRole: p.attributeRole ?? null }))
      ),
  };
}

export function fakeDevicesLookup(
  devices: { id: string; productId: string; userId: string; deviceUniqueIdentifier: string }[] = []
): IngestionDevicesLookup & { statusUpdates: { identifier: string; status: string }[] } {
  const statusUpdates: { identifier: string; status: string }[] = [];
  return {
    findByUniqueIdentifier: (identifier: string) =>
      Promise.resolve(devices.find(d => d.deviceUniqueIdentifier === identifier)),
    findByUniqueIdentifierForProduct: (productId: string, identifier: string) =>
      Promise.resolve(
        devices.find(d => d.deviceUniqueIdentifier === identifier && d.productId === productId)
      ),
    updateStatusByUniqueIdentifier: (identifier: string, status: string) => {
      const found = devices.some(d => d.deviceUniqueIdentifier === identifier);
      if (found) statusUpdates.push({ identifier, status });
      return Promise.resolve(found);
    },
    statusUpdates,
  };
}

export function fakeProtocolsLookup(
  protocols: { id: string; name: string }[] = []
): IngestionProtocolsLookup {
  return {
    findByName: (name: string) => Promise.resolve(protocols.find(p => p.name === name)),
  };
}

export function fakeWidgetsLookup(
  settings: {
    widgetId: string;
    dashboardId: string | null;
    ruleId: string;
    attributeKey: string;
    product: string | null;
  }[] = [],
  rules: Record<string, RuleCondition[]> = {}
): IngestionWidgetsLookup {
  return {
    listWidgetSettingsForDevice: (_deviceId: string) => Promise.resolve(settings),
    findWidgetRuleConditions: (ruleId: string) => Promise.resolve(rules[ruleId]),
  };
}

export function fakeAssetsLookup(
  assetIdByDeviceId: Record<string, string> = {},
  assetsById: Record<string, Record<string, unknown>> = {}
): IngestionAssetsLookup {
  return {
    findAssetIdForDevice: (deviceId: string) => Promise.resolve(assetIdByDeviceId[deviceId]),
    getAssetWithAlerts: (assetId: string) => {
      const asset = assetsById[assetId];
      return Promise.resolve(asset ? { asset } : undefined);
    },
  };
}

export function fakeGeofencesLookup(): IngestionGeofencesLookup & {
  calls: {
    companyId: string;
    deviceId: string;
    latitude: number;
    longitude: number;
    position?: { speed: number | null; heading: number | null; recordedAt: Date } | undefined;
  }[];
} {
  const calls: {
    companyId: string;
    deviceId: string;
    latitude: number;
    longitude: number;
    position?: { speed: number | null; heading: number | null; recordedAt: Date } | undefined;
  }[] = [];
  return {
    checkPosition: (companyId, deviceId, latitude, longitude, position) => {
      calls.push({ companyId, deviceId, latitude, longitude, position });
      return Promise.resolve();
    },
    calls,
  };
}

export function fakeQueuePort(): IngestionQueuePort & {
  ingestionJobs: IngestionJobData[];
  ruleActionsJobs: RuleActionsJobData[];
  realtimeJobs: RealtimeJobData[];
  initialPacketJobs: InitialPacketJobData[];
  dashboardUpdateJobs: DashboardUpdateJobData[];
  buildingUpdateJobs: BuildingUpdateJobData[];
} {
  const ingestionJobs: IngestionJobData[] = [];
  const ruleActionsJobs: RuleActionsJobData[] = [];
  const realtimeJobs: RealtimeJobData[] = [];
  const initialPacketJobs: InitialPacketJobData[] = [];
  const dashboardUpdateJobs: DashboardUpdateJobData[] = [];
  const buildingUpdateJobs: BuildingUpdateJobData[] = [];
  return {
    enqueueIngestion: data => {
      ingestionJobs.push(data);
      return Promise.resolve();
    },
    enqueueRuleActions: data => {
      ruleActionsJobs.push(data);
      return Promise.resolve();
    },
    enqueueRealtime: data => {
      realtimeJobs.push(data);
      return Promise.resolve();
    },
    enqueueDashboardUpdate: data => {
      dashboardUpdateJobs.push(data);
      return Promise.resolve();
    },
    enqueueBuildingUpdate: data => {
      buildingUpdateJobs.push(data);
      return Promise.resolve();
    },
    enqueueInitialPacket: data => {
      initialPacketJobs.push(data);
      return Promise.resolve();
    },
    ingestionJobs,
    ruleActionsJobs,
    initialPacketJobs,
    realtimeJobs,
    dashboardUpdateJobs,
    buildingUpdateJobs,
  };
}
