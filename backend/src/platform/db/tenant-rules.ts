/**
 * The tenant-key registry the Prisma extension (`tenant-scoping.ts`)
 * enforces by default (ARCHITECTURE.md §6, D-0011). Grounded in
 * `reference/schema-tables.md`'s "Tenant-key map (all 86 tables)" —
 * consult that doc, not intuition, when registering a new model.
 *
 * Four kinds:
 * - `company`  — has its own tenant column (usually `company_id`, but
 *                `field` is a plain string so a table with a differently
 *                named owner column — e.g. `dashboards.created_by` — can
 *                still be registered as a real `user`/`company` rule
 *                instead of falling back to `parent`); filter directly.
 * - `user`     — as above, keyed by user instead of company.
 * - `none`     — global/framework/catalog; genuinely never tenant-filtered
 *                (e.g. `modules`, `permissions`, `companies` itself).
 * - `parent`   — no own tenant column (schema-tables.md's "parent:<table>").
 *                Deliberately **not** auto-scoped here — the relation chain
 *                to the tenant-owning ancestor is too heterogeneous to
 *                genericize safely (varying FK/relation names, some two
 *                levels deep). The owning module's repository must scope
 *                these by joining through an already-tenant-verified
 *                parent row (e.g. only ever reached via a `roles` row this
 *                request already loaded and checked). `parent` exists as
 *                its own kind (not just reusing `none`) so this is a
 *                documented, deliberate exception, not indistinguishable
 *                from a genuinely global table — grep for `kind: "parent"`
 *                to find every table needing that discipline.
 *
 * Every model touched through the shared `prisma` client MUST be
 * registered here — an unregistered model throws (fail closed) rather
 * than silently running unscoped. Register a model's rule in the module
 * that first needs to query it.
 */
export type TenantRule =
  | { kind: 'company'; field: string }
  | { kind: 'user'; field: string }
  | { kind: 'none' }
  | { kind: 'parent' };

