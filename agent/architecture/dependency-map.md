# Dependency map (computed from real imports, 2026-09-26)

Method: a script resolved every `import`/`export … from`/`import()` (relative + `@alias` paths) across `src/`, `app/`, `axiosConfig.ts`, `reactQueryConfig.ts` and computed the **transitive closure of each route group**.
Use this before removing, splitting, re-branding or extracting anything. (Re-run idea: parse imports with a small Python/TS script; static imports only — dynamic string paths are not resolved.)

## 1. Closures per route group

| Group (routes)                                                                                                                                                             | Closure (files) | Exclusive (used by no other group) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------- |
| **fleet** (`/fleet-management/**`)                                                                                                                                         | 136             | **125**                            |
| public + auth pages (`/`, `/login`, `/register`, `/forget-password`, `/reset-password`, `/verify-token`, `/use-cases`, `/plan-price`)                                      | 74              | 57 (mostly `GuestHomeComponents`)  |
| admin/account (`/account-setting`, roles/members/assign-permission, companies, users, edit-user, internal-user, company-location, `/analytics`, profile, module/plan mgmt) | 168             | 44                                 |
| products/devices (`/manage-product`, `/all-products`, `/products`, `/edit-products`, `/product-configuration`, `/integration`, `/documentation`, `/connector-health`)      | 94              | 36                                 |
| rules/alarms                                                                                                                                                               | 35              | 16                                 |
| assets/twin/map/webgl                                                                                                                                                      | 149             | 28                                 |
| home/dashboard/simulation                                                                                                                                                  | 20              | 9                                  |
| app shell (root layout, providers, bootstrap, `AuthLayout`, `NonAuthLayout`)                                                                                               | 70              | 43                                 |

**Fleet is almost self-contained**: only 11 of its 136 files are shared with other groups —
`axiosConfig.ts`, `contexts/{Modal,Socket,Theme,User}Context`, `hooks/useSimpleQuery`, `lib/router-compat`, `types/api`, `utils/{apiHelper,avatar}`, and `components/NeonPieChart`.
Nothing in Fleet imports Products/Devices/Assets/Rules code. (`components/NeonPieChart.tsx` is an apexcharts donut used by the legacy `FleetDashboard` only.)

## 2. What Fleet needs from OUTSIDE its code closure (runtime/backend coupling)

- **App shell + auth**: `app/(app)/layout.tsx` (guard) → `AuthLayout` (LeftSidebar, Navbar, Breadcrumb, `GlobalPacketListener`, `WelcomeIntroModal`), Login/Register/verify/reset flows, `UserProvider` (roles/permissions), `LeftSidebar` gating `hasPermission('all-fleet')`.
- **Company data**: currency (`Account settings → AddLocation` writes `companies.currency`), company id; fleet timezone/units live in backend fleet settings (edited on the Fleet settings page).
- **Trackers are IoT devices**: a fleet tracker = a device created through **Products → devices** (`AddDevices` onboarding, HTTPS webhook token) and positions only work after marking Latitude/Longitude/Speed/Heading roles in **Product Configuration** (`mark-role`), then `POST /vehicles/{id}/assign-device`. So the IoT onboarding UI is a functional prerequisite of Fleet even though the code is decoupled.
- **Realtime**: `SocketContext` singleton (also carries IoT events); company room requires `all-fleet`.
- **Backend**: the whole `fleet-*.yaml` contract (≈190 of the 324 operations).

## 3. Dead / unreachable code (no route or shell imports it) — candidates the owner may want removed someday (NEVER delete unprompted; several are "parked" by owner decision)

- **Legacy widget dashboard stack** (entire): `components/Grid.tsx`, `components/Widgets/**` (~50 files), `forms/DashboardForms/*` (17), `utils/DynamicImport.tsx`, `utils/LottieDynamicImport.tsx`, matching `validation/*Validation.ts` widget schemas, `skeletons/WidgetSkeleton`, `ConvoyDemo/{FormDemo,WidgetDashboardDemo}`, `forms/FormComponents/{ShowAndHide,Region,LowerRegion,Misc_Settings,MyModel,ReuseAble*,Settings,Slider,ColourPicker,DropDown,InputField,ToggleBtn}`. (Owner: parked, "redundant for now".)
- Unused components: `Card`, `ChatBot`, `Accordion`, `CustomPopover`, `DeviceTable`, `Error500`, `FilterButton`, `MenuItem`, `MultiLevelDropdown` (empty), `NonAuthFooter`, `NonAuthNavBar`, `PaginatedList`, `RightSidebar`, `AddRole`, `AddUserForm`, `AccountSettingSubNav`, `IntegrationSubNav`, `SuperAdminDashboardSkeleton`, `LeftOverlayWebGLBoat`, `RightOverlayWebGLBoat`.
- Unused screens: `MembersList` (0 lines), `PermissionToggler`, `Tutorials`, `WEBGLMARINA`; unused forms `MultiStepForm/{FifthStepForm,FirststepForm}`; `lib/cal.ts`, `lib/utils.ts`, `hooks/usePaginatedQuery.ts`, `utils/{AddCompanyDemo,AddProductDemo}.ts`, `validation/{NewRuleFormSchema,RuleFormSchema,smsSchemaValidation,…}`, `GuestHomeComponents/{index.css,pages/*}`.
- Unreachable within reachable modules: the Unity/WebGL branch in `Assets.tsx` (trigger commented out), MQTT UI (commented out), old demo tours.
- Files that look orphaned to the script but are NOT: `app/(app)/fleet-management/layout.tsx`, `components/fleet/*` (used by that Next layout file).

## 3b. Dependencies declared in `package.json` but never imported (grep over `src/`, `app/`, root ts, scripts — 2026-09-26)

`zustand`, `dayjs`, `date-fns`, `vaul`, `canvas-confetti`, `framer-motion`, `motion`, `react-driver.js` (the code uses `driver.js`), `@radix-ui/react-accordion`, `@radix-ui/react-separator`, `@radix-ui/react-toggle-group`, `class-variance-authority` (kept for the planned UI pass), `@fontsource/poppins`, `@radix-ui/themes`.
**Careful:** `@radix-ui/react-switch` (AddNewRule) and `@radix-ui/react-dropdown-menu` (DropDownMenuRadix) and `clsx` (`lib/utils.ts`) are imported but NOT declared in `package.json` — they resolve only as transitive dependencies of `@radix-ui/themes` / tailwind tooling. Removing `@radix-ui/themes` would break them. `react-calendly` (3 files), `react-scrollspy` (2), `cmdk`/`@radix-ui/react-popover` (fleet scope bar) are used. Any dependency change = a global change → ask the owner first.
