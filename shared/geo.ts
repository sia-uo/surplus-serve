const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres (Haversine formula). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Bounding box that fully contains a circle of `radiusKm` around a point.
 * Used as a cheap indexed SQL pre-filter before the exact Haversine check.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const cosLat = Math.max(Math.cos(toRad(lat)), 0.01);
  const dLng = radiusKm / (111.32 * cosLat);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Rough bounds of India (incl. islands) used to sanity-check coordinates. */
export function isInIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Google Maps directions link (opens the native app on phones, no API key needed). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
