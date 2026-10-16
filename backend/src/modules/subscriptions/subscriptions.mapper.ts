import type { subscriptions as SubscriptionRow } from '@prisma/client';
import type { Subscription } from './subscriptions.types.js';

export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    type: row.type,
    stripeId: row.stripe_id,
    stripeStatus: row.stripe_status,
    stripePrice: row.stripe_price,
    quantity: row.quantity,
    trialEndsAt: row.trial_ends_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
