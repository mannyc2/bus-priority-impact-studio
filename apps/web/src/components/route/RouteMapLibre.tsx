import type {
  MapBusLaneFeatureCollection,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import { lazy, Suspense } from "react";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";

const RouteMapLibreMap = lazy(() =>
  import("./RouteMapLibre.map.js").then((module) => ({ default: module.RouteMapLibreMap })),
);

function RouteMapSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
      style={{ height }}
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
  pinnedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  activeDirection: "all" | "NB" | "SB" | "EB" | "WB";
  showLanes: boolean;
  busLanes: MapBusLaneFeatureCollection | null;
  compact?: boolean | undefined;
  onInteractiveAvailabilityChange?: ((available: boolean) => void) | undefined;
};

export function RouteMapLibre(props: RouteMapLibreProps) {
  const fallback = (
    <RouteGeoMap
      collection={props.collection}
      context={props.context}
      {...(props.pinnedSegmentId === null ? {} : { highlightId: props.pinnedSegmentId })}
    />
  );

  return (
    <Suspense fallback={<RouteMapSkeleton height={props.compact ? 300 : 460} />}>
      <RouteMapLibreMap {...props} fallback={fallback} />
    </Suspense>
  );
}
