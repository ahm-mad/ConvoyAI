import type { Profile } from '../../users/users.types.js';
import type { DevicesRepository } from '../devices.repository.js';
import type { ProductsLookup } from '../products-lookup.js';
import type {
  CreateDeviceInput,
  Device,
  ListProductsWithDevicesQuery,
  ProductWithDevices,
  UpdateDeviceInput,
  UserDevice,
} from '../devices.types.js';

const FAKE_OWNER: Profile = {
  id: '1',
  firstName: 'Fake',
  lastName: 'Owner',
  email: 'fake-owner@example.com',
  number: '0000000000',
  timezone: 'UTC',
  profileImage: null,
  companyId: '1',
  companyDomain: null,
  status: 'active',
  emailVerifiedAt: null,
  socialProvider: null,
  socialProviderId: null,
  createdAt: null,
  updatedAt: null,
  stripeId: null,
  pmType: null,
  pmLastFour: null,
  trialEndsAt: null,
};

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  devices: Map<string, Device & { productCompanyId: string }>;
  userDevices: Map<string, UserDevice>;
  assignedDeviceIds: Set<string>;
  latestValues: Map<string, Record<string, unknown>>;
}

function isAuthorized(
  device: Device & { productCompanyId: string },
  userId: string,
  companyId: string
): boolean {
  return device.userId === userId || device.productCompanyId === companyId;
}

/** In-memory stand-in for `DevicesRepository` — module 2.3's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeDevicesRepository(
  seedDevices: (Device & { productCompanyId: string })[] = []
): {
  repository: DevicesRepository;
  state: FakeState;
} {
  const state: FakeState = {
    devices: new Map(seedDevices.map(d => [d.id, d])),
    userDevices: new Map(),
    assignedDeviceIds: new Set(),
    latestValues: new Map(),
  };

  const repo = {
    listProductsWithDevices: (_query: ListProductsWithDevicesQuery) =>
      Promise.resolve({ items: [] as ProductWithDevices[], total: 0 }),

    deviceUniqueIdentifierExists: (identifier: string, excludeId: string | undefined) =>
      Promise.resolve(
        [...state.devices.values()].some(
          d => d.deviceUniqueIdentifier === identifier && d.id !== excludeId
        )
      ),

    create: (input: CreateDeviceInput) => {
      const device: Device & { productCompanyId: string } = {
        id: newId(),
        deviceUniqueIdentifier: input.deviceUniqueIdentifier,
        name: input.name,
        type: input.type ?? null,
        status: input.status ?? 'active',
        location: input.location ?? '',
        tags: input.tags ?? '',
        productId: input.productId,
        userId: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastReportedAt: null,
        productCompanyId: '1',
      };
      state.devices.set(device.id, device);
      return Promise.resolve(device);
    },

    findAuthorized: (id: string, userId: string, companyId: string) => {
      const device = state.devices.get(id);
      if (!device || !isAuthorized(device, userId, companyId)) return Promise.resolve(undefined);
      return Promise.resolve(device);
    },

    update: (id: string, userId: string, companyId: string, input: UpdateDeviceInput) => {
      const device = state.devices.get(id);
      if (!device || !isAuthorized(device, userId, companyId)) return Promise.resolve(undefined);
      const updated = {
        ...device,
        ...(input.deviceUniqueIdentifier !== undefined
          ? { deviceUniqueIdentifier: input.deviceUniqueIdentifier }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      };
      state.devices.set(id, updated);
      return Promise.resolve(updated);
    },

    delete: (id: string, userId: string, companyId: string) => {
      const device = state.devices.get(id);
      if (!device || !isAuthorized(device, userId, companyId)) return Promise.resolve(false);
      state.devices.delete(id);
      return Promise.resolve(true);
    },

    setStatus: (id: string, userId: string, companyId: string, status: 'active' | 'inactive') => {
      const device = state.devices.get(id);
      if (!device || !isAuthorized(device, userId, companyId)) return Promise.resolve(undefined);
      const updated = { ...device, status };
      state.devices.set(id, updated);
      return Promise.resolve(updated);
    },

    bulkSetStatus: (
      ids: string[],
      userId: string,
      companyId: string,
      status: 'active' | 'inactive'
    ) => {
      let count = 0;
      for (const id of ids) {
        const device = state.devices.get(id);
        if (device && isAuthorized(device, userId, companyId)) {
          state.devices.set(id, { ...device, status });
          count += 1;
        }
      }
      return Promise.resolve(count);
    },

    bulkDelete: (ids: string[], userId: string, companyId: string) => {
      let count = 0;
      for (const id of ids) {
        const device = state.devices.get(id);
        if (device && isAuthorized(device, userId, companyId)) {
          state.devices.delete(id);
          count += 1;
        }
      }
      return Promise.resolve(count);
    },

    findManyAuthorized: (ids: string[], userId: string, companyId: string) =>
      Promise.resolve(
        ids
          .map(id => state.devices.get(id))
          .filter(
            (d): d is Device & { productCompanyId: string } =>
              d !== undefined && isAuthorized(d, userId, companyId)
          )
      ),

    existingDeviceIdCount: (ids: string[]) =>
      Promise.resolve(ids.filter(id => state.devices.has(id)).length),

    findByProductAuthorized: (productId: string, companyId: string) =>
      Promise.resolve(
        [...state.devices.values()]
          .filter(d => d.productId === productId && d.productCompanyId === companyId)
          .map(d => ({ ...d, user: FAKE_OWNER, latestDeviceValue: null }))
      ),

    assignedDeviceIds: () => Promise.resolve([...state.assignedDeviceIds]),

    latestDeviceValueTimestamp: (_deviceUniqueIdentifier: string) => Promise.resolve(null),

    findLatestValuesForDevice: (deviceUniqueIdentifier: string) =>
      Promise.resolve(state.latestValues.get(deviceUniqueIdentifier) ?? {}),

    listUserDevices: (userId: string) =>
      Promise.resolve([...state.userDevices.values()].filter(d => d.userId === userId)),
  };

  return { repository: repo as unknown as DevicesRepository, state };
}

export function fakeProductsLookup(
  products: { id: string; companyId: string }[] = [],
  preferences: Record<
    string,
    {
      id?: string;
      attributeKey: string | null;
      label: string | null;
      unit: string | null;
      isSelected: boolean;
      isUniqueIdentifier: boolean;
    }[]
  > = {}
): ProductsLookup {
  return {
    findById: (id: string) => Promise.resolve(products.find(p => p.id === id)),
    listPreferencesForProduct: (productId: string) =>
      Promise.resolve(
        (preferences[productId] ?? []).map((p, index) => ({ ...p, id: p.id ?? String(index + 1) }))
      ),
  };
}
