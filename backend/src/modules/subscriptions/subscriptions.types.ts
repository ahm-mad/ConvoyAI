/**
 * Domain types for module 5.2 (subscriptions) — see `tasks/22-subscriptions.md`.
 *
 * Per D-0080, this pass's real scope is narrow: a placeholder-provisioning
 * helper only, no Stripe SDK, no HTTP surface of its own (there is no
 * `/subscriptions` REST resource in Laravel either — Cashier's own tables
 * are only ever touched through `StripeSubscriptionController`'s real-Stripe
 * endpoints, all deferred). `stripe_id`/`stripe_status`/`stripe_price` are
 * column names matching the frozen schema, but here they hold sentinel
 * values, never real Stripe identifiers.
 */
export interface Subscription {
  id: string;
  userId: string;
  type: string;
  stripeId: string;
  stripeStatus: string;
  stripePrice: string | null;
  quantity: number | null;
  trialEndsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}
