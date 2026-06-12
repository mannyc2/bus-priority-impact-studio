import { describe, expect, test } from "bun:test";
import {
  routeSectionCanNavigate,
  routeSectionNavigationTarget,
  routeSectionQuestion,
  routeSectionRegistry,
  sectionPresentation,
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
  test("route detail tabs carry the frontend §4.3 questions", () => {
    expect(routeSectionQuestion("overview")).toBe("What's the story?");
    expect(routeSectionQuestion("map")).toBe("Where does it hurt?");
    expect(routeSectionQuestion("where-when")).toBe("Where and when does it lose time?");
    expect(routeSectionQuestion("reliability")).toBe("Can riders count on it?");
    expect(routeSectionQuestion("riders")).toBe("Who bears it?");
    expect(routeSectionQuestion("treatments")).toBe("What was tried?");
    expect(routeSectionQuestion("evidence")).toBe("What can I cite?");
  });

  test("overview and evidence are unconditional on every contrast route", () => {
    for (const cap of [rich, clean, sparse, null]) {
      expect(sectionPresentation(cap, "overview")).toEqual({ mode: "render" });
      expect(sectionPresentation(cap, "evidence")).toEqual({ mode: "render" });
    }
  });

  test("rich route renders every section", () => {
    for (const tab of ["map", "where-when", "reliability", "riders", "treatments"] as const) {
      expect(sectionPresentation(rich, tab)).toEqual({ mode: "render" });
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
    for (const tab of ["map", "where-when", "reliability", "riders", "treatments"] as const) {
      expect(sectionPresentation(null, tab)).toEqual({ mode: "render" });
    }
  });

  test("manifest missing the backing surface renders rather than hides", () => {
    expect(sectionPresentation(capability({}), "riders")).toEqual({ mode: "render" });
  });

  test("routeSectionRegistry reflects the three contrast route shapes", () => {
    expect(
      routeSectionRegistry(rich).visibleTabs.map((tab) => [tab.value, tab.emptyState]),
    ).toEqual([
      ["overview", undefined],
      ["map", undefined],
      ["where-when", undefined],
      ["reliability", undefined],
      ["riders", undefined],
      ["treatments", undefined],
      ["evidence", undefined],
    ]);
    expect(
      routeSectionRegistry(clean).visibleTabs.map((tab) => [tab.value, tab.emptyState]),
    ).toEqual([
      ["overview", undefined],
      ["map", undefined],
      ["where-when", "checked_clean"],
      ["reliability", "checked_clean"],
      ["riders", undefined],
      ["evidence", undefined],
    ]);
    expect(
      routeSectionRegistry(sparse).visibleTabs.map((tab) => [tab.value, tab.emptyState]),
    ).toEqual([
      ["overview", undefined],
      ["map", undefined],
      ["where-when", "building"],
      ["riders", "insufficient_data"],
      ["treatments", "blocked"],
      ["evidence", undefined],
    ]);
  });

  test("routeSectionRegistry keeps the visible tab order for contrast route shapes", () => {
    expect(routeSectionRegistry(rich).visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "map",
      "where-when",
      "reliability",
      "riders",
      "treatments",
      "evidence",
    ]);
    expect(routeSectionRegistry(clean).visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "map",
      "where-when",
      "reliability",
      "riders",
      "evidence",
    ]);
    expect(routeSectionRegistry(sparse).visibleTabs.map((tab) => tab.value)).toEqual([
      "overview",
      "map",
      "where-when",
      "riders",
      "treatments",
      "evidence",
    ]);
  });

  test("routeSectionRegistry gives Evidence the withheld tab reasons", () => {
    expect(
      routeSectionRegistry(clean).hiddenSections.map(({ tab, presentation }) => ({
        tab: tab.value,
        question: tab.question,
        mode: presentation.mode,
        state: presentation.state,
      })),
    ).toEqual([
      {
        tab: "treatments",
        question: "What was tried?",
        mode: "hidden",
        state: "not_applicable",
      },
    ]);
    expect(
      routeSectionRegistry(sparse).hiddenSections.map(({ tab, presentation }) => ({
        tab: tab.value,
        question: tab.question,
        mode: presentation.mode,
        state: presentation.state,
      })),
    ).toEqual([
      {
        tab: "reliability",
        question: "Can riders count on it?",
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

    expect(registry.visibleTabs.map((tab) => [tab.value, tab.badge?.count ?? 0])).toEqual([
      ["overview", 0],
      ["map", 0],
      ["where-when", 0],
      ["riders", 1],
      ["treatments", 0],
      ["evidence", 1],
    ]);
    expect(registry.visibleTabs.find((tab) => tab.value === "evidence")?.badge?.severity).toBe(
      "medium",
    );
    expect(registry.hiddenSections.map(({ tab }) => [tab.value, tab.badge?.count ?? 0])).toEqual([
      ["reliability", 2],
    ]);
  });

  test("routeSectionRegistry combines Evidence detector badges with hidden-section notices", () => {
    const registry = routeSectionRegistry(sparse, {
      evidence: { count: 3, severity: "high" },
    });

    const evidence = registry.visibleTabs.find((tab) => tab.value === "evidence");
    expect(evidence?.badge).toEqual({ count: 4, severity: "high" });
  });

  test("routeSectionRegistry raises low Evidence badges when hidden notices are added", () => {
    const registry = routeSectionRegistry(sparse, {
      evidence: { count: 1, severity: "low" },
    });

    const evidence = registry.visibleTabs.find((tab) => tab.value === "evidence");
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
