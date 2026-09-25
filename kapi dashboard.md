## Testing the Fleet Dashboard APIs

### Step 1 — Get a JWT token (login first)

bash
curl -s -X POST https://api.example.com/api/login \
-H "Content-Type: application/json" \
-d '{"email":"your@email.com","password":"yourpassword"}' \
| python3 -m json.tool

Copy the access_token from the response. Use it in every request below as:
-H "Authorization: Bearer <token>"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Step 2 — Test each endpoint

API #1 — Overview snapshot (today)
bash
curl -s "https://api.example.com/api/fleet/dashboard" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

With a date range (last 7 days)
bash
curl -s "https://api.example.com/api/fleet/dashboard?from=2026-08-25&to=2026-09-01" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

API #2 — Trends (last 30 days, daily buckets)
bash
curl -s "https://api.example.com/api/fleet/dashboard/trends?from=2026-08-01&to=2026-09-01&interval=day" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

Try interval=week or interval=month too.

API #3 — Vehicle performance table
bash
curl -s "https://api.example.com/api/fleet/dashboard/vehicle-performance?from=2026-08-01&to=2026-09-01" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

Sort options: ?sort=distance_km&direction=asc

API #4 — Active alerts
bash
curl -s "https://api.example.com/api/fleet/dashboard/alerts" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

Filter by severity: ?severity=critical,warning

API #5 — Financial breakdown
bash
curl -s "https://api.example.com/api/fleet/dashboard/financial?from=2026-08-01&to=2026-09-01" \
-H "Authorization: Bearer <token>" \
| python3 -m json.tool

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### What to expect with an empty database

If you have no trips/vehicles/fuel logs yet, the responses will return valid JSON with zero values — that's correct, not broken. For example:

