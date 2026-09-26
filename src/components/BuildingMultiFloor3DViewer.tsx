// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { Suspense, useMemo, useState, useRef } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  X,
  ArrowLeft,
  AlertTriangle,
  Thermometer,
  Droplet,
  Droplets,
  Activity,
  DoorOpen,
  Waves,
  Gauge,
} from 'lucide-react';
import ReactApexChart from 'react-apexcharts';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useModal } from '@contexts/ModalContext';
import DevicePointsModal from '@components/DevicePointsModal';

/**
 * Phase 3 — every floor of a building, stacked vertically, now with real
 * building-wide and per-floor context around the 3D view rather than just
 * the model on its own. device_count/online_count/active_alarm_count come
 * directly from the backend (FloorPlanController::serializeFloorPlan) —
 * computed server-side against the real Alarm system and Device.last_updated,
 * not invented client-side.
 *
 * FLOOR_HEIGHT is an arbitrary world-unit spacing (there's no real-world
 * meters-per-floor captured anywhere yet — same noted limitation as
 * Phase 2's plane sizing). Consistent, correctly ordered, not to scale.
 */
const FLOOR_HEIGHT = 2.2;

/** Recursively flattens the asset tree into { [componentId]: name }. */
function flattenComponentNames(node, out = {}) {
  if (!node) return out;
  if (node.id != null) out[node.id] = node.name;
  (node.children || []).forEach(child => flattenComponentNames(child, out));
  return out;
}

