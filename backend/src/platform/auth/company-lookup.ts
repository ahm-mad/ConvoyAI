/**
 * The interface modules 1.2 (auth, `/login`) and 1.4 (users, `/profile`)
 * depend on to embed the caller's full `company` row — implemented by
 * module 1.3's `RbacRepository`, wired together in `container.ts` (both
 * services already receive `rbacRepository` for `ClaimsResolver`/
 * `RoleLookup`; this just widens the type they depend on, no new
 * container wiring). Kept as its own interface (rather than importing
 * 1.3's repository directly) per `CONVENTIONS.md` "Modules": cross-module
 * calls go through services/interfaces via the container, never another
 * module's repository directly.
 *
 * Mirrors Laravel's raw, unhidden `Company` row exactly (D-00xx revisiting
 * D-0041's now-stale lean shape) — every column the `companies` table has,
 * including timestamps, since Laravel never hides any of them.
 */
export interface LookedUpCompany {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  /** D-0158/D-0162: ISO 4217, upper-case — carried by `/login`'s and `/profile`'s embedded `company` so the frontend needs no extra `GET /companies/{id}`. */
  currency: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CompanyLookup {
  findCompanyById(companyId: string): Promise<LookedUpCompany | undefined>;
}
