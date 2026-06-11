import type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers";
import { buildSpeedPaceScoreVectorArtifact, type SpeedPaceScoreVectorArtifact } from "./speed-pace";

export type SpeedPaceScoreVectorStudyMetadata = {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly candidateLimit?: number;
};

export type SpeedPaceScoreVectorStudyRows = {
  readonly rowsByMonth: ReadonlyMap<string, readonly SegmentDaypartSpeedSourceRow[]>;
  readonly months: readonly string[];
};

export function buildSpeedPaceScoreVectorStudy(input: {
  readonly metadata: SpeedPaceScoreVectorStudyMetadata;
  readonly rows: SpeedPaceScoreVectorStudyRows;
}): SpeedPaceScoreVectorArtifact {
  return buildSpeedPaceScoreVectorArtifact({
    rowsByMonth: input.rows.rowsByMonth,
    months: input.rows.months,
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
