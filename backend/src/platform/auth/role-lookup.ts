/**
 * The interface module 1.4 (users-members) depends on to resolve a role
 * name to an id when creating a member — implemented by module 1.3's
 * `RbacRepository`, wired together in `container.ts`. Kept as its own
 * interface (rather than 1.4 importing 1.3's repository directly) per
 * `CONVENTIONS.md` "Modules": cross-module calls go through
 * services/interfaces via the container, never another module's
 * repository directly.
 */
export interface RoleLookup {
  /** Scoped to the caller's own company automatically (tenant-scoping extension) — returns undefined if no such role exists there. */
  findRoleIdByName(name: string): Promise<string | undefined>;
}
