import { describe, expect, test } from "bun:test";
import {
  apportionRouteRidershipByTripTime,
  buildBoroughLengthBenchmarks,
  buildOpportunityTransfers,
  opportunityScore,
  rankOpportunities,
  segmentTimeLostPerRiderMinutes,
} from "../../src/lib/study-engine/opportunity.ts";

describe("opportunity scoring", () => {
  test("requires three distinct gated event-route studies and preserves the signed median", () => {
    const studies = [
      {
        eventKey: "event-bx38",
        candidateId: "candidate-bx38",
        routeId: "BX38",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        effectPercent: -0.030008758194421996,
        sourceOccurrenceIds: ["occurrence-b60-b68"],
      },
      {
        eventKey: "event-bx9",
        candidateId: "candidate-bx9",
        routeId: "BX9",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        effectPercent: 2.1014221798481283,
        sourceOccurrenceIds: ["occurrence-bx9"],
      },
      {
        eventKey: "event-b60",
        candidateId: "candidate-b60",
        routeId: "B60",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        effectPercent: -0.5023637979386308,
        sourceOccurrenceIds: ["occurrence-b60-b68"],
      },
      {
        eventKey: "event-b67",
        candidateId: "candidate-b67",
        routeId: "B67",
        treatmentFamily: "bus_lane" as const,
        effectPercent: 2.25,
        sourceOccurrenceIds: ["occurrence-b67"],
      },
    ];

    const result = buildOpportunityTransfers(studies);

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]).toMatchObject({
      treatmentFamily: "automated_bus_lane_enforcement",
      studyCount: 3,
      distinctEventRouteCount: 3,
      effectPercent: -0.030008758194421996,
      effectFraction: -0.00030008758194421996,
    });
    expect(result.insufficientEvidenceFamilies).toEqual([
      { treatmentFamily: "bus_lane", studyCount: 1, distinctEventRouteCount: 1 },
    ]);
  });

  test("builds deterministic borough and comparable-length p75 benchmarks", () => {
    const benchmarks = buildBoroughLengthBenchmarks([
      { borough: "Brooklyn", lengthMiles: 0.4, speedMph: 5 },
      { borough: "Brooklyn", lengthMiles: 0.4, speedMph: 7 },
      { borough: "Brooklyn", lengthMiles: 0.4, speedMph: 9 },
      { borough: "Brooklyn", lengthMiles: 0.4, speedMph: 11 },
      { borough: "Queens", lengthMiles: 0.4, speedMph: 20 },
    ]);

    expect(benchmarks.get("Brooklyn|0.25-0.5mi")).toBe(9);
    expect(benchmarks.get("Queens|0.25-0.5mi")).toBe(20);
    expect(
      segmentTimeLostPerRiderMinutes({
        lengthMiles: 0.5,
        observedSpeedMph: 5,
        benchmarkSpeedMph: 10,
      }),
    ).toBe(3);
  });

  test("apportions route ridership by observed trip time", () => {
    const exposure = apportionRouteRidershipByTripTime({
      routeRidership: 1_000,
      segments: [
        { segmentId: "short", tripTimeMinutes: 2 },
        { segmentId: "long", tripTimeMinutes: 8 },
      ],
    });

    expect(exposure.get("short")).toBe(200);
    expect(exposure.get("long")).toBe(800);
    expect([...exposure.values()].reduce((sum, value) => sum + value, 0)).toBe(1_000);
  });

  test("ranks a synthetic three-route fixture by the constructed score", () => {
    const ranked = rankOpportunities([
      {
        routeId: "B1",
        segmentId: "b1-segment",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        riderExposure: 100,
        timeLostPerRiderMinutes: 2,
        transferredEffectFraction: 0.02,
      },
      {
        routeId: "B2",
        segmentId: "b2-segment",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        riderExposure: 500,
        timeLostPerRiderMinutes: 1,
        transferredEffectFraction: 0.02,
      },
      {
        routeId: "B3",
        segmentId: "b3-segment",
        treatmentFamily: "automated_bus_lane_enforcement" as const,
        riderExposure: 50,
        timeLostPerRiderMinutes: 1,
        transferredEffectFraction: 0.02,
      },
    ]);

    expect(ranked.map((row) => row.routeId)).toEqual(["B2", "B1", "B3"]);
    expect(ranked.map((row) => row.score)).toEqual([10, 4, 1]);
    expect(ranked.every((row) => Number.isFinite(row.score))).toBe(true);
    expect(
      opportunityScore({
        riderExposure: 100,
        timeLostPerRiderMinutes: 2,
        transferredEffectFraction: -0.001,
      }),
    ).toBe(-0.2);
  });
});
