import { describe, expect, test } from "bun:test";
import {
  ROUTE_DETAIL_TABS,
  routeSectionCanNavigate,
  routeSectionNavigationTarget,
  routeSectionRegistry,
  routeSectionTitle,
  routeTabForSection,
  routeTabRegistry,
  sectionPresentation,
  tabPresentation,
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

/** Flagship-shaped route: everything built. */
const rich = capability({
  condition: surface("ready"),
  map: surface("ready"),
  trend: surface("ready"),
  speedHistory: surface("ready"),
  reliability: surface("ready"),
  ridership: surface("partial"),
  treatment: surface("ready"),
  scheduleBaseline: surface("ready"),
  detectorFindings: surface("ready"),
});

/** Clean route: detectors looked, found nothing; treatments don't apply. */
const clean = capability({
  condition: surface("ready"),
  map: surface("ready"),
  trend: surface("ready"),
  speedHistory: surface("checked_clean"),
  reliability: surface("checked_clean"),
  ridership: surface("ready"),
  treatment: surface("not_applicable", null),
  scheduleBaseline: surface("ready"),
  detectorFindings: surface("checked_clean"),
});

/** Sparse route: almost nothing built yet. */
const sparse = capability({
  condition: surface("partial"),
  map: surface("ready"),
  trend: surface("insufficient_data", null),
  speedHistory: surface("building"),
  reliability: surface("insufficient_data", null),
  ridership: surface("insufficient_data", null),
  treatment: surface("blocked"),
  scheduleBaseline: surface("ready"),
  detectorFindings: surface("insufficient_data", null),
});

describe("sectionPresentation (frontend §8.1 registry)", () => {
  test("route detail sections use plain public titles", () => {
    expect(routeSectionTitle("overview")).toBe("Overview");
    expect(routeSectionTitle("map")).toBe("Route map");
    expect(routeSectionTitle("where-when")).toBe("Slow segments");
    expect(routeSectionTitle("reliability")).toBe("Reliability");
    expect(routeSectionTitle("riders")).toBe("Riders");
    expect(routeSectionTitle("treatments")).toBe("Treatments & history");
    expect(routeSectionTitle("evidence")).toBe("Evidence & data notes");
  });

  test("overview and evidence are unconditional on every contrast route", () => {
    for (const cap of [rich, clean, sparse, null]) {
      expect(sectionPresentation(cap, "overview")).toEqual({ mode: "render" });
      expect(sectionPresentation(cap, "evidence")).toEqual({ mode: "render" });
    }
  });

  test("rich route renders every section", () => {
    for (const section of ["map", "where-when", "reliability", "riders", "treatments"] as const) {
      expect(sectionPresentation(rich, section)).toEqual({ mode: "render" });
    }
  });

  test("clean route shows checked_clean as an affirmative empty state, hides not_applicable", () => {
    expect(sectionPresentation(clean, "where-when")).toEqual({
      mode: "empty",
      state: "checked_clean",
      reason: "because checked_clean",
      dataAsOf: "2026-03",
    });
    expect(sectionPresentation(clean, "riders")).toEqual({ mode: "render" });
    expect(sectionPresentation(clean, "treatments")).toEqual({
      mode: "hidden",
      state: "not_applicable",
      reason: "because not_applicable",
      dataAsOf: null,
    });
    expect(sectionPresentation(clean, "reliability")).toMatchObject({
      mode: "empty",
      state: "checked_clean",
    });
  });

  test("sparse route gets the honest-empty vocabulary, not blank sections", () => {
    expect(sectionPresentation(sparse, "map")).toEqual({ mode: "render" });
    expect(sectionPresentation(sparse, "where-when")).toMatchObject({
      mode: "empty",
      state: "building",
    });
    expect(sectionPresentation(sparse, "reliability")).toMatchObject({
      mode: "hidden",
      state: "insufficient_data",
    });
    expect(sectionPresentation(sparse, "riders")).toMatchObject({
      mode: "empty",
      state: "insufficient_data",
      dataAsOf: null,
    });
    expect(sectionPresentation(sparse, "treatments")).toMatchObject({
      mode: "empty",
      state: "blocked",
    });
  });

  test("null capability (legacy fallback) renders everything", () => {
    for (const section of ["map", "where-when", "reliability", "riders", "treatments"] as const) {
      expect(sectionPresentation(null, section)).toEqual({ mode: "render" });
    }
  });

  test("manifest missing the backing surface renders rather than hides", () => {
    expect(sectionPresentation(capability({}), "riders")).toEqual({ mode: "render" });
  });

  test("routeSectionRegistry reflects the three contrast route shapes", () => {
    expect(
      routeSectionRegistry(rich).visibleSections.map((section) => [
        section.value,
        section.emptyState,
      ]),
    ).toEqual([
      ["overview", undefined],
      ["where-when", undefined],
      ["map", undefined],
      ["reliability", undefined],
      ["riders", undefined],
      ["treatments", undefined],
      ["evidence", undefined],
    ]);
    expect(
      routeSectionRegistry(clean).visibleSections.map((section) => [
        section.value,
        section.emptyState,
      ]),
    ).toEqual([
      ["overview", undefined],
      ["where-when", "checked_clean"],
      ["map", undefined],
      ["reliability", "checked_clean"],
      ["riders", undefined],
      ["evidence", undefined],
    ]);
    expect(
      routeSectionRegistry(sparse).visibleSections.map((section) => [
        section.value,
        section.emptyState,
      ]),
    ).toEqual([
      ["overview", undefined],
      ["where-when", "building"],
      ["map", undefined],
      ["riders", "insufficient_data"],
      ["treatments", "blocked"],
      ["evidence", undefined],
    ]);
  });

  test("routeSectionRegistry keeps the visible section order for contrast route shapes", () => {
    expect(routeSectionRegistry(rich).visibleSections.map((section) => section.value)).toEqual([
      "overview",
      "where-when",
      "map",
      "reliability",
      "riders",
      "treatments",
      "evidence",
    ]);
    expect(routeSectionRegistry(clean).visibleSections.map((section) => section.value)).toEqual([
      "overview",
      "where-when",
      "map",
      "reliability",
      "riders",
      "evidence",
    ]);
    expect(routeSectionRegistry(sparse).visibleSections.map((section) => section.value)).toEqual([
      "overview",
      "where-when",
      "map",
      "riders",
      "treatments",
      "evidence",
    ]);
  });

  test("routeSectionRegistry gives Evidence the withheld section reasons", () => {
    expect(
      routeSectionRegistry(clean).hiddenSections.map(({ section, presentation }) => ({
        section: section.value,
        label: section.label,
        mode: presentation.mode,
        state: presentation.state,
      })),
    ).toEqual([
      {
        section: "treatments",
        label: "Treatments & history",
        mode: "hidden",
        state: "not_applicable",
      },
    ]);
    expect(
      routeSectionRegistry(sparse).hiddenSections.map(({ section, presentation }) => ({
        section: section.value,
        label: section.label,
        mode: presentation.mode,
        state: presentation.state,
      })),
    ).toEqual([
      {
        section: "reliability",
        label: "Reliability",
        mode: "hidden",
        state: "insufficient_data",
      },
    ]);
  });

  test("routeSectionRegistry attaches detector badges and points hidden sections to Evidence", () => {
    const registry = routeSectionRegistry(sparse, {
      reliability: { count: 2, severity: "high" },
      riders: { count: 1, severity: "medium" },
    });

    expect(
      registry.visibleSections.map((section) => [section.value, section.badge?.count ?? 0]),
    ).toEqual([
      ["overview", 0],
      ["where-when", 0],
      ["map", 0],
      ["riders", 1],
      ["treatments", 0],
      ["evidence", 1],
    ]);
    expect(
      registry.visibleSections.find((section) => section.value === "evidence")?.badge?.severity,
    ).toBe("medium");
    expect(
      registry.hiddenSections.map(({ section }) => [section.value, section.badge?.count ?? 0]),
    ).toEqual([["reliability", 2]]);
  });

  test("routeSectionRegistry combines Evidence detector badges with hidden-section notices", () => {
    const registry = routeSectionRegistry(sparse, {
      evidence: { count: 3, severity: "high" },
    });

    const evidence = registry.visibleSections.find((section) => section.value === "evidence");
    expect(evidence?.badge).toEqual({ count: 4, severity: "high" });
  });

  test("routeSectionRegistry raises low Evidence badges when hidden notices are added", () => {
    const registry = routeSectionRegistry(sparse, {
      evidence: { count: 1, severity: "low" },
    });

    const evidence = registry.visibleSections.find((section) => section.value === "evidence");
    expect(evidence?.badge).toEqual({ count: 2, severity: "medium" });
  });

  test("routeSectionCanNavigate follows hidden-section policy for header KPI clicks", () => {
    expect(routeSectionCanNavigate(routeSectionRegistry(rich), "reliability")).toBe(true);
    expect(routeSectionCanNavigate(routeSectionRegistry(clean), "where-when")).toBe(true);
    expect(routeSectionCanNavigate(routeSectionRegistry(clean), "treatments")).toBe(false);
    expect(routeSectionCanNavigate(routeSectionRegistry(sparse), "reliability")).toBe(false);
    expect(routeSectionCanNavigate(routeSectionRegistry(sparse), "riders")).toBe(true);
  });

  test("routeSectionNavigationTarget falls back to Evidence for hidden-section CTAs", () => {
    expect(routeSectionNavigationTarget(routeSectionRegistry(rich), "reliability")).toBe(
      "reliability",
    );
    expect(routeSectionNavigationTarget(routeSectionRegistry(clean), "where-when")).toBe(
      "where-when",
    );
    expect(routeSectionNavigationTarget(routeSectionRegistry(clean), "treatments")).toBe(
      "evidence",
    );
    expect(routeSectionNavigationTarget(routeSectionRegistry(clean), "treatments", null)).toBe(
      null,
    );
    expect(routeSectionNavigationTarget(routeSectionRegistry(sparse), "reliability")).toBe(
      "evidence",
    );
  });
});

describe("route tab layer (plan 053 §4 redesign)", () => {
  test("maps each section to its owning tab; evidence belongs to no tab", () => {
    expect(routeTabForSection("overview")).toBe("overview");
    expect(routeTabForSection("where-when")).toBe("segments");
    expect(routeTabForSection("map")).toBe("segments");
    expect(routeTabForSection("riders")).toBe("riders");
    expect(routeTabForSection("reliability")).toBe("riders");
    expect(routeTabForSection("treatments")).toBe("history");
    expect(routeTabForSection("evidence")).toBeNull();
  });

  test("tabPresentation collapses member sections to the best-of outcome", () => {
    const richRegistry = routeSectionRegistry(rich);
    const cleanRegistry = routeSectionRegistry(clean);
    const sparseRegistry = routeSectionRegistry(sparse);
    const [, segmentsTab, ridersTab, historyTab] = ROUTE_DETAIL_TABS;

    // Segments = [where-when, map]: the map surface is ready on every fixture,
    // so render always wins even when speedHistory is empty/building.
    for (const registry of [richRegistry, cleanRegistry, sparseRegistry]) {
      expect(tabPresentation(registry, segmentsTab)).toEqual({ mode: "render" });
    }

    // Riders = [riders, reliability].
    expect(tabPresentation(richRegistry, ridersTab)).toEqual({ mode: "render" });
    expect(tabPresentation(cleanRegistry, ridersTab)).toEqual({ mode: "render" });
    // Sparse: ridership insufficient_data → empty; reliability hidden is skipped,
    // so the tab carries the empty state rather than disappearing.
    expect(tabPresentation(sparseRegistry, ridersTab)).toEqual({
      mode: "empty",
      state: "insufficient_data",
    });

    // History = [treatments].
    expect(tabPresentation(richRegistry, historyTab)).toEqual({ mode: "render" });
    expect(tabPresentation(cleanRegistry, historyTab)).toEqual({ mode: "hidden" });
    expect(tabPresentation(sparseRegistry, historyTab)).toEqual({
      mode: "empty",
      state: "blocked",
    });
  });

  test("rich route shows all four tabs, every one rendering", () => {
    const registry = routeTabRegistry(rich);
    expect(registry.visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "segments",
      "riders",
      "history",
    ]);
    expect(registry.presentations).toEqual({
      overview: { mode: "render" },
      segments: { mode: "render" },
      riders: { mode: "render" },
      history: { mode: "render" },
    });
  });

  test("clean route hides the History tab (treatments not applicable)", () => {
    const registry = routeTabRegistry(clean);
    expect(registry.visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "segments",
      "riders",
    ]);
    expect(registry.presentations.history).toEqual({ mode: "hidden" });
    // Segments stays visible+render because the map surface is ready even though
    // speedHistory is only checked_clean.
    expect(registry.presentations.segments).toEqual({ mode: "render" });
  });

  test("sparse route keeps all four tabs with honest-empty trigger states", () => {
    const registry = routeTabRegistry(sparse);
    expect(registry.visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "segments",
      "riders",
      "history",
    ]);
    expect(registry.presentations).toEqual({
      overview: { mode: "render" },
      segments: { mode: "render" },
      riders: { mode: "empty", state: "insufficient_data" },
      history: { mode: "empty", state: "blocked" },
    });
  });

  test("tab badges sum member-section notice counts at the max severity", () => {
    const registry = routeTabRegistry(rich, {
      reliability: { count: 2, severity: "high" },
      riders: { count: 1, severity: "medium" },
      treatments: { count: 1, severity: "low" },
    });
    const badgeByTab = new Map(registry.visibleTabs.map((tab) => [tab.value, tab.badge]));

    // Riders = riders(1, medium) + reliability(2, high) → 3 at the higher severity.
    expect(badgeByTab.get("riders")).toEqual({ count: 3, severity: "high" });
    expect(badgeByTab.get("history")).toEqual({ count: 1, severity: "low" });
    expect(badgeByTab.get("segments")).toBeUndefined();
    expect(badgeByTab.get("overview")).toBeUndefined();
  });
});
