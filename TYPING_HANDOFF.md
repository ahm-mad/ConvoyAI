# TYPING_HANDOFF.md — resume doc for the "strict types for major screens" task

> **Read this first if you're resuming the strict-typing work.** It's the detailed
> companion to `task.md` (which has the higher-level migration history + this task's
> summary under `## FOLLOW-UP TASK`). Everything you need to continue seamlessly is here.

---

## 0. TL;DR — RESUME HERE

- **Branch:** `feat/next-ts-migration` · **HEAD when this was written:** through Unit 7 commit (2026-09-10)
- **Baseline is GREEN:** `npx tsc --noEmit` → **0 errors**, `next build` passes with type-checking on
  (`typescript.ignoreBuildErrors: false`), working tree clean.
- **The Next.js + TypeScript migration itself is 100% DONE** (Phases 0–7 in `task.md`, deployed &
  verified twice on Vercel). `src/` is 100% `.ts(x)`.
- **This task** = hand-write strict TS `interface`s for **props / state / handlers / refs** of the
  ~62 major screens + the shared components they use, **feature by feature**, keeping the build green.
  **API response shapes are deliberately NOT typed yet** (`ApiResult` is loose on purpose — real
  per-endpoint types wait for API docs). Fleet/domain entities are `any`.
- **Progress: ALL 10 screen units done** (commits `… f9ee5c2` + Unit 10). **161 `@ts-nocheck` files
  remain** — Unit 5b (3 giant Fleet files) + the low-level leaves the owner's brief said to leave.
- **Next action:** ask the owner what they want next (see **§10**: repo now on NVMe; `product_name` fix verified + committed; options: Unit 5b, turbopack dev, move backend off HDD).
  complete — hand back to the owner-gated `strictNullChecks → noImplicitAny → strict:true` flip.

---

## 1. WHAT THIS TASK IS (owner's brief, 2026-09-09)

> "Leave the low-level leaf components alone for now. I want you to do the 62 Main/Major Screens.
> Write strict TypeScript interfaces for the props/state of the major screens. Do this
> feature-by-feature so we don't break the build. For the time being leave API response as it is —
> when I have proper API documentation, then we will also have strict types for APIs too. So for now
> our main goal is strict types for main screens and components' props/functions/states etc, without
> touching API responses."

Interpretation in force:

- **In scope:** component `props` (real `interface`s), `useState<T>()`, `useRef<T>()`, event-handler
  params, `useParams`, callback/render-prop params, local UI-state object shapes, function return
  types where cheap.
- **Out of scope:** typing what comes back from `get/post/put/del` (stays `any` via `ApiResult`),
  typing yup validation schemas, migrating any library, fixing pre-existing bugs (flag them instead).
- **"Strict"** means: after typing a unit, `tsc` with `strict: true` reports **0 errors for that
  unit's files** (not just "compiles under the loose config"). See `## 4. VERIFICATION`.

---

## 2. CURRENT PROJECT STATE (facts a fresh session needs)

| Thing                              | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework                          | Next.js 15.5 App Router + TypeScript. Routes in `app/**/page.tsx` (thin `'use client'` re-exports of `src/screens/*`).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/` files                       | 100% `.ts` / `.tsx`. **0** `.js`/`.jsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tsconfig.json`                    | `strict: false`, `strictNullChecks: false`, `noImplicitAny` off (via strict:false), **BUT** `strictFunctionTypes`/`strictBindCallApply`/`noImplicitThis`/`alwaysStrict`/`noFallthroughCasesInSwitch` are **on**. `allowJs: true`. Aliases: `@components @contexts @hooks @layout @lib @pages(→src/screens) @screens @utils @validation @assets @acl @root @forms @locales`. **Next rewrites/reformats this file on every `next dev`/`next build` and strips `//` comments** — don't rely on comments surviving; the strict-check script below already strips them. |
| Build cmd                          | `NODE_OPTIONS=--max-old-space-size=6144 npx next build` (OOMs without the heap bump). ~55–90 s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Dev cmd                            | `NODE_OPTIONS=--max-old-space-size=4096 npm run dev` (Next 15 dev has a memory watchdog that auto-restarts on big apps — restarts look like `000`/connection-refused for ~10 s, not a crash).                                                                                                                                                                                                                                                                                                                                                                      |
| `next build` type-check            | **ENFORCED** (`typescript.ignoreBuildErrors: false` in `next.config.mjs`). A type error in an already-typed file now fails the build.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ESLint                             | `.eslintrc.json` → `next/core-web-vitals`. `eslint.ignoreDuringBuilds: true` (there are ~2900 pre-existing issues; not our problem). `no-explicit-any` warnings don't block anything.                                                                                                                                                                                                                                                                                                                                                                              |
| lint-staged                        | Runs `prettier --write` on commit — it **will reformat** your staged files (multi-line type params collapse, etc.). Harmless; expected.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@ts-nocheck` marker               | `// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7` at line 1 (or line 1 above `'use client'`). **Grep:** `grep -rl "@ts-nocheck" src` → currently **161** files.                                                                                                                                                                                                                                                                                                                                                                          |
| Key fact about `@ts-nocheck` files | TS still **infers exported types** for them. A `@ts-nocheck` component `function X({ foo })` still exposes props `{ foo: any }`, so its **consumers type-check fine**. This is why we could defer big files without breaking their callers.                                                                                                                                                                                                                                                                                                                        |

