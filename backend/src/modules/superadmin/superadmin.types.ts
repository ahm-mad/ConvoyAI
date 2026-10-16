/**
 * Domain types for module 6.2 — see `tasks/25-superadmin.md`.
 *
 * `GET /get-encryption-key` is deliberately not represented here at all —
 * already `x-known-broken: true` in the frozen `openapi.yaml`, and
 * KNOWN_ISSUES 11.14a is explicit that the pattern itself (echo any env
 * var by name over HTTP) must never be ported, in any form.
 */
export interface CompanyUserCount {
  companyId: string;
  companyName: string;
  totalUsers: number;
}

export interface SubscriptionStats {
  total: number;
  byType: Record<string, number>;
}
