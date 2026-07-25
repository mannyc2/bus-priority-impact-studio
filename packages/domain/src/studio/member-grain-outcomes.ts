import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));

export const Plan042IdentityVerdictSchema = Schema.Literals([
  "binding_absent_after_search",
  "confirmed_out_of_window",
  "occurrence_created",
  "refuted_no_traversal",
  "refuted_wrong_route_attribution",
  "superseded_duplicate",
]);

export const Plan042BusLaneIdentityVerdictRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("bus-lane-identity-verdict-v1"),
  verdict_id: NonEmptyString,
  candidate_id: NonEmptyString,
  gtfs_route_id: NonEmptyString,
  implementation_date: NonEmptyString,
  date_precision: NonEmptyString,
  verdict: Plan042IdentityVerdictSchema,
  occurrence_id: Schema.NullOr(NonEmptyString),
  dossier_receipts: Schema.Array(NonEmptyString),
  decision_id: Schema.NullOr(NonEmptyString),
  acquisition_receipt_ids: Schema.Array(NonEmptyString),
  canonical_candidate_id: Schema.NullOr(NonEmptyString),
  authorizes_study: Schema.Literal(false),
  authorizes_cross_product: Schema.Literal(false),
});
export type Plan042BusLaneIdentityVerdictRow = typeof Plan042BusLaneIdentityVerdictRowSchema.Type;

const Plan042EvidenceBindingSchema = Schema.Struct({
  role: NonEmptyString,
  record_id: NonEmptyString,
  source_id: NonEmptyString,
  evidence_id: NonEmptyString,
});

export const Plan042MemberGrainServiceScopeSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all_service") }),
  Schema.Struct({
    kind: Schema.Literal("periods"),
    periods: Schema.Array(NonEmptyString),
    directions: Schema.Array(NonEmptyString),
    pattern_ids: Schema.Array(NonEmptyString),
  }),
  Schema.Struct({
    kind: Schema.Literal("trip_subset"),
    periods: Schema.Array(NonEmptyString),
    directions: Schema.Array(NonEmptyString),
    pattern_ids: Schema.Array(NonEmptyString),
    description: NonEmptyString,
  }),
  Schema.Struct({ kind: Schema.Literal("not_applicable") }),
  Schema.Struct({
    kind: Schema.Literal("unresolved"),
    missing_roles: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
  }),
]);
export type Plan042MemberGrainServiceScope = typeof Plan042MemberGrainServiceScopeSchema.Type;

export const Plan042MemberGrainLineageSegmentSchema = Schema.Struct({
  predecessor_gtfs_route_id: NonEmptyString,
  successor_gtfs_route_id: NonEmptyString,
  direction: NonEmptyString,
  boundary_stop_ids: Schema.Tuple([NonEmptyString, NonEmptyString]),
  shared_stop_ids: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
});
export type Plan042MemberGrainLineageSegment = typeof Plan042MemberGrainLineageSegmentSchema.Type;

export const Plan042MemberGrainRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("operational-occurrence-member-grain-v1"),
  grain_id: NonEmptyString,
  extent_id: NonEmptyString,
  occurrence_id: NonEmptyString,
  route_record_id: NonEmptyString,
  gtfs_route_id: NonEmptyString,
  treatment_record_id: NonEmptyString,
  member_extent_decision_id: Schema.NullOr(NonEmptyString),
  service_scope: Schema.NullOr(Plan042MemberGrainServiceScopeSchema),
  lineage_segments: Schema.Array(Plan042MemberGrainLineageSegmentSchema),
  evidence_bindings: Schema.Array(Plan042EvidenceBindingSchema),
  decision_id: Schema.NullOr(NonEmptyString),
  terminal_disposition: Schema.Literals([
    "resolved",
    "not_applicable",
    "absent_in_source",
    "blocked_upstream",
  ]),
  receipt_ids: Schema.Array(NonEmptyString),
  authorizes_study: Schema.Literal(false),
  authorizes_cross_product: Schema.Literal(false),
});
export type Plan042MemberGrainRow = typeof Plan042MemberGrainRowSchema.Type;

export const Plan042IdentityVerdictProjectionSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.identity-verdict-import.v1"),
  schema_version: Schema.Literal(1),
  source: Schema.Struct({
    release_id: Schema.Literal("v1-rc28"),
    manifest_sha256: Sha256,
    handoff_sha256: Sha256,
    source_path: NonEmptyString,
    source_sha256: Sha256,
  }),
  row_count: NonNegativeInteger,
  candidate_ids_sha256: Sha256,
  verdict_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  rows: Schema.Array(Plan042BusLaneIdentityVerdictRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_cross_product: Schema.Literal(false),
  }),
});
export type Plan042IdentityVerdictProjection = typeof Plan042IdentityVerdictProjectionSchema.Type;

export const Plan042MemberGrainProjectionSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.member-grain-import.v1"),
  schema_version: Schema.Literal(1),
  source: Schema.Struct({
    release_id: Schema.Literal("v1-rc28"),
    manifest_sha256: Sha256,
    handoff_sha256: Sha256,
    source_path: NonEmptyString,
    source_sha256: Sha256,
    member_extent_projection_sha256: Sha256,
  }),
  row_count: NonNegativeInteger,
  member_keys_sha256: Sha256,
  occurrence_route_group_count: NonNegativeInteger,
  occurrence_route_groups_sha256: Sha256,
  terminal_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  rows: Schema.Array(Plan042MemberGrainRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_cross_product: Schema.Literal(false),
  }),
});
export type Plan042MemberGrainProjection = typeof Plan042MemberGrainProjectionSchema.Type;

export const Plan042ProducerImportArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.producer-import.v1"),
  schema_version: Schema.Literal(1),
  producer: Schema.Struct({
    release_id: Schema.Literal("v1-rc28"),
    final_checkpoint_commit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
    final_checkpoint_path: NonEmptyString,
    final_checkpoint_sha256: Sha256,
    manifest_sha256: Sha256,
    handoff_path: NonEmptyString,
    handoff_sha256: Sha256,
  }),
  source_occurrence_count: NonNegativeInteger,
  eligible_occurrence_count: NonNegativeInteger,
  route_projection_count: NonNegativeInteger,
  complete_occurrence_route_count: NonNegativeInteger,
  source_artifacts: Schema.Array(
    Schema.Struct({
      role: NonEmptyString,
      path: NonEmptyString,
      bytes: NonNegativeInteger,
      sha256: Sha256,
      row_count: NonNegativeInteger,
    }),
  ),
  evidence_policy: Schema.Struct({
    authoritative_historical_full_stop_inventory_required: Schema.Literal(true),
    exact_positive_required: Schema.Literal(true),
    occurrence_inference_prohibited: Schema.Literal(true),
    stop_id_equivalence_acquisition_required: Schema.Literal(true),
  }),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_cross_product: Schema.Literal(false),
  }),
});
export type Plan042ProducerImportArtifact = typeof Plan042ProducerImportArtifactSchema.Type;

export const Plan042CandidateIdentityVerdictSchema = Schema.Struct({
  verdict_id: NonEmptyString,
  verdict: Plan042IdentityVerdictSchema,
  decision_id: NonEmptyString,
  occurrence_id: Schema.NullOr(NonEmptyString),
  canonical_candidate_id: Schema.NullOr(NonEmptyString),
});

export const Plan042CandidateV5Schema = Schema.Struct({
  candidate_id: NonEmptyString,
  origin: Schema.Literals(["occurrence_route", "registry_only"]),
  occurrence_id: Schema.NullOr(NonEmptyString),
  route_record_id: Schema.NullOr(NonEmptyString),
  route_id: NonEmptyString,
  treatment_families: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
  implementation_date: NonEmptyString,
  date_precision: NonEmptyString,
  treatment_member_keys: Schema.Array(NonEmptyString),
  restored_from_member_denominator: Schema.Boolean,
  prior_candidate_id: Schema.NullOr(NonEmptyString),
  prior_recommendation: Schema.Literals([
    "recommend_approve",
    "recommend_reject",
    "not_previously_reviewed",
  ]),
  registry_source_ids: Schema.Array(NonEmptyString),
  identity_verdict: Schema.NullOr(Plan042CandidateIdentityVerdictSchema),
  review_eligibility: Schema.Literals([
    "excluded_terminal_identity",
    "carried_prior_state",
    "requires_member_grain_review",
  ]),
  authorizes_study: Schema.Literal(false),
});
export type Plan042CandidateV5 = typeof Plan042CandidateV5Schema.Type;

