import { describe, expect, test } from "bun:test";
import type { RouteTreatmentSourceGapFeature } from "@bp/analytics/features";
import { sourceGapModelArtifactPath } from "../src/artifacts";
import {
  buildSourceGapModelArtifactV1,
  SOURCE_GAP_PANEL_V1_ID,
} from "../src/feature-resolvers";

function gap(input: {
  routeId: string | null;
  treatmentType: string;
  gapKind: string;
  blocksClaims: readonly string[];
  sourceRefs?: readonly string[];
}): RouteTreatmentSourceGapFeature {
  return {
    routeId: input.routeId,
    month: "2026-03",
    treatmentType: input.treatmentType,
    gapKind: input.gapKind,
    sourceRefs: input.sourceRefs ?? ["src:gap"],
    publicStatement: "Inventory missing.",
    blocksClaims: input.blocksClaims,
  };
}

describe("source gap model", () => {
  test("groups source gaps and exposes blocked-claim counts", () => {
    const artifact = buildSourceGapModelArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "source-gap-model.json",
      spec: {
        panelId: SOURCE_GAP_PANEL_V1_ID,
        month: "2026-03",
      },
      routeTreatmentSourceGapFeatures: [
        gap({
          routeId: "B1",
          treatmentType: "transit_signal_priority",
          gapKind: "current_inventory_missing",
          blocksClaims: ["absence", "coverage"],
          sourceRefs: ["src:a"],
        }),
        gap({
          routeId: "B1",
          treatmentType: "transit_signal_priority",
          gapKind: "current_inventory_missing",
          blocksClaims: ["coverage"],
          sourceRefs: ["src:b"],
        }),
        gap({
          routeId: "B2",
          treatmentType: "bus_lane",
          gapKind: "implementation_date_missing",
          blocksClaims: ["timing"],
        }),
      ],
    });

    expect(artifact.summary).toMatchObject({
      routeCount: 2,
      rowCount: 2,
      sourceGapCount: 3,
      treatmentTypeCounts: {
        bus_lane: 1,
        transit_signal_priority: 1,
      },
      gapKindCounts: {
        current_inventory_missing: 1,
        implementation_date_missing: 1,
      },
      blockedClaimCounts: {
        absence: 1,
        coverage: 1,
        timing: 1,
      },
    });
    expect(artifact.panelManifest).toMatchObject({
      panelId: SOURCE_GAP_PANEL_V1_ID,
      summary: {
        sourceRowCount: 3,
        supportedRowCount: 2,
        panelRowCount: 2,
        routeCount: 2,
        entityCount: 2,
        monthCount: 1,
      },
    });
    expect(artifact.rows[0]).toMatchObject({
      routeId: "B1",
      treatmentType: "transit_signal_priority",
      gapKind: "current_inventory_missing",
      sourceGapCount: 2,
      blocksClaims: ["absence", "coverage"],
      sourceRefs: ["src:a", "src:b"],
    });
  });

  test("owns the source gap model artifact path", () => {
    expect(
      sourceGapModelArtifactPath({
        artifactRoot: "data/artifacts",
        month: "2026-03",
      }),
    ).toBe("data/artifacts/analytics-models/source-gap-model-v1/2026-03/source-gap-model.json");
  });
});
