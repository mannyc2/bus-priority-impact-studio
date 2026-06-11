// Per feature-grain × release-month materialization coverage (S2.4 in
// docs/research/backend-goal-finish-detectors.md).
//
// For each feature grain, how many scopes were actually materialized this release month versus the
// fleet universe that *should* exist. This is the precondition for honest fleet-readiness claims on
// stop_direction_hour detectors (and the agreement-audit baseline for the source_gap coverage
// authority, S4.3): a detector can only claim fleet coverage if the grain it reads is materialized
// across the fleet. Pure + deterministic; the pipeline command that counts rows from the DB wraps
// this builder. When the fleet universe is unknown, status is capped at `partial` — an unknown
// denominator must never read as `complete`.

export type FeatureGrainMaterializationStatus = "complete" | "partial" | "sparse" | "missing";

export type FeatureGrainMaterializationRowInput = {
  readonly featureGrain: string;
  readonly scopesMaterialized: number;
  readonly fleetUniverse?: number | null;
  readonly note?: string;
};

export type FeatureGrainMaterializationRow = {
  readonly featureGrain: string;
  readonly scopesMaterialized: number;
  readonly fleetUniverse: number | null;
  readonly coverageShare: number | null;
  readonly status: FeatureGrainMaterializationStatus;
  readonly note: string | null;
};

export type FeatureGrainMaterializationThresholds = {
  readonly completeShareFloor: number;
  readonly partialShareFloor: number;
};

export const DEFAULT_FEATURE_GRAIN_MATERIALIZATION_THRESHOLDS: FeatureGrainMaterializationThresholds =
  {
    completeShareFloor: 0.99,
    partialShareFloor: 0.5,
  };

export type FeatureGrainMaterializationCoverage = {
  readonly artifactKind: "feature_grain_materialization_coverage";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly thresholds: FeatureGrainMaterializationThresholds;
  readonly summary: {
    readonly grainCount: number;
    readonly completeCount: number;
    readonly partialCount: number;
    readonly sparseCount: number;
    readonly missingCount: number;
    readonly fleetUniverseKnownCount: number;
  };
  readonly rows: readonly FeatureGrainMaterializationRow[];
};

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function statusFor(
  scopesMaterialized: number,
  coverageShare: number | null,
  thresholds: FeatureGrainMaterializationThresholds,
): FeatureGrainMaterializationStatus {
  if (scopesMaterialized <= 0) return "missing";
  if (coverageShare === null) return "partial"; // unknown denominator can never read as complete
  if (coverageShare >= thresholds.completeShareFloor) return "complete";
  if (coverageShare >= thresholds.partialShareFloor) return "partial";
  return "sparse";
}

export function buildFeatureGrainMaterializationCoverage(input: {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly rows: readonly FeatureGrainMaterializationRowInput[];
  readonly thresholds?: Partial<FeatureGrainMaterializationThresholds>;
}): FeatureGrainMaterializationCoverage {
  const thresholds: FeatureGrainMaterializationThresholds = {
    ...DEFAULT_FEATURE_GRAIN_MATERIALIZATION_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const seen = new Set<string>();
  const rows: FeatureGrainMaterializationRow[] = input.rows
    .map((row): FeatureGrainMaterializationRow => {
      if (seen.has(row.featureGrain)) {
        throw new Error(`Duplicate materialization row for feature grain ${row.featureGrain}.`);
      }
      seen.add(row.featureGrain);
      if (row.scopesMaterialized < 0) {
        throw new Error(`scopesMaterialized cannot be negative for ${row.featureGrain}.`);
      }
      const fleetUniverse =
        row.fleetUniverse === undefined || row.fleetUniverse === null ? null : row.fleetUniverse;
      if (fleetUniverse !== null && fleetUniverse < 0) {
        throw new Error(`fleetUniverse cannot be negative for ${row.featureGrain}.`);
      }
      const coverageShare =
        fleetUniverse === null || fleetUniverse === 0
          ? null
          : round4(row.scopesMaterialized / fleetUniverse);
      return {
        featureGrain: row.featureGrain,
        scopesMaterialized: row.scopesMaterialized,
        fleetUniverse,
        coverageShare,
        status: statusFor(row.scopesMaterialized, coverageShare, thresholds),
        note: row.note ?? null,
      };
    })
    .sort((left, right) => left.featureGrain.localeCompare(right.featureGrain));

  return {
    artifactKind: "feature_grain_materialization_coverage",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    thresholds,
    summary: {
      grainCount: rows.length,
      completeCount: rows.filter((row) => row.status === "complete").length,
      partialCount: rows.filter((row) => row.status === "partial").length,
      sparseCount: rows.filter((row) => row.status === "sparse").length,
      missingCount: rows.filter((row) => row.status === "missing").length,
      fleetUniverseKnownCount: rows.filter((row) => row.fleetUniverse !== null).length,
    },
    rows,
  };
}
