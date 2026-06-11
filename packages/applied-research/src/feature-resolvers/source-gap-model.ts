import type { RouteTreatmentSourceGapFeature } from "@bp/analytics/features";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const SOURCE_GAP_PANEL_V1_ID = "source_gap_panel_v1" as const;
export const SOURCE_GAP_MODEL_V1_ID = "source_gap_model_v1" as const;

export type SourceGapModelPanelSpec = {
  readonly panelId: typeof SOURCE_GAP_PANEL_V1_ID;
  readonly month: string;
  readonly routeId?: string;
};

export type SourceGapModelRow = {
  readonly routeId: string | null;
  readonly month: string;
  readonly treatmentType: string;
  readonly gapKind: string;
  readonly sourceGapCount: number;
  readonly blocksClaims: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly publicStatements: readonly string[];
};

export type SourceGapModelArtifactV1 = {
  readonly artifactKind: typeof SOURCE_GAP_MODEL_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly month: string;
  readonly panelSpec: SourceGapModelPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly routeCount: number;
    readonly rowCount: number;
    readonly sourceGapCount: number;
    readonly treatmentTypeCounts: Record<string, number>;
    readonly gapKindCounts: Record<string, number>;
    readonly blockedClaimCounts: Record<string, number>;
  };
  readonly rows: readonly SourceGapModelRow[];
};

function key(parts: readonly (string | null)[]): string {
  return parts.map((part) => part ?? "").join("\0");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function sourceGapModelPanelSpecV1(input: SourceGapModelPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: SOURCE_GAP_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + treatment_type + gap_kind",
    timeKey: "month",
    entityKeys: ["route_id", "treatment_type", "gap_kind"],
    measures: ["source_gap_count", "blocks_claims"],
    joins: ["route_treatment_source_gap"],
    coverage: ["source_gap_count", "blocked_claim_count"],
    historyWindow: {
      startMonth: input.month,
      endMonth: input.month,
    },
    releaseFilter: { month: input.month },
    requiredProducts: [
      {
        productId: "route_treatment_summary_artifact",
        state: "available",
        role: "artifact",
        reason: "Source-gap rows are emitted by the route treatment summary materializer.",
      },
    ],
    eligibilityRules: [],
    negativeMeaning:
      "Absence from this artifact is only absence of a materialized source-gap row, not proof that the source is complete.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

export function buildSourceGapModelArtifactV1(input: {
  readonly routeTreatmentSourceGapFeatures: readonly RouteTreatmentSourceGapFeature[];
  readonly spec: SourceGapModelPanelSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): SourceGapModelArtifactV1 {
  const groups = new Map<string, RouteTreatmentSourceGapFeature[]>();
  for (const feature of input.routeTreatmentSourceGapFeatures) {
    if (feature.month !== input.spec.month) continue;
    if (input.spec.routeId !== undefined && feature.routeId !== input.spec.routeId) continue;
    const mapKey = key([feature.routeId, feature.treatmentType, feature.gapKind]);
    const current = groups.get(mapKey) ?? [];
    current.push(feature);
    groups.set(mapKey, current);
  }

  const rows: SourceGapModelRow[] = [];
  for (const [mapKey, features] of groups.entries()) {
    const [routeIdRaw, treatmentType, gapKind] = mapKey.split("\0");
    if (routeIdRaw === undefined || treatmentType === undefined || gapKind === undefined) {
      continue;
    }
    rows.push({
      routeId: routeIdRaw === "" ? null : routeIdRaw,
      month: input.spec.month,
      treatmentType,
      gapKind,
      sourceGapCount: features.length,
      blocksClaims: uniqueSorted(features.flatMap((feature) => feature.blocksClaims)),
      sourceRefs: uniqueSorted(features.flatMap((feature) => feature.sourceRefs)),
      publicStatements: uniqueSorted(features.map((feature) => feature.publicStatement)),
    });
  }

  const sortedRows = rows.sort(
    (left, right) =>
      (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
      left.treatmentType.localeCompare(right.treatmentType) ||
      left.gapKind.localeCompare(right.gapKind),
  );
  const panelManifest: PanelManifest = {
    panelId: SOURCE_GAP_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: sourceGapModelPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "artifact",
        refId: "route_treatment_summary_artifact",
        role: "primary_source_gap_source",
      },
    ],
    summary: {
      sourceRowCount: input.routeTreatmentSourceGapFeatures.length,
      supportedRowCount: sortedRows.length,
      panelRowCount: sortedRows.length,
      routeCount: new Set(sortedRows.map((row) => row.routeId).filter((id) => id !== null)).size,
      entityCount: sortedRows.length,
      monthCount: sortedRows.length > 0 ? 1 : 0,
    },
    limitations: [
      "Rows represent source gaps detected by current materializers, not a complete inventory of every missing public source.",
      "Blocked-claim values are deterministic policy labels used to prevent overclaiming in downstream detectors.",
    ],
  };

  return {
    artifactKind: SOURCE_GAP_MODEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    month: input.spec.month,
    panelSpec: input.spec,
    panelManifest,
    summary: {
      routeCount: panelManifest.summary.routeCount,
      rowCount: sortedRows.length,
      sourceGapCount: sortedRows.reduce((sum, row) => sum + row.sourceGapCount, 0),
      treatmentTypeCounts: countBy(sortedRows.map((row) => row.treatmentType)),
      gapKindCounts: countBy(sortedRows.map((row) => row.gapKind)),
      blockedClaimCounts: countBy(sortedRows.flatMap((row) => row.blocksClaims)),
    },
    rows: sortedRows,
  };
}
