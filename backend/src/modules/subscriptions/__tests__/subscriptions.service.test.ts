import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { SubscriptionsService } from '../subscriptions.service.js';
import { fakeSubscriptionsRepository } from './fakes.js';
import type { Subscription } from '../subscriptions.types.js';

function contextFor(userId: string): RequestContext {
  return {
    userId,
    companyId: undefined,
    roles: [],
    perms: [],
    jti: 'test',
    exp: Number.MAX_SAFE_INTEGER,
  };
}

const EXISTING: Subscription = {
  id: '1',
  userId: '1',
  type: 'default',
  stripeId: 'placeholder-existing',
  stripeStatus: 'active',
  stripePrice: null,
  quantity: null,
  trialEndsAt: null,
  endsAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('SubscriptionsService', () => {
  it('ensurePlaceholderSubscription requires a request context', async () => {
    const { repository } = fakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository);

    await expect(service.ensurePlaceholderSubscription()).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('ensurePlaceholderSubscription creates a placeholder when the user has none', async () => {
    const { repository, state } = fakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository);

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.ensurePlaceholderSubscription()
    );

    expect(result.stripeStatus).toBe('active');
    expect(result.stripeId).toMatch(/^placeholder-/);
    expect(result.stripePrice).toBeNull();
    expect(state.subscriptions.size).toBe(1);
  });

  it('ensurePlaceholderSubscription is idempotent — never creates a duplicate for a user who already has an active one', async () => {
    const { repository, state } = fakeSubscriptionsRepository([EXISTING]);
    const service = new SubscriptionsService(repository);

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.ensurePlaceholderSubscription()
    );

    expect(result.id).toBe(EXISTING.id);
    expect(state.subscriptions.size).toBe(1);
  });

  it("ensurePlaceholderSubscription only ever provisions the current context's own user, never an id a caller could pass in", async () => {
    const { repository, state } = fakeSubscriptionsRepository([EXISTING]);
    const service = new SubscriptionsService(repository);

    // Two different users in two different contexts each get (or keep) their own row.
    await runWithContextAsync(contextFor('1'), () => service.ensurePlaceholderSubscription());
    await runWithContextAsync(contextFor('2'), () => service.ensurePlaceholderSubscription());

    expect(state.subscriptions.size).toBe(2);
    expect([...state.subscriptions.values()].map(s => s.userId).sort()).toEqual(['1', '2']);
  });

  it('ensurePlaceholderSubscription ignores a canceled subscription and provisions a fresh placeholder', async () => {
    const canceled: Subscription = { ...EXISTING, stripeStatus: 'canceled' };
    const { repository, state } = fakeSubscriptionsRepository([canceled]);
    const service = new SubscriptionsService(repository);

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.ensurePlaceholderSubscription()
    );

    expect(result.id).not.toBe(canceled.id);
    expect(state.subscriptions.size).toBe(2);
  });
});
