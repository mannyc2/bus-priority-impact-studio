import type { MapBusLaneFeatureCollection } from "@bp/domain/maps";
import { lazy, type ReactNode, Suspense } from "react";
import { featureStyle, type NetworkView, periodSpeed } from "@/components/route/network-map-model";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";

// Compat re-exports: the period model moved into network-map-model.
export {
  type MapPeriod,
  PERIOD_HOURS,
  periodSpeed,
} from "@/components/route/network-map-model";

const NetworkMapLibreMap = lazy(() =>
  import("./NetworkMapLibre.map.js").then((module) => ({ default: module.NetworkMapLibreMap })),
);

export type NetworkMapPopupState = {
  anchor: readonly [number, number];
  content: ReactNode;
};

export type NetworkBadge = {
  routeId: string;
  label: string;
  sbs: boolean;
  lngLat: readonly [number, number];
};

export type NetworkMapLibreProps = {
  collection: NetworkMapFeatureCollection;
  context: RouteGeoContext | null;
  view: NetworkView;
  badges: readonly NetworkBadge[];
  busLanes: MapBusLaneFeatureCollection | null;
  showLanes: boolean;
  selectedRouteId: string | null;
  // A route without usable geometry has no geographic anchor and cannot be pinned.
  onSelectRoute?: (routeId: string, lngLat: readonly [number, number] | null) => void;
  onClearSelection?: () => void;
  popup: NetworkMapPopupState | null;
};

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

function NetworkMapStatic({ collection, view, selectedRouteId, popup }: NetworkMapLibreProps) {
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
  // Paint order mirrors the interactive map: neutral routes first, urgency on top.
  const ordered = collection.features
    .map((feature) => ({ feature, style: featureStyle(feature, view) }))
    .sort((left, right) => left.style.sortKey - right.style.sortKey);
  return (
    <div className="relative h-full min-h-[320px]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-full w-full bg-[var(--bp-color-card)]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          view.lens === "delay"
            ? "Citywide bus route rider-delay map"
            : "Citywide bus route speed map"
        }
      >
        <rect width={width} height={height} fill="var(--bp-color-card)" />
        {ordered.map(({ feature, style }) => {
          const active = feature.properties.routeId === selectedRouteId;
          const hasFocus = selectedRouteId !== null;
          const speed = periodSpeed(feature, view.period).value;
          return (
            <g key={feature.properties.routeId} opacity={hasFocus && !active ? 0.28 : 1}>
              {feature.geometry.coordinates.map((line, index) => (
                <path
                  key={`${feature.properties.routeId}-${index}`}
                  d={linePath(line, project)}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={active ? 5 : feature.properties.sbs ? 3.2 : 2.2}
                  strokeDasharray={style.noData ? "5 5" : undefined}
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
      {popup === null ? null : (
        <div className="absolute bottom-4 right-4 z-10 w-[292px] max-w-[calc(100%-32px)]">
          {popup.content}
        </div>
      )}
    </div>
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

export type { NetworkMapFeature };
