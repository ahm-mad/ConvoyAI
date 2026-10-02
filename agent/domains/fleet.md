# Domain: Fleet Management (the actively developed module)

Real-backend module (Express+Postgres, other repo) — vehicles, drivers, trackers (GPS IoT devices), yards + slots, geofences, trips, positions, realtime, enterprise lists, analytics/reports, per-company settings.
Sidebar entry: "Fleet Management" under **Solutions**, gated by `hasPermission('all-fleet')` (single all-or-nothing permission; granular RBAC B12 deferred by backend's owner). Demo (MSW) mode does NOT support the new fleet features.
Design/decision authority: `FLEET_ANALYTICS_DESIGN.md`; full history: `history/task-md-digest.md`, `backend_frontend_sync/communication/flows/04…07`.

## 1. Owner's original vision (built end-to-end, live-verified 2026-09-24)

Vehicle → driver → yards + geofences → assign tracker + driver → trip with yard stops → start → progress updated by humans AND sensors on a real map. CRM (customers/contracts/billing) is **out of scope** (the backend built 25 billing/CRM ops that the frontend does not use; a future "Ledger").

## 2. Routes (`app/(app)/fleet-management/…`) & navigation

`layout.tsx` = `FleetNav` + `TimezoneNotice` + page slot + `useFleetRealtime()` mounted once (legacy path renders unwrapped). `components/fleet/FleetNav.tsx`: segment switch **Operations | Analytics**, page tabs, "Fleet settings" link;
carries `range/from/to/compare/cmp` to the Overview and all reports, and scope/interval keys (`SCOPE_CARRY`) only to reports that honour them.

| Route                                                            | Screen                                                                    | Purpose                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/fleet-management` → redirect                                   |                                                                           | to `/operations/overview` (also `/fleet-management/overview` redirects)                                                                                                                                                  |
| `/operations/overview`                                           | `FleetOverview`                                                           | live landing dashboard (6 KPI tiles B1, status donut B3 live, needs-attention B2, trips, utilisation trend, maintenance&compliance, yard occupancy B9, geofence activity B9, incidents, cost breakdown, top vehicles A8) |
| `/operations/map`                                                | `FleetMap`                                                                | live positions (bbox viewport, realtime), yards, geofences, marker → vehicle modal + trail, "show trip route" selector                                                                                                   |
| `/operations/vehicles` `/drivers` `/yards` `/geofences` `/trips` | `Vehicles` `Drivers` `Yards` `Geofences` `Trips`                          | server-side enterprise lists (search/filters/sort/paging/bulk/CSV) + detail modals                                                                                                                                       |
| `/operations/assignments`                                        | `Assignments` → `AssignmentHistory` (company scope)                       | who drove which vehicle                                                                                                                                                                                                  |
| `/operations/incidents`                                          | `Incidents`                                                               | company-wide incident list (edit/delete; log new from a driver's Incidents tab)                                                                                                                                          |
| `/analytics/utilisation`                                         | `FleetUtilisation`                                                        | trip-based utilisation (server table A8); heatmap/moving-idle wait for backend D1                                                                                                                                        |
| `/analytics/trips`                                               | `FleetTripsAnalytics`                                                     | one call B5: KPIs+compare, outcome/on-time trends, delay+duration histograms, cancellation reasons, paged trips table, CSV                                                                                               |
| `/analytics/fuel`                                                | `FleetFuelAnalytics`                                                      | B6: six tiles, economy/price/litres/cost trends, by category, spend by vendor, "fill-ups worth a second look", paged fills + CSV                                                                                         |
| `/analytics/maintenance?view=schedules\|history\|compliance`     | `FleetMaintenanceAnalytics` (+`MaintenanceHistoryView`, `ComplianceView`) | schedules (C1 + B7 due buckets), service history (B7+C2), compliance (B7 report)                                                                                                                                         |
| `/settings`                                                      | `FleetSettings`                                                           | company timezone, unit system, position freshness, idle threshold, scheduled hours, on-time grace, maintenance due-soon window, KPI targets; sticky save bar, 409 handling                                               |
| `/legacy`                                                        | `FleetManagement` (+old `FleetDashboard`)                                 | pre-restructure tabbed hub kept unlinked for rollback (owner: KEEP for now; backend keeps `fleet_status.unknown` alias until it goes)                                                                                    |

No Ledger segment exists yet. Drivers & safety page waits for backend B8.

## 3. Lists (Vehicles / Drivers / Yards / Geofences (+events) / Trips / Incidents)

Same recipe everywhere: `useListState('<x>:server')` + `useServerList`/`useTripsList` + `DataToolbar` + `Pager` (20/50/100) + `StatusChips` (`useStatusCounts`) + `SelectableRow` + `BulkBar` (`useSelection`, `useBulkAction`, `bulkTargets`) + `useServerExport`.
Deactivated/retired records hidden by default; "Show inactive" adds `include_inactive=1`. State is in sessionStorage per tab, **not URL** (G15 open). Row click → `openModal(<XDetailModal/>)`. "Add" forms are inline function components in the screen file (`NewVehicleForm`, `NewDriverForm`, `NewYardForm`, `NewGeofenceForm`, `NewTripForm`) sharing field components.

- Vehicles: sort `name|plate|lifecycle_status|odometer_km|year|created_at`; filters status(active|in_maintenance|retired|sold), category, fuel, tracker yes/no, driver yes/no. `vehicle_categories` etc. from `GET /fleet/options` (value lists validated by backend).
- Drivers: sort `name|license_expiry_date|hire_date|status|created_at`; filters status(active|inactive|suspended), availability, employment, `license_state`(expired|expiring ≤30 d|valid|none), assigned.
- Yards: sort `name|created_at|slots_count|radius_m`; filters state/has_slots/has_coordinates/has_layout; radius (default 100 m, min 10) drives the auto-created linked geofence.
- Geofences: manual (lat/lng/radius) or centred on a yard; `alert_on` enter/exit/both hides the other event type in the events list; events list server-paged.
- Trips: status planned|in_progress|completed|cancelled; sort `planned_start_at|created_at|status|trip_reference`; filters status/vehicle/driver/date; bulk delete only planned trips. Create requires a driver (preselected from the vehicle's current driver); planned yard stops via `TripStopsEditor`.

Detail modals (`openModal`): **VehicleDetailModal** tabs `overview | tracker | maintenance | fuel | compliance | vehicle history` (edit form `VehicleEditForm`, photo `VehicleImageControl`, deactivate/permanent-delete controls, assign/unassign driver via `/drivers/:id/assign-vehicle` — no vehicle-side endpoint exists,
tracker assign from `/vehicles/assignable-trackers`, maintenance schedules+logs, fuel logs with economy, paged records `PagedRecords` with `RecordItem` edit/delete, yard history + check-out, incidents). **DriverDetailModal** tabs `overview | assignments | incidents | compliance`.
**TripDetailModal** tabs `overview | timeline | map`: Start / Complete (odometer + fuel, optional) / Cancel (reason) / Delete (planned only) / Edit (`TripEditForm`, planned or in-progress), timeline of stops with `StopActions` (mark arrived/departed with time; correcting requires a reason; history), "destination reached — confirm completion" banner from the sensor bridge, `TripRouteMap` (planned path, trail, live vehicle).
`YardLayoutEditor` = upload layout image, click to place slots, check-in/out (max-vehicle-length validation shown verbatim), slot edit/move/delete (refused when history exists — owner: keep refusing, "deactivate slot" later after asking). All modals were originally big `@ts-nocheck` files (VehicleDetailModal 1157 L, TripDetailModal 1183 L).

## 4. Business rules (backend-enforced; frontend shows messages verbatim)

- One active tracker and one active driver per vehicle; a driver has one active vehicle; assigning a new one implicitly ends the previous assignment (history kept).
- Deactivate (retire/inactive) refuses while a driver/tracker is assigned; hard delete ("Delete permanently", secondary control, single + bulk) only for never-used records (no trips/assignments/logs/incidents/documents/yard history).
- Trip status machine: `planned → in_progress → completed | cancelled`; PUT allowed for planned/in-progress; delete only planned. Sensor→trip bridge: positions inside yard geofences mark stops arrived/departed and set "awaiting completion" when the destination is reached (operator confirms). Times are ISO instants (`toIsoInstant`).
- Maintenance due = date OR odometer, the worse wins (`overdue|due_soon|ok|unknown`); fuel economy = full-tank method (`null` when not measurable); compliance expiry classes `expired, expiring_0_7, expiring_8_30, expiring_31_60, valid_after_60, no_expiry`; licences and documents share the 30-day "expiring" threshold in lists.
- GPS position detection is **role-based** (attribute role marked in Product Configuration ⚙ "Mark as location": Latitude/Longitude/Speed/Heading); labels no longer matter. Position freshness default 15 min (company setting); dashboards use the same setting.
- Optimistic concurrency: every fleet `PUT` may carry `expected_updated_at`; 409 → `ConflictBanner` (forms) or a sentence toast (quick actions). `updated_by=null` means the last change was automatic → "System" (`AuditLine`).
- Analytics definitions (backend, `FACTS.md`): trips belong to the period of `actual_start_at` else `planned_start_at`; distance = completed trips' `actual_distance_km`; utilisation = completed-trip hours ÷ (in-service vehicles × scheduled hours × local days); status is exclusive `moving|idle|parked|offline|no_tracker` ("no tracker" ≠ offline); day/week(Mon)/month buckets in the company timezone; server caps 92 buckets per request (hour ≤168).
  `driver_id` on the trips report = the trip's OWN driver, on summary/status/performance = the vehicle's CURRENT driver.

## 5. Realtime

See `architecture/data-layer-and-state.md` §4 and `backend/realtime-events.md`. Company room events only reach users whose JWT has a company AND `all-fleet`. Safety polls: Map/Trips/Geofences/vehicle 2 min, dashboards 5 min, in-progress trips 30 s.

## 6. Analytics/reports frontend (details in `domains/fleet-analytics-kit.md`)

Shared frame `AnalyticsShell` (title, `FilterBar` with range presets/custom, compare Prior period | Last year (`cmp=year` → `compare=previous_year`), Group by Auto|Day|Week|Month (`interval=`, only options ≤92 buckets), refresh, timezone label; `ScopeBar` under it).
Scope rule (D-14): a scope filter appears only on pages where EVERY widget and table honours it: Trips (category/vehicles/yard/trip's own driver/cost centre*), Fuel (category/vehicles/yard/cost centre*), Maintenance schedules+history (category/vehicles); Compliance, Overview, Utilisation none. *cost centre hidden until `GET /fleet/options` returns `cost_centres`.

## 7. Units, currency, timezone (no hardcoding)

`unit_system` per company (`metric|us|uk`, `GET/PUT /fleet/settings`, LIVE on backend). Convert with `useUnits()`: distance km↔mi, volume L↔US gal (UK keeps L), economy km/L↔mpg (US gal / imperial gal for uk), speed, length m↔ft, weight kg↔lb, perDistance. Forms display converted values and send metric. Currency from company record (`useFleetCurrency`, `formatFleetMoney`).
Timezone is a backend fleet setting (default UTC until saved) — `TimezoneNotice` suggests the browser zone but never applies it; **Fleet settings "Use this browser's timezone" fills the field, the operator saves.** Owner said YES to saving `Asia/Karachi` for their own company (not yet done). Fleet times render in the viewer's browser timezone; only server day-bucketing uses the company timezone.

## 8. Fleet code map

- Screens: `src/screens/{FleetOverview,FleetUtilisation,FleetTripsAnalytics,FleetFuelAnalytics,FleetMaintenanceAnalytics,MaintenanceHistoryView,ComplianceView,FleetSettings,FleetMap,Vehicles,Drivers,Yards,Geofences,Trips,Assignments,Incidents,FleetManagement(legacy hub),FleetDashboard(legacy)}.tsx`.
- Components: `components/fleet/{FleetNav,TimezoneNotice}`, `fleetSettings/controls` (NumberField, TimezoneCombobox with offsets + live clock), `analytics/*`, `list/*`, `records/*` (RecordItem, RecordForm schema-driven edit, PagedRecords, DeleteControl, IncidentSummary, fields.ts field defs), forms `VehicleFields/VehicleEditForm/VehicleImageControl/DriverFields/DriverEditForm/YardEditForm/GeofenceEditForm/TripEditForm/TripStopsEditor/CoordinatePicker(PickOnMapButton)`,
  modals `VehicleDetailModal/DriverDetailModal/TripDetailModal/YardLayoutEditor`, map `VehicleMarker/YardMarker/MarkerIcon/TripRouteMap/TripRouteLayers/MapViewportWatcher`, `StopActions`, `AssignmentHistory`, `ComplianceTab`, `ExpiringDocumentsPanel`, `DeactivateControls`, `PermanentDeleteControl`, `AuditLine`, `ConflictBanner`, `OptionSelect`.
- Hooks: see data-layer doc §5. Utils: `fleetCache, fleetConflict, fleetCurrency, fleetOptions, units, datetime, serverExport, mapViewport`.

## 9. Test data & test recipe (original environment)

Company 2 (login `junead@chaminade-hs.org`), currency PKR. Seeded throwaway `ZZ…` data (ZZ vehicles/drivers/yards/geofences/trips, product 118 "ZZ Tracker Product", ~60 `ZZ Bulk Veh`, `ZZBulk` drivers, `ZZ Bulk Yard`…). Owner's own records: vehicle "truck 1" (id 1) and driver "john doe" (id 1) — leave alone.
Left-overs: completed trip `ZZ-REG-TRIP-1` (id 137, can't be deleted), ended assignment ZZBulk001↔ZZ Bulk Veh 001, vehicle 187 `ZZ L4 Veh A` and yard 126 `ZZ L5 Yard` (deactivated, have history), tracker `ZZTRK0000000001` moved to ~31.9N 75.0E. Cleanup is G19 (LAST).

## 10. Backend rows not built / not used by the frontend

Not built by backend (we wait): B8 drivers scorecard + `GET /incidents/summary`, D1→B4 utilisation with scope, downtime days, E1–E4 ledger, F2 saved views, F3 scheduled exports, B12 granular fleet permissions. Built but unused by the frontend: billing/CRM group (25 ops), `GET /trips/{id}/gps-trail`, `within_days` on expiring-soon, `customer_id` scope, extra C2/C3 filters (`service_type`, `vendor`, cost range, `payment_method`, `trip_id` — deliberately skipped), `by_category`(B3), `by_document_type`(C4), `meta.data_quality`, yard `series`, `busiest_bucket`, attention `type/yard_days/action`.

## 11. Open owner-decision items in Fleet

G14 multi-select trip status (recommend yes); G15 URL-synced list state (recommend yes, page size 20); G17 document attachments; G18 saved views/a11y/skeletons/light theme; G20 imagery (vehicle photo markers + initials avatars safest start; a driver photo needs a backend upload endpoint; yard photo needs a new backend field);
G21 yard-slot "deactivate" (ask the owner again later; needs backend schema change); G13 compliance list on server params (low value). Decided: company-wide Incidents = a Fleet tab; hard delete = secondary "Delete permanently"; keep `/legacy`.

## 12. Trip lifecycle / driver experience — NOTES ONLY (owner 2026-09-25 evening; do NOT start)

Owner's ideas: (1) odometer should be automated — vehicles are used only through the platform, so trip distance = derived from start/end, vehicle odometer updated at trip completion; (2) creating a trip notifies the driver, driver **acknowledges** (enum such as `not_informed → acknowledged`);
(3) driver screen ≠ operator screen — managerial things (adding yards…) hidden from drivers via detailed **scoped RBAC**; (4) **"Start trip" visible to the DRIVER, not the operator**; (5) flow: driver gets the notification, opens his account at planned start, taps Start, and when he leaves the start point (lat/lng, 100 m radius) the sensor confirms and the trip is marked actually started.
Facts today: no acknowledgement state; drivers are records (no user login/link to a user account); manual odometer fields on vehicle/trip/fuel-log/maintenance-log forms feed fuel economy and distance-vs-plan KPIs; RBAC for Fleet is all-or-nothing; `notification:new` exists on backend but the frontend has no bell.
Suggested order when asked: scoped RBAC + driver accounts → acknowledgment + notifications → driver "My trips" with Acknowledge/Start + sensor-confirmed departure → automated odometer/distance → operator-side adjustments (remove operator Start = changes an existing screen → ask first). Would need a new backend flow file (08). Gap rows G22–G26.

## 13. Code-level independence (useful for extraction / re-branding)

The Fleet route closure is 136 files and shares only 11 with the rest of the app (`axiosConfig`, User/Theme/Modal/Socket contexts, `useSimpleQuery`, `router-compat`, `types/api`, `apiHelper`, `avatar`, `NeonPieChart`). Functional prerequisites outside the code closure: app shell + auth, company currency (Account Settings), and the IoT Products/Devices onboarding + attribute role marking that create the trackers. Details: `architecture/dependency-map.md`.
