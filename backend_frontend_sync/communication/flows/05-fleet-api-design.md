# Fleet Management — backend API design & build status

**Written:** 2026-09-24 · **By:** backend · **Answers:** frontend `04-fleet-management.md` §12.9 (endpoint names + shapes, socket payloads, 422 strings).
**Decisions behind this:** the owner's D1–D9 (04 §12) + backend's four follow-up recommendations, all approved 2026-09-24 ("go with all your recommended things") — see §0.

> **How to read this file.** Every endpoint/event has a status: **DESIGNED** = shape agreed here, not built, don't call it yet ·
> **BUILT** = live-verified on the running backend and present in `api_contract/openapi/*.yaml` (the contract is the final word
> on exact fields — if it disagrees with this file, the contract wins and this file gets fixed). Backend updates the status
> column and the "Last synced" line as each step ships, then the owner copies the folder over. **Build order = the step numbers.**

## 0. Decisions confirmed by the owner (2026-09-24) — beyond frontend §12

| Question | Decision |
|---|---|
| What is "destination reached"? | **Either** the trip's **last planned stop becomes `arrived`**, **or** the vehicle comes **within 200 m of the trip's destination coordinates** (covers a destination that is a yard *and* an unregistered customer address). Whichever happens first sets `destination_reached_at` once and emits `trip:update` with `awaiting_completion: true`. A trip with neither stops nor destination coordinates never prompts. The operator confirms with the existing `POST /trips/{id}/complete`. |
| Label matching after roles exist? | Backend **backfills roles once** from today's unambiguous labels (Latitude/Lat, Longitude/Lng/Lon, Speed, Heading/Course/Bearing), then ingestion is **role-only** — the label is no longer read, so "clear role" really turns tracking off. Existing products keep tracking through the backfill. (Templates: not now.) |
| Yard-linked geofence centre | Edited **through the yard**: `PUT /yards/{id}` with new `latitude`/`longitude` moves its geofence; `radius_m` can be changed from the yard **or** the geofence. `PUT /geofences/{id}` with a centre on a yard-linked geofence → 422 (§9). Manual geofences (no yard) can have their centre edited directly. |
| Yard radius | `radius_m` on "Add yard", **default 100 m**, min 10. Existing yards with coordinates and no linked geofence are backfilled with 100 m. |
| Deactivate | vehicle → `lifecycle_status: "retired"` (reactivate → `"active"`); driver → `status: "inactive"` (reactivate → `"active"`); yard → new `is_active` flag. Deactivated items are **left out of assign/dropdown lists**; lists accept `?include_inactive=1`. |
| Manual stop marking | Allowed on `in_progress` **and** `completed` trips (late corrections). Time can't be in the future or before the trip started; a departure needs an arrival; **replacing** an existing time needs a `reason`. Originals are kept forever in an audit log (`events[]` on each stop, §5). |
| Second driver on a vehicle | Blocked (§9). Existing double-driver data is not touched — only new assignments are checked. |

## 1. Conventions

- Envelope (unchanged): `{ "success": true, "message": "…", "data": … }`; errors `{ "success": false, "message": "…", "errors"?: { field: ["…"] } }`. **Business-rule 422s use a fixed `message` — show it verbatim** (all listed in §9).
- Auth + permission: same as every other fleet route (`Authorization: Bearer …`, fleet permission, company-scoped).
- **All datetimes are UTC.** Send ISO 8601 **with offset or `Z`**; responses are ISO `…Z`.
- **IDs keep the type their endpoint already uses** — the fleet CRUD/event responses (vehicles, drivers, yards, geofences, events, yard history) return string ids (`"2"`); position/device-style responses (`/fleet/positions`, history, assignable-trackers) return numbers. New fields follow their endpoint's existing style; treat ids as opaque either way. Every existing response keeps its current fields — new fields are **additive**.

## 2. Step 1 — small fixes + read endpoints (no design risk)

