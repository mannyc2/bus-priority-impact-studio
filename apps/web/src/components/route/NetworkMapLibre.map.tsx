import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  loadMapLibre,
  type MapLibreGeoJSONSource,
  type MapLibreMap,
  type MapLibreMapLayerMouseEvent,
} from "@/components/route/load-maplibre";
import {
  MAP_COLORS,
  mapBaseStyle,
  scaledMapColor,
  speedToColor,
} from "@/components/route/maplibre-style";
import {
  type MapPeriod,
  type NetworkMapLens,
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
  hoveredRouteId: string | null;
  setHoveredRouteId: (routeId: string | null) => void;
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string) => void;
  fallback: ReactNode;
};

type NetworkLineProperties = {
  routeId: string;
  label: string;
  borough: string;
  speedMph: number;
  color: string;
  opacity: number;
  lineWidth: number;
  sbs: boolean;
  dailyRiders: number;
};

const LAND_SOURCE = "bp-network-land";
const NETWORK_SOURCE = "bp-network-routes";
const CASING_LAYER = "bp-network-casing";
const LINE_LAYER = "bp-network-lines";
const HIT_LAYER = "bp-network-hit";

function networkFeatureCollection(input: {
  collection: NetworkMapFeatureCollection;
  period: MapPeriod;
  lens: NetworkMapLens;
  hoveredRouteId: string | null;
  selectedRouteId: string | null;
}): FeatureCollection<MultiLineString, NetworkLineProperties> {
  return {
    type: "FeatureCollection",
    features: input.collection.features.map((feature) => {
      const speedMph = periodSpeed(feature, input.period);
      const active =
        feature.properties.routeId === input.hoveredRouteId ||
        feature.properties.routeId === input.selectedRouteId;
      const hasFocus = input.hoveredRouteId !== null || input.selectedRouteId !== null;
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
          label: feature.properties.label,
          borough: feature.properties.borough,
          speedMph,
          color: networkLensColor(feature, input.lens, speedMph),
          opacity: hasFocus && !active ? 0.2 : 0.92,
          lineWidth: active ? 5.8 : feature.properties.sbs ? 3.6 : 2.4,
          sbs: feature.properties.sbs,
          dailyRiders: feature.properties.dailyRiders,
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
        geometry: feature.geometry,
        properties: {},
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
  hoveredRouteId,
  setHoveredRouteId,
  selectedRouteId,
  onSelectRoute,
  fallback,
}: NetworkMapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const networkData = useMemo(
    () => networkFeatureCollection({ collection, period, lens, hoveredRouteId, selectedRouteId }),
    [collection, period, lens, hoveredRouteId, selectedRouteId],
  );
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
            style: mapBaseStyle(),
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
          const properties = feature?.properties as { routeId?: unknown } | undefined;
          const routeId = properties?.routeId;
          if (typeof routeId === "string") {
            map.getCanvas().style.cursor = "pointer";
            setHoveredRouteId(routeId);
          }
        };
        const onMouseLeave = () => {
          map.getCanvas().style.cursor = "";
          setHoveredRouteId(null);
        };
        const onClick = (event: MapLibreMapLayerMouseEvent) => {
          const feature = event.features?.[0];
          const properties = feature?.properties as { routeId?: unknown } | undefined;
          const routeId = properties?.routeId;
          if (typeof routeId === "string") {
            onSelectRouteRef.current?.(routeId);
          }
        };
        const onError = () => setFailed(true);
        const onLoad = () => {
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
              "line-width": ["+", ["get", "lineWidth"], 3.5],
              "line-opacity": ["get", "opacity"],
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: LINE_LAYER,
            type: "line",
            source: NETWORK_SOURCE,
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["get", "lineWidth"],
              "line-opacity": ["get", "opacity"],
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
          const bounds = boundsOfNetwork(collection);
          if (bounds !== null) {
            map.fitBounds(bounds, { padding: 28, duration: 0 });
          }
          map.on("mousemove", HIT_LAYER, onMouseMove);
          map.on("mouseleave", HIT_LAYER, onMouseLeave);
          map.on("click", HIT_LAYER, onClick);
          setReady(true);
        };

        map.on("load", onLoad);
        map.on("error", onError);
        cleanupMap = () => {
          map.off("load", onLoad);
          map.off("error", onError);
          map.off("mousemove", HIT_LAYER, onMouseMove);
          map.off("mouseleave", HIT_LAYER, onMouseLeave);
          map.off("click", HIT_LAYER, onClick);
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
    source(map, NETWORK_SOURCE)?.setData(networkData);
  }, [networkData, ready]);

  if (failed) return fallback;

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[320px] overflow-hidden bg-[var(--bp-color-card)]"
      role="img"
      aria-label="Citywide bus route speed map"
    />
  );
}

function networkLensColor(
  feature: NetworkMapFeatureCollection["features"][number],
  lens: NetworkMapLens,
  speedMph: number,
): string {
  if (lens === "speed") return speedToColor(speedMph);
  if (lens === "lanes") {
    return scaledMapColor(feature.properties.laneCoverage, 0, 100, "lanes");
  }
  return scaledMapColor(feature.properties.dailyRiders, 0, 45_000, "riders");
}
