import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
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
} from "./schema.js";

export const RouteScorecardSelectSchema = createSelectSchema(routeScorecard);
export const RouteScorecardInsertSchema = createInsertSchema(routeScorecard);
export const RouteScorecardCitationSelectSchema = createSelectSchema(routeScorecardCitation);
export const RouteScorecardCitationInsertSchema = createInsertSchema(routeScorecardCitation);
export const RouteArtifactSelectSchema = createSelectSchema(routeArtifact);
export const RouteArtifactInsertSchema = createInsertSchema(routeArtifact);
export const RouteBriefSummarySelectSchema = createSelectSchema(routeBriefSummary);
export const RouteBriefSummaryInsertSchema = createInsertSchema(routeBriefSummary);
export const RouteBriefPeakWindowSelectSchema = createSelectSchema(routeBriefPeakWindow);
export const RouteBriefPeakWindowInsertSchema = createInsertSchema(routeBriefPeakWindow);
export const RouteBriefSlowestWindowSelectSchema = createSelectSchema(routeBriefSlowestWindow);
export const RouteBriefSlowestWindowInsertSchema = createInsertSchema(routeBriefSlowestWindow);
export const RouteCatalogSelectSchema = createSelectSchema(routeCatalog);
export const RouteCatalogInsertSchema = createInsertSchema(routeCatalog);
export const RouteCatalogTypeInsertSchema = createInsertSchema(routeCatalogType);
export const RouteDirectionInsertSchema = createInsertSchema(routeDirection);
export const RouteMonthCoverageInsertSchema = createInsertSchema(routeMonthCoverage);
export const RouteReadinessSelectSchema = createSelectSchema(routeReadiness);
export const RouteReadinessInsertSchema = createInsertSchema(routeReadiness);
export const RouteReadinessMissingInputInsertSchema = createInsertSchema(routeReadinessMissingInput);
export const RouteBuildPlanInsertSchema = createInsertSchema(routeBuildPlan);
export const RouteReliabilityBaselineSelectSchema = createSelectSchema(routeReliabilityBaseline);
export const RouteReliabilityBaselineInsertSchema = createInsertSchema(routeReliabilityBaseline);
export const RouteReliabilityGapWindowInsertSchema = createInsertSchema(routeReliabilityGapWindow);
export const RouteObservedReliabilitySummarySelectSchema = createSelectSchema(
  routeObservedReliabilitySummary,
);
export const RouteObservedReliabilitySummaryInsertSchema = createInsertSchema(
  routeObservedReliabilitySummary,
);
export const InterventionEventSelectSchema = createSelectSchema(interventionEvent);
export const InterventionEventInsertSchema = createInsertSchema(interventionEvent);
export const RouteInterventionComparisonSelectSchema = createSelectSchema(
  routeInterventionComparison,
);
export const RouteInterventionComparisonInsertSchema = createInsertSchema(
  routeInterventionComparison,
);
export const CorridorSelectSchema = createSelectSchema(corridor);
export const CorridorInsertSchema = createInsertSchema(corridor);
export const CorridorRouteMemberSelectSchema = createSelectSchema(corridorRouteMember);
export const CorridorRouteMemberInsertSchema = createInsertSchema(corridorRouteMember);
export const CorridorMonthSummarySelectSchema = createSelectSchema(corridorMonthSummary);
export const CorridorMonthSummaryInsertSchema = createInsertSchema(corridorMonthSummary);
export const CorridorInterventionContextSelectSchema = createSelectSchema(
  corridorInterventionContext,
);
export const CorridorInterventionContextInsertSchema = createInsertSchema(
  corridorInterventionContext,
);
export const CorridorHotspotSelectSchema = createSelectSchema(corridorHotspot);
export const CorridorHotspotInsertSchema = createInsertSchema(corridorHotspot);
export const CorridorArtifactSelectSchema = createSelectSchema(corridorArtifact);
export const CorridorArtifactInsertSchema = createInsertSchema(corridorArtifact);
export const RouteMonthSourceStatusInsertSchema = createInsertSchema(routeMonthSourceStatus);
export const RouteMonthTrendInsertSchema = createInsertSchema(routeMonthTrend);
export const RouteTimelineIndexInsertSchema = createInsertSchema(routeTimelineIndex);
export const RouteSpeedHistoryCoverageInsertSchema = createInsertSchema(routeSpeedHistoryCoverage);
export const SourceMonthCoverageInsertSchema = createInsertSchema(sourceMonthCoverage);
export const RouteEquityContextInsertSchema = createInsertSchema(routeEquityContext);
export const RouteComparisonRankInsertSchema = createInsertSchema(routeComparisonRank);
export const RouteBatchStatusSelectSchema = createSelectSchema(routeBatchStatus);
export const RouteBatchStatusInsertSchema = createInsertSchema(routeBatchStatus);
export const RouteBatchBuiltRouteInsertSchema = createInsertSchema(routeBatchBuiltRoute);
export const RouteBatchIssueInsertSchema = createInsertSchema(routeBatchIssue);
