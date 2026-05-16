import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  routeBatchStatus,
  routeBriefPeakWindow,
  routeBriefSlowestWindow,
  routeBriefSummary,
  routeCatalog,
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
export const RouteBatchStatusSelectSchema = createSelectSchema(routeBatchStatus);
