import type {
  MapBusLaneFeatureCollection,
  MapRouteSegmentFeature,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  loadMapLibre,
  type MapLibreGeoJSONSource,
  type MapLibreMap,
  type MapLibreMapLayerMouseEvent,
  resetMapLibreLoader,
} from "@/components/route/load-maplibre";
import { type MapRuntimeMap, startMapLibreRuntime } from "@/components/route/maplibre-runtime";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";
import { boundsOf, MAP_COLORS, mapBaseStyle, NYC_MAP_BOUNDS, speedToColor } from "./maplibre-style";
import { BUS_LANE_COLOR } from "./network-map-model";

type Position = [number, number];
type LineString = { type: "LineString"; coordinates: Position[] };
type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };
type Point = { type: "Point"; coordinates: Position };
type Feature<TGeometry, TProperties = Record<string, unknown>> = {
  type: "Feature";
  id?: string | number;
  geometry: TGeometry;
  properties: TProperties;
};
type FeatureCollection<TGeometry, TProperties = Record<string, unknown>> = {
  type: "FeatureCollection";
  features: Array<Feature<TGeometry, TProperties>>;
};

export type RouteMapLibreMapProps = {
  collection: MapRouteSegmentFeatureCollection;
  context: RouteGeoContext | null;
  route: StudioRoute;
  segments: readonly StudioSegment[];
  hoveredSegmentId: string | null;
  setHoveredSegmentId: (segmentId: string | null) => void;
  /** Exact current studio segment id; presentation only (feature-state). */
  pinnedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
  /** Dims segments outside the active direction filter. */
  activeDirection: "all" | "NB" | "SB" | "EB" | "WB";
  showLanes: boolean;
  /** Published NYC DOT bus-lane geometry (loaded lazily by the section). */
  busLanes: MapBusLaneFeatureCollection | null;
  compact?: boolean | undefined;
  fallback: ReactNode;
  onInteractiveAvailabilityChange?: ((available: boolean) => void) | undefined;
};

type SegmentMapProperties = {
  featureSegmentId: string;
  studioSegmentId: string;
  label: string;
  direction: string;
  from: string;
  to: string;
  speedMph: number;
  color: string;
  detailJoinStatus: "available" | "unavailable";
};

const LAND_SOURCE = "bp-route-land";
const SEGMENT_SOURCE = "bp-route-segments";
const STOP_SOURCE = "bp-route-stops";
const LANES_SOURCE = "bp-route-lanes";
const CASING_LAYER = "bp-route-casing";
const LANES_LAYER = "bp-route-lanes";
const LINES_LAYER = "bp-route-lines";
const PIN_RING_LAYER = "bp-route-pin-ring";
const HIT_LAYER = "bp-route-hit";

/** Effect-schema collections are readonly; MapLibre wants mutable GeoJSON. */
function laneFeatureCollection(
  lanes: MapBusLaneFeatureCollection | null,
): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features:
      lanes?.features.map((feature) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: feature.geometry.coordinates.map(([lon, lat]) => [lon, lat] as Position),
        },
        properties: {},
      })) ?? [],
  };
}

function lineStringGeometry(geometry: MapRouteSegmentFeature["geometry"]): LineString {
  return {
    type: "LineString",
    coordinates: geometry.coordinates.map(([lon, lat]) => [lon, lat]),
  };
}

/** Presentation state (hover/pin/direction dim) lives in feature-state, so
 * this collection changes only when the served data changes — never on
 * interaction (plan 081 step 3: no hover-time setData). */
