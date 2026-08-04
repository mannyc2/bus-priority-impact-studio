import type {
  MapBusLaneFeatureCollection,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import { lazy, type ReactNode, Suspense } from "react";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";

const RouteMapLibreMap = lazy(() =>
  import("./RouteMapLibre.map.js").then((module) => ({ default: module.RouteMapLibreMap })),
);

function RouteMapSkeleton({ height }: { height: number }) {
  return (
    <div
      className={
        height === 380
          ? "h-[380px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none max-md:h-[320px]"
          : "h-[460px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none max-md:h-[320px]"
      }
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
  /** Active current/historical value keyed by exact current Studio segment ID. */
  displaySpeeds: ReadonlyMap<string, number | null>;
  showLanes: boolean;
  busLanes: MapBusLaneFeatureCollection | null;
  compact?: boolean | undefined;
  /** The one click surface: an anchored popup, never a parallel panel. */
  popup?: RouteMapPopupState | null | undefined;
  /** Clicking off every segment closes the popup, same as the network map. */
  onClearSelection?: (() => void) | undefined;
  onInteractiveAvailabilityChange?: ((available: boolean) => void) | undefined;
};

export type RouteMapPopupState = {
  anchor: readonly [number, number];
  content: ReactNode;
};

export function RouteMapLibre(props: RouteMapLibreProps) {
  const fallback = (
    <RouteGeoMap
      collection={props.collection}
      context={props.context}
      {...(props.pinnedSegmentId === null ? {} : { highlightId: props.pinnedSegmentId })}
      displaySpeeds={props.displaySpeeds}
      variant={props.compact ? "mini" : "full"}
    />
  );

  return (
    <Suspense fallback={<RouteMapSkeleton height={props.compact ? 380 : 460} />}>
      <RouteMapLibreMap {...props} fallback={fallback} />
    </Suspense>
  );
}
