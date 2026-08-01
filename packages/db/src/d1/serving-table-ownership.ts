export const D1_SERVING_TABLE_OWNER_VALUES = [
  "generated_candidate",
  "current_signal",
  "live_write",
  "static_reference",
  "legacy_retired",
  "mixed_legacy_requires_split",
] as const;

export type D1ServingTableOwner = (typeof D1_SERVING_TABLE_OWNER_VALUES)[number];

export type D1ServingTableOwnership = {
  owner: D1ServingTableOwner;
  rationale: string;
};

const generated = (rationale: string): D1ServingTableOwnership => ({
  owner: "generated_candidate",
  rationale,
});

const live = (rationale: string): D1ServingTableOwnership => ({
  owner: "live_write",
  rationale,
});

const currentSignal = (rationale: string): D1ServingTableOwnership => ({
  owner: "current_signal",
  rationale,
});

/**
 * Exhaustive ownership for every table exported by the public D1 schema.
 *
 * This is a safety boundary, not documentation-only metadata. Architecture
 * tests compare it with the Drizzle schema and both seed writers. Any new
 * table must be classified before it can participate in publication.
 */
export const D1_SERVING_TABLE_OWNERSHIP = {
  route_artifact: generated("Reviewed route artifact projection."),
  map_release_catalog: generated("Reviewed map manifest registration."),
  route_scorecard: generated("Reviewed route scorecard projection."),
  route_scorecard_citation: generated("Reviewed scorecard citation projection."),
  route_catalog: generated("Reviewed exact route catalog projection."),
  route_catalog_type: generated("Reviewed exact route type projection."),
  route_catalog_trip_type: generated("Reviewed exact trip-type projection."),
  exact_route_identity_release: generated("Reviewed exact-route identity provenance."),
  route_direction: generated("Reviewed route direction projection."),
  route_month_coverage: generated("Reviewed source coverage projection."),
  route_readiness: generated("Reviewed route readiness projection."),
  route_readiness_missing_input: generated("Reviewed readiness issue projection."),
  route_build_plan: generated("Reviewed route build projection."),
  route_reliability_baseline: generated("Reviewed scheduled reliability projection."),
  route_reliability_gap_window: generated("Reviewed scheduled gap-window projection."),
  route_observed_reliability_summary: {
    owner: "mixed_legacy_requires_split",
    rationale:
      "The legacy full seed and independently refreshed appendix both write this table; Plan 098 separates the reviewed and current-signal layers.",
  },
  route_observed_reliability_current_signal: currentSignal(
    "Post-coverage observed reliability is refreshed independently of immutable releases.",
  ),
  intervention_event: generated("Reviewed intervention event projection."),
  route_intervention_comparison: generated("Reviewed intervention comparison projection."),
  corridor: generated("Reviewed corridor projection."),
  corridor_route_member: generated("Reviewed corridor membership projection."),
  corridor_month_summary: generated("Reviewed corridor summary projection."),
  corridor_intervention_context: generated("Reviewed corridor intervention projection."),
  corridor_hotspot: generated("Reviewed corridor hotspot projection."),
  corridor_artifact: generated("Reviewed corridor artifact projection."),
  route_month_source_status: {
    owner: "mixed_legacy_requires_split",
    rationale:
      "The legacy full seed and independently refreshed appendix both write this table; Plan 098 separates the reviewed and current-signal layers.",
  },
  route_month_source_status_current_signal: currentSignal(
    "Post-coverage source status is refreshed independently of immutable releases.",
  ),
  route_month_trend: generated("Reviewed route history projection."),
  route_timeline_index: generated("Reviewed route timeline projection."),
  route_speed_history_coverage: generated("Reviewed route-speed artifact coverage projection."),
  source_month_coverage: generated("Reviewed source coverage ledger projection."),
  route_equity_context: generated("Reviewed route equity projection."),
  route_brief_summary: generated("Reviewed public route summary projection."),
  route_brief_peak_window: generated("Reviewed route peak-window projection."),
  route_brief_slowest_window: generated("Reviewed route slow-window projection."),
  route_comparison_rank: generated("Reviewed route comparison projection."),
  route_batch_status: generated("Reviewed build result; never an activation pointer."),
  route_batch_built_route: generated("Reviewed build membership projection."),
  route_batch_issue: generated("Reviewed build issue projection."),
  studio_actor: live(
    "Legacy actor rows remain mutable until their completed identity migration cleanup.",
  ),
  studio_actor_token: live("Legacy actor credentials remain mutable and are never release-scoped."),
  identity: live("Mutable user identity state."),
  identity_session: live("Mutable authentication/session state."),
  studio_actor_role: live("Mutable authorization state."),
  studio_brief_draft: live("Mutable Tier-2 editorial draft workspace state."),
  studio_brief_draft_block: live("Mutable Tier-2 draft block state."),
  studio_brief_draft_claim: live("Mutable Tier-2 draft claim state."),
  studio_brief_draft_ref: live("Mutable Tier-2 draft reference state."),
  studio_brief_history_event: live("Append-only Tier-2 editorial history state."),
  studio_brief_review_comment: live("Mutable Tier-2 review discussion state."),
  studio_brief_write_idempotency: live("Tier-2 write idempotency state."),
  studio_brief_agent_run: live("Mutable Tier-2 author-agent run state."),
  studio_brief_agent_proposal: live("Mutable Tier-2 author-agent proposal state."),
  studio_brief_draft_version: live("Mutable Tier-2 draft version state."),
  studio_brief_draft_version_snapshot: live("Tier-2 draft snapshot state."),
  tier2_intervention_event: live("Mutable Tier-2 intervention editorial staging state."),
  tier2_intervention_event_route: live("Mutable Tier-2 intervention route staging state."),
  tier2_intervention_event_source_span: live("Mutable Tier-2 evidence-span staging state."),
  alert: live("Mutable user alert state."),
  saved_search: live("Mutable user saved-search state."),
  public_comment: live("Mutable public comment state."),
} as const satisfies Record<string, D1ServingTableOwnership>;

export type D1ServingTableName = keyof typeof D1_SERVING_TABLE_OWNERSHIP;

export const D1_GENERATED_CANDIDATE_TABLES = Object.entries(D1_SERVING_TABLE_OWNERSHIP)
  .filter(([, ownership]) => ownership.owner === "generated_candidate")
  .map(([table]) => table as D1ServingTableName)
  .toSorted();

export const D1_MIXED_LEGACY_TABLES = Object.entries(D1_SERVING_TABLE_OWNERSHIP)
  .filter(([, ownership]) => ownership.owner === "mixed_legacy_requires_split")
  .map(([table]) => table as D1ServingTableName)
  .toSorted();
