/** Domain types for module 6.5 (mqtt-configurations) — `MqttConfigurationController` (D-0117). */
export type MqttConfigurationStatus = 'active' | 'inactive' | 'error';

export interface MqttTestResult {
  success: boolean;
  tested_at: string;
  message?: string;
  error?: string;
}

export interface MqttConfiguration {
  id: string;
  companyId: string;
  name: string | null;
  host: string;
  port: number;
  /** Decrypted plaintext (D-0117) — never rendered in an API response, matches Laravel's `$hidden`/`encrypted` cast. */
  username: string | null;
  password: string | null;
  useTls: boolean;
  clientIdPrefix: string | null;
  status: MqttConfigurationStatus;
  lastTestedAt: Date | null;
  testResult: MqttTestResult | null;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateMqttConfigurationInput {
  name: string | null | undefined;
  host: string;
  port: number;
  username: string | null | undefined;
  password: string | null | undefined;
  useTls: boolean | undefined;
  clientIdPrefix: string | null | undefined;
  description: string | null | undefined;
}

export interface UpdateMqttConfigurationInput {
  name: string | null | undefined;
  host: string | undefined;
  port: number | undefined;
  username: string | null | undefined;
  password: string | null | undefined;
  useTls: boolean | undefined;
  clientIdPrefix: string | null | undefined;
  description: string | null | undefined;
  status: MqttConfigurationStatus | undefined;
}
