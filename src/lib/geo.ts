/** Geographic helpers shared by the server and the map UI. */

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Overlap depth in km between two circular catchments (0 when they do not overlap). */
export function circleOverlapKm(
  a: { lat: number; lng: number; radiusKm: number },
  b: { lat: number; lng: number; radiusKm: number },
): number {
  return Math.max(0, a.radiusKm + b.radiusKm - haversineKm(a, b));
}

export const RADIUS_PRESETS_KM = [1, 3, 5, 10, 15, 25] as const;

/**
 * Provider radius limits for point-radius targeting. Verified against provider
 * documentation at the time of writing; re-check when upgrading API versions.
 *  - Meta custom_locations: 1 km to 80 km.
 *  - Google Ads proximity: 1 km to 800 km (AutoSutra caps at 80 km for hyperlocal use).
 */
export const PROVIDER_RADIUS_LIMITS_KM = {
  meta: { min: 1, max: 80 },
  google: { min: 1, max: 80 },
} as const;

export const RADIUS_DISCLAIMER =
  "Radius targeting tells the ad platform where to focus delivery. Platforms infer location from signals such as device location and stated home city, so some people reached may be outside the selected radius, and not everyone inside it will see the ads.";
