import "maplibre-gl/dist/maplibre-gl.css";
import type { MapBusLaneFeatureCollection } from "@bp/domain/maps";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadMapLibre,
  type MapLibreExpression,
  type MapLibreGeoJSONSource,
  type MapLibreMap,
  type MapLibreMapLayerMouseEvent,
  type MapLibreMapMouseEvent,
  type MapLibreModule,
  type MapLibrePopup,
  resetMapLibreLoader,
} from "@/components/route/load-maplibre";
import { type MapRuntimeMap, startMapLibreRuntime } from "@/components/route/maplibre-runtime";
import { MAP_COLORS, mapBaseStyle, NYC_MAP_BOUNDS } from "@/components/route/maplibre-style";
import type { NetworkBadge, NetworkMapLibreProps } from "@/components/route/NetworkMapLibre";
import {
  BUS_LANE_COLOR,
  createHoverIntent,
  featureStyle,
  type HoverIntent,
  type NetworkView,
} from "@/components/route/network-map-model";

type Position = [number, number];
type MultiLineString = { type: "MultiLineString"; coordinates: Position[][] };
type LineString = { type: "LineString"; coordinates: Position[] };
type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };
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

export type NetworkMapLibreMapProps = NetworkMapLibreProps & { fallback: ReactNode };

type NetworkLineProperties = {
  routeId: string;
  color: string;
  sortKey: number;
  noData: boolean;
  sbs: boolean;
};

type RouteSegmentLineProperties = {
  spineSegmentId: string | null;
};

const LAND_SOURCE = "bp-network-land";
const NETWORK_SOURCE = "bp-network-routes";
const GHOST_SOURCE = "bp-network-ghost";
const LANES_SOURCE = "bp-network-lanes";
const ROUTE_SEGMENT_SOURCE = "bp-network-route-segments";
const CASING_LAYER = "bp-network-casing";
const LINE_LAYER = "bp-network-lines";
const NODATA_LAYER = "bp-network-nodata";
const GHOST_LAYER = "bp-network-ghost";
const LANES_LAYER = "bp-network-lanes";
const ROUTE_SEGMENT_CASING_LAYER = "bp-network-route-segment-casing";
const ROUTE_SEGMENT_RING_LAYER = "bp-network-route-segment-ring";
const ROUTE_SEGMENT_LINE_LAYER = "bp-network-route-segment-lines";
const HIT_LAYER = "bp-network-hit";
const DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";
const DEFAULT_INSPECTOR_INSET = 360;
const FIT_PADDING = 28;
const FIT_DURATION_MS = 240;

// Hover/selection render through feature-state so pointer interaction never
// rebuilds the 50k-coordinate source; setData only runs on period/lens change.
const LINE_WIDTH_EXPRESSION: MapLibreExpression = [
  "case",
  ["boolean", ["feature-state", "active"], false],
  5.5,
  ["case", ["get", "sbs"], 3.2, 2.2],
];
const DEFAULT_LINE_OPACITY = 0.92;
const FOCUSED_LINE_OPACITY_EXPRESSION: MapLibreExpression = [
  "case",
  ["boolean", ["feature-state", "active"], false],
  DEFAULT_LINE_OPACITY,
  0.2,
];
const SORT_KEY_EXPRESSION: MapLibreExpression = ["get", "sortKey"];

type NetworkFocusMap = Pick<MapLibreMap, "setFeatureState" | "setPaintProperty">;

export type NetworkFocusController = {
  preview(routeId: string | null): void;
  focus(routeId: string | null): void;
  dispose(): void;
};

export type NetworkFocusPresentation = {
  mode: "focus" | "preview";
  routeId: string | null;
};