---

## 3. THE RECIPE (per unit — follow exactly)

1. **Pick the unit** from `## 6. UNIT LEDGER`. Read every file in it.
2. For each file:
   - Delete the `// @ts-nocheck …` line (and drop the now-unused `import React …` — new JSX transform;
     if the file uses `<React.Fragment>` change it to `<>` first, or keep `import { Fragment }`).
   - Add a **props `interface`** (or inline `: { … }`). Make props **optional where the component has
     a default / fallback**. Callbacks: `onClose?: () => void`, `onCreated?: () => void`,
     `onClick?: (e: React.MouseEvent<HTMLElement>) => void`, etc.
   - `useState(null)` → `useState<string | null>(null)` / `useState<any>(null)` (for API-shaped data).
     `useState('')`/`useState(false)`/`useState(0)` — inference is fine, leave them.
   - `useRef(null)` → `useRef<HTMLInputElement | null>(null)` etc.
   - Handlers: `e => …` → `(e: React.ChangeEvent<HTMLInputElement>) => …` /
     `(e: React.FormEvent) => …` / `(e: React.MouseEvent<HTMLButtonElement>) => …`.
   - `catch (err) { … err.response … }` → `catch (err: any)` (TS allows `any`/`unknown` as the only
     catch annotations; use `any` where `.foo` is accessed).
   - **API results stay loose:** `const x = data?.success ? data.data : []` → `const x: any[] = …`.
     `const detail = data?.success ? data.data : null` → `const detail: any = …`.
   - **Domain entities are `any`:** add `/* eslint-disable @typescript-eslint/no-explicit-any */` at
     the top of the file (or `// eslint-disable-next-line` per line) and use `any` for
     vehicle/driver/trip/device/product/rule/user rows and `.map((x: any) => …)` callbacks.
   - Objects indexed by a dynamic key (`statusColors[status]`, `routeMap[pathname]`) →
     `Record<string, string>` / `Record<string, T>`.
   - Icon-component arrays (mixed lucide / MUI / custom): type the field as `any` or
     `ComponentType<{ size?: number | string }>`.
   - `yupResolver(schema)` fighting `useForm<T>` → `resolver: yupResolver(schema) as any` (keep
     `useForm<FormValues>` so the handler + fields stay strongly typed).
   - Leaflet: `center={[a,b]}` / `position={[a,b]}` → append `as [number, number]`.
   - Remove genuinely-unused imports you can see (tsc will error instantly if you're wrong).
3. **Run the loose check** (whole project must stay 0):
   `npx tsc --noEmit 2>&1 | grep -c "error TS"` → must print `0`.
4. **Run the strict check** for this unit's files only (see `## 4`). Must print nothing / `STRICT-CLEAN`.
   Fix each strict error in the unit's files (usually: `?? null`, `?? undefined`, `as any` on an
   API value, or a missing param type).
