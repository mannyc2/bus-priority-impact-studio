import type { router } from "./router.js";

type AppRouter = typeof router;

export const NAVIGATION_RENDERED_EVENT = "bp:navigation:rendered";
export const NAVIGATION_RESOLVED_EVENT = "bp:navigation:resolved";

export type NavigationEventDetail = {
  fromHref?: string;
  fromPath?: string;
  toHref: string;
  toPath: string;
  pathChanged: boolean;
  hrefChanged: boolean;
  hashChanged: boolean;
};

declare global {
  interface Window {
    __bpRouterEventObserversCleanup?: () => void;
  }
}

export function installRouterEventObservers(appRouter: AppRouter): void {
  window.__bpRouterEventObserversCleanup?.();

  const unsubscribeBeforeNavigate = appRouter.subscribe("onBeforeNavigate", (event) => {
    if (!event.hrefChanged) return;
    performance.mark("bp:navigation:start");
  });

  const unsubscribeResolved = appRouter.subscribe("onResolved", (event) => {
    dispatchNavigationEvent(NAVIGATION_RESOLVED_EVENT, navigationDetail(event));
  });

  const unsubscribeRendered = appRouter.subscribe("onRendered", (event) => {
    measureNavigation();
    dispatchNavigationEvent(NAVIGATION_RENDERED_EVENT, navigationDetail(event));
  });

  window.__bpRouterEventObserversCleanup = () => {
    unsubscribeBeforeNavigate();
    unsubscribeResolved();
    unsubscribeRendered();
  };
}

function navigationDetail(event: {
  fromLocation?: { href: string };
  toLocation: { href: string };
  pathChanged: boolean;
  hrefChanged: boolean;
  hashChanged: boolean;
}): NavigationEventDetail {
  const detail: NavigationEventDetail = {
    toHref: event.toLocation.href,
    toPath: pathFromHref(event.toLocation.href),
    pathChanged: event.pathChanged,
    hrefChanged: event.hrefChanged,
    hashChanged: event.hashChanged,
  };

  if (event.fromLocation) {
    detail.fromHref = event.fromLocation.href;
    detail.fromPath = pathFromHref(event.fromLocation.href);
  }

  return detail;
}

function dispatchNavigationEvent(name: string, detail: NavigationEventDetail): void {
  window.dispatchEvent(new CustomEvent<NavigationEventDetail>(name, { detail }));
}

function measureNavigation(): void {
  const start = performance.getEntriesByName("bp:navigation:start").at(-1);
  if (!start) return;

  performance.mark("bp:navigation:rendered");
  performance.measure("bp:navigation", "bp:navigation:start", "bp:navigation:rendered");
}

function pathFromHref(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    return url.pathname;
  } catch {
    return href.split("?")[0] ?? href;
  }
}