/** Resolve all map/list focus sources without conflating the durable route pin. */
export function resolveNetworkFocusPresentation(input: {
  focusedRouteId: string | null;
  hoveredRouteId: string | null;
  hoverDimEngaged: boolean;
  previewRouteId: string | null;
  selectedRouteId: string | null;
}): NetworkFocusPresentation {
  if (input.focusedRouteId !== null) {
    return { mode: "focus", routeId: input.focusedRouteId };
  }
  if (input.hoveredRouteId !== null) {
    return {
      mode: input.hoverDimEngaged ? "focus" : "preview",
      routeId: input.hoveredRouteId,
    };
  }
  if (input.previewRouteId !== null) {
    return { mode: "focus", routeId: input.previewRouteId };
  }
  if (input.selectedRouteId !== null) {
    return { mode: "focus", routeId: input.selectedRouteId };
  }
  return { mode: "preview", routeId: null };
}

function applyNetworkFocusPresentation(
  controller: NetworkFocusController,
  input: Parameters<typeof resolveNetworkFocusPresentation>[0],
): void {
  const presentation = resolveNetworkFocusPresentation(input);
  controller[presentation.mode](presentation.routeId);
}

/**
 * O(1) route focus: only the previous/new feature IDs change. Network-wide
 * dimming is one fixed set of layer paint updates, never one state write per
 * route and never a GeoJSON replacement.
 */
export function createNetworkFocusController(map: NetworkFocusMap): NetworkFocusController {
  let activeRouteId: string | null = null;
  let dimmed = false;

  const setActiveRoute = (routeId: string | null) => {
    if (routeId === activeRouteId) return;
    if (activeRouteId !== null) {
      map.setFeatureState({ source: NETWORK_SOURCE, id: activeRouteId }, { active: false });
    }
    if (routeId !== null) {
      map.setFeatureState({ source: NETWORK_SOURCE, id: routeId }, { active: true });
    }
    activeRouteId = routeId;
  };
  const setDimmed = (next: boolean) => {
    if (next === dimmed) return;
    dimmed = next;
    const opacity = next ? FOCUSED_LINE_OPACITY_EXPRESSION : DEFAULT_LINE_OPACITY;
    for (const layerId of [CASING_LAYER, NODATA_LAYER, LINE_LAYER]) {
      map.setPaintProperty(layerId, "line-opacity", opacity);
    }
  };
  const apply = (routeId: string | null, shouldDim: boolean) => {
    setActiveRoute(routeId);
    setDimmed(shouldDim && routeId !== null);
  };

  return {
    preview: (routeId) => apply(routeId, false),
    focus: (routeId) => apply(routeId, true),
    dispose: () => {
      activeRouteId = null;
      dimmed = false;
    },
  };
}

function selectedSegmentMatch(selectedSegmentId: string | null): MapLibreExpression | boolean {
  return selectedSegmentId === null ? false : ["==", ["get", "spineSegmentId"], selectedSegmentId];
}

/** Paint-only segment emphasis; selection changes never replace its source. */
export function applySelectedSegmentPresentation(
  map: Pick<MapLibreMap, "setPaintProperty">,
  selectedSegmentId: string | null,
): void {
  const selected = selectedSegmentMatch(selectedSegmentId);
  map.setPaintProperty(ROUTE_SEGMENT_CASING_LAYER, "line-width", ["case", selected, 10, 7]);
  map.setPaintProperty(ROUTE_SEGMENT_RING_LAYER, "line-opacity", ["case", selected, 0.22, 0]);
  map.setPaintProperty(ROUTE_SEGMENT_LINE_LAYER, "line-width", ["case", selected, 6, 4]);
}

// First-party label anchors: no external glyph server, so labels and route
// badges render as a DOM overlay projected through the map transform.
const BOROUGH_LABELS: ReadonlyArray<readonly [string, number, number, number]> = [
  ["MANHATTAN", -73.982, 40.775, -63],
  ["BROOKLYN", -73.944, 40.643, 0],
  ["QUEENS", -73.795, 40.715, 0],
  ["THE BRONX", -73.872, 40.853, 0],
  ["STATEN ISLAND", -74.146, 40.572, 0],
];
const WATER_LABELS: ReadonlyArray<readonly [string, number, number, number]> = [
  ["Hudson River", -74.022, 40.751, -75],
  ["East River", -73.926, 40.783, -38],
  ["Upper Bay", -74.052, 40.657, 0],
  ["Jamaica Bay", -73.873, 40.607, 0],
];