5. `NODE_OPTIONS=--max-old-space-size=6144 npx next build` → `EXIT=0`, `BUILD_ID` present. (Do this
   once per unit, not per file — it's slow.)
6. Tick the unit in `task.md` (`## FOLLOW-UP TASK → ### Units`) **and** in `## 6` here. Add any
   latent bugs to `## 7`.
7. **Commit** (per unit):
   ```
   git add -A && git commit -m "types(unit N): strict props/state for <feature>

   <bullet list of files + what was typed>

   tsc --noEmit: 0. tsc --strict on unit N: 0. next build green.

   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01LVSJvDFuhJjVdtDfhBGNAm
   "
   ```
   (Update the `Claude-Session` line to the current session's URL.)

---

## 4. VERIFICATION — the strict-subset check (copy/paste)

`tsc --strict` on the whole project reports ~390 errors (all in still-`@ts-nocheck` files, expected).
To check that **just this unit's files** are genuinely strict-clean, temporarily flip strict on,
grep for the unit's paths, then restore:

```bash
cd /media/chirp/Office/Projects/fe-convoyai
cp tsconfig.json /tmp/ts.bak
node -e "const fs=require('fs');let s=fs.readFileSync('tsconfig.json','utf8').split('\n').filter(l=>!l.trim().startsWith('//')).join('\n');const j=JSON.parse(s);j.compilerOptions.strict=true;delete j.compilerOptions.strictNullChecks;fs.writeFileSync('tsconfig.json',JSON.stringify(j,null,2))"
npx tsc --noEmit 2>&1 | grep -E "screens/(FileA|FileB)\.tsx|components/(CompC)\.tsx" || echo "STRICT-CLEAN"
cp /tmp/ts.bak tsconfig.json
```

(The `node -e` strips `//` comments because `tsconfig.json` is JSONC and `JSON.parse` chokes on them.
Always `cp` restore afterwards — and never commit the strict-on tsconfig.)

---

## 5. GLOBAL GROUNDWORK ALREADY DONE (don't redo; know it exists)

| File                                 | Change                                                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/api.ts`                   | `ApiResult<T = any> = { data?: T; success?: boolean; message?: string; error?: boolean; [key: string]: any }`                                                                                                                                                                                            | The old `ApiEnvelope<unknown> & …` intersection kept resolving `.data` to `unknown` and fought every consumer. Now `response.data` / `response.anything` are `any`. **This is the deliberate API boundary — leave it.** Also has hand-written `User`/`Role`/`Permission`/`Company`/`LoginResponse`/`LaravelPaginated` (used by `UserContext`). |
| `src/types/assets.d.ts`              | `declare module '*.png' { const src: string; export default src }` (+ svg/mp4/webp/…)                                                                                                                                                                                                                    | With `next.config.mjs` `images.disableStaticImages: true`, `import x from './a.png'` is a URL `string`, not Next's `StaticImageData`.                                                                                                                                                                                                          |
| `src/hooks/useSimpleQuery.ts`        | `useSimpleQuery<TData = ApiResult>(key, url: string \| null \| undefined, params?, options?)` — `queryFn: () => get(url as string, params) as Promise<TData>`                                                                                                                                            | Was clamping `TData` to `unknown` via `UseQueryOptions<unknown>`. `url` accepts `null` for conditionally-disabled queries.                                                                                                                                                                                                                     |
| `src/hooks/usePaginatedQuery.ts`     | Same generic treatment (`<TData = ApiResult>`).                                                                                                                                                                                                                                                          | Same.                                                                                                                                                                                                                                                                                                                                          |
| `src/utils/apiHelper.ts`             | `get/post/put/del<T = any>` (was `T = unknown`).                                                                                                                                                                                                                                                         | So `const r = await get(url)` gives `ApiResult<any>`.                                                                                                                                                                                                                                                                                          |
| `src/lib/router-compat.tsx`          | `CompatLocation.state` is `any`. `useParams` re-exported. `Link`/`NavLink` props typed (`NavLinkRenderProps`); render-prop callbacks at call sites need `({ isActive }: { isActive: boolean })`.                                                                                                         | Nav payloads aren't typed.                                                                                                                                                                                                                                                                                                                     |
| `src/contexts/UserContext.tsx`       | `uploadedImage: string \| null` (+ setter).                                                                                                                                                                                                                                                              | It's set to `null` in Navbar & elsewhere.                                                                                                                                                                                                                                                                                                      |
| `next.config.mjs`                    | `images: { unoptimized: true, disableStaticImages: true }`.                                                                                                                                                                                                                                              | Asset-import typing (see above).                                                                                                                                                                                                                                                                                                               |
| `package.json`                       | Added `@types/leaflet` (devDep).                                                                                                                                                                                                                                                                         | `react-leaflet@5` has **no** `<Marker icon>`/`<MapContainer center>`/`<TileLayer tileSize>` prop types without it.                                                                                                                                                                                                                             |
| `components/RadixTable.tsx` (Unit 6) | File **stays `@ts-nocheck`** (internals), but now carries an **explicit exported props contract** — `DataTableProps` / `DataTableColumn` / `DataTableBulkAction` — with the param annotated `}: DataTableProps)`. Consumers: `import DataTable, { type DataTableColumn } from '@components/RadixTable'`. | Unit 6 screens lean on this table hard; a `@ts-nocheck` file's _inferred_ props are a **narrow closed object** (callbacks infer `() => void`, so real handlers clash) — an explicit param annotation fixes the public type with zero internal work.                                                                                            |
| `hooks/useSimpleQuery.ts` (Unit 6)   | `key` widened `string` → `string \| readonly unknown[]`.                                                                                                                                                                                                                                                 | Some callers (e.g. `ManageProduct`) pass a composed array query key.                                                                                                                                                                                                                                                                           |
| `components/Button.tsx` (Unit 6)     | `ButtonProps` gained `sx?: Record<string, unknown>` — accepted, ignored, **not** spread to the DOM node.                                                                                                                                                                                                 | Many Product/Device screens still pass a MUI-style `sx` to the non-MUI `Button`.                                                                                                                                                                                                                                                               |

**Shared components already typed (Units 1 & 3)** — safe to pass real props to:
`Input` (`GlobalInputProps`), `Button` (`ButtonProps`, `ButtonVariant`, `sx?` compat), `Select` (`SelectRadixProps`,
`SelectOption`), `Modal`, `MenuItem` (`MenuItemProps`), `Breadcrumb`, `Navbar` (`NavbarProps`),
`LeftSidebar` (`LeftSidebarProps` + `NavItem`), `DashboardSubNav` (`DashboardSubNavProps`), `Tables`
(`TablesProps`, `TableColumn`, `renderCell?: (...args: any[]) => ReactNode`), `WelcomeIntroModal`,
`GlobalPacketListener`, `DeviceStatusGrid`, `DashboardWrapper`, layouts.
**Also (Unit 6):** `RadixTable` / `DataTable` (`DataTableProps`, `DataTableColumn`, `DataTableBulkAction`).

---

## 6. UNIT LEDGER

### ✅ Unit 1 — shared form primitives — commit `6617d40`

`components/Input.tsx`, `components/Button.tsx`, `components/Select.tsx`.

### ✅ Unit 2 — Auth — commit `3821fd7`

`screens/Login.tsx`, `Register.tsx`, `ForgetPassword.tsx`, `ResetPassword.tsx`, `VerifyAccount.tsx`.
Form-value interfaces + `useForm<T>`; `useRef<Window|null>` / timer refs; `MessageEvent`;
`catch (e: any)`; yup resolvers cast `as any`.

### ✅ Unit 3 — App shell / shared — commit `bd7d635`

`layout/AuthLayout.tsx`, `layout/NonAuthLayout.tsx`, `components/{Navbar,LeftSidebar,MenuItem,
Breadcrumb,Modal,GlobalPacketListener,DashboardSubNav,Tables,WelcomeIntroModal}.tsx`.
Did the `ApiResult` reshape + hooks generics + `apiHelper` defaults + `UserContext.uploadedImage`
here. `RadixTable` intentionally **not** done here → moved to Unit 7.

### ✅ Unit 4 — Dashboard/Home — commit `945e01f`

`screens/Home.tsx` (`DashboardAnalytics` state interface), `components/DeviceStatusGrid.tsx`,
`components/DashboardWrapper.tsx`. `screens/Dashboard.tsx` was already clean (untouched).

### ✅ Unit 5 — Fleet — commit `92c06b9`

Typed: `screens/{FleetManagement,Vehicles,Drivers,Geofences,Yards,FleetMap,Trips}.tsx`,
`components/{DriverDetailModal,YardLayoutEditor,ComplianceTab,VehicleMarker,YardMarker}.tsx`.
Pattern for the list screens (Vehicles/Drivers/Geofences/Yards/Trips): `type X = any` domain alias,
`XRow`/`NewXForm` sub-components get inline prop types, `statusColors: Record<string,string>`.
Installed `@types/leaflet`; `useSimpleQuery` url widened to `| null`.

### ⬜ Unit 5b — DEFERRED Fleet giants — the 3 biggest files in the codebase

- `components/VehicleDetailModal.tsx` — **1017 L**, sub-components `Stat`, `OverviewTab`, `TrackerTab`,
  `MaintenanceTab`, `FuelTab` (+ their own forms). Opened from `Vehicles.tsx` & `FleetMap.tsx` via
  `openModal(<VehicleDetailModal vehicleId={…} />)`.
- `components/TripDetailModal.tsx` — **997 L**, sub-components `OverviewTab`, `PlannedYardsSection`,
  `PlannedYardCard`, `YardTimeCard`, `TimelineTab`, `JourneyStage`, `TimeRow`, `StatusBanner`,
  `InfoCard`, `RoutePoint`, `SectionTitle`, `CancelForm`, `PlusIcon`. `useState(trip.odometer_end_km ?? '')`
  patterns (init from prop). Opened from `Trips.tsx`.
- `screens/FleetDashboard.tsx` — **1092 L**, chart.js heavy (`react-chartjs-2`), 5-endpoint dashboard,
  column-sort state, `onNavigateTab?: (id: string) => void` prop (passed by `FleetManagement`), also
  passes `onNavigateMap` to a child. Consumed OK today because `@ts-nocheck` still exposes
  `{ onNavigateTab: any }`.
- **Recommended approach:** treat each as its own mini-unit. Top-level props interface + top-level
  state/handlers strict; every sub-component gets `function Sub({ … }: { …: any })` (explicit `any`
  under strict is fine). Don't try to model the API/chart data.

### ✅ Unit 6 — Products / Devices — commit `9ab991f`

Typed: `screens/{ManageProduct,ManageProductConfig,ProductConfiguration,ManageDevice,
ManageDeviceConfig,ManageConfiguration,ProtocolIntegration,Integration}.tsx`.
Patterns:

- `ManageProduct` / `ManageProductConfig` are near-identical list screens (default export named
  `ManageProduct` in both) — `DataTableColumn[]` columns, `useState<any[]>` for selection, handlers
  typed `(page: number)` / `(e: ChangeEvent<HTMLInputElement>)` / `(actionValue: string)`.
- `ManageDevice` / `ManageDeviceConfig` / `ManageConfiguration` are near-duplicate tab pages
  (default export named `ManageDevice` in all three). `useParams<{ productId: string }>()` to get a
  `string` (not `string | string[]`). `queryParams` object → `Record<string, any>` so
  `params.search = …` is legal. Inner sub-components (`DeviceStatus`, `TabNavigation`, `EditableCell`)
  got inline `{ …: any }` prop types; `tabs` array annotated `{ id; label; icon: React.ReactNode;
count?: any }[]` (mixed-shape literal otherwise fails `.count` access).
- `ProductConfiguration` + `ProtocolIntegration`: `useForm<FormValues>` + `yupResolver(schema) as any`;
  every `.some/.map/.filter/.forEach` callback over API data annotated `(x: any)`;
  `effectiveConfiguration` cast to `any`.
- **Shared-component work pulled in** (see §5 new rows): `RadixTable` public contract, `Button.sx?`,
  `useSimpleQuery` array key, plus one-line `@ts-nocheck` signature widenings on `AddDevices`
  (extra ignored props), `ConfirmActivationModal` (`itemName = ''`), `DropDownMenuRadix` (inline
  param type, `id?`), `IntegrationContent` (`_props: { data?: any }`), `ConvoyAIDemo/
