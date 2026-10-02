# Current state & open items (snapshot: end of 2026-09-25 in the original workspace)

## 0a. STATUS 2026-09-27 (read this FIRST — supersedes the 2026-09-29 banner below on any conflict)

Two full task groups done, verified live and pushed on top of the 2026-09-29 snapshot: **T-006-R2** (map "does this look like a real enterprise map" review — hero opening, fleet-list panel, vehicle labels, grouped demo tools, taller map + softer heat, alert strip, richer vehicle cards + trail replay, "moving" recoloured to a dedicated green token) and **T-007** (landing + login + register hook pass, all 5 parts — interactive hero map, proof/testimonials/footer, live night-map auth panel, tabbed product tour, scroll-driven story map). Two real, general map-kit bugs were found and fixed (`ConvoyMap` never resized after mount; a raw `map.easeTo`/`flyTo` call needs `[lon,lat]` not `[lat,lon]`) — see `agent/architecture/map-kit.md`. Full decisions: `agent/work/decisions.md` D1–D8 and T7-1..T7-5. Last pushed commit on `staging`: `e24da95`. Open, all owner-gated: the owner's hands-on feedback, 3D vehicle models (last map step), one full QA pass before any recording, merge-to-`main`/demo recording. Two brand-new reference files exist now and should be read before any live browser work: `agent/browser-testing-playbook.md`, `agent/environment-and-safeguards.md`.

## 0. STATUS 2026-09-29 (read this first)

