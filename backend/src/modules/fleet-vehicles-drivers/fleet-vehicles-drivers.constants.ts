/**
 * D-0157 (owner decision, 2026-09-24, answering frontend `04` §15 ask 1): the canonical, ENFORCED value lists for the four
 * free-text fleet columns. The database columns stay `varchar` (no enum types, no migration — the live data held no value
 * in any of them); the lists are enforced in the request schemas and served by `GET /fleet/options` for the dropdowns.
 *
 * The values are the ones Laravel's own migration comments intended (`2026_08_24_200001_extend_vehicles_table.php`,
 * `2026_08_24_200002_extend_drivers_table.php`) — Laravel itself never validated them. Adding a value later is a one-line
 * change here (contract regenerates); removing one needs a data check first.
 */
export const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid', 'lpg'] as const;
export const OWNERSHIP_TYPES = ['owned', 'leased', 'rented'] as const;
export const EMPLOYMENT_STATUSES = ['full_time', 'part_time', 'contractor', 'terminated'] as const;
export const AVAILABILITY_STATUSES = ['available', 'on_trip', 'on_leave', 'off_duty'] as const;

/** D-0167 (R3): licence state against today — `expired` (before today), `expiring` (today … +30 days, the same window as `expiring-soon`), `valid` (later than +30 days), `none` (no expiry date recorded). */
export const LICENSE_STATES = ['expired', 'expiring', 'valid', 'none'] as const;
export const LICENSE_EXPIRING_DAYS = 30;
