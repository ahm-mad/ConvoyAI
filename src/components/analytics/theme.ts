import { useTheme } from '@contexts/ThemeContext';

/**
 * Colours for the Fleet analytics widgets (flows/07, FLEET_ANALYTICS_DESIGN.md §0). Every categorical
 * slot below was run through the dataviz skill's validator against the REAL card surfaces
 * (`--color-surface-1`: #ffffff light / #0e1114 dark): lightness band, chroma floor, CVD separation
 * (adjacent pairs), normal-vision floor — all PASS in both modes; the light-mode contrast WARN on
 * slots 3–5 is covered by the relief channels every chart ships (legend + tooltip + "view as table").
 * Slot 1 is the brand blue (#0b7fb0 / #2c9fd0) in place of the reference blue; the rest is the
 * validated reference order. Status colours are the fixed status scale (never themed) and always come
 * with an icon or a label. Colour follows the ENTITY (fuel is always slot 1, cancelled is always
 * critical), never its rank in a list.
 */
export type VizMode = 'light' | 'dark';

const CATEGORICAL: Record<VizMode, string[]> = {
  light: ['#0b7fb0', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#2c9fd0', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** Fixed status scale (dataviz palette): good / warning / serious / critical. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** One-hue sequential ramp (heatmaps, magnitude), light → dark. */
export const SEQUENTIAL_BLUE = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
];

const SURFACE: Record<VizMode, string> = { light: '#ffffff', dark: '#0e1114' };
const GRID: Record<VizMode, string> = { light: '#e5e8eb', dark: '#1a1f24' };
const AXIS: Record<VizMode, string> = { light: '#838c94', dark: '#7c8692' };
const NEUTRAL: Record<VizMode, string> = { light: '#8b95a1', dark: '#6b7580' };
const NEUTRAL_SOFT: Record<VizMode, string> = { light: '#c9ced4', dark: '#2a3138' };

export interface VizColors {
  mode: VizMode;
  surface: string;
  grid: string;
  axis: string;
  neutral: string;
  neutralSoft: string;
  /** Categorical slot by 0-based index (fixed order, never cycled — fold the tail into "Other"). */
  series: (i: number) => string;
  fleetStatus: Record<'moving' | 'idle' | 'parked' | 'offline' | 'no_tracker', string>;
  tripStatus: Record<'completed' | 'in_progress' | 'planned' | 'cancelled', string>;
  severity: Record<'minor' | 'moderate' | 'severe', string>;
  cost: Record<'fuel' | 'maintenance' | 'driver' | 'tolls' | 'other', string>;
  bucket: Record<'overdue' | 'soon' | 'upcoming' | 'ok', string>;
}

export const buildVizColors = (mode: VizMode): VizColors => {
  const cat = CATEGORICAL[mode];

  return {
    mode,
    surface: SURFACE[mode],
    grid: GRID[mode],
    axis: AXIS[mode],
    neutral: NEUTRAL[mode],
    neutralSoft: NEUTRAL_SOFT[mode],
    series: i => cat[i % cat.length],
    fleetStatus: {
      moving: STATUS.good,
      idle: STATUS.warning,
      parked: cat[0],
      offline: STATUS.serious,
      no_tracker: NEUTRAL[mode],
    },
    tripStatus: {
      completed: STATUS.good,
      in_progress: cat[0],
      planned: NEUTRAL[mode],
      cancelled: STATUS.critical,
    },
    severity: { minor: NEUTRAL[mode], moderate: STATUS.warning, severe: STATUS.critical },
    cost: {
      fuel: cat[0],
      maintenance: cat[1],
      driver: cat[2],
      tolls: cat[3],
      other: NEUTRAL[mode],
    },
    bucket: {
      overdue: STATUS.critical,
      soon: STATUS.warning,
      upcoming: cat[0],
      ok: STATUS.good,
    },
  };
};

export const useVizColors = (): VizColors => {
  const { isLight } = useTheme();

  return buildVizColors(isLight ? 'light' : 'dark');
};
