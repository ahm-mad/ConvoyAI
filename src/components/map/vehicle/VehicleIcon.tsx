'use client';

import { Bus, CarFront, Container, Fuel, Truck, Package } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VehicleIconStyle } from '../useMapPrefs';
import type { VehicleKind, VehicleState } from './vehicleKinds';

/* Silhouettes are drawn top-down with the FRONT at the top; every colour is a CSS variable set by `.cv-veh` (components.css). */
const SIL: Record<VehicleKind, { h: number; body: ReactNode }> = {
  truck: {
    h: 60,
    body: (
      <>
        <rect x="5" y="2" width="14" height="15" rx="4" className="cv-veh__body" />
        <rect x="7" y="4" width="10" height="5" rx="2" className="cv-veh__glass" />
        <rect x="3" y="19" width="18" height="39" rx="2.5" className="cv-veh__body2" />
        <path d="M6 24h12M6 32h12M6 40h12M6 48h12" className="cv-veh__line" />
      </>
    ),
  },
  semi: {
    h: 78,
    body: (
      <>
        <rect x="5" y="2" width="14" height="15" rx="4" className="cv-veh__body" />
        <rect x="7" y="4" width="10" height="5" rx="2" className="cv-veh__glass" />
        <rect x="10" y="17" width="4" height="5" className="cv-veh__dark" />
        <rect x="3" y="22" width="18" height="54" rx="2.5" className="cv-veh__body2" />
        <path d="M6 28h12M6 38h12M6 48h12M6 58h12M6 68h12" className="cv-veh__line" />
      </>
    ),
  },
  van: {
    h: 44,
    body: (
      <>
        <rect x="4" y="2" width="16" height="40" rx="5" className="cv-veh__body" />
        <rect x="6" y="4" width="12" height="7" rx="2.5" className="cv-veh__glass" />
        <rect x="6" y="14" width="12" height="24" rx="2" className="cv-veh__body2" />
        <path d="M8 20h8M8 26h8M8 32h8" className="cv-veh__line" />
      </>
    ),
  },
  pickup: {
    h: 50,
    body: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="5" className="cv-veh__body" />
        <rect x="6" y="4" width="12" height="6" rx="2" className="cv-veh__glass" />
        <rect x="6" y="12" width="12" height="4" rx="1.5" className="cv-veh__glass" />
        <rect x="4" y="24" width="16" height="24" rx="2" className="cv-veh__body2" />
        <rect x="6.5" y="26.5" width="11" height="19" rx="1.5" className="cv-veh__dark" />
      </>
    ),
  },
  tanker: {
    h: 66,
    body: (
      <>
        <rect x="5" y="2" width="14" height="15" rx="4" className="cv-veh__body" />
        <rect x="7" y="4" width="10" height="5" rx="2" className="cv-veh__glass" />
        <rect x="3" y="19" width="18" height="44" rx="9" className="cv-veh__body2" />
        <path d="M3 30h18M3 41h18M3 52h18" className="cv-veh__line" />
        <rect x="9.5" y="34" width="5" height="6" rx="1.5" className="cv-veh__dark" />
      </>
    ),
  },
  bus: {
    h: 64,
    body: (
      <>
        <rect x="3" y="2" width="18" height="60" rx="5" className="cv-veh__body" />
        <rect x="5" y="4" width="14" height="6" rx="2.5" className="cv-veh__glass" />
        <path d="M6 15h12M6 22h12M6 29h12M6 36h12M6 43h12M6 50h12" className="cv-veh__glass-line" />
        <rect x="8.5" y="18" width="7" height="6" rx="1.5" className="cv-veh__body2" />
        <rect x="8.5" y="38" width="7" height="6" rx="1.5" className="cv-veh__body2" />
      </>
    ),
  },
  car: {
    h: 40,
    body: (
      <>
        <rect x="4" y="2" width="16" height="36" rx="7" className="cv-veh__body" />
        <rect x="6" y="6" width="12" height="7" rx="3" className="cv-veh__glass" />
        <rect x="7" y="16" width="10" height="9" rx="2.5" className="cv-veh__body2" />
        <rect x="6" y="28" width="12" height="5" rx="2.5" className="cv-veh__glass" />
      </>
    ),
  },
};

const wheels = (h: number) => (
  <>
    {[10, h - 20].map(y => (
      <g key={y}>
        <rect x="1" y={y} width="3" height="8" rx="1.2" className="cv-veh__tyre" />
        <rect x="20" y={y} width="3" height="8" rx="1.2" className="cv-veh__tyre" />
      </g>
    ))}
  </>
);

const GLYPH: Record<VehicleKind, typeof Truck> = {
  truck: Truck,
  semi: Container,
  van: Package,
  pickup: Truck,
  tanker: Fuel,
  bus: Bus,
  car: CarFront,
};

/**
 * One vehicle on the map, in the operator's chosen style. `--h` (degrees, already corrected for the map bearing) is set
 * on the wrapper by the layer every frame; the state class (`is-moving`, …) drives colour, glow and pulse in CSS.
 */
export default function VehicleIcon({
  kind,
  state,
  iconStyle,
  selected,
  label,
}: {
  kind: VehicleKind;
  state: VehicleState;
  iconStyle: VehicleIconStyle;
  selected: boolean;
  label: string;
}) {
  const cls = `cv-veh cv-veh--${iconStyle} is-${state}${selected ? ' is-selected' : ''}`;

  if (iconStyle === 'silhouette') {
    const { h, body } = SIL[kind];

    return (
      <div className={cls} role="img" aria-label={label}>
        <span className="cv-veh__halo" aria-hidden />
        <svg
          className="cv-veh__svg"
          viewBox={`0 0 24 ${h}`}
          width={24 * 0.9}
          height={h * 0.9}
          aria-hidden
        >
          {wheels(h)}
          {body}
          <circle cx="7" cy="1.6" r="1.4" className="cv-veh__lamp" />
          <circle cx="17" cy="1.6" r="1.4" className="cv-veh__lamp" />
        </svg>
      </div>
    );
  }

  const Glyph = GLYPH[kind];

  return (
    <div className={cls} role="img" aria-label={label}>
      <span className="cv-veh__halo" aria-hidden />
      <span className="cv-veh__disc" aria-hidden>
        <Glyph size={iconStyle === 'badge' ? 19 : 17} strokeWidth={2.2} />
      </span>
      <span className="cv-veh__chev" aria-hidden />
    </div>
  );
}
