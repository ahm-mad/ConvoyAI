import { describe, expect, it } from 'vitest';
import { SuperadminService } from '../superadmin.service.js';
import { fakeSuperadminRepository } from './fakes.js';

describe('SuperadminService', () => {
  it("totalUsersPerCompany uses the status:'success' envelope (not this project's usual success:true), matching SuperAdminController::totalUsersPerCompany exactly", async () => {
    const repo = fakeSuperadminRepository({
      totalUsersPerCompany: () =>
        Promise.resolve([
          { companyId: '1', companyName: 'Acme', totalUsers: 3 },
          { companyId: '2', companyName: 'Empty Co', totalUsers: 0 },
        ]),
    });
    const service = new SuperadminService(repo);

    const result = await service.totalUsersPerCompany();
    expect(result).toEqual({
      status: 'success',
      message: 'User count per company fetched successfully.',
      data: [
        { company_id: 1, company_name: 'Acme', total_users: 3 },
        { company_id: 2, company_name: 'Empty Co', total_users: 0 },
      ],
    });
  });

  it("totalSubscriptions uses the status:'success' envelope with total_subscriptions/subscriptions_by_type at the top level (not nested under data)", async () => {
    const repo = fakeSuperadminRepository({
      subscriptionStats: () => Promise.resolve({ total: 5, byType: { default: 5 } }),
    });
    const service = new SuperadminService(repo);

    const result = await service.totalSubscriptions();
    expect(result).toEqual({
      status: 'success',
      message: 'Subscription statistics fetched successfully.',
      total_subscriptions: 5,
      subscriptions_by_type: { default: 5 },
    });
  });
});