export const TENANT_RULES: Partial<Record<string, TenantRule>> = {
  // -- Module 1.2 auth --
  users: { kind: 'company', field: 'company_id' },
  password_reset_tokens: { kind: 'none' },

  // -- Module 1.3 rbac-tenancy --
  companies: { kind: 'none' }, // the tenant root itself
  roles: { kind: 'company', field: 'company_id' },
  modules: { kind: 'none' }, // module catalog
  permissions: { kind: 'none' }, // Spatie permission catalog, shared across companies
  module_role: { kind: 'parent' }, // parent:roles — scope via an already-verified role_id
  model_has_roles: { kind: 'parent' }, // parent:roles
  model_has_permissions: { kind: 'parent' }, // parent:permissions (permissions themselves are `none`, so this pivot's real scoping is via the user/role side, not the permission side — still `parent`, never queried unscoped by user/role)
  role_has_permissions: { kind: 'parent' }, // parent:roles

  // -- Registered early for KNOWN_ISSUES 11.37's regression tests
  // (modules 2.1/2.3 own the actual repositories; the rule lives here so
  // the tenant-scoping test suite can prove the mechanism against real
  // tables before those modules exist) --
  devices: { kind: 'user', field: 'user_id' },
  products: { kind: 'company', field: 'company_id' },

  // -- Module 1.4 users-members --
  members: { kind: 'company', field: 'company_id' }, // has a real FK to companies (onDelete: Cascade), unlike roles

  // -- Module 2.1 products --
  product_attribute_preferences: { kind: 'user', field: 'user_id' }, // schema-tables.md: user, not company
  product_attribute_preference_settings: { kind: 'parent' }, // parent:product_attribute_preferences
  // `none`, not `company` (schema-tables.md's suggestion) — DELIBERATE
  // override: company_id is nullable here, and a null row means "global
  // template, visible to every company" (PreconfigureTemplateController's
  // own doc comment). The blanket company-scoping extension would force
  // company_id = context.companyId into every query, silently excluding
  // every global template from any list/show — exactly wrong for this
  // table's actual visibility model. Scoped manually in the repository
  // instead (company_id IS NULL OR company_id = caller's own), matching
  // Laravel's own query exactly.
  preconfigure_templates: { kind: 'none' },
  raw_packet_values: { kind: 'user', field: 'user_id' }, // D-0047 — holds the ingestion token
  rules: { kind: 'user', field: 'user_id' },
  // `parent:dashboards` (schema-tables.md), not `user` despite `created_by`
  // — `dashboard_id` is nullable, and this module creates dashboard-less
  // "stub" widgets (D-0048) as an attribute-preference implementation
  // detail, never exposing a widget-browsing API itself. No tenant
  // enforcement from the extension on this table; `created_by` is set
  // explicitly on create, and this module never lists/queries widgets
  // cross-tenant (2.7 dashboards owns real widget browsing later).
  widgets: { kind: 'parent' },
  widget_settings: { kind: 'parent' }, // parent:widgets
  protocols: { kind: 'none' }, // catalog; full CRUD is 2.2's job, 2.1 only validates protocol_id exists
  device_values: { kind: 'parent' }, // parent:devices — this module only deletes by device_unique_identifier as part of product/device cascade delete

  // -- Module 2.5 rules --
  alarms: { kind: 'company', field: 'company_id' },

  // -- Module 2.7 dashboards --
  // `user`-kind, but the owner column is `created_by`, not `user_id`
  // (schema-tables.md line 145). Closes the new ownership-bug finding on
  // DashboardController (index/show/update/destroy had zero tenant
  // checks) the same structural way as every other user/company-ruled
  // table, per 11-dashboards.md's Design notes.
  dashboards: { kind: 'user', field: 'created_by' },
  // `GET /stats/count-all` needs a genuinely global count (schema-tables.md:
  // user via `user_id`) — first table this module needs that module 2.3
  // (its natural owner per schema-tables.md's module grouping) never
  // queried directly, so registered here instead (tenant-rules.ts's own
  // convention: register where first needed).
  device_packets: { kind: 'user', field: 'user_id' },

  // -- Module 2.3 devices --
  device_positions: { kind: 'parent' }, // parent:devices — GPS read side; write path is 2.4/4.3's job
  user_devices: { kind: 'user', field: 'user_id' }, // has its own user_id (closes 11.48 — deviceList previously trusted a client-suppliable user_id query param)
  // `parent:assets` (schema-tables.md) — 2.3 only reads this read-only, to
  // compute `is_assigned`/`assigned_device_ids` on `getByProduct`, matching
  // Laravel's own DeviceController::getByProduct() exactly (which queries
  // AssetComponent with no company scoping either — a global "is this
  // device assigned to ANY asset" check, not a per-tenant one). Real
  // asset_components CRUD/tenant semantics are 3.1's job.
  asset_components: { kind: 'parent' },

  // -- Module 3.1 assets (D-0075's structural half) --
  // Real own tenant column (unlike most `company_id` columns elsewhere,
  // `assets.company_id` is a nullable varchar in the frozen schema, not a
  // BigInt FK — schema-tables.md still calls it `company`-kind, and the
  // extension's string comparison works the same either way).
  assets: { kind: 'company', field: 'company_id' },
  // `parent:asset_components` (schema-tables.md) — same discipline as
  // `asset_components` above: no own tenant column, `AssetsRepository`
  // joins through `asset_components.assets.company_id` explicitly on
  // every operation (mirrors D-0075's live-app `authorizedComponentQuery()`).
  floor_plans: { kind: 'parent' },

  // -- Module 4.9 fleet-settings (D-0183) — one row per company --
  fleet_settings: { kind: 'company', field: 'company_id' },
  vehicle_hourly_stats: { kind: 'company', field: 'company_id' }, // D-0194 (D1): hourly telemetry rollup

  // -- Module 4.1 fleet-vehicles-drivers --
  vehicles: { kind: 'company', field: 'company_id' },
  drivers: { kind: 'company', field: 'company_id' },
  // parent:vehicles / parent:drivers (schema-tables.md) — no own tenant
  // column; `FleetVehiclesDriversRepository` reaches these only through an
  // already company-scoped `vehicle_id`/`driver_id` (via `findVehicleById`/
  // `findDriverById`, which rely on the extension for `vehicles`/`drivers`
  // themselves), same discipline as module 3.1's `asset_components`.
  vehicle_device_assignments: { kind: 'parent' },
  driver_vehicle_assignments: { kind: 'parent' },
  driver_incidents: { kind: 'parent' },
  vehicle_maintenance_schedules: { kind: 'parent' },
  vehicle_maintenance_logs: { kind: 'parent' },
  fuel_logs: { kind: 'parent' },

  // -- Module 4.2 fleet-trips --
  trips: { kind: 'company', field: 'company_id' },
  // parent:trips (schema-tables.md) — no own tenant column; scoped via an
  // already company-scoped `trip_id` this module's own `findTripById`
  // already verified, same discipline as `vehicle_device_assignments`.
  trip_planned_yards: { kind: 'parent' },
  // parent:trips — D-0155 (step 4): append-only arrive/depart audit log; only ever reached through a stop of an
  // already company-scoped trip (`findTripById`), same discipline as `trip_planned_yards`.
  trip_stop_events: { kind: 'parent' },
  // Registered here (not by 4.4/4.7, which don't exist yet) for this
  // module's own narrow, read-only needs: company-scoped existence checks
  // tightening Laravel's bare `exists:yards,id`/`exists:fleet_customers,id`
  // (same bug class as module 4.1's D-0077 findings), plus lean display
  // briefs (`plannedYards.yard`/`trip.customer`). No yard/customer CRUD
  // is built here — that stays 4.4's/4.7's own job.
  yards: { kind: 'company', field: 'company_id' },
  fleet_customers: { kind: 'company', field: 'company_id' },

  // -- Module 4.3 fleet-geofences --
  geofences: { kind: 'company', field: 'company_id' },
  // parent:geofences (schema-tables.md) — no own tenant column; the
  // CRUD/events-read side reaches it only through an already company-
  // scoped `geofence_id` (`findGeofenceById`), same discipline as
  // `trip_planned_yards`. The detection side (`checkPosition`, called from
  // ingestion's no-request-context worker path) reads/writes it directly
  // by id, matching `vehicle_device_assignments`'s own discipline there.
  geofence_events: { kind: 'parent' },

  // -- Module 4.4 fleet-yards --
  // `yards` itself is already registered above (module 4.2, for that
  // module's own narrow read-only needs) — this module owns the first
  // real CRUD on it, no re-registration needed.
  // parent:yards (schema-tables.md) — no own tenant column; reached only
  // through an already company-scoped `yard_id` (`findYardById`).
  yard_layouts: { kind: 'parent' },
  yard_slots: { kind: 'parent' },
  // parent:yard_slots — two levels deep, no single already-verified
  // parent row one level up (check-in/check-out are reached directly by
  // slot id) — `findSlotById` joins through `yard_slots.yards.company_id`
  // by hand instead, same discipline `floor_plans` established for a
  // two-level chain.
  yard_slot_events: { kind: 'parent' },

  // -- Module 4.5 fleet-fuel-maintenance-compliance --
  // `driver_incidents`/`vehicle_maintenance_schedules`/`vehicle_maintenance_logs`/
  // `fuel_logs` are already registered above (module 4.1, `parent`-ruled for
  // that module's own read-only `show()` needs) — this module owns their
  // write side, no re-registration needed. `compliance_documents` is new
  // here: a real own `company_id` column (unlike the polymorphic
  // `documentable_type`/`_id` pair, which has no tenant meaning of its own —
  // ComplianceDocumentController::resolveOwner() company-scopes the target
  // driver/vehicle separately, before ever touching this table).
  compliance_documents: { kind: 'company', field: 'company_id' },

  // -- Module 4.7 fleet-crm-billing --
  // `fleet_customers` already registered above (module 4.2, for that
  // module's own narrow read-only needs) — this module owns the first real
  // CRUD on it. `contracts`/`vendors`/`billable_events`/`invoices`/
  // `invoice_payments` all have a real own `company_id` column (confirmed
  // against schema.sql, not assumed from schema-tables.md's summary alone).
  contracts: { kind: 'company', field: 'company_id' },
  // parent:contracts (schema-tables.md) — no own tenant column; reached
  // only through an already company-scoped `contract_id`
  // (`findContractById`), same discipline as `trip_planned_yards`.
  rate_cards: { kind: 'parent' },
  // vendors/customer_locations are NOT built this module (user-deferred,
  // see task-20's own Design notes) — vendors is still registered here
  // (real own `company_id` column, zero Laravel code referencing it
  // anywhere) so a later session can build it without a fresh tenant-rules
  // decision; customer_locations is deliberately left unregistered since
  // its own parent-chain shape (parent:fleet_customers, plus the real
  // geofence_id FK worth designing together with module 4.3) is a decision
  // for whoever actually builds it, not one to guess now.
  vendors: { kind: 'company', field: 'company_id' },
  billable_events: { kind: 'company', field: 'company_id' },
  invoices: { kind: 'company', field: 'company_id' },
  invoice_payments: { kind: 'company', field: 'company_id' },

  // -- Module 5.1 plans-modules --
  // `schema-tables.md`'s tenant-key map lists all three as `none` (not
  // `parent`) — genuinely global, cross-tenant catalog tables, same class
  // as `modules` itself. No company/user scoping concept applies to any of
  // them, ever.
  plans: { kind: 'none' },
  plan_modules: { kind: 'none' },
  plan_module_permissions: { kind: 'none' },

  // -- Module 5.2 subscriptions --
  // `schema-tables.md`: `subscriptions` is `user`-kind (`user_id`, Cashier's
  // own per-user-not-per-company shape) — every read/write in
  // `SubscriptionsRepository` runs under the target user's own request
  // context, so the extension's auto-injection makes cross-user access
  // structurally impossible, not just checked for.
  subscriptions: { kind: 'user', field: 'user_id' },
  // parent:subscriptions (schema-tables.md) — no own tenant column; not
  // touched by this module's placeholder-only scope (no subscription_items
  // row is ever created for a placeholder), registered ahead of real
  // Stripe integration so a future session doesn't need a fresh decision.
  subscription_items: { kind: 'parent' },

  // -- Module 6.1 contacts-settings-notifications --
  // `schema-tables.md`: genuinely global, ownerless public contact-form
  // submissions — no user/company concept applies (D-0090's own auth fix
  // is a route-level `platform_operator` gate on read/delete, not a tenant
  // key, since there is no per-tenant owner to scope by).
  contacts: { kind: 'none' },
  settings: { kind: 'user', field: 'user_id' },
  // D-0090 closes 11.59: Laravel's `NotificationController` has zero auth
  // middleware and zero scoping (`Notification::latest()->get()` returns
  // every user's rows). `user`-kind here is what makes the new app's
  // index/markRead/destroy structurally caller-scoped, not just checked.
  notifications: { kind: 'user', field: 'user_id' },

  // -- Module 6.5 mqtt-configurations (D-0117) --
  // `schema-tables.md`: per-company MQTT broker config. Real Laravel's own
  // `store()` accepts a client-supplied `company_id` in the body with no
  // check against the caller's own company (an already-flagged gap,
  // `api-catalog.md`'s own note) -- `company`-kind here makes that
  // structurally impossible in the new app, same guarantee as
  // `vehicles`/module 4.1.
  mqtt_configurations: { kind: 'company', field: 'company_id' },
};

export function tenantRuleFor(model: string): TenantRule {
  const rule = TENANT_RULES[model];
  if (!rule) {
    throw new Error(
      `No tenant rule registered for model "${model}" in platform/db/tenant-rules.ts. ` +
        `Every model queried through the shared Prisma client must have one — check ` +
        `reference/schema-tables.md's tenant-key map and add it (this fails closed on purpose).`
    );
  }
  return rule;
}
