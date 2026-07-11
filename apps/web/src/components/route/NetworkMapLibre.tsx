import { lazy, Suspense } from "react";
import { MAP_COLORS, scaledMapColor, speedToColor } from "@/components/route/maplibre-style";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";

const NetworkMapLibreMap = lazy(() =>
  import("./NetworkMapLibre.map.js").then((module) => ({ default: module.NetworkMapLibreMap })),
);

export type NetworkMapLibreProps = {
  collection: NetworkMapFeatureCollection;
  context: RouteGeoContext | null;
  period: MapPeriod;
  lens: NetworkMapLens;
  hoveredRouteId: string | null;
  setHoveredRouteId: (routeId: string | null) => void;
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string) => void;
};

export type NetworkMapLens = "speed" | "riders" | "lanes";

export type MapPeriod = "all" | "am" | "pm";

export const PERIOD_HOURS: Record<MapPeriod, number[] | null> = {
  all: null, // use currentMph
  am: [7, 8, 9], // AM peak
  pm: [16, 17, 18, 19], // PM peak
};

export function periodSpeed(
  feature: NetworkMapFeature,
  period: MapPeriod,
): { value: number | null; observedHours: number; expectedHours: number } {
  const hours = PERIOD_HOURS[period];
  if (hours === null) {
    return { value: feature.properties.currentMph, observedHours: 1, expectedHours: 1 };
  }
  const observed = hours.flatMap((hour) => {
    const speed = feature.properties.hourlySpeedMph[hour];
    const traversals = feature.properties.hourlyTraversalCount[hour] ?? 0;
    return speed === null || speed === undefined || traversals <= 0 ? [] : [{ speed, traversals }];
  });
  const minimumHours = period === "am" ? 2 : 3;
  if (observed.length < minimumHours) {
    return { value: null, observedHours: observed.length, expectedHours: hours.length };
  }
  const traversals = observed.reduce((sum, row) => sum + row.traversals, 0);
  return {
    value: observed.reduce((sum, row) => sum + row.speed * row.traversals, 0) / traversals,
    observedHours: observed.length,
    expectedHours: hours.length,
  };
}

function NetworkMapSkeleton() {
  return (
    <div
      className="h-full min-h-[320px] animate-pulse bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
      aria-hidden
    />
  );
}

export function NetworkMapLibre(props: NetworkMapLibreProps) {
  const fallback = <NetworkMapStatic {...props} />;
  return (
    <Suspense fallback={<NetworkMapSkeleton />}>
      <NetworkMapLibreMap {...props} fallback={fallback} />
    </Suspense>
  );
}

function NetworkMapStatic({
  collection,
  period,
  lens,
  hoveredRouteId,
  selectedRouteId,
  onSelectRoute,
}: NetworkMapLibreProps) {
  const width = 980;
  const height = 640;
  const padding = 24;
  const bounds = networkBounds(collection);
  if (bounds === null) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-[var(--bp-color-paper-deep)] text-[12.5px] text-[var(--bp-color-ink-55)]">
        Network geometry is unavailable.
      </div>
    );
  }
  const project = projector(bounds, { width, height, padding });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full w-full bg-[var(--bp-color-card)]"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Citywide bus route speed map"
    >
      <rect width={width} height={height} fill="var(--bp-color-card)" />
      {collection.features.map((feature) => {
        const active =
          feature.properties.routeId === hoveredRouteId ||
          feature.properties.routeId === selectedRouteId;
        const hasFocus = hoveredRouteId !== null || selectedRouteId !== null;
        const speed = periodSpeed(feature, period).value;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: static fallback mirrors the map's click-through
          <g
            key={feature.properties.routeId}
            opacity={hasFocus && !active ? 0.28 : 1}
            style={onSelectRoute === undefined ? undefined : { cursor: "pointer" }}
            onClick={
              onSelectRoute === undefined
                ? undefined
                : () => onSelectRoute(feature.properties.routeId)
            }
          >
            {feature.geometry.coordinates.map((line, index) => (
              <path
                key={`${feature.properties.routeId}-${index}`}
                d={linePath(line, project)}
                fill="none"
                stroke={networkLensColor(feature, lens, speed)}
                strokeWidth={active ? 5 : feature.properties.sbs ? 3.4 : 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>
                  {feature.properties.label} /{" "}
                  {speed === null ? "No data" : `${speed.toFixed(1)} mph`}
                </title>
              </path>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function networkBounds(
  collection: NetworkMapFeatureCollection,
): [[number, number], [number, number]] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const feature of collection.features) {
    for (const line of feature.geometry.coordinates) {
      for (const [lon, lat] of line) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
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

function projector(
  bounds: [[number, number], [number, number]],
  frame: { width: number; height: number; padding: number },
) {
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const lonScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * lonScale, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerW = frame.width - frame.padding * 2;
  const innerH = frame.height - frame.padding * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = frame.padding + (innerW - spanX * scale) / 2;
  const offsetY = frame.padding + (innerH - spanY * scale) / 2;
  return ([lon, lat]: readonly [number, number]): [number, number] => [
    offsetX + (lon - minLon) * lonScale * scale,
    offsetY + (maxLat - lat) * scale,
  ];
}

function linePath(
  line: readonly (readonly [number, number])[],
  project: (coordinate: readonly [number, number]) => [number, number],
): string {
  return line
    .map((coordinate, index) => {
      const [x, y] = project(coordinate);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function networkLensColor(
  feature: NetworkMapFeatureCollection["features"][number],
  lens: NetworkMapLens,
  speedMph: number | null,
): string {
  if (lens === "speed") return speedMph === null ? MAP_COLORS.ink20 : speedToColor(speedMph);
  if (lens === "lanes") {
    return feature.properties.laneCoverage === null
      ? MAP_COLORS.ink20
      : scaledMapColor(feature.properties.laneCoverage, 0, 100, "lanes");
  }
  return feature.properties.dailyRiders === null
    ? MAP_COLORS.ink20
    : scaledMapColor(feature.properties.dailyRiders, 0, 45_000, "riders");
}
