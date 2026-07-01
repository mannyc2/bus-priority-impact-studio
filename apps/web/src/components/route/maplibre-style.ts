import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";

export const MAP_COLORS = {
  paper: "#f4f1ea",
  card: "oklch(0.99 0.007 75)",
  ink: "#16140f",
  ink70: "rgba(22, 20, 15, 0.7)",
  ink55: "rgba(22, 20, 15, 0.66)",
  ink40: "rgba(22, 20, 15, 0.4)",
  ink20: "rgba(22, 20, 15, 0.2)",
  ink10: "rgba(22, 20, 15, 0.1)",
  ink06: "rgba(22, 20, 15, 0.06)",
  rule: "rgba(22, 20, 15, 0.14)",
  bad: "oklch(0.52 0.16 28)",
  warn: "oklch(0.48 0.13 70)",
  good: "oklch(0.45 0.12 155)",
  accent: "oklch(0.42 0.13 252)",
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

export function segmentSpeedAtHour(segment: StudioSegment, hour: number): number {
  const severity = segment.hours[hour] ?? 0;
  return Math.max(2, segment.scheduledMph - severity * 4.2);
}

export function routeAverageSpeedAtHour(
  route: StudioRoute,
  segments: readonly StudioSegment[],
  hour: number,
): number {
  if (segments.length === 0) return route.weightedAvgSpeed;
  let weighted = 0;
  let totalWeight = 0;
  for (const segment of segments) {
    const weight = Math.max(1, segment.riderHours);
    weighted += segmentSpeedAtHour(segment, hour) * weight;
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

export function formatMapHour(hour: number): string {
  const suffix = hour < 12 || hour === 24 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

export function hourTag(hour: number): "AM peak" | "Midday" | "PM peak" | "Shoulder" | "Off-peak" {
  if (hour >= 7 && hour <= 9) return "AM peak";
  if (hour >= 16 && hour <= 19) return "PM peak";
  if (hour >= 10 && hour <= 15) return "Midday";
  if (hour < 6 || hour > 21) return "Off-peak";
  return "Shoulder";
}
