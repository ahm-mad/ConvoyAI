# Phase 2 — "Wow factor": hero map system (2A) + futuristic polish (2B)

Status: planned in detail 2026-09-27; owner answers received (below); building step by step (see tracker at the end).
Owner rules that apply to everything here: **no compromise on UI** (any library may be installed if it makes the result better), light theme is
the base, tokens only (no hard-coded design values), visual richness beats operator efficiency, production-grade, don't break existing
behaviour, real-API path keeps working, showcase mode (`src/utils/showcase`) must look spectacular, verify live in Chrome (every page/menu),
production build + crawl + axe scan before calling a milestone done, commit + push `staging` per milestone.

## 0. Owner decisions (2026-09-27)

| Question               | Decision                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaflet → MapLibre GL? | Yes — go with the recommended option: **MapLibre GL JS** (WebGL vector maps). Leaflet is removed once nothing uses it.                                                                                                |
| Basemap mood           | **Both**: light cream + orange roads (default, matches theme) AND dark "night map" (drama for videos), switchable with a toggle. A satellite/hybrid option is added as a third look.                                  |
| Vehicle icons          | **All styles, switchable** with a toolbar toggle (persisted): _Silhouette_ (top-down per category), _Badge_ (glossy 3D-style category badge), _Puck_ (brand puck with pulse). Icons rotate with heading; status ring. |
| 3D                     | **Allowed**: tilted camera (pitch/bearing), extruded buildings, optional terrain/hillshade. 2D/3D toggle.                                                                                                             |
| Libraries              | Free to install anything (motion, WebGL, Lottie…).                                                                                                                                                                    |
| Map key                | Existing `NEXT_PUBLIC_MAPTILER_KEY` in `.env.local` (MapTiler vector styles, terrain, satellite). Never commit or echo the key.                                                                                       |

## 1. Goals — what "wow" means here

1. Every map in the product looks like a premium product shot: styled brand basemap, soft depth, 3D buildings, glow, smooth camera.
2. The fleet is _alive_: vehicles glide along real roads, rotate to heading, leave glowing trails, trips show animated routes with progress.
3. Cinematic-ready: one click gives the operator (you) a video-friendly view — auto-tour, follow-vehicle camera, night mode, hidden chrome.
4. The rest of the UI shares the same motion/glow language (2B): numbers roll, charts draw in, live things pulse, AI feels intelligent.
5. Zero regressions: performance ≥ 55 fps with ~60 moving vehicles, `prefers-reduced-motion` respected, keyboard/a11y intact (axe clean).

## 2. Phase 2A — Hero map system

### 2A.1 Architecture

- New folder `src/components/map/` — the **ConvoyMap kit** (all map screens use it; nothing else imports maplibre directly):
  - `ConvoyMap.tsx` — MapLibre instance wrapper (React 19, SSR-safe, dynamic import `ssr:false`), owns style, camera, resize, controls slot, context.
  - `mapStyles.ts` — builds the three looks from MapTiler style JSON (`dataviz-light`/`streets-v2`, `dataviz-dark`/`streets-v2-dark`, `hybrid`) and **re-paints layers at load** to the brand palette read from CSS tokens (`--color-brand`, `--color-surface-0`, …): cream land, warm-grey water, soft-orange major roads, faded minor roads, muted labels (serif labels for cities), optional hillshade. Night look = deep indigo/charcoal land with orange/amber road glow. No hex in components: colours come from a token map (`src/lib/design/tokens.ts` extended with `mapTokens`).
  - `useMapLook.ts` (light | night | satellite, persisted in localStorage, default light), `useMapMode.ts` (2D | 3D), `useVehicleIconStyle.ts` (silhouette | badge | puck).
  - `layers/`: `VehicleLayer` (HTML/canvas markers), `RouteLayer` (planned dashed flow + progress glow + destination beacon), `TrailLayer` (comet trail, line-gradient), `YardLayer` (pulsing zones + 3D extruded yard pads + labels), `GeofenceLayer` (soft fill + animated border), `BuildingsLayer` (fill-extrusion, height from `render_height`, warm shading), `TerrainLayer` (MapTiler terrain-rgb, exaggeration, hillshade), `HeatLayer` (optional density heat of positions), `ClusterLayer` (zoomed-out counts).
  - `MapToolbar.tsx` — glass toolbar: Look (Light/Night/Satellite), 2D/3D, Icon style, Layers, Follow/Tour (cinematic), Fit fleet, Demo speed (showcase), Fullscreen.
  - `VehicleCard.tsx` — glass hover/selected card (name, plate, driver, speed, status, ETA, trip progress bar, “Open vehicle” action) anchored to the marker; replaces Leaflet popups.
  - `cinematic.ts` — camera director: `flyToFleet`, `followVehicle` (smooth easing, bearing follows heading), `tour` (cycles through vehicles/yards), slow ambient orbit for hero.
