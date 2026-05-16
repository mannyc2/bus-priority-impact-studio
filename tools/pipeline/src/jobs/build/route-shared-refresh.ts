import { ingestAceRoutes } from "../ingest/ingest-ace-routes.js";
import { ingestAceViolationSummary } from "../ingest/ingest-ace-violations.js";
import { ingestBusLanes } from "../ingest/ingest-bus-lanes.js";

export type RouteSharedRefreshArgs = {
  year: number;
  month: number;
  refreshSharedSources: boolean;
};

export type RouteSharedRefreshDeps = {
  ingestAceRoutes: typeof ingestAceRoutes;
  ingestAceViolationSummary: typeof ingestAceViolationSummary;
  ingestBusLanes: typeof ingestBusLanes;
};

export const defaultRouteSharedRefreshDeps: RouteSharedRefreshDeps = {
  ingestAceRoutes,
  ingestAceViolationSummary,
  ingestBusLanes,
};

export async function refreshRouteSharedSources(
  args: RouteSharedRefreshArgs,
  deps: RouteSharedRefreshDeps = defaultRouteSharedRefreshDeps,
): Promise<void> {
  if (!args.refreshSharedSources) {
    return;
  }

  await Promise.all([
    deps.ingestAceRoutes(),
    deps.ingestAceViolationSummary({ year: args.year, month: args.month }),
    deps.ingestBusLanes(),
  ]);
}
