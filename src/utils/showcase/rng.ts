/** Deterministic pseudo-random helpers so the showcase data is identical on every load. */
export const makeRng = (seed: number) => {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number) => next() * (max - min) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    /** Weighted pick: [[value, weight], …]. */
    weighted: <T>(pairs: readonly (readonly [T, number])[]): T => {
      const total = pairs.reduce((a, [, w]) => a + w, 0);
      let r = next() * total;

      for (const [v, w] of pairs) {
        r -= w;
        if (r <= 0) return v;
      }

      return pairs[pairs.length - 1][0];
    },
  };
};

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const iso = (ms: number) => new Date(ms).toISOString();
export const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
