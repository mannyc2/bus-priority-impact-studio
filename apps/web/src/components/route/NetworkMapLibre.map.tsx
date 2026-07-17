import "maplibre-gl/dist/maplibre-gl.css";
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
import {
  MAP_COLORS,
  mapBaseStyle,
  NYC_MAP_BOUNDS,
  scaledMapColor,
  speedToColor,
} from "@/components/route/maplibre-style";
import {
  type MapPeriod,
  type NetworkMapLens,
  type NetworkMapPopupState,
  periodSpeed,
} from "@/components/route/NetworkMapLibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeatureCollection } from "@/studio/api-client";

type Position = [number, number];
type MultiLineString = { type: "MultiLineString"; coordinates: Position[][] };
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

export type NetworkMapLibreMapProps = {
  collection: NetworkMapFeatureCollection;
  context: RouteGeoContext | null;
  period: MapPeriod;
  lens: NetworkMapLens;
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string, lngLat: readonly [number, number] | null) => void;
  onClearSelection?: () => void;
  popup: NetworkMapPopupState | null;
  fallback: ReactNode;
};

type NetworkLineProperties = {
  routeId: string;
  color: string;
  sbs: boolean;
};

const LAND_SOURCE = "bp-network-land";
const NETWORK_SOURCE = "bp-network-routes";
const CASING_LAYER = "bp-network-casing";
const LINE_LAYER = "bp-network-lines";
const HIT_LAYER = "bp-network-hit";

// Hover/selection render through feature-state so pointer interaction never
// rebuilds the 50k-coordinate source; setData only runs on period/lens change.
const LINE_WIDTH_EXPRESSION: MapLibreExpression = [
  "case",
  ["boolean", ["feature-state", "active"], false],
  5.8,
  ["case", ["get", "sbs"], 3.6, 2.4],
];
const LINE_OPACITY_EXPRESSION: MapLibreExpression = [
  "case",
  ["boolean", ["feature-state", "dimmed"], false],
  0.2,
  0.92,
];

function networkFeatureCollection(input: {
  collection: NetworkMapFeatureCollection;
  period: MapPeriod;
  lens: NetworkMapLens;
}): FeatureCollection<MultiLineString, NetworkLineProperties> {
  return {
    type: "FeatureCollection",
    features: input.collection.features.map((feature) => {
      const speedMph = periodSpeed(feature, input.period).value;
      return {
        type: "Feature",
        id: feature.id,
        geometry: {
          type: "MultiLineString",
          coordinates: feature.geometry.coordinates.map((line) =>
            line.map(([lon, lat]) => [lon, lat]),
          ),
        },
        properties: {
          routeId: feature.properties.routeId,
          color: networkLensColor(feature, input.lens, speedMph),
          sbs: feature.properties.sbs ?? false,
        },
      };
    }),
  };
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

function boundsOfNetwork(
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

function source(map: MapLibreMap, id: string): MapLibreGeoJSONSource | null {
  const found = map.getSource(id);
  return found === undefined ? null : (found as MapLibreGeoJSONSource);
}

function applyNetworkFocus(
  map: MapLibreMap,
  routeIds: readonly string[],
  focus: string | null,
): void {
  for (const routeId of routeIds) {
    map.setFeatureState(
      { source: NETWORK_SOURCE, id: routeId },
      { active: routeId === focus, dimmed: focus !== null && routeId !== focus },
    );
  }
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function NetworkMapLibreMap({
  collection,
  context,
  period,
  lens,
  selectedRouteId,
  onSelectRoute,
  onClearSelection,
  popup,
  fallback,
}: NetworkMapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const vendorRef = useRef<MapLibreModule | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const routeIdsRef = useRef<readonly string[]>([]);
  const hoverRouteIdRef = useRef<string | null>(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const selectedRouteIdRef = useRef(selectedRouteId);
  selectedRouteIdRef.current = selectedRouteId;
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<"runtime" | "unsupported" | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [popupNode] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const networkData = useMemo(
    () => networkFeatureCollection({ collection, period, lens }),
    [collection, period, lens],
  );
  const landData = useMemo(() => landCollection(context), [context]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!supportsWebGl()) {
      setFailure("unsupported");
      return;
    }
    const currentFocus = () => hoverRouteIdRef.current ?? selectedRouteIdRef.current;
    const onMouseMove = (event: MapLibreMapLayerMouseEvent) => {
      const map = mapRef.current;
      const feature = event.features?.[0];
      const properties = feature?.properties as { routeId?: unknown } | undefined;
      const routeId = properties?.routeId;
      if (map === null || typeof routeId !== "string") return;
      map.getCanvas().style.cursor = "pointer";
      if (hoverRouteIdRef.current !== routeId) {
        hoverRouteIdRef.current = routeId;
        applyNetworkFocus(map, routeIdsRef.current, currentFocus());
      }
    };
    const onMouseLeave = () => {
      const map = mapRef.current;
      if (map === null) return;
      map.getCanvas().style.cursor = "";
      if (hoverRouteIdRef.current !== null) {
        hoverRouteIdRef.current = null;
        applyNetworkFocus(map, routeIdsRef.current, currentFocus());
      }
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
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
        map.addLayer({
          id: CASING_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": ["+", LINE_WIDTH_EXPRESSION, 3.5],
            "line-opacity": LINE_OPACITY_EXPRESSION,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: NETWORK_SOURCE,
          paint: {
            "line-color": ["get", "color"],
            "line-width": LINE_WIDTH_EXPRESSION,
            "line-opacity": LINE_OPACITY_EXPRESSION,
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
        routeIdsRef.current = collection.features.map((feature) => feature.properties.routeId);
        applyNetworkFocus(map, routeIdsRef.current, currentFocus());
        const bounds = boundsOfNetwork(collection);
        if (bounds !== null) map.fitBounds(bounds, { padding: 28, duration: 0 });
        map.on("mousemove", HIT_LAYER, onMouseMove);
        map.on("mouseleave", HIT_LAYER, onMouseLeave);
        map.on("click", HIT_LAYER, onClick);
        map.on("click", onBackgroundClick);
        setReady(true);
      },
      onFatal: (error) => {
        popupRef.current = null;
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
        popupRef.current?.remove();
        popupRef.current = null;
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

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, NETWORK_SOURCE)?.setData(networkData);
  }, [networkData, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    routeIdsRef.current = collection.features.map((feature) => feature.properties.routeId);
    applyNetworkFocus(map, routeIdsRef.current, hoverRouteIdRef.current ?? selectedRouteId);
  }, [collection, ready, selectedRouteId]);

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
    <>
      <div
        ref={containerRef}
        className="h-full min-h-[320px] overflow-hidden bg-[var(--bp-color-card)]"
        role="img"
        aria-label="Citywide bus route speed map"
      />
      {popupNode !== null && popup !== null ? createPortal(popup.content, popupNode) : null}
    </>
  );
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
