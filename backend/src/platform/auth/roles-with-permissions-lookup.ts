/**
 * The interface module 1.2 (auth, `/login`) depends on to embed the
 * caller's full `roles.permissions` eager load (Spatie shape, incl. the
 * `pivot` rows the response mapper builds from `id`s here) — implemented
 * by module 1.3's `RbacRepository`, reusing the exact same
 * `model_has_roles -> roles -> role_has_permissions -> permissions` query
 * shape `resolveClaims` (D-0040) already uses, just returning full rows
 * instead of names only. Wired together in `container.ts` (no new wiring
 * needed — `authService` already receives `rbacRepository` for
 * `ClaimsResolver`; this just widens the type it depends on). Kept as its
 * own interface per `CONVENTIONS.md` "Modules": cross-module calls go
 * through services/interfaces via the container, never another module's
 * repository directly.
 */
export interface LookedUpPermission {
  id: string;
  name: string;
  guardName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface LookedUpRole {
  id: string;
  companyId: string;
  name: string;
  guardName: string;
  displayName: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  permissions: LookedUpPermission[];
}

export interface RolesWithPermissionsLookup {
  /** Roles currently assigned to this user, each with its nested permissions — order matches `model_has_roles`' own query order (Laravel's `getRoleNames()->first()` has no explicit order either, same underlying pivot). */
  findRolesWithPermissionsForUser(userId: string): Promise<LookedUpRole[]>;
}
