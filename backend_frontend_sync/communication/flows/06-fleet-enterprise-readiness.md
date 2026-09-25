# Fleet — enterprise readiness: current state, gaps and build plan

**Written:** 2026-09-24 22:02 PKT · **By:** frontend (with the owner) · **Verification:** audited against the regenerated contract (`api_contract/openapi/fleet*.yaml`, 254 operations), the frontend source, and live responses from the real backend (company 2). Live numbers are marked **[live]**.
**Source:** `src/screens/{Trips,Vehicles,Drivers,Yards,Geofences,FleetMap,FleetDashboard}.tsx`, `src/components/*Fields|*EditForm|DeactivateControls|StopActions|TripRoute*.tsx`, `flows/04` (§1–§25), `flows/05`.

> **PURPOSE.** The owner's fleet flow is complete and confirmed end to end (`flows/04` §22). The owner now wants the fleet module to be **enterprise level**, which — in the owner's words — cannot be reached without
> **proper CRUD everywhere, pagination, searching, filtering (and sorting)** on every list. This file records exactly where we stand, what is missing (on each side), the standard we are building to, and the order we will build in.
> Sections marked **PROPOSAL** are requests/suggestions for backend to react to — **nothing is agreed or built against them until the owner decides and backend marks a row BUILT** (same rule as `05`).


> ## ⚠ PRIORITY 1 REQUEST TO BACKEND — server-side lists (blocks enterprise scale) (2026-09-24 22:30 PKT)
> The frontend's search / filter / sort / paging on **vehicles, drivers, yards, geofences** (and search on **trips**) currently runs **in the browser over the fully downloaded list**, because these endpoints have no
> `search` / `sort_by` / `page` parameters. That is only a stopgap for demos (fine to a few hundred rows) — **it is not enterprise level**: an enterprise fleet has thousands of vehicles/drivers/trips and must never download
> them all to filter locally. **The owner wants proper server-side filtering, pagination, sorting and searching.** This needs backend: **B1** (unified list contract, §3, includes fixing `GET /geofences/events` to filter *before* `limit`),
> **B2** (unpaginated dropdown options endpoints, §3.4), **B8/B9** (map positions and detail sub-lists, §7). The frontend already isolates the data source behind one adapter per list (`useClientList` /
> `useTripsList`), so switching each screen to server-side is a small change **once a row is BUILT** — please treat B1/B2 as the next thing to build on fleet and tell us the order and any shape changes you prefer.

---

## 1. Current state (audit)

### 1.1 Capability matrix — what an operator can do today

| Module | Create | Read (list + detail) | Update | Delete / retire | Pagination | Search | Filter | Sort | Live updates (sockets) |
|---|---|---|---|---|---|---|---|---|---|
| Vehicles | ✅ | ✅ | ✅ (edit in detail modal) | ✅ deactivate / reactivate (no hard delete — backend design) | ❌ all rows | ❌ | ❌ (only *Show inactive*) | ❌ | ✅ `fleet:changed` |
| Drivers | ✅ | ✅ | ✅ | ✅ deactivate / reactivate | ❌ all rows | ❌ | ❌ (only *Show inactive*) | ❌ | ✅ |
| Yards | ✅ (+ radius, auto-geofence) | ✅ | ✅ | ✅ deactivate / reactivate | ❌ all rows | ❌ | ❌ (only *Show inactive*) | ❌ | ✅ |
| Yard slots | ✅ | ✅ | ✅ edit + move | ❌ **no delete in the contract** | n/a | n/a | n/a | n/a | ✅ |
| Yard layout image | ✅ upload (only when none yet) | ✅ | ❌ **cannot replace or remove** | ❌ | n/a | n/a | n/a | n/a | — |
| Geofences | ✅ | ✅ | ✅ | ✅ hard delete + enable/disable | ❌ all rows | ❌ | ❌ | ❌ | ✅ |
| Geofence events | (system) | ✅ latest 20 | — | — | ❌ `limit` only, no "load more" | ❌ | ❌ | newest first | ✅ |
| Trips | ✅ | ✅ | ❌ **`PUT /trips/{id}` exists, unused** | ✅ delete while planned, cancel | ⚠️ **backend pages (20/page); frontend shows page 1 only, no pager** | ❌ | ❌ (backend supports `status`, `vehicle_id`, `driver_id`, `date_from`, `date_to` — unused) | ❌ | ✅ `trip:update` |
| Trip stops | (with trip) | ✅ timeline + map | ✅ manual arrive/depart/correct (audited) | — | n/a | n/a | n/a | n/a | ✅ |
| Maintenance schedules | ✅ | ✅ (in vehicle detail) | ❌ **no PUT in contract** | ❌ **no DELETE in contract** | ❌ | ❌ | ❌ | ❌ | — |
| Maintenance logs | ✅ | ✅ | ❌ no PUT | ❌ no DELETE | ❌ | ❌ | ❌ | ❌ | — |
| Fuel logs | ✅ | ✅ | ❌ no PUT | ❌ no DELETE | ❌ | ❌ | ❌ | ❌ | — |
| Compliance documents | ✅ (metadata only) | ✅ | ❌ no PUT | ❌ no DELETE | ❌ | ❌ | ⚠️ by vehicle/driver only | ❌ | — |
| Driver incidents | ✅ | ✅ | ❌ no PUT | ❌ no DELETE | ❌ | ❌ | ❌ | ❌ | — |
| Vehicle image | ❌ (endpoint exists, unused) | ✅ shown if set | ❌ | ❌ no DELETE | n/a | n/a | n/a | n/a | — |
| Assignment history | (system) | ❌ **3 endpoints exist, unused** | — | — | (backend pages) | — | (backend filters) | — | — |
| Map / positions | (system) | ✅ live | — | — | one row per tracker | — | assigned-only default | — | ✅ `fleet:position` |
| Dashboard | — | ✅ | — | — | n/a | — | date range | — | ✅ (invalidate on events) |
| Fleet customers / contracts / billing | — | **out of scope** (owner: CRM + payments are not ours; we only expose payment APIs later) | | | | | | | |

### 1.2 What the list endpoints support today vs what the frontend uses **[contract + live]**

| Endpoint | Query params in the contract | Rows returned [live, company 2] | Response envelope | Frontend passes |
|---|---|---|---|---|
| `GET /vehicles` | `include_inactive` | 6 (all) | `data: []` | `include_inactive` |
| `GET /drivers` | `status`, `include_inactive` | 6 (all) | `data: []` | `include_inactive` |
| `GET /yards` | `include_inactive` | 6 (all) | `data: []` | `include_inactive` |
| `GET /geofences` | *(none)* | 8 (all) | `data: []` | — |
| `GET /geofences/events` | `limit` | 20 | `data: []` | `limit=20` |
| `GET /trips` | **`status`, `vehicle_id`, `driver_id`, `customer_id`, `date_from`, `date_to`, `per_page`, `page`** | 10 (per_page **default 20**, `total` 10) | `data: { data: [], current_page, last_page, per_page, total, links, … }` (Laravel paginator) | **nothing** — so only the first 20 trips are ever visible |
| `GET /compliance-documents` | `documentable_type`, `documentable_id` | per record | `data: []` | both |
| `GET /assignment-history` (+ per vehicle / per driver) | `date_from`, `date_to`, `include_active`, `per_page`, `page`, `driver_id`, `vehicle_id`, `status` | not called | paged | — |
| `GET /fleet/positions` | `include_unassigned` | 2 (all assigned trackers) | `data: []` | default |
| **No fleet endpoint has a `search` parameter, a `sort` parameter, or (except trips / assignment-history) `page`/`per_page`.** | | | | |

### 1.3 Contract operations the frontend does not call (genuinely unused)
`GET /trips/{id}/gps-trail` (superseded by `GET /trips/{id}/route`), `GET /compliance-documents/expiring-soon`, `GET /assignment-history`, `GET /vehicles/{id}/assignment-history`, `GET /drivers/{id}/assignment-history`,
`POST /vehicles/{id}/image`, and **`PUT /trips/{id}`**. Everything else in the fleet contract (excluding CRM/billing) is wired.

### 1.4 Problems this causes at enterprise scale
1. **Trips beyond the first 20 are invisible** (real bug that appears the moment a company has > 20 trips — e.g. after a month of daily trips).
2. Unpaginated lists (vehicles, drivers, yards, geofences) render every row: fine at ~10, slow and unscannable at hundreds.
3. **No way to find anything** — no search box, no status/type/assignment filter, no sorting, on any list.
4. Records that were entered wrongly in the log-type modules (maintenance, fuel, documents, incidents) **can never be corrected or removed** — there is no PUT/DELETE.
5. A planned trip cannot be edited (only cancelled/deleted and recreated), and yard stops cannot be changed after creation.
6. Dropdowns (driver / vehicle / tracker pickers) today rely on receiving **all** records; paginating those lists must not break them (see §3.4).

---

### 1.5 State after frontend Phases 1–2 (as of 2026-09-24 22:35 PKT) — supersedes the "no paging / no search" cells of §1.1 for the frontend side

Built and live-verified (details in §8): a shared list foundation and the following behaviour on **Trips, Vehicles, Drivers, Yards, Geofences** (+ geofence events panel): **pager (20/50/100)**, **debounced search**, **combinable filters**, **sort** (except Trips — backend has no sort), **empty / error-with-retry states**, **state persisted per list** (sessionStorage — not URL yet), **CSV export of every matching row**, and on Vehicles/Drivers/Yards **row selection + bulk Deactivate/Reactivate** with per-record refusal messages. Realtime (`fleet:*`, `trip:update`) keeps the operator's page/filters.
**But only Trips is truly server-side (page + status/vehicle/driver/date filters).** Vehicles, Drivers, Yards, Geofences do search/filter/sort/paging/export **in the browser over the fully downloaded list**, and Trips search/export load every page (cap 1 000). This is a **stopgap for demos** — see the PRIORITY 1 banner and asks B1/B2/B8–B11. Test data seeded for the checks is listed in §8.2 (cleaned up by the frontend later).

## 2. The standard we are building to (definition of done)

**A list screen is "enterprise level" when it has:** server-side pagination with a page-size choice · a debounced **search** box · combinable **filters** (status, type, assigned/unassigned, date range …) · **sortable** columns · total count · empty / loading / error-with-retry states · its state (page, search, filters, sort) **preserved** across refetches and live `fleet:*` invalidations and restorable from the URL · row selection with **bulk actions** where meaningful (bulk deactivate/reactivate) · **CSV export** of the current filtered result · correct behaviour with tens of thousands of rows.

**A record type is "enterprise level" when it has:** create · read · **update** · a delete-or-retire path with clear guards · a visible **audit trail** (who created/changed it and when, at least `created_at/updated_at/updated_by`) · permission-aware actions · no data that can be entered but never corrected.

---

## 3. PROPOSAL to backend — one consistent list contract for the fleet lists

Reuse the **house standard `GET /companies` already has** (so the frontend needs one pager/toolbar, not seven): query `search`, `sort_by`, `sort_order` (`asc|desc`), `per_page` (default 20, max 100), `page`; response
`data: { items: […], pagination: { page, per_page, total, total_pages } }`. `GET /trips` keeps its current Laravel paginator shape (the frontend adapts to both) but gains `search` + `sort_by/sort_order`.

### 3.1 Per-list parameters (PROPOSED)

| List | `search` matches | Filters | `sort_by` whitelist |
|---|---|---|---|
| `GET /vehicles` | name, plate, VIN, make, model, category | `status` (`lifecycle_status`), `vehicle_category`, `fuel_type`, `ownership_type`, `has_tracker`, `has_driver`, `include_inactive` | name, plate, created_at, odometer_km, lifecycle_status |
| `GET /drivers` | first/last name, licence number, email, phone | `status`, `availability_status`, `employment_status`, `assigned` (on a vehicle or not), `license_expiring_within_days`, `include_inactive` | name, license_expiry_date, hire_date, created_at |
| `GET /yards` | name, address | `is_active` (`include_inactive`), `has_coordinates`, `has_layout` | name, created_at, slots_count |
| `GET /geofences` | name | `is_active`, `yard_id`, `linked` (yard-linked vs manual), `alert_on` | name, radius_m, created_at |
| `GET /trips` | trip_reference, origin/destination address, purpose, vehicle name/plate, driver name | existing: `status`, `vehicle_id`, `driver_id`, `date_from`, `date_to` (+ allow multi-status `status[]=planned&status[]=in_progress`) | planned_start_at, created_at, status, trip_reference |
| `GET /geofences/events` | geofence / vehicle name | `geofence_id`, `vehicle_id`, `trip_id`, `event_type`, `from`, `to`; **page instead of `limit`** | occurred_at |
| `GET /compliance-documents` | document_number, type, notes | existing `documentable_*` **plus** `document_type`, `expiring_within_days`, `expired` | expiry_date, created_at |
| `GET /assignment-history` … | (already filtered) | (already) | — |

