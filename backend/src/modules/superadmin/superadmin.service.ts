import type { SuperadminRepository } from './superadmin.repository.js';

/**
 * Business logic for module 6.2. Both endpoints are gated on
 * `platform_operator` at the route level (D-0091 — D-0039's precedent,
 * reused rather than a separate `super_admin` role: the new app already
 * treats `super_admin`/`superadmin` as legacy string literals for
 * Laravel-parity checks only, never a role anyone is actually granted),
 * so no additional authorization logic lives here.
 */
export class SuperadminService {
  constructor(private readonly repo: SuperadminRepository) {}

  async totalUsersPerCompany() {
    const companies = await this.repo.totalUsersPerCompany();
    return {
      status: 'success' as const,
      message: 'User count per company fetched successfully.',
      data: companies.map(c => ({
        company_id: Number(c.companyId),
        company_name: c.companyName,
        total_users: c.totalUsers,
      })),
    };
  }

  async totalSubscriptions() {
    const stats = await this.repo.subscriptionStats();
    return {
      status: 'success' as const,
      message: 'Subscription statistics fetched successfully.',
      total_subscriptions: stats.total,
      subscriptions_by_type: stats.byType,
    };
  }
}
