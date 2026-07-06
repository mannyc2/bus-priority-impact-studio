import type { MapRouteSegmentFeature, MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  loadMapLibre,
  type MapLibreGeoJSONSource,
  type MapLibreMap,
  type MapLibreMapLayerMouseEvent,
  type MapLibreStyleSpecification,
} from "@/components/route/load-maplibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";
import { boundsOf, MAP_COLORS, speedToColor } from "./maplibre-style";

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

export type RouteMapLayerState = {
  lane: boolean;
  ace: boolean;
  tsp: boolean;
};

export type RouteMapLibreMapProps = {
  collection: MapRouteSegmentFeatureCollection;
  context: RouteGeoContext | null;
  route: StudioRoute;
  segments: readonly StudioSegment[];
  hoveredSegmentId: string | null;
  setHoveredSegmentId: (segmentId: string | null) => void;
  layers: RouteMapLayerState;
  highlightId?: string | undefined;
  fallback: ReactNode;
};

type SegmentMapProperties = {
  featureSegmentId: string;
  studioSegmentId: string;
  label: string;
  direction: string;
  from: string;
  to: string;
  speedMph: number;
  scheduledMph: number | null;
  riderHours: number;
  color: string;
  opacity: number;
  lineWidth: number;
  isWorst: boolean;
  isHovered: boolean;
  lane: StudioSegment["lane"];
  ace: boolean;
  tsp: boolean;
  speedLabel: string;
};

type MarkerProperties = {
  studioSegmentId: string;
  kind: "ace" | "tsp" | "stop" | "terminus";
  label: string;
  color: string;
};

const LAND_SOURCE = "bp-route-land";
const SEGMENT_SOURCE = "bp-route-segments";
const MARKER_SOURCE = "bp-route-markers";
const CASING_LAYER = "bp-route-casing";
const HIT_LAYER = "bp-route-hit";

function directionBucket(feature: MapRouteSegmentFeature): string {
  return feature.properties.directionId;
}

function featureOrder(features: readonly MapRouteSegmentFeature[]): Map<string, number> {
  const byDirection = new Map<string, MapRouteSegmentFeature[]>();
  for (const feature of features) {
    const key = directionBucket(feature);
    byDirection.set(key, [...(byDirection.get(key) ?? []), feature]);
  }
  const output = new Map<string, number>();
  for (const group of byDirection.values()) {
    group.forEach((feature, index) => {
      output.set(String(feature.id), index);
    });
  }
  return output;
}

function studioSegmentForFeature(input: {
  feature: MapRouteSegmentFeature;
  featureIndex: number;
  orderedFeatureIndex: number;
  segments: readonly StudioSegment[];
}): StudioSegment | null {
  const direct = input.segments.find(
    (segment) =>
      segment.id === input.feature.properties.segmentId || segment.id === String(input.feature.id),
  );
  if (direct !== undefined) return direct;

  const sameDirection = input.segments.filter((segment) =>
    input.feature.properties.directionId === "0"
      ? segment.direction === "NB" || segment.direction === "EB"
      : segment.direction === "SB" || segment.direction === "WB",
  );
  return sameDirection[input.orderedFeatureIndex] ?? input.segments[input.featureIndex] ?? null;
}

function lineStringGeometry(geometry: MapRouteSegmentFeature["geometry"]): LineString {
  return {
    type: "LineString",
    coordinates: geometry.coordinates.map(([lon, lat]) => [lon, lat]),
  };
}

function midpoint(coordinates: ReadonlyArray<readonly [number, number]>): Position | null {
  if (coordinates.length === 0) return null;
  const coordinate = coordinates[Math.floor(coordinates.length / 2)];
  return coordinate === undefined ? null : [coordinate[0], coordinate[1]];
}

