import type { ProtocolsRepository } from '../protocols.repository.js';
import type { CreateProtocolInput, Protocol, UpdateProtocolInput } from '../protocols.types.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  protocols: Map<string, Protocol>;
}

/** In-memory stand-in for `ProtocolsRepository` — module 2.2's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeProtocolsRepository(seedProtocols: Protocol[] = []): {
  repository: ProtocolsRepository;
  state: FakeState;
} {
  const state: FakeState = { protocols: new Map(seedProtocols.map(p => [p.id, p])) };

  const repo = {
    list: (query: {
      search?: string | undefined;
      category?: string | undefined;
      page: number;
      perPage: number;
    }) => {
      let items = [...state.protocols.values()];
      if (query.search) {
        const search = query.search.toLowerCase();
        items = items.filter(p => p.name.toLowerCase().includes(search));
      }
      if (query.category) {
        items = items.filter(p => p.category === query.category);
      }
      const total = items.length;
      const start = (query.page - 1) * query.perPage;
      return Promise.resolve({ items: items.slice(start, start + query.perPage), total });
    },

    findById: (id: string) => Promise.resolve(state.protocols.get(id)),

    create: (input: CreateProtocolInput) => {
      const protocol: Protocol = {
        id: newId(),
        name: input.name,
        category: 'transport',
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.protocols.set(protocol.id, protocol);
      return Promise.resolve(protocol);
    },

    update: (id: string, input: UpdateProtocolInput) => {
      const existing = state.protocols.get(id);
      if (!existing) throw new Error('not found');
      const updated: Protocol = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
      };
      state.protocols.set(id, updated);
      return Promise.resolve(updated);
    },

    delete: (id: string) => {
      state.protocols.delete(id);
      return Promise.resolve();
    },
  };

  return { repository: repo as unknown as ProtocolsRepository, state };
}
