import { describe, expect, test } from "bun:test";
import { pulseFingerprintArtifactPath } from "../src/artifacts";
import {
  buildPulseFingerprintArtifactV1,
  ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
} from "../src/feature-resolvers";

function speed(routeId: string, month: string, dayOfWeek: string, hourOfDay: number, mph: number) {
  return {
    route_id: routeId,
    month,
    day_of_week: dayOfWeek,
    hour_of_day: hourOfDay,
    direction: "Northbound",
    segment_hour_row_count: 10,
    trip_count: 50,
    average_speed_mph: mph,
    average_travel_time_minutes: 3,
  };
}

describe("pulse fingerprint", () => {
  test("builds internal-lab hour-of-week pulse rows from release versus history speed cells", () => {
    const artifact = buildPulseFingerprintArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "pulse-fingerprint.json",
      spec: {
        panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
        historyStartMonth: "2026-01",
        releaseMonth: "2026-03",
        minCellHistoryMonths: 2,
        minReleaseTripCount: 20,
      },
      rows: [
        speed("M15", "2026-01", "Monday", 14, 8),
        speed("M15", "2026-02", "Monday", 14, 8.2),
        speed("M15", "2026-03", "Monday", 14, 6.8),
        speed("M15", "2026-01", "Monday", 8, 7),
        speed("M15", "2026-02", "Monday", 8, 7.1),
        speed("M15", "2026-03", "Monday", 8, 7),
      ],
    });

    expect(artifact.summary).toMatchObject({
      panelRowCount: 1,
      routeCount: 1,
      supportedPulseRowCount: 1,
      publicClaimAllowedCount: 0,
    });
    expect(artifact.summary.patternCounts["off_peak_pulse"]).toBe(1);
    expect(artifact.rows[0]).toMatchObject({
      routeId: "M15",
      direction: "Northbound",
      pattern: "off_peak_pulse",
      pulseCell: { dayOfWeek: "Monday", hourOfDay: 14 },
      speedResidualMph: -1.3,
      releaseSpeedMph: 6.8,
      baselineSpeedMph: 8.1,
      reviewDisposition: "internal_lab",
      publicClaimAllowed: false,
    });
    expect(artifact.rows[0]?.evidence.primary).toContain("pulse_cell=Monday_14");
    expect(artifact.panelManifest.spec).toMatchObject({
      panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
      requiredProducts: [expect.objectContaining({ productId: "local_route_segment_speed_history" })],
    });
  });

  test("owns the pulse fingerprint artifact path", () => {
    expect(
      pulseFingerprintArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/pulse-fingerprint-v1/2023-04_to_2026-03/2026-03/pulse-fingerprint.json",
    );
  });
});