export const Plan042CandidateSetV5Schema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.studio.study_event_candidates.v5"),
  schema_version: Schema.Literal(5),
  candidate_set_id: Schema.String.check(Schema.isPattern(/^candidate-set-v5:[a-f0-9]{24}$/u)),
  approval_state: Schema.Literal("awaiting_outcome_grain_review"),
  producer: Schema.Struct({
    release_id: Schema.Literal("v1-rc28"),
    manifest_sha256: Sha256,
    handoff_sha256: Sha256,
  }),
  prior_review_cut_id: NonEmptyString,
  summary: Schema.Struct({
    candidate_count: NonNegativeInteger,
    occurrence_route_candidate_count: NonNegativeInteger,
    no_member_candidate_count: NonNegativeInteger,
    member_row_count: NonNegativeInteger,
    restored_occurrence_route_count: NonNegativeInteger,
    bus_lane_registry_total_count: NonNegativeInteger,
    unmatched_bus_lane_count: NonNegativeInteger,
    occurrence_backed_flatbush_count: NonNegativeInteger,
  }),
  denominator_hashes: Schema.Struct({
    member_keys_sha256: Sha256,
    no_member_keys_sha256: Sha256,
    complete_keys_sha256: Sha256,
    occurrence_route_groups_sha256: Sha256,
    restored_occurrence_route_groups_sha256: Sha256,
    identity_verdict_candidate_ids_sha256: Sha256,
  }),
  candidates: Schema.Array(Plan042CandidateV5Schema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_cross_product: Schema.Literal(false),
  }),
});
export type Plan042CandidateSetV5 = typeof Plan042CandidateSetV5Schema.Type;

export const Plan042ExtentBindingDispositionSchema = Schema.Literals([
  "bound_exact",
  "spine_not_ready",
  "endpoints_not_on_spine",
  "ambiguous_join",
  "partial_coverage_below_floor",
  "missing_endpoint_stop_id_equivalence",
]);

export const Plan042ExtentBindingRowSchema = Schema.Struct({
  candidate_id: NonEmptyString,
  occurrence_id: NonEmptyString,
  route_record_id: NonEmptyString,
  treatment_record_id: NonEmptyString,
  extent_id: NonEmptyString,
  route_id: NonEmptyString,
  treatment_family: NonEmptyString,
  spine_readiness: Schema.Literals([
    "series_ready",
    "series_ready_with_gaps",
    "needs_pattern_review",
    "failed",
  ]),
  spine_artifact: Schema.Struct({
    path: NonEmptyString,
    bytes: NonNegativeInteger,
    sha256: Sha256,
  }),
  searched_source_literals: Schema.Array(NonEmptyString),
  candidate_ordered_boundary_pairs: Schema.Array(Schema.Tuple([NonEmptyString, NonEmptyString])),
  matched_node_count: NonNegativeInteger,
  matched_raw_pair_count: NonNegativeInteger,
  ordered_orientation_match_count: NonNegativeInteger,
  disposition: Plan042ExtentBindingDispositionSchema,
  matched_segment_ids: Schema.Array(NonEmptyString),
  matched_spine_segment_ids: Schema.Array(NonEmptyString),
  coverage_share_of_extent: Schema.Number,
  coverage_floor: Schema.Number,
  unmatched_reason: Schema.NullOr(NonEmptyString),
  authorizes_study: Schema.Literal(false),
});
export type Plan042ExtentBindingRow = typeof Plan042ExtentBindingRowSchema.Type;

export const Plan042ExtentBindingArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.extent-segment-bindings.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  analysis_month: NonEmptyString,
  coverage_floor: Schema.Number,
  row_count: NonNegativeInteger,
  disposition_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  readiness_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  family_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  rows: Schema.Array(Plan042ExtentBindingRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_segment_match: Schema.Literal(false),
  }),
});
export type Plan042ExtentBindingArtifact = typeof Plan042ExtentBindingArtifactSchema.Type;

