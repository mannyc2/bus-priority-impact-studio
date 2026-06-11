import { Database } from "bun:sqlite";
import { and, eq, inArray, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { z } from "zod";
import type {
  LocalCorridor,
  LocalCorridorArtifact,
  LocalCorridorHotspot,
  LocalCorridorInterventionContext,
  LocalCorridorMonthSummary,
  LocalCorridorRouteMember,
  LocalInterventionEvent,
  LocalRouteArtifact,
  LocalRouteBatchBuiltRoute,
  LocalRouteBatchIssue,
  LocalRouteBatchStatus,
  LocalRouteBriefPeakWindow,
  LocalRouteBriefSlowestWindow,
  LocalRouteBriefSummary,
  LocalRouteBuildPlan,
  LocalRouteCatalogEntry,
  LocalRouteComparisonRank,
  LocalRouteEquityContext,
  LocalRouteInterventionComparison,
  LocalRouteMonthCoverage,
  LocalRouteMonthSourceStatus,
  LocalRouteMonthTrend,
  LocalRouteObservedReliabilitySummary,
  LocalRouteReadiness,
  LocalRouteReliabilityBaseline,
  LocalRouteReliabilityGapWindow,
  LocalRouteScorecard,
} from "../../local/index.js";
import {
  corridor,
  corridorArtifact,
  corridorHotspot,
  corridorInterventionContext,
  corridorMonthSummary,
  corridorRouteMember,
  interventionEvent,
  routeArtifact,
  routeBatchBuiltRoute,
  routeBatchIssue,
  routeBatchStatus,
  routeBriefPeakWindow,
  routeBriefSlowestWindow,
  routeBriefSummary,
  routeBuildPlan,
  routeCatalog,
  routeCatalogType,
  routeComparisonRank,
  routeDirection,
  routeEquityContext,
  routeInterventionComparison,
  routeMonthCoverage,
  routeMonthSourceStatus,
  routeMonthTrend,
  routeObservedReliabilitySummary,
  routeReadiness,
  routeReadinessMissingInput,
  routeReliabilityBaseline,
  routeReliabilityGapWindow,
  routeScorecard,
  routeScorecardCitation,
  routeSpeedHistoryCoverage,
  routeTimelineIndex,
  sourceMonthCoverage,
} from "../schema.js";
import {
  CorridorArtifactInsertSchema,
  CorridorHotspotInsertSchema,
  CorridorInsertSchema,
  CorridorInterventionContextInsertSchema,
  CorridorMonthSummaryInsertSchema,
  CorridorRouteMemberInsertSchema,
  InterventionEventInsertSchema,
  RouteBriefSummaryInsertSchema,
  RouteBriefPeakWindowInsertSchema,
  RouteBriefSlowestWindowInsertSchema,
  RouteArtifactInsertSchema,
  RouteBatchBuiltRouteInsertSchema,
  RouteBatchIssueInsertSchema,
  RouteBatchStatusInsertSchema,
  RouteBuildPlanInsertSchema,
  RouteCatalogInsertSchema,
  RouteCatalogTypeInsertSchema,
  RouteComparisonRankInsertSchema,
  RouteDirectionInsertSchema,
  RouteEquityContextInsertSchema,
  RouteInterventionComparisonInsertSchema,
  RouteMonthCoverageInsertSchema,
  RouteMonthSourceStatusInsertSchema,
  RouteMonthTrendInsertSchema,
  RouteObservedReliabilitySummaryInsertSchema,
  RouteReadinessInsertSchema,
  RouteReadinessMissingInputInsertSchema,
  RouteReliabilityBaselineInsertSchema,
  RouteReliabilityGapWindowInsertSchema,
  RouteScorecardInsertSchema,
  RouteSpeedHistoryCoverageInsertSchema,
  RouteTimelineIndexInsertSchema,
  SourceMonthCoverageInsertSchema,
} from "../validation.js";

export type D1RouteSpeedHistoryCoverageInput = {
  routeId: string;
  month: string;
  routeSlug: string;
  historyStartMonth: string;
  historyEndMonth: string;
  artifactPath: string;
  artifactStatus: string;
  monthCount: number;
  segmentCount: number;
  cellCount: number;
  availableCellCount: number;
  missingCellCount: number;
  generatedAt: string;
};

export type D1SourceMonthCoverageInput = {
  sourceId: string;
  month: string;
  label: string;
  sourceKind: string;
  grain: string;
  status: string;
  rowCount: number | null;
  routeCount: number | null;
  note: string | null;
  generatedAt: string;
  artifactPath: string | null;
};

export type D1RouteTimelineIndexInput = {
  routeId: string;
  month: string;
  supportLevel: "timeline_ready" | "timeline_sparse" | "timeline_review_only" | "invalid";
  qualityFlags: string[];
  defaultEventCount: number;
  secondaryEventCount: number;
  reviewOnlyEventCount: number;
  eventCount: number;
  sourceBackedEventCount: number;
  dateAssertionBackedEventCount: number;
  unresolvedDateEventCount: number;
  lowConfidenceEventCount: number;
  unaccountedCandidateCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  totalTokens: number | null;
  defaultEvents: unknown[];
  bundleArtifactKey: string;
  bundleArtifactSha256: string;
  bundleArtifactByteLength: number;
  sourceBundlePath: string;
  generatedAt: string;
};

export type D1SeedInput = {
  month: string;
  routeCatalog: LocalRouteCatalogEntry[];
  routeCoverage: LocalRouteMonthCoverage[];
  routeReadiness: LocalRouteReadiness[];
  routeBuildPlan: LocalRouteBuildPlan[];
  routeReliabilityBaseline: LocalRouteReliabilityBaseline[];
  routeReliabilityGapWindows: LocalRouteReliabilityGapWindow[];
  routeObservedReliabilitySummaries: LocalRouteObservedReliabilitySummary[];
  interventionEvents: LocalInterventionEvent[];
  routeInterventionComparisons: LocalRouteInterventionComparison[];
  routeArtifacts: LocalRouteArtifact[];
  corridors: LocalCorridor[];
  corridorArtifacts: LocalCorridorArtifact[];
  corridorRouteMembers: LocalCorridorRouteMember[];
  corridorMonthSummaries: LocalCorridorMonthSummary[];
  corridorInterventionContexts: LocalCorridorInterventionContext[];
  corridorHotspots: LocalCorridorHotspot[];
  routeMonthSourceStatuses: LocalRouteMonthSourceStatus[];
  routeMonthTrends: LocalRouteMonthTrend[];
  routeTimelineIndex: D1RouteTimelineIndexInput[];
  routeSpeedHistoryCoverage: D1RouteSpeedHistoryCoverageInput[];
  sourceMonthCoverage: D1SourceMonthCoverageInput[];
  routeEquityContext: LocalRouteEquityContext[];
  routeScorecards: LocalRouteScorecard[];
  routeBriefSummaries: LocalRouteBriefSummary[];
  routeBriefPeakWindows: LocalRouteBriefPeakWindow[];
  routeBriefSlowestWindows: LocalRouteBriefSlowestWindow[];
  routeComparisonRanks: LocalRouteComparisonRank[];
  routeBatchStatus: LocalRouteBatchStatus | null;
  routeBatchBuiltRoutes: LocalRouteBatchBuiltRoute[];
  routeBatchIssues: LocalRouteBatchIssue[];
};

export type D1SeedSqlResult = {
  seedSql: string;
  routeCount: number;
  comparisonRowCount: number;
  routeCatalogRowCount: number;
  routeCatalogTypeRowCount: number;
  routeDirectionRowCount: number;
  routeCoverageRowCount: number;
  routeReadinessRowCount: number;
  routeReadinessMissingInputRowCount: number;
  routeBuildPlanRowCount: number;
  routeReliabilityBaselineRowCount: number;
  routeReliabilityGapWindowRowCount: number;
  routeObservedReliabilitySummaryRowCount: number;
  interventionEventRowCount: number;
  routeInterventionComparisonRowCount: number;
  routeArtifactRowCount: number;
  corridorRowCount: number;
  corridorArtifactRowCount: number;
  corridorRouteMemberRowCount: number;
  corridorMonthSummaryRowCount: number;
  corridorInterventionContextRowCount: number;
  corridorHotspotRowCount: number;
  routeMonthSourceStatusRowCount: number;
  routeMonthTrendRowCount: number;
  routeTimelineIndexRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
  routeSpeedHistoryCoverageRowCount: number;
  sourceMonthCoverageRowCount: number;
};

const seedDb = drizzle({ client: new Database(":memory:") });
const sqliteDialect = new SQLiteSyncDialect();

function renderQuery(query: SQLWrapper): string {
  return `${sqliteDialect.sqlToQuery(query.getSQL().inlineParams()).sql};`;
}

function validateSeedRow(schema: z.ZodType, tableName: string, row: unknown): void {
  const result = schema.safeParse(row);
  if (result.success) return;

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<row>"}: ${issue.message}`)
    .join("; ");
  throw new Error(`D1 seed row failed validation for ${tableName}: ${details}`);
}

function validateD1SeedRows(input: D1SeedInput): void {
  const { month } = input;

  for (const route of input.routeCatalog) {
    validateSeedRow(RouteCatalogInsertSchema, "route_catalog", {
      routeId: route.routeId,
      routeShortName: route.routeShortName,
      routeLongName: route.routeLongName,
      shapeCount: route.shapeCount,
      stopCount: route.stopCount,
      timepointStopCount: route.timepointStopCount,
      latitudeMin: route.latitudeMin,
      latitudeMax: route.latitudeMax,
      longitudeMin: route.longitudeMin,
      longitudeMax: route.longitudeMax,
    });
    route.routeTypes.forEach((routeType, index) => {
      validateSeedRow(RouteCatalogTypeInsertSchema, "route_catalog_type", {
        routeId: route.routeId,
        typeRank: index + 1,
        routeType,
      });
    });
    route.directions.forEach((directionName, index) => {
      validateSeedRow(RouteDirectionInsertSchema, "route_direction", {
        routeId: route.routeId,
        directionId: index,
        directionName,
      });
    });
  }

  for (const row of input.routeCoverage) {
    validateSeedRow(RouteMonthCoverageInsertSchema, "route_month_coverage", {
      routeId: row.routeId,
      month,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
      hasSpeedData: row.hasSpeedData,
      hasScheduleData: row.hasScheduleData,
    });
  }

  for (const row of input.routeReadiness) {
    validateSeedRow(RouteReadinessInsertSchema, "route_readiness", {
      routeId: row.routeId,
      month,
      routeShortName: row.routeShortName,
      routeLongName: row.routeLongName,
      readinessStatus: row.readinessStatus,
      buildEligible: row.buildEligible,
      readinessScore: row.readinessScore,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
      shapeCount: row.shapeCount,
      stopCount: row.stopCount,
      timepointStopCount: row.timepointStopCount,
    });
  }

  for (const row of input.routeReadiness) {
    row.missingInputs.forEach((inputName, index) => {
      validateSeedRow(RouteReadinessMissingInputInsertSchema, "route_readiness_missing_input", {
        routeId: row.routeId,
        month,
        inputRank: index + 1,
        inputName,
        severity: "blocking",
        note: null,
      });
    });
  }

  for (const row of input.routeBuildPlan) {
    validateSeedRow(RouteBuildPlanInsertSchema, "route_build_plan", {
      routeId: row.routeId,
      month,
      routeShortName: row.routeShortName,
      routeLongName: row.routeLongName,
      candidateRank: row.candidateRank,
      planStatus: row.planStatus,
      selectedForNextBatch: row.selectedForNextBatch,
      alreadyBuilt: row.alreadyBuilt,
      buildEligible: row.buildEligible,
      priorityScore: row.priorityScore,
      readinessStatus: row.readinessStatus,
      readinessScore: row.readinessScore,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
    });
  }

  for (const row of input.routeReliabilityBaseline) {
    validateSeedRow(RouteReliabilityBaselineInsertSchema, "route_reliability_baseline", {
      routeId: row.routeId,
      month: row.month,
      reliabilityStatus: row.reliabilityStatus,
      scheduledTimepointCount: row.scheduledTimepointCount,
      stopHeadwayGroupCount: row.stopHeadwayGroupCount,
      headwaySampleCount: row.headwaySampleCount,
      medianScheduledHeadwayMinutes: row.medianScheduledHeadwayMinutes,
      p90ScheduledHeadwayMinutes: row.p90ScheduledHeadwayMinutes,
      maxScheduledHeadwayMinutes: row.maxScheduledHeadwayMinutes,
      scheduledShortHeadwayShare: row.scheduledShortHeadwayShare,
      scheduledLongGapShare: row.scheduledLongGapShare,
    });
  }

  for (const row of input.routeReliabilityGapWindows) {
    validateSeedRow(RouteReliabilityGapWindowInsertSchema, "route_reliability_gap_window", {
      routeId: row.routeId,
      month: row.month,
      windowRank: row.windowRank,
      dayType: row.dayType,
      directionId: row.directionId,
      stopId: row.stopId,
      stopName: row.stopName,
      sampleCount: row.sampleCount,
      medianHeadwayMinutes: row.medianHeadwayMinutes,
      p90HeadwayMinutes: row.p90HeadwayMinutes,
      maxHeadwayMinutes: row.maxHeadwayMinutes,
    });
  }

  for (const row of input.routeObservedReliabilitySummaries) {
    validateObservedReliabilitySeedRow(row);
  }

  for (const row of input.interventionEvents) {
    validateSeedRow(InterventionEventInsertSchema, "intervention_event", {
      eventId: row.eventId,
      routeId: row.routeId,
      interventionType: row.interventionType,
      sourceId: row.sourceId,
      program: row.program,
      implementationDate: row.implementationDate,
      implementationMonth: row.implementationMonth,
      eventStatus: row.eventStatus,
      description: row.description,
    });
  }

  for (const row of input.routeInterventionComparisons) {
    validateSeedRow(RouteInterventionComparisonInsertSchema, "route_intervention_comparison", {
      routeId: row.routeId,
      month: row.month,
      eventId: row.eventId,
      interventionType: row.interventionType,
      sourceId: row.sourceId,
      evaluationLevel: row.evaluationLevel,
      comparisonStatus: row.comparisonStatus,
      preStartMonth: row.preStartMonth,
      preEndMonth: row.preEndMonth,
      postStartMonth: row.postStartMonth,
      postEndMonth: row.postEndMonth,
      requestedPreMonthCount: row.requestedPreMonthCount,
      requestedPostMonthCount: row.requestedPostMonthCount,
      preSampleMonthCount: row.preSampleMonthCount,
      postSampleMonthCount: row.postSampleMonthCount,
      preSpeedObservationCount: row.preSpeedObservationCount,
      postSpeedObservationCount: row.postSpeedObservationCount,
      preAverageSpeedMph: row.preAverageSpeedMph,
      postAverageSpeedMph: row.postAverageSpeedMph,
      speedDeltaMph: row.speedDeltaMph,
      preAverageMonthlyRidership: row.preAverageMonthlyRidership,
      postAverageMonthlyRidership: row.postAverageMonthlyRidership,
      ridershipDelta: row.ridershipDelta,
      comparisonRouteCount: row.comparisonRouteCount,
      comparisonRouteIds: row.comparisonRouteIds,
      comparisonPreAverageSpeedMph: row.comparisonPreAverageSpeedMph,
      comparisonPostAverageSpeedMph: row.comparisonPostAverageSpeedMph,
      comparisonSpeedDeltaMph: row.comparisonSpeedDeltaMph,
      adjustedSpeedDeltaMph: row.adjustedSpeedDeltaMph,
      comparisonPreAverageMonthlyRidership: row.comparisonPreAverageMonthlyRidership,
      comparisonPostAverageMonthlyRidership: row.comparisonPostAverageMonthlyRidership,
      comparisonRidershipDelta: row.comparisonRidershipDelta,
      adjustedRidershipDelta: row.adjustedRidershipDelta,
      caveat: row.caveat,
    });
  }

  for (const row of input.routeArtifacts) {
    validateSeedRow(RouteArtifactInsertSchema, "route_artifact", row);
  }

  for (const row of input.corridors) {
    validateSeedRow(CorridorInsertSchema, "corridor", row);
  }

  for (const row of input.corridorArtifacts) {
    validateSeedRow(CorridorArtifactInsertSchema, "corridor_artifact", row);
  }

  for (const row of input.corridorRouteMembers) {
    validateSeedRow(CorridorRouteMemberInsertSchema, "corridor_route_member", row);
  }

  for (const row of input.corridorMonthSummaries) {
    validateSeedRow(CorridorMonthSummaryInsertSchema, "corridor_month_summary", row);
  }

  for (const row of input.corridorInterventionContexts) {
    validateSeedRow(CorridorInterventionContextInsertSchema, "corridor_intervention_context", row);
  }

  for (const row of input.corridorHotspots) {
    validateSeedRow(CorridorHotspotInsertSchema, "corridor_hotspot", row);
  }

  for (const row of input.routeMonthSourceStatuses) {
    validateRouteMonthSourceStatusSeedRow(row);
  }

  for (const row of input.routeMonthTrends) {
    validateSeedRow(RouteMonthTrendInsertSchema, "route_month_trend", row);
  }

  for (const row of input.routeTimelineIndex) {
    validateSeedRow(RouteTimelineIndexInsertSchema, "route_timeline_index", {
      routeId: row.routeId,
      month: row.month,
      supportLevel: row.supportLevel,
      qualityFlagsJson: JSON.stringify(row.qualityFlags),
      defaultEventCount: row.defaultEventCount,
      secondaryEventCount: row.secondaryEventCount,
      reviewOnlyEventCount: row.reviewOnlyEventCount,
      eventCount: row.eventCount,
      sourceBackedEventCount: row.sourceBackedEventCount,
      dateAssertionBackedEventCount: row.dateAssertionBackedEventCount,
      unresolvedDateEventCount: row.unresolvedDateEventCount,
      lowConfidenceEventCount: row.lowConfidenceEventCount,
      unaccountedCandidateCount: row.unaccountedCandidateCount,
      validationErrorCount: row.validationErrorCount,
      validationWarningCount: row.validationWarningCount,
      totalTokens: row.totalTokens,
      defaultEventsJson: JSON.stringify(row.defaultEvents),
      bundleArtifactKey: row.bundleArtifactKey,
      bundleArtifactSha256: row.bundleArtifactSha256,
      bundleArtifactByteLength: row.bundleArtifactByteLength,
      sourceBundlePath: row.sourceBundlePath,
      generatedAt: row.generatedAt,
    });
  }

  for (const row of input.routeSpeedHistoryCoverage) {
    validateSeedRow(RouteSpeedHistoryCoverageInsertSchema, "route_speed_history_coverage", row);
  }

  for (const row of input.sourceMonthCoverage) {
    validateSeedRow(SourceMonthCoverageInsertSchema, "source_month_coverage", row);
  }

  for (const row of input.routeEquityContext) {
    validateSeedRow(RouteEquityContextInsertSchema, "route_equity_context", row);
  }

  for (const row of input.routeScorecards) {
    validateSeedRow(RouteScorecardInsertSchema, "route_scorecard", {
      routeId: row.routeId,
      month: row.month,
      routeScore: row.routeScore,
      coverageStatus: row.coverageStatus,
      averageSpeedMph: row.averageSpeedMph,
      hotspotCount: row.hotspotCount,
    });
  }

  for (const row of input.routeBriefSummaries) {
    validateSeedRow(RouteBriefSummaryInsertSchema, "route_brief_summary", {
      routeId: row.routeId,
      month: row.month,
      routeScore: row.routeScore,
      publicVisible: row.publicVisible,
      publicVisibilityReason: row.publicVisibilityReason,
      averageSpeedMph: row.averageSpeedMph,
      hotspotCount: row.hotspotCount,
      totalRidership: row.totalRidership,
      totalTransfers: row.totalTransfers,
      aceActive: row.aceActive,
      aceViolationCount: row.aceViolationCount,
      busLaneMatchedLaneCount: row.busLaneMatchedLaneCount,
      scheduleMatchRate: row.scheduleMatchRate,
    });
  }

  for (const row of input.routeBriefPeakWindows) {
    validateSeedRow(RouteBriefPeakWindowInsertSchema, "route_brief_peak_window", row);
  }

  for (const row of input.routeBriefSlowestWindows) {
    validateSeedRow(RouteBriefSlowestWindowInsertSchema, "route_brief_slowest_window", row);
  }

  for (const row of input.routeComparisonRanks) {
    validateSeedRow(RouteComparisonRankInsertSchema, "route_comparison_rank", row);
  }

  if (input.routeBatchStatus !== null) {
    validateSeedRow(RouteBatchStatusInsertSchema, "route_batch_status", input.routeBatchStatus);
  }

  for (const row of input.routeBatchBuiltRoutes) {
    validateSeedRow(RouteBatchBuiltRouteInsertSchema, "route_batch_built_route", row);
  }

  for (const row of input.routeBatchIssues) {
    validateSeedRow(RouteBatchIssueInsertSchema, "route_batch_issue", row);
  }
}

function validateObservedReliabilitySeedRow(row: LocalRouteObservedReliabilitySummary): void {
  validateSeedRow(RouteObservedReliabilitySummaryInsertSchema, "route_observed_reliability_summary", {
    routeId: row.routeId,
    month: row.month,
    runId: row.runId,
    reliabilityStatus: row.reliabilityStatus,
    minSampleThreshold: row.minSampleThreshold,
    sampleCount: row.sampleCount,
    stopCount: row.stopCount,
    directionCount: row.directionCount,
    averageObservedHeadwayMinutes: row.averageObservedHeadwayMinutes,
    medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
    p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
    maxObservedHeadwayMinutes: row.maxObservedHeadwayMinutes,
    scheduledMedianHeadwayMinutes: row.scheduledMedianHeadwayMinutes,
    bunchingThresholdMinutes: row.bunchingThresholdMinutes,
    longGapThresholdMinutes: row.longGapThresholdMinutes,
    observedBunchingShare: row.observedBunchingShare,
    observedLongGapShare: row.observedLongGapShare,
    expectedWaitMinutes: row.expectedWaitMinutes,
    scheduledExpectedWaitMinutes: row.scheduledExpectedWaitMinutes,
    excessWaitMinutes: row.excessWaitMinutes,
    waitReliabilityRatio: row.waitReliabilityRatio,
  });
}

function validateRouteMonthSourceStatusSeedRow(row: LocalRouteMonthSourceStatus): void {
  validateSeedRow(RouteMonthSourceStatusInsertSchema, "route_month_source_status", {
    routeId: row.routeId,
    month: row.month,
    sourceScope: row.sourceScope,
    sourceId: row.sourceId,
    status: row.status,
    rowCount: row.rowCount,
    snapshotId: row.snapshotId,
    note: row.note,
  });
}

export function buildD1SeedSql(input: D1SeedInput): D1SeedSqlResult {
  validateD1SeedRows(input);

  const { month } = input;
  const statements: string[] = [
    renderQuery(seedDb.delete(routeCatalogType)),
    renderQuery(seedDb.delete(routeDirection)),
    renderQuery(seedDb.delete(routeCatalog)),
    renderQuery(seedDb.delete(routeMonthCoverage).where(eq(routeMonthCoverage.month, month))),
    renderQuery(
      seedDb.delete(routeReadinessMissingInput).where(eq(routeReadinessMissingInput.month, month)),
    ),
    renderQuery(seedDb.delete(routeReadiness).where(eq(routeReadiness.month, month))),
    renderQuery(seedDb.delete(routeBuildPlan).where(eq(routeBuildPlan.month, month))),
    renderQuery(
      seedDb.delete(routeReliabilityGapWindow).where(eq(routeReliabilityGapWindow.month, month)),
    ),
    renderQuery(
      seedDb
        .delete(routeObservedReliabilitySummary)
        .where(eq(routeObservedReliabilitySummary.month, month)),
    ),
    renderQuery(seedDb.delete(interventionEvent)),
    renderQuery(
      seedDb
        .delete(routeInterventionComparison)
        .where(eq(routeInterventionComparison.month, month)),
    ),
    renderQuery(seedDb.delete(routeArtifact).where(eq(routeArtifact.month, month))),
    renderQuery(seedDb.delete(corridorHotspot).where(eq(corridorHotspot.month, month))),
    renderQuery(
      seedDb
        .delete(corridorInterventionContext)
        .where(eq(corridorInterventionContext.month, month)),
    ),
    renderQuery(seedDb.delete(corridorArtifact).where(eq(corridorArtifact.month, month))),
    renderQuery(seedDb.delete(corridorMonthSummary).where(eq(corridorMonthSummary.month, month))),
    renderQuery(seedDb.delete(corridorRouteMember).where(eq(corridorRouteMember.month, month))),
    renderQuery(seedDb.delete(corridor)),
    renderQuery(
      seedDb.delete(routeMonthSourceStatus).where(eq(routeMonthSourceStatus.month, month)),
    ),
    renderQuery(
      seedDb.delete(routeReliabilityBaseline).where(eq(routeReliabilityBaseline.month, month)),
    ),
    renderQuery(seedDb.delete(routeMonthTrend)),
    renderQuery(seedDb.delete(routeTimelineIndex).where(eq(routeTimelineIndex.month, month))),
    renderQuery(
      seedDb.delete(routeSpeedHistoryCoverage).where(eq(routeSpeedHistoryCoverage.month, month)),
    ),
    renderQuery(seedDb.delete(sourceMonthCoverage)),
    renderQuery(seedDb.delete(routeEquityContext).where(eq(routeEquityContext.month, month))),
    renderQuery(
      seedDb.delete(routeScorecardCitation).where(eq(routeScorecardCitation.month, month)),
    ),
    renderQuery(seedDb.delete(routeScorecard).where(eq(routeScorecard.month, month))),
    renderQuery(seedDb.delete(routeBriefPeakWindow).where(eq(routeBriefPeakWindow.month, month))),
    renderQuery(
      seedDb.delete(routeBriefSlowestWindow).where(eq(routeBriefSlowestWindow.month, month)),
    ),
    renderQuery(seedDb.delete(routeBriefSummary).where(eq(routeBriefSummary.month, month))),
    renderQuery(seedDb.delete(routeComparisonRank).where(eq(routeComparisonRank.month, month))),
    renderQuery(seedDb.delete(routeBatchBuiltRoute).where(eq(routeBatchBuiltRoute.month, month))),
    renderQuery(seedDb.delete(routeBatchIssue).where(eq(routeBatchIssue.month, month))),
    renderQuery(seedDb.delete(routeBatchStatus).where(eq(routeBatchStatus.month, month))),
  ];
  let routeCatalogTypeRowCount = 0;
  let routeDirectionRowCount = 0;
  let routeReadinessMissingInputRowCount = 0;
  let routeReliabilityGapWindowRowCount = 0;
  let routeMonthSourceStatusRowCount = 0;
  let routeBriefPeakWindowRowCount = 0;
  let routeBriefSlowestWindowRowCount = 0;
  let routeBatchBuiltRouteRowCount = 0;
  let routeBatchIssueRowCount = 0;
  const routeScorecardCitationRowCount = 0;

  for (const route of input.routeCatalog) {
    statements.push(
      renderQuery(
        seedDb.insert(routeCatalog).values({
          routeId: route.routeId,
          routeShortName: route.routeShortName,
          routeLongName: route.routeLongName,
          shapeCount: route.shapeCount,
          stopCount: route.stopCount,
          timepointStopCount: route.timepointStopCount,
          latitudeMin: route.latitudeMin,
          latitudeMax: route.latitudeMax,
          longitudeMin: route.longitudeMin,
          longitudeMax: route.longitudeMax,
        }),
      ),
    );

    route.routeTypes.forEach((type, index) => {
      routeCatalogTypeRowCount += 1;
      statements.push(
        renderQuery(
          seedDb.insert(routeCatalogType).values({
            routeId: route.routeId,
            typeRank: index + 1,
            routeType: type,
          }),
        ),
      );
    });

    route.directions.forEach((direction, index) => {
      routeDirectionRowCount += 1;
      statements.push(
        renderQuery(
          seedDb.insert(routeDirection).values({
            routeId: route.routeId,
            directionId: index,
            directionName: direction,
          }),
        ),
      );
    });
  }

  for (const coverage of input.routeCoverage) {
    statements.push(
      renderQuery(
        seedDb.insert(routeMonthCoverage).values({
          routeId: coverage.routeId,
          month,
          speedObservationCount: coverage.speedObservationCount,
          speedBusTripCount: coverage.speedBusTripCount,
          averageSpeedMph: coverage.averageSpeedMph,
          scheduleTimepointCount: coverage.scheduleTimepointCount,
          hasSpeedData: coverage.hasSpeedData,
          hasScheduleData: coverage.hasScheduleData,
        }),
      ),
    );
  }

  for (const row of input.routeReadiness) {
    statements.push(
      renderQuery(
        seedDb.insert(routeReadiness).values({
          routeId: row.routeId,
          month,
          routeShortName: row.routeShortName,
          routeLongName: row.routeLongName,
          readinessStatus: row.readinessStatus,
          buildEligible: row.buildEligible,
          readinessScore: row.readinessScore,
          speedObservationCount: row.speedObservationCount,
          speedBusTripCount: row.speedBusTripCount,
          averageSpeedMph: row.averageSpeedMph,
          scheduleTimepointCount: row.scheduleTimepointCount,
          shapeCount: row.shapeCount,
          stopCount: row.stopCount,
          timepointStopCount: row.timepointStopCount,
        }),
      ),
    );

    row.missingInputs.forEach((inputName, index) => {
      routeReadinessMissingInputRowCount += 1;
      statements.push(
        renderQuery(
          seedDb.insert(routeReadinessMissingInput).values({
            routeId: row.routeId,
            month,
            inputRank: index + 1,
            inputName,
            severity: "blocking",
            note: null,
          }),
        ),
      );
    });
  }

  for (const row of input.routeBuildPlan) {
    statements.push(
      renderQuery(
        seedDb.insert(routeBuildPlan).values({
          routeId: row.routeId,
          month,
          routeShortName: row.routeShortName,
          routeLongName: row.routeLongName,
          candidateRank: row.candidateRank,
          planStatus: row.planStatus,
          selectedForNextBatch: row.selectedForNextBatch,
          alreadyBuilt: row.alreadyBuilt,
          buildEligible: row.buildEligible,
          priorityScore: row.priorityScore,
          readinessStatus: row.readinessStatus,
          readinessScore: row.readinessScore,
          speedObservationCount: row.speedObservationCount,
          speedBusTripCount: row.speedBusTripCount,
          averageSpeedMph: row.averageSpeedMph,
          scheduleTimepointCount: row.scheduleTimepointCount,
        }),
      ),
    );
  }

  for (const row of input.routeReliabilityBaseline) {
    statements.push(
      renderQuery(
        seedDb.insert(routeReliabilityBaseline).values({
          routeId: row.routeId,
          month: row.month,
          reliabilityStatus: row.reliabilityStatus,
          scheduledTimepointCount: row.scheduledTimepointCount,
          stopHeadwayGroupCount: row.stopHeadwayGroupCount,
          headwaySampleCount: row.headwaySampleCount,
          medianScheduledHeadwayMinutes: row.medianScheduledHeadwayMinutes,
          p90ScheduledHeadwayMinutes: row.p90ScheduledHeadwayMinutes,
          maxScheduledHeadwayMinutes: row.maxScheduledHeadwayMinutes,
          scheduledShortHeadwayShare: row.scheduledShortHeadwayShare,
          scheduledLongGapShare: row.scheduledLongGapShare,
        }),
      ),
    );
  }

  for (const window of input.routeReliabilityGapWindows) {
    routeReliabilityGapWindowRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeReliabilityGapWindow).values({
          routeId: window.routeId,
          month: window.month,
          windowRank: window.windowRank,
          dayType: window.dayType,
          directionId: window.directionId,
          stopId: window.stopId,
          stopName: window.stopName,
          sampleCount: window.sampleCount,
          medianHeadwayMinutes: window.medianHeadwayMinutes,
          p90HeadwayMinutes: window.p90HeadwayMinutes,
          maxHeadwayMinutes: window.maxHeadwayMinutes,
        }),
      ),
    );
  }

  for (const row of input.routeObservedReliabilitySummaries) {
    statements.push(
      renderQuery(
        seedDb.insert(routeObservedReliabilitySummary).values({
          routeId: row.routeId,
          month: row.month,
          runId: row.runId,
          reliabilityStatus: row.reliabilityStatus,
          minSampleThreshold: row.minSampleThreshold,
          sampleCount: row.sampleCount,
          stopCount: row.stopCount,
          directionCount: row.directionCount,
          averageObservedHeadwayMinutes: row.averageObservedHeadwayMinutes,
          medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
          p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
          maxObservedHeadwayMinutes: row.maxObservedHeadwayMinutes,
          scheduledMedianHeadwayMinutes: row.scheduledMedianHeadwayMinutes,
          bunchingThresholdMinutes: row.bunchingThresholdMinutes,
          longGapThresholdMinutes: row.longGapThresholdMinutes,
          observedBunchingShare: row.observedBunchingShare,
          observedLongGapShare: row.observedLongGapShare,
          expectedWaitMinutes: row.expectedWaitMinutes,
          scheduledExpectedWaitMinutes: row.scheduledExpectedWaitMinutes,
          excessWaitMinutes: row.excessWaitMinutes,
          waitReliabilityRatio: row.waitReliabilityRatio,
        }),
      ),
    );
  }

  for (const row of input.interventionEvents) {
    statements.push(
      renderQuery(
        seedDb.insert(interventionEvent).values({
          eventId: row.eventId,
          routeId: row.routeId,
          interventionType: row.interventionType,
          sourceId: row.sourceId,
          program: row.program,
          implementationDate: row.implementationDate,
          implementationMonth: row.implementationMonth,
          eventStatus: row.eventStatus,
          description: row.description,
        }),
      ),
    );
  }

  for (const row of input.routeInterventionComparisons) {
    statements.push(
      renderQuery(
        seedDb.insert(routeInterventionComparison).values({
          routeId: row.routeId,
          month: row.month,
          eventId: row.eventId,
          interventionType: row.interventionType,
          sourceId: row.sourceId,
          evaluationLevel: row.evaluationLevel,
          comparisonStatus: row.comparisonStatus,
          preStartMonth: row.preStartMonth,
          preEndMonth: row.preEndMonth,
          postStartMonth: row.postStartMonth,
          postEndMonth: row.postEndMonth,
          requestedPreMonthCount: row.requestedPreMonthCount,
          requestedPostMonthCount: row.requestedPostMonthCount,
          preSampleMonthCount: row.preSampleMonthCount,
          postSampleMonthCount: row.postSampleMonthCount,
          preSpeedObservationCount: row.preSpeedObservationCount,
          postSpeedObservationCount: row.postSpeedObservationCount,
          preAverageSpeedMph: row.preAverageSpeedMph,
          postAverageSpeedMph: row.postAverageSpeedMph,
          speedDeltaMph: row.speedDeltaMph,
          preAverageMonthlyRidership: row.preAverageMonthlyRidership,
          postAverageMonthlyRidership: row.postAverageMonthlyRidership,
          ridershipDelta: row.ridershipDelta,
          comparisonRouteCount: row.comparisonRouteCount,
          comparisonRouteIds: row.comparisonRouteIds,
          comparisonPreAverageSpeedMph: row.comparisonPreAverageSpeedMph,
          comparisonPostAverageSpeedMph: row.comparisonPostAverageSpeedMph,
          comparisonSpeedDeltaMph: row.comparisonSpeedDeltaMph,
          adjustedSpeedDeltaMph: row.adjustedSpeedDeltaMph,
          comparisonPreAverageMonthlyRidership: row.comparisonPreAverageMonthlyRidership,
          comparisonPostAverageMonthlyRidership: row.comparisonPostAverageMonthlyRidership,
          comparisonRidershipDelta: row.comparisonRidershipDelta,
          adjustedRidershipDelta: row.adjustedRidershipDelta,
          caveat: row.caveat,
        }),
      ),
    );
  }

  for (const row of input.routeArtifacts) {
    statements.push(
      renderQuery(
        seedDb.insert(routeArtifact).values({
          routeId: row.routeId,
          month: row.month,
          artifactName: row.artifactName,
          artifactKey: row.artifactKey,
          contentType: row.contentType,
          byteLength: row.byteLength,
          sha256: row.sha256,
        }),
      ),
    );
  }

  for (const row of input.corridors) {
    statements.push(
      renderQuery(
        seedDb.insert(corridor).values({
          corridorId: row.corridorId,
          corridorName: row.corridorName,
          corridorKey: row.corridorKey,
          derivationMethod: row.derivationMethod,
        }),
      ),
    );
  }

  for (const row of input.corridorArtifacts) {
    statements.push(
      renderQuery(
        seedDb.insert(corridorArtifact).values({
          corridorId: row.corridorId,
          month: row.month,
          artifactName: row.artifactName,
          artifactKey: row.artifactKey,
          contentType: row.contentType,
          byteLength: row.byteLength,
          sha256: row.sha256,
        }),
      ),
    );
  }

  for (const row of input.corridorRouteMembers) {
    statements.push(
      renderQuery(
        seedDb.insert(corridorRouteMember).values({
          corridorId: row.corridorId,
          month: row.month,
          routeId: row.routeId,
          assignmentStatus: row.assignmentStatus,
          assignmentReason: row.assignmentReason,
          stopCount: row.stopCount,
          matchedStopCount: row.matchedStopCount,
          hotspotCount: row.hotspotCount,
          matchedSegmentCount: row.matchedSegmentCount,
          segmentEvidenceScore: row.segmentEvidenceScore,
          totalRidership: row.totalRidership,
          averageSpeedMph: row.averageSpeedMph,
        }),
      ),
    );
  }

  for (const row of input.corridorMonthSummaries) {
    statements.push(
      renderQuery(
        seedDb.insert(corridorMonthSummary).values({
          corridorId: row.corridorId,
          month: row.month,
          routeCount: row.routeCount,
          assignedRouteCount: row.assignedRouteCount,
          ambiguousRouteCount: row.ambiguousRouteCount,
          unassignedRouteCount: row.unassignedRouteCount,
          totalRidership: row.totalRidership,
          totalTransfers: row.totalTransfers,
          weightedAverageSpeedMph: row.weightedAverageSpeedMph,
          hotspotCount: row.hotspotCount,
          observedReliabilityRouteCount: row.observedReliabilityRouteCount,
          insufficientReliabilityRouteCount: row.insufficientReliabilityRouteCount,
          interventionComparisonCount: row.interventionComparisonCount,
          evaluatedInterventionComparisonCount: row.evaluatedInterventionComparisonCount,
        }),
      ),
    );
  }

  for (const row of input.corridorInterventionContexts) {
    statements.push(
      renderQuery(
        seedDb.insert(corridorInterventionContext).values({
          corridorId: row.corridorId,
          month: row.month,
          contextRank: row.contextRank,
          routeId: row.routeId,
          eventId: row.eventId,
          interventionType: row.interventionType,
          sourceId: row.sourceId,
          program: row.program,
          implementationMonth: row.implementationMonth,
          eventStatus: row.eventStatus,
          evaluationLevel: row.evaluationLevel,
          comparisonStatus: row.comparisonStatus,
          speedDeltaMph: row.speedDeltaMph,
          adjustedSpeedDeltaMph: row.adjustedSpeedDeltaMph,
          ridershipDelta: row.ridershipDelta,
          adjustedRidershipDelta: row.adjustedRidershipDelta,
          comparisonRouteCount: row.comparisonRouteCount,
          caveat: row.caveat,
        }),
      ),
    );
  }

  for (const row of input.corridorHotspots) {
    statements.push(
      renderQuery(
        seedDb.insert(corridorHotspot).values({
          corridorId: row.corridorId,
          month: row.month,
          corridorHotspotRank: row.corridorHotspotRank,
          routeId: row.routeId,
          routeHotspotRank: row.routeHotspotRank,
          fromStopName: row.fromStopName,
          toStopName: row.toStopName,
          weightedAverageSpeedMph: row.weightedAverageSpeedMph,
          hotspotScore: row.hotspotScore,
          riderImpactScore: row.riderImpactScore,
        }),
      ),
    );
  }

  for (const row of input.routeMonthSourceStatuses) {
    routeMonthSourceStatusRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeMonthSourceStatus).values({
          routeId: row.routeId,
          month: row.month,
          sourceScope: row.sourceScope,
          sourceId: row.sourceId,
          status: row.status,
          rowCount: row.rowCount,
          snapshotId: row.snapshotId,
          note: row.note,
        }),
      ),
    );
  }

  for (const row of input.routeMonthTrends) {
    statements.push(
      renderQuery(
        seedDb.insert(routeMonthTrend).values({
          routeId: row.routeId,
          month: row.month,
          speedObservationCount: row.speedObservationCount,
          speedBusTripCount: row.speedBusTripCount,
          averageSpeedMph: row.averageSpeedMph,
          ridership: row.ridership,
          transfers: row.transfers,
          hasSpeedTrend: row.hasSpeedTrend,
          hasRidershipTrend: row.hasRidershipTrend,
        }),
      ),
    );
  }

  for (const row of input.routeTimelineIndex) {
    statements.push(
      renderQuery(
        seedDb.insert(routeTimelineIndex).values({
          routeId: row.routeId,
          month: row.month,
          supportLevel: row.supportLevel,
          qualityFlagsJson: JSON.stringify(row.qualityFlags),
          defaultEventCount: row.defaultEventCount,
          secondaryEventCount: row.secondaryEventCount,
          reviewOnlyEventCount: row.reviewOnlyEventCount,
          eventCount: row.eventCount,
          sourceBackedEventCount: row.sourceBackedEventCount,
          dateAssertionBackedEventCount: row.dateAssertionBackedEventCount,
          unresolvedDateEventCount: row.unresolvedDateEventCount,
          lowConfidenceEventCount: row.lowConfidenceEventCount,
          unaccountedCandidateCount: row.unaccountedCandidateCount,
          validationErrorCount: row.validationErrorCount,
          validationWarningCount: row.validationWarningCount,
          totalTokens: row.totalTokens,
          defaultEventsJson: JSON.stringify(row.defaultEvents),
          bundleArtifactKey: row.bundleArtifactKey,
          bundleArtifactSha256: row.bundleArtifactSha256,
          bundleArtifactByteLength: row.bundleArtifactByteLength,
          sourceBundlePath: row.sourceBundlePath,
          generatedAt: row.generatedAt,
        }),
      ),
    );
  }

  for (const row of input.routeSpeedHistoryCoverage) {
    statements.push(
      renderQuery(
        seedDb.insert(routeSpeedHistoryCoverage).values({
          routeId: row.routeId,
          month: row.month,
          routeSlug: row.routeSlug,
          historyStartMonth: row.historyStartMonth,
          historyEndMonth: row.historyEndMonth,
          artifactPath: row.artifactPath,
          artifactStatus: row.artifactStatus,
          monthCount: row.monthCount,
          segmentCount: row.segmentCount,
          cellCount: row.cellCount,
          availableCellCount: row.availableCellCount,
          missingCellCount: row.missingCellCount,
          generatedAt: row.generatedAt,
        }),
      ),
    );
  }

  for (const row of input.sourceMonthCoverage) {
    statements.push(
      renderQuery(
        seedDb.insert(sourceMonthCoverage).values({
          sourceId: row.sourceId,
          month: row.month,
          label: row.label,
          sourceKind: row.sourceKind,
          grain: row.grain,
          status: row.status,
          rowCount: row.rowCount,
          routeCount: row.routeCount,
          note: row.note,
          generatedAt: row.generatedAt,
          artifactPath: row.artifactPath,
        }),
      ),
    );
  }

  for (const row of input.routeEquityContext) {
    statements.push(
      renderQuery(
        seedDb.insert(routeEquityContext).values({
          routeId: row.routeId,
          month: row.month,
          acsYear: row.acsYear,
          assignmentGeography: row.assignmentGeography,
          assignedCountyFips: row.assignedCountyFips,
          assignedCountyName: row.assignedCountyName,
          assignmentMethod: row.assignmentMethod,
          tractCount: row.tractCount,
          totalPopulation: row.totalPopulation,
          occupiedHousingUnits: row.occupiedHousingUnits,
          noVehicleHouseholds: row.noVehicleHouseholds,
          noVehicleHouseholdShare: row.noVehicleHouseholdShare,
          medianHouseholdIncome: row.medianHouseholdIncome,
          povertyRate: row.povertyRate,
          publicTransitCommuterShare: row.publicTransitCommuterShare,
          hispanicShare: row.hispanicShare,
          nonHispanicWhiteShare: row.nonHispanicWhiteShare,
          nonHispanicBlackShare: row.nonHispanicBlackShare,
          nonHispanicAsianShare: row.nonHispanicAsianShare,
        }),
      ),
    );
  }

  for (const scorecard of input.routeScorecards) {
    statements.push(
      renderQuery(
        seedDb.insert(routeScorecard).values({
          routeId: scorecard.routeId,
          month: scorecard.month,
          routeScore: scorecard.routeScore,
          coverageStatus: scorecard.coverageStatus,
          averageSpeedMph: scorecard.averageSpeedMph,
          hotspotCount: scorecard.hotspotCount,
        }),
      ),
    );
  }

  for (const brief of input.routeBriefSummaries) {
    statements.push(
      renderQuery(
        seedDb.insert(routeBriefSummary).values({
          routeId: brief.routeId,
          month: brief.month,
          routeScore: brief.routeScore,
          publicVisible: brief.publicVisible,
          publicVisibilityReason: brief.publicVisibilityReason,
          averageSpeedMph: brief.averageSpeedMph,
          hotspotCount: brief.hotspotCount,
          totalRidership: brief.totalRidership,
          totalTransfers: brief.totalTransfers,
          aceActive: brief.aceActive,
          aceViolationCount: brief.aceViolationCount,
          busLaneMatchedLaneCount: brief.busLaneMatchedLaneCount,
          scheduleMatchRate: brief.scheduleMatchRate,
        }),
      ),
    );
  }

  for (const window of input.routeBriefPeakWindows) {
    routeBriefPeakWindowRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeBriefPeakWindow).values({
          routeId: window.routeId,
          month: window.month,
          windowRank: window.windowRank,
          dayOfWeek: window.dayOfWeek,
          hourOfDay: window.hourOfDay,
          ridership: window.ridership,
          transfers: window.transfers,
          matchedObservationCount: window.matchedObservationCount,
          busTripCount: window.busTripCount,
          weightedAverageSpeedMph: window.weightedAverageSpeedMph,
          slowObservationShare: window.slowObservationShare,
        }),
      ),
    );
  }

  for (const window of input.routeBriefSlowestWindows) {
    routeBriefSlowestWindowRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeBriefSlowestWindow).values({
          routeId: window.routeId,
          month: window.month,
          windowRank: window.windowRank,
          dayOfWeek: window.dayOfWeek,
          hourOfDay: window.hourOfDay,
          observationCount: window.observationCount,
          busTripCount: window.busTripCount,
          segmentCount: window.segmentCount,
          weightedAverageSpeedMph: window.weightedAverageSpeedMph,
          weightedAverageTravelTimeMinutes: window.weightedAverageTravelTimeMinutes,
          slowObservationShare: window.slowObservationShare,
        }),
      ),
    );
  }

  for (const route of input.routeComparisonRanks) {
    statements.push(
      renderQuery(
        seedDb.insert(routeComparisonRank).values({
          month: route.month,
          rank: route.rank,
          routeId: route.routeId,
          routeScore: route.routeScore,
          averageSpeedMph: route.averageSpeedMph,
          totalRidership: route.totalRidership,
          aceViolationCount: route.aceViolationCount,
          busLaneMatchedLaneCount: route.busLaneMatchedLaneCount,
        }),
      ),
    );
  }

  if (input.routeBatchStatus !== null) {
    statements.push(
      renderQuery(
        seedDb.insert(routeBatchStatus).values({
          month: input.routeBatchStatus.month,
          generatedAt: input.routeBatchStatus.generatedAt,
          status: input.routeBatchStatus.status,
          routeCount: input.routeBatchStatus.routeCount,
          artifactCount: input.routeBatchStatus.artifactCount,
          missingArtifactCount: input.routeBatchStatus.missingArtifactCount,
          hashMismatchCount: input.routeBatchStatus.hashMismatchCount,
          byteLengthMismatchCount: input.routeBatchStatus.byteLengthMismatchCount,
          totalByteLength: input.routeBatchStatus.totalByteLength,
          issueCount: input.routeBatchStatus.issueCount,
        }),
      ),
    );
  }

  for (const route of input.routeBatchBuiltRoutes) {
    routeBatchBuiltRouteRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeBatchBuiltRoute).values({
          month: route.month,
          routeRank: route.routeRank,
          routeId: route.routeId,
          artifactCount: route.artifactCount,
          status: route.status,
        }),
      ),
    );
  }

  for (const issue of input.routeBatchIssues) {
    routeBatchIssueRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeBatchIssue).values({
          month: issue.month,
          issueRank: issue.issueRank,
          routeId: issue.routeId,
          severity: issue.severity,
          issueCode: issue.issueCode,
          message: issue.message,
        }),
      ),
    );
  }

  return {
    seedSql: `${statements.join("\n")}\n`,
    routeCount: input.routeScorecards.length,
    comparisonRowCount: input.routeComparisonRanks.length,
    routeCatalogRowCount: input.routeCatalog.length,
    routeCatalogTypeRowCount,
    routeDirectionRowCount,
    routeCoverageRowCount: input.routeCoverage.length,
    routeReadinessRowCount: input.routeReadiness.length,
    routeReadinessMissingInputRowCount,
    routeBuildPlanRowCount: input.routeBuildPlan.length,
    routeReliabilityBaselineRowCount: input.routeReliabilityBaseline.length,
    routeReliabilityGapWindowRowCount,
    routeObservedReliabilitySummaryRowCount: input.routeObservedReliabilitySummaries.length,
    interventionEventRowCount: input.interventionEvents.length,
    routeInterventionComparisonRowCount: input.routeInterventionComparisons.length,
    routeArtifactRowCount: input.routeArtifacts.length,
    corridorRowCount: input.corridors.length,
    corridorArtifactRowCount: input.corridorArtifacts.length,
    corridorRouteMemberRowCount: input.corridorRouteMembers.length,
    corridorMonthSummaryRowCount: input.corridorMonthSummaries.length,
    corridorInterventionContextRowCount: input.corridorInterventionContexts.length,
    corridorHotspotRowCount: input.corridorHotspots.length,
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: input.routeMonthTrends.length,
    routeTimelineIndexRowCount: input.routeTimelineIndex.length,
    routeEquityContextRowCount: input.routeEquityContext.length,
    routeBatchStatusRowCount: input.routeBatchStatus === null ? 0 : 1,
    routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount,
    routeSpeedHistoryCoverageRowCount: input.routeSpeedHistoryCoverage.length,
    sourceMonthCoverageRowCount: input.sourceMonthCoverage.length,
  };
}

