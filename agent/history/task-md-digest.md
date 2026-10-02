# Digest of `task.md` (1817 lines, ~300 KB) — the previous workspace's master tracker

> **Naming note (2026-09-26):** this project was renamed from ConvoyAI to **ConvoyAI** (task T-001). Older names in this document (ConvoyAI, FE-ConvoyAI, ConvoyAIFrontend, example.com hosts) are kept as history.

> Source: `/task.md` at repo root. It was written by the previous Claude sessions in the
> ORIGINAL folder (`FE-ConvoyAI`, branch `feat/next-ts-migration`). This copy is a **frozen
> snapshot as of 2026-09-25 evening**. Read this digest instead of re-reading task.md; open
> task.md only for exact wording of a specific block (use `grep -n '^#' task.md` to find it).
> Dates in PKT. "Owner" = the human user (git author `ahm-med`).

## 1. Chronology (what happened, in order)

1. **2026-09-09 — Migration React 19 + Vite 6 SPA → Next.js 15 App Router + TypeScript.**
   Phases 0–7 DONE (Phase 8 SEO = TODO, separate). Key decisions:
   - Faithful port, no redesign. App Router. `'use client'` liberally.
   - Whole app is rendered behind an `ssr:false` client shell (`app/providers.tsx` →
     `next/dynamic(app-shell, {ssr:false})`) so nothing SSRs; avoids all `localStorage`-at-render crashes.
   - `react-router-dom` replaced by a shim `src/lib/router-compat.tsx` (`@lib/router-compat`) on top of
     `next/navigation`; `location.state` bridged via one-slot sessionStorage.
   - `src/pages/` renamed `src/screens/` (Next reserves `src/pages`). Aliases `@pages` and `@screens` both → screens.
   - Env `VITE_*` → `NEXT_PUBLIC_*` (`.env.local`). Vite removed entirely.
   - 49 `app/**/page.tsx`; 3 tab-route families use `[tab]` segment + `notFound()` guard.
   - `vercel.json`: SPA rewrite removed, Unity/DiaryFarm `.gz` headers kept.
   - Asset imports (png/svg/mp4…) → URL string via a webpack rule in `next.config.mjs`.
   - `typescript.ignoreBuildErrors=false`; `tsc --noEmit` clean; ~161–218 files carry
     `// @ts-nocheck -- TODO(ts-migration)`. strictNullChecks / noImplicitAny / strict still OFF.
2. **2026-09-10 — "Strict types for major screens" follow-up**, Units 1–10 done (see `TYPING_HANDOFF.md`).
   API response shapes deliberately stay `any` (`ApiResult` loose). Unit 5b (3 giant fleet files:
   `VehicleDetailModal`, `TripDetailModal`, `FleetDashboard`) deferred.
3. **2026-09-18 — Dev-server memory runaway fixed** (`DEV_PERFORMANCE.md`): `ReactIconDynamicImport`
   pulled ~20 whole react-icons packs; replaced by generated `iconData.ts` (70 used icons) via
   `scripts/gen-react-icon-data.mjs`; guarded dev tooling (`dev-safe.sh`, `dev-monitor.sh`, `dev-report.sh`)
   is the default `npm run dev`.
4. **2026-09-22** — Pusher → **Socket.IO** migration (`contexts/SocketContext.tsx`), `backend_frontend_sync/`
   bridge established, Avatar/navbar fixes, Packet-history page rebuilt (`PacketPayloadViewer`), Asset/Building
   module fixes (floor-plan only on first-level child, subtree devices in the placement panel, 3D multi-floor viewer).
   `AttributeModal` widget-type picker removed (widget dashboard + Unity 3D building deemed redundant by owner).
