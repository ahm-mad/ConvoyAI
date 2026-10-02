# Domain: Assets / digital twin, floor plans, 3D viewers, map

Sidebar: **Twin** → "Manage Assets" (`hasPermission('all-building')`); **GIS** → "Map" (`isAdmin && !user.isDemo`).

## Domain model

Building (asset root) → floors → units → areas → sites …, arbitrary depth; a **terminal node holds exactly one sensor** (device). Only a building's **first-level child (a "floor", `parent_id === null` component)** may get a floor-plan image (fixed 2026-09-22 in `Assets.tsx`: icon gated to `!node.isTopMost && node.data.parent_id === null`). The right-side "unpositioned sensors" list in `FloorPlanEditor` shows ALL sensors in the floor's whole subtree via `GET /devices/:id?type=component` (name — DevEUI).

## `/assets` → `screens/Assets.tsx` (`AssetTree`)

- antd `Tree` (themed via `ConfigProvider` with the cyan token; highest visual-risk area per `HOW_TO_TEST.md`) from `GET /assets` (`transformForAntdTree`), per-node icons (add child, edit, floor-plan, delete, "Building 3D (all floors)" on the root), `AddEditEntityModal` (create/edit asset/component; devices picked from `GET /devices/product/:id`), `reactflow` `FlowChart` of the selected subtree (dagre layout, `AnimatedEdge`, attribution watermark hidden via `proOptions`), building live updates `building:update` (`bindBuildingEvent`).
- Unity 3D building viewer (`WEBGLBUILDING`, `LeftOverlayWebGLBuilding` etc.) trigger (eye icon) is **commented out** — deferred by owner; `Assets` still contains the fullscreen/Unity plumbing (`fetchWebglBuildingData`, `unity-wrapper`). `WEBGLFARM` (route `/webgl-farm`) exists; `WEBGLMARINA` has no route. Unity builds live in `public/unity` (~46 MB) and `public/DiaryFarm` (~26 MB) served pre-gzipped (`vercel.json` headers); bridge = `window.ReactUnityBridge`.
- `FloorPlanEditor` (`POST /floor-plans` multipart, `GET /floor-plans/component/:id`, place/unplace sensors via `PUT /components/:id {floor_plan_id, position_x, position_y}` — select-then-click, no drag-and-drop by owner's choice), `FloorPlan3DViewer` (flat plane + markers).
- `BuildingMultiFloor3DViewer` (@react-three/fiber, 710 L): stacked floors from `GET /floor-plans/building/:assetId`; names from `GET /assets/:id` (component name map); devices from `GET /devices/:assetId?type=asset` merged by `device_id` (real online/alert state, DevEUI, last values); click a floor (3D plane or left "Floors" list) to isolate it (camera resets via `<Canvas key>`), back button; sensors only shown when isolated; sensor click → `DevicePointsModal` rendered as **local state** (swaps the Canvas out — drei `<Html>` z-index bleed), stacked camera scales with floor count. Marker chips are solid `colors.text` background with white text in every state (legible over any image). Level labels: "floor 1 · Level 0".
- `AllAsset.tsx` — asset table used by `EditCompany`'s "assets" tab (`/companies/:companyId/assets`, `GET /assets/:companyId/tree`).

## `/map` → `Map.tsx`

Leaflet + MapTiler "Dataviz" tiles (light/dark variants by theme; needs `NEXT_PUBLIC_MAPTILER_KEY`; CartoDB was rejected for licensing). Hidden for demo users. Fleet has its own `FleetMap`.
