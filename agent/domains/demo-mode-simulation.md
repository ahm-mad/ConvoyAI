# Domain: demo mode (MSW + Dexie fake backend) & Simulation

**Purpose:** a client-only demo account (`demoAccount@chirptech.io` / `demoAccount-password`) where `localStorage.user.isDemo === true`. **Owner rule: never use it for integration testing and never build new fleet work on it** (it proves nothing about the real backend; it is unfinished and out of scope).

## How it works

- `app/bootstrap.tsx` (on app start when `isDemo`) or `Login.tsx` (right after typing the demo creds) → `setupDemoMode(true)` (`utils/fakeBackend/browser.ts`): seeds Dexie (`seedDemoData()`), starts the MSW service worker (`public/mockServiceWorker.js`, msw 2.15; do not hand-edit, don't reformat) with `onUnhandledRequest:'bypass'`. `SimulationEngine.resumeAll()` restarts running simulations after reload.
- Realtime in demo mode: `SocketContext` uses a sentinel socket and listens to `window` `MSW_SOCKET_EVENT` CustomEvents dispatched by `fakeBackend/mockSocket.ts` (`triggerMockSocketEvent(name, data)`) with the same names/payload shapes as the real server (`dashboard:update`, `building:update`, `packet:initial`, `device:value`; fleet events are NOT mocked).
- Handlers (`fakeBackend/handlers.ts`, 590 L) register `http.*(`${BASE_URL}api/...`)` where BASE_URL ends with `/` — replicate exactly for any new mock. Controllers: `controllers.ts` (login, analytics, products, dashboards, widgets, assets, simulation engine), `fleetControllers.ts` (794 L, older fleet: vehicles/drivers/geofences/yards/trips/compliance CRUD subset, computed at read time), `db.ts` (Dexie schema v1 IoT tables + v2 fleet tables; seed data), `Data.tsx` (6,655-line seed/reference data — treat as a black box), `helpers.ts` (`wrapInLaravelMockPagination`, date formatters).
- Dexie DB `DemoConvoyDatabase` persists across logout/login (clear it in DevTools if demo data looks stale); to add tables bump `demoDb.version(3)` and declare only new stores.
- Some endpoints intentionally 422 in demo (attribute preference settings, store-product-settings); demo users don't see Map/Rule Builder/Roles/Add asset controls.
- **Not mocked**: fleet options/counts/export/bulk/analytics/settings/positions/attention/… (everything added after the first fleet demo), so the Fleet analytics area is broken for demo users.
- `DemoHelper.isFirstDemo` + `ConvoyDemo` tours: effectively unreachable (see rules doc).

## Simulation (`/simulation`, `screens/Simulation.tsx` 844 L)

Demo-oriented UI to fire fake packets: pick one of 4 demo sensors (Temperature, Humidity, Water Leak, Move — `PRODUCT_CONFIG` with per-sensor input/validation/payload), mode single vs multiple (1–50 packets, interval 15–300 s), summary, `POST /api/simulate-packet`, `GET /api/check-configured-devices`. In demo mode `SimulationEngine.start(payload)` persists to Dexie `simulations` and ticks (`executePacketTick`: writes `deviceValues`, updates device `latest_packet`, triggers mock `dashboard:update` + `building:update`). Linked only from the navbar popper for demo users.