function routeSegmentCollection(input: {
  collection: MapRouteSegmentFeatureCollection;
  route: StudioRoute;
  segments: readonly StudioSegment[];
}): FeatureCollection<LineString, SegmentMapProperties> {
  const segmentsById = new Map(input.segments.map((segment) => [segment.id, segment]));

  return {
    type: "FeatureCollection",
    features: input.collection.features.map((feature) => {
      const studioSegmentId = feature.properties.studioSegmentId;
      const segment = segmentsById.get(studioSegmentId) ?? null;
      const speedMph =
        segment === null
          ? (feature.properties.averageSpeedMph ?? input.route.weightedAvgSpeed)
          : segment.speedMph;
      const from = segment?.from ?? feature.properties.startStopName ?? "Segment start";
      const to = segment?.to ?? feature.properties.endStopName ?? "Segment end";
      return {
        type: "Feature",
        id: String(feature.id),
        geometry: lineStringGeometry(feature.geometry),
        properties: {
          featureSegmentId: feature.properties.segmentId,
          studioSegmentId,
          label: `${from} to ${to}`,
          direction: segment?.direction ?? feature.properties.directionId,
          from,
          to,
          speedMph,
          color: speedToColor(speedMph),
          detailJoinStatus: segment === null ? "unavailable" : "available",
        },
      };
    }),
  };
}

function stopCollection(
  segmentCollection: FeatureCollection<LineString, SegmentMapProperties>,
): FeatureCollection<Point, { label: string }> {
  const seenStops = new Map<string, Feature<Point, { label: string }>>();
  for (const feature of segmentCollection.features) {
    const coordinates = feature.geometry.coordinates;
    const ends = [
      { coordinate: coordinates[0], label: feature.properties.from },
      { coordinate: coordinates[coordinates.length - 1], label: feature.properties.to },
    ];
    for (const end of ends) {
      if (end.coordinate === undefined) continue;
      const key = `${end.coordinate[0].toFixed(5)},${end.coordinate[1].toFixed(5)}`;
      if (seenStops.has(key)) continue;
      seenStops.set(key, {
        type: "Feature",
        geometry: { type: "Point", coordinates: end.coordinate },
        properties: { label: end.label },
      });
    }
  }
  return { type: "FeatureCollection", features: [...seenStops.values()] };
}

function landCollection(context: RouteGeoContext | null): FeatureCollection<MultiPolygon> {
  return {
    type: "FeatureCollection",
    features:
      context?.features.map((feature) => ({
        type: "Feature" as const,
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: feature.geometry.coordinates.map((polygon) =>
            polygon.map((ring) => ring.map(([lon, lat]) => [lon, lat])),
          ),
        },
        properties: feature.properties ?? {},
      })) ?? [],
  };
}

