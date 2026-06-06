import type {
  ObservedHeadwayForStopDirectionHourEwt,
  ScheduleStopArrivalForStopDirectionHourEwt,
  StopDirectionHourEwtScheduleSelection,
} from "../feature-resolvers";
import type { EwtRouteMonthReliabilityRow } from "../score-vectors";

export {
  type AnalyticsBackfillCoverageLocalDbQuery,
  loadAnalyticsBackfillCoverageLocalDbRows,
} from "./analytics-backfill-coverage-rows";
export {
  type AnalyticsCorpusProfileLocalDbQuery,
  loadAnalyticsCorpusProfileLocalDbRows,
} from "./analytics-corpus-profile-rows";
export {
  type AnalyticsDetectorReadinessDirectSurfaceCoverageQuery,
  loadAnalyticsDetectorReadinessDirectSurfaceCoverage,
} from "./analytics-detector-readiness-rows";
export {
  auditContextEventRouteTouches,
  type ContextEventRouteTouchAuditSummary,
  type ContextEventRouteTouchKind,
  materializeContextEventRouteTouches,
  type SourceEventKindAudit,
} from "./context-event-route-touches";
export {
  type BuildContextEventsLocalDb,
  type BuildContextEventsResult,
  buildAceViolationAggregateEvents,
  contextEventId,
  normalizeContextEventTime,
  runBuildContextEvents,
} from "./context-events";
export {
  type DataProductCheckTemplateValues,
  evaluateDataProductArtifactGlobCheck,
  evaluateDataProductJsonOrFileArtifactCheck,
  evaluateDataProductMonthTableCoverageCheck,
  evaluateDataProductRouteArtifactCoverageCheck,
  evaluateDataProductScoreVectorRoutesCheck,
  evaluateDataProductSourceYearRouteCoverageCheck,
  evaluateDataProductTableRouteCoverageCheck,
  evaluateDataProductTableRowCountCheck,
  resolveDataProductCheckTemplate,
} from "./data-product-checks";
export {
  type BuildDataProductRouteUniversesInput,
  buildDataProductRouteUniverses,
  type DataProductRouteUniverseSets,
  type DataProductRouteUniverseSummary,
  dataProductRouteUniverseSummary,
  latestDataProductGtfsRunId,
} from "./data-product-route-universes";
export {
  type DetectorCorpusGrainCoverageCounts,
  type DetectorCorpusGrainLocalDbQuery,
  type DetectorCorpusGrainLocalDbRows,
  loadDetectorCorpusGrainLocalDbRows,
} from "./detector-corpus-grain-rows";
export {
  type DetectorCoverageAuditLocalDbQuery,
  type DetectorCoverageAuditLocalDbRows,
  loadDetectorCoverageAuditLocalDbRows,
} from "./detector-coverage-audit-rows";
export {
  type DetectorEvaluationLabelLocalDbQuery,
  type DetectorEvaluationLabelLocalDbRows,
  loadDetectorEvaluationLabelLocalDbRows,
} from "./detector-evaluation-label-rows";
export {
  loadRouteMonthShadowAuditLocalDbRows,
  loadSpeedPaceShadowAuditLocalDbRows,
  type RouteMonthShadowAuditLocalDbQuery,
  type RouteMonthShadowAuditLocalDbRows,
  type SpeedPaceShadowAuditLocalDbQuery,
  type SpeedPaceShadowAuditLocalDbRows,
} from "./detector-shadow-audit-rows";
export {
  type DetectorStudyLocalDbQuery,
  loadDetectorStudyLocalDbRows,
} from "./detector-study-rows";
export {
  type EwtRouteMonthScoreVectorLocalDbQuery,
  loadCustomerJourneyAbstByRouteMonth,
  loadEwtRouteMonthScoreVectorLocalDbRows,
} from "./ewt-route-month-score-vector-rows";
export {
  type GenericDetectorScoreVectorLocalDbQuery,
  type GenericDetectorScoreVectorLocalDbRows,
  loadGenericDetectorScoreVectorLocalDbRows,
} from "./generic-detector-score-vector-rows";
export {
  type InterventionComparisonRow,
  type InterventionPanelLocalDbQuery,
  loadInterventionPanelLocalDbRows,
} from "./intervention-panel-rows";
export {
  type BuildLionGeometryIndexInputs,
  type BuildLionGeometryIndexLocalDb,
  type BuildLionGeometryIndexResult,
  runBuildLionGeometryIndex,
  unwrapGeoJsonGeometry,
} from "./lion-geometry-index";
export {
  type BuildObservedHeadwaysResult,
  deriveObservedHeadwayRows,
  type ObservedHeadwaySample,
  type ObservedStopEvent,
  runBuildObservedHeadways,
} from "./observed-headways";
export {
  canonicalParkingBoroughCode,
  normalizeParkingStreetCode,
  normalizeParkingStreetName,
  numericHouseNumber,
  type ParsedParkingCameraLocation,
  parkingCameraLocationKey,
  parkingLocationKey,
  parkingStreetCodeHouseLocationKey,
  parseParkingCameraLocation,
  stableMatchEvidenceHash,
  streetCorridorKey,
} from "./parking-location";
export {
  type BuildParkingViolationMatchesLocalDbResult,
  buildParkingViolationMatchAuditArtifact,
  buildParkingViolationStreetRouteIndex,
  clearParkingViolationMatches,
  countParkingViolationLocationGroups,
  hydrateParkingViolationLionRawFields,
  hydrateParkingViolationRawFields,
  insertParkingViolationMatch,
  listParkingViolationAddressGroups,
  listParkingViolationCameraGroups,
  listParkingViolationLionSegments,
  loadParkingViolationRoutesForPhysicalIds,
  type ParkingViolationCameraGeocodeOutcome,
  type ParkingViolationCameraGeocodeRequest,
  type ParkingViolationLionSegment,
  type ParkingViolationMatchAuditArtifact,
  type ParkingViolationMatchAuditSummary,
  type ParkingViolationMatchGroup,
  type ParkingViolationMatchInsert,
  type ParkingViolationMatchKindSummary,
  type ParkingViolationMatchRunCounts,
  type ParkingViolationRouteCandidate,
  parkingViolationCameraGeocodeRequest,
  type RawLionParkingMatchHydrationRow,
  type RawParkingViolationMatchHydrationRow,
  refreshParkingViolationLocationKeys,
  resolveParkingViolationCameraMatch,
  resolveParkingViolationStreetCodeHouseMatch,
  runBuildParkingViolationMatchesLocalDb,
  summarizeParkingViolationMatches,
} from "./parking-violation-matches";
export {
  loadPersistentSpeedSegmentCoverageRepairLocalDbRows,
  type PersistentSpeedSegmentCoverageRepairLocalDbQuery,
  type PersistentSpeedSegmentCoverageRepairLocalDbRows,
} from "./persistent-speed-coverage-repair-rows";
export {
  loadReviewPacketLocalDbRows,
  type ReviewPacketLocalDbQuery,
  type ReviewPacketLocalDbRows,
} from "./review-packet-rows";
export {
  buildPlanRows,
  defaultRouteBuildPlanLimit,
  type RouteBuildPlanResult,
  routeBuildPriorityScore,
  runRouteBuildPlan,
} from "./route-build-plan";
export {
  type AssignedCounty,
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
  type CountyAggregate,
  type RouteEquityContextResult,
  runRouteEquityContext,
} from "./route-equity-context";
export {
  loadRouteHourlyProfileLocalDbRows,
  type RouteHourlyProfileLocalDbQuery,
  type RouteMonthHourlyProfileRow,
} from "./route-hourly-profile-rows";
export {
  buildDocumentAnchorEventsForRouteEvaluation,
  defaultInterventionEvaluationComparisonRouteCount,
  defaultInterventionEvaluationMinSampleMonths,
  defaultInterventionEvaluationWindowMonths,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
  type RouteInterventionEvaluationLocalDb,
  type RouteInterventionEvaluationResult,
  runRouteInterventionEvaluation,
} from "./route-intervention-evaluation";
export {
  type BuildRouteLionLinkInputs,
  type BuildRouteLionLinkLocalDb,
  type BuildRouteLionLinkResult,
  defaultRouteLionLinkBufferMeters,
  type RouteLionLinkRouteRowsQuery,
  routeLionLinkBufferDegrees,
  routeLionLinkRouteRowsQuery,
  runBuildRouteLionLink,
} from "./route-lion-link";
export {
  buildSummary,
  defaultObservedReliabilityMinSampleThreshold,
  type ReliabilityStatus,
  type RouteObservedReliabilityResult,
  type RouteReliabilitySummary,
  runRouteObservedReliability,
} from "./route-observed-reliability";
export {
  buildReadinessRows,
  missingRouteReadinessInputs,
  type RouteReadinessResult,
  routeReadinessStatus,
  runRouteReadiness,
  scoreReadiness,
} from "./route-readiness";
export {
  buildHeadwayGroups,
  type HeadwayGroup,
  type RouteReliabilityBaselineResult,
  type RouteReliabilityBaselineRow,
  routeBaseline,
  runRouteReliabilityBaseline,
} from "./route-reliability-baseline";
export {
  auditRouteScheduleProgress,
  type RouteScheduleProgressResult,
} from "./route-schedule-progress";
export {
  type BuildRouteShapeGeometryIndexLocalDb,
  type BuildRouteShapeGeometryIndexResult,
  buildRouteShapeMultiLineString,
  extractRouteShapeLineStrings,
  type RouteShapeGeometryIndexShape,
  runBuildRouteShapeGeometryIndexFromShapes,
} from "./route-shape-geometry-index";
export {
  buildRouteSourceReconciliation,
  type RouteAliasCandidate,
  type RouteSourceReconciliationArtifact,
  type RouteSourceReconciliationRoute,
  type ScheduleSourceYearRoute,
} from "./route-source-reconciliation";
export {
  ensureRouteSpeedHistoryCoverageTable,
  materializeRouteSpeedHistoryCoverageIndex,
  normalizeRouteSpeedHistoryRouteId,
  type RouteSpeedHistoryCoverageIndexLocalDb,
  type RouteSpeedHistoryCoverageIndexResult,
  type RouteSpeedHistoryCoverageIndexRoute,
} from "./route-speed-history-coverage-index";
export {
  loadCompleteRouteSpeedScheduleMonths,
  loadRouteSpeedHistoryLocalDbRows,
  loadRouteSpeedScheduleLocalDbRows,
} from "./route-speed-history-rows";
export {
  loadCurrentRouteSpeedSpineCatalogRouteIds,
  loadRouteSpeedSpineCandidateLocalDbRows,
  loadRouteSpeedSpineLocalDbRows,
  type RouteSpeedSpineCandidate,
} from "./route-speed-spine-rows";
export {
  loadRuntimeTrendScoreVectorLocalDbRows,
  type RuntimeTrendScoreVectorLocalDbQuery,
  type RuntimeTrendScoreVectorLocalDbRows,
} from "./runtime-trend-score-vector-rows";
export {
  loadRouteTreatmentSummaryLocalDbRows,
  type RouteTreatmentCatalogRow,
  type RouteTreatmentSummaryLocalDbQuery,
  type RouteTreatmentSummaryLocalDbRows,
} from "./route-treatment-summary-rows";
export {
  loadSegmentDaypartHistoryLocalDbRows,
  type SegmentDaypartHistoryLocalDbQuery,
  type SegmentDaypartHistoryRow,
} from "./segment-daypart-history-rows";
export {
  buildSourceCoverageLedger,
  type DetectorEligibility,
  type EvidenceRole,
  SOURCE_COVERAGE_CONFIGS,
  type SourceConfig,
  type SourceCoverageLedger,
  type SourceCoverageLedgerEntry,
  type SourceDecision,
  type SourceRole,
} from "./source-coverage";
export {
  buildSourceMonthCoverageMatrix,
  type SourceMonthCoverageCell,
  type SourceMonthCoverageMatrix,
  type SourceMonthCoverageSource,
} from "./source-month-coverage";
export {
  ensureLionSegmentGeomColumn,
  ensureRouteShapeGeomColumn,
} from "./spatial-tables";
export {
  loadSpeedPaceScoreVectorLocalDbRows,
  type SpeedPaceScoreVectorLocalDbQuery,
  type SpeedPaceScoreVectorLocalDbRows,
} from "./speed-pace-score-vector-rows";
export {
  buildStopDirectionHourEwtFeatureArtifactFromDb,
  loadStopDirectionHourEwtFeatureLocalDbRows,
  queryGtfsStaticScheduleArrivalsForEwtFeatures,
  queryObservedHeadwaysForEwtFeatures,
  queryScheduleTimepointsForEwtFeatures,
  querySocrataRouteSchedulesForEwtFeatures,
  type StopDirectionHourEwtFeatureArtifactFromDbInput,
  type StopDirectionHourEwtFeatureLocalDbQuery,
} from "./stop-direction-hour-ewt-feature-rows";

