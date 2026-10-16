import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { encryptMqttConfigSecret } from '../../platform/crypto/mqtt-config-secret.js';
import { toMqttConfiguration } from './mqtt-configurations.mapper.js';
import type {
  CreateMqttConfigurationInput,
  MqttConfiguration,
  MqttConfigurationStatus,
  MqttTestResult,
  UpdateMqttConfigurationInput,
} from './mqtt-configurations.types.js';

/**
 * All Prisma access for module 6.5. `mqtt_configurations` is
 * `company`-ruled (`tenant-rules.ts`) — every query here is automatically
 * scoped to the caller's own company by the tenant-scoping extension (no
 * explicit `company_id` filter needed, same convention as `vehicles`,
 * module 4.1), matching Laravel's own explicit `->where('company_id',
 * $companyId)` on every method.
 */
export class MqttConfigurationsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async list(): Promise<MqttConfiguration[]> {
    const rows = await this.prisma.mqtt_configurations.findMany({
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toMqttConfiguration);
  }

  async findById(id: string): Promise<MqttConfiguration | undefined> {
    const row = await this.prisma.mqtt_configurations.findUnique({ where: { id: BigInt(id) } });
    return row ? toMqttConfiguration(row) : undefined;
  }

  async findActive(): Promise<MqttConfiguration | undefined> {
    const row = await this.prisma.mqtt_configurations.findFirst({ where: { status: 'active' } });
    return row ? toMqttConfiguration(row) : undefined;
  }

  /**
   * `company_id` placeholder — always overwritten by the tenant-scoping
   * extension from the caller's own context (same pattern as
   * `FleetVehiclesDriversRepository.createVehicle`). D-0117: unlike real
   * Laravel's `company_id: required|exists:companies,id` body field (an
   * already-flagged gap, `api-catalog.md`'s own note on this endpoint),
   * this never trusts a client-supplied `company_id` at all.
   */
  async create(input: CreateMqttConfigurationInput): Promise<MqttConfiguration> {
    const row = await this.prisma.mqtt_configurations.create({
      data: {
        company_id: 0n,
        name: input.name ?? null,
        host: input.host,
        port: input.port,
        username: input.username != null ? encryptMqttConfigSecret(input.username) : null,
        password: input.password != null ? encryptMqttConfigSecret(input.password) : null,
        ...(input.useTls !== undefined ? { use_tls: input.useTls } : {}),
        client_id_prefix: input.clientIdPrefix ?? null,
        description: input.description ?? null,
      },
    });
    return toMqttConfiguration(row);
  }

  async update(id: string, input: UpdateMqttConfigurationInput): Promise<MqttConfiguration> {
    const row = await this.prisma.mqtt_configurations.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.host !== undefined ? { host: input.host } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.username !== undefined
          ? { username: input.username != null ? encryptMqttConfigSecret(input.username) : null }
          : {}),
        ...(input.password !== undefined
          ? { password: input.password != null ? encryptMqttConfigSecret(input.password) : null }
          : {}),
        ...(input.useTls !== undefined ? { use_tls: input.useTls } : {}),
        ...(input.clientIdPrefix !== undefined ? { client_id_prefix: input.clientIdPrefix } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return toMqttConfiguration(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.mqtt_configurations.delete({ where: { id: BigInt(id) } });
  }

  /** `testConnection()`'s own persisted side effect — status/last_tested_at/test_result, same 3 fields Laravel's model method updates. */
  async recordTestResult(
    id: string,
    status: MqttConfigurationStatus,
    testResult: MqttTestResult
  ): Promise<MqttConfiguration> {
    const row = await this.prisma.mqtt_configurations.update({
      where: { id: BigInt(id) },
      data: { status, last_tested_at: new Date(), test_result: testResult },
    });
    return toMqttConfiguration(row);
  }
}
