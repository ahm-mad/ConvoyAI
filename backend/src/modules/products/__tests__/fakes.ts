import type { Profile } from '../../users/users.types.js';
import type { ProductsRepository } from '../products.repository.js';
import type { ProductsProtocolsLookup } from '../products.service.js';
import type {
  CreateDeviceInput,
  CreateTemplateInput,
  PreconfigureTemplate,
  Product,
  AttributeRole,
  ProductAttributePreference,
  ProductAttributePreferenceSummary,
  ProductDevice,
  ProductDeviceDetail,
} from '../products.types.js';

let nextId = 1;
const newId = () => String(nextId++);

const FAKE_DEVICE_OWNER: Profile = {
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

/** `exactOptionalPropertyTypes` needs `label`/`unit` omitted, not set to `undefined`, when absent. */
function toTemplateFieldRow(f: {
  attributeKey: string;
  label: string | undefined;
  unit: string | undefined;
}): {
  attribute_key: string;
  label?: string;
  unit?: string;
} {
  return {
    attribute_key: f.attributeKey,
    ...(f.label !== undefined ? { label: f.label } : {}),
    ...(f.unit !== undefined ? { unit: f.unit } : {}),
  };
}

interface TemplateSeed {
  template: PreconfigureTemplate;
  fields: { attribute_key: string; label?: string; unit?: string }[];
}

interface FakeState {
  products: Map<string, Product>;
  devices: Map<string, ProductDevice[]>;
  preferences: Map<string, ProductAttributePreference>;
  templates: Map<string, TemplateSeed>;
  /** Every call to `ensureRuleAndWidget`, in order — lets tests assert it always runs (D-0048). */
  ensureRuleAndWidgetCalls: {
    productId: string;
    attributeKey: string;
    widgetType: string | undefined;
  }[];
  /** Preference ids that already have a `product_attribute_preference_settings` row — mirrors the real repository's create-vs-update branch in `upsertPreferenceSetting`. */
  preferenceSettingsCreated: Set<string>;
  /** Ingestion tokens ever issued (mirrors `raw_packet_values` rows) — `jsonBody` tracks whether a real packet has consumed the row, for `findIngestionToken`'s "prefer a consumed row" rule. */
  tokens: {
    id: string;
    productId: string;
    protocolId: string;
    userId: string;
    token: string;
    jsonBody: unknown;
  }[];
}

/** In-memory stand-in for `ProductsRepository` — module 2.1's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeProductsRepository(
  seedProducts: Product[] = [],
  seedPreferences: ProductAttributePreference[] = []
): { repository: ProductsRepository; state: FakeState } {
  const state: FakeState = {
    products: new Map(seedProducts.map(p => [p.id, p])),
    devices: new Map(),
    preferences: new Map(seedPreferences.map(p => [p.id, p])),
    templates: new Map(),
    ensureRuleAndWidgetCalls: [],
    preferenceSettingsCreated: new Set(),
    tokens: [],
  };

  const repo = {
    list: (query: {
      search?: string | undefined;
      page: number;
      perPage: number;
      userId?: string | undefined;
    }) => {
      let items = [...state.products.values()];
      if (query.search) {
        const search = query.search.toLowerCase();
        items = items.filter(p => p.name.toLowerCase().includes(search));
      }
      if (query.userId !== undefined) {
        items = items.filter(p => p.createdBy === query.userId);
      }
      const total = items.length;
      const start = (query.page - 1) * query.perPage;
      const page = items.slice(start, start + query.perPage);
      return Promise.resolve({
        items: page,
        pagination: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      });
    },

    findById: (id: string) => Promise.resolve(state.products.get(id)),
    findByIdRaw: (id: string) => {
      const product = state.products.get(id);
      if (!product) return Promise.resolve(null);
      return Promise.resolve({
        id: BigInt(product.id),
        name: product.name,
        created_by: BigInt(product.createdBy),
      } as never);
    },

    create: (input: {
      name: string;
      deviceProtocolId: string | undefined;
      preconfigureTemplateId: string | undefined;
      createdBy: string;
    }) => {
      const id = newId();
      const product: Product = {
        id,
        name: input.name,
        status: 'active',
        companyId: '1',
        createdBy: input.createdBy,
        deviceProtocolId: input.deviceProtocolId ?? null,
        preconfigureTemplateId: input.preconfigureTemplateId ?? null,
        devicesCount: 0,
        attributePreferencesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.products.set(id, product);
      return Promise.resolve(product);
    },

    createDevices: (productId: string, userId: string, devices: CreateDeviceInput[]) => {
      const created = devices.map(device => ({
        id: newId(),
        deviceUniqueIdentifier: device.deviceUniqueIdentifier,
        name: device.name,
        type: null,
        status: 'active',
        location: device.location,
        tags: '',
        productId,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      state.devices.set(productId, [...(state.devices.get(productId) ?? []), ...created]);
      const product = state.products.get(productId);
      if (product) product.devicesCount += created.length;
      return Promise.resolve(created);
    },

    findExistingDeviceIdentifiers: (identifiers: string[]) => {
      const all = new Set<string>();
      for (const rows of state.devices.values()) {
        for (const row of rows) all.add(row.deviceUniqueIdentifier);
      }
      return Promise.resolve(new Set(identifiers.filter(id => all.has(id))));
    },

    findDevicesForProduct: (productId: string, _params: unknown) => {
      const items: ProductDeviceDetail[] = (state.devices.get(productId) ?? []).map(device => ({
        ...device,
        user: FAKE_DEVICE_OWNER,
        latestDeviceValue: null,
      }));
      return Promise.resolve({ items, total: items.length });
    },

    findPreferenceById: (id: string) => Promise.resolve(state.preferences.get(id)),

    listOwnPreferencesForSettingsCheck: (productId: string, userId: string) =>
      Promise.resolve(
        [...state.preferences.values()]
          .filter(p => p.productId === productId && p.userId === userId)
          .map(p => ({
            id: p.id,
            attributeKey: p.attributeKey,
            isSelected: p.isSelected,
            isUniqueIdentifier: p.isUniqueIdentifier,
            hasSettings: p.ruleId !== null,
          }))
      ),

    listPreferencesForProduct: (productId: string) => {
      const summaries: ProductAttributePreferenceSummary[] = [...state.preferences.values()]
        .filter(p => p.productId === productId)
        .map(p => ({
          id: p.id,
          label: p.label,
          unit: p.unit,
          attributeKey: p.attributeKey,
          isSelected: p.isSelected,
          isUniqueIdentifier: p.isUniqueIdentifier,
          attributeRole: p.attributeRole,
        }));
      return Promise.resolve(summaries);
    },

    upsertPreference: (productId: string, userId: string, attributeKey: string) => {
      const existing = [...state.preferences.values()].find(
        p => p.productId === productId && p.userId === userId && p.attributeKey === attributeKey
      );
      if (existing) {
        existing.isSelected = true;
        return Promise.resolve(existing);
      }
      const preference: ProductAttributePreference = {
        id: newId(),
        productId,
        userId,
        attributeKey,
        isSelected: true,
        isUniqueIdentifier: false,
        attributeRole: null,
        label: null,
        unit: null,
        ruleId: null,
        widgetId: null,
      };
      state.preferences.set(preference.id, preference);
      return Promise.resolve(preference);
    },

    updatePreferenceFields: (
      id: string,
      fields: { productId?: string | undefined; attributeKey?: string | undefined }
    ) => {
      const existing = state.preferences.get(id);
      if (!existing) return Promise.resolve();
      if (fields.productId !== undefined) existing.productId = fields.productId;
      if (fields.attributeKey !== undefined) existing.attributeKey = fields.attributeKey;
      return Promise.resolve();
    },

    setPreferenceSelected: (id: string, isSelected: boolean) => {
      const existing = state.preferences.get(id);
      if (existing) existing.isSelected = isSelected;
      return Promise.resolve();
    },

    deletePreference: (id: string) => {
      const existing = state.preferences.get(id);
      state.preferences.delete(id);
      return Promise.resolve({
        ruleId: existing?.ruleId ?? null,
        widgetId: existing?.widgetId ?? null,
      });
    },

    /** D-0048: always returns real ids, regardless of widgetType/alertSettings being supplied — mirrors the repository's real fix for 11.45. */
    ensureRuleAndWidget: (params: {
      productId: string;
      attributeKey: string;
      widgetType: string | undefined;
      existingRuleId: string | undefined;
      existingWidgetId: string | undefined;
    }) => {
      state.ensureRuleAndWidgetCalls.push({
        productId: params.productId,
        attributeKey: params.attributeKey,
        widgetType: params.widgetType,
      });
      return Promise.resolve({
        ruleId: params.existingRuleId ?? newId(),
        widgetId: params.existingWidgetId ?? newId(),
      });
    },

    /** Mirrors the real repository's NOT-NULL enforcement: creating a settings row for the first time requires both ruleId and widgetId. */
    upsertPreferenceSetting: (
      preferenceId: string,
      fields: { label?: string; unit?: string | null; ruleId?: string; widgetId?: string }
    ) => {
      const existing = state.preferences.get(preferenceId);
      if (!existing) return Promise.resolve();
      if (
        !state.preferenceSettingsCreated.has(preferenceId) &&
        (fields.ruleId === undefined || fields.widgetId === undefined)
      ) {
        throw new Error(
          'upsertPreferenceSetting: ruleId/widgetId required to create a new settings row (NOT NULL columns)'
        );
      }
      if (fields.label !== undefined) existing.label = fields.label;
      if (fields.unit !== undefined) existing.unit = fields.unit;
      if (fields.ruleId !== undefined) existing.ruleId = fields.ruleId;
      if (fields.widgetId !== undefined) existing.widgetId = fields.widgetId;
      state.preferenceSettingsCreated.add(preferenceId);
      return Promise.resolve();
    },

    findTemplateConfiguration: (id: string) => {
      const seed = state.templates.get(id);
      return Promise.resolve(seed ? { fields: seed.fields } : undefined);
    },

    findTemplateById: (id: string, _companyId: string | undefined) => {
      const seed = state.templates.get(id);
      return Promise.resolve(seed?.template);
    },

    findRawPacketForProduct: (_productId: string) => Promise.resolve(undefined),
    findLatestTokenForProduct: (_productId: string) => Promise.resolve(undefined),
    findLatestRawPacketForUser: (_productId: string, _userId: string) => Promise.resolve(undefined),
    deviceExists: (_productId: string, _userId: string, _deviceUniqueIdentifier: string) =>
      Promise.resolve(false),
    updateProductName: (id: string, name: string) => {
      const product = state.products.get(id);
      if (product) product.name = name;
      return Promise.resolve();
    },
    touchUserPreferenceRow: (_productId: string, _userId: string) => Promise.resolve(),
    protocolExists: (_id: string) => Promise.resolve(true),

    update: (
      id: string,
      input: {
        name: string | undefined;
        preconfigureTemplateId: string | undefined;
        deviceProtocolId: string | null | undefined;
      }
    ) => {
      const existing = state.products.get(id);
      if (!existing) throw new Error('not found');
      const updated: Product = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.preconfigureTemplateId !== undefined
          ? { preconfigureTemplateId: input.preconfigureTemplateId }
          : {}),
        ...(input.deviceProtocolId !== undefined
          ? { deviceProtocolId: input.deviceProtocolId }
          : {}),
      };
      state.products.set(id, updated);
      return Promise.resolve(updated);
    },

    delete: (id: string) => {
      state.products.delete(id);
      return Promise.resolve();
    },

    bulkDelete: (ids: string[]) => {
      let count = 0;
      for (const id of ids) {
        if (state.products.delete(id)) count += 1;
      }
      return Promise.resolve(count);
    },

    findAllForCallersCompany: () => Promise.resolve([...state.products.values()]),

    createIngestionToken: (productId: string, protocolId: string, token: string) => {
      const row = { id: newId(), productId, protocolId, userId: '1', token, jsonBody: null };
      state.tokens.push(row);
      return Promise.resolve(row);
    },

    findIngestionToken: (productId: string, protocolId: string, userId: string) => {
      const matches = state.tokens.filter(
        t => t.productId === productId && t.protocolId === protocolId && t.userId === userId
      );
      const consumed = matches.find(t => t.jsonBody !== null);
      return Promise.resolve(consumed ?? matches[0]);
    },

    findPreferenceSettingsDetail: (id: string) => {
      const preference = state.preferences.get(id);
      if (!preference) return Promise.resolve(undefined);
      return Promise.resolve({
        preference: {
          id: preference.id,
          productId: preference.productId,
          userId: preference.userId,
          isUniqueIdentifier: preference.isUniqueIdentifier,
          attributeKey: preference.attributeKey,
          isSelected: preference.isSelected,
          createdAt: new Date('2026-08-19T13:36:02Z'),
          updatedAt: new Date('2026-08-19T13:36:02Z'),
        },
        setting: null,
        ruleConditions: null,
        ruleIsForAll: null,
        widgetType: null,
      });
    },

    markAsUniqueIdentifier: (productId: string, userId: string, attributeKey: string) => {
      for (const p of state.preferences.values()) {
        if (p.productId === productId) p.isUniqueIdentifier = false;
      }
      const existing = [...state.preferences.values()].find(
        p => p.productId === productId && p.attributeKey === attributeKey
      );
      if (existing) {
        existing.isUniqueIdentifier = true;
        existing.isSelected = true;
      } else {
        const preference: ProductAttributePreference = {
          id: newId(),
          productId,
          userId,
          attributeKey,
          isSelected: true,
          isUniqueIdentifier: true,
          attributeRole: null,
          label: null,
          unit: null,
          ruleId: null,
          widgetId: null,
        };
        state.preferences.set(preference.id, preference);
      }
      return Promise.resolve();
    },

    unmarkAsUniqueIdentifier: (productId: string, userId: string, attributeKey: string) => {
      const existing = [...state.preferences.values()].find(
        p =>
          p.productId === productId &&
          p.userId === userId &&
          p.attributeKey === attributeKey &&
          p.isUniqueIdentifier
      );
      if (!existing) return Promise.resolve(false);
      existing.isUniqueIdentifier = false;
      return Promise.resolve(true);
    },

    findPreferenceFlagsForKey: (productId: string, attributeKey: string) =>
      Promise.resolve(
        [...state.preferences.values()]
          .filter(p => p.productId === productId && p.attributeKey === attributeKey)
          .map(p => ({ isUniqueIdentifier: p.isUniqueIdentifier, attributeRole: p.attributeRole }))
      ),

    markRole: (productId: string, userId: string, attributeKey: string, role: AttributeRole) => {
      const holders = [...state.preferences.values()].filter(
        p => p.productId === productId && p.attributeRole === role
      );
      const own = [...state.preferences.values()].find(
        p =>
          p.productId === productId &&
          p.userId === userId &&
          p.attributeKey === attributeKey &&
          !p.isUniqueIdentifier
      );
      const others = holders.filter(h => h !== own);
      for (const other of others) other.attributeRole = null;
      if (own) {
        own.attributeRole = role;
        own.isSelected = true;
      } else {
        const preference: ProductAttributePreference = {
          id: newId(),
          productId,
          userId,
          attributeKey,
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: role,
          label: null,
          unit: null,
          ruleId: null,
          widgetId: null,
        };
        state.preferences.set(preference.id, preference);
      }
      return Promise.resolve({
        replacedAttributeKey:
          others.find(h => h.attributeKey !== attributeKey)?.attributeKey ?? null,
      });
    },

    unmarkRole: (productId: string, attributeKey: string) => {
      const rows = [...state.preferences.values()].filter(
        p =>
          p.productId === productId && p.attributeKey === attributeKey && p.attributeRole !== null
      );
      for (const row of rows) {
        row.attributeRole = null;
        if (!row.isUniqueIdentifier && row.ruleId === null) state.preferences.delete(row.id);
      }
      return Promise.resolve(rows.length > 0);
    },

    listTemplates: (params: {
      companyId: string | undefined;
      manufacturer: string | undefined;
      search: string | undefined;
      perPage: number;
    }) => {
      let items = [...state.templates.values()].map(t => t.template);
      items = items.filter(t => t.companyId === null || t.companyId === params.companyId);
      if (params.manufacturer) items = items.filter(t => t.manufacturer === params.manufacturer);
      if (params.search) {
        const search = params.search.toLowerCase();
        items = items.filter(t => t.name.toLowerCase().includes(search));
      }
      return Promise.resolve({ items, total: items.length });
    },

    listManufacturers: (companyId: string | undefined) => {
      const items = [...state.templates.values()]
        .map(t => t.template)
        .filter(t => t.companyId === null || t.companyId === companyId);
      const manufacturers = [
        ...new Set(items.map(t => t.manufacturer).filter((m): m is string => m !== null)),
      ];
      return Promise.resolve(manufacturers);
    },

    createTemplate: (companyId: string, createdBy: string, input: CreateTemplateInput) => {
      const id = newId();
      const template: PreconfigureTemplate = {
        id,
        companyId,
        createdBy,
        name: input.name,
        manufacturer: input.manufacturer ?? null,
        description: input.description ?? null,
        image: input.image ?? null,
        configuration: { fields: input.fields },
        fields: input.fields,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.templates.set(id, { template, fields: input.fields.map(toTemplateFieldRow) });
      return Promise.resolve(template);
    },

    createTemplateFromFields: (
      companyId: string,
      createdBy: string,
      input: { name: string; manufacturer: string | undefined; description: string | undefined },
      fields: { attributeKey: string; label: string; unit: string | undefined }[]
    ) => {
      const id = newId();
      const template: PreconfigureTemplate = {
        id,
        companyId,
        createdBy,
        name: input.name,
        manufacturer: input.manufacturer ?? null,
        description: input.description ?? null,
        image: null,
        configuration: { fields },
        fields: fields.map(f => ({ attributeKey: f.attributeKey, label: f.label, unit: f.unit })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.templates.set(id, { template, fields: fields.map(toTemplateFieldRow) });
      return Promise.resolve(template);
    },
  };

  return { repository: repo as unknown as ProductsRepository, state };
}

/** Seeds a preconfigure template + its field configuration directly into fake state (bypasses `createTemplate`, matching how `fakeUsersRepository`'s tests seed via constructors). */
export function seedTemplate(
  state: FakeState,
  template: PreconfigureTemplate,
  fields: { attribute_key: string; label?: string; unit?: string }[]
): void {
  state.templates.set(template.id, { template, fields });
}

/** D-0106: in-memory stand-in for the `ProductsProtocolsLookup` cross-module interface (`ProtocolsRepository` in production). Every id "exists" by default — pass `existingIds` to test the not-found path. */
export function fakeProtocolsLookup(existingIds?: string[]): ProductsProtocolsLookup {
  return {
    findById: (id: string) =>
      Promise.resolve(existingIds === undefined || existingIds.includes(id) ? { id } : undefined),
  };
}
