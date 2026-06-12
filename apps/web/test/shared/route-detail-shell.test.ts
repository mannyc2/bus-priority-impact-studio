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
      tabs: registry.visibleTabs,
      value: "overview",
      onValueChange: () => undefined,
      children: createElement("section", null, "Shell body"),
    }),
  );
}

describe("RouteDetailShell tab render contract", () => {
  test("renders distinct tab sets for the §8.1 contrast route shapes", () => {
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
      expect(html).toContain("Map");
      expect(html).toContain("Evidence");
    }
  });

  test("renders badges only for visible tabs", () => {
    const sparseHtml = renderShell(sparse);

    expect(sparseHtml).toContain('aria-label="1 notice"');
    expect(sparseHtml).not.toContain('aria-label="2 notices"');
  });

  test("marks visible honest-empty tabs without exposing hidden tabs", () => {
    const cleanHtml = renderShell(clean);
    const sparseHtml = renderShell(sparse);

    expect(cleanHtml).toContain("Checked");
    expect(cleanHtml).not.toContain("Treatments &amp; history");
    expect(sparseHtml).toContain("Building");
    expect(sparseHtml).toContain("Thin");
    expect(sparseHtml).toContain("Blocked");
    expect(sparseHtml).not.toContain("Reliability");
  });

  test("preserves question-shaped tab titles in the shell chrome", () => {
    const richHtml = renderShell(rich);

    expect(richHtml).toContain('title="Where and when does it lose time?"');
    expect(richHtml).toContain('title="Can riders count on it?"');
    expect(richHtml).toContain('title="What can I cite, and what did you check?"');
  });
});
