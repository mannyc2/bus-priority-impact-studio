import type * as MapLibre from "maplibre-gl";

export type MapLibreModule = typeof MapLibre;
export type MapLibreMap = MapLibre.Map;
export type MapLibreGeoJSONSource = MapLibre.GeoJSONSource;
export type MapLibreMapLayerMouseEvent = MapLibre.MapLayerMouseEvent;
export type MapLibreStyleSpecification = MapLibre.StyleSpecification;

declare global {
  interface Window {
    maplibregl?: MapLibreModule;
  }
}

const MAPLIBRE_VENDOR_URL = import.meta.env.DEV
  ? "/node_modules/maplibre-gl/dist/maplibre-gl.js"
  : "/vendor/maplibre-gl.js";

let loadPromise: Promise<MapLibreModule> | null = null;

export function loadMapLibre(): Promise<MapLibreModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapLibre can only be loaded in the browser."));
  }
  if (window.maplibregl !== undefined) {
    return Promise.resolve(window.maplibregl);
  }
  if (loadPromise !== null) return loadPromise;

  loadPromise = new Promise<MapLibreModule>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-bp-maplibre]");
    if (existing !== null) {
      existing.addEventListener("load", () => {
        window.maplibregl === undefined
          ? reject(new Error("MapLibre vendor script loaded without a global export."))
          : resolve(window.maplibregl);
      });
      existing.addEventListener("error", () => reject(new Error("MapLibre vendor script failed.")));
      return;
    }

    const script = document.createElement("script");
    script.src = MAPLIBRE_VENDOR_URL;
    script.async = true;
    script.setAttribute("data-bp-maplibre", "true");
    script.addEventListener("load", () => {
      window.maplibregl === undefined
        ? reject(new Error("MapLibre vendor script loaded without a global export."))
        : resolve(window.maplibregl);
    });
    script.addEventListener("error", () => reject(new Error("MapLibre vendor script failed.")));
    document.head.appendChild(script);
  });

  return loadPromise;
}
