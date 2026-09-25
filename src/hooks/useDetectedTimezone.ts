/** The IANA timezone of THIS browser (e.g. "Europe/London") — a suggestion for the company timezone, never a default. */
export const detectTimezone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/** `UTC`, `Etc/UTC`, `GMT`… all mean "no offset" — nothing to suggest. */
export const isUtcLike = (tz: string | null | undefined) =>
  !tz || /^(utc|etc\/utc|etc\/gmt|gmt|z)$/i.test(tz);
