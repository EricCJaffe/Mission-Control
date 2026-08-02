/**
 * Turns a stored GPS trace into something drawable, plus honest elevation.
 *
 * Routes are kept as raw lat/lon/alt points. Two things have to happen before
 * they're useful: project them into SVG space (latitude and longitude are not
 * interchangeable units — a degree of longitude shrinks as you move away from
 * the equator), and smooth the altitude, which is the noisiest channel a
 * consumer GPS produces.
 */

export type RoutePoint = { lat: number; lon: number; alt?: number; ts?: string; speed?: number };

export type RouteBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export function boundsOf(points: RoutePoint[]): RouteBounds | null {
  if (!points.length) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Projects points into an SVG viewport of the given size.
 *
 * Longitude is scaled by cos(latitude) so the route keeps its true shape — an
 * out-and-back at 30°N is about 13% narrower in real distance than the raw
 * degree span suggests, and ignoring that visibly stretches the map sideways.
 * The aspect ratio is preserved and the path centred, so a north-south route
 * doesn't get squashed to fill a wide box.
 */
export function projectRoute(
  points: RoutePoint[],
  width: number,
  height: number,
  padding = 8
): Array<{ x: number; y: number }> {
  const bounds = boundsOf(points);
  if (!bounds || points.length < 2) return [];

  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const spanX = Math.max((bounds.maxLon - bounds.minLon) * lonScale, 1e-9);
  const spanY = Math.max(bounds.maxLat - bounds.minLat, 1e-9);

  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  // One scale for both axes keeps the shape honest.
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = padding + (usableW - spanX * scale) / 2;
  const offsetY = padding + (usableH - spanY * scale) / 2;

  return points.map((p) => ({
    x: offsetX + (p.lon - bounds.minLon) * lonScale * scale,
    // SVG y grows downward; latitude grows north, so it inverts.
    y: offsetY + (bounds.maxLat - p.lat) * scale,
  }));
}

export function toSvgPath(projected: Array<{ x: number; y: number }>): string {
  if (projected.length < 2) return '';
  return projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

/**
 * Elevation gain, with the GPS noise taken out.
 *
 * Raw consumer-GPS altitude wanders by several metres between fixes even
 * standing still, and summing every positive delta turns that jitter into
 * enormous phantom climb — one imported route reported 425m of gain across
 * flat north Florida. Two defences: a moving average to damp the jitter, and a
 * threshold so only a sustained rise counts.
 */
export function elevationGain(
  points: RoutePoint[],
  opts: { windowSize?: number; thresholdM?: number } = {}
): { gain: number; loss: number } {
  const windowSize = opts.windowSize ?? 15;
  const threshold = opts.thresholdM ?? 3;

  const alts = points
    .map((p) => p.alt)
    .filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  if (alts.length < 2) return { gain: 0, loss: 0 };

  const smoothed = movingAverage(alts, windowSize);

  let gain = 0;
  let loss = 0;
  // Only commit a change once it exceeds the threshold, so small wobbles
  // never accumulate.
  let reference = smoothed[0];
  for (const value of smoothed) {
    const delta = value - reference;
    if (delta >= threshold) {
      gain += delta;
      reference = value;
    } else if (delta <= -threshold) {
      loss += -delta;
      reference = value;
    }
  }

  return { gain: Math.round(gain * 10) / 10, loss: Math.round(loss * 10) / 10 };
}

function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 1 || values.length <= windowSize) return values.slice();
  const half = Math.floor(windowSize / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += values[j];
    out.push(sum / (to - from));
  }
  return out;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in miles along the trace. */
export function routeDistanceMiles(points: RoutePoint[]): number {
  let metres = 0;
  for (let i = 1; i < points.length; i++) {
    metres += haversine(points[i - 1], points[i]);
  }
  return Math.round((metres / 1609.344) * 100) / 100;
}

function haversine(a: RoutePoint, b: RoutePoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
