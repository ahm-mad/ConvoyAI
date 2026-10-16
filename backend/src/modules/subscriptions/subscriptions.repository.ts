import { randomUUID } from 'node:crypto';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { toSubscription } from './subscriptions.mapper.js';
import type { Subscription } from './subscriptions.types.js';

/** `User::activeSubscription()`'s exact filter (`platform-billing-stripe.md` §1.4) — the placeholder's `stripe_status: "active"` is set specifically to satisfy this. */
const ACTIVE_STRIPE_STATUSES = ['active', 'trialing'];

/**
 * All Prisma access for module 5.2. `subscriptions` is `user`-ruled
 * (`tenant-rules.ts`, `user_id`) — the tenant-scoping extension forces
 * `user_id` from the request context into both `where` (reads) and `data`
 * (create), overwriting whatever this repository passes. `userId` is
 * still an explicit parameter here (same convention as `rules.repository.ts`'s
 * `create()`) purely to satisfy Prisma's required-field typing — the
 * service layer reads it from `getRequestContext()`, the same context the
 * extension itself reads, so the two can never disagree. No method here
 * can read or write another user's subscription even if a caller passed
 * the wrong id: the class of IDOR 11.22/11.55 describe is structurally
 * impossible, not just checked for.
 */
export class SubscriptionsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  /** Ordered by `id` ascending for determinism — Laravel's own `hasOne` relation has no explicit order (DB-default "first row", not guaranteed stable), same discipline as this project's other tie-break fixes (module 2.3's `device_values`, 4.3's `geofence_events`). */
  async findActiveForUser(userId: string): Promise<Subscription | undefined> {
    const row = await this.prisma.subscriptions.findFirst({
      where: { user_id: BigInt(userId), stripe_status: { in: ACTIVE_STRIPE_STATUSES } },
      orderBy: { id: 'asc' },
    });
    return row ? toSubscription(row) : undefined;
  }

  /** D-0080's placeholder row: `type: "default"` (Cashier's own convention), `stripe_id: "placeholder-<uuid>"` (satisfies the real unique constraint without colliding), `stripe_status: "active"`, `stripe_price: null`, no trial fields (nothing real to track). Zero Stripe SDK calls. */
  async createPlaceholder(userId: string): Promise<Subscription> {
    const row = await this.prisma.subscriptions.create({
      data: {
        user_id: BigInt(userId),
        type: 'default',
        stripe_id: `placeholder-${randomUUID()}`,
        stripe_status: 'active',
        stripe_price: null,
        quantity: null,
        trial_ends_at: null,
        ends_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
    return toSubscription(row);
  }
}
