/**
 * The interface module 2.3 (devices) depends on to verify a product exists
 * in the caller's own company (device creation) and to read a product's
 * attribute preferences (device `points()`) — implemented by module 2.1's
 * `ProductsRepository`, wired together in `container.ts`. Kept as its own
 * interface (rather than 2.3 importing 2.1's repository directly) per
 * `CONVENTIONS.md` "Modules": cross-module calls go through
 * services/interfaces via the container, never another module's
 * repository directly.
 */
export interface ProductsLookup {
  /** Scoped to the caller's own company automatically (tenant-scoping extension) — returns undefined if no such product exists there. */
  findById(id: string): Promise<{ id: string; companyId: string } | undefined>;
  listPreferencesForProduct(productId: string): Promise<
    {
      id: string;
      attributeKey: string | null;
      label: string | null;
      unit: string | null;
      isSelected: boolean;
      isUniqueIdentifier: boolean;
    }[]
  >;
}
