export type MapRuntimeMap = {
  on(type: "load" | "error", listener: (event?: unknown) => void): unknown;
  off(type: "load" | "error", listener: (event?: unknown) => void): unknown;
  remove(): void;
};

export type MapRuntimeOptions<TVendor, TMap extends MapRuntimeMap> = {
  loadVendor: () => Promise<TVendor>;
  resetVendor: () => void;
  createMap: (vendor: TVendor) => TMap;
  onReady: (map: TMap) => void;
  onFatal: (error: unknown) => void;
  onRecoverableError: (error: unknown) => void;
  onCleanup?: (map: TMap) => void;
};

export type MapRuntimeController = {
  cleanup: () => void;
  retry: () => void;
};

function eventError(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "error" in event) {
    return (event as { error: unknown }).error;
  }
  return event;
}

export function startMapLibreRuntime<TVendor, TMap extends MapRuntimeMap>(
  options: MapRuntimeOptions<TVendor, TMap>,
): MapRuntimeController {
  let disposed = false;
  let attempt = 0;
  let currentMap: TMap | null = null;
  let ready = false;
  let removed = false;

  const onLoad = () => {
    const map = currentMap;
    if (disposed || map === null || removed) return;
    try {
      options.onReady(map);
      ready = true;
    } catch (error) {
      fatal(error);
    }
  };

  const onError = (event?: unknown) => {
    const error = eventError(event);
    if (ready) {
      options.onRecoverableError(error);
      return;
    }
    fatal(error);
  };

  const detachAndRemove = () => {
    const map = currentMap;
    if (map === null || removed) return;
    removed = true;
    map.off("load", onLoad);
    map.off("error", onError);
    options.onCleanup?.(map);
    map.remove();
    currentMap = null;
    ready = false;
  };

  function fatal(error: unknown): void {
    if (disposed || removed) return;
    detachAndRemove();
    options.onFatal(error);
  }

  const begin = () => {
    const ownAttempt = ++attempt;
    removed = false;
    ready = false;
    options
      .loadVendor()
      .then((vendor) => {
        if (disposed || ownAttempt !== attempt) return;
        try {
          const map = options.createMap(vendor);
          currentMap = map;
          map.on("load", onLoad);
          map.on("error", onError);
        } catch (error) {
          fatal(error);
        }
      })
      .catch((error: unknown) => {
        if (!disposed && ownAttempt === attempt) fatal(error);
      });
  };

  begin();

  return {
    cleanup: () => {
      if (disposed) return;
      disposed = true;
      attempt += 1;
      detachAndRemove();
    },
    retry: () => {
      if (disposed) return;
      attempt += 1;
      detachAndRemove();
      options.resetVendor();
      begin();
    },
  };
}
