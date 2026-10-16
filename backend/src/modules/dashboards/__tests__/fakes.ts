import type { DashboardsRepository } from '../dashboards.repository.js';
import type { DashboardsProductsLookup } from '../lookups.js';

/**
 * Minimal per-test fakes for module 2.7's service unit tests (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB). `DashboardsRepository` has ~35
 * methods across dashboards/widgets/widget_settings/packet-history/
 * analytics/global-stats — rather than hand-writing a full in-memory state
 * machine for all of them (the `rules` module's `fakes.ts` approach), each
 * test supplies only the methods its own code path actually calls via
 * `overrides`; any method a test didn't expect to be called throws loudly
 * instead of silently returning `undefined`, so a wrong assumption fails
 * the test rather than passing on accident.
 */
export function fakeDashboardsRepository(
  overrides: Partial<DashboardsRepository>
): DashboardsRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeDashboardsRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as DashboardsRepository;
}

export function fakeProductsLookup(
  overrides: Partial<DashboardsProductsLookup> = {}
): DashboardsProductsLookup {
  return {
    listPreferencesForProduct: overrides.listPreferencesForProduct ?? (() => Promise.resolve([])),
  };
}
