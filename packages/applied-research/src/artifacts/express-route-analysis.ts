import { join } from "node:path";
import { EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD } from "../feature-history";

export function expressBusCapacityContextPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-bus-capacity",
    `route-hour-summary-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}

export function expressRouteAnalysisPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-route-analysis",
    `load-speed-context-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}

export function expressRouteAnalysisAuditPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-route-analysis",
    `audit-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}
