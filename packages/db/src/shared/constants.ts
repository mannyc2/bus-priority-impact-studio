export const routeReadinessStatuses = [
  "ready",
  "partial",
  "missing_geometry",
  "missing_schedule",
  "missing_speed",
] as const;

export const routeBuildPlanStatuses = ["selected", "backlog", "already_built", "blocked"] as const;

export const routeBatchStatuses = ["pass", "fail"] as const;

export const routeReliabilityStatuses = ["scheduled_baseline_only"] as const;

export const sourceStatusScopes = ["reliability", "equity_context"] as const;