### 3.2 Defaults / compatibility
Calling a list **with none of the new parameters must behave as it does today** (no breaking change), *except* that lists may start returning the paged envelope — backend please tell us whether it prefers (a) opt-in paging (`per_page` present ⇒ paged shape, absent ⇒ today's flat array) or (b) always paged. The frontend supports either.

### 3.3 Totals
`pagination.total` must be the total **after** filters/search, so the UI can say "37 vehicles" and disable "next" correctly. Optional but valuable: a lightweight `counts` per status on vehicles/drivers/trips (for filter chips like *Planned 4 · In progress 2 · Completed 31*).

### 3.4 Dropdowns must not be paginated (important)
The driver, vehicle, tracker, yard and geofence **pickers** (assign driver, assign tracker, trip form, yard check-in …) need *all eligible* records, not a page. PROPOSAL: keep those fed by a **small unpaginated options endpoint** per entity —
e.g. `GET /vehicles/options`, `GET /drivers/options` returning only `{ id, name, plate/licence, status, has_driver … }` for **active** records (server-side capped, e.g. 1 000, with a `search` param for very large fleets) — instead of reusing the paged list. Backend's call on naming/shape.

---

## 4. CRUD gaps and what each needs

| # | Gap | Backend has it? | Owner of the fix | Proposed shape |
|---|---|---|---|---|
| C1 | **Edit / delete maintenance schedule** | ❌ | backend + frontend | `PUT/DELETE /maintenance-schedules/{id}` (or nested under the vehicle); also a list endpoint so the schedule tab can page/filter |
| C2 | **Edit / delete maintenance log** | ❌ | backend + frontend | `PUT/DELETE /maintenance-logs/{id}`; deleting/editing a log that reset a schedule must define what happens to the schedule's `last_service_date` |
| C3 | **Edit / delete fuel log** | ❌ | backend + frontend | `PUT/DELETE /fuel-logs/{id}` (fuel-economy stats recompute) |
| C4 | **Edit / delete compliance document** | ❌ | backend + frontend | `PUT/DELETE /compliance-documents/{id}`. Also: today only *metadata* is stored — decide whether a real **file attachment** (upload + download) is wanted |
| C5 | **Edit / delete driver incident**; **company-wide incident list** | ❌ | backend + frontend | `PUT/DELETE /incidents/{id}` and `GET /incidents` (paged/filterable), keeping the per-driver POST |
| C6 | **Delete yard slot** | ❌ | backend + frontend | `DELETE /yard-slots/{id}` with guard *"Check out the vehicle first"* |
| C7 | **Replace / remove yard layout image** | ❌ (upload only) | backend + frontend | `POST /yards/{id}/layout` replacing the current one (slots keep their relative positions — confirm) and `DELETE /yards/{id}/layout` |
| C8 | **Vehicle image upload + remove** | ✅ upload (`POST /vehicles/{id}/image`), ❌ remove | frontend (+ backend `DELETE`) | Add an image control to the vehicle detail; ask backend for `DELETE /vehicles/{id}/image` |
| C9 | **Edit a planned trip** | ✅ `PUT /trips/{id}` (planned/in_progress; fields: reference, purpose, origin/destination address + coordinates, planned start/end, planned distance, odometer start, fuel used, notes, customer) | **frontend only** | "Edit trip" in the trip modal (same form as Create) |
| C10 | **Edit the stops of a planned trip** (add / remove / reorder yards) | ❌ (`PUT /trips` has no `planned_yards`) | backend + frontend | allow `planned_yards[]` on `PUT /trips/{id}` while `planned`, or dedicated `POST/PUT/DELETE /trips/{id}/stops` |
| C11 | **Assignment history views** (who drove / used which vehicle, when) | ✅ 3 endpoints | **frontend only** | "History" tab on vehicle and driver detail + a company-wide screen with the built-in filters |
| C12 | **Expiring documents / licences alert list** | ✅ `GET /compliance-documents/expiring-soon` | **frontend only** | dashboard widget + link into the document |
| C13 | **Audit trail** (`created_by`, `updated_by`, `updated_at` on every fleet record; for stops it already exists via `events[]`) | ❌ partly | backend + frontend | expose `created_by`/`updated_by` (id + name) on vehicle, driver, yard, geofence, trip and the log-type records; frontend shows "Last edited by … on …" |
| C14 | **Hard delete policy** for vehicles / drivers / yards | ❌ by design (deactivate only) | **owner decision** | confirm "deactivate only" is the intended enterprise behaviour (history-preserving) or ask for a guarded hard delete for never-used records |

---

## 5. Frontend build plan (order matters — each phase is shippable)

**Phase 0 — this document** ✅ DONE: agree the standard and the asks.

**Phase 1 — list foundation + Trips ✅ DONE + live-verified (2026-09-24 22:35 PKT).** Shared building blocks: `useListQuery` (page / page size / debounced search / filters / sort ⇒ query params, keeps previous data while loading, URL-synced), `DataToolbar` (search + filter chips + sort + page size), `Pager`, empty / error-with-retry states, CSV export of the current result.
*Trips first* because backend already supports paging + filters: pager, filters (status multi-select, vehicle, driver, date range), sort, live-safe. Search is done **client-side over the loaded page** until backend adds `search` (§3), clearly labelled in code so it is swapped out later.
*Acceptance:* with > 20 trips (we will seed ~60 `ZZ bulk` trips) every trip is reachable; filters combine; page/filter/sort survive a `trip:update` refetch and a reload; URL restores state.

**Phase 2 — Vehicles, Drivers, Yards, Geofences, Geofence events ✅ DONE + live-verified, CLIENT-SIDE stopgap (2026-09-24 22:35 PKT); bulk deactivate/reactivate + CSV on all lists chosen by the owner.** Same toolbar/pager. Until backend implements §3 these three (vehicles/drivers/yards/geofences) do **client-side** search / filter / sort / paging over the full list (already fetched), behind an adapter so switching to server-side is a one-file change per screen. Geofence events get real paging + filters (backend `limit` → page when §3 lands; interim "load more").
*Acceptance:* 500 seeded vehicles stay smooth; search finds by name/plate/VIN; filters combine; bulk select + bulk deactivate/reactivate; CSV export.

**Phase 2b — switch to server-side (✅ lists DONE for B1 2026-09-25 00:08 PKT — see §8 last row / §8.4; STILL WAITING ON B2 dropdown options, then B8/B9/B10/B11):** replace each screen's adapter (`useClientList` / the search branch of `useTripsList` / the dropdown sources) with the same `ListState` sent as request parameters (`page`, `per_page`, `search`, `sort_by`, `sort_order`, filters); dropdowns move to the `/options` endpoints; "Select all N matching" and CSV export move to bulk-by-filter and server export. Small per-screen change; **this is the step that makes the lists enterprise scale.**

**Phase 3 — frontend-only CRUD/read completion (can proceed while waiting for backend):** C9 edit planned trip, C11 assignment history views, C12 expiring-documents widget, C8 vehicle image upload. **✅ ALL FOUR DONE + live-verified 2026-09-24 23:07 PKT (see §8 last row and §8.3).**

**Phase 4 — backend-dependent CRUD (after backend BUILT):** C1–C7, C10, C13 — edit/delete UI for maintenance, fuel, documents, incidents, slots, layout; trip stop editing; audit line on every record.

**Phase 5 — cross-cutting polish:** permission-aware buttons (RBAC), consistent empty/error states everywhere, keyboard/accessibility pass, skeleton loading, saved filter views (owner decides).

**Later (owner: only after the module is enterprise-complete):** fleet alert rules + in-app notifications (needs the deferred bell/notification center), reports + graphs + financial ledger + analytics, bulk CSV import for vehicles/drivers, driver-reported stops / driver app, ETA.

**Test data for pagination:** the frontend seeds ≥ 60 trips, ≥ 100 vehicles/drivers, ≥ 30 yards/geofences with a `ZZ bulk` prefix (via the API, planned trips deletable, vehicles/drivers/yards deactivated afterwards). Backend: please tell us if you would rather we not create that volume, or want to seed it yourselves.

---

## 6. Decisions needed from the owner (frontend will ask when it reaches each)
1. **Client-side first or wait for backend?** Recommendation: build Phase 1–2 now with client-side search/filter/sort for the unpaginated lists (works today) and switch to backend paging when §3 lands.
2. Default page size (recommend **20**, choices 20/50/100) and whether list state lives in the **URL** (recommended — shareable, survives reload).
3. Bulk actions and CSV export on lists: yes/no per module.
4. C14: deactivate-only vs guarded hard delete.
5. Whether compliance documents need real file attachments (C4).
6. Which filters matter most to the operations team (the §3.1 table is a first guess).

## 7. What we ask backend (all PROPOSALS — priority in brackets)
- **B1 (high):** the unified list contract of §3 for vehicles, drivers, yards, geofences, trips (`search`, `sort_by`, `sort_order`, paging, the §3.1 filters, totals after filtering) and geofence events / compliance documents.
- **B2 (high):** unpaginated **options endpoints** for dropdowns (§3.4).
- **B3 (high):** edit + delete for maintenance schedules/logs, fuel logs, compliance documents, driver incidents (C1–C5), incl. what happens to derived data on delete.
- **B4 (medium):** `DELETE /yard-slots/{id}`, replace/remove yard layout (C6–C7), `DELETE /vehicles/{id}/image` (C8).
- **B5 (medium):** trip stop editing while planned (C10).
- **B6 (medium):** audit fields on fleet records (C13).
- **B8 (medium):** the **map** must scale too: `GET /fleet/positions` returns one row per tracker (all at once). Enterprise fleets need viewport filtering (`bbox=minLng,minLat,maxLng,maxLat`), an optional `limit`, and ideally server-side clustering / a lightweight summary at low zoom; same for yards and geofences drawn on the map (`GET /yards` / `GET /geofences` with `bbox`).
- **B9 (medium):** **detail sub-lists are embedded, not paged.** `GET /vehicles/{id}` and `GET /drivers/{id}` return maintenance schedules/logs, fuel logs, incidents, yard history etc. inside the detail object (yard history is capped at 20). For long-lived vehicles these need their own **paged, filterable list endpoints** (`GET /vehicles/{id}/maintenance-logs`, `/fuel-logs`, `/incidents`, …, `page`/`per_page`/date range) so the detail modal can page them.
- **B10 (high for bulk at scale):** **bulk operations.** Today the frontend loops single calls (4 in parallel) for *Bulk deactivate / reactivate* — fine for tens, not for thousands, and "Select all N matching" over a filtered list cannot be done by id. PROPOSAL: `POST /vehicles/bulk-deactivate|bulk-reactivate`, `/drivers/…`, `/yards/…` taking **either** `ids: [...]` **or** `filter: {…same params as the list…}`, returning **per-id results** `{ id, ok, message }` (same fixed guard messages, partial success allowed), plus `POST /trips/bulk-delete` (planned only) and geofence bulk enable/disable/delete. Backend's call on shape and on an upper bound per request.
- **B11 (medium):** **server-side CSV export.** The frontend builds CSVs in the browser from what it has loaded (trips: from every page, capped at 1 000). Enterprise exports must cover the **full filtered result** (tens of thousands of rows) without loading it into a page: `GET /vehicles/export?…same filters…` (also drivers, yards, geofences, trips, events) returning `text/csv` (streamed), honouring `search`/filters/`sort`, with a documented column set.
- **B12 (medium):** **granular fleet permissions.** Everything under fleet is gated by the single `all-fleet` permission. An enterprise needs separable rights (view · create · edit · deactivate/delete · export · manual stop marking) and a way for the frontend to **read the current user's permissions** (e.g. in `GET /profile` or `GET /permissions/me`) so buttons are hidden/disabled instead of failing with 403. Tell us what exists today for RBAC on fleet and what you propose.
- **B13 (low / decide later):** **concurrent-edit safety.** With several operators editing the same record, a `PUT` silently overwrites. PROPOSAL: return `updated_at` (already on most records) and accept it back (or `If-Match`/ETag) on `PUT` so backend can answer `409 Conflict` with the current record; the frontend then shows "changed by someone else — reload". 
- **B7 (low, decide later):** status counts endpoint for filter chips (§3.3); company-wide incidents list (C5).
Please answer with what is feasible, your preferred shapes, and the order you would build in; the frontend will not build against any of it until a row is BUILT.

## 8. Status log
| When | Who | What |
|---|---|---|
| 2026-09-24 22:02 PKT | frontend | Audit + this plan written. Frontend starts Phase 1 (list foundation + Trips) immediately — it needs nothing from backend. |
| 2026-09-24 22:12 PKT | frontend | **Phase 1 built + live-verified on Trips** (70 seeded `ZZ-BULK` trips): shared `useListState` / `DataToolbar` / `Pager` / CSV export; Trips now has a real pager (20/50/100), filters (status, vehicle, driver, date from/to), search, Clear, empty/error states and "Export CSV" of *all* matching rows. Verified: `1–20 of 70` → page 2/4, status filter (cancelled 19 / completed 21), vehicle and driver filters, search + filter combined, page size 50, filter change resets to page 1, state survives a reload, and a `trip:update` created by another operator keeps the operator on page 3 while the total grows 70 → 71. |


### 8.1 Findings from Phase 1 that backend should know (input for ask B1)
- **The `date_from` / `date_to` filter on `GET /trips` is undefined in the contract.** Observed live (7 planned/cancelled trips with `planned_start_at` in the next 1–45 h and 15 completed trips with none): `date_from` = tomorrow returned **40** trips (excluding the completed ones), `date_from` = today returned **67** — so it filters on the trip's own date (planned start, apparently falling back to actual start / created for trips without one), **not** purely on `created_at`. Please **document which column(s)** it uses (we label it "Date from/to" until told). If a strict `planned_start_at` or `actual_start_at` range is wanted, tell us the parameter names.
- **`status` on `GET /trips` accepts a single value only** (contract enum); operators will want multi-select ("planned + in progress"). Suggest `status` accepting a comma list or `status[]`.
- **Client-side search is only an interim.** While an operator searches, the frontend loads every page for the current filters (`per_page=100`, capped at 1 000 trips) and matches locally; a server-side `search` (B1) removes the cap and the extra requests. Same cap applies to "Export CSV".
- **No `sort_by` / `sort_order` on `GET /trips`** yet, so Trips has no sort control; it shows backend's default order.
| 2026-09-24 22:26 PKT | frontend | **Phase 2 built + live-verified** (owner chose: bulk deactivate/reactivate on Vehicles/Drivers/Yards, CSV export on all lists). Vehicles, Drivers, Yards and Geofences now have search, combinable filters, sort, pager (20/50/100), "Select page / Select all N", **Export CSV of every matching row** (client-side over the loaded list until backend §3), empty/clear states; Vehicles/Drivers/Yards also have **bulk Deactivate / Reactivate** that runs record by record and lists every refusal with backend's own message; Geofence events got "Load more" + type/text filters. Seeded and verified: 66 vehicles, 46 drivers, 36 yards, 33 geofences, 71 trips. |


### 8.2 Findings from Phase 2 that backend should know (more input for ask B1)
- **`GET /geofences/events?limit=N` applies `limit` *before* the per-geofence `alert_on` filter.** Live: `limit=20` returned **17** rows, `limit=40` returned **20** (the company had 20 events in total). So a response with fewer rows than `limit` does **not** mean the history is exhausted, and a client cannot page reliably. Please filter first and limit after (and add real paging + the §3.1 filters for events).
- **Every list is loaded whole and filtered in the browser** until §3 exists: at ~66 vehicles / 46 drivers / 36 yards this is instant, but it will not scale to thousands — server-side `search` / `sort_by` / `page` on vehicles, drivers, yards and geofences (B1) is the real fix; the frontend swaps its adapter (`useClientList`) for request parameters without other changes.
- **Deactivate guards worked exactly as documented under bulk load** (`Unassign this vehicle's driver and tracker…`, `Unassign this driver from their vehicle…`, `Check out all vehicles from this yard…`): 0 of the guarded records were deactivated, all unguarded ones succeeded — no findings, just confirmation.
- **Idea for B1 (optional):** a bulk endpoint (`POST /vehicles/bulk-deactivate` with a list of ids returning per-id results) would replace N sequential calls; not needed now (4 concurrent calls handle 60 records in a few seconds).
- **Test data now in company 2:** seeded `ZZ Bulk Veh 001–060` (10 reactivated after a bulk test, none assigned), `ZZBulk001–040` drivers (9 deactivated), `ZZ Bulk Yard 001–030` (9 deactivated; 25 have auto-created geofences), and `ZZ-BULK-001–071` trips. The frontend will clean these up when the enterprise work is finished; backend need not touch them.
| 2026-09-24 22:30 PKT | frontend (owner asked) | Made the server-side-lists request an explicit **PRIORITY 1** banner at the top of this file and added **B8** (map positions/bbox/clustering) and **B9** (paged detail sub-lists). Frontend pauses new list features until backend answers B1/B2 (Phase 3 items that do not depend on it — edit trip, assignment history, expiring documents, vehicle image — can still proceed). |

## 9. Owner decisions recorded so far (do not re-ask)
- **Client-side first was accepted only as a stopgap; the owner requires proper server-side search / filtering / sorting / pagination** (2026-09-24 22:3x) — hence the PRIORITY 1 banner and B1/B2.
- **Bulk deactivate/reactivate on Vehicles, Drivers, Yards: YES.** **CSV export on Vehicles, Drivers, Yards, Geofences (Trips already): YES.**
- Edit vehicle/driver **inside the detail modal**; **"Show inactive" toggle + Reactivate**; **delete planned trip via modal button + confirm** (all recommended options).
- Still open (raise when reached): default page size 20 + URL-synced state (recommended), hard-delete policy for vehicles/drivers/yards (recommend deactivate-only), compliance-document file attachments, which filters matter most, saved views.
- CRM/customers/billing stay out of scope (payment APIs later); ledger/reports/analytics come after this enterprise-readiness work.

## 10. Frontend architecture notes for backend (so the switch to server-side is predictable)
- One state object per list (`ListState`: page, pageSize, search, filters{}, sortBy, sortDir) persisted per list in sessionStorage and reset to page 1 on any change — it maps 1:1 onto the request parameters proposed in §3.
- One data adapter per list: `useClientList` (browser-side, current) or a server query (target). Dropdown pickers are separate queries and must use the `/options` endpoints (B2).
- Realtime: `useFleetRealtime` invalidates query keys by name prefix on `fleet:changed` / `trip:update` / `geofence:event`; server-paged queries are refetched (page and filters kept), so **the events must remain a "refetch" signal, not carry paging state**.
- Bulk today = N sequential single calls with per-record results shown to the operator; the `{ id, ok, message }` result shape in B10 is what the UI already renders.
| 2026-09-24 22:35 PKT | frontend | **Final documentation pass before the frontend session's context reset.** Added §1.5 (state after Phases 1–2), Phase 2b (server-side switch), asks **B10 bulk operations (ids or filter)**, **B11 server-side CSV export**, **B12 granular fleet permissions**, **B13 optimistic concurrency**, §9 (owner decisions) and §10 (architecture notes). Backend: please read the PRIORITY 1 banner, §3, §7 (B1–B13) and answer with feasibility / order / shape changes. |
| 2026-09-24 23:07 PKT | frontend | **Phase 3 built + live-verified (all frontend-only, against endpoints already in the contract; no backend change needed).** (C9) **Edit trip** (`PUT /trips/{id}`) in the trip modal for planned / in-progress trips — only changed fields are sent, cleared fields go as `null`, datetimes as ISO instants; vehicle / driver / stops are not editable through this endpoint (→ B5). (C11) **Assignment history**: paged + filtered views on a new *Assignments* hub tab (`GET /assignment-history`: status / vehicle / driver / date filters), on the vehicle *Vehicle History* tab (`GET /vehicles/{id}/assignment-history`, with the backend summary tiles; replaces the embedded, unpaged `driver_assignment_history` list) and on a new driver *Assignments* tab (`GET /drivers/{id}/assignment-history`). (C12) **Expiring documents** panel on the Fleet dashboard (`GET /compliance-documents/expiring-soon`, expired / ≤30 days, click → owner's Compliance tab). (C8) **Vehicle photo upload / change** (`POST /vehicles/{id}/image`, 10 MB + image-type checks client-side, backend 422 shown verbatim). |

### 8.3 Findings from Phase 3 (input for B3 / B4; nothing blocking)
- **Backend has not yet answered B1–B13** (no reply in the folder as of this entry; folder was identical to our last commit when checked at 22:4x PKT).
- **B4 still needed:** a vehicle photo can be added / replaced but **never removed** (`DELETE /vehicles/{id}/image`); uploaded images are served from a public object-store URL (`image_url`), works as expected.
- **B3 still needed:** compliance documents cannot be edited or deleted — the throwaway test document `ZZ Insurance` (vehicle 15, `ZZ Bulk Veh 001`) stays in the company until backend adds `DELETE /compliance-documents/{id}`.
- **Small observation:** `GET /compliance-documents` (per-record list) does not return the `is_expired` / `is_expiring_soon` flags the frontend's Compliance tab reads, so an already-expired document is labelled "Expires 1/1/2026" instead of "Expired". The frontend can compute it from `expiry_date`; tell us if you would rather add the flags (they are consistent with `expiring-soon`).
- `GET /assignment-history*`: `duration_days` is a whole number of days (0 for same-day assignments), so the frontend computes hours / minutes itself from `assigned_at` / `unassigned_at`. `include_active` (string) is undocumented, so the UI does not use it — please document what it does if it is meant for clients.
- Verified live against real data (company 2): company-wide filters match the API totals (status=active 2, vehicle 3 → 3, date_from in the future → 0), page 2 at page size 2 = ids 5,4 ("3–4 of 7"), vehicle summary tiles 3 / 2 / 5 / 134.07 km, driver summary 2 / 1 / 5 / 134.07 km.
| 2026-09-24 23:28 PKT | frontend | **Correction / open items on the 23:07 Phase 3 row:** "live-verified" there means verified through the page's DOM + the API on real data. **Not yet exercised** (owner: compulsory, tracked as V1–V3 in the frontend's task.md): editing an *in-progress* trip; the *Edit trip* button being absent on completed / cancelled trips; a visual (screenshot) pass over the new screens. Nothing here needs backend — this is frontend verification debt, recorded so the 23:07 row is not read as fully signed off. |


---

## 11. Backend reply (owner-directed, 2026-09-24 23:40 PKT, backend) — B1 is BUILT and live-verified; the other asks wait for the owner's decisions

Thank you for the audit — every fact in §8.1/§8.2 was checked against the real code and confirmed. **Owner decisions so far:** B1 answer shape = **opt-in paging** (Q1) and B1 scope = **everything in §3.1 in one step** (Q2). Everything below is **BUILT** (task `D-0164`, 1374 tests, live-verified on the rebuilt stack with real data and throwaway rows); shapes and exact parameters are in `api_contract/openapi/fleet-*.yaml` (each operation's `x-quirks` repeats the rules).

### 11.1 The list contract (B1) — BUILT
- **Opt-in paging.** Send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items: […], pagination: { page, per_page, total, total_pages } }` (`total` = rows **after** search/filters). Send neither and `data` is the **flat array exactly as before** — so any caller that does not ask for paging is unchanged. (Your adapters send `page`/`per_page`, so you get the paged shape.)
- **`search`** = case-insensitive *contains*, trimmed (blank = no search). **`sort_by`** = the per-list whitelist below (anything else → **422** `The selected sort by is invalid.`); **`sort_order`** = `asc|desc`. Rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row. Each list's **default order is unchanged** (vehicles name, drivers last name, yards/geofences/trips newest first, compliance documents expiry desc).
- **Booleans** are `1|true|0|false` (same spelling as `include_inactive`).

| List | `search` matches | Filters | `sort_by` |
|---|---|---|---|
| `GET /vehicles` | name, plate, VIN, make, model, category | `status` (`active|in_maintenance|retired|sold`; an explicit `status` wins over `include_inactive`), `vehicle_category`, `fuel_type`, `ownership_type`, `has_tracker`, `has_driver`, `include_inactive` | `name`, `plate`, `created_at`, `odometer_km`, `lifecycle_status` |
| `GET /drivers` | first/last name (a `first last` or `last first` phrase works), licence number, email, phone | `status`, `availability_status`, `employment_status`, `assigned` (on a vehicle now), `license_expiring_within_days` (licence expires between today and today+N; already-expired ones are **not** included), `include_inactive` | `name` (last, then first), `license_expiry_date`, `hire_date`, `created_at` |
| `GET /yards` | name, address | `has_coordinates`, `has_layout`, `include_inactive` | `name`, `created_at`, `slots_count` |
| `GET /geofences` | name | `is_active`, `yard_id`, `linked` (`1` yard-linked / `0` manual), `alert_on` (`enter|exit|both`) | `name`, `radius_m`, `created_at` |
| `GET /trips` | trip reference, origin/destination address, purpose, vehicle name/plate, driver name | existing `vehicle_id`, `driver_id`, `customer_id`, `date_from`, `date_to`; **`status` now multi-value** (`status=planned,in_progress`, repeated `status=`, or `status[]=`; each must be a real status, else 422 `The selected status is invalid.`) | `planned_start_at`, `created_at`, `status`, `trip_reference` (default newest created first) |
| `GET /geofences/events` | geofence name, vehicle name | `geofence_id`, `vehicle_id`, `trip_id`, `event_type` (`enter|exit`), `from`/`to` (inclusive `occurred_at`, ISO 8601 with offset or `Z`) | `occurred_at` (`sort_order` default `desc`) |
| `GET /compliance-documents` | document number, type, notes | still requires `documentable_type` + `documentable_id`; new `document_type`, `expiring_within_days` (expiry today..+N), `expired` (`1` before today / `0` no expiry or not yet expired) | `expiry_date`, `created_at` |

- **Trips are unchanged in envelope** — still always paged, still the Laravel paginator (`data.data`, `current_page`, `total`, …), `per_page` default 20, max 100. `date_from`/`date_to` compare the trip's **`actual_start_at` OR `planned_start_at`** (a trip matches when either is inside the range; a trip with neither is excluded once a bound is given) — not `created_at`, exactly what you observed; they are now documented that way.
- **Geofence events — your §8.2 finding is fixed.** The geofence's current `alert_on` filter now runs **before** `limit`/paging (it was applied after, so `limit=20` could return 17). A page is now full whenever more events exist, and `total` is exact. `page`/`per_page` are new; the flat `limit` (default 50, max 200) still works and is **ignored when you page**. Behaviour note: the flat list can now return more rows than before for the same `limit` (it used to lose the filtered-out ones).
- **Not in this step:** per-status counts for filter chips (B7). Dropdown pickers must keep using the flat lists until B2 exists.
- **Compatibility:** with none of the new parameters every list behaves as before (byte-identical shape). You can switch each screen's adapter (Phase 2b) list by list.

### 11.2 Still open — owner decisions pending (nothing built, don't build against them)
B2 dropdown options endpoints (next), then B10 bulk, B11 CSV export, B8 map `bbox`, B9 paged detail sub-lists, B3–B6 log-type CRUD / slot delete / layout replace / trip-stop editing / audit fields, B12 granular permissions (fact: today every fleet route is gated by the single `all-fleet` permission and the JWT carries `perms`; there is no finer fleet right and no "my permissions" endpoint), B13 concurrency, and the C14 hard-delete policy. Backend asks the owner one question at a time; each answer is recorded here.
| 2026-09-25 00:08 PKT | frontend | **Phase 2b for B1 built + live-verified — thank you.** Vehicles, Drivers, Yards, Geofences, the geofence-events panel and Trips now send `page` / `per_page` / `search` / `sort_by` / `sort_order` and the mapped §11 filters; **only one page is downloaded** and the browser-side filtering code is deleted. Trips search/sort are server-side (the old "load every page, cap 1,000" search mode is gone); the events panel has real paging and an exact total (your `alert_on` fix confirmed: enter 12 + exit 8 = 20). Selection now spans pages; "Select all N" and "Export CSV" walk the pages of the current filters (`per_page=100`, capped at 1,000 rows) — **still the interim until B10 / B11**. Dropdown pickers (assign driver, tracker, trip form, yard check-in, Trips filters) still read the flat, unpaged lists — **they need B2 before a fleet of thousands**. Also closed: the three frontend verification items from the 23:28 row (in-progress trip edit, Edit hidden on completed/cancelled, visual pass) — all passed. |

### 8.4 Findings / small asks for backend from Phase 2b (all optional refinements; nothing blocks the frontend)
- **NULL ordering.** `sort_by=odometer_km&sort_order=desc` puts the rows with **no odometer first** (asc puts them last). The old client-side sort kept empty values LAST in both directions, which is what an operator expects ("highest odometer" ≠ empties). Please order NULLs last for both directions on every `sort_by` (same for `license_expiry_date`, `hire_date`, `plate`, …).
- **Distinct values for a Category filter (add to B2).** `vehicle_category` is free text and the filter is an exact, case-sensitive match (`Van` → 12, `van` → 0), so the frontend cannot offer a Category dropdown from one page of rows. We **removed the Category filter** for now (the search box still matches category). Please add the distinct categories to the B2 options (e.g. `GET /vehicles/options` or `GET /fleet/options` → `vehicle_categories`), ideally case-insensitive matching.
- **Features the old client-side lists had that have no server parameter yet** (we dropped them rather than fake them): vehicles `sort_by=year`; drivers licence **expired / valid / no-licence** filters (only `license_expiring_within_days` exists) and `sort_by=status`; yards **inactive-only** (`is_active`), **has slots** and `sort_by=radius_m`. Say which of these you will add (suggested names: `license_state=expired|expiring|valid|none`, `is_active`, `min_slots` / `has_slots`, `year`, `radius_m`).
- **Confirmed exactly as documented (live, company 2):** paged envelope and unchanged flat calls; search / status / fuel / has_tracker / assigned / license_expiring_within_days / has_coordinates / has_layout / linked / is_active / event_type filters; multi-key sort with id tie-break; `sort_by=year` → 422 `The selected sort by is invalid.`; trips `search` + `sort_by` + `status`; events `search` + `event_type`; counts always equal `pagination.total`.
- **Phase 3 verification results:** editing an *in-progress* trip → `PUT /trips/{id}` 200 (`purpose`, `notes` changed and returned); completed and cancelled trips show no *Edit trip* button; visual check of the Assignments tab, vehicle History tab, driver Assignments tab, Expiring Documents panel, vehicle photo control and Edit-trip form done (one polish fix: the per-vehicle/driver assignment table now fits the 600 px modal).


---

## 12. Backend reply (owner-directed, 2026-09-24 23:56 PKT, backend) — B2 is BUILT and live-verified: dropdown "options" endpoints

Owner decision Q3 = **unpaginated options endpoints** (your §3.4 proposal). All four are **BUILT** (`D-0165`, contract 258 operations, live-verified with the real data of company 2 and throwaway rows). Exact parameters are in `api_contract/openapi/fleet-*.yaml`.

| Endpoint | Returns (active records only, ordered by name) | Optional parameters |
|---|---|---|
| `GET /vehicles/options` | `id, name, plate, vehicle_category, make, model, lifecycle_status, length_m` + flags **`has_driver`** (an active driver is assigned), **`has_tracker`** (a tracker is installed), **`checked_in`** (currently in a yard slot) | `search` (name/plate/VIN/make/model/category), `has_driver`, `has_tracker` (`1|0`), `limit` |
| `GET /drivers/options` | **`active` drivers only — deactivated *and suspended* drivers are not offered.** `id, name` ("first last"), `first_name, last_name, license_number, license_expiry_date, availability_status` + **`assigned`** (on a vehicle now) | `search`, `assigned` (`1|0`), `availability_status`, `limit` |
| `GET /yards/options` | active yards: `id, name, address, latitude, longitude, slots_count` | `search`, `has_coordinates` (`1|0`), `limit` |
| `GET /geofences/options` | active geofences: `id, name, yard_id, alert_on, radius_m` | `search`, `yard_id`, `linked` (`1|0`), `limit` |

- **Shape:** `{ success, message, data: [ … ], meta: { total, limit, truncated } }` — `data` is a **flat array** (never the paged envelope). `limit` is 1–1000 (default 1000; outside that → 422). `meta.total` is the full number of matching records and `meta.truncated` is `true` when `data` holds fewer than that, so a picker can tell it was cut off and switch to search-as-you-type (`search`). Ids are strings, like the CRUD responses.
- **How to use them:** vehicle/driver/yard/geofence pickers move to these endpoints (Phase 2b). Use the flags to grey rows out (e.g. "assign driver" → `GET /drivers/options?assigned=0`; yard check-in → hide `checked_in` vehicles; "assign driver to vehicle" → `has_driver`). The **tracker picker is unchanged** — keep `GET /vehicles/assignable-trackers`.
- **Same rules as the lists** (they are built on the B1 queries), so an option is visible exactly when the list would show it as active. Company-scoped, same `all-fleet` permission.

**Still open — owner decisions pending (nothing built):** B10 bulk operations (next question), B11 CSV export, B8 map `bbox`, B9 paged detail sub-lists, B3–B6, B12, B13, C14.


---

## 13. Backend reply (owner-directed, 2026-09-25 00:15 PKT, backend) — B10 is BUILT and live-verified: bulk operations

Owner decision Q4 = **bulk endpoints taking `ids` or a `filter`, at most 500 records per request** (your B10 proposal). All ten are **BUILT** (`D-0166`, contract 268 operations, live-verified with throwaway rows). Exact bodies are in `api_contract/openapi/fleet-*.yaml`; every operation's `x-quirks` repeats the rules below.

| Endpoint | Does |
|---|---|
| `POST /vehicles/bulk-deactivate` · `/bulk-reactivate` | the single-vehicle `deactivate` / `reactivate` for each record |
| `POST /drivers/bulk-deactivate` · `/bulk-reactivate` | the single-driver actions |
| `POST /yards/bulk-deactivate` · `/bulk-reactivate` | the single-yard actions |
| `POST /trips/bulk-delete` | `DELETE /trips/{id}` for each record (planned trips only) |
| `POST /geofences/bulk-enable` · `/bulk-disable` · `/bulk-delete` | enable / disable / delete each geofence |

- **Request body: exactly one of** `{ "ids": [1, "2", …] }` **or** `{ "filter": { … } }` (neither / both → **422** `Provide either ids or filter (exactly one).`). `filter` takes **the matching list's own parameters** (no paging/sort): vehicles `search, status, vehicle_category, fuel_type, ownership_type, has_tracker, has_driver, include_inactive`; drivers `search, status, availability_status, employment_status, assigned, license_expiring_within_days, include_inactive`; yards `search, has_coordinates, has_layout, include_inactive`; geofences `search, is_active, yard_id, linked, alert_on`; trips `status` (an **array**), `vehicle_id, driver_id, customer_id, date_from, date_to, search`. Flags may be JSON booleans, `0`/`1` or their string spellings. **In filter mode `include_inactive` defaults to `false` for deactivate and `true` for reactivate** (an explicit `status` always wins). "Select all N matching" = send the same `filter` you show in the list.
- **Cap: 500 per request.** More than 500 ids → **422** `You can act on at most 500 records per request.`; a filter that matches more than 500 → **422** `The filter matches N records; the limit is 500 per request. Narrow the filter.` — in both cases nothing is processed, so the UI can tell the operator to narrow the selection.
- **Execution:** each record is run, one after another, through the **same single-record action** as today, so every guard, message and realtime event is identical (e.g. `Unassign this vehicle's driver and tracker before deactivating it.`, `Check out all vehicles from this yard before deactivating it.`, `Only planned trips can be deleted.`). Duplicate ids are processed once.
- **Response is always HTTP 200** (partial success is normal): `{ success: true, message: "N of M succeeded.", data: { results: [{ id, ok, message }, …], summary: { mode: "ids"|"filter", matched, processed, succeeded, failed } } }`. A refusal or an unknown id is just `ok: false` with that message (`Vehicle not found.`, …) — the `{ id, ok, message }` shape your UI already renders. A batch that is entirely refused is still 200; only a malformed body / over-cap request is 422.
- **Trips:** every non-planned trip in a batch is refused per record. A filter with no `status` therefore reports the non-planned matches as failures — send `status: ["planned"]` to target only deletable trips.
- **Realtime:** each record still emits its usual `fleet:changed` (and `trip:update` `deleted`) event, so a large batch produces one event per record for other operators. **Please tell us (in flow 06 §14) whether that is actually noisy in your UI once you have used the bulk endpoints for real** — if it is, backend can coalesce them into one signal (the owner decides then); nothing changes until you report.
- You can replace the client-side "loop of single calls" with these (Phase 2b), and use them for "Select all N matching".

**Still open — owner decisions pending (nothing built):** B11 CSV export (next question), B8 map `bbox`, B9 paged detail sub-lists, B3–B6, B12, B13, C14.


---

## 14. Backend reply (owner-directed, 2026-09-25 00:21 PKT, backend) — B1 integration received; B2 + B10 are already BUILT (your copy predates them); facts on your §8.3 / §8.4; refinements pending the owner

**Read this first:** the copy you worked from (00:08 PKT) was made **before** backend finished **B2 (§12, dropdown options endpoints)** and **B10 (§13, bulk operations)** — both are **BUILT and live-verified** and are in this copy of the folder (§12, §13, the regenerated `api_contract/` with 268 operations, and the STATUS paragraphs the older copy had dropped). Your "still waiting on B2" and the interim "walk pages" select-all / CSV export can move to them now: pickers → `GET /vehicles|drivers|yards|geofences/options` (§12), "Select all N matching" + bulk deactivate/reactivate/delete → the bulk endpoints (§13). Only **B11 (CSV export)** is still open of your "interim" list. Thank you for the B1 live verification (§8 last row, §8.4) — all confirmed as documented, including your events check (enter 12 + exit 8 = 20).

### 14.1 Facts (checked against the real code)
- **NULL ordering (your §8.4):** confirmed. Postgres sorts NULLs **first** on `DESC` and last on `ASC`, and the API passes that through unchanged. `sort_by` on a nullable column (`odometer_km`, `plate`, `license_expiry_date`, `hire_date`, …) therefore lists empty values first when descending. **Proposed (PENDING OWNER):** NULLs last in both directions on every `sort_by`.
- **Category filter (your §8.4):** confirmed. `vehicle_category` is free text and `vehicle_category=` is an exact, case-sensitive match (`Van` ≠ `van`); the `search` box matches it case-insensitively. **Proposed (PENDING OWNER):** add the distinct categories to `GET /vehicles/options` (and `vehicle_categories` to `GET /fleet/options`) and make the `vehicle_category` filter case-insensitive.
- **Features the old client-side lists had (your §8.4):** confirmed that none of `sort_by=year`, drivers `sort_by=status`, a licence expired/valid/none filter, yards `is_active`-only / `has slots` / `sort_by=radius_m` has a server parameter today. **PENDING OWNER:** which to add (backend's suggestion: all of them, with your suggested names — `license_state=expired|expiring|valid|none`, yards `is_active`, `min_slots`, `sort_by=year|radius_m`, drivers `sort_by=status`).
- **`is_expired` / `is_expiring_soon` (your §8.3):** **neither `GET /compliance-documents` nor `GET /compliance-documents/expiring-soon` returns these flags** (nor did the old Laravel app) — `expiring-soon` is just the same document shape filtered to "expires within 30 days OR already expired", plus a lean `documentable` brief. So computing it from `expiry_date` in the UI is correct. **Adding the flags is a change → PENDING OWNER.**
- **`include_active` on assignment history (your §8.3):** it exists on `GET /vehicles/{id}/assignment-history` and `GET /drivers/{id}/assignment-history` (and is also read by the company-wide `GET /assignment-history`). **Default is "include open assignments"; `include_active=0` returns only closed (historical) assignments; any other value includes open ones.** On the company-wide list it combines with `status` (`active` / `historical`). It is undocumented in the contract only because it is a free string — it will get a `x-quirks` note in the next contract regeneration.
- **`duration_days` (your §8.3):** confirmed — a whole number of days (`floor`), `0` for same-day, `null` while the assignment is still open. Computing hours/minutes from `assigned_at`/`unassigned_at` is right.
- **B3 / B4 (your §8.3):** unchanged — no `DELETE /compliance-documents/{id}` and no `DELETE /vehicles/{id}/image` yet; both wait for the owner's decisions (they are in the B3–B6 group).

### 14.2 Still open — owner decisions pending (nothing built): the refinements above, then B11 CSV export, B8 map `bbox`, B9 paged detail sub-lists, B3–B6, B12, B13, C14. Backend asks the owner one question at a time; each answer is recorded here.


---

## 15. Backend → frontend: WHAT CHANGED SINCE YOUR 00:08 COPY — read this before continuing to build (2026-09-25 00:38 PKT, backend)

Your 00:08 PKT copy was **stale**: it predates three backend rounds. This copy (and the regenerated `api_contract/`, now **268 operations**) supersedes anything your STATUS/notes say about "still waiting on B2 / B10". Everything below is **BUILT, live-verified and in the contract** — nothing here is a proposal.

### 15.1 Resume building here (what you can now do)
1. **Pickers → the options endpoints (B2, §12).** Replace the flat, unpaged lists behind the assign-driver / trip-form / yard-check-in / Trips-filter dropdowns with `GET /vehicles/options`, `/drivers/options`, `/yards/options`, `/geofences/options` (flat array + `meta { total, limit, truncated }`, active records only, drivers `active` only, flags `has_driver` / `has_tracker` / `checked_in` / `assigned`). The tracker picker keeps `GET /vehicles/assignable-trackers`.
2. **"Select all N matching" + bulk actions → the bulk endpoints (B10, §13).** `POST /vehicles|drivers|yards/bulk-deactivate|bulk-reactivate`, `/trips/bulk-delete`, `/geofences/bulk-enable|bulk-disable|bulk-delete` with `{ ids }` **or** `{ filter }` (the list's own filter params; ≤ 500 per request; always HTTP 200 with per-record `{ id, ok, message }`). Delete the "walk the pages, cap 1,000" and the "loop of single calls" code for these.
3. **Your §8.4 requests are done (D-0167) — re-add what you dropped:**
   - **NULLs last** (R1): an explicit `sort_by` now puts rows with no value **last in both directions** on every list (odometer, plate, year, licence expiry, hire date, planned start, trip reference, `created_at`, …). Default orders (no `sort_by`) are unchanged.
   - **Category dropdown** (R2): `GET /fleet/options` → **`data.vehicle_categories`** (the distinct categories in use in your company, collapsed case-insensitively, sorted). The `vehicle_category` filter on `GET /vehicles` is now **case-insensitive** (`Van` = `van`). Restore the Category filter.
   - **The dropped features** (R3): vehicles `sort_by=year`; drivers `sort_by=status` and **`license_state=expired|expiring|valid|none`** (expired = before today, expiring = today…+30 days — the same window as `expiring-soon`, valid = later, none = no date; ANDs with `license_expiring_within_days`; bad value → 422 `The selected license state is invalid.`); yards **`is_active=1|0`** (`0` = deactivated only; wins over `include_inactive`), **`has_slots=1|0`**, **`min_slots=N`**, and **`sort_by=radius_m`** (the radius of the yard's earliest linked geofence; yards with no geofence last). The bulk `filter`s accept the new drivers/yards keys too.
4. **Not added:** `is_expired` / `is_expiring_soon` on compliance documents (owner: skip — compute from `expiry_date`, as you do; neither `GET /compliance-documents` nor `expiring-soon` — nor Laravel — ever returned them).

### 15.2 Also worth re-reading (things that changed or were answered)
- **§11** the B1 list contract (opt-in paging, filters, sorts, the events `alert_on` fix) · **§12** options · **§13** bulk · **§14** the facts on `include_active` (default includes open assignments; `0` = closed only), `duration_days` (whole-day `floor`, `null` while open) and the exact-match category (now case-insensitive).
- **`api_contract/openapi/fleet-*.yaml`** — refresh your view of the contract: new query parameters on seven lists, `POST …/bulk-*` bodies and per-record result shapes, `GET …/options`, `GET /fleet/options` (+ `vehicle_categories`). Each operation's `x-quirks` repeats the rules. `status` on `GET /trips` is documented as a free-form string in the schema (a union can't carry the enum); the accepted values (`planned|in_progress|completed|cancelled`, comma list / repeated `status=` / `status[]=`) are in the quirk text.
- **Realtime (your call):** each record of a bulk action still emits its usual `fleet:changed` (and `trip:update` `deleted`) event — up to 500 per batch. **Please tell us in §16 whether that is actually noisy** once you use the bulk endpoints for real; the owner decides on a coalesced signal only if it is.

### 15.3 Still NOT built (do not build against these) — pending the owner's decisions
**B11** server-side CSV export (next question to the owner — until then keep your interim export), **B8** map `bbox`, **B9** paged detail sub-lists, **B3–B6** log-type edit/delete (`DELETE /compliance-documents/{id}`, `DELETE /vehicles/{id}/image`, slot delete / layout replace, trip-stop editing, audit fields), **B12** granular permissions, **B13** optimistic concurrency, **C14** hard-delete policy.


### 15.4 Addendum (2026-09-25 00:59 PKT, backend) — B11 CSV export is now BUILT (supersedes the B11 line in 15.3)

Owner decision Q6 = **streamed export endpoints, ≤ 50 000 rows**. Live-verified (`D-0168`, contract **274 operations**). This replaces your interim "walk the pages, cap 1,000" export.

| Endpoint | Rows |
|---|---|
| `GET /vehicles/export` · `/drivers/export` · `/yards/export` · `/geofences/export` · `/trips/export` · `/geofences/events/export` | every row matching the list's own filters |

- **Parameters: exactly the matching list's** (`search`, every filter, `sort_by`, `sort_order`; a trips export takes the same `status` list, dates, `search`, …). **`page` / `per_page` are ignored** — you always get *all* matching rows. Send the same query the operator is looking at.
- **Response:** `200 text/csv; charset=utf-8` — UTF-8 **BOM** (Excel reads non-ASCII text correctly), RFC 4180 rows with CRLF, **header row first**, `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC), **`X-Export-Row-Count`** = the number of data rows. Both headers are exposed through CORS, so `fetch()` on your origin can read them.
- **Cap: 50 000 rows.** A larger result is refused **before any byte is sent** with a normal JSON **422** `The export matches N rows; the limit is 50000 per export. Narrow the filter.` — so **check `response.ok` before treating the body as a file**, and show that message.
- **Calling it from the browser:** the endpoints need the bearer token, so a plain `<a href>` won't work — `fetch(url, { headers: { Authorization } })`, then save the response as a Blob (name from `Content-Disposition`, or your own).
- **Columns (documented in each operation's `x-quirks`):** vehicles 25 (`id, name, plate, vin, vehicle_category, make, model, year, fuel_type, ownership_type, lifecycle_status, odometer_km, …, has_driver, has_tracker, checked_in, created_at`), drivers 15 (incl. `assigned`; `license_expiry_date`/`hire_date` are `YYYY-MM-DD`), yards 9 (incl. `radius_m`, `slots_count`), geofences 10 (incl. the yard's name), trips 28 (incl. the `vehicle` and `driver` names), events 9 (incl. geofence and vehicle names; each geofence's `alert_on` applied first, as in the list). Empty values are empty cells; other dates are ISO 8601; booleans `true`/`false`.
- **Formula-injection guard — expect an apostrophe:** a *text* cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading `'` (e.g. a vehicle named `=1+1` exports as `'=1+1`) so a spreadsheet cannot run it. Real numbers (including negative ones) are untouched.
- A failure *after* streaming has started aborts the connection (a broken download) — treat a network error as a failed export and use `X-Export-Row-Count` if you want to sanity-check a complete file.
- Not covered (not asked): compliance documents, assignment history and the log-type lists.

**Still not built (owner decisions pending):** B8 map `bbox`, B9 paged detail sub-lists, B3–B6 (log-type edit/delete, slot delete / layout replace / vehicle-image delete, trip-stop editing, audit fields), B12 granular permissions, B13 optimistic concurrency, C14 hard-delete policy.


### 15.5 Addendum (2026-09-25 01:24 PKT, backend) — B3 + B4 are BUILT: edit/delete for log-type records, slot delete, layout and vehicle-image removal (+ a question for you)

Owner decisions Q7 = **B3/B4 first** and Q8 = **recompute the schedule from the newest remaining log**. All **13 operations are BUILT and live-verified** (`D-0169`, contract **287 operations**; each operation's `x-quirks` repeats the rules; real Cloudflare R2 used for the image/layout checks).

| Endpoint | What it does |
|---|---|
| `PUT /maintenance-schedules/{id}` · `DELETE …` | edit / delete a schedule. **Deleting a schedule keeps its logs** (they stay as history, `maintenance_schedule_id` becomes `null`). |
| `PUT /maintenance-logs/{id}` · `DELETE …` | edit / delete a log. `maintenance_schedule_id` may be changed to another schedule **of the same vehicle** (else 422 `The selected maintenance schedule id is invalid.`). |
| `PUT /fuel-logs/{id}` · `DELETE …` | edit / delete a fuel log (`trip_id`, when sent, must be a trip of the same vehicle — 422 `The selected trip id is invalid.`). |
| `PUT /compliance-documents/{id}` · `DELETE …` | edit `document_type`, `document_number`, `issue_date`, `expiry_date`, `notes` / delete. **The owner (driver or vehicle) is not editable.** This removes your `ZZ Insurance` test document once you delete it. |
| `PUT /incidents/{id}` · `DELETE …` | edit `incident_type`, `severity`, `incident_date`, `description`, `vehicle_id` (`null` clears it; an unknown vehicle → 422 `The selected vehicle id is invalid.`) / delete. The driver is not editable. |
| `DELETE /vehicles/{id}/image` | removes the stored image and clears `image_path`; **idempotent** (200 even with no image). Adding/replacing is still `POST /vehicles/{id}/image`. |
| `DELETE /yards/{yardId}/layout` | removes the layout image; **idempotent**; the slots keep their relative positions (`position_x/y` are fractions of the image). |
| `DELETE /yard-slots/{slotId}` | see the question below. |

- **`PUT` semantics:** the same fields as the matching `POST`, **all optional — send only what changed**; `null` clears a nullable field; an empty body changes nothing; `null` on a required field → 422. Responses are the same record shapes the `POST` returns. Another company's record is a plain **404**, like a missing one. These record types are still not announced over the realtime socket (as before) — refetch after your own action.
- **The schedule rule (owner Q8):** whenever a maintenance log is edited, re-linked or deleted, each schedule it touched gets its **`last_service_date` from its newest remaining linked log** (by service date, then id) and its **`last_service_odometer_km` from the newest linked log that recorded an odometer reading**; when no log remains the schedule keeps its current values. So "next service due" always matches the logs. Creating a log behaves as before.
- **A correction to your §1 table (C7):** a yard layout **could already be replaced** — `POST /yards/{id}/layout` again answers **200 `Layout replaced.`** (201 when new) and deletes the old file; only your UI hid the button. Removing one is the new `DELETE`.

**QUESTION FOR THE FRONTEND — deleting a slot that has history (please answer in §16):** `DELETE /yard-slots/{slotId}` answers **422 `This slot has a vehicle checked in. Check it out first.`** while a vehicle is in it, and — a **deliberately conservative default, not a decision** — **422 `This slot has check-in history and can't be deleted.`** when the slot has *any* check-in/out history, because deleting a slot would also erase that history (a vehicle's `yard_history` would lose those rows). Only slots that never had a vehicle can be deleted today. **Do operators actually need to delete slots that have history?** Typical case we imagine: a slot created by mistake (never used → deletable now) versus a slot that was used and is later removed from the yard (→ refused now). If you need the second case, tell us what should happen to the history: **(1)** keep refusing (current), **(2)** allow it and let that slot's history go with it, or **(3)** add a slot "deactivate" instead of delete (hidden by default, history kept — needs a schema change). The owner decides once you have answered; nothing changes until then.

**Still not built (owner decisions pending):** B5 trip-stop editing, B6 audit fields, B7 status counts / company-wide incidents list, B8 map `bbox`, B9 paged detail sub-lists, B12 granular permissions, B13 optimistic concurrency, C14 hard-delete policy.


### 15.6 Addendum (2026-09-25 02:01 PKT, backend) — B9 paged detail sub-lists are BUILT

Owner decision Q9 = **B9**. Five new `GET` endpoints, **BUILT and live-verified** (`D-0170`, contract **292 operations**; rules in each operation's `x-quirks`):

| Endpoint | Filters (besides `page`, `per_page`, `search`, `sort_by`, `sort_order`) |
|---|---|
| `GET /vehicles/{id}/maintenance-logs` | `date_from`/`date_to` (on `service_date`), `maintenance_schedule_id`; sort `service_date` (default, newest first), `created_at`, `cost` |
| `GET /vehicles/{id}/fuel-logs` | `date_from`/`date_to` (on `fill_date`), `trip_id`; sort `fill_date` (default), `volume`, `cost`, `created_at` |
| `GET /vehicles/{id}/yard-history` | `date_from`/`date_to` (on `checked_in_at`), `yard_id`, `open` (`1` = the stay the vehicle is in now, `0` = finished stays); `search` matches yard name and slot number; sort `checked_in_at` (default), `checked_out_at` |
| `GET /vehicles/{id}/incidents` | incidents involving the vehicle: `date_from`/`date_to`, `severity`, `driver_id`; sort `incident_date` (default), `severity`, `created_at` |
| `GET /drivers/{id}/incidents` | the driver's incidents: `date_from`/`date_to`, `severity`, `vehicle_id`; same sorts |

- **Always paged** (unlike the opt-in B1 lists): `data: { items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100. `search` = case-insensitive contains (maintenance: service type, vendor, notes; fuel: vendor, station, receipt; incidents: type, description). Unknown `sort_by` → 422 `The selected sort by is invalid.`; an explicit sort puts empty values last in both directions; an invalid date / severity / `per_page` → 422; an unknown or other company's vehicle/driver → 404 `Vehicle not found.` / `Driver not found.`.
- **Record shape = the embedded one** (same fields as `maintenance_logs[]`, `fuel_logs[]`, `yard_history[]` in `GET /vehicles/{id}` and the incident shape used by `POST /drivers/{id}/incidents`), so a detail tab can switch to the paged endpoint without remapping.
- **Detail responses are unchanged** (compatibility): `GET /vehicles/{id}` still embeds the latest 20 maintenance logs / fuel logs / yard events, and `GET /drivers/{id}` its latest few incidents. **One embedded list is uncapped:** `driver_assignment_history` on `GET /vehicles/{id}` is the vehicle's *whole* assignment history — keep using the paged `GET /vehicles/{id}/assignment-history` (you already do since Phase 3). If you want the embedded lists dropped or capped, say so and the owner decides.

**Still not built (owner decisions pending):** B5 trip-stop editing, B6 audit fields, B7 status counts / company-wide incidents list, B8 map `bbox`, B12 granular permissions, B13 optimistic concurrency, C14 hard-delete policy. **Still open questions for you (please answer in flow 06 §16):** (1) do operators need to delete yard slots that have check-in history (§15.5), (2) are the per-record realtime events of bulk actions noisy (§15.2).

---

## 16. Frontend reply (2026-09-25 01:36 PKT, frontend) — B2, B10, B11 and the D-0167 refinements are integrated and live-verified; answers to your questions

Thank you — your 00:38 note was right: our 00:08 copy was stale. Everything in §12–§15 is now **built into the frontend and verified live against the real backend** (company 2, throwaway rows; test data restored). The frontend's interim code (loop of single calls, "walk the pages, cap 1,000", client-side pickers) is deleted.

### 16.1 Answer to your question — is the per-record `fleet:changed` fan-out noisy? **Yes, but the frontend now fixes it on its side; no backend change needed.**
Measured: one `POST /vehicles/bulk-deactivate { filter }` of **60 vehicles** made the Vehicles list refetch **61 times** (one per per-record event). The frontend now coalesces invalidations (350 ms quiet period, ≤ 1.5 s): the same bulk causes **3** follow-up requests (60 vehicles, 40 drivers, 30 yards, 29 trips, 22 geofences all measured, 2–5 requests each). So please **do not build a coalesced signal on our account** — keep the per-record events (other clients may rely on them).

### 16.2 What was integrated and checked (all against the real API)
- **B1 restored controls (D-0167):** Category dropdown from `GET /fleet/options` → `vehicle_categories` (`Van` = 12, case-insensitive confirmed), `sort_by=year`, drivers `license_state` (expired 9 / expiring 8 / valid 9 / none 11) and `sort_by=status`, yards `is_active` (inactive 10 / active 27), `has_slots`, `sort_by=radius_m`; **NULLs now last in both directions** (verified: `v*N*` for asc and desc).
- **B2 options:** every picker (assign driver = `drivers/options?assigned=0`, assign vehicle = `vehicles/options?has_driver=0`, yard check-in = vehicles minus `checked_in`, New Trip vehicle/driver/yard stops, geofence "use a yard's coordinates", Trips and Assignments filter dropdowns) uses the options endpoints; counts equal the API (66 / 37 / 27 / 35 / 64). A trip created through the form (201) and a yard check-in through the picker (201) worked. A search box appears automatically when `meta.truncated`.
- **B10 bulk:** `{ ids }` across pages and `{ filter }` ("Select all N matching", behind an inline confirm) on vehicles, drivers, yards (deactivate / reactivate), trips (`bulk-delete`, only planned ids sent) and geofences (`bulk-enable|disable|delete`). Exact bodies seen: `{"filter":{"search":"ZZ Bulk"}}`, `{"filter":{"search":"ZZ Bulk","status":"retired"}}` + `"sold"`, `{"filter":{"status":["planned"],"search":"ZZ-BULK"}}`, drivers `status:"inactive"`, yards `is_active:0`. Results (`60 of 60`, `29 of 29`, …) match; per-record refusals are rendered from your `results[]`.
- **B11 export:** all six `GET …/export` (vehicles 66, drivers 46, yards 36, geofences 33, trips 41, events 20 rows = the list totals); a filtered trips export (status + search) = 18 rows, all `completed`, equal to the list; the file name comes from `Content-Disposition`; a forced 422 (`sort_by=bogus`) shows your message ("The selected sort by is invalid.") — the JSON error body is read out of the blob.

### 16.3 Small findings / optional asks (nothing blocks the frontend)
1. **Options are active-only, which is wrong for history filters.** The Trips and Assignments *filter* dropdowns cannot pick a **deactivated vehicle/driver** (their trips/assignments still exist). Please add **`include_inactive=1`** to `GET /vehicles|drivers|yards|geofences/options` (default unchanged) — the frontend will pass it for filter dropdowns only.
2. **Bulk reactivate of an already-active record reports success** (`"Vehicle reactivated successfully."`, counted in `succeeded`). Idempotent, so harmless, but "60 reactivated" overstates when most were already active. The frontend now narrows filter-mode requests itself (reactivate = inactive only, deactivate = active only, trips = planned, geofence enable/disable = opposite state), so no change is required; a distinguishable message/flag (e.g. `ok:true, changed:false`) would still be nicer for the id-mode case.
3. **Bulk `results[]` carry only `id`** — for refusals the UI shows the name it already knows (ids mode) or `#id` (filter mode). Adding `name` (or `label`) to each result would make filter-mode refusals readable.
4. **Formula-injection guard on phone numbers:** a legitimate phone such as `+92 300 1000040` is exported as `'+92 300 1000040` (leading apostrophe). Safe, but every international number in the drivers export gets it. Owner decision on your side (e.g. exempt cells that match a plain phone pattern, or guard only `=` / `@` / tab / CR).
5. **Data anomaly seen (not a bug now):** vehicle 2 was checked in at **two slots of yard 1 at once** (created before your one-open-slot rule). Nothing to do; mentioned so a check-out looks explainable.
6. **Bulk over the cap** was not exercised live (would need > 500 rows); the 422 message path is exercised through the export 422 only.

### 16.4 Where the frontend stands now (details in the frontend's task.md gap list)
Done: B1, B2, B10, B11, D-0167 restoration. **Still needed from backend (all pending your owner decisions):** B8 map `bbox`, B9 paged detail sub-lists, B3–B6 (log-type edit/delete, slot delete, layout replace, vehicle-image delete, trip-stop editing, audit fields), B12 granular permissions, B13 optimistic concurrency, B7 status counts, C14 hard-delete policy — plus the optional items in §16.3. Also recorded on our side (not asks yet): a possible driver **photo** upload/delete endpoint and yard photo, for a nicer UI.


---

## 17. Backend reply to §16 (2026-09-25 02:06 PKT, backend) — your 01:36 copy merged (it predated B3/B4 and B9); facts on §16.3; four small changes pending the owner

**Read this first:** the copy you worked from (01:36 PKT) was made **before** the backend finished **B3 + B4 (§15.5, 01:24)** and **B9 (§15.6, 02:01)** — both are **BUILT and live-verified** and are in this copy, together with the regenerated contract (**292 operations**). So the "still needed from backend" list in your §16.4 is stale: **B3, B4 and B9 are done**; what is still open is **B5** (trip-stop editing), **B6** (audit fields), **B7** (status counts / company-wide incidents list), **B8** (map `bbox`), **B12** (granular permissions), **B13** (optimistic concurrency) and **C14** (hard-delete policy) — all waiting for owner decisions, not built. Also **still unanswered (you had not seen it): the slot question in §15.5** — do operators need to delete yard slots that have check-in history? — **please answer in a new §18** (§16 is yours).

Thank you for §16: integrating B2 / B10 / B11 / D-0167 end to end with the exact bodies, counts and the forced 422 is exactly the verification we hoped for.

### 17.1 Your fan-out answer (§16.1) — recorded
The per-record `fleet:changed` events stay exactly as they are (no coalesced signal will be built); your 350 ms / 1.5 s coalescing (61 → 3 refetches for a 60-record bulk) is the right place for it. Closed.

### 17.2 Facts on §16.3 (checked against the code and the live data) and what is pending
1. **Options are active-only — confirmed, by design (D-0165)**, so a deactivated vehicle/driver/yard/geofence cannot be picked in a *filter* dropdown. **PROPOSED (PENDING OWNER):** an optional **`include_inactive=1`** on `GET /vehicles|drivers|yards|geofences/options` — default unchanged; with it, vehicles also return `retired`/`sold`, drivers all statuses, yards and geofences the inactive ones — for history-filter dropdowns only.
2. **Bulk reactivate of an already-active record reports success — confirmed** (the single-record action is unconditional and idempotent, and it also emits a `fleet:changed` event even though nothing changed). **PROPOSED (PENDING OWNER):** each `results[]` entry gains **`changed: boolean`** (`false` when the record was already in the target state; no event is emitted in that case) and `summary` gains a `changed` count; `ok` stays `true` and the message stays as is, so nothing existing breaks.
3. **`results[]` carry only `id` — confirmed.** **PROPOSED (PENDING OWNER):** each result gains **`label`** (vehicle name, driver "first last", yard/geofence name, trip reference) so filter-mode refusals are readable. Additive.
4. **The apostrophe on phone numbers (D-0168) — confirmed, deliberate, and a real trade-off.** A guard cannot tell a phone from a formula: `+92-300-1000040` is evaluated by Excel as arithmetic (a negative number) and `+1+1` as a formula, so any text cell that starts with `+`, `-`, `=`, `@`, a tab or a carriage return is prefixed. The cost is a visible `'` on every international number. **PENDING OWNER:** keep the guard as it is (safest), or exempt cells that match a strict phone pattern (`+` followed by digits and spaces only — no operators, no letters). Nothing changes until the owner decides.
5. **The two-slot anomaly (§16.3 item 5) is already resolved in the live data:** only one vehicle is checked in now (vehicle 2, slot 1) and no vehicle has two open stays; the D-0153 rule (one open slot per vehicle) blocks new ones.
6. **Bulk over the cap (§16.3 item 6) — confirmed:** the 500-record limit is covered by unit tests only (nothing to reach it live); its message is `You can act on at most 500 records per request.` (ids) / `The filter matches N records; the limit is 500 per request. Narrow the filter.` (filter). Your export 422 exercises the same 422 mechanism with a different message.
- **Driver / yard photos (§16.4, "not asks yet"):** noted. For the record, `drivers.photo_path` exists in the schema but there is no upload/delete endpoint; a yard has no photo column (its layout image is the closest thing). Tell us formally if you want them and the owner decides.

**Owner decisions pending on this section:** items 1, 2, 3 and 4 above (all small and additive). Nothing changes on the backend until they are made and marked BUILT here.


### 17.3 Addendum (2026-09-25 02:30 PKT, backend) — your §16.3 asks 1–3 are BUILT (item 4 unchanged) — **and the API RESPONSE CHANGES you must apply**

Owner decision Q11 = **build (1), (2), (3) as proposed; keep the phone-number apostrophe (4)**. **BUILT and live-verified** (`D-0171`; contract still **292 operations**, the affected operations' `x-quirks` are updated). The owner asked that every response change be listed so you can update your types — **the checklist follows.**

#### A. Changes made now (D-0171) — update your types
| Where | Change | Type of change |
|---|---|---|
| `GET /vehicles/options`, `/drivers/options`, `/yards/options`, `/geofences/options` | new optional query **`include_inactive=1`** (default unchanged = active only). Vehicles: also `retired`/`sold`; drivers: every status (`inactive`, `suspended`); yards: deactivated; geofences: disabled. | new parameter |
| `GET /drivers/options` rows | new field **`status`** (`active` / `inactive` / `suspended`) | additive field |
| `GET /yards/options` rows, `GET /geofences/options` rows | new field **`is_active`** (boolean) | additive field |
| every `POST …/bulk-*` (10 endpoints) — **each `data.results[]` item** | now `{ id, ok, **changed**, **label**, message }`: **`changed`** = `true` when the record really changed, `false` for every refusal **and for a record already in the target state**; **`label`** = vehicle name / driver "first last" / yard or geofence name / trip reference, `null` when the record is missing or has no name (also filled for refusals) | additive fields |
| every `POST …/bulk-*` — **`data.summary`** | now `{ mode, matched, processed, succeeded, **changed**, failed }` | additive field |
| bulk **behaviour** | a record **already in the target state is skipped** — not written, **no realtime event** — and reported `ok: true, changed: false` with `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise **Driver**, **Yard**) / `Geofence is already enabled.` / `Geofence is already disabled.`; it counts in `succeeded` but not in `summary.changed`. A `sold` vehicle counts as already deactivated (a bulk deactivate no longer turns it into `retired`). Reactivating `retired`, `sold`, `in_maintenance` vehicles or `inactive`/`suspended` drivers is a real change. Trips have no such state (`changed` is always `true` on success). | behaviour |
| CSV export | **unchanged** — a text cell starting with `+`, `-`, `=`, `@`, tab or CR keeps its leading apostrophe (so `+92 300 …` is exported as `'+92 300 …`); owner decision: keep. | none |

Use it as you proposed: pass `include_inactive=1` for **filter** dropdowns only; render `label` for refusals (fall back to `#id` when `null`); show "already active/deactivated" rows as no-ops (`changed: false`) instead of "reactivated".

#### B. Consolidated checklist — every change to an EXISTING endpoint's response or behaviour since D-0163 (all already in this copy's contract; tick them off against your code)
- **Lists (`GET /vehicles`, `/drivers`, `/yards`, `/geofences`, `/geofences/events`, `/compliance-documents`) — D-0164:** with **no** paging parameter the response is exactly as before (flat array). With `page` and/or `per_page` **`data` becomes `{ items, pagination: { page, per_page, total, total_pages } }`** (opt-in). `GET /trips` keeps its Laravel paginator envelope and gains `search`, `sort_by`, multi-value `status` (`a,b`, repeated `status=`, or `status[]=`).
- **`GET /geofences/events` — D-0164:** the geofence's `alert_on` filter now runs **before** `limit`/paging, so a flat call can return **more rows than before** for the same `limit` (it used to lose the filtered-out ones).
- **Explicit `sort_by` — D-0167:** rows with an empty value are **last in both directions** (Postgres would put them first on `desc`); default orders (no `sort_by`) are unchanged.
- **`vehicle_category` filter — D-0167:** now case-insensitive. **`GET /fleet/options`** gained **`data.vehicle_categories`** (D-0167).
- **Bulk deactivate of a `sold` vehicle — D-0171 (above):** no longer converts it to `retired`.
- **`GET /vehicles/{id}` — D-0170:** the JSON is **unchanged**; only the *contract representation* of `yard_history[].slot` changed (`anyOf [Slot, null]` via a shared component instead of an inline nullable object — same properties). Its embedded lists are still the latest 20; `driver_assignment_history` is still uncapped (use the paged `GET /vehicles/{id}/assignment-history`).
- **Realtime / CORS — D-0168:** `Access-Control-Expose-Headers: Content-Disposition, X-Export-Row-Count` on every response (needed for the CSV export from a browser).
- **New (not changes):** options endpoints (D-0165), bulk endpoints (D-0166), CSV exports (D-0168), edit/delete + slot/layout/image removal (D-0169), paged sub-lists (D-0170).

**Still not built (owner decisions pending):** B5, B6, B7, B8, B12, B13, C14. **Still owed by you:** the answer to the yard-slot question (§15.5) in a new §18.


---

## 18. Frontend reply (2026-09-25 02:56 PKT, frontend) — the yard-slot answer (owner decision), B3 + B4 + B9 + D-0171 integrated and live-verified

### 18.1 ANSWER to §15.5 — deleting a yard slot that has check-in history (owner decision)
**Option (1): keep refusing, for now.** Only never-used slots can be deleted; a slot with a vehicle in it or with any check-in history stays refused with your two 422 messages, which the UI shows verbatim. **Later, after the owner is asked again, the frontend expects to request option (3) — a slot "deactivate"** (hidden by default, history kept, needs a schema change) — but that is **not an ask yet**: nothing to build on the backend now. Recorded on our side as a to-do.

### 18.2 What was integrated and checked live (throwaway `ZZ` records; test data cleaned up)
- **B3 edit / delete** (PUT sends only the changed fields, `null` clears, business 422s shown verbatim): maintenance schedules (edit `{interval_days}`, delete → its logs stay, `maintenance_schedule_id` becomes `null` ✔), maintenance logs (edit `{service_date, cost}` → the schedule's next due moved 2026-10-30 → 2026-09-29 exactly as your Q8 rule says ✔; delete ✔), fuel logs (edit `{volume}` / delete → average economy recomputed 6.38 → 5.79 → 7.01 km/L ✔), compliance documents (edit `{notes}`, delete — the old `ZZ Insurance` test document is gone ✔), incidents (edit `{severity}`, delete, both from the vehicle and the driver side ✔).
- **B4:** `DELETE /vehicles/{id}/image` ✔ (removed, re-uploaded); `POST /yards/{id}/layout` again = "Layout replaced." ✔ (the UI now has *Replace layout image* — thank you for the correction); `DELETE /yards/{id}/layout` ✔ (slot positions unchanged in the API); `DELETE /yard-slots/{id}`: a disposable slot deleted (200); an occupied slot and a slot with history both show your exact 422 messages ✔.
- **B9 paged sub-lists:** `GET /vehicles/{id}/maintenance-logs | fuel-logs | yard-history | incidents` and `GET /drivers/{id}/incidents` back the detail tabs (10 per page, date range, search, schedule / stay / severity filters). Checked against the API: fuel logs 10 + 2 of 12, date range 5–8 Sep = 4, search "Station B" = 2, incidents severity=moderate = 1, vehicle incidents / driver incidents / yard-history requests as documented. The old "Incident History … once vehicle-level tracking is implemented" placeholder is replaced by the real list.
- **D-0171:** bulk `results[]` `{ id, ok, changed, label, message }` + `summary.changed` adopted — a refused vehicle is named by your `label` (`ZZ Truck A — Unassign this vehicle's driver and tracker before deactivating it.`), "already …" rows are counted as no-ops; the options accept `include_inactive=1` (the Trips and Assignments filter dropdowns now find deactivated vehicles/drivers: 66 / 46 = your totals) and the new `status` / `is_active` option fields match the contract.
- **Your §17.3-B checklist:** ticked against our code — opt-in paging envelope, `alert_on` before paging, NULLs last, case-insensitive category + `vehicle_categories`, options / bulk / export shapes, the CORS export headers (the CSV download reads `Content-Disposition` and `X-Export-Row-Count` ✔) — nothing further to change. We still read the embedded `yard_history` (latest 20) only for the "Currently parked" card.

### 18.3 Small findings / optional asks (nothing blocks the frontend)
1. **Incident records carry only ids** (`driver_id`, `vehicle_id`, `logged_by`) — no name. The UI therefore cannot show "which driver" on a vehicle's incident or "which vehicle" on a driver's. Optional: add a lean `driver` / `vehicle` brief (`{ id, name }`) to the incident shape (additive).
2. **Not exercised live:** the UI wording for "already active/deactivated" rows (the frontend only sends rows that can change, so it never gets one); the 500-record bulk cap (unit-tested on your side). Documented shapes were checked with direct calls.
3. **Untouched by design:** compliance documents still use the flat per-owner list (few rows per owner); the B1 paging on that endpoint is available if ever needed.

### 18.4 Where the frontend stands (details in the frontend's task.md gap list)
Done: B1, B2, B3, B4, B9, B10, B11, D-0167, D-0171. **Still needed from backend (owner decisions on your side): B5 trip-stop editing, B6 audit fields, B7 status counts / company-wide incidents list, B8 map `bbox`, B12 granular permissions, B13 optimistic concurrency, C14 hard-delete policy.** Frontend ideas for later (not asks): driver photo upload / delete endpoint, optional yard photo (see §17.2).

---

## 19. Backend reply (owner-directed, 2026-09-25 03:05 PKT, backend) — B6 is BUILT and live-verified: audit fields ("who created / last changed") on every fleet record

Owner decisions Q10 = **B6 next** and Q12 = **all fleet record types, ids and names, no backfill**. **BUILT and live-verified** (`D-0172`, contract still **292 operations**; every affected operation's `x-quirks` carries the same note). Your §18 answer on slot deletion (keep refusing) is received — see §20 for the reply.

### 19.1 What every fleet record now carries (additive — nothing existing changed or was renamed)
```json
{ "created_by": "2", "updated_by": "2",
  "created_by_user": { "id": "2", "first_name": "Nuzzi2", "last_name": "Developer2" },
  "updated_by_user": { "id": "2", "first_name": "Nuzzi2", "last_name": "Developer2" } }
```
- `created_by` / `updated_by` are **user id strings or `null`**; `created_by_user` / `updated_by_user` are `{ id, first_name, last_name }` or `null` (also `null` when a user no longer exists).
- **`null` means one of two things — the API does not distinguish them, you choose the wording:** *unknown* (a record created **before** this change: nobody knows who created it, and we did not invent it — every existing row reads `null`), or, for `updated_by` only, **"System"** (the last change was automatic — a tracker / worker, e.g. a sensor filling a trip stop). A record created by a user always has `created_by`; a record a user has not edited yet has `updated_by` equal to its creator.
- `updated_at` (already on every record) is the time of the last change; together they give "Last edited by *Nuzzi2 Developer2* on *25 Sep 2026*".

### 19.2 Where they appear — the checklist of every response that changed (types to update)
| Record | Responses that now include the four fields |
|---|---|
| **Vehicle** | `GET /vehicles` (flat + paged), `GET /vehicles/{id}` (`data.vehicle`), `POST /vehicles`, `PUT /vehicles/{id}`, `POST /vehicles/{id}/deactivate` · `/reactivate`, `POST` / `DELETE /vehicles/{id}/image` |
| **Driver** | `GET /drivers` (flat + paged), `GET /drivers/{id}`, `POST /drivers`, `PUT /drivers/{id}`, `POST /drivers/{id}/deactivate` · `/reactivate` |
| **Yard** | `GET /yards`, `GET /yards/{id}`, `POST /yards`, `PUT /yards/{id}`, `POST /yards/{id}/deactivate` · `/reactivate` |
| **Yard slot** | `GET /yards/{id}` (`data.slots[]`), `POST /yards/{yardId}/slots`, `PUT /yard-slots/{slotId}` — **slots also gained `created_at` and `updated_at`** (they had none) |
| **Geofence** | `GET /geofences`, `POST /geofences`, `PUT /geofences/{id}` (a yard's auto-created linked geofence is created by whoever created/edited the yard) |
| **Trip** | `GET /trips`, `POST /trips`, `GET /trips/{id}`, `PUT /trips/{id}`, `POST /trips/{id}/start` · `/complete` · `/cancel`. **Trips already had `created_by` (all responses) and `created_by_user` (detail only): `created_by_user` is now on every trip response, plus the new `updated_by` / `updated_by_user`.** A stop arrival/departure recorded by the sensor changes the trip's `updated_by` to `null` ("System"). |
| **Maintenance schedule** | `GET /vehicles/{id}` (`data.maintenance_schedules[]`), `POST /vehicles/{vehicleId}/maintenance-schedules`, `PUT /maintenance-schedules/{id}` |
| **Maintenance log** | embedded `maintenance_logs[]`, `GET /vehicles/{id}/maintenance-logs` (B9), `POST /vehicles/{vehicleId}/maintenance-logs`, `PUT /maintenance-logs/{id}` |
| **Fuel log** | embedded `fuel_logs[]`, `GET /vehicles/{id}/fuel-logs` (B9), `POST /vehicles/{vehicleId}/fuel-logs`, `PUT /fuel-logs/{id}` |
| **Incident** | `GET /drivers/{id}` (`data.incidents[]`), `GET /drivers/{id}/incidents` and `GET /vehicles/{id}/incidents` (B9), `POST /drivers/{driverId}/incidents`, `PUT /incidents/{id}` |
| **Compliance document** | `GET /compliance-documents`, `GET /compliance-documents/expiring-soon`, `POST /compliance-documents`, `PUT /compliance-documents/{id}` |

- **Maintenance logs, fuel logs and incidents:** `created_by` **equals the existing `logged_by`** (which stays as it was) — use either.
- **Not changed:** the CSV exports (no audit columns), the socket events, delete responses, yard layouts and slot check-in/out events, the tracker / driver assignment records (they keep their own `assigned_by` / `unassigned_by`), the options endpoints and the bulk results.
- **Cost:** names come from one batched lookup per response, so a page of 100 rows adds at most one small query; a failing lookup never fails the request — the ids stay and the names are `null`.

### 19.3 Live check
150 assertions against the rebuilt stack as the test user with throwaway rows (all deleted): create + edit of a vehicle, driver, yard (+ its auto-linked geofence), geofence, slot, trip, schedule, maintenance log, fuel log, incident and compliance document each report the caller as creator and last editor **with names**, in flat and paged lists, details, embedded detail lists, the B9 sub-lists, `expiring-soon` and after deactivate; a pre-existing vehicle reads `null` on all four fields; a maintenance log's `created_by` = its `logged_by`. A *system* write (sensor / worker) is covered by a real-Postgres backend test only.

**Still not built (owner decisions pending):** B5, B7, B8, B12, B13, C14. **Still owed by you:** update your types from §19.2 (B6 was built after your 02:56 copy, so §18.4's "B6 still needed" is stale).

---

## 20. Backend reply to §18 (2026-09-25 04:08 PKT, backend) — your 02:56 copy merged (it predated B6 / §19); slot answer recorded; one optional ask pending the owner

**Read this first:** your 02:56 PKT copy was made **before** backend finished **B6 audit fields (§19, D-0172)**, so your §18.4 "still needed: B6" is stale — B6 is **BUILT and live-verified**; every fleet record now carries `created_by` / `updated_by` / `created_by_user` / `updated_by_user`, and §19.2 lists the responses to update your types from. Your copy also carried the older contract; it was restored from git — the folder you receive next has the regenerated **292-operation** contract with the audit fields.

### 20.1 Your §18.1 answer — recorded (D-0173)
Owner decision received: **keep refusing** slot deletion when the slot has any check-in/out history (both 422 messages unchanged). Nothing changes on the backend. If the owner later asks for a slot **deactivate** (option 3 — `is_active`, hidden by default, history kept, migration 009) it will arrive as a new request; noted, not built.

### 20.2 Your §18.2 results — received, thank you
The B3 / B4 / B9 / D-0171 checks (schedule recompute 2026-10-30 → 2026-09-29, fuel-economy recompute, layout replace, image removal, exact 422 messages, `label` / `changed`, `include_inactive` totals 66 / 46) all match what the backend live-verified; nothing needs backend action. Confirmed facts for your "not exercised" list: the 500-record bulk cap is covered by unit tests only, its messages are as documented in §13/§17.3.

### 20.3 Your §18.3 item 1 — incidents carry only ids: **PENDING OWNER (additive change)**
Confirmed against the code: an incident object has `driver_id`, `vehicle_id`, `logged_by` (+ now the §19 audit fields) and no names, in every place it appears (`GET /vehicles/{id}/incidents`, `GET /drivers/{id}/incidents`, `GET /drivers/{id}` `data.incidents[]`, `POST /drivers/{id}/incidents`, `PUT /incidents/{id}`). **Proposal (not built until the owner decides):** add `driver: { id, first_name, last_name } | null` and `vehicle: { id, name, plate } | null` to the incident shape — additive, one batched lookup per response like the audit names. Backend will ask the owner and record the answer here; do not build against it yet.

**Still not built (owner decisions pending):** B5 trip-stop editing (next), B7, B8, B12, B13, C14. Frontend ideas you listed (driver photo upload/delete, yard photo) are noted, not asks.

---

## 21. Backend reply (2026-09-25 04:17 PKT, backend) — your §18.3 item 1 is BUILT and live-verified: incident objects now carry `driver` and `vehicle` name briefs

Owner decision Q14 = **build it**. **BUILT and live-verified** (`D-0174`, contract still **292 operations**; the five operations' `x-quirks` repeat this). Purely additive — nothing existing changed or was renamed.

### 21.1 The change (update your types)
Every incident object gets two new fields:
```json
{ "driver":  { "id": "3", "first_name": "Jane", "last_name": "Doe" },
  "vehicle": { "id": "7", "name": "Truck 7", "plate": "AB-123" } }
```
- `driver` is `null` only if the driver is not visible to the caller's company; `vehicle` is `null` when the incident has no vehicle, or the id is unknown / **another company's** (never leaked — verified live with a planted foreign vehicle id).
- **Where:** `GET /vehicles/{id}/incidents`, `GET /drivers/{id}/incidents`, `GET /drivers/{id}` (`data.incidents[]`), `POST /drivers/{driverId}/incidents`, `PUT /incidents/{id}`. Same object everywhere, so one type serves all five.
- Names are resolved with one batched query for drivers and one for vehicles per response (a page of 100 incidents adds two small queries). The §19 audit fields (`created_by_user` …) are unchanged and still there.

### 21.2 Live check
10 assertions against the rebuilt stack with throwaway rows (deleted): create with and without a vehicle, `PUT` adding a vehicle, the driver list, the vehicle list, and the driver detail's embedded incidents all carry the briefs; a foreign-company vehicle id planted in SQL stayed `null` while the driver was still named.

**Reminder:** B6 (§19) and this change are both newer than the folder you last received — copy this folder again when you next take a copy from backend. **Still not built (owner decisions pending):** B5 trip-stop editing (next), B7, B8, B12, B13, C14.

---

## 22. Backend reply (2026-09-25 04:34 PKT, backend) — B5 is BUILT and live-verified: edit a planned trip's stops, plus a new `trip:update` reason `updated`

Owner decisions Q15–Q18 = **all recommended**. **BUILT and live-verified** (`D-0175`, contract still **292 operations**; `PUT /trips/{id}` and `POST /trips` carry the same rules in their `x-quirks`, and `API_CONTRACT.md` §4.2/§4.6 lists the new reason).

### 22.1 The endpoint — `PUT /trips/{id}` with `planned_yards`
Body (all keys optional, as before, **plus**):
```json
{ "planned_yards": [
    { "id": "31", "yard_id": 5, "stop_purpose": "load", "planned_arrival_at": "2026-10-01T08:00:00Z", "planned_departure_at": null, "notes": "dock 2" },
    { "yard_id": 7, "stop_purpose": "unload" }
] }
```
- **Replace-the-list, only while the trip is `planned`.** The array becomes the trip's stop list **in the order sent** (`sequence` 1..n). An entry **with `id`** keeps that stop — a field you leave out **keeps its value**, `null` **clears** it. An entry **without `id`** creates a stop. A stop that is **not listed is deleted**. **Omit `planned_yards` → stops unchanged; `[]` → all stops removed.** One transaction: all or nothing.
- A **started / completed / cancelled** trip: 422 `Stops can only be edited while the trip is planned.` (its other fields can still be edited while `in_progress`; the manual arrive/depart corrections are unchanged).
- **Response** (200, same shape as before) now also carries **`planned_yards`** — the stops after the edit, each with its `id`, so newly created stops get theirs.
- Stop `notes` are accepted here and on `POST /trips` (they already existed on stop objects).

### 22.2 Validation (create **and** edit share these — 422 `Validation failed.` + `errors`)
| Key | Message |
|---|---|
| `planned_yards.N.yard_id` | `The selected yard id is invalid.` (not one of your yards — unchanged rule) |
| `planned_yards.N.planned_departure_at` | `The planned departure can't be before the planned arrival.` (for a kept stop it is checked against the value the stop already has when you leave a time out) |
| `planned_yards` | `A trip can have at most 100 stops.` |
| `planned_yards.N.id` | `The selected stop id is invalid.` (not a stop of this trip) · `The same stop can't appear twice.` |
`N` = the entry's position in your array, from 0. **Not checked (owner decision):** stop times against the trip's planned window or each other, ascending order, the same yard twice (a supported case).

### 22.3 The list of changes to EXISTING behaviour (update your types)
1. `PUT /trips/{id}` request gains `planned_yards`; its response gains `planned_yards`.
2. `POST /trips`: each `planned_yards[]` entry accepts `notes`; **two new 422s on create** (departure before arrival, more than 100 stops) — a small tightening.
3. **Realtime: `trip:update` has a new `reason: "updated"`**, sent after **every** successful `PUT /trips/{id}` (trip fields and/or stops — before this, `PUT` announced nothing, so other operators' screens only caught up by polling). Payload as always (`tripId`, `status`, `awaitingCompletion`, `destinationReachedAt`, `occurredAt`, `stop: null`) — treat it as "refetch this trip"; a handler that switches on `reason` must not drop unknown values. Your own action echoes back too. One event per call (a whole stop-list edit = one event).

### 22.4 Live check
25 assertions on the rebuilt stack with a real socket client and throwaway rows (deleted): create with 3 stops; one `PUT` that reorders, keeps by `id`, drops one, adds one and clears a field (sequences 1..3, the dropped stop really gone, omitted field kept / `null` cleared); plain edit keeps the stops; every 422 above with nothing changed; same yard twice allowed; `[]` clears; after `start`, the stop edit is refused while a field edit still works; the socket received exactly one `updated` per successful `PUT` and none for the refused ones.

**Still not built (owner decisions pending):** B7, B8, B12, B13, C14. The frontend's earlier folder copy predates B6 (§19), the incident briefs (§21) and this — copy this folder again.

---

## 23. Backend reply (2026-09-25 04:47 PKT, backend) — B13 is BUILT and live-verified: optimistic concurrency (`expected_updated_at` → 409) on every fleet `PUT`

Owner decisions Q19–Q22 = **all recommended**. **BUILT and live-verified** (`D-0176`, contract still **292 operations**; each affected `PUT` carries the same note in its `x-quirks`, and `API_CONTRACT.md` §2 has a conventions bullet). Purely **opt-in** — a request without the new field behaves exactly as before.

### 23.1 How to use it
Send back the `updated_at` you last saw for the record, in the **body** of the `PUT`:
```json
PUT /vehicles/12
{ "plate": "AB-123", "expected_updated_at": "2026-09-25T10:00:00.000Z" }
```
- **Matches** the record's current `updated_at` → the edit proceeds as usual (200) and the response carries the new `updated_at` — keep that for the next edit.
- **The record changed since** → **HTTP 409, nothing is written**:
```json
{ "success": false,
  "message": "This record was changed by someone else. Reload it and try again.",
  "current": { "id": "12", "updated_at": "2026-09-25T10:07:00.000Z", "updated_by": "3",
               "updated_by_user": { "id": "3", "first_name": "Amina", "last_name": "Khan" } } }
```
  `current.updated_by` **`null`** = the last change was automatic (a sensor / worker) — show it as "System". Use it for "changed by Amina Khan at 10:07 — reload?", then refetch the record and let the operator re-apply.
- **Field absent** → no check (today's behaviour). `expected_updated_at: null` means "I saw no `updated_at`" (fine for a record that has none, a 409 otherwise). A malformed value → a normal **422**. An unknown or other company's record is still **404**, never 409.

### 23.2 Where it applies (the eleven `PUT`s)
`PUT /vehicles/{id}`, `/drivers/{id}`, `/yards/{id}`, `/yard-slots/{slotId}`, `/geofences/{id}`, `/trips/{id}` (also when the body carries `planned_yards` — a stale trip refuses the stop edit too, before any other rule), `/maintenance-schedules/{id}`, `/maintenance-logs/{id}`, `/fuel-logs/{id}`, `/compliance-documents/{id}`, `/incidents/{id}`.
**Not covered:** deletes, deactivate / reactivate, bulk actions, uploads (deliberate state changes, not field overwrites).

### 23.3 Two honest limits
1. **Whole-second precision.** `updated_at` is a whole-second column, so two changes inside the same second cannot be told apart; the comparison is at whole seconds (send the value exactly as returned).
2. **Best effort, not a lock.** The check runs just before the write, so it catches the real case — an edit form left open while a colleague saves — not a same-instant collision.
Also note: automatic changes (a sensor updating a trip, a schedule recomputed after a maintenance-log edit) also move `updated_at`, so an operator can get a 409 caused by "System" — by design.

### 23.4 The changes to EXISTING behaviour (update your types)
1. Every request schema above gains the optional `expected_updated_at` (ISO string or `null`).
2. **New error response: 409** with the `current` block (the error envelope gains an optional `current` key on this one status) — handle it in your edit forms.

### 23.5 Live check
On the rebuilt stack with throwaway rows (deleted), all eleven record types: matching token → 200 and `updated_at` moves; a colleague's edit without a token → 200; the stale token → 409 with the fixed message and `current` naming who and when; the refused edit wrote nothing (vehicle, driver, yard and a trip's stop verified); the retry with the fresh token → 200; `null` vs a record with `updated_at` → 409; malformed → 422; unknown record → 404; after an automatic change (`updated_by` cleared) the 409 reports `updated_by: null`.

**Still not built (owner decisions pending):** B7, B8, B12, C14. The frontend's last folder copy predates B6 (§19), the incident briefs (§21), B5 (§22) and this — copy this folder again.

---

## 24. Backend reply (2026-09-25 04:56 PKT, backend) — B12 (granular fleet permissions): owner decision — DEFERRED, fleet stays all-or-nothing; nothing to build or change on your side

**Decision (owner, D-0177): keep fleet exactly as it is — all or nothing per company — consistent with the rest of the platform. No API, contract, schema or realtime change.** Proper enterprise-level RBAC — including **what data each role / user may see**, not only which actions — is recorded as a future task on the backend (`tasks/granular-rbac.md`, not started); it will arrive as a new numbered request when the owner returns to it.

### 24.1 Facts you can rely on today (checked against the code)
- **Fleet:** every fleet route requires the single permission `all-fleet`. A user whose role has the fleet module can view and change **every** fleet record of their own company (create, edit, deactivate/delete, bulk, export, manual stop marking) — there is no read-only level and no per-action right. A user without it gets **403** `Requires permission: all-fleet` on every fleet route (and no `company:{id}` socket events).
- **Other modules** (products, devices, assets, rules, …) are **not gated by a module permission at all** — any logged-in user of the company can use them; what separates users there is company scoping and ownership (dashboards / rules are per user, products / devices per company). A few admin-only spots use the `admin` role, and `platform_operator` is the cross-company superuser role.
- **How you can read the user's rights:** `POST /login` and `GET /profile` return `user.roles[].permissions` (names such as `all-fleet`), and the JWT carries the same as `perms` (issued for **7 days** — a role change only takes effect after the user logs in again). Hiding fleet navigation for a user without `all-fleet` is therefore possible today; there is nothing finer to hide.

### 24.2 What changes for you
Nothing. Keep treating fleet as all-or-nothing. Your §16.4 / §18.4 "still needed: B12" can be closed as **deferred by the owner**. Also still not built (owner decisions pending): **B7** status counts / company-wide incidents list, **B8** map `bbox`, **C14** hard-delete policy.

---

## 25. Backend reply (2026-09-25 05:16 PKT, backend) — C14 (hard-delete policy) is BUILT and live-verified: deactivate stays the default, plus a guarded hard delete for never-used records

Owner decision: **deactivate stays the default (unchanged); a real delete is added for redundant records that were never used.** **BUILT and live-verified** (`D-0178`, contract **298 operations** — six new operations, each with its rules in `x-quirks`). Purely additive: no existing endpoint changed.

### 25.1 New endpoints (all behind `all-fleet`, company-scoped)
| Endpoint | Does |
|---|---|
| `DELETE /vehicles/{id}` · `/drivers/{id}` · `/yards/{id}` | hard-deletes the record **only if it was never used**; 200 `{ success, message }` (`Vehicle deleted successfully.` / `Driver deleted successfully.` / `Yard deleted.`) |
| `POST /vehicles/bulk-delete` · `/drivers/bulk-delete` · `/yards/bulk-delete` | body `{ ids }` **or** `{ filter }` (the list's own filters), ≤ 500, one after another through the single-record rule; the same always-200 per-record `{ id, ok, changed, label, message }` + `summary` as your other bulk actions (a deleted record is `changed: true`, a refusal `ok: false` with its message). **In filter mode `include_inactive` defaults to `true`** (a never-used record may already be deactivated); deactivate keeps `false`, reactivate `true`. |

### 25.2 What "never used" means — anything below blocks the delete
- **Vehicle:** trips · driver assignments · tracker assignments · fuel logs · maintenance logs · maintenance schedules · incidents · geofence events · yard check-ins · compliance documents.
- **Driver:** trips · vehicle assignments · incidents · compliance documents.
- **Yard:** trip stops · any slot with check-in / out history (so no vehicle in it) · geofence events on its linked geofence. Empty slots do **not** block (they go with the yard).
Note: a **closed** assignment or a finished trip is still history — it blocks. A record becomes deletable again once its only references are removed (e.g. its lone fuel log deleted).

### 25.3 Refusal and errors
- **422** `This vehicle can't be deleted because it has trips and fuel logs. Deactivate it instead.` (same wording for `driver` / `yard`; the labels are exactly those in §25.2, joined "a, b and c"). Nothing is deleted or announced. In a bulk call it is that record's `message`.
- **404** `Vehicle not found.` / `Driver not found.` / `Yard not found.` for an unknown, non-numeric or another company's id.
- Active **and** deactivated records can be deleted (an active never-used record needs no deactivate step first). Deletes take no `expected_updated_at` (§23 covers `PUT`s only).

### 25.4 Side effects of a successful delete
- **Vehicle:** its uploaded photo file is removed. **Yard:** its empty slots, layout image and linked geofence are removed too.
- **Realtime:** `fleet:changed` with `action: "deleted"` — `vehicle` / `driver` / `yard`, plus `yard_slot` (each slot) and `geofence` (the linked one) for a yard. Refetch those lists / drop the record from open screens, as for your other `deleted` events.

### 25.5 Changes to EXISTING behaviour
None. `deactivate` / `reactivate` and the bulk deactivate / reactivate are exactly as before; your "no hard delete" wording in §1.1 / §4 (C14) is now "deactivate by default, hard delete for never-used records".

### 25.6 Live check
49 assertions on the rebuilt stack (throwaway rows, deleted, a real socket client): never-used active / deactivated vehicles, a driver and a yard (its slot and linked geofence really gone) deleted; refusals with the exact message for a fuel log, maintenance schedule + log, compliance document, incident (both sides), trip (both sides), a closed driver assignment, yard check-in history, a trip stop and a geofence event; deletable again after the blocker was removed; 404 cases; bulk by ids (deleted / refused with reason / unknown), by filter (deactivated included), drivers, yards, and the 422 without ids or filter; the socket received the `deleted` events.

**Still not built (owner decisions pending):** B7 (status counts / company-wide incidents list), B8 (map `bbox`). B12 is deferred (§24). Your folder copy predates B6 (§19), the incident briefs (§21), B5 (§22), B13 (§23), §24 and this — copy this folder again.

---

## 26. Backend reply (2026-09-25 05:36 PKT, backend) — B7 is BUILT and live-verified: status counts for filter chips + a company-wide incidents list

Owner decisions Q28–Q31 = **all recommended**. **BUILT and live-verified** (`D-0179`, contract **302 operations** — four new read endpoints, each with its rules in `x-quirks`). Purely additive: no existing endpoint changed.

### 26.1 Status counts — `GET /trips/counts` · `GET /vehicles/counts` · `GET /drivers/counts`
Take **the matching list's own filters and `search`** and answer `{ success, message, data: { total, by_status: { … } } }` — **every status is always present** (`0` when nothing has it) and `total` is their sum:
| Endpoint | `by_status` keys | Filters it honours |
|---|---|---|
| `GET /trips/counts` | `planned`, `in_progress`, `completed`, `cancelled` | `vehicle_id`, `driver_id`, `customer_id`, `date_from`, `date_to` (same `actual_start_at` OR `planned_start_at` rule as the list), `search` |
| `GET /vehicles/counts` | `active`, `in_maintenance`, `retired`, `sold` | `vehicle_category` (case-insensitive), `fuel_type`, `ownership_type`, `has_tracker`, `has_driver`, `search` |
| `GET /drivers/counts` | `active`, `inactive`, `suspended` | `availability_status`, `employment_status`, `assigned`, `license_expiring_within_days`, `license_state`, `search` |
- **They never apply the list's `status`** — and, for vehicles and drivers, **not `include_inactive` either** — nor paging or sort (sent params are ignored). So choosing one chip does not zero the others, and a "Retired 5" chip shows its true count even though the default list hides retired records. To fill a chip's list, call the list with `status=<that status>` (and `include_inactive=1` is not needed: an explicit `status` wins) — its `pagination.total` equals the chip's count.
- Yards and geofences are binary (active / inactive, enabled / disabled) and get no counts endpoint — use the list with `is_active` and read `pagination.total`.
- Refetch the counts on the same realtime signals that refetch the list (`fleet:changed`, `trip:update`).

### 26.2 Company-wide incidents — `GET /incidents`
Every incident of your company, **always paged** (`data: { items, pagination }`, `page` default 1, `per_page` default 20, max 100). Filters: `date_from` / `date_to` (inclusive, on `incident_date`), `severity` (`minor|moderate|severe`), `driver_id`, `vehicle_id` (both may be combined), `search` (type, description). Sort: `sort_by` `incident_date` (default, newest first) | `severity` | `created_at`, `sort_order` `asc|desc` (empty values last, ties by id; an unknown `sort_by` → 422 `The selected sort by is invalid.`). **The incident object is exactly the one of `GET /drivers/{id}/incidents`** (driver / vehicle name briefs, §19 audit fields) — one type for all three lists. An unknown `driver_id` / `vehicle_id` simply gives an empty page. No CSV export and no severity counts (not asked).

### 26.3 Changes to EXISTING behaviour
None — four new endpoints only.

### 26.4 Live check
42 assertions on the rebuilt stack: on your real data (read-only) every status count equals the matching list's total for vehicles, drivers and trips and the sums equal the unfiltered totals; `status` / `include_inactive` / paging / sort have no effect on the counts; `has_tracker` / `assigned` / `fuel_type` narrow them exactly like the lists; throwaway rows — 3 vehicles (active / deactivated / in maintenance), 2 drivers, 3 trips (2 planned + 1 cancelled) — counted correctly, including a case-insensitive category filter and `driver_id` + `vehicle_id` + `search` combinations; the incidents list returned exactly my three (never an incident of another company's driver, planted to check) and every filter, the inclusive date range, description search, severity sort both ways, paging and the 422s behaved as above.

**Everything in this flow is now built, decided or deferred except B8 (map `bbox`) — owner decision pending.** B12 is deferred (§24). Your folder copy predates B6 (§19), the incident briefs (§21), B5 (§22), B13 (§23), §24, C14 (§25) and this — copy this folder again.

## 27. Frontend reply (2026-09-25 04:20 PKT, frontend) — B6 audit fields integrated and live-verified

> *Merge note (backend): the frontend wrote this as its "§21" on top of a copy that ended at §20. Backend §21–§26 (incident briefs, B5, B13, B12 decision, C14, B7) were already taken, so on merge it was renumbered **§27** — text otherwise verbatim; its sub-headings 21.1–21.4 keep their original numbers.*

Thank you for §19 / §20 (and for restoring our copy). **B6 is built into the frontend and checked against the live backend.**

### 21.1 What the UI shows (the wording rules we chose for the ambiguous `null`s, §19.1)
One shared `AuditLine` — "Created by *Name* · date — Last edited by *Name* · date" — on the vehicle, driver, trip, yard, yard slot and geofence views, and (through the shared record row) on every maintenance schedule / log, fuel log, incident and compliance document:
- **no `created_by`** = the record predates auditing → dates only ("Created · 24 Sep 2026, 01:24 PM"); we never invent a person;
- **`created_by` set, `updated_by` `null`** = the last change was automatic → shown as **"System"**;
- **"Last edited" is shown only when something changed after creation**: `updated_at` more than 5 s after `created_at`, or a different `updated_by` (the 5 s slack keeps a record from looking "edited" because of create-time timestamp jitter; a real edit within 5 s of creation is therefore not shown).

### 21.2 Checked live (throwaway records, cleaned up afterwards)
An old vehicle (`id 1`) reads `null` on all four fields and shows dates only; an old vehicle edited now (`created_by null`, `updated_by 2`) shows "Created · … — Last edited by Nuzzi2 Developer2 · …"; a new vehicle, driver, trip and incident show "Created by Nuzzi2 Developer2 · …"; after a later edit the vehicle and driver add "Last edited by Nuzzi2 Developer2"; the yard and a slot show their line (slots now carry `created_at` / `updated_at` ✔). All ids/names matched the API responses.

### 21.3 Not exercised / notes
- **A "System" write** (sensor / worker) was not reproduced live (your test is real-Postgres only); the UI branch for it is covered by the rule above.
- Nothing in §19.2's checklist needed a type change on our side (fleet entities are untyped in the frontend); nothing else changed in our calls.
- Your §20.3 proposal (incident `driver` / `vehicle` briefs) — noted as **pending your owner**; nothing built against it.

### 21.4 Where the frontend stands
Done: B1, B2, B3, B4, B6, B9, B10, B11, D-0167, D-0171. **Still needed from backend (owner decisions on your side): B5 trip-stop editing (next), B7 status counts / company incidents list, B8 map `bbox`, B12 granular permissions, B13 optimistic concurrency, C14 hard-delete policy** (+ the optional incident briefs). The frontend will build each as soon as its row says BUILT here.


## 28. Backend reply to §27 (owner-directed, 2026-09-25 05:58 PKT, backend) — your 04:20 copy merged; nothing to answer, nothing owed; what to integrate next

**Where you are (from the copy we received):** B6 integrated and live-verified (your §27, written as "§21" on your side), everything before it integrated. Your copy predates backend §21–§26. **There were no questions and no new asks in it, so nothing was built or changed on our side for this merge** — the API and contract are exactly as in §26 (302 operations). Your §27 wording rules for the audit `null`s are what §19.1 intended; nothing to correct.

**Numbering note:** your reply was written as "§21", but our §21–§26 already existed, so it now sits as **§27** (text verbatim). Please continue from **§29** on your side.

### 28.1 What is BUILT and waiting for you (all detail is in the section named; none of it needs an owner decision any more)
| Ask | Section | What you get | Changes an existing response / behaviour? |
|---|---|---|---|
| Incident briefs (your §18.3) | §21 | incident objects carry `driver { id, first_name, last_name }` and `vehicle { id, name, plate }` | additive |
| **B5** trip-stop editing | §22 | `PUT /trips/{id}` accepts `planned_yards[]` (planned trips only); realtime `trip:update` `reason: "updated"` after every trip `PUT` | **yes** — `PUT` now also returns `planned_yards` and now broadcasts `trip:update` (§22 lists it) |
| **B13** optimistic concurrency | §23 | optional `expected_updated_at` on every fleet `PUT` → **409** with `current` | additive (no field = unchanged) |
| **B12** granular permissions | §24 | **deferred** by the owner — fleet stays all-or-nothing; nothing to build | none |
| **C14** hard delete | §25 | `DELETE /vehicles\|drivers\|yards/{id}`, `POST …/bulk-delete` — never-used records only, else 422 | additive |
| **B7** counts + company incidents | §26 | `GET /trips\|vehicles\|drivers/counts`, `GET /incidents` | additive |

### 28.2 Still open
**B8 (map `bbox`)** is the only ask of this flow not yet built — owner decision pending on our side. Nothing else is outstanding from backend.

*(A copy of this folder is owed to the frontend — it now contains everything above.)*


## 29. Backend reply (owner-directed, 2026-09-25 06:15 PKT, backend) — B8 is BUILT and live-verified: map viewport filtering (`bbox`) on positions, yards and geofences

> *Numbering note (backend): §28 told you to continue from §29 on your side. This backend section was written while you were answering the merged folder, so it takes §29; **your reply will be renumbered past it on merge** (the same routine as your §21 → §27).*

Owner decisions: **Q1 "(a)"** = `bbox` + `limit` only, **no clustering** (a later step if a fleet ever outgrows it) and **Q2 "(a)"** = yards / geofences are circles, so they match when their **circle overlaps** the box. **BUILT and live-verified** (`D-0180`, contract **302 operations** — only new query parameters and `x-quirks` notes). **Purely additive: without the new parameters every response is exactly what it was.**

### 29.1 The parameter — `bbox=minLng,minLat,maxLng,maxLat`
Degrees, **GeoJSON / Leaflet / Mapbox order** (west, south, east, north), e.g. `bbox=74.2,31.4,74.5,31.6`. Malformed (not four numbers), out of range (longitude −180..180, latitude −90..90) or reversed (`min` above `max`) → **422** `The bbox must be four numbers: minLng,minLat,maxLng,maxLat (longitude -180..180, latitude -90..90, min not above max).` **A box that crosses the antimeridian (±180°) is not supported** (it reads as reversed → the same 422). A blank `bbox=` means "no filter".

### 29.2 `GET /fleet/positions` — `bbox` and `limit`
| Parameter | Meaning |
|---|---|
| `bbox` | only trackers whose **latest position is inside** the box (edges inclusive) |
| `limit` | 1–5000 (outside → 422). Keeps the **most recently reported** trackers, **newest first**. Without a `limit` there is no cap and the order is unchanged |
| `include_unassigned` | unchanged; applied first |

`data` is the same flat array of the same objects. **`meta` is added only when `bbox` and/or `limit` was sent:** `meta: { total, limit, truncated }` — `total` = trackers in view **before** the cap, `limit` = the cap you sent (`null` if none), `truncated` = `total` is larger than what `data` holds (show "showing N of M — zoom in"). Without either parameter there is **no `meta`**.

### 29.3 `GET /yards` and `GET /geofences` — `bbox`
Keeps only the records whose **circle overlaps the box**, so a big geofence whose centre is just off-screen still shows. A yard's radius is its linked geofence's (the earliest one, as everywhere); a yard **without** a linked geofence is a point (its centre must be inside); **yards without coordinates never match a `bbox`**. `bbox` combines with **every** other filter, `search`, `sort_by` and paging, and `pagination.total` counts the matches. **The CSV exports (`GET /yards/export`, `GET /geofences/export`) take `bbox` too** (they reuse the list's filters). The options endpoints, counts and bulk `filter` do **not** take it (nobody asked).

### 29.4 Suggested use (your call)
On map move/zoom end (debounced) request `/fleet/positions?bbox=…&limit=…` and `/yards?bbox=…`, `/geofences?bbox=…`; refetch on the same realtime signals as today (`fleet:position` still arrives for every tracker in the company — filter it to the viewport on your side, or ignore the ones outside). Keep `limit` under ~2000 for a smooth map; if `meta.truncated` is true, tell the operator to zoom in.

### 29.5 Changes to EXISTING behaviour
**None.** No existing response changed; every new parameter is optional and `meta` appears only when you ask for it.

### 29.6 Live check
35 assertions on the rebuilt stack: on your real trackers (both in the box / one / none, `limit` keeps the newest, `bbox` + `limit`, blank `bbox`, eight 422 cases, `include_unassigned` still works); your real yards and geofences with a Lahore box equal an independent recomputation of the overlap rule over the unfiltered lists; throwaway `ZZ b8` yards (centre inside / 3 km fence reaching in / 1 km fence not reaching / point outside / no coordinates) and geofences at 10°N 10°E, including paging, both CSV exports and the 422s — all deleted afterwards (counts back at 37 yards, 33 geofences). Known limits (no antimeridian, flat-earth distance, positions filtered in memory, no clustering): KNOWN_ISSUES 11.90 (backend-internal).

**Every ask of this flow is now built, decided or deferred** (B12 deferred, §24). Your folder copy predates §29 — copy this folder again.


## 30. Backend note for the frontend and the owner (2026-09-25, backend) — things we noticed but nobody asked us to change, known limits, and what is planned for later

> *Numbering note (backend): written right after §29 while the frontend is still answering §28 — **your reply will be renumbered past §30 on merge**.* Nothing here is built or changed; **this is a decision list**. The owner will go through it with you: for each item say **do it / leave it / different idea**. Every "do it" changes a number or a behaviour, so the owner decides — we then build it contract-first as usual and list the response changes here.

### 30.1 Things we noticed but nobody asked us to change (each verified against the current code)
| # | What happens today | What we would suggest | Effect if done |
|---|---|---|---|
| L1 | `GET /fleet/dashboard` → `fleet_status` totals (and the dashboard's vehicle list) **still count retired and sold vehicles** (only utilisation / parked hours exclude them, D-0160) | Exclude retired + sold, like utilisation | The "Total / moving / idle / parked / offline" numbers on the dashboard drop by the number of retired / sold vehicles |
| L2 | `data.alerts.*` on `GET /fleet/dashboard` counts **every** company alarm; only `GET /fleet/dashboard/alerts?fleet_only=1` filters to fleet | Leave it — you already have `fleet_only=1`; or give the overview the same `fleet_only` switch | Only if you use the overview's alert counts on a fleet screen |
| L3 | `fleet:changed` / `trip:update` **do not announce**: yard check-in / check-out, fuel logs, maintenance, compliance documents, incidents, CRM records (they only announce vehicle / driver / yard / slot / geofence / trip changes and tracker / driver assignments) | Add **yard check-in / check-out** (a second operator watching a yard sees occupancy change); the log-type records only if two operators really work on the same vehicle detail at once | New `fleet:changed` entities / actions — additive, but you would subscribe to them |
| L4 | **Deactivating a vehicle** is refused while a trip is in progress or a driver / tracker is assigned, but **not** while it is **checked in at a yard slot** or has **planned trips** | Refuse (422) while checked in at a yard; for planned trips: either refuse or leave — **your call** (a deactivated vehicle with a planned trip cannot be started) | New 422 message(s) on `POST /vehicles/{id}/deactivate` and `bulk-deactivate` |
| L5 | **Deactivating a yard** keeps its **linked geofence active** (the sensor bridge still fires enter / exit for a yard that is out of use) | Disable the linked geofence when the yard is deactivated, enable it again on reactivate | The yard's geofence flips `is_active` with the yard; geofence events stop for inactive yards |
| L6 | `GET /vehicles/{id}` returns **every** row in `driver_assignment_history` (uncapped, the other embedded lists are capped at 20) | Cap at the newest 20 like the others (the full, paged history already exists: `GET /vehicles/{id}/assignment-history`) | A long-lived vehicle's detail response gets smaller; the detail tab must use the paged list beyond 20 |

### 30.2 Known limits (documented, **no action proposed** — we only build if you actually hit one)
| Limit | Why it is acceptable | We would only act if… |
|---|---|---|
| **Audit fields (§19):** `updated_by = null` cannot tell "unknown (old row)" from "System"; deleting a record is not audited; the CSV exports have no audit columns; yard layouts and slot check-in/out events carry no audit fields | Your UI already shows the honest wording (§27); nothing is lost that was ever recorded | someone needs an audit trail of deletions or audit columns in exports |
| **Optimistic concurrency (§23):** the `expected_updated_at` check is check-then-write, not a database lock; whole-second comparison | Two writers inside the same second is very rare; the check still catches the normal "someone else changed it earlier" case | two operators hit real collisions |
| **Map `bbox` (§29):** no antimeridian-crossing box; flat-earth distance for circle overlap; positions are filtered in memory (fine up to a few thousand trackers); no clustering | A viewport in one region is unaffected; the cap protects the response | a fleet spans the ±180° line, or grows past several thousand trackers |
| **B12 permissions (§24):** fleet stays all-or-nothing (`all-fleet`); a rights change reaches the client after re-login (7-day token) | The owner deferred it to a proper enterprise RBAC task (rights **and** which data each user sees) | the owner starts that task |
| **Yard slots with history (§18.1):** cannot be deleted; a "deactivate slot" (migration 009) was left for later | Owner decision D-0173 | you ask for it |
| **Not exercised live:** a real "System" write (sensor / worker) for the audit fields; the "user without `all-fleet` receives nothing" socket case — both are covered by automated tests against real Postgres / Redis | Tests prove the rule | you see a wrong value in the UI |

### 30.3 Planned for later (not started, not designed): fleet ledger, reports, graphs and analytics
The owner's standing scope note: money and insight on top of the operational fleet — a **ledger** (costs / revenue per vehicle, driver, trip, customer), **reports** (filterable, exportable), **graphs** (time-series, breakdowns) and **analytics** (derived metrics). CRM stays out of scope; real payment APIs are designed later. It is on the backend's todo (`tasks/fleet-ledger-reports-analytics.md`, backend-internal) and will be designed with the owner one question at a time. **What we need from you now, whenever you are ready — no rush:** your wishlist as a new section here: which reports an operator actually asks for (e.g. cost per vehicle / km, fuel efficiency, maintenance compliance, driver performance, trip profitability), which graphs (per day / week / month, top-N), which filters, and which export formats. What exists today for reference: the Laravel-parity dashboards (`/fleet/dashboard`, `/trends`, `/vehicle-performance`, `/alerts`, `/financial`), the six CSV exports (§15.4) and the paged sub-lists (§15.6).

### 30.5 How crossings are detected today — and a limitation to keep in mind (documented; improvement planned for later, not started)
**How it works (unchanged, live-tested by you in `04` §18):** every packet a tracker sends is checked on its own: the position is compared with **every active geofence** of the company (inside = within `radius_m`), and only a **change** since the last recorded event of that geofence and vehicle writes `enter` / `exit` (with the trip id) and is pushed as `geofence:event`. While a trip is in progress, a geofence **linked to a yard** also fills that planned stop (`enter` = arrived, `exit` = departed + dwell, `actual_source: "geofence_auto"`); the trip is "destination reached" when the last stop is arrived or the vehicle is within 200 m of the destination. **Times are the moment our server received the packet**, not the GPS time.

**The limitation:** only the position **inside each packet** is examined, never the path **between** two packets. With a long reporting interval (say 15 minutes ≈ 12 km at 50 km/h) a vehicle can cross a geofence or yard entirely between two packets and **nothing is recorded** — no event, no stop filled, no destination-reached. A long stop is caught but with a time up to one interval late. **What this means for the UI:** never present "no enter / exit event" as proof the vehicle did not visit; keep the operator's manual arrive / depart (with reason) available and prominent; consider a hint on stops of an in-progress trip that stay empty long after the vehicle's last known position passed them. **Practical rule for setup:** trackers should report often while moving (e.g. every 30–60 s) and geofence radii should be large relative to the distance covered between packets.

**Planned for later (owner-deferred, D-0181 — not started, nothing to build on your side):** inferring crossings from the line between the previous and the new position, with estimated, flagged times (your UI would then show an "estimated" badge). It has known weaknesses (a geofence at a turn can still be missed, a straight line can invent a crossing), so it will only be built once the owner knows the trackers' real reporting interval and decides it is worth it.

### 30.4 What we need back
For **L1–L6**: do it / leave it / different idea (plus, for L3, whether two operators really work on the same records at once; for L4, refuse or allow planned trips). For **30.3**: the wishlist when you have it. Nothing blocks you — all of this is optional.

## 31. Frontend reply to §28 (2026-09-25 06:28 PKT, frontend) — B5, B13, B7, C14 and the incident briefs are integrated and live-verified

> *Merge note (backend): the frontend wrote this as its "§29" on top of a copy that ended at §28. Backend §29 (B8 `bbox`) and §30 (leftovers / limits / planned work, §30.5 detection limitation) were already taken, so on merge it was renumbered **§31** — text otherwise verbatim; its sub-headings 29.1–29.4 keep their original numbers. The frontend's copy (06:28 PKT) predated backend §29–§30.5.*

Thank you for §21–§28 (and for renumbering our old "§21" reply to §27 — nothing of ours was lost; we continue from §29). **Every row that §28.1 lists as BUILT is now in the frontend and was exercised against the real backend** (throwaway `ZZ` records, all cleaned up afterwards). **No questions and no new asks.**

### 29.1 What the UI does now
| Ask | Frontend |
|---|---|
| **B5** stops on `PUT /trips/{id}` | Edit trip has a stops editor (add / remove / reorder, purpose, planned arrival / departure, notes) while the trip is `planned`; New trip uses the same editor (now with notes and reordering). `planned_yards` is sent **only when the list changed**; a kept stop carries only `id`, `yard_id` and the fields the operator changed (an untouched datetime is never re-sent, so it is not rounded); a new stop sends everything. Outside `planned` the editor is replaced by "Stops can only be edited while the trip is planned." Per-stop 422s (`planned_yards.N.yard_id`, `…planned_departure_at`, list-level) are shown under the stop they belong to. |
| **B13** `expected_updated_at` / 409 | Every fleet edit form (vehicle, driver, yard, geofence, trip, and the log-type record form for maintenance schedules / logs, fuel logs, documents, incidents) sends the record's `updated_at` **as it was when the form opened** (captured once, so a background refetch cannot refresh the token while the form still shows old values). On a 409 nothing is lost silently: a banner says "changed by *Name* at *time*" (`updated_by: null` → "System"), Save is locked, and "Reload latest" refetches and closes the form. Quick actions without a form (geofence enable / disable, slot edit / move) send the token too and toast the same sentence on a 409. |
| **B7** `/counts` | Status chips on Trips, Vehicles and Drivers ("Planned 4 · In progress 2 …", a chip is a shortcut for the Status filter, click again to clear, plus a "Total" figure). We call `/counts` with the list's own filters + `search` and strip `status` / `include_inactive` / paging / sort ourselves (you ignore them anyway) so the query key does not change when a chip is clicked. They refetch on the same realtime signals as the list. |
| **B7** `GET /incidents` | New **Incidents** tab in Fleet Management: paged, filters (severity, driver, vehicle, date range), search, sort (`incident_date` / `severity` / `created_at`), edit / delete as on the other incident lists, names link to the driver / vehicle. Incidents are fleet-only (driver-safety records), so it lives in Fleet, not in a platform-wide inbox. |
| Incident briefs (§21) | `driver` / `vehicle` names shown on incident rows (the per-driver list hides the driver line, the per-vehicle list the vehicle line). |
| **C14** hard delete | "Delete permanently" (secondary, inline confirm) next to Deactivate on the vehicle, driver and yard detail views, and in the bulk bars (ids or "all N matching"). Your 422 (`This vehicle can't be deleted because it has fuel logs. Deactivate it instead.`) is shown verbatim, per record in bulk. |
| **B12** | Closed as deferred (§24); the frontend treats fleet as all-or-nothing. |

### 29.2 Checked live
- **B5:** created a planned trip with 3 stops, then ONE edit that reordered, kept by `id`, removed one, added one and edited a note — the response and a re-read matched the intent (sequence 1..3, dropped stop gone, omitted fields kept); a forced 422 (`planned_yards.1.yard_id` invalid) rendered under stop 2; after `start` the editor is replaced by the note and a direct `planned_yards` PUT returns your 422; an external `PUT` refreshed the open trip within a few seconds (realtime `updated`); New trip created with two reordered stops + notes.
- **B13:** opened a vehicle edit form, changed the vehicle from outside, saved from the form → HTTP 409 with `current` (id, `updated_at`, `updated_by`, `updated_by_user`), banner named the user and time, Save locked; "Reload latest" → re-edit → 200 using the fresh `updated_at`. Same 409 flow on a fuel-log edit; a forced stale token on the geofence enable / disable toggle → 409 toast ("changed by System …" for an automatic change); the normal toggle round-trip → 200.
- **B7:** chip counts equal `/counts` for vehicles (66 / 0 / 1 / 0), drivers (46 / 1 / 0) and trips; clicking a chip narrows the list to its `pagination.total` and leaves the other chips untouched; a search narrows every chip; a planned → in progress → cancelled walk moved the chips live; the hidden Retired vehicle / Inactive driver are reachable through their chips. Incidents: list vs `GET /incidents` totals, severity / driver / date-range / search filters, sort by severity both ways, briefs on rows, names open the driver / vehicle.
- **C14:** deleted a never-used vehicle, driver and yard from their detail views (modal closed, lists refreshed); a vehicle with a fuel log was refused with your verbatim message and stayed; bulk by ids deleted one and listed the other's reason; **filter mode: `include_inactive: 0` is honoured** (a deactivated never-used vehicle survived `bulk-delete {filter:{search, include_inactive:0}}` and went with `include_inactive:1`) — the frontend sends the list's own value explicitly because "all N matching" counts only what the list shows; after removing the fuel logs the two blocked vehicles were deletable.

### 29.3 Not exercised live (recorded as verification debt)
- The **"select all N matching" UI path for delete** (needs a list larger than one page; the backend filter semantics were checked by API as above).
- The **409 banner on the yard, geofence, trip and driver edit forms** and the slot edit / move 409 toast — same shared helper as the vehicle / fuel-log forms that were exercised, not clicked individually.
- A "System" write producing a 409 from a real sensor (we only saw the `updated_by: null` wording through an old geofence).
- The over-cap (500) bulk 422 and the ≤ 100 stops limit.

### 29.4 Where the frontend stands
Done: B1–B7, B9–B11, C14, B13, D-0167, D-0171, incident briefs. **B12 deferred (§24). Only B8 (map `bbox`) is open** — the frontend will build viewport-driven map loading when it is marked BUILT. Frontend-only work still open on our side (owner decisions): multi-select trip status, URL-synced list state, saved views / accessibility / skeletons / light theme, imagery polish, and asking the owner about a yard-slot "deactivate" later.


## 32. Backend reply to §31 (owner-directed, 2026-09-25 06:54 PKT, backend) — your 06:28 copy merged; nothing owed by you, nothing to build; what to integrate next

**Where you are (from the copy we received):** B5, B13, B7 (`/counts` + `GET /incidents`), C14 and the incident briefs are integrated and live-verified, with a solid live check of each (thank you — the B5 one-edit reorder / keep / remove / add, the 409 flow and the `include_inactive` filter-mode check are exactly the cases that matter). **There were no questions and no new asks in it, so nothing was built or changed on our side for this merge.** Numbering: your reply was written as "§29" but our §29–§30 already existed, so it is now **§31** (text verbatim) — please continue from **§33**.

### 32.1 Facts on your §29.3 "verification debt"
- **Bulk over-cap (500):** the same schema guards all ten bulk endpoints **and** the three `bulk-delete` ones — more than 500 `ids` → 422 `You can act on at most 500 records per request.`; an `ids` **and** a `filter` together, or neither, is also a 422. Covered by our unit tests (`bulk.test.ts`).
- **≤ 100 stops:** 101 stops on create / edit → 422 on `planned_yards`; covered by our trip-service tests.
- **"System" write → 409:** the rule is that `current.updated_by` is `null` for an automatic change; covered by our real-Postgres test, not by a live sensor write — same as you saw.
- **Your `include_inactive` finding is the intended behaviour:** with a `filter`, bulk deactivate defaults `include_inactive` to `false`, bulk reactivate **and bulk delete** default it to `true`; sending the list's own value explicitly (what you do) is right, because "all N matching" must count exactly what the list shows.

### 32.2 What is BUILT and waiting for you
**B8 — map `bbox` (§29)**, the last open ask: `bbox=minLng,minLat,maxLng,maxLat` on `GET /fleet/positions` (+ optional `limit`, `meta { total, limit, truncated }` only when either is sent), `GET /yards`, `GET /geofences` and their CSV exports; purely additive. Your "Only B8 is open" line is therefore stale — **it is BUILT and live-verified.**

### 32.3 Waiting for you (all optional, nothing blocks you)
- **§30 — a decision list:** six things we noticed but nobody asked us to change (L1–L6), the documented known limits, and a request for your **ledger / reports / graphs / analytics wishlist** (§30.3). Please answer each L-item **do it / leave it / different idea** (§30.4) in your next section — the owner will go through it with you.
- **§30.5 — how crossings are detected today:** a limitation to keep in mind for the UI (only the position inside each packet is examined, never the path between packets).

### 32.4 On your frontend-only list (§31 / 29.4)
Nothing needed from backend. Facts: **multi-select trip status** is already supported by `GET /trips` (`status=a,b` and `status[]`, §11). **URL-synced list state** needs no API. **Saved views** have no backend today — they would be a new server-side feature (per-user stored filters); say so if you want it stored server-side rather than in the browser and we will ask the owner. The yard-slot "deactivate" stays for you to raise later (D-0173).

*(A copy of this folder is owed to the frontend — it now contains §29, §30 (incl. §30.5), this §32 and your §31.)*

## 33. Frontend reply to §29–§32 (2026-09-25 07:10 PKT, frontend) — B8 integrated and live-verified; the owner's answers to L1–L6

Thank you for §29–§32. Nothing of ours was lost in the merge (our old §29 is §31, text verbatim); we continue from §33. **No new asks.**

### 33.1 B8 — the map is viewport-driven now
- **Requests.** When the operator stops moving / zooming the map (350 ms debounce, box padded by 10 % so a small pan does not refetch) the Fleet Map requests `GET /fleet/positions?bbox=…&limit=2000`, `GET /yards?bbox=…` and `GET /geofences?bbox=…&is_active=1`. The box is **clamped to −180..180 / −90..90** and rounded to 4 decimals before it is sent (a Leaflet view can show wrapped copies of the world; you have no antimeridian support). A degenerate box (min = max) is accepted by you (200) — fine.
- **Yards / geofences are paged in pages of ≤ 100** (your `per_page` cap: `Too big: expected number to be <= 100`, a 422 we hit first with 500). The map reads page 1, then the remaining pages in parallel up to **5 pages (500 records)**, and shows "Showing 500 of N yards — zoom in" if `pagination.total` is larger.
- **Overview request.** On mount one cheap `GET /fleet/positions?limit=1` (no box) centres the map on the most recently reporting vehicle and its `meta.total` gives "2 vehicles in view · 5 reporting in total"; `meta.truncated` on the box request gives "Showing 2000 of 3,412 vehicles in view — zoom in to see the rest"; an empty view says "No vehicles in this area — N reporting elsewhere".
- **Realtime.** `fleet:position` still arrives for every tracker of the company; we patch the tracker in every cached viewport variant, and only the view **on screen** decides whether a tracker that is not cached but now lies inside it needs ONE debounced refetch — packets outside the view cause no requests at all.
- **Checked live (real Leaflet moves against the real backend):** the initial requests (overview + box positions / yards / geofences); a Lahore view; a forced `limit=1` → `meta.truncated` → the notice + "1 vehicle in view · 2 reporting in total"; an empty area → "0 in view · 2 reporting in total" + the hint; a real tracker packet **outside** the view → no requests; inside the view → the marker moved with zero requests; a packet that moves the tracker **into** an empty view → exactly one `positions` refetch and the vehicle appears.
- **Not exercised:** a real fleet with more than 2,000 trackers or 500 yards / geofences in one view (the truncation notices were forced with `limit=1`; the yard / geofence page-cap notice was not reached), and the two CSV exports with `bbox` (the frontend does not use them).

### 33.2 The owner's answers to §30.4 (L1–L6) — **"do it" for all six, as suggested**
| # | Owner's answer | What the frontend will do when it is BUILT |
|---|---|---|
| L1 | **Do it** — exclude retired / sold vehicles from the dashboard `fleet_status` totals and vehicle list | Nothing to change; the dashboard numbers just drop by the retired / sold count |
| L2 | **Do it** — give `GET /fleet/dashboard` the same `fleet_only` switch as `/dashboard/alerts` | Our Fleet Dashboard shows `overview.alerts` (the summary counts) next to the `fleet_only=1` alert list, so today "Needs Attention (0)" can sit beside "1 Total" — we will send `fleet_only=1` on the overview request. **Please tell us the parameter name / whether it defaults to off.** |
| L3 | **Do it for yard check-in / check-out only** (log-type records: leave) | Subscribe to the new `fleet:changed` entities / actions and invalidate the yard / slot queries (an open yard modal then refreshes occupancy). **Please list the exact `entity` / `action` values when built.** |
| L4 | **Do it** — refuse deactivating a vehicle that is checked in at a yard **and** one that has planned trips (owner: refuse both) | Nothing to change (we show your 422 verbatim, single and bulk); we will re-test with a checked-in vehicle and a planned trip |
| L5 | **Do it** — disable a yard's linked geofence when the yard is deactivated, enable it again on reactivate | Nothing to change; the geofence list refetches on the existing `fleet:changed` yard event — we will confirm the geofence flips live |
| L6 | **Do it** — cap `driver_assignment_history` on `GET /vehicles/{id}` at the newest 20 | Nothing to change: the frontend never reads that embedded list (the vehicle History tab and the Assignments screen use the paged endpoints) |

### 33.3 The rest of §30 / §32
- **§30.3 ledger / reports / graphs / analytics wishlist:** the owner wants to finish the current enterprise work first; we will write the wishlist as a new section then — not now.
- **§30.5 detection limitation:** understood. The UI already keeps the manual arrive / depart (with reason) on stops; a hint on stops that stay empty long after the vehicle's last position passed them is noted as a possible later improvement (nothing needed from backend).
- **§32.4 saved views:** no decision yet — if the owner wants them stored server-side we will ask you then; until then it stays a frontend-only idea.

### 33.4 Where the frontend stands
Every ask of flow 06 that is BUILT is integrated (B1–B11, C14, B13, D-0167 / D-0171, incident briefs; B12 deferred). **Waiting for backend:** L1–L6 (owner said do it), then the ledger / reports / analytics design. Frontend-only work still open (owner's order: after the current enterprise / IoT work): multi-select trip status, URL-synced list state, polish, imagery, and the ZZ test-data cleanup.


## 34. Backend reply to §33 (2026-09-25 07:25 PKT, backend) — L1–L6 are BUILT and live-verified; your B8 integration received

Your 07:10 copy was based on our latest folder, so it merged cleanly (nothing to renumber — §33 is yours, this is §34; please continue from **§35**). **Thank you for the B8 write-up** — the 10 % padded box, the clamp to ±180 / ±90, pages of ≤ 100 for yards / geofences, `limit=1` for the overview centring and the "only refetch when a tracker enters an empty view" rule are all exactly what the parameters were designed for; the `per_page` ≤ 100 cap you hit is the one every paged list has, and a degenerate box (min = max) is accepted on purpose. **You asked two small questions (§33.2) — answered in §34.1.** The owner's "do it" for L1–L6 is **built** (`D-0182`, contract still **302 operations**; new `fleet_only` parameter, new 422 messages, `x-quirks` on the affected operations, `API_CONTRACT.md` §4 updated).

### 34.1 Your two questions
- **L2 parameter:** **`fleet_only`**, exactly like `GET /fleet/dashboard/alerts` — `1` / `true` = on, `0` / `false` = off, **default off** (today's company-wide counts, so nothing changes until you send it). Anything else → 422.
- **L3 values:** `fleet:changed { entity: "yard_slot", id: "<slot id>", action: "checked_in" | "checked_out", occurredAt }`. `entity` stays `yard_slot`; the **only new thing is the two `action` values**. The id is the **slot**, not the yard and not the vehicle (refetch that yard / slot query; a vehicle's yard state comes with the vehicle's own refetch). Log-type records (fuel / maintenance / documents / incidents) are still **not** announced (owner: leave).

### 34.2 What changed — the checklist of every existing response / behaviour that is different now
| # | Where | Before → now |
|---|---|---|
| **L1** | `GET /fleet/dashboard` → `data.fleet_status` (`total`, `moving`, `idle`, `parked`, `offline`, `unknown`) and `data.alerts.offline_vehicles`; `GET /fleet/dashboard/vehicle-performance` rows | **Retired and sold vehicles are no longer counted / listed** (only `active` and `in_maintenance` are in the fleet — the rule utilisation already used). On the current data `total` goes 67 → 66 and the ranking loses the retired vehicle |
| **L2** | `GET /fleet/dashboard?fleet_only=1` | **New optional parameter.** With it `data.alerts.total / critical / warning / info` count only open alarms whose device is **installed in a vehicle now** (same rule as `/alerts?fleet_only=1`, so the "Needs Attention" count and the list agree); `offline_vehicles`, `expiring_documents`, `expiring_driver_licences` are unaffected. Without it: exactly as before |
| **L3** | Socket `fleet:changed` | **Two new `action` values** `checked_in` / `checked_out` (entity `yard_slot`, id = slot), sent after a successful `POST /yard-slots/{slotId}/check-in` / `check-out`. A refused check-in sends nothing. Anything that switches on `action` should ignore unknown values |
| **L4** | `POST /vehicles/{id}/deactivate` and `POST /vehicles/bulk-deactivate` | **Two new 422s**, checked after the older ones (trip in progress → driver / tracker assigned) and in this order: `Check this vehicle out of its yard before deactivating it.` (still checked in at a slot) then `This vehicle has planned trips. Cancel or delete them before deactivating it.` In bulk they appear as that record's `message` (`ok: false`) |
| **L5** | `POST /yards/{id}/deactivate` / `reactivate` and `POST /yards/bulk-deactivate` / `bulk-reactivate` | **Every geofence linked to the yard is switched off with it (`is_active: false`) and back on at reactivate** — so an out-of-service yard no longer produces enter / exit events or fills trip stops. Each geofence that flipped is announced as `fleet:changed` `geofence` `updated` (in addition to the yard's own event). Edge: a linked geofence an operator had switched off **by hand** comes back on at reactivate |
| **L6** | `GET /vehicles/{id}` → `driver_assignment_history` | **Capped at the newest 20** (newest first) — the same as the other embedded lists. The full history is the paged `GET /vehicles/{id}/assignment-history` (you already use it) |

### 34.3 Live check
30 assertions on the rebuilt stack, with a real Socket.IO listener: on **your real data** `fleet_status.total` equals the non-retired/sold vehicles (66 of 67), the vehicle-performance rows match, the default alert counts are company-wide and `fleet_only=1` equals an independent count of open alarms on installed devices; on throwaway `ZZ d0182` records `checked_in` / `checked_out` arrived with the slot id, deactivate was refused while checked in (single **and** bulk, with the message) and with a planned trip and allowed after the trip was cancelled, yard deactivate / reactivate / bulk-deactivate flipped the linked geofence and announced both, and a vehicle with 25 assignments returned 20 newest-first while the paged history reported 25. All throwaway rows deleted (counts back at the baselines).

### 34.4 What we need from you
**Re-test L1–L6** (you offered to: a checked-in vehicle, a planned trip, the geofence flipping live, the overview with `fleet_only=1`) and integrate the two `checked_in` / `checked_out` actions. The **ledger / reports / graphs / analytics wishlist** stays yours to write when the owner is ready (§33.3). Nothing else is open on the backend; B12 stays deferred.

*(A copy of this folder is owed to the frontend — it now contains §34 and the regenerated contract.)*

## 35. Frontend reply to §34 (2026-09-25 07:34 PKT, frontend) — L1–L6 re-tested live, `fleet_only` integrated; nothing open

Thank you for §34 (clean merge, our §33 kept its number; we continue from §35). **No questions and no new asks.** Everything below was exercised in the real app against the real backend (throwaway `ZZ` records; the ones that could not be deleted because of their history were deactivated).

| # | Frontend change | Re-tested live |
|---|---|---|
| **L1** | none | Dashboard "Total" is **66** (was 67); the same 66 in `fleet_status.total` from the API. |
| **L2** | The overview request now sends **`fleet_only=1`** (`GET /fleet/dashboard?…&fleet_only=1`). | Before: the summary read "1 Total · 1 Warning" next to "Needs Attention (0)"; now the summary reads **0 / 0 / 0 / 0** and agrees with the list. API check: default `alerts.total` 1, `fleet_only=1` → 0; `offline_vehicles` / `expiring_*` unchanged (65 / 0 / 11) as documented. |
| **L3** | none — our existing `yard_slot` rule already invalidates the yard queries for any `action` value, so `checked_in` / `checked_out` are handled (and unknown values are ignored). | With a yard modal open, an external check-out then check-in flipped the slot **occupied (cyan) → empty (green) → occupied** within 3 s with no UI action; the `/yards` list and `/yards/{id}` refetched each time. |
| **L4** | none — your two 422s are shown verbatim (single and bulk). | A vehicle checked in at a slot: deactivate from the vehicle modal → "Check this vehicle out of its yard before deactivating it."; a vehicle with a planned trip → "This vehicle has planned trips. Cancel or delete them before deactivating it."; bulk deactivate of both listed each refusal under its own name; both stayed `active`. |
| **L5** | none — the geofence list refetches on the existing `fleet:changed` (yard / geofence) events. | Deactivating a yard from the yard modal: its linked geofence went `is_active: false` (list showed "inactive" / **Enable**); reactivating the yard (via API) flipped the open Geofences list back to **Disable** live within 3 s. |
| **L6** | none — the frontend never reads `driver_assignment_history` from `GET /vehicles/{id}`; the vehicle History tab uses the paged endpoint. | The History tab still loads (paged, 3 of 3). **Not exercised:** the cap itself with > 20 assignments — none of our test vehicles has that many (your live check covered it). |

Also seen (no action): after a check-in / check-out a vehicle / yard is correctly undeletable ("has yard check-ins" / "has check-in history … Deactivate it instead") — the C14 guards behave as documented.

**Where the frontend stands:** everything BUILT in flow 06 is integrated and verified; B12 deferred. **Waiting on our side for the owner:** the ledger / reports / graphs / analytics wishlist (§30.3) — the owner wants to finish the current enterprise / IoT work first. **Waiting on backend:** nothing.
