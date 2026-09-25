// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useModal } from '@contexts/ModalContext';
import DevicePointsModal from '@components/DevicePointsModal';

/**
 * Phase 2 of "drop a 2D floor plan, place sensors on it, turn into 3D."
 * Deliberately does NOT try to extract walls/rooms from the floor plan
 * image — that's the harder, deferred Phase 4. This drapes the real
 * uploaded floor plan image onto a flat 3D plane and floats real 3D
 * markers above each sensor's actual captured position (from Phase 1),
 * colored by the same online/offline logic already established in
 * DeviceStatusGrid — not a new status convention invented for this view.
 * Clicking a marker reuses DevicePointsModal directly, already built,
 * already real — not a new device-detail surface.
 *
 * Consumes GET /api/floor-plans/component/{id} exactly as built in
 * Phase 1 — same field names, no translation layer.
 */
export default function FloorPlan3DViewer({ componentId, componentName }) {
  const { data, isLoading } = useSimpleQuery(
    `floor-plan-3d-${componentId}`,
    `/api/floor-plans/component/${componentId}`
  );
  const { openModal } = useModal();

  const floorPlan = data?.success ? data.data : null;

  if (isLoading) {
    return <div className="text-xs text-ink-2 p-8 text-center">Loading floor plan…</div>;
  }

  if (!floorPlan) {
    return (
      <div className="text-xs text-ink-2 p-8 text-center border border-dashed border-line rounded-md">
        No floor plan uploaded for {componentName} yet.
      </div>
    );
  }

  const handleSelectMarker = marker => {
    openModal(
      <DevicePointsModal
        deviceId={marker.device_id}
        deviceName={marker.device?.name || marker.name}
      />
    );
  };

  return (
    <div className="w-full h-full min-h-[420px] bg-surface-2 rounded-md overflow-hidden">
      <Canvas camera={{ position: [0, 6, 6], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={0.6} />
        <Suspense fallback={null}>
          <FloorPlanScene floorPlan={floorPlan} onSelectMarker={handleSelectMarker} />
        </Suspense>
        <OrbitControls maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={20} />
      </Canvas>
    </div>
  );
}

function FloorPlanScene({ floorPlan, onSelectMarker }) {
  const texture = useLoader(THREE.TextureLoader, floorPlan.url);

  // Plane is sized to 8 units on the longer edge, preserving the floor
  // plan's real aspect ratio — arbitrary world-unit scale (there's no
  // real-world meters-per-pixel captured yet; see the build plan's noted
  // limitation), but consistent and correctly proportioned.
  const aspect = floorPlan.width_px / floorPlan.height_px;
  const [planeWidth, planeDepth] = aspect >= 1 ? [8, 8 / aspect] : [8 * aspect, 8];

  const markers = useMemo(() => {
    return (floorPlan.positioned_components || []).map(c => {
      // position_x/position_y are normalized 0-1 from Phase 1's click
      // capture — mapped here to the plane's actual world-space width/depth,
      // centered on the plane's origin.
      const worldX = (c.position_x - 0.5) * planeWidth;
      const worldZ = (c.position_y - 0.5) * planeDepth;

      const isReporting = c.device?.last_updated && c.device.last_updated !== 'never';

      return { ...c, worldX, worldZ, isReporting };
    });
  }, [floorPlan.positioned_components, planeWidth, planeDepth]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[planeWidth, planeDepth]} />
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>

      {markers.map(m => (
        <SensorMarker key={m.id} marker={m} onSelectMarker={onSelectMarker} />
      ))}
    </group>
  );
}

function SensorMarker({ marker, onSelectMarker }) {
  const color = marker.isReporting ? '#17d68c' : '#565f68';

  return (
    <group position={[marker.worldX, 0.02, marker.worldZ]}>
      <mesh
        position={[0, 0.15, 0]}
        onClick={e => {
          e.stopPropagation();
          onSelectMarker?.(marker);
        }}
      >
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={marker.isReporting ? 0.6 : 0.1}
        />
      </mesh>
      {/* Thin vertical stem so the marker reads as "sitting on the floor"
          rather than floating ambiguously above an unrelated point. */}
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.15, 6]} />
        <meshBasicMaterial color="#565f68" />
      </mesh>
      <Html distanceFactor={10} position={[0, 0.28, 0]} center>
        <div className="text-[9px] font-mono bg-surface-0 text-ink-0 border border-line px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
          {marker.name}
        </div>
      </Html>
    </group>
  );
}
