import { describe, expect, test } from "bun:test";
import { forecastValidationGatesArtifactPath } from "../src/artifacts";
import { buildForecastValidationGatesArtifact } from "../src/forecasting";

function row(input: {
  routeId: string;
  month: string;
  segmentId: string;
  speed: number;
}) {
  return {
    route_id: input.routeId,
    month: input.month,
    segment_id: input.segmentId,
    direction: "N",
    daypart: "am_peak",
    observation_count: 12,
    traversal_count: 100,
    average_speed_mph: input.speed,
    average_travel_time_minutes: 5,
    average_road_distance_miles: 0.5,
  };
}

describe("forecast validation gates", () => {
  test("builds rolling backtest, calibration, and drift gate statuses", () => {
    const rows = [
      row({ routeId: "M1", month: "2026-01", segmentId: "M1:N:1:a:b", speed: 10 }),
      row({ routeId: "M1", month: "2026-02", segmentId: "M1:N:1:a:b", speed: 10 }),
      row({ routeId: "M1", month: "2026-03", segmentId: "M1:N:1:a:b", speed: 11 }),
      row({ routeId: "M1", month: "2026-04", segmentId: "M1:N:1:a:b", speed: 10 }),
      row({ routeId: "M2", month: "2026-01", segmentId: "M2:N:1:a:b", speed: 20 }),
      row({ routeId: "M2", month: "2026-02", segmentId: "M2:N:1:a:b", speed: 20 }),
      row({ routeId: "M2", month: "2026-03", segmentId: "M2:N:1:a:b", speed: 20 }),
      row({ routeId: "M2", month: "2026-04", segmentId: "M2:N:1:a:b", speed: 21 }),
    ];
    const artifact = buildForecastValidationGatesArtifact({
      rows,
      startMonth: "2026-01",
      endMonth: "2026-04",
      releaseMonth: "2026-04",
      generatedAt: "2026-06-11T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "forecast-validation-gates.json",
      minTrainingMonths: 2,
      trailingTrainingMonths: 2,
      minimumBacktestForecastCount: 4,
      minimumValidationMonthCount: 2,
    });

    expect(artifact).toMatchObject({
      artifactKind: "forecast_validation_gates",
      releaseMonth: "2026-04",
      summary: {
        eligibleRowCount: 8,
        forecastCount: 4,
        validationMonthCount: 2,
        releaseMonthForecastCount: 2,
      },
    });
    expect(Object.fromEntries(artifact.gates.map((gate) => [gate.gateId, gate.status]))).toEqual({
      rolling_backtest: "pass",
      calibration_curve: "pass",
      distribution_shift_monitor: "pass",
    });
    expect(artifact.monthlyBacktest.map((month) => month.month)).toEqual(["2026-03", "2026-04"]);
  });

  test("owns the forecast validation gates artifact path", () => {
    expect(
      forecastValidationGatesArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/applied-research/2023-04_to_2026-03/2026-03/forecast-validation-gates.json",
    );
  });
});
