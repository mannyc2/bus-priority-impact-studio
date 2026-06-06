export type ScoreVectorStudyPlaceholder = {
  readonly planned: true;
  readonly reason: "score-vector-builders-migrate-after-core-scaffold";
};
export type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers";
export {
  buildEwtRouteMonthScoreVectorArtifact,
  type EwtRouteMonthReliabilityRow,
  type EwtRouteMonthScoreVectorArtifact,
  parseEwtRouteMonthRows,
  type RawEwtRouteMonthReliabilityRow,
  routeMonthKey,
} from "./ewt-route-month";
export {
  buildEwtRouteMonthScoreVectorStudy,
  type EwtRouteMonthScoreVectorStudyMetadata,
  type EwtRouteMonthScoreVectorStudyRows,
} from "./ewt-route-month-study";
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
  buildGenericDetectorScoreVectorStudy,
  type GenericDetectorScoreVectorStudyMetadata,
  type GenericDetectorScoreVectorStudyRows,
} from "./generic-detector-study";
export {
  buildRuntimeTrendScoreVectorArtifact,
  type RuntimeTrendDetectorScoreVector,
  type RuntimeTrendScoreVectorArtifact,
  type RuntimeTrendScoreVectorMonth,
} from "./runtime-trend";
export {
  buildRuntimeTrendScoreVectorStudy,
  type RuntimeTrendScoreVectorStudyMetadata,
  type RuntimeTrendScoreVectorStudyRows,
} from "./runtime-trend-study";
export {
  buildSpeedPaceScoreVectorArtifact,
  type SpeedPaceScoreVectorArtifact,
  type SpeedPaceScoreVectorMonth,
} from "./speed-pace";
export {
  buildSpeedPaceScoreVectorStudy,
  type SpeedPaceScoreVectorStudyMetadata,
  type SpeedPaceScoreVectorStudyRows,
} from "./speed-pace-study";
