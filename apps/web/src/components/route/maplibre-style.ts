import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";

export const MAP_COLORS = {
  paper: "#fafbfc",
  card: "#ffffff",
  ink: "#101418",
  ink70: "rgba(16, 20, 24, 0.72)",
  ink55: "rgba(16, 20, 24, 0.6)",
  ink40: "rgba(16, 20, 24, 0.42)",
  ink20: "rgba(16, 20, 24, 0.2)",
  ink10: "rgba(16, 20, 24, 0.1)",
  ink06: "rgba(16, 20, 24, 0.06)",
  rule: "rgba(16, 20, 24, 0.14)",
  bad: "oklch(0.52 0.16 28)",
  warn: "oklch(0.48 0.13 70)",
  good: "oklch(0.45 0.12 155)",
  accent: "#0039a6",
  water: "oklch(0.9 0.016 234)",
} as const;

type Oklch = readonly [number, number, number];

const SPEED_ANCHORS: ReadonlyArray<readonly [number, Oklch]> = [
  [3.3, [0.5, 0.165, 27]],
  [4.6, [0.55, 0.15, 38]],
  [5.6, [0.62, 0.135, 58]],
  [6.6, [0.67, 0.125, 78]],
  [7.8, [0.58, 0.12, 150]],
  [9.5, [0.6, 0.105, 162]],
];

function oklch([lightness, chroma, hue]: Oklch): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

export function speedToColor(speedMph: number | null | undefined): string {
  if (speedMph === null || speedMph === undefined || !Number.isFinite(speedMph)) {
    return MAP_COLORS.ink20;
  }
  const anchors = SPEED_ANCHORS;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return MAP_COLORS.ink20;
  if (speedMph <= first[0]) return oklch(first[1]);
  if (speedMph >= last[0]) return oklch(last[1]);

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index];
    const right = anchors[index + 1];
    if (left === undefined || right === undefined) continue;
    const [leftSpeed, leftColor] = left;
    const [rightSpeed, rightColor] = right;
    if (speedMph < leftSpeed || speedMph > rightSpeed) continue;
    const t = (speedMph - leftSpeed) / (rightSpeed - leftSpeed);
    return oklch([
      leftColor[0] + (rightColor[0] - leftColor[0]) * t,
      leftColor[1] + (rightColor[1] - leftColor[1]) * t,
      leftColor[2] + (rightColor[2] - leftColor[2]) * t,
    ]);
  }

  return MAP_COLORS.warn;
}

export function speedTier(speedMph: number): "bad" | "warn" | "good" {
  if (speedMph < 5) return "bad";
  if (speedMph < 6.5) return "warn";
  return "good";
}

export function segmentSpeedAtHour(segment: StudioSegment, hour: number): number | null {
  if (segment.scheduledMph === null) return null;
  const severity = segment.hours[hour] ?? 0;
  return Math.max(2, segment.scheduledMph - severity * 4.2);
}

export function routeAverageSpeedAtHour(
  route: StudioRoute,
  segments: readonly StudioSegment[],
  hour: number,
): number | null {
  if (route.scheduledMph === null) return null;
  if (segments.length === 0) return route.weightedAvgSpeed;
  let weighted = 0;
  let totalWeight = 0;
  for (const segment of segments) {
    const speed = segmentSpeedAtHour(segment, hour);
    if (speed === null) continue;
    const weight = Math.max(1, segment.riderHours);
    weighted += speed * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : route.weightedAvgSpeed;
}

export function boundsOf(
  collection: Pick<MapRouteSegmentFeatureCollection, "features">,
): [[number, number], [number, number]] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const feature of collection.features) {
    for (const [lon, lat] of feature.geometry.coordinates) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
