import type {
  MapBusLaneFeatureCollection,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import { lazy, type ReactNode, Suspense } from "react";
import { createMapLibrePreloader, loadMapLibre } from "@/components/route/load-maplibre";
import {
  featureStyle,
  type NetworkView,
  periodSpeed,
  viewEncoding,
} from "@/components/route/network-map-model";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";

// Compat re-exports: the period model moved into network-map-model.
export {
  type MapPeriod,
  PERIOD_HOURS,
  periodSpeed,
} from "@/components/route/network-map-model";

const loadNetworkMapLibreComponent = () =>
  import("./NetworkMapLibre.map.js").then((module) => ({ default: module.NetworkMapLibreMap }));

const NetworkMapLibreMap = lazy(loadNetworkMapLibreComponent);

const startNetworkMapPreload = createMapLibrePreloader({
  available: () => typeof window !== "undefined" && typeof document !== "undefined",
  loadComponent: loadNetworkMapLibreComponent,
  loadVendor: loadMapLibre,
});

/** Browser-only performance hint. Callers must not await it as route data. */
export function preloadNetworkMap(): void {
  startNetworkMapPreload();
}

export function networkMapAriaLabel({
  collection,
  view,
  selectedRouteId,
}: Pick<NetworkMapLibreProps, "collection" | "view" | "selectedRouteId">): string {
  const encoding = viewEncoding(view);
  const measure =
    encoding === "delay"
      ? "rider-delay exposure"
      : encoding === "delta"
        ? `${view.period.toUpperCase()} peak speed compared with all day`
        : `${view.period === "all" ? "all-day" : `${view.period.toUpperCase()} peak`} speed`;
  const selected = collection.features.find(
    (feature) => feature.properties.routeId === selectedRouteId,
  );
  const routeCount = collection.features.length;
  return `NYC bus network ${measure} map showing ${routeCount} ${routeCount === 1 ? "route" : "routes"}${
    selected === undefined ? "" : `; ${selected.properties.label} highlighted`
  }.`;
}

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
  /** Lazy selected-route segment artifact; null keeps the citywide map usable. */
  routeSegments?: MapRouteSegmentFeatureCollection | null;
  /** Exact stable spine identity. Selection emphasis never replaces source data. */
  selectedSegmentId?: string | null;
  selectedRouteId: string | null;
  // A route without usable geometry has no geographic anchor and cannot be pinned.
  onSelectRoute?: (routeId: string, lngLat: readonly [number, number] | null) => void;
  onClearSelection?: () => void;
  popup: NetworkMapPopupState | null;
  /** Dynamic map-region label supplied by the page; a truthful fallback is derived if omitted. */
  ariaLabel?: string;
  /** IDs for the page's live summary and keyboard-equivalent route list. */
  ariaDescribedBy?: string;
};

export function NetworkMapLibre(props: NetworkMapLibreProps) {
  const ariaLabel = props.ariaLabel ?? networkMapAriaLabel(props);
  const resolvedProps = { ...props, ariaLabel };
  const fallback = <NetworkMapStatic {...resolvedProps} />;
  return (
    <Suspense fallback={fallback}>
      <NetworkMapLibreMap {...resolvedProps} fallback={fallback} />
    </Suspense>
  );
}

function NetworkMapStatic({
  collection,
  view,
  routeSegments = null,
  selectedSegmentId = null,
  selectedRouteId,
  popup,
  ariaLabel,
  ariaDescribedBy,
}: NetworkMapLibreProps) {
  const width = 980;
  const height = 640;
  const padding = 24;
  const bounds = networkBounds(collection);
  if (bounds === null) {
    return (
      <section
        className="flex h-full min-h-[320px] items-center justify-center bg-[var(--bp-color-paper-deep)] text-[12.5px] text-[var(--bp-color-ink-55)]"
        aria-label={ariaLabel ?? networkMapAriaLabel({ collection, view, selectedRouteId })}
        aria-describedby={ariaDescribedBy}
      >
        Network geometry is unavailable.
      </section>
    );
  }
  const project = projector(bounds, { width, height, padding });
  // Paint order mirrors the interactive map: neutral routes first, urgency on top.
  const ordered = collection.features
    .map((feature) => ({ feature, style: featureStyle(feature, view) }))
    .sort((left, right) => left.style.sortKey - right.style.sortKey);
  return (
    <section
      className="relative h-full min-h-[320px]"
      aria-label={ariaLabel ?? networkMapAriaLabel({ collection, view, selectedRouteId })}
      aria-describedby={ariaDescribedBy}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-full w-full bg-[var(--bp-color-card)]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        focusable="false"
      >
        <title>{ariaLabel ?? networkMapAriaLabel({ collection, view, selectedRouteId })}</title>
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
        {routeSegments?.features.map((feature) => {
          const selected =
            selectedSegmentId !== null && feature.properties.spineSegmentId === selectedSegmentId;
          const path = linePath(feature.geometry.coordinates, project);
          return (
            <g key={feature.id}>
              <path
                d={path}
                fill="none"
                stroke="var(--bp-color-card)"
                strokeWidth={selected ? 10 : 7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={path}
                fill="none"
                stroke={selected ? "var(--bp-color-accent)" : "var(--bp-color-ink)"}
                strokeWidth={selected ? 6 : 4}
                strokeOpacity={selected ? 1 : 0.72}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>
      {popup === null ? null : (
        <div className="absolute bottom-4 right-4 z-10 w-[292px] max-w-[calc(100%-32px)]">
          {popup.content}
        </div>
      )}
    </section>
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
