import type { Map as GLMap, IControl } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import type { VehicleKind, VehicleState } from '../vehicle/vehicleKinds';
import { MODEL_URL, MODEL_SCALE } from './models';

export interface Vehicle3DEntry {
  id: string;
  lon: number;
  lat: number;
  /** Degrees clockwise from north (the app's heading convention, same as every other map layer). */
  heading: number;
  kind: VehicleKind;
  state: VehicleState;
}

/**
 * Thin imperative wrapper around a deck.gl `MapboxOverlay` (interleaved with the MapLibre canvas, so it respects
 * 3D terrain/depth the same way a native MapLibre layer would) rendering one `ScenegraphLayer` per vehicle kind.
 * Kept outside React because `VehicleLayer` already drives vehicle motion from its own `requestAnimationFrame`
 * loop (`store.current`); `update()` just mirrors that same per-frame state into deck.gl instead of duplicating
 * the interpolation/dead-reckoning logic.
 *
 * Deliberately NOT pickable. Selection/hover/keyboard access all still go through the existing flat DOM marker
 * (`VehicleLayer`'s `el`), which stays in the DOM at the same lon/lat with its halo visible and only its drawn
 * icon hidden (`.cv-veh.is-3d`, `components.css`) — so clicking "on" the 3D truck hits the real marker
 * underneath it, and every existing a11y/selection/card-follow behaviour keeps working completely unchanged.
 */
export class Vehicle3DOverlay {
  private overlay: MapboxOverlay;

  constructor(map: GLMap) {
    patchMapForDeckGlCompat(map);
    this.overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(this.overlay as unknown as IControl);
  }

  /** Call every frame (or whenever the 3D-eligible set changes) with the vehicles that should show a real model. */
  update(entries: Vehicle3DEntry[]) {
    // One ScenegraphLayer per kind (not one per vehicle): deck.gl instances every vehicle of a kind from the
    // same loaded glTF, so the WebGL/memory cost scales with distinct kinds on screen, not fleet size.
    const byKind = new Map<VehicleKind, Vehicle3DEntry[]>();

    entries.forEach(e => {
      const list = byKind.get(e.kind);

      if (list) list.push(e);
      else byKind.set(e.kind, [e]);
    });

    const layers = [...byKind.entries()].map(
      ([kind, data]) =>
        new ScenegraphLayer<Vehicle3DEntry>({
          id: `cv-veh3d-${kind}`,
          data,
          scenegraph: MODEL_URL[kind],
          getPosition: d => [d.lon, d.lat, 0],
          getOrientation: d => [0, headingToYaw(d.heading), 0],
          getScale: () => [MODEL_SCALE[kind], MODEL_SCALE[kind], MODEL_SCALE[kind]],
          getColor: d => stateTint(d.state),
          updateTriggers: { getOrientation: data, getPosition: data, getColor: data },
          sizeScale: 1,
          // Real-world-metre scale means a truck is a few sub-pixels at country zoom (unlike the flat icon,
          // which has its own zoom-based floor — see VehicleLayer's `vs`); without a floor here the model
          // would just vanish instead of shrinking gracefully.
          sizeMinPixels: 18,
          sizeMaxPixels: 120,
          _lighting: 'pbr',
          pickable: false,
        })
    );

    this.overlay.setProps({ layers });
  }

  dispose(map: GLMap) {
    map.removeControl(this.overlay as unknown as IControl);
  }
}

/**
 * Converts the app's compass heading (0° = north, clockwise) to the yaw deck.gl's `ScenegraphLayer` expects.
 *
 * Every model this layer loads has its root node pre-rotated by `AXIS_FIX` (see `generate-vehicle-models.mjs`
 * and `fix-vehicle-model-axes.mjs`) so that model-local +X is forward and +Z is up — matching the axis
 * convention `ScenegraphLayer`'s Euler orientation actually uses (confirmed by reading its `matrix.js`: "pitch"
 * rotates around Y and "roll" around X, which only holds if up=Z and forward=X; a plain Y-up/Z-forward glTF
 * file, which is what every source here starts as, would render lying on its side without that fix).
 *
 * With that fixed, yaw rotates forward (+X) toward +Y at 90°/unit — and deck.gl's LNGLAT world space has
 * +X = east, +Y = north, +Z = up (confirmed from `@math.gl/web-mercator`'s `lngLatToWorld`, not assumed: its
 * raw Y formula increases with latitude, i.e. north, with no pixel-space flip applied at this stage). So
 * heading 0°/north needs yaw 90° (forward along +Y), heading 90°/east needs yaw 0° (forward along +X):
 * yaw = 90 − heading.
 */
function headingToYaw(heading: number): number {
  return 90 - heading;
}

function stateTint(state: VehicleState): [number, number, number, number] {
  // Deliberately neutral for every state but offline: the model's own painted colours should read as a real
  // vehicle, not a status-coloured blob — status is already communicated by the marker's halo underneath (kept
  // visible, see `.cv-veh.is-3d` in components.css) and by the vehicle card/label. Offline fades to match the
  // flat icon's `opacity: 0.62` treatment for the same state.
  return state === 'offline' ? [255, 255, 255, 158] : [255, 255, 255, 255];
}

const patchedMaps = new WeakSet<GLMap>();

/**
 * Works around a real, reproducible incompatibility between `@deck.gl/mapbox@9.4.0` and this app's
 * maplibre-gl build (6.11.2): deck.gl's interleaved-mode code reads `map.transform.*` in several places
 * (`deck-utils.js`), but this maplibre-gl build does not expose a public `transform` getter at all —
 * confirmed live by walking the Map instance's whole prototype chain and finding no such property anywhere,
 * despite the published `.d.ts` claiming one (`get transform(): IReadonlyTransform`). Two distinct crashes
 * come from this one root cause, both reproduced live while building T-006 item 2 (3D vehicle models):
 *
 * 1. `centerCameraOnTerrain` reads `map.transform.elevation`, but only when `map.getTerrain()` is truthy —
 *    i.e. the instant the map's real terrain (Scenery3D.tsx's hillshade DEM, 3D mode) is active, which is
 *    every time this overlay matters (it only draws in 3D mode). Fixed by making `getTerrain()` always report
 *    "no terrain" to deck.gl specifically: nothing in this app's own code calls `map.getTerrain()` for any
 *    decision (only `setTerrain()`, to turn the real hillshade on/off), so this is side-effect-free — the
 *    actual DEM/hillshade rendering reads maplibre's own internal terrain state, not this public accessor.
 * 2. `getViewport` (the per-FRAME camera sync used while actually drawing, not just on add) reads
 *    `map.transform.height` unconditionally — this one isn't gated by terrain at all, so every single render
 *    frame threw and the 3D layer never drew anything despite loading its models successfully (confirmed via
 *    network requests succeeding while nothing appeared on screen). Fixed by shimming a minimal `transform`
 *    object exposing just the property deck.gl actually reads in practice (`height`, from the map's own
 *    container — the one value this build's render path couldn't otherwise get); `_nearZ`/`_farZ` are never
 *    reached here because maplibre's interleaved custom-layer render callback already supplies real
 *    `nearZ`/`farZ` via `renderParameters`, which `??` short-circuits before falling back to `map.transform`.
 */
function patchMapForDeckGlCompat(map: GLMap) {
  if (patchedMaps.has(map)) return;

  patchedMaps.add(map);
  map.getTerrain = () => null;

  const anyMap = map as unknown as { transform?: unknown };

  if (!anyMap.transform) {
    Object.defineProperty(map, 'transform', {
      configurable: true,
      get: () => ({ height: map.getContainer().clientHeight }),
    });
  }
}
