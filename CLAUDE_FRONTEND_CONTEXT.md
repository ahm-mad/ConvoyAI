# CLAUDE_FRONTEND_CONTEXT.md — FE-ConvoyAI Handoff Document

> **Naming note (2026-09-26):** this project was renamed from ConvoyAI to **ConvoyAI** (task T-001). Older names in this document (ConvoyAI, FE-ConvoyAI, ConvoyAIFrontend, example.com hosts) are kept as history.

> ## ⚠️ ADDENDUM (2026-09-09): this doc predates the Next.js + TypeScript migration
>
> The project was migrated from **React 19 + Vite 6 (SPA, react-router)** to
> **Next.js 15 App Router + TypeScript**. Sections below still describe the Vite
> layout; the _behaviour, features, API integration, demo backend, and business
> logic are unchanged_ — only the framework shell moved. Key deltas:
>
> - **Routing:** `src/routes/AllRoutes.jsx` + `src/App.jsx` + `src/main.jsx` are **deleted**. Routes now live in `app/` (App Router). `app/layout.tsx` (server) → `app/providers.tsx` → `app/app-shell.tsx` (`'use client'`, `next/dynamic` `ssr:false`) holds the whole provider stack from the old `main.jsx`. Route groups: `app/(public)/` (was `NonAuthLayout`) and `app/(app)/` (was `AuthWrapper` guard + `AuthLayout`). One `app/**/page.tsx` per old route; the 3 product tab-route families use a `[tab]` segment.
> - **react-router → `next/navigation`:** every call site imports from **`@lib/router-compat`** (`src/lib/router-compat.tsx`) — a shim exposing `useNavigate/useLocation/useParams/useSearchParams/Link/NavLink/Navigate` on top of `next/navigation`. `location.state` is bridged via a one-slot `sessionStorage` stash.
> - **`src/pages/` was renamed to `src/screens/`** (Next reserves `src/pages` for the Pages Router). `@pages` and `@screens` aliases both point there.
> - **Env:** `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` (`.env.local`).
> - **Bootstrap:** `main.jsx`'s demo-mode setup (MSW + `SimulationEngine.resumeAll`) + `App.jsx`'s Pusher-init effect → `app/bootstrap.tsx`. NProgress (`RouteLoader.jsx`) → `app/route-progress.tsx`.
> - **Build/tooling:** `vite`, `vite.config.js`, `jsconfig.json`, `index.html`, `tailwind.config.js` **removed**. Tailwind v4 now via `@tailwindcss/postcss` (`postcss.config.mjs`). `next.config.mjs` has a webpack rule making `*.png/.svg/.mp4/…` imports resolve to a URL string (Vite behaviour). MUI SSR via `@mui/material-nextjs`. Scripts: `npm run dev|build|start|lint|typecheck`.
> - **TypeScript:** `src/` is 100% `.tsx/.ts`. `tsc --noEmit` is clean and enforced by `next build`. Files not yet fully typed carry `// @ts-nocheck -- TODO(ts-migration)` (grep for it — ~218 files). `strict` is not fully on yet (`strictNullChecks` ~114 / `noImplicitAny` ~291 pending).
> - **Deploy:** `vercel.json` — SPA rewrite removed; Unity `.gz` headers kept + DiaryFarm added.
> - **Full migration log + remaining work:** `task.md` at repo root.
> - **Working with a separate backend Claude session:** see `task.md`'s "WORKING WITH THE BACKEND
>   SESSION" section and `backend_frontend_sync/README.md` — a plain folder (not this doc, not a repo)
>   manually copy-pasted between this repo and `node-backend`.
>
> ---

> ## ⚠️ ADDENDUM 3 (2026-09-25): the Fleet area is now a routed, two-level product (Operations / Analytics / Settings) with an analytics widget kit and per-company units
>
> - **Routes:** `app/(app)/fleet-management/layout.tsx` (two-level nav `src/components/fleet/FleetNav.tsx`, realtime mounted once) → `/operations/{overview,map,vehicles,drivers,geofences,yards,trips,assignments,incidents}`, `/analytics/{utilisation,trips,fuel,maintenance}`, `/settings`; `/fleet-management` redirects to the Overview; the old tabbed hub (`screens/FleetManagement` + `FleetDashboard`) survives only at `/fleet-management/legacy`. The Fleet code map in ADDENDUM 2 is still right for the older screens (they render unchanged inside the new routes).
> - **Analytics kit:** `src/components/analytics/*` (validated palette in `theme.ts`, `WidgetCard`, `KpiTile`, charts, `DataTable` with server mode, `AnalyticsShell`, `FilterBar` …) + data hooks `src/hooks/{useOverviewData,useAnalyticsData,useTripsReport,useMaintenanceSchedules,useCompanyLogs,useFleetSettings,useUnits}.ts`; screens `src/screens/{FleetOverview,FleetUtilisation,FleetTripsAnalytics,FleetFuelAnalytics,FleetMaintenanceAnalytics,MaintenanceHistoryView,FleetSettings}.tsx`. Design + decisions: `FLEET_ANALYTICS_DESIGN.md`.
> - **No hardcoding (foreign clients):** timezone (`/fleet/settings`), currency (company record) and the unit system (`src/utils/units.ts`, `useUnits()`; the API is always metric) are per-company; never write km / L / PKR / a city name into a screen.
> - **Standing rules:** never break what works (ask the owner first, then tell the other side) and UI quality is non-negotiable. **Current state, backend status and how to resume: `task.md` → "▶▶▶▶ RESUME HERE".** The programme with the backend session lives in `backend_frontend_sync/communication/flows/07-fleet-analytics-dashboard.md`.

> ## ⚠️ ADDENDUM 4 (2026-09-25, end of day): Fleet analytics grew a scope bar, year-over-year compare, a group-by chooser, three Maintenance views, a fuel report page and an accessibility layer
>
> - **New pages / views:** Analytics → **Fuel & efficiency** on backend B6 (`hooks/useFuelReport.ts`, `screens/FleetFuelAnalytics.tsx`); Analytics → **Maintenance** has `?view=schedules` (default; C1 + B7 due buckets), `?view=history` (B7 report + C2 log, `screens/MaintenanceHistoryView.tsx`) and `?view=compliance` (`screens/ComplianceView.tsx`, `hooks/useComplianceReport.ts`); `hooks/useMaintenanceReport.ts`.
> - **Filter bar (`src/components/analytics/`):** `useAnalyticsFilters` (range, compare on/off, **`cmp=year`** → `compare=previous_year`, **`interval=day|week|month`** limited by `bucketCount` ≤ 92), `FilterBar`, `AnalyticsShell` (props `scope`, `scopeHints`, `intervalControl`, `comparable`). **Scope bar:** `useAnalyticsScope` + `ScopeBar` (Radix Popover + cmdk — two dependencies added to `package.json`); URL keys `category`, `vehicle`, `yard`, `driver`, `costcentre`; each report page passes ONLY the fields its whole page honours; `FleetNav` `SCOPE_CARRY` decides what follows the operator between reports.
> - **Kit changes (all opt-in, defaults unchanged):** `StackedColumns integer`, `useKpiColumns(count)`, `KpiTile` clickable = card + overlay button, `StatusDonut` empty classes, `charts.tsx` canvas `role="presentation"`, `.a11y-muted` (in `src/index.css`) on `PageScroller` and the Overview scroller = WCAG-AA muted text for the analytics pages only (the app-wide `--color-ink-2` is unchanged).
> - **Units are LIVE on the real backend** (`unit_system` on `GET/PUT /fleet/settings`; default `metric`); the vehicle record lines use the company currency.
> - **Sync folder:** our reply is flow 07 §33 / §34 (+ §34.5) / §35; backend renumbered our old §25–§29 to §27–§31; open items for backend: asks A / B / C and the economy question (§33.5, `findings.md`). **Current state and how to resume: `task.md` → "▶▶▶▶ RESUME HERE" (first-actions checklist = ★ CURRENT STATE item 7).**
> - **Notes only (do NOT start):** the trip lifecycle / driver experience notes — `task.md` "⭐ TODO … TRIP LIFECYCLE" (automated odometer, trip acknowledgment, driver vs operator screens, driver-only Start, sensor-confirmed start).
>
> ---

> ## ⚠️ ADDENDUM 2 (2026-09-24): Fleet Management now runs on the REAL backend — §3.13 / §8 below describe the old demo backend only
>
> - Fleet (Dashboard, Map, Vehicles, Drivers, Yards, Geofences, Trips) is fully integrated with the real Node backend (`http://localhost:8080`, a separate Claude session) and **live-verified end to end**:
>   sensor→trip bridge, manual stop marking, trip route map, edit/deactivate/delete, yard radius with auto-geofence, value-list dropdowns, company currency, GPS attribute roles, and realtime over Socket.IO
>   (`fleet:position`, `geofence:event`, `trip:update`, `fleet:changed`; company room). Demo mode (MSW/Dexie) is out of scope for new fleet work.
> - **Current state, plan, and how to resume:** `task.md` → **"▶▶ RESUME HERE"** (top of file). **Fleet enterprise-readiness** (server-side pagination/search/filter/sort, full CRUD, bulk, export) is the active workstream:
>   `backend_frontend_sync/communication/flows/06-fleet-enterprise-readiness.md`. Full Fleet history/decisions: `flows/04-fleet-management.md` (§1–§25) and API design/status `flows/05-fleet-api-design.md`.
> - **Fleet code map (frontend):** `src/screens/{FleetManagement,FleetDashboard,FleetMap,Vehicles,Drivers,Yards,Geofences,Trips}.tsx`; shared forms/modals `src/components/{VehicleFields,VehicleEditForm,DriverFields,DriverEditForm,DeactivateControls,YardEditForm,YardLayoutEditor,GeofenceEditForm,CoordinatePicker,StopActions,TripRouteMap,TripRouteLayers,TripDetailModal,VehicleDetailModal,DriverDetailModal}.tsx`;
>   list foundation `src/hooks/{useListState,useClientList,useSelection,useBulkAction,useTripsList,useFleetRealtime}.ts` + `src/components/list/{DataToolbar,Pager,BulkBar,SelectableRow}.tsx`; utils `src/utils/{csv,fleetCache,fleetCurrency,fleetOptions,datetime}.ts`; sockets `src/contexts/SocketContext.tsx` (`subscribeFleetEvent`).
> - **⭐ Planned (after Fleet Management is done): a project-wide UI consistency pass — ONE global Input / Dropdown / DatePicker / … used everywhere, any library allowed, UI only (no flow / backend). Details: `task.md` top section "GLOBAL UI CONSISTENCY + ENTERPRISE COMPONENT PASS".**
> - **⭐⭐ Standing owner rule (2026-09-25): never break what already works — the whole project, both sides. Changing anything existing needs the owner's approval FIRST, then inform the other side; additive / opt-in work is fine. Text: `backend_frontend_sync/README.md` "STANDING OWNER RULE".**
> - **⭐ UI quality is a non-negotiable owner requirement (2026-09-25): the best, most beautiful enterprise-grade UI — bar, process and checklist in `FLEET_ANALYTICS_DESIGN.md` §0; the Fleet analytics / dashboard / ledger redesign plan is `FLEET_ANALYTICS_DESIGN.md` + `task.md` "FLEET ANALYTICS / DASHBOARD REDESIGN".**
> - The AI-assistant memory index (`MEMORY.md`, outside the repo) holds the durable owner preferences and process rules; `backend_frontend_sync/` is the copy-pasted bridge to the backend session (never Prettier it).
>
> ---