function networkFeatureCollection(input: {
  collection: NetworkMapLibreProps["collection"];
  view: NetworkView;
}): FeatureCollection<MultiLineString, NetworkLineProperties> {
  return {
    type: "FeatureCollection",
    features: input.collection.features.map((feature) => {
      const style = featureStyle(feature, input.view);
      return {
        type: "Feature",
        id: feature.id,
        // The served coordinates are immutable in this component. Reuse them
        // across lens/period recolors instead of copying 50k points merely to
        // attach display properties.
        geometry: feature.geometry as unknown as MultiLineString,
        properties: {
          routeId: feature.properties.routeId,
          color: style.color,
          sortKey: style.sortKey,
          noData: style.noData,
          sbs: feature.properties.sbs ?? false,
        },
      };
    }),
  };
}

export function routeSegmentFeatureCollection(
  segments: NetworkMapLibreProps["routeSegments"],
): FeatureCollection<LineString, RouteSegmentLineProperties> {
  return {
    type: "FeatureCollection",
    features:
      segments?.features.map((feature) => ({
        type: "Feature" as const,
        id: feature.id,
        geometry: feature.geometry as unknown as LineString,
        properties: {
          spineSegmentId:
            feature.properties.spineJoinStatus === "matched"
              ? feature.properties.spineSegmentId
              : null,
        },
      })) ?? [],
  };
}

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

function landCollection(context: NetworkMapLibreProps["context"]): FeatureCollection<MultiPolygon> {
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

function boundsOfNetwork(
  collection: NetworkMapLibreProps["collection"],
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

function boundsOfRouteSegments(
  segments: NetworkMapLibreProps["routeSegments"],
): [[number, number], [number, number]] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const feature of segments?.features ?? []) {
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

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export function resolveNetworkMapInspectorInset(input: {
  inspectorOpen: boolean;
  desktopViewport: boolean;
  inspectorInset?: number | undefined;
}): number {
  if (!input.inspectorOpen || !input.desktopViewport) return 0;
  return Math.max(0, input.inspectorInset ?? DEFAULT_INSPECTOR_INSET);
}

export function networkMapFitPadding(inspectorInset: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return {
    top: FIT_PADDING,
    right: FIT_PADDING + Math.max(0, inspectorInset),
    bottom: FIT_PADDING,
    left: FIT_PADDING,
  };
}

export function applyNetworkMapControlInset(
  map: Pick<MapLibreMap, "getContainer">,
  inspectorInset: number,
): void {
  const controls = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-bottom-right");
  if (controls !== null) controls.style.right = `${Math.max(0, inspectorInset)}px`;
}

export function networkMapFitDuration(animated: boolean, reducedMotion: boolean): number {
  return animated && !reducedMotion ? FIT_DURATION_MS : 0;
}

function fitMapBounds(
  map: Pick<MapLibreMap, "fitBounds">,
  bounds: [[number, number], [number, number]],
  inspectorInset: number,
  animated: boolean,
): void {
  map.fitBounds(bounds, {
    padding: networkMapFitPadding(inspectorInset),
    duration: networkMapFitDuration(animated, prefersReducedMotion()),
  });
}

type Rect = { x: number; y: number; w: number; h: number };

function intersects(a: Rect, b: Rect): boolean {
  return !(a.x > b.x + b.w || b.x > a.x + a.w || a.y > b.y + b.h || b.y > a.y + a.h);
}

/** Keep badges clear of the page's floating chrome (controls, note, legend). */
function overlayExclusions(width: number, height: number): Rect[] {
  return [
    { x: 0, y: 0, w: 340, h: 190 },
    { x: width - 320, y: 0, w: 320, h: 140 },
    { x: 0, y: height - 72, w: 660, h: 72 },
  ];
}

const BADGE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -13],
  [0, 13],
  [16, 0],
  [-16, 0],
  [14, -14],
  [-14, 14],
  [0, -26],
];