export const Plan042StopSetCoverageRowSchema = Schema.Struct({
  candidate_id: NonEmptyString,
  extent_id: NonEmptyString,
  route_id: NonEmptyString,
  treatment_record_id: NonEmptyString,
  source_literal_ids: Schema.Array(NonEmptyString),
  query_stop_ids: Schema.Array(NonEmptyString),
  comparison_window: Schema.Struct({
    start_month: NonEmptyString,
    end_month: NonEmptyString,
    analysis_month: NonEmptyString,
  }),
  observed_headway_row_count: NonNegativeInteger,
  ewt_artifact_match_count: NonNegativeInteger,
  typed_stop_id_lineage_present: Schema.Boolean,
  disposition: Schema.Literal("missing_pinned_stop_grain_coverage"),
  authorizes_study: Schema.Literal(false),
});
export type Plan042StopSetCoverageRow = typeof Plan042StopSetCoverageRowSchema.Type;

export const Plan042StopSetCoverageArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.stop-set-coverage.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  database: Schema.Struct({
    path: NonEmptyString,
    bytes: NonNegativeInteger,
    sha256: Sha256,
  }),
  observed_headway_table: Schema.Literal("local_observed_headway_sample"),
  observed_headway_total_row_count: NonNegativeInteger,
  ewt_product_id: Schema.Literal("stop_direction_hour_ewt_features"),
  ewt_feature_grain: Schema.Literal("stop_direction_hour"),
  ewt_resolver_id: Schema.Literal("artifact.stop_direction_hour_ewt_features.v1"),
  ewt_artifact_path_template: Schema.Literal(
    "analytics-stop-direction-hour-ewt/{releaseMonth}/{runId}/{routeId}/stop-direction-hour-ewt-features.json",
  ),
  row_count: NonNegativeInteger,
  rows: Schema.Array(Plan042StopSetCoverageRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_stop_grain: Schema.Literal(false),
  }),
});
export type Plan042StopSetCoverageArtifact = typeof Plan042StopSetCoverageArtifactSchema.Type;

export const Plan042ServicePatternCoverageArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.service-pattern-coverage.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  database: Schema.Struct({
    path: NonEmptyString,
    bytes: NonNegativeInteger,
    sha256: Sha256,
  }),
  bus_wait_table: Schema.Literal("local_bus_wait_assessment"),
  observed_headway_table: Schema.Literal("local_observed_headway_sample"),
  planned_service_table: Schema.Literal("local_route_planned_service_baseline"),
  planned_service_table_present: Schema.Literal(false),
  row_count: Schema.Literal(5),
  rows: Schema.Array(
    Schema.Struct({
      candidate_id: NonEmptyString,
      extent_id: NonEmptyString,
      route_id: NonEmptyString,
      bus_wait_row_count: NonNegativeInteger,
      observed_headway_row_count: NonNegativeInteger,
      planned_service_row_count: NonNegativeInteger,
      disposition: Schema.Literal("missing_pinned_service_pattern_product_coverage"),
      authorizes_study: Schema.Literal(false),
    }),
  ),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_service_pattern_grain: Schema.Literal(false),
  }),
});
export type Plan042ServicePatternCoverageArtifact =
  typeof Plan042ServicePatternCoverageArtifactSchema.Type;

const Plan042LineageBoundarySearchSchema = Schema.Struct({
  route_id: NonEmptyString,
  side: Schema.Literals(["predecessor", "successor"]),
  spine_readiness: Schema.Literals([
    "series_ready",
    "series_ready_with_gaps",
    "needs_pattern_review",
    "failed",
  ]),
  spine_artifact: Schema.Struct({
    path: NonEmptyString,
    bytes: NonNegativeInteger,
    sha256: Sha256,
  }),
  boundary_stop_ids: Schema.Tuple([NonEmptyString, NonEmptyString]),
  matched_node_count: NonNegativeInteger,
  matched_raw_pair_count: NonNegativeInteger,
  ordered_orientation_match_count: NonNegativeInteger,
  matched_segment_ids: Schema.Array(NonEmptyString),
  result: Schema.Literals([
    "ordered_unique",
    "spine_not_ready",
    "endpoint_missing",
    "orientation_absent",
    "orientation_ambiguous",
  ]),
});

