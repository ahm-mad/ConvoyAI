/** Circle polygon (metres) around a point — 72 segments is smooth at every zoom the map allows. Returns [lon, lat] pairs. */
export const circle = (lat: number, lon: number, radiusM: number, n = 72): [number, number][] => {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;

    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
};

const isCoord = (lat: unknown, lng: unknown) =>
  lat !== null &&
  lat !== undefined &&
  lng !== null &&
  lng !== undefined &&
  !Number.isNaN(Number(lat)) &&
  !Number.isNaN(Number(lng));

/** Every coordinate a trip route draws ([lat, lon]), in drawing order — used to know whether a trip has anything to show. */
export function routePoints(route: any): [number, number][] {
  if (!route) return [];

  const pts: [number, number][] = [];
  const add = (lat: unknown, lng: unknown) => {
    if (isCoord(lat, lng)) pts.push([Number(lat), Number(lng)]);
  };

  add(route.origin?.latitude, route.origin?.longitude);
  (route.stops || []).forEach((s: any) => add(s.yard?.latitude, s.yard?.longitude));
  add(route.destination?.latitude, route.destination?.longitude);
  (route.trail?.positions || []).forEach((p: any) => add(p.latitude, p.longitude));
  add(route.current_position?.latitude, route.current_position?.longitude);

  return pts;
}

const M_PER_DEG = 111_320;

/**
 * Distance in metres from a point to a polyline ([lon, lat] vertices), and the index of the segment it is nearest to.
 * Flat-earth projection around the point: exact enough for "is this zone next to the road" questions.
 */
export function distToPath(path: [number, number][], lon: number, lat: number) {
  const kx = M_PER_DEG * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  let best = Infinity;
  let at = 0;

  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][0] - lon) * kx;
    const ay = (path[i - 1][1] - lat) * M_PER_DEG;
    const bx = (path[i][0] - lon) * kx;
    const by = (path[i][1] - lat) * M_PER_DEG;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + dx * t, ay + dy * t);

    if (d < best) {
      best = d;
      at = i;
    }
  }

  return { m: best, at };
}

/** Flat-earth distance in metres between two [lon, lat] points (fine below ~50 km). */
export const flatM = (a: [number, number], b: [number, number]) =>
  Math.hypot(
    (b[0] - a[0]) * M_PER_DEG * Math.max(0.2, Math.cos((a[1] * Math.PI) / 180)),
    (b[1] - a[1]) * M_PER_DEG
  );
