# File map — where things live

Counts as of the copy (`git ls-files`: 758 tracked files; ~561 code/doc files outside assets).

## 1. Repo root

`app/` (Next routes, see §2) · `src/` (all code) · `public/` (locales, unity/, DiaryFarm/, samples, mockServiceWorker.js, floor_plan.webp, favicon) · `styles/global.css` (Calendly + guest utilities) · `scripts/` (`dev-safe.sh`, `dev-monitor.sh`, `dev-report.sh`, `gen-react-icon-data.mjs`) ·
`axiosConfig.ts`, `reactQueryConfig.ts` (alias `@root/…`) · `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `.eslintrc.json`, `.prettierrc`, `.prettierignore`, `.husky/pre-commit` (`npx lint-staged`), `package.json` (`lint-staged` runs prettier on js/ts/json/css/md; `msw.workerDirectory:['public']`), `vercel.json` ·
`.env` (Vite-era, unused), `.env.local` (real: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MAPTILER_KEY`) · docs: `task.md`, `CLAUDE_FRONTEND_CONTEXT.md`, `FLEET_ANALYTICS_DESIGN.md`, `TYPING_HANDOFF.md`, `DEV_PERFORMANCE.md`, `HOW_TO_TEST.md`, `kapi dashboard.md`, `README.md`(boilerplate), `backend_frontend_sync/`, and this `agent/` folder.

## 2. Routes → components (`app/**/page.tsx`)

`app/layout.tsx` (server root) · `providers.tsx` · `app-shell.tsx` · `bootstrap.tsx` · `route-progress.tsx` · `not-found.tsx` · `(public)/layout.tsx` · `(app)/layout.tsx` (auth guard) · `(app)/fleet-management/layout.tsx`.
Routes (generated from the files):

| Route                                      | Component                           |
| ------------------------------------------ | ----------------------------------- |
| `/account-setting`                         | `screens/AccountSettings`           |
| `/alarms`                                  | `screens/Alarms`                    |
| `/all-products/[productId]/[tab]`          | `screens/ManageConfiguration`       |
| `/all-products`                            | `screens/Allproducts`               |
| `/analytics`                               | `components/SuperAdminDashboard`    |
| `/assets`                                  | `screens/Assets`                    |
| `/assign-permission/[id]`                  | `screens/PermissionToggle`          |
| `/assign-permission`                       | `screens/PermissionToggle`          |
| `/companies/[companyId]/assets`            | `screens/EditCompany`               |
| `/companies/[companyId]/company-settings`  | `screens/EditCompany`               |
| `/companies/[companyId]/users`             | `screens/EditCompany`               |
| `/companies/list`                          | `screens/AllCompaniesList`          |
| `/company-location`                        | `screens/CompanyLocation`           |
| `/connector-health`                        | `screens/ConnectorHealthPage`       |
| `/dashboard/[id]`                          | `components/DashboardWrapper`       |
| `/documentation`                           | `screens/Documentation`             |
| `/edit-products/[productId]/[tab]`         | `screens/ManageDeviceConfig`        |
| `/edit-user/[id]`                          | `screens/EditUser`                  |
| `/fleet-management/analytics/fuel`         | `screens/FleetFuelAnalytics`        |
| `/fleet-management/analytics/maintenance`  | `screens/FleetMaintenanceAnalytics` |
| `/fleet-management/analytics/trips`        | `screens/FleetTripsAnalytics`       |
| `/fleet-management/analytics/utilisation`  | `screens/FleetUtilisation`          |
| `/fleet-management/legacy`                 | `screens/FleetManagement`           |
| `/fleet-management/operations/assignments` | `screens/Assignments`               |
| `/fleet-management/operations/drivers`     | `screens/Drivers`                   |
| `/fleet-management/operations/geofences`   | `screens/Geofences`                 |
| `/fleet-management/operations/incidents`   | `screens/Incidents`                 |
| `/fleet-management/operations/map`         | `screens/FleetMap`                  |
| `/fleet-management/operations/overview`    | `screens/FleetOverview`             |
| `/fleet-management/operations/trips`       | `screens/Trips`                     |
| `/fleet-management/operations/vehicles`    | `screens/Vehicles`                  |
| `/fleet-management/operations/yards`       | `screens/Yards`                     |
| `/fleet-management/overview`               | `redirect`                          |
| `/fleet-management`                        | `redirect`                          |
| `/fleet-management/settings`               | `screens/FleetSettings`             |
| `/home`                                    | `screens/Home`                      |
| `/integration`                             | `screens/Integration`               |
| `/internal-user`                           | `screens/InternalUser`              |
| `/manage-product`                          | `screens/ManageProduct`             |
| `/map`                                     | `screens/Map`                       |
| `/members`                                 | `screens/RolesPermission`           |
| `/module-management`                       | `screens/ModuleManagement`          |
| `/new-rule/[ruleId]`                       | `screens/AddNewRule`                |
| `/new-rule`                                | `screens/AddNewRule`                |
| `/plan-management`                         | `screens/PlanManagement`            |
| `/product-configuration/[id]`              | `screens/ProductConfiguration`      |
| `/products/[productId]/[tab]`              | `screens/ManageDevice`              |
| `/profile`                                 | `screens/Profile`                   |
| `/roles-permission`                        | `screens/RolesPermission`           |
| `/rule-builder`                            | `screens/RuleBuilder`               |
| `/simulation`                              | `screens/Simulation`                |
| `/users/[userId]/activity`                 | `screens/AllUser`                   |
| `/users/[userId]/profile`                  | `screens/AllUser`                   |
| `/users/[userId]/security`                 | `screens/AllUser`                   |
| `/users`                                   | `screens/AllUser`                   |
| `/webgl-building`                          | `screens/WEBGLBUILDING`             |
| `/webgl-farm`                              | `screens/WEBGLFARM`                 |
| `/forget-password`                         | `screens/ForgetPassword`            |
| `/login`                                   | `screens/Login`                     |
| `/`                                        | `screens/GuestHome`                 |
| `/plan-price`                              | `screens/PlanAndPrice`              |
| `/register`                                | `screens/Register`                  |
| `/reset-password`                          | `screens/ResetPassword`             |
| `/use-cases`                               | `screens/UseCases`                  |
| `/verify-token/[token]`                    | `screens/VerifyAccount`             |