export const Plan042LineageComparabilityRowSchema = Schema.Struct({
  candidate_id: NonEmptyString,
  grain_id: NonEmptyString,
  occurrence_id: NonEmptyString,
  route_record_id: NonEmptyString,
  treatment_record_id: NonEmptyString,
  route_id: NonEmptyString,
  segment_searches: Schema.Array(
    Schema.Struct({
      producer_direction_literal: NonEmptyString,
      predecessor: Plan042LineageBoundarySearchSchema,
      successor: Plan042LineageBoundarySearchSchema,
    }),
  ).check(Schema.isMinLength(1)),
  failing_sides: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
  disposition: Schema.Literals([
    "route_lineage_incomparable:spine_not_ready",
    "route_lineage_incomparable:missing_reviewed_endpoint_equivalence",
  ]),
  authorizes_study: Schema.Literal(false),
});
export type Plan042LineageComparabilityRow = typeof Plan042LineageComparabilityRowSchema.Type;

export const Plan042LineageComparabilityArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.lineage-comparability.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  row_count: NonNegativeInteger,
  disposition_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  rows: Schema.Array(Plan042LineageComparabilityRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_common_segment_frame: Schema.Literal(false),
  }),
});
export type Plan042LineageComparabilityArtifact =
  typeof Plan042LineageComparabilityArtifactSchema.Type;

export const Plan042OutcomeRelevanceEntrySchema = Schema.Struct({
  treatment_family: NonEmptyString,
  member_shapes: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
  disposition: Schema.Literals([
    "supported",
    "supported_when_bound",
    "blocked",
    "context_only",
    "lineage_comparability_gate",
  ]),
  product_ids: Schema.Array(
    Schema.Literals([
      "local_route_month_trends_history",
      "local_route_segment_speed_history",
      "local_observed_headway_samples_run",
      "stop_direction_hour_ewt_features",
      "planned_service_baseline_history",
      "local_bus_wait_assessment_history",
    ]),
  ),
  product_bindings: Schema.Array(
    Schema.Union([
      Schema.Struct({
        product_id: Schema.Literal("local_route_month_trends_history"),
        feature_grain: Schema.Literal("route_metric_history"),
        resolver_id: Schema.Literal("sqlite.local_route_month_trend.history.v1"),
      }),
      Schema.Struct({
        product_id: Schema.Literal("local_route_segment_speed_history"),
        feature_grain: Schema.Literal("route_segment_month"),
        resolver_id: Schema.Literal("sqlite.local_route_segment_speed.route_segment_month.v1"),
      }),
      Schema.Struct({
        product_id: Schema.Literal("stop_direction_hour_ewt_features"),
        feature_grain: Schema.Literal("stop_direction_hour"),
        resolver_id: Schema.Literal("artifact.stop_direction_hour_ewt_features.v1"),
      }),
      Schema.Struct({
        product_id: Schema.Literals([
          "local_observed_headway_samples_run",
          "planned_service_baseline_history",
          "local_bus_wait_assessment_history",
        ]),
        feature_grain: Schema.Null,
        resolver_id: Schema.Null,
      }),
    ]),
  ),
  source_dataset_ids: Schema.Array(Schema.Literals(["58t6-89vi", "kufs-yh3x", "v4z4-2h6n"])),
  grain: NonEmptyString,
  resolver: NonEmptyString,
  claim_ceiling: Schema.Literals(["descriptive_observation", "context_only", "none"]),
  unlock_evidence: Schema.Array(NonEmptyString),
});

export const Plan042OutcomeRelevanceRegistrySchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.outcome-relevance-registry.v1"),
  schema_version: Schema.Literal(1),
  upstream_registry_validation: Schema.Struct({
    registry_id: Schema.Literal("intervention-evidence-registry-v1"),
    canonical_treatment_kind_count: NonNegativeInteger,
    validation: Schema.Literal("passed"),
  }),
  stop_set_authorization: Schema.Struct({
    authorization_id: Schema.Literal("mta-wiki-owner-2026-07-22-all-closure-plans"),
    scope: Schema.Literal("internal_analyst_stop_set_admission"),
    recorded_decision: Schema.Literal(
      "versioned_analyst_grain_allowed_only_with_candidate_coverage_and_reviewed_stop_id_lineage",
    ),
    current_result: Schema.Literal("blocked_missing_pinned_stop_grain_coverage"),
  }),
  entries: Schema.Array(Plan042OutcomeRelevanceEntrySchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_public_serving: Schema.Literal(false),
  }),
});
export type Plan042OutcomeRelevanceRegistry = typeof Plan042OutcomeRelevanceRegistrySchema.Type;

