# Fleet entities — fields the frontend reads/sends (from the form + list code)

All entities are `any` in code (API shapes are deliberately untyped). This list is what the UI actually uses; the authoritative schemas are in `backend_frontend_sync/api_contract/openapi/fleet-*.yaml`. **API is metric** — fields marked (qty) are displayed/typed in the company's unit system (`useUnits`).

## Vehicle (`POST/PUT /vehicles`, `VehicleFields.tsx`)

Send keys: `name` (required), `vehicle_category`, `make`, `model`, `length_m` (qty length), `fuel_type` (dropdown from `/fleet/options`), `ownership_type` (dropdown), `plate`, `vin`, `year`, `odometer_km` (qty distance), `tank_capacity_liters` (qty volume), `cost_centre`, `width_m`, `height_m` (qty length), `gross_weight_kg`, `payload_kg` (qty weight), `acquisition_date`, `acquisition_cost`. Edit sends only changed fields, `null` clears.
Read shape used by screens: list rows `id, name, plate, lifecycle_status (active|in_maintenance|retired|sold), vehicle_category, updated_at, created_by_user/updated_by_user` + current tracker/driver briefs; detail = `{vehicle{…, image_url, current_driver_assignment{driver}, current_device_assignment{device}}, current_position{latitude,longitude,speed,heading,recorded_at}, stats, …}` and adds `maintenance_schedules[], maintenance_logs[], fuel_logs[], fuel economy, compliance docs, yard_history, incidents` (sub-lists are also paged endpoints `/vehicles/{id}/{maintenance-logs|fuel-logs|incidents|yard-history|assignment-history}`).
Actions: `assign-device`/`unassign-device` (tracker from `/vehicles/assignable-trackers`), `deactivate`/`reactivate`, `DELETE` (permanent, guarded), `POST /vehicles/{id}/image` (multipart `image`) / `DELETE`.

## Driver (`POST/PUT /drivers`, `DriverFields.tsx`)

`first_name, last_name, license_number, license_class, license_expiry_date, email, phone, hire_date, payroll_reference, employment_status (dropdown), availability_status (dropdown), certifications[{name, issued_date, expiry_date}]`. `status` (active|inactive|suspended) is changed only by deactivate/reactivate. `license_state` (expired|expiring|valid|none) computed by the server. Actions: `assign-vehicle` / `unassign-vehicle` (assignment always goes through the driver endpoint), `incidents` (POST), compliance documents.

## Yard / slot / geofence

- Yard: `name` (required), `address`, `latitude`+`longitude` (always together), `radius_m` (default 100 m, min 10; qty length; sent only with coordinates) — a yard with coordinates gets an **auto-created linked geofence** that follows edits. Layout image `POST /yards/{id}/layout` (multipart) / `DELETE`. Slots: `POST /yards/{yardId}/slots` (`position_x`/`position_y` as 0–1 fractions of the layout image, `slot_number` (text label), `max_length_m` (qty length, nullable)), `PUT/DELETE /yard-slots/{id}` (delete refused with history), `check-in {vehicle_id}` (422 if vehicle longer than slot), `check-out`.
- Geofence: `name`, `yard_id` (linked) or `center_latitude/center_longitude` (manual only), `radius_m` (default 300 m in the form; qty length), `alert_on` (`enter|exit|both`), `is_active` toggled via PUT; a yard-linked geofence's centre cannot be edited (422 "linked to a yard").

## Trip (`POST/PUT /trips`, `TripEditForm`, `TripStopsEditor`, `Trips.tsx` NewTripForm)

`vehicle_id`, `driver_id` (required unless the vehicle already has one; preselected), `trip_reference`, `purpose`, `origin_address/latitude/longitude`, `destination_address/latitude/longitude` ("Pick on map" via `CoordinatePicker`), `planned_start_at`, `planned_end_at` (ISO instants via `toIsoInstant`), `planned_distance_km` (qty distance), `odometer_start_km` (qty distance), `notes`, `planned_yards[]` (stops: `yard_id, stop_purpose, planned_arrival_at, planned_departure_at, notes`, ≤100 stops; on PUT include `id` for kept stops and only changed fields).
PUT allowed while planned / in progress; vehicle and driver are NOT editable (cancel/delete and recreate); stops editable only while planned. Actions: `start` (empty body), `complete` (`{odometer_end_km, fuel_used_liters, notes}` all optional — backend falls back to GPS distance; the vehicle odometer is updated only when one is given), `cancel` (`{cancellation_reason}` required), `DELETE` (planned only), `stops/{stopId}/{arrive|depart}` (time, reason to correct an existing time), `GET /trips/{id}/route` (planned path + trail + current position), `GET /trips/{id}/gps-trail` (unused).
Read: `status, actual_start_at/end_at, actual_distance_km, delay, planned_yards[{…, status, events[]}]`, `awaitingCompletion`/`destinationReachedAt`, snapshot of the driver at creation.

## Log-type records (`records/fields.ts`, `RecordForm` schema-driven)

- Maintenance schedule: `service_type*, interval_days, interval_km, last_service_date, last_service_odometer_km` (computed due state: overdue/due_soon/ok/unknown by date OR km).
- Maintenance log: `service_type*, service_date*, maintenance_schedule_id, odometer_km, cost, vendor, notes`.
- Fuel log: `fill_date*, unit* (liters|gallons), volume*, odometer_km, cost, vendor, station_name, receipt_reference, is_full_tank` (form defaults to gallons under a US unit system; server converts gallons→litres for reports).
- Compliance document (`documentable_type` vehicle|driver): `document_type*, document_number, issue_date, expiry_date, notes`.
- Incident: `incident_type*, severity* (minor|moderate|severe), incident_date*, description`.
  All `PUT`s: only changed fields, `null` clears, optional `expected_updated_at` (409 conflict). Edit/Delete on each record via `RecordItem`.

## Company/list conventions to remember

`GET /fleet/options` → `fuel_types, ownership_types, employment_statuses, availability_statuses, vehicle_categories` (+ `cost_centres` when backend ask A ships). Lists accept `include_inactive=1`, `has_tracker/has_driver/...` filters as in `Vehicles.tsx`/`Drivers.tsx`/`Yards.tsx` `filterParams`. `…/options` pickers return ≤1000 active records (`meta.truncated`); `assignment-history` and `incidents` are always paged.