5. **2026-09-23** — Product onboarding audit + enterprise demo-readiness pass: Tags removed, CSV bulk device import
   built (multipart on `POST /products`, `csvDevices.ts`, `DeviceErrorTable`), `AllDevices.tsx`+`/devices` deleted,
   onboarding modal cut to 2 steps ("Product & Devices" / "Network Protocol"), MQTT "Coming Soon", fixed-size modal,
   `AttributeModal` redesign + "Remove configuration", `createdProductId` retry logic (no orphan products), Connector
   Health label fixes, Home stat hints, React Flow watermark hidden. Rule Builder: email works; SMS + system
   notification deferred.
6. **2026-09-24 — Fleet Management module** built end-to-end vs the REAL Node backend (steps 1–7 on backend):
   vehicles, drivers, trackers, yards (+layout/slots), geofences (+auto-geofence yards), trips (+stops, route, sensor
   bridge), realtime over Socket.IO (`fleet:position`, `geofence:event`, `trip:update`, `fleet:changed`).
   Then **Fleet enterprise-readiness** (flow 06): server-side pagination/search/filter/sort, options endpoints, bulk,
   CSV export, full CRUD, optimistic concurrency 409, audit line, guarded hard delete, viewport (bbox) map.
7. **2026-09-25 — Fleet analytics programme (flow 07)**: Overview dashboard, analytics widget kit, Fleet settings
   (timezone, thresholds), two-level nav (Operations | Analytics), Utilisation / Trips / Fuel / Maintenance
   (schedules, history, compliance) reports, scope bar, compare-year, group-by, per-company unit system
   (metric/us/uk), a11y pass. Ended with everything pushed on `origin` and a "PENDING BROWSER CHECKLIST".

## 2. Standing OWNER RULES (VERY IMPORTANT — apply to every session)

- **Never break what already works** (whole project, both sides). Changing anything existing (endpoint, number,
  screen, shared component, hook, config, bug-fix of existing behaviour) → ASK THE OWNER FIRST (what changes, who is
  affected, recommended option, rollback), only then inform the other side. Purely additive/opt-in work is fine.
  Before "done": `git diff` review, `tsc --noEmit`, live check of neighbouring features, say what wasn't tested.
- **UI quality is non-negotiable**: best, most beautiful enterprise UI. Design first, dark + light, review at ≥1600 px,
  all states (empty/loading/error), WCAG AA, load the `dataviz` skill before chart code, screenshot-review before "done".
- **No hardcoding for foreign clients**: timezone (`/fleet/settings`), currency (company record) and units
  (`utils/units.ts`, `useUnits()`; API is always metric) are per-company. Never write km / L / PKR / a city name in a screen.
- **Make the real product client-worthy** (sellable to an enterprise) — the real flow, NOT the demo account.
- **Never use the demo account (`demoAccount@chirptech.io`) for integration testing** — client-only MSW+Dexie mock.
- **Feature Request Flow (8 steps)** for anything backend-dependent: assess → match vs contract → build UI on mock
  (one removable toggle) → frontend drives the API design → write the exact ask (with JSON example) into
  `backend_frontend_sync/` → owner round-trips folder to backend → integrate for real (delete mock) → ONE live test pass.
- Regression safety: `tsc --noEmit` = 0 and `next build` clean; shared-component changes strictly additive (opt-in props);
  before asking backend to CHANGE an endpoint, grep all call sites.
- Process: decisions via choice lists with a recommended option first; verify live before saying done; logical commits
  with `Co-Authored-By` trailers; **push only when asked**; stage exact files (never `git add -A src`); write docs before
  the owner resets context; tell the owner a copy of `backend_frontend_sync/` is owed whenever it is edited; bump the
  `Last synced` stamp; **never run Prettier on `backend_frontend_sync/`** (it is in `.prettierignore`); never hand-edit `api_contract/`.

## 3. Deferred / parked lists (DO NOT START unless the owner says so)

- Rule Builder: system-notification (`notification:new` listener + bell + `/notifications`), dead per-row Active toggle
  in `RuleBuilder.tsx`, SMS live test (needs owner phone). Email verified working.