export const Plan042GrainVerdictSchema = Schema.Literals([
  "grain_matched_primary",
  "grain_matched_analyst",
  "grain_context_only",
  "blocked:binding_absent_after_search",
  "blocked:member_grain_absent_in_source",
  "blocked:member_grain_blocked_upstream",
  "blocked:spine_not_ready",
  "blocked:missing_endpoint_stop_id_equivalence",
  "blocked:missing_pinned_stop_grain_coverage",
  "blocked:missing_pinned_service_pattern_product_coverage",
  "blocked:missing_pinned_outcome_product_coverage",
  "blocked:route_lineage_incomparable",
  "blocked:preserved_prior_rejection",
  "blocked:unresolved_extent",
]);

export const Plan042GrainVerdictRowSchema = Schema.Struct({
  candidate_id: NonEmptyString,
  member_extent_id: Schema.NullOr(NonEmptyString),
  occurrence_id: Schema.NullOr(NonEmptyString),
  route_record_id: Schema.NullOr(NonEmptyString),
  treatment_record_id: Schema.NullOr(NonEmptyString),
  route_id: NonEmptyString,
  treatment_family: NonEmptyString,
  verdict: Plan042GrainVerdictSchema,
  reason_id: Schema.NullOr(NonEmptyString),
  product_ids: Schema.Array(NonEmptyString),
  claim_ceiling: Schema.Literals(["descriptive_observation", "context_only", "none"]),
  prior_recommendation: Schema.Literals([
    "recommend_approve",
    "recommend_reject",
    "not_previously_reviewed",
  ]),
  lineage_verdict: Schema.NullOr(
    Schema.Literals([
      "route_lineage_incomparable:spine_not_ready",
      "route_lineage_incomparable:missing_reviewed_endpoint_equivalence",
    ]),
  ),
  authorizes_study: Schema.Literal(false),
});
export type Plan042GrainVerdictRow = typeof Plan042GrainVerdictRowSchema.Type;

export const Plan042GrainVerdictArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.grain-verdict-matrix.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  review_cut_id: Schema.String.check(Schema.isPattern(/^study-review-cut-v2:[a-f0-9]{24}$/u)),
  row_count: NonNegativeInteger,
  denominator: Schema.Struct({
    member_row_count: NonNegativeInteger,
    no_member_candidate_count: NonNegativeInteger,
    expected_row_count: NonNegativeInteger,
  }),
  verdict_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  family_by_verdict_histogram: Schema.Record(
    NonEmptyString,
    Schema.Record(NonEmptyString, NonNegativeInteger),
  ),
  prior_accepted_ace_row_count: NonNegativeInteger,
  rows: Schema.Array(Plan042GrainVerdictRowSchema),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
  }),
});
export type Plan042GrainVerdictArtifact = typeof Plan042GrainVerdictArtifactSchema.Type;

export const Plan042ReviewHandoffArtifactSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.review-handoff.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  review_cut_id: NonEmptyString,
  row_count: NonNegativeInteger,
  status: Schema.Literals(["pending_independent_review", "reviewed_authority_false"]),
  approval_applied: Schema.Literal(false),
  package_results: Schema.Array(
    Schema.Struct({
      package_id: NonEmptyString,
      candidate_or_member_count: NonNegativeInteger,
      item_ids: Schema.Array(NonEmptyString),
      item_ids_sha256: Sha256,
      risk_class: Schema.Literals(["routine", "risky"]),
      focused_result: Schema.Literal("passed"),
      replay_result: Schema.Literal("passed"),
      reviewer_result: Schema.Literals([
        "focused_tests_passed_pending_independent_review",
        "independent_review_passed",
        "dual_independent_review_passed",
      ]),
      review_receipts: Schema.Array(
        Schema.Struct({
          reviewer_id: NonEmptyString,
          artifact_path: NonEmptyString,
          artifact_sha256: Sha256,
          reviewed_acceptance_manifest_sha256: Sha256,
          reviewed_review_cut_id: NonEmptyString,
          verdict: Schema.Literal("approve"),
        }),
      ),
    }),
  ),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
    authorizes_d1_r2_mutation: Schema.Literal(false),
    authorizes_deploy: Schema.Literal(false),
  }),
});
export type Plan042ReviewHandoffArtifact = typeof Plan042ReviewHandoffArtifactSchema.Type;

