import { describe, expect, test } from "bun:test";
import {
  treatmentEventCandidateCausalReviewPath,
  treatmentEventPanelArtifactPath,
} from "../src/artifacts";
import {
  buildTreatmentEventCandidateCausalReviewProjection,
  buildTreatmentEventPanelArtifactV1,
  TREATMENT_EVENT_PANEL_V1_ID,
} from "../src/feature-resolvers";

function monthlySpeedRows(input: {
  routeId: string;
  startMonth: string;
  speeds: readonly number[];
}) {
  const [yearRaw, monthRaw] = input.startMonth.split("-");
  const startYear = Number(yearRaw);
  const startMonth = Number(monthRaw);
  return input.speeds.map((speed, index) => {
    const monthIndex = startMonth - 1 + index;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return {
      route_id: input.routeId,
      month: `${year}-${String(month).padStart(2, "0")}`,
      speed_observation_count: 100,
      average_speed_mph: speed,
    };
  });
}

describe("treatment event panel", () => {
  test("builds an association-screening model artifact from intervention comparison rows", () => {
    const artifact = buildTreatmentEventPanelArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "treatment-event-panel.json",
      spec: {
        panelId: TREATMENT_EVENT_PANEL_V1_ID,
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      },
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          event_id: "event-1",
          intervention_type: "bus_lane",
          implementation_date: "2025-01-15",
          implementation_month: "2025-01",
          comparison_status: "evaluated",
          pre_start_month: "2024-01",
          pre_end_month: "2024-12",
          post_start_month: "2025-02",
          post_end_month: "2026-03",
          comparison_route_count: 3,
          comparison_route_ids: JSON.stringify(["M1", "M2", "M3"]),
          adjusted_speed_delta_mph: 1.2,
          speed_delta_mph: 0.9,
        },
        {
          route_id: "M20",
          month: "2026-03",
          event_id: "event-2",
          intervention_type: "bus_lane",
          implementation_date: null,
          implementation_month: null,
          comparison_status: "source_gap_missing_implementation_date",
          pre_start_month: null,
          pre_end_month: null,
          post_start_month: null,
          post_end_month: null,
          comparison_route_count: 0,
          comparison_route_ids: null,
          adjusted_speed_delta_mph: null,
          speed_delta_mph: null,
        },
      ],
    });

    expect(artifact.summary).toMatchObject({
      sourceRowCount: 2,
      panelRowCount: 2,
      supportedRowCount: 1,
      routeCount: 2,
      eventCount: 2,
      eligibleControlRowCount: 1,
      effectEstimateRowCount: 1,
      candidateCausalEligibleRowCount: 0,
    });
    expect(artifact.panelManifest.spec).toMatchObject({
      panelId: "treatment_event_panel_v1",
      grain: "event_id + treated_scope_kind + treated_scope_id",
      requiredProducts: [
        expect.objectContaining({ productId: "local_route_intervention_comparison_history" }),
        expect.objectContaining({ productId: "local_intervention_events_release" }),
      ],
    });
    expect(artifact.rows[0]).toMatchObject({
      eventId: "event-1",
      treatedScopeKind: "route",
      treatedScopeId: "M15",
      controlEligibilityStatus: "eligible",
      eventStudyEstimate: 1.2,
    });
  });

  test("computes screening gate statuses from route-month speed history when available", () => {
    const artifact = buildTreatmentEventPanelArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "treatment-event-panel.json",
      spec: {
        panelId: TREATMENT_EVENT_PANEL_V1_ID,
        historyStartMonth: "2024-01",
        releaseMonth: "2025-06",
      },
      rows: [
        {
          route_id: "M15",
          month: "2025-06",
          event_id: "event-1",
          intervention_type: "bus_lane",
          implementation_date: "2025-01-15",
          implementation_month: "2025-01",
          comparison_status: "evaluated",
          pre_start_month: "2024-01",
          pre_end_month: "2024-12",
          post_start_month: "2025-02",
          post_end_month: "2025-06",
          comparison_route_count: 3,
          comparison_route_ids: JSON.stringify(["M1", "M2", "M3"]),
          adjusted_speed_delta_mph: 1.2,
          speed_delta_mph: 0.9,
        },
      ],
      routeMetricHistoryRows: [
        ...monthlySpeedRows({
          routeId: "M15",
          startMonth: "2024-01",
          speeds: [
            10,
            10.15,
            10.05,
            10.2,
            10.1,
            10.25,
            10.15,
            10.3,
            10.2,
            10.35,
            10.25,
            10.4,
            10.45,
            11.5,
            11.6,
            11.55,
            11.65,
            11.7,
          ],
        }),
        ...monthlySpeedRows({
          routeId: "M1",
          startMonth: "2024-01",
          speeds: Array.from({ length: 18 }, (_, index) => 9.8 + index * 0.01),
        }),
        ...monthlySpeedRows({
          routeId: "M2",
          startMonth: "2024-01",
          speeds: Array.from({ length: 18 }, (_, index) => 10.1 + index * 0.01),
        }),
        ...monthlySpeedRows({
          routeId: "M3",
          startMonth: "2024-01",
          speeds: Array.from({ length: 18 }, (_, index) => 9.9 + index * 0.01),
        }),
      ],
    });

    expect(artifact.rows[0]).toMatchObject({
      preTrendStatus: "passes",
      placeboInTimeStatus: "passes",
      placeboInSpaceStatus: "passes",
      methodDivergenceStatus: "passes",
    });
    expect(artifact.summary.gateStatusCounts).toMatchObject({
      preTrendStatus: { passes: 1 },
      placeboInTimeStatus: { passes: 1 },
      placeboInSpaceStatus: { passes: 1 },
      methodDivergenceStatus: { passes: 1 },
    });
    expect(artifact.rows[0]?.autocorrelationStatus).not.toBe("not_tested");
    expect(artifact.summary.candidateCausalEligibleRowCount).toBe(
      artifact.rows[0]?.autocorrelationStatus === "passes" ? 1 : 0,
    );
  });

  test("projects candidate-causal rows for methodology review without allowing public claims", () => {
    const artifact = buildTreatmentEventPanelArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "treatment-event-panel.json",
      spec: {
        panelId: TREATMENT_EVENT_PANEL_V1_ID,
        historyStartMonth: "2024-01",
        releaseMonth: "2025-06",
      },
      rows: [
        {
          route_id: "M15",
          month: "2025-06",
          event_id: "event-1",
          intervention_type: "bus_lane",
          implementation_date: "2025-01-15",
          implementation_month: "2025-01",
          comparison_status: "evaluated",
          pre_start_month: "2024-01",
          pre_end_month: "2024-12",
          post_start_month: "2025-02",
          post_end_month: "2025-06",
          comparison_route_count: 3,
          comparison_route_ids: JSON.stringify(["M1", "M2", "M3"]),
          adjusted_speed_delta_mph: 1.2,
          speed_delta_mph: 0.9,
        },
      ],
      routeMetricHistoryRows: [
        ...monthlySpeedRows({
          routeId: "M15",
          startMonth: "2024-01",
          speeds: [
            10,
            10.15,
            10.05,
            10.2,
            10.1,
            10.25,
            10.15,
            10.3,
            10.2,
            10.35,
            10.25,
            10.4,
            10.45,
            11.5,
            11.6,
            11.55,
            11.65,
            11.7,
          ],
        }),
        ...["M1", "M2", "M3"].flatMap((routeId) =>
          monthlySpeedRows({
            routeId,
            startMonth: "2024-01",
            speeds: Array.from({ length: 18 }, (_, index) => 9.8 + index * 0.01),
          }),
        ),
      ],
    });

    const projection = buildTreatmentEventCandidateCausalReviewProjection(artifact);

    expect(projection.summary).toMatchObject({
      candidateCausalEligibleRowCount: 1,
      routeCount: 1,
      eventCount: 1,
      publicClaimAllowedCount: 0,
    });
    expect(projection.rows[0]).toMatchObject({
      eventId: "event-1",
      routeId: "M15",
      reviewDisposition: "needs_methodology_review",
      publicClaimAllowed: false,
      gateSummary: expect.objectContaining({ candidateCausalEligible: true }),
    });
    expect(JSON.stringify(projection)).not.toContain("treatment-event-panel.json");
  });

  test("owns the treatment event panel artifact path", () => {
    expect(
      treatmentEventPanelArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/treatment-event-panel.json",
    );
    expect(
      treatmentEventCandidateCausalReviewPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/candidate-causal-review.json",
    );
  });
});