function routeSegmentCollection(input: {
  collection: MapRouteSegmentFeatureCollection;
  route: StudioRoute;
  segments: readonly StudioSegment[];
  hoveredSegmentId: string | null;
  highlightId?: string | undefined;
}): FeatureCollection<LineString, SegmentMapProperties> {
  const order = featureOrder(input.collection.features);
  const totalRiderHours = input.segments.reduce((sum, segment) => sum + segment.riderHours, 0);
  const worstId =
    input.highlightId ?? input.segments.find((segment) => segment.flagged)?.id ?? null;

  return {
    type: "FeatureCollection",
    features: input.collection.features.map((feature, featureIndex) => {
      const orderedFeatureIndex = order.get(String(feature.id)) ?? featureIndex;
      const segment = studioSegmentForFeature({
        feature,
        featureIndex,
        orderedFeatureIndex,
        segments: input.segments,
      });
      const studioSegmentId = segment?.id ?? feature.properties.segmentId;
      const speedMph =
        segment === null
          ? (feature.properties.averageSpeedMph ?? input.route.weightedAvgSpeed)
          : segment.speedMph;
      const hovered = input.hoveredSegmentId === studioSegmentId;
      const hasHover = input.hoveredSegmentId !== null;
      const isWorst = studioSegmentId === worstId;
      const from = segment?.from ?? feature.properties.startStopName ?? "Segment start";
      const to = segment?.to ?? feature.properties.endStopName ?? "Segment end";
      const riderHours = segment?.riderHours ?? 0;
      const share =
        totalRiderHours > 0 && riderHours > 0
          ? ` · ${Math.round((riderHours / totalRiderHours) * 100)}% delay`
          : "";
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
          scheduledMph: segment?.scheduledMph ?? input.route.scheduledMph,
          riderHours,
          color: speedToColor(speedMph),
          opacity: hasHover && !hovered ? 0.5 : 1,
          lineWidth: hovered ? 10 : isWorst ? 8 : 7,
          isWorst,
          isHovered: hovered,
          lane: segment?.lane ?? "none",
          ace: segment?.ace ?? false,
          tsp: segment?.tsp ?? false,
          speedLabel: `${speedMph.toFixed(1)}${share}`,
        },
      };
    }),
  };
}

function markerCollection(
  segmentCollection: FeatureCollection<LineString, SegmentMapProperties>,
  layers: RouteMapLayerState,
): FeatureCollection<Point, MarkerProperties> {
  const seenStops = new Map<string, Feature<Point, MarkerProperties>>();
  const markers: Feature<Point, MarkerProperties>[] = [];

  for (const feature of segmentCollection.features) {
    const coordinates = feature.geometry.coordinates;
    const middle = midpoint(coordinates);
    if (middle !== null && layers.ace && feature.properties.ace) {
      markers.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: middle },
        properties: {
          studioSegmentId: feature.properties.studioSegmentId,
          kind: "ace",
          label: "ACE",
          color: MAP_COLORS.accent,
        },
      });
    }
    if (middle !== null && layers.tsp && feature.properties.tsp) {
      markers.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: middle },
        properties: {
          studioSegmentId: feature.properties.studioSegmentId,
          kind: "tsp",
          label: "TSP",
          color: MAP_COLORS.good,
        },
      });
    }

    const ends = [
      { coordinate: coordinates[0], label: feature.properties.from, terminus: false },
      {
        coordinate: coordinates[coordinates.length - 1],
        label: feature.properties.to,
        terminus: false,
      },
    ];
    for (const end of ends) {
      if (end.coordinate === undefined) continue;
      const key = `${end.coordinate[0].toFixed(5)},${end.coordinate[1].toFixed(5)}`;
      if (seenStops.has(key)) continue;
      seenStops.set(key, {
        type: "Feature",
        geometry: { type: "Point", coordinates: end.coordinate },
        properties: {
          studioSegmentId: feature.properties.studioSegmentId,
          kind: "stop",
          label: end.label,
          color: MAP_COLORS.ink70,
        },
      });
    }
  }

  markers.push(...seenStops.values());
  return { type: "FeatureCollection", features: markers };
}

function landCollection(context: RouteGeoContext | null): FeatureCollection<MultiPolygon> {
  return {
    type: "FeatureCollection",
    features:
      context?.features.map((feature) => ({
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: {},
      })) ?? [],
  };
}

