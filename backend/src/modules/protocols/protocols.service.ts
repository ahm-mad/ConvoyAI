import { NotFoundError } from '../../platform/errors/app-error.js';
import type { ProtocolsRepository } from './protocols.repository.js';
import type {
  CreateProtocolInput,
  ListProtocolsQuery,
  Protocol,
  UpdateProtocolInput,
} from './protocols.types.js';

/** Business logic for module 2.2 (ARCHITECTURE.md §2) — a small lookup-table CRUD, no behavioral complexity beyond route-model-binding-style 404s. */
export class ProtocolsService {
  constructor(private readonly protocolsRepository: ProtocolsRepository) {}

  async listProtocols(query: ListProtocolsQuery): Promise<{ items: Protocol[]; total: number }> {
    return this.protocolsRepository.list(query);
  }

  async getProtocol(id: string): Promise<Protocol> {
    const protocol = await this.protocolsRepository.findById(id);
    if (!protocol) throw new NotFoundError('Protocol not found');
    return protocol;
  }

  async createProtocol(input: CreateProtocolInput): Promise<Protocol> {
    return this.protocolsRepository.create(input);
  }

  async updateProtocol(id: string, input: UpdateProtocolInput): Promise<Protocol> {
    await this.getProtocol(id);
    return this.protocolsRepository.update(id, input);
  }

  async deleteProtocol(id: string): Promise<void> {
    await this.getProtocol(id);
    await this.protocolsRepository.delete(id);
  }
}
