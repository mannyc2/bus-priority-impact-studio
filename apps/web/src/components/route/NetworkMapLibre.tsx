import { lazy, Suspense } from "react";
import { speedToColor } from "@/components/route/maplibre-style";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeatureCollection } from "@/studio/api-client";

const NetworkMapLibreMap = lazy(() =>
  import("./NetworkMapLibre.map.js").then((module) => ({ default: module.NetworkMapLibreMap })),
);

export type NetworkMapLibreProps = {
  collection: NetworkMapFeatureCollection;
  context: RouteGeoContext | null;
  hour: number;
  lens: NetworkMapLens;
  hoveredRouteId: string | null;
  setHoveredRouteId: (routeId: string | null) => void;
  selectedRouteId: string | null;
};

export type NetworkMapLens = "speed" | "riders" | "lanes";

function NetworkMapSkeleton() {
  return (
    <div
      className="h-[640px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
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
  hour,
  lens,
  hoveredRouteId,
  selectedRouteId,
}: NetworkMapLibreProps) {
  const width = 980;
  const height = 640;
  const padding = 24;
  const bounds = networkBounds(collection);
  if (bounds === null) {
    return (
      <div className="flex h-[640px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] text-[12.5px] text-[var(--bp-color-ink-55)]">
        Network geometry is unavailable.
      </div>
    );
  }
  const project = projector(bounds, { width, height, padding });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto min-h-[640px] w-full rounded-[3px] bg-[var(--bp-color-card)]"
      role="img"
      aria-label="Citywide bus route speed map"
    >
      <rect width={width} height={height} fill="var(--bp-color-card)" />
      {collection.features.map((feature) => {
        const active =
          feature.properties.routeId === hoveredRouteId ||
          feature.properties.routeId === selectedRouteId;
        const hasFocus = hoveredRouteId !== null || selectedRouteId !== null;
        const speed = feature.properties.hours[hour] ?? feature.properties.currentMph;
        return (
          <g key={feature.properties.routeId} opacity={hasFocus && !active ? 0.28 : 1}>
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
                  {feature.properties.label} / {speed.toFixed(1)} mph
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
  speedMph: number,
): string {
  if (lens === "speed") return speedToColor(speedMph);
  if (lens === "lanes") return scaledOklch(feature.properties.laneCoverage, 0, 100, 155);
  return scaledOklch(feature.properties.dailyRiders, 0, 45_000, 252);
}

function scaledOklch(value: number, min: number, max: number, hue: number): string {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  const lightness = 0.78 - t * 0.28;
  const chroma = 0.065 + t * 0.075;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}