export const LOCAL_PIPELINE_SQLITE_CORPUS = "local-pipeline-sqlite";

export type LocalPipelineSqliteCorpus = typeof LOCAL_PIPELINE_SQLITE_CORPUS;

export type LocalResearchPort<TParams, TOutput> = {
  readonly id: string;
  readonly corpus: LocalPipelineSqliteCorpus;
  readonly load: (params: TParams) => TOutput;
};

export function createLocalResearchPort<TParams, TOutput>(input: {
  id: string;
  load: (params: TParams) => TOutput;
}): LocalResearchPort<TParams, TOutput> {
  return {
    id: input.id,
    corpus: LOCAL_PIPELINE_SQLITE_CORPUS,
    load: input.load,
  };
}

export type EwtRouteMonthRowsQuery = {
  readonly startMonth: string;
  readonly endMonth: string;
};

export type EwtRouteMonthRowsPort = LocalResearchPort<
  EwtRouteMonthRowsQuery,
  readonly EwtRouteMonthReliabilityRow[]
>;

export function createEwtRouteMonthRowsPort(
  load: (params: EwtRouteMonthRowsQuery) => readonly EwtRouteMonthReliabilityRow[],
): EwtRouteMonthRowsPort {
  return createLocalResearchPort({
    id: "ewt_route_month_rows",
    load,
  });
}

export type StopDirectionHourEwtFeatureInputQuery = {
  readonly month: string;
  readonly routeId: string;
  readonly runId: string;
  readonly scheduleSource: "auto" | StopDirectionHourEwtScheduleSelection["kind"];
  readonly gtfsRunId: string | null;
};

export type StopDirectionHourEwtFeatureInputRows = {
  readonly selection: StopDirectionHourEwtScheduleSelection;
  readonly scheduleArrivals: readonly ScheduleStopArrivalForStopDirectionHourEwt[];
  readonly observedHeadways: readonly ObservedHeadwayForStopDirectionHourEwt[];
};

export type StopDirectionHourEwtFeatureInputPort = LocalResearchPort<
  StopDirectionHourEwtFeatureInputQuery,
  StopDirectionHourEwtFeatureInputRows
>;

export function createStopDirectionHourEwtFeatureInputPort(
  load: (params: StopDirectionHourEwtFeatureInputQuery) => StopDirectionHourEwtFeatureInputRows,
): StopDirectionHourEwtFeatureInputPort {
  return createLocalResearchPort({
    id: "stop_direction_hour_ewt_feature_inputs",
    load,
  });
}
