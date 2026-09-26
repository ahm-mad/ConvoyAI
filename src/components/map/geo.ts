/** Circle polygon (metres) around a point — 72 segments is smooth at every zoom the map allows. Returns [lon, lat] pairs. */
export const circle = (lat: number, lon: number, radiusM: number, n = 72): [number, number][] => {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;

    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
};
