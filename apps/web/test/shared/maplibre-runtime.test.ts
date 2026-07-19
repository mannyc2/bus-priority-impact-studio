import { describe, expect, test } from "bun:test";
import {
  createMapLibreLoader,
  createMapLibrePreloader,
  type MapLibreModule,
} from "../../src/components/route/load-maplibre";
import {
  type MapRuntimeMap,
  startMapLibreRuntime,
} from "../../src/components/route/maplibre-runtime";
import { networkMapAriaLabel } from "../../src/components/route/NetworkMapLibre";
import {
  applyNetworkMapControlInset,
  applySelectedSegmentPresentation,
  createNetworkFocusController,
  networkMapFitDuration,
  networkMapFitPadding,
  resolveNetworkFocusPresentation,
  resolveNetworkMapInspectorInset,
  routeSegmentFeatureCollection,
} from "../../src/components/route/NetworkMapLibre.map";

class FakeScript {
  src = "";
  async = false;
  removed = false;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<"load" | "error", Set<() => void>>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: "load" | "error", listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: "load" | "error", listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  remove(): void {
    this.removed = true;
  }

  emit(type: "load" | "error"): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

class FakeMap implements MapRuntimeMap {
  removeCalls = 0;
  readonly listeners = new Map<"load" | "error", Set<(event?: unknown) => void>>();

