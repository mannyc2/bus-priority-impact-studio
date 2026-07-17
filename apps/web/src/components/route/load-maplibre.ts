import type * as MapLibre from "maplibre-gl";

export type MapLibreModule = typeof MapLibre;
export type MapLibreMap = MapLibre.Map;
export type MapLibrePopup = MapLibre.Popup;
export type MapLibreGeoJSONSource = MapLibre.GeoJSONSource;
export type MapLibreMapLayerMouseEvent = MapLibre.MapLayerMouseEvent;
export type MapLibreMapMouseEvent = MapLibre.MapMouseEvent;
export type MapLibreStyleSpecification = MapLibre.StyleSpecification;
export type MapLibreExpression = MapLibre.ExpressionSpecification;

declare global {
  interface Window {
    maplibregl?: MapLibreModule;
  }
}

const MAPLIBRE_VENDOR_URL = import.meta.env.DEV
  ? "/node_modules/maplibre-gl/dist/maplibre-gl.js"
  : "/vendor/maplibre-gl.js";

type VendorScript = {
  src: string;
  async: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "load" | "error", listener: () => void, options?: { once: boolean }): void;
  removeEventListener(type: "load" | "error", listener: () => void): void;
  remove(): void;
};

export type MapLibreLoaderAdapter = {
  available(): boolean;
  loadedModule(): MapLibreModule | undefined;
  findScript(): VendorScript | null;
  createScript(): VendorScript;
  appendScript(script: VendorScript): void;
};

export function createMapLibreLoader(
  adapter: MapLibreLoaderAdapter,
  vendorUrl: string,
): { load: () => Promise<MapLibreModule>; reset: () => void } {
  let loadPromise: Promise<MapLibreModule> | null = null;

  const reset = () => {
    if (adapter.loadedModule() !== undefined) return;
    loadPromise = null;
    adapter.findScript()?.remove();
  };

  const load = (): Promise<MapLibreModule> => {
    if (!adapter.available()) {
      return Promise.reject(new Error("MapLibre can only be loaded in the browser."));
    }
    const loaded = adapter.loadedModule();
    if (loaded !== undefined) return Promise.resolve(loaded);
    if (loadPromise !== null) return loadPromise;

    const pending = new Promise<MapLibreModule>((resolve, reject) => {
      const existing = adapter.findScript();
      const script = existing ?? adapter.createScript();

      const cleanupListeners = () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };
      const fail = (error: Error) => {
        cleanupListeners();
        script.remove();
        reject(error);
      };
      const onLoad = () => {
        cleanupListeners();
        const module = adapter.loadedModule();
        module === undefined
          ? fail(new Error("MapLibre vendor script loaded without a global export."))
          : resolve(module);
      };
      const onError = () => fail(new Error("MapLibre vendor script failed."));

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (existing === null) {
        script.src = vendorUrl;
        script.async = true;
        script.setAttribute("data-bp-maplibre", "true");
        adapter.appendScript(script);
      }
    });

    loadPromise = pending.catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  };

  return { load, reset };
}

const browserLoader = createMapLibreLoader(
  {
    available: () => typeof window !== "undefined" && typeof document !== "undefined",
    loadedModule: () => (typeof window === "undefined" ? undefined : window.maplibregl),
    findScript: () =>
      typeof document === "undefined"
        ? null
        : document.querySelector<HTMLScriptElement>("script[data-bp-maplibre]"),
    createScript: () => document.createElement("script"),
    appendScript: (script) => document.head.appendChild(script as HTMLScriptElement),
  },
  MAPLIBRE_VENDOR_URL,
);

export function loadMapLibre(): Promise<MapLibreModule> {
  return browserLoader.load();
}

export function resetMapLibreLoader(): void {
  browserLoader.reset();
}