const Plan042AcceptanceLogSchema = Schema.Struct({
  path: NonEmptyString,
  bytes: PositiveInteger,
  sha256: Sha256,
});

const Plan042AcceptanceCheckSchema = Schema.Struct({
  check_id: NonEmptyString,
  command: NonEmptyString,
  exit_code: Schema.Literal(0),
  result: Schema.Literal("passed"),
  log: Plan042AcceptanceLogSchema,
});

export const Plan042AcceptanceManifestSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.acceptance-manifest.v1"),
  schema_version: Schema.Literal(1),
  candidate_set_id: NonEmptyString,
  review_cut_id: NonEmptyString,
  artifacts: Schema.Array(
    Schema.Struct({
      artifact_id: NonEmptyString,
      path: NonEmptyString,
      bytes: NonNegativeInteger,
      sha256: Sha256,
      row_count: Schema.NullOr(NonNegativeInteger),
    }),
  ).check(Schema.isMinLength(1)),
  implementation_files: Schema.Array(
    Schema.Struct({
      path: NonEmptyString,
      bytes: PositiveInteger,
      sha256: Sha256,
    }),
  ).check(Schema.isMinLength(1)),
  checks: Schema.Struct({
    focused: Plan042AcceptanceCheckSchema,
    typecheck: Plan042AcceptanceCheckSchema,
    validation: Plan042AcceptanceCheckSchema,
    replay: Schema.Struct({
      ...Plan042AcceptanceCheckSchema.fields,
      replay_artifact_tree_sha256: Sha256,
    }),
  }),
  package_results: Schema.Array(
    Schema.Struct({
      package_id: NonEmptyString,
      candidate_or_member_count: NonNegativeInteger,
      item_ids: Schema.Array(NonEmptyString),
      item_ids_sha256: Sha256,
      risk_class: Schema.Literals(["routine", "risky"]),
      check_ids: Schema.Tuple([
        Schema.Literal("focused"),
        Schema.Literal("typecheck"),
        Schema.Literal("validation"),
        Schema.Literal("replay"),
      ]),
      authority: Schema.Struct({
        authorizes_study: Schema.Literal(false),
        authorizes_publication: Schema.Literal(false),
      }),
    }),
  ).check(Schema.isMinLength(1)),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
    authorizes_d1_r2_mutation: Schema.Literal(false),
    authorizes_deploy: Schema.Literal(false),
  }),
});
export type Plan042AcceptanceManifest = typeof Plan042AcceptanceManifestSchema.Type;

export const Plan042IndependentReviewReceiptSchema = Schema.Struct({
  artifact_kind: Schema.Literal("bp.plan042.independent-review-receipt.v1"),
  schema_version: Schema.Literal(1),
  reviewer_id: NonEmptyString,
  reviewed_acceptance_manifest: Schema.Struct({
    path: NonEmptyString,
    sha256: Sha256,
  }),
  reviewed_review_cut_id: NonEmptyString,
  package_ids: Schema.Array(NonEmptyString).check(Schema.isMinLength(1)),
  verdict: Schema.Literal("approve"),
  findings: Schema.Array(NonEmptyString),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
  }),
});
export type Plan042IndependentReviewReceipt = typeof Plan042IndependentReviewReceiptSchema.Type;

const Plan042ReceiptFileSchema = Schema.Struct({
  path: NonEmptyString,
  bytes: NonNegativeInteger,
  sha256: Sha256,
});

const Plan042PhaseResultSchema = Schema.Struct({
  exit_code: NonNegativeInteger,
  log_sha256: Sha256,
  byte_count: NonNegativeInteger,
  line_count: NonNegativeInteger,
  status: NonEmptyString,
});

