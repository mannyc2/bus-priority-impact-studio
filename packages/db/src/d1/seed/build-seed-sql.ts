import { Database } from "bun:sqlite";
import { eq, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type {
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
  LocalRouteMonthCoverage,
  LocalRouteMonthSourceStatus,
  LocalRouteMonthTrend,
  LocalRouteReadiness,
  LocalRouteReliabilityBaseline,
  LocalRouteReliabilityGapWindow,
  LocalRouteScorecard,
} from "../../local/index.js";
import {
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
  routeMonthCoverage,
  routeMonthSourceStatus,
  routeMonthTrend,
  routeReadiness,
  routeReadinessMissingInput,
  routeReliabilityBaseline,
  routeReliabilityGapWindow,
  routeScorecard,
  routeScorecardCitation,
} from "../schema.js";

export type D1SeedInput = {
  month: string;
  routeCatalog: LocalRouteCatalogEntry[];
  routeCoverage: LocalRouteMonthCoverage[];
  routeReadiness: LocalRouteReadiness[];
  routeBuildPlan: LocalRouteBuildPlan[];
  routeReliabilityBaseline: LocalRouteReliabilityBaseline[];
  routeReliabilityGapWindows: LocalRouteReliabilityGapWindow[];
  routeMonthSourceStatuses: LocalRouteMonthSourceStatus[];
  routeMonthTrends: LocalRouteMonthTrend[];
  routeEquityContext: LocalRouteEquityContext[];
  routeArtifacts: LocalRouteArtifact[];
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
  artifactRowCount: number;
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
  routeMonthSourceStatusRowCount: number;
  routeMonthTrendRowCount: number;
  routeEquityContextRowCount: number;
  routeBatchStatusRowCount: number;
  routeBatchBuiltRouteRowCount: number;
  routeBatchIssueRowCount: number;
  routeBriefPeakWindowRowCount: number;
  routeBriefSlowestWindowRowCount: number;
  routeScorecardCitationRowCount: number;
};

const seedDb = drizzle(new Database(":memory:"));
const sqliteDialect = new SQLiteSyncDialect();

function renderQuery(query: SQLWrapper): string {
  return `${sqliteDialect.sqlToQuery(query.getSQL().inlineParams()).sql};`;
}

export function buildD1SeedSql(input: D1SeedInput): D1SeedSqlResult {
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
      seedDb.delete(routeMonthSourceStatus).where(eq(routeMonthSourceStatus.month, month)),
    ),
    renderQuery(
      seedDb.delete(routeReliabilityBaseline).where(eq(routeReliabilityBaseline.month, month)),
    ),
    renderQuery(seedDb.delete(routeMonthTrend)),
    renderQuery(seedDb.delete(routeEquityContext).where(eq(routeEquityContext.month, month))),
    renderQuery(
      seedDb.delete(routeScorecardCitation).where(eq(routeScorecardCitation.month, month)),
    ),
    renderQuery(seedDb.delete(routeScorecard).where(eq(routeScorecard.month, month))),
    renderQuery(seedDb.delete(routeArtifact).where(eq(routeArtifact.month, month))),
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
  let artifactRowCount = 0;
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

  for (const artifact of input.routeArtifacts) {
    artifactRowCount += 1;
    statements.push(
      renderQuery(
        seedDb.insert(routeArtifact).values({
          routeId: artifact.routeId,
          month: artifact.month,
          artifactName: artifact.artifactName,
          artifactKey: artifact.artifactKey,
          contentType: artifact.contentType,
          byteLength: artifact.byteLength,
          sha256: artifact.sha256,
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
    routeCount: input.routeBatchStatus?.routeCount ?? input.routeBriefSummaries.length,
    artifactRowCount,
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
    routeMonthSourceStatusRowCount,
    routeMonthTrendRowCount: input.routeMonthTrends.length,
    routeEquityContextRowCount: input.routeEquityContext.length,
    routeBatchStatusRowCount: input.routeBatchStatus === null ? 0 : 1,
    routeBatchBuiltRouteRowCount,
    routeBatchIssueRowCount,
    routeBriefPeakWindowRowCount,
    routeBriefSlowestWindowRowCount,
    routeScorecardCitationRowCount,
  };
}
