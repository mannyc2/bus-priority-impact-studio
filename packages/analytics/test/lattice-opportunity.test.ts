import { describe, expect, test } from "bun:test";
import {
  buildLatticeOpportunityBundles,
  deducePowersetLattice,
  type LatticeOpportunityRouteInput,
} from "../src/index.js";

const GENERATED_AT = "2026-06-01T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "latticeopportunity0123456789abcd";

function route(over: Partial<LatticeOpportunityRouteInput> = {}): LatticeOpportunityRouteInput {
  return {
    routeId: "B44",
    speedPainScore: 92,
    reliabilityPainScore: 45,
    interventionEvidenceStatus: "absent",
    busLaneStatus: "present",
    aceStatus: "inactive",
    permitContextScore: null,
    serviceRequestContextScore: null,
    scheduleMismatchScore: null,
    travelTimeVariabilityScore: null,
    bunchingHotspotScore: null,
    riderWeightedExcessWaitScore: null,
    interventionUnderperformanceScore: null,
    positiveDevianceScore: null,
    ...over,
  };
}

describe("powerset lattice deduction", () => {
  test("narrows candidates with alpha over still-consistent solutions", () => {
    const result = deducePowersetLattice({
      positionIds: ["cell_a", "cell_b"],
      state: {
        cell_a: ["red", "blue"],
        cell_b: ["north", "south"],
      },
      solutions: [
        { cell_a: "red", cell_b: "north" },
        { cell_a: "red", cell_b: "south" },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.deducedState["cell_a"]).toEqual(["red"]);
    expect(result.deducedState["cell_b"]).toEqual(["north", "south"]);
    expect(result.eliminatedByPosition["cell_a"]).toEqual(["blue"]);
    expect(result.survivingSolutionCount).toBe(2);
  });

  test("returns conflict instead of guessing when no valid solution survives", () => {
    const result = deducePowersetLattice({
      positionIds: ["cell_a", "cell_b"],
      state: {
        cell_a: ["blue"],
        cell_b: ["south"],
      },
      solutions: [{ cell_a: "red", cell_b: "north" }],
    });

    expect(result.status).toBe("conflict");
    expect(result.survivingSolutionCount).toBe(0);
    expect(result.emptyPositions).toEqual(["cell_a", "cell_b"]);
  });
});

describe("buildLatticeOpportunityBundles", () => {
  test("surfaces an enforcement-gap opportunity from speed pain plus bus-lane context", () => {
    const out = buildLatticeOpportunityBundles({
      bundleRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [route()],
    });

    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]?.methodId).toBe("lattice_review_bundle");
    expect(out.bundles[0]?.claimText).toContain("enforcement-gap");
    expect(out.bundles[0]?.opportunityKinds).toEqual(["enforcement_gap_review"]);
    expect(out.assessments[0]?.outcome).toBe("bundle");
  });

  test("finds context-timed street management when slow routes overlap context signals", () => {
    const out = buildLatticeOpportunityBundles({
      bundleRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          routeId: "Q58",
          busLaneStatus: "absent",
          aceStatus: "unknown",
          permitContextScore: 87,
        }),
      ],
    });

    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]?.claimText).toContain("context-timed");
    expect(out.bundles[0]?.opportunityKinds).toEqual(["context_timed_street_management"]);
  });

  test("finds reliability dispatch opportunities outside simple speed hotspots", () => {
    const out = buildLatticeOpportunityBundles({
      bundleRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          routeId: "M15",
          speedPainScore: 40,
          reliabilityPainScore: 91,
          busLaneStatus: "absent",
          aceStatus: "unknown",
          bunchingHotspotScore: 86,
        }),
      ],
    });

    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]?.claimText).toContain("dispatch");
    expect(out.bundles[0]?.opportunityKinds).toEqual(["reliability_dispatch_review"]);
  });

  test("keeps low-pain routes clean unless a positive-deviance lesson survives", () => {
    const out = buildLatticeOpportunityBundles({
      bundleRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          routeId: "M14",
          speedPainScore: 35,
          reliabilityPainScore: 30,
          busLaneStatus: "present",
          aceStatus: "active",
          interventionEvidenceStatus: "dated_or_evaluated",
          positiveDevianceScore: 93,
        }),
        route({
          routeId: "B12",
          speedPainScore: 35,
          reliabilityPainScore: 30,
          busLaneStatus: "absent",
          aceStatus: "unknown",
        }),
      ],
    });

    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]?.routeId).toBe("M14");
    expect(out.bundles[0]?.claimText).toContain("positive-deviance");
    expect(out.assessments.find((row) => row.routeId === "B12")?.outcome).toBe("clean_no_bundle");
  });

  test("abstains when evidence falls outside the accepted opportunity lattice", () => {
    const out = buildLatticeOpportunityBundles({
      bundleRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        route({
          routeId: "B99",
          interventionEvidenceStatus: "future_only",
          busLaneStatus: "absent",
          aceStatus: "unknown",
        }),
      ],
    });

    expect(out.bundles).toHaveLength(0);
    expect(out.assessments[0]?.outcome).toBe("abstained");
    expect(out.assessments[0]?.reasonCode).toBe("unsupported_lattice_bundle");
  });
});
