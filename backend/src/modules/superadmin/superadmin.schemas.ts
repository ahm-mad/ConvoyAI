import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 6.2. Response envelopes use `status: "success"`
 * (not this project's usual `success: true`) — a deliberate one-off, since
 * that's what `SuperAdminController.php` actually returns (D-0013: no
 * single envelope, reproduce each real shape exactly).
 */

const CompanyUserCountSchema = z
  .object({ company_id: z.number().int(), company_name: z.string(), total_users: z.number().int() })
  .openapi('SuperadminCompanyUserCount');

openApiRegistry.registerPath({
  method: 'get',
  path: '/superadmin/companies/users',
  tags: ['superadmin'],
  summary:
    "Requires platform_operator (D-0091 fix — live Laravel has zero auth at all, 11.14a). Reuses D-0039's role rather than a separate super_admin",
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('success'),
            message: z.string(),
            data: z.array(CompanyUserCountSchema),
          }),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/superadmin/subscriptions',
  tags: ['superadmin'],
  summary: 'Requires platform_operator (D-0091 fix, 11.14a)',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('success'),
            message: z.string(),
            total_subscriptions: z.number().int(),
            subscriptions_by_type: z.record(z.string(), z.number().int()),
          }),
        },
      },
    },
  },
});

// GET /get-encryption-key is deliberately not implemented at all — already
// `x-known-broken: true` in the frozen contract, and KNOWN_ISSUES 11.14a is
// explicit that the pattern (echo any env var by name over HTTP) must
// never be ported, in any form, regardless of auth.
