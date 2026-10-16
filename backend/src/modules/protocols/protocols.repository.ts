import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { toProtocol } from './protocols.mapper.js';
import type {
  CreateProtocolInput,
  ListProtocolsQuery,
  Protocol,
  UpdateProtocolInput,
} from './protocols.types.js';

/** All Prisma access for module 2.2. `protocols` is `none`-ruled (tenant-rules.ts) — a genuinely global catalog, no per-company/user scoping. */
export class ProtocolsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async list(query: ListProtocolsQuery): Promise<{ items: Protocol[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (query.search) {
      where['name'] = { contains: query.search, mode: 'insensitive' as const };
    }
    if (query.category) {
      where['category'] = query.category;
    }

    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await Promise.all([
      this.prisma.protocols.findMany({ where, skip, take: query.perPage, orderBy: { id: 'asc' } }),
      this.prisma.protocols.count({ where }),
    ]);
    return { items: rows.map(toProtocol), total };
  }

  async findById(id: string): Promise<Protocol | undefined> {
    const row = await this.prisma.protocols.findUnique({ where: { id: BigInt(id) } });
    return row ? toProtocol(row) : undefined;
  }

  /** Module 2.4 (ingestion) — resolves the MQTT transport protocol's id by name. `ingestion.md` §3.1: Laravel falls back to a hardcoded `2` if this lookup misses; the new app deliberately does not (resolve or fail loudly). */
  async findByName(name: string): Promise<Protocol | undefined> {
    const row = await this.prisma.protocols.findFirst({ where: { name } });
    return row ? toProtocol(row) : undefined;
  }

  /** `description` is deliberately not a parameter — accepted by the request schema but not a real column on this table (matches Laravel's `Protocol::create()`, whose `$fillable` never included it either); see the frozen contract's own note on this field. */
  async create(input: CreateProtocolInput): Promise<Protocol> {
    const row = await this.prisma.protocols.create({ data: { name: input.name } });
    return toProtocol(row);
  }

  async update(id: string, input: UpdateProtocolInput): Promise<Protocol> {
    const row = await this.prisma.protocols.update({
      where: { id: BigInt(id) },
      data: { ...(input.name !== undefined ? { name: input.name } : {}) },
    });
    return toProtocol(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.protocols.delete({ where: { id: BigInt(id) } });
  }
}