- Onboarding step-3 "Network Protocol — Don't Skip" lock — owner will bring their own idea; do NOT raise again.
- Product-onboarding: bulk CSV was built; `ManageDevice` search polish (cosmetic).
- Widget/GridStack dashboard + 3D building (Unity) — "redundant for now"; leave untouched (see `domains/legacy-and-parked.md`).
- Fleet extras: alert rules/notifications, ledger/reports (E1–E4), bulk CSV import for vehicles/drivers, driver app, ETA,
  drivers scorecard B8, D1 telemetry utilisation, downtime days, saved views F2, scheduled exports F3, cost centres.
- **⭐ Global UI consistency + enterprise component pass** — AFTER Fleet is done (ONE global Input/Dropdown/DatePicker…;
  any library allowed; Radix+cva+Tailwind+cmdk recommended; UI only).
- **⭐ Trip lifecycle notes** (NOT started): driver acknowledgment enum, automated odometer/distance, driver vs operator
  screens (scoped RBAC + driver user accounts), driver-only "Start trip", sensor-confirmed start (100 m radius). Gap rows G22–G26.
- Frontend-only fleet leftovers (owner order): G14 multi-select trip status, G15 URL-synced list state, G18 polish
  (skeletons, a11y, saved views), G20 imagery, G19 ZZ test-data cleanup LAST.
- Phase 8 SEO (metadata, sitemap, blog); strictness ladder; lint backlog (~2900).

## 4. State at end of the last session (2026-09-25 ~17:45 PKT)

- Frontend caught up with backend copy stamped `2026-09-25 14:45 PKT` (contract 324 operations).
- Pending BROWSER checklist (needed Chrome): axe + eyeball on Overview/Utilisation/Compliance/Settings light+dark;
  screen-reader proxy; populated year-over-year; `uk` on older screens + yard/slot-editor in `us`; yard+driver scope;
  10,000-vehicle picker; **save `Asia/Karachi` as company timezone (owner said YES)**; then snapshot the sync folder
  (git tag + copy) and tell owner it is safe to paste to backend; remind owner to ask backend the
  `odometer_backwards` fuel-economy question (flow 07 §33.5 / findings.md).
- Open asks to backend (flow 07 §34.2): A `cost_centres` in `GET /fleet/options`; B `yard_id`+`cost_centre` on C1/C2;
  C question whether B4 utilisation will carry scope filters.
- Backend not yet built: B8 drivers scorecard + incidents summary, D1→B4, downtime days, E1–E4 ledger, F2, F3.
- Owner decisions: keep `/fleet-management/legacy`; save Karachi TZ; backend slice order still open (B8 next).
- Git: branch `feat/next-ts-migration` in the ORIGINAL repo, remote `origin=github.com/ahm-med/FE-ConvoyAI`,
  `upstream=MuhammadShoaib756/ConvoyAIFrontend` (never pushed by us).
  **THIS folder (`convoyai`) is a fresh copy: branch `main`, one commit "transfered", no sync tags/history.**
- Real test login (original env): `junead@chaminade-hs.org` / `<test-password>` on backend `http://localhost:8080`
  (owner logs in manually in the MCP Chrome tab; never type the password). Company 2, currency PKR, timezone still UTC.
  Seeded `ZZ*` test data exists in that DB (vehicles/drivers/yards/geofences/trips; product 118) — cleanup deferred (G19).

## 5. Pre-existing warnings/bugs known (not caused by us)

- Hydration mismatch on `<html className="light">` (ThemeProvider sets class after SSR); missing `key` in `LeftSidebar`.
- "A listener indicated an asynchronous response…" = Chrome-extension noise.
- `AllUser.tsx` had an undefined `onRefetch`; `RuleBuilder` used react-query v4 `keepPreviousData` API;
  `useSimpleQuery(key,url,{enabled})` in ProductConfiguration/ProtocolIntegration passes options as `params` (enabled never applies);
  Radix Select `onOpenAutoFocus` prop is dead; VerifyAccount resend-failure reads `response.error` as string. (See TYPING_HANDOFF.)
- 401 → no auto-logout (commented out in `axiosConfig`); no route-level RBAC guard (nav-hiding only).