  on(type: "load" | "error", listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  off(type: "load" | "error", listener: (event?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  remove(): void {
    this.removeCalls += 1;
  }

  emit(type: "load" | "error", event?: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

function presentationHarness() {
  const featureStateCalls: Array<{
    target: { source: string; id?: string | number };
    state: Record<string, unknown>;
  }> = [];
  const paintCalls: Array<{ layerId: string; name: string; value: unknown }> = [];
  let setDataCalls = 0;
  const map = {
    setFeatureState(
      target: { source: string; id?: string | number },
      state: Record<string, unknown>,
    ) {
      featureStateCalls.push({ target, state });
      return map;
    },
    setPaintProperty(layerId: string, name: string, value: unknown) {
      paintCalls.push({ layerId, name, value });
      return map;
    },
  } as unknown as Parameters<typeof createNetworkFocusController>[0];
  const networkSource = {
    setData: () => {
      setDataCalls += 1;
    },
  };
  return {
    map,
    networkSource,
    featureStateCalls,
    paintCalls,
    setDataCalls: () => setDataCalls,
  };
}

describe("MapLibre loader and runtime", () => {
  test("shared map CSS does not override each surface's concrete minimum height", async () => {
    const css = await Bun.file(new URL("../../src/global.css", import.meta.url)).text();
    const sharedMapRule = css.match(/\.bp-bus-map\s*\{[^}]*\}/)?.[0] ?? "";

    expect(sharedMapRule).toContain("height: 100%");
    expect(sharedMapRule).not.toContain("min-height");
  });

  test("preload is a guarded, deduplicated hint that retries after rejection", async () => {
    let available = false;
    let componentLoads = 0;
    let vendorLoads = 0;
    let rejectVendor = true;
    const preload = createMapLibrePreloader({
      available: () => available,
      loadComponent: async () => {
        componentLoads += 1;
      },
      loadVendor: async () => {
        vendorLoads += 1;
        if (rejectVendor) throw new Error("vendor unavailable");
      },
    });

    preload();
    await settle();
    expect(componentLoads).toBe(0);
    expect(vendorLoads).toBe(0);

    available = true;
    preload();
    preload();
    await settle();
    expect(componentLoads).toBe(1);
    expect(vendorLoads).toBe(1);

    rejectVendor = false;
    preload();
    await settle();
    expect(componentLoads).toBe(2);
    expect(vendorLoads).toBe(2);

    preload();
    await settle();
    expect(componentLoads).toBe(2);
    expect(vendorLoads).toBe(2);
  });

  test("a rejected vendor load resets so a second call can resolve", async () => {
    const scripts: FakeScript[] = [];
    let loadedModule: MapLibreModule | undefined;
    const loader = createMapLibreLoader(
      {
        available: () => true,
        loadedModule: () => loadedModule,
        findScript: () => scripts.find((script) => !script.removed) ?? null,
        createScript: () => new FakeScript(),
        appendScript: (script) => scripts.push(script as FakeScript),
      },
      "/vendor/maplibre-gl.js",
    );

    const firstLoad = loader.load();
    scripts[0]?.emit("error");
    await expect(firstLoad).rejects.toThrow("MapLibre vendor script failed.");
    expect(scripts[0]?.removed).toBe(true);

    const secondLoad = loader.load();
    loadedModule = {} as MapLibreModule;
    scripts[1]?.emit("load");
    expect(await secondLoad).toBe(loadedModule);
    expect(scripts).toHaveLength(2);
  });

  test("a fatal pre-load error removes the map exactly once", async () => {
    const map = new FakeMap();
    const fatalErrors: unknown[] = [];
    startMapLibreRuntime({
      loadVendor: async () => ({}),
      resetVendor: () => undefined,
      createMap: () => map,
      onReady: () => undefined,
      onFatal: (error) => fatalErrors.push(error),
      onRecoverableError: () => undefined,
    });
    await settle();

    const error = new Error("style failed");
    map.emit("error", { error });
    map.emit("error", { error });

    expect(fatalErrors).toEqual([error]);
    expect(map.removeCalls).toBe(1);
  });

  test("a post-load error is recoverable and keeps the map", async () => {
    const map = new FakeMap();
    const recoverableErrors: unknown[] = [];
    startMapLibreRuntime({
      loadVendor: async () => ({}),
      resetVendor: () => undefined,
      createMap: () => map,
      onReady: () => undefined,
      onFatal: () => undefined,
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await settle();

    const warning = new Error("source warning");
    map.emit("load");
    map.emit("error", { error: warning });

    expect(recoverableErrors).toEqual([warning]);
    expect(map.removeCalls).toBe(0);
  });

  test("cleanup detaches every runtime handler and removes once", async () => {
    const map = new FakeMap();
    const controller = startMapLibreRuntime({
      loadVendor: async () => ({}),
      resetVendor: () => undefined,
      createMap: () => map,
      onReady: () => undefined,
      onFatal: () => undefined,
      onRecoverableError: () => undefined,
    });
    await settle();

    controller.cleanup();
    controller.cleanup();

    expect(map.listeners.get("load")?.size).toBe(0);
    expect(map.listeners.get("error")?.size).toBe(0);
    expect(map.removeCalls).toBe(1);
  });

  test("hover previews cross routes with constant feature-state work and no source update", () => {
    const harness = presentationHarness();
    const focus = createNetworkFocusController(harness.map);

    for (let index = 0; index < 10; index += 1) focus.preview(`route-${index}`);

    expect(harness.featureStateCalls).toHaveLength(19);
    expect(harness.paintCalls).toHaveLength(0);
    expect(harness.setDataCalls()).toBe(0);
  });

  test("pinned focus changes only old/new feature state plus fixed layer paint", () => {
    const harness = presentationHarness();
    const focus = createNetworkFocusController(harness.map);

    for (let index = 0; index < 10; index += 1) focus.focus(`route-${index}`);

    expect(harness.featureStateCalls).toHaveLength(19);
    expect(harness.paintCalls).toHaveLength(3);
    expect(harness.setDataCalls()).toBe(0);

    focus.focus(null);
    expect(harness.featureStateCalls).toHaveLength(20);
    expect(harness.paintCalls).toHaveLength(6);
    expect(harness.setDataCalls()).toBe(0);
  });

  test("focus sources keep keyboard, map hover, list preview, and pin priorities distinct", () => {
    const base = {
      focusedRouteId: "keyboard",
      hoveredRouteId: "map-hover",
      hoverDimEngaged: false,
      previewRouteId: "list-hover",
      selectedRouteId: "pin",
    };

    expect(resolveNetworkFocusPresentation(base)).toEqual({
      mode: "focus",
      routeId: "keyboard",
    });
    expect(resolveNetworkFocusPresentation({ ...base, focusedRouteId: null })).toEqual({
      mode: "preview",
      routeId: "map-hover",
    });
    expect(
      resolveNetworkFocusPresentation({
        ...base,
        focusedRouteId: null,
        hoveredRouteId: null,
      }),
    ).toEqual({ mode: "focus", routeId: "list-hover" });
    expect(
      resolveNetworkFocusPresentation({
        ...base,
        focusedRouteId: null,
        hoveredRouteId: null,
        previewRouteId: null,
      }),
    ).toEqual({ mode: "focus", routeId: "pin" });
  });

  test("the inspector only insets the desktop map and shares that inset with camera padding", () => {
    expect(resolveNetworkMapInspectorInset({ inspectorOpen: true, desktopViewport: false })).toBe(
      0,
    );
    expect(resolveNetworkMapInspectorInset({ inspectorOpen: true, desktopViewport: true })).toBe(
      360,
    );
    expect(
      resolveNetworkMapInspectorInset({
        inspectorOpen: true,
        desktopViewport: true,
        inspectorInset: 412,
      }),
    ).toBe(412);
    expect(networkMapFitPadding(412)).toEqual({ top: 28, right: 440, bottom: 28, left: 28 });

    const controls = { style: { right: "" } };
    const map = {
      getContainer: () => ({ querySelector: () => controls }),
    } as unknown as Parameters<typeof applyNetworkMapControlInset>[0];
    applyNetworkMapControlInset(map, 412);
    expect(controls.style.right).toBe("412px");
  });

  test("camera refits are instant for initial load and reduced-motion users", () => {
    expect(networkMapFitDuration(false, false)).toBe(0);
    expect(networkMapFitDuration(true, true)).toBe(0);
    expect(networkMapFitDuration(true, false)).toBe(240);
  });

  test("segment pin emphasis changes paint without replacing selected-route geometry", () => {
    const harness = presentationHarness();

    applySelectedSegmentPresentation(harness.map, "m15-n-node-001-node-002");
    applySelectedSegmentPresentation(harness.map, "m15-n-node-002-node-003");

    expect(harness.paintCalls).toHaveLength(6);
    expect(harness.setDataCalls()).toBe(0);
    expect(JSON.stringify(harness.paintCalls)).toContain("m15-n-node-002-node-003");
  });

  test("only matched spine identities survive the route-segment map adapter", () => {
    const segmentCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "matched",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.99, 40.72],
              [-73.98, 40.73],
            ],
          },
          properties: { spineSegmentId: "stable-id", spineJoinStatus: "matched" },
        },
        {
          type: "Feature",
          id: "ambiguous",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.97, 40.74],
              [-73.96, 40.75],
            ],
          },
          properties: { spineSegmentId: "stable-id", spineJoinStatus: "ambiguous" },
        },
      ],
    } as unknown as NonNullable<Parameters<typeof routeSegmentFeatureCollection>[0]>;

    expect(
      routeSegmentFeatureCollection(segmentCollection).features.map(
        (feature) => feature.properties.spineSegmentId,
      ),
    ).toEqual(["stable-id", null]);
  });

  test("the default map-region label tracks lens, period, and highlighted route", () => {
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          properties: { routeId: "M15+", label: "M15 SBS" },
        },
      ],
    } as Parameters<typeof networkMapAriaLabel>[0]["collection"];

    expect(
      networkMapAriaLabel({
        collection,
        view: { lens: "speed", period: "pm", compare: true },
        selectedRouteId: "M15+",
      }),
    ).toBe(
      "NYC bus network PM peak speed compared with all day map showing 1 route; M15 SBS highlighted.",
    );
  });
});
