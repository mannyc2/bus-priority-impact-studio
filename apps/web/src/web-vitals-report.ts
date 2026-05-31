// Real-user web-vitals reporter. Collects core load metrics and sends a single
// beacon to the worker's /api/v1/rum endpoint when the page is hidden, where it
// is recorded as a structured log in Workers Observability. Dev console output
// lives in web-vitals-debug.ts; this module is the production data path.

const RUM_ENDPOINT = "/api/v1/rum";

export function installWebVitalsReporter(): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }

  // Load metrics are attributed to the landing URL, captured before any SPA navigation.
  const landingPath = window.location.pathname;
  let lcp: number | undefined;
  let cls = 0;
  let sent = false;

  const lcpObserver = observe("largest-contentful-paint", (entries) => {
    const entry = entries.at(-1);
    if (entry) {
      lcp = entry.startTime;
    }
  });

  const clsObserver = observe("layout-shift", (entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      if (!shift.hadRecentInput) {
        cls += shift.value ?? 0;
      }
    }
  });

  const flush = (): void => {
    if (sent) {
      return;
    }
    sent = true;
    lcpObserver?.disconnect();
    clsObserver?.disconnect();

    const report = {
      path: landingPath,
      ttfb: positiveMs(navigationEntry()?.responseStart),
      fcp: positiveMs(firstContentfulPaint()),
      lcp: positiveMs(lcp),
      cls: Number(cls.toFixed(4)),
      nav: navigationEntry()?.type,
    };

    navigator.sendBeacon(
      RUM_ENDPOINT,
      new Blob([JSON.stringify(report)], { type: "application/json" }),
    );
  };

  // visibilitychange -> hidden is the most reliable "page is going away" signal;
  // pagehide is a fallback for browsers that skip it (e.g. bfcache evictions).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
  window.addEventListener("pagehide", flush);
}

function navigationEntry(): PerformanceNavigationTiming | undefined {
  return performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
}

function firstContentfulPaint(): number | undefined {
  return performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
}

function positiveMs(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? Math.round(value) : undefined;
}

function observe(
  type: string,
  onEntries: (entries: PerformanceEntry[]) => void,
): PerformanceObserver | undefined {
  if (typeof PerformanceObserver === "undefined") {
    return undefined;
  }

  try {
    const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    // Not every browser supports every observer type; reporting must never break the app.
    return undefined;
  }
}
