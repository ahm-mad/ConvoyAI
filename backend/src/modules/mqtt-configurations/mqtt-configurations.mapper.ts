import type { mqtt_configurations as MqttConfigurationRow } from '@prisma/client';
import { decryptMqttConfigSecret } from '../../platform/crypto/mqtt-config-secret.js';
import type {
  CreateMqttConfigurationInput,
  MqttConfiguration,
  MqttTestResult,
} from './mqtt-configurations.types.js';

export function toMqttConfiguration(row: MqttConfigurationRow): MqttConfiguration {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username !== null ? decryptMqttConfigSecret(row.username) : null,
    password: row.password !== null ? decryptMqttConfigSecret(row.password) : null,
    useTls: row.use_tls,
    clientIdPrefix: row.client_id_prefix,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    testResult: row.test_result as MqttTestResult | null,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Matches Laravel's raw `MqttConfiguration` model JSON exactly, except
 * `password` — Laravel's own `$hidden = ['password']` means it never
 * appears in the response at all (not even `null`), so the key is
 * omitted here too, not nulled out.
 */
export function toMqttConfigurationResponse(config: MqttConfiguration) {
  return {
    id: Number(config.id),
    company_id: Number(config.companyId),
    name: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
    use_tls: config.useTls,
    client_id_prefix: config.clientIdPrefix,
    status: config.status,
    last_tested_at: config.lastTestedAt,
    test_result: config.testResult,
    description: config.description,
    created_at: config.createdAt,
    updated_at: config.updatedAt,
  };
}

/**
 * `store()`'s response specifically — a genuinely dynamic shape, unlike
 * every other endpoint here. Real Laravel's `MqttConfiguration::create(
 * $validator->validated())` returns the in-memory model exactly as
 * constructed from the request: `validated()` only contains keys the
 * client actually sent (an omitted optional field is absent, not
 * `null`), and MySQL's non-`RETURNING` insert never refreshes
 * DB-default column values (`status`, `last_tested_at`, `test_result`)
 * back onto that instance either — Eloquent's JSON serializer omits
 * attributes it was never told about entirely. Confirmed live: a
 * minimal `{company_id,host,port}` payload's response is *only*
 * `{company_id,host,port,updated_at,created_at,id}` — no `status`, no
 * `name: null`, nothing else. A subsequent `GET` (a real `SELECT`)
 * includes every column correctly — this quirk is `store()`-only.
 */
export function toMqttConfigurationCreateResponse(
  config: MqttConfiguration,
  input: CreateMqttConfigurationInput
) {
  return {
    company_id: Number(config.companyId),
    ...(input.name !== undefined ? { name: config.name } : {}),
    host: config.host,
    port: config.port,
    ...(input.username !== undefined ? { username: config.username } : {}),
    ...(input.useTls !== undefined ? { use_tls: config.useTls } : {}),
    ...(input.clientIdPrefix !== undefined ? { client_id_prefix: config.clientIdPrefix } : {}),
    ...(input.description !== undefined ? { description: config.description } : {}),
    updated_at: config.updatedAt,
    created_at: config.createdAt,
    id: Number(config.id),
  };
}
