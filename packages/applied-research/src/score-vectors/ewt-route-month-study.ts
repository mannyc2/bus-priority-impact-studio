import {
  buildEwtRouteMonthScoreVectorArtifact,
  type EwtRouteMonthReliabilityRow,
  type EwtRouteMonthScoreVectorArtifact,
} from "./ewt-route-month";

export type EwtRouteMonthScoreVectorStudyMetadata = {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly minSampleCount: number;
  readonly fleetFlagQuantile: number;
};

export type EwtRouteMonthScoreVectorStudyRows = {
  readonly rows: readonly EwtRouteMonthReliabilityRow[];
};

export function buildEwtRouteMonthScoreVectorStudy(input: {
  readonly metadata: EwtRouteMonthScoreVectorStudyMetadata;
  readonly rows: EwtRouteMonthScoreVectorStudyRows;
}): EwtRouteMonthScoreVectorArtifact {
  return buildEwtRouteMonthScoreVectorArtifact({
    rows: input.rows.rows,
    startMonth: input.metadata.startMonth,
    endMonth: input.metadata.endMonth,
    releaseMonth: input.metadata.releaseMonth,
    generatedAt: input.metadata.generatedAt,
    dbPath: input.metadata.dbPath,
    artifactPath: input.metadata.artifactPath,
    minSampleCount: input.metadata.minSampleCount,
    fleetFlagQuantile: input.metadata.fleetFlagQuantile,
  });
}
