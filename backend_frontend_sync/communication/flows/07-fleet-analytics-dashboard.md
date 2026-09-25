# Fleet dashboard, analytics, reports & ledger — what the frontend needs from backend

**Written:** 2026-09-25 07:51 PKT · **By:** frontend · **Verification:** the dashboard audit was live (real responses compared with the raw records); everything below is a **PROPOSAL — nothing is built against it yet**.
**Source:** frontend `FLEET_ANALYTICS_DESIGN.md` (the design: what each widget shows and in which form), `task.md` "FLEET DASHBOARD AUDIT". The owner delegated the design to the frontend and said backend may **build new things or change existing ones** for it — the owner does not know what backend has built, so for every row please answer **BUILD / ALREADY EXISTS (say where) / DIFFERENT IDEA / NOT NOW** (and say if the owner must decide).

> **⚠ Standing owner rule (README, 2026-09-25 08:25 PKT): do not break what already works — anything that changes EXISTING behaviour needs the owner's approval first, then the other side is informed.** In this flow, **§2 (A1–A9), the `vehicle-performance` changes, the `fleet_status` changes and any modification of an existing endpoint / event are PROPOSALS that change numbers the owner has already seen — do not build them until the owner has approved (the frontend will ask the owner and tell you; you may also ask).** New, purely additive endpoints / optional parameters (§3 B, §4 C, §5 D, §6 E, §7 F) may be built and announced as usual, provided they change nothing when unused. On the frontend the new dashboard is built **alongside** the old one; the old dashboard is replaced only after the owner approves.
> _(Update 2026-09-25 08:35 PKT: the owner approved A1–A7 with backend directly and slice 1 is BUILT — §11; the banner below stays valid for A8, A9 and every later row.)_

## 1. Why (the audit in five lines)

The current Fleet Dashboard (`GET /fleet/dashboard*`, five endpoints) shows numbers that contradict each other — verified 2026-09-25 against raw records, range 19–25 Sep:
1. **Trip counts ignore ad-hoc trips:** overview / trends say **2 trips, 0 completed, 2 cancelled**; the raw data has **24 trips started in the range (21 completed, 3 cancelled)** (43 in total; a Jan-1→today range still says 2 / 0 / 2). Only trips with `planned_start_at` seem to count; the same screen's vehicle table sums to 21 (by `actual_start_at`).
2. **Two "fuel used" definitions** (KPI = fuel-log litres 80 L; vehicle table = trip-level fuel 30 L for the same vehicle) and an efficiency (1.8 km/L) that divides GPS distance by fuel-log litres.
3. **Three different "distance" numbers** on one screen (`trips.actual_distance_km` 0, `utilisation.distance_km` 144.3, table sum 144.4).
4. **"Utilisation" is trip arithmetic, not telemetry:** `driving_hours` = Σ duration of completed trips; `parked_hours` = available − driving (11,087.9 h, including vehicles with no tracker); `idle_hours` always 0.
5. **Status cards:** `offline` 65 of 66 because 64 vehicles never reported (no tracker), `unknown` 64 is a subset of `offline`, and "moving" lasts 30 min while the map treats a position as stale after 15 min. `cost_breakdown.maintenance` is always `null` although maintenance logs carry costs; `GET /fleet/dashboard/vehicle-performance` has no paging.

The frontend wants an **enterprise-grade** dashboard + analytics + reports + ledger. The design (widgets, chart forms, colours) is in `FLEET_ANALYTICS_DESIGN.md`; this file is what it needs from the API. Order = priority: **P1** blocks the Overview redesign, **P2** the report pages, **P3** later.

## 2. A — fixes to the existing dashboard endpoints (P1)

| # | Ask | Detail |
|---|---|---|
| **A1** | **Trip date basis** | A trip belongs to the period of `actual_start_at`, else `planned_start_at` (the same rule `GET /trips` uses for `date_from` / `date_to`). Fixes `trips.*`, `on_time_pct`, `avg_duration`, `trends.trips`, and every KPI derived from trips. |
| **A2** | **One distance definition** | Order: telemetry distance → odometer delta → trip `actual_distance_km`; the same number in overview, trends, vehicle table. Please tell us which you consider the source of truth and expose `distance_source: "telemetry" \| "odometer" \| "trip"` per vehicle row. |
| **A3** | **One fuel definition** | Fuel used = fuel LOGS (volume) in the period, everywhere; economy = **full-tank method** (km between two full fills ÷ litres of the later fill) — not km ÷ arbitrary litres. Trip-level `fuel_used_liters` stays a trip attribute, not the KPI. Anomaly flags (fill > tank capacity, economy drop > X %) welcome. |
| **A4** | **Exclusive status states** | `moving`, `idle`, `parked`, `offline` (has a tracker, silent longer than the threshold), **`no_tracker`** (never had a tracker assigned / never reported) — mutually exclusive, summing to `total`; drop `unknown` (or keep it as a documented alias of `no_tracker`). **One freshness threshold** shared with `GET /fleet/positions` (please add a `fresh` boolean / `age_seconds` there) — company setting, default 15 min (F1). |
| **A5** | **Company timezone** | Day / week / month buckets and `from` / `to` are interpreted in the **company timezone** (F1), returned in `meta.timezone`. Please confirm what happens today (UTC?). |
| **A6** | **Costs in the breakdown** | `financial.cost_breakdown`: include **maintenance** (sum of `maintenance_logs.cost` by `service_date`) and, once the ledger exists (E1), every ledger category; `total_cost` = sum of the breakdown. |
| **A7** | **Utilisation definition + precision** | `available_hours` = in-service vehicles (active, **excluding** hours in maintenance / retired) × scheduled hours per day (F1, default 24); return `rate` with 2 decimals; when the vehicle has no tracker say so (`basis: "telemetry" \| "trips"` per vehicle). |
| **A8** | **`vehicle-performance` at scale** | Add `page`, `per_page`, `search`, `sort_by` on **every** column + `sort_order`, filters (`vehicle_category`, `vehicle_id[]`, `driver_id[]`, `cost_centre`), `pagination` envelope, and per-row `vehicle_category`, `has_tracker`, `utilisation_basis`, `cost_per_km`, `incident_count`, `maintenance_cost`. CSV export like the other lists. |
| **A9** | **Realtime for status** | A vehicle turning "offline" produces no event today. Please emit `fleet:status` (company room) when a vehicle changes state, **including timer-driven moving→offline transitions**, or a once-a-minute `fleet:status_summary { moving, idle, parked, offline, no_tracker, total }` — so the Overview donut is live without polling. |

## 3. B — new analytics endpoints (P1 for B0–B3, P2/P3 for the rest)

**B0 — one common contract for every analytics endpoint** `GET /fleet/analytics/{report}` (reports below):
- Params: `from`, `to`, `interval` (`hour|day|week|month`), `compare` (`none|previous_period|previous_year`), filters `vehicle_category`, `vehicle_id[]`, `driver_id[]`, `customer_id`, `cost_centre`, `yard_id`; tables take `page`, `per_page`, `search`, `sort_by`, `sort_order`.
- Response: `{ success, message, data: { summary: {metric: {value, previous, delta_abs, delta_pct}}, series: [{bucket, …}], breakdown: […], table: {items, pagination}? }, meta: { from, to, timezone, interval, compare, generated_at, definition_version, data_quality: { vehicles_total, vehicles_with_telemetry, … } } }`. Every metric documented in `x-quirks` with its formula.
- `GET /fleet/analytics/{report}/export?format=csv|pdf` (F3).

| # | Report | What it returns |
|---|---|---|
| **B1 (P1)** | `summary` | The six Overview KPI tiles with delta vs previous period and a 14-bucket sparkline series: `fleet_availability`, `utilisation`, `on_time_pct`, `cost_per_km`, `fuel_economy`, `open_issues`. |
| **B2 (P1)** | `GET /fleet/attention` (unified worklist) | Paged list of items `{id, type, severity, title, entity: {type, id, name}, since, action}` merged server-side from: fleet alarms (`fleet_only`), maintenance overdue / due, documents + driver licences expired / expiring, vehicles offline > 24 h **that have a tracker**, severe incidents (7 d), planned trips starting within 24 h without driver / vehicle, vehicles checked in at a yard > X days. Filters `severity`, `type`; `counts` by severity / type. |
| **B3 (P1)** | `GET /fleet/status-summary` | Exclusive status counts (A4) + `by_category` + `coverage` (`with_tracker`, `no_tracker`); accepts the scope filters. |
| **B4 (P2)** | `utilisation` | Series (utilisation %, moving / idle / parked hours, distance per bucket), **heatmap** `[{dow, hour, moving_pct}]`, per-vehicle paged table (km, moving h, idle %, utilisation %, trend sparkline). |
| **B5 (P2)** | `trips` | Status series, on-time % series, duration histogram (buckets), cancellation reasons (top-N), planned-vs-actual distance variance, paged table with delay minutes. |
| **B6 (P2)** | `fuel` | Economy series, litres + cost per bucket, price per litre series, economy by vehicle category, anomalies list, paged fills table. |
| **B7 (P3)** | `maintenance` and `compliance` | Buckets (overdue / ≤ 7 d / ≤ 30 d / ok) for schedules, documents, licences; maintenance cost per bucket; downtime days; compliance rate; paged tables with next-due date / km. |
| **B8 (P3)** | `drivers` and `GET /incidents/summary` | Driver scorecard rows (trips, km, on-time %, incidents, idle %, harsh events when available), incidents by severity / type / week, incidents per 100 000 km, top-N vehicles / drivers by incidents. |
| **B9 (P2)** | `yards` and `GET /geofences/events/summary` | Yard occupancy now (`occupied / slots`) + average dwell; geofence events per hour / day by `enter|exit`, top geofences. |

## 4. C — company-wide lists that do not exist today (P1 for C1, else P2)

| # | Ask |
|---|---|
| **C1 (P1)** | `GET /maintenance-schedules` — company-wide, with **computed** `next_due_date`, `next_due_odometer_km`, `status` (`overdue \| due_soon \| ok`, "soon" = 7 d or 500 km, configurable F1), filters (`status`, `vehicle_id`, `service_type`, `due_before`), search, sort, paging, export, `counts` by status. Today schedules are only inside `GET /vehicles/{id}`. |
| **C2 (P2)** | `GET /maintenance-logs` — company-wide list (date range, vehicle, type, vendor, cost), paging, sort, export. |
| **C3 (P2)** | `GET /fuel-logs` — company-wide list (date range, vehicle, vendor, payment method, anomaly flag), paging, sort, export, `summary` (litres, cost, avg price). |
| **C4 (P2)** | `GET /compliance-documents/counts` (by status expired / ≤ 7 d / ≤ 30 d / ≤ 60 d / ok and by `document_type`) and `expiring-soon` with a configurable window; same for driver licences (`/drivers/counts` already has `license_state` — please confirm it covers expired / expiring buckets). |

## 5. D — telemetry-derived metrics (the "IoT" in IoT fleet management) (P1 questions, P2 build)

**Questions first** — what do device payloads carry for vehicles today (`speed`, `ignition`, `odometer`, `fuel_level`, `temperature`, `harsh_*`, `battery`)? Which are mapped to product roles? How long is position history kept?

| # | Ask |
|---|---|
| **D1 (P2)** | **Daily (and hourly) vehicle rollup** built by a worker from packets: `distance_km`, `moving_minutes`, `idle_minutes` (speed 0 with ignition on > X min, F1), `stopped_minutes`, `engine_on_minutes` if available, `max_speed`, first / last packet time, start / end odometer, `packets_count` → powers utilisation, idle %, the day×hour heatmap and distance without scanning positions. |
| **D2 (P2)** | **Trip actuals from GPS** when the operator gives no odometer: `actual_distance_km` and `actual_duration_minutes` from the GPS trail; flag `distance_source`. |
| **D3 (P3)** | Idle hotspots (geo-bucketed idle minutes per yard / geofence / grid cell) and long-idle events. |
| **D4 (P3)** | Harsh driving / speeding events (rule engine → incident-like records per driver / vehicle) if the devices provide them. |

## 6. E — ledger, revenue, receivables (P3; design it with the owner's wishlist in mind)

The owner wants a **ledger** (money per vehicle / driver / trip / customer), reports, graphs. A billing / CRM module already exists (`/billing/invoices`, `/billing/billable-events`, `/fleet-customers`, contracts, rate cards) but the dashboard's revenue / profit / margin / outstanding / overdue are "Coming soon". Please tell us what invoices and billable events already contain (this company has 0 invoices, so we could not see real rows) and propose:

| # | Ask |
|---|---|
| **E1** | **Ledger entries**: `{id, date, category (fuel|maintenance|driver|tolls|fines|insurance|tax|other|revenue), amount, currency, tax_amount, vehicle_id, driver_id, trip_id, customer_id, cost_centre, vendor, description, source (fuel_log|maintenance_log|invoice|manual), source_id, status, attachment}` with CRUD + list (filters, paging, export) + audit fields + `expected_updated_at`. **Auto-posted from fuel logs and maintenance logs** (edited at the source), manual entries for the rest. |
| **E2** | **Revenue & P&L** per vehicle / trip / customer / period from invoices / billable events; margin; `GET /fleet/analytics/costs` (cost by category, cost per km, top-N vehicles) and `.../profitability`. |
| **E3** | **Receivables ageing** buckets (0–30 / 31–60 / 61–90 / 90+), outstanding, overdue, by customer. |
| **E4** | Optional: budgets per category / cost centre; vehicle TCO with depreciation (`acquisition_cost` exists on vehicles). |

## 7. F — settings, saved views, exports, schedules (P1 for F1, P3 for F2–F3)

| # | Ask |
|---|---|
| **F1 (P1)** | **Company fleet settings** (`GET/PUT /fleet/settings`): `timezone`, `position_freshness_minutes` (default 15), `idle_threshold_minutes`, `scheduled_hours_per_vehicle_per_day` (default 24), `on_time_grace_minutes`, maintenance "due soon" window (days / km), and **KPI targets** (`utilisation_target_pct`, `on_time_target_pct`, `cost_per_km_target`, `idle_limit_pct`, `fuel_economy_target`) used for colour coding and target lines. |
| **F2 (P3)** | **Saved views** (per user, per report): stored filters + name. Say if you want them server-side (we prefer yes: they follow the user across browsers). |
| **F3 (P3)** | **Export + schedule**: server-side CSV / PDF for every analytics report, and scheduled email reports (`POST /fleet/reports/schedules`: report, filters, cadence, recipients, format). |

## 8. Decisions already made on the frontend (FYI — the owner delegated them; tell us only if one is impossible)

- **Three URL-routed areas** under Fleet Management — Operations (Overview is the landing page), **Analytics** (one page per report; analytics = reports, each with export) and **Ledger** (finance: entries, P&L, receivables). Default range last 7 days with **compare = previous period on**; day buckets in the company timezone; filters (range, category, vehicle, driver, customer, cost centre) are the same on every analytics endpoint (B0).
- **Metric truth order** telemetry → odometer → trip records, every figure labelled with its basis and coverage (`meta.data_quality`).
- **Ledger = an operational fleet ledger**, not a general accounting system: cost / revenue entries per vehicle / driver / trip / customer, auto-posted from fuel and maintenance logs, manual entries with attachments, P&L, receivables ageing; no double-entry, no tax filing; export to accounting software later.
- **Scale target** the UI is designed for: 10 000 vehicles, 100 000 trips / month, 1 M position packets / day — please tell us if you cannot serve that with the proposed endpoints.
- Full design: `FLEET_ANALYTICS_DESIGN.md` (frontend repo root; the relevant parts are summarised here so nothing depends on our repo).

## 9. Questions for backend (please answer in your reply)

1. **Telemetry:** which fields do vehicle trackers deliver today, how long is position history kept, and can a worker produce the D1 rollup? What is the scale target (vehicles, packets/day) so we agree pagination / caching?
2. **Timezone:** is the company timezone stored anywhere (A5)? What do the day buckets use today?
3. **Billing:** what do invoices / billable events / rate cards contain, and can revenue per trip / customer already be derived (E2)?
4. **Definitions:** do you agree with A1–A7 (they change numbers on the existing dashboard)? Is there a reason for the planned-start-only trip basis?
5. **Sequencing:** which of A1–A9, B0–B3, C1, F1 can you deliver first (they unblock the Overview redesign)? The frontend will build the UI against typed mocks meanwhile and integrate as rows turn BUILT.
6. Anything you would design differently, or a metric that you think an enterprise fleet dashboard needs and we did not list.
7. **Permissions:** can the Ledger get its own permission (e.g. `fleet-ledger`) separate from `all-fleet`, even before the general RBAC task (B12)? What would it take?
8. **Ledger workflow:** do we need period locking / approval of entries (a closed month cannot be edited)? Your recommendation for an operational ledger.
9. **Currency:** the company has one currency today (`companies.currency`). Should ledger entries be single-currency (company currency) for now, or carry their own currency + rate?
10. **Attachments:** is there a file-upload endpoint / storage for receipts and invoices (and limits), or should we ask for one (`POST /ledger-entries/{id}/attachments`)?
11. **Scale:** can the analytics endpoints serve the scale target above? Do you prefer on-the-fly aggregation, pre-computed rollups (D1), or both, and what cache lifetime is acceptable for the KPI tiles (we plan 60 s)?
12. **Retention:** how long are positions, geofence events and telemetry rollups kept (affects the longest date range we may offer: 12 months? 24?)?
13. **Sequencing / answers format:** for every row A1–F3 please reply BUILD / ALREADY EXISTS (where) / DIFFERENT IDEA / NOT NOW, and give a rough order of delivery.

**Frontend plan meanwhile (no dependency on your answers; starts as soon as the owner passes this folder to you):** the widget kit (KPI tile, delta chip, sparkline, donut, stacked columns, rank bars, heatmap, worklist, server-paged table, filter bar with URL-synced state, glossary popover, skeleton / empty states), the Overview layout on typed mocks, light / dark tokens for status / severity / category colours.


## 10. Backend reply (2026-09-25 08:00 PKT, backend) — facts for your §9 questions and first recommendations; NO row is built yet, row verdicts follow after the owner decides

Your §35 (L1–L6 re-test) and this flow were merged cleanly (your copy was based on our 07:25 folder — nothing reverted). **Thank you for the audit — every number in §1 matches what the code does.** This is a large programme, so the backend is doing it in order: (1) answer the **facts** now (below), (2) the **owner decides** the changes that alter existing numbers and the phasing (one question at a time), (3) a second reply gives the **BUILD / ALREADY EXISTS / DIFFERENT IDEA / NOT NOW verdict for every row A1–F3 with a delivery order**. Nothing here is built; do not build against it yet (typed mocks are the right call).

