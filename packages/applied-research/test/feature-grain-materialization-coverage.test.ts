import { describe, expect, test } from "bun:test";
import { buildFeatureGrainMaterializationCoverage } from "../src/evaluation/feature-grain-materialization-coverage";

describe("feature-grain materialization coverage (S2.4)", () => {
  test("derives status from coverage share; unknown universe caps at partial", () => {
    const coverage = buildFeatureGrainMaterializationCoverage({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      rows: [
        { featureGrain: "route_month", scopesMaterialized: 380, fleetUniverse: 381 }, // ~0.997 -> complete
        { featureGrain: "route_segment_month", scopesMaterialized: 200, fleetUniverse: 381 }, // ~0.52 -> partial
        { featureGrain: "route_direction_daypart", scopesMaterialized: 50, fleetUniverse: 381 }, // ~0.13 -> sparse
        { featureGrain: "intervention_panel", scopesMaterialized: 0, fleetUniverse: 100 }, // missing
        {
          featureGrain: "stop_direction_hour",
          scopesMaterialized: 650264,
          // fleet universe unknown -> capped at partial, with a note
          note: "Fleet universe of stop-direction-hour cells is not yet enumerated.",
        },
      ],
    });

    const byGrain = new Map(coverage.rows.map((row) => [row.featureGrain, row]));
    expect(byGrain.get("route_month")?.status).toBe("complete");
    expect(byGrain.get("route_segment_month")?.status).toBe("partial");
    expect(byGrain.get("route_direction_daypart")?.status).toBe("sparse");
    expect(byGrain.get("intervention_panel")?.status).toBe("missing");
    // unknown denominator can never read as complete
    expect(byGrain.get("stop_direction_hour")?.status).toBe("partial");
    expect(byGrain.get("stop_direction_hour")?.coverageShare).toBeNull();
    expect(byGrain.get("stop_direction_hour")?.fleetUniverse).toBeNull();

    expect(coverage.summary).toMatchObject({
      grainCount: 5,
      completeCount: 1,
      partialCount: 2,
      sparseCount: 1,
      missingCount: 1,
      fleetUniverseKnownCount: 4,
    });
    // rows are sorted by grain
    expect(coverage.rows.map((row) => row.featureGrain)).toEqual([
      "intervention_panel",
      "route_direction_daypart",
      "route_month",
      "route_segment_month",
      "stop_direction_hour",
    ]);
  });

  test("rejects duplicate grains and negative counts", () => {
    expect(() =>
      buildFeatureGrainMaterializationCoverage({
        generatedAt: "2026-06-10T00:00:00.000Z",
        releaseMonth: "2026-03",
        rows: [
          { featureGrain: "route_month", scopesMaterialized: 1 },
          { featureGrain: "route_month", scopesMaterialized: 2 },
        ],
      }),
    ).toThrow(/Duplicate/);

    expect(() =>
      buildFeatureGrainMaterializationCoverage({
        generatedAt: "2026-06-10T00:00:00.000Z",
        releaseMonth: "2026-03",
        rows: [{ featureGrain: "route_month", scopesMaterialized: -1 }],
      }),
    ).toThrow(/cannot be negative/);
  });
});
