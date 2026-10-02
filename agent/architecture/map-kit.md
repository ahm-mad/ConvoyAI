# Map kit (T-006) — `src/components/map/`

One MapLibre GL map for the whole product. Nothing outside this folder imports `maplibre-gl`; screens compose layers as children of `<ConvoyMap>`.

- `ConvoyMap.tsx` — the map: `look` (light | night | satellite), `mode` (2d | 3d), `center` [lat, lon], `zoom`, `onBoundsChange(bbox)` (debounced, padded, same `[w,s,e,n]` shape the API `bbox` param uses), `onReady(map)`, `scrollZoom`, `interactive`. Context: `useConvoyMap()` → `{ map, styleVersion, look, mode }`; layers re-add sources when `styleVersion` changes (a look switch replaces the style). Worker file is served from `/public/maplibre` (postinstall copies it).
- `mapStyles.ts` — MapTiler `streets-v2` re-painted from `--map-light-*` / `--map-night-*` tokens (tokens.css); `hybrid` for satellite. Latin labels first.
- `useMapPrefs.ts` — persisted `{ look, mode, iconStyle }` (localStorage `convoyai-map-prefs`), shared by every map.
- `MapToolbar.tsx` — look / 3D / fit / icon-style controls (+ children slot for screen tools: demo speed, follow, tour, clean, fullscreen). `MapHud.tsx` — live count chips.
- `layers/`: `VehicleLayer` (HTML markers, gliding tween + bounded dead reckoning, zoom scaling, clusters below z8.5, comet trails, selection card, follow), `RouteLayer` (trip road path + glow + beacons), `HistoryLayer` (recorded trail), `YardLayer` (pads), `GeofenceLayer` (zones), `PinLayer` (draggable pin + radius), `Scenery3D` (terrain, hillshade, sky).
- `vehicle/` — `vehicleKinds.ts` (category → kind, motion state, `LiveVehicle`, `vehicleFromPosition`), `VehicleIcon.tsx` (silhouette | badge | puck; CSS `.cv-veh*` in components.css uses state variables, no hex).
- `qaRaf.ts` — QA-only requestAnimationFrame pump for the hidden automated tab (`localStorage['convoyai-qa-raf']='1'`); dev-only `window.__cvMap`, `__cvSim()`, `__cvGlVehicles`.
- Showcase: `src/utils/showcase/{routes,simulation}.ts` — real OSRM road geometry (generated once by `scripts/build-showcase-routes.mjs`) and a wall-clock-driven fleet simulation (`demo speed` ×1…×60 via `convoyai-demo-speed`); the map polls every 700 ms in showcase.

Adding a map screen: `const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false })`, pass `look/mode` from `useMapPrefs()`, add layers as children. Give the map a parent with a real height.

## Map v2 (2026-09-29) — components added

- `MapSearch.tsx` (vehicles + yards, `/` focuses, arrows/Enter/Esc; fetches the whole fleet only after first focus). Live map flies then selects once the flight ends (selecting mid-flight drops out of the viewport list).
- `MapViews.tsx` (camera bookmarks in localStorage `convoyai-map-views`, showcase seeds Lahore/Karachi-3D/Islamabad-3D; toolbar 3D state follows AFTER the flight).
- `RouteLayer`: marching-dash flow (24 shifted dash patterns, ~20 updates/s — owner rule: never trade UI smoothness for CPU) + ETA chip on the destination beacon (planned end in company tz, distance left in company units, updated in place).
- `speedColors.ts` + `HistoryLayer` (per-hop segments coloured by speed) + comet tails in `VehicleLayer` (`speedColors` prop) + "Speed colours" toggle/legend in the Layers panel.
- `layers/HeatLayer.tsx` + `simulation.heatPoints()` (showcase pre-fill) + "Heat" toggle in Layers.

## Map gotchas learned in the deep audit (2026-09-28/29)

- `map.panBy([dx, dy])` moves the CENTRE: to move content down by n px use `[0, -n]` (a sign slip once panned the vehicle out of view). The selected-vehicle card auto-pans into view (top clearance 84 px ≥ lg, 132 px below; toolbar + HUD).
- A vehicle that leaves the viewport list (bbox refetch) drops its selection; flights therefore select only after `moveend` (search, saved views).
- Changing the toolbar 3D state starts its own `easeTo` and cancels a `flyTo`: apply it AFTER the flight (`MapViews`).
- Dash-pattern animation costs CPU but the owner prefers smoothness (rule: UI beats efficiency) — do not "optimise" the route flow.
- Attribution/AbortError noise from cancelled tile fetches is filtered in `ConvoyMap` (unhandledrejection).
- Satellite labels are forced Latin (`mapStyles.latinLabels`).
- Fullscreen: modals render outside the fullscreen element, so the screen exits fullscreen before opening one; a refused `requestFullscreen` is swallowed (verified only in a focused, foreground window).
- Embedded maps (vehicle/trip modal) take `zoomControls`; `/map` has the toolbar without the icon-style group (`showIconStyle={false}`).
- `qaRaf.ts` (QA only, `localStorage convoyai-qa-raf=1`): ticks from a Worker with backpressure (ack before the next tick). Its earlier MessageChannel spin burned a full core; the first Worker version without backpressure froze the tab — never post ticks unconditionally.

