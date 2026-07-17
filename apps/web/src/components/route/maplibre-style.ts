import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import type { MapLibreStyleSpecification } from "@/components/route/load-maplibre";
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
  bad: "#b33830",
  warn: "#8a4c00",
  good: "#006836",
  accent: "#0039a6",
  water: "#d4e0e7",
} as const;

type Rgb = readonly [number, number, number];

const SPEED_ANCHORS = [
  [3.3, "#ae2e2a"],
  [4.6, "#b84a27"],
  [5.6, "#c16e21"],
  [6.6, "#bf8a2a"],
  [7.8, "#3d8e53"],
  [9.5, "#3a946d"],
] as const;

const NETWORK_COLOR_ENDPOINTS = {
  lanes: ["#97c4a5", "#00793d"],
  riders: ["#9abbe0", "#1364b0"],
} as const;

// Pan fence, not a viewport: MapLibre constrains the whole viewport inside
// maxBounds, so these must stay much wider than the route network (which spans
// roughly -74.25..-73.70, 40.50..40.93) or panning locks at citywide zooms.
export const NYC_MAP_BOUNDS = [
  [-74.8, 40.15],
  [-73.15, 41.2],
] as const;

export function mapBaseStyle(): MapLibreStyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": MAP_COLORS.water },
      },
    ],
  };
}

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateRgb(left: string, right: string, t: number): string {
  const from = hexToRgb(left);
  const to = hexToRgb(right);
  return rgbToHex([
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ]);
}

export function speedToColor(speedMph: number | null | undefined): string {
  if (speedMph === null || speedMph === undefined || !Number.isFinite(speedMph)) {
    return MAP_COLORS.ink20;
  }
  const anchors = SPEED_ANCHORS;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return MAP_COLORS.ink20;
  if (speedMph <= first[0]) return first[1];
  if (speedMph >= last[0]) return last[1];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index];
    const right = anchors[index + 1];
    if (left === undefined || right === undefined) continue;
    const [leftSpeed, leftColor] = left;
    const [rightSpeed, rightColor] = right;
    if (speedMph < leftSpeed || speedMph > rightSpeed) continue;
    const t = (speedMph - leftSpeed) / (rightSpeed - leftSpeed);
    return interpolateRgb(leftColor, rightColor, t);
  }

  return MAP_COLORS.warn;
}

export function scaledMapColor(
  value: number,
  min: number,
  max: number,
  scale: keyof typeof NETWORK_COLOR_ENDPOINTS,
): string {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  const [light, dark] = NETWORK_COLOR_ENDPOINTS[scale];
  return interpolateRgb(light, dark, t);
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
