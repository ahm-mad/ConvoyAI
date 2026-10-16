import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import type { CompanyUserCount, SubscriptionStats } from './superadmin.types.js';

/**
 * All Prisma access for module 6.2. `companies` is `none`-ruled but
 * `users`/`subscriptions` are `company`/`user`-ruled respectively
 * (`tenant-rules.ts`) — a genuinely cross-tenant admin stats query needs
 * `runAsSystemAsync` for both, same escape hatch `dashboards.repository.ts`'s
 * own `countAll()`/`listAllUsersBasic()` already use for the same reason
 * (D-0069's "genuinely global by design" precedent).
 */
export class SuperadminRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  /** `Company::withCount('users')->get()` — every company is included, even with zero users (a plain `groupBy` alone would silently drop them). */
  async totalUsersPerCompany(): Promise<CompanyUserCount[]> {
    return runAsSystemAsync(async () => {
      const [companies, counts] = await Promise.all([
        this.prisma.companies.findMany({
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        }),
        this.prisma.users.groupBy({ by: ['company_id'], _count: { _all: true } }),
      ]);
      const countByCompanyId = new Map(counts.map(c => [c.company_id?.toString(), c._count._all]));
      return companies.map(company => ({
        companyId: company.id.toString(),
        companyName: company.name,
        totalUsers: countByCompanyId.get(company.id.toString()) ?? 0,
      }));
    });
  }

  /** `Subscription::count()` + `groupBy('type')->selectRaw('type, COUNT(*) as count')->pluck('count', 'type')`. */
  async subscriptionStats(): Promise<SubscriptionStats> {
    return runAsSystemAsync(async () => {
      const [total, grouped] = await Promise.all([
        this.prisma.subscriptions.count(),
        this.prisma.subscriptions.groupBy({ by: ['type'], _count: { _all: true } }),
      ]);
      const byType: Record<string, number> = {};
      for (const row of grouped) {
        byType[row.type] = row._count._all;
      }
      return { total, byType };
    });
  }
}
