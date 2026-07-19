import type { MapRouteSegmentFeature, MapRouteSegmentFeatureCollection } from "@bp/domain/maps";

/**
 * Pure projection model for the route-detail geographic map. Takes the
 * precomputed route-segment GeoJSON artifact and produces SVG path data in a
 * fixed viewBox: equirectangular projection with latitude correction is
 * accurate enough at city scale.
 */

export type RouteGeoSegment = {
  id: string;
  d: string;
  speedMph: number | null;
  startStopName: string | null;
  endStopName: string | null;
  slowest: boolean;
};

export type RouteGeoLabelPoint = {
  x: number;
  y: number;
  label: string;
};

/** Land polygons from the borough-boundary context artifact (lon/lat rings). */
export type RouteGeoContext = {
  features: ReadonlyArray<{
    properties?: {
      boroName: string;
      labelPoint: readonly [number, number];
    };
    geometry: {
      type: "MultiPolygon";
      coordinates: ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number]>>>;
    };
  }>;
};

export type RouteGeoMapModel = {
  segments: RouteGeoSegment[];
  termini: RouteGeoLabelPoint[];
  stops: RouteGeoLabelPoint[];
  landPaths: string[];
  slowest: (RouteGeoLabelPoint & { speedMph: number }) | null;
};

function coordKey(coordinate: readonly [number, number]): string {
  return `${coordinate[0].toFixed(5)},${coordinate[1].toFixed(5)}`;
}

/** Source stop names sometimes double up ("SOUTH FERRY TERM/SOUTH FERRY TERM"). */
export function cleanStopName(name: string | null): string | null {
  if (name === null) return null;
  const [first, second] = name.split("/");
  if (first !== undefined && second !== undefined && first.trim() === second.trim()) {
    return first.trim();
  }
  return name;
}

function pickDirection(features: readonly MapRouteSegmentFeature[]): MapRouteSegmentFeature[] {
  const byDirection = new Map<string, MapRouteSegmentFeature[]>();
  for (const feature of features) {
    const group = byDirection.get(feature.properties.directionId) ?? [];
    group.push(feature);
    byDirection.set(feature.properties.directionId, group);
  }
  let best: MapRouteSegmentFeature[] = [];
  for (const group of byDirection.values()) {
    if (group.length > best.length) best = group;
  }
  return best;
}

