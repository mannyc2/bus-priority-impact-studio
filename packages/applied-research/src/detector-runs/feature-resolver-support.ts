import type { FeatureContractSatisfaction } from "@bp/analytics/core";

// Single source of truth for feature-grain satisfaction (S1.1 in backend-goal-finish-detectors.md).
//
// The kernel feature contract names the `resolverId` each grain expects; this module records which of
// those resolvers the applied-research detector-input layer actually implements, and at what support
// level. It replaces the former hand-rolled grain->prose switch in detector-study.ts, which
// duplicated grain knowledge the kernel already owns and could silently drift. Support is keyed by
// `resolverId` (the contract's declared resolver), and the feature-resolver-support test asserts this
// module covers every kernel feature contract — so a new grain cannot ship reporting "resolved"
// without a resolver registered here.
//
// Two grains are carried through feature-quality fields (coverage/freshness/sample) rather than a
// dedicated row resolver; everything else the kernel declares is supplied by an implemented resolver
// (an artifact resolver in detector-input-assembly.ts or a local-db loader the per-detector study
// branches call). A resolver id the layer does not implement is "unsupported".

export type FeatureResolverSupport = Pick<FeatureContractSatisfaction, "status" | "reason">;

const QUALITY_CARRIED_FEATURE_RESOLVER_IDS: ReadonlySet<string> = new Set([
  "embedded.feature_quality.v1", // feed_health
  "sqlite.source_coverage.v1", // source_coverage
]);

const IMPLEMENTED_FEATURE_RESOLVER_IDS: ReadonlySet<string> = new Set([
  // local-db loaders driven by the per-detector study branches
  "sqlite.local_route_segment_speed.segment_daypart.v1",
  "sqlite.local_route_segment_speed.route_segment_month.v1",
  "sqlite.local_route_observed_reliability_summary.v1",
  "sqlite.route_direction_daypart.v1",
  "sqlite.local_route_month_trend.history.v1",
  "sqlite.local_route_intervention_comparison.window.v1",
  "sqlite.local_context_event_route_touch.month.v1",
  "sqlite.local_bus_customer_journey_metric.v1",
  // artifact resolvers registered in detector-input-assembly.ts
  "artifact.signal_features.route_month.v1",
  "artifact.stop_direction_hour_ewt_features.v1",
  "artifact.rider_weighted_excess_wait.v1",
  "artifact.route_treatment_summary.route.v1",
  "artifact.route_treatment_summary.segment.v1",
  "artifact.route_treatment_summary.source_gap.v1",
  "artifact.intervention_panel.v1",
  "artifact.positive_deviance.v1",
]);

export function featureResolverSupport(resolverId: string): FeatureResolverSupport {
  if (QUALITY_CARRIED_FEATURE_RESOLVER_IDS.has(resolverId)) {
    return {
      status: "satisfied_by_feature_quality",
      reason:
        "Carried through feature-quality coverage/freshness/sample fields rather than a dedicated row resolver.",
    };
  }
  if (IMPLEMENTED_FEATURE_RESOLVER_IDS.has(resolverId)) {
    return {
      status: "resolved",
      reason:
        "Supplied by an applied-research detector-input resolver (artifact or local-db) for this feature grain.",
    };
  }
  return {
    status: "unsupported",
    reason: "No applied-research detector-input resolver supplies this feature grain.",
  };
}