- Live engine `src/components/map/live/`:
  - `useLiveFleet(positions, opts)` — keeps `renderedPosition` per vehicle and tweens from last fix to next fix (rAF, easing, heading smoothing, dead-reckoning between fixes); pauses when tab hidden; pure function core so it can be unit-tested with `tsx`.
  - Real mode: feeds from `/fleet/positions` + the existing socket `fleet:position` events (`useFleetRealtime`).
  - Showcase mode: `src/utils/showcase/simulation.ts` moves the fixture vehicles along **real road geometry** (see 2A.3) with speed profiles (accelerate, cruise, slow at towns), tick 1 Hz, time-scale ×1/×5/×20 for videos; positions stay consistent with trips/status counts.
- Data flow unchanged: `useViewportList`, `useSimpleQuery('fleet-positions')`, bbox param, trip route endpoint, layer panel counts. The map only changes how they are drawn.

### 2A.2 Visual spec (all values become tokens under `--map-*` / `mapTokens`)

- **Light look (default):** cream land (#FBF5EE family), water soft sand-grey/blue-grey, parks pale sage, major roads orange (brand → bright gradient by zoom), minor roads warm white, buildings warm off-white with subtle extrusion + AO-like shading, labels ink-1 with serif for places, country/province boundaries dotted.
- **Night look:** deep charcoal-indigo land, faint grid glow, roads amber/orange neon, water near-black blue, buildings dark with rim light, labels light; vehicles get stronger glow; trails become light streaks. Used automatically for map cards on the landing/login hero.
- **Satellite/hybrid:** MapTiler satellite with soft dark overlay and road/label overlay for contrast.
- **3D:** pitch 55–65°, bearing drift, extruded buildings (visible ≥ z14), terrain optional (Peshawar/Islamabad hills look great), sky/fog gradient horizon for depth; toggle animates the camera tilt.
- **Vehicle icon styles** (switch live, all rotate with heading, 6 categories: truck, semi-trailer, van, pickup, tanker, bus, + generic):
  - _Silhouette_: crisp top-down SVG per category, soft drop shadow, status-colour ring underlay, headlights glow when moving.
  - _Badge_: glossy circular 3D-look badge (gradient, inner highlight, category glyph), heading chevron on the rim, status pip.
  - _Puck_: brand-orange gradient puck with white logo mark, expanding pulse ring when moving, dimmed when stale/offline.
  - States: moving (glow + motion), idle (amber ring, slow pulse), parked (neutral), offline (grey + dashed ring), selected (spotlight ring + lifted scale + card).
- **Routes/trips:** planned route = dashed flowing line (`cv-flow` language) in neutral; travelled part = solid orange line with outer glow; head = pulsing dot; stops = numbered beacons; destination = flag beacon with ripple; ETA chip at destination.
- **Trails:** last N minutes of a moving vehicle fade out (comet tail via `line-gradient` + `line-progress`).
- **Yards & geofences:** yard = rounded pad with ripple ring and slot-occupancy arc; geofence = translucent fill + animated dashed border + label chip; entering/exiting events flash a ripple on the map (showcase: driven by simulation).
- **HUD chips** (glass): live counts (Moving / Idle / Parked / Offline), clock in company timezone, "Showcase data" badge, legend.
- **Attribution/legal:** keep MapTiler + OSM attribution (MapLibre control, styled compact).

### 2A.3 Real road geometry for the showcase (no fake straight lines)

- One-off script (`scripts/build-showcase-routes.mjs`, run manually, output committed): calls a routing service for the yard-to-yard pairs used by `dataset.ts` (15 highway routes: Karachi–Lahore, Lahore–Islamabad, Islamabad–Peshawar, …) plus 3 local delivery loops per yard (8 yards); stores **simplified polylines** (Douglas-Peucker, ~150–400 points each, coordinates rounded to 5 decimals) in `src/utils/showcase/routes.ts` with distance/duration. No runtime dependency on the routing service; no key in the repo.
- Simulation binds each in-progress trip and moving vehicle to one polyline + progress fraction; trip route endpoint (`/api/trips/:id/route`) returns the same polyline as `trail`/planned path so the trip modal map matches the live map.

### 2A.4 Screens (all migrated to the kit)

1. **Live map** (`screens/FleetMap.tsx`): full experience, all toolbar tools, follow/tour, selection card, layer panel (existing counts), trip selector, trail, truncation notices, bbox loading.
2. **Overview hero** (`components/fleet/OverviewHero.tsx`): auto-fit fleet, slow ambient camera drift, live vehicles, radar sweep kept as an overlay, HUD chips; non-blocking (page scroll not trapped), click → Live map.
3. **Trip detail → Map tab** (`TripRouteMap`/`TripRouteLayers`): route with progress, moving vehicle, stops, ETA, fit route.
4. **Vehicle detail position map** (`VehicleDetailModal`): mini live map with trail + icon in the chosen style.
5. **CoordinatePicker** (geofence/yard forms): same basemap, draggable glowing pin, radius circle preview.
6. `screens/Map.tsx` (legacy IoT map): migrated last only if trivial; otherwise left and Leaflet kept until then.
7. Landing/login hero visual: optional night-mode looping map card (2B).

### 2A.5 Non-negotiables / risks

- Keep every current behaviour: viewport bbox refetch, layer toggles, trip selector, history trail, yard editor open on yard click, vehicle modal open from marker, keyboard access (markers are buttons with names, map has `aria-label`, toolbar operable by keyboard, `aria-live` count summary).
- Performance budget: ≤ 60 HTML markers animating via transforms; beyond that switch to canvas/symbol layer (auto). Pause animation when hidden. Lazy-load maplibre only on map screens (bundle-splitting).
- `prefers-reduced-motion`: no ambient drift/tour, instant tweens, static trails.
- WebGL failure fallback: static styled image + message (never a blank/crash).
- Hidden-tab test note: Chrome tab used for QA is `hidden` (no rAF) — verify motion via computed transforms + short foreground bursts; final motion QA by recording.
- Remove `leaflet`/`react-leaflet`/`leaflet.css` only after all consumers are migrated (and the legacy Map screen decision).

### 2A.6 Milestones (build order, each = code + live verify + commit/push)

- **M0** Install `maplibre-gl`; ConvoyMap wrapper; MapTiler light look re-painted to tokens; controls (zoom, compass, attribution); replace the basemap on the Live map behind a flag → verify tiles, resize, fallback.
- **M1** Night + satellite looks, 2D/3D toggle (pitch/bearing animation), 3D buildings, optional terrain; toolbar v1 (Look, 2D/3D, Fit).
- **M2** Vehicle markers: 3 icon styles × 7 categories × 5 states, heading rotation, selection ring, card, toolbar toggle (persisted).
- **M3** Live engine: tweening + heading smoothing; showcase route fixtures (`routes.ts` via build script) + simulation; demo speed control.
- **M4** Trips & trails: animated planned/travelled routes, comet trails, stops/destination beacons, ETA chips; trip selector + trip modal map.
- **M5** Yards/geofences layers (pulses, 3D pads, event ripples), layer panel v2, HUD chips, clustering.
- **M6** Live map fully migrated (all current features) + cinematic tools (follow, tour, fullscreen, hide chrome).
- **M7** Overview hero map + Vehicle modal map + CoordinatePicker migrated.
- **M8** Polish: performance pass, a11y (axe), reduced-motion, WebGL fallback, remove Leaflet, docs, production build + crawl.

## 3. Phase 2B — Futuristic polish for the whole product

Applies the map's language everywhere. Libraries allowed (evaluate, pick best): **Motion** (framer-motion successor) for orchestrated UI motion and layout transitions, **GSAP** for timelines/scroll, **Lottie / dotLottie** for micro-illustrations, **three.js / @react-three/fiber** or **OGL** for the AI orb/ambient WebGL, **tsparticles** only if it stays subtle, **@number-flow/react** for odometer numbers, **Apache ECharts/ApexCharts options** for chart animation (ApexCharts is current; keep unless a switch clearly wins).

B1. **Motion foundation** — motion tokens (durations, easings, springs, stagger), one `Motion` helper layer, page/route transitions (shared layout, crossfade + rise), reduced-motion switch, global "motion intensity" token (Off/Subtle/Full).
B2. **Futuristic icon system** — duotone/gradient-stroke icon treatment over lucide (wrapper `Icon` with glow + optional animated states), custom fleet glyph set (vehicle categories, yard, geofence, tracker, AI), animated live icons (pulse, radar, signal bars).
B3. **Numbers & data viz** — odometer/roll numbers for KPIs, chart draw-in + hover glow + soft gradient fills, radial gauges with sweep, live-updating sparklines with tick animation, heat-calendar, animated donut segments, delta chips that count.
B4. **Ambient & hero** — animated mesh-gradient/aurora backgrounds (very subtle), faint grid/scan lines on dark cards, overview hero composition (map + AI orb + HUD chips), landing/login hero using the live night map card.
B5. **AI presence** — Copilot orb states (idle/thinking/speaking) in WebGL/CSS, streaming typewriter answers, insight cards with shimmering gradient borders, "AI suggests" pulses on relevant entities, ⌘K palette with animated results.
B6. **Lists, tables, forms** — row hover glide + focus rail, skeleton shimmer with brand gradient, sort/filter transitions (layout animation), animated selection bars, button press/magnetic hover, toggle/checkbox springs, toasts with motion.
B7. **Live indicators everywhere** — pulsing live dots, radar sweeps, "signal" bars, realtime flash on updated values, status-bar heartbeat, notification bell wiggle.
B8. **Loaders & empty states** — branded route-progress bar, illustrated empty states (Lottie/SVG), animated success/error confirmations.
B9. **QA & hardening** — perf budget (LCP, TBT, CLS), 60 fps checks, reduced-motion, axe re-scan, production build + crawl, screenshot/recording checklist (also produce a "recording mode": hides dev chrome, fixed viewport, showcase on).

## 4. Deliverables & docs to keep updated

`agent/work/tasks.md` (T-006 sub-steps), `progress.md` (resume point after every step), `decisions.md`, `architecture/design-tokens.md` (new `--map-*`, motion tokens), `architecture/showcase-data.md` (routes.ts + simulation), this file's tracker below, and a short `agent/architecture/map-kit.md` once M0 lands (API of ConvoyMap + layers).

## 5. Tracker (update as steps complete)

- [x] M0 (2026-09-27: maplibre-gl 6.11.2, ConvoyMap wrapper, tokenised light/night/satellite looks, 2D/3D, opt-in `?gl=1` on the Live map) - [x] M1 (toolbar, prefs, terrain+sky+hillshade, 3D buildings, fit fleet) - [x] M2 (VehicleLayer with 3 icon styles × 7 kinds × 4 states, gliding tween, zoom-scaled, selection card) - [x] M3 (OSRM road geometry in showcase routes.ts, time-driven simulation, dead-reckoning, demo speed 1×–60×, fit-fleet) - [x] M4 (RouteLayer: road path, glow trail, S/stop/D beacons; comet trails) - [x] M5 (YardLayer pads, GeofenceLayer zones) - [x] M6 (GL is the default Live map; HUD, follow, fleet tour, clean view, fullscreen, clustering) - [x] M7 (Overview hero, trip map, vehicle modal map, coordinate picker all on the kit; Leaflet removed) - [x] M8 (Leaflet removed, prod build + 44-route crawl clean, axe clean on all map screens/modals/picker)
- [ ] B1 - [ ] B2 - [ ] B3 - [ ] B4 - [ ] B5 - [ ] B6 - [ ] B7 - [ ] B8 - [ ] B9

## 6. Build notes learned (keep)

- MapLibre v6 needs its worker served as a static ES module: `scripts/copy-maplibre-worker.mjs` (postinstall) copies `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` to `public/maplibre/` (gitignored); `ConvoyMap` calls `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')`. If `npm install` was skipped, run `node scripts/copy-maplibre-worker.mjs`.
- MapTiler key is origin-restricted: style/tiles only work from `localhost:3000` in a browser (curl needs `-H "Origin: http://localhost:3000"`).
- QA in the automated (hidden) Chrome tab: set `localStorage['convoyai-qa-raf']='1'` and reload — `qaRaf.ts` swaps requestAnimationFrame for a MessageChannel pump so WebGL/animation run; then `await window.__cvSnap()` paints the canvas into an <img> overlay so screenshots show the map. `window.__cvMap` (dev only) exposes the map instance. Never enabled for real users.
- Labels use `name:latin` first (Urdu script clutters shots). Layer ids of MapTiler `streets-v2` drive `mapStyles.ts` (Building 3D appears at z14+).
- Live-map opt-in during development: `/fleet-management/operations/map?gl=1` (default flips at M6).
- Bug learned: MapLibre adds `position:relative` to the map element and overrides Tailwind `absolute inset-0` → map height 0; ConvoyMap sets `style={{position:'absolute',inset:0}}` inline. With that fixed, plain screenshots show the map (no `__cvSnap` needed).

## 7. STATUS as of 2026-09-28 (end of session) and what is next

**Phase 2A (map) is DONE, audited and pushed** (last commit dd7f7cb): M0–M8 all ticked above. Audit (code + live) covered: load/HUD/toolbar/layers panel, looks (light/night/satellite persist across style swaps; zones/trails/history/route layers re-add), 2D/3D, 3 icon styles (+persisted), selection card / Open vehicle modal / close / deselect, clusters (mouse + keyboard expand, selected never hidden), fit fleet, layer toggles (vehicles/yards/geofences), demo speed 1×/20×/60× (measured px/s scales), follow (disabled until selection, ends on drag), clean view + restore, fleet tour, trip route select/clear (beacons cleaned up), history trail (48 pts), yard click → editor, marker keyboard attrs, real-API mode (showcase off: ZZ data, no demo-speed control), no-WebGL message (`?gl=0`), axe clean on all map screens, production build + 44-route crawl clean.
Fixes made during the audit: markers were map-aligned in 3D (badges/pucks looked flat) → badges/pucks are now upright billboards, silhouettes stay road-plane decals with the right heading (was double-corrected by the map bearing); animation loop wrapped so one exception cannot stop all motion; style-loading guard for trails; keyboard on cluster bubbles; heading derived from movement when a tracker reports none; yard name chips hide below z7; trip modal map forced 2D; glyphs (no cube icon for vans).
**Known limits (by design, documented for the owner):** silhouettes in 3D are top-down decals lying on the road (physically correct, look flat when tilted) — real depth needs 3D vehicle models; vehicle count is small (39) so no canvas fallback exists (HTML markers scale to ~150); polling in showcase is 700 ms; a hidden/background browser tab pauses polling (react-query) — expected.

### Ideas backlog for map v2 (not started)

1. **True 3D vehicle models** (glTF trucks/vans/buses via a MapLibre custom layer with three.js, or deck.gl ScenegraphLayer) — the real answer to "flat in 3D"; keep the current icons as the 2D/low-power option.
2. Animated route flow (dash offset animation via a symbol/`line-dasharray` ticker), ETA chips at destinations, speed-coloured trails, heat/density layer, geofence enter/exit ripple events, yard occupancy arcs.
3. Map search box (find vehicle/yard), measure tool, saved views (camera bookmarks), keyboard shortcuts overlay for the map.
4. Weather/traffic overlays, day↔night automatic look by time, satellite hybrid labels styling.
5. Canvas/symbol-layer fallback above ~150 vehicles; WebGL context-lost recovery.

## 8. PHASE 2B — where it stands

Done: B3 odometer numbers (NumberFlow in KPI tiles), B4a landing hero = live map with moving sample fleet, B1 (partial) motion foundation (`motion` installed; `MotionProvider`, `Reveal`, cards enter on scroll via `WidgetCard`), ambient aurora background (`.ambient` in AuthLayout), status-dot heartbeat. NOT yet: B2 (icon glow/animated icon states — note phase 1 already has `.icon-gradient`), B5 AI orb states (typewriter already exists), B6 row/press micro-motion, B7 live-value flash, B8 loaders/empty-state illustration, B9 QA (build + crawl + axe over everything B touched), AND a visual review of B1/ambient in a real visible tab (cards use opacity 0→1 on first view — verify they never stay hidden).

## 9. MANDATORY next step before phase 2B: deep map test session (owner request 2026-09-28)

Test EVERY map feature in detail, code review + live Chrome, at enterprise quality (fix as found, re-verify, commit). Checklist:

- **Every map screen:** Live map, Overview hero, trip modal Map tab, vehicle modal Overview map, coordinate picker (geofence/yard/trip forms), landing hero, /map (company location).
- **Looks × modes × icon styles:** light/night/satellite × 2D/3D × silhouette/badge/puck (27 combos on the Live map; spot-check the rest) — labels legible, overlays (zones, trails, route, history, beacons, yards) visible in each; persistence across reload and across screens.
- **Vehicles:** every state (moving/idle/parked/offline), heading correctness at several bearings, zoom scaling, selection ring, card content + actions, Open vehicle, deselect (card X, empty-map click, Esc?), z-order, clusters (thresholds, counts, expand by click/keyboard, selected/followed never hidden), tween smoothness, dead-reckoning bounds, real-API mode (no heading, stale fixes, truncation notices, empty state).
- **Camera & tools:** fit fleet, follow (start/stop, drag ends, works with 3D + bearing), fleet tour (cycle, stop, interaction), clean view + restore, fullscreen, demo speed (1/10/20/60, no jumps), 3D toggle animation, terrain/sky/buildings at zoom ≥14 in Lahore/Karachi/Islamabad/Peshawar.
- **Layers panel & data:** each toggle, counts vs visible, bbox refetch on pan/zoom, loading states, error states (offline backend), yard click → editor, geofence zones, trip route select/clear, history trail on selection.
- **Forms:** coordinate picker click/drag/keyboard, radius preview, confirm/cancel/Esc, dialog focus trap; PickOnMapButton from all forms.
- **Quality:** a11y (keyboard-only walkthrough, focus rings, aria names, live-region for counts), reduced-motion, contrast on all three looks, performance (≥55 fps with 39 vehicles, memory stable after 5 min, listeners cleaned on unmount/navigation), console clean, WebGL failure + context-lost handling, window resize / modal resize, small viewport (mobile 390px), production build behaviour.
- **Known gaps to decide with the owner:** true 3D vehicle models (silhouettes look flat when tilted), map search box, saved camera views, ETA chips, speed-coloured trails.

### 9a. Decision (2026-09-28): 3D vehicle models deferred

Flat silhouettes in tilted 3D are a KNOWN, ACCEPTED gap for now. Planned fix (last polish step): glTF models through a three.js custom layer (see decisions.md 2026-09-28). The deep test in §9 covers everything else; do not spend time on the 3D vehicle look during it.

### 9b. Deep map test session — RESULTS (2026-09-28, commits 11ff7fb, e3c8ec7 + follow-up)

Method: code review of every map file + live Chrome (JS-driven for logic, screenshots at CSS zoom 0.8 for looks). **Fixed (all re-verified live):** vehicle card clipped under the toolbar (auto-pan, threshold 84px ≥ lg / 132px below), Esc deselects, selection dropped when vehicle leaves the list, follow released when tour stops/deselect, clusters merged when bubbles overlap + z-index above yard pads, history trail follows the road and ends at the vehicle (`simulation.recentTrail`, refetch 2 s in showcase), satellite labels Latin, card time in company timezone, offline card hides stale speed/heading ("Last seen"), AbortError console noise filtered, keyboard focus ring on markers (was `outline:none`), picker: pin keyboard nudge (arrows, Shift = big) + responsive dialog, trip map fits stops/trail (RouteLayer uses routePoints), /map gets toolbar + caption, phone layout of the Live map (header wrap, toolbar scroll strip, HUD under it, layers as a row), fullscreen exits before opening modals, no-WebGL hides map-only controls, yard markers follow data changes, hillshade highlight colours moved to tokens.
**Verified OK (no change needed):** selection/X/empty click, looks x icon styles, 3D toggle + terrain/hillshade/sky (Islamabad), clusters (click, Enter, zoom thresholds), fit, follow (tracking, real drag ends it), tour (cycle, stop), clean view, layer toggles (vehicles/yards/geofences), trip route overlay + fit, demo speed 1/10/20/60 (proportional, no jumps), yard click → editor → Esc, vehicle modal map, overview hero map, landing hero map, coordinate picker (drop, nudge, confirm fills form, Esc closes only the picker), real-backend mode, no-WebGL message, reduced-motion CSS, render cost 7 ms/frame 2D / 13 ms tilted, no leaks over 5 navigations (canvases 0 when away, heap stable).
**NOT verified:** real fullscreen toggle (needs a user gesture), 5-minute memory soak, full keyboard tab-order walk, axe scan + production build (B9), mobile picker/modals, Firefox/Safari, silhouettes in 3D (deferred, see 9a).
**Backlog found (not fixed):** hard-coded "PKR" in mock AI copy (OverviewHero, Landing, HeroVisual, CopilotChat, AIWorkspace) vs owner rule "no hard-coded currency"; showcase trips list yard stops that are not on the trip's road (TRP-2406 Lahore stop on a Faisalabad→Multan road); Live map card height 100vh−300px (min 560) — owner may want it taller as the hero; mini-maps (vehicle/trip modal) have no zoom buttons; fullscreen button has no pressed state; useMapPrefs first render uses defaults before localStorage (check for a look flash).

### 9c. Follow-up items done the same day (commit 3dd9a4f)

Company-currency formatting for the mock AI copy (`src/hooks/useCompanyMoney.ts`; Overview hero, AI workspace, Copilot answers; landing pages keep sample "PKR" on purpose — no company there), showcase trip stops chosen on the trip's road path and "arrived" only once the simulated vehicle passed them (`stopsOf` in showcase/details.ts), Live map taller (`h-[calc(100vh-200px)] min-h-[640px]`), `zoomControls` prop on ConvoyMap (vehicle + trip modal maps), fullscreen button pressed state + fullscreenchange sync, one brand focus ring for toolbar/zoom buttons (components.css), all fixed-width modals now `w-[min(Npx,calc(100vw_-_1.5rem))]` (they overflowed phones), picker footer wrap. Verified: 5-minute soak (heap ~154 MB → ~151 MB, DOM 941–999 nodes, markers flat, tour still cycling), keyboard audit (66 focusables on the Live map, all named), phone-width picker + trip modal, currency strings live. NOT verifiable here: real fullscreen (automation cannot grant the user gesture).

### 9d. Production QA of the map (2026-09-28, build of commit 3dd9a4f)

`next build` OK (no warnings/errors), `next start`: crawl of 43 static routes through iframes = no crashes, no page errors, no horizontal overflow at 1280 px (the only flag was a false positive on the text "4 / 500" in Plan & usage; redirects as designed). axe-core 4.10.2 (wcag2a/2aa/21a/21aa) = 0 violations on: Live map light+badge with card, night+silhouette with card, satellite+puck, /map, Overview hero, landing, trip modal map tab, coordinate picker (empty and with pin). NOT scanned: vehicle modal, Live map at phone width, 3D states. Note: `window.__cvMap` etc. exist only in dev builds — on a production build drive the map by clicking clusters.

## 10. PHASE 2B — built (2026-09-28, commits 8c19078 and before)

- **B1 verified in a real visible tab:** Reveal cards fade/rise in and never stay hidden; ambient aurora renders; odometer numbers OK.
- **B2 icon tiles:** central `.icon-gradient` / new `.icon-tile` (+ `--gold/--success/--danger`, `--icon-tone`) in components.css: gloss highlight, tone glow, drop-shadowed glyph, hover sheen, hover lift; `.icon-live` = pulsing ring (no sheen). Applied to KPI/nav/palette tiles (existing class), Overview insights, AI workspace cards, list-row icons (Vehicles/Drivers/Trips/Yards…), rows got `group` for the hover.
- **B5 AI orb:** `components/ui/AiOrb.tsx` (+ `.ai-orb*` CSS): idle = breathing + slow spin, thinking = fast spin + ripples + orbiting spark + core pulse, speaking = voice-like core pulse + ripples. `CopilotChat` reports state via `onOrbState` (thinking 0.9 s → speaking while the answer types → idle); used in CopilotPanel header and the AI workspace. Timeline verified live (thinking @44 ms, speaking @956 ms, idle @2149 ms).
- **B6 micro-motion:** `.btn-brand/.btn-ai` press scale + light sweep, `.btn-soft` press, springy `.switch-thumb` (token `--ease-spring`) on all switches, checkbox/radio pop, `.row-glide` brand rail on table rows (RadixTable), card rows already had `card-lift`.
- **B7 live indicators:** `components/ui/Flash.tsx` + `.value-flash` (map HUD counts, Overview Live/Stale/trackers chips; NOT on the vehicle speed — it changes every poll and would flicker), bell wiggle on hover + pulsing unread dot ring. Status-dot heartbeat already existed.
- **B8 loaders/empties:** route progress bar = brand gradient + glowing head (index.css), toasts get success/danger accent edge + glow, empty-state orb glossy with a slowly turning dashed ring.
- All motion wrapped in `prefers-reduced-motion: no-preference`; colours from tokens (`--color-*`, `color-mix`).

### 10a. B9 QA of phase 2B (production build of commit 8c19078)

`next build` OK (0 warnings/errors). `next start`: 38 routes crawled through iframes (+ axe 4.10.2 wcag2a/2aa/21a/21aa on each): no crashes, no page errors/rejections, no horizontal overflow at 1280 px. Only violation: /company-location `<dl>` grouping (T-004 page, not 2B) — fixed (each row its own `<dl>`) and re-scanned clean on dev. Not covered: reduced-motion emulation (all motion is inside `prefers-reduced-motion: no-preference` media queries — verified by reading the CSS), 60 fps measurement of the new effects, mobile widths of the new effects, orb states at the copilot panel (only /ai page tested live).

## 11. Visual sweep (2026-09-29, real window, every main screen)

Screens viewed: Live map, Overview, vehicles/drivers/geofences/yards/trips/assignments/incidents, fleet settings, analytics (utilisation/trips/fuel), Manage products, roles, members, account settings, company & locations, activity log, notifications, integrations, modules, plan & usage, documentation, connector health, Home (device status), product devices, login, 404, driver modal, trip modal map, vehicle modal, copilot panel (state only). **Fixed:** member status chips were red for "active" (case-sensitive compare), Company location auto-opened the edit dialog over a filled profile, showcase company counts (members 8 / products 6), gradient icon strokes vanished on straight lines (Signal) -> userSpaceOnUse gradients, Plan & usage numbers now from live counts (were hard-coded 69/47/4/1), product device page heading used "Product 1" (name now looked up from the list), offline devices list showed green dots, Connector health redesigned, Account settings got a page heading. **Not covered:** modals of yard editor/incident forms, mobile widths of every page, the ⌘K palette and notification dropdown looks (verified earlier sessions). **Crawl note:** /products/1/overview is NOT a route (tabs: devices, configuration, integration, history) — use /products/1/devices in crawls.

### 11a. Full QA after the sweep (production build of commit 46cbafa + a11y fix)

`next build` OK (0 warnings/errors). Crawl + axe (wcag2a/2aa/21a/21aa) of 39 routes on `next start`: no crashes, no page errors/rejections, no overflow, no 404s; only violation = /products/1/configuration `button-name` x22 (icon-only attribute settings buttons) -> fixed with aria-labels (not re-scanned). New map controls scanned with the search dropdown open, the Views popover open and the heat layer on: 0 violations. Not covered: ETA chip / speed legend axe (both aria-hidden / pointer-events none), mobile widths of the new controls.
