import type { VehicleKind } from '../vehicle/vehicleKinds';

/** Where each kind's glTF model lives. Sourced from Kenney's CC0 Car Kit (sedan/van/truck/truck-flat) or built
 * procedurally (bus/semi/tanker, which the Car Kit has no equivalent for) — see public/models/vehicles/README.md. */
export const MODEL_URL: Record<VehicleKind, string> = {
  car: '/models/vehicles/sedan.glb',
  van: '/models/vehicles/van.glb',
  pickup: '/models/vehicles/truck-flat.glb',
  truck: '/models/vehicles/truck.glb',
  semi: '/models/vehicles/semi.glb',
  tanker: '/models/vehicles/tanker.glb',
  bus: '/models/vehicles/bus.glb',
};

/**
 * The sourced Kenney models and the procedurally-built ones were not authored at the same unit scale (Kenney's
 * Car Kit uses a compact stylised scale; the procedural bus/semi/tanker were built directly in realistic metres).
 * These multipliers bring every kind to a consistent, believable real-world length so the fleet reads as one
 * scale on the map instead of toy cars next to full-size trucks. Tune here if a kind looks mis-sized; the
 * generator (`scripts/generate-vehicle-models.mjs`) stays untouched.
 */
export const MODEL_SCALE: Record<VehicleKind, number> = {
  car: 1.76, // sedan.glb native length 2.55 → ~4.5 m
  van: 1.82, // van.glb native length 2.75 → ~5.0 m
  pickup: 2.0, // truck-flat.glb native length 2.75 → ~5.5 m
  truck: 2.37, // truck.glb native length 2.95 → ~7.0 m
  bus: 1,
  semi: 1,
  tanker: 1,
};

/** Model-space forward is +Z and up is +Y for every model here (verified live for the Kenney kit; built that
 * way for the procedural ones) — heading needs no per-kind axis correction, only the sign/offset in
 * `headingToOrientation` (Vehicle3DOverlay.ts). */
export const VEHICLE_KINDS: VehicleKind[] = [
  'car',
  'van',
  'pickup',
  'truck',
  'bus',
  'semi',
  'tanker',
];
