import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteDetailShell } from "../../src/components/route/RouteDetailShell";
import { routeSectionRegistry } from "../../src/components/route/section-registry";
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

function renderShell(capability: StudioRouteCapability) {
  const registry = routeSectionRegistry(capability, {
    reliability: { count: 2, severity: "high" },
    riders: { count: 1, severity: "medium" },
  });

  return renderToStaticMarkup(
    createElement(RouteDetailShell, {
      header: createElement("h1", null, "Route shell"),
      sections: registry.visibleSections,
      children: createElement("section", null, "Shell body"),
    }),
  );
}

describe("RouteDetailShell section render contract", () => {
  test("renders distinct section indexes for the §8.1 contrast route shapes", () => {
    const richHtml = renderShell(rich);
    const cleanHtml = renderShell(clean);
    const sparseHtml = renderShell(sparse);

    expect(richHtml).toContain("Reliability");
    expect(richHtml).toContain("Treatments &amp; history");
    expect(cleanHtml).toContain("Reliability");
    expect(cleanHtml).not.toContain("Treatments &amp; history");
    expect(sparseHtml).not.toContain("Reliability");
    expect(sparseHtml).toContain("Treatments &amp; history");

    for (const html of [richHtml, cleanHtml, sparseHtml]) {
      expect(html).toContain("Overview");
      expect(html).toContain("Route map");
      expect(html).toContain("Evidence &amp; data notes");
      expect(html).toContain('href="#route-section-overview"');
    }
  });

  test("keeps only the slim section nav sticky inside the route scroller", () => {
    const richHtml = renderShell(rich);

    expect(richHtml).toContain('id="route-section-overview"');
    expect(richHtml).toContain("h-full min-h-0 overflow-auto");
    expect(richHtml).toContain("sticky top-0 z-10");
    expect(richHtml).toContain("scroll-mt-16");
  });

  test("renders badges only for visible sections", () => {
    const sparseHtml = renderShell(sparse);

    expect(sparseHtml).toContain('aria-label="1 notice"');
    expect(sparseHtml).not.toContain('aria-label="2 notices"');
  });

  test("marks visible honest-empty sections without exposing hidden sections", () => {
    const cleanHtml = renderShell(clean);
    const sparseHtml = renderShell(sparse);

    expect(cleanHtml).toContain("Checked");
    expect(cleanHtml).not.toContain("Treatments &amp; history");
    expect(sparseHtml).toContain("Building");
    expect(sparseHtml).toContain("Thin");
    expect(sparseHtml).toContain("Blocked");
    expect(sparseHtml).not.toContain("Reliability");
  });

  test("does not render the retired question-shaped section titles", () => {
    const richHtml = renderShell(rich);

    expect(richHtml).not.toContain("Where and when does it lose time?");
    expect(richHtml).not.toContain("Can riders count on it?");
    expect(richHtml).not.toContain("What can I cite?");
    expect(richHtml).toContain('href="#route-section-where-when"');
  });
});
