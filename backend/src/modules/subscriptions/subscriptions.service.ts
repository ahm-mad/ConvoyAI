import { ForbiddenError } from '../../platform/errors/app-error.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { SubscriptionsRepository } from './subscriptions.repository.js';
import type { Subscription } from './subscriptions.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

/**
 * Business logic for module 5.2 (subscriptions). Per D-0080, the only
 * real behavior this pass needs: idempotently ensure the *current
 * request's own user* has a placeholder subscription — no Stripe SDK,
 * no customer/trial/webhook logic (`platform-billing-stripe.md` §5 is
 * the spec for when that's separately authorized). The trigger point
 * (email verification, Google OAuth login) is 23-onboarding's job to
 * wire up — this service only provides the idempotent operation itself.
 */
export class SubscriptionsService {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  /** Never creates a duplicate — if the current user already has any subscription satisfying `User::activeSubscription()`'s filter (real or placeholder), returns it unchanged. */
  async ensurePlaceholderSubscription(): Promise<Subscription> {
    const context = requireContext();
    const existing = await this.subscriptionsRepository.findActiveForUser(context.userId);
    if (existing) return existing;
    return this.subscriptionsRepository.createPlaceholder(context.userId);
  }
}
