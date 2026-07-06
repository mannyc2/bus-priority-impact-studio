import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteDetailShell } from "../../src/components/route/RouteDetailShell";
import {
  type RouteDetailSectionValue,
  type RouteDetailTabValue,
  routeTabRegistry,
} from "../../src/components/route/section-registry";
import type { RouteSurfaceCapability, StudioRouteCapability } from "../../src/studio/api-contract";

function surface(state: RouteSurfaceCapability["state"], dataAsOf: string | null = "2026-03") {
  return {
    state,
    reason: state === "ready" ? null : `because ${state}`,
    depth: null,
    dataAsOf,
    freshness: "current",
  } satisfies RouteSurfaceCapability;
}

function capability(surfaces: Record<string, RouteSurfaceCapability>): StudioRouteCapability {
  return { overallState: "ready", surfaces, caveats: [] };
}

const rich = capability({
  map: surface("ready"),
  speedHistory: surface("ready"),
  reliability: surface("ready"),
  ridership: surface("partial"),
  treatment: surface("ready"),
});

const clean = capability({
  map: surface("ready"),
  speedHistory: surface("checked_clean"),
  reliability: surface("checked_clean"),
  ridership: surface("ready"),
  treatment: surface("not_applicable", null),
});

const sparse = capability({
  map: surface("ready"),
  speedHistory: surface("building"),
  reliability: surface("insufficient_data", null),
  ridership: surface("insufficient_data", null),
  treatment: surface("blocked"),
});

function renderShell(
  cap: StudioRouteCapability,
  activeTab: RouteDetailTabValue = "overview",
  sectionBadges: Partial<
    Record<RouteDetailSectionValue, { count: number; severity: "low" | "medium" | "high" }>
  > = {},
) {
  const registry = routeTabRegistry(cap, sectionBadges);

  return renderToStaticMarkup(
    createElement(RouteDetailShell, {
      header: createElement("h1", null, "Route shell header"),
      tabs: registry.visibleTabs,
      activeTab,
      onTabChange: () => {},
      aboutData: createElement("div", null, "About body content"),
      children: createElement("section", null, "Active panel body"),
    }),
  );
}

describe("RouteDetailShell tab shell (plan 053)", () => {
  test("renders one trigger per visible tab for the rich route", () => {
    const html = renderShell(rich);

    expect(html).toContain("Overview");
    expect(html).toContain("Slow segments");
    expect(html).toContain("Riders &amp; reliability");
    expect(html).toContain("Treatments &amp; history");
    expect(html).toContain('role="tablist"');
    expect(html.split('role="tab"').length - 1).toBe(4);
  });

  test("hides the History tab for the clean route", () => {
    const html = renderShell(clean);

    expect(html).toContain("Slow segments");
    expect(html).toContain("Riders &amp; reliability");
    expect(html).not.toContain("Treatments &amp; history");
    expect(html.split('role="tab"').length - 1).toBe(3);
  });

  test("renders the active panel content and the About-this-data collapsible", () => {
    const html = renderShell(rich);

    expect(html).toContain("Active panel body");
    expect(html).toContain("About this data");
    expect(html).toContain('data-slot="collapsible"');
  });

  test("marks the active tab and stamps honest-empty trigger badges", () => {
    const html = renderShell(sparse);

    expect(html).toContain('aria-selected="true"');
    // sparse: riders tab empty(insufficient_data) → "Thin"; history empty(blocked) → "Blocked".
    expect(html).toContain("Thin");
    expect(html).toContain("Blocked");
  });

  test("sums member-section notices into a trigger badge", () => {
    const html = renderShell(rich, "overview", { riders: { count: 1, severity: "medium" } });

    expect(html).toContain('aria-label="1 notice"');
  });

  test("drops the retired anchor-scroll nav (no #route-section hrefs)", () => {
    const html = renderShell(rich);

    expect(html).not.toContain("route-section-");
    expect(html).not.toContain('href="#');
  });
});