export function NetworkMapLibreMap({
  collection,
  context,
  view,
  badges,
  busLanes,
  showLanes,
  routeSegments = null,
  selectedSegmentId = null,
  selectedRouteId,
  focusedRouteId = null,
  previewRouteId = null,
  inspectorOpen = false,
  inspectorInset,
  fitCollectionKey,
  onSelectRoute,
  onClearSelection,
  popup,
  fallback,
  ariaLabel,
  ariaDescribedBy,
}: NetworkMapLibreMapProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const vendorRef = useRef<MapLibreModule | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const focusControllerRef = useRef<NetworkFocusController | null>(null);
  const hoverIntentRef = useRef<HoverIntent | null>(null);
  const previousDataRef = useRef<FeatureCollection<MultiLineString, NetworkLineProperties> | null>(
    null,
  );
  const previousSegmentDataRef = useRef<FeatureCollection<
    LineString,
    RouteSegmentLineProperties
  > | null>(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const selectedRouteIdRef = useRef(selectedRouteId);
  selectedRouteIdRef.current = selectedRouteId;
  const focusedRouteIdRef = useRef(focusedRouteId);
  focusedRouteIdRef.current = focusedRouteId;
  const previewRouteIdRef = useRef(previewRouteId);
  previewRouteIdRef.current = previewRouteId;
  const [desktopViewport, setDesktopViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches,
  );
  const desktopInspectorOpen = inspectorOpen && desktopViewport;
  const effectiveInspectorInset = resolveNetworkMapInspectorInset({
    inspectorOpen,
    desktopViewport,
    inspectorInset,
  });
  const effectiveInspectorInsetRef = useRef(effectiveInspectorInset);
  effectiveInspectorInsetRef.current = effectiveInspectorInset;
  const previousInspectorInsetRef = useRef(effectiveInspectorInset);
  const previousFitCollectionKeyRef = useRef(fitCollectionKey);
  const fittedRouteSegmentsRef = useRef<NetworkMapLibreProps["routeSegments"]>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<"runtime" | "unsupported" | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [popupNode] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const networkData = useMemo(
    () =>
      networkFeatureCollection({
        collection,
        view: { lens: view.lens, period: view.period, compare: view.compare },
      }),
    [collection, view.lens, view.period, view.compare],
  );
  const landData = useMemo(() => landCollection(context), [context]);
  const laneData = useMemo(() => laneFeatureCollection(busLanes), [busLanes]);
  const segmentData = useMemo(() => routeSegmentFeatureCollection(routeSegments), [routeSegments]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    const update = () => setDesktopViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!supportsWebGl()) {
      setFailure("unsupported");
      return;
    }
    let hoverIntent: HoverIntent;
    const syncPresentation = () => {
      const focusController = focusControllerRef.current;
      if (focusController === null) return;
      applyNetworkFocusPresentation(focusController, {
        focusedRouteId: focusedRouteIdRef.current,
        hoveredRouteId: hoverIntent.hovered(),
        hoverDimEngaged: hoverIntent.dimEngaged(),
        previewRouteId: previewRouteIdRef.current,
        selectedRouteId: selectedRouteIdRef.current,
      });
    };
    hoverIntent = createHoverIntent({
      applyActive: syncPresentation,
      applyFocus: syncPresentation,
    });
    hoverIntentRef.current = hoverIntent;
    const onMouseMove = (event: MapLibreMapLayerMouseEvent) => {
      const map = mapRef.current;
      if (map === null) return;
      const candidates = (event.features ?? []).flatMap((feature) => {
        const routeId = (feature.properties as { routeId?: unknown } | undefined)?.routeId;
        return typeof routeId === "string" ? [routeId] : [];
      });
      if (candidates.length === 0) return;
      map.getCanvas().style.cursor = "pointer";
      hoverIntent.move(
        candidates,
        focusedRouteIdRef.current !== null ||
          previewRouteIdRef.current !== null ||
          selectedRouteIdRef.current !== null,
      );
    };
    const onMouseLeave = () => {
      const map = mapRef.current;
      if (map === null) return;
      map.getCanvas().style.cursor = "";
      hoverIntent.leave();
    };
    const onClick = (event: MapLibreMapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const properties = feature?.properties as { routeId?: unknown } | undefined;
      const routeId = properties?.routeId;
      if (typeof routeId === "string") {
        onSelectRouteRef.current?.(routeId, [event.lngLat.lng, event.lngLat.lat]);
      }
    };
    const onBackgroundClick = (event: MapLibreMapMouseEvent) => {
      const map = mapRef.current;
      if (map === null || map.getLayer(HIT_LAYER) === undefined) return;
      if (map.queryRenderedFeatures(event.point, { layers: [HIT_LAYER] }).length === 0) {
        onClearSelectionRef.current?.();
      }
    };

    const controller = startMapLibreRuntime({
      loadVendor: loadMapLibre,
      resetVendor: resetMapLibreLoader,
      createMap: (maplibregl) => {
        const container = containerRef.current;
        if (container === null) throw new Error("Network map container is unavailable.");
        vendorRef.current = maplibregl;
        const map = new maplibregl.Map({
          container,
          style: mapBaseStyle(),
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          maxBounds: [[...NYC_MAP_BOUNDS[0]], [...NYC_MAP_BOUNDS[1]]],
        });
        mapRef.current = map;
        // Bottom-right keeps zoom clear of the insight note and search panel.
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 88, unit: "imperial" }),
          "bottom-right",
        );
        return map as MapLibreMap & MapRuntimeMap;
      },
      onReady: (map) => {
        map.addSource(LAND_SOURCE, { type: "geojson", data: landData });
        map.addLayer({
          id: "bp-network-land",
          type: "fill",
          source: LAND_SOURCE,
          paint: { "fill-color": MAP_COLORS.card, "fill-outline-color": MAP_COLORS.ink20 },
        });
        map.addSource(NETWORK_SOURCE, {
          type: "geojson",
          data: networkData,
          promoteId: "routeId",
        });
        map.addSource(GHOST_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource(LANES_SOURCE, { type: "geojson", data: laneData });
        map.addSource(ROUTE_SEGMENT_SOURCE, { type: "geojson", data: segmentData });
        map.addLayer({
          id: CASING_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          filter: ["!", ["get", "noData"]],
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": ["+", LINE_WIDTH_EXPRESSION, 2.6],
            "line-opacity": DEFAULT_LINE_OPACITY,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
            "line-sort-key": SORT_KEY_EXPRESSION,
          },
        });
        map.addLayer({
          id: NODATA_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          filter: ["get", "noData"],
          paint: {
            "line-color": ["get", "color"],
            "line-width": 1.8,
            "line-opacity": DEFAULT_LINE_OPACITY,
            "line-dasharray": [2, 2.4],
          },
          layout: { "line-cap": "butt", "line-join": "round" },
        });
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          filter: ["!", ["get", "noData"]],
          paint: {
            "line-color": ["get", "color"],
            "line-width": LINE_WIDTH_EXPRESSION,
            "line-opacity": DEFAULT_LINE_OPACITY,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
            "line-sort-key": SORT_KEY_EXPRESSION,
          },
        });
        map.addLayer({
          id: GHOST_LAYER,
          type: "line",
          source: GHOST_SOURCE,
          paint: {
            "line-color": ["get", "color"],
            "line-width": LINE_WIDTH_EXPRESSION,
            "line-opacity": 0,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
            "line-sort-key": SORT_KEY_EXPRESSION,
          },
        });
        // Bus-lane centerlines read as paint on the street: thin dashes over
        // the network, beneath interaction and badges.
        map.addLayer({
          id: LANES_LAYER,
          type: "line",
          source: LANES_SOURCE,
          layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
          paint: {
            "line-color": BUS_LANE_COLOR,
            "line-width": 1.5,
            "line-opacity": 0.95,
            "line-dasharray": [3, 4],
          },
        });
        const selectedSegment = selectedSegmentMatch(selectedSegmentId);
        map.addLayer({
          id: ROUTE_SEGMENT_CASING_LAYER,
          type: "line",
          source: ROUTE_SEGMENT_SOURCE,
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": ["case", selectedSegment, 10, 7],
            "line-opacity": 0.96,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: ROUTE_SEGMENT_RING_LAYER,
          type: "line",
          source: ROUTE_SEGMENT_SOURCE,
          paint: {
            "line-color": MAP_COLORS.accent,
            "line-width": 12,
            "line-opacity": ["case", selectedSegment, 0.22, 0],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: ROUTE_SEGMENT_LINE_LAYER,
          type: "line",
          source: ROUTE_SEGMENT_SOURCE,
          paint: {
            "line-color": MAP_COLORS.ink70,
            "line-width": ["case", selectedSegment, 6, 4],
            "line-opacity": 0.9,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: HIT_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          paint: { "line-color": "#000", "line-opacity": 0, "line-width": 18 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        focusControllerRef.current = createNetworkFocusController(map);
        syncPresentation();
        previousDataRef.current = networkData;
        previousSegmentDataRef.current = segmentData;
        fittedRouteSegmentsRef.current = routeSegments;
        const inset = effectiveInspectorInsetRef.current;
        previousInspectorInsetRef.current = inset;
        applyNetworkMapControlInset(map, inset);
        const bounds = boundsOfRouteSegments(routeSegments) ?? boundsOfNetwork(collection);
        if (bounds !== null) fitMapBounds(map, bounds, inset, false);
        map.on("mousemove", HIT_LAYER, onMouseMove);
        map.on("mouseleave", HIT_LAYER, onMouseLeave);
        map.on("click", HIT_LAYER, onClick);
        map.on("click", onBackgroundClick);
        setReady(true);
      },
      onFatal: (error) => {
        popupRef.current = null;
        focusControllerRef.current = null;
        vendorRef.current = null;
        mapRef.current = null;
        setReady(false);
        setFailure("runtime");
        if (import.meta.env.DEV) console.warn("Network MapLibre initialization failed.", error);
      },
      onRecoverableError: (error) => {
        if (import.meta.env.DEV) console.warn("Network MapLibre runtime warning.", error);
      },
      onCleanup: (map) => {
        map.off("mousemove", HIT_LAYER, onMouseMove);
        map.off("mouseleave", HIT_LAYER, onMouseLeave);
        map.off("click", HIT_LAYER, onClick);
        map.off("click", onBackgroundClick);
        hoverIntent.dispose();
        hoverIntentRef.current = null;
        focusControllerRef.current?.dispose();
        focusControllerRef.current = null;
        popupRef.current?.remove();
        popupRef.current = null;
        vendorRef.current = null;
        mapRef.current = null;
        previousDataRef.current = null;
        previousSegmentDataRef.current = null;
        fittedRouteSegmentsRef.current = null;
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

  // Recolor with a single short crossfade: the previous frame fades out on a
  // ghost layer while the new encoding paints underneath. Skipped under
  // reduced motion and on first paint.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    const network = source(map, NETWORK_SOURCE);
    if (network === null) return;
    const previous = previousDataRef.current;
    if (previous === networkData) return;
    previousDataRef.current = networkData;
    const ghost = source(map, GHOST_SOURCE);
    if (previous === null || ghost === null || prefersReducedMotion()) {
      network.setData(networkData);
      return;
    }
    ghost.setData(previous);
    map.setPaintProperty(GHOST_LAYER, "line-opacity-transition", { duration: 0, delay: 0 });
    map.setPaintProperty(GHOST_LAYER, "line-opacity", 0.92);
    network.setData(networkData);
    const frame = requestAnimationFrame(() => {
      if (mapRef.current !== map) return;
      map.setPaintProperty(GHOST_LAYER, "line-opacity-transition", { duration: 240, delay: 0 });
      map.setPaintProperty(GHOST_LAYER, "line-opacity", 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [networkData, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, LANES_SOURCE)?.setData(laneData);
  }, [laneData, ready]);

  // Selected-route geometry is replaced only when its lazy artifact changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready || previousSegmentDataRef.current === segmentData) return;
    previousSegmentDataRef.current = segmentData;
    source(map, ROUTE_SEGMENT_SOURCE)?.setData(segmentData);
  }, [ready, segmentData]);

  // Preserve user pan/zoom during ordinary data refreshes. Only an explicit
  // collection-fit key, newly available route geometry, or changed desktop
  // inspector occlusion asks the camera to move.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    const inspectorInsetChanged = previousInspectorInsetRef.current !== effectiveInspectorInset;
    const collectionFitRequested = previousFitCollectionKeyRef.current !== fitCollectionKey;
    const routeSegmentsReady =
      routeSegments !== null && fittedRouteSegmentsRef.current !== routeSegments;

    previousInspectorInsetRef.current = effectiveInspectorInset;
    previousFitCollectionKeyRef.current = fitCollectionKey;
    fittedRouteSegmentsRef.current = routeSegments;
    applyNetworkMapControlInset(map, effectiveInspectorInset);

    let bounds: [[number, number], [number, number]] | null = null;
    if (routeSegmentsReady) bounds = boundsOfRouteSegments(routeSegments);
    if (bounds === null && collectionFitRequested) bounds = boundsOfNetwork(collection);
    if (bounds === null && inspectorInsetChanged) {
      bounds = boundsOfRouteSegments(routeSegments) ?? boundsOfNetwork(collection);
    }
    if (bounds !== null) fitMapBounds(map, bounds, effectiveInspectorInset, true);
  }, [collection, effectiveInspectorInset, fitCollectionKey, ready, routeSegments]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    applySelectedSegmentPresentation(map, selectedSegmentId);
  }, [ready, selectedSegmentId]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready || map.getLayer(LANES_LAYER) === undefined) return;
    map.setLayoutProperty(LANES_LAYER, "visibility", showLanes ? "visible" : "none");
  }, [showLanes, ready]);

  useEffect(() => {
    const focusController = focusControllerRef.current;
    const hoverIntent = hoverIntentRef.current;
    if (focusController === null || hoverIntent === null || !ready) return;
    applyNetworkFocusPresentation(focusController, {
      focusedRouteId,
      hoveredRouteId: hoverIntent.hovered(),
      hoverDimEngaged: hoverIntent.dimEngaged(),
      previewRouteId,
      selectedRouteId,
    });
  }, [focusedRouteId, previewRouteId, ready, selectedRouteId]);

  // Borough/water labels and route badges live in a DOM overlay projected
  // through the map transform — no glyph server, no external origins.
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (map === null || overlay === null || !ready) return;
    const nodes: Array<{
      element: HTMLElement;
      lngLat: readonly [number, number];
      kind: "label" | "badge";
      rotation: number;
    }> = [];
    for (const [text, lon, lat, rotation] of WATER_LABELS) {
      const element = document.createElement("span");
      element.textContent = text;
      element.className =
        "absolute left-0 top-0 whitespace-nowrap text-[10px] italic text-[#93a9b8]";
      nodes.push({ element, lngLat: [lon, lat], kind: "label", rotation });
    }
    for (const [text, lon, lat, rotation] of BOROUGH_LABELS) {
      const element = document.createElement("span");
      element.textContent = text;
      element.className =
        "absolute left-0 top-0 whitespace-nowrap text-[10px] font-bold tracking-[3px] text-[rgba(16,20,24,0.48)]";
      nodes.push({ element, lngLat: [lon, lat], kind: "label", rotation });
    }
    const badgeNodes: Array<{
      element: HTMLElement;
      lngLat: readonly [number, number];
      w: number;
      h: number;
      offset: readonly [number, number] | null;
    }> = [];
    // While a route is pinned the popup is the focus; badges stand down so
    // they never paint over the card.
    for (const badge of popup === null && !desktopInspectorOpen ? badges : []) {
      if (badge.routeId === selectedRouteIdRef.current) continue;
      const element = document.createElement("span");
      element.textContent = badge.label;
      element.className =
        "absolute left-0 top-0 whitespace-nowrap rounded-[3px] px-[6px] py-[2px] text-[10px] font-bold leading-[13px] text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]";
      element.style.backgroundColor = badge.sbs ? "#0039a6" : "#101418";
      badgeNodes.push({ element, lngLat: badge.lngLat, w: 0, h: 0, offset: null });
    }
    overlay.replaceChildren(
      ...nodes.map((node) => node.element),
      ...badgeNodes.map((node) => node.element),
    );
    // Badge text never changes while mounted: measure once so per-frame work
    // stays write-only and never forces a layout pass mid-gesture.
    for (const node of badgeNodes) {
      node.w = node.element.offsetWidth;
      node.h = node.element.offsetHeight;
    }
    let width = overlay.clientWidth;
    let height = overlay.clientHeight;
    // Runs on every frame of a pan/zoom: badges follow their anchors under the
    // placement chosen at rest. Collision/visibility decisions are deferred to
    // `layout` so labels stop flapping in and out mid-gesture.
    const translate = () => {
      for (const node of nodes) {
        const point = map.project([node.lngLat[0], node.lngLat[1]]);
        const visible =
          point.x > -40 && point.x < width + 40 && point.y > -20 && point.y < height + 20;
        node.element.style.display = visible ? "" : "none";
        node.element.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%) rotate(${node.rotation}deg)`;
      }
      for (const node of badgeNodes) {
        if (node.offset === null) continue;
        const point = map.project([node.lngLat[0], node.lngLat[1]]);
        node.element.style.transform = `translate(${point.x + node.offset[0] - node.w / 2}px, ${
          point.y + node.offset[1] - node.h / 2
        }px)`;
      }
    };
    const layout = () => {
      width = overlay.clientWidth;
      height = overlay.clientHeight;
      const placed: Rect[] = [];
      const blocked = overlayExclusions(width, height);
      for (const node of badgeNodes) {
        const point = map.project([node.lngLat[0], node.lngLat[1]]);
        node.offset = null;
        for (const [dx, dy] of BADGE_OFFSETS) {
          const candidate: Rect = {
            x: point.x + dx - node.w / 2,
            y: point.y + dy - node.h / 2,
            w: node.w,
            h: node.h,
          };
          if (
            candidate.x < 2 ||
            candidate.y < 2 ||
            candidate.x + node.w > width - 2 ||
            candidate.y + node.h > height - 2
          )
            continue;
          if (blocked.some((rect) => intersects(candidate, rect))) continue;
          if (placed.some((rect) => intersects(candidate, rect))) continue;
          node.offset = [dx, dy];
          placed.push(candidate);
          break;
        }
        node.element.style.display = node.offset === null ? "none" : "";
      }
      translate();
    };
    layout();
    map.on("move", translate);
    map.on("moveend", layout);
    map.on("resize", layout);
    return () => {
      map.off("move", translate);
      map.off("moveend", layout);
      map.off("resize", layout);
      overlay.replaceChildren();
    };
  }, [ready, badges, desktopInspectorOpen, selectedRouteId, popup]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = vendorRef.current;
    if (map === null || maplibregl === null || popupNode === null || !ready) return;
    if (popup === null) {
      popupRef.current?.remove();
      return;
    }
    if (popupRef.current === null) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        maxWidth: "none",
        offset: 14,
        className: "bp-map-popup",
      });
    }
    popupRef.current
      .setLngLat([popup.anchor[0], popup.anchor[1]])
      .setDOMContent(popupNode)
      .addTo(map);
  }, [popup, popupNode, ready]);

  if (failure !== null) {
    return (
      <div className="relative h-full min-h-[320px]">
        {fallback}
        {failure === "runtime" ? (
          <button
            type="button"
            className="absolute right-3 top-3 z-20 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-ink)] shadow-sm"
            onClick={() => {
              resetMapLibreLoader();
              setFailure(null);
              setRetryAttempt((attempt) => attempt + 1);
            }}
          >
            Retry interactive map
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[320px]">
      <section
        ref={containerRef}
        className="h-full min-h-[320px] overflow-hidden bg-[var(--bp-color-card)]"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-busy={!ready}
        aria-hidden={ready ? undefined : true}
      />
      {ready ? null : <div className="absolute inset-0 z-[3]">{fallback}</div>}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
      />
      {popupNode !== null && popup !== null ? createPortal(popup.content, popupNode) : null}
    </div>
  );
}

export type { NetworkBadge };
