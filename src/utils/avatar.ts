/**
 * Single place that knows how to turn "whatever the API/DB gave us for a profile image" into a
 * displayable URL, and how to pick the fallback letter. Used by UserContext, Navbar (header +
 * avatar popper) and AccountSettings so they can never disagree again.
 */

const ABSOLUTE_URL_RE = /^(https?:)?\/\//i;

/**
 * - empty / null / undefined  -> null  (caller shows the initial-letter fallback)
 * - absolute URL (https://…, //cdn…) , `blob:` (local preview) or `data:` -> returned untouched.
 *   The API now returns full CDN URLs (e.g. https://pub-….r2.dev/profile-images/….jpg).
 * - anything else is treated as a legacy relative storage path -> `<API_URL>/storage/<path>`.
 */
export function resolveImageUrl(path?: string | null): string | null {
  if (path === null || path === undefined) return null;
  const value = String(path).trim();
  if (!value) return null;

  if (ABSOLUTE_URL_RE.test(value) || value.startsWith('blob:') || value.startsWith('data:')) {
    return value;
  }

  let base = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    base = base.replace(/^http:\/\//, 'https://');
  }
  base = base.replace(/\/+$/, '');
  return `${base}/storage/${value.replace(/^\/+/, '')}`;
}

/**
 * First letter (upper-cased, unicode-safe) of the first non-blank candidate, or '' if none.
 * Pass the user's first name first; later candidates are only used when it is missing.
 */
export function getAvatarInitial(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
    if (trimmed) return Array.from(trimmed)[0].toUpperCase();
  }
  return '';
}
