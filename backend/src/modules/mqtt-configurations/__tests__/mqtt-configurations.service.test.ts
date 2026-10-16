import { describe, expect, it } from 'vitest';
import { MqttConfigurationsService } from '../mqtt-configurations.service.js';
import type { MqttConfiguration } from '../mqtt-configurations.types.js';
import { fakeMqttConfigurationsRepository } from './fakes.js';

const BASE_INPUT = {
  name: 'Primary',
  host: 'broker.example.com',
  port: 8883,
  username: 'user',
  password: 'pass',
  useTls: true,
  clientIdPrefix: 'prefix',
  description: 'desc',
};

describe('MqttConfigurationsService', () => {
  it('getById: throws NotFoundError when no configuration exists for the id', async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const service = new MqttConfigurationsService(repository);

    await expect(service.getById('999')).rejects.toThrow('MQTT configuration not found');
  });

  it('getActive: throws NotFoundError when no active configuration exists', async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const service = new MqttConfigurationsService(repository);

    await expect(service.getActive()).rejects.toThrow('MQTT configuration not found');
  });

  it('getActive: returns the one active-status configuration', async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const service = new MqttConfigurationsService(repository);
    const created = await service.create(BASE_INPUT);

    await expect(service.getActive()).resolves.toEqual(created);
  });

  it("update: throws NotFoundError before attempting to write when the id doesn't exist", async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const service = new MqttConfigurationsService(repository);

    await expect(service.update('999', { name: 'x' } as never)).rejects.toThrow(
      'MQTT configuration not found'
    );
  });

  it("delete: throws NotFoundError before attempting to delete when the id doesn't exist", async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const service = new MqttConfigurationsService(repository);

    await expect(service.delete('999')).rejects.toThrow('MQTT configuration not found');
  });

  it("testConnection: on success, records status 'active' and a success test_result, returns success:true", async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const tester = () => Promise.resolve({ success: true, message: 'Connection successful' });
    const service = new MqttConfigurationsService(repository, tester);
    const created = await service.create(BASE_INPUT);

    const { success, config } = await service.testConnection(created.id);

    expect(success).toBe(true);
    expect(config.status).toBe('active');
    expect(config.lastTestedAt).not.toBeNull();
    expect(config.testResult).toMatchObject({ success: true, message: 'Connection successful' });
  });

  it("testConnection: on failure, records status 'error' and an error test_result, returns success:false", async () => {
    const { repository } = fakeMqttConfigurationsRepository();
    const tester = () => Promise.resolve({ success: false, message: 'ECONNREFUSED' });
    const service = new MqttConfigurationsService(repository, tester);
    const created: MqttConfiguration = await service.create(BASE_INPUT);

    const { success, config } = await service.testConnection(created.id);

    expect(success).toBe(false);
    expect(config.status).toBe('error');
    expect(config.testResult).toMatchObject({ success: false, error: 'ECONNREFUSED' });
  });
});
