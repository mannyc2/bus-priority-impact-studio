import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { lazy, Suspense } from "react";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";
import type { RouteMapLayerState } from "./RouteMapLibre.map";

export type { RouteMapLayerState } from "./RouteMapLibre.map";

const RouteMapLibreMap = lazy(() =>
  import("./RouteMapLibre.map.js").then((module) => ({ default: module.RouteMapLibreMap })),
);

function RouteMapSkeleton() {
  return (
    <div
      className="animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
      style={{ height: 560 }}
      aria-hidden
    />
  );
}

export type RouteMapLibreProps = {
  collection: MapRouteSegmentFeatureCollection;
  context: RouteGeoContext | null;
  route: StudioRoute;
  segments: readonly StudioSegment[];
  hoveredSegmentId: string | null;
  setHoveredSegmentId: (segmentId: string | null) => void;
  layers: RouteMapLayerState;
  highlightId?: string | undefined;
};

export function RouteMapLibre(props: RouteMapLibreProps) {
  const fallback = (
    <RouteGeoMap
      collection={props.collection}
      context={props.context}
      highlightId={props.highlightId}
    />
  );

  return (
    <Suspense fallback={<RouteMapSkeleton />}>
      <RouteMapLibreMap {...props} fallback={fallback} />
    </Suspense>
  );
}
