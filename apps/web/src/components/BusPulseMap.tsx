import "maplibre-gl/dist/maplibre-gl.css";

import type maplibregl from "maplibre-gl";
import type { LngLatBoundsLike, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { type RefObject, useCallback, useEffect, useRef } from "react";

import { type LatLngTuple, routeGeo } from "../fixtures/routes.js";
import { fetchMapRouteShapes, routeDisplayName } from "../lib/api-client.js";
import { gradeColor } from "../lib/tokens.js";

interface BusPulseMapProps {
  onRouteClick: (route: { name: string; grade: string }) => void;
  onRouteHover?: (route: string | null) => void;
  activeRoute?: string | null;
  hoveredRoute?: string | null;
}

type LngLatTuple = [longitude: number, latitude: number];
type MapLibreApi = typeof maplibregl;

interface RouteProperties {
  name: string;
  grade: string;
  color: string;
}

interface RouteFeatureCollection<G> {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: RouteProperties;
    geometry: G;
  }>;
}

interface LineStringGeometry {
  type: "LineString";
  coordinates: LngLatTuple[];
}

interface MultiLineStringGeometry {
  type: "MultiLineString";
  coordinates: LngLatTuple[][];
}

interface PointGeometry {
  type: "Point";
  coordinates: LngLatTuple;
}

const NYC_CENTER: LngLatTuple = [-73.956, 40.7128];
const NYC_ZOOM = 12;
const NYC_MAP_BOUNDS: LngLatBoundsLike = [
  [-74.35, 40.45],
  [-73.65, 40.98],
];

const ROUTES_SOURCE_ID = "bp-routes";
const STOPS_SOURCE_ID = "bp-route-stops";
const LABELS_SOURCE_ID = "bp-route-labels";
const HOTSPOTS_SOURCE_ID = "bp-route-hotspots";

const ROUTE_GLOW_LAYER_ID = "bp-route-glow";
const ROUTE_MAIN_LAYER_ID = "bp-route-main";
const ROUTE_HIT_LAYER_ID = "bp-route-hit";
const ROUTE_STOP_LAYER_ID = "bp-route-stops";
const ROUTE_HOTSPOT_LAYER_ID = "bp-route-hotspots";
const ROUTE_LABEL_LAYER_ID = "bp-route-labels";

const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: BASEMAP_ATTRIBUTION,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "carto-light",
      type: "raster",
      source: "carto-light",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

let isPmtilesProtocolRegistered = false;
let maplibrePromise: Promise<MapLibreApi> | null = null;

function toLngLat([latitude, longitude]: LatLngTuple): LngLatTuple {
  return [longitude, latitude];
}

function midpoint(path: readonly LatLngTuple[]): LngLatTuple | null {
  const point = path[Math.floor(path.length / 2)];
  return point ? toLngLat(point) : null;
}

function routeProperties(route: (typeof routeGeo)[number]): RouteProperties {
  return {
    name: route.name,
    grade: route.grade,
    color: gradeColor(route.grade),
  };
}

function buildRouteLineData(): RouteFeatureCollection<LineStringGeometry> {
  return {
    type: "FeatureCollection",
    features: routeGeo.map((route) => ({
      type: "Feature",
      properties: routeProperties(route),
      geometry: {
        type: "LineString",
        coordinates: route.path.map(toLngLat),
      },
    })),
  };
}

function readGeneratedRouteId(properties: unknown): string | null {
  if (properties == null || typeof properties !== "object") return null;
  const { routeId, routeShortName } = properties as {
    routeId?: unknown;
    routeShortName?: unknown;
  };
  if (typeof routeShortName === "string" && routeShortName.length > 0) return routeShortName;
  return typeof routeId === "string" && routeId.length > 0 ? routeId : null;
}

function normalizeGeneratedRouteLineData(
  payload: unknown,
): RouteFeatureCollection<LineStringGeometry | MultiLineStringGeometry> | null {
  if (payload == null || typeof payload !== "object") return null;
  const collection = payload as {
    type?: unknown;
    features?: Array<{
      type?: unknown;
      geometry?: unknown;
      properties?: unknown;
    }>;
  };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return null;

  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const geometry = feature.geometry as LineStringGeometry | MultiLineStringGeometry | undefined;
      if (geometry?.type !== "LineString" && geometry?.type !== "MultiLineString") return [];
      const routeId = readGeneratedRouteId(feature.properties);
      if (routeId === null) return [];
      const name = routeDisplayName(routeId);
      const grade = "C";

      return [
        {
          type: "Feature" as const,
          properties: {
            name,
            grade,
            color: gradeColor(grade),
          },
          geometry,
        },
      ];
    }),
  };
}

function buildStopData(): RouteFeatureCollection<PointGeometry> {
  return {
    type: "FeatureCollection",
    features: routeGeo.flatMap((route) =>
      route.stops.map((stop) => ({
        type: "Feature" as const,
        properties: routeProperties(route),
        geometry: {
          type: "Point" as const,
          coordinates: toLngLat(stop),
        },
      })),
    ),
  };
}