### 10.1 Answers to your questions (facts, verified against the code today)
1. **Telemetry (Q1 / D):** only four attributes have a fleet **role** today — `latitude`, `longitude`, `speed`, `heading` (set with "Mark as location"). Every attribute of every packet is stored (`device_values`, a TimescaleDB hypertable, **compressed after 7 days, deleted after 12 months**) together with the raw packet, but `ignition`, `odometer`, `fuel_level`, `temperature`, harsh-driving events and `battery` have **no role** and the fleet code does not use them (they exist only if the tracker sends them and the product defines the attribute). `device_positions` (lat / lng / speed / heading / `recorded_at` = the moment we **received** the packet) has **no retention policy** — kept indefinitely — and is not a hypertable. A worker-built **D1 rollup is feasible** (BullMQ workers exist), but idle / engine-on / odometer-based figures need those attributes mapped to roles first (a small extension of "Mark as location"). We have no load-tested scale numbers; today every dashboard figure is aggregated on the fly.
2. **Timezone (Q2 / A5):** there is **no company timezone**. `users.timezone` (a nullable text on the user) exists but the dashboard does not use it. **Today all day / week / month buckets and the `from` / `to` boundaries are UTC.** F1 would add it.
3. **Billing (Q3 / E):** `invoices` = number, issue / due date, subtotal, tax, total, currency, status (`draft|issued|pending|paid|partial|overdue|cancelled`), `paid_at`, gateway reference, customer, contract; `invoice_payments`; `billable_events` = one per trip (type, quantity, unit, unit rate, amount, currency, status `pending|invoiced|cancelled`, invoice link); `rate_cards` per contract (billing unit, unit rate, surcharge, vehicle category); `contracts`; `fleet_customers`. **Revenue per trip / customer and receivables ageing can be derived from these** (billable events = revenue, invoices' `due_date` + `status` + `total` − payments = receivable). Real payment processing stays a placeholder (owner).
4. **Definitions (Q4 / A1–A7):** the planned-start-only trip basis has **no product reason**: the dashboard is a line-by-line port of Laravel's `FleetDashboardService` — the trip status counts, on-time %, average duration, planned-vs-actual distance and the trends filter on `planned_start_at`, while utilisation, fuel and vehicle-performance filter completed trips by `actual_start_at`, which is exactly the contradiction you found. Changing these **changes numbers on an existing screen and deviates from Laravel**, so the owner approves them (next step below).
5. **Sequencing (Q5):** our recommendation is in §10.3.
7. **Permissions (Q7):** fleet is one permission (`all-fleet`). A separate `fleet-ledger` right is technically small (a new module + permission rows, a guard, assigning it to roles) but it overlaps the deferred enterprise-RBAC task, so it is the owner's decision.
10. **Attachments (Q10):** Cloudflare R2 storage exists (vehicle image, yard layout, floor plans; images ≤ 10 MB) but there is **no generic attachment endpoint**; `compliance_documents.file_path` is only a text field. `POST /ledger-entries/{id}/attachments` would be new (PDF / image, a size limit) — fine to ask for.
12. **Retention (Q12):** `device_values` 12 months (policy in the database); **positions, geofence events, trips and everything else: no deletion policy today.** A retention policy for raw positions (with rollups kept longer) is an owner decision.

### 10.2 What already exists (so you do not mock it)
- **C4 licences:** `GET /drivers` / `GET /drivers/counts` already take `license_state` (`expired | expiring | valid | none`) and `license_expiring_within_days`; **documents:** `GET /compliance-documents/expiring-soon` (30 days or already expired, both types) and `expiring_within_days` on the list — a **counts by status / type** endpoint does not exist.
- **A3 / A6 data:** fuel logs already carry `is_full_tank`, `odometer_km`, vendor, payment method, `total_cost` (the full-tank economy method is possible); maintenance logs carry `cost` and `service_date` (the maintenance cost in the breakdown is a missing aggregation, not missing data).
- **Not existing:** a company-wide maintenance-schedule list with computed due status (C1 — you are right), company-wide maintenance / fuel log lists (C2 / C3), `fleet/settings` (F1), `fleet/attention` (B2), `fresh` / `age_seconds` on positions, `fleet:status` events (A9), any rollup (D1), ledger entries (E1), saved views (F2), report exports / schedules (F3).

### 10.3 First recommendations (opinions, not decisions — the owner decides)
- **Phasing:** **P1** F1 (company fleet settings — the one new table that everything else reads) → the A1–A7 definition fixes → B3 status summary, C1 schedules list, B1 summary KPIs, B2 attention feed, A8 vehicle-performance paging, A9 status realtime. **P2** D1 rollup (it unlocks utilisation / idle / heatmap / distance without scanning positions) → B4 / B5 / B6 / B9 + C2–C4. **P3** B7, B8, D2–D4, the ledger (E), F2, F3.
- **Things we would design differently:** (a) **A4:** keep `unknown` as a documented alias of `no_tracker` for one release instead of dropping it (the current screen reads it); (b) **A2 / A7** depend on D1 — until it exists distance / utilisation would fall back to odometer / trip records and say so in `meta.data_quality`; (c) **A9:** the once-a-minute `fleet:status_summary` is simpler and cheaper than per-vehicle transition events (a timer-driven moving→offline needs a scheduler job either way); (d) **B0:** one `GET /fleet/analytics/{report}` contract is good — we would keep separate paths per report but the same params / envelope; (e) **scale (Q11):** telemetry-derived reports at 10 000 vehicles / 1 M packets a day need the D1 rollup (on-the-fly scans of positions will not do); trips / fuel / maintenance / ledger aggregate fine on the existing indexes; a 60 s cache on the KPI tiles is acceptable.
- **Ledger workflow (Q8):** for an *operational* ledger we would **not** start with period locking / approvals; instead entries are never hard-deleted once posted — a **void with a reason** (audit kept) — plus the existing audit fields and `expected_updated_at`. **Currency (Q9):** single company currency for now (entries carry a `currency` column set to the company's, no rates); multi-currency later.

### 10.4 What happens next
The owner is asked, one question at a time: (1) approve the A1–A7 definition changes (numbers change on the current dashboard), (2) the phasing above, (3) the ledger questions (Q7–Q10), (4) scale / retention. After each decision the backend builds contract-first and marks the row **BUILT** here with a response-change checklist. **Please keep building against typed mocks until a row says BUILT.**

*(A copy of this folder is owed to the frontend — it now contains this reply.)*


## 11. Backend reply (2026-09-25 08:30 PKT, backend) — SLICE 1 is BUILT and live-verified: F1 fleet settings + A1–A7 definition fixes (owner approved A1–A7 as recommended, 2026-09-25)

**Owner decision (recorded, D-0183):** "approve A1–A7 as recommended" — with your `unknown` kept as an alias of `no_tracker` for one release. **A4, A5 and A7 read company settings, so F1 was built with them.** Contract regenerated (**304 operations**: `GET/PUT /fleet/settings` are new; everything else only gained fields / `x-quirks`). Tests 1589/1589. **Re-read §11.2 before touching the Overview: it changes numbers on the existing dashboard (owner-approved) — that is exactly the list required by the new "never break what works" rule (sync `README.md`).**

### 11.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **F1** company fleet settings | **BUILT** — `GET /fleet/settings`, `PUT /fleet/settings` (§11.3). Timezone, freshness, idle threshold, scheduled hours, on-time grace, maintenance due-soon window, five KPI targets. **Read today by:** the dashboard endpoints (timezone, freshness, scheduled hours, on-time grace) and `GET /fleet/positions` (`fresh`). Idle threshold, maintenance window and targets are **stored, not consumed yet** (the reports that need them come next) |
| **A1** trip date basis | **BUILT** — a trip belongs to the period of `actual_start_at`, else `planned_start_at` |
| **A2** one distance | **BUILT (interim basis)** — one number everywhere = completed trips' `actual_distance_km` (operator odometer delta, else the trip tracker's GPS distance); `distance_source` per vehicle row = `odometer` / `telemetry` / `trip` (the source of most of its km). A pure telemetry distance comes with the D1 rollup |
| **A3** one fuel definition | **BUILT** — fuel logs everywhere, gallons converted to litres, economy = **full-tank method**. Anomaly flags = **NOT NOW** (with B6) |
| **A4** exclusive statuses | **BUILT** — `moving / idle / parked / offline / no_tracker`, sum = `total`; `unknown` kept as a deprecated alias; freshness threshold = the company setting (default **15 min**); `age_seconds` + `fresh` on `GET /fleet/positions` |
| **A5** company timezone | **BUILT** — `from` / `to` are calendar dates in the company zone, buckets start at local midnight, `meta.timezone` returned. **Default `UTC` = today's behaviour until the owner sets the real zone** |
| **A6** costs | **BUILT** — maintenance in `cost_breakdown`, `total_cost` = the breakdown's sum (ledger categories with E1) |
| **A7** utilisation | **BUILT (interim basis)** — in-service vehicles × scheduled hours × local days, `rate` 2 decimals, `basis: "trips"` (per-vehicle `utilisation_basis`); `basis: "telemetry"` comes with D1 |
| **A8, A9, B0–B9, C1–C4, D1–D4, E1–E4, F2, F3** | **Not built yet** — the owner picks the next slice (our recommendation: B3 status summary, C1 schedules list, B1 summary KPIs, B2 attention feed, A8 vehicle-performance paging, A9 status realtime). Keep building against typed mocks |

### 11.2 Changes to EXISTING behaviour (owner-approved; the checklist the new rule requires — please update types / screens)
| # | Endpoint · field | Before → now |
|---|---|---|
| 1 | `GET /fleet/dashboard` · `trips.total / completed / cancelled / planned`, `on_time_pct`, `avg_duration_minutes`, `planned_distance_km`, `actual_distance_km`, `distance_variance_km`; `trends.trips` | trips counted by `planned_start_at` only → by the period of `actual_start_at`, else `planned_start_at`. Your audit case now reads 24 started / 21 completed for 19–25 Sept. `on_time_pct` uses the company grace (default 0 = unchanged rule). `actual_distance_km` is now the completed trips' distance (was 0 because of the basis) |
| 2 | `GET /fleet/dashboard` · `fleet_status` | **`offline` no longer includes vehicles without a tracker** (66 → 2 on the current data); **new `no_tracker`** (64); `unknown` = the same number as `no_tracker` (**deprecated alias**, removed in a later release — tell us when you have moved off it); "moving/idle/parked" now use the company freshness (15 min, was a fixed 30) so a tracker silent 15–30 min is now `offline` |
| 3 | `GET /fleet/dashboard` · `alerts.offline_vehicles` | = `fleet_status.offline` → trackers only |
| 4 | `GET /fleet/dashboard` · `fuel` | `used_liters` / `total_cost` unchanged in meaning (gallons logs now converted to litres); **`average_efficiency_km_per_liter` = full-tank method, may be `null`** (was trip km ÷ log litres, e.g. 0.24); new `efficiency_basis: "full_tank"`; `cost_per_km` unchanged |
| 5 | `GET /fleet/dashboard` and `/financial` · `cost_breakdown.maintenance`, `total_cost` | `maintenance` was always `null` → the period's maintenance-log costs (a number, `0` when none); `total_cost` = fuel + maintenance |
| 6 | `GET /fleet/dashboard` · `utilisation` | `rate` 1 → **2 decimals**; `available_hours` = **in-service (`active`) vehicles** × scheduled hours/day × local days (was all non-retired × 24 × hours); new `basis`, `vehicles_in_scope`, `scheduled_hours_per_day`. Vehicles `in_maintenance` are now out of `available_hours` (they stay in `fleet_status`) |
| 7 | `GET /fleet/dashboard/vehicle-performance` · rows | `fuel_used_liters` = **fuel logs** (was trip-level fuel); `fuel_efficiency` = full-tank (may be `null`); `utilisation_rate` 2 decimals; new `distance_source`, `utilisation_basis`; ranking follows the new numbers |
| 8 | all `GET /fleet/dashboard*` · `meta` | new `meta.timezone`; `meta.from` / `meta.to` and every bucket `date` are **local dates** in that zone (UTC until the company sets one) |
| 9 | `GET /fleet/dashboard/trends?interval=week` | **weekly buckets are contiguous and Monday-aligned** — after a partial first week the earlier version stepped 7 days and left the days in between out of every bucket (bucket dates shift, e.g. `2026-09-08` → `2026-09-07`, and the counts / litres in them change). Utilisation trend `rate` 2 decimals |
| 10 | `GET /fleet/positions` | **additive:** each row gains `age_seconds` and `fresh` |
| 11 | the same rule everywhere | fuel in **gallons** is converted to litres in every dashboard fuel figure (before, a gallons log was added as if it were litres) |

**What is NOT changed:** every other endpoint of every module. Before / after the rebuild we snapshotted **86 `GET` endpoints** (every list / dashboard / settings / assets / products / devices / rules / roles / billing endpoint without path parameters, plus fleet detail views): **74 identical**, the differences are exactly the ones above plus `/connectors/health`'s own timestamps and the new `/fleet/settings` (and, unrelated to this change, `updated_at` of the default roles' permissions in `GET /roles/company`, which the deploy's idempotent seed re-stamps on every rebuild). Please re-test the screens that use the changed fields (Fleet Overview, its status cards, vehicle table, trends, positions/map "stale" hints) **and say which unchanged screens you re-tested**.

### 11.3 The settings endpoints
- `GET /fleet/settings` → `data: { timezone, position_freshness_minutes, idle_threshold_minutes, scheduled_hours_per_vehicle_per_day, on_time_grace_minutes, maintenance_due_soon_days, maintenance_due_soon_km, utilisation_target_pct, on_time_target_pct, cost_per_km_target, idle_limit_pct, fuel_economy_target, is_default, created_at, updated_at, updated_by, updated_by_user }`. Defaults until a company saves: `UTC`, 15, 5, 24, 0, 7, 500, targets `null` (`is_default: true`, `updated_at: null`).
- `PUT /fleet/settings` — partial (send only what changed; a target may be `null`), creates the row on first save, optional `expected_updated_at` (409 with `current`, like every fleet `PUT`). 422s: `timezone` must be an IANA name; freshness / idle 1–1440; scheduled hours 1–24; grace 0–1440; due-soon days 0–365, km 0–100000; percentages 0–100; other targets ≥ 0. Guard: `all-fleet` (a separate right is the owner's later RBAC decision).
- **The owner still has to set the company's real timezone** (e.g. `Asia/Karachi`) — until then everything stays UTC exactly as before. A settings screen for it is yours to build when you like.

### 11.4 Known limits (documented, KNOWN_ISSUES 11.93)
Utilisation excludes vehicles by their **current** status (no status history); a vehicle with an installed tracker that never reported counts as `offline` (not `no_tracker`); the economy needs two full fills with odometer readings in the period (shorter ranges often give `null`); distance / utilisation are trip-based until D1.

### 11.5 What we need from you
Re-test the changed dashboard fields (list above) and the unchanged screens around them, then tell us. The next slice is the owner's decision; answers to your remaining §9 questions stay as in §10.

*(A copy of this folder is owed to the frontend — it now contains §11, the regenerated contract and the new "never break what works" rule in `README.md`.)*


## 12. Backend reply (2026-09-25 08:49 PKT, backend) — SLICE 2a is BUILT and live-verified: B3 status summary, C1 company-wide maintenance schedules, A8 vehicle-performance table

**All three are additive** (the owner approved building the recommended next slice; nothing existing was removed or renamed). Contract regenerated (**308 operations**, +4). Tests 1613/1613. Not in this slice (still to come): **B1** summary KPIs, **B2** attention feed, **A9** status realtime, then D1 and the P2 reports.

### 12.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B3** `GET /fleet/status-summary` | **BUILT** (§12.2) |
| **C1** `GET /maintenance-schedules` (+ `/export`) | **BUILT** (§12.3) — `counts` are in `meta.counts` |
| **A8** vehicle-performance at scale | **BUILT** (§12.4) — paging is **opt-in**, so the existing response is unchanged |
| B0 common analytics contract | **partly**: the scope filters (`vehicle_category`, `cost_centre`, `vehicle_id[]`, `driver_id[]`, `yard_id`) exist on B3 / A8 with one vocabulary; `compare`, `interval`, `customer_id` come with the reports |

### 12.2 `GET /fleet/status-summary` (B3)
Scope filters (all optional, combine with AND): `vehicle_category` (case-insensitive), `cost_centre`, `vehicle_id` and `driver_id` (comma list **or** `vehicle_id[]=1&vehicle_id[]=2`; a driver filter = the vehicle's **current** driver), `yard_id` (vehicles currently checked in at that yard). A non-numeric id → 422 `The vehicle id must be a list of ids.`
`data`: `{ total, by_status: { moving, idle, parked, offline, no_tracker }, by_category: [{ category | null, total, moving, idle, parked, offline, no_tracker }], coverage: { with_tracker, no_tracker, tracker_pct }, active_trips }`, `meta: { timezone, position_freshness_minutes, generated_at }`. The counts use **exactly the same rules** as `GET /fleet/dashboard` → `fleet_status` (they are equal without a scope). `by_category` groups by the category as stored (`null` = uncategorised). Retired / sold vehicles are not in the fleet.

### 12.3 `GET /maintenance-schedules` (C1)
**Always paged** — `data: { items, pagination }` (`page` 1, `per_page` 20, max 100). Each item = the schedule (`id`, `vehicle_id`, `service_type`, `interval_days`, `interval_km`, `last_service_date`, `last_service_odometer_km`, `odometer_baseline_km`, `odometer_baseline_date`, audit fields) + `vehicle { id, name, plate, vehicle_category, odometer_km }` + the **computed** `next_due_date`, `next_due_odometer_km`, `days_until_due` (whole days, negative when overdue), `km_until_due` (negative when overdue, `null` without an odometer reading), `status` (`overdue | due_soon | ok | unknown`) and `due_by` (`date | odometer` — the limit that decided it).
**Rules (nothing is guessed):** a schedule counts from its last service — or, never serviced, from the operator's baseline: `next_due_date = base date + interval_days`, `next_due_odometer_km = base odometer + interval_km`. `overdue` = the due date strictly passed **or** the vehicle's odometer at / past the due odometer; `due_soon` = within the company's window (`maintenance_due_soon_days` 7 / `maintenance_due_soon_km` 500 — from `GET /fleet/settings`); the worse limit wins; `unknown` = nothing computable (no interval, or no base). Schedules of retired / sold vehicles are left out unless `include_inactive=1`.
Filters: `status` (comma list or `status[]`), `vehicle_id`, `service_type` (exact, case-insensitive), `vehicle_category`, `due_before` (date), `search` (service type, vehicle name / plate). Sort: `sort_by` = `next_due_date` (default) | `status` (worst first) | `vehicle_name` | `service_type` | `last_service_date` | `days_until_due` | `km_until_due`, `sort_order`; empty values last in both directions. **`meta.counts`** = `{ total, overdue, due_soon, ok, unknown }` of the filtered set **without** the `status` filter (a chip never zeroes the others) + `due_soon_days`, `due_soon_km`. `GET /maintenance-schedules/export` = the same filters / sort as CSV.

### 12.4 `GET /fleet/dashboard/vehicle-performance` (A8) — opt-in
- **Without paging parameters `data` is the flat array it always was.** `page` / `per_page` (default 20, max 100) → `data: { items, pagination }` + `meta.total`.
- `search` (name / plate); scope filters as in §12.2; `sort` (alias `sort_by`) now accepts **every column** — the original five plus `vehicle_name`, `plate`, `vehicle_category`, `trip_count`, `fuel_efficiency`, `fuel_cost`, `maintenance_cost`, `cost_per_km`, `incident_count` — with `direction` (alias `sort_order`); empty values last in both directions; an unknown `sort` still falls back to `utilisation_rate`.
- **New row fields (additive):** `vehicle_category`, `has_tracker`, `maintenance_cost`, `cost_per_km` (= (fuel cost + maintenance cost) ÷ distance, `null` without distance), `incident_count`.
- `GET /fleet/dashboard/vehicle-performance/export` = the table's own filters / sort as CSV.

### 12.5 Changes to EXISTING behaviour (the checklist the rule requires)
| # | Endpoint | Before → now |
|---|---|---|
| 1 | `GET /fleet/dashboard/vehicle-performance` rows | **additive:** five new fields (§12.4); **ties now sort by vehicle id** (the order among equal sort values used to be the database's arbitrary order — with many zero-utilisation vehicles the visible order of those rows changes; the rows themselves are identical) |

**Nothing else existing changed.** Regression check: 88 `GET` endpoints snapshotted before / after the rebuild — **82 identical**; the differences are the two new endpoints, the additive fields above, `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. Please re-test the vehicle-performance table and say which unchanged screens you re-tested.

### 12.6 Known limits (KNOWN_ISSUES 11.94)
The schedule list and the performance table are computed in memory per request (fine for thousands of rows; a much larger fleet would need a rollup); `by_category` groups by the stored spelling (`Truck` and `truck` are two groups — the filter is case-insensitive); the schedule due state uses the vehicle's current odometer reading.

### 12.7 What we need from you
Re-test the vehicle-performance table, then build the Maintenance and Overview pieces against §12.2–§12.4. The owner picks the next slice (B1 summary KPIs, B2 attention feed, A9 status realtime, then D1 and the P2 reports).

*(A copy of this folder is owed to the frontend — it now contains §12 and the regenerated contract.)*


## 13. Backend reply (2026-09-25 09:12 PKT, backend) — SLICE 2b is BUILT and live-verified: B1 summary KPIs, B2 attention feed, A9 status realtime (`fleet:status_summary`)

**All three are additive** — no existing endpoint, field or event changed. Contract regenerated (**310 operations**, +2); tests 1636/1636. With §12 this completes the recommended "slice 2". **Still to come** (the owner picks): D1 telemetry rollups, B4–B9 reports, C2–C4 lists, then the ledger (E), saved views (F2), exports / schedules (F3).

### 13.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B1** `GET /fleet/analytics/summary` | **BUILT** (§13.2) — the six Overview tiles |
| **B2** `GET /fleet/attention` | **BUILT** (§13.3) |
| **A9** status realtime | **BUILT** as the **once-a-minute `fleet:status_summary`** variant we recommended in §10 (§13.4); per-vehicle `fleet:status` events = **NOT NOW** |
| **B0** common contract | now has its shape: `from`/`to`/`interval`/`compare` + scope filters + `meta { timezone, definition_version, data_quality }` on the summary; the same envelope will carry the reports |

### 13.2 `GET /fleet/analytics/summary` (B1)
Params: `from` / `to` (calendar dates in the company timezone; **default = the last 7 local days, today included**), `interval` = `day` (default) | `week` | `month`, `compare` = `none` (default) | `previous_period` | `previous_year`, and the scope filters of §12.2 (`vehicle_category`, `cost_centre`, `vehicle_id[]`, `driver_id[]`, `yard_id`). More than **92 buckets** → 422 (`…use a larger interval or a shorter range.`). (`hour` is not offered yet — it needs the D1 rollup.)
`data.summary` = six tiles, each `{ value, previous, delta_abs, delta_pct, target }`:
| Tile | Definition |
|---|---|
| `fleet_availability` | % = active ÷ (active + in maintenance) vehicles in scope — **point-in-time** (no vehicle status history), so `previous` is always `null` |
| `utilisation` | % = completed-trip hours ÷ (in-service vehicles × scheduled hours per day × local days) — the D-0183 A7 definition, `basis` trips |
| `on_time_pct` | completed trips of the period that ended within the company grace of their planned end ÷ completed trips |
| `cost_per_km` | (fuel-log cost + maintenance-log cost) ÷ completed-trip km |
| `fuel_economy` | full-tank method, km per litre (`null` without two full fills with odometer readings in the period) |
| `open_issues` | the attention feed's **critical + warning** items right now — point-in-time, `previous` `null` |
`target` = the company's KPI target from `GET /fleet/settings` (`null` when unset). **A tile with nothing to measure is `null`, never `0`.** With `compare`, `previous`, `delta_abs` (units / points) and `delta_pct` (relative to the previous value; `null` when it is `0` or missing) are filled in and `data.previous_period { from, to }` names the window (previous_period = the immediately preceding window of the same length; previous_year = the same dates one year earlier).
`data.series` = one point per bucket `{ bucket: "YYYY-MM-DD" (local date of the bucket start), utilisation, on_time_pct, cost_per_km, fuel_economy }` for the sparklines. `meta`: `from`, `to`, `timezone`, `interval`, `compare`, `generated_at`, `definition_version` (1; bumps when a formula changes), `data_quality { vehicles_total, vehicles_with_tracker, basis { per metric } }`.

### 13.3 `GET /fleet/attention` (B2)
**Always paged** (`data: { items, pagination }`, `page` 1, `per_page` 20, max 100). Most severe first, then the longest-waiting first (`since` ascending, unknown last). Item: `{ id, type, severity, title, entity: { type: "vehicle" | "driver" | "trip", id, name }, since, action }`; `id` is stable per source (`alarm:12`, `maintenance:5`, `document:3`, `licence:7`, `offline:2`, `incident:9`, `trip:4`, `yard:6`); `action` is a verb key for your button — `review_alarm`, `schedule_service`, `renew_document`, `renew_licence`, `check_tracker`, `review_incident`, `fix_trip`, `check_out_vehicle`.
| `type` | Severity | Rule |
|---|---|---|
| `alarm` | the alarm's own | open (active / acknowledged) alarms of devices **installed in a vehicle** |
| `maintenance_overdue` / `maintenance_due_soon` | warning / info | the schedule list of §12.3 (vehicles in service; the company's due-soon window) |
| `document_expired` / `document_expiring` | critical / warning | vehicle and driver documents expired / expiring within 30 days |
| `licence_expired` / `licence_expiring` | critical / warning | drivers that are not deactivated, licence expired / expiring within 30 days |
| `vehicle_offline` | warning | a vehicle **with a tracker** silent for more than 24 h (a tracker that never reported: `since: null`); vehicles without a tracker are never listed |
| `incident_severe` | warning | severe incidents of the last 7 days |
| `trip_at_risk` | warning | a planned trip starting within 24 h whose vehicle is not `active` or whose driver is not `active` (a trip always has both — it is their availability that is checked; the title says which) |
| `yard_long_stay` | info | an open yard stay longer than `yard_days` (default 7) |
Filters: `severity` and `type` (comma list or `severity[]` / `type[]`; unknown → 422 `The selected severity is invalid.` / `The selected type is invalid.`), `yard_days` (1–365). **`meta.counts` = `{ total, by_severity, by_type }`** — `by_severity` ignores the `severity` filter and `by_type` ignores the `type` filter (a chip never zeroes the others); `total` = the filtered total; `meta.rules` echoes the constants (30 d, 24 h, 7 d, 24 h, 7 d). Nothing is stored; the feed is recomputed on every request (refetch on `fleet:changed` / `trip:update` / `fleet:status_summary`).

### 13.4 `fleet:status_summary` (A9)
Socket event to the same `company:{id}` room (JWT company + `all-fleet`, like every fleet event): `{ total, moving, idle, parked, offline, no_tracker, occurredAt }` — the five exclusive states of `fleet_status`, summing to `total`. **Sent only when the counts change** (a scheduled job checks once a minute per company): a tracker that simply goes quiet — a timer-driven moving → offline change that produces no packet, so no other event — is announced within about a minute; an unchanged fleet is silent, so **do not expect a heartbeat** (keep refetch-on-reconnect / focus). Counts only; refetch `GET /fleet/status-summary` for detail. The counts follow the company's position-freshness setting. Best-effort like every fleet event.

### 13.5 Changes to EXISTING behaviour
**None.** No existing response, field, event, permission or default changed. What is new outside the API: **one background job** (the once-a-minute status check, on a new `fleet-status` queue — a cheap per-company status computation, nothing is written).
**Regression check:** 90 `GET` endpoints snapshotted before / after the rebuild — **86 identical**; the four differences are the two new endpoints plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. Please say which unchanged screens you re-tested when you integrate.

### 13.6 Live check
43 assertions on the rebuilt stack against independent SQL: every feed source count equals its own SQL count on your real data (alarms on installed devices, expired / expiring documents and licences, severe incidents, silent trackers, at-risk trips, long yard stays, maintenance), the order and counts rules, throwaway expired document / licence / overdue schedule showing up with the right type, severity, entity and action; the summary's tiles equal the dashboard's figures for the same range, `previous_period` equals the dashboard of the preceding window, the delta arithmetic, scope, targets from settings, the 422s; and the realtime test with a real socket — **silent for 75 s with no change; a throwaway vehicle produced `fleet:status_summary` after 29 s with `total` and `no_tracker` +1; deleting it produced the original counts; silent again afterwards.** All throwaway rows deleted.

### 13.7 Known limits (KNOWN_ISSUES 11.95) and what we need from you
The feed and the summary are computed per request from the live tables (fine for thousands of rows; a much larger fleet needs the D1 rollup and cached tiles — a 60 s client cache is fine); `open_issues` and `fleet_availability` are point-in-time; the 30-day / 24 h / 7-day windows of the feed are fixed constants for now (say if you want them settings). **What we need:** build the Overview tiles and the attention worklist against §13.2–§13.4 (the realtime donut can use `fleet:status_summary`), and re-test.

*(A copy of this folder is owed to the frontend — it now contains §13, the regenerated contract and the new socket event in `API_CONTRACT.md` §4.)*


## 14. Backend status index (the current state of EVERY row of this flow, 2026-09-25 09:20 PKT, backend)

One place to see where each ask stands (details in the section named). **BUILT** = live on the backend, contract regenerated, safe to build against. **NOT BUILT** = still a proposal — keep using typed mocks. Nothing here changes existing behaviour without the owner's approval (README rule "Never break what already works").
| Row | Status | Where |
|---|---|---|
| A1 trip date basis · A2 one distance · A3 one fuel definition · A4 exclusive statuses (+ `fresh` / `age_seconds` on positions) · A5 company timezone · A6 maintenance in costs · A7 utilisation definition | **BUILT** (owner-approved number changes; `unknown` kept as an alias of `no_tracker` for one release) | §11 (checklist §11.2) |
| A3 anomaly flags | **NOT NOW** (comes with B6) | §11.1 |
| A8 vehicle-performance at scale (opt-in paging, search, scope filters, every column sortable, CSV, new row fields) | **BUILT** | §12.4 |
| A9 status realtime | **BUILT** as the once-a-minute `fleet:status_summary` (per-vehicle `fleet:status` = NOT NOW) | §13.4 |
| B0 common analytics contract | **partly built**: scope filters + `from` / `to` / `interval` / `compare` + `meta` (timezone, definition_version, data_quality) on the summary; the report envelope (`table`, `breakdown`) comes with the reports; the `hour` interval needs D1 | §13.2 |
| B1 summary KPIs | **BUILT** (`GET /fleet/analytics/summary`) | §13.2 |
| B2 attention feed | **BUILT** (`GET /fleet/attention`) | §13.3 |
| B3 status summary | **BUILT** (`GET /fleet/status-summary`) | §12.2 |
| **B9** yards + geofence-event summary | **BUILT** (2026-09-25, D-0187): `GET /fleet/analytics/yards`, `GET /geofences/events/summary` | §19 |
| **B5** trips report | **BUILT** (2026-09-25, D-0189): `GET /fleet/analytics/trips` (+ `/export`) | §24 |
| **B6** fuel report | **BUILT** (2026-09-25, D-0190): `GET /fleet/analytics/fuel` (+ `/export`) | §25 |
| **B7** maintenance + compliance reports | **BUILT** (2026-09-25, D-0191): `GET /fleet/analytics/maintenance`, `GET /fleet/analytics/compliance` (+ `/export`) — **downtime days are NOT available** (no vehicle status history, §26.1) | §26 |
| **U1** per-company unit system (`unit_system` on `GET/PUT /fleet/settings`) | **BUILT** (2026-09-25, D-0192) — a display preference; the API stays metric | §32 |
| B4 utilisation report · B8 drivers + incidents summary | **NOT BUILT** (recommended order B4, B5, B6, then B7, B8; B4 wants the D1 rollup first) | §10.3 |
| C1 company-wide maintenance schedules | **BUILT** (`GET /maintenance-schedules` + export) | §12.3 |
| **C2** maintenance logs · **C3** fuel logs · **C4** compliance counts + expiring window | **BUILT** (2026-09-25, D-0188): `GET /maintenance-logs`, `GET /fuel-logs` (+ `/export`), `GET /compliance-documents/counts`, `within_days` on `GET /compliance-documents/expiring-soon` (C4 licences: `license_state` on the drivers list already exists — §10.2) | §20 |
| D1 daily / hourly vehicle rollup · D2 trip actuals from GPS · D3 idle hotspots · D4 harsh driving | **NOT BUILT** — D1 first; it needs the owner's decision to extend "Mark as location" to ignition / odometer / fuel level and a retention policy for positions | §10.1, §10.3 |
| E1 ledger entries · E2 revenue + P&L · E3 receivables ageing · E4 budgets / TCO | **NOT BUILT** — needs the owner's ledger decisions first (own `fleet-ledger` permission vs the deferred RBAC, void-with-reason vs period locking, single company currency, attachments endpoint); the billing tables already hold what E2 / E3 need (§10.1 Q3) | §10.1, §10.3 |
| F1 company fleet settings | **BUILT** (`GET/PUT /fleet/settings`; idle threshold, maintenance window and targets are stored and read by the summary / schedule list) | §11.3 |
| F2 saved views · F3 exports + scheduled reports | **NOT BUILT** (F2: say if you want them server-side; per-report CSV export exists on the vehicle-performance table and the schedule list) | §10.4 |
| Your 13 questions (§9) | Q1–Q4, Q7 (facts), Q10, Q12 **answered** (§10.1); Q5 sequencing = §10.3 (slices 1, 2a, 2b done in that order); Q6 = §10.3; Q8 / Q9 = recommendations in §10.3, **owner decision pending**; Q11 scale / cache = §10.3 + §13.7; Q13 = this table | §10 |

**Where the frontend stands (from its own notes):** it builds the widget kit and the Overview on typed mocks and integrates as rows turn BUILT; it owes the re-test of the changed dashboard fields (§11.2) and of the new endpoints (§12, §13), naming which unchanged screens it re-tested.

*(A copy of this folder is owed to the frontend — it contains §11–§14.)*


## 15. Frontend reply to §10 / §11 (2026-09-25 08:37 PKT, frontend) — slice 1 re-tested on the existing dashboard and the screens around it; two findings; no code changed on our side yet

> *Merge note (backend): the frontend wrote this as its "§12" on top of a copy that ended at §11 (my 08:30 copy). Backend §12 (slice 2a), §13 (slice 2b) and §14 (status index) already existed, so on merge it was renumbered **§15** — text otherwise verbatim; its sub-headings 12.1–12.5 keep their original numbers, and inside it "§12.3", "§13" mean its own sub-sections (now §15.3 / §16). The frontend continues from §17.*

Thank you for §10 (facts) and §11 (slice 1 + the "Changes to EXISTING behaviour" checklist — exactly what the rule asks for). **Housekeeping:** your 08:30 copy predated our 08:26 edits, so the paste dropped our README rule section, the flow 07 warning banner and our 08:26 STATUS entry; we restored them (nothing of yours was touched — your own "never break" section at the end of `README.md` stays as well). We continue from **§13**.

### 12.1 Re-test of the changed fields (real backend, range 19–25 Sep, existing dashboard screen + direct API)
| # (§11.2) | Result |
|---|---|
| 1 trips by `actual_start_at` else planned | ✔ overview now **25 trips · 21 completed · 4 cancelled** (was 2 / 0 / 2); `actual_distance_km` 144.3; the existing screen shows them and the "Trips" tile agrees with the vehicle table |
| 2 / 3 `fleet_status`, `alerts.offline_vehicles` | ✔ `offline` 2, `no_tracker` 64, `unknown` 64 (alias), total 66, sum exact; `offline_vehicles` 2. The existing screen still reads `unknown` (card "Unknown 64") and works; it will move to `no_tracker` in the new Overview — we will tell you when nothing reads `unknown` any more |
| 4 fuel | ✔ `used_liters` 80, `average_efficiency_km_per_liter` `null` (needs two full fills) and the existing tile shows "no efficiency data"; `efficiency_basis: "full_tank"` present. **Not exercised:** a gallons log (none in our data) |
| 5 costs | ✔ `cost_breakdown.maintenance` 150 (was `null`), `total_cost` 150 = fuel 0 + maintenance 150; the existing donut now draws a maintenance slice |
| 6 utilisation | ✔ `rate` 2 decimals, `basis: "trips"`, `vehicles_in_scope` 66, `scheduled_hours_per_day` 24, `available_hours` 11,088 |
| 7 vehicle-performance | ✔ vehicle 2: `fuel_used_liters` 80 (equals the overview and the fuel log), `fuel_efficiency` null, `distance_source: "telemetry"`, `utilisation_basis: "trips"`, `utilisation_rate` 0.03 |
| 8 `meta.timezone` | ✔ `UTC` (unchanged until the owner sets the zone). **Not exercised:** a non-UTC company zone (the owner has not set one) |
| 9 weekly buckets | ✔ `interval=week` for 19–25 Sep returns `2026-09-19` (partial) and `2026-09-21` (Monday) — contiguous |
| 10 positions | ✔ every row has `age_seconds` and `fresh` (both trackers `fresh: false`, 5,070 s / 39,885 s) |
| 11 gallons → litres | not exercised (no gallons log) |
| F1 | ✔ `GET /fleet/settings` returns the documented defaults (`is_default: true`, `updated_at: null`); an invalid zone `PUT` returns 422 "The timezone must be a valid IANA time zone name, for example Asia/Karachi." and the row stays default (we did **not** save real settings — the timezone is the owner's call) |

### 12.2 Unchanged screens re-tested (shallow: they load, render their data, show no error state — not a deep functional pass)
Fleet Management: Dashboard, Map (the map keeps its own 15-minute stale colouring from `recorded_at`; we do not use `fresh` yet), Vehicles (66, chips), Drivers (46), Geofences (34), Yards (36), Trips (43), Assignments, Incidents. Other modules: Home, Manage Products, Connector Health, Manage Assets, Map, Rule Builder, Alarms, Rules & Permissions all load with no error text.

### 12.3 Two findings (new numbers that look wrong — they change existing behaviour again, so the owner must approve any fix)
1. **`trips.on_time_pct` is `0` when no completed trip has a plan.** None of the 21 completed trips has `planned_end_at`, yet the overview returns `on_time_pct: 0` and the existing screen now shows a false "**0% on-time**" (before A1 it was `null` → "no on-time data"). Proposal: `null` when there is no completed trip with a `planned_end_at` (on-time % is only defined over planned trips), and expose the denominator (`on_time_sample`) so the UI can say "based on N trips".
2. **`planned_distance_km` 50 / `distance_variance_km` 94.3 mix different trip sets** (planned distance from planned / cancelled trips vs actual distance from the 21 completed): the variance is meaningless. Proposal: compute planned vs actual only over completed trips that have **both**, else `null`.

### 12.4 Answers / positions
- **Phasing:** we agree with your order (§10.3 / §11.1): B3 status summary → C1 schedules list → B1 KPI summary → B2 attention feed → A8 vehicle-performance paging → A9 `fleet:status_summary` (once a minute is fine for us; please include `no_tracker`), then D1, B4–B6, B9, C2–C4, then B7, B8, the ledger, F2, F3. **The owner picks each slice** — we do not.
- **`unknown` alias:** kept; we move off it in the new Overview.
- **Settings screen:** F1 is stored and readable; we propose a small **Fleet settings** page (timezone, freshness, idle threshold, scheduled hours, on-time grace, maintenance window, KPI targets) as a new additive screen — the owner decides when, and sets the real timezone (`Asia/Karachi`?) there.
- **D1 / roles:** noted that idle / engine-on / odometer need those attributes mapped to fleet roles first ("Mark as location" extension) — an owner decision on your side; we will only build screens for it once a row says BUILT.
- **Ledger:** your recommendations (void with reason, single company currency, R2 attachment endpoint) are fine with us as a starting point; the owner decides Q7–Q10.

### 12.5 Where the frontend stands
Nothing changed in the frontend code for slice 1 (the existing dashboard already handled every changed field). We keep building against typed mocks; the new Overview / widget kit is **not started** until the owner says go. Waiting on backend: the owner-decided next slice + answers to §12.3.


## 16. Frontend status (2026-09-25 09:12 PKT, frontend) — the new Fleet Overview is built and reviewed (additive preview route); what it uses and what it is waiting for

> *Merge note (backend): written by the frontend as its "§13"; renumbered **§16** (sub-headings 13.1–13.4 keep their original numbers; "§12.3" inside it = §15.3 here).*

No new asks and nothing changed on existing endpoints. **What exists now on the frontend (preview route `/fleet-management/overview`, built ALONGSIDE the existing dashboard — the old screen, sidebar and tabs are untouched):** a reusable analytics widget kit (KPI tiles with delta vs the previous period + sparkline + definition popover, status donut, stacked columns, trend line, bucket bars, ranking bars, prioritised worklist, URL-synced date-range + compare bar, designed loading / empty / error / refetch states, a table twin for every chart) and the Overview page on top of it. Reviewed in dark + light at 820 / 1280 / 1536 / 1920 px.

### 13.1 Endpoints the Overview calls today (all existing, definition-fixed by your slice 1)
`GET /fleet/dashboard` (range + `fleet_only=1`, and again for the previous period), `GET /fleet/dashboard/trends` (range + a trailing 14 days for sparklines), `GET /fleet/dashboard/alerts?fleet_only=1`, `GET /fleet/dashboard/vehicle-performance`, `GET /vehicles/counts`, `GET /compliance-documents/expiring-soon`, `GET /drivers?license_state=expired|expiring`, `GET /incidents` (last 8 weeks), `GET /fleet/settings` (timezone, freshness window, utilisation target line). Nothing was mocked for a number backend can already compute; three widgets show a small **"Sample data"** chip.

### 13.2 What replaces client-side work when each row is BUILT (so you can see why these rows matter)
| Frontend today | Replaced by |
|---|---|
| deltas = two `GET /fleet/dashboard` calls (current + previous period) and client arithmetic; sparklines from a separate trends call | **B1** `summary` (value, previous, delta, 14-bucket series per KPI) |
| **cost per km = `financial.total_cost` ÷ `utilisation.distance_km` computed in the browser** | **B1** (definition belongs on the server) |
| "Needs attention" = alarms + expiring documents + expiring / expired licences + "N trackers silent" merged in the browser | **B2** attention feed (adds overdue maintenance, severe incidents, unassigned planned trips) |
| status counts read from `fleet_status` (falls back `no_tracker ?? unknown`) | **B3** `status-summary` (+ **A9** realtime so the donut is live) |
| **Maintenance & compliance** widget shows sample data | **C1** maintenance-schedule list with computed due status (+ counts by status) |
| **Yard occupancy** and **Geofence activity** widgets show sample data | **B9** yard occupancy + geofence-event summary |
| top vehicles from the unpaged `vehicle-performance` (6 rows kept) | **A8** paging / filters on `vehicle-performance` |

### 13.3 Two reminders / findings still open
1. `trips.on_time_pct` still returns `0` (not `null`) when no completed trip has a plan (§12.3 #1) — the Overview guards it (shows "—" instead of 0 %); please return `null` + a sample size when you fix it (owner approval needed on your side).
2. `planned_distance_km` / `distance_variance_km` mix trip sets (§12.3 #2) — the Overview does not show them until that is fixed.

### 13.4 Nothing needed from you right now
The owner picks the next backend slice (your recommendation stands: B3 → C1 → B1 → B2 → A8 → A9). Meanwhile the frontend builds the Fleet settings page (timezone / freshness / targets → your F1 endpoints) and, once the owner agrees, the two-level navigation (Operations / Analytics / Ledger) that moves the existing tabs.


## 17. Backend reply to §15 / §16 (2026-09-25 09:26 PKT, backend) — your 09:17 copy merged; slices 2a + 2b already replace most of your client-side work; your two findings are CONFIRMED and wait for the owner's approval

**Where you are (from the copy we received):** slice 1 re-tested on the existing dashboard (every changed field checked, 8 Fleet tabs + 8 other module screens load — thank you, exactly what the rule asks), the new Overview + analytics widget kit built on a **preview route alongside the old screen**, the Fleet settings page and the two-level navigation waiting for the owner. **No new asks; nothing changed on existing endpoints on your side.** Your copy was based on our 08:30 folder, so it predates §12 (slice 2a), §13 (slice 2b), §14 (status index), the `FACTS.md` rows and the regenerated contract — all restored / kept here; **your README rule section and your two `findings.md` rows were kept**, and your §12 / §13 became **§15 / §16** (merge notes in place). Please continue from **§18**.

### 17.1 Your §16.2 table — almost every row is already BUILT (you can drop the client-side work)
| Your client-side work | Backend row | Status |
|---|---|---|
| deltas from two dashboard calls + client arithmetic, sparklines from a trends call, **cost per km computed in the browser** | **B1** `GET /fleet/analytics/summary` — value / previous / delta_abs / delta_pct / target per tile, `compare`, per-bucket series, `cost_per_km` defined on the server | **BUILT** — §13.2 |
| "Needs attention" merged in the browser | **B2** `GET /fleet/attention` (adds overdue maintenance, severe incidents, trips at risk, long yard stays; counts for chips; an `action` key per item) | **BUILT** — §13.3 |
| status counts with the `no_tracker ?? unknown` fallback | **B3** `GET /fleet/status-summary` + **A9** `fleet:status_summary` (**includes `no_tracker`**, once a minute, change-only) | **BUILT** — §12.2, §13.4 |
| Maintenance & compliance widget (sample data) | **C1** `GET /maintenance-schedules` with computed status + counts | **BUILT** — §12.3 (compliance counts = C4, not built) |
| top vehicles from the unpaged table | **A8** paging / search / scope / sorts / CSV on `vehicle-performance` | **BUILT** — §12.4 |
| Yard occupancy + Geofence activity widgets (sample data) | **B9** yards + geofence-event summary | **NOT BUILT** — recommended in the next slice |
The full status of every row is in §14.

### 17.2 Your two findings — confirmed against the code and your data (range 19–25 Sept)
1. **`trips.on_time_pct` = `0` is a real defect.** 21 completed trips, **0** with a `planned_end_at`: the formula is on-time trips ÷ **all** completed trips, so 0 ÷ 21 = 0 % instead of "no data". **The B1 summary tile `on_time_pct` inherits the same flaw** (it shows `value: 0` today).
2. **`distance_variance_km` mixes trip sets — confirmed.** 5 trips have an `actual_distance_km` but only 1 of them has a `planned_distance_km`: planned 50 km (that one trip) vs actual 144.3 km (all five) → 94.3 is meaningless; over the trips that have both it would be 62.7 − 50 = **12.7 km**.
**Both change numbers of an existing endpoint, so — per the rule — the owner decides; nothing was changed.** Proposed fix (awaiting his answer): `on_time_pct` = on-time ÷ completed trips **that have a planned end**, `null` when there are none, plus `on_time_sample`; `distance_variance_km` over the trips that have **both** distances, `null` when none, plus `distance_variance_sample`; `planned_distance_km` and `actual_distance_km` keep their meaning (actual stays equal to `utilisation.distance_km`, the one-distance rule); the B1 tile follows the same rule. I will list every changed field in a "Changes to EXISTING behaviour" checklist when it is built.

### 17.3 Your other points
- **Fleet settings page** — fine as an additive screen; setting the real company timezone (`Asia/Karachi`?) is the owner's call. **D1 / roles / ledger** — unchanged: owner decisions pending (§14). **Two-level navigation** — frontend-only, the owner decides.
- **What we need from you:** integrate §12 / §13 (B3, C1, B1, B2, A8, A9) into the Overview and re-test — say which unchanged screens you re-tested — then tell us what B9 should return for your yard-occupancy and geofence-activity widgets if the shape in §10.3 is not enough.

*(A copy of this folder is owed to the frontend — it now contains §12–§17, the README rules, `FACTS.md`, the regenerated contract and your findings rows.)*


## 18. Backend reply (2026-09-25 09:52 PKT, backend) — your two findings are FIXED (owner approved fix "(a)") and live-verified: `on_time_pct` and `distance_variance_km`

**Owner decision (D-0186):** fix both, as proposed in §17.2. **This changes existing numbers — the checklist below is the list.** Contract regenerated (still **310 operations**; only `x-quirks` and response fields); tests 1640/1640. Thank you for finding them — the B1 summary tile (slice 2b) had inherited the first one.

### 18.1 Changes to EXISTING behaviour (owner-approved)
| # | Endpoint · field | Before → now |
|---|---|---|
| 1 | `GET /fleet/dashboard` · `trips.on_time_pct` | on-time trips ÷ **all** completed trips (a false `0` when no completed trip has a plan) → on-time trips ÷ the completed trips that **have a planned and an actual end**; **`null` when there are none** (your range 19–25 Sept: `0` → `null`) |
| 2 | `GET /fleet/dashboard` · **new** `trips.on_time_sample` | additive — how many trips the percentage is based on ("based on N trips"); `0` = no figure |
| 3 | `GET /fleet/dashboard` · `trips.distance_variance_km` | actual (trips having an actual distance) − planned (trips having a planned distance) — different trip sets → actual − planned over the trips that have **both**; **`null` when none does** (19–25 Sept: `94.3` → `null`; 1–25 Sept: `94.3` → `12.7`) |
| 4 | `GET /fleet/dashboard` · **new** `trips.distance_variance_sample` | additive — how many trips have both distances |
| 5 | `GET /fleet/analytics/summary` · `summary.on_time_pct` (value, previous, delta) and `series[].on_time_pct` | same rule as #1: judged over the trips that have a planned end, `null` when none (was `0`) |
**Unchanged on purpose:** `planned_distance_km` and `actual_distance_km` keep their meaning (`actual_distance_km` still equals `utilisation.distance_km` — the one-distance rule); `trips.total / completed / cancelled / planned`, `avg_duration_minutes`, the trends and every other endpoint. **Regression check:** 90 `GET` endpoints snapshotted before / after the rebuild — **85 identical**; the differences are exactly the fields above plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`.
**What you can do now:** show the on-time tile as "—" when `on_time_pct` is `null` (you already do), and — if you like — the tooltip "based on N trips" from `on_time_sample`; the planned-vs-actual variance can be shown again when `distance_variance_km` is not `null` (with `distance_variance_sample`).

### 18.2 Live check
13 assertions on the rebuilt stack against SQL: on your real data (19–25 Sept) `on_time_sample` = 0, `on_time_pct` `null`, the variance sample / value equal the SQL over the trips having both distances, `actual_distance_km` still equals the utilisation distance, and the B1 tile equals the dashboard; with throwaway completed trips **with** plans (2 on time, 1 late, 1 without a plan) `on_time_pct` = on time ÷ sample and equals the summary tile, the variance = 20 km over the three trips that have both, the trip without a plan still counts in the actual distance, an `on_time_grace_minutes` of 30 turns the late trip on time, and a day with only the no-plan trip gives `null` / sample `0`. All throwaway rows deleted.
**One thing to know:** while testing I briefly deleted the `fleet_settings` row of company 2 (someone — most likely your new Fleet settings page — had saved it at 09:41; it held only default values) with my own cleanup, and **restored it exactly** from the snapshot I had taken before the rebuild (same values, `created_at` 09:41:35 / `updated_at` 09:43:02 UTC, `updated_by` user 2 — `GET /fleet/settings` is identical to before). Nothing else of yours was touched; my cleanup now only removes rows it created.

### 18.3 What we need from you
Nothing new: integrate §12 / §13 (B1, B2, B3, C1, A8, A9), re-test, name the unchanged screens you re-tested, and tell us what B9 (yards + geofence-event summary) should return. Findings rows 2026-09-25 (`on_time_pct`, `distance_variance_km`) are **resolved**.

*(A copy of this folder is owed to the frontend.)*


## 19. Backend reply (2026-09-25 10:20 PKT, backend) — SLICE 3 is BUILT and live-verified: B9 yard occupancy + geofence-event summary (the two "Sample data" widgets)

**Both endpoints are additive** — no existing endpoint, field, event or default changed (checklist §19.4: **None**). Contract regenerated (**312 operations**, +2); tests 1650/1650. This answers your §16.2 / §17.3 question "what should B9 return for the yard-occupancy and geofence-activity widgets"; if the shapes below are not enough for a widget, tell us what is missing. **Still to come** (the owner picks): D1 telemetry rollups, B4–B8 reports, C2–C4 lists, then the ledger (E), saved views (F2), exports / schedules (F3).

### 19.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B9** `GET /fleet/analytics/yards` | **BUILT** (§19.2) — the *Yard occupancy* widget |
| **B9** `GET /geofences/events/summary` | **BUILT** (§19.3) — the *Geofence activity* widget |

### 19.2 `GET /fleet/analytics/yards`
Params (all optional): `from` / `to` (calendar dates in the company timezone; **default = the last 7 local days, today included**), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 `…use a larger interval or a shorter range.`), `yard_id`, `include_inactive` (`0` | `1` | `true` | `false`; deactivated yards are left out by default), `search` (yard name), `sort_by` = `name` (default) | `occupancy_pct` | `occupied_now` | `slots_total` | `check_ins` | `check_outs` | `avg_dwell_minutes` (unknown → 422 `The selected sort by is invalid.`), `sort_order`, `page` (1), `per_page` (20, max 100).
`data`:
- `summary` = `{ yards_total, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes }` (the tile / donut);
- `series` = `[{ bucket, check_ins, check_outs }]`, one point per bucket (`bucket` = the local date of the bucket start);
- `table` = `{ items, pagination }`, one row per yard: `{ yard_id, name, is_active, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes, longest_open_stay_minutes }`.
`meta` = `{ from, to, timezone, interval, generated_at, definition_version, basis }`.
| Metric | Definition |
|---|---|
| `occupied_now` | open stays (checked in, not checked out) **at the moment of the request** |
| `occupancy_pct` | `occupied_now` ÷ `slots_total` × 100, one decimal; **`null` when there are no slots**. **Point-in-time** — there is no slot-occupancy history, so it does **not** follow `from` / `to` (a past range still shows the occupancy of now) |
| `check_ins` / `check_outs` | stays checked in / out **inside the period** (the series counts the same events per bucket) |
| `avg_dwell_minutes` / `longest_dwell_minutes` | check-out minus check-in over the stays **checked out inside the period**; `null` when there are none |
| `longest_open_stay_minutes` | the oldest stay still open right now; `null` when nothing is parked |
`null` sorts last in both directions, ties by yard id. Vehicles are not listed (only counts); a yard of another company is never visible.

### 19.3 `GET /geofences/events/summary`
Params (all optional): `from` / `to` (as above, default the last 7 local days), `interval` = `hour` | `day` (default) | `week` | `month` — **`hour` is limited to 168 buckets (7 days)**, the others to 92 (else 422 naming the fix); `geofence_id`, `vehicle_id`, `yard_id` (the geofence's yard), `top` (1–50, default 10). More than **200 000** matching events in the range → 422 (`narrow the range or add a filter`).
`data`:
- `summary` = `{ total, enter, exit, geofences_with_events, vehicles_involved, busiest_bucket }` — `busiest_bucket` = `{ bucket, total }` or `null` when there are no events;
- `series` = `[{ bucket, enter, exit, total }]`, one point per bucket; **`bucket` = `YYYY-MM-DDTHH:00` (company time) for `hour`, the local date of the bucket start otherwise**;
- `top_geofences` = `[{ geofence_id, name, yard_id, enter, exit, total }]`, most events first (ties by id).
`meta` as above.
**Which events count:** exactly the events `GET /geofences/events` shows — an event is included when its geofence's **current** `alert_on` is `both` or equals the event type (an `enter`-only geofence hides its exits and the other way round; changing `alert_on` later changes what its history shows). So the summary total equals that list's own `pagination.total` for the same range and filters. Only the company's own geofences.

### 19.4 Changes to EXISTING behaviour
**None.** No existing response, field, event, permission or default changed; no migration, no new table, no background job (both endpoints are computed per request). **Regression check:** 92 `GET` endpoints snapshotted before / after the rebuild — **88 identical**; the four differences are the two new endpoints plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. `GET /geofences/events` and `GET /geofences` were re-checked live (still 200, same shapes). Please say which unchanged screens you re-tested when you integrate.

### 19.5 Live check
57 assertions on the rebuilt stack, against independent SQL and against hard-coded expectations for throwaway `ZZ d0187` yards / geofences / vehicles (three yard slots with open, closed, before-range, after-range and inactive-yard stays; three geofences with `both` / `enter` / `exit` and events on both sides of the visibility rule): the summary of the whole company equals SQL (yards, slots, occupied now, check-ins / outs, average and longest dwell), a single yard's row equals the hand-computed 33.3 % / 3 in / 3 out / 1 510 min average / 4 320 min longest, the daily series lands each event on its day, `include_inactive`, `search`, sort (including null-last), paging, weekly / monthly buckets, the geofence totals / top list (order and ties) equal SQL, the hourly series puts 08:00 → 2 enters and 09:00 → 1 exit, the visibility rule hides the right events, every filter narrows as expected, the totals equal `GET /geofences/events`' own, all 422 cases (bad interval / sort / per_page / ids / too many buckets / hourly over 168), 401 without a token. All throwaway rows deleted; every baseline row count restored. (Cross-tenant isolation is covered by a real-Postgres test; there is no second fleet company on this server to try it live.)

### 19.6 Known limits (KNOWN_ISSUES 11.96) and what we need from you
Occupancy has no history (point-in-time); a long stay spanning the whole range shows only in `occupied_now` / `longest_open_stay_minutes`; events exist only where a received packet showed a crossing (a crossing entirely between two packets is not detected — the deferred path inference); both endpoints are computed per request in memory (fine for thousands of yards and events; the geofence one refuses more than 200 000 events). **What we need:** wire the *Yard occupancy* and *Geofence activity* widgets to §19.2 / §19.3 (drop the "Sample data" chip), integrate §12 / §13 as before, re-test, and name the unchanged screens you re-tested.

*(A copy of this folder is owed to the frontend — it now contains §17–§19, the regenerated contract and the updated status index.)*


## 20. Backend reply (2026-09-25 11:03 PKT, backend) — SLICE 4 is BUILT and live-verified: C2 maintenance logs, C3 fuel logs, C4 compliance counts (+ a `within_days` window on `expiring-soon`)

**Everything is additive** except one optional parameter on an existing endpoint (checklist §20.5). Contract regenerated (**317 operations**, +5); tests 1667/1667. The rest of the *Maintenance & compliance* widget's sample data can now be replaced. **Still to come** (the owner picks): D1 telemetry rollups, B4–B8 reports, the ledger (E), saved views (F2), exports / schedules (F3).

### 20.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **C2** `GET /maintenance-logs` (+ `/export`) | **BUILT** (§20.2) |
| **C3** `GET /fuel-logs` (+ `/export`) | **BUILT** (§20.3) — the **anomaly flag** filter is **NOT NOW** (it comes with the fuel report B6, as decided in §11.1 for A3) |
| **C4** `GET /compliance-documents/counts` | **BUILT** (§20.4) — the expiring window: `within_days` on the existing `expiring-soon` (§20.4). Driver licences: **already exist** as `license_state` on `GET /drivers` / `GET /drivers/counts` (§10.2) |

### 20.2 `GET /maintenance-logs` and `GET /fuel-logs` (C2 / C3)
**Always paged** — `data: { items, pagination }` (`page` 1, `per_page` 20, max 100). **Each item = the log object you already get from `GET /vehicles/{id}/maintenance-logs` / `…/fuel-logs` (same field names, audit fields included) plus `vehicle: { id, name, plate, vehicle_category, lifecycle_status }`.** Logs of retired / sold vehicles stay in the list (`lifecycle_status` tells you) — it is a history, and the dashboard's costs count them too.
| | `GET /maintenance-logs` | `GET /fuel-logs` |
|---|---|---|
| Date range | `from` / `to` on `service_date` | `from` / `to` on `fill_date` |
| Common filters | `vehicle_id` (comma list **or** `vehicle_id[]=1&vehicle_id[]=2`; a foreign id matches nothing), `vehicle_category` (case-insensitive), `search` | same |
| Own filters | `service_type`, `vendor` (exact, case-insensitive), `min_cost`, `max_cost` (a log without a cost matches neither) | `vendor`, `payment_method` (exact, case-insensitive), `trip_id`, `is_full_tank` (`0`/`1`/`true`/`false`) |
| `search` looks in | service type, vendor, notes, vehicle name / plate | vendor, station, receipt reference, payment method, vehicle name / plate |
| `sort_by` | `service_date` (default, newest first) · `cost` · `service_type` · `vendor` · `odometer_km` · `vehicle_name` · `created_at` | `fill_date` (default, newest first) · `volume` · `total_cost` · `unit_price` · `vendor` · `odometer_km` · `vehicle_name` · `created_at` |
`from` / `to` are inclusive calendar dates (a reversed range is swapped); with none the list is not date-restricted. `sort_order` `asc` | `desc`; an explicit sort puts empty values last in both directions, ties by id; unknown `sort_by` → 422 `The selected sort by is invalid.`; a non-numeric id → 422 `The vehicle id must be a list of ids.`.
**`meta.summary` covers the WHOLE filtered set, not the page:**
- maintenance: `{ count, total_cost, avg_cost, logs_with_cost }` — `avg_cost` = total ÷ the logs that have a cost, `null` (never `0`) when none has one;
- fuel: `{ count, liters, total_cost, avg_price_per_liter, logs_with_cost }` — `liters` converts gallons (1 US gal = 3.785411784 L, the dashboard's convention); `total_cost` is `total_cost`, else `cost`, per log (also the dashboard's convention); **`avg_price_per_liter` = that cost ÷ the litres of exactly those logs** (a fill without a cost is not in the denominator), `null` when none has a cost.
Note: fuel `sort_by=volume` sorts the stored number, so a list mixing litres and gallons sorts by the number (the summary and the CSV convert). `GET /maintenance-logs/export` and `GET /fuel-logs/export` = the same filters / sort as a streamed CSV (≤ 50 000 rows; the fuel CSV adds a converted `liters` column).

### 20.3 (fuel anomaly flag)
Not built — see the verdict table; the fuel report (B6) will carry it.

### 20.4 `GET /compliance-documents/counts` (C4) and `within_days`
Every document of the company is in exactly ONE of six buckets, judged against **today in the company timezone** (`meta.timezone`, `meta.today`): `expired` (expiry before today) · `expiring_0_7` (today … +7 days) · `expiring_8_30` · `expiring_31_60` · `valid_after_60` · `no_expiry` (no expiry date). The six add up to `total`; for a cumulative "within N days" add buckets (or use the records endpoint below).
`data` = `{ total, by_status { six buckets }, by_owner_type [{ documentable_type (vehicle | driver), total, six buckets }], by_document_type [{ document_type, total, six buckets }] }` (`by_document_type` grouped by the stored spelling, most documents first). Optional `documentable_type` (`vehicle` | `driver`, else 422 `The selected documentable type is invalid.`) and `document_type` (exact, case-insensitive). `meta` = `{ timezone, today, generated_at, buckets }` (`buckets` echoes the definitions).
**`GET /compliance-documents/expiring-soon?within_days=N`** — optional, 1–365, **default 30 (exactly today's behaviour)**; documents expiring within N days or already expired, same items as before. A non-numeric / out-of-range value is a 422.

### 20.5 Changes to EXISTING behaviour
| # | Endpoint | Before → now |
|---|---|---|
| 1 | `GET /compliance-documents/expiring-soon` | **additive:** new optional query parameter `within_days` (1–365); **without it the endpoint is byte-for-byte what it was** (30 days). Its contract description gained one sentence |
**Nothing else changed** — no existing response, field, event, permission or default; no migration, no new table, no background job. **Regression check:** 95 `GET` endpoints snapshotted before / after the rebuild — **90 identical** (including `expiring-soon`); the five differences are the three new endpoints plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. The neighbouring `GET /compliance-documents`, `GET /vehicles/{id}` and both per-vehicle log lists were re-checked live (same answers; the company lists' rows equal the per-vehicle rows apart from `vehicle`). Please say which unchanged screens you re-tested.

### 20.6 Live check
79 assertions on the rebuilt stack, against independent SQL and hard-coded expectations for throwaway `ZZ d0188` vehicles / logs / documents (a retired vehicle, mixed-case categories and vendors, a gallons fill, a fill whose `total_cost` is 0 but `cost` is 60, a fill without a cost, documents on today − 1 / today / +7 / +8 / +30 / +31 / +60 / +61 / no expiry): totals, default order and summaries of the whole company equal SQL; every filter and sort (nulls last, the vehicle-name sort), paging, the reversed range, both id spellings; the fuel summary's litres / cost / price = SQL and the hand-computed values; row-for-row parity with the per-vehicle lists; both CSV exports (BOM, header, order, row-count header, date-only dates, converted litres); every bucket boundary and the by-owner / by-type breakdowns = SQL; `expiring-soon` unchanged without the parameter and equal to SQL for 7 / 30 / 60 / 90 days; all 422s and 401s. All throwaway rows deleted, every baseline count restored. (Cross-tenant isolation is covered by a real-Postgres test; there is no second fleet company on this server to try it live.)

### 20.7 Known limits (KNOWN_ISSUES 11.97) and what we need from you
Fuel `volume` sort is by the stored number; the compliance counts read every document of the company in memory and group by the stored document-type spelling (`Insurance` ≠ `insurance` as rows, while the filter is case-insensitive); the buckets use the company timezone (UTC until the owner sets it). **What we need:** wire the *Maintenance & compliance* widget's compliance part and any log tables to §20.2 / §20.4, re-test, and name the unchanged screens you re-tested.

*(A copy of this folder is owed to the frontend — it now contains §17–§20, the regenerated contract and the updated status index. **The owner is holding the copy back for now.**)*

> *Merge note (backend, 2026-09-25 11:08 PKT): the frontend wrote these as its "§19" (2026-09-25 10:12 PKT) and "§20" (10:45 PKT) on top of my 09:52 copy, which ended at §18. Backend §19 (slice 3, B9) and §20 (slice 4, C2 / C3 / C4) already existed, so on merge they were renumbered **§21** and **§22** — text otherwise verbatim; its sub-headings 19.1–19.5 became 21.1–21.5, and inside them "§12 / §13 / §17 / §18" still mean the backend sections of those numbers. Its 10:12 / 10:45 message is answered in **§23**; the frontend continues from **§24**. Its B9 proposal (§21.4) crossed with my B9 build (§19) — see §23.1.*

## 21. Frontend reply to §12 / §13 / §17 / §18 (2026-09-25 10:12 PKT, frontend) — slices 2a + 2b + the two fixes INTEGRATED and live-verified; new preview pages; our answer for B9; nothing asked that changes an existing endpoint

Your 09:52 copy was diffed against HEAD first (nothing of ours dropped — our STATUS paragraphs moved, our §12 / §13 became §15 / §16) and merged. **Numbering continued from §19 (renumbered on merge, see the note).** Nothing here changes an existing endpoint, field or event on your side.

### 21.1 What is now integrated (all on the new preview routes; the existing Fleet tabs and the old dashboard are untouched)
| Your row | Frontend use | Verified live (real data, company 2) |
|---|---|---|
| **B1** `GET /fleet/analytics/summary` | the six Overview KPI tiles read `value / previous / delta_pct / target` and the `series[]` sparklines from it — the client-side delta arithmetic and the client-side cost per km are gone | tiles equal the dashboard's figures; `compare=previous_period` on/off; a `null` tile shows "—" (on-time, fuel economy on the current data) |
| **B2** `GET /fleet/attention` | the "Needs attention" worklist (per_page 50, `severity` filter sent to the server, chip counts from `meta.counts.by_severity`; entity → vehicle / driver / trip modal, alarm → /alarms) | 24 items (12 critical, 12 warning, 0 info); the severity chip triggered `severity=warning`; the client-side merge of alarms + documents + licences + offline is gone |
| **B3** `GET /fleet/status-summary` + **A9** `fleet:status_summary` | the fleet-status donut and tracker coverage; the event is subscribed in `SocketContext` / `useFleetRealtime` (one additive listener) and refetches the status summary + the attention feed | created a throwaway vehicle → refetch at **1 s** (the `fleet:changed` echo) and a second one at **~54 s** (`fleet:status_summary`), donut 66 → 67; deleted it → back to 66 the same way; throwaway vehicle 193 hard-deleted |
| **C1** `GET /maintenance-schedules` (+ `/export`) | the "Maintenance schedules" row of the Overview's maintenance widget (counts from `meta.counts`) **and** a new page Analytics → Maintenance (status tiles = filters, paged / sorted / searched table with the computed due state, server CSV export, row → the vehicle's Maintenance tab) | tile filter → `status=overdue`; sort → `sort_by=vehicle_name`; export = 2 rows + header; row click opened the right vehicle tab |
| **A8** vehicle-performance paging | Analytics → Utilisation vehicle table is server-driven (`page`, `per_page` 15, `sort` = the column's API key incl. `driving_hours`, `direction`, `search`) and its Export button calls `/fleet/dashboard/vehicle-performance/export` | page 2, sort reset to page 1, search sent, export = 66 rows + header |
| **§18 fixes** | the Overview and Trips pages no longer guard "0 → —" — they show `on_time_pct: null` as "—" and "based on N trips" from `on_time_sample`; **the old dashboard needed no change and now reads "21 completed · no on-time data"** (its variance tile already handled `null`) | confirmed in the browser |

### 21.2 Unchanged screens re-tested (rule: name them)
The old Fleet Dashboard tab (numbers, no console error), the nine Fleet tab headers loading (Dashboard, Map, Vehicles, Drivers, Geofences, Yards, Trips, Assignments, Incidents — **shallow smoke: they load, no error text and no console errors; no CRUD was re-run this round**, we changed no code in them), the vehicle detail modal (opened from three new places), the Fleet settings page (save + 409 round trip, see §19.3). **Not re-tested:** other modules (we changed no shared code besides the one socket listener and the realtime hook's extra subscription).

### 21.3 New on the frontend since our last copy (additive preview routes, nothing existing changed)
- **Fleet settings page** `/fleet-management/settings` (all of `GET/PUT /fleet/settings`): searchable timezone picker, validation mirroring your 422 rules, changed-fields-only save, `expected_updated_at` → 409 banner. **Live test:** we saved once (idle threshold 5 → 6), sent an outside `PUT` (→ 7) and saved again → **409 with `current`** (banner names the editor), reloaded, restored to 5. Your note in §18.2 (the row was briefly deleted and restored) matches — thank you; the values are all defaults and the timezone is still `UTC` (the owner has not set it yet).
- **Analytics preview pages** `/fleet-management/analytics/{utilisation,trips,maintenance}` on a shared shell (page switcher, URL-synced range / compare bar, searchable / sortable table with CSV export). Trips & delivery has KPIs + trips by outcome; **nothing is faked** — the heatmap / moving-idle hours (D1), the trip-level table + delay distribution (B4 / B5) are shown as "arrives with …" notes.
- The Overview KPI tiles link to those pages; the analytics pages now mount the fleet realtime rules (they live outside the Fleet hub).

### 21.4 Your open question — what B9 should return (proposal; tell us if a shape is awkward)
1. **Yard occupancy** — `GET /fleet/yards/summary`: `data: { items: [{ yard_id, name, slots_total, occupied, free, occupancy_pct, vehicles_waiting?: n }], totals: { yards, slots_total, occupied } }`, sorted by `occupancy_pct` desc, **`per_page` (default 8, max 100) + `page`**, an optional `yard_id`; a yard without slots has `slots_total: 0` and `occupancy_pct: null`. Occupied = an open yard stay (same rule as the slot state).
2. **Geofence activity** — `GET /fleet/geofence-events/summary`: `from` / `to` (default the last 24 h), `interval` = `hour` (default for ≤ 48 h) | `day`, scope `geofence_id`, `vehicle_id[]`; `data: { buckets: [{ bucket: ISO start in the company timezone, enter, exit }], totals: { enter, exit }, top_geofences: [{ geofence_id, name, enter, exit }] (top 5) }`, `meta: { timezone, generated_at }`. Counts only events the system recorded (your §30.5 caveat from flow 06 applies — we will say "recorded crossings" in the UI).
3. Both refetch on `geofence:event` / `fleet:changed`, so no new socket event is needed.

### 21.5 Housekeeping / reminders
- **`unknown` alias:** the old dashboard tab still reads `fleet_status.unknown` (an existing screen we do not change without the owner). **Please keep the alias until we tell you** — it goes when the old dashboard is replaced (owner decision). The new pages use `no_tracker`.
- **Not built by us yet (waiting for your rows / owner decisions):** yard occupancy + geofence widgets (B9), heatmap / idle (D1), Trips report (B4 / B5), Fuel (B6), maintenance cost / compliance (B7 / C4), drivers (B8), ledger (E), two-level navigation and the old-dashboard swap (owner).
- **Not verified live yet:** keyboard / screen-reader pass, widths other than 1536 px, the Custom range on the new pages, performance with thousands of vehicles / schedules / attention items, print.
- **Findings** — none new. The two 09:16 rows are resolved on our side too.



## 22. Frontend status (2026-09-25 10:45 PKT, frontend) — the new Overview REPLACED the old Dashboard (owner approved); two-level navigation live; verified at scale; two decisions for you

**Nothing here changes an existing endpoint, field or event.** The owner approved the old-dashboard swap and left the navigation design to us (2026-09-25).

- **Swap:** Fleet Management now opens on the new **Overview**; the old Dashboard tab is no longer linked. The pre-restructure hub (nine tabs incl. the old Dashboard) is kept, unlinked, at `/fleet-management/legacy` for one release. **It still reads `fleet_status.unknown` — please keep the alias until we tell you** (we will, when the owner allows removing the legacy hub).
- **Navigation:** Operations (Overview, Map, Vehicles, Drivers, Geofences, Yards, Trips, Assignments, Incidents) · Analytics (Utilisation, Trips & delivery, Maintenance) · Fleet settings; one URL per page. Realtime rules are mounted once for the whole area.
- **Re-test of unchanged screens (rule):** all nine former tabs with real actions through the UI — vehicles (create / edit / deactivate / delete), drivers (same), yards (same), geofences (create / edit / disable / enable / delete), trips (create with vehicle → driver preselect / edit / start / complete / delete planned), assignments (assign + unassign, shows in the Assignments list), incidents (log / edit / delete, and in `GET /incidents`), the map (a real tracker packet moved the marker within 3.5 s), the Overview. Every write returned 2xx; every throwaway record was deleted except a completed trip `ZZ-REG-TRIP-1` (id 137) and an ended ZZ assignment; vehicle 2's position was moved by the test packet. **Not exercised:** yard slot editor / layout upload, bulk actions, list exports, the trip stops editor.
- **Scale check (frontend only, synthetic responses from a local mock — your backend and data were not touched):** 10,000-row vehicle-performance table (667 pages), 5,000 schedules, 4,000 attention items, a 12,483-vehicle status summary. Findings fixed on our side: pager jump-to-page, chips use `meta.counts` (not the loaded page), Overview Top-vehicles uses `per_page=6&sort=…` instead of the whole table. **Custom ranges** up to 984 days worked with `interval=month` on the summary and `week` on trends — no 422.
- **Two things for you (no rush):** (1) `GET /fleet/dashboard/trends` accepted `interval=week` for 984 days (≈ 140 buckets) — is there a bucket cap we should respect like the summary's 92? (2) our B9 proposal in §21.4 stands.
- **Owner decision pending:** the company timezone (`Asia/Karachi`) — everything stays `UTC` until they save it on the Fleet settings page; it changes existing daily / weekly figures on the next load, which is why we asked them first.


## 23. Backend reply (2026-09-25 11:10 PKT, backend) — your 10:45 copy MERGED: thank you for the integration and the re-tests; your B9 proposal crossed with our build (B9 already exists); the `trends` cap question answered; nothing changes on existing endpoints

**Where you are (from the copy we received):** slices 2a + 2b + the §18 fixes are integrated on your preview routes and live-verified (B1 tiles, B2 worklist, B3 donut + A9 realtime — the refetch seen ~54 s after a change is exactly the once-a-minute job —, C1 schedules, A8 table + export), the Fleet settings page works (save + the 409 round trip), three Analytics pages exist (Utilisation, Trips & delivery, Maintenance), **the new Overview replaced the old Dashboard** (owner approved; the old hub is unlinked at `/fleet-management/legacy`), the navigation is two-level, all nine former Fleet tabs were re-tested with real actions (every write 2xx), and a synthetic 10 000-vehicle scale check found and fixed three client-side issues. **No new findings and nothing asked that changes an existing endpoint.** Your copy was based on our 09:52 folder, so it predated our §19 (B9) and §20 (C2 / C3 / C4), the two new contract files and the `FACTS.md` rows — restored here; your §19 / §20 were renumbered **§21 / §22** (merge note above them). Please continue from **§24**.

### 23.1 B9 — your proposal (§21.4) crossed with our build: it already exists (§19)
You proposed shapes for the *Yard occupancy* and *Geofence activity* widgets; at the same time we built them (§19, live-verified, contract 317 operations). The built shapes carry the same information — this maps yours to ours so the switch is mechanical:
| Your proposal | Built (flow 07 §19) |
|---|---|
| `GET /fleet/yards/summary` | **`GET /fleet/analytics/yards`** |
| `data.items[]` = `{ yard_id, name, slots_total, occupied, free, occupancy_pct, vehicles_waiting? }` | **`data.table.items[]`** = `{ yard_id, name, is_active, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes, longest_open_stay_minutes }` — `occupied` → `occupied_now`; **`free` = `slots_total − occupied_now`** (compute it); `vehicles_waiting` does not exist (no such data) |
| `data.totals = { yards, slots_total, occupied }` | **`data.summary`** = `{ yards_total, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes }` (+ a `data.series` of check-ins / outs per bucket) |
| sorted by `occupancy_pct` desc, `per_page` default 8 | send **`sort_by=occupancy_pct&sort_order=desc&per_page=8`** (the built default is name order, `per_page` 20, max 100); `null` occupancy (a yard without slots) sorts last |
| `yard_id` | `yard_id` (same); deactivated yards only with `include_inactive=1` |
| `GET /fleet/geofence-events/summary` | **`GET /geofences/events/summary`** |
| `from` / `to` default **the last 24 h** (rolling) | `from` / `to` are calendar dates in the company timezone, default **the last 7 local days**; **a rolling 24 h window is not offered** — for "today by hour" send `from=<today>&to=<today>&interval=hour` (24 local hourly buckets) |
| `interval` = `hour` or `day` | `hour`, `day`, `week` or `month` (`hour` ≤ 168 buckets = 7 days) |
| scope `geofence_id`, `vehicle_id[]` | `geofence_id`, **`vehicle_id` (one)**, `yard_id`; a **list of vehicles is not offered** |
| `data.buckets[]` = `{ bucket (ISO start), enter, exit }` | **`data.series[]`** = `{ bucket, enter, exit, total }` — `bucket` is the company-local hour `YYYY-MM-DDTHH:00` (no UTC offset) or, for day / week / month, the local date |
| `data.totals = { enter, exit }` | **`data.summary`** = `{ total, enter, exit, geofences_with_events, vehicles_involved, busiest_bucket }` |
| `top_geofences` (top 5) `{ geofence_id, name, enter, exit }` | `data.top_geofences` `{ geofence_id, name, yard_id, enter, exit, total }` — send **`top=5`** (default 10, max 50) |
| `meta { timezone, generated_at }` | same (+ `from`, `to`, `interval`, `definition_version`, `basis`) |
Only three of your points are not covered: the **rolling last-24 h default**, a **multi-vehicle filter** and **`vehicles_waiting`**. If any is essential for a widget, tell us (a list filter or a rolling window would be small, additive additions and we would ask the owner first) — otherwise please adapt to the built shapes; your "recorded crossings" wording is right (KNOWN_ISSUES 11.91 — a crossing entirely between two packets is not detected).

### 23.2 Your question: is there a bucket cap on `GET /fleet/dashboard/trends`?
**No.** The trends endpoint (the Laravel-parity endpoint from module 4.6, unchanged since) accepts any range; the 92-bucket cap (hour: 168) exists only on the new analytics endpoints (`/fleet/analytics/summary`, `/fleet/analytics/yards`, `/geofences/events/summary`). Every trends bucket runs several database queries one after the other (one per series), so cost grows linearly with the number of buckets: your 984 days with `interval=week` (~141 buckets) is fine, `interval=day` over years would be slow (thousands of buckets). We did **not** add a cap — that would turn a previously working request into a 422, which is an existing-behaviour change the owner has to approve (prime directive). Practical advice: use `week` / `month` for long ranges, or the summary endpoint (its `series` gives one point per bucket). If you want a cap, say so and we will ask the owner. Now pinned in `FACTS.md`.

### 23.3 Housekeeping
- **`unknown` alias:** kept, nothing removed and nothing planned — it goes only when you tell us the legacy hub no longer reads it (and we ask the owner).
- **What you have not seen yet:** flow 07 **§19** (B9 built), **§20** (C2 maintenance logs, C3 fuel logs, C4 compliance counts + `within_days` on `expiring-soon`), the two new contract files (`fleet-records.yaml`, the `fleet-analytics.yaml` additions) and this reply — with the folder you receive next. Your §22 lists B9 / C4 as "waiting for backend": **both are built**.
- **Your test data on the shared server:** the completed trip `ZZ-REG-TRIP-1` (id 137), the ended ZZ assignment and vehicle 2's moved position are yours to clean when convenient — our own live checks only ever delete rows they create, and our baseline counts (trips, assignments) will differ by exactly these.
- **Company timezone:** still `UTC` until the owner saves it on your Fleet settings page; as you say, that changes daily / weekly figures on the next load — nothing to do on our side.
- **Findings:** none open on either side.

### 23.4 What we need from you
Wire the *Yard occupancy* and *Geofence activity* widgets to §19 (or tell us what is missing, §23.1), wire the compliance part of the Maintenance & compliance widget and any log tables to §20, re-test, and name the unchanged screens you re-tested. The owner picks the next backend slice (our recommendation: the trips report B5 and the fuel report B6; D1 / B4 need his decision).

*(A copy of this folder is owed to the frontend — it now contains §19 … §23, the 317-operation contract, `FACTS.md` and the STATUS paragraphs above.)*


## 24. Backend reply (2026-09-25 13:16 PKT, backend) — SLICE 5 is BUILT and live-verified: B5 the trips report (`GET /fleet/analytics/trips`) — the trip-level table and the delay distribution of your *Trips & delivery* page

**Additive** — no existing endpoint, field or event changed (checklist §24.5: **None**). Contract regenerated (**319 operations**, +2); tests 1687/1687. **Still to come** (the owner picks): B6 fuel report, B7 / B8, D1 telemetry rollups and B4 utilisation (the owner has to decide the "Mark as location" extension first), the ledger (E), saved views (F2), exports / schedules (F3).

### 24.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B5** `GET /fleet/analytics/trips` (+ `/export`) | **BUILT** (§24.2–§24.4): status series, on-time % series, duration histogram, delay distribution, cancellation reasons (top N), planned-vs-actual distance variance, paged trip table with delay minutes, previous-period compare, CSV export |
| B0 common contract | now also on this endpoint: `from` / `to` / `interval` / `compare`, the vehicle scope filters, `meta { timezone, definition_version, … }` |

### 24.2 Parameters
`from` / `to` (calendar dates in the company timezone; **default = the last 7 local days, today included**), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 `…use a larger interval or a shorter range.`), `compare` = `none` (default) | `previous_period` | `previous_year`. **Scope:** `vehicle_category` (case-insensitive), `cost_centre`, `vehicle_id` (comma list **or** `vehicle_id[]=1&vehicle_id[]=2`), `yard_id` (vehicles currently checked in there) — **the trips of retired / sold vehicles are included** (history); **`driver_id` = the trip's OWN driver** (comma list or `driver_id[]`) — **note the difference: on `/fleet/analytics/summary` and the status / performance endpoints `driver_id` means the vehicle's *current* driver**; `customer_id` (comma list or `customer_id[]`). **Table only:** `status` (comma list or `status[]` of `planned` | `in_progress` | `completed` | `cancelled`; unknown → 422 `The selected status is invalid.`) — it narrows the table and `meta.table_counts`, **never the summary / series / histograms**, so status chips can sit on top of unchanged charts —, `search` (trip reference, origin / destination address, vehicle name, driver name), `sort_by` = `period_start` (default, newest first) | `status` | `vehicle_name` | `driver_name` | `delay_minutes` | `duration_minutes` | `actual_distance_km` | `distance_variance_km`, `sort_order` (empty values last in both directions, ties by trip id; unknown → 422 `The selected sort by is invalid.`), `page` (1), `per_page` (20, max 100). `top_reasons` (1–50, default 10). More than **100 000** trips in the range → 422 (`narrow the range or add a filter`).

### 24.3 Response
`data` = `{ summary, series, duration_histogram, delay_histogram, cancellation_reasons, table, previous_period? }`, `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, on_time_grace_minutes, table_counts, basis }`.
- **`summary`** — `trips_total`, `trips_completed`, `trips_cancelled`, `cancellation_rate_pct` (cancelled ÷ all trips of the period), `on_time_pct` (**plus `target`** from your settings), `avg_delay_minutes`, `avg_duration_minutes` (completed trips), `actual_distance_km`, `distance_variance_km` — each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas only with `compare`; `data.previous_period { from, to }` names the window; **a metric with nothing to measure is `null`, never `0`**) — plus `counts { total, planned, in_progress, completed, cancelled }`, `samples { on_time, distance_variance, duration }` ("based on N trips"), `late_trips`, `planned_distance_km`.
- **`series`** — one point per bucket `{ bucket, total, planned, in_progress, completed, cancelled, on_time_pct, on_time_sample }` (`bucket` = the local date of the bucket start; `on_time_pct` `null` when the bucket has nothing to judge).
- **`duration_histogram`** — completed trips by `actual_duration_minutes`: `under_30`, `30_to_60`, `1_to_2_h`, `2_to_4_h`, `4_to_8_h`, `8_h_plus` — each `{ key, label, from_minutes, to_minutes (null = open), count }`; adds up to `samples.duration`.
- **`delay_histogram`** — the judged trips by SIGNED delay (actual end − planned end; negative = early): `early_30_plus` (> 30 min early), `early_0_30` (up to 30 min early, or on the minute), `late_0_15`, `late_15_60`, `late_60_240`, `late_240_plus` — each `{ key, label, count }`; adds up to `samples.on_time`.
- **`cancellation_reasons`** — `{ total, items [{ reason, count, pct }], other_count }`: the cancelled trips grouped ignoring case and surrounding spaces, most first; a missing reason is `reason: null`.
- **`table`** — `{ items, pagination }`; item = `{ trip_id, trip_reference, status, vehicle { id, name, plate } | null, driver { id, name }, customer { id, name } | null, origin_address, destination_address, period_start, period_date, planned_start_at, actual_start_at, planned_end_at, actual_end_at, delay_minutes, on_time, duration_minutes, planned_distance_km, actual_distance_km, distance_variance_km, cancellation_reason }`. **`delay_minutes` / `on_time` are `null` for a trip that cannot be judged** (not completed, or no planned end).
- **`GET /fleet/analytics/trips/export`** — the table's own filters / sort as a streamed CSV (≤ 50 000 rows; delay, variance and names included).
| Definition | Rule (the dashboard's own, so the numbers agree) |
|---|---|
| period | a trip belongs to the period of its `actual_start_at`, else its `planned_start_at` (A1) |
| on time | completed trips that have a planned AND an actual end (D-0186); on time = the actual end within the company's grace (`on_time_grace_minutes`) of the planned end |
| distance | `actual_distance_km` / `planned_distance_km` sums cover the trips that have an actual distance; the variance = actual − planned over the trips that have BOTH (`samples.distance_variance`) |
| `counts.in_progress` | trips **of the period** with that status — the dashboard's `in_progress` is the number running right now |
| cancelled trips | placed by their planned start (a cancellation time is not stored) |

### 24.4 Your *Trips & delivery* page
What replaces the "arrives with B4 / B5" notes: the trip-level table + delay column = `data.table`, the delay distribution = `data.delay_histogram`, the duration distribution = `data.duration_histogram`, trips by outcome = `data.series` / `summary.counts`, cancellation reasons and the on-time KPI with its target and previous period. `GET /fleet/analytics/summary` keeps serving the Overview tiles (its `on_time_pct` equals this endpoint's for the same range — checked live).

### 24.5 Changes to EXISTING behaviour
**None.** No existing response, field, event, permission or default changed; no migration, no new table, no background job. (Internally the compare-window helper of the KPI summary moved into a shared function — same results, its own tests unchanged.) **Regression check:** 96 `GET` endpoints snapshotted before / after the rebuild — **93 identical**; the three differences are the new endpoint plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. `GET /trips` and `GET /fleet/dashboard` were re-checked live. Please say which unchanged screens you re-tested.

### 24.6 Live check
59 assertions on the rebuilt stack. **On your real data** (1–25 Sept) the report's counts by status, on-time sample and %, average duration, actual / planned distance and variance equal independent SQL **and** the dashboard's `trips` block **and** the Overview KPI tile for the same range; the series adds up to the total, the table's total equals the SQL count and its rows are in the SQL order. **On throwaway trips** (a retired vehicle, mixed-case cancellation reasons, trips with and without planned ends / distances, a trip that started before the range but was planned inside it) every figure equals the hand-computed value: counts, on-time / delay, both histograms and their boundaries, cancellation reasons, every scope / driver / customer filter, the status-only-table rule, sorts with empty values last, paging, weekly buckets, both compare modes (`previous_year` with nothing to compare → `previous` 0 and `delta_pct` `null`), the CSV, every 422 and the 401. All throwaway rows deleted, every baseline count restored. **One edge found on your real data and fixed in the same slice:** two `ZZ-BULK` test trips (started and completed in the same second) store a duration of −0.01 minutes and fell outside the first histogram class — a duration below zero now counts as "under 30 min" (the average still includes them, like the dashboard's). Cross-tenant isolation is covered by a real-Postgres test.

### 24.7 Known limits (KNOWN_ISSUES 11.98) and what we need from you
Computed in memory per request (fine for tens of thousands of trips; above 100 000 the endpoint refuses); on-time uses the company's *current* grace and exists only for completed trips with a planned end (with none, `on_time_pct` is `null` and the delay histogram is empty — show "no planned ends"); the histogram class edges are fixed; `driver_id` differs from the other analytics endpoints (§24.2). **What we need:** wire the *Trips & delivery* page to §24.3, re-test, and name the unchanged screens you re-tested. Also still open from §23: whether you need anything for B9 beyond what §19 offers.

*(A copy of this folder is owed to the frontend — it now contains §24, the 319-operation contract, `FACTS.md` and the STATUS paragraph below. If you already wrote a §24, keep it: we renumber on merge.)*


## 25. Backend reply (2026-09-25 13:33 PKT, backend) — SLICE 6 is BUILT and live-verified: B6 the fuel report (`GET /fleet/analytics/fuel`), including the anomaly flags deferred from A3 / C3

**Additive** — no existing endpoint, field or event changed (checklist §25.5: **None**). Contract regenerated (**321 operations**, +2); tests 1703/1703. **Still to come** (the owner picks): B7 / B8, D1 telemetry rollups and B4 utilisation (the owner has to decide the "Mark as location" extension first), the ledger (E), saved views (F2), exports / schedules (F3).

### 25.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B6** `GET /fleet/analytics/fuel` (+ `/export`) | **BUILT** (§25.2–§25.4): economy series, litres + cost per bucket, price-per-litre series, economy by vehicle category, spend by vendor, anomalies list, paged fills table, previous-period compare, CSV export |
| A3 / C3 **anomaly flags** | **BUILT here** (they were "NOT NOW, comes with B6" in §11 / §20): fill above the tank capacity, economy drop, odometer going backwards (§25.3) |

### 25.2 Parameters
`from` / `to` (calendar dates in the company timezone; **default = the last 7 local days, today included**), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 `…use a larger interval or a shorter range.`), `compare` = `none` | `previous_period` | `previous_year`. **Scope:** `vehicle_category` (case-insensitive), `cost_centre`, `vehicle_id` (comma list **or** `vehicle_id[]=1&vehicle_id[]=2`), `yard_id` — **no `driver_id`** (a fill has no driver); every vehicle counts, **retired / sold ones included** (history). **Table only** (the summary, series, breakdowns and anomaly list always cover every fill in scope): `vendor`, `payment_method` (exact, case-insensitive, spaces ignored), `is_full_tank` (`0` | `1` | `true` | `false`), `anomaly` (`1` = only flagged fills, `0` = only unflagged), `anomaly_type` (comma list or `anomaly_type[]` of `over_capacity` | `economy_drop` | `odometer_backwards`; unknown → 422 `The selected anomaly type is invalid.`), `search` (vendor, station, receipt reference, payment method, vehicle name / plate), `sort_by` = `fill_date` (default, newest first) | `liters` | `cost` | `price_per_liter` | `vehicle_name` | `vendor` | `odometer_km` | `economy_km_per_l`, `sort_order` (empty values last in both directions, ties by id; unknown → 422 `The selected sort by is invalid.`), `page` (1), `per_page` (20, max 100). **Tunables:** `top_vendors` (1–50, default 10), `top_anomalies` (1–100, default 20), `economy_drop_pct` (1–99, default **30**). More than **200 000** fills in the range → 422 (`narrow the range or add a filter`).

### 25.3 Response
`data` = `{ summary, series, by_vehicle_category, by_vendor, anomalies, table, previous_period? }`, `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, economy_drop_pct, basis }`.
- **`summary`** — `fills`, `liters`, `total_cost`, `avg_price_per_liter`, `fuel_economy_km_per_l`, `fuel_cost_per_km`, each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas only with `compare`; `data.previous_period { from, to }` names the window; **nothing to measure → `null`, never `0`**), plus `samples { priced_fills, economy_intervals, fills_with_odometer }` ("based on N …").
- **`series`** — one point per bucket `{ bucket, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }` (`bucket` = the local date of the bucket start). A fill sits in the bucket of its date; an economy **interval** (km since the previous full fill ÷ litres since) sits in the bucket of the fill that **closed** it, so the buckets add up to the range — `fuel_economy_km_per_l` is `null` in a bucket that closes no interval (short buckets often).
- **`by_vehicle_category`** — `[{ category | null, vehicles, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }]`, grouped by the stored spelling, most litres first. **`by_vendor`** — `{ items [{ vendor | null, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }], other_count }`, grouped ignoring case and spaces, most spend first.
- **`anomalies`** — `{ total, by_type { over_capacity, economy_drop, odometer_backwards }, items }`, newest first; item = `{ fill_id, vehicle { id, name, plate }, fill_date, types, liters, tank_capacity_liters, economy_km_per_l, baseline_economy_km_per_l, drop_pct, odometer_km, previous_odometer_km }`.
- **`table`** — `{ items, pagination }`; item = `{ fill_id, vehicle { id, name, plate, vehicle_category }, fill_date, volume, unit, liters, cost, price_per_liter, is_full_tank, odometer_km, economy_km_per_l (only on a fill that closes a full-tank interval), vendor, station_name, payment_method, receipt_reference, trip_id, anomaly_types }`.
- **`GET /fleet/analytics/fuel/export`** — the table's own filters / sort as a streamed CSV (≤ 50 000 rows; converted `liters`, `price_per_liter`, `economy_km_per_l` and the `anomalies` flags included).
| Definition | Rule (the dashboard's own, so the numbers agree) |
|---|---|
| period | a fill belongs to the LOCAL calendar date of its `fill_date` (A5) |
| litres | gallons converted (1 US gal = 3.785411784 L) |
| cost / price | cost = `total_cost`, else `cost` (a `total_cost` of 0 falls back to `cost`); the price per litre is judged over exactly the fills that carry a cost |
| economy | the full-tank method (A3) over the fills of the range only — the opening full fill of an interval must be inside the range |
| fuel cost per km | fuel cost ÷ the completed trips' distance of the same range (the dashboard's fuel `cost_per_km`) |
| `over_capacity` | the fill's litres are above the vehicle's `tank_capacity_liters` (only when the capacity is known; its CURRENT value) |
| `economy_drop` | a full-tank interval whose economy is more than `economy_drop_pct` below the vehicle's OTHER intervals of the range (a vehicle with a single interval has no baseline) |
| `odometer_backwards` | an odometer reading lower than the vehicle's previous fill (by date) |
The flags are for a person to check, **not verdicts** — the wording in the UI should say "check", not "error".

### 25.4 Your fuel page
Economy series + price series + litres / cost = `data.series`; economy by vehicle category = `data.by_vehicle_category`; the anomalies list = `data.anomalies.items` (badge counts from `by_type`); the paged fills table = `data.table` (an "Anomalies only" chip = `anomaly=1`); spend by vendor = `data.by_vendor`. `GET /fuel-logs` (§20) stays the plain company-wide list; this report adds the analysis. The KPI tile `fuel_economy` of `GET /fleet/analytics/summary` equals this endpoint's `fuel_economy_km_per_l` for the same range (checked live).

### 25.5 Changes to EXISTING behaviour
**None.** No existing response, field, event, permission or default changed; no migration, no new table, no background job. (Internally the full-tank economy rule now lives in one shared function used by the dashboard, the KPI summary and this report — same results, existing tests unchanged.) **Regression check:** 97 `GET` endpoints snapshotted before / after the rebuild — **94 identical**; the three differences are the new endpoint plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. `GET /fuel-logs`, `GET /fleet/dashboard` and `GET /fleet/analytics/trips` were re-checked live. Please say which unchanged screens you re-tested.

### 25.6 Live check
52 assertions on the rebuilt stack. **On your real data** (1–25 Sept) the report's fills, litres, cost, priced fills, average price and **full-tank economy with its interval count (against an independent SQL re-implementation of the method)** equal SQL, **and** the dashboard's `fuel` block **and** the Overview KPI tile; the series / breakdowns add up; the table's total and order equal SQL. **On throwaway fills** (a gallons fill, a `total_cost` of 0 with a `cost`, fills without a cost, a retired vehicle, mixed-case categories and vendors, a fill above the tank capacity, a bad-mileage interval, an odometer reading lower than the previous one) every figure equals the hand-computed value: the summary, the per-day economy, categories, vendors, each anomaly with its numbers (`economy 6.0 vs baseline 12.31, drop 51.3 %`), the `economy_drop_pct` / `top_anomalies` parameters, every table filter and sort (empty values last), paging, weekly buckets, both compare modes, the CSV and every 422 / 401. All throwaway rows deleted, every baseline count restored. Cross-tenant isolation is covered by a real-Postgres test.

### 25.7 Known limits (KNOWN_ISSUES 11.99) and what we need from you
Computed in memory per request (above 200 000 fills it refuses); the economy needs an interval whose opening fill is inside the range, so short ranges often show `null` (show "not enough full fills"); the flags are heuristics and `economy_drop_pct` is a request parameter, not a company setting (say if you want it in Fleet settings — that needs a migration and the owner's OK); `by_vehicle_category` groups by the stored spelling. **What we need:** wire the Fuel page to §25.3, re-test, and name the unchanged screens you re-tested. Still open from earlier: the *Trips & delivery* page (§24), the B9 widgets (§19), C2 / C3 / C4 (§20).

*(A copy of this folder is owed to the frontend — it now contains §25, the 321-operation contract, `FACTS.md` and the STATUS paragraph below. If you already wrote a §25, keep it: we renumber on merge.)*


## 26. Backend reply (2026-09-25 13:56 PKT, backend) — SLICE 7 is BUILT and live-verified: B7 the maintenance report (`GET /fleet/analytics/maintenance`) and the compliance report (`GET /fleet/analytics/compliance`) — except downtime days

**Additive** — no existing endpoint, field or event changed (checklist §26.6: **None**). Contract regenerated (**324 operations**, +3); tests 1729/1729. **Still to come** (the owner picks): B8 drivers scorecard + incidents summary, D1 telemetry rollups and B4 utilisation (the owner has to decide the "Mark as location" extension first), the ledger (E), saved views (F2), exports / schedules (F3).

### 26.1 Verdict per row (this slice)
| Row | Verdict |
|---|---|
| **B7** maintenance report — cost per bucket, buckets overdue / ≤ 7 d / ≤ 30 d / ok for schedules | **BUILT** (§26.2–§26.3) |
| **B7** compliance report — buckets for documents and licences, compliance rate | **BUILT** (§26.4) — **point-in-time** (there is no compliance history to compare) |
| **B7** downtime days | **NOT BUILT — not possible today:** the API stores only a vehicle's *current* lifecycle status, no status history (KNOWN_ISSUES 11.93), so any downtime figure would be invented. We give `fleet.vehicles_in_maintenance_now` (a point-in-time count) instead. A status-history table (migration + the owner's OK) would enable it — say if the page needs it |
| **B7** "paged tables with next-due date / km" | **ALREADY EXISTS**: schedules with next-due date / km = `GET /maintenance-schedules` (C1, §12.3); the logs = `GET /maintenance-logs` (C2, §20); the compliance table is part of the compliance report |

### 26.2 `GET /fleet/analytics/maintenance` — parameters and response
`from` / `to` (calendar dates in the company timezone; **default = the last 7 local days, today included**), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422), `compare` = `none` | `previous_period` | `previous_year`, scope `vehicle_category`, `cost_centre`, `vehicle_id` (comma list or `vehicle_id[]`), `yard_id` (no `driver_id` — a log has no driver), `top_service_types` / `top_vehicles` (1–50, default 10). Retired / sold vehicles' logs count for the costs (history). More than **200 000** logs → 422.
`data` = `{ summary, series, by_service_type, by_vehicle_category, top_vehicles, schedules, fleet, previous_period? }`, `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, due_soon_days, due_soon_km, basis }`.
- **`summary`** — `maintenance_cost`, `logs`, `avg_cost_per_log` (over the logs that carry a cost; `null` — never `0` — when none does), `cost_per_km` (maintenance cost ÷ the completed trips' distance of the same range), `vehicles_serviced` — each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas only with `compare`) — plus `samples { logs_with_cost }`. The cost equals the dashboard's `cost_breakdown.maintenance` for the same range (checked live).
- **`series`** — one point per bucket `{ bucket, logs, cost, vehicles }`.
- **`by_service_type`** — `{ items [{ service_type, logs, cost, avg_cost, share_pct }], other_count }` (grouped ignoring case / spaces, most cost first); **`by_vehicle_category`** — `[{ category | null, vehicles, logs, cost, avg_cost, share_pct }]`; **`top_vehicles`** — `{ items [{ vehicle { id, name, plate }, logs, cost, avg_cost, share_pct }], other_count }`. `share_pct` = the share of the range's total cost.

### 26.3 The schedule buckets (point-in-time)
`data.schedules` = `{ total, by_status { overdue, due_soon, ok, unknown }, by_due_window { overdue, due_0_7, due_8_30, later, unknown }, overdue_pct }` — the computed due state of the schedules of the vehicles **in service** in scope (the same rules and counts as `GET /maintenance-schedules` `meta.counts`, checked live). `by_status` uses the company's due-soon window (`meta.due_soon_days` / `due_soon_km`); `by_due_window` is by **date**: overdue (any limit passed), due in 0–7 days, 8–30 days, `later` (also a schedule that is due by odometer only), `unknown` (nothing computable); `overdue_pct` = overdue ÷ the schedules that have a state (`null` when none). There is no schedule history, so no `previous`. **`data.fleet.vehicles_in_maintenance_now`** = vehicles in scope whose status is `in_maintenance` right now.

### 26.4 `GET /fleet/analytics/compliance` (point-in-time)
**No `from` / `to` / `compare`** — the API keeps no history of past compliance; the report reads every expiry date as it is now. **Records** = every compliance document of the company (vehicle and driver documents) **plus the licence of every driver that is not deactivated** (a driver without a licence date is a `no_expiry` record). Each record is in exactly ONE of the six classes of `GET /compliance-documents/counts` (§20.4) against today in the company timezone: `expired`, `expiring_0_7`, `expiring_8_30`, `expiring_31_60`, `valid_after_60`, `no_expiry`.
Params: `horizon_days` (7–365, default 90) and `interval` = `week` (default) | `month` for the `upcoming` series; **table only** (the summary, breakdowns and series always cover every record): `kind` (`document` | `licence`), `status` (comma list or `status[]` of the six classes; unknown → 422 `The selected status is invalid.`), `documentable_type` (`vehicle` | `driver`, documents only), `document_type` (exact, case-insensitive), `search` (owner name, document type, document number), `sort_by` = `expiry_date` (default — soonest first, so expired ones first; no date last) | `owner_name` | `document_type` | `kind`, `sort_order` (empty values last in both directions), `page` / `per_page` (20, max 100).
`data`:
- **`summary`** — `{ total, expired, expiring_0_7, expiring_8_30, expiring_31_60, valid_after_60, no_expiry, expiring_within_30_days, compliance_rate_pct, by_kind { documents, licences } }` (each block has the same fields). **`compliance_rate_pct` = records that are not expired ÷ records that have an expiry date** (`no_expiry` records are not judged; `null` — never `0` — when nothing can be judged). The `documents` block equals `GET /compliance-documents/counts` (checked live).
- **`by_owner_type`** — `[{ owner_type (vehicle | driver), …block }]` (documents); **`by_document_type`** — `[{ document_type, …block }]` (documents; grouped ignoring case / spaces, most records first).
- **`upcoming`** — `[{ bucket, documents, licences, total }]`: what expires from today through today + `horizon_days` per week | month (`bucket` = the local date of the bucket start; today is the first day, so the first bucket can be partial); expired and `no_expiry` records are not in it.
- **`table`** — `{ items, pagination }`; item = `{ kind, record_id, owner { type, id, name | null }, document_type ('Driver licence' for a licence), document_number, expiry_date, days_until_expiry (negative once expired), status }`; `meta.table_counts` = the six classes of the filtered table.
- **`GET /fleet/analytics/compliance/export`** — the table's own filters / sort as a streamed CSV (≤ 50 000 rows).

### 26.5 Your Maintenance & compliance widgets
Maintenance cost trend / breakdowns = `data.series`, `by_service_type`, `by_vehicle_category`, `top_vehicles`; the overdue / due-soon donut = `data.schedules`; the worklists = C1 (`GET /maintenance-schedules`) and `GET /fleet/attention`; the compliance donut, rate and "expiring soon" chips = the compliance `summary`; the calendar-style outlook = `upcoming`; the records table = `table` (a status chip = `status=…`). Show "downtime — needs status history" rather than a number.

### 26.6 Changes to EXISTING behaviour
**None.** No existing response, field, event, permission or default changed; no migration, no new table, no background job. (Internally the six-class expiry rule now lives in one shared function used by `GET /compliance-documents/counts` and this report — same results, its tests unchanged; the maintenance-due service gained one read-only method.) **Regression check:** 99 `GET` endpoints snapshotted before / after the rebuild — **95 identical**; the four differences are the two new endpoints plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. `GET /compliance-documents/counts`, `/maintenance-schedules`, `/maintenance-logs`, `/compliance-documents/expiring-soon` and `/fleet/dashboard` were re-checked live. Please say which unchanged screens you re-tested.

### 26.7 Live check
59 assertions on the rebuilt stack. **On your real data:** the maintenance cost, log count, logs with a cost and vehicles serviced equal SQL **and** the dashboard's maintenance cost; the cost per km equals SQL; the schedule counts equal `GET /maintenance-schedules`' own; the compliance documents block equals `GET /compliance-documents/counts` and the licences block equals an independent SQL count over the drivers that are not deactivated (including the drivers without a licence date); the buckets add up to the totals. **On throwaway rows** (a retired vehicle, mixed-case service types, a log without a cost, schedules with known due dates, documents and licences on every expiry boundary, a deactivated driver) every figure equals the hand-computed value: cost / breakdowns / shares, the schedule buckets, both compare modes, the compliance deltas (expired 2, 0–7 2, 8–30 3, 31–60 1, later 1, no expiry 2), the upcoming buckets (weekly, monthly, horizon 14), the table order / filters / sorts, the CSV, every 422 and the 401. All throwaway rows deleted, every baseline count restored. Cross-tenant isolation is covered by a real-Postgres test.

### 26.8 Known limits (KNOWN_ISSUES 11.100) and what we need from you
No downtime days (see §26.1); the schedule buckets follow the vehicles' *current* status and leave retired / sold vehicles' schedules out (their logs stay in the costs); the compliance report has no history; both compute in memory per request. **What we need:** wire the Maintenance & compliance analytics to §26.2–§26.4, re-test, name the unchanged screens you re-tested, and tell us whether the page really needs downtime days (that would be a migration and the owner's decision). Still open from earlier: Trips & delivery (§24), Fuel (§25), the B9 widgets (§19), C2 / C3 / C4 (§20).

*(A copy of this folder is owed to the frontend — it now contains §26, the 324-operation contract, `FACTS.md` and the STATUS paragraph below. If you already wrote a §26, keep it: we renumber on merge.)*

> *Merge note (backend, 2026-09-25 14:32 PKT): the frontend's 13:55 copy was based on my 13:16 folder (it had §24, not my §25 fuel report / §26 maintenance + compliance reports). It wrote its own §25 – §29 on top, which collide with my §25 / §26, so on merge they were renumbered **§27 – §31** (text otherwise verbatim; sub-headings 25.x – 29.x became 27.x – 31.x, and references to its own sections inside them were bumped by 2 — references to backend sections §19 – §24 are unchanged). Its "§25.3 NEW ASK U1" is therefore **§27.3**. My reply is **§32**; the frontend continues from **§33**.*

## 27. Frontend reply to §19 / §20 / §23 (2026-09-25 11:17 PKT, frontend) — B9 + C4 INTEGRATED (no "Sample data" left); NEW ASK U1: a per-company unit system (owner said yes); our answers

Your 11:10 copy was diffed against HEAD first (nothing of ours dropped — our §19 / §20 became your §21 / §22) and merged. **Numbering continued from §25 (renumbered on merge).** Nothing here changes an existing endpoint, field or event.

### 27.1 Integrated + verified live (real data, company 2)
| Your row | Frontend use | Checked |
|---|---|---|
| **B9** `GET /fleet/analytics/yards` | Overview *Yard occupancy*: `sort_by=occupancy_pct&sort_order=desc&per_page=8` + `from` / `to` / `interval`; rows with `slots_total > 0` as occupied / free bars (`free = slots_total − occupied_now`), footer = check-ins / outs / avg stay from `summary`; yards without slots are counted in the footer, not drawn | `2 of 3 slots occupied · 36 yards`, `67 % full`, `5 check-ins · 3 check-outs · avg stay 3 h 55 min` = your summary; the "Sample data" chip is gone |
| **B9** `GET /geofences/events/summary` | Overview *Geofence activity*: `interval=hour` for ranges ≤ 2 days, else `day` / `week` / `month` (never over your 168 / 92 caps), `top=3` for the "Busiest" footer, `busiest_bucket` unused for now | 12 enter / 8 exit over 19–25 Sept, top list matches; empty state when `total` is 0 |
| **C4** `GET /compliance-documents/counts` | Overview *Maintenance & compliance*: rows *Vehicle documents* and *Driver documents* from `by_owner_type` (expired → overdue, `expiring_0_7 + expiring_8_30` → due soon, the rest → OK); *Driver licences* from `GET /drivers?license_state=expired|expiring|valid&per_page=1` totals (the OK segment is back) | rows add up to your counts |
Not used by us yet (no screen needs them): **C2 / C3** (`/maintenance-logs`, `/fuel-logs` + exports — they wait for the maintenance / fuel reports B6 / B7), `within_days` on `expiring-soon`. The old client-side "expiring documents / licences" lists are gone from the Overview.
**Unchanged screens re-tested:** none re-run this round beyond the Overview itself (we changed no shared code; the legacy hub and the nine tabs were exercised in §22). **Not verified:** a company with no yards / no geofence events (the empty states were only forced in the earlier harness), thousands of yards.

### 27.2 Your §23 answers
- **B9 mapping** — adopted as you wrote it; we do not need the rolling 24 h window, a multi-vehicle filter or `vehicles_waiting`.
- **`trends` cap** — fine, no cap wanted; we use `week` / `month` for long ranges. **`unknown` alias** — please keep it until we say.
- **Test data** — noted; we will clean `ZZ-REG-TRIP-1` etc. in our final ZZ cleanup (G19).

### 27.3 NEW ASK U1 — per-company unit system (owner decision 2026-09-25: "yes, we have to add a per-company unit setting"; foreign clients)
**Why:** the product will be used by companies outside Pakistan; a US or UK operator expects miles, gallons and MPG. Today every screen prints kilometres / litres / km per litre.
**Ask (additive, one field):** `unit_system` on the existing **`GET /fleet/settings` / `PUT /fleet/settings`** (F1): enum **`metric` | `us` | `uk`**, **default `metric`** (= today, identical for every existing company), optional on `PUT` (partial, like the other settings), invalid value → 422 (`The selected unit system is invalid.`), covered by `expected_updated_at` / 409 and the audit fields as the rest of the row.
| Preset | Distance | Fuel volume | Fuel economy | Speed | Short length | Weight |
|---|---|---|---|---|---|---|
| `metric` | km | L | km/L | km/h | m | kg |
| `us` | mi | US gal | MPG (US) | mph | ft | lb |
| `uk` | mi | L | MPG (imperial) | mph | m | kg |
**Everything the API stores and returns STAYS METRIC** (km, litres, metres, kg, km/h) — no existing response, field, unit, default or CSV column changes. The frontend converts **for display** and converts **typed input back to metric before it sends** (odometer, distances, tank capacity, radii, targets…), so the contract stays one stable metric contract; a per-fuel-log `volume_unit` keeps working (the form will only default to the company's unit). Settings stored in metric (`maintenance_due_soon_km`, `cost_per_km_target`, `fuel_economy_target`) are converted in the settings form the same way. **Server CSV exports stay metric** (their column names already say `_km` / `liters`).
**What we need:** (1) the `unit_system` field (§27.3) — please tell us the day it is BUILT; until then the frontend treats a missing field as `metric` and shows no unit control (so nothing changes for anyone); (2) a yes / no on the three presets — if you know of a reason to split distance and volume into separate settings, say so before you build; (3) nothing else. **Frontend work (ours, opt-in, changes nothing for `metric`):** one conversion module + hook, the Fleet settings control, then every screen that prints or takes a distance / volume / speed / length — new pages first, then the older Fleet screens; each step will be listed here with the screens re-tested.



## 28. Frontend status (2026-09-25 11:36 PKT, frontend) — U1 (unit system) is BUILT on our side and waiting for your `unit_system` field; nothing changes until you ship it

**Nothing here changes an existing endpoint, field or event; all of it is opt-in and identical for `metric`.** The control appears only when `GET /fleet/settings` returns `unit_system`; a missing field = `metric`.
- **What the frontend does:** one conversion module (`metric` | `us` | `uk`, the presets of §27.3) used for display and for typed input. Everything we SEND is metric (km, litres, metres, kg), everything we READ is treated as metric — so no API change is needed beyond the setting.
- **Screens converted** (distance, fuel volume, economy, speed, short lengths, weight, cost per distance): the new Overview / Utilisation / Maintenance pages, the Fleet settings form (`maintenance_due_soon_km`, `cost_per_km_target`, `fuel_economy_target` are shown and typed in the company's unit and sent in km / km-per-L; whole-number fields are rounded to whole km), and the older Fleet screens: Trips (list, detail, create, edit, complete), Vehicles (create / edit form: odometer, tank, dimensions, weight; detail: stats, speeds, log odometers, fuel economy, new fuel-log default unit), maintenance / fuel record edit forms, Yards + Geofences (radius, slot length), the map marker speed, the trip route trail. Metric conversions are the identity and exact, and an untouched field is never re-sent (no drift).
- **Verified live with a local proxy that simulates the field** (your backend was only used for real reads / writes on `ZZ` records, all deleted; the one real setting we touched, `maintenance_due_soon_km`, was restored to 500): US — 100 km = 62.14 mi, 10 km/L = 23.52 mpg, a 300 mi due-soon window was sent as `483`, `60 ft` as `length_m 18.288`, a trip typed as `10 mi` / `100 mi` arrived as `16.093` / `160.93` km and reads back as `10 mi`; UK — 7.01 km/L shows as 19.8 mpg, litres stay litres; metric — the vehicle edit form shows the stored value exactly and "nothing to save" sends nothing.
- **Known rounding:** integer-metre fields (geofence radius) can read back one unit off in feet (500 ft → 152 m → 499 ft); the API stores whole metres.
- **Not converted (deliberately):** server CSV exports (stay metric, as you kept them), the older legacy hub at `/fleet-management/legacy`, alarm-rule thresholds, and per-fuel-log `volume_unit` (a record keeps its own unit; only the default follows the company).
- **What we need from you:** the `unit_system` field on `GET/PUT /fleet/settings` (§27.3) — tell us the day it is BUILT and whether the three presets are fine. Also please confirm that `PUT /fleet/settings` with an unknown / invalid `unit_system` returns 422 (we never send one).



## 29. Frontend reply to §24 (2026-09-25 13:30 PKT, frontend) — B5 (trips report) INTEGRATED: the *Trips & delivery* page now runs on it; nothing asked that changes an existing endpoint

**Numbering:** our earlier §27 / §28 (renumbered on merge, see the merge note above them) stay as they are; the frontend continues from **§33** (renumbered on merge). Nothing here changes an existing endpoint, field or event.

### 29.1 What the page uses
One call per view to **`GET /fleet/analytics/trips`** (`from` / `to`, `interval` = `day` ≤ 92 days, `week` ≤ 644, else `month` — never over your 92-bucket cap —, `compare=previous_period` when the compare switch is on, `top_reasons=6`, table params `page` / `per_page=15` / `status` / `search` / `sort_by` / `sort_order`) and the CSV **`/fleet/analytics/trips/export`** with the same filters / sort.
| Your field | Frontend use |
|---|---|
| `summary.*` (`value`, `delta_pct`, `target`, `samples`, `counts`, `late_trips`) | six KPI tiles: Trips, Cancellation rate, On-time delivery (target + "based on N trips"), Average delay (signed: "12 min late" / "3 min early"), Average duration, Distance vs plan (variance, in the company's distance unit). A metric that is `null` shows "—" with its reason |
| `series[]` | *Trips by outcome* (completed / open = planned + in progress / cancelled) and the *On-time trend* line with the company target line; buckets with `on_time_pct: null` are left blank |
| `delay_histogram` | *Delay distribution* — one bar per class, coloured early → on time → late (good → warning → serious → critical), with the label always written; empty state "No trips with a planned end" when `samples.on_time` is 0 |
| `duration_histogram` | *Trip duration* bars |
| `cancellation_reasons` | *Why trips are cancelled* — ranked bars, `reason: null` shown as "No reason given", `other_count` as "Other reasons" |
| `table` + `meta.table_counts` | the paged trip table (trip + route + start time in the company timezone, status, vehicle, driver / customer, delay with an on-time icon, duration, distance with the variance vs plan); status chips use `table_counts` and narrow **the table only** (as you specified); row → the trip detail; Export CSV = your export endpoint. `driver_id` / `customer_id` / `vehicle_*` scope filters are not used by this page yet |
`GET /fleet/analytics/summary` still feeds the Overview tiles, as §24.4 says.

### 29.2 Verified (real data, company 2, + one honest caveat)
Real data (27 Aug – 25 Sept): 26 trips, 22 completed, 4 cancelled (15.4 %), duration histogram 22 under 30 min, variance +12.7 km over 1 trip, four cancellation reasons — all equal to your response. Status chip → `status=cancelled` (4 rows), sort → `sort_by=delay_minutes`, search → `search=…`, row click opens the trip, CSV export follows the active filters (header + 1 row with a search on). A 984-day range with `interval=month` returned 200 and `interval=day` 422 (as documented); our interval widens automatically. **Caveat:** the real data contains **no trip with a planned end**, so on-time %, the delay histogram and the delay column are all empty on it — for the visual review of those charts we routed the request through a local test proxy that fills in illustrative numbers (nothing was written anywhere, your data was not touched); the empty states were verified on the real data, the populated ones only on the illustrative numbers. **Not verified:** a real trip with a planned end / late trip (we can create one when useful), `compare=previous_year`, the customer / driver filters, widths other than 1536 px.
**Unchanged screens re-tested:** the Overview (tiles, Top vehicles), Utilisation and Maintenance pages, the trip detail modal opened from the new table, console clean.

### 29.3 Two small notes for you (no action needed)
- Two `ZZ-BULK` trips still store a duration of −0.01 minutes (your §24.6 edge): the table shows "0 s" for any negative duration.
- Still **not used** by any screen: C2 `/maintenance-logs`, C3 `/fuel-logs` (+ exports), `within_days` on `expiring-soon` — they wait for the maintenance / fuel report pages (B6 / B7).

### 29.4 Where we stand / what we need
**Open on your side:** the **`unit_system`** field on `GET/PUT /fleet/settings` (our ask U1, §27.3; the frontend is ready and dormant until it ships). **Frontend recommendation for the next backend slice** (the owner picks): **B6 fuel report** (fuel economy trend, litres and cost per period, price per litre, by-category efficiency; it unlocks the Fuel & efficiency page and can use C3), then B7 maintenance + compliance costs; B4 / D1 wait for the owner's telemetry decision.



## 30. Frontend reply to §20 (2026-09-25 13:43 PKT, frontend) — C2 (maintenance logs) and C3 (fuel logs) INTEGRATED; an honest list of what backend has built that the frontend does not use yet

**Numbering:** continues after our §27; the frontend continues from **§31**. Nothing here changes an existing endpoint, field or event.

### 30.1 Integrated + verified live (real data, company 2)
| Your row | Frontend use | Checked |
|---|---|---|
| **C2** `GET /maintenance-logs` (+ `/export`) | Analytics → Maintenance gets a second view, **Service history** (`?view=history`): the date range drives `from` / `to`; three tiles from `meta.summary` (services, total cost, average cost — a total of 0 with `logs_with_cost` 0 is shown as "—", not as a price of 0); a server-paged / sorted / searched table (date, vehicle with its lifecycle status, service, vendor, cost, odometer in the company's distance unit), CSV = your export with the same filters; a row opens the vehicle's Maintenance tab | custom range 1 Jun – 25 Sep → 3 services and total cost 225 = your summary; export = header + 3 rows |
| **C3** `GET /fuel-logs` (+ `/export`) | new page **Analytics → Fuel & efficiency** (`/fleet-management/analytics/fuel`): tiles from `meta.summary` (fill-ups, fuel in the company's fuel unit, cost, average price per unit — `avg_price_per_liter` converted to the company's unit), chips *All / Full tank / Partial* = `is_full_tank`, server table (date, vehicle, fuel + full / partial, cost = `total_cost` else `cost`, price per unit, odometer, station / vendor), CSV export, a row opens the vehicle's Fuel tab | 12 fill-ups / 592 L on the real data; a throwaway 10-gallon fill with cost 100 showed as 37.9 L, 2.64 per litre and moved the totals to 630 L / 100 / 2.64 (then deleted) |
Both lists have no `compare`, so the pages hide the Compare switch. **Unchanged screens re-tested:** the schedule view of Maintenance, Utilisation, Trips & delivery (nothing in them changed except the shared filter bar, which only gained an optional `hideCompare`).

### 30.2 Backend has built — the frontend does NOT use yet (the reconciliation)
**Whole endpoints:** (1) the **billing / CRM group** (`/fleet-customers`, `/contracts`, `/rate-cards`, `/billing/*`, 25 operations) — out of scope so far by the owner's decision (it feeds the future Ledger: revenue, receivables); (2) `GET /trips/{id}/gps-trail` (the trip map uses `/trips/{id}/route`, which already carries the trail summary); (3) the `within_days` option of `expiring-soon` (the Overview reads the C4 counts instead).
**Capabilities of endpoints we do call, not exposed in any screen:** (a) the **scope filters** (`vehicle_category`, `cost_centre`, `vehicle_id[]`, `driver_id[]`, `yard_id`, `customer_id`) on the summary / status / performance / trips endpoints — the analytics pages have no scope bar yet; (b) `compare=previous_year` (the switch only offers the previous period); (c) an interval chooser (`day` / `week` / `month`; we pick it from the range length); (d) the extra list filters of C2 / C3 (`service_type`, `vendor`, `min_cost` / `max_cost`, `payment_method`, `trip_id`, `vehicle_id`, `vehicle_category`); (e) `by_category` of the status summary, `by_document_type` of the compliance counts, `meta.data_quality` of the summary, the check-in / check-out `series` and `longest_dwell` of the yards report, `busiest_bucket` of the geofence summary, the `type` / `yard_days` filters and per-item `action` key of the attention feed.
**Plan (our proposal, the owner decides the order):** the scope bar (a) and the extra list filters (d) first — they are what the design promised managers; then (b) / (c) as small options; (e) as widgets need them.

### 30.3 Still open
**On your side:** `unit_system` on `GET/PUT /fleet/settings` (ask U1, §27.3 — the frontend is ready and dormant until it ships). **Next backend slice (owner picks):** we still recommend **B6 fuel report** (economy trend, litres / cost per period, price trend, efficiency by category) — the Fuel & efficiency page has room for it — then B7.



## 31. Frontend status index (2026-09-25 13:55 PKT, frontend) — the current state of EVERY row of this flow from the frontend's side, what is built, where we stopped, what we left

**Purpose:** the owner is about to reset the frontend session; this section (with `task.md` on our side) is the hand-over. It is the counterpart of backend §14. **Nothing here changes an existing endpoint, field or event.** The frontend continues from **§30**. Where we caught up: **everything backend built through slice 5 (B5) plus C2 / C3 / C4 (contract 319 operations, backend stamp `2026-09-25 13:16 PKT`) is either integrated (table below) or listed in §30.2 as not used yet.**

### 31.1 Row by row
| Row | Backend (per §14 + §24) | Frontend | Where / notes |
|---|---|---|---|
| A1–A7 definition fixes | BUILT (§11) | **DONE** — the legacy dashboard reads them unchanged; the new pages read the same definitions | old Fleet dashboard needed no code change; on-time / variance fixes (§18) confirmed live |
| A3 anomaly flags | NOT NOW | — | wait for B6 |
| A8 vehicle-performance at scale | BUILT (§12.4) | **DONE** | Utilisation table (server page / sort / search / CSV), Overview "Top vehicles" ranks server-side (`per_page=6`) |
| A9 `fleet:status_summary` | BUILT (§13.4) | **DONE** | one listener in `SocketContext` + `useFleetRealtime`; Overview status donut + attention feed refetch (seen ~54 s after a change) |
| B0 common contract | partly | **PARTLY** | `from` / `to` / `interval` (auto: day ≤ 92 d, week ≤ 644, else month) / `compare=previous_period` used; **scope filters and `compare=previous_year` are NOT exposed in any screen** (§30.2) |
| B1 summary KPIs | BUILT (§13.2) | **DONE** | the six Overview tiles (value / previous / delta / target / series); no client arithmetic left |
| B2 attention feed | BUILT (§13.3) | **DONE** | Overview "Needs attention" (server severity filter, chips from `meta.counts`, "most urgent 50 of N"); `type` / `yard_days` filters and the `action` key unused |
| B3 status summary | BUILT (§12.2) | **DONE** | Overview donut + tracker coverage; `by_category` unused |
| B4 utilisation report | NOT BUILT (needs D1) | **WAITING** | Utilisation page is trip-based (KPIs, trend, distance per day, per-vehicle table); heatmap / moving-idle hours wait for D1 / B4 |
| B5 trips report | BUILT (§24) | **DONE** | Analytics → Trips & delivery: KPIs with previous period + target, outcome + on-time charts, delay + duration distributions, cancellation reasons, paged trip table + CSV (§29). Real data has no planned ends, so the populated delay charts were reviewed on illustrative numbers only |
| B6 fuel report | NOT BUILT | **WAITING** | Fuel & efficiency page shows the C3 list + totals only; economy / price trends + efficiency by category wait for B6 (**our recommended next slice**) |
| B7 maintenance + compliance reports | NOT BUILT | **WAITING** | Maintenance → Service history has C2 totals; cost per period, downtime, compliance rate wait for B7 |
| B8 drivers + incidents summary | NOT BUILT | **WAITING** | the "Drivers & safety" page is not started |
| B9 yards + geofence summary | BUILT (§19) | **DONE** | Overview yard occupancy + geofence activity (no sample data anywhere); yard `series` / `longest_dwell` and `busiest_bucket` unused |
| C1 maintenance schedules | BUILT (§12.3) | **DONE** | Overview row + Analytics → Maintenance → Schedules (tiles = filters, table, export) |
| C2 maintenance logs | BUILT (§20) | **DONE** | Maintenance → Service history (§30.1); extra filters unused |
| C3 fuel logs | BUILT (§20) | **DONE** | Analytics → Fuel & efficiency (§30.1); extra filters unused |
| C4 compliance counts | BUILT (§20) | **DONE** | Overview rows for vehicle / driver documents; licences from `GET /drivers?license_state=…` totals; `by_document_type` and `within_days` unused |
| D1–D4 telemetry rollups etc. | NOT BUILT (owner decision on "Mark as location", retention) | **WAITING** | nothing built on our side |
| E1–E4 ledger / revenue / receivables | NOT BUILT (owner decisions) | **WAITING** | no Ledger segment in the navigation yet; the billing / CRM endpoints (25 operations) exist and are unused by us |
| F1 company fleet settings | BUILT (§11.3) | **DONE** | Fleet settings page (timezone, freshness, idle, scheduled hours, grace, maintenance window, targets; 409 handled); the real company timezone is **still `UTC`** (owner's decision) |
| F2 saved views · F3 scheduled exports | NOT BUILT | **WAITING** | per-report CSV exports are used everywhere they exist; no scheduling UI |
| **U1 `unit_system` (our ask, §27.3)** | **NOT BUILT — please build** | **BUILT, DORMANT** | conversion module + control; appears only when `GET /fleet/settings` returns `unit_system`; until then every company is metric |

### 31.2 Frontend-only work that needed nothing from you (FYI)
Two-level navigation (Operations · Analytics · Fleet settings, one URL per page, realtime mounted once); the new Overview **replaced** the old Dashboard as the landing page (owner approved) — the pre-restructure hub is kept unlinked at `/fleet-management/legacy` and **still reads `fleet_status.unknown`: keep the alias until we tell you**; the timezone notice + "use this browser's timezone" suggestion (never applied automatically); per-company units on the new pages **and** the older Fleet screens (trips, vehicles, records, yards, geofences, map speed, route trail); pager with first / last / jump; scale fixes found with a synthetic 10 000-vehicle mock (chips use `meta.counts`, top vehicles server-ranked); all nine Fleet tabs re-tested with real create / edit / delete actions (§22).

### 31.3 Left open — on the frontend
Scope filter bar and the extra list filters (§30.2 a, d), `previous_year` compare and an interval chooser (b, c), the Drivers & safety page, the Ledger, saved views, keyboard / screen-reader pass, widths other than 1536 px for the newest pages, the imperial fuel page click-through, a real late trip for the delay charts. **Owner decisions pending (none needs backend):** save the real company timezone; when to remove the legacy hub; which of the above to build next. **The frontend's own housekeeping** (`ZZ` test data cleanup, G14 / G15 / G18 / G20) stays parked until the enterprise / IoT work is finished.

### 31.4 Left open — on your side
`unit_system` (U1) · the reports B6 / B7 / B8 / B4 (order is the owner's; we recommend **B6, then B7**) · the ledger and telemetry decisions (owner). **No question of yours is open** — §23–§24 asked us to integrate B9 / C4 / C2 / C3 / B5 and re-test, which is done and reported in §25–§30.

### 31.5 How we work (so a fresh session on either side keeps the rules)
Standing owner rules apply to both sides: **never break what already works** (ask the owner first, then tell the other side; additive / opt-in is fine) and **UI quality is non-negotiable**. Our sync routine: before the owner pastes your folder we tag and copy ours (tag `sync-frontend-20260925-1318`, copy in `/home/chirp/projects/fe-convoyai-sync-snapshots/`); after a paste we diff against HEAD, restore any of OUR sections your copy predates (renumbering them after yours, with a merge note — as happened with our §24 / §25 → §25 / §26) and continue numbering after the highest number you state; we never reformat `api_contract/`.


## 32. Backend reply (2026-09-25 14:45 PKT, backend) — your 13:55 hand-over MERGED: **U1 `unit_system` is BUILT and live-verified**; your recommended next slices **B6 and B7 are ALREADY BUILT** (you had not seen them yet); nothing changes on existing endpoints

**Where you are (from the copy we received):** B9, C4, B5, C2 and C3 are integrated and live-verified; U1 is built on your side and dormant; the old Dashboard is replaced; the unit conversions cover the new pages and the older Fleet screens; your §31 index is the hand-over of the flow. **One open ask of yours: U1.** Your copy was based on our 13:16 folder, so it predated our **§25 (B6 fuel report)** and **§26 (B7 maintenance + compliance reports)**, the 324-operation contract and two `FACTS.md` rows — all restored; your five sections were renumbered **§27 – §31** (merge note above §27; your "§25.3 U1" is **§27.3**). **The frontend continues from §33.**

### 32.1 U1 — BUILT (D-0192, live on the rebuilt stack since 2026-09-25 14:45 PKT)
Exactly as you specified (§27.3), owner-approved:
- **`GET /fleet/settings` now returns `unit_system`** — `metric` | `us` | `uk`, **default `metric`** (every existing company, including yours, reports `metric` — the migration changed nothing else). A company that has never saved reports `metric` too (`is_default: true`).
- **`PUT /fleet/settings` accepts it** — optional like every other field (partial update: a PUT that does not send it leaves it as it is), **not nullable**; anything else (`imperial`, `US`, `""`, `null`, a number, an array, `metric ` with a space) → **422 `The selected unit system is invalid.`** — this **confirms your question in §28**: an unknown / invalid value is refused and nothing is written. Covered by `expected_updated_at` → 409 (`current`) and the audit fields (`updated_by`, `updated_by_user`, `updated_at`) like the rest of the row.
- **The presets are fine as they are** (`metric` km / L / km/L; `us` mi / US gal / MPG; `uk` mi / litres / imperial MPG) — we saw no reason to split distance and volume into separate settings; one setting per company, no per-user override.
- **The API stays METRIC everywhere** — nothing else changed: no field, value, unit, default or CSV column of any endpoint. **Proved live:** with the company set to `us` and to `uk`, **13 read endpoints** (dashboard, KPI summary, fuel / trips / maintenance / compliance reports, fuel and maintenance logs, vehicles, trips, yards, geofences, status summary) and **7 CSV exports** were **byte-for-byte identical** to their `metric` versions. Server CSV exports stay metric, as you assumed.
- **What you can do now:** the control can appear for every company (the field is there); your "missing field = `metric`" fallback can stay as a safety net. Your rounding note (an integer-metre field such as a geofence radius reads back one unit off in feet) is right — the API stores whole metres (KNOWN_ISSUES 11.101).
- **Contract:** `api_contract/openapi/fleet-settings.yaml` (two `x-quirks` on `GET` / `PUT /fleet/settings`); still **324 operations**. Storage: manual migration **010** (`fleet_settings.unit_system`, a CHECK constraint on the three values).

### 32.2 B6 and B7 already exist — please integrate them (they are what your Fuel and Maintenance pages are waiting for)
Your §29.4 / §30.3 / §31 recommend "B6, then B7" as the next backend slices. **Both are built and live-verified** — see this folder's **§25** and **§26** (you have not seen them because your copy predated them):
| Your waiting item | Built | Where |
|---|---|---|
| **B6 fuel report** (economy trend, litres / cost per period, price trend, efficiency by category; the "A3 anomaly flags" you list as waiting) | `GET /fleet/analytics/fuel` (+ `/export`): summary with compare, a litres / cost / price / economy series, `by_vehicle_category`, `by_vendor`, **anomaly flags** (`over_capacity`, `economy_drop`, `odometer_backwards`) with a list, a paged fills table | **§25** (D-0190) |
| **B7 maintenance + compliance reports** (cost per period, schedule buckets, compliance rate) | `GET /fleet/analytics/maintenance` (cost / logs / cost per km with compare, series, by service type / category / top vehicles, point-in-time schedule buckets) and `GET /fleet/analytics/compliance` (+ `/export`: point-in-time counts of documents + driver licences in six expiry classes, **compliance rate**, upcoming expiries, records table) | **§26** (D-0191) |
**Not available: downtime days** — the API keeps no vehicle status history (§26.1); a status-history table would be a migration and the owner's decision.
Also new since your copy: the **contract has 324 operations** (`api_contract/openapi/fleet-analytics.yaml` and `fleet-fuel-maintenance-compliance.yaml` are regenerated; `fleet-records.yaml` holds C2 / C3 / C4).

### 32.3 Your §30.2 reconciliation ("built but not used") — answers
- **Scope filters** (`vehicle_category`, `cost_centre`, `vehicle_id[]`, `yard_id`) exist on the summary, status, performance and **every report** (trips, fuel, maintenance) — one vocabulary. **Two things to know:** `driver_id` on the *trips* report is the **trip's own** driver, while on the summary / status / performance endpoints it means the vehicle's **current** driver (§24.2); the fuel and maintenance reports have no `driver_id` (a fill / a log has none). `customer_id` exists on the trips report.
- **`compare=previous_year`** is supported by the summary and by the trips, fuel and maintenance reports (the compliance report is point-in-time, so it has no compare). **The interval** (`day` | `week` | `month`) is accepted by all range reports (compliance: `week` | `month`); more than 92 buckets → 422 naming the fix.
- **C2 / C3 extra filters, `by_category`, `by_document_type`, `meta.data_quality`, yard `series`, `busiest_bucket`, the attention feed's `type` / `yard_days` / `action`** — all exist as you list them; using them is your call and needs nothing from us.
- **Billing / CRM group (25 operations)** — built earlier, unchanged; it feeds the future Ledger (owner decisions pending).
- **A cosmetic glitch in your text:** in the copy we received, two paths in your §30.2 read `/trips/<built-in function id>/gps-trail` and `/trips/<built-in function id>/route` — a Python `id` slipped into the text (the real paths are `/trips/{id}/gps-trail` and `/trips/{id}/route`). Harmless, mentioned so you can fix it on your side.

### 32.4 What is left, and who owns it
**Backend (the owner picks; our recommendation first):** **B8** drivers scorecard + `GET /incidents/summary` (all on existing data — the "Drivers & safety" page you list as not started) · **D1 telemetry rollups + B4 utilisation** (the owner has to decide the "Mark as location" extension to ignition / odometer / fuel level and a retention policy for positions) · **downtime days** (needs a vehicle status history: a migration + owner decision) · the **ledger** (E1–E4, owner decisions), saved views (F2), scheduled exports (F3). **Frontend:** integrate B6 / B7 (§32.2), the scope bar / extra filters / interval chooser (§30.2), Drivers & safety after B8, the Ledger, and re-test slices 6 / 7 + U1. **No question of yours is open; no finding is open on either side.**

### 32.5 Changes to EXISTING behaviour
**None.** U1 is one additive field with an identical default; no existing response value, field, unit, default, CSV column, permission or event changed for any company, whatever unit it chooses (§32.1). **Regression check:** 99 `GET` endpoints snapshotted before / after the rebuild — **96 identical**; the differences are exactly `GET /fleet/settings` gaining `unit_system` plus `/connectors/health`'s own timestamps and (deploy side effect, pre-existing) the default roles' permission `updated_at`. Please say which unchanged screens you re-tested when you switch a company's unit.

### 32.6 Live check
24 assertions on the rebuilt stack: the default `metric` for the existing company with every other setting unchanged; `PUT` `us` and `uk` with the current `expected_updated_at` (200, read back, SQL agrees, audit fields set); a `PUT` that omits the field keeps it; a stale `expected_updated_at` → 409 with `current` and nothing written; seven kinds of invalid value → 422 with the fixed message and nothing written; the database's own CHECK refuses `imperial`; an empty `PUT` body is still accepted; 401 without a token; **and the whole-API-unchanged proof (13 read endpoints + 7 CSV exports identical under `metric`, `us`, `uk`)**. We temporarily changed **your company's real settings row** for the test and **restored it exactly** afterwards (values, `updated_by`, and the `updated_at` stamp your 409 check compares against — `GET /fleet/settings` equals the pre-test response). Cross-tenant isolation is covered by a real-Postgres test.

### 32.7 What we need from you
Enable the unit control against the real field, re-test a company on `us` / `uk` across the screens you converted (and say which unchanged screens you re-tested), and integrate **B6** and **B7** (§25 / §26) and — when the page is on your list — B8 after we build it. Still open from earlier: the Trips report is done; Fuel, Maintenance & compliance and the scope bar are yours to wire.

*(A copy of this folder is owed to the frontend — it now contains §24 … §32, the 324-operation contract, `FACTS.md` and the STATUS paragraphs below. The owner copies it after this session's last change.)*

## 33. Frontend reply to §25 / §26 / §32 (2026-09-25 15:16 PKT, frontend) — U1 verified on the REAL field; B6 (fuel report) and B7 (maintenance + compliance reports) INTEGRATED; one observation on the economy figure of a flagged fill

**Numbering:** our §27 – §31 (renumbered by you) are intact — thank you for the merge; we diffed your 14:45 copy against our snapshot first (nothing of ours dropped, contract 319 → 324 operations: +5 new, 0 removed, only `GET` / `PUT /fleet/settings` changed, `x-quirks` only). The frontend continues from **§34**. Nothing here changes an existing endpoint, field or event. The `{id}` glitch in our §30.2 is fixed (a Python `id` had slipped into the text — sorry).

### 33.1 U1 `unit_system` — verified against the real backend (owner approved a temporary switch)
`GET /fleet/settings` returns `unit_system: "metric"` for the owner's company; the frontend's Units control is now live (it appears because the field exists). Through the Fleet settings page itself we saved **`us`**, then **`uk`**, then back to **`metric`** — every `PUT` carried only `{ unit_system, expected_updated_at }` (nothing else re-sent, each accepted with the current stamp). Checked on the Fuel & efficiency page against the real report: **US** — 1,177 L → 311 gal, 6.66 km/L → 15.67 mpg, 1.47 / L → 5.55 / gal, 5.94 / km → 9.56 / mi, the flag text "34.3 gal filled, the tank holds 26 gal", odometer "6,835 mi after 7,332 mi"; **UK** — litres stay litres, 6.66 km/L → 18.81 imperial mpg, distance in mi. **Restored:** the company is back on `metric` and every other setting equals the value read before (checked field by field). One side effect you already know: the row's `updated_at` / "last saved" moved (06:24:54Z → 10:04:01Z) — a UI save cannot restore a stamp. **Not re-clicked this round:** the older converted screens (trips, vehicles, yards, records, map) under `us` / `uk` against the real field — they were verified earlier with a simulated field; a real-field pass over them is still on our list.

### 33.2 B6 — integrated (Analytics → Fuel & efficiency, one call to `GET /fleet/analytics/fuel`)
| Your field | Frontend use |
|---|---|
| `summary` (+ `previous`, `delta_pct`, `samples`) | six tiles: Fuel economy (target from Fleet settings, "based on N intervals"), Fuel cost, Fuel bought, Average price per unit, Fuel cost per distance, Fill-ups ("N to check"); a metric with nothing to measure is "—", a 0 total with `samples.priced_fills` 0 is "—" (never "free fuel") |
| `series` | economy trend + target line, price trend, litres per period, cost per period — four separate charts (no dual axis); a period with no closed interval / no priced fill is left blank; interval widens day → week → month so we never exceed your 92 buckets |
| `by_vehicle_category` / `by_vendor` | ranked bars "Efficiency by vehicle category" (economy, best first, "—" when none) and "Spend by vendor" (`vendor: null` → "No vendor recorded", `other_count` → "Other vendors") |
| `anomalies` | "Fill-ups worth a second look": one plain sentence per flag in the company's units, worded as **"check", never as a verdict** (your §25.3 wording), row → the vehicle's Fuel tab; footer when `total` > shown |
| `table` (+ `anomaly=1`, `is_full_tank`, `search`, `sort_by`, export) | server-paged fills table with an Economy column and a Check column; chips All / Full tank / Partial / To check (N); CSV = your export with the same filters (checked: filename, columns, search applied); the tables narrow only the table, the charts keep their totals |
Everything is converted for display only (the API stays metric). Compare is back on this page (`previous_period`); `previous_year` is still not exposed (§33.5).

### 33.3 B7 — integrated (Analytics → Maintenance now has three views)
- **Service history** (`?view=history`): six tiles from `GET /fleet/analytics/maintenance` (Maintenance cost, Services logged, Average cost, Cost per distance, Vehicles serviced — all with the previous period — and "In the workshop now" = `fleet.vehicles_in_maintenance_now` with the note that downtime days need a status history); charts: cost per period, services per period, cost by service type, by vehicle category, costliest vehicles (click → the vehicle's Maintenance tab); below them the C2 service log table (unchanged). The Compare switch is back for this view.
- **Schedules** (`data.schedules`): a new "When services fall due" bar (`by_due_window`: overdue / 0–7 / 8–30 / later / not computable) with `overdue_pct`, next to the existing C1 tiles + table; only the point-in-time blocks are read (a one-day window keeps the call cheap).
- **Compliance** (new, `GET /fleet/analytics/compliance`, point-in-time — no range, no compare): five tiles (compliance rate, expired, expiring soon, records, no expiry date), a donut of the six classes (a legend row is also the table filter), documents-vs-licences bars, "What expires next" (`upcoming`, horizon chips 30 d / 90 d / 6 mo / 1 y → `horizon_days` + `interval` `week` / `month`), "By document type", and the paged records table (kind + status chips from `meta.table_counts`, sort, search, CSV via your export; a row opens the owner's Compliance tab — a licence opens its driver).
- **Downtime days:** the owner chose **not** to ask for a vehicle status history for now — we show the count of vehicles in maintenance now and a note. No change asked of you.

### 33.4 Verified (real data, company 2, + throwaway rows)
**Real data** (Aug 27 – Sep 25): 12 fills / 592 L, economy 7.01 km/L over 10 intervals, no costs, no vendors, no anomalies; 2 services / 150; 47 compliance records (12 expired, 11 expiring in 8–30 days, compliance rate 64.7 %) — every tile, chart total and table total equals your response; the honest empty states ("No fill-up has a cost", "Not enough full fill-ups", "Nothing to check") were reviewed on it. **Throwaway rows** (two ZZ vehicles with tank capacities, 9 fills with costs / vendors / a fill above capacity / an odometer going backwards / economy drops; 8 services with 7 costs): flags, ranks, shares, sums (857.3 fuel cost, 5,860 maintenance cost incl. the real 150) reconcile; **all throwaway rows were deleted and the counts are back to 12 fills and 2 services**. Also exercised through the real UI: status / kind / anomaly chips, donut → table filter, sorts, search, both CSV exports, row clicks, horizon switch (`horizon_days=365` → `interval=month`), dark + light, widths 2560 / 1920 / 1280 / 820 (no page overflow; tables scroll inside their own wrapper at 820), console clean. **Unchanged screens re-tested:** Overview, Trips & delivery, Utilisation, Fleet settings, the vehicle Fuel tab opened from a row. **Not verified:** keyboard / screen-reader pass; `compare=previous_period` with real earlier data (the real data has none — every delta chip read "No earlier data to compare"); a real anomaly (only seeded); the Compliance page with a vehicle document other than the single real one.

### 33.5 QUESTION FOR YOU — please answer explicitly (the owner asked us to make sure): the economy figure of a fill flagged `odometer_backwards`
On my throwaway vehicle (full-tank fills, odometer 10 000 → 10 500 → 11 050 → 11 250 → 11 800, then a fill dated later at **11 000** — flagged `odometer_backwards`), the flagged fill carried **`economy_km_per_l` 12.5** in the table (= 500 km ÷ 40 L). That is the distance from an older fill (10 500) divided only by the litres of that one fill, although about 245 L were put in since — so the number looks like an interval that skips over the fills in between. If a fill whose odometer went backwards should close no interval (economy `null`), that would keep bad readings out of the trend; if it is by design, the label "check" already covers it. Reproducible from the values above; the rows are deleted, we can recreate them on request. **Please reply with one of: (a) by design — and the exact rule, so we can word the definition popover; (b) a bug — a fill with a backwards odometer should close no interval (`economy_km_per_l` `null`, not in `samples.economy_intervals`, not in the summary average / series). Also logged in `communication/findings.md` (status OPEN).**

### 33.6 Still open
**On your side:** nothing is waiting on us and no finding of yours is open. Not built yet (the owner picks): B8 drivers scorecard + `GET /incidents/summary` (the "Drivers & safety" page), D1 / B4 telemetry, the ledger (E), saved views (F2), scheduled exports (F3). **On our side (frontend):** the scope filter bar and the extra filters (vehicle category, cost centre, vehicle, yard — on the analytics pages), `compare=previous_year`, an interval chooser, Drivers & safety after B8, the Ledger, a real-field pass over the older unit screens, keyboard / screen-reader pass. **A hard-coded `$` in two older Fleet screens (vehicle Maintenance / Fuel record lines) ignores the company currency — ours, being raised with the owner (an existing screen, so we ask first).**

*(A copy of this folder is owed to backend — it now contains §33.)*

*Addendum (2026-09-25 15:22 PKT, frontend): the frontend now formats the cost on the vehicle Maintenance / Fuel record lines with the company currency instead of a hard-coded `$` (owner approved; frontend-only). Nothing else changed in this section.*

## 34. Frontend status + ASKS (2026-09-25 15:36 PKT, frontend) — the scope filter bar is BUILT on Trips, Fuel and Maintenance; three ADDITIVE requests to let it offer more; a reminder that §33.5 still needs an explicit answer

**Nothing here changes an existing endpoint, field or event; the three asks are additive.** The frontend continues from **§35**.

### 34.1 What was built (frontend only — it uses filters you already built, §24.2 / §25.2 / §26.2 / §32.3)
A **Scope** row under the date range: applied filters are pills (click to change, × to remove), "Add filter" offers the rest, pickers are searchable (server-side search on `/vehicles/options`, `/yards/options`, `/drivers/options`, all with `include_inactive=1` because the reports count retired / sold vehicles). URL-synced (`?category=Van&vehicle=1,2&yard=5&driver=7`), carried between the reports that honour the same filter, sent on every report request **and** its CSV export, table back to page 1 on change.
| Page | Scope fields offered | Why exactly these |
|---|---|---|
| Trips & delivery (B5) | vehicle category · vehicles · yard · driver (the trip's OWN driver — the semantics you flagged in §24.2) · cost centre* | every widget and the table honour all of them |
| Fuel & efficiency (B6) | vehicle category · vehicles · yard · cost centre* | a fill has no driver |
| Maintenance → Service history (B7 + C2) and Schedules (C1 + B7) | vehicle category · vehicles | `GET /maintenance-logs` and `GET /maintenance-schedules` accept only `vehicle_category` and `vehicle_id` — offering yard / cost centre would leave the tables unfiltered while the charts change, so we do not (ask B below) |
| Maintenance → Compliance | none | company-wide paperwork, no vehicle scope |
| Overview, Utilisation | none yet | they mix endpoints with and without scope (Utilisation's KPIs / trend run on `GET /fleet/dashboard`, which takes none) — see ask C |
\* The cost-centre filter is coded but **hidden until `GET /fleet/options` returns `cost_centres`** (ask A) — nothing is shown that cannot be filled with real values.
**Verified live (real backend, company 2):** vehicle 2 + category Semi-Trailer → Trips 6 (whole fleet 26), Fuel 80 L / 1 fill, Schedules 1 of 2, Service history 1 log of 2 — each equals your response for the same filters; the requests carry `vehicle_id=19,23`, `vehicle_category=…` and the CSV exports carry the same filters; names of vehicles / yard / driver resolve from a bare URL; dark + light; widths 820 / 1920 with five chips (wraps, no overflow); keyboard (arrows, Enter, Esc). **Not verified:** yard / driver scope against trips that actually have them (the real data has none — only that the parameters are sent and accepted), a company with thousands of vehicles in the picker (search is server-side, capped at 50 per page of options), keyboard-only through the whole flow with a screen reader.

### 34.2 Additive asks (proposals — please tell us when built, no urgency ordering beyond A)
- **A. `cost_centres` in `GET /fleet/options`** — the distinct non-empty `vehicle.cost_centre` values in use in the caller's company, collapsed case-insensitively and sorted, exactly like `vehicle_categories` (D-0167). Today the value is free text with no way to list it, so the filter cannot be offered. Additive (one more key in `data`).
- **B. `yard_id` and `cost_centre` on `GET /maintenance-logs` (+ `/export`) and `GET /maintenance-schedules` (+ `/export`)** — same semantics as on the reports (§32.3: `yard_id` = vehicles currently checked in there). Optional new parameters; unchanged when absent. Then the Maintenance page can offer yard and cost centre like Trips and Fuel. (The company-wide `GET /fuel-logs` could get the same for consistency; our Fuel page no longer uses it.)
- **C. A question, not a request:** will the future utilisation report **B4** carry the same scope filters? We would rebuild the Utilisation page on it (its KPIs and trend then respect scope). If B4 is far away, the alternative is scope on `GET /fleet/dashboard` / its trends — we prefer B4 over touching an endpoint the legacy hub still reads.

### 34.3 Also FYI (frontend-only)
The frontend now formats the cost on the vehicle Maintenance / Fuel record lines with the company currency (it printed a hard-coded `$`); two UI libraries were added to our `package.json` (Radix Popover, cmdk) — nothing on your side.

### 34.4 REMINDER — §33.5 / `communication/findings.md` (status OPEN): the economy figure of a fill flagged `odometer_backwards`
The owner asked us to make sure this one is answered **specifically**: is `economy_km_per_l` on a fill whose odometer went backwards by design, or should such a fill close no interval? Repro values are in §33.5 and in the findings row.

### 34.5 Addendum (2026-09-25 15:48 PKT, frontend) — `compare=previous_year` and the group-by chooser are USED now; the older unit screens were re-verified on the real `unit_system`
- **`compare=previous_year` and `interval`** (your §32.3 list) are now in the shared filter bar: "Compare" offers *Prior period* or *Last year* (URL `cmp=year`), and Trips, Fuel and Service history offer *Group by* Auto / Day / Week / Month — only the intervals that stay within your 92-bucket cap are shown (so a 984-day range offers Month only). The Overview's summary call sends `compare=previous_year`; the dashboard-based widgets (Overview, Utilisation) get the same window by dates (the same dates one year earlier). Defaults are unchanged. Verified: the requests carry `compare=previous_year` and `interval=week|month`; the real data has nothing from a year ago, so every delta chip reads "No earlier data to compare" — **a populated year-over-year comparison is NOT verified**.
- **Real-field unit pass over the OLDER converted screens** (the owner allowed a second temporary switch; saved `us`, read, restored `metric` — the PUTs carried only `unit_system` + `expected_updated_at`; every other setting equals its earlier value, `updated_at` moved again): vehicle detail (52.5 ft length, 277 mi, 15.1 mph), fuel tab (621 mi odometer, the add-fill form defaults to gallons), edit form labels (odometer mi, tank gallons, width / height ft, weights lb, length 52.49 ft for 16 m), fuel-log edit form (odometer 621.37 mi = 1,000 km), trip detail (50 km → 31.1 mi, 62.652 km → 38.9 mi), New Trip placeholders (mi), geofence and yard radii in feet (150 m → 492 ft), map marker popup ("Speed: 7 mph"). **Not re-verified on the real field:** `uk` beyond the Fuel page, yard create / slot editor forms, alarm-rule thresholds (not converted on purpose).

*(A copy of this folder is owed to backend — it now contains §33, §34 and §35.)*

## 35. Frontend status index (2026-09-25 17:36 PKT, frontend) — the current state of EVERY row of this flow from the frontend's side; supersedes §31

**Purpose:** end-of-day hand-over, the counterpart of backend §14 / §32 and of our §31. **Nothing here changes an existing endpoint, field or event.** The frontend continues from **§36**. Where we caught up: **everything backend built through slice 7 (B7) plus U1 `unit_system` (contract 324 operations, backend stamp `2026-09-25 14:45 PKT`) is integrated (table below) or listed as not used yet.**

### 35.1 Row by row
| Row | Backend | Frontend | Where / notes |
|---|---|---|---|
| A1–A7 definition fixes, A9 realtime | BUILT | **DONE** | the Overview reads them; `fleet:status_summary` listener in place |
| A8 vehicle-performance at scale | BUILT | **DONE** | Utilisation table (server page / sort / search / CSV) and Overview "Top vehicles" |
| B0 common contract | BUILT | **DONE** | `from` / `to` / `interval` (Auto / Day / Week / Month, only within the 92-bucket cap), **`compare` = `previous_period` or `previous_year`** (filter bar switch *Prior period | Last year*), scope filters — on **Trips, Fuel, Maintenance** (see §34.1; Overview and Utilisation are not scoped: ask C) |
| B1 summary KPIs | BUILT | **DONE** | six Overview tiles; `compare=previous_year` supported |
| B2 attention feed / B3 status summary / B9 yards + geofences | BUILT | **DONE** | Overview widgets; `by_category`, yard `series`, `busiest_bucket`, attention `type` / `yard_days` / `action` unused |
| B4 utilisation report | NOT BUILT (needs D1) | **WAITING** | Utilisation stays trip-based; ask C in §34.2 (scope on B4) |
| B5 trips report | BUILT | **DONE** | Trips & delivery (+ scope, compare year, group by) |
| **B6 fuel report** | BUILT (§25) | **DONE** | Fuel & efficiency: six tiles, four trend charts, by category / vendor, flags worded as *check*, paged fills table + CSV (§33.2) |
| **B7 maintenance + compliance** | BUILT (§26) | **DONE (downtime days not asked)** | Maintenance → Service history / Schedules / **Compliance** (§33.3) |
| B8 drivers + incidents summary | NOT BUILT | **WAITING** | the "Drivers & safety" page is not started |
| C1–C4 lists / counts | BUILT | **DONE** | Schedules, Service history (C2 log), fuel list superseded by the B6 table, compliance counts; the extra C2 / C3 filters are deliberately unused (search covers them) |
| D1–D4 telemetry rollups | NOT BUILT (owner decisions) | **WAITING** | nothing built |
| E1–E4 ledger / revenue / receivables | NOT BUILT (owner decisions) | **WAITING** | no Ledger segment; billing / CRM (25 ops) unused |
| F1 fleet settings | BUILT | **DONE** | Fleet settings page; the owner decided to save the real company timezone (`Asia/Karachi`) — **being done on the settings page after the pending browser checks** (a normal `PUT` with `expected_updated_at`) |
| F2 saved views · F3 scheduled exports | NOT BUILT | **WAITING** | per-report CSV exports used everywhere they exist |
| **U1 `unit_system`** | BUILT (§32) | **DONE, verified on the real field** | `us`, `uk`, `metric` all exercised (Fuel page; older screens under `us`); `uk` on the older screens still to re-check |

### 35.2 Frontend-only work since §31 (FYI)
Scope filter bar (Radix Popover + cmdk), compare-year + group-by, an accessibility pass with axe-core (muted-text contrast scoped to the analytics pages, no nested buttons, chart canvases), the company currency on the vehicle Maintenance / Fuel record lines. The old `/fleet-management/legacy` hub is **kept** (owner, today) — **please keep the `fleet_status.unknown` alias**.

### 35.3 Still open — on your side
Asks **A** (`cost_centres` in `GET /fleet/options`), **B** (`yard_id` + `cost_centre` on `GET /maintenance-logs` and `GET /maintenance-schedules`), **C** (will B4 carry the scope filters?) — §34.2; **the economy question — §33.5 and `communication/findings.md` (OPEN): is `economy_km_per_l` on a fill flagged `odometer_backwards` by design?**; the reports B8 / B4, the ledger, saved views, scheduled exports (the owner picks the order; we suggest B8 next).

### 35.4 Still open — on the frontend
Verification not yet done: accessibility (axe) on Overview / Utilisation / Compliance / Settings in light and dark; a screen-reader run; a populated year-over-year comparison (the real data has nothing a year old); `uk` on the older screens and the yard-create / slot-editor forms under a non-metric unit; yard / driver scope on trips that have them; the scope picker with thousands of vehicles. Build: Drivers & safety after B8, scope for Overview / Utilisation after ask C, the Ledger after E, saved views after F2. **Our own housekeeping** (ZZ test-data cleanup, list polish) stays parked until the enterprise / IoT work is finished.

### 35.5 How we work (so a fresh session on either side keeps the rules)
Standing owner rules apply to both sides: **never break what already works** (ask the owner first, then tell the other side; additive / opt-in is fine) and **UI quality is non-negotiable**. Before the owner pastes our folder to you we tag and copy it (the latest tags `sync-frontend-20260925-1519` and `…-1537-scope`; a new one is taken right before the next paste); after a paste we diff against the tag, verify our renumbered sections, restore anything of ours a copy predates, and continue numbering after the highest number either side used; we never reformat `api_contract/`.

*(A copy of this folder is owed to backend — it now contains §33, §34 and §35.)*
