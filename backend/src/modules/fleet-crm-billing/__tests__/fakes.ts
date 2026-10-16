import type { FleetCrmBillingRepository } from '../fleet-crm-billing.repository.js';
import type { FleetBillingTripsLookup } from '../fleet-crm-billing.types.js';

/**
 * Minimal per-test fake for `FleetCrmBillingRepository` (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as every other fleet module's own fakes.
 */
export function fakeFleetCrmBillingRepository(
  overrides: Partial<FleetCrmBillingRepository>
): FleetCrmBillingRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetCrmBillingRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetCrmBillingRepository;
}

export function fakeTripsLookup(
  overrides: Partial<FleetBillingTripsLookup> = {}
): FleetBillingTripsLookup {
  return {
    findTripById: overrides.findTripById ?? (() => Promise.resolve(undefined)),
  };
}

/** Shaped like the real `PrismaClientKnownRequestError` the service's `isForeignKeyViolation()` checks for — just enough to trigger that branch in a fake. */
export function fakeForeignKeyViolation(): Error & { code: string } {
  return Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
}
