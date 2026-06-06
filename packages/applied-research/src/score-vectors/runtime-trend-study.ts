import type {
  ObservedRuntimeSourceRow,
  RouteMetricHistorySourceRow,
  ScheduledRuntimeSourceRow,
} from "../feature-resolvers";
import {
  buildRuntimeTrendScoreVectorArtifact,
  type RuntimeTrendScoreVectorArtifact,
} from "./runtime-trend";

export type RuntimeTrendScoreVectorStudyMetadata = {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly candidateLimit?: number;
};

export type RuntimeTrendScoreVectorStudyRows = {
  readonly months: readonly string[];
  readonly scheduledRowsByYear: ReadonlyMap<number, readonly ScheduledRuntimeSourceRow[]>;
  readonly observedRowsByMonth: ReadonlyMap<string, readonly ObservedRuntimeSourceRow[]>;
  readonly routeMetricHistoryRows: readonly RouteMetricHistorySourceRow[];
};

export function buildRuntimeTrendScoreVectorStudy(input: {
  readonly metadata: RuntimeTrendScoreVectorStudyMetadata;
  readonly rows: RuntimeTrendScoreVectorStudyRows;
}): RuntimeTrendScoreVectorArtifact {
  return buildRuntimeTrendScoreVectorArtifact({
    months: input.rows.months,
    scheduledRowsByYear: input.rows.scheduledRowsByYear,
    observedRowsByMonth: input.rows.observedRowsByMonth,
    routeMetricHistoryRows: input.rows.routeMetricHistoryRows,
    startMonth: input.metadata.startMonth,
    endMonth: input.metadata.endMonth,
    releaseMonth: input.metadata.releaseMonth,
    generatedAt: input.metadata.generatedAt,
    dbPath: input.metadata.dbPath,
    artifactPath: input.metadata.artifactPath,
    ...(input.metadata.candidateLimit === undefined
      ? {}
      : { candidateLimit: input.metadata.candidateLimit }),
  });
}