function buildLabelData(): RouteFeatureCollection<PointGeometry> {
  return {
    type: "FeatureCollection",
    features: routeGeo.map((route) => ({
      type: "Feature",
      properties: routeProperties(route),
      geometry: {
        type: "Point",
        coordinates: toLngLat(route.labelAt),
      },
    })),
  };
}

function buildHotspotData(): RouteFeatureCollection<PointGeometry> {
  return {
    type: "FeatureCollection",
    features: routeGeo.flatMap((route) => {
      if (route.grade !== "D") return [];
      const coordinates = midpoint(route.path);
      if (!coordinates) return [];
      return [
        {
          type: "Feature" as const,
          properties: routeProperties(route),
          geometry: {
            type: "Point" as const,
            coordinates,
          },
        },
      ];
    }),
  };
}

function readRouteProperties(properties: unknown): { name: string; grade: string } | null {
  if (properties == null || typeof properties !== "object") return null;
  const { name, grade } = properties as { name?: unknown; grade?: unknown };
  return typeof name === "string" && typeof grade === "string" ? { name, grade } : null;
}

function loadMaplibre(): Promise<MapLibreApi> {
  maplibrePromise ??= import("maplibre-gl").then((module) => module.default);
  return maplibrePromise;
}

async function registerPmtilesProtocol(maplibre: MapLibreApi): Promise<void> {
  if (isPmtilesProtocolRegistered) return;
  const { Protocol } = await import("pmtiles");
  const protocol = new Protocol();
  maplibre.addProtocol("pmtiles", protocol.tile);
  isPmtilesProtocolRegistered = true;
}

function addRouteSourcesAndLayers(map: MapLibreMap): void {
  if (map.getSource(ROUTES_SOURCE_ID)) return;

  map.addSource(ROUTES_SOURCE_ID, {
    type: "geojson",
    data: buildRouteLineData(),
  });
  map.addSource(STOPS_SOURCE_ID, {
    type: "geojson",
    data: buildStopData(),
  });
  map.addSource(LABELS_SOURCE_ID, {
    type: "geojson",
    data: buildLabelData(),
  });
  map.addSource(HOTSPOTS_SOURCE_ID, {
    type: "geojson",
    data: buildHotspotData(),
  });

  map.addLayer({
    id: ROUTE_GLOW_LAYER_ID,
    type: "line",
    source: ROUTES_SOURCE_ID,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0,
      "line-width": 14,
    },
  });

  map.addLayer({
    id: ROUTE_MAIN_LAYER_ID,
    type: "line",
    source: ROUTES_SOURCE_ID,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0.85,
      "line-width": 5,
    },
  });

  map.addLayer({
    id: ROUTE_HIT_LAYER_ID,
    type: "line",
    source: ROUTES_SOURCE_ID,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#000000",
      "line-opacity": 0.01,
      "line-width": 24,
    },
  });

  map.addLayer({
    id: ROUTE_STOP_LAYER_ID,
    type: "circle",
    source: STOPS_SOURCE_ID,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 1,
      "circle-radius": 5,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: ROUTE_HOTSPOT_LAYER_ID,
    type: "circle",
    source: HOTSPOTS_SOURCE_ID,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.18,
      "circle-radius": 12,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-opacity": 0.9,
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: ROUTE_LABEL_LAYER_ID,
    type: "symbol",
    source: LABELS_SOURCE_ID,
    layout: {
      "text-allow-overlap": true,
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Bold"],
      "text-ignore-placement": true,
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-blur": 0.5,
      "text-halo-color": ["get", "color"],
      "text-halo-width": 3,
      "text-opacity": 1,
    },
  });
}

async function updateRouteLineSourceFromApi(map: MapLibreMap): Promise<void> {
  const source = map.getSource(ROUTES_SOURCE_ID) as { setData(data: unknown): void } | undefined;
  if (source === undefined) return;

  const generated = normalizeGeneratedRouteLineData(await fetchMapRouteShapes());
  if (generated !== null && generated.features.length > 0) {
    source.setData(generated);
  }
}

function routeOpacityExpression(
  highlighted: string | null,
  baseOpacity: number,
): number | unknown[] {
  if (!highlighted) return baseOpacity;
  return ["case", ["==", ["get", "name"], highlighted], baseOpacity, 0.35];
}

function routeWidthExpression(highlighted: string | null): number | unknown[] {
  if (!highlighted) return 5;
  return ["case", ["==", ["get", "name"], highlighted], 7, 5];
}

function routeGlowOpacityExpression(highlighted: string | null): number | unknown[] {
  if (!highlighted) return 0;
  return ["case", ["==", ["get", "name"], highlighted], 0.3, 0];
}

