import { DateTime } from 'luxon';

/**
 * The one entry point for dates/time in the app (D-0023, `CONVENTIONS.md`
 * "Language & style": dates in UTC end to end, ISO 8601 at the API
 * boundary). Modules should get every `DateTime` through these rather than
 * calling `DateTime.now()`/`DateTime.fromJSDate()` directly, since Luxon
 * defaults to the system's local zone unless told otherwise — going
 * through here is what makes "UTC end to end" actually hold rather than
 * being a policy nobody enforces.
 */
export function nowUtc(): DateTime {
  return DateTime.utc();
}

export function fromIso(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' });
}

export function fromJsDate(date: Date): DateTime {
  return DateTime.fromJSDate(date).toUTC();
}

export function toIsoString(dt: DateTime): string {
  const iso = dt.toUTC().toISO();
  if (iso === null) {
    throw new Error('Cannot format an invalid DateTime as ISO 8601');
  }
  return iso;
}

/** Luxon's `toRelative()` counterpart to Carbon's `diffForHumans()` (e.g. "3 minutes ago") — module 2.3's `Device::last_updated` appended attribute is the first caller. */
export function toRelative(dt: DateTime): string {
  return dt.toRelative() ?? toIsoString(dt);
}

/**
 * D-0119: `Device::getCreatedAtAttribute()` is a custom Eloquent accessor
 * that reformats `created_at` into the device *owner's* own timezone as
 * `Y-m-d H:i:s` (`Carbon::parse($value)->timezone($tz)->format(...)`) —
 * unlike every other timestamp in the app, which stays plain UTC ISO
 * 8601 (D-0023 above). This is the one deliberate exception, scoped to
 * this single quirk — do not reach for it for any other field.
 * `timezone: null` (the column allows it) falls back to Laravel's own
 * `config('app.timezone')` default, `UTC` (`config/app.php`). An
 * unrecognized zone name falls back to UTC too rather than producing an
 * "Invalid DateTime".
 */
export function formatDeviceCreatedAt(date: Date | null, timezone: string | null): string | null {
  if (date === null) return null;
  const zoned = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone ?? 'UTC');
  const dt = zoned.isValid ? zoned : DateTime.fromJSDate(date, { zone: 'utc' });
  return dt.toFormat('yyyy-LL-dd HH:mm:ss');
}

/**
 * D-0122: `Model::getAttributes()` (what `AttributePreferenceController::
 * showSettings` returns) is the *raw* DB row, so a timestamp comes out as
 * the stored `Y-m-d H:i:s` string in the app timezone (`UTC`), not the
 * ISO 8601 a Carbon-cast attribute serializes to. For that raw-attributes
 * shape only — every other timestamp stays ISO (D-0023).
 */
export function formatRawDbTimestamp(date: Date | null): string | null {
  if (date === null) return null;
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyy-LL-dd HH:mm:ss');
}
