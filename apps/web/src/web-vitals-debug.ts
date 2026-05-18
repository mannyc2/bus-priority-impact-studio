import { NAVIGATION_RENDERED_EVENT, type NavigationEventDetail } from "./router-events.js";

declare global {
  interface Window {
    __bpDebugPerformanceCleanup?: () => void;
  }
}

export function installDebugPerformanceReporter(): void {
  if (!shouldInstallDebugReporter()) {
    return;
  }

  window.__bpDebugPerformanceCleanup?.();

  const cleanups: Array<() => void> = [];
  const onNavigationRendered = (event: Event) => {
    const detail = (event as CustomEvent<NavigationEventDetail>).detail;
    const measure = performance.getEntriesByName("bp:navigation").at(-1);
    console.info("[bp:perf] navigation", {
      toPath: detail.toPath,
      fromPath: detail.fromPath,
      durationMs: measure ? Math.round(measure.duration) : null,
      pathChanged: detail.pathChanged,
      hrefChanged: detail.hrefChanged,
    });
  };

  window.addEventListener(NAVIGATION_RENDERED_EVENT, onNavigationRendered);
  cleanups.push(() => window.removeEventListener(NAVIGATION_RENDERED_EVENT, onNavigationRendered));

  installPerformanceObserver(
    "largest-contentful-paint",
    (entries) => {
      const entry = entries.at(-1);
      if (entry) {
        console.info("[bp:perf] LCP", { startTimeMs: Math.round(entry.startTime) });
      }
    },
    cleanups,
  );

  installPerformanceObserver(
    "layout-shift",
    (entries) => {
      const cls = entries.reduce((sum, entry) => {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        return layoutShift.hadRecentInput ? sum : sum + (layoutShift.value ?? 0);
      }, 0);
      if (cls > 0) {
        console.info("[bp:perf] CLS", { value: Number(cls.toFixed(4)) });
      }
    },
    cleanups,
  );

  window.__bpDebugPerformanceCleanup = () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

function shouldInstallDebugReporter(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }

  try {
    return window.localStorage.getItem("bpDebugVitals") === "1";
  } catch {
    return false;
  }
}

function installPerformanceObserver(
  type: string,
  onEntries: (entries: PerformanceEntry[]) => void,
  cleanups: Array<() => void>,
): void {
  if (!("PerformanceObserver" in window)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
    observer.observe({ type, buffered: true });
    cleanups.push(() => observer.disconnect());
  } catch {
    // Some browsers do not support every observer type; debug reporting should never break the app.
  }
}
