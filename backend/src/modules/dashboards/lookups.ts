/**
 * Cross-module interface module 2.7 (dashboards)' `WidgetController::show()`
 * equivalent depends on — implemented by module 2.1's `ProductsRepository`
 * (`listPreferencesForProduct`, already built), wired together in
 * `container.ts`. Same pattern as `RulesDevicesLookup` etc.
 * (`modules/rules/lookups.ts`) — never import another module's repository
 * class directly (`CONVENTIONS.md` "Modules").
 */
export interface DashboardsProductsLookup {
  listPreferencesForProduct(
    productId: string
  ): Promise<{ label: string | null; attributeKey: string | null }[]>;
}