ProductConfigurationDemo.ts` (`return null;` so it's a valid component).
- `AttributeModal.tsx` / `DeviceTable.tsx` / `DevicePointsModal` stay `@ts-nocheck` — their inferred
  props covered every call site.

### ✅ Unit 7 — Rules — commit `0cdd6d0`

Typed `screens/{RuleBuilder,AddNewRule}.tsx`.

- `RuleBuilder` — `DataTableColumn[]` columns (needed `DataTableColumn.accessor` widened to
  `string | null` — computed/action columns pass `accessor: null`), typed page/search/sort/bulk
  handlers, `rules` / `selectedRules` as `any[]`, `renderActionTypes(rule: any)`.
- `AddNewRule` — `RuleFormValues` + `RuleCondition` interfaces; `useForm<RuleFormValues>` +
  `useFieldArray({ control, name: 'conditions' })`. `setValue(`conditions.${i}.selectedProduct`, …)`
  template-string paths must be cast `as any` (not a static `FieldPath`). All attribute-mapping
  helper params annotated `any`; `createAttributeMapping` param typed `any[]`.
  `onSubmit(data: RuleFormValues)`.
- `@ts-nocheck` signature widenings: `ConfirmDelete` (inline param type — optional `itemName` +
  ignored `title`/`message`), `TableSkeleton` (`_props: { count?: number }`), `EmailAction` /
  `SmsAction` (`inputStyles = undefined` — dead prop), `ConvoyAIDemo/RuleBuilderDemo.ts` (`return null`).
- Removed dead imports from `AddNewRule` (`ConditionSelect`, `ConditionalDropdown`,
  `mapExtractedKeys`/`getKeyAfterLastDot`, `X`). **Deleted empty `screens/Rules.tsx`.**
- `ConditionRow` / `EmailAction` / `SmsAction` / `SystemNotificationAction` / `CustomSelect` stay
  `@ts-nocheck` — inferred props covered the call sites (after the `inputStyles` widening).

### ✅ Unit 8 — Roles / Users / Admin — commits `d102f64` + follow-up

Typed 12: `screens/{StatusFilterContent,EditCompany,EditUser,CompanyLocation,AllDevices,AllAsset,
Allproducts,AllCompaniesList,InternalUser,PermissionToggle,RolesPermission,AccountSettings}.tsx`.

- **List screens** (`AllDevices`, `AllAsset`, `Allproducts`, `AllCompaniesList`, `InternalUser`) =
  the RadixTable recipe: `DataTableColumn[]` columns, `useState<any[]>` selection, typed
  page/search/sort/bulk handlers, `useParams<{ … }>()`. Client-filter screens (`AllAsset`,
  `InternalUser`) type their `processedData` `useMemo<any[]>` and cast the sort accessor
  (`a[sortBy]`) — or type the whole source array `any[]`.
- **Form screens** (`PermissionToggle`, `RolesPermission`, `AccountSettings`) = `useForm<FormValues>`
  - `yupResolver(schema) as any`; `Record<string, boolean>` for permission-toggle maps;
    `useMemo`/handler callbacks over API arrays annotated `(x: any)`. `AccountSettings` also: module
    helpers (`buildImageUrl`, `toInternationalPhoneValue`, …) get `any` params; `<Checkbox.Root
