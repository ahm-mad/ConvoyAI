import type { ContactsSettingsNotificationsRepository } from '../contacts-settings-notifications.repository.js';

/**
 * Minimal per-test fake for `ContactsSettingsNotificationsRepository`
 * (CONVENTIONS.md "Tests": unit tests use fakes, no DB) — same Proxy-based
 * "only what this test actually calls" pattern as every other bundled
 * module's own fakes (e.g. `fleet-fuel-maintenance-compliance`).
 */
export function fakeContactsSettingsNotificationsRepository(
  overrides: Partial<ContactsSettingsNotificationsRepository>
): ContactsSettingsNotificationsRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeContactsSettingsNotificationsRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as ContactsSettingsNotificationsRepository;
}
