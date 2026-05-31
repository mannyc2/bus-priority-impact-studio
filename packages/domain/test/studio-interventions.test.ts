import { describe, expect, test } from "bun:test";
import { buildStudioInterventionsFromComparisons } from "../src/index.js";

describe("Studio intervention timeline projection", () => {
  test("keeps dated interventions and drops source-gap evidence rows", () => {
    const interventions = buildStudioInterventionsFromComparisons([
      {
        eventId: "bus-lane-source-gap:M15+:2026-03",
        interventionType: "bus_lane_infrastructure",
        program: "NYC DOT Bus Lanes",
        implementationMonth: "2026-03",
        eventStatus: "source_gap",
        comparisonStatus: "source_gap_missing_implementation_date",
        adjustedSpeedDeltaMph: null,
        speedDeltaMph: null,
        comparisonRouteCount: 0,
      },
      {
        eventId: "ace:M15+:ACE:2024-06-20",
        interventionType: "automated_bus_lane_enforcement",
        program: "ACE",
        implementationMonth: "2024-06",
        eventStatus: "implemented",
        comparisonStatus: "insufficient_pre_data",
        adjustedSpeedDeltaMph: null,
        speedDeltaMph: null,
        comparisonRouteCount: 0,
      },
      {
        eventId: "bus-lane:M15+:2025-07",
        interventionType: "bus_lane_infrastructure",
        program: "NYC DOT Bus Lanes",
        implementationMonth: "2025-07",
        eventStatus: "implemented",
        evaluationLevel: "peer_adjusted_before_after",
        comparisonStatus: "evaluated",
        preStartMonth: "2025-01",
        preEndMonth: "2025-06",
        postStartMonth: "2025-08",
        postEndMonth: "2026-01",
        preSampleMonthCount: 6,
        postSampleMonthCount: 6,
        adjustedSpeedDeltaMph: 0.146,
        speedDeltaMph: -0.0098,
        comparisonSpeedDeltaMph: -0.1558,
        comparisonRouteCount: 10,
        comparisonRouteIds: ["M2", "M3", "M4"],
        caveat: "Peer-adjusted before/after speed changes are descriptive, not causal proof.",
      },
    ]);

    expect(interventions).toEqual([
      {
        year: "2024-06",
        title: "ACE enforcement begins",
        detail: "Documented intervention; not enough pre-period speed data for comparison.",
        tone: "warn",
        sourceLabel: "ACE",
        sourceDetail: "Structured intervention source",
      },
      {
        year: "2025-07",
        title: "Bus lane opening evidence",
        detail: "Peer-adjusted speed change +0.15 mph using 10 comparison routes.",
        tone: "good",
        sourceLabel: "NYC DOT Bus Lanes",
        sourceDetail: "Structured intervention source",
        comparisonCohort: {
          method: "peer_adjusted_before_after",
          causalInterpretation: "comparison_adjusted_not_causal_proof",
          methodLimitations: [
            "not_randomized_or_quasi_experimental",
            "detector_side_control_cohort_pending",
            "external_methodology_review_pending",
            "overlapping_interventions_not_fully_controlled",
          ],
          routeIds: ["M2", "M3", "M4"],
          routeCount: 10,
          preWindow: {
            from: "2025-01",
            to: "2025-06",
            sampleMonths: 6,
          },
          postWindow: {
            from: "2025-08",
            to: "2026-01",
            sampleMonths: 6,
          },
          routeSpeedDeltaMph: -0.0098,
          comparisonSpeedDeltaMph: -0.1558,
          adjustedSpeedDeltaMph: 0.146,
          caveat: "Peer-adjusted before/after speed changes are descriptive, not causal proof.",
        },
      },
    ]);
  });
});
