import { describe, expect, test } from "bun:test";
import { RouteCapabilityManifestSchema } from "@bp/domain/studio";
import {
  buildRouteCapabilityManifest,
  type RouteCapabilityInputRow,
} from "../src/evaluation/build-route-capability-manifest";

function inputRow(overrides: Partial<RouteCapabilityInputRow> = {}): RouteCapabilityInputRow {
  return {
    routeId: "ROUTE",
    hasSummary: false,
    publicVisible: false,
    baselineMonth: null,
    hasArtifact: false,
    history: { endMonth: null, pointCount: 0, speedMonthCount: 0, ridershipMonthCount: 0 },
    speedHistory: null,
    scheduleTimepointCount: 0,
    treatment: { aceActive: false, busLaneMatchedLaneCount: 0 },
    detector: {
      present: false,
      findingCandidateCount: 0,
      contextCount: 0,
      reviewQueueCount: 0,
      suppressedCount: 0,
      reliabilityFindingCount: 0,
      reliabilityContextCount: 0,
      months: [],
      caveats: [],
    },
    sourceStatus: { reliability: "available", ridership: "available" },
    ...overrides,
  };
}

// Three contrast routes: flagged (rich, surfaced findings) / clean (built, no findings) / sparse.
const flagged = inputRow({
  routeId: "M15+",
  hasSummary: true,
  publicVisible: true,
  baselineMonth: "2026-03",
  hasArtifact: true,
  history: { endMonth: "2026-03", pointCount: 36, speedMonthCount: 36, ridershipMonthCount: 36 },
  speedHistory: { endMonth: "2026-03", monthCount: 36, missingCellCount: 16 },
  scheduleTimepointCount: 42,
  treatment: { aceActive: true, busLaneMatchedLaneCount: 5 },
  detector: {
    present: true,
    findingCandidateCount: 2,
    contextCount: 1,
    reviewQueueCount: 0,
    suppressedCount: 0,
    reliabilityFindingCount: 1,
    reliabilityContextCount: 0,
    months: ["2026-02", "2026-03"],
    caveats: ["geometry overlap approximate"],
  },
});

const clean = inputRow({
  routeId: "Q1",
  hasSummary: true,
  publicVisible: true,
  baselineMonth: "2026-03",
  hasArtifact: true,
  history: { endMonth: "2026-03", pointCount: 18, speedMonthCount: 18, ridershipMonthCount: 18 },
  speedHistory: { endMonth: "2026-03", monthCount: 18, missingCellCount: 0 },
  scheduleTimepointCount: 30,
  treatment: { aceActive: false, busLaneMatchedLaneCount: 0 },
  detector: {
    present: true,
    findingCandidateCount: 0,
    contextCount: 0,
    reviewQueueCount: 1,
    suppressedCount: 2,
    reliabilityFindingCount: 0,
    reliabilityContextCount: 1,
    months: ["2026-03"],
    caveats: [],
  },
});

const sparse = inputRow({
  routeId: "B99",
  hasSummary: false,
  publicVisible: false,
});

const manifest = buildRouteCapabilityManifest({
  generatedAt: "2026-06-10T00:00:00.000Z",
  releaseMonth: "2026-03",
  rows: [sparse, flagged, clean],
});

const byRoute = new Map(manifest.routes.map((route) => [route.routeId, route]));

describe("buildRouteCapabilityManifest", () => {
  test("emits a schema-valid manifest sorted by routeId", () => {
    expect(() => RouteCapabilityManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.routes.map((route) => route.routeId)).toEqual(["B99", "M15+", "Q1"]);
  });

  test("flagged route: partial speed history, surfaced findings, current freshness", () => {
    const route = byRoute.get("M15+");
    expect(route?.overallState).toBe("ready"); // artifact + public finding
    expect(route?.surfaces["speedHistory"]?.state).toBe("partial");
    expect(route?.surfaces["speedHistory"]?.reason).toContain("16");
    expect(route?.surfaces["detectorFindings"]?.state).toBe("ready");
    expect(route?.surfaces["reliability"]?.state).toBe("ready");
    expect(route?.surfaces["treatment"]?.state).toBe("ready");
    expect(route?.surfaces["condition"]?.freshness).toBe("current");
    expect(route?.caveats).toEqual(["geometry overlap approximate"]);
  });

  test("clean route: built, detectors ran, nothing public", () => {
    const route = byRoute.get("Q1");
    expect(route?.overallState).toBe("checked_clean"); // artifact, no public finding
    expect(route?.surfaces["speedHistory"]?.state).toBe("ready");
    expect(route?.surfaces["detectorFindings"]?.state).toBe("checked_clean");
    expect(route?.surfaces["reliability"]?.state).toBe("checked_clean");
    expect(route?.surfaces["treatment"]?.state).toBe("checked_clean");
  });

  test("sparse route: insufficient data everywhere", () => {
    const route = byRoute.get("B99");
    expect(route?.overallState).toBe("insufficient_data");
    expect(route?.surfaces["condition"]?.state).toBe("insufficient_data");
    expect(route?.surfaces["detectorFindings"]?.state).toBe("insufficient_data");
    expect(route?.surfaces["speedHistory"]?.state).toBe("insufficient_data");
  });

  test("legacy support-tier counts re-derive from overallState", () => {
    const routes = manifest.routes;
    const summaryReady = routes.filter((r) => r.overallState !== "insufficient_data").length;
    const artifactReady = routes.filter((r) =>
      ["partial", "checked_clean", "ready"].includes(r.overallState),
    ).length;
    const evidenceReady = routes.filter((r) => r.overallState === "ready").length;
    expect({ summaryReady, artifactReady, evidenceReady }).toEqual({
      summaryReady: 2,
      artifactReady: 2,
      evidenceReady: 1,
    });
  });

  test("blocked source yields a blocked surface, not a route-level downgrade", () => {
    const [blocked] = buildRouteCapabilityManifest({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      rows: [{ ...flagged, sourceStatus: { ...flagged.sourceStatus, reliability: "blocked" } }],
    }).routes;
    expect(blocked?.surfaces["reliability"]?.state).toBe("blocked");
    expect(blocked?.overallState).toBe("ready");
  });

  test("stale freshness when data predates the release window", () => {
    const [stale] = buildRouteCapabilityManifest({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      rows: [{ ...clean, history: { ...clean.history, endMonth: "2025-09" } }],
    }).routes;
    expect(stale?.surfaces["ridership"]?.freshness).toBe("stale");
  });
});