onCheckedChange>` wrapped `(c) => setX(!!c)` (Radix passes `'indeterminate'`); `BasicFormValues.
profile_image` typed `string | File` (NOT `any` — an `any` member degrades RHF's whole
    `FieldErrors<T>` so `errors.first_name?.message` stops being a plain string).
- **`AllUser.tsx` stays `@ts-nocheck`** — pre-existing `onRefetch` bug (referenced in 3 delete/add
  paths, never a prop → `ReferenceError` every time; the `del`/`post` already fired so the row is
  gone but the modal never closes). Not a migration regression. Added `onRefetch` to its props
  destructure so `EditCompany`'s `onRefetch={refetch}` type-checks and the guarded calls work;
  owner's call = don't trade correctness for strict types, so full typing deferred.
- `user` is `User | null` — old code did `user.id` / `user.roles[0].company_id` unguarded;
  switched to `user?.id` / `(user as any)?.roles?.[0]?.company_id` (matches every other screen).
- New `src/types/modules.d.ts` — `declare module 'react-scrollspy'` (untyped dep, strict needs it).
- `@ts-nocheck` signature widenings this unit: `AccountSettings` (`BasicCard` param type),
  `AddLocation` (`companyID?`, `refetch = () => {}`), `GLobalCheckBox` (`checked?`),
  `GlobalRadioGroup` (explicit param type — `options = []` infers `never[]` under strict),
  `CreateProductFromPayload` (`initialProductId?`), `CardRole` (`onSuccess = () => {}`,
  `onClose = () => {}` — NOT `= undefined`, which infers the type `undefined`), `CustomAvatar`
  (`onImageChange = (_file?: any) => {}` for arity), `TableSkeleton` (`count?`).
- `RadixTable` public types grew: `DataTableColumn.sortable?`, `DataTableProps.defaultRowsPerPage?`,
  `DataTableBulkAction.id` → `string | number`.

Still **not** `@ts-nocheck` and left as-is: `CompanyFilterContent`, `DeviceFilterContent`,
`LocationFilterContent`, `TemplateFilterContent`, `PermissionToggler`, `MembersList`.
`forms/ReuseAbleModel.tsx` (undefined `InputField`) — still parked, see §7.

### ✅ Unit 9 — Assets / WebGL — commit `f9ee5c2`

Typed `screens/{Assets,WEBGLBUILDING,WEBGLFARM,WEBGLMARINA}.tsx`. **Type-only, zero restructuring**
(highest visual-risk area).

- **Unity `Window` globals** now live in `src/types/modules.d.ts` (alongside `react-scrollspy`) as a
  bare `interface Window { createUnityInstance?: (canvas, config, onProgress?) => Promise<any>;
gameInstance?: any; unityInitialized?: boolean; ReactUnityBridge?: (type, payload) => void }`. The
  typed `createUnityInstance` means the `.then(i => …).catch(e => …)` chains need no annotations
  (Promise callbacks are contextually `any`).
- **WEBGL screens** (`FARM`/`MARINA`/`BUILDING`): `useRef<HTMLCanvasElement | null>(null)`; keydown
  handlers `(e: KeyboardEvent)`; `WEBGLBUILDING` props `{ webglBuildingData?: any }`, state
  (`breadCrumb`, `dataFromUnity`) as `any` / `any[]`. **Gotcha:** `useState<any>` makes the setter
  `Dispatch<any>` (the `SetStateAction<any>` union collapses), so `setX(prev => …)` updaters get NO
  contextual type → annotate `setX((prev: any) => …)`.
- **`Assets.tsx`**: antd `Tree` — `treeData={treeData as any}` (query `data` is `ApiResult`, antd
  wants `DataNode[]`), `titleRender={(node: any) => …}` / `onSelect={handleSelect}` with
  `handleSelect = (keys: any, { node }: any) => …` / `switcherIcon={({ expanded }: any) => …}`
  (antd's `DataNode` has no `data`/`isTopMost`/`id`). `IconMapper` is a concrete object literal (no
  index signature) → `(IconMapper as any)[node.icon]`. `usePusher()` / `useTheme()` are already
  typed (`bindBuildingEvent`, `isLight`). `FlowChart`, `AddEditEntityModal`, `FloorPlanEditor`,
  `BuildingMultiFloor3DViewer` stay `@ts-nocheck` — inferred props covered the calls.

### ✅ Unit 10 — Map / Simulation / misc — commit `PENDING`

Typed `screens/{Map,Simulation,Alarms,ConnectorHealthPage}.tsx`.

- `Map.tsx` — `const position: [number, number] = [...]` (leaflet `center`/`position` want a tuple).
- `Simulation.tsx` (799 L) — the module-level config maps (`PRODUCT_CONFIG`, `FIELD_CONFIG` via
  `.reduce<Record<string, any>>`) and the component state (`formData`, `errors`, `payload`,
  `newErrors`, `next`) are all `Record<string, any>` so `x[dynamicField]` is legal. **Gotcha:**
  `Record<string, any>` does NOT contextually type nested arrow params under strict — the
  `validate: (value, t) => …` / `toPayload: value => …` inside `PRODUCT_CONFIG` still need explicit
  `(value: any, t: any)`. `Icon` set typed `Record<string, (p: any) => any>` (`(p) => ReactNode`
  isn't a valid JSX element type; `=> any` is). Curried handler:
  `handleInputChange = (field: string) => (e: ChangeEvent<HTMLInputElement>) => …`. Sub-components
  (`FormSection`/`SummaryRow`/`SegmentedControl`/`StatusToggle`/`BooleanToggle`) get inline prop
  types; `onChange` that's always passed is required (not `?`) so the unguarded call type-checks.
  `BooleanToggle` `label` is `any` not `ReactNode` (it feeds `aria-label`, which wants `string`).
- `Alarms.tsx` / `ConnectorHealthPage.tsx` — small; `alarms`/`connectors` as `any[]`/`any`, card
  sub-components inline-typed, the `{active,acknowledged,cleared}[alarm.state]` icon map cast
  `as Record<string, ReactNode>` (object literal has no index signature).

### After all units — hand back to `task.md` Phase 7 tail

Then (separate, owner-gated): flip `strictNullChecks: true` → fix fallout → `noImplicitAny: true` →
fix → `strict: true`. Remove `@ts-nocheck` from the remaining low-level components/forms/fakeBackend
over time (grep `@ts-nocheck -- TODO`).

---

## 7. LATENT BUGS FOUND WHILE TYPING (behaviour kept identical — flag list for the owner)

1. `components/Select.tsx` — `<Select.Content onOpenAutoFocus={…}>`: Radix **Select** Content has no
   `onOpenAutoFocus` (it's a Dialog/Popover prop). The searchable-select autofocus-on-open has been
   dead since before the migration. Kept verbatim via a loose spread + comment.
2. `screens/VerifyAccount.tsx` — the resend-email failure branch does `setResendMessage(response.error …)`
   expecting a message string, but `apiHelper` sets `error: true` (boolean) on caught failures — so a
   real failure sets `resendMessage` to `true` (renders as nothing). Behaviour unchanged (`(response as any)?.error`).
3. `screens/AllUser.tsx` — `onRefetch` referenced in 3 add/delete paths, never a prop → `ReferenceError`
   every time (the mutating API call already fired). Unit 8: added `onRefetch` to the props destructure
   so the guarded calls work + `EditCompany` type-checks; **file kept `@ts-nocheck`** (owner: correctness
   over strict types), so full typing is still pending.
4. `forms/FormComponents/ReuseAbleModel.tsx` — undefined identifier `InputField`. Pre-existing.
5. `components/Widgets/DeviceWidgets/*.tsx` (~14 files) — import `'../Widgets/WidgetInitialDiv'`
   which resolves to a non-existent `Widgets/Widgets/` path. Parked widget-dashboard code. Pre-existing.
6. `GuestHomeComponents/pages/{Home,UseCases}.tsx` — import `'@/components/sections'` (`@/` alias
   doesn't exist in this project). Part of a dead standalone GuestHome dev harness. Pre-existing.
7. **Unit 6** — `screens/ProductConfiguration.tsx` & `screens/ProtocolIntegration.tsx` call
   `useSimpleQuery(key, url, { enabled: … })` — the options object lands in the **3rd** (`params`)
   slot, not the 4th (`options`). `enabled` never disables the query; it just pollutes the query key.
   These queries always run. Kept verbatim.
8. **Unit 6** — `screens/ProductConfiguration.tsx` `markAsUniqueAPI` does
   `response.message.includes('successfully')` with no null guard — a failure response without
   `message` throws. Kept verbatim via `(response as any).message`.
9. **Unit 6** — `screens/ProductConfiguration.tsx` `handleModal` calls
   `handleModalSave(data, selectedAttribute, productName)` with a 3rd arg the 2-param function
   ignored. Added an unused `_productName?` param so the call type-checks; behaviour unchanged.
10. **Unit 6** — `ConvoyAIDemo/ProductConfigurationDemo.ts` had no `return` → typed as returning
    `void`, so `<ProductConfigurationDemo />` errored once its consumer was checked. Added
    `return null;` (matches `ManageProductDemo`). `components/Button.tsx` `sx` prop from Product/
    Device screens was always a no-op MUI leftover — now an accepted-and-ignored `ButtonProps.sx?`.
11. **Unit 7** — `screens/RuleBuilder.tsx` used react-query **v4** API on v5: `useSimpleQuery(…, {
keepPreviousData: true })` (option removed in v5 → moved to `placeholderData: keepPreviousData`)
    and destructured `isPreviousData` (renamed `isPlaceholderData`). Both dead since the v5 upgrade —
    removed. "Keep previous page while paginating" is gone until someone wires `placeholderData`.
12. **Unit 7** — `components/ConfirmDelete.tsx` renders its title + message from i18n, but
    `RuleBuilder`'s bulk-delete path passes `title` / `message` props it never reads. Always a no-op.
    Widened the `@ts-nocheck` signature to accept + ignore them; `ConvoyAIDemo/RuleBuilderDemo.ts`
    got `return null;` (same void-component issue as #10).
13. **Unit 8** — see #3 (`AllUser.tsx` `onRefetch`). Also `RolesPermission.tsx` /
    `AllCompaniesList.tsx` read `user.id` / `user.roles[0].company_id` with `user: User | null`
    unguarded — would throw if `user` is briefly null. Switched to optional chaining; happy path
    identical.

---

## 8. GOTCHAS THAT WILL BITE YOU (learned the hard way)

- **`tsc --strict` whole-project = ~390 errors and that's EXPECTED** — all in `@ts-nocheck` files.
  Only ever grep the strict output for _your unit's_ files.
- **`next.config.mjs` / `tsconfig.json` get reformatted by Next** on every build/dev; `tsconfig.json`
  loses `//` comments. Don't panic; don't fight it.
- **`@ts-nocheck` files still export inferred types — and those types are NARROW, not `any`.** A
  `@ts-nocheck` `const C = ({ a = [], onX = () => {} }) => …` exports props `{ a?: never[];
onX?: () => void }` (a _closed_ object). So `<C onX={(id: number) => …} />` **fails** (arity), and
  `<C somethingElse={…} />` fails (excess prop). Two clean fixes, both keeping `@ts-nocheck`:
  (a) add the missing prop to the destructure with a default (`foo = ''`) — widens the inferred type;
  (b) annotate the whole param with an inline/exported type (`}: { foo?: string; … }` or
  `}: CProps`) — best when a screen needs a real contract (this is what `RadixTable` / `DataTable`
  got in Unit 6). You still don't need to type a whole dependency tree — just the one prop or the
  one signature.
- **MUIicons wrappers** (`src/assets/icons/MUIicons/*.tsx`) — many have a latent `fontSize={size}`
  overload mismatch; they're `@ts-nocheck` so it's hidden. If you un-nocheck one, type `size` as
  `'inherit' | 'large' | 'medium' | 'small'` or cast. **Not in scope** — leave them.
- **`useForm` + `yupResolver`**: the resolver's inferred field-optionality fights `useForm<T>`'s
  generic. Always `resolver: yupResolver(schema) as any` and keep `useForm<FormValues>`.
- **`catch` clause**: only `any` or `unknown` allowed as the annotation. Use `catch (e: any)` when
  you read `e.something`.
- **leaflet JSX**: needs `@types/leaflet` (installed). `center`/`position` want `[number, number]`
  tuples — append `as [number, number]`.
- **prettier on commit** reflows your edits — review `git diff` after the commit if precise
  formatting matters, but it's cosmetic.
- **`next build` is slow (~1 min) + needs 6 GB heap.** Run it once per unit, not per file.
- Session/commit trailer: `Claude-Session:` URL differs per session — use the current one.

---

## 9. COMMIT HISTORY FOR THIS TASK (on `feat/next-ts-migration`)

```
f9ee5c2 types(unit 9): strict props/state for Assets + WebGL screens
151e101 docs: sync Unit 8 commit hashes
1f9fdb5 types(unit 8, part 2): Roles/Users/Admin form screens (PermissionToggle, RolesPermission, AccountSettings)
d102f64 types(unit 8, part 1): Roles/Users/Admin list screens + tab containers
67bae33 docs: sync Unit 7 commit hash (0cdd6d0)
0cdd6d0 types(unit 7): strict props/state for Rules screens (RuleBuilder, AddNewRule)
9ab991f types(unit 6): strict props/state for Products/Devices screens + RadixTable props contract
efad388 docs: TYPING_HANDOFF.md — resume doc for the strict-typing follow-up
92c06b9 types(unit 5): strict props/state for Fleet screens + components
945e01f types(unit 4): strict props/state for Dashboard/Home
bd7d635 types(unit 3): strict props/state for app shell + shared components
3821fd7 types(unit 2): strict props/state for Auth screens
6617d40 types(unit 1): strict props for shared form primitives
0c732f3 Phase 7: docs — migration addendum + Next test instructions   ← migration ended here
```

(Everything before `0c732f3` is the Next/TS migration itself — see `task.md`.)

---

## 10. POST-UNIT-10 NOTES (2026-09-18) — READ THIS FIRST WHEN RESUMING

**State:** all 10 screen units are done and committed (last code commit `60e413e`, doc syncs after; HEAD `68afaa3`).
`tsc --noEmit` = 0, `next build` green, 161 `@ts-nocheck` files left. Working tree is clean after the commit that includes the `product_name` fix (§B).

### A. Repo moved off the HDD (done)

- `/media/chirp/Office` is a spinning Toshiba HDD (fuseblk/NTFS) — `next dev` was very slow there (32s start, up to 38s/page,
  ~8 GB RSS, laptop freezes). Repo now lives on the NVMe at **`~/projects/fe-convoyai`** (verified: same branch, remotes
  `origin`=ahm-med/FE-ConvoyAI and `upstream`=MuhammadShoaib756/ConvoyAIFrontend, uncommitted changes, `.env*`, `.husky` all intact).
- Old copy left at `/media/chirp/Office/Projects/fe-convoyai.OLD-delete-me` — owner deletes it once happy. Do not work in it.
- NVMe cold-cache dev timings: start 10s, `/all-products` 2.4s, `/roles-permission` 23s, `/simulation` 28s (first compile; ~6 GB RSS).
- Do NOT symlink `.next` to another disk — Node resolves `react`/`next` from the symlink's real path and every page 500s.
- Backend (`/media/chirp/Office/Projects/ConvoyAI`, run via pm2) is still on the HDD; it isn't CPU-bound. Could be moved the
  same way (update pm2 paths). Frontend expects it at `NEXT_PUBLIC_API_URL=http://localhost:8080/`.
- Possible next speedup: `next dev --turbopack`. Needs `next.config.mjs` changes — the custom webpack rule that makes
  png/svg/mp4 imports resolve to URL strings has no direct Turbopack equivalent yet. Not attempted.

### B. Add Product `product_name` fix — VERIFIED by the owner and committed

Files (committed): `src/forms/MultiStepForm/SecondstepForm.tsx`, `src/forms/MultiStepForm/AddDevices.tsx` (+ this doc).

- Bug 1: `handleBoxClick` only updated local state, so switching product-source boxes left `formData.step1.box` stale.
  Fix: it now resets `formData.step1` (`{ isFilled:false, data:{}, box:id }`).
- Bug 2 (after the owner commented out the `new-template` entry of `boxData`, on purpose — leave it commented): box identity was
  the array index, so indices shifted and `AddDevices` (`box === 2` / `=== 0`) sent the wrong payload. Fix: boxes are now
  identified by their stable `id` (`'new-template' | 'existing-product' | 'new-product'`) in both files; default selection is
  the first box in the list; `hasExistingProduct` initialiser is `box: 'existing-product'`.
- Verified: `tsc` = 0; live browser test proved the reset mechanism (name field clears, "Next" re-disables) and that the plain
  path sends `product_name`. The re-test after the id refactor was inconclusive (browser tool couldn't reach the page) —
  the owner has since verified it manually (no action needed). Test recipe for reference: Add Product → "New Product" → name → Next → fill device fields → Save → check the
  POST body contains `product_name`. (Reachable at `/all-products` with the demo account `demoAccount@chirptech.io`; note the
  demo account hits the real backend for `POST /api/products` and gets 401 — the request body is still what matters.)

### B2. Dev-server memory runaway / laptop freezes (2026-09-18) — see **`DEV_PERFORMANCE.md`**

`next dev` OOM'd at ~7 GB and froze the laptop. Root cause of the `/roles-permission` crash: `ReactIconDynamicImport.tsx` (64 dynamic imports over ~20 huge react-icons packs) — fixed by generating a local `ReactIcon/iconData.ts` (`npm run gen:icons`). (A first, unexplained `/login` incident was cured by `rm -rf .next`.)
Separate structural cause of heavy dev memory: webpack dev keeps every compiled route's module graph (1 → ~4 GB across the app).
`npm run dev` is now a guarded wrapper (cap + logs + monitor + auto-restart); after a freeze run `npm run dev:report` and paste it.
Not TypeScript, not fakeBackend. Prod/Vercel unaffected. Details, evidence, tuning knobs and next steps: `DEV_PERFORMANCE.md`.

### C. Still open / deferred

- Unit 5b (3 giant Fleet files: `VehicleDetailModal`, `TripDetailModal`, `FleetDashboard`) still `@ts-nocheck`.
- `AllUser.tsx` kept `@ts-nocheck` (pre-existing `onRefetch` ReferenceError; `onRefetch` prop added, full typing deferred).
- Owner-gated later: `strictNullChecks` → `noImplicitAny` → `strict:true`; low-level leaf components; lint backlog; Phase 8 SEO.
- Owner said: prefer typing → `any` → leave `@ts-nocheck`; never trade working behaviour for strict types.
