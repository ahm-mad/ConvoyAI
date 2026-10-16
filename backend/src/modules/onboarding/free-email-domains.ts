/**
 * Module 5.3's own resolution of the company-naming-collision question
 * (`onboarding-verifytoken.md` §1.2 step 5, not resolved by D-0080 —
 * settled directly with the user this session, see `DECISIONS.md`).
 * Company identity moved from Laravel's email-local-part scheme to
 * email-domain-based grouping, which fixes the original collision risk
 * but introduces a worse one for free/personal email providers: every
 * `@gmail.com` signup would otherwise land in one shared "company." This
 * denylist is deliberately not exhaustive — it covers the providers
 * likely to actually show up in real signups — and is a plain constant,
 * not a config value, so extending it is a one-line change.
 */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** The part after `@`, lowercased. Assumes a syntactically valid email (already validated by `register`'s own Zod schema before a verification token could ever be minted for it). */
export function extractEmailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}
