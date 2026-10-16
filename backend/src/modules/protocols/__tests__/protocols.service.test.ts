import { describe, expect, it } from 'vitest';
import { ProtocolsService } from '../protocols.service.js';
import { fakeProtocolsRepository } from './fakes.js';
import type { Protocol } from '../protocols.types.js';

const PROTOCOL: Protocol = {
  id: '1',
  name: 'MQTTS',
  category: 'transport',
  image: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ProtocolsService', () => {
  it('getProtocol 404s for a missing id (route-model-binding equivalent)', async () => {
    const { repository } = fakeProtocolsRepository();
    const service = new ProtocolsService(repository);

    await expect(service.getProtocol('999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('getProtocol returns the protocol when it exists', async () => {
    const { repository } = fakeProtocolsRepository([PROTOCOL]);
    const service = new ProtocolsService(repository);

    const result = await service.getProtocol('1');

    expect(result.name).toBe('MQTTS');
  });

  it('createProtocol creates a new protocol (description is not a domain field — dropped before reaching the repository)', async () => {
    const { repository, state } = fakeProtocolsRepository();
    const service = new ProtocolsService(repository);

    const created = await service.createProtocol({ name: 'LoRaWAN' });

    expect(created.name).toBe('LoRaWAN');
    expect(state.protocols.size).toBe(1);
  });

  it('updateProtocol 404s for a missing id', async () => {
    const { repository } = fakeProtocolsRepository();
    const service = new ProtocolsService(repository);

    await expect(service.updateProtocol('999', { name: 'New Name' })).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('updateProtocol updates the name', async () => {
    const { repository } = fakeProtocolsRepository([PROTOCOL]);
    const service = new ProtocolsService(repository);

    const updated = await service.updateProtocol('1', { name: 'MQTTS Renamed' });

    expect(updated.name).toBe('MQTTS Renamed');
  });

  it('deleteProtocol 404s for a missing id', async () => {
    const { repository } = fakeProtocolsRepository();
    const service = new ProtocolsService(repository);

    await expect(service.deleteProtocol('999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('deleteProtocol removes an existing protocol', async () => {
    const { repository, state } = fakeProtocolsRepository([PROTOCOL]);
    const service = new ProtocolsService(repository);

    await service.deleteProtocol('1');

    expect(state.protocols.has('1')).toBe(false);
  });

  it('listProtocols delegates search/category/pagination to the repository', async () => {
    const transport: Protocol = { ...PROTOCOL, id: '1', name: 'HTTPS', category: 'transport' };
    const device: Protocol = { ...PROTOCOL, id: '2', name: 'LoRaWAN', category: 'device_protocol' };
    const { repository } = fakeProtocolsRepository([transport, device]);
    const service = new ProtocolsService(repository);

    const result = await service.listProtocols({
      search: undefined,
      category: 'device_protocol',
      page: 1,
      perPage: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('LoRaWAN');
    expect(result.total).toBe(1);
  });
});
