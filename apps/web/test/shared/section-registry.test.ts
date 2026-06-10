import { describe, expect, test } from "bun:test";
import { sectionPresentation } from "../../src/components/route/section-registry";
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

function capability(
  surfaces: Record<string, RouteSurfaceCapability>,
): StudioRouteCapability {
  return { overallState: "ready", surfaces, caveats: [] };
}

/** Flagship-shaped route: everything built. */
const rich = capability({
  condition: surface("ready"),
  trend: surface("ready"),
  speedHistory: surface("ready"),
  reliability: surface("building"),
  ridership: surface("partial"),
  treatment: surface("ready"),
  scheduleBaseline: surface("ready"),
  detectorFindings: surface("ready"),
});

/** Clean route: detectors looked, found nothing; treatments don't apply. */
const clean = capability({
  condition: surface("ready"),
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
  trend: surface("insufficient_data", null),
  speedHistory: surface("building"),
  reliability: surface("insufficient_data", null),
  ridership: surface("insufficient_data", null),
  treatment: surface("blocked"),
  scheduleBaseline: surface("ready"),
  detectorFindings: surface("insufficient_data", null),
});

describe("sectionPresentation (frontend §8.1 registry)", () => {
  test("overview and data-notes are unconditional on every contrast route", () => {
    for (const cap of [rich, clean, sparse, null]) {
      expect(sectionPresentation(cap, "overview")).toEqual({ mode: "render" });
      expect(sectionPresentation(cap, "data-notes")).toEqual({ mode: "render" });
    }
  });

  test("rich route renders every section", () => {
    for (const tab of ["slow-segments", "riders", "interventions", "timeline"]) {
      expect(sectionPresentation(rich, tab)).toEqual({ mode: "render" });
    }
  });

  test("clean route shows checked_clean as an affirmative empty state, hides not_applicable", () => {
    expect(sectionPresentation(clean, "slow-segments")).toEqual({
      mode: "empty",
      state: "checked_clean",
      reason: "because checked_clean",
      dataAsOf: "2026-03",
    });
    expect(sectionPresentation(clean, "riders")).toEqual({ mode: "render" });
    expect(sectionPresentation(clean, "interventions")).toEqual({ mode: "hidden" });
    expect(sectionPresentation(clean, "timeline")).toEqual({ mode: "hidden" });
  });

  test("sparse route gets the honest-empty vocabulary, not blank sections", () => {
    expect(sectionPresentation(sparse, "slow-segments")).toMatchObject({
      mode: "empty",
      state: "building",
    });
    expect(sectionPresentation(sparse, "riders")).toMatchObject({
      mode: "empty",
      state: "insufficient_data",
      dataAsOf: null,
    });
    expect(sectionPresentation(sparse, "interventions")).toMatchObject({
      mode: "empty",
      state: "blocked",
    });
  });

  test("null capability (legacy fallback) renders everything", () => {
    for (const tab of ["slow-segments", "riders", "interventions", "timeline"]) {
      expect(sectionPresentation(null, tab)).toEqual({ mode: "render" });
    }
  });

  test("manifest missing the backing surface renders rather than hides", () => {
    expect(sectionPresentation(capability({}), "riders")).toEqual({ mode: "render" });
  });
});
