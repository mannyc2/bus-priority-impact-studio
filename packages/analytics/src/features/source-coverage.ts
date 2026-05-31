export const SOURCE_COVERAGE_FEATURE_GRAIN = "source_coverage" as const;

export type SourceCoverageFeature = {
  sourceId: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  month: string;
  expected: boolean;
  observed: boolean;
  observedCount: number;
  freshnessStatus: "fresh" | "stale" | "missing" | "not_expected";
  joinRate: number | null;
};