const observedReliabilitySourceIds = ["observedHeadways", "bunching", "waitTimeReliability"];

export type D1AppendixSeedInput = {
  month: string;
  routeObservedReliabilitySummaries: LocalRouteObservedReliabilitySummary[];
  routeMonthSourceStatuses: LocalRouteMonthSourceStatus[];
};

export type D1AppendixSeedSqlResult = {
  seedSql: string;
  month: string;
  routeObservedReliabilitySummaryRowCount: number;
  routeMonthSourceStatusRowCount: number;
};

export function buildD1AppendixSeedSql(input: D1AppendixSeedInput): D1AppendixSeedSqlResult {
  const { month } = input;
  const reliabilityStatuses = input.routeMonthSourceStatuses.filter(
    (row) =>
      row.sourceScope === "reliability" && observedReliabilitySourceIds.includes(row.sourceId),
  );
  for (const row of input.routeObservedReliabilitySummaries) {
    validateObservedReliabilitySeedRow(row);
  }
  for (const row of reliabilityStatuses) {
    validateRouteMonthSourceStatusSeedRow(row);
  }

  const statements: string[] = [
    renderQuery(
      seedDb
        .delete(routeObservedReliabilitySummary)
        .where(eq(routeObservedReliabilitySummary.month, month)),
    ),
    renderQuery(
      seedDb
        .delete(routeMonthSourceStatus)
        .where(
          and(
            eq(routeMonthSourceStatus.month, month),
            eq(routeMonthSourceStatus.sourceScope, "reliability"),
            inArray(routeMonthSourceStatus.sourceId, observedReliabilitySourceIds),
          ),
        ),
    ),
  ];

  for (const row of input.routeObservedReliabilitySummaries) {
    statements.push(
      renderQuery(
        seedDb.insert(routeObservedReliabilitySummary).values({
          routeId: row.routeId,
          month: row.month,
          runId: row.runId,
          reliabilityStatus: row.reliabilityStatus,
          minSampleThreshold: row.minSampleThreshold,
          sampleCount: row.sampleCount,
          stopCount: row.stopCount,
          directionCount: row.directionCount,
          averageObservedHeadwayMinutes: row.averageObservedHeadwayMinutes,
          medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
          p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
          maxObservedHeadwayMinutes: row.maxObservedHeadwayMinutes,
          scheduledMedianHeadwayMinutes: row.scheduledMedianHeadwayMinutes,
          bunchingThresholdMinutes: row.bunchingThresholdMinutes,
          longGapThresholdMinutes: row.longGapThresholdMinutes,
          observedBunchingShare: row.observedBunchingShare,
          observedLongGapShare: row.observedLongGapShare,
          expectedWaitMinutes: row.expectedWaitMinutes,
          scheduledExpectedWaitMinutes: row.scheduledExpectedWaitMinutes,
          excessWaitMinutes: row.excessWaitMinutes,
          waitReliabilityRatio: row.waitReliabilityRatio,
        }),
      ),
    );
  }

  for (const row of reliabilityStatuses) {
    statements.push(
      renderQuery(
        seedDb.insert(routeMonthSourceStatus).values({
          routeId: row.routeId,
          month: row.month,
          sourceScope: row.sourceScope,
          sourceId: row.sourceId,
          status: row.status,
          rowCount: row.rowCount,
          snapshotId: row.snapshotId,
          note: row.note,
        }),
      ),
    );
  }

  return {
    seedSql: `${statements.join("\n")}\n`,
    month,
    routeObservedReliabilitySummaryRowCount: input.routeObservedReliabilitySummaries.length,
    routeMonthSourceStatusRowCount: reliabilityStatuses.length,
  };
}
