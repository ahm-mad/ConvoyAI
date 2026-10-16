import { NotFoundError } from '../../platform/errors/app-error.js';
import {
  testMqttConnection,
  type MqttTestConnectionResult,
} from '../../platform/mqtt/test-connection.js';
import type { MqttConfigurationsRepository } from './mqtt-configurations.repository.js';
import type {
  CreateMqttConfigurationInput,
  MqttConfiguration,
  UpdateMqttConfigurationInput,
} from './mqtt-configurations.types.js';

/** Business logic for module 6.5 (ARCHITECTURE.md §2). `company_id` never appears here — the repository's queries are auto-scoped by the tenant-scoping extension from the caller's own request context. */
export class MqttConfigurationsService {
  /** Injectable for tests (default: the real `testMqttConnection`, which opens a real socket) — same pattern as `testMqttConnection`'s own `connectFn` parameter. */
  constructor(
    private readonly repo: MqttConfigurationsRepository,
    private readonly tester: (
      params: Parameters<typeof testMqttConnection>[0]
    ) => Promise<MqttTestConnectionResult> = testMqttConnection
  ) {}

  async list(): Promise<MqttConfiguration[]> {
    return this.repo.list();
  }

  async getActive(): Promise<MqttConfiguration> {
    const config = await this.repo.findActive();
    if (!config) throw new NotFoundError('MQTT configuration not found');
    return config;
  }

  async getById(id: string): Promise<MqttConfiguration> {
    const config = await this.repo.findById(id);
    if (!config) throw new NotFoundError('MQTT configuration not found');
    return config;
  }

  async create(input: CreateMqttConfigurationInput): Promise<MqttConfiguration> {
    return this.repo.create(input);
  }

  async update(id: string, input: UpdateMqttConfigurationInput): Promise<MqttConfiguration> {
    await this.getById(id);
    return this.repo.update(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.repo.delete(id);
  }

  /** `MqttConfiguration::testConnection()` ported exactly (D-0117) — a real connection attempt, not a stub. */
  async testConnection(id: string): Promise<{ success: boolean; config: MqttConfiguration }> {
    const config = await this.getById(id);
    const result = await this.tester({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      useTls: config.useTls,
      clientIdPrefix: config.clientIdPrefix,
    });

    const testedAt = new Date().toISOString();
    const testResult = result.success
      ? { success: true, tested_at: testedAt, message: 'Connection successful' }
      : { success: false, tested_at: testedAt, error: result.message };

    const updated = await this.repo.recordTestResult(
      id,
      result.success ? 'active' : 'error',
      testResult
    );
    return { success: result.success, config: updated };
  }
}
