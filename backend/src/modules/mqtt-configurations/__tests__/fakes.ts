import type { MqttConfigurationsRepository } from '../mqtt-configurations.repository.js';
import type {
  CreateMqttConfigurationInput,
  MqttConfiguration,
  MqttConfigurationStatus,
  MqttTestResult,
  UpdateMqttConfigurationInput,
} from '../mqtt-configurations.types.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  configs: Map<string, MqttConfiguration>;
}

/** In-memory stand-in for `MqttConfigurationsRepository` — module 6.5's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeMqttConfigurationsRepository(seed: MqttConfiguration[] = []): {
  repository: MqttConfigurationsRepository;
  state: FakeState;
} {
  const state: FakeState = { configs: new Map(seed.map(c => [c.id, c])) };

  const repo = {
    list: () => Promise.resolve([...state.configs.values()]),

    findById: (id: string) => Promise.resolve(state.configs.get(id)),

    findActive: () => Promise.resolve([...state.configs.values()].find(c => c.status === 'active')),

    create: (input: CreateMqttConfigurationInput) => {
      const config: MqttConfiguration = {
        id: newId(),
        companyId: '1',
        name: input.name ?? null,
        host: input.host,
        port: input.port,
        username: input.username ?? null,
        password: input.password ?? null,
        useTls: input.useTls ?? true,
        clientIdPrefix: input.clientIdPrefix ?? null,
        status: 'active',
        lastTestedAt: null,
        testResult: null,
        description: input.description ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.configs.set(config.id, config);
      return Promise.resolve(config);
    },

    update: (id: string, input: UpdateMqttConfigurationInput) => {
      const existing = state.configs.get(id);
      if (!existing) throw new Error('not found');
      const updated: MqttConfiguration = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.host !== undefined ? { host: input.host } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.password !== undefined ? { password: input.password } : {}),
        ...(input.useTls !== undefined ? { useTls: input.useTls } : {}),
        ...(input.clientIdPrefix !== undefined ? { clientIdPrefix: input.clientIdPrefix } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      state.configs.set(id, updated);
      return Promise.resolve(updated);
    },

    delete: (id: string) => {
      state.configs.delete(id);
      return Promise.resolve();
    },

    recordTestResult: (id: string, status: MqttConfigurationStatus, testResult: MqttTestResult) => {
      const existing = state.configs.get(id);
      if (!existing) throw new Error('not found');
      const updated: MqttConfiguration = {
        ...existing,
        status,
        lastTestedAt: new Date(),
        testResult,
      };
      state.configs.set(id, updated);
      return Promise.resolve(updated);
    },
  };

  return { repository: repo as unknown as MqttConfigurationsRepository, state };
}