export function routeGeoMapModel(
  collection: Pick<MapRouteSegmentFeatureCollection, "features">,
  {
    width,
    height,
    padding,
    context = null,
    displaySpeeds,
    marginPct = 0,
  }: {
    width: number;
    height: number;
    padding: number;
    context?: RouteGeoContext | null;
    displaySpeeds?: ReadonlyMap<string, number | null>;
    marginPct?: number;
  },
): RouteGeoMapModel | null {
  const features = pickDirection(collection.features);
  if (features.length === 0) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const feature of features) {
    for (const [lon, lat] of feature.geometry.coordinates) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  // Geographic margin so surrounding land/water shows around the route.
  const lonMargin = (maxLon - minLon) * marginPct;
  const latMargin = (maxLat - minLat) * marginPct;
  minLon -= lonMargin;
  maxLon += lonMargin;
  minLat -= latMargin;
  maxLat += latMargin;

  const lonScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * lonScale, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;

  const project = ([lon, lat]: readonly [number, number]): [number, number] => [
    offsetX + (lon - minLon) * lonScale * scale,
    offsetY + (maxLat - lat) * scale,
  ];

  // Land polygons, pre-filtered to rings that touch the visible window (the
  // SVG viewport clips overflow, so coarse bbox filtering is enough).
  const landPaths: string[] = [];
  if (context !== null) {
    const visible = ([lon, lat]: readonly [number, number]) =>
      lon >= minLon - 0.02 && lon <= maxLon + 0.02 && lat >= minLat - 0.02 && lat <= maxLat + 0.02;
    for (const feature of context.features) {
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) {
          if (!ring.some((coordinate) => visible(coordinate))) continue;
          const d = ring
            .map((coordinate, index) => {
              const [x, y] = project(coordinate);
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          landPaths.push(`${d} Z`);
        }
      }
    }
  }

  const featureSpeed = (feature: MapRouteSegmentFeature): number | null => {
    const studioSegmentId = feature.properties.studioSegmentId;
    return displaySpeeds === undefined
      ? feature.properties.averageSpeedMph
      : (displaySpeeds.get(studioSegmentId) ?? null);
  };
  const slowestFeature = features.reduce<MapRouteSegmentFeature | null>((acc, feature) => {
    const speed = featureSpeed(feature);
    if (speed === null) return acc;
    if (acc === null || speed < (featureSpeed(acc) ?? Number.POSITIVE_INFINITY)) {
      return feature;
    }
    return acc;
  }, null);

  const segments: RouteGeoSegment[] = features.map((feature) => ({
    id: feature.properties.studioSegmentId,
    d: feature.geometry.coordinates
      .map((coordinate, index) => {
        const [x, y] = project(coordinate);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
    speedMph: featureSpeed(feature),
    startStopName: cleanStopName(feature.properties.startStopName),
    endStopName: cleanStopName(feature.properties.endStopName),
    slowest:
      slowestFeature !== null &&
      feature.properties.studioSegmentId === slowestFeature.properties.studioSegmentId,
  }));

  // A stop that appears as exactly one segment endpoint is a terminus of the
  // direction's chain (loops produce none; branches may produce extras — cap 2).
  const endpointCounts = new Map<string, { count: number; label: string | null }>();
  for (const feature of features) {
    const coordinates = feature.geometry.coordinates;
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first === undefined || last === undefined) continue;
    const ends: Array<{ key: string; label: string | null }> = [
      { key: coordKey(first), label: feature.properties.startStopName },
      { key: coordKey(last), label: feature.properties.endStopName },
    ];
    for (const end of ends) {
      const entry = endpointCounts.get(end.key) ?? { count: 0, label: end.label };
      entry.count += 1;
      endpointCounts.set(end.key, entry);
    }
  }
  const termini: RouteGeoLabelPoint[] = [];
  const stops: RouteGeoLabelPoint[] = [];
  const seenStopKeys = new Set<string>();
  for (const feature of features) {
    const coordinates = feature.geometry.coordinates;
    for (const [index, coordinate] of [coordinates[0], coordinates[coordinates.length - 1]]
      .filter((c): c is [number, number] => c !== undefined)
      .entries()) {
      const key = coordKey(coordinate);
      if (seenStopKeys.has(key)) continue;
      const entry = endpointCounts.get(key);
      if (entry === undefined) continue;
      const label = cleanStopName(
        index === 0 ? feature.properties.startStopName : feature.properties.endStopName,
      );
      if (label === null) continue;
      seenStopKeys.add(key);
      const [x, y] = project(coordinate);
      if (entry.count === 1 && termini.length < 2 && !termini.some((t) => t.label === label)) {
        termini.push({ x, y, label });
      } else {
        stops.push({ x, y, label });
      }
    }
  }

  // Only call out the slowest stretch when it is actually slow — a healthy
  // route should not carry an alarm-colored callout.
  let slowest: RouteGeoMapModel["slowest"] = null;
  if (
    slowestFeature !== null &&
    featureSpeed(slowestFeature) !== null &&
    (featureSpeed(slowestFeature) ?? Number.POSITIVE_INFINITY) < 6.5
  ) {
    const coordinates = slowestFeature.geometry.coordinates;
    const middle = coordinates[Math.floor(coordinates.length / 2)];
    if (middle !== undefined) {
      const [x, y] = project(middle);
      slowest = {
        x,
        y,
        label: [
          cleanStopName(slowestFeature.properties.startStopName),
          cleanStopName(slowestFeature.properties.endStopName),
        ]
          .filter(Boolean)
          .join(" → "),
        speedMph: featureSpeed(slowestFeature) ?? 0,
      };
    }
  }

  return { segments, termini, stops, landPaths, slowest };
}

export function geoSpeedColor(speedMph: number | null): string {
  if (speedMph === null) return "var(--bp-color-ink-20)";
  if (speedMph < 5) return "var(--bp-color-bad)";
  if (speedMph < 6.5) return "var(--bp-color-warn)";
  return "var(--bp-color-good)";
}
