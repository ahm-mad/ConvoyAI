import type { SubscriptionsRepository } from '../subscriptions.repository.js';
import type { Subscription } from '../subscriptions.types.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  subscriptions: Map<string, Subscription>;
}

/** In-memory stand-in for `SubscriptionsRepository` — module 5.2's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeSubscriptionsRepository(seed: Subscription[] = []): {
  repository: SubscriptionsRepository;
  state: FakeState;
} {
  const state: FakeState = { subscriptions: new Map(seed.map(s => [s.id, s])) };
  const ACTIVE = new Set(['active', 'trialing']);

  const repo = {
    findActiveForUser: (userId: string) =>
      Promise.resolve(
        [...state.subscriptions.values()]
          .filter(s => s.userId === userId && ACTIVE.has(s.stripeStatus))
          .sort((a, b) => Number(a.id) - Number(b.id))[0]
      ),

    createPlaceholder: (userId: string) => {
      const subscription: Subscription = {
        id: newId(),
        userId,
        type: 'default',
        stripeId: `placeholder-${newId()}`,
        stripeStatus: 'active',
        stripePrice: null,
        quantity: null,
        trialEndsAt: null,
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.subscriptions.set(subscription.id, subscription);
      return Promise.resolve(subscription);
    },
  };

  return { repository: repo as unknown as SubscriptionsRepository, state };
}