| # | Endpoint | Change | Status |
|---|---|---|---|
| 1.1 | `POST /vehicles/{id}/assign-device` | Non-numeric `device_id` → **422** `"The device id must be an integer."` (was HTTP 500). Numeric ids behave as before. | **BUILT** (live-verified 2026-09-24) |
| 1.2 | `GET /geofences/events` | Each event gains `geofence: { id, name, yard_id }` (null-safe). `trip_id` arrives in step 5. | **BUILT** (live-verified 2026-09-24) |
| 1.3 | `GET /drivers/{id}` | `current_assignment.vehicle` gains `current_device_assignment: { id, vehicle_id, device_id, assigned_at, unassigned_at, device: { id, name } } \| null`. | **BUILT** (live-verified 2026-09-24) |
| 1.4 | Maintenance schedules — `GET /vehicles/{id}` (`data.maintenance_schedules[]`) **and** `POST /vehicles/{id}/maintenance-schedules` | Each schedule gains `next_service_date` (`last_service_date + interval_days`, same format as `last_service_date`) and `is_overdue_by_date` (boolean; `null` when there is no day interval or no `last_service_date`). A log that carries `maintenance_schedule_id` already resets the schedule. | **BUILT** (live-verified 2026-09-24) |
| 1.5 | `GET /vehicles/{id}` | `data.yard_history[]` is real: last 20 yard check-in/outs, newest first: `{ id, yard_slot_id, vehicle_id, checked_in_at, checked_out_at, source, slot: { id, yard_id, slot_number, yard: { id, name } } }`. `checked_out_at: null` = still inside → your Check-out button works. | **BUILT** (live-verified 2026-09-24) |
| 1.6 | `GET /fleet/devices/{deviceId}/history?limit=500` | **New.** `limit` 1–2000, default 500. `data`: `[{ id, device_id, latitude, longitude, speed, heading, recorded_at }]` **oldest → newest**. 404 `"Device not found."` if not in the caller's company. | **BUILT** (live-verified 2026-09-24) |
| 1.7 | `GET /fleet/positions` | **Assigned-only by default** (tracker currently installed in a vehicle). `?include_unassigned=1` returns everything as today. Shape unchanged. | **BUILT** (live-verified 2026-09-24) |
| 1.8 | `GET /vehicles/assignable-trackers?search=&only_with_position=0` | **New** — your tracker dropdown. Devices **not installed in any vehicle**, in the caller's company. `data`: `[{ id, name, device_unique_identifier, status, has_position, product: { id, name } }]`. `has_position` = the device has ever reported a GPS position; `only_with_position=1` filters to those. `search` matches name / DevEUI. Send `id` as `device_id` to `assign-device`. | **BUILT** (live-verified 2026-09-24) |

## 3. Step 2 — rule changes (D6)

| # | Endpoint | Change | Status |
|---|---|---|---|
| 2.1 | `POST /drivers/{id}/assign-vehicle` | 422 if the vehicle already has an active driver (§9). Unassign first. | **BUILT** (live-verified 2026-09-24) |
| 2.2 | `POST /yard-slots/{slotId}/check-in` | 422 if the vehicle is already checked in anywhere (§9). | **BUILT** (live-verified 2026-09-24) |
| 2.3 | `POST /trips` | **No longer** rejects a vehicle that has a trip in progress → several `planned` trips per vehicle are allowed. `POST /trips/{id}/start` still 422s `"This vehicle already has a trip in progress. Complete or cancel it first."` | **BUILT** (live-verified 2026-09-24) |

## 4. Step 3 — GPS attribute role (D1)

| # | Endpoint | Shape | Status |
|---|---|---|---|
| 3.1 | `POST /attribute/preference/mark-role` | Body `{ "product_id": 118, "attribute_key": "object.latitude", "role": "latitude" }`, `role` ∈ `latitude \| longitude \| speed \| heading`. `200 { success, message, data: { product_id, attribute_key, attribute_role, replaced_attribute_key } }`. **One attribute per role per product:** choosing a role that another attribute already holds **moves** it (that one is cleared, its key comes back as `replaced_attribute_key`, else `null`). No unit / label / alert needed. | **BUILT** (live-verified 2026-09-24) |
| 3.2 | `POST /attribute/preference/unmark-role` | Body `{ "product_id": 118, "attribute_key": "object.latitude" }` → `200 { success, message }`. | **BUILT** (live-verified 2026-09-24) |
| 3.3 | `GET /product-settings/{id}` | Each `user_preference_attributes[]` item gains `attribute_role: "latitude" \| "longitude" \| "speed" \| "heading" \| null` → render the badge from it. | **BUILT** (live-verified 2026-09-24) |
| 3.4 | Ingestion | Reads roles only (see §0). A position is stored only when **both** latitude and longitude roles are set and numeric in the packet; speed/heading optional. A role and "unique identifier" are mutually exclusive (§9). | **BUILT** (live-verified 2026-09-24) |