## Map realism (2026-09-27, T-006-R item #0)

- `VehicleLayer` motion = buffered interpolation: markers are drawn ~1.15 fix-gaps in the past and move linearly between the last two REAL fixes (heading from the movement, eased); dead reckoning stays only for feeds slower than 2.5 s per fix. Markers use `subpixelPositioning: true` (MapLibre otherwise rounds to whole pixels → 1 px stair-steps at slow speed).
- Cluster bubbles are `ClusterItem`s keyed by lowest member id, glide toward the group centre (0.35 s), hold still while hovered, hover = halo only (no scale).
- `layers/MissionRouteLayer.tsx` (+ `simulation.missionRoute(vehicleId)`, showcase only): selected vehicle's road, bright ahead / dim behind, hover = lighter preview via `VehicleLayer onHover`. Trip beacons/ETA still come from `RouteLayer` (dropdown).
- Showcase sim: default demo speed ×3 (`DEFAULT_DEMO_SPEED`, storage key `convoyai-demo-speed-v2`), trapezoid accel/brake + end dwell for trips, real stops for loop vehicles. Landing hero keeps its own ×30 time-lapse (country zoom).

## Route context (2026-09-27)

- `layers/RouteContextLayer.tsx`: given a road (`path`, [lon,lat]) plus the viewport yards/geofences, emphasises every zone whose edge is within 800 m of the road (stronger fill + solid edge) and puts a name tag (`.cv-tag.is-geofence`) on independent geofences (a yard's own perimeter geofence is skipped). Used in `FleetMap` for a chosen trip (dropdown) else the SELECTED vehicle's road (showcase). Not shown on hover.
- `MissionRouteLayer` also draws labelled start / destination beacons (hover = smaller `.is-preview`), named after the yard at each end (`simulation.missionRoute().fromName/toName`, from `Line.names`); a round trip gets a single "S".
- `RouteLayer` (trip) beacons carry a name tag from the trip's origin / destination address (first two comma parts). Beacons z-index 4 sit above count bubbles (3).
- Showcase geofences 'M-2 toll plaza', 'Khyber Pass checkpoint' moved onto the simulated highways and 3 added (Sahiwal weigh station, Sukkur toll plaza, GT Road Jhelum checkpoint) so trips visibly cross them; radius = 900 + (i % 4) × 250 m.
- Not done: the trip modal map (`TripRouteMap`) gets the name tags but not the yards/geofences context (it has no zone lists).

## Live-map operator layer (2026-09-27, T-006-R2 / decisions D1–D7)

- Hero opening (`openHero` in FleetMap, showcase only), fleet list `FleetPanel.tsx` (status filter also filters the map; `convoyai-map-fleet-panel` remembers open/closed), vehicle name labels (`VehicleLayer labels`, default OFF for embedded maps; FleetMap passes the Layers toggle; from zoom 12; `.cv-vlabel`), `DemoMenu.tsx` (speed, tour, clean), softer `HeatLayer`, slimmer header, `AlertStrip.tsx` + `useMapAlerts.ts` (speeding > 80 km/h, late trips, 3 latest geofence events), card extras (`cardExtra`, trip + driver + progress) and `ReplayLayer.tsx` (trail replay).
- Flights that select a vehicle afterwards use `armArrival(duration)` in FleetMap (not `moveend`, which every map resize fires).
- Clicks inside any `.maplibregl-marker` are ignored by the "empty map click deselects" handler.
- Showcase: sample fleet overspeeds (every third tracker, 6 of 20 simulated min), first 12 sample geofence events are recent, geofences sit on the highways.

## Two real bugs found building the landing scroll story (2026-09-27)

- **`ConvoyMap` never called `map.resize()`.** Fixed: it now keeps a `ResizeObserver` on its own container for the map's whole life (added right after map creation in `ConvoyMap.tsx`). Without it, a map that mounts before its container's final size is established — a `sticky` panel settling into place, a lazily-mounted map — paints at the right CSS size but keeps a stale internal transform, so every marker projects to the wrong pixel (looked like the map thought its container was ~10× too big). This fix benefits every map on the page, not just the one that exposed it.
- **Raw `map.easeTo`/`flyTo`/`jumpTo` calls need `[lon, lat]`; the `<ConvoyMap center>` PROP takes `[lat, lon]` and converts it internally.** Reusing the same tuple for both (as the landing scroll story first did for its fallback camera) silently puts the camera somewhere else entirely — the numbers stay "valid" coordinates, so nothing throws. `FleetMap.tsx`'s `pickVehicle`/`pickYard` already had this right (`[v.lon, v.lat]`); any new direct `map.*To(...)` call must match that, not the `ConvoyMap` prop's order.