export const Plan042ClosureReceiptSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("bp.plan042.closure-receipt.v1"),
  consumer: Schema.Literal("bus-reliability-tracker"),
  producer: Schema.Struct({
    release_id: Schema.Literal("v1-rc28"),
    manifest_sha256: Sha256,
    handoff_path: NonEmptyString,
    handoff_sha256: Sha256,
  }),
  consumer_commit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
  import: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    source_occurrence_count: NonNegativeInteger,
    eligible_occurrence_count: NonNegativeInteger,
    route_projection_count: NonNegativeInteger,
    complete_occurrence_route_count: NonNegativeInteger,
  }),
  candidate_set: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    candidate_set_id: NonEmptyString,
    candidate_count: NonNegativeInteger,
    approval_state: Schema.Literal("awaiting_outcome_grain_review"),
  }),
  member_grain_import: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    row_count: NonNegativeInteger,
    member_extent_projection_sha256: Sha256,
  }),
  extent_binding: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    row_count: NonNegativeInteger,
    disposition_histogram: Schema.Record(NonEmptyString, NonNegativeInteger),
  }),
  grain_verdict: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    row_count: NonNegativeInteger,
    denominator: Schema.Struct({
      member_row_count: NonNegativeInteger,
      no_member_candidate_count: NonNegativeInteger,
      expected_row_count: NonNegativeInteger,
    }),
    family_by_verdict_histogram: Schema.Record(
      NonEmptyString,
      Schema.Record(NonEmptyString, NonNegativeInteger),
    ),
  }),
  review_handoff: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    review_cut_id: NonEmptyString,
    row_count: NonNegativeInteger,
    status: Schema.Literal("reviewed_authority_false"),
    approval_applied: Schema.Literal(false),
  }),
  acceptance_manifest: Schema.Struct({
    ...Plan042ReceiptFileSchema.fields,
    review_cut_id: NonEmptyString,
    artifact_count: NonNegativeInteger,
    package_count: NonNegativeInteger,
  }),
  operator_authorization: Schema.Struct({
    authorization_id: Schema.Literal("mta-wiki-owner-2026-07-22-all-closure-plans"),
    scope: Schema.Literal("internal_analyst_stop_set_admission"),
    recorded_decision: Schema.Literal(
      "versioned_analyst_grain_allowed_only_with_candidate_coverage_and_reviewed_stop_id_lineage",
    ),
    source_plan: Schema.Literal("plans/106-member-grain-outcome-certification.md"),
  }),
  verification_baseline: Schema.Struct({
    protected_commit: Schema.Literal("b25542b0a735636e7051be8fb70893499671366f"),
    baseline: Schema.Struct({
      check_style: Schema.Struct({
        ...Plan042PhaseResultSchema.fields,
        error_count: Schema.Literal(6),
        warning_count: Schema.Literal(39),
        info_count: Schema.Literal(514),
        file_count: Schema.Literal(1107),
      }),
      check_architecture: Schema.Struct({
        ...Plan042PhaseResultSchema.fields,
        pass_count: NonNegativeInteger,
        fail_count: Schema.Literal(0),
      }),
      test_unit: Schema.Struct({
        ...Plan042PhaseResultSchema.fields,
        pass_count: Schema.Literal(1056),
        fail_count: Schema.Literal(0),
      }),
      test_web: Schema.Struct({
        ...Plan042PhaseResultSchema.fields,
        pass_count: Schema.Literal(342),
        fail_count: Schema.Literal(0),
      }),
      test_worker: Schema.Struct({
        ...Plan042PhaseResultSchema.fields,
        failure_signature: Schema.Literal("listen EPERM 127.0.0.1"),
      }),
    }),
    final: Schema.Struct({
      check_style: Plan042PhaseResultSchema,
      check_architecture: Plan042PhaseResultSchema,
      test_unit: Plan042PhaseResultSchema,
      test_web: Plan042PhaseResultSchema,
      test_worker: Plan042PhaseResultSchema,
    }),
    zero_additional_failures: Schema.Literal(true),
  }),
  authority: Schema.Struct({
    authorizes_study: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
    authorizes_d1_r2_mutation: Schema.Literal(false),
    authorizes_deploy: Schema.Literal(false),
  }),
  protected_surfaces: Schema.Struct({
    protected_baseline_commit: Schema.Literal("b25542b0a735636e7051be8fb70893499671366f"),
    entries: Schema.Array(
      Schema.Struct({
        path: NonEmptyString,
        baseline_sha256: Sha256,
        consumer_sha256: Sha256,
      }),
    ).check(Schema.isMinLength(1)),
  }),
});
export type Plan042ClosureReceipt = typeof Plan042ClosureReceiptSchema.Type;
