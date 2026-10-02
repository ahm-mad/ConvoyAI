# Architecture overview

## 1. Stack (package.json)

Next **15.5** App Router · React **19** · TypeScript 5.9 (`strict:false`, loose on purpose) · Tailwind **v4** (`@tailwindcss/postcss`, tokens in `src/index.css`) ·
MUI v6 (+`@mui/material-nextjs` Emotion SSR cache, x-date-pickers, icons) · Radix UI (primitives + themes) · antd (`Tree` only, Assets page) · `@tanstack/react-query` v5 ·
axios · `socket.io-client` (realtime) · react-hook-form + yup · i18next (en/ar, `public/locales/{lng}/{lng}.json`) · chart.js + react-chartjs-2 (fleet analytics),
apexcharts (older) · react-leaflet + MapTiler · three/@react-three/fiber+drei (3D building/floor plan) · Unity WebGL builds (`public/unity`, `public/DiaryFarm`) ·
reactflow + dagre (`FlowChart`) · gridstack (parked widget dashboard) · framer-motion/motion · lucide-react · react-hot-toast · driver.js (demo tours) ·
`cmdk` + `@radix-ui/react-popover` (fleet scope bar) · papaparse (CSV) · dexie + msw (demo backend) · (declared but unused: zustand, dayjs, date-fns, framer-motion, motion, vaul, canvas-confetti, @radix-ui/themes) · Cal.com/Calendly embeds (marketing).
Dev-only: husky + lint-staged + prettier, eslint (`next/core-web-vitals`).
`overrides` pins `@react-three/drei`'s fiber/react to the app's versions.

## 2. Rendering model (important)

`app/layout.tsx` (server) → `app/providers.tsx` (`'use client'`, `next/dynamic(app-shell, {ssr:false})`) → `app/app-shell.tsx`.
**The whole app is client-rendered behind `ssr:false`** (so `localStorage`/`window` at render time never crashes). Consequences: no server data fetching, no per-page
metadata, every `page.tsx`/route-group layout must carry `'use client'`. Root layout also: imports `src/index.css`, driver.js + nprogress CSS, IBM Plex Sans/Mono
Google Fonts, an inline anti-FOUC theme script (adds `.light` to `<html>` from `localStorage['convoyai-theme']`), `<AppRouterCacheProvider options={{key:'mui'}}>`.

Provider stack (`app/app-shell.tsx`, order is load-bearing):
`QueryClientProvider (reactQueryConfig.ts: retry 1, refetchOnWindowFocus)` → `ThemeProvider` → `I18nextProvider` → `UserProvider` → `SocketProvider` → `ToastProvider (react-hot-toast Toaster top-center)` →
`ModalProvider` → `<RouteProgress/>` (NProgress on pathname change) + `<Bootstrap>{children}</Bootstrap>` + `<Modal/>` (single global MUI Dialog).
`Bootstrap` (`app/bootstrap.tsx`): if `localStorage.user.isDemo` lazily imports `@utils/fakeBackend/browser` + `controllers`, starts MSW, seeds Dexie, `SimulationEngine.resumeAll()`, renders children only when ready;
then `initializeSocket(user.id)` once a user exists.

## 3. Routing

`app/` has two route groups: `(public)` (layout → `NonAuthLayout`, a bare wrapper) and `(app)` (layout = auth guard: `!isLoggedIn` → stash `{from}` and `router.replace('/login')`; else `AuthLayout`).
`AuthLayout` (`src/layout/AuthLayout.tsx`): `GlobalPacketListener` + `LeftSidebar` + `Navbar` + (dashboard sub-nav on `/dashboard/*`) + `Breadcrumb` (hidden on dashboard pages) + children;
fetches `GET /api/user/:id/dashboards` (`dashboardData`) for the sidebar; first-login demo users get `WelcomeIntroModal`.
Each `app/**/page.tsx` is a thin re-export of a `src/screens/*` (or `src/components/*`) component. Full table of routes → screens is in `file-map.md` §2.

Tab-route families use a `[tab]` segment with a `notFound()` guard: `/products/[productId]/[tab]` (devices|configuration|integration|history → `ManageDevice`),
`/edit-products/…` (→ `ManageDeviceConfig`), `/all-products/…` (→ `ManageConfiguration`); these three screens are near-duplicates entered from different lists.
Tabs are derived from `location.pathname.includes(...)`. Fleet: `app/(app)/fleet-management/layout.tsx` mounts the two-level nav + `useFleetRealtime` once (skipped for `/legacy`).
`/fleet-management` and `/fleet-management/overview` redirect to `/fleet-management/operations/overview`.

