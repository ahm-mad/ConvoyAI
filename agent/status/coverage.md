# What the previous reading sessions covered (honesty ledger)

Update this file when you read more, so nobody re-reads what is already in `agent/`.

## Read line by line (details are in the docs)

- Docs: `task.md`, `CLAUDE_FRONTEND_CONTEXT.md`, `FLEET_ANALYTICS_DESIGN.md`, `HOW_TO_TEST.md`, `kapi dashboard.md`; `backend_frontend_sync/{README,FACTS}.md`, `API_CONTRACT.md` §2–§6 (incl. §4 realtime), flow 07 §32 + §35, flow 04 §1–§9.
- Code: config files, `app/*`, all contexts, `lib/router-compat`, `layout/*`, `types/*`, `utils/{apiHelper,avatar,datetime,fleet*,units,serverExport,mapViewport,csvDevices,...}`, ALL hooks, `Login.tsx` (main logic), `Assets.tsx`, `LeftSidebar` (top half), `Button/Input/Modal`.
- Fleet, line by line: `VehicleDetailModal`, `TripDetailModal`, `Vehicles`, `Trips` (list part), `FleetMap`, `VehicleMarker`, `TripRouteLayers`, `YardLayoutEditor` (logic), `Geofences` (logic), `records/*`, `DeactivateControls`, `StopActions` (logic), `VehicleFields/DriverFields/TripStopsEditor/TripEditForm` (field models), `analytics/{DataTable,FilterBar,ScopeBar (top 300 lines),useAnalyticsFilters,useAnalyticsScope,theme,format,chartSetup,states,MetricInfo,PageScroller,ViewSwitch,AnalyticsShell,useKpiColumns}`, `FleetOverview` (data/KPI logic), `FleetTripsAnalytics` (top 330 lines), `FleetSettings` (field model).
- Computed: full import graph (`architecture/dependency-map.md`), API index from the OpenAPI YAML.

## Skimmed only (headers, props, API calls, comments) — open the file when the task needs detail

- Fleet: `Drivers`, `Yards`, `Incidents`, `Assignments`, `FleetUtilisation`, `FleetFuelAnalytics`, `FleetMaintenanceAnalytics`, `MaintenanceHistoryView`, `ComplianceView`, the rest of `FleetTripsAnalytics`/`FleetOverview` JSX, `FleetDashboard` + `FleetManagement` (legacy), `AssignmentHistory`, `ComplianceTab`, `ExpiringDocumentsPanel`, `CoordinatePicker`, `TripRouteMap`, `YardEditForm`, `GeofenceEditForm`, `Vehicle/DriverEditForm`, `VehicleImageControl`, `fleetSettings/controls`, `analytics/{WidgetCard,KpiTile,StatusDonut,charts,bars,Worklist}` bodies, rest of `ScopeBar`.
- Non-fleet: product/device screens (`ManageDevice`, `ProductConfiguration`, `AddDevices` bodies), rules (`AddNewRule`, `RuleBuilder` bodies), admin screens, `AccountSettings`, `Simulation`, `Navbar` (partly read), `RadixTable`, `AttributeModal`, `BuildingMultiFloor3DViewer`, `FloorPlanEditor`, legacy widget stack, forms, validation, GuestHome sections, fake-backend controllers/handlers/db (`Data.tsx` never opened), all assets.
- Sync folder NOT read in detail: `STATUS.md` (117 KB beyond its first 60 lines), `findings.md` (first rows only), flows 01–03 (headings), flow 04 §10–§27, flow 05 (36 KB), flow 06 (162 KB), flow 07 §1–§31 and §33–§34 bodies (193 KB), `api_contract/openapi/*.yaml` bodies (only the operation list), `API_CONTRACT.md` operation notes (§7+).
