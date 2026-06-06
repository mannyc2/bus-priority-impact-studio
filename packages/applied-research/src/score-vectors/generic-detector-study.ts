import {
  buildGenericDetectorScoreVectorArtifact,
  type GenericDetectorScoreVectorArtifact,
  type GenericDetectorScoreVectorCandidateRow,
  type GenericDetectorScoreVectorCoverageRow,
} from "./generic-detector";

export type GenericDetectorScoreVectorStudyMetadata = {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
};

export type GenericDetectorScoreVectorStudyRows = {
  readonly coverageRows: readonly GenericDetectorScoreVectorCoverageRow[];
  readonly candidateRows: readonly GenericDetectorScoreVectorCandidateRow[];
};

export function buildGenericDetectorScoreVectorStudy(input: {
  readonly metadata: GenericDetectorScoreVectorStudyMetadata;
  readonly rows: GenericDetectorScoreVectorStudyRows;
}): GenericDetectorScoreVectorArtifact {
  return buildGenericDetectorScoreVectorArtifact({
    coverageRows: input.rows.coverageRows,
    candidateRows: input.rows.candidateRows,
    startMonth: input.metadata.startMonth,
    endMonth: input.metadata.endMonth,
    releaseMonth: input.metadata.releaseMonth,
    generatedAt: input.metadata.generatedAt,
    dbPath: input.metadata.dbPath,
    artifactPath: input.metadata.artifactPath,
  });
}
