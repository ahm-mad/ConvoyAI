# Showcase data layer (T-005)

Purpose: the UI is a portfolio piece (screenshots, videos). With the **Showcase data** switch on, every main screen is fed by a
deterministic fake Pakistani fleet ("Indus Freight Co.") instead of the real backend. No backend work, no IndexedDB/MSW.

## How it works

- Switch: account menu → _Showcase data_ (localStorage `convoyai-showcase` = `1`; reload on change; default OFF). StatusBar shows
  "Showcase data · sample fleet"; `UserContext` shows the demo identity (Hassan Raza) while on (display only).
- Hook: `src/utils/apiHelper.ts` → `get()` calls `resolveShowcase(url, params)`; a hit is returned instead of the axios call, a miss falls
  through to the real API. `post/put/del` return a no-op success while on (login/register/logout/forgot/reset/verify/resend/auth excepted).
- `src/utils/showcase/`: `rng.ts` (seeded PRNG + date helpers) · `dataset.ts` (yards, geofences, vehicles, drivers, trips, incidents,
  assignments, geofence events, maintenance schedules/logs, fuel logs, positions, compliance docs) · `metrics.ts` (per-vehicle-per-day
  telemetry model, aggregates, attention feed, performance) · `lists.ts` (paged/filtered/sorted list endpoints + counts + options) ·
  `fleet.ts` (dashboard family) · `analytics.ts` (trips/fuel/maintenance/compliance reports, lazily generated fuel fills) · `details.ts`
  (vehicle/driver/trip/yard details, sub-resources, trip route, device history) · `iot.ts` (products, devices, packets, roles, members,
  profile, companies, connector health) · `index.ts` (router, toggle, identity).
- Resolver order: lists → fleet → analytics → details → iot. URLs are normalised (leading slash, origin/query stripped).
- Response shapes were captured from the real backend (temporary receiver + fetch from the logged-in tab) and match it exactly, including the
  Laravel-paginator envelope used by trips / assignment-history / products / members.

## Conventions when adding an endpoint

Add it to the matching resolver, return the same envelope as the real API (ids as strings in fleet, numbers in products/devices), keep
dates relative to `showcaseNow()`, use only fixture data (no hard-coded currency/timezone/units in components; the fixture company is
PKR / Asia/Karachi / metric). Quick check without a browser: `npx tsx` with a stub `window.localStorage.getItem = () => '1'` and call
`resolveShowcase(url, params)`.

## Known gaps

`/api/modules`, `/api/users/monthly-registrations`, `/api/notifications`-style endpoints and the AI workspace (already static mock) are not
faked; hard-coded old-brand webhook URL `https://api.example.com/api/webhook` in ProductConfiguration / ProtocolIntegration / HTTPProtocol.

## Bus vehicles were generated but never active (fixed 2026-10-02)

`dataset.ts`'s `CATS` array already had a `Bus` row (3 vehicles, idx 50-52) — it just happens to sit exactly in the fixed
"last 8 indices = in_maintenance/retired/sold" tail the status-assignment formula uses, so all 3 came out
`in_maintenance`/`retired` and none ever had `tracker: true` + `status: 'active'` (the two conditions `positionModels`
requires to simulate a live, moving position). The bus 3D vehicle model (T-006 item 2) therefore loaded fine but could
never actually appear anywhere in the showcase map/demo. Fixed with a small explicit swap right after the status
formula: `BUS_IDX` (50,51,52) forced to `'active'`, and 3 of the far more numerous trucks (idx 13-15) take over the
displaced maintenance/maintenance/retired slots instead — so the fleet's totals are completely unchanged (48 active /
4 maintenance / 3 retired / 1 sold, verified on the Vehicles page) but at least one vehicle of every category,
bus included, is now genuinely live. Every downstream consumer (`tripModels`, `positionModels`, `metrics.ts`'s
`activeIdx`, `fleet.ts`'s aggregates) derives from the already-finalized `status`/`tracker` fields at module load, so
nothing needed touching beyond this one swap — verified live (all 3 buses show on the Vehicles list with correct
category/plate, 2 of 3 moving on the Live Map with a real 3D bus model, the swapped trucks show correctly as
`in_maintenance`/`retired` with no crash).
