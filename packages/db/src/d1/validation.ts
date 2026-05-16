import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  corridor,
  corridorHotspot,
  corridorMonthSummary,
  corridorRouteMember,
  interventionEvent,
  routeBatchStatus,
  routeBriefPeakWindow,
  routeBriefSlowestWindow,
  routeBriefSummary,
  routeCatalog,
  routeInterventionComparison,
  routeObservedReliabilitySummary,
  routeReadiness,
  routeReliabilityBaseline,
  routeScorecard,
  routeScorecardCitation,
} from "./schema.js";

export const RouteScorecardSelectSchema = createSelectSchema(routeScorecard);
export const RouteScorecardInsertSchema = createInsertSchema(routeScorecard);
export const RouteScorecardCitationSelectSchema = createSelectSchema(routeScorecardCitation);
export const RouteBriefSummarySelectSchema = createSelectSchema(routeBriefSummary);
export const RouteBriefPeakWindowSelectSchema = createSelectSchema(routeBriefPeakWindow);
export const RouteBriefSlowestWindowSelectSchema = createSelectSchema(routeBriefSlowestWindow);
export const RouteCatalogSelectSchema = createSelectSchema(routeCatalog);
export const RouteReadinessSelectSchema = createSelectSchema(routeReadiness);
export const RouteReliabilityBaselineSelectSchema = createSelectSchema(routeReliabilityBaseline);
export const RouteObservedReliabilitySummarySelectSchema = createSelectSchema(
  routeObservedReliabilitySummary,
);
export const InterventionEventSelectSchema = createSelectSchema(interventionEvent);
export const RouteInterventionComparisonSelectSchema = createSelectSchema(
  routeInterventionComparison,
);
export const CorridorSelectSchema = createSelectSchema(corridor);
export const CorridorRouteMemberSelectSchema = createSelectSchema(corridorRouteMember);
export const CorridorMonthSummarySelectSchema = createSelectSchema(corridorMonthSummary);
export const CorridorHotspotSelectSchema = createSelectSchema(corridorHotspot);
export const RouteBatchStatusSelectSchema = createSelectSchema(routeBatchStatus);
