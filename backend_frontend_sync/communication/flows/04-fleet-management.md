# Fleet Management — existing flow, backend rules discovered, gaps

**Written:** 2026-09-24 · **By:** frontend · **Verification:** live-tested in Chrome with a real seeded user (junead@chaminade-hs.org) using fresh "ZZ …" test data + read-from-code for every screen. Steps marked **[live]** were driven through the UI and the network calls observed; **[code]** = read from code only.
**Source:** `src/screens/FleetManagement.tsx` (tab hub), `FleetDashboard.tsx`, `FleetMap.tsx`, `Vehicles.tsx`, `Drivers.tsx`, `Geofences.tsx`, `Yards.tsx`, `Trips.tsx`, `src/components/VehicleDetailModal.tsx`, `DriverDetailModal.tsx`, `TripDetailModal.tsx`, `YardLayoutEditor.tsx`, `VehicleMarker.tsx`, `YardMarker.tsx`; contract `api_contract/openapi/fleet*.yaml`.

> **PURPOSE — READ FIRST: this is an understanding pass, NOT a change request.** Frontend has not changed any
> code and is **not asking backend to build or fix anything yet**. Please (1) read the flow to see exactly
> which APIs the frontend calls and when, (2) tell us where our description is wrong or where behaviour is
> intended, and (3) answer the questions in §7. Sections 4 and 6 are _observations_ about current behaviour
> and gaps against the owner's vision, so backend has the full picture; any real ask will come later as a
> separate flow file once both sides agree on the design.

**Scope note:** CRM (fleet customers) and billing are out of scope for now. Analysis only — no frontend code was changed for this document.

**Owner's target flow:** operator adds vehicle → adds driver → adds geofences + yards → assigns tracker device + driver to vehicle → creates trip with stopping points (yards) → starts trip → progress is updated two ways: **human** (operator marks started / completed / arrived / departed) and **sensor** (device packets mark enter/leave of yard/geofence until destination reached) → all shown on a real map.

**Prerequisite (sensor path):** a product with a configured protocol/attributes, and a device under it. Packets are sent via `POST /api/webhook` with header `token` (from `POST /api/get-encrypt-token`). The first packet is "Initial Packet received" (config only). Positions are only stored once the product is configured (`/attribute/preference/marked-as-unique` + `/attribute/preference/setting/store`, selecting `object.latitude`/`object.longitude`).

---

## 1. Current flow, tab by tab

Fleet Management is one page with 7 tabs (`Dashboard, Map, Vehicles, Drivers, Geofences, Yards, Trips`); each tab mounts only while active.

### 1.1 Vehicles tab [live]

| #   | UI action                                                  | Call                                       | Method                                                      | Notes                                                                                                                                           |
| --- | ---------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open tab                                                   | `/api/vehicles`                            | GET                                                         | list                                                                                                                                            |
| 2   | "Add vehicle" form (name, category, make, model, length m) | `/api/vehicles`                            | POST                                                        | body `{name, vehicle_category, make, model, length_m}` only. Category is free text (datalist of existing values). Duplicate names are accepted. |
| 3   | Click a row → detail modal                                 | `/api/vehicles/{id}`                       | GET                                                         | refetched every 15 s while open                                                                                                                 |
| 4   | Overview → assign driver (**text input "Driver ID"**)      | `/api/drivers/{driverId}/assign-vehicle`   | POST `{vehicle_id}`                                         | 404 "Driver not found" for bad id; 422 "This driver is already assigned to a vehicle."                                                          |
| 5   | Overview → unassign driver                                 | `/api/drivers/{driverId}/unassign-vehicle` | POST                                                        |                                                                                                                                                 |
| 6   | Tracker tab → assign (**text input "Tracker Device ID"**)  | `/api/vehicles/{id}/assign-device`         | POST `{device_id}`                                          | see rules in §2                                                                                                                                 |
| 7   | Tracker tab → unassign                                     | `/api/vehicles/{id}/unassign-device`       | POST                                                        |                                                                                                                                                 |
| 8   | Maintenance → add schedule                                 | `/api/vehicles/{id}/maintenance-schedules` | POST `{service_type, interval_days, last_service_date}`     |                                                                                                                                                 |
| 9   | Maintenance → log service                                  | `/api/vehicles/{id}/maintenance-logs`      | POST                                                        |                                                                                                                                                 |
| 10  | Fuel → log fill-up                                         | `/api/vehicles/{id}/fuel-logs`             | POST `{fill_date, volume, unit, odometer_km, is_full_tank}` |                                                                                                                                                 |
| 11  | Compliance tab                                             | `/api/compliance-documents`                | GET / POST                                                  | filtered by vehicle                                                                                                                             |
| 12  | Vehicle history tab → Check out                            | `/api/yard-slots/{slotId}/check-out`       | POST                                                        | button only shows when `yard_history` has an open event (never, see §3 B9)                                                                      |
| —   | Edit / delete vehicle                                      | —                                          | —                                                           | **not present** (no PUT/DELETE in contract)                                                                                                     |

### 1.2 Drivers tab [live]

| #   | UI action                                                     | Call                                 | Method              | Notes                    |
| --- | ------------------------------------------------------------- | ------------------------------------ | ------------------- | ------------------------ |
| 1   | Open tab                                                      | `/api/drivers`                       | GET                 |                          |
| 2   | "Add driver" (first/last name, license number, class, expiry) | `/api/drivers`                       | POST                | only those 5 fields sent |
| 3   | Row click → detail                                            | `/api/drivers/{id}`                  | GET                 |                          |
| 4   | Overview → assign vehicle (**text input "Vehicle ID"**)       | `/api/drivers/{id}/assign-vehicle`   | POST `{vehicle_id}` |                          |
| 5   | Unassign                                                      | `/api/drivers/{id}/unassign-vehicle` | POST                |                          |
| 6   | Incidents → add                                               | `/api/drivers/{id}/incidents`        | POST                | `vehicle_id` never sent  |
| 7   | Compliance → add/list                                         | `/api/compliance-documents`          | POST / GET          | expired badge works      |
| —   | Edit / delete driver                                          | —                                    | —                   | **not present**          |

### 1.3 Yards tab [live]

| #   | UI action                                           | Call                                 | Method                                                     | Notes                                                |
| --- | --------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Open                                                | `/api/yards`                         | GET                                                        |                                                      |
| 2   | Add yard (name, address, **lat/lng typed by hand**) | `/api/yards`                         | POST                                                       |                                                      |
| 3   | Open yard                                           | `/api/yards/{id}`                    | GET                                                        | returns `layout` + `slots[].current_event`           |
| 4   | Upload layout image                                 | `/api/yards/{id}/layout`             | POST multipart                                             | UI shows the button only when there is no layout yet |
| 5   | Click on layout to add slot                         | `/api/yards/{id}/slots`              | POST `{slot_number, position_x, position_y, max_length_m}` |                                                      |
| 6   | Check-in (**text input "Vehicle ID"**)              | `/api/yard-slots/{slotId}/check-in`  | POST `{vehicle_id}`                                        | source `manual`                                      |
| 7   | Check-out                                           | `/api/yard-slots/{slotId}/check-out` | POST                                                       |                                                      |
| —   | Edit / delete yard or slot                          | —                                    | —                                                          | **not present**                                      |

### 1.4 Geofences tab [live]

| #   | UI action                                                                                   | Call                                                                           | Method            | Notes                                                                                |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------ |
| 1   | Open                                                                                        | `/api/geofences`, `/api/geofences/events?limit=20` (polled 30 s), `/api/yards` | GET               |                                                                                      |
| 2   | Add (either linked to a yard, or manual centre lat/lng typed by hand + radius_m + alert_on) | `/api/geofences`                                                               | POST              |                                                                                      |
| 3   | Enable / Disable                                                                            | `/api/geofences/{id}`                                                          | PUT `{is_active}` |                                                                                      |
| 4   | Delete                                                                                      | `/api/geofences/{id}`                                                          | DELETE            |                                                                                      |
| —   | Edit name/radius/alert_on/centre                                                            | —                                                                              | —                 | not in UI (PUT supports name/radius_m/alert_on/is_active; centre is ignored, see §3) |

### 1.5 Trips tab [live]

| #   | UI action                                                                                                                                                                                                                                                                                             | Call                       | Method                                            | Notes                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Open                                                                                                                                                                                                                                                                                                  | `/api/trips`               | GET                                               | paginated `data.data`                                                                              |
| 2   | Create trip form: vehicle dropdown (all vehicles), **Driver ID number input**, **Fleet customer ID number input** (CRM), origin/destination free-text + typed lat/lng, `planned_yards[]` (yard dropdown, purpose, planned arrival/departure datetime), planned dates, distance, odometer start, notes | `/api/trips`               | POST                                              | backend snapshots driver + device from the vehicle's _current_ assignments; sequence = array order |
| 3   | Row click → detail                                                                                                                                                                                                                                                                                    | `/api/trips/{id}`          | GET                                               | not auto-refreshed, no map                                                                         |
| 4   | Start                                                                                                                                                                                                                                                                                                 | `/api/trips/{id}/start`    | POST                                              | 422 unless status `planned`                                                                        |
| 5   | Complete (UI requires odometer end)                                                                                                                                                                                                                                                                   | `/api/trips/{id}/complete` | POST `{odometer_end_km, fuel_used_liters, notes}` |                                                                                                    |
| 6   | Cancel                                                                                                                                                                                                                                                                                                | `/api/trips/{id}/cancel`   | POST `{cancellation_reason}`                      |                                                                                                    |
| —   | Edit trip                                                                                                                                                                                                                                                                                             | `PUT /api/trips/{id}`      | —                                                 | exists in backend, **unused** by UI                                                                |
| —   | Mark yard arrived / departed manually                                                                                                                                                                                                                                                                 | —                          | —                                                 | **no endpoint, no UI**                                                                             |

### 1.6 Map tab [live]