function source(map: MapLibreMap, id: string): MapLibreGeoJSONSource | null {
  const found = map.getSource(id);
  return found === undefined ? null : (found as MapLibreGeoJSONSource);
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function RouteMapLibreMap({
  collection,
  context,
  route,
  segments,
  hoveredSegmentId,
  setHoveredSegmentId,
  pinnedSegmentId,
  onSegmentSelect,
  activeDirection,
  showLanes,
  busLanes,
  compact = false,
  fallback,
  onInteractiveAvailabilityChange,
}: RouteMapLibreMapProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<"runtime" | "unsupported" | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const segmentData = useMemo(
    () => routeSegmentCollection({ collection, route, segments }),
    [collection, route, segments],
  );
  const laneData = useMemo(() => laneFeatureCollection(busLanes), [busLanes]);
  const stopData = useMemo(() => stopCollection(segmentData), [segmentData]);
  const landData = useMemo(() => landCollection(context), [context]);
  const segmentIds = useMemo(
    () => segmentData.features.map((feature) => feature.properties.studioSegmentId),
    [segmentData],
  );
  const directionsById = useMemo(
    () =>
      new Map(
        segmentData.features.map((feature) => [
          feature.properties.studioSegmentId,
          feature.properties.direction,
        ]),
      ),
    [segmentData],
  );
  const unavailableDetailCount = useMemo(
    () =>
      segmentData.features.filter(
        (feature) => feature.properties.detailJoinStatus === "unavailable",
      ).length,
    [segmentData],
  );
  const minHeight = compact ? 300 : 460;

  // Latest interaction callbacks without re-initializing the map.
  const onSelectRef = useRef(onSegmentSelect);
  onSelectRef.current = onSegmentSelect;
  const setHoverRef = useRef(setHoveredSegmentId);
  setHoverRef.current = setHoveredSegmentId;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!supportsWebGl()) {
      setFailure("unsupported");
      onInteractiveAvailabilityChange?.(false);
      return;
    }
    const onMouseMove = (event: MapLibreMapLayerMouseEvent) => {
      const map = mapRef.current;
      const feature = event.features?.[0];
      const properties = feature?.properties as { studioSegmentId?: unknown } | undefined;
      const segmentId = properties?.studioSegmentId;
      if (map !== null && typeof segmentId === "string") {
        map.getCanvas().style.cursor = "pointer";
        setHoverRef.current(segmentId);
      }
    };
    const onMouseLeave = () => {
      const map = mapRef.current;
      if (map !== null) map.getCanvas().style.cursor = "";
      setHoverRef.current(null);
    };
    const onClick = (event: MapLibreMapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const properties = feature?.properties as { studioSegmentId?: unknown } | undefined;
      const segmentId = properties?.studioSegmentId;
      if (typeof segmentId === "string") onSelectRef.current(segmentId);
    };

    const controller = startMapLibreRuntime({
      loadVendor: loadMapLibre,
      resetVendor: resetMapLibreLoader,
      createMap: (maplibregl) => {
        const container = containerRef.current;
        if (container === null) throw new Error("Route map container is unavailable.");
        const map = new maplibregl.Map({
          container,
          style: mapBaseStyle(),
          attributionControl: false,
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          maxBounds: [[...NYC_MAP_BOUNDS[0]], [...NYC_MAP_BOUNDS[1]]],
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        return map as MapLibreMap & MapRuntimeMap;
      },
      onReady: (map) => {
        map.addSource(LAND_SOURCE, { type: "geojson", data: landData });
        map.addLayer({
          id: "bp-route-land",
          type: "fill",
          source: LAND_SOURCE,
          paint: { "fill-color": MAP_COLORS.card, "fill-outline-color": MAP_COLORS.ink20 },
        });
        map.addSource(SEGMENT_SOURCE, {
          type: "geojson",
          data: segmentData,
          promoteId: "studioSegmentId",
        });
        map.addLayer({
          id: CASING_LAYER,
          type: "line",
          source: SEGMENT_SOURCE,
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": 13,
            "line-opacity": ["case", ["boolean", ["feature-state", "dimmed"], false], 0.4, 1],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        // Painted bus lanes (comp r4/D12): the published DOT geometry as one
        // solid underlay between casing and route lines — laned stretches read
        // as a green rim, divergent lane streets as their own thin solid line.
        // No dasharray (fixed-pixel at every zoom), no blur.
        map.addSource(LANES_SOURCE, { type: "geojson", data: laneData });
        map.addLayer({
          id: LANES_LAYER,
          type: "line",
          source: LANES_SOURCE,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: showLanes ? "visible" : "none",
          },
          paint: {
            "line-color": BUS_LANE_COLOR,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 11, 16, 15],
            "line-opacity": 0.95,
          },
        });
        // Pinned ring beneath the line itself: accent halo via feature-state.
        map.addLayer({
          id: PIN_RING_LAYER,
          type: "line",
          source: SEGMENT_SOURCE,
          paint: {
            "line-color": MAP_COLORS.accent,
            "line-width": 16,
            "line-opacity": ["case", ["boolean", ["feature-state", "pinned"], false], 0.22, 0],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: LINES_LAYER,
          type: "line",
          source: SEGMENT_SOURCE,
          paint: {
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "pinned"], false],
              10,
              ["boolean", ["feature-state", "hovered"], false],
              9,
              7,
            ],
            "line-opacity": ["case", ["boolean", ["feature-state", "dimmed"], false], 0.25, 1],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addSource(STOP_SOURCE, { type: "geojson", data: stopData });
        map.addLayer({
          id: "bp-route-stops",
          type: "circle",
          source: STOP_SOURCE,
          paint: {
            "circle-radius": 3.2,
            "circle-color": MAP_COLORS.card,
            "circle-stroke-color": MAP_COLORS.ink70,
            "circle-stroke-width": 1.6,
          },
        });
        map.addLayer({
          id: HIT_LAYER,
          type: "line",
          source: SEGMENT_SOURCE,
          paint: { "line-color": "#000", "line-opacity": 0, "line-width": 22 },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        const bounds = boundsOf(collection);
        if (bounds !== null) map.fitBounds(bounds, { padding: 42, duration: 0 });
        map.on("mousemove", HIT_LAYER, onMouseMove);
        map.on("mouseleave", HIT_LAYER, onMouseLeave);
        map.on("click", HIT_LAYER, onClick);
        setReady(true);
        onInteractiveAvailabilityChange?.(true);
      },
      onFatal: (error) => {
        mapRef.current = null;
        setReady(false);
        setFailure("runtime");
        onInteractiveAvailabilityChange?.(false);
        if (import.meta.env.DEV) console.warn("Route MapLibre initialization failed.", error);
      },
      onRecoverableError: (error) => {
        if (import.meta.env.DEV) console.warn("Route MapLibre runtime warning.", error);
      },
      onCleanup: (map) => {
        map.off("mousemove", HIT_LAYER, onMouseMove);
        map.off("mouseleave", HIT_LAYER, onMouseLeave);
        map.off("click", HIT_LAYER, onClick);
        mapRef.current = null;
        setReady(false);
      },
    });

    return () => {
      controller.cleanup();
    };
  }, [retryAttempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, LAND_SOURCE)?.setData(landData);
  }, [landData, ready]);

  // setData only when the served data actually changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, SEGMENT_SOURCE)?.setData(segmentData);
    source(map, STOP_SOURCE)?.setData(stopData);
  }, [ready, segmentData, stopData]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, LANES_SOURCE)?.setData(laneData);
  }, [laneData, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready || map.getLayer(LANES_LAYER) === undefined) return;
    map.setLayoutProperty(LANES_LAYER, "visibility", showLanes ? "visible" : "none");
  }, [ready, showLanes]);

  // Presentation state: hover / pin / direction dim, all feature-state.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    for (const id of segmentIds) {
      const direction = directionsById.get(id);
      map.setFeatureState(
        { source: SEGMENT_SOURCE, id },
        {
          hovered: id === hoveredSegmentId,
          pinned: id === pinnedSegmentId,
          dimmed: activeDirection !== "all" && direction !== activeDirection,
        },
      );
    }
  }, [activeDirection, directionsById, hoveredSegmentId, pinnedSegmentId, ready, segmentIds]);

  if (failure !== null) {
    return (
      <div className="relative" style={{ minHeight }}>
        {fallback}
        {failure === "runtime" ? (
          <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2 text-[12px] text-[var(--bp-color-ink)] shadow-sm">
            <button
              type="button"
              className="font-semibold underline decoration-[var(--bp-color-rule)] underline-offset-2"
              onClick={() => {
                resetMapLibreLoader();
                setFailure(null);
                setRetryAttempt((attempt) => attempt + 1);
              }}
            >
              Retry interactive map
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative" style={{ minHeight }}>
      <section
        ref={containerRef}
        className="bp-bus-map overflow-hidden rounded-[3px] bg-[var(--bp-color-card)]"
        style={{ minHeight }}
        aria-label={`Interactive ${route.label} segment map; the segment list carries the same data`}
      />
      {unavailableDetailCount > 0 ? (
        <div className="absolute bottom-3 left-3 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2 text-[11.5px] text-[var(--bp-color-ink-70)] shadow-sm">
          Detail unavailable for {unavailableDetailCount} map
          {unavailableDetailCount === 1 ? " segment" : " segments"}.
        </div>
      ) : null}
    </div>
  );
}
