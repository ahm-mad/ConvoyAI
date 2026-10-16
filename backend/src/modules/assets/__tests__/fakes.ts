import type { AssetsRepository } from '../assets.repository.js';
import type {
  AssetsCompanyLookup,
  AssetsDevicesLookup,
  AssetsProductsLookup,
  AssetsRulesLookup,
} from '../assets.types.js';

/**
 * Minimal per-test fake for `AssetsRepository`'s ~25 methods (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as `dashboards/__tests__/fakes.ts`: a method
 * a test didn't stub throws loudly instead of silently returning
 * `undefined`, so a wrong assumption about what the service calls fails
 * the test rather than passing on accident.
 */
export function fakeAssetsRepository(overrides: Partial<AssetsRepository>): AssetsRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeAssetsRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as AssetsRepository;
}

export function fakeRulesLookup(overrides: Partial<AssetsRulesLookup> = {}): AssetsRulesLookup {
  return {
    listActiveNonWidgetRulesForUser:
      overrides.listActiveNonWidgetRulesForUser ?? (() => Promise.resolve([])),
  };
}

export function fakeDevicesLookup(
  overrides: Partial<AssetsDevicesLookup> = {}
): AssetsDevicesLookup {
  return {
    findAuthorized: overrides.findAuthorized ?? (() => Promise.resolve(undefined)),
    findByIdUnscoped: overrides.findByIdUnscoped ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeProductsLookup(
  overrides: Partial<AssetsProductsLookup> = {}
): AssetsProductsLookup {
  return {
    findById: overrides.findById ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeCompanyLookup(
  overrides: Partial<AssetsCompanyLookup> = {}
): AssetsCompanyLookup {
  return {
    findById: overrides.findById ?? (() => Promise.resolve(undefined)),
  };
}
