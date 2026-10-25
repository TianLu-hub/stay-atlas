export type MapArea = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function filterByMapArea<T extends { lng: number; lat: number }>(
  hotels: T[],
  area: MapArea | null,
): T[] {
  if (area === null) return hotels;

  const { west, south, east, north } = area;
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    south > north ||
    south < -90 ||
    north > 90
  )
    return [];

  const rawSpan = east - west;
  const coversAllLongitudes = Math.abs(rawSpan) >= 360;
  // Compare eastward distances so wrapped and unwrapped map bounds agree.
  const span = ((rawSpan % 360) + 360) % 360;
  return hotels.filter(({ lng, lat }) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    if (lat < south || lat > north) return false;
    if (coversAllLongitudes) return true;
    const distanceFromWest = (((lng - west) % 360) + 360) % 360;
    return distanceFromWest <= span;
  });
}
