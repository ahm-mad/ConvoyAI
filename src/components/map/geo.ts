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
