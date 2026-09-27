import { token } from '@lib/design/tokens';

/**
 * Speed → colour for trails. Speeds are the API's km/h; the bands are only used to pick a colour (the legend shows
 * "Slow → Fast", never a number), so nothing here depends on the company's display units.
 *   slow < 25 · steady 25–50 · brisk 50–75 · fast 75+
 */
export const SPEED_BANDS = [25, 50, 75] as const;

/** Token names for the four bands, slow → fast. */
export const SPEED_TOKENS = [
  '--color-success',
  '--color-gold',
  '--color-brand',
  '--color-danger',
] as const;

/** MapLibre `step` expression colouring a line by a numeric feature property. */
export function speedColorExpr(prop = 'speed'): any {
  const [c0, c1, c2, c3] = SPEED_TOKENS.map(t => token(t));

  return [
    'step',
    ['coalesce', ['to-number', ['get', prop]], 0],
    c0,
    SPEED_BANDS[0],
    c1,
    SPEED_BANDS[1],
    c2,
    SPEED_BANDS[2],
    c3,
  ];
}