**As built (step 3) — things the frontend should know:**
- `mark-role` also sets the attribute `is_selected: true` and creates its preference row if the attribute was never configured; the row needs **no** label, unit, rule or widget. `unmark-role` clears the role; a row that only existed to carry the role (no settings) is removed, an attribute that also has settings stays (just without a role).
- Errors: `404 "Product not found."` (product outside the caller's company), `404 "No location role found for this attribute."` (unmark with nothing to clear), `422` field error for an unknown `role` (`errors.role`), and the two exclusion messages in §9.
- **Existing products were backfilled once** from their labels (Latitude/Lat, Longitude/Lng/Lon, Speed, Heading/Course/Bearing) — product 118 now reports `attribute_role` `latitude` / `longitude` / `speed` in `GET /product-settings/118`. Ambiguous cases (two attributes with the same role-label) were left unset.
- **Detection is role-only from now on** — proven live: with the latitude role cleared, a packet stores **no** position even though the attribute's label still says "Latitude"; re-marking it resumes tracking. `attribute_role` is `null` on every attribute without a role (including the unique identifier).

## 5. Step 4 — manual stops + the trip route

| # | Endpoint | Shape | Status |
|---|---|---|---|
| 4.1 | `POST /trips/{id}/stops/{stopId}/arrive` | Body `{ "occurred_at": "2026-09-24T10:30:00+05:00" (optional, default now), "reason": "GPS was offline" (optional) }`. `reason` is **required when the stop already has an `actual_arrival_at`** (replacing sensor or earlier manual time). Sets `status: "arrived"`, `actual_arrival_at`, `actual_source: "manual"`. `200 { success, message, data: { stop, trip: { id, status, awaiting_completion } } }`. | **BUILT** (live-verified 2026-09-24) |
| 4.2 | `POST /trips/{id}/stops/{stopId}/depart` | Same body. Needs an arrival first. Sets `status: "departed"`, `actual_departure_at`, `dwell_time_minutes`. `reason` required if it already has a departure. | **BUILT** (live-verified 2026-09-24) |
| 4.3 | `GET /trips/{id}/route` | **The one map/trip response.** Works for any status (a `planned` trip just has no trail). Shape below. | **BUILT** (live-verified 2026-09-24) |
| 4.4 | Stop object (used in `route`, `GET /trips/{id}`, arrive/depart, `trip:update`) | Existing fields (`id, trip_id, yard_id, sequence, stop_purpose, planned_arrival_at, planned_departure_at, actual_arrival_at, actual_departure_at, dwell_time_minutes, actual_source, status, notes, yard`) **plus** `events[]`: the immutable audit log, oldest first — `{ id, event_type: "arrive" \| "depart", occurred_at, source: "geofence_auto" \| "manual" \| "driver_reported", reason, recorded_by: { id, first_name, last_name } \| null, created_at }`. The **original sensor time stays visible** there even after a manual override; the top-level `actual_*` fields always hold the *effective* value. Also new: `yard.latitude/longitude` always present. | **BUILT** (live-verified 2026-09-24) |

**As built (step 4) — things the frontend should know:**
- `stopId` is the stop's own id (`planned_yards[].id`), not the yard id; a stop that isn't on that trip → `404 "Stop not found."`, unknown trip → `404 "Trip not found."`. Both endpoints are **not idempotent by design**: posting an arrival for a stop that already has one is a *replacement* and needs `reason` (a blank/whitespace reason counts as missing → 422 with `errors.reason` as well as the fixed `message`).
- `occurred_at` accepts anything ISO 8601 with an offset or `Z`; it is rounded to whole seconds and may be at most ~60 s ahead of the server clock (client clock skew). Omit it for "now".
- **One rule beyond §9's original list:** an arrival can't be corrected to *after* an existing departure → `422 "The arrival can't be after the departure."` Correcting the arrival of an already-departed stop keeps it `departed` and recomputes `dwell_time_minutes`.
- Each `arrive`/`depart` **appends** an `events[]` entry and never edits one — so after an override the list shows *both* the original (e.g. `source: "geofence_auto"` once step 5 lands, or the earlier manual time) and the new one with its `reason` and `recorded_by`; the stop's top-level `actual_*`/`actual_source` are the effective values (`actual_source` becomes `"manual"`).
- `events[]` is now on every stop object: `GET /trips/{id}` (`data.planned_yards[]`), the `POST /trips` response, arrive/depart and `route`. `GET /trips/{id}` also gains `destination_reached_at` and `awaiting_completion` (set by step 5's destination logic — see §6).
- Success `message`s: `"Stop arrival recorded successfully."` / `"Stop departure recorded successfully."`; `data.trip.id` is a string like every `/trips` response.
- **`route` ids are strings** (like the rest of `/trips`), not numbers as the example below shows; `vehicle.plate` may be `null`. `current_position` is the newest position at or before the trip's end (so a finished trip shows where it ended), `null` if the trip never started or has no tracker. A trail over 5 000 points is **thinned evenly** (first and last kept) — `total_points` and `computed_distance_km` always describe the full trail.

`GET /trips/{id}/route` → `data`:

```json
{
  "trip": { "id": 12, "trip_reference": "TRP-00012", "status": "in_progress", "purpose": "delivery",
            "planned_start_at": "…Z", "planned_end_at": "…Z", "actual_start_at": "…Z", "actual_end_at": null,
            "planned_distance_km": 380, "actual_distance_km": null,
            "destination_reached_at": null, "awaiting_completion": false },
  "vehicle": { "id": 2, "name": "Truck A", "vehicle_category": "truck", "plate": null },
  "driver": { "id": 3, "first_name": "Alex", "last_name": "Khan" },
  "origin": { "address": "Lahore Depot", "latitude": 31.5204, "longitude": 74.3587 },
  "destination": { "address": "Islamabad Distribution Center", "latitude": 33.6844, "longitude": 73.0479 },
  "stops": [ { "…stop object (4.4), ordered by sequence…": "" } ],
  "trail": { "device_id": 146, "total_points": 42, "computed_distance_km": 12.345,
             "positions": [ { "latitude": 31.5, "longitude": 74.3, "speed": 40.2, "heading": 90, "recorded_at": "…Z" } ] },
  "current_position": { "latitude": 31.5, "longitude": 74.3, "speed": 40.2, "heading": 90, "recorded_at": "…Z" }
}
```

`trail.positions` are since `actual_start_at` (up to `actual_end_at`), oldest → newest, capped at 5 000 points; `trail`/`current_position` are `null` when the trip never started or has no tracker. Yards + geofences for the map still come from `GET /yards` and `GET /geofences`. **ETA is out of scope.**

## 6. Step 5 — sensor → trip bridge (no new endpoint; changes what existing data does)

| # | Behaviour | Status |
|---|---|---|
| 5.1 | When a tracker installed in a vehicle enters a geofence **linked to a yard** that is a planned stop of that vehicle's `in_progress` trip: the first not-yet-arrived stop for that yard (by `sequence`) becomes `arrived` (`actual_arrival_at`, `actual_source: "geofence_auto"`); on exit it becomes `departed` with `dwell_time_minutes`. The sensor **only fills** empty values — it never overwrites a manual or earlier sensor time. | **BUILT** (live-verified 2026-09-24) |
| 5.2 | `GET /geofences/events` and the `geofence:event` socket event carry `trip_id` (null when no trip was in progress). | **BUILT** (live-verified 2026-09-24) |
| 5.3 | If a trip **starts** while the vehicle is already inside a stop's geofence, that stop is marked `arrived` at the start time. | **BUILT** (live-verified 2026-09-24) |
| 5.4 | **Destination reached** (§0) sets `trips.destination_reached_at` once and emits `trip:update` `reason: "destination_reached"`, `awaiting_completion: true`. The trip stays `in_progress` until the operator calls `POST /trips/{id}/complete`. `GET /trips/{id}` and `route` expose `destination_reached_at` + `awaiting_completion`. | **BUILT** (live-verified 2026-09-24) |
| 5.5 | `POST /trips/{id}/complete` sets any still-`planned` stops to `missed` (cancel leaves them `planned`). When `odometer_end_km` is given, the vehicle's `odometer_km` is updated to it. | **BUILT** (live-verified 2026-09-24) |

**As built (step 5) — things the frontend should know:**
- **No new endpoint; existing data starts moving.** A stop's `status` / `actual_arrival_at` / `actual_departure_at` / `dwell_time_minutes` / `actual_source: "geofence_auto"` now change on their own while the trip is `in_progress`, and every such change appears in the stop's `events[]` (`source: "geofence_auto"`, `recorded_by: null`). The frontend should **refetch the trip/route** (poll or on focus until step 6's sockets exist).
- A stop can only be filled by the sensor if its yard has a **geofence linked to it** (`yard_id` on the geofence). A yard without a linked geofence is never detected (step 7 will auto-create one from the yard's radius).
- **Same yard twice in one trip:** the first visit fills the first `planned` stop of that yard, the second visit the next one (by `sequence`).
- **The sensor only fills:** it never overwrites a time an operator entered (or an earlier sensor time). If the operator marks a stop first, the sensor's later exit still fills the *departure* if it is empty.
- **Boundary jitter is not debounced** — a vehicle hovering at the edge of a geofence can produce an early `departed`; the operator can correct it with a reason (the sensor time stays in `events[]`).
- `GET /geofences/events` items carry `trip_id` (string, or `null` when no trip was in progress; always `null` for events recorded before this step).
- **Destination reached** sets `destination_reached_at` **once** (never cleared) when the **last stop** (highest `sequence`) becomes `arrived` — by sensor, by the trip-start seed, **or by an operator's manual arrive** — or when the vehicle is within **200 m** of the trip's `destination_latitude/longitude` on any position packet. `GET /trips/{id}` and `route` then show `awaiting_completion: true` → prompt the operator to confirm with `POST /trips/{id}/complete` (the backend never completes on its own). Until step 6 there is no push for this.
- **Trip start seed:** starting a trip while the vehicle is already inside a stop's geofence marks that stop `arrived` immediately (start time, `geofence_auto`) — and if it is the last stop the destination counts as reached.
- **Completing** a trip marks stops that never got an arrival `missed` (cancelling leaves them `planned`); when `odometer_end_km` is sent the vehicle's `odometer_km` becomes that value.
- Concurrent packets can no longer double-write an `enter` (event writes are serialised per geofence+vehicle).

## 7. Step 6 — realtime (Socket.IO)

Room: the server puts every socket with the fleet permission into `company:{companyId}` **at handshake, from the verified JWT** — nothing to subscribe to, nothing to send. Same connection/`auth: { token }` as today. Payloads are camelCase like the other socket events.

| Event | Payload | Status |
|---|---|---|
| `fleet:position` | `{ vehicleId, deviceId, latitude, longitude, speed, heading, recordedAt, tripId }` — only trackers **currently installed in a vehicle** are broadcast (so `vehicleId` is always set); `tripId` is `null` when the vehicle has no trip in progress. | **BUILT** (live-verified 2026-09-24) |
| `geofence:event` | `{ id, geofenceId, geofenceName, yardId, vehicleId, vehicleName, eventType: "enter" \| "exit", occurredAt, tripId }` | **BUILT** (live-verified 2026-09-24) |
| `trip:update` | `{ tripId, reason, status, awaitingCompletion, destinationReachedAt, stop, occurredAt }` — `reason` ∈ `started \| stop_arrived \| stop_departed \| stop_updated \| destination_reached \| completed \| cancelled`; `stop` is the full stop object (4.4) for stop reasons, else `null`. **`awaitingCompletion: true` + `reason: "destination_reached"` is the "prompt the operator to confirm completion" signal.** | **BUILT** (live-verified 2026-09-24) |

Frontend plan in 04 §12.4 (refetch on reconnect/focus + slow safety poll) stands.

**As built (step 6) — things the frontend should know:**
- **Room:** joined automatically at connect when your JWT has a company and the fleet permission (`all-fleet`). A user without the permission, or of another company, receives none of these three events. The room is decided at handshake — after a permission change, reconnect with a fresh token. Full text: `api_contract/API_CONTRACT.md` §4.6.
- **`fleet:position`:** one per GPS position of a tracker installed in a vehicle (frequent — move the marker, don't refetch). `recordedAt` is the server's ingestion time. `speed`/`heading` are `null` if the packet had none.
- **`geofence:event`:** one per **real** enter/exit — independent of the geofence's `alert_on` (which only filters `GET /geofences/events`). `id` is the same id `GET /geofences/events` returns.
- **`trip:update`:** `reason` order you will see for one trip: `started` → (seeded/sensor/manual) `stop_arrived` / `stop_departed` → `stop_updated` when an operator replaces an existing time → at the last stop **`stop_arrived` then `destination_reached`** (`awaitingCompletion: true` → show the confirm banner) → `completed` (after `POST /trips/{id}/complete`) or `cancelled`. Arrival by proximity (≤ 200 m of the destination) sends only `destination_reached`. `status`/`awaitingCompletion`/`destinationReachedAt` describe the trip **after** the change; `stop` is the full stop object (with `events[]`) for the three `stop_*` reasons, else `null`. Manual actions by *another* operator arrive as the same events, so your own action also echoes back — de-duplicate by state, don't append.
- **Best-effort:** events are not replayed and a realtime problem never fails the underlying action → refetch on (re)connect/focus and keep the slow safety poll (your 04 §12.4 plan stands).

**Addendum (D-0163, 2026-09-24) — two additions to the events above, BUILT and live-verified (owner said yes to both of your `04` §20 observations):**
- **`trip:update` `reason: "created"` and `"deleted"`.** `created` is sent when a trip is planned (`POST /trips`) — `status: "planned"`, `stop: null`. `deleted` is sent by `DELETE /trips/{id}` (only planned trips can be deleted) — the trip no longer exists, so **remove it from your lists**; `stop: null`. Both go to the whole company room, so your own action echoes back too.
- **New event `fleet:changed`** (same `company:{id}` room / `all-fleet` gate): `{ entity: "vehicle" | "driver" | "yard" | "yard_slot" | "geofence", id: string, action: "created" | "updated" | "deactivated" | "reactivated" | "deleted", occurredAt: ISO }`. It carries **no record data** — it means "refetch that list". Sent after: vehicle/driver create, `PUT`, deactivate, reactivate; **tracker and driver↔vehicle assign/unassign** (`updated` on the affected vehicle and/or driver); yard create / `PUT` / deactivate / reactivate (creating a yard with coordinates also sends `geofence` `created`; editing a yard also sends its linked `geofence` `updated`); yard-slot create/update; geofence create/update/delete. **Not announced:** yard check-in/out, fuel/maintenance/compliance/incident writes, CRM records (tell us if you want them). Your own action echoes back — refetch or de-duplicate, don't append. Contract text: `api_contract/API_CONTRACT.md` §4.2/§4.6.

## 8. Step 7 — CRUD gaps (D7), in the frontend's order

| # | Endpoint | Shape / rules | Status |
|---|---|---|---|
| 7.1 | `PUT /vehicles/{id}` | Any field accepted by `POST /vehicles` (plate, vin, year, fuel_type, tank_capacity_liters, odometer_km, ownership_type, cost_centre, dimensions, weights, acquisition_*) — send only what changed. Returns the vehicle. | **BUILT** (live-verified 2026-09-24) |
| 7.2 | `PUT /drivers/{id}` | Any field accepted by `POST /drivers` (incl. email, phone, hire_date, employment_status, availability_status, certifications, payroll_reference). Returns the driver. | **BUILT** (live-verified 2026-09-24) |
| 7.3 | `POST /vehicles/{id}/deactivate` · `/reactivate` · `POST /drivers/{id}/deactivate` · `/reactivate` · `POST /yards/{id}/deactivate` · `/reactivate` | Deactivate refuses with the 422s in §9 when history/live data would be orphaned. Response `{ success, message, data: <the entity> }`. | **BUILT** (live-verified 2026-09-24) |
| 7.4 | `POST /yards` | Body gains **`radius_m`** (default 100, min 10). Creates the linked geofence when `latitude`+`longitude` are given. Response gains `geofence: { id, radius_m } \| null`. `GET /yards`, `GET /yards/{id}` return `radius_m` + `is_active`. | **BUILT** (live-verified 2026-09-24) |
| 7.5 | `PUT /yards/{id}` | `name`, `address`, `latitude`, `longitude`, `radius_m` — moves/resizes the linked geofence in the same call. | **BUILT** (live-verified 2026-09-24) |
| 7.6 | `PUT /yard-slots/{slotId}` | `slot_number`, `position_x`, `position_y`, `max_length_m`. | **BUILT** (live-verified 2026-09-24) |
| 7.7 | `PUT /geofences/{id}` | Now also accepts `center_latitude` / `center_longitude` — **only for manual geofences** (no `yard_id`); 422 for yard-linked (§9). Unknown fields are ignored as before. | **BUILT** (live-verified 2026-09-24) |
| 7.8 | `DELETE /trips/{id}` | Only while `planned` (§9). Removes its planned stops. `200 { success, message }`. | **BUILT** (live-verified 2026-09-24) |

**As built (step 7) — things the frontend should know:**
- **Lists hide deactivated items by default:** `GET /vehicles` hides `lifecycle_status` `retired` **and `sold`**, `GET /drivers` hides `status: "inactive"` (`suspended` stays; an explicit `?status=` always wins), `GET /yards` hides `is_active: false`. Add **`?include_inactive=1`** (or `true`) to see them. `GET /vehicles/{id}`, `/drivers/{id}`, `/yards/{id}` still return a deactivated item. The vehicle **deactivate response** is the vehicle (`lifecycle_status: "retired"`), the driver's `status: "inactive"`, the yard's `is_active: false`; reactivate → `"active"` / `"active"` / `true`.
- **`PUT /vehicles/{id}` / `PUT /drivers/{id}`:** send only what changed; `null` clears a nullable field; the D-0157 value lists and certification shape are enforced the same way as on create (same 422 messages). `lifecycle_status` / `status` are **not** editable here — use deactivate/reactivate. The response is the same vehicle/driver object `POST` returns.
- **Guards (fixed messages, §9):** vehicle deactivate is refused while a trip is `in_progress` (checked first) or a driver/tracker is still assigned; driver deactivate while still on a vehicle; yard deactivate while a vehicle is checked in. Deliberately **not** guarded: a vehicle with open yard-slot check-ins or planned trips.
- **Yards:** `POST /yards` `radius_m` is used only when the yard has `latitude`+`longitude` — then the **linked geofence is created automatically** (`alert_on: both`, the yard's name) and the response has `geofence: { id, radius_m }`; without coordinates `geofence` is `null`. `PUT /yards/{id}` takes latitude+longitude **together** (422 otherwise), moves/resizes the geofence in the same call and creates it if the yard gains coordinates. Every yard object (`GET /yards`, `GET /yards/{id}`, create, update) has `radius_m` (the radius of its earliest linked geofence, `null` if none) and `is_active`. **A yard created this way is detectable by the sensor→trip bridge immediately** — no manual geofence needed (yards created before this step keep the geofence they already had; yards with coordinates and none got a 100 m one from the migration backfill).
- **`PUT /geofences/{id}`:** `center_latitude` + `center_longitude` (both) for **manual** geofences; a yard-linked geofence answers `422 "This geofence is linked to a yard. Change the yard's location to move it."` — but its `radius_m`, `name`, `alert_on` and `is_active` can still be changed.
- **`DELETE /trips/{id}`:** only `planned` (`422 "Only planned trips can be deleted."`), 404 for another company's trip; its planned stops go with it; no socket event is emitted for a delete — remove it from your list yourself.
- **`currency` on `POST /login` and `GET /profile`:** `user.company.currency` (your optional suggestion, owner approved) — no more `GET /companies/{id}` just for it.

## 9. Fixed 422 messages (`message` field — show verbatim)

| Where | `message` |
|---|---|
| assign-device, non-numeric `device_id` | `The device id must be an integer.` |
| assign driver → vehicle already has an active driver | `This vehicle already has an active driver. Unassign them first.` |
| assign driver → driver already on a vehicle (existing) | `This driver is already assigned to a vehicle.` |
| yard check-in → vehicle already checked in | `This vehicle is already checked in at slot {slot_number} of {yard_name}. Check it out first.` |
| yard check-in → slot occupied (existing) | `This slot already has a vehicle checked in.` |
| trip start → another trip in progress (existing) | `This vehicle already has a trip in progress. Complete or cancel it first.` |
| stop arrive/depart → trip status | `Stops can only be updated while the trip is in progress or after it has completed.` |
| stop arrive/depart → time in the future | `The time can't be in the future.` |
| stop arrive/depart → before trip start | `The time can't be before the trip started.` |
| stop depart → no arrival yet | `Mark the arrival before the departure.` |
| stop depart → earlier than arrival | `The departure can't be before the arrival.` |
| stop arrive/depart → replacing without a reason | `A reason is required to replace an existing arrival time.` / `A reason is required to replace an existing departure time.` |
| stop arrive → later than the existing departure | `The arrival can't be after the departure.` |
| stop not found (404) | `Stop not found.` |
| mark-role / unmark-role → product not in the caller's company (404) | `Product not found.` |
| unmark-role → nothing to clear (404) | `No location role found for this attribute.` |
| mark-role → attribute is the unique identifier | `This attribute is the unique identifier and can't also be a location attribute.` |
| mark-as-unique → attribute has a role | `This attribute is a location attribute and can't also be the unique identifier.` |
| geofence centre edit on a yard-linked geofence | `This geofence is linked to a yard. Change the yard's location to move it.` |
| deactivate vehicle → trip in progress | `This vehicle has a trip in progress. Complete or cancel it first.` |
| deactivate vehicle → driver/tracker still assigned | `Unassign this vehicle's driver and tracker before deactivating it.` |
| deactivate driver → still on a vehicle | `Unassign this driver from their vehicle before deactivating them.` |
| deactivate yard → vehicles checked in | `Check out all vehicles from this yard before deactivating it.` |
| delete trip → not planned | `Only planned trips can be deleted.` |

Field-level validation (`errors: { field: [...] }`) keeps the standard wording.

## 10. Build log (backend updates this as steps ship)

| Step | Scope | State |
|---|---|---|
| 1 | §2 small fixes + read endpoints | **BUILT + live-verified 2026-09-24 16:13 PKT** |
| 2 | §3 rules | **BUILT + live-verified 2026-09-24 16:19 PKT** |
| 3 | §4 GPS role | **BUILT + live-verified 2026-09-24 16:30 PKT** |
| 4 | §5 manual stops + route | **BUILT + live-verified 2026-09-24 17:33 PKT** |
| 5 | §6 sensor → trip bridge | **BUILT + live-verified 2026-09-24 17:56 PKT** |
| 6 | §7 realtime | **BUILT + live-verified 2026-09-24 19:02 PKT** |
| 7 | §8 CRUD | **BUILT + live-verified 2026-09-24 20:54 PKT** |

## 11. Value lists (owner decision D-0157, 2026-09-24) — BUILT, live-verified

Answers frontend `04` §15 ask 1. **Applies to create (`POST /vehicles`, `POST /drivers`); the future `PUT`s (step 7) use the same lists.** No migration; the stored values are plain strings.

| # | Endpoint | Shape | Status |
|---|---|---|---|
| 11.1 | `GET /fleet/options` | `data: { fuel_types: ["diesel","petrol","electric","hybrid","lpg"], ownership_types: ["owned","leased","rented"], employment_statuses: ["full_time","part_time","contractor","terminated"], availability_statuses: ["available","on_trip","on_leave","off_duty"] }` — render dropdown labels yourself (values are the API values). Same fleet permission as the other fleet routes. | **BUILT** (live-verified 2026-09-24) |
| 11.2 | `POST /vehicles` | `fuel_type` / `ownership_type` must be one of the lists (exact lowercase) or `null`/omitted; otherwise **422** with a fixed message (below) and `errors.<field>`. | **BUILT** (live-verified 2026-09-24) |
| 11.3 | `POST /drivers` | `employment_status` / `availability_status` likewise. `certifications`: `null`, `[]` or an array of `{ "name": string (required, ≤255), "issued_date": "YYYY-MM-DD" \| null (optional), "expiry_date": "YYYY-MM-DD" \| null (optional) }` — dates must be real calendar dates, **unknown keys are rejected**. Echoed back exactly as sent. | **BUILT** (live-verified 2026-09-24) |

Fixed 422 messages (show verbatim): `The selected fuel type is invalid.` · `The selected ownership type is invalid.` · `The selected employment status is invalid.` · `The selected availability status is invalid.` · certification date: `The date is not a valid calendar date.` / `The date must use the YYYY-MM-DD format.` (field error at `certifications.0.expiry_date`, …). Other certification field errors (missing `name`, unknown key) use the standard validation wording under `errors["certifications.N.<field>"]`.
Nothing sets `availability_status` automatically (`on_trip` is operator-set).

## 12. Currency, fleet-only alerts, parked hours (owner decisions D-0158 / D-0159 / D-0160, 2026-09-24) — BUILT, live-verified

Answers frontend `04` §15 asks 2, F6 and F10. All additive except the parked-hours definition.

| # | Endpoint | Shape | Status |
|---|---|---|---|
| 12.1 | `GET /companies`, `GET /companies/{id}`, `POST /companies`, `PUT /companies/{id}` | Every company object gains **`currency`** (string, ISO 4217 upper-case, default `"USD"`). `POST`/`PUT` accept an optional `currency` (3 letters, any case → stored upper-case; otherwise **422** `The currency must be a 3-letter ISO 4217 code.`); omitted on `PUT` = unchanged. Your own company is readable with `GET /companies/{your company_id}` (no platform role needed). **Every company currently reads `USD`** — the owner sets the real one (e.g. `PKR`). | **BUILT** (live-verified 2026-09-24) |
| 12.2 | `POST /fleet-customers`, `POST /fleet-customers/{id}/contracts`, `POST /contracts/{id}/rate-cards` | Omitting `currency` now defaults to the **company's** currency (explicit values win; existing rows keep theirs — changing the company currency never rewrites them). | **BUILT** (live-verified 2026-09-24) |
| 12.3 | `GET /fleet/dashboard/alerts?fleet_only=1` | `fleet_only` = `1`/`true` → only alarms whose device is **currently installed in a vehicle** (so `vehicle_id` is never null); `meta.total` follows. Default (absent/`0`) is unchanged: all company alarms. Combine with `severity=`. | **BUILT** (live-verified 2026-09-24) |
| 12.4 | `GET /fleet/dashboard` (`data.utilisation`), `GET /fleet/dashboard/trends` | The vehicle count behind `available_hours` / `parked_hours` / `rate` now **excludes `retired` and `sold`** vehicles (`active` and `in_maintenance` count). No shape change. A tracker-less **active** vehicle still counts as available (parked when it has no completed trips) — by design. `idle_hours` is still always `0`. | **BUILT** (live-verified 2026-09-24) |

Not changed (observations): `fleet_status` / the vehicle list still include retired/sold vehicles; `data.alerts.*` on `GET /fleet/dashboard` still counts all company alarms; a combined "needs attention" feed is deferred to the later analytics phase.

