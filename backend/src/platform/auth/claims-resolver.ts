/**
 * The interface module 1.2 (auth) depends on to populate real
 * `companyId`/`roles`/`perms` into an issued JWT (D-0040) — implemented
 * by module 1.3's `RbacRepository`, wired together in `container.ts`.
 * Kept as its own interface (rather than 1.2 importing 1.3's repository
 * directly) per `CONVENTIONS.md` "Modules": cross-module calls go
 * through services/interfaces via the container, never another module's
 * repository directly.
 */
export interface UserClaims {
  companyId: string | undefined;
  roles: string[];
  perms: string[];
}

export interface ClaimsResolver {
  resolveClaims(userId: string): Promise<UserClaims>;
}