(`/fleet-management` and `/fleet-management/overview` are server redirects to `/fleet-management/operations/overview`; the three tab families `[tab]` are validated against fixed tab lists.)

## 3. `src/` folders

| Folder                 | Files | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screens/`             | 70    | one file per page/screen (alias `@screens`/`@pages`); biggest: `ManageDevice` 1129, `FleetDashboard` 1108 (legacy), `FleetOverview` 1033, `ProductConfiguration` 973, `FleetFuelAnalytics` 867, `FleetSettings` 853, `AccountSettings` 851, `Simulation` 844, `FleetTripsAnalytics` 774, `AddNewRule` 733                                                                                                                                                                                       |
| `components/`          | 197   | shared + feature components: `analytics/` (kit), `fleet/` (nav), `list/` (list kit), `records/` (fleet records), `fleetSettings/`, `Widgets/{DeviceWidgets,GeneralWidgets,GraphWidgets,Utils}` (legacy), flat files for modals/forms/viewers (see domain docs)                                                                                                                                                                                                                                  |
| `contexts/`            | 5     | `UserContext`, `ThemeContext`, `ModalContext`, `ToastContext`, `SocketContext`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `hooks/`               | 24    | data & list hooks (see `architecture/data-layer-and-state.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `utils/`               | 30    | `apiHelper`, `units`, `fleet*`, `serverExport`, `mapViewport`, `datetime`, `avatar`, `csvDevices`, `DynamicImport` (legacy widgets), `IconMapper`, `ReactIconDynamicImport`, `LottieDynamicImport`, `DataFormatter` (asset tree transforms), `extractKeys/mapExtractedKeys` (packet key extraction), `packetToastManager`, `DemoHelper`, `AddCompanyDemo/AddProductDemo`, `fakeBackend/` (MSW+Dexie: `browser, db, handlers, controllers, fleetControllers, helpers, mockSocket, Data(6.6k L)`) |
| `forms/`               | 41    | `MultiStepForm/*` (AddDevices 1–5 steps), `FormComponents/*` (TagInput, Dropzone, ShowAndHide, …), `DashboardForms/*` (legacy widget forms)                                                                                                                                                                                                                                                                                                                                                     |
| `validation/`          | 27    | yup schemas (login, register, rule forms, widget forms, product configuration, location…)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `layout/`              | 2     | `AuthLayout`, `NonAuthLayout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/`                 | 3     | `router-compat.tsx`, `cal.ts` (Cal.com), `utils.ts` (`cn` = clsx+twMerge; untyped params)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `types/`               | 3     | `api.ts`, `assets.d.ts`, `modules.d.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `skeletons/`           | 2     | `ManageProductSkeleton`, `WidgetSkeleton`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ConvoyDemo/`          | 7     | driver.js tours (unreachable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GuestHomeComponents/` | 45    | marketing site (see domain doc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `assets/`              | 219   | icons (`icons/{MUIicons,ReactIcon,LandingpageIcon}`), `svg/` (tank/status SVGs), `images/`, `LottieFiles/`, `fonts/Digital7Mono.ttf`, videos                                                                                                                                                                                                                                                                                                                                                    |
| `acl/`                 | 0     | empty (alias exists)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `i18n.ts`, `index.css` |       | i18next config; **design tokens + global CSS**                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 4. Components cheat-sheet by feature (flat files in `src/components`)

- **Shell:** `Navbar`, `LeftSidebar` (692 L, nav + permission gating), `SubNavbar`, `RightSidebar`, `Breadcrumb`, `MenuItem`, `AccordionSection`, `ThemeToggle`, `WelcomeIntroModal`, `Modal`, `Loader/SpinLoader`, `NotFound`, `Error500`.
- **Generic UI:** `Button`, `Input`, `Select`, `CustomSelect`, `RadixDropDown`, `DropDownMenuRadix`, `CustomPopover`, `CheckBox`, `GLobalCheckBox`, `GlobalRadioGroup`, `SearchField`, `FilterButton/FilterPopper/FilteredContent`, `Accordion`, `Card`(legacy), `CustomAvatar`, `ImageCropModal`, `PaginatedList`, `RadixTable`, `DeviceTable`, `Tables`, `TableSkeleton`, `Confirm*`.
- **Products/devices:** `AddProductModal`(demo), `AttributeModal`, `CreateProductFromPayload`, `CreateTemplateModal`, `SaveAsTemplateModal`, `DevicePointsModal`, `DeviceStatusGrid`, `PacketPayloadViewer`, `HTTPProtocol`, `MQTTProtocol`, `GlobalPacketListener`, `ProductConfigurationSkeleton`.
- **Rules:** `ConditionRow`, `ConditionDropdownPanel`, `EmailAction`, `SmsAction`, `SystemNotificationAction`, `AddNewRuleSkeleton`.
- **Assets/3D:** `AddEditEntityModal`, `FlowChart`, `AnimatedEdge`, `FloorPlanEditor`, `FloorPlan3DViewer`, `BuildingMultiFloor3DViewer`, `LeftOverlayWebGL{Building,Farm,Boat}`, `RightOverlayWebGL{Building,Farm,Boat}`, `RotateDeviceOverlay`, `webglBreadcrumb`.
- **Admin:** `AddCompanyForm`, `AddUserForm`, `AddMemberForm`, `AddRole`, `CardRole`, `AddLocation`, `SuperAdminDashboard(+Skeleton)`, `ContactNotificationSlides`, `AccountSettingSubNav`, `IntegrationSubNav`, `IntegrationContent`.
- **Fleet:** see `domains/fleet.md` §8.
- **Legacy/unused:** `Grid`, `Widgets/*`, `ChatBot` (unused), `LineChart/Neon*Chart`, `NonAuthNavBar/Footer`, `MultiLevelDropdown` (empty), `lazyComponents.ts`, `Card`.

---

## ADDENDUM 2026-09-27 — new/changed files from the ConvoyAI UI revamp (T-002)

(Older sections above still describe the pre-revamp layout; where they conflict, this addendum wins.)

**Styling system**: `src/styles/tokens.css` (all design tokens: `@theme static` + `:root` gradients/glass/motion), `src/styles/components.css` (semantic classes, everything inside `@layer components`), `src/index.css` (imports + base only), `src/lib/design/tokens.ts` (`token('--color-…')` runtime reader), `app/layout.tsx` (fonts link, gradient defs, `<html class=light>`), docs `agent/architecture/design-tokens.md`, `convoyai-design-spec.md`, `library-audit-2026-09-26.md`.

**Shell**: `src/components/shell/` FloatingNav, nav-config, CommandPalette, CopilotPanel, CopilotChat (mock answers; `answer()` keyword order matters), BrandMark; `src/layout/AuthLayout.tsx` wires them + `SpotlightTracker`.

**UI primitives** `src/components/ui/`: Dialog, Card, Pagination, CountUp, SpotlightTracker, ErrorScreen, icons.tsx (MUI-named lucide icons).

**Pages/components added**: `src/screens/AIWorkspace.tsx` (+ `app/(app)/ai/page.tsx`), `src/components/fleet/OverviewHero.tsx`, `src/components/landing/{Landing,HeroVisual}.tsx`, `src/components/auth/AuthShell.tsx`, `src/components/NotFound.tsx` / `Error500.tsx` (via ErrorScreen), `public/favicon.svg`, `design/` (HTML mockups: `fleet-overview-mockup-orange.html` chosen, teal one rejected).

**Rewritten on tokens**: analytics `KpiTile/WidgetCard/StatusDonut/FilterBar/ViewSwitch/theme.ts/charts.tsx (ApexCharts)`, `list/{DataToolbar,StatusChips,Pager}`, `RadixTable`, `Button`, `Input`, `Modal` (→ ui/Dialog), `GLobalCheckBox/CheckBox/GlobalRadioGroup/SearchField/FilterPopper/Tables/CustomAvatar/Loader`, `forms/FormComponents/{ToggleBtn,Slider}`, `records/*`, `AssignmentHistory`, fleet screens, RBAC screens, `Home`, `DeviceStatusGrid`, `AccountSettings`, auth screens.

**Deleted**: `LeftSidebar`, `Navbar`, `DashboardSubNav`, `src/GuestHomeComponents/**`, `screens/{UseCases,PlanAndPrice,FleetManagement,FleetDashboard}.tsx`, `app/(public)/{use-cases,plan-price}`, `app/(app)/fleet-management/legacy`, `analytics/chartSetup.ts`, NonAuthNavBar/Footer, dead MUI wrappers (Accordion, PaginatedList, CustomPopover, MyModel, ReuseAbleModel, InputField, DropDown), old logo images.

**Routes**: same as before plus `/ai`; nav groups defined in `src/components/shell/nav-config.ts` (permission gated by `hasPermission('all-fleet' | 'all-product' | 'all-connect' | 'all-role-permission' | isSuperAdmin)`).

## Addendum 2026-09-27 (T-003/T-004 additions)

- shell: `components/shell/{StatusBar,WorkspaceChip,Crumbs,KeyboardShortcuts,useEntitySearch}.ts(x)` (+ CommandPalette entity search); list: `components/list/{SavedViews,ListEmpty,RequiredHint(components/)}`; devices: `components/devices/DeviceSummary.tsx`.
- screens: `Integration` (catalog), `ModuleManagement` (live /api/modules), `PlanManagement` (preview), `CompanyLocation` (profile + yards), `Notifications` (preview data, route /notifications), `ActivityLog` (route /activity), Map layers panel in `FleetMap`.
- redirects (client): /profile → /account-setting, /internal-user and /users → /members.
- hooks: `useListState` now returns `storageKey` + `applyView`.
- showcase (T-005, in progress): `src/utils/showcase/rng.ts` (seeded PRNG); planned dataset.ts / lists.ts / fleet.ts / analytics.ts / index.ts — see `agent/work/showcase-data-plan.md`.

## Added 2026-09-28/29 (T-006 phase 2B + map v2)

- `src/components/map/`: `MapSearch.tsx`, `MapViews.tsx`, `speedColors.ts`, `layers/HeatLayer.tsx` (+ edits to `RouteLayer` flow/ETA, `HistoryLayer` speed segments, `VehicleLayer` speedColors/Esc/auto-pan/cluster merge, `VehicleCard` tz + offline).
- `src/components/ui/`: `AiOrb.tsx`, `Flash.tsx`. `src/hooks/useCompanyMoney.ts` (company-currency compact money).
- `src/screens/`: `ConnectorHealthPage.tsx` (redesigned), `FleetMap.tsx` (layers panel: heat, speed colours; search + views; fullscreen; phone layout), `PlanManagement.tsx` (live usage), `Map.tsx` (toolbar + caption).
- `src/utils/showcase/simulation.ts`: `recentTrail`, `heatPoints`, `stateAt` (shared by live positions, history trail, heat).
- Docs: `architecture/phase2-map-and-futuristic-plan.md` §9–§11, `architecture/map-kit.md` "Map v2" + gotchas.