function baseStyle(): MapLibreStyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": MAP_COLORS.water },
      },
    ],
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
  layers,
  highlightId,
  fallback,
}: RouteMapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const segmentData = useMemo(
    () => routeSegmentCollection({ collection, route, segments, hoveredSegmentId, highlightId }),
    [collection, route, segments, hoveredSegmentId, highlightId],
  );
  const markerData = useMemo(() => markerCollection(segmentData, layers), [segmentData, layers]);
  const landData = useMemo(() => landCollection(context), [context]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!supportsWebGl()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let cleanupMap: (() => void) | null = null;

    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled) return;
        const container = containerRef.current;
        if (container === null) return;

        let map: MapLibreMap;
        try {
          map = new maplibregl.Map({
            container,
            style: baseStyle(),
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
          });
        } catch {
          setFailed(true);
          return;
        }
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        const onMouseMove = (event: MapLibreMapLayerMouseEvent) => {
          const feature = event.features?.[0];
          const properties = feature?.properties as { studioSegmentId?: unknown } | undefined;
          const segmentId = properties?.studioSegmentId;
          if (typeof segmentId === "string") {
            map.getCanvas().style.cursor = "pointer";
            setHoveredSegmentId(segmentId);
          }
        };
        const onMouseLeave = () => {
          map.getCanvas().style.cursor = "";
          setHoveredSegmentId(null);
        };
        const onError = () => setFailed(true);
        const onLoad = () => {
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
              "line-opacity": ["get", "opacity"],
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "bp-route-worst-glow",
            type: "line",
            source: SEGMENT_SOURCE,
            filter: ["==", ["get", "isWorst"], true],
            paint: { "line-color": MAP_COLORS.bad, "line-width": 20, "line-opacity": 0.16 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "bp-route-bus-lane-full",
            type: "line",
            source: SEGMENT_SOURCE,
            filter: ["all", ["==", ["get", "lane"], "yes"]],
            paint: {
              "line-color": MAP_COLORS.good,
              "line-width": layers.lane ? 3 : 0,
              "line-offset": 9,
              "line-opacity": 0.9,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "bp-route-bus-lane-partial",
            type: "line",
            source: SEGMENT_SOURCE,
            filter: ["all", ["in", ["get", "lane"], ["literal", ["partial", "minimal"]]]],
            paint: {
              "line-color": MAP_COLORS.warn,
              "line-width": layers.lane ? 3 : 0,
              "line-offset": 9,
              "line-opacity": 0.9,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "bp-route-lines",
            type: "line",
            source: SEGMENT_SOURCE,
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["get", "lineWidth"],
              "line-opacity": ["get", "opacity"],
              "line-color-transition": { duration: 500 },
              "line-width-transition": { duration: 180 },
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addSource(MARKER_SOURCE, { type: "geojson", data: markerData });
          map.addLayer({
            id: "bp-route-stops",
            type: "circle",
            source: MARKER_SOURCE,
            filter: ["==", ["get", "kind"], "stop"],
            paint: {
              "circle-radius": 3.2,
              "circle-color": MAP_COLORS.card,
              "circle-stroke-color": MAP_COLORS.ink70,
              "circle-stroke-width": 1.6,
            },
          });
          map.addLayer({
            id: "bp-route-markers",
            type: "circle",
            source: MARKER_SOURCE,
            filter: ["in", ["get", "kind"], ["literal", ["ace", "tsp"]]],
            paint: {
              "circle-radius": ["case", ["==", ["get", "kind"], "ace"], 5.5, 4.8],
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1.5,
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
          if (bounds !== null) {
            map.fitBounds(bounds, { padding: 42, duration: 0 });
          }
          map.on("mousemove", HIT_LAYER, onMouseMove);
          map.on("mouseleave", HIT_LAYER, onMouseLeave);
          setReady(true);
        };

        map.on("load", onLoad);
        map.on("error", onError);
        cleanupMap = () => {
          map.off("load", onLoad);
          map.off("mousemove", HIT_LAYER, onMouseMove);
          map.off("mouseleave", HIT_LAYER, onMouseLeave);
          map.off("error", onError);
          map.remove();
          mapRef.current = null;
          setReady(false);
        };
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      cleanupMap?.();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, LAND_SOURCE)?.setData(landData);
  }, [landData, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    source(map, SEGMENT_SOURCE)?.setData(segmentData);
    source(map, MARKER_SOURCE)?.setData(markerData);
    if (map.getLayer("bp-route-bus-lane-full") !== undefined) {
      map.setPaintProperty("bp-route-bus-lane-full", "line-width", layers.lane ? 3 : 0);
      map.setPaintProperty("bp-route-bus-lane-partial", "line-width", layers.lane ? 3 : 0);
    }
  }, [layers, markerData, ready, segmentData]);

  if (failed) return fallback;

  return (
    <div
      ref={containerRef}
      className="bp-bus-map min-h-[560px] overflow-hidden rounded-[3px] bg-[var(--bp-color-card)]"
      aria-label={`${route.label} street map`}
      role="img"
    />
  );
}