### router-compat shim (`src/lib/router-compat.tsx`, alias `@lib/router-compat`)

All code imports `useNavigate/useLocation/useParams/useSearchParams/Link/NavLink/Navigate` from `@lib/router-compat`, which re-implements the react-router API on `next/navigation`.
`navigate(to, {state})` stashes `state` in ONE sessionStorage slot (`__convoyai_router_state__`) that `useLocation().state` reads on the next screen (multi-hop/back-button state is not preserved).
`NavLink` computes `isActive` by pathname prefix; `useSearchParams` returns `[params, setParams]`. New code may use `next/navigation`/`next/link` directly (the Fleet screens/nav do).

## 4. Path aliases (`tsconfig.json`, single source — Vite files are gone)

`@assets→src/assets`, `@acl→src/acl`, `@components`, `@contexts`, `@forms`, `@hooks`, `@layout`, `@locales→src/locales` (dir doesn't exist; translations are in `public/locales`),
`@pages` and `@screens` → `src/screens` (renamed from `src/pages` because Next reserves it), `@root/*→./*` (repo root: `axiosConfig`, `reactQueryConfig`), `@utils`, `@validation`, `@lib`.

## 5. Config gotchas

- `next.config.mjs`: `reactStrictMode`, `outputFileTracingRoot` pinned to repo, ESLint ignored during builds, **TS errors fail the build** (`ignoreBuildErrors:false`),
  `images:{unoptimized, disableStaticImages}`, and a **custom webpack rule** that makes `import x from './a.png|svg|mp4|…'` resolve to a URL **string** (Vite behaviour; ~58 call sites).
  This rule is why Turbopack (`--turbopack`) doesn't work. Types for these imports: `src/types/assets.d.ts`. Unity `Window` globals + `react-scrollspy` typed in `src/types/modules.d.ts`.
- `tsconfig.json`: `strict:false` with `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict`, `noFallthroughCasesInSwitch` on. **Next rewrites/reformats this file on `dev`/`build` and strips comments.**
  ~161 files carry `// @ts-nocheck -- TODO(ts-migration)` (still export inferred types).
- `vercel.json`: framework nextjs + `Content-Encoding: gzip` headers for Unity/DiaryFarm `.gz` assets. Deploy target Vercel. Env vars needed: `NEXT_PUBLIC_API_URL` (trailing slash), `NEXT_PUBLIC_MAPTILER_KEY` (the Pusher ones are obsolete).
- `.eslintrc.json` = `next/core-web-vitals`, ignores `fakeBackend/Data.tsx`. Lint has ~2900 legacy issues — don't fix drive-by.
- **`styles/global.css` is imported by `screens/GuestHome.tsx`** (Calendly overlay z-index fix, `.bg-grid`, `.text-gradient-cyan`) — NOT dead, but not the token file. `src/index.css` is the design-token file.
- Global CSS hides ALL scrollbars (`* { scrollbar-width:none !important }` + webkit) — scrolling works but no visible bars anywhere; keep in mind for UI work.
- Fonts: IBM Plex Sans (UI) + IBM Plex Mono (numbers/IDs, tabular figures) via Google Fonts `<link>` in the root layout.

## 6. Dev tooling (details in `DEV_PERFORMANCE.md`)

`npm run dev` = `scripts/dev-safe.sh`: wipes a `.next` left by `next build`, caps memory (systemd cgroup 5G, V8 heap 2560 MB), timestamps logs to `.dev-logs/`, runs `scripts/dev-monitor.sh` black-box recorder,
auto-restarts on crash (gives up after 2 crashes on the same route or >3/10 min). `npm run dev:report` summarises a session after a freeze. Root cause of the old runaway was `ReactIconDynamicImport`
pulling ~20 react-icons packs; fixed by generated `src/assets/icons/ReactIcon/iconData.ts` (`npm run gen:icons` verifies it, do NOT prettier it). Dev memory still climbs to ~4 GB across many routes (webpack keeps graphs).
`next build` needs `NODE_OPTIONS=--max-old-space-size=6144`. Never `next build` while dev runs.

## 7. Where the "business" lives

There is no backend code here. Server truth = `backend_frontend_sync/api_contract/`. Frontend business logic worth knowing: permission gating in `LeftSidebar`, fleet list/bulk/export hooks, analytics filter/scope hooks,
units conversion (`utils/units.ts`), fleet cache invalidation (`utils/fleetCache.ts`), optimistic-concurrency helpers (`hooks/useEditConflict`, `utils/fleetConflict`).
