export type ScoreVectorStudyPlaceholder = {
  readonly planned: true;
  readonly reason: "score-vector-builders-migrate-after-core-scaffold";
};
export {
  buildEwtRouteMonthScoreVectorArtifact,
  parseEwtRouteMonthRows,
  routeMonthKey,
  type EwtRouteMonthReliabilityRow,
  type EwtRouteMonthScoreVectorArtifact,
  type RawEwtRouteMonthReliabilityRow,
} from "./ewt-route-month";
export {
  buildGenericDetectorScoreVectorArtifact,
  type GenericDetectorScoreVector,
  type GenericDetectorScoreVectorArtifact,
  type GenericDetectorScoreVectorAvailabilityStatus,
  type GenericDetectorScoreVectorCandidateRow,
  type GenericDetectorScoreVectorCoverageRow,
  type GenericDetectorScoreVectorEntry,
  type GenericDetectorScoreVectorSummary,
} from "./generic-detector";
export {
  buildRuntimeTrendScoreVectorArtifact,
  type RuntimeTrendDetectorScoreVector,
  type RuntimeTrendScoreVectorArtifact,
  type RuntimeTrendScoreVectorMonth,
} from "./runtime-trend";
export {
  buildSpeedPaceScoreVectorArtifact,
  type SpeedPaceScoreVectorArtifact,
  type SpeedPaceScoreVectorMonth,
} from "./speed-pace";
export type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers";