> **Purpose of this file**: This is a handoff document written by a Claude Code session that spent a long time studying and working on this repository (a "study the whole project" pass, followed by building out the Fleet Management demo backend). It exists so a **new** Claude Code session — likely on a different machine — can get productive fast without re-reading the whole codebase from scratch.
>
> **How to use this document**: Read this file first. Trust it for orientation and for "where do I look" questions. But **this document is a snapshot, not a live source of truth** — the codebase changed several times _during_ the investigation that produced this file (see §18 and the confidence notes throughout), so if something here materially affects a task you're about to do, open the actual file and confirm before relying on it. Confidence level is called out per-section where it matters. Nothing here was invented — anything not directly verified is explicitly marked as such.
>
> **Repo root**: `/home/chirp/FE-ConvoyAI` (path will differ on your machine). **Current branch at time of writing**: `new-convoyai-os`. **Main/base branch**: `main`.
>
> Two other Markdown files exist in the repo root: `README.md` (generic Vite boilerplate — low value, safe to ignore) and `HOW_TO_TEST.md` (a QA checklist from a past redesign pass — summarized in §18 and worth skimming before manual testing). No other project documentation files exist in the repo (searched for anything like an API contract doc referenced in code comments — see §5's "Fleet Dashboard" note — and found none committed).

---

## 1. PROJECT OVERVIEW

**FE-ConvoyAI** is the React frontend for **ConvoyAI** — an IoT / industrial digital-twin dashboard product. It lets companies manage IoT devices/sensors, view a 3D digital twin of a building/farm/marina, build automation rules, and (a newer, actively-developed addition) run a full **Fleet Management** module (vehicles, drivers, trips, geofencing, yard management).

There are sibling directories on the same machine this session ran on — `/home/chirp/ConvoyAI` and `/home/chirp/ConvoyAI-11` — which are the **Laravel backend** (`php artisan serve`, typically on `:8000`/`:8001`). **This document covers the frontend repo only.** A backend `HANDOFF_REPORT` is referenced in a code comment (`LeftSidebar.jsx`, re: Rule Builder vs. a future Workflow Designer) implying the backend repo has its own handoff doc — not read as part of this session, may be worth checking if backend context is needed.

### Stack

- **React 19**, **Vite 6** (dev server / build tool), **Tailwind CSS v4**
- **react-router-dom v7** (`BrowserRouter`)
- **@tanstack/react-query v5** for server state
- **axios** for HTTP
- **zustand** is a listed dependency but this session did not find heavy usage — Context + local `useState` dominate. Treat "is zustand actually used anywhere meaningful" as an open question.
- **react-hook-form + yup** (`@hookform/resolvers`) for forms
- **i18next / react-i18next / i18next-http-backend / i18next-browser-languagedetector** — `en`/`ar` locales, loaded from `/locales/{{lng}}/{{lng}}.json`
- **pusher-js** for realtime in production, with a **mock Pusher bridge** for demo-mode (see §9)
- **Dexie** (IndexedDB) + **msw** (Mock Service Worker) — powers an entire client-side fake backend for demo accounts (see §9 and the whole `src/utils/fakeBackend/` tree)
- UI libraries **coexist**: MUI v6, Radix UI (primitives + `@radix-ui/themes`), **antd** (only `Tree`, used in Assets/digital-twin page), Tailwind v4, framer-motion/`motion`
- **3D/mapping**: a separately-loaded **Unity WebGL** build for the actual digital twin (not Three.js, despite `three`/`@react-three/fiber`/`@react-three/drei` being dependencies — those back smaller pieces); **react-leaflet** + MapTiler tiles for 2D maps
- **Charts**: `chart.js` + `react-chartjs-2` (used in the new Fleet Dashboard), plus `apexcharts`/`react-apexcharts` elsewhere (older charts, not audited in this session for exact usage sites)
- **Diagramming**: `reactflow` + `dagre` (used in `Assets.jsx`'s `FlowChart`)
- **Drag/drop grid**: `gridstack` (legacy widget dashboard, see §14)
- Misc: `nprogress` (route-change loading bar), `react-hot-toast` (toasts), `driver.js`/`react-driver.js` (onboarding tours), `canvas-confetti`, `lottie-web`, `@calcom/embed-react` + `react-calendly` (marketing/guest pages), `i18n-iso-countries`, `react-phone-input-2`

Full dependency list verified directly from `package.json` at the time of writing (see §16 for the file path) — don't re-derive it, just read that file if you need exact versions.

### Build tooling

- `npm run dev` — Vite dev server (`host: true, port: 5173` per `vite.config.js`, but the port is easy to override with `-- --port N`)
- `npm run build` — production build. **Warning**: in the sandboxed environment this session ran in, `vite build` OOM'd with Node's default heap on this repo (huge Unity assets + a big `Data.jsx` seed file + many chunks). It built fine with `node --max-old-space-size=6144 node_modules/.bin/vite build`. On a normal local dev machine this is unlikely to be an issue, but if you hit an OOM during build, that's why.
- `npm run lint` — ESLint. **The repo has ~2900 pre-existing lint errors/warnings** (verified by running it project-wide). Don't be alarmed by a large lint output that isn't related to your change — check `git diff` against lint output to isolate what you actually introduced.
- Path aliases (`@components`, `@pages`, `@contexts`, `@hooks`, `@utils`, `@forms`, `@layout`, `@validation`, `@root`, `@assets`, `@acl`, `@locales`, `@routes`) are defined **identically** in both `vite.config.js` and `jsconfig.json` — if you add a new alias, update both files or imports will resolve in the editor but fail at build/runtime (or vice versa).

### Environment configuration (`.env` at repo root)

```
VITE_API_URL=https://api.example.com/          # real Laravel backend base URL (trailing slash matters, see §5)
VITE_PUSHER_KEY=<PUSHER_KEY_REDACTED>
VITE_PUSHER_CLUSTER=ap2
VITE_MAPTILER_KEY=<MAPTILER_KEY_REDACTED>
```

A commented-out line shows a local backend option: `# VITE_API_URL=http://localhost:8800/`.

### How the frontend talks to the backend

Single axios instance (`axiosConfig.js`) with `baseURL = VITE_API_URL`, a request interceptor injecting `Authorization: Bearer <token>` from `localStorage`, wrapped by `src/utils/apiHelper.js`'s `get/post/put/del` (see §5 for full detail). **In demo mode, none of these requests reach the real backend at all** — MSW intercepts them in-browser (§9).

### Important external integrations

- **Pusher** (realtime channel `broadcast-devices-realtime.{userId}`, events like `dashboard-values-event.{dashboardId}` and `building_values_event.{buildingId}`) — real in prod, faked via `window` CustomEvents in demo mode.
- **MapTiler** for map tiles (light/dark variants tied to app theme) — used in `Map.jsx`, `FleetMap.jsx`, `VehicleDetailModal.jsx`'s mini-map.
- **Unity WebGL** build (`public/unity/Build/ConvoyAI.*.gz`) for the 3D digital twin, bridged via `window.ReactUnityBridge`.
- **Google OAuth** (popup + `postMessage` handoff) for login — see §6.
- **Calendly** (`react-calendly`, `@calcom/embed-react`) — used on marketing/guest pages, not investigated deeply.

---

## 2. REPOSITORY STRUCTURE

```
FE-ConvoyAI/
├── src/
│   ├── main.jsx                 # entry point — provider stack, demo-mode bootstrap (see §11)
│   ├── App.jsx                  # route rendering loop, Modal/RouteLoader mount points, Pusher init
│   ├── index.css                # THE real design-token source (dark-first CSS vars, .light overrides) — see §7
│   ├── i18n.js                  # i18next config
│   ├── contexts/                # UserContext, PusherContext, ThemeContext, ModalContext, ToastContext
│   ├── routes/
│   │   ├── AllRoutes.jsx        # publicRoutes[] and authProtectedRoutes[] arrays — THE routing source of truth
│   │   ├── AuthWrapper.jsx      # redirect-to-login + AuthLayout wrap
│   │   └── RouteLoader.jsx      # NProgress bar on route change
│   ├── layout/                  # AuthLayout.jsx, NonAuthLayout.jsx
│   ├── pages/                   # one file per route (see §4) — flat-ish, ~60+ files
│   ├── components/              # shared components: LeftSidebar, Navbar, Modal, RadixTable, Grid (legacy widget dashboard), *DetailModal.jsx (fleet), Widgets/, DashboardForms/ (implied), etc.
│   ├── hooks/                   # useSimpleQuery.js, usePaginatedQuery.js — thin useQuery wrappers over apiHelper
│   ├── utils/
│   │   ├── apiHelper.js         # get/post/put/del — the API layer everything calls through
│   │   ├── DynamicImport.jsx    # legacy widget-dashboard registry (getWidgetConfig()) — see §14
│   │   └── fakeBackend/         # the ENTIRE demo-mode fake backend — see §9, this is the module this session built out most recently
│   │       ├── browser.js       # setupWorker/setupDemoMode — MSW bootstrap
│   │       ├── db.js            # Dexie schema (demoDb) + seedDemoData() + seedFleetDemoData()
│   │       ├── handlers.js      # MSW http.* route registrations — maps URL patterns to controller functions
│   │       ├── controllers.js   # original (pre-fleet) demo controller logic: login, dashboards, widgets, assets, simulation engine
│   │       ├── fleetControllers.js  # NEW (this session): all Fleet Management demo controller logic
│   │       ├── helpers.js       # wrapInLaravelMockPagination, date formatters
│   │       ├── mockPusher.js    # triggerMockPusher() — window CustomEvent bridge
│   │       └── Data.jsx         # 6654-line seed/reference data file — NOT read in full by this session, treat as a black box unless a task needs it
│   ├── forms/                   # react-hook-form forms, incl. DashboardForms/ (widget settings forms, one per widget type)
│   └── validation/              # yup schemas (e.g. RuleFormSchema.js)
├── public/
│   ├── unity/                   # Unity WebGL build (~46MB)
│   ├── DiaryFarm/                # farm 3D assets (~26MB)
│   ├── locales/en, locales/ar   # i18next translation JSON
│   └── mockServiceWorker.js     # MSW service worker (auto-generated by `msw init` — don't hand-edit; regenerating it via npm postinstall produces a semicolon-formatting-only diff that should generally be reverted if it shows up unexpectedly in `git status`, since it's not a meaningful change)
├── axiosConfig.js                # root-level (not under src/) — axios instance + interceptors
├── reactQueryConfig.js           # root-level — { retry: 1, refetchOnWindowFocus: true }
├── vite.config.js / jsconfig.json  # path aliases (keep in sync), manualChunks (splits anything with 'Grid' in its id into a separate chunk)
├── vercel.json                   # gzip headers for Unity assets + SPA rewrite (deployment target is Vercel)
├── HOW_TO_TEST.md                # QA checklist from a past redesign — see §18
└── styles/global.css             # MOSTLY DEAD — commented-out shadcn/oklch tokens + one real Calendly z-index fix. The real design tokens are in src/index.css, not here. Easy to waste time editing the wrong file.
```

### Architecturally unusual patterns worth knowing up front

1. **Two dashboard systems coexist.** `Dashboard.jsx` (routed) currently renders a simple `DeviceStatusGrid`. The older GridStack drag/drop widget dashboard (`Grid.jsx` + `Widgets/` + `DashboardForms/` + `DynamicImport.jsx` registry) is **fully implemented and still wired to the fake backend**, just not reachable from the current route. See §14.
2. **Demo mode is a parallel universe.** When `localStorage.user.isDemo === true`, an MSW service worker intercepts every REST call the app makes and answers it from an in-browser Dexie IndexedDB, entirely bypassing the real Laravel API. See §9.
3. **Design tokens live in `src/index.css`, not `styles/global.css`.** The latter looks like it should be the design-system file (it's literally named `global.css`) but is almost entirely dead code from an earlier (shadcn-based?) design pass.
4. **The sidebar nav is organized by "product area"** (Dashboard / Core / Connect / Twin / GIS / Studio / Solutions / Operations), each section only rendering if the current user can see ≥1 item in it — see §4.
5. **Fleet Management is a "Solution"** — a vertical-specific pre-packaged experience built on top of the general platform, architecturally distinct (per an explicit code comment in `LeftSidebar.jsx`) from generic platform capabilities like Connect/Twin/GIS.

---

## 3. APPLICATION MODULES / FEATURES

Confidence is marked per module: **HIGH** = read the actual source in this session and/or built it; **MEDIUM** = read some but not all relevant files; **LOW** = only know it exists from route/nav enumeration, contents unverified.

### 3.1 Auth (Login/Register/Password reset) — confidence: HIGH (Login), MEDIUM (rest)

- Pages: `Login.jsx` (471 lines, read in full), `Register.jsx`, `ForgetPassword.jsx`, `ResetPassword.jsx`, `VerifyAccount.jsx`
- Login handles a special demo-account path and a Google OAuth popup flow (see §6). Register/ForgetPassword/ResetPassword/VerifyAccount exist and are routed but were **not read in this session** — status/quality unverified.

### 3.2 Dashboard (device-status grid) — confidence: HIGH

- Route: `/dashboard/:id` → `DashboardWrapper` → `Dashboard.jsx` → `DeviceStatusGrid.jsx`
- Simple searchable/paginated card grid over `GET /api/devices`, shows per-device online/offline status. The `:id` param is accepted but unused by this component.
- See §14 for the parallel legacy widget-dashboard system that still exists underneath this.

### 3.3 Home (analytics landing page) — confidence: HIGH

- Route: `/home` → `Home.jsx`. `/api/dashboard/analytics`-powered stat cards + device tables.

### 3.4 Assets / Digital Twin — confidence: HIGH

- Route: `/assets` → `Assets.jsx` (component internally called `AssetTree`)
- antd `Tree` (asset hierarchy) + `reactflow`-based `FlowChart` + Unity building viewer (`WEBGLBUILDING.jsx`) + `FloorPlanEditor` + `BuildingMultiFloor3DViewer` (a `@react-three/fiber` piece, distinct from the Unity building viewer)
- Live updates via `bindBuildingEvent`/`unbindBuildingEvent` (Pusher/mock-Pusher) when a fullscreen Unity view is open
- **`HOW_TO_TEST.md` explicitly flags this as the single highest-risk area** in the app — antd `Tree` uses a different theming system than the rest of the app (Tailwind CSS vars), so styling regressions here are easy to introduce and easy to miss.
- Related standalone WebGL pages: `WEBGLMARINA.jsx`, `WEBGLFARM.jsx` (routes: `/webgl-farm`; a `/webgl-marina` route was **not found** in the current `AllRoutes.jsx` — `UnityControlMarina` is imported but its route registration wasn't visible in the route list read this session — worth double-checking if you need that page, may be a dead import or a route that exists under a different path).

### 3.5 Rule Builder — confidence: MEDIUM-HIGH

- Routes: `/rule-builder` → `RuleBuilder.jsx` (component `Rule`, `RadixTable`-based list with bulk activate/deactivate/delete); `/new-rule` and `/new-rule/:ruleId` → `AddNewRule.jsx` (uses `useFieldArray`, attribute-mapping helpers — only structure-grepped, not fully read)
- Per a `LeftSidebar.jsx` code comment: "a Rule is functionally a simple single-step workflow; no separate Workflow Designer exists yet" — confirmed against the backend HANDOFF_REPORT per that same comment (backend doc not read by this session).
- Hidden from **demo users** (`isAdmin && !user?.isDemo` gate) — see §4.

### 3.6 Map (2D fleet-agnostic map) — confidence: HIGH

- Route: `/map` → `Map.jsx`. Leaflet + MapTiler, theme-aware tile URL. Hidden from demo users (`isAdmin && !user?.isDemo`).

### 3.7 Manage Product / Product Configuration / Manage Device — confidence: MEDIUM

- `ManageProduct.jsx` (421 lines, read fully) — products list, demo-aware add-product flow (`AddProductModal` in demo vs. real multi-step `AddDevices` flow in prod), bulk delete.
- `ProductConfiguration.jsx` (765 lines, only first ~120 read) — device attribute/protocol config form (HTTP/MQTT tabs per `HOW_TO_TEST.md`).
- `ManageDevice.jsx` (944 lines, only first ~100 read) — tabbed devices/configuration/integration/history page.
- `AttributeModal.jsx` — grew by ~293 lines in a recent commit (`a328289`, "usama code") that this session did **not** review in detail. If a task touches product attribute configuration, read this file fresh.
- `Integration.jsx` (read fully) — simple static integrations table, low complexity.

### 3.8 Simulation (demo-only) — confidence: MEDIUM

- Route: `/simulation` → `Simulation.jsx` (798 lines, ~90 read). Manual fake-packet-firing UI (per-sensor-type inputs, single/multiple sending mode, 1-50 packets, 15-300s interval). Nav item only visible when `user?.isDemo`. Drives `SimulationEngine` in `controllers.js` — see §9.

### 3.9 Roles & Permissions — confidence: HIGH

- Routes: `/roles-permission` and `/members` (both → `RolesPermission.jsx`, 411 lines, read fully). Tabbed Roles/Members admin page. Hidden for demo users.

### 3.10 Super Admin / global management pages — confidence: LOW (routed, imports confirmed, contents NOT read)

This is a real gap in this session's knowledge — flagging honestly rather than guessing. All of these are registered routes with real page components, but their internals were never opened:

- `/users`, `/users/:userId/profile`, `/users/:userId/security`, `/users/:userId/activity` → `AllUser.jsx`
- `/all-products` → `Allproducts.jsx`
- `/devices` → `AllDevices.jsx` (also reachable via `Connect > Device Management` nav item)
- `/companies/list`, `/companies/:companyId/users`, `/companies/:companyId/company-settings`, `/companies/:companyId/assets` → `AllCompaniesList.jsx` / `EditCompany.jsx`
- `/edit-user/:id` → `EditUser.jsx`
- `/internal-user` → `InternalUser.jsx`
- `/assign-permission`, `/assign-permission/:id` → `PermissionToggle.jsx`
- `/all-products/:productId/{devices,configuration,integration}` → `ManageConfiguration.jsx`
- `/edit-products/:productId/{devices,configuration,integration}` → `ManageDeviceConfig.jsx`
- `/analytics` → `SuperAdminDashboard.jsx` (component `SuperAdmindashboard`)
- `/company-location` → `CompanyLocation.jsx`
- `/account-setting` → `AccountSettings.jsx`
- `/plan-price` → `PlanAndPrice.jsx` (public route)

**If a task touches any of these, read the actual file first** — this document cannot tell you their implementation status.

### 3.11 Module Management / Plan Management — confidence: HIGH (they're trivial)

- Routes: `/module-management`, `/plan-management` → both render `<ComingSoon title="..." description="..."/>`. **These are placeholder pages, not implemented.** Nav-gated by `isAdmin || hasPermission('all-module-management' | 'all-plan-management')`.

### 3.12 Alarms / Connector Health — confidence: LOW

- Routes: `/alarms` → `Alarms.jsx`; `/connector-health` → `ConnectorHealthPage.jsx`. Both routed and nav-visible to admins, neither opened this session.

### 3.13 Fleet Management — confidence: HIGH (this session built the demo backend for most of it). See dedicated §8.

### 3.14 Marketing / guest pages — confidence: MEDIUM

- `/` → `GuestHome.jsx` (read fully — marketing landing page composition from `src/GuestHomeComponents/`)
- `/use-cases` → `UseCases.jsx` (not read)
- Calendly/Calcom embeds live here.

---

## 4. ROUTING & NAVIGATION

**Source of truth**: `src/routes/AllRoutes.jsx` (re-verified fresh in this session — the list below is current as of the commit at the top of this document, not stale).

### Public routes (`publicRoutes`, rendered inside `NonAuthLayout`)

```
/login  /register  /forget-password  /plan-price  /verify-token/:token  /  /use-cases  /reset-password
```

### Protected routes (`authProtectedRoutes`, rendered inside `AuthWrapper` → `AuthLayout`, redirect to `/login` if not authenticated)

```
/dashboard/:id
/assets
/manage-product
/map
/profile
/home
/analytics
/users, /users/:userId/profile, /users/:userId/security, /users/:userId/activity
/all-products
/devices
/companies/list, /companies/:companyId/users, /companies/:companyId/company-settings, /companies/:companyId/assets
/company-location
/account-setting
/roles-permission
/alarms
/connector-health
/fleet-management
/members                              (also → RolesPermission.jsx, same as /roles-permission)
/product-configuration/:id
/integration
/edit-user/:id
/internal-user
/assign-permission, /assign-permission/:id
/webgl-building
/webgl-farm
/products/:productId/{devices,configuration,integration,history}   → ManageDevice.jsx
/edit-products/:productId/{devices,configuration,integration}       → ManageDeviceConfig.jsx
/all-products/:productId/{devices,configuration,integration}        → ManageConfiguration.jsx
/rule-builder
/new-rule, /new-rule/:ruleId
/simulation
/module-management
/plan-management
```

**Notable oddities / potential dead code (observed, not fixed per this session's instructions):**

- `{ path: '/tutorials', component: Tutorials }` is **commented out** in `AllRoutes.jsx`, but the sidebar's `Core` section still conditionally renders a "Tutorials" nav item (`user?.isDemo` gate) pointing at `/tutorials` — **this nav item currently leads nowhere** (would hit the catch-all `NotFound`). This is a real, currently-existing mismatch.
- `UnityControlMarina` (`WEBGLMARINA.jsx`) is imported in `AllRoutes.jsx` but no `/webgl-marina` (or similarly-named) route was found registered in `authProtectedRoutes` in this session's read — possible dead import, or the route exists under a name not anticipated (worth a targeted grep before assuming either way).
- Three near-duplicate "manage product devices/config/integration" route families exist (`/products/:productId/...` → `ManageDevice.jsx`, `/edit-products/:productId/...` → `ManageDeviceConfig.jsx`, `/all-products/:productId/...` → `ManageConfiguration.jsx`) — three different page components for what sounds like the same concept from three different entry points (regular admin vs. edit vs. super-admin "all products" list, presumably). Not investigated for actual behavioral differences — don't assume they're interchangeable.
- `/roles-permission` and `/members` both point at the exact same component (`RolesPermission.jsx`) — intentional (it's a tabbed page), not a bug.

### Layout structure

- `NonAuthLayout` wraps public routes.
- `AuthWrapper` checks `isLoggedIn` (from `UserContext`) and redirects to `/login` if false; otherwise wraps in `AuthLayout`, which presumably renders `LeftSidebar` + `Navbar` + route content (not fully verified — `AuthLayout.jsx` was read in this session but its exact JSX structure isn't repeated here; re-check the file if you need exact DOM/layout structure).
- `RouteLoader.jsx` drives an NProgress bar on every `useLocation()` change, mounted once in `App.jsx`.
- `Modal.jsx` is a single global modal mount point (`App.jsx`), driven by `ModalContext` — see §7.

### Navigation / sidebar structure (`src/components/LeftSidebar.jsx`, re-read fresh this session)

Sections, each rendered only if it has ≥1 visible item for the current user:

| Section                      | Items (gate)                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** (always shown) | Home (`/home`) + one item per entry in `dashboardData` prop (per-user dashboard list, `/dashboard/:id`)                                                                                                                                                                                                                   |
| **Core**                     | Companies `/companies/list` (`isSuperAdmin`) · Tutorials `/tutorials` (`user?.isDemo` — **currently a dead link**, see above) · Module Management `/module-management` (`isAdmin \|\| hasPermission('all-module-management')`) · Plan Management `/plan-management` (`isAdmin \|\| hasPermission('all-plan-management')`) |
| **Connect**                  | Manage Products `/manage-product` (`isAdmin`) · Products `/all-products` (`isSuperAdmin`) · Connector Health `/connector-health` (`isAdmin`) · Device Management `/devices` (`isAdmin \|\| hasPermission('all-device-management')`)                                                                                       |
| **Twin**                     | Manage Assets `/assets` (`isAdmin`)                                                                                                                                                                                                                                                                                       |
| **GIS**                      | Map `/map` (`isAdmin && !user?.isDemo`)                                                                                                                                                                                                                                                                                   |
| **Studio**                   | Rule Builder `/rule-builder` (`isAdmin && !user?.isDemo`)                                                                                                                                                                                                                                                                 |
| **Solutions**                | Fleet Management `/fleet-management` (`isAdmin \|\| hasPermission('all-fleet-management')`)                                                                                                                                                                                                                               |
| **Operations**               | Analytics `/analytics` (`isSuperAdmin`) · Alarms `/alarms` (`isAdmin`) · Roles & Permissions `/roles-permission` (`isAdmin \|\| hasPermission('all-role-management'/'all-permission-management'/'all-member-management')`, `&& !user?.isDemo`)                                                                            |

This is a **verified-fresh** re-read of `LeftSidebar.jsx` as of this document — more current than earlier session notes, which had a shorter/older version of this table. If you're told "the sidebar doesn't show X," check this table first, then the actual file (permission gates are the #1 cause of "missing" nav items).

### Route guards

Single guard point: `AuthWrapper.jsx` (`isLoggedIn` check → redirect `/login`). There is **no route-level RBAC guard** — role/permission gating is done entirely by **hiding nav items**, not by blocking route access. This means a user who knows/guesses a URL for a page their role wouldn't normally navigate to may still be able to load it directly (the page component itself would need its own internal guard, if any — not verified whether any page components self-guard). **Flag this as a potential security consideration** if working on anything sensitive (§6 also flags this).

---

## 5. API INTEGRATION

### Client architecture

- `axiosConfig.js` (root-level, not in `src/`) creates the single axios instance: `baseURL = import.meta.env.VITE_API_URL`, `Content-Type: application/json`, request interceptor injects `Authorization: Bearer <token>` from `localStorage.getItem('token')`. A response interceptor has a **commented-out** `hardLogout()` call on 401 + `"Unauthenticated."` — currently 401s do **not** auto-logout the user; this is a deliberate-looking no-op (commented, not deleted), worth understanding before assuming 401 handling works.
- `src/utils/apiHelper.js` wraps the instance: `get(url, params)`, `post(url, data, config, showToast=true)`, `put(...)`, `del(url, config, showToast=true)`. **`post`/`put`/`del` default to wrapping the request in `toast.promise()`** with generic loading/success/error messages — pass the 4th arg `false` to suppress (used heavily throughout the app for forms that show their own success/error toast, or that don't want a toast at all).
- Query hooks: `useSimpleQuery(key, url, params, options)` and `usePaginatedQuery(...)` (`src/hooks/`) are thin `useQuery` wrappers calling `get()`.
- `reactQueryConfig.js`: `{ retry: 1, refetchOnWindowFocus: true }` — global QueryClient default.

### URL construction detail (important if adding new endpoints or MSW handlers)

`VITE_API_URL` ends with a trailing slash (`https://api.example.com/`). Pages call relative paths **with** a leading slash (e.g. `/api/vehicles`). Axios's URL-combining logic collapses the double slash correctly. **The MSW mock handlers must match this exactly** — they're registered as `` `${BASE_URL}api/vehicles` `` (no leading slash on the literal, since `BASE_URL` already ends in one) to produce the identical final URL axios will request. This pattern is used consistently throughout `handlers.js` — replicate it exactly for any new endpoint or the mock won't intercept.

### TanStack Query usage

- Straightforward `useQuery` via the two hooks above; no custom query-key factory pattern beyond `[key, params]`.
- No global cache-invalidation scheme observed — pages call `refetch()` directly on their own query after a mutation (e.g. `onCreated={refetch}` passed into "new X" forms) rather than using `queryClient.invalidateQueries`. This is a consistent, simple pattern across the whole app — **preserve it** rather than introducing `invalidateQueries` calls in isolation, or you'll create an inconsistent mix of refresh strategies.
- Error/loading handling is manual per-component (`isLoading`, checking `data?.success`), not centralized via React Query's error boundaries or a shared error UI.

### Important endpoint groups (grouped by module; `/api/...` paths, relative to `VITE_API_URL`)

- **Auth**: `POST /api/login`, `POST /api/settings/user/update`, `GET /api/profile`
- **Dashboard/analytics**: `GET /api/dashboard/analytics`
- **Products**: `GET/POST /api/products`, `GET /api/products/:id`, `GET /api/product-settings/:id`, `POST /api/products/bulk/destroy`, `GET /api/devices/product/:id`
- **Dashboards (legacy widget system)**: `GET /api/user/:id/dashboards`, `POST /api/dashboards`, `GET/PUT/DELETE /api/dashboards/:id`
- **Widgets (legacy)**: `POST /api/widgets`, `PUT /api/widgets/:id`, `POST /api/widgets/:id/settings`, `PUT /api/widget-settings/:id`, `GET/DELETE /api/widgets/:id`
- **Assets/digital twin**: `GET /api/assets`, `GET /api/assets/:id`, `GET /api/assets/:id/status-summary`, `GET /api/devices/:id`
- **Simulation (demo-only real feature)**: `POST /api/simulate-packet`
- **Fleet Management** (see §8 for full detail; this session built the demo-mode backing for all of these):
  - Vehicles: `GET/POST /api/vehicles`, `GET /api/vehicles/:id`, `POST /api/vehicles/:id/{assign-device,unassign-device,maintenance-schedules,maintenance-logs,fuel-logs}`
  - Drivers: `GET/POST /api/drivers`, `GET /api/drivers/:id`, `POST /api/drivers/:id/{assign-vehicle,unassign-vehicle,incidents}`
  - Geofences: `GET/POST /api/geofences`, `PUT/DELETE /api/geofences/:id`, `GET /api/geofences/events`
  - Yards: `GET/POST /api/yards`, `GET /api/yards/:id`, `POST /api/yards/:id/{layout,slots}`, `POST /api/yard-slots/:id/{check-in,check-out}`
  - Trips: `GET/POST /api/trips`, `GET /api/trips/:id`, `POST /api/trips/:id/{start,complete,cancel}`
  - Compliance (shared vehicles+drivers): `GET/POST /api/compliance-documents`
  - **Not yet backed in demo mode** (real-mode-only today): `GET /api/fleet/positions`, `GET /api/fleet/devices/:id/history` (used by `FleetMap.jsx`), and the 5-endpoint Fleet Dashboard API (`GET /api/fleet/dashboard`, `.../alerts`, `.../vehicle-performance`, `.../financial`, `.../trends`, used by `FleetDashboard.jsx`) — see §8 and §14.

### Frontend/backend mismatches or notable quirks discovered

- A code comment in `FleetDashboard.jsx` references `"kapi dashboard.md" at repo root` as the source of truth for the 5-endpoint Fleet Dashboard API contract — **this file does not exist anywhere in the repo** (searched, confirmed absent). The only spec for that API is the frontend's own consumption code. If backend work is needed on that API, this gap should be flagged to whoever owns the backend.
- `VehicleDetailModal.jsx`'s driver-assignment "Assign" button posts to `/api/drivers/{driverId}/assign-vehicle` (not a `/api/vehicles/{id}/assign-driver` endpoint) — a deliberate reuse noted in a code comment ("No `/api/vehicles/{id}/assign-driver` endpoint exists — the real one lives under drivers"). The demo backend replicates this exact endpoint shape.
- `attribute/preference/setting/*` and `store-product-settings` endpoints are **hardcoded to return a 422 "no permission" error** in the demo MSW handlers (pre-existing, not something this session added) — i.e., those specific features are intentionally non-functional in demo mode.

---

## 6. AUTHENTICATION & AUTHORIZATION

- **Login flow**: `Login.jsx` — standard email/password form, plus a special-cased demo-account path, plus Google OAuth via a popup window + `postMessage` handoff (code comments note COOP — Cross-Origin-Opener-Policy — caveats with this pattern, worth being careful about if touching it, as COOP misconfiguration can silently break the popup handoff).
- **Token handling**: `token` + `user` (JSON) stored in `localStorage`. Injected as `Authorization: Bearer <token>` via the axios request interceptor. No refresh-token flow observed.
- **Session state**: `UserContext` (`src/contexts/UserContext.jsx`, re-verified fully this session) — `user`, `token`, `handleLogin`, `handleLogout` (clears `localStorage`, unsubscribes Pusher, hard-redirects to `/login` via `window.location.href`, not React Router navigation), `updateUser` (careful: only overwrites `uploadedImage` if the new payload includes `profile_image`, to avoid blanking the avatar on partial updates).
- **Roles**: `const roles = user?.roles ? user.roles.map(r => r.name) : user?.role_type ? [user.role_type] : []` — i.e. supports either a full `roles[]` array (real backend, and demo login response) or a flat `role_type` string as a fallback.
- **Permissions**: `const permissions = user?.roles ? user.roles.flatMap(r => (r.permissions || []).map(p => p.name)) : []` — flattened from all of the user's roles' permission lists. `hasPermission(name)` is a simple `permissions.includes(name)`.
- **`isSuperAdmin`** = `roles.includes('super_admin')`, **`isAdmin`** = `roles.includes('admin')`. These two are checked directly (not via `hasPermission`) throughout the nav and most page-level gates — `hasPermission('all-*')` checks are used as an _additional_ OR-condition alongside `isAdmin` in several places (e.g. `isAdmin || hasPermission('all-fleet-management')`), presumably to let a non-admin role with a specific granted permission still see that feature.
- **Protected UI**: exclusively nav-item hiding (§4) plus scattered in-page `isAdmin`/`isSuperAdmin`/`hasPermission`/`user?.isDemo` conditionals (e.g. "Add Product" swapping between demo and real flows). **No centralized route guard checks role/permission** — see the security note in §4, repeated here because it's genuinely important: a page is reachable by direct URL regardless of nav visibility, unless that specific page component does its own check.
- **Tenant/company handling**: `user.company_id` / `user.company` present on the user object (seen in demo login response: `{ user: { ...baseUser, company, roles }, token }`). Not deeply investigated how company-scoping is enforced on the **real** backend (presumably server-side via the token), but nothing in the frontend appears to double-check company ownership client-side beyond what's baked into API responses.
- **Security concerns worth flagging** (observed, not fixed): (1) no client-side route guard beyond "logged in or not" — role/permission bypass by direct URL is plausible if the backend doesn't independently enforce it; (2) 401 auto-logout is commented out (see §5) — a user with an expired/revoked token will see failed requests rather than being redirected to log back in; (3) demo mode's `token: 'demoAccountToken'` is a hardcoded literal in `controllers.js` — fine for demo, but worth knowing it's not a real JWT/opaque token if anyone ever reuses that code path for something real.

---

## 7. UI / DESIGN SYSTEM

- **Libraries**: MUI v6 (`Dialog`, date pickers, icons), Radix UI (`@radix-ui/themes` + individual primitives: accordion, checkbox, select, separator, toggle-group), antd (`Tree` only, in Assets page), Tailwind v4. These genuinely coexist — expect to see MUI components and Tailwind utility classes in the same file regularly. This is an established pattern, not accidental drift — don't "clean it up" by migrating one library to another without being asked.
- **Design tokens**: `src/index.css` — CSS custom properties, dark-first:
  - Surfaces: `--color-surface-0` through `--color-surface-3`
  - Text: `--color-ink-0`, `--color-ink-1`, `--color-ink-2`
  - Lines: `--color-line`, `--color-line-soft`
  - Brand: `--color-accent-cyan` (`#29d3ff` — the brand color; `accent-blue` is aliased to the same value), `--color-accent-green`, `--color-danger`, `--color-warning`
  - A `.light` class on `<html>` redefines all of these for light mode.
  - Utility class `brand-gradient-bg` — used for primary CTAs and the active-nav-item indicator bar.
- **`styles/global.css` is NOT the design-token file** — mostly dead/commented shadcn-era tokens plus one real fix (a Calendly overlay z-index override). Repeating this because it's a very easy trap for a new session to fall into (the filename is misleading).
- **Theme system**: `ThemeContext` — dark by default, toggled via `.light` class on `<html>`, persisted to `localStorage['convoyai-theme']`. `useTheme()` exposes `isLight` (used e.g. to pick MapTiler's light/dark tile URL variant).
- **Reusable components**:
  - `Modal.jsx` — single global modal, MUI `Dialog`-based, driven by `ModalContext`'s `openModal(<Component/>, {preventClose})` / `closeModal()`. Styled with the CSS-var tokens above (`background: var(--color-surface-1)`, etc.) rather than MUI's own theme — consistent with the "Tailwind vars everywhere, MUI just for behavior" pattern.
  - `RadixTable.jsx` (551 lines, first ~60 read) — the shared `DataTable` component used across list pages (Rule Builder, etc.).
  - Toasts: `react-hot-toast`, wired through `ToastContext` and `apiHelper.js`'s automatic `toast.promise()` wrapping on mutations (§5).
  - `LeftSidebar.jsx` — see §4.
  - `Navbar.jsx` (read fully) — avatar popper, language toggle, logout, and a "Simulation" quick-link for demo users.
- **Forms**: see §12.
- **Responsive behavior**: sidebar collapses to icon-only + a mobile overlay/hamburger below `sm:` breakpoint (`LeftSidebar.jsx` has explicit `sm:hidden`/mobile-menu logic). Not exhaustively tested for responsiveness elsewhere in this session.
- **Design conventions**: `text-[Npx]` arbitrary Tailwind values are used heavily for fine-grained typography control (e.g. `text-[11px]`, `text-[10px] uppercase tracking-wider text-ink-2` for section labels) — this is the dominant "small label" pattern across the whole app, including the new Fleet Management pages. Match it rather than introducing standard Tailwind text sizes (`text-xs`/`text-sm`) inconsistently — though those are also used, mixed in, so it's not a hard rule, just the prevailing style.

---

## 8. FLEET MANAGEMENT (detailed — this is the module this session did the most recent hands-on work in)

**Route**: `/fleet-management` → `FleetManagement.jsx` — a single page with an in-page tab bar (not separate routes) rendering, per-tab: `FleetDashboard`, `FleetMap`, `Vehicles`, `Drivers`, `Geofences`, `Yards`, `Trips`. Each existing page component is reused unchanged inside the tab container (per an explicit code comment) — they were originally standalone pages.

### Status per sub-feature

| Feature                                | Frontend UI                                                                                                                                                                                                                                                                          | Real-mode API                                                            | Demo-mode API                                                                                                                        | Notes                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vehicles** (list + detail)           | ✅ Working (`Vehicles.jsx`, `VehicleDetailModal.jsx`)                                                                                                                                                                                                                                | ✅ (assumed real, not verified against backend)                          | ✅ **Built this session**                                                                                                            | List, create, detail w/ tabs: overview, tracker, maintenance, fuel, compliance, vehicle history                                                                                                                                            |
| **Drivers**                            | ✅ Working (`Drivers.jsx`, `DriverDetailModal.jsx`)                                                                                                                                                                                                                                  | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | List, create, detail w/ tabs: overview, incidents, compliance                                                                                                                                                                              |
| **Devices/Trackers**                   | ✅ Working (as a tab inside Vehicle detail, not a standalone page)                                                                                                                                                                                                                   | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | "Tracker" = a GPS device assigned 1:1 to a vehicle; assign/unassign, with a "already installed elsewhere" business rule enforced                                                                                                           |
| **Trips**                              | ✅ Working (`Trips.jsx`, `TripDetailModal.jsx`)                                                                                                                                                                                                                                      | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | Full lifecycle: planned → in_progress → completed/cancelled, with planned-yard-stop waypoints and a visual journey timeline                                                                                                                |
| **Positions** (live vehicle location)  | ✅ Working inside `VehicleDetailModal`'s mini-map                                                                                                                                                                                                                                    | ✅ (assumed)                                                             | ✅ **Built this session** — position jitters slightly + `recorded_at` refreshes on every fetch to simulate live movement             | The **fleet-wide** live map (`FleetMap.jsx`) is a **separate, NOT-yet-demo-backed** endpoint — see below                                                                                                                                   |
| **Geofences**                          | ✅ Working (`Geofences.jsx`)                                                                                                                                                                                                                                                         | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | Create/toggle/delete, event feed, can be centered on a Yard's coordinates or manual lat/lng                                                                                                                                                |
| **Yards**                              | ✅ Working (`Yards.jsx`, `YardLayoutEditor.jsx`)                                                                                                                                                                                                                                     | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | Yard list, click-to-place parking slots on an uploaded layout image, check-in/check-out with a max-vehicle-length validation rule                                                                                                          |
| **Yard layouts/slots**                 | ✅ Working (part of `YardLayoutEditor.jsx`)                                                                                                                                                                                                                                          | ✅ (assumed)                                                             | ✅ **Built this session** — image upload stored as a base64 data URL in IndexedDB (persists across reloads within that browser)      |                                                                                                                                                                                                                                            |
| **Maintenance** (schedules + logs)     | ✅ Working (tab inside `VehicleDetailModal`)                                                                                                                                                                                                                                         | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | `is_overdue_by_date` computed at read time from `last_service_date + interval_days`                                                                                                                                                        |
| **Fuel** (logs + economy)              | ✅ Working (tab inside `VehicleDetailModal`)                                                                                                                                                                                                                                         | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | Economy (km/L) computed from the last two full-tank fills with odometer readings; shows "not enough data" otherwise — **genuinely computed, not fabricated**, matching an explicit design philosophy visible in the original code comments |
| **Compliance** (documents)             | ✅ Working (`ComplianceTab.jsx`, shared by vehicles + drivers)                                                                                                                                                                                                                       | ✅ (assumed)                                                             | ✅ **Built this session**                                                                                                            | Expiry/expiring-soon computed at read time                                                                                                                                                                                                 |
| **Fleet Dashboard** (KPIs)             | ✅ Working UI (`FleetDashboard.jsx`, 1091 lines — added by "usama" per commit `a328289`, Sept 4)                                                                                                                                                                                     | Presumed real endpoints (5-endpoint contract)                            | ❌ **NOT built this session** — out of the explicit scope given ("these top level tabs: Vehicles, Drivers, Geofences, Yards, Trips") | Will 404/fail in demo mode today. If asked to extend demo mode further, this is the next natural target — see §14                                                                                                                          |
| **Fleet Map** (live multi-vehicle map) | ✅ Working UI (`FleetMap.jsx`)                                                                                                                                                                                                                                                       | Presumed real (`/api/fleet/positions`, `/api/fleet/devices/:id/history`) | ❌ **NOT built this session** — same reason as above                                                                                 | Also the next natural target if demo mode is extended further                                                                                                                                                                              |
| **CRM/customers**                      | Partial — a `fleet_customer_id` field exists on the Trip creation form (`NewTripForm` in `Trips.jsx`) as a free-typed numeric ID, but **no dedicated Customers/CRM page or list was found** anywhere in the routes. Likely planned but not yet built, or exists only on the backend. |
| **Contracts/rate cards/vendors**       | ❌ **Not found anywhere in the frontend** — no routes, no components, no API calls referencing these concepts. If asked about this, it doesn't exist yet in this repo.                                                                                                               |

### Demo data seeded (what you'll see if you log in as the demo account and open Fleet Management)

- 3 vehicles (Truck 5 — active, tracker + driver assigned; Sea Breeze — active, no tracker/driver, a yacht; Truck 9 — in_maintenance, tracker assigned, currently checked into a yard slot)
- 2 drivers (one with a healthy license, one with an **expired** license + a logged incident, to demonstrate the warning UI)
- 2 GPS trackers
- 3 yards (Karachi Port Yard — has a generated SVG layout image + 3 slots, one occupied; Lahore Depot and Multan Transit Yard — no layout yet, to demonstrate the empty/upload state)
- 2 geofences + 2 geofence events
- 3 trips — one `completed` (with a planned-yard waypoint stop, full actuals), one `planned` (upcoming), one `in_progress` (to exercise the Complete/Cancel controls)
- Maintenance schedules (one overdue, one not), maintenance logs, fuel logs (2 full-tank fills → a real computed fuel economy), compliance documents (one expiring soon, one expired)

### Architecture of the demo backend (if extending it further, e.g. to cover Fleet Dashboard/Fleet Map)

- **`src/utils/fakeBackend/db.js`**: Dexie schema is versioned (`demoDb.version(1)` = original IoT/dashboard tables, `demoDb.version(2)` = all fleet tables, added this session). **If you add more tables, bump to `version(3)` and only declare the new/changed stores** — Dexie carries forward unchanged tables automatically; this is the correct pattern (already used) for schema migrations on an existing IndexedDB without wiping it.
- **`src/utils/fakeBackend/fleetControllers.js`**: all fleet business logic (pure functions operating on `demoDb`), kept in its own file separate from the original `controllers.js` — a deliberate modularization decision given the size (this file is ~790 lines). **Follow this same pattern** (a new `xControllers.js` file) rather than growing `controllers.js` further, if adding another large chunk of demo functionality (e.g. `fleetDashboardControllers.js`).
- **`src/utils/fakeBackend/handlers.js`**: imports controller functions and registers MSW `http.get/post/put/delete` routes. **Route-matching gotcha**: more specific static paths (e.g. `api/geofences/events`) must be registered where they won't be shadowed by a dynamic `:id` sibling at the same path depth if one existed for the same HTTP method — in the current code this isn't actually a conflict (no GET `/api/geofences/:id` exists), but be aware of this class of bug if adding new dynamic routes.
- All demo IDs use string prefixes like `demo-vehicle-...`, `demo-trip-...` (seed data) or `` `${prefix}-${crypto.randomUUID()}` `` (runtime-created records, via a shared `uid()` helper in `fleetControllers.js`).
- Response envelopes consistently follow the pre-existing convention: `{ data: result, success: true, message: '...' }` for most GETs, bare `{ success, message }` for action endpoints (start/complete/cancel/assign/etc.), and `wrapInLaravelMockPagination(array)` (from `helpers.js`) for endpoints whose real counterpart is Laravel-paginated (currently only `GET /api/trips` in the fleet module — confirmed by reading `Trips.jsx`'s exact unwrapping logic before implementing).

---

## 9. IoT / REAL-TIME FEATURES

- **Telemetry UI**: Widget components (`src/components/Widgets/GeneralWidgets/*.jsx`, e.g. `TankLevel.jsx` read in full) consume `liveValue`/`isAlert`/`widgetSettings` props — part of the legacy widget-dashboard system (§14), still functional, just unrouted from the main Dashboard page today.
- **Realtime transport**: `PusherContext` — real `pusher-js` in production; when `user.isDemo`, swaps to a **mock channel** driven by `window` `CustomEvent('MSW_PUSHER_EVENT', { detail: { eventName, data } })`. Channel name: `broadcast-devices-realtime.{userId}`. Known event names: `dashboard-values-event.{dashboardId}`, `building_values_event.{buildingId}`.
- **No MQTT in the frontend** — MQTT is presumably a backend/device-ingestion concern; the frontend only ever talks HTTP (mocked or real) + Pusher.
- **Live positions**: only implemented for the single-vehicle case (`VehicleDetailModal`'s mini-map, polling every 15s via `refetchInterval`, plus the demo backend jittering the position server-side on each fetch — see §8). The fleet-wide live map (`FleetMap.jsx`) polls `/api/fleet/positions` every 30s in real mode but **has no demo-mode backing yet**.
- **Notifications/events**: toasts (`react-hot-toast`) for action feedback; the geofence "Recent Events" feed in `Geofences.jsx` (`GET /api/geofences/events`, `refetchInterval: 30000`) is the closest thing to an events/notification list in the fleet module.
- **The demo `SimulationEngine`** (`controllers.js`, pre-existing, not modified this session): `POST /api/simulate-packet` → `SimulationEngine.start(payload)`. `'single'` mode fires one packet immediately; interval mode persists to a `simulations` Dexie table and runs on `setInterval`, decrementing a `remainingPackets` counter — `SimulationEngine.resumeAll()` (called from `main.jsx` on app bootstrap) restarts any simulation still `status: 'running'` after a page refresh, so a demo session's fake telemetry survives reloads. Each tick writes a `deviceValues` row, updates the device's `latest_packet` shadow, and calls `triggerMockPusher()` for both the dashboard-widget event and the building/digital-twin event — this is the single mechanism that makes demo mode "feel" realtime for IoT dashboards and the digital twin. **This engine is completely separate from the Fleet Management demo data** built this session — fleet vehicle positions do not go through `SimulationEngine` or trigger Pusher events; they're refreshed synchronously on each `GET /api/vehicles/:id` call instead. If asked to make fleet positions "live" via Pusher too, that would be new work, not something already wired up.
- **Polling/refetch intervals observed**: Dashboard-analytics-style pages generally don't poll; realtime-feeling views use explicit `refetchInterval` on `useSimpleQuery` (15s for single-vehicle detail, 30s for fleet-wide positions/geofence-events/fleet-dashboard-overview/alerts).

---

## 10. IMPORTANT BUSINESS/UI LOGIC

- **Online/offline device logic** (`fetchAnalytics` in `controllers.js`, real backend logic unverified but the demo mirrors what the frontend expects): a device is "online" if its `latest_packet.timestamp` is within the last 2 hours; "active in last 24h" extends that window to 24 hours. This 2-hour threshold is also implicitly assumed by `VehicleMarker.jsx`'s **`isFresh()`** function for GPS trackers, but with a **different threshold — 15 minutes** (`ageMinutes < 15`) — i.e. **two different "freshness" definitions exist in the same codebase** (generic IoT device online/offline = 2h, GPS tracker position freshness = 15min). Don't assume they're the same constant if refactoring either.
- **Trip status machine**: `planned → in_progress → completed | cancelled`. Enforced only by which action buttons the UI shows for each status (`TripDetailModal.jsx`) — no explicit state-machine validation library, just conditional rendering. The demo backend's `completeTrip()`/`cancelTrip()`/`startTrip()` don't validate the current status before transitioning either (e.g. calling "complete" on an already-completed trip in demo mode wouldn't be blocked) — **this mirrors what the frontend UI already prevents via button visibility**, but isn't independently guarded server-side (real or demo).
- **Fuel economy calculation**: `(odometer_km of latest full-tank fill − odometer_km of previous full-tank fill) / volume of latest fill`, requires ≥2 full-tank fills with odometer readings; shows "not enough data" otherwise (both in the real UI's copy and the demo backend's null-return). Explicitly **not** computed from partial fills.
- **Maintenance overdue logic**: `next_service_date = last_service_date + interval_days`; `is_overdue_by_date = next_service_date < now`. Computed at read time, not stored — so it's always current relative to "now," not stale from creation time.
- **License expiry logic** (drivers) and **compliance document expiry** (vehicles/drivers, shared `ComplianceTab`): `is_expired = expiry_date < now`; `is_expiring_soon = 0 <= (expiry_date − now) <= 30 days`. Same 30-day threshold used in both places (driver license and generic compliance documents) — this was an intentional match made when building the demo backend, based on the real frontend's copy ("License expires within 30 days").
- **Vehicle/driver/tracker assignment rules** (enforced in both the real UI's expectations and the demo backend, per explicit code comments in the original files): a vehicle can hold **one active tracker** at a time, and **one active driver** at a time; a driver can be assigned to **one active vehicle** at a time. Assigning a new one implicitly deactivates the previous assignment (kept in history, not deleted) rather than requiring an explicit unassign-then-assign from the user.
- **Yard slot check-in validation**: rejects check-in if `vehicle.length_m > slot.max_length_m`, surfacing the specific real-backend-style error message rather than a generic failure (per an explicit code comment: "Surfaces the real size-validation message... not a generic error").
- **Filtering/sorting**: `FleetDashboard.jsx`'s vehicle performance table supports column-sort (toggling asc/desc) via local state passed as `sort`/`direction` query params to `/api/fleet/dashboard/vehicle-performance` — this is a real-mode-only feature today (see §8, that endpoint has no demo backing yet), so sorting will silently do nothing useful in demo mode until that gap is filled.
- **Permission-based behavior**: covered in §4/§6; the recurring pattern app-wide is `isAdmin || hasPermission('all-<feature>-management')` for nav visibility, and `user?.isDemo` for swapping real vs. demo-safe action flows (e.g. "Add Product").

---

## 11. STATE MANAGEMENT

- **Contexts** (`src/contexts/`, all re-confirmed at least partially this session):
  - `UserContext` — see §6.
  - `PusherContext` — see §9.
  - `ThemeContext` — see §7.
  - `ModalContext` — single global modal, `{ modal: { isOpen, content, preventClose }, openModal, closeModal }`.
  - `ToastContext` — wraps `react-hot-toast`'s `Toaster`.
- **Provider stack order** (`main.jsx`, verified this session — file was not modified by later commits): `QueryClientProvider > BrowserRouter > ThemeProvider > I18nextProvider > UserProvider > PusherProvider > ToastProvider > ModalProvider > App`. **Order matters** here — e.g. `PusherProvider` presumably depends on `UserProvider` being above it (needs `user.id` for the channel name), so don't reorder without checking dependencies between providers.
- **Demo-mode bootstrap** (`main.jsx`, before React renders): if `localStorage.user.isDemo === true`, calls `setupDemoMode(true)` (starts the MSW worker + seeds Dexie if empty) then `SimulationEngine.resumeAll()` — this all happens **before** `root.render()`, so the fake backend is guaranteed to be intercepting requests before any component mounts and fires its first query.
- **Global state**: no Redux/Zustand store actually observed in use despite `zustand` being a dependency — Context + local component `useState` covers everything this session encountered. If you find an actual zustand store somewhere, that would update this note.
- **TanStack Query cache**: default `QueryClient` (from `reactQueryConfig.js`), no custom cache times/staleTime overrides observed globally; individual queries override via the `options` param to `useSimpleQuery` (e.g. `refetchInterval`, `enabled`).
- **Persistence/localStorage keys observed**: `token`, `user` (JSON), `convoyai-theme`. Fake-backend/demo state itself lives in **IndexedDB** (`DemoConvoyDatabase`, via Dexie), not localStorage — clearing localStorage (e.g. logout) does **not** clear the demo IndexedDB, so demo data persists across logout/login cycles for the same browser profile unless IndexedDB is explicitly cleared. Worth knowing if a "demo data looks stale/weird" bug report comes in — the fix might be clearing IndexedDB (dev tools → Application → IndexedDB → delete `DemoConvoyDatabase`), not a code bug.
- **Important state dependency**: `LeftSidebar.jsx` receives `dashboardData` as a prop (the per-user dashboard list for the Dashboard section) — this implies some parent component (likely `AuthLayout.jsx`) fetches the dashboard list and passes it down; not traced further in this session.

---

## 12. FORMS & VALIDATION

- **react-hook-form** is the standard form library (`useForm`, `useFieldArray` — seen in `AddNewRule.jsx`), with **yup** schemas via `@hookform/resolvers` for the more complex forms (`src/validation/`, e.g. `RuleFormSchema.js`).
- **However**, the newer Fleet Management forms (`NewVehicleForm`, `NewDriverForm`, `NewGeofenceForm`, `NewYardForm`, `NewTripForm` — all inline function components inside their respective page files, e.g. `Vehicles.jsx`) use **plain `useState` per field**, not react-hook-form, and do their own inline required-field checks before calling `post()`. This is a real, existing inconsistency in the codebase (two different form patterns), not something introduced by mistake — **match whichever pattern the surrounding file already uses** rather than trying to unify them unprompted.
- **API submission pattern** (consistent across both form styles): call `post(url, payload, {}, false)` (4th arg `false` suppresses the automatic toast, since these forms show their own `toast.success`/`toast.error` based on the response), check `response?.error || response?.success === false` for failure, otherwise `toast.success(...)`, call the passed-in `onCreated?.()` (usually the parent's `refetch`), then `onClose?.()`.
- **File upload pattern**: `YardLayoutEditor.jsx`'s layout image upload uses a raw `FormData` + `post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } }, false)` — this is the only multipart-upload example found in the fleet module; the demo backend reads it via `request.formData()` in the MSW handler and converts it to a base64 data URL via `FileReader` for persistence.
- **Known form issues** (observed, not fixed): none of the Fleet Management inline forms have client-side format validation beyond "is it non-empty" (e.g. no email/phone format checks, no numeric-range checks beyond `type="number"` on the input) — acceptable for a demo/internal tool, but worth knowing if asked to "add validation" to these forms, since currently there's essentially none beyond required-field presence.

---

## 13. KNOWN BUGS / PROBLEMS

Documenting issues **observed**, not fixed, per the instructions for this document.

1. **Dead "Tutorials" nav link.** `LeftSidebar.jsx`'s Core section renders a "Tutorials" item (`route: '/tutorials'`) for demo users, but the corresponding route in `AllRoutes.jsx` is commented out. **Impact**: demo users clicking this link hit `NotFound`. **Fix direction**: either uncomment the route (if `Tutorials.jsx` still exists and works) or remove the nav item.
2. **Possible dead `UnityControlMarina` import.** Imported in `AllRoutes.jsx` but this session couldn't find its route registration in the current `authProtectedRoutes` array. **Impact**: unclear — could be a genuinely missing route (feature unreachable) or a route this session simply mis-scanned. **Fix direction**: `grep -n "Marina" src/routes/AllRoutes.jsx` to confirm one way or the other before assuming either.
3. **401 responses don't trigger logout.** The `hardLogout()` call in `axiosConfig.js`'s response interceptor is commented out. **Impact**: a user with an expired/invalid token will see silent/confusing failures (toasts saying "something went wrong") rather than being redirected to log back in. **Fix direction**: this may well be intentional (someone commented it out for a reason — possibly it was interfering with demo mode, or with a specific 401 case that shouldn't force logout) — **investigate why it was disabled before re-enabling it**, don't just uncomment blindly.
4. **No route-level RBAC guard.** Covered in §4/§6 — any authenticated user can potentially load any protected route by direct URL regardless of role/permission, since gating is nav-only. **Impact**: depends entirely on whether the real backend independently enforces authorization on each endpoint (likely, but not verified from the frontend side). **Fix direction**: if this matters, would need a route-level guard component checking `hasPermission`/`isAdmin` per route, redirecting or showing a 403 page if not authorized.
5. **Two different "freshness" time windows for similar concepts** (§10): generic device online/offline = 2 hours, GPS tracker position freshness = 15 minutes. Not a bug per se, but a trap for anyone assuming a single shared constant exists — a "make offline detection consistent" task would need to intentionally pick one, not assume they're already the same.
6. **Fleet Dashboard and Fleet Map have zero demo-mode backing.** Not a "bug" in real mode, but if a demo user opens the "Dashboard" or "Map" tabs inside Fleet Management, those specific tabs will fail to load data (their `useSimpleQuery` calls will hit the real `VITE_API_URL` directly, unintercepted, and presumably fail with a network/auth error since demo accounts don't have a real backend session). **Impact**: broken-looking UI (empty/error states) for 2 of the 7 Fleet Management tabs, for demo users specifically. **Fix direction**: extend `fleetControllers.js`/`handlers.js`/`db.js` following the exact pattern already established for the other 5 tabs — see §8's "Architecture of the demo backend" for how to do this consistently.
7. **Console `console.log` left in `Modal.jsx`**: `console.log('aa', reason)` inside `handleClose`. Harmless but unpolished — low-priority cleanup candidate if ever touching that file for another reason (not worth a dedicated task on its own).
8. **`TankLevel.jsx` (and likely other widget components) have multiple debug `console.log`s left in** (`console.log('data-tank-widget', ...)`, `console.log('deewana', ...)`) — same category as #7, cosmetic/debug leftovers in otherwise-working code.

---

## 14. INCOMPLETE / TODO / SCAFFOLDED FEATURES

- **Legacy widget-dashboard system** (`Grid.jsx` + `src/components/Widgets/` + `src/forms/DashboardForms/*Form.jsx` + `DynamicImport.jsx`'s `getWidgetConfig()` registry) — **fully implemented and fully wired to both the real API shape and the demo fake backend** (`controllers.js` still has `createWidget`/`updateWidget`/`createWidgetSettings`/`fetchDashboardWidgets`/etc., all functional), but **not reachable from the current routing** — `Dashboard.jsx` was switched to render `DeviceStatusGrid` instead, apparently at the wrapper level rather than by editing `Grid.jsx` directly, per a code comment in `DeviceStatusGrid.jsx` that explicitly frames this as easily reversible ("if this needs to be reverted"). **If a task mentions "add a widget to the dashboard" or "the dashboard doesn't support drag-and-drop anymore," this is almost certainly why** — confirm with whoever's asking whether they want `Dashboard.jsx` reverted to use `Grid.jsx`, or whether `DeviceStatusGrid` is the intended current design.
- **Module Management / Plan Management**: literal `<ComingSoon/>` placeholder pages (§3.11). Real routes exist, nav items exist, gating exists — only the actual page content is missing.
- **Fleet Dashboard / Fleet Map demo backing**: real UI exists and is presumably fully functional against the real backend, but has zero demo-mode API coverage (§8, §13 #6). This is the most concrete, well-scoped "next piece of work" if fleet demo-mode work continues.
- **CRM/customers, contracts/rate cards/vendors**: not found anywhere in the frontend beyond a single free-typed `fleet_customer_id` field on the trip form (§8). Either not yet built, or backend-only with no frontend UI yet.
- **Tutorials page**: route commented out (§13 #1) — unclear if the page component itself (`Tutorials.jsx`, if it exists) is finished or abandoned; wasn't located/read in this session.
- **The whole "Super Admin" management surface** (§3.10 — Users, Companies, global Products/Devices lists, permission-toggle UI, etc.): routed and presumably built, but **entirely unverified by this session** — could range from fully polished to barely started. Genuinely unknown; don't report on its status without reading it first.
- **`AttributeModal.jsx`**: grew substantially in a recent commit (+293 lines) that this session didn't review — likely a meaningfully expanded feature (product attribute configuration), status unknown.

---

## 15. ARCHITECTURAL DECISIONS

Patterns that appear to be **deliberate** (often backed by an explicit code comment from whoever built them) and should be **preserved** rather than "cleaned up" without being asked:

1. **The demo-mode fake backend fully mirrors the real API's URL shapes, HTTP methods, and response envelopes.** This is why demo mode "just works" across the whole app without page-level special-casing beyond the occasional `user?.isDemo` UI branch. Any new real endpoint that's meant to also work in demo mode should get a matching MSW handler following the exact same URL/response-shape conventions — don't invent a different envelope shape "because it's just for demo."
2. **Widget/page components are reused unchanged across entry points** rather than duplicated — e.g. Fleet Management's tabs reuse the originally-standalone `Vehicles.jsx`/`FleetMap.jsx`/etc. page components directly; `VehicleDetailModal` is opened identically from both `Vehicles.jsx` and `FleetMap.jsx`'s marker popups; `YardLayoutEditor` is opened identically from both `Yards.jsx` and `FleetMap.jsx`. **Don't fork a component to give one entry point slightly different behavior** — extend the shared component with props instead, matching how this was already done.
3. **`Dashboard.jsx` → `DeviceStatusGrid` swap was done at the wrapper level, explicitly to keep `Grid.jsx` revertible.** This is a strong signal that the legacy widget system is considered "not dead, just parked" — treat it accordingly (don't delete it as "unused code").
4. **The sidebar's product-area sections (Core/Connect/Twin/GIS/Studio/Solutions/Operations) intentionally omit some areas the underlying "ConvoyAI OS prototype" apparently includes** (AI, Edge, a dedicated Alarms & Commands area) **because no real page exists for them yet** — per an explicit code comment. This means the current nav is a deliberate subset, not an oversight; don't add empty/placeholder sections for those without an actual feature behind them (Module Management/Plan Management's `<ComingSoon/>` pattern is the established way to add a "coming soon" nav entry, if that's ever wanted for one of those missing areas).
5. **Business-rule error messages are surfaced verbatim from the (real or demo) backend rather than replaced with generic ones** — multiple explicit code comments call this out (tracker-already-assigned, yard-slot-too-small). **Preserve this when adding new mutations**: return/display the specific reason, not a generic "something went wrong."
6. **"No fabricated numbers next to real ones."** Fuel economy, vehicle stats, etc. explicitly render "— not measured" / "not enough data" rather than a plausible-looking placeholder number when the underlying data doesn't exist yet. This was treated as a real design principle (stated explicitly in `VehicleDetailModal.jsx`'s comments) and was deliberately honored when building the Fleet Management demo backend (e.g. stats are computed from real seeded trip data, not randomly generated). **Preserve this** — don't introduce `Math.random()`-based placeholder values for anything that reads as a "real" metric in the UI.
7. **`styles/global.css` is legacy/dead and `src/index.css` is canonical** — this is effectively an architectural decision by omission (nobody finished removing the old file), but functionally you should treat `index.css` as the only design-token file to edit.

---

## 16. IMPORTANT FILES

A practical map — not exhaustive, but the highest-leverage files for orienting quickly.

| File                                                              | Why it matters                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/routes/AllRoutes.jsx`                                        | The definitive route list. Start here for "does this page exist / what's it called."                |
| `src/components/LeftSidebar.jsx`                                  | The definitive nav IA + permission-gating source. Start here for "why can't I see X."               |
| `src/contexts/UserContext.jsx`                                    | Auth/role/permission logic — `isAdmin`, `isSuperAdmin`, `hasPermission`, `hasRole`.                 |
| `src/utils/apiHelper.js` + `axiosConfig.js`                       | The entire API layer. Every network call in the app goes through `get/post/put/del` here.           |
| `src/index.css`                                                   | The real design tokens (CSS vars). Not `styles/global.css`.                                         |
| `src/main.jsx`                                                    | Provider stack order + demo-mode bootstrap sequence.                                                |
| `src/utils/fakeBackend/db.js`                                     | Dexie schema + all seed data (IoT + Fleet). Read this to know exactly what demo data exists.        |
| `src/utils/fakeBackend/handlers.js`                               | Every mocked endpoint, in one place. Read this to know what demo mode does and doesn't support yet. |
| `src/utils/fakeBackend/controllers.js`                            | Original (pre-fleet) demo logic — dashboards/widgets/assets/simulation engine.                      |
| `src/utils/fakeBackend/fleetControllers.js`                       | All Fleet Management demo logic (built this session).                                               |
| `src/pages/FleetManagement.jsx`                                   | Entry point + tab structure for the Fleet Management module.                                        |
| `src/pages/Dashboard.jsx` + `src/components/DeviceStatusGrid.jsx` | Current (simple) dashboard.                                                                         |
| `src/components/Grid.jsx` + `src/utils/DynamicImport.jsx`         | Legacy widget dashboard — still fully functional, just unrouted (§14).                              |
| `src/pages/Assets.jsx`                                            | Digital twin / asset hierarchy — flagged as highest-risk-to-break area per `HOW_TO_TEST.md`.        |
| `package.json`                                                    | Exact dependency versions, scripts, `lint-staged`/`msw` config.                                     |
| `vite.config.js` + `jsconfig.json`                                | Path aliases (must stay in sync between the two).                                                   |
| `.env`                                                            | `VITE_API_URL`, Pusher key/cluster, MapTiler key.                                                   |
| `HOW_TO_TEST.md`                                                  | Manual QA checklist from a past redesign — useful pre-existing test plan, see §18 for a summary.    |

---

## 17. DEVELOPMENT WARNINGS

- **Two dashboard systems.** Before touching anything "dashboard"-related, confirm whether the task means `DeviceStatusGrid` (current, routed) or the legacy `Grid.jsx` widget system (fully built, unrouted). Don't assume.
- **Don't edit `styles/global.css` expecting it to affect the live theme.** It won't (mostly). Edit `src/index.css`.
- **Vite path aliases live in two files.** `vite.config.js` and `jsconfig.json`. Adding an alias to only one will cause a mismatch between what the editor resolves and what actually builds.
- **The demo fake backend must stay in sync with real endpoint shapes.** If the real backend's response shape for an endpoint changes, the corresponding MSW handler in `handlers.js`/`fleetControllers.js`/`controllers.js` needs a matching update, or demo mode will silently diverge from reality. There is no automated contract test enforcing this — it's manual discipline only.
- **IndexedDB demo data persists across logout/login.** If a demo-mode bug report doesn't make sense given the current code, check whether the browser's `DemoConvoyDatabase` IndexedDB is stale (e.g. from before a schema change) before assuming it's a code bug. A Dexie version bump (§8) handles schema _additions_ gracefully, but if you ever need to change an _existing_ field's meaning, you may need a version-upgrade migration function (Dexie supports `.upgrade()` callbacks) — none exist yet in this codebase, so there's no established pattern to copy; you'd be introducing one for the first time.
- **`react-query`'s cache-busting pattern here is manual `refetch()`, not `invalidateQueries`.** Introducing `invalidateQueries` in one place while everything else uses passed-down `refetch` callbacks will create inconsistent refresh behavior. Match the existing pattern.
- **MSW route registration order can matter** for overlapping dynamic/static paths at the same depth (§8) — not currently an actual bug anywhere in this repo, but a real class of mistake to watch for when adding new mock routes.
- **`npm run build` may need a larger Node heap in constrained environments** (this session needed `--max-old-space-size=6144` in its sandbox). If you hit an OOM during build and your machine has plenty of RAM, this is a Vite/Rollup memory-tuning issue, not a code problem — try `node --max-old-space-size=<N> node_modules/.bin/vite build`.
- **`npm run lint` has ~2900 pre-existing errors project-wide.** Don't try to fix them all as a side effect of an unrelated task, and don't be alarmed by a large total count — always diff lint output against `git diff` to see what you actually introduced.
- **Don't hand-edit `public/mockServiceWorker.js`.** It's generated by MSW's `init` command (typically wired into a postinstall/prepare script). If `npm install` regenerates it with a semicolon-only formatting diff, that's noise from a different MSW/Prettier config in the install environment, not a meaningful change — safe to `git checkout --` it back if it shows up unexpectedly in `git status` for an unrelated task.
- **Company deployment target appears to be Vercel** (`vercel.json` configures gzip headers for the Unity build + an SPA rewrite) — if debugging a production-only issue, check Vercel-specific config/headers before assuming it's a pure code bug.
- **This document itself can go stale.** The repo changed meaningfully _during_ the session that produced it (routes grew, `LeftSidebar.jsx` gained new sections, Fleet Dashboard tab was added) due to other developers'/sessions' commits landing in between reads. Treat every claim here as "true as of the commit noted at the top," verify against the live file for anything a task actually depends on, and — ideally — **update this document** (rather than creating a second, competing one) as you learn things it got wrong or as the codebase moves on, so it stays useful for the next session too.

---

## 18. CURRENT PROJECT STATE — Where We Left Off

### What's working

- Core platform: auth (login, incl. demo + Google OAuth), navigation/RBAC-by-visibility, theming, i18n, the demo-mode fake backend infrastructure (IoT devices/dashboards/widgets/assets/digital-twin/simulation), Rule Builder, Map, Assets/digital-twin, Manage Product family, Roles & Permissions.
- **Fleet Management, 5 of 7 tabs, in both real mode (presumed, per existing frontend code) and demo mode (verified/built this session)**: Vehicles, Drivers, Geofences, Yards, Trips — including all their detail-modal sub-features (tracker assignment, maintenance, fuel, compliance documents, driver incidents, yard slot check-in/out with layout upload, full trip lifecycle with planned-yard waypoints).

### What's incomplete

- Fleet Dashboard and Fleet Map tabs have **no demo-mode backing** — broken/empty for demo users specifically (§8, §13 #6, §14).
- The entire Super Admin management surface (§3.10) is unverified — status genuinely unknown, not just "assumed incomplete."
- Module Management and Plan Management are literal placeholder pages.
- CRM/customers, contracts/rate cards/vendors: not found in the frontend at all.
- Dead "Tutorials" nav link (§13 #1).

### What was actively being developed in this session (most recent work, now committed)

The last substantial piece of work in this session was building out the **Fleet Management demo-mode backend** for the Vehicles/Drivers/Geofences/Yards/Trips tabs — three files: `src/utils/fakeBackend/db.js` (schema v2 + seed data), `src/utils/fakeBackend/fleetControllers.js` (new file, all business logic), `src/utils/fakeBackend/handlers.js` (new MSW routes). This is **committed** (commit `8398265`, "added demo for fleet management module", author `ahm-med`, verified identical to the working tree at the time this document was written — no uncommitted fleet-related changes remain).

Verification performed at the time: full-repo `vite build` succeeded (with an increased Node heap, see §17), targeted ESLint on the changed files was clean, and every response shape was manually cross-checked against the exact fields each consuming component (`Vehicles.jsx`, `VehicleDetailModal.jsx`, `Drivers.jsx`, `DriverDetailModal.jsx`, `Geofences.jsx`, `Yards.jsx`, `YardLayoutEditor.jsx`, `Trips.jsx`, `TripDetailModal.jsx`, `ComplianceTab.jsx`) actually destructures. **No interactive browser testing was performed** (no browser-automation tool was available in that session's environment) — a human should click through the demo account's Fleet Management tabs at least once to confirm the visual/UX result matches expectations, per that session's own closing recommendation.

### Known blockers

- None technical/structural — the codebase builds and the demo backend is functionally complete for its stated scope. The main "blocker" is simply that this document's author could not visually verify the Fleet Management demo UI in a real browser.

### Likely next development priorities (inferred from the trajectory of this session's work, not confirmed with the project owner — verify before committing to this)

1. Extend demo-mode coverage to the **Fleet Dashboard** and **Fleet Map** tabs, following the exact pattern established for the other 5 (§8's "Architecture of the demo backend" section is written to make this straightforward — a new `fleetDashboardControllers.js`, a Dexie `version(3)` bump if new tables are needed, new `handlers.js` routes).
2. Human/manual verification of the Fleet Management demo experience end-to-end in a real browser (login as `demoAccount@chirptech.io` / `demoAccount-password`, click through all 7 tabs).
3. Possibly reviving the dead Tutorials route, or removing the nav item, whichever is intended.
4. If Fleet Management continues to grow, the Super Admin surface and the legacy-widget-vs-DeviceStatusGrid dashboard question are the two biggest "unknown unknowns" left in the codebase — worth a dedicated investigation pass if either becomes relevant to a task, since this document explicitly could not cover them with confidence.

---

_Document generated by a Claude Code session on 2026-09-07, based on direct source-code reading accumulated across a multi-turn session (an initial full-project study pass, followed by building the Fleet Management demo backend) plus a final round of targeted re-verification of the highest-risk claims (routes, sidebar, auth/permission logic, dependency list, git history) before writing this file. Anything not explicitly re-verified in that final pass is dated to when it was originally read and may have drifted — cross-reference the confidence markers throughout._