export default function BuildingMultiFloor3DViewer({ assetId, buildingName }) {
  const { data, isLoading } = useSimpleQuery(
    `building-floors-3d-${assetId}`,
    `/api/floor-plans/building/${assetId}`
  );
  // `positioned_components` from the floor-plans endpoint carries only
  // device_id — no DevEUI, no reporting/alert state (checked directly
  // against the live response). GET /devices/{id}?type=asset already
  // resolves every device under the whole building in one call, with
  // `uuid` (DevEUI) and per-attribute `isAlert`/`last_packet_value` — real
  // data, not re-derived. Merged in below rather than asking backend for a
  // new endpoint, since this one already has everything needed.
  const { data: devicesData } = useSimpleQuery(
    `building-devices-${assetId}`,
    `/api/devices/${assetId}?type=asset`
  );
  // Same idea for each floor's real name ("floor 1") — the floor-plans
  // endpoint only has floor_level (a number), not the component's own
  // name. GET /assets/{id} already returns the full nested tree with
  // names; flattened once here into an id → name lookup.
  const { data: assetTreeData } = useSimpleQuery(`asset-tree-${assetId}`, `/api/assets/${assetId}`);

  const { closeModal } = useModal();
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [viewingDevice, setViewingDevice] = useState(null);

  const floors = data?.success ? data.data : [];

  const deviceById = useMemo(() => {
    const map = {};
    (devicesData?.devices || []).forEach(d => {
      map[d.id] = d;
    });
    return map;
  }, [devicesData]);

  const componentNameById = useMemo(
    () => flattenComponentNames(assetTreeData?.asset),
    [assetTreeData]
  );

  // Clicking a marker used to call the global openModal(), which replaces
  // this whole viewer's content (single-slot ModalContext) — closing the
  // device modal then had nothing to return to. Rendered as a local
  // overlay instead, so closing it just clears local state and this
  // viewer (stacked or isolated) is still right there underneath.
  const handleSelectMarker = marker => {
    setViewingDevice(marker);
  };

  const totals = useMemo(() => {
    return floors.reduce(
      (acc, f) => ({
        devices: acc.devices + (f.device_count || 0),
        online: acc.online + (f.online_count || 0),
        alarms: acc.alarms + (f.active_alarm_count || 0),
      }),
      { devices: 0, online: 0, alarms: 0 }
    );
  }, [floors]);

  const chartOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false }, background: 'transparent', stacked: true },
      theme: { mode: 'dark' },
      colors: ['#17d68c', '#565f68'],
      plotOptions: { bar: { horizontal: false, borderRadius: 2, columnWidth: '55%' } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: floors.map(f => `L${f.floor_level}`),
        labels: { style: { colors: '#8b95a1', fontSize: '10px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { style: { colors: '#8b95a1', fontSize: '10px' } } },
      legend: { show: false },
      grid: { borderColor: '#22282e', strokeDashArray: 3 },
    }),
    [floors]
  );

  const chartSeries = useMemo(
    () => [
      { name: 'Online', data: floors.map(f => f.online_count || 0) },
      { name: 'Offline', data: floors.map(f => (f.device_count || 0) - (f.online_count || 0)) },
    ],
    [floors]
  );

  const selectedFloor = floors.find(f => f.id === selectedFloorId);

  // The fixed [5,3.5,13] start only ever framed ~2 floors well — with more
  // floors stacked higher (FLOOR_HEIGHT apart), a fixed camera either cuts
  // off the top of a tall stack or sits too close. Scales the camera
  // outward and re-centers its height on the stack's vertical midpoint as
  // floor count grows, so an arbitrary number of floors still opens fully
  // framed without the owner having to manually zoom/pan out first.
  const stackedCamera = useMemo(() => {
    const maxLevel = floors.length ? Math.max(...floors.map(f => f.floor_level)) : 0;
    const stackHeight = maxLevel * FLOOR_HEIGHT;
    const scale = 1 + stackHeight / 10;
    return {
      position: [5 * scale, 3.5 * scale + stackHeight / 2, 13 * scale],
      maxDistance: Math.max(40, stackHeight * 4),
    };
  }, [floors]);

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md w-[1180px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">{buildingName} — Building 3D</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {selectedFloor
              ? `${componentNameById[selectedFloor.asset_component_id] || `Level ${selectedFloor.floor_level}`} — click a marker for sensor details.`
              : 'Every floor with an uploaded plan, stacked by floor level. Click a floor to focus it.'}
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {isLoading && <div className="text-xs text-ink-2 p-8 text-center">Loading building…</div>}

      {!isLoading && (!floors || floors.length === 0) && (
        <div className="text-xs text-ink-2 p-8 text-center border border-dashed border-line rounded-md m-4">
          No floors with an uploaded floor plan yet under {buildingName}.
        </div>
      )}

      {!isLoading && floors && floors.length > 0 && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left — building-wide summary + per-floor comparison chart */}
          <div className="w-60 flex-shrink-0 border-r border-line-soft p-4 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
              Building Summary
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <SummaryStat label="Devices" value={totals.devices} />
              <SummaryStat label="Online" value={totals.online} valueClass="text-accent-green" />
              <SummaryStat label="Floors" value={floors.length} />
              <SummaryStat
                label="Active alarms"
                value={totals.alarms}
                valueClass={totals.alarms > 0 ? 'text-danger' : 'text-ink-0'}
              />
            </div>

            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
              Online vs Offline, by Floor
            </div>
            <ReactApexChart
              options={chartOptions}
              series={chartSeries}
              type="bar"
              height={Math.max(140, floors.length * 34)}
              width="100%"
            />

            {/* A reliable, camera-angle-independent way to tell floors apart
                and pick one — the 3D "Level N" tags floating in the stacked
                scene can visually drift near/over the wrong floor as the
                camera rotates around several closely-stacked planes (owner-
                reported); this list never moves regardless of the 3D view's
                orientation. Panel scrolls (overflow-y-auto on its outer div)
                so an arbitrarily long list stays usable. */}
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mt-4 mb-2">Floors</div>
            <div>
              {[...floors]
                .sort((a, b) => a.floor_level - b.floor_level)
                .map(floor => (
                  <button
                    key={floor.id}
                    onClick={() => setSelectedFloorId(floor.id)}
                    className={`w-full text-left flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md mb-1 border transition-colors ${
                      selectedFloorId === floor.id
                        ? 'border-accent-cyan bg-surface-3 text-ink-0'
                        : 'border-line-soft bg-surface-2 text-ink-1 hover:bg-surface-3'
                    }`}
                  >
                    <span className="truncate">
                      {componentNameById[floor.asset_component_id] || `Level ${floor.floor_level}`}
                      <span className="text-ink-2"> · Level {floor.floor_level}</span>
                    </span>
                    {floor.active_alarm_count > 0 && (
                      <span className="text-danger flex-shrink-0 ml-1.5">
                        {floor.active_alarm_count}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {/* Center — the 3D model */}
          <div className="flex-1 p-4">
            <div className="relative w-full h-full min-h-[480px] bg-surface-2 rounded-md overflow-hidden">
              {selectedFloor && (
                <>
                  <button
                    onClick={() => setSelectedFloorId(null)}
                    className="absolute top-2 left-2 z-10 flex items-center gap-1 text-caption font-medium font-medium text-ink-0 bg-surface-1/90 border border-line-soft rounded-full px-2.5 py-1.5 hover:bg-surface-2 transition-colors"
                  >
                    <ArrowLeft size={12} /> Back to stacked view
                  </button>
                  {/* A "Level N" tag floating in the 3D scene, right on the
                      floor plan image, read as clutter once that floor is
                      the only thing on screen — a normal 2D breadcrumb
                      overlay (same treatment as the back button) instead. */}
                  <div className="absolute top-2 right-2 z-10 text-caption font-medium font-medium text-ink-1 bg-surface-1/90 border border-line-soft rounded-full px-2.5 py-1.5">
                    {buildingName} <span className="text-ink-2">/</span>{' '}
                    {componentNameById[selectedFloor.asset_component_id] ||
                      `Level ${selectedFloor.floor_level}`}
                    <span className="text-ink-2"> (Level {selectedFloor.floor_level})</span>
                  </div>
                </>
              )}
              {/* A steep isometric start ([8,8,8], ~35° elevation) visually
                  merges stacked floors into one another — FLOOR_HEIGHT (2.2)
                  is small relative to an 8-unit-wide plane, so the vertical
                  gap barely registers on screen at that angle. A flatter
                  start (~14° elevation) reads the stack clearly on open;
                  OrbitControls still allows rotating back to isometric.
                  Clicking a floor focuses it: only that floor renders
                  (`standalone` re-centers it at the origin instead of its
                  stacked offset) with a closer camera, same as the
                  single-floor viewer's framing. The Canvas `key` forces a
                  remount on focus/unfocus so the initial camera position
                  actually resets — R3F only applies `camera` on mount. */}
              {/* drei's <Html> portals its labels with a very high default
                  z-index (meant to sit above ordinary page content), so an
                  absolutely-positioned overlay on top of the Canvas doesn't
                  reliably cover marker/floor labels — they bled through on
                  top of the device modal. Swapping the Canvas out for the
                  modal entirely (rather than layering) sidesteps that
                  completely, and stays within this same outer container so
                  the back button/breadcrumb context above is unaffected. */}
              {viewingDevice ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <DevicePointsModal
                    deviceId={viewingDevice.device_id}
                    deviceName={deviceById[viewingDevice.device_id]?.name || viewingDevice.name}
                    onClose={() => setViewingDevice(null)}
                  />
                </div>
              ) : (
                <Canvas
                  key={selectedFloorId ?? 'stacked'}
                  camera={{ position: selectedFloor ? [0, 6, 6] : stackedCamera.position, fov: 50 }}
                >
                  <ambientLight intensity={0.7} />
                  <directionalLight position={[6, 10, 6]} intensity={0.6} />
                  <Suspense fallback={null}>
                    {(selectedFloor ? [selectedFloor] : floors).map(floor => (
                      <FloorLayer
                        key={floor.id}
                        floor={floor}
                        deviceById={deviceById}
                        componentNameById={componentNameById}
                        onSelectMarker={handleSelectMarker}
                        onSelectFloor={() => setSelectedFloorId(floor.id)}
                        isSelected={selectedFloorId === floor.id}
                        standalone={!!selectedFloor}
                      />
                    ))}
                  </Suspense>
                  <OrbitControls
                    maxPolarAngle={Math.PI / 2.1}
                    minDistance={selectedFloor ? 2 : 3}
                    maxDistance={selectedFloor ? 20 : stackedCamera.maxDistance}
                  />
                </Canvas>
              )}
            </div>
          </div>

          {/* Right — selected floor detail */}
          <div className="w-64 flex-shrink-0 border-l border-line-soft p-4 overflow-y-auto">
            {!selectedFloor && (
              <div className="text-[11px] text-ink-2 italic mt-2">
                Click a floor in the 3D view to see its detail here.
              </div>
            )}
            {selectedFloor && (
              <FloorDetailPanel
                floor={selectedFloor}
                deviceById={deviceById}
                onSelectDevice={handleSelectMarker}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * `sensor.device` doesn't exist on `positioned_components` from
 * GET /floor-plans/building/{id} — checked directly against the live
 * response, it only ever carries `device_id`. `device` here is instead
 * the matching entry from GET /devices/{assetId}?type=asset (resolved
 * once per building in the parent's `deviceById`), which has real
 * per-attribute `last_packet_value`.
 */
function summarizeDeviceValues(device) {
  const attrs = device?.attributes;
  if (!attrs || attrs.length === 0) return null;

  const withValue = attrs.filter(
    a => a.last_packet_value !== null && a.last_packet_value !== undefined
  );
  if (withValue.length === 0) return null;

  return withValue
    .slice(0, 2)
    .map(a => `${a.label}: ${a.last_packet_value}${a.unit || ''}`)
    .join(' · ');
}

/**
 * Icon by semantic keyword match against the sensor's name — the only
 * real signal available. Confirmed elsewhere this session (Points work):
 * no semantic_type taxonomy exists in the schema at all, so this is
 * necessarily name-pattern matching, not a lookup against real
 * classification data. Order matters — more specific matches first.
 */
function getSensorIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('water') || n.includes('leak')) return Droplet;
  if (n.includes('humid')) return Droplets;
  if (n.includes('temp')) return Thermometer;
  if (n.includes('door') || n.includes('contact')) return DoorOpen;
  if (n.includes('vibrat')) return Waves;
  if (n.includes('motion')) return Activity;

  return Gauge;
}

/**
 * Real alert state, not inferred. `sensor.active_alarm` (a real attached
 * Alarm record, from FloorPlanController's per-sensor alarm attachment)
 * takes priority; `device` — the matching entry from
 * GET /devices/{assetId}?type=asset, see `deviceById` in the parent — adds
 * the same per-attribute `isAlert` flag used elsewhere in the app as a
 * second, real signal (positioned_components carries no alarm/report
 * state of its own to fall back on, only `device_id`). 'normal' requires
 * the device to have actually reported at least one real value; otherwise
 * 'offline' — not a client-side re-evaluation of whether a value "looks
 * wrong."
 */
function getAlertState(sensor, device) {
  if (sensor.active_alarm) return 'alert';
  if (device?.attributes?.some(a => a.isAlert)) return 'alert';

  const isReporting = device?.attributes?.some(
    a => a.last_packet_value !== null && a.last_packet_value !== undefined
  );

  return isReporting ? 'normal' : 'offline';
}

const STATE_COLORS = {
  alert: { text: '#ff3b5c', bg: 'rgba(255,59,92,0.12)', hex3d: 0xff3b5c },
  normal: { text: '#17d68c', bg: 'rgba(23,214,140,0.1)', hex3d: 0x17d68c },
  offline: { text: '#565f68', bg: 'transparent', hex3d: 0x565f68 },
};

/**
 * Threshold bar — only rendered when a real active_alarm with a usable
 * condition_snapshot exists. condition_snapshot/triggered_value are
 * properly array-cast on the Alarm model (checked directly, unlike
 * DeviceValue.values), so no defensive string-parsing needed here.
 * Scoped deliberately to '>' and '<' — the two operators a simple
 * threshold bar can honestly represent; other operators (=, etc.) just
 * show the value as text instead of guessing at a bar layout.
 */
function ThresholdBar({ activeAlarm }) {
  const snapshot = activeAlarm?.condition_snapshot;
  if (!snapshot || !snapshot.selectedAttribute) return null;

  const operator = snapshot.selectedCondition;
  if (operator !== '>' && operator !== '<') return null;

  const threshold = parseFloat(snapshot.conditionValue);
  const actual = parseFloat(activeAlarm.triggered_value?.[snapshot.selectedAttribute]);
  if (Number.isNaN(threshold) || Number.isNaN(actual)) return null;

  // Simple, honest range: threshold sits at the midpoint, actual value
  // placed proportionally around it — not a real engineering range (none
  // is captured anywhere), just enough to show "how far past the line."
  const span = Math.max(Math.abs(actual - threshold) * 2, threshold * 0.2, 1);
  const min = threshold - span / 2;
  const max = threshold + span / 2;
  const thresholdPct = Math.min(100, Math.max(0, ((threshold - min) / (max - min)) * 100));
  const actualPct = Math.min(100, Math.max(0, ((actual - min) / (max - min)) * 100));

  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-danger/70"
          style={
            operator === '>'
              ? { left: `${thresholdPct}%`, right: 0 }
              : { left: 0, right: `${100 - thresholdPct}%` }
          }
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-ink-0"
          style={{ left: `${thresholdPct}%` }}
          title={`Threshold: ${threshold}`}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-danger border border-surface-0"
          style={{ left: `calc(${actualPct}% - 4px)` }}
          title={`Current: ${actual}`}
        />
      </div>
      <div className="flex justify-between text-[8.5px] text-ink-2 mt-0.5">
        <span>{actual}</span>
        <span>threshold {threshold}</span>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, valueClass = 'text-ink-0' }) {
  return (
    <div className="bg-surface-2 rounded-md p-2">
      <div className="text-[9px] text-ink-2 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-mono font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function FloorDetailPanel({ floor, deviceById, onSelectDevice }) {
  const sensors = floor.positioned_components || [];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Floor Detail</div>
      <div className="text-sm font-semibold text-ink-0 mb-3">Level {floor.floor_level}</div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <SummaryStat label="Devices" value={floor.device_count || 0} />
        <SummaryStat
          label="Online"
          value={floor.online_count || 0}
          valueClass="text-accent-green"
        />
      </div>

      {floor.active_alarm_count > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5 mb-3">
          <AlertTriangle size={12} />
          {floor.active_alarm_count} active alarm{floor.active_alarm_count > 1 ? 's' : ''} on this
          floor
        </div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Sensors</div>
      {sensors.length === 0 && (
        <div className="text-[11px] text-ink-2 italic">No positioned sensors on this floor.</div>
      )}
      {sensors.map(s => {
        const device = deviceById[s.device_id];
        const state = getAlertState(s, device);
        const colors = STATE_COLORS[state];
        const Icon = getSensorIcon(s.name);
        const valueSummary = summarizeDeviceValues(device);

        return (
          <button
            key={s.id}
            onClick={() => onSelectDevice(s)}
            className="w-full text-left border rounded-md px-2.5 py-2 mb-1.5 transition-colors hover:brightness-110"
            style={{
              background: colors.bg,
              borderColor: state === 'alert' ? colors.text : 'var(--color-line-soft)',
            }}
          >
            <div className="flex items-center gap-2">
              <Icon size={13} style={{ color: colors.text, flexShrink: 0 }} />
              <span className="text-xs text-ink-0 truncate flex-1">
                {s.name}
                {device?.uuid && <span className="text-ink-2 font-mono"> — {device.uuid}</span>}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: colors.text }}
              />
            </div>
            {valueSummary && (
              <div className="text-[10px] font-mono text-ink-2 mt-1 truncate pl-[21px]">
                {valueSummary}
              </div>
            )}
            {state === 'alert' && (
              <div className="pl-[21px]">
                <ThresholdBar activeAlarm={s.active_alarm} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FloorLayer({
  floor,
  deviceById,
  componentNameById,
  onSelectMarker,
  onSelectFloor,
  isSelected,
  standalone,
}) {
  const texture = useLoader(THREE.TextureLoader, floor.url);

  const aspect = floor.width_px / floor.height_px;
  const [planeWidth, planeDepth] = aspect >= 1 ? [8, 8 / aspect] : [8 * aspect, 8];
  // Focused/standalone view re-centers the floor at the origin instead of
  // its stacked height — nothing else to offset against once it's alone.
  const y = standalone ? 0 : floor.floor_level * FLOOR_HEIGHT;
  const floorName = componentNameById?.[floor.asset_component_id];

  const markers = useMemo(() => {
    return (floor.positioned_components || []).map(c => {
      const worldX = (c.position_x - 0.5) * planeWidth;
      const worldZ = (c.position_y - 0.5) * planeDepth;
      const device = deviceById?.[c.device_id];
      // Same getAlertState() used by the 2D floor detail panel — one
      // source of truth for "is this sensor in alert," not two separate
      // color-logic implementations that could drift apart.
      const state = getAlertState(c, device);

      return { ...c, worldX, worldZ, state, deveui: device?.uuid };
    });
  }, [floor.positioned_components, planeWidth, planeDepth, deviceById]);

  return (
    <group position={[0, y, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={e => {
          e.stopPropagation();
          onSelectFloor?.();
        }}
      >
        <planeGeometry args={[planeWidth, planeDepth]} />
        <meshStandardMaterial
          map={texture}
          side={THREE.DoubleSide}
          transparent
          opacity={0.96}
          emissive={isSelected ? new THREE.Color('#29d3ff') : new THREE.Color('#000000')}
          emissiveIntensity={isSelected ? 0.15 : 0}
        />
      </mesh>

      {/* Only in the stacked view — once a floor is standalone/isolated it's
          the only thing on screen, and this tag becomes clutter sitting
          right on top of the image; the parent renders a proper 2D
          breadcrumb overlay instead for that case. Centered above the
          plane (not a corner) and well above sensor marker labels (which
          sit around y=0.28 local) — a corner anchor drifted away from its
          own floor's silhouette as the camera angle changed, and collided
          with nearby sensor tags at the flatter default angle. */}
      {!standalone && (
        <Html position={[0, 0.7, 0]} center>
          <div
            className={`text-[9px] font-mono border px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none ${
              isSelected
                ? 'bg-surface-3 text-ink-0 border-accent-cyan'
                : 'bg-surface-0 text-ink-2 border-line'
            }`}
          >
            {floorName ? `${floorName} · Level ${floor.floor_level}` : `Level ${floor.floor_level}`}
            {floor.active_alarm_count > 0 && (
              <span className="text-danger">
                {' '}
                · {floor.active_alarm_count} alarm{floor.active_alarm_count > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </Html>
      )}

      {/* Sensors only render once a floor is isolated — in the stacked
          view they're small enough at this scale to just add clutter on
          top of an already-busy multi-plane scene; floor-level numbering
          is what that view is for. */}
      {standalone &&
        markers.map(m => <SensorMarker key={m.id} marker={m} onSelectMarker={onSelectMarker} />)}
    </group>
  );
}

function SensorMarker({ marker, onSelectMarker }) {
  const colors = STATE_COLORS[marker.state];
  const sphereRef = useRef(null);
  const isAlert = marker.state === 'alert';

  // Genuine "beyond color" distinction for alert state, honestly scoped —
  // changing 3D geometry per sensor type would need per-icon models with
  // no way to verify they'd actually load correctly in this environment.
  // A pulse is a real, standard R3F pattern (useFrame) that's actually
  // achievable and testable in concept.
  useFrame(({ clock }) => {
    if (!isAlert || !sphereRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.25;
    sphereRef.current.scale.setScalar(pulse);
  });

  return (
    <group position={[marker.worldX, 0.02, marker.worldZ]}>
      <mesh
        ref={sphereRef}
        position={[0, 0.15, 0]}
        onClick={e => {
          e.stopPropagation();
          onSelectMarker?.(marker);
        }}
      >
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          color={colors.hex3d}
          emissive={colors.hex3d}
          emissiveIntensity={isAlert ? 0.9 : marker.state === 'normal' ? 0.6 : 0.1}
        />
      </mesh>
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.15, 6]} />
        <meshBasicMaterial color="#565f68" />
      </mesh>
      <Html distanceFactor={10} position={[0, 0.28, 0]} center>
        {/* This chip floats directly over the uploaded floor-plan image,
            which can be any color (light or dark) depending on what the
            owner uploaded — unlike the flat 2D panel, which always sits on
            the app's own solid background. A previous version left the
            non-alert states relying on `var(--ink-0)`/`var(--surface-0)`
            (wrong names — the real tokens are `--color-ink-0` etc., so
            these silently resolved to nothing: no background at all, text
            color falling back to inherited/white). On a white uploaded
            image that made the "normal" white-on-nothing label invisible.
            Every state now gets the same solid state-color chip + white
            text treatment, so it's legible against any image color. */}
        <div
          className="text-[9px] font-mono border px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none"
          style={{
            color: '#ffffff',
            borderColor: colors.text,
            background: colors.text,
          }}
        >
          {marker.name}
          {marker.deveui && <span className="opacity-80"> — {marker.deveui}</span>}
        </div>
      </Html>
    </group>
  );
}
