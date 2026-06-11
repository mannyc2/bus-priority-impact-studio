import { describe, expect, test } from "bun:test";
import type {
  RouteSegmentTreatmentSummaryFeature,
  RouteTreatmentSourceGapFeature,
  RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";
import { interventionScopeFitArtifactPath } from "../src/artifacts";
import {
  buildInterventionScopeFitArtifactV1,
  INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
} from "../src/feature-resolvers";

const baseTreatment = {
  month: "2026-03",
  geographyScope: "route",
  evidenceLabel: "test",
  confidence: "high",
  sourceRefs: ["src:route"],
} satisfies Omit<RouteTreatmentSummaryFeature, "routeId" | "treatmentType" | "status">;

function routeTreatment(input: {
  routeId: string;
  treatmentType: string;
  status: string;
  sourceRefs?: readonly string[];
}): RouteTreatmentSummaryFeature {
  return {
    ...baseTreatment,
    routeId: input.routeId,
    treatmentType: input.treatmentType,
    status: input.status,
    sourceRefs: input.sourceRefs ?? baseTreatment.sourceRefs,
  };
}

function segmentTreatment(input: {
  routeId: string;
  treatmentType: string;
  segmentId: string;
  segmentOrder: number;
  status: string;
  matchMethod: string;
  overlapShare: number | null;
  sourceRefs?: readonly string[];
}): RouteSegmentTreatmentSummaryFeature {
  return {
    ...baseTreatment,
    routeId: input.routeId,
    treatmentType: input.treatmentType,
    status: input.status,
    segmentId: input.segmentId,
    segmentOrder: input.segmentOrder,
    directionId: "N",
    matchMethod: input.matchMethod,
    overlapShare: input.overlapShare,
    laneTypes: [],
    sourceRefs: input.sourceRefs ?? [`src:${input.segmentId}`],
  };
}

function sourceGap(input: {
  routeId: string;
  treatmentType: string;
  gapKind: string;
  blocksClaims: readonly string[];
}): RouteTreatmentSourceGapFeature {
  return {
    routeId: input.routeId,
    month: "2026-03",
    treatmentType: input.treatmentType,
    gapKind: input.gapKind,
    sourceRefs: ["src:gap"],
    publicStatement: "Public inventory is unavailable.",
    blocksClaims: input.blocksClaims,
  };
}

describe("intervention scope fit", () => {
  test("separates covered, partial, uncovered, route-only, and source-gap-blocked scope", () => {
    const artifact = buildInterventionScopeFitArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "intervention-scope-fit.json",
      spec: {
        panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
        month: "2026-03",
        minCoveredOverlapShare: 0.2,
        minPartialOverlapShare: 0.01,
      },
      routeTreatmentFeatures: [
        routeTreatment({
          routeId: "B1",
          treatmentType: "bus_lane",
          status: "current_confirmed",
        }),
        routeTreatment({
          routeId: "B2",
          treatmentType: "bus_lane",
          status: "current_confirmed",
        }),
        routeTreatment({
          routeId: "B3",
          treatmentType: "bus_lane",
          status: "current_confirmed",
        }),
        routeTreatment({
          routeId: "B4",
          treatmentType: "transit_signal_priority",
          status: "current_confirmed",
        }),
        routeTreatment({
          routeId: "B5",
          treatmentType: "automated_bus_lane_enforcement",
          status: "implemented",
        }),
      ],
      routeSegmentTreatmentFeatures: [
        segmentTreatment({
          routeId: "B1",
          treatmentType: "bus_lane",
          segmentId: "B1:N:1:a:b",
          segmentOrder: 1,
          status: "current_confirmed",
          matchMethod: "route_shape_overlap",
          overlapShare: 0.42,
        }),
        segmentTreatment({
          routeId: "B2",
          treatmentType: "bus_lane",
          segmentId: "B2:N:1:a:b",
          segmentOrder: 1,
          status: "current_confirmed",
          matchMethod: "route_shape_overlap",
          overlapShare: 0.08,
        }),
        segmentTreatment({
          routeId: "B3",
          treatmentType: "bus_lane",
          segmentId: "B3:N:1:a:b",
          segmentOrder: 1,
          status: "not_found",
          matchMethod: "not_matched",
          overlapShare: 0,
        }),
        segmentTreatment({
          routeId: "B4",
          treatmentType: "transit_signal_priority",
          segmentId: "B4:N:1:a:b",
          segmentOrder: 1,
          status: "source_gap",
          matchMethod: "source_only",
          overlapShare: null,
        }),
      ],
      routeTreatmentSourceGapFeatures: [
        sourceGap({
          routeId: "B4",
          treatmentType: "transit_signal_priority",
          gapKind: "current_inventory_missing",
          blocksClaims: ["absence", "coverage"],
        }),
      ],
    });

    expect(artifact.summary).toMatchObject({
      routeCount: 5,
      rowCount: 5,
      segmentRowCount: 4,
      routeOnlyRowCount: 1,
      sourceGapBlockedRowCount: 1,
      fitStatusCounts: {
        covered: 1,
        partial_confirmed: 1,
        true_uncovered: 1,
        route_only: 1,
        geometry_unavailable: 0,
        source_gap_blocked: 1,
        not_applicable: 0,
      },
    });
    expect(artifact.panelManifest).toMatchObject({
      panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
      summary: {
        sourceRowCount: 10,
        supportedRowCount: 5,
        panelRowCount: 5,
        routeCount: 5,
        entityCount: 4,
        monthCount: 1,
      },
    });
    expect(
      artifact.rows.map((row) => [row.routeId, row.treatmentType, row.fitStatus]),
    ).toEqual([
      ["B1", "bus_lane", "covered"],
      ["B2", "bus_lane", "partial_confirmed"],
      ["B3", "bus_lane", "true_uncovered"],
      ["B4", "transit_signal_priority", "source_gap_blocked"],
      ["B5", "automated_bus_lane_enforcement", "route_only"],
    ]);
    const tsp = artifact.rows.find((row) => row.routeId === "B4");
    expect(tsp?.blocksClaims).toEqual(["absence", "coverage"]);
    expect(tsp?.sourceGapKinds).toEqual(["current_inventory_missing"]);
  });

  test("owns the intervention scope fit artifact path", () => {
    expect(
      interventionScopeFitArtifactPath({
        artifactRoot: "data/artifacts",
        month: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/intervention-scope-fit-v1/2026-03/intervention-scope-fit.json",
    );
  });
});
