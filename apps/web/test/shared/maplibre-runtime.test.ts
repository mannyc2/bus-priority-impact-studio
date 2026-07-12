import { describe, expect, test } from "bun:test";
import {
  createMapLibreLoader,
  type MapLibreModule,
} from "../../src/components/route/load-maplibre";
import {
  type MapRuntimeMap,
  startMapLibreRuntime,
} from "../../src/components/route/maplibre-runtime";

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
  await Promise.resolve();
  await Promise.resolve();
}

describe("MapLibre loader and runtime", () => {
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
});