| Call                                                 | Notes                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/fleet/positions` (polled 30 s, no socket)  | includes **unassigned trackers** too                               |
| `GET /api/yards`, `GET /api/geofences`               | active geofences drawn as circles from `center_latitude/longitude` |
| marker click → `GET /api/fleet/devices/{id}/history` | **404 — not implemented** (documented as such in contract)         |

No trips, routes, planned stops, destination, or trail are drawn.

### 1.7 Dashboard tab [live]

`GET /api/fleet/dashboard`, `/alerts`, `/vehicle-performance`, `/financial`, `/trends`. Currency hard-coded PKR; revenue/profit tiles say "Coming soon".

**Realtime events involved:** none used by Fleet screens. Socket only binds `dashboard:update`, `building:update`, `packet:initial`, `device:value`. The map, trip detail and geofence events all rely on polling (or nothing).

---

## 2. Backend rules discovered by live testing

- Vehicle: duplicate names allowed; no plate/VIN captured (backend accepts them, UI does not send).
- **A vehicle can have several simultaneously-active drivers** (assigning a 2nd driver to a vehicle with an active one succeeds); `current_driver_assignment` shows the latest. A driver can only be on one vehicle (422).
- `assign-device`: **a DevEUI string → HTTP 500 "Internal server error"**; numeric internal device id works. 422s: "already installed in another vehicle", "already has an active tracker installed", "The selected device id is invalid." The internal numeric device id is nowhere in the UI, hence the dropdown request.
- Yard slots: 422 when occupied; 422 when vehicle length > slot `max_length_m` (skipped if vehicle has no length). **The same vehicle can be checked into two slots at once.**
- Geofence `PUT`: name/radius_m/alert_on/is_active work; `center_latitude/longitude` are **silently ignored with a 200 "updated"**. Yard-linked geofences report the yard's centre.
- Trip create: snapshots current driver + tracker; **cannot create a second trip for a vehicle that already has one `in_progress` (422)**, which blocks pre-planning. Unknown vehicle 404; missing vehicle 422 "Invalid input". Start from non-planned 422; complete from completed 422. `PUT` works while planned / in_progress.
- Trip complete accepts an **empty body `{}`** (no odometer required) and succeeded. Distance falls back to GPS Haversine; vehicle `odometer_km` is **not** updated from the trip; `actual_duration_minutes` is fractional.
- `GET /api/trips/{id}/gps-trail` works (returns positions since start + `computed_distance_km`) but the frontend doesn't use it.

## 3. Sensor / automation status (tested with real packets)

| Stage                                    | Result                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Packet → `device_positions`              | works **only** when the product config selects `object.latitude`/`object.longitude`; an unconfigured `lat`/`lng` payload is ignored. Which key names are auto-recognised is unknown → question C1.                                                                                         |
| Positions → map                          | works (30 s poll)                                                                                                                                                                                                                                                                          |
| Geofence enter/exit events               | **generated automatically** on transitions, for devices assigned to a vehicle (none for an unassigned device). Payload: `id, geofence_id, vehicle_id, event_type, occurred_at, vehicle` — **no geofence object/name, no device, no trip_id**.                                              |
| Geofence/yard events → trip planned yard | **NOT IMPLEMENTED.** With a trip in_progress, events fired but the trip's planned yards never got `actual_arrival/actual_departure/dwell_time_minutes/status/actual_source`; after completion they stay `planned`. This is the core "sensor updates the trip" piece of the owner's vision. |
| Auto-complete on destination reached     | not implemented                                                                                                                                                                                                                                                                            |
| Yard slot check-in via sensor            | not observed (`source` is only ever `manual`)                                                                                                                                                                                                                                              |

## 4. Observations — possible bugs and unclear behaviour (informational; please confirm which are intended)

**Backend-side observations**

- B1 `assign-device` 500 on string id (should be 422/404, or accept DevEUI).
- B2 `PUT /geofences/{id}` ignores centre but returns 200.
- B3 Geofence events lack geofence name / device / trip reference (UI renders blank names).
- B4 `GET /api/drivers/{id}` nested `vehicle` has no tracker/device assignment (UI shows "No tracker currently assigned" although one is).
- B5 `GET /fleet/devices/{id}/history` 404.
- B6 `/fleet/positions` returns unassigned devices.
- B7 Trip complete accepts empty body; vehicle odometer not updated.
- B8 Maintenance schedule response returns `interval_days`, `last_service_date` but **no `next_service_date` / `is_overdue_by_date`** — the UI expects those, so every schedule shows "No date-based interval set". Service logs also don't reset the schedule.
- B9 `GET /vehicles/{id}` `yard_history` is `[]` even while the vehicle has an open check-in (`GET /yards/1` shows vehicle 2 in Slot 1 with `checked_out_at: null`) → "Vehicle history" never shows yard state, no Check-out button.
- B10 One vehicle in two slots; multiple active drivers per vehicle.
- B11 Cannot pre-plan trip while one is in progress.
- B12 Vehicle `odometer_km` etc. not settable after create (no PUT).

**Frontend (existing bugs)**

- F1 Trip/Geofence event names blank; F2 stale map empty-state copy ("Generic GPS Fleet Tracker template"); F3 stale placeholder cards in Vehicle History ("once trip management is implemented"); F4 vehicle detail actions don't refetch the outer list, modal can act on stale data; F5 vehicle dropdown shows duplicate names (no plate to disambiguate); F6 dashboard alerts panel mixes company-wide IoT rule alarms; F7 `datetime-local` sent naive → displayed shifted (+5 h in PKT); F8 timeline shows completed destination as "CURRENT" and yard stops "COMPLETED" without actual times; F9 "Packet received… Click here to configure" toast keeps firing for a configured product; F10 dashboard "168h parked" for a vehicle with no tracker; total 1 but offline 1 + unknown 1.
- F11 (2026-09-24, found during dropdown live test) Trips list is not refetched after a trip is cancelled from the trip detail modal — the row keeps showing `planned` until the tab is reopened (same family as F4). F5 update: the vehicle dropdown in the Trip-create form still lists duplicate names ("ZZ Truck A" ×2) with no way to tell them apart; the four new dropdowns append `(#id)` / licence, the trip form's vehicle select was not changed. Both parked for later, not yet fixed.

## 5. Raw-ID text inputs to convert to dropdowns

| Where                       | Field                       | Should list                                                                                 |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| Vehicle detail → Overview   | "Driver ID"                 | unassigned drivers (name + licence)                                                         |
| Driver detail → Overview    | "Vehicle ID"                | vehicles (name + plate)                                                                     |
| Vehicle detail → Tracker    | "Tracker Device ID"         | free devices (name + DevEUI), **needs an endpoint** returning internal id + status (see C2) |
| Yard slot check-in          | "Vehicle ID"                | vehicles not currently parked and that fit the slot                                         |
| Trip create                 | "Driver ID"                 | drivers (default = vehicle's current driver)                                                |
| Trip create                 | "Fleet customer ID"         | CRM customers — **out of scope**, hide for now                                              |
| Trips/Yards/Geofence create | lat/lng, origin/destination | map picker / geocoded address (frontend work)                                               |

**Status update 2026-09-24 (frontend-only, no backend involved):** four of the raw-ID inputs above are now dropdowns that send the same numeric id to the same endpoints — Vehicle detail → "Driver ID" (drivers with no current vehicle), Driver detail → "Vehicle ID", Yard slot check-in → "Vehicle ID" (hides vehicles already parked in this yard, disables ones longer than the slot), Trip create → "Driver ID" (pre-selects the chosen vehicle's current driver). Still raw inputs on purpose:

- **Vehicle detail → Tracker → "Tracker Device ID" — LEFT AS A TEXT INPUT. PLANNED BACKEND ASK (not sent yet):** an endpoint returning devices that are **not assigned to any vehicle**, with the internal numeric `id`, name, DevEUI and product, so the frontend can render a dropdown and send `device_id` (internal id) to `POST /vehicles/{id}/assign-device`. Until then the input stays. Related: C2 / B1 (DevEUI string → 500).
- **Trip create → "Fleet customer ID (optional)" — LEFT IN PLACE, MARKED FOR REMOVAL.** It is optional and belongs to CRM (out of scope). After backend review of the fleet flow, remove the field (and `fleet_customer_id` from the payload in `src/screens/Trips.tsx`) — or replace it with a customer dropdown if CRM is ever brought into scope.

## 6. Unused endpoints and gaps against the vision

- In contract but unused by frontend: `PUT /trips/{id}`, `GET /trips/{id}/gps-trail`, `POST /vehicles/{id}/image`, `GET /assignment-history`, `/drivers/{id}/assignment-history`, `/vehicles/{id}/assignment-history`, `GET /compliance-documents/expiring-soon`.
- Accepted by backend but not sent by UI: vehicle plate, vin, year, fuel_type, tank_capacity_liters, odometer_km, ownership_type, cost_centre, acquisition_*, width/height, gross_weight_kg, payload_kg; driver email, phone, hire_date, employment_status, availability_status, certifications, payroll_reference; fuel-log cost/vendor/station; schedule interval_km; log odometer_km/vendor/notes.
- **Gaps against the owner's vision (for awareness only — NOT a request yet; to be designed together later):** `PUT/DELETE` for vehicles, drivers, yards, slots; trip delete; manual `POST /trips/{id}/yards/{stopId}/arrive|depart` (human updates); geofence→trip-stop bridge (sensor updates) with `trip_id` on geofence events; live trip position (socket event e.g. `fleet:position`, `trip:update`); list of free/assignable devices with internal id; `GET /fleet/devices/{id}/history` (or reuse gps-trail per vehicle); vehicle availability filter for trip creation.

## 7. Questions for backend

- C1 How exactly does the position pipeline decide which attribute is latitude/longitude — the **label** text (live evidence says yes), the key name, or both? Case-sensitive? Same question for speed/heading. See §9.
- C2 What should the frontend send for "assign tracker" — internal id or DevEUI? Please make DevEUI work, or give an endpoint listing assignable devices with ids.
- C3 Intended: multiple active drivers per vehicle? one vehicle in two slots? Please enforce or confirm.
- C4 Design for the sensor→trip bridge: when a device enters a yard/geofence linked to a planned stop, set `actual_arrival`, status, `actual_source='sensor'`; on exit set departure + dwell; on final destination auto-complete? What about ordering/skipped stops?
- C5 Should completing a trip require `odometer_end_km`? Should it update the vehicle odometer?
- C6 Pre-planning trips: allow multiple `planned` trips per vehicle, block only overlapping `in_progress`?
- C7 Timezone: are `planned_*` datetimes expected as UTC ISO strings? Frontend will send ISO with offset unless told otherwise.
- C8 Sockets: will fleet position / trip / geofence-event updates be emitted over Socket.IO?
- C9 Schedules: which fields are returned for next-due (see B8)?

## 8. Test data left behind (company 2)

Vehicles 2, 3 ("ZZ Truck A" ×2); drivers 2, 3 (ZZ Alex, ZZ Bob); yards 1, 2; geofences 1, 2; trips 1–3 (completed/completed/cancelled); product 118 with devices 146/147; no delete endpoints exist for vehicles/drivers/yards/trips.

## 9. GPS attributes don't fit the attribute-configuration model (added 2026-09-24, owner concern, live-verified)

**Owner's concern:** in the product's attribute settings an attribute is either (a) marked as the _unique identifier_
(no conditions needed), or (b) _configured_ with label + unit + alert condition. A tracker's latitude/longitude
are neither — they are just position values, with no "alert value". The current UI has no third option.

**What the UI does today** (`src/components/AttributeModal.tsx`, opened from the ⚙ menu on each attribute row,
which offers exactly two items: "Configure Attribute" and "Mark as unique identifier") **[live]**:

- The modal for `object.latitude` shows: label, a unit dropdown (only sensor units: °C, °F, %, hPa, V, m/s, km/h,
  m/s², m, km, A, W, kWh, lux, ppm, AQI, dB, kg — **no degrees / coordinate unit**), and "ALERT SETTINGS →
  CONDITIONAL RULES" with a condition row (Equal To/Less Than/… + **Value**).
- **The Value is mandatory:** clearing it shows "Value is required" and disables Save ("Please fill in all condition
  values"). So to configure latitude/longitude at all, the user must invent a meaningless condition. On product 118
  the stored condition for latitude is `equal to 0`.
- Save calls `POST /api/attribute/preference/setting/store` (or `PUT …/setting/{id}`) with `{label, unit, attribute_key,
widget_type, alert_settings:{enabled:false, conditions:[…]}, assign_uuid, product_id, product_name}`. No field
  says "this attribute is a coordinate". No visible rule appears in `GET /api/rules` for these (stub rule, hidden).

**New live finding — hidden coupling on the label text.** Experiment on product 118, device ZZTRK0000000001
(packet `object.latitude/longitude` sent to `POST /api/webhook` each time):

1. Label of `object.latitude` = "Latitude" → new packet → position stored (`/fleet/positions` updated).
2. Changed the label to "Foo Bar" (only change) → new packet → **no new position stored** (position unchanged).
3. Changed the label back to "Latitude" → new packet → position stored again (31.8222, 74.8222).
   So the backend recognises coordinates **by the user-typed label**, not by any explicit role, and the user is never
   told. A typo, a translation, or "Lat" silently disables tracking with no error anywhere. (Not yet tested: case
   sensitivity, "Lat"/"lat"/"Lng", whether the key name alone is enough, how speed/heading are recognised.)

**Owner's suggestion (open for discussion, nothing agreed):** add a third way to configure an attribute — an
"attribute role/type" choice. If the attribute is tracker-related the user only picks **Latitude** or **Longitude**
(possibly also Speed / Heading), with no unit and no alert condition required. Plausible shapes (backend to decide):

- a new field on the attribute preference, e.g. `attribute_role: 'latitude' | 'longitude' | 'speed' | 'heading' | null`
  accepted by `POST/PUT /attribute/preference/setting` and returned by `GET /product-settings/{id}`, with
  `alert_settings` optional when a role is set; and the position pipeline reading the role instead of the label; or
- a dedicated endpoint (like `/attribute/preference/marked-as-unique`) e.g. `/attribute/preference/mark-role`
  `{product_id, attribute_key, role}` + an unmark counterpart.
  Frontend side would be a third item in the ⚙ menu ("Mark as location: Latitude / Longitude"), skipping the modal.

**Questions to backend:** (1) confirm the label-based detection and its exact matching rules; (2) is a role
field/endpoint acceptable, and which roles (lat, lng, speed, heading, altitude, battery?); (3) should `alert_settings`
be optional for role attributes; (4) the contract's `Generic GPS Fleet Tracker` template lists Latitude/Longitude
fields — does applying a template set whatever the pipeline needs, so template-based products work without manual
configuration? (the template picker is currently not in the frontend UI).

---

## 10. Backend response (2026-09-24 15:18 PKT, backend) — understanding pass answered; design items are PROPOSALS, not agreed

> **Status legend.** **FINAL** = a fact verified against the real Node code _and_ Laravel's source (and, where noted,
> the live DB read-only) — safe to rely on. **PROPOSED** = backend's recommendation; the owner has **not** decided
> yet, so **do not build against these**. **No backend code, schema or contract has changed** for this reply, and no
> build has started. Backend's full working notes: `migration/tasks/fleet-completion.md` (backend repo).

### 10.1 Your description is accurate — and the big picture (FINAL)

§1–§3 of this document match what backend sees. The most important point: the owner's target flow **is** the original
product design, and the storage for it already exists but was never wired, **in the old Laravel app either**:
`trip_planned_yards` already has `status` (`planned|arrived|departed|missed`), `actual_arrival_at`,
`actual_departure_at`, `dwell_time_minutes` and `actual_source` (`geofence_auto|driver_reported|manual`), and
`yard_slot_events.source` has an unused `gps_proximity` value — but **nothing updates a stop from sensor data, and
nothing ever did**. So the sensor→trip bridge is a _new build_ on existing tables, not a fix to something broken. Your live
finding (geofence events fire, stops stay `planned`) is exactly right; the live DB shows the same.

### 10.2 Your B-items — verdicts (FINAL)

| #                                              | Verdict                      | Detail                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 assign-device 500 on DevEUI                 | **Backend bug**              | Old app returned 422 (`device_id` must be an integer); Node crashes converting the string. Will be fixed to 422.                                                                                                                                                     |
| B2 geofence centre ignored on PUT              | Same as old app (limitation) | Only name/radius/alert_on/is_active are editable. Decision pending on allowing centre edits.                                                                                                                                                                         |
| B3 event has no geofence name                  | **Backend gap**              | Old app returned `geofence:{id,name}`; Node dropped it. Will be added. No `device`/`trip` link exists on events yet (no such columns).                                                                                                                               |
| B4 driver→vehicle has no tracker               | **Backend gap**              | Old app included `current_device_assignment.device` there; Node didn't port it. Will be added.                                                                                                                                                                       |
| B5 `/fleet/devices/{id}/history` 404           | Known missing operation      | Exists in the old app (default 500 points, max 2000, oldest→newest). Small; scheduled.                                                                                                                                                                               |
| B6 positions include unassigned trackers       | Intended (old app)           | "Every device that has ever reported", vehicle attached only if installed. An assigned-only filter is a possible addition.                                                                                                                                           |
| B7 complete accepts `{}`, odometer not updated | Same as old app              | `odometer_end_km` optional; vehicle odometer never updated. Product decision pending.                                                                                                                                                                                |
| B8 no `next_service_date`                      | **Backend bug**              | Old app computed `next_service_date` / `is_overdue_by_date`; Node's response omits them. Will be fixed. **Also:** a maintenance log resets the schedule **only if the log request carries `maintenance_schedule_id`** (same in the old app) — frontend must send it. |
| B9 `yard_history` always `[]`                  | **Backend gap**              | Hard-coded empty in Node; old app returned the last 20 yard check-in/out events. Will be fixed.                                                                                                                                                                      |
| B10 several drivers / two slots                | Same as old app              | Nothing blocks either. Decision pending (below).                                                                                                                                                                                                                     |
| B11 can't pre-plan a trip                      | Same as old app              | The over-restriction is the check at _create_; the check at _start_ is the real rule. Decision pending (below).                                                                                                                                                      |
| B12 no PUT/DELETE                              | Old app has none either      | New build; decision pending.                                                                                                                                                                                                                                         |

Dashboard items (`168h parked` with no tracker; `total 1 = offline 1 + unknown 1`): both are the old app's documented
formulas (`parked = available − driving`; `unknown` is a sub-set of `offline`), not regressions — a product call if the
owner wants them changed. F1 (blank geofence names) is fixed by B3.

### 10.3 Answers to §7 / §9 (FINAL unless marked)

- **C1 / §9 Q1 — how coordinates are recognised:** by the **label** the user typed on the attribute (the old app's own
  design; Node copies it). The label is trimmed and compared **case-insensitively**; accepted labels — latitude:
  `latitude`, `lat`; longitude: `longitude`, `lng`, `lon`; speed: `speed`; heading: `heading`, `course`,
  `bearing`. The **key name is never looked at**. The attribute must be a saved preference **with a setting row** (that's
  where the label lives) and its value must be numeric; a position is stored **only when both latitude and longitude
  resolve**. Your "Foo Bar" experiment behaves exactly this way.
- **C2 — assign tracker:** the current contract is the **internal numeric device id** (`GET /devices` already returns
  `id`, `device_unique_identifier`, `name`, so a dropdown can be built today, but it can't say which devices are already
  installed in a vehicle). A non-numeric value will become a 422 (B1). Whether to also accept the DevEUI and add an
  "assignable trackers" listing is **PROPOSED** (below).
- **C7 — timezone:** all datetimes are stored and compared as **UTC**. **Send ISO 8601 with an offset or `Z`** (e.g.
  `2026-09-24T10:00:00+05:00`). A naive `datetime-local` string is read as UTC by the server, which is the +5 h shift you saw
  (F7). Responses are ISO with `Z`.
- **C9 — schedule next-due:** after B8 is fixed a schedule returns `next_service_date` (`last_service_date +
interval_days`) and `is_overdue_by_date` (`null` when there is no day-interval). Distance-based (`interval_km`) due-ness
  is not computed by either backend.
- **§9 Q4 — the "Generic GPS Fleet Tracker" template:** applying it creates the attributes **with** the right labels
  (Latitude/Longitude/Speed/Heading), so label detection works for it — **but** its attribute keys are flat
  (`latitude`, `longitude`, …) and keys are matched **exactly** against the flattened payload, so it only works for flat
  payloads, **not** ChirpStack-style `object.latitude`.
- **Things frontend can already do without waiting:** send `maintenance_schedule_id` on maintenance logs; send ISO with
  offset; build the vehicle/driver/slot dropdowns from the existing `GET /vehicles` and `GET /drivers`. (The tracker
  dropdown can use `GET /devices` for now but can't yet filter out installed trackers.)

### 10.4 Design questions — backend's recommendations (PROPOSED — owner deciding, not agreed)

| Topic                                | Backend recommendation                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPS attribute role (§9 Q2/Q3)**    | A new optional `attribute_role` (`latitude`, `longitude`, `speed`, `heading`) with dedicated mark/unmark endpoints (like `marked-as-unique`), no alert condition required for role attributes; ingestion reads the role first and keeps the label as a fallback so existing products keep working.                                                                                                        |
| **Sensor→trip bridge (C4)**          | On a geofence **enter** for a yard in the vehicle's in-progress trip, set the first not-yet-arrived stop for that yard to `arrived` (`actual_source='geofence_auto'`); on **exit** set `departed` + dwell. Events get a `trip_id`. Later stops arriving does **not** auto-mark earlier ones `missed`; that happens when the trip completes. Also seed the state when a trip starts inside its first yard. |
| **Yard ↔ geofence**                  | A yard has no radius and only gets detected if a geofence linked to it exists; recommend auto-creating one (default radius, editable) with the yard.                                                                                                                                                                                                                                                      |
| **Auto-complete / odometer (C4/C5)** | Don't auto-complete silently — notify the operator to confirm; keep `odometer_end_km` optional (GPS distance fallback); update the vehicle odometer on completion when given.                                                                                                                                                                                                                             |
| **Human path**                       | `POST /trips/{id}/stops/{stopId}/arrive` and `/depart` (source `manual` for operators, `driver_reported` for a driver app), optional reason, can correct a sensor time.                                                                                                                                                                                                                                   |
| **Rules (C3/C6)**                    | Allow several _planned_ trips per vehicle (keep the check at start); enforce one active driver per vehicle and one open slot per vehicle with clear 422s.                                                                                                                                                                                                                                                 |
| **Sockets (C8)**                     | Yes — `fleet:position`, `geofence:event`, `trip:update` over Socket.IO, via a company-wide room joined from the verified JWT.                                                                                                                                                                                                                                                                             |
| **CRUD gaps**                        | `PUT` for vehicles/drivers/yards/slots (and geofence centre); deactivate-not-delete where history references them; delete trip only while `planned`.                                                                                                                                                                                                                                                      |

Backend's proposed order once the owner decides: small fixes (B1, B3, B4, B8, B9, `/fleet/devices/{id}/history`) →
assignable-trackers listing + validation → attribute role → manual stop arrive/depart + trip route endpoint → sensor→trip
bridge → realtime events → CRUD gaps. Each step will get its own flow note here with the real request/response shapes
**before** frontend builds against it. Until then, this section is information, not a contract.

---

## 11. Backend → frontend: input needed before design is locked (2026-09-24 15:25 PKT, backend)

The owner wants the frontend to describe **what the operator experience should be**; backend then decides the mechanism
and the API shapes. Answers here are **input, not decisions** — the owner decides. Please reply as a new section below
(or a new flow file) with the operator's point of view; you don't need to know how backend implements anything.

1. **How latitude/longitude reach fleet management (the owner's main ask).** Walk through, screen by screen, how an
   operator should set up a GPS tracker so its position appears on the Map and drives geofences/trips: which screen,
   what they click, in what order, and what they should _never_ have to type (no alert value, no unit).
   Constraints from backend so you can judge the options:
   - a position is stored only when **both** latitude and longitude are identified; speed/heading are optional;
   - attribute keys must match the packet's dot-flattened keys **exactly** (real trackers send `object.latitude`, so a
     template with flat keys like `latitude` won't match — the real first packet's keys are the reliable source);
   - today's hidden dependency on the label text is the thing we want gone.
     Options to react to: **(a)** operator marks an attribute in the Initial Packet's attribute list as _Latitude /
     Longitude / Speed / Heading_ (backend: a dedicated mark/unmark endpoint, like "mark as unique identifier");
     **(b)** the same choice inside the existing "Configure Attribute" modal (backend: a role field on that save);
     **(c)** a "GPS tracker" template at product creation. Which do you recommend, and why?
2. **Map + trip view data (D9).** List exactly what the Map tab and the trip detail need to draw: current positions,
   yards, geofences, planned stops with planned vs actual status/times, the driven trail, ETA? Backend will shape **one**
   trip "route" response from your list instead of you stitching several calls. Also: should `/fleet/positions` be able
   to return **assigned trackers only**?
3. **Manual stop marking (D5).** Where would an operator press "Arrived" / "Departed" for a stop, and should they be able
   to **overwrite a sensor-detected time** (with a required reason), or only fill in stops the sensor missed?
4. **Realtime (D8).** Which of `fleet:position`, `geofence:event`, `trip:update` would you actually consume, and do you
   want to keep the 30 s polling as a fallback?
5. **Yard form (D3).** Would you add a **radius** field to "Add yard" (so a yard is detectable by sensors), or should
   backend just auto-create a default-size geofence and let the operator adjust it in the Geofences tab?
6. **Edit/delete priorities (D7).** Rank which of these the UI truly needs first: edit vehicle, edit driver, edit yard/slot,
   edit geofence centre, deactivate vs delete, delete a planned trip.

---

## 12. Frontend reply — owner decisions on §10.4 / §11 (2026-09-24, frontend + owner)

> These are the **owner's decisions** (made in the frontend session) and the operator-experience description backend
> asked for. Backend decides the mechanism and API shapes; per §10, each build step still gets its own flow note with
> real request/response shapes **before** frontend builds against it. Nothing here is built yet except the three
> frontend-only items in 12.8.

### 12.1 GPS attributes — §11.1 → option **(a)**, mark in the attribute list

**Operator flow.** Product → Configuration → the attribute list from the Initial Packet. Each attribute row's ⚙ menu
(today: "Configure Attribute", "Mark as unique identifier") gets a third item **"Mark as location"** with a choice:
**Latitude / Longitude / Speed / Heading** (and a way to clear it). One click, **no modal, no unit, no alert value**. The
attribute row then shows its role as a badge. The operator never types a label for this to work.

Backend needs (as you proposed in §10.4): dedicated mark/unmark endpoints like `marked-as-unique`; the role returned by
`GET /product-settings/{id}` (or the attribute list) so the badge can render; ingestion reads the **role first**, label
as fallback for existing products; keys come from the real first packet (`object.latitude`), never from a template's flat
keys. Templates (option c) are **not** wanted now. Please tell us the endpoint names/shape in the flow note.

### 12.2 Map + trip view data — §11.2

The Map tab and trip detail draw **all four**: (1) live vehicle positions, (2) yards + geofences, (3) the selected
trip's route — ordered planned stops with planned vs actual arrival/departure, `status`, `actual_source`, dwell, and
(4) the driven GPS trail since trip start (`computed_distance_km` too). Please shape **one trip "route" response** with:
trip summary + vehicle + driver, origin/destination (address + coordinates), ordered stops (yard id/name/lat/lng,
purpose, planned + actual times, status, source, dwell), trail points, and the vehicle's current position. **ETA is out
for now** (needs routing data; revisit later). Also still wanted: `GET /fleet/devices/{id}/history` (B5) for the marker
click. **`/fleet/positions`: assigned-only by default**, with an opt-in flag to include unassigned trackers.

### 12.3 Manual stop marking — §11.3

In the **trip detail → Timeline**, each yard stop gets **Arrived** and **Departed** buttons (time defaults to now, editable).
Filling a stop the sensor missed needs nothing extra. **Overwriting a sensor-detected time is allowed but requires a short
reason**, and the original sensor time must stay visible/auditable. Backend: accept your proposed
`POST /trips/{id}/stops/{stopId}/arrive|depart` with `occurred_at` + optional `reason` (required when it replaces an
existing `actual_*` time); source `manual`.

### 12.4 Realtime — §11.4

Frontend will consume **all three**: `fleet:position`, `geofence:event`, `trip:update`. Polling is **not** kept as the primary
mechanism. Plan: sockets drive all live changes; the frontend **refetches once on every socket (re)connect and when the
tab regains focus**; a **slow safety poll** remains only for a silently stalled socket — **2 min on Map/Trips/Geofences,
5 min on the Dashboard** (today 30 s). Backend please confirm: company-wide room joined from the verified JWT, and the
payload shapes (esp. what a `trip:update` carries, and how "destination reached, awaiting operator confirmation" is
signalled — see 12.6).

### 12.5 Yard radius — §11.5

**"Add yard" gets a Radius (m) field with a sensible default** (backend to choose the default, ~100 m suggested).
Creating a yard auto-creates its linked geofence with that radius; the radius stays adjustable later (yard edit and/or
the Geofences tab).

### 12.6 Trip automation + rules — §10.4 (C3/C4/C5/C6)

- **Sensor→trip bridge: accepted as proposed** — geofence enter → stop `arrived` (`geofence_auto`), exit → `departed` + dwell,
  events carry `trip_id`, seed state if a trip starts inside its first yard, `missed` only set when the trip completes.
- **Auto-complete: NO silent completion.** On reaching the final destination the operator is prompted to **confirm
  completion** (and enter the end odometer); the backend signals "awaiting confirmation" (shape: backend's call, via
  `trip:update`). `odometer_end_km` stays optional (GPS distance fallback); vehicle odometer is updated when given (C5).
- **Rules (all three accepted):** several `planned` trips per vehicle (check at start); one active driver per vehicle;
  one open yard slot per vehicle — each with a clear 422 message.

### 12.7 Tracker assignment, CRUD, cleanup — §10.3 C2 / §11.6

- **Tracker dropdown:** we want the **"assignable trackers" endpoint** (devices not installed in any vehicle: internal `id`,
  `name`, DevEUI, product). DevEUI acceptance on `assign-device` is **not** needed. B1 stays "422 on non-numeric".
  Until it exists the Tracker Device ID field stays a text input.
- **CRUD — all four in the first batch:** edit vehicle + edit driver; edit yard/slot + geofence centre; deactivate (not
  delete) vehicle/driver/yard where history references them; delete a trip only while `planned`. Frontend's suggested
  build order: edit vehicle/driver → deactivate → edit yard/slot/geofence centre → delete planned trip.
- **Fleet customer ID (trip form):** CRM is out of scope; the optional field is still in the frontend and will be removed
  (payload key `fleet_customer_id`). No backend action needed — informational.

### 12.8 Frontend-only work starting now (no backend dependency)

1. Send `planned_*` datetimes as **ISO 8601 with offset** (fixes F7, the +5 h shift).
2. Send `maintenance_schedule_id` on maintenance logs (per §10.2 B8, so a log resets its schedule).
3. Stale copy + list refresh fixes: map / vehicle-history placeholder text (F2/F3), refetch the Trips list after cancel
   from the modal (F11), disambiguate duplicate vehicle names in the trip form's vehicle select (F5).

**Status: all three done and live-verified 2026-09-24** (real seeded user, real backend): trips now send
`planned_*` as ISO instants (e.g. 10:00 Asia/Karachi → `2026-09-25T05:00:00.000Z`) and the detail modal shows the same
10:00 back, so the +5 h shift is gone; maintenance logs send `maintenance_schedule_id` (a "for schedule" select in the
log form; `201`) — the reset itself can't be verified until backend fixes B8's `next_service_date`; Trips list refreshes
after cancel from the modal; stale map/vehicle-history copy replaced; trip form vehicle select disambiguated with
category + `(#id)`.

**Backend rule worth knowing (found while testing):** `POST /trips` returns 422 "No driver is currently assigned to this
vehicle. Provide driver_id or assign a driver first." when the vehicle has no driver and none is sent. So a driver is
effectively **required** in the trip form; the frontend now marks it required and pre-fills the vehicle's current driver.

### 12.9 Questions back to backend

- Endpoint names + shapes for: attribute role mark/unmark, assignable trackers, trip route, stop arrive/depart.
- Socket payloads for `fleet:position`, `geofence:event`, `trip:update`, incl. the "awaiting completion" signal.
- Which 422 message strings will the new rules (12.6) use, so the UI can show them verbatim.

---

## 13. Backend reply to §12 (2026-09-24, backend) — decisions confirmed, shapes published

All of §12 is **accepted by backend as decided by the owner**, plus four follow-ups the owner approved with "go with all your
recommended things": *destination reached* = last planned stop arrived **or** within 200 m of the destination coordinates;
roles are backfilled once from today's labels and then **role-only**; a yard-linked geofence's centre is edited **through the
yard**; defaults for yard radius (100 m), deactivate, manual arrive/depart and the second-driver rule. Everything in §12.9 —
endpoint names and shapes, socket payloads (incl. the "awaiting completion" signal), the exact 422 strings — is in the new
**`05-fleet-api-design.md`**, with a per-endpoint status (DESIGNED → BUILT). **Don't build against an endpoint until its status is
BUILT** (backend announces each step by updating that file + "Last synced"). Backend builds in 7 steps; step 1 (small fixes,
assignable-trackers, `/fleet/devices/{id}/history`, `/fleet/positions` assigned-only) is in progress.

---

## 14. Frontend: steps 1–3 live re-test + what is now built (2026-09-24, frontend)

Re-tested against the real backend (real seeded user, product 118, ZZ vehicles/drivers/yards) exactly as `05-fleet-api-design.md`
describes. **Nothing wrong found — no new findings row.** Results:

| 05 item | Live result |
|---|---|
| 1.2 event `geofence` object | Geofence events tab now shows real names (`ZZ Fence Yard1`, …); no blanks (F1 gone). |
| 1.4 `next_service_date` | Schedule (30-day interval) shows "Next due 10/24/2026" after a log dated 9/24 that carried `maintenance_schedule_id` → the log **did reset the schedule**. |
| 1.5 `yard_history` | Vehicle-history tab shows "Currently parked" and the **Check Out** button now renders (never did before). |
| 1.6 device history | Map marker click → `GET /fleet/devices/146/history` 200 → trail drawn ("Clear trail" appears). |
| 1.7 positions assigned-only | Map header "1 vehicle reporting a position" (device 147, unassigned, no longer counted). |
| 1.8 `assignable-trackers` | Tracker dropdown lists only free devices; `has_position` false → tagged "no GPS yet" and sorted last; `assign-device {device_id: 147}` 201; unassign 200 and the tracker reappears in the list. |
| 2.1 second driver | `POST /drivers/3/assign-vehicle` → 422 `This vehicle already has an active driver. Unassign them first.` (shown verbatim). |
| 3.1–3.3 roles | `mark-role` heading on `time` 200, badge + status line update; moving Heading to `deviceName` → `replaced_attribute_key: "time"` → toast "Heading moved from "time" to "deviceName""; `unmark-role` 200. Backfilled roles on product 118 render as latitude/longitude/speed. |
| 3.x role-only → Configure | `POST /attribute/preference/setting/store` on an attribute that only had a role returned 201 and **merged into the same preference row** (id 15) — no duplicate row, role kept, and after `unmark-role` the row stayed with its label. Works as we hoped. |

**Not exercised live (couldn't be reached from the UI, so not asserted):** 1.1 non-numeric `assign-device` 422 (the dropdown only sends integers), 2.2 second-slot check-in 422 (needs a vehicle parked in another yard), 2.3 several planned trips + start 422, and the two role-vs-unique-identifier 422s (the UI hides those menu items).

**Frontend now built against BUILT rows (uncommitted at time of writing):** "Mark as location · Latitude/Longitude/Speed/Heading" + "Clear location role" in the attribute ⚙ menu with a role badge, checkbox locked while a role is set, and a "GPS tracking on/off" status line on Product Configuration; the Tracker tab dropdown from `assignable-trackers`; the driver→vehicle dropdown greys out vehicles that already have a driver (rule 2.1). Steps 4–7 stay unbuilt until their rows say BUILT.

**Left over on product 118 from testing:** attribute `time` now carries saved settings (label "ZZ Heading Time", unit km/h, rule 13, widget 11) — harmless test data.

---

## 15. Frontend: step 4 live-verified + built; pending asks for the next round (2026-09-24 17:49 PKT, frontend)

**Step 4 (05 §5) re-tested against the real backend — nothing wrong found, no findings row.** Built against it: trip
detail → **Timeline** gets *Mark arrived / Mark departed* per yard stop (time input defaults to now, sent as a UTC
instant; *Correct arrival/departure* needs a reason — Save is disabled without one and the fixed messages are shown
verbatim) plus a **History (n)** list rendered from `events[]`; trip detail → new **Map** tab and the Fleet **Map** tab's
"Show trip route…" selector both draw `GET /trips/{id}/route` (numbered stops coloured by status, dashed planned path,
driven trail, current position). Also: `awaiting_completion` renders a "Destination reached — confirm completion" banner
(untestable until step 5), and the Complete form's ending odometer is now optional (per 04 §12.6).

| 05 item | Live result |
|---|---|
| 4.1 arrive | `POST /trips/1/stops/1/arrive` on a **completed** trip → 200, stop shows the effective time; `occurred_at` sent as `…Z`. |
| 4.2 depart | 200; stop became `departed`, dwell computed (0 min). |
| replace with reason | Second arrive with `reason` → 200; `events[]` now holds both the original and the correction, oldest first, with `source: manual` and `recorded_by`. |
| 4.3 route | 200 on a completed trip: trail `total_points` 4, `computed_distance_km` 62.652, `current_position` present, stops ordered. Works for a `planned` trip too (no trail). |
| 4.4 events[] | Present on `GET /trips/{id}` stops and arrive/depart responses. |

Not exercised: the two arrive-vs-departure 422s and the >5 000-point thinning (no data for them).

**Pending frontend→backend asks (were held back so the folder wasn't re-copied mid-build) — please answer when convenient:**
1. **Canonical value lists** for `vehicles.fuel_type`, `vehicles.ownership_type`, `drivers.employment_status`,
   `drivers.availability_status` (contract has them as free text; reports/ledger need clean groupings — the frontend
   will render dropdowns from whatever list you define) and the documented **shape of `drivers.certifications`**
   (array of objects, contents unspecified). Frontend has deliberately NOT added these fields to the Add forms yet.
2. **Company-level currency setting** (the Fleet screens currently use one `FLEET_CURRENCY = 'PKR'` constant).
3. **F6** — `GET /fleet/dashboard/alerts` mixes company-wide IoT rule alarms into "Needs Attention". Should the fleet
   dashboard only show fleet-related alerts (offline vehicles, expiring documents/licences, overdue maintenance,
   geofence events)? Owner's call, but please tell us what the endpoint is *meant* to return.
4. **F10** — dashboard "parked" hours for a vehicle with no tracker (`parked = available − driving` gives 168 h/week);
   flagged for the owner, no action needed unless you have a preferred definition.

**Owner scope note (2026-09-24), FYI:** first make the fleet module fully functional against the intended flow; only then
the **financial ledger, reports, graphs and analytics**. CRM and payments stay out of scope except that we will expose
payment APIs (the client integrates them in their own payment modules; we only post responses) — design later.


---

## 16. Backend reply to §15 (2026-09-24 18:03 PKT, backend) — facts answered; ALL FOUR asks now decided by the owner and BUILT (updated 2026-09-24 18:46 PKT)

**Step 4 live-verified by you — thank you.** The two arrive-vs-departure 422s and the >5 000-point thinning are covered by backend's
unit tests and were live-verified on backend's side too. **Step 5 (sensor → trip bridge) is BUILT** — see `05-fleet-api-design.md` §6 "As built (step 5)"
(`awaiting_completion` is now real, so your "Destination reached — confirm completion" banner can be tested against a real trip).
The owner's scope note (fleet fully functional first; ledger/reports/graphs/analytics later; CRM out; payment APIs designed later) is
recorded — backend keeps building steps 6–7 first.

Backend checked each ask against the real Laravel code, the real Node code and the live data. **Facts are answered below; each decision the owner has since made is marked DECIDED/BUILT.**

### 16.1 Value lists for `fuel_type` / `ownership_type` / `employment_status` / `availability_status`, and `certifications`
**Facts (both backends, identical):** these four columns are free-text `varchar(255)` with **no validation and no enum, anywhere** — Laravel never even
accepted them on create (KNOWN_ISSUES 11.3, fixed in Node by D-0077, so Node accepts them today). **Nothing in either backend reads or reacts to the values**
(`availability_status` is never set to `on_trip` by any trip logic) and the live DB holds **no non-null value** in any of them, so a list can be introduced with nothing to migrate.
The only "list" that exists is the *intended* one written in the Laravel migration comments:

| Field | Intended values (Laravel migration comments) |
|---|---|
| `vehicles.fuel_type` | `diesel`, `petrol`, `electric`, `hybrid`, `lpg` |
| `vehicles.ownership_type` | `owned`, `leased`, `rented` |
| `drivers.employment_status` | `full_time`, `part_time`, `contractor`, `terminated` |
| `drivers.availability_status` | `available`, `on_trip`, `on_leave`, `off_duty` |

`drivers.certifications`: Node's schema accepts `null` or an **array of objects with any keys** (nothing validated); the intended shape from the same migration is
`[{ "name": "…", "issued_date": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD" }]`.
**DECIDED by the owner (2026-09-24 18:33 PKT) and BUILT (D-0157): enforced.** The four lists above are now the canonical values (exact lowercase; `null`/omitted still allowed), `POST /vehicles` / `POST /drivers` answer anything else with a fixed 422, `certifications` entries must be `{ name, issued_date?, expiry_date? }` (dates `YYYY-MM-DD`, unknown keys rejected), and **`GET /fleet/options`** returns the lists for your dropdowns — full shapes and messages in `05-fleet-api-design.md` §11. You can add the fields to the Add forms now.

### 16.2 Company-level currency
**Fact:** there is **no company currency** in the schema (`companies` has name/email/address/city/state/country/zip only). Currency exists **per record** on `fleet_customers`,
`contracts`, `rate_cards`, `billable_events` and `invoices` (`varchar`, default `"USD"`, ISO-4217-style); the fleet cost fields (fuel logs, maintenance, vehicle acquisition cost)
carry no currency at all. **DECIDED by the owner (2026-09-24 18:46 PKT) and BUILT (D-0158):** `companies.currency` (ISO 4217, default `USD`) — read it from `GET /companies/{your company id}` (every company response now has `currency`), set it with `PUT /companies/{id}` (`currency` optional in the body). New customers/contracts/rate cards default to it. Details in `05-fleet-api-design.md` §12. **Note:** every company currently reads `USD` until the owner sets the real value — use it instead of `FLEET_CURRENCY` once your company shows the right one.

### 16.3 F6 — what `GET /fleet/dashboard/alerts` is meant to return
**Fact:** it is meant to return exactly what you observed: the company's **open/acknowledged IoT rule alarms** (`alarms` joined to their rule: `type` = rule name, `severity`, `state`),
ordered open-before-acknowledged then newest first, optionally filtered by `?severity=critical,warning,info`; `vehicle_id`/`vehicle_name` are filled **only when the alarm's device is currently installed in a vehicle**
(otherwise `null`). It was never a fleet-specific "needs attention" feed — offline vehicles, expiring compliance documents/licences and overdue maintenance are separate counters on `GET /fleet/dashboard/overview`
(`alerts.*`), and geofence events are their own list. **DECIDED by the owner (2026-09-24 18:46 PKT) and BUILT (D-0159):** `GET /fleet/dashboard/alerts?fleet_only=1` returns only alarms of devices currently installed in a vehicle (default unchanged). Use it for "Needs Attention"; the offline/expiring/overdue counters stay separate (05 §12). A combined feed is deferred to the analytics phase.

### 16.4 F10 — "parked hours" with no tracker
**Fact:** `utilisation.parked_hours = available_hours − driving_hours`, where `available_hours = (number of ALL company vehicles) × hours in the period` and `driving_hours = Σ duration of *completed* trips that started in the period`.
It is pure arithmetic, so a tracker-less (or retired, or brand-new) vehicle reads as fully parked (168 h/week); `idle_hours` is always `0` (documented Laravel limit: no idle tracking). **DECIDED by the owner (2026-09-24 18:46 PKT) and BUILT (D-0160):** the vehicle count behind `available_hours`/`parked_hours` now excludes `retired` and `sold` vehicles (`active` and `in_maintenance` count). A tracker-less active vehicle still reads as parked when it drives no completed trips — that stays by design (05 §12).

---

## 17. Frontend → backend: housekeeping + what is being built (2026-09-24 18:50 PKT, frontend)

**Please don't remove sections.** The copy returned at 18:46 PKT held only §16 — §1–§15 (including the owner's decisions in §12 and
the frontend's §14/§15 results) were gone. The frontend restored them from git and kept your §16 intact. The owner asked that
nothing be dropped or condensed in this folder; the rule is now in `README.md` ("Never delete or condense the other side's
sections"). If a flow file gets too long, archive the whole flow into `archive/` once fully shipped instead of trimming it.

Received and acted on: step 5 BUILT, value lists + `GET /fleet/options`, `companies.currency`, `?fleet_only=1`, parked-hours change.
The frontend is now building: the five new fields in the Add forms (dropdowns from `/fleet/options`, certifications editor),
company currency (read from `GET /companies/{id}`, Currency dropdown in the company details form), "Needs Attention" with
`fleet_only=1`, and a live end-to-end test of the sensor→trip bridge with real webhook packets. Results will follow in a later section.

---

## 18. Frontend: step 5 + value lists + currency + fleet_only live-verified (2026-09-24 19:07 PKT, frontend)

All re-tested against the real backend with real webhook packets (product 118 / device 146 / vehicle 2, yards 1–2). **No defects found — no findings row.**

**Step 5 — sensor → trip bridge (05 §6), end to end:** vehicle parked inside yard 1's geofence, trip with stops yard 1 → yard 2 created and **started** →
stop 1 became `arrived` immediately (`geofence_auto`, the start-seed, 5.3). A packet leaving yard 1 → stop 1 `departed` with `dwell_time_minutes: 0.28`, the exit
event carries `trip_id`. A packet inside yard 2 (last stop) → stop 2 `arrived`, `destination_reached_at` set, `awaiting_completion: true` (`route` agrees). `events[]`
showed `arrive/geofence_auto`, `depart/geofence_auto` on stop 1. The operator UI shows the prompt "Destination reached at … Confirm to complete the trip" and the
timeline labels the times "Sensor". **Confirm completion** with the ending odometer left blank → 200, `actual_distance_km` from GPS (4.56 km). A second trip completed
without ever visiting its stop → the stop is `missed` (5.5). Note (already in 05): yard 2 had only a *manual* geofence, so it could not be detected until a geofence
**linked to the yard** existed — the frontend created `ZZ Fence Yard2` (`yard_id: 2`) through the Geofences tab first, exactly the gap step 7's auto-created geofence closes.

**Value lists (05 §11):** `GET /fleet/options` drives dropdowns in Add Vehicle (`fuel_type`, `ownership_type`) and Add Driver (`employment_status`, `availability_status`,
plus a certifications editor `{name, issued_date, expiry_date}`) — `POST /vehicles` and `POST /drivers` accepted them (201). **Currency (05 §12.1):** the Fleet dashboard reads
`companies.currency`; the company form (Account Settings) now has a Currency dropdown; `PUT /companies/2` with `currency: "PKR"` → 200 and the dashboard switched USD → PKR.
**`fleet_only=1`:** "Needs Attention" now requests it (200, `meta.total` 0).

**One small suggestion (optional, no rush):** `GET /profile` → `user.company` has no `currency`, so the frontend reads `GET /companies/{id}` for it. Adding `currency` to that object would save a request.

**Frontend-built in this round:** the five new Add-form fields, company currency (dashboard + form), `fleet_only`, the trip timeline "Sensor" labels + destination-reached time, "Trip #id" on geofence events, 30 s auto-refresh of in-progress trips (until step 6's sockets).
**Test data left (company 2):** vehicles 5 and 11 (ZZ Truck Details / Lists), drivers 5 and 6 (ZZ Cara Details / ZZ Dan Lists), geofence 3 (`ZZ Fence Yard2`), trips 15 (sensor test, completed) and 16 (missed test, completed), company currency now `PKR`.

---

## 19. Backend reply to §17/§18 (2026-09-24 19:10 PKT, backend) — apology for the truncation, thanks for the step 5 re-test, step 6 is BUILT

**The truncation was backend's bug, and it is fixed.** When backend added §16 it wrote the file with `open(p, "w").write(open(p).read() + section)` — Python truncates the file
when the write-handle is opened, *before* the read runs, so the file was replaced by only the new section and committed that way. Thank you for restoring §1–§15 from your git
history and for the README rule ("Never delete or condense the other side's sections"). Backend now reads the whole file first, appends, and checks the file didn't shrink
(this section was appended that way: the file was **76799 characters before** and only grew). Nothing of yours was edited or removed.

**§18 — received, thank you.** Step 5 (bridge/seed/`missed`), value lists, currency and `fleet_only` all confirmed live by you with real packets — no defects, no findings row. Noted: company
currency is now `PKR` on company 2 (set by you/the owner — nothing on the backend does it), and the test data you left (vehicles 5 and 11, drivers 5 and 6, geofence 3 `ZZ Fence Yard2`,
trips 15 and 16). Your remark that yard 2 needed a geofence *linked to the yard* is exactly the gap step 7's auto-created geofence closes.

**Your optional suggestion — `currency` on `GET /profile` → `user.company`:** fact — that `company` object is the shared "eager-loaded company" shape (it is also `POST /login`'s `user.company`), a
mirror of Laravel's raw `Company` row, and today it has no `currency`. Adding it is an additive one-field change to two existing responses (login + profile), so it needs the owner's go-ahead
(asked; **PENDING OWNER**). Until told otherwise keep reading `GET /companies/{id}`.

**Step 6 (realtime) is BUILT and live-verified** — see `05-fleet-api-design.md` §7 ("As built (step 6)") and `api_contract/API_CONTRACT.md` §4/§4.6. Your sockets get `fleet:position`, `geofence:event`
and `trip:update` automatically when your token has a company and `all-fleet`. **Step 7 (CRUD gaps + yard radius/auto-geofence) is next and the last fleet step.**

---

## 20. Frontend: step 6 (realtime) built + live-verified (2026-09-24 19:18 PKT, frontend)

Thanks for §19 (and the explanation of the truncation) — received; your 19:02 step-6 paragraph, `05` §7 "As built" notes and `API_CONTRACT.md` §4.6 are all present in the
copy the frontend now has, and nothing of yours was touched. Please note the copy you received from us at 19:07 predated them (our working folder had been pasted from your 18:46
copy) — nothing was lost on your side once you restored from git.

**Built:** the frontend subscribes to `fleet:position`, `geofence:event` and `trip:update` (one `useFleetRealtime` hook on the Fleet page) and raises a local "connected" signal
on every socket (re)connect. Positions are patched into the cached map / vehicle detail / trip route / marker trail **in place** (no refetch per packet); `trip:update` refetches
the trip list, that trip's detail + route and the dashboard; `geofence:event` refetches the events list; a reconnect refetches everything fleet-related. Polls are now the slow
safety net from 04 §12.4: **2 min** on Map / Trips / Geofences / vehicle detail, **5 min** on the Dashboard (were 30 s / 15 s); react-query still refetches on window focus.

**Live-tested with real webhook packets (company 2, device 146, trips 17):**
| Event | Result |
|---|---|
| `fleet:position` | Fleet-map vehicle marker moved after a packet with **zero** `GET /fleet/positions` requests. |
| `trip:update` `started` | The Trips list row turned "in progress" on its own (no refresh). |
| `trip:update` `stop_arrived` / `stop_departed` / `destination_reached` | With the trip modal open on the Timeline: stop 1 flipped to arrived ("Sensor") when the tracker entered yard 1; leaving and entering yard 2 flipped the rest; the "Destination reached … Confirm to complete the trip" banner and the Destination stage (Current, arrival time) appeared live. |
| `trip:update` `completed` | After Confirm completion the list row showed "completed" live. |
| `geofence:event` | On the Geofences tab a new "Exited ZZ Fence Yard2" line appeared within ~3 s of the packet (one events refetch per event). |

**Not exercised live:** the reconnect refetch (needs a socket drop) and a user *without* `all-fleet` receiving nothing.

**Two observations, no action required unless you agree:**
1. **No `created` reason on `trip:update`.** Creating a trip sends nothing, so a second operator's Trips list does not show a newly *planned* trip until it is started (or they refresh / the 2-min poll runs). A `reason: "created"` (and `deleted`, once step 7's `DELETE /trips/{id}` exists) would let multi-operator lists stay live. Your call — the current contract is what §4.6 documents.
2. **Vehicle/driver/yard changes (step 7) will have the same gap** — worth deciding whether step 7 gets a company-room event (e.g. `fleet:changed { entity, id }`) or whether the frontend should just rely on refetch-after-own-action + the poll.

**Test data left (company 2):** trips 17 (`realtime test`, completed); the earlier ZZ vehicles/drivers/geofences listed in §18 are unchanged.

---

## 21. Backend: step 7 BUILT — the fleet build is complete on the backend side (2026-09-24 20:54 PKT, backend)

**Step 7 (`05-fleet-api-design.md` §8, "As built (step 7)") is BUILT and live-verified**, so all seven steps of the fleet build are now on the backend: edit vehicle/driver (`PUT`), edit yard and slot (`PUT /yards/{id}`, `PUT /yard-slots/{slotId}`),
deactivate/reactivate vehicle/driver/yard (fixed 422 guards), `POST /yards` with `radius_m` + the **automatically created linked geofence** (the gap you hit in §18 — a new yard with coordinates is detectable by the sensor bridge immediately),
`PUT /geofences/{id}` with a centre for manual geofences (422 for a yard-linked one), `DELETE /trips/{id}` while planned, `?include_inactive=1` on the three lists, and — your §18 suggestion, approved by the owner — **`currency` on `user.company`
in `POST /login` and `GET /profile`**. Suggested frontend order (yours): edit vehicle/driver → deactivate → edit yard/slot/geofence centre → delete planned trip. Nothing is pending from the frontend's side on the backend.

**What is left is your end-to-end re-test of the owner's flow** (vehicle → driver → yards + geofences → assign tracker + driver → trip with yard stops → start → sensor + manual updates → completion prompt → map, all with the live sockets of step 6). Report anything odd as a
findings row; when you confirm the flow the backend closes the fleet task. Frontend test data from your earlier rounds is untouched (vehicles 5 and 11, drivers 5 and 6, geofence 3, trips 15 and 16, company currency `PKR`); backend removed everything it created for its own live checks.

**Re §20 (your step-6 note) — thank you:** confirmed, and the two things you did not exercise live (reconnect refetch, a user without `all-fleet` receiving nothing) are covered on the backend by automated tests (the second by a real Socket.IO + Redis test).
**Your two observations** (a `created` / `deleted` reason on `trip:update`; a company-room event for vehicle/driver/yard changes so other operators' lists stay live) are reasonable additive extensions to `05` §7 — **PENDING OWNER**; nothing changes until decided. Until then rely on refetch-after-your-own-action + the poll. For a trip that is `DELETE`d, no event is emitted (documented in `05` §8).

---

## 22. Frontend: step 7 built + live-verified, and the end-to-end owner flow re-tested (2026-09-24 21:32 PKT, frontend)

Thanks for §21 (and for restoring step 7 in this copy — nothing of yours was touched; `flows/04` came back with 0 removed lines). All of step 7 is built on the frontend and the whole owner flow was re-run
from scratch against the real backend. **No backend defects found — no findings row.** One frontend bug was found and fixed (below).

**Step 7 screens (all live-verified, backend messages shown verbatim):**
| 05 §8 | Frontend | Result |
|---|---|---|
| 7.1 / 7.2 `PUT /vehicles`, `/drivers` | "Edit vehicle" / "Edit driver" inside the detail modal, same field form as Add (shared component); only changed fields are sent | `{"plate":"ZZ-LIST-2"}` → 200; driver phone + availability → 200, untouched fields (employment, certifications) unchanged |
| 7.3 deactivate / reactivate | Deactivate (inline confirm) / Reactivate in the vehicle, driver and yard modals; "Show inactive" toggle on the three lists (`?include_inactive=1`); inactive rows dimmed | vehicle 11 / driver 6 / yard 8: deactivate 200 → hidden from the default list → visible with the toggle → reactivate 200. Guards shown verbatim: `Unassign this vehicle's driver and tracker before deactivating it.` and `Unassign this driver from their vehicle before deactivating them.` |
| 7.4 `POST /yards` `radius_m` | Add Yard has a "Detection radius" field (default 100, shown once coordinates are entered) | `{ "radius_m": 150 }` → 201 with `geofence: { id, radius_m }`; a yard created this way was detected by the sensor bridge immediately |
| 7.5 `PUT /yards/{id}` | "Edit yard" in the yard modal (name, address, location via map picker, radius) | `{"radius_m":200}` → 200 and the linked geofence 11 became 200 m |
| 7.6 `PUT /yard-slots/{id}` | "Edit slot" (number, max length) and "Move slot" (click the layout) in the slot panel | 200 for both; restored afterwards |
| 7.7 `PUT /geofences/{id}` | "Edit" on each geofence row: name, radius, alert-on, and the centre **only for manual geofences** (a yard-linked one shows "change the yard's location" instead) | manual geofence radius + centre → 200 |
| 7.8 `DELETE /trips/{id}` | "Delete trip…" (planned trips only) with an inline confirm | 200 "Trip deleted successfully."; the row disappears and the modal closes (no socket event, as documented); `GET` afterwards 404 |

**End-to-end owner flow (fresh records, company 2):** vehicle 14 "ZZ E2E Truck" (fuel/ownership from `/fleet/options`) → driver 9 → yards A (id 9) and B (id 10) with `radius_m: 300` (geofences 12 and 13 created automatically) → tracker device 147 assigned (dropdown source
`assignable-trackers`) and driver assigned → trip 24 with stops A → B (driver and device snapshotted) → **Start** from the UI → real webhook packets: tracker entered yard A → stop 1 `arrived` (`geofence_auto`, live in the open timeline) → operator marked stop 1 **departed** from the timeline
(manual, dwell 1.18 min) → tracker entered yard B (last stop) → stop 2 `arrived`, `destination_reached_at` set and the "Destination reached … Confirm to complete the trip" banner appeared → the Fleet Map's "Show trip route" drew the stops, planned path, driven trail, destination and
the vehicle → **Confirm completion** from the UI → trip `completed`. Every step used the live sockets of step 6 (no manual refresh). **From the frontend's side the owner flow is confirmed — the backend can close the fleet task.**

**Bug found (frontend, fixed):** the default time in "Mark departed/arrived" was "now" rounded down to the minute, so it could land *before* the arrival or the trip start and backend correctly answered `The time can't be before the trip started.` The time input now carries seconds. No backend change.

**Not exercised live:** reconnect refetch (needs a socket drop) and the two `422`s backend already covers by tests. **Still open on the owner's side (pending decisions, not blocking):** a `created`/`deleted` reason on `trip:update` and a company-room event for vehicle/driver/yard edits (your §21) — until then other operators' lists refresh via the 2-min poll / window focus.

**Test data left (company 2):** vehicle 14, driver 9, yards 7, 8 (both named "ZZ Yard Radius", 7 was created by a retried script), 9, 10 with geofences 10–13, trip 24 (completed); vehicle 11 plate now `ZZ-LIST-2`, driver 6 phone/availability edited, tracker 147 now assigned to vehicle 14. The manual geofence and slot 2 were restored to their original values.

---

## 23. Owner decisions on the two open realtime questions from §21 (2026-09-24 21:41 PKT, frontend + owner)

Both pending items in your §21 are **decided by the owner** (both = the option backend/frontend recommended). This is a request for two small **additive** extensions to `05` §7; nothing is built on the frontend against them until
their rows say **BUILT** (the frontend already refetches the trip list/detail/route on *any* `trip:update` reason, so the trip part needs no frontend change beyond confirming it).

| # | Decision | What we need from backend |
|---|---|---|
| 1 | **`trip:update` also fires for a trip being created and deleted.** | Two new `reason` values, **`created`** (after `POST /trips`) and **`deleted`** (after `DELETE /trips/{id}`), on the existing company-room `trip:update` event. Suggested payload for `deleted`: same envelope with `status` = the last status (`planned`), `stop: null`, plus the trip id, so clients can drop it from lists. Backend's call on the exact shape. |
| 2 | **One generic company-room event for vehicle / driver / yard edits.** | A new event, suggested name **`fleet:changed`**, payload e.g. `{ entity: "vehicle" \| "driver" \| "yard" \| "geofence", id: string, action: "created" \| "updated" \| "deactivated" \| "reactivated" \| "deleted", occurredAt: string }`, emitted to the same `company:{id}` room (same `all-fleet` permission) after `POST` / `PUT` / deactivate / reactivate of vehicles, drivers and yards (and geofence create/edit/delete if easy). Frontend plan: on receipt, refetch the matching list and detail (and dropdowns fed by it). Adding a new entity later (slots, …) must not need a new event. Shape and exact `entity`/`action` values are backend's call. |

Same rules as before apply: best-effort delivery (no replay), clients keep refetch-on-reconnect/focus and the slow safety poll, our own action also echoes back so the frontend re-fetches instead of appending. Please add both to `05` §7 and `API_CONTRACT.md` §4.6 with real
shapes and mark them BUILT when live; the frontend will then subscribe (small: one more listener in the existing realtime hook) and re-test with two operators' sessions.

**Nothing else is pending from the frontend.** The fleet build is otherwise complete and the owner flow is confirmed (§22).

---

## 24. Backend: your §23 requests are already BUILT; end-to-end re-test received; fleet task closed (2026-09-24 21:19 PKT, backend)

The owner said **yes to both** of the observations in §20 (they are additive to step 6):
1. `trip:update` now also has **`reason: "created"`** (a trip was planned) and **`"deleted"`** (`DELETE /trips/{id}`).
2. New company-room event **`fleet:changed { entity, id, action, occurredAt }`** for vehicle / driver / yard / yard_slot / geofence create / update / deactivate / reactivate / delete, and for tracker and driver↔vehicle assignments (as `updated`). No record data — refetch that list.

Full shapes, what is (and deliberately is not) announced, and the echo note are in `05-fleet-api-design.md` §7 "Addendum (D-0163)" and `api_contract/API_CONTRACT.md` §4.2/§4.6. Live-tested on the backend with a real socket client running every one of those actions.
Nothing else is pending from the frontend's side on the backend. *(Backend, 2026-09-25 02:37 PKT: the sentence above was left unfinished when written; it is completed here. Also, the §24 header time "21:19 PKT" is wrong — §24 was written after the 21:44 PKT copy.)*


**Answers to §22 and §23:**
- **§23 — both decisions are already implemented and live** (they were built and verified at 21:19 PKT, right after the owner said yes to your §20 observations; your paste predated that, so the copy you worked from did not have it). Shapes in `05` §7 "Addendum (D-0163)" and `API_CONTRACT.md` §4.2/§4.6: **`trip:update`** has `reason: "created"` (after `POST /trips`) and `"deleted"` (after `DELETE /trips/{id}`; `status: "planned"`, `stop: null`, `awaitingCompletion: false`, `destinationReachedAt: null` — drop the trip from your lists); **`fleet:changed`** = `{ entity: "vehicle" | "driver" | "yard" | "yard_slot" | "geofence", id: string, action: "created" | "updated" | "deactivated" | "reactivated" | "deleted", occurredAt }`, same `company:{id}` room and `all-fleet` gate. It covers vehicles, drivers, yards **and** yard slots and geofences (a new entity later is just a new `entity` value, no new event), and also fires as `updated` on the affected vehicle/driver when a tracker or driver↔vehicle assignment changes. Creating a yard with coordinates also sends `geofence` `created`; editing a yard also sends its linked `geofence` `updated`. Not announced (tell us if you want them): yard check-in/out, fuel/maintenance/compliance/incident writes, CRM records. Your own action echoes back as you planned. **You can subscribe now.**
- **§22 — end-to-end re-test received, thank you.** Nothing needs backend action. The stop-time default you found (rounded to the minute → `The time can't be before the trip started.`) was the backend's rule working as designed; adding seconds on your side is the right fix. Your test data note is recorded (vehicle 14, driver 9, yards 7–10 with geofences 10–13, trip 24, tracker 147 on vehicle 14); backend removed everything it created for its own checks and touches none of yours.
- **The fleet task is closed on the backend side** (`tasks/fleet-completion.md` archived to `tasks/done/`). Anything new the frontend finds should come as a findings row or a new numbered section here.

---

## 25. Frontend: §24 received — `fleet:changed` + `trip:update` created/deleted built and live-verified; nothing else on fleet (2026-09-24 21:53 PKT, frontend)

Thanks for §24 and for closing the fleet task. Received your 21:44 copy (0 lines of ours removed; your restored 05 §7 addendum and contract §4.2/§4.6 are all present).

**Built:** the frontend now subscribes to `fleet:changed` (one more listener in the existing realtime hook) and maps `entity` to the affected lists/details/dropdowns (vehicle, driver, yard incl. its linked geofence, yard_slot, geofence; the dashboard for all).
`trip:update` `created`/`deleted` already refreshed the Trips list, the Fleet-Map trip selector and the dashboard. **Live-tested by simulating a second operator with direct API calls while the screens were open** (nothing touched in the UI):

| Other operator's action | What the open screen did |
|---|---|
| `PUT /vehicles/11` (plate) | Vehicles row showed the new plate within ~3 s |
| `POST /trips` then `DELETE /trips/{id}` | Trips list gained the row (`created`), then dropped it (`deleted`) |
| `POST /yards`, then `POST /yards/{id}/deactivate` | Yards list added it, then removed it |
| `POST /drivers/3/assign-vehicle`, then `unassign-vehicle` | The vehicle row showed the driver, then "No driver" (`fleet:changed` `updated`) |

**Anything else on fleet?** Nothing from the frontend — no findings row. The owner flow is confirmed (§22) and the realtime extras work (this section). The frontend is moving on to other modules; if we find another fleet issue we will add a numbered section here.

**Test data left (company 2):** everything from §22 unchanged; this round only created and immediately removed a planned trip (deleted), a yard "ZZ rt yard" (deactivated, id in the inactive list) and set vehicle 11's plate to a `ZZ-RT-…` value.

---

## 26. Frontend: new flow file `06-fleet-enterprise-readiness.md` — current state audit + the plan to make fleet enterprise level (2026-09-24 22:03 PKT, frontend)

The owner asked whether fleet has proper pagination and full CRUD. Audit result (details, tables and proposals in **`flows/06-fleet-enterprise-readiness.md`**): the owner flow is complete, **but** — trips beyond the first 20 are invisible (backend pages, frontend shows page 1
only); vehicles/drivers/yards/geofences are unpaginated; **no fleet list has search, filters or sorting**; maintenance, fuel logs, compliance documents and incidents have **no edit/delete at all** in the contract; a planned trip cannot be edited
(`PUT /trips/{id}` is unused) and its stops cannot be changed. The owner wants all of that closed before anything else (alerts, reports and the ledger come after). Please read `06` §3 (proposed unified list contract, reusing `GET /companies`' `search` / `sort_by` / `sort_order` /
`per_page` / `page` + `data.items` / `data.pagination`), §3.4 (dropdown options endpoints) and §4/§7 (CRUD gaps and asks B1–B7) and answer with what is feasible. **The frontend starts Phase 1 (list foundation + Trips) now — it needs nothing from backend.**

---

## 27. Frontend: fleet flow closed — everything from here is tracked in `flows/06` (2026-09-24 22:38 PKT, frontend)

This file (§1–§26) is now the **historical record** of the Fleet Management build: analysis → decisions → backend steps 1–7 → realtime → the confirmed end-to-end owner flow. Nothing is pending in it.
**All open Fleet work — enterprise readiness (server-side pagination / search / filter / sort, full CRUD, bulk operations, server-side export, permissions) — lives in `flows/06-fleet-enterprise-readiness.md`**, with the requests to backend as asks **B1–B13** (priority: **B1 server-side lists + B2 dropdown options endpoints**, then B10 bulk, B11 export, B8 map `bbox`, B9 paged sub-lists, B3–B6 CRUD/audit, B12 permissions, B13 concurrency). Please answer there (§8 status log). New Fleet findings should be added as a new numbered section in `flows/06` (or a `findings.md` row).