Branch `staging` pushed (origin ahm-mad/ConvoyAI); `main` untouched (original, reference). Done: T-001 rebrand, T-002 revamp (light orange glass UI), T-003/T-004 QA + enterprise-feel batches, T-005 showcase data layer, **T-006 map (2A) + polish (2B B1–B8) + map v2 (6 features) + visual sweep + full QA**. Open (owner-gated): hands-on feedback on the map/polish; real 3D vehicle models (last step); merge to `main` and demo recording only when the owner says. Known limits/unverified: silhouettes look flat when the map is tilted (accepted until the 3D-model step); Firefox/Safari not tested (owner: not needed); mobile widths of the newest map controls, the ⌘K palette, notification menu, yard/incident/trip forms were re-checked on 2026-09-29 (forms now share `.field`); fullscreen verified twice in a foreground window (2026-09-29: enter/exit by button, all map controls incl. search dropdown + Views popover render inside it, opening a vehicle exits fullscreen and shows the modal; a CDP-injected Esc cannot trigger Chrome's own fullscreen exit, a real Esc does natively); `/api/modules` + monthly-registrations still hit the real backend in showcase mode (by decision).

## 1. What works (owner-tested, "working perfectly with the proper backend")

Everything in the app runs against the real backend: auth (email/password, Google popup OAuth, demo account), navigation with
permission-gated sidebar, products/devices onboarding (HTTPS; CSV bulk import), attribute configuration incl. GPS location roles,
packet history (live), connector health, asset tree + floor plans + stacked 3D building viewer, Rule Builder (email action verified),
alarms, roles/permissions/members/companies (super admin), account settings, simulation (demo only), and **Fleet Management**
(operations + analytics + settings; see `domains/fleet.md`). Backend expected at `NEXT_PUBLIC_API_URL` (`.env.local` currently
`http://localhost:8080/`; it WAS reachable on this machine at the time of writing — `curl localhost:8080/ready` → postgres+redis ok).

## 2. Environment facts for THIS workspace

- Path `/media/chirp/Personal/Freelancing/convoyai`; git: branch `main`, single commit `0dc37df transfered`, **no remote**, working tree was clean.
- `node_modules` is absent → `npm install` first (Node v24.20, npm 11.19). `.next` and `.dev-logs/` exist (build/dev leftovers; `.dev-logs` is gitignored).
- `.env` (Vite-era, unused now) and `.env.local` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MAPTILER_KEY`) exist and contain real keys — never print/commit them.
  Note `.gitignore` ignores `*.local` and `.env`. There is **no** `NEXT_PUBLIC_PUSHER_*` anymore (Pusher was replaced by Socket.IO).
- `.claude/scheduled_tasks.lock` is a tracked junk file. `src/acl/` is an empty directory (alias `@acl` points at it).
- Commands: `npm run dev` (guarded wrapper `scripts/dev-safe.sh`, memory cap 5G via systemd-run, logs in `.dev-logs/`), `npm run dev:raw` (plain `next dev`),
  `npm run dev:report`, `npm run typecheck` (`tsc --noEmit`), `npm run build` (`NODE_OPTIONS=--max-old-space-size=6144` needed locally), `npm run lint`,
  `npm run gen:icons` (verifies `iconData.ts`). See `architecture/overview.md`.

## 3. Deferred / parked — DO NOT START unless the owner says so

| Item                                                                                                                                                                 | Notes                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule Builder **system notification**                                                                                                                                 | Frontend gap: no `notification:new` listener, no bell/notification centre (`BellIcon` unused). Backend has `/notifications` + the event.                                                                                        |
| Rule Builder **SMS** live test                                                                                                                                       | needs owner's phone; **dead per-row Active toggle** in `RuleBuilder.tsx` (~line 303, `handleSingleStatusChangeClick` commented out) — don't touch                                                                               |
| Onboarding **step 3 "Network Protocol — Don't Skip"** hard lock                                                                                                      | owner will bring their own solution; **do not raise again**                                                                                                                                                                     |
| **MQTT**                                                                                                                                                             | UI is "Coming Soon" (real `MQTTProtocol` form commented out in `FourthstepForm.tsx`); backend ingestion path not implemented                                                                                                    |
| Widget dashboard (GridStack), Unity 3D building, widget-type concept                                                                                                 | "redundant for now"; leave `Grid.tsx`, `DynamicImport.tsx`, `forms/DashboardForms/*`, `Widgets/*`, `WEBGL*` alone                                                                                                               |
| **Trip lifecycle / driver experience** (G22–G26)                                                                                                                     | driver acknowledgment enum, automated odometer/trip distance, driver-vs-operator screens (scoped RBAC + driver user accounts), driver-only Start, sensor-confirmed start (100 m radius). Notes only, see `domains/fleet.md` §12 |
| Fleet **ledger/reports E1–E4**, drivers scorecard **B8**, telemetry utilisation **D1→B4**, downtime days, saved views **F2**, scheduled exports **F3**, cost centres | need backend rows or owner go                                                                                                                                                                                                   |
| ~~Fleet frontend leftovers G14/G15/G18/G20/G19~~                                                                                                                     | **MOVED 2026-10-02**: promoted out of this "do not start" backlog into tracked task `agent/work/tasks.md` T-008 (owner asked to add it to the todo list). No longer parked here.                                                |
| Fleet extras: alert rules/notifications, bulk CSV import for vehicles/drivers, driver app, ETA                                                                       |                                                                                                                                                                                                                                 |
| ~~Global UI consistency + enterprise components pass~~                                                                                                               | **MOVED 2026-10-02**: same as above — now tracked as `agent/work/tasks.md` T-008, not an un-tracked "wait for Fleet to finish" item (Fleet IS finished).                                                                        |
| Phase 8 **SEO** (metadata, sitemap, robots, blog, SSR for `/`, `/use-cases`, `/plan-price`)                                                                          | separate follow-up                                                                                                                                                                                                              |
| `strictNullChecks` → `noImplicitAny` → `strict:true`, remove ~161 `@ts-nocheck`, lint backlog (~2900)                                                                | owner-gated                                                                                                                                                                                                                     |
| Product-onboarding: `ManageDevice` search/filter polish vs `ManageProduct`                                                                                           | cosmetic                                                                                                                                                                                                                        |

## 4. Fleet — last known state and what was pending (needs a browser + the real backend)

Frontend was caught up with backend copy stamped **2026-09-25 14:45 PKT** (contract 324 ops). Pending checklist the owner wanted finished before
pasting our sync folder to backend (see `history/task-md-digest.md` §4 for the full text):
axe + eyeball on Overview/Utilisation/Compliance/Settings light+dark; a11y-tree proxy for screen readers; populated year-over-year check with throwaway ZZ
rows dated Sept 2025; `uk` on older screens and yard-create/slot-editor under `us` (announce each temporary unit switch); yard + driver scope on real trips;
10,000-vehicle picker with a throw-away mock; **save `Asia/Karachi` as the real company timezone via Fleet settings (owner said YES)**; then take a sync-folder
snapshot (git tag + copy) and tell the owner it is safe to paste; **remind the owner to ask backend about `odometer_backwards` economy** (flow 07 §33.5 / `findings.md`).
These belong to the original workspace/backend pairing — only relevant if the owner resumes that programme here.

Open asks to backend (flow 07 §34.2): A `cost_centres` in `GET /fleet/options`; B `yard_id`+`cost_centre` filters on maintenance logs/schedules (+exports);
C question: will B4 (utilisation report) carry scope filters? Owner decisions: keep `/fleet-management/legacy`; backend slice order (B8 next); global muted-text token → propose in the UI pass.

**Verification debt (never exercised):** keyboard-only run with a real screen reader; `compare=previous_year` with real data; `uk` beyond Fuel page; yard create/slot editor in
non-metric units; yard/driver scope on real trips; scope picker at scale; visual review of Compliance/Maintenance history/Fuel at widths ≠1536; populated delay charts on real
data; print; older debt: 409 banners on yard/geofence/trip/driver forms, slot toasts, geofence events column at wide width, delete "select all N", B8 map with >2,000 trackers,
bulk actions with the 500 cap, trip stops editor (100-stop limit), yard slot editor/layout upload, list CSV exports.

## 5. Known bugs / quirks (pre-existing, mostly untouched — verify before assuming)

- **401 does not log out** (`axiosConfig.ts` `hardLogout()` commented out; keep unless owner approves). **No route-level RBAC**: permission gating is nav hiding only
  (`LeftSidebar.tsx`); a user can open any URL — pages rely on backend 403s.
- Hydration mismatch warning on `<html className="light">` (ThemeProvider adds class after SSR) and a missing `key` in `LeftSidebar`. Extension noise "A listener indicated an
  asynchronous response…" is not ours. `console.log` debug leftovers exist (Modal `console.log('aa')`, Login Google debug interval marked TEMPORARY, several widgets, `Assets.tsx`).
- `/tutorials` nav item (demo users only) → route commented out (dead link). `Tutorials.tsx` screen exists but isn't routed. `MembersList.tsx` is empty (0 lines).
  `WEBGLMARINA` has no route. `/module-management` and `/plan-management` routes render `<ComingSoon/>` and their sidebar entries are commented out.
- `useSimpleQuery(key, url, { enabled })` in `ProductConfiguration`/`ProtocolIntegration` passes options as `params` so `enabled` never applies (queries always run).
- `Select.tsx` `onOpenAutoFocus` on Radix `Select.Content` is a no-op (searchable autofocus never worked). `VerifyAccount` resend-failure reads `response.error` as a string.
- `HTTPProtocol.tsx` shows a hardcoded webhook URL `https://api.example.com/api/webhook` (backend finding; should derive from env). `/highlight-attributes` 404s in some envs (needs an AI key).
- `AllUser.tsx` has `@ts-nocheck` and an `onRefetch` prop added post-hoc; `usePaginatedQuery` still passes a v4-era `keepPreviousData` (no-op in react-query v5).
- The demo (MSW) backend is frozen at the pre-fleet-enterprise era: it only mocks the OLD fleet endpoints (vehicles/drivers/yards/geofences/trips basic + compliance). New endpoints
  (options, counts, export, bulk, analytics, settings, positions) are NOT mocked → fleet analytics are unusable in demo mode. Owner: demo mode is out of scope for new fleet work.
- **Frontend calls the backend does not serve (as of contract 2026-09-25 14:45; re-verify):** `DELETE /api/account/delete` (Account Settings "delete account" fails), `POST /api/companies/create-with-user` (`AddCompanyForm` fails), `POST /api/companies/bulk/destroy` (wrong path in `SuperAdminDashboard`; real: `POST /companies/bulk-delete`). See `backend/api-contract-index.md`.
- Dead code: whole legacy widget stack, `RightSidebar`, several yup schemas, etc. — list in `architecture/dependency-map.md` §3. Unused deps + transitive-only imports (`@radix-ui/react-switch`, `react-dropdown-menu`, `clsx` rely on `@radix-ui/themes`) in §3b.
- Owner's backend note: **`device_unique_identifier` is globally unique**; MQTT not implemented; JSON body limit 100 KB; no rate limiting.
