import { describe, expect, test } from "bun:test";
import {
  buildEwtRouteMonthScoreVectorArtifact,
  parseEwtRouteMonthRows,
} from "../src/score-vectors";

describe("EWT route-month score vectors", () => {
  test("parses local reliability rows and builds a route-month score-vector artifact", () => {
    const rows = parseEwtRouteMonthRows([
      {
        route_id: "M15",
        month: "2026-02",
        run_id: "run-1",
        reliability_status: "observed",
        sample_count: 50,
        stop_count: 10,
        direction_count: 2,
        average_observed_headway_minutes: 9,
        expected_wait_minutes: 7,
        scheduled_expected_wait_minutes: 5,
        excess_wait_minutes: 2,
        wait_reliability_ratio: 1.4,
      },
      {
        route_id: "M15",
        month: "2026-03",
        run_id: "run-1",
        reliability_status: "observed",
        sample_count: 50,
        stop_count: 10,
        direction_count: 2,
        average_observed_headway_minutes: 12,
        expected_wait_minutes: 10,
        scheduled_expected_wait_minutes: 5,
        excess_wait_minutes: 5,
        wait_reliability_ratio: 2,
      },
    ]);

    rows[0] = { ...rows[0]!, mtaAbstMinutes: 2 };
    rows[1] = { ...rows[1]!, mtaAbstMinutes: 5 };

    const artifact = buildEwtRouteMonthScoreVectorArtifact({
      rows,
      startMonth: "2026-02",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "data/artifacts/ewt.json",
      minSampleCount: 30,
      fleetFlagQuantile: 0.5,
    });

    expect(artifact.detectorId).toBe("headway_reliability_ewt");
    expect(artifact.summary.rawRowCount).toBe(2);
    expect(artifact.summary.usableRowCount).toBe(2);
    expect(artifact.summary.releaseUsableRouteCount).toBe(1);
    expect(artifact.scoreVectors.releaseMonth[0]?.scoreBasis).toBe(
      "mta_abst_customer_journey_metric",
    );
  });
});
