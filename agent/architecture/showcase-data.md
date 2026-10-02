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
