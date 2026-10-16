import type { LookedUpCompany } from '../../platform/auth/company-lookup.js';

/**
 * The real, raw `Company` row shape Laravel embeds wherever it eager-loads
 * a `company` relation (`/login`'s `user.company`, `/profile`'s
 * `data.user.company`, D-0098/D-0099) — every column, incl. timestamps,
 * since nothing on the `Company` model is `$hidden`. Shared rather than
 * duplicated per-module since it's the exact same transformation
 * everywhere it's used (`CONVENTIONS.md` "Modules" doesn't require a
 * module-local copy of a pure, stable mapping like this one).
 */
export function toEagerLoadedCompanyResponse(company: LookedUpCompany | undefined) {
  if (!company) return null;
  return {
    id: Number(company.id),
    name: company.name,
    email: company.email,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    zip_code: company.zipCode,
    currency: company.currency,
    created_at: company.createdAt ? company.createdAt.toISOString() : null,
    updated_at: company.updatedAt ? company.updatedAt.toISOString() : null,
  };
}