function applyHighlight(map: MapLibreMap | null, highlighted: string | null): void {
  if (!map?.getLayer(ROUTE_MAIN_LAYER_ID)) return;

  map.setPaintProperty(
    ROUTE_GLOW_LAYER_ID,
    "line-opacity",
    routeGlowOpacityExpression(highlighted),
  );
  map.setPaintProperty(
    ROUTE_MAIN_LAYER_ID,
    "line-opacity",
    routeOpacityExpression(highlighted, 0.85),
  );
  map.setPaintProperty(ROUTE_MAIN_LAYER_ID, "line-width", routeWidthExpression(highlighted));
  map.setPaintProperty(
    ROUTE_STOP_LAYER_ID,
    "circle-opacity",
    routeOpacityExpression(highlighted, 1),
  );
  map.setPaintProperty(
    ROUTE_STOP_LAYER_ID,
    "circle-stroke-opacity",
    routeOpacityExpression(highlighted, 1),
  );
  map.setPaintProperty(
    ROUTE_LABEL_LAYER_ID,
    "text-opacity",
    routeOpacityExpression(highlighted, 1),
  );
  map.setPaintProperty(
    ROUTE_HOTSPOT_LAYER_ID,
    "circle-opacity",
    routeOpacityExpression(highlighted, 0.18),
  );
  map.setPaintProperty(
    ROUTE_HOTSPOT_LAYER_ID,
    "circle-stroke-opacity",
    routeOpacityExpression(highlighted, 0.9),
  );
}

function routeBounds(path: readonly LatLngTuple[]): LngLatBoundsLike | null {
  if (path.length === 0) return null;

  let minLongitude = Number.POSITIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  for (const point of path) {
    const [longitude, latitude] = toLngLat(point);
    minLongitude = Math.min(minLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

function bindRouteLayerEvents(
  map: MapLibreMap,
  onRouteClickRef: RefObject<(route: { name: string; grade: string }) => void>,
  onRouteHoverRef: RefObject<((route: string | null) => void) | undefined>,
): void {
  map.on("click", ROUTE_HIT_LAYER_ID, (event) => {
    const route = readRouteProperties(event.features?.[0]?.properties);
    if (route) onRouteClickRef.current(route);
  });

  map.on("click", ROUTE_LABEL_LAYER_ID, (event) => {
    const route = readRouteProperties(event.features?.[0]?.properties);
    if (route) onRouteClickRef.current(route);
  });

  map.on("mousemove", ROUTE_HIT_LAYER_ID, (event) => {
    map.getCanvas().style.cursor = "pointer";
    const route = readRouteProperties(event.features?.[0]?.properties);
    onRouteHoverRef.current?.(route?.name ?? null);
  });

  map.on("mousemove", ROUTE_LABEL_LAYER_ID, (event) => {
    map.getCanvas().style.cursor = "pointer";
    const route = readRouteProperties(event.features?.[0]?.properties);
    onRouteHoverRef.current?.(route?.name ?? null);
  });

  map.on("mouseleave", ROUTE_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
    onRouteHoverRef.current?.(null);
  });

  map.on("mouseleave", ROUTE_LABEL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
    onRouteHoverRef.current?.(null);
  });
}

export function BusPulseMap({
  onRouteClick,
  onRouteHover,
  activeRoute,
  hoveredRoute,
}: BusPulseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const highlightedRouteRef = useRef<string | null>(null);

  const onRouteClickRef = useRef(onRouteClick);
  onRouteClickRef.current = onRouteClick;

  const onRouteHoverRef = useRef(onRouteHover);
  onRouteHoverRef.current = onRouteHover;

  const initMap = useCallback(async () => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const maplibre = await loadMaplibre();
    await registerPmtilesProtocol(maplibre);

    const map = new maplibre.Map({
      attributionControl: false,
      center: NYC_CENTER,
      container,
      dragRotate: false,
      maxBounds: NYC_MAP_BOUNDS,
      pitchWithRotate: false,
      style: BASEMAP_STYLE,
      zoom: NYC_ZOOM,
    });

    map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-left");
    map.touchZoomRotate.disableRotation();

    map.on("load", () => {
      addRouteSourcesAndLayers(map);
      void updateRouteLineSourceFromApi(map).catch(() => undefined);
      bindRouteLayerEvents(map, onRouteClickRef, onRouteHoverRef);
      applyHighlight(map, highlightedRouteRef.current);
    });

    mapRef.current = map;
  }, []);

  useEffect(() => {
    let isDisposed = false;

    void initMap().then(() => {
      if (!isDisposed) return;
      mapRef.current?.remove();
      mapRef.current = null;
    });

    return () => {
      isDisposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initMap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const highlighted = activeRoute ?? hoveredRoute ?? null;
    highlightedRouteRef.current = highlighted;
    applyHighlight(mapRef.current, highlighted);
  }, [activeRoute, hoveredRoute]);

  useEffect(() => {
    if (!activeRoute || !mapRef.current) return;
    const route = routeGeo.find((candidate) => candidate.name === activeRoute);
    if (!route) return;

    const bounds = routeBounds(route.path);
    if (!bounds) return;

    mapRef.current.fitBounds(bounds, {
      duration: 600,
      maxZoom: 14,
      padding: 80,
    });
  }, [activeRoute]);

  return <div ref={containerRef} className="bp-bus-map" />;
}