json
{
"data": {
"fleet_status": { "total": 0, "moving": 0, "idle": 0, "parked": 0, "offline": 0 },
"trips": { "total": 0, "completed": 0 },
"fuel": { "used_liters": 0 }
}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Common errors and fixes

| Error             | Cause                                      | Fix                                                                                         |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 401 Unauthorized  | Missing or expired token                   | Re-login, use fresh token                                                                   |
| 403 Forbidden     | User lacks all-fleet-management permission | Assign the permission to the user's role via POST /api/roles/create or use an admin account |
| 500 with DB error | Migrations not run                         | Run php artisan migrate                                                                     |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### If you want to test with real data first

Seed a vehicle and trip directly via Tinker:

bash
php artisan tinker

php
// Create a vehicle
$v = App\Domain\Devices\Models\Vehicle::create([
'company_id' => 1,
'name' => 'Truck-Alpha',
'lifecycle_status' => 'active',
]);

// Create a completed trip
App\Domain\Devices\Models\Trip::create([
'company_id' => 1,
'vehicle_id' => $v->id,
'driver_id' => 1,
'status' => 'completed',
'planned_start_at' => now()->subHours(6),
'actual_start_at' => now()->subHours(6),
'actual_end_at' => now()->subHours(1),
'actual_distance_km' => 240,
'actual_duration_minutes'=> 300,
'planned_distance_km' => 250,
'planned_end_at' => now()->subHours(1),
'trip_reference' => 'TRP-001',
]);

Then re-hit the dashboard endpoint — fleet_status.total becomes 1, trips and utilisation show real numbers.

▸ Credits: 1.08 • Time: 48s

9% > give me apis routes with payload details to implement from frontend side

> Here's the complete API reference for the frontend team:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Fleet Dashboard — Frontend API Reference

Base URL: https://api.example.com/api

Auth header required on all requests:
Authorization: Bearer <jwt_token>

Permission required: all-fleet-management

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API #1 — Overview Snapshot

GET /fleet/dashboard

Powers the entire top section of the dashboard: fleet status cards, trip summary, alerts badge, utilisation strip, fuel strip, and financial strip.

Query Parameters

| Param | Type         | Required | Default | Example    |
| ----- | ------------ | -------- | ------- | ---------- |
| from  | date (Y-m-d) | No       | today   | 2026-08-25 |
| to    | date (Y-m-d) | No       | today   | 2026-09-01 |

│ Real-time sections (fleet_status, alerts) always reflect NOW regardless of the date range. Historical sections (trips, utilisation, fuel, financial) respect the range.

Example Request
GET /api/fleet/dashboard?from=2026-08-01&to=2026-09-01

Response
json
{
"success": true,
"meta": {
"from": "2026-08-01",
"to": "2026-09-01",
"generated_at": "2026-09-01T14:00:00+05:00"
},
"data": {
"fleet_status": {
"total": 42,
"moving": 18,
"idle": 7,
"parked": 12,
"offline": 5,
"unknown": 0,
"active_trips": 9
},
"trips": {
"total": 86,
"completed": 61,
"in_progress": 9,
"cancelled": 8,
"planned": 8,
"planned_distance_km": 18420.0,
"actual_distance_km": 17960.0,
"distance_variance_km": -460.0,
"on_time_pct": 82.0,
"avg_duration_minutes": 342.0
},
"alerts": {
"total": 12,
"critical": 1,
"warning": 8,
"info": 3,
"offline_vehicles": 5,
"expiring_documents": 2,
"expiring_driver_licences": 1
},
"utilisation": {
"rate": 78.4,
"driving_hours": 1842.5,
"idle_hours": 0.0,
"parked_hours": 4210.0,
"distance_km": 38420.7,
"available_hours": 6053.0
},
"fuel": {
"used_liters": 8420.0,
"total_cost": 2310000.00,
"average_efficiency_km_per_liter": 4.8,
"cost_per_km": 60.2,
"idle_fuel_liters": null
},
"financial": {
"revenue": null,
"total_cost": 2310000.00,
"profit": null,
"margin": null,
"outstanding": null,
"overdue": null,
"cost_breakdown": {
"fuel": 2310000.00,
"maintenance": null,
"driver": null,
"tolls": null,
"other": null
},
"_note": "revenue, profit and payment data will be populated once the billing module is integrated."
}
}
}

Field Notes for Frontend

- fleet_status — use for the real-time status cards at the top. Clicking a card should deep-link to the relevant module (e.g. moving → Map filtered to moving, offline →
  Vehicles filtered to offline).
- idle_hours and idle_fuel_liters — return 0 and null until IoT telemetry is live. Hide or show a "pending IoT" placeholder.
- on_time_pct — null if no completed trips in range.
- avg_duration_minutes — divide by 60 on the frontend to display as 5h 42m.
- financial.revenue / profit / margin — null until billing ships. Show a "Coming soon" chip rather than zeros.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API #2 — Trends (Charts)

GET /fleet/dashboard/trends

Powers all line/bar charts. Returns time-series arrays bucketed by interval.

Query Parameters

| Param    | Type                 | Required | Default     | Example    |
| -------- | -------------------- | -------- | ----------- | ---------- |
| from     | date (Y-m-d)         | No       | 30 days ago | 2026-08-01 |
| to       | date (Y-m-d)         | No       | today       | 2026-09-01 |
| interval | day \| week \| month | No       | day         | week       |

Example Request
GET /api/fleet/dashboard/trends?from=2026-08-01&to=2026-09-01&interval=day

Response
json
{
"success": true,
"meta": {
"from": "2026-08-01",
"to": "2026-09-01",
"interval": "day",
"generated_at": "2026-09-01T14:00:00+05:00"
},
"data": {
"utilisation": [
{ "date": "2026-08-01", "rate": 72.4, "hours": 18.2 },
{ "date": "2026-08-02", "rate": 68.0, "hours": 16.3 }
],
"distance": [
{ "date": "2026-08-01", "km": 1240.0 },
{ "date": "2026-08-02", "km": 980.5 }
],
"fuel": [
{ "date": "2026-08-01", "liters": 310.0, "cost": 85000.00 },
{ "date": "2026-08-02", "liters": 275.5, "cost": 75800.00 }
],
"trips": [
{ "date": "2026-08-01", "total": 8, "completed": 6, "cancelled": 1 },
{ "date": "2026-08-02", "total": 5, "completed": 5, "cancelled": 0 }
]
}
}

Field Notes for Frontend

- Each array has one object per bucket. Use date as the x-axis label.
- utilisation[].rate → percentage (0–100), use for y-axis on utilisation chart.
- fuel[].cost → raw number in PKR (no currency formatting from backend).
- All four series share the same date values — safe to zip them into a single chart dataset.
- For interval=week, date is the Monday of that week. For interval=month, it's the 1st of the month.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API #3 — Vehicle Performance Table

GET /fleet/dashboard/vehicle-performance

Powers the vehicle ranking table under the Utilisation section.

Query Parameters

| Param     | Type         | Required | Default          | Options                                                                    |
| --------- | ------------ | -------- | ---------------- | -------------------------------------------------------------------------- |
| from      | date (Y-m-d) | No       | today            | —                                                                          |
| to        | date (Y-m-d) | No       | today            | —                                                                          |
| sort      | string       | No       | utilisation_rate | utilisation_rate, distance_km, driving_hours, idle_hours, fuel_used_liters |
| direction | string       | No       | desc             | asc, desc                                                                  |

Example Request
GET /api/fleet/dashboard/vehicle-performance?from=2026-08-01&to=2026-09-01&sort=distance_km&direction=desc

Response
json
{
"success": true,
"meta": {
"from": "2026-08-01",
"to": "2026-09-01",
"sort": "distance_km",
"direction": "desc",
"generated_at": "2026-09-01T14:00:00+05:00"
},
"data": [
{
"vehicle_id": 4,
"vehicle_name": "Truck-Alpha",
"plate": "LEA-1234",
"distance_km": 1240.0,
"driving_hours": 31.2,
"idle_hours": 0.0,
"utilisation_rate": 82.4,
"trip_count": 12,
"fuel_used_liters": 260.0,
"fuel_efficiency": 4.77,
"fuel_cost": 71500.00
},
{
"vehicle_id": 7,
"vehicle_name": "Truck-Beta",
"plate": "LEA-5678",
"distance_km": 1110.0,
"driving_hours": 28.0,
"idle_hours": 0.0,
"utilisation_rate": 71.1,
"trip_count": 9,
"fuel_used_liters": 264.3,
"fuel_efficiency": 4.20,
"fuel_cost": 72600.00
}
]
}

Field Notes for Frontend

- data is a flat array — one object per vehicle, already sorted.
- plate can be null if not entered yet.
- fuel_efficiency — km per litre. null if no fuel logs or no trips in range.
- idle_hours — always 0.0 until IoT telemetry is live.
- Use utilisation_rate thresholds for colour coding: < 40% → red warning, 40–70% → yellow, > 70% → green.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API #4 — Active Alerts

GET /fleet/dashboard/alerts

Powers the "Needs Attention" section. Returns all open and acknowledged alarms enriched with vehicle names.

Query Parameters

| Param    | Type   | Required | Default | Example                      |
| -------- | ------ | -------- | ------- | ---------------------------- |
| severity | string | No       | all     | critical or critical,warning |

Example Request
GET /api/fleet/dashboard/alerts?severity=critical,warning

Response
json
{
"success": true,
"meta": {
"generated_at": "2026-09-01T14:00:00+05:00",
"total": 3
},
"data": [
{
"id": 123,
"type": "Geofence Violation",
"severity": "critical",
"state": "open",
"vehicle_id": 4,
"vehicle_name": "Truck-Alpha",
"device_id": 12,
"message": "Truck-Alpha: Geofence Violation (2 minutes ago)",
"triggered_at": "2026-09-01T13:58:00+05:00",
"created_at": "2026-09-01T13:58:00+05:00"
},
{
"id": 124,
"type": "Speed Limit Exceeded",
"severity": "warning",
"state": "acknowledged",
"vehicle_id": 7,
"vehicle_name": "Truck-Beta",
"device_id": 15,
"message": "Truck-Beta: Speed Limit Exceeded (14 minutes ago)",
"triggered_at": "2026-09-01T13:46:00+05:00",
"created_at": "2026-09-01T13:46:00+05:00"
}
]
}

Field Notes for Frontend

| severity | Colour | Icon |
| -------- | ------ | ---- |
| critical | Red    | 🔴   |
| warning  | Orange | 🟠   |
| info     | Yellow | 🟡   |

- state: "open" → not yet seen by anyone. state: "acknowledged" → seen but not resolved.
- vehicle_name can be null if the device has no vehicle assigned.
- Clicking an alert row should deep-link to the Alarms module: POST /api/alarms/{id}/acknowledge to acknowledge.
- triggered_at is ISO 8601 with timezone — use directly for display.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API #5 — Financial Breakdown

GET /fleet/dashboard/financial

Powers the Financial section. Currently returns fuel costs (the only available financial data). Revenue/profit/outstanding will be populated once the billing module ships.

Query Parameters

| Param | Type         | Required | Default | Example    |
| ----- | ------------ | -------- | ------- | ---------- |
| from  | date (Y-m-d) | No       | today   | 2026-08-01 |
| to    | date (Y-m-d) | No       | today   | 2026-09-01 |

Example Request
GET /api/fleet/dashboard/financial?from=2026-08-01&to=2026-09-01

Response
json
{
"success": true,
"meta": {
"from": "2026-08-01",
"to": "2026-09-01",
"generated_at": "2026-09-01T14:00:00+05:00"
},
"data": {
"revenue": null,
"total_cost": 2310000.00,
"profit": null,
"margin": null,
"outstanding": null,
"overdue": null,
"cost_breakdown": {
"fuel": 2310000.00,
"maintenance": null,
"driver": null,
"tolls": null,
"other": null
},
"_note": "revenue, profit and payment data will be populated once the billing module is integrated."
}
}

Field Notes for Frontend

- All monetary values are raw numbers in PKR (no currency symbol from backend).
- null means "data not yet available" — render a — or a "Coming soon" badge, not 0.
- cost_breakdown is safe to use for a donut/pie chart — skip null slices.
- Once billing ships, revenue, profit, and margin will be populated automatically with no frontend change needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Quick Reference — All Endpoints

| #   | Method | URL                                      | Purpose       | Refreshed                     |
| --- | ------ | ---------------------------------------- | ------------- | ----------------------------- |
| 1   | GET    | /api/fleet/dashboard                     | Full snapshot | Real-time status + date range |
| 2   | GET    | /api/fleet/dashboard/trends              | Chart data    | Date range                    |
| 3   | GET    | /api/fleet/dashboard/vehicle-performance | Vehicle table | Date range                    |
| 4   | GET    | /api/fleet/dashboard/alerts              | Active alarms | Always live                   |
| 5   | GET    | /api/fleet/dashboard/financial           | Cost/revenue  | Date range                    |

## Suggested Refresh Strategy

Fleet status cards → poll every 30 seconds (real-time)
Alerts section → poll every 30 seconds (real-time)
Everything else → fetch once on page load / on date filter change
these are all the KPI dashboard APIs. 5 endpoints total:

| #   | Endpoint                                     | What it feeds                                                                                            |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | GET /api/fleet/dashboard                     | The whole page — status cards, trip numbers, utilisation strip, fuel strip, financial strip, alert badge |
| 2   | GET /api/fleet/dashboard/trends              | All line/bar charts                                                                                      |
| 3   | GET /api/fleet/dashboard/vehicle-performance | Vehicle ranking table                                                                                    |
| 4   | GET /api/fleet/dashboard/alerts              | "Needs Attention" section                                                                                |
| 5   | GET /api/fleet/dashboard/financial           | Financial breakdown + cost donut chart                                                                   |

The typical frontend flow is:

1. On page load → call #1, #3, #4, #5 in parallel
2. On date filter change → re-call #1, #3, #5 (alerts are always live, no date filter)
3. When user opens the charts tab → call #2
4. Every 30 seconds → re-call #1 and #4 to keep status cards and alerts fresh

That's intentionally the complete set. The doc (Yes.txt section 20) explicitly says don't make the frontend call 15 different endpoints just to build a dashboard — one
backend API per dashboard section, backend does all the calculation.
