import { Schema } from "effect";
import { CodeExecutionLanguageSchema, IsoMonthSchema, RouteIdSchema } from "../primitives/index.js";
import { registerProjectSchema } from "../schema-registry.js";

const schemaVersion = 1;

// Detector contracts. See knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md
// for the candidate/evidence/coverage spine. These schemas are the strict
// internal contract for `findings:detect`; Studio projections derive a public
// subset from reviewed/promoted candidates in the Studio finding contracts.

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

export const DetectorIdSchema = registerProjectSchema(
  Schema.String.check(Schema.isMinLength(2))
    .check(Schema.isMaxLength(64))
    .check(Schema.isPattern(SLUG_REGEX))
    .pipe(Schema.brand("DetectorId")),
  {
    id: "bp.finding.detector_id",
    title: "Detector ID",
    description: "Stable snake_case slug identifying a deterministic detector.",
    stability: "draft",
  },
);

export type DetectorId = typeof DetectorIdSchema.Type;

export const KNOWN_DETECTOR_IDS = [
  "source_gap",
  "persistent_speed_hotspot",
  "speed_pace_hotspot",
  "multi_month_speed_peer",
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "rider_weighted_excess_wait",
  "customer_journey_shortfall",
  "travel_time_variability",
  "schedule_mismatch",
  "degradation_trend",
  "positive_deviance",
  "intervention_gap",
  "intervention_event_study",
  "intervention_underperformance",
  "treatment_scope_mismatch",
  "treatment_scope_gap",
  "permit_correlated_slowdown",
  "service_request_context",
  "delay_concentration",
] as const;

export const DetectorRunIdSchema = registerProjectSchema(
  Schema.String.check(Schema.isMinLength(8))
    .check(Schema.isMaxLength(128))
    .pipe(Schema.brand("DetectorRunId")),
  {
    id: "bp.finding.detector_run_id",
    title: "Detector Run ID",
    description: "Stable id for one execution of a detector against a release month.",
    stability: "draft",
  },
);

export const FindingSeveritySchema = registerProjectSchema(
  Schema.Literals(["info", "low", "medium", "high"]).pipe(Schema.brand("FindingSeverity")),
  {
    id: "bp.finding.severity",
    title: "Finding Severity",
    description: "Rider-impact severity bucket assigned by the detector.",
    stability: "draft",
  },
);

export const FindingConfidenceSchema = registerProjectSchema(
  Schema.Literals(["insufficient", "low", "medium", "high"]).pipe(
    Schema.brand("FindingConfidence"),
  ),
  {
    id: "bp.finding.confidence",
    title: "Finding Confidence",
    description:
      "Source-sufficiency and join-quality confidence label. Not a rhetorical certainty.",
    stability: "draft",
  },
);

export const FindingStatusSchema = registerProjectSchema(
  Schema.Literals(["open", "promoted", "dismissed", "superseded"]).pipe(
    Schema.brand("FindingStatus"),
  ),
  {
    id: "bp.finding.status",
    title: "Finding Status",
    description: "Lifecycle status of a candidate emitted by a detector run.",
    stability: "draft",
  },
);

export const FindingReviewStateSchema = registerProjectSchema(
  Schema.Literals(["unreviewed", "needs_review", "approved", "rejected"]).pipe(
    Schema.brand("FindingReviewState"),
  ),
  {
    id: "bp.finding.review_state",
    title: "Finding Review State",
    description: "Reviewer workflow state. Only approved candidates feed Studio projections.",
    stability: "draft",
  },
);

export const FindingScopeKindSchema = registerProjectSchema(
  Schema.Literals(["route", "segment", "corridor", "system"]).pipe(
    Schema.brand("FindingScopeKind"),
  ),
  {
    id: "bp.finding.scope_kind",
    title: "Finding Scope Kind",
    description:
      "Geometry scope a candidate is anchored to. `system` is reserved for source-gap rows that are not route- or segment-scoped.",
    stability: "draft",
  },
);

export const FindingCategorySchema = registerProjectSchema(
  Schema.Literals(["reliability", "speed", "intervention", "data_quality", "context"]).pipe(
    Schema.brand("FindingCategory"),
  ),
  {
    id: "bp.finding.category",
    title: "Finding Category",
    description: "Top-level topic of a finding, derived from the detector matrix in the wiki.",
    stability: "draft",
  },
);

export const FindingClaimSafeLabelSchema = registerProjectSchema(
  Schema.Literals([
    "no_issue_clean",
    "issue_clean",
    "issue_needs_review",
    "insufficient_evidence",
    "source_lag_expected",
  ]).pipe(Schema.brand("FindingClaimSafeLabel")),
  {
    id: "bp.finding.claim_safe_label",
    title: "Claim-Safe Label",
    description:
      "Reader-facing classification per the wiki Product Rule. Drives Studio messaging without overclaiming.",
    stability: "draft",
  },
);

export const FindingReasonCodeSchema = registerProjectSchema(
  Schema.String.check(Schema.isMinLength(2))
    .check(Schema.isMaxLength(64))
    .check(Schema.isPattern(SLUG_REGEX))
    .pipe(Schema.brand("FindingReasonCode")),
  {
    id: "bp.finding.reason_code",
    title: "Finding Reason Code",
    description:
      "Stable snake_case reason a candidate fired (or a coverage row was emitted). Open-vocabulary; see KNOWN_FINDING_REASON_CODES for the documented set.",
    stability: "draft",
  },
);

export const FindingDetectorScoreSchema = registerProjectSchema(
  Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
  {
    id: "bp.finding.detector_score",
    title: "Detector Score",
    description: "0-100 rank score for sorting candidates within a single detector.",
    stability: "draft",
  },
);

export const FindingEvidenceKindSchema = registerProjectSchema(
  Schema.Literals([
    "metric",
    "context_event",
    "source_row",
    "missing_data",
    "source_doc",
    "coverage_audit",
  ]).pipe(Schema.brand("FindingEvidenceKind")),
  {
    id: "bp.finding.evidence_kind",
    title: "Finding Evidence Kind",
    description: "What kind of evidence row a candidate is anchored to.",
    stability: "draft",
  },
);

export const FindingEvidenceRoleSchema = registerProjectSchema(
  Schema.Literals([
    "primary",
    "context",
    "official_context",
    "counter_evidence",
    "caveat",
    "missing_data",
    "coverage_audit",
  ]).pipe(Schema.brand("FindingEvidenceRole")),
  {
    id: "bp.finding.evidence_role",
    title: "Finding Evidence Role",
    description:
      "Role evidence plays in the candidate: primary signal, generic context, official_context (agency-record evidence the publication wording depends on), counter-evidence, caveat, or audit support.",
    stability: "draft",
  },
);

export const FindingCoverageOutcomeSchema = registerProjectSchema(
  Schema.Literals([
    "hit",
    "clean_no_hit",
    "deferred_not_in_scope",
    "skipped_missing_input",
    "skipped_failed_join",
    "source_lag",
  ]).pipe(Schema.brand("FindingCoverageOutcome")),
  {
    id: "bp.finding.coverage_outcome",
    title: "Finding Coverage Outcome",
    description:
      "Per-scope outcome of a detector pass. Required for every considered scope so silent gaps cannot hide. `deferred_not_in_scope` marks a scope the detector intentionally does not apply to (e.g. EWT on a low-frequency route), keeping it distinct from a `clean_no_hit` where the detector applied and found nothing.",
    stability: "draft",
  },
);

export const FindingCandidateSchema = registerProjectSchema(
  Schema.Struct({
    candidateId: Schema.String.check(Schema.isMinLength(1)),
    detectorId: DetectorIdSchema,
    detectorRunId: DetectorRunIdSchema,
    month: IsoMonthSchema,
    scopeKind: FindingScopeKindSchema,
    scopeId: Schema.String.check(Schema.isMinLength(1)),
    routeId: Schema.NullOr(RouteIdSchema),
    physicalId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
    category: FindingCategorySchema,
    severity: FindingSeveritySchema,
    confidence: FindingConfidenceSchema,
    detectorScore: FindingDetectorScoreSchema,
    reasonCode: FindingReasonCodeSchema,
    claimSafeLabel: FindingClaimSafeLabelSchema,
    claimText: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    status: FindingStatusSchema,
    reviewState: FindingReviewStateSchema,
    windowStart: Schema.NullOr(
      Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)),
    ),
    windowEnd: Schema.NullOr(
      Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)),
    ),
    createdAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
  }),
  {
    id: "bp.finding.candidate.v1",
    title: "Finding Candidate",
    description:
      "Internal detector output. Studio projections consume only reviewed/promoted rows.",
    stability: "draft",
  },
);

export type FindingCandidate = typeof FindingCandidateSchema.Type;

export const FindingEvidenceLinkSchema = registerProjectSchema(
  Schema.Struct({
    linkId: Schema.String.check(Schema.isMinLength(1)),
    candidateId: Schema.String.check(Schema.isMinLength(1)),
    evidenceKind: FindingEvidenceKindSchema,
    evidenceRole: FindingEvidenceRoleSchema,
    evidenceRef: Schema.String.check(Schema.isMinLength(1)),
    evidenceWeight: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
    ),
    note: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  }),
  {
    id: "bp.finding.evidence_link.v1",
    title: "Finding Evidence Link",
    description: "Candidate-to-evidence link with role and weight.",
    stability: "draft",
  },
);

export type FindingEvidenceLink = typeof FindingEvidenceLinkSchema.Type;

export const FindingCoverageAuditSchema = registerProjectSchema(
  Schema.Struct({
    auditId: Schema.String.check(Schema.isMinLength(1)),
    detectorRunId: DetectorRunIdSchema,
    detectorId: DetectorIdSchema,
    month: IsoMonthSchema,
    scopeKind: FindingScopeKindSchema,
    scopeId: Schema.String.check(Schema.isMinLength(1)),
    outcome: FindingCoverageOutcomeSchema,
    reasonCode: Schema.NullOr(FindingReasonCodeSchema),
    reason: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    inputsSeenJson: Schema.NullOr(Schema.String),
    inputsExpectedJson: Schema.NullOr(Schema.String),
    createdAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
  }),
  {
    id: "bp.finding.coverage_audit.v1",
    title: "Finding Coverage Audit",
    description:
      "Per-scope, per-detector-run accounting row. Required for every considered scope, regardless of hit or miss.",
    stability: "draft",
  },
);

export type FindingCoverageAudit = typeof FindingCoverageAuditSchema.Type;

export const FindingDetectorSpecSchema = registerProjectSchema(
  Schema.Struct({
    detectorId: DetectorIdSchema,
    name: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
    question: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    claimTemplate: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    allowedClaimStrength: Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(5)),
    primaryEvidenceRequired: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
    ),
    supportingEvidenceExpected: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
    ),
    counterEvidenceRequired: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
    ),
    promotionChecklist: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
    ),
    knownFailureModes: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
    ),
  }),
  {
    id: "bp.finding.detector_spec.v1",
    title: "Finding Detector Spec",
    description:
      "Detector-specific review contract: question, allowed claim strength, required evidence, counter-evidence, and promotion checklist.",
    stability: "draft",
  },
);

export type FindingDetectorSpec = typeof FindingDetectorSpecSchema.Type;

export const FindingReviewPriorityBandSchema = registerProjectSchema(
  Schema.Literals(["critical", "high", "medium", "low"]),
  {
    id: "bp.finding.review_priority_band",
    title: "Finding Review Priority Band",
    description: "Priority bucket used to order detector review packets.",
    stability: "draft",
  },
);

export const FindingReviewPacketSchema = registerProjectSchema(
  Schema.Struct({
    packetId: Schema.String.check(Schema.isMinLength(1)),
    reviewRank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    candidate: FindingCandidateSchema,
    detectorSpec: FindingDetectorSpecSchema,
    priority: Schema.Struct({
      score: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
      band: FindingReviewPriorityBandSchema,
      signals: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    }),
    evidence: Schema.Struct({
      primary: Schema.Array(FindingEvidenceLinkSchema),
      context: Schema.Array(FindingEvidenceLinkSchema),
      officialContext: Schema.Array(FindingEvidenceLinkSchema),
      counterEvidence: Schema.Array(FindingEvidenceLinkSchema),
      caveats: Schema.Array(FindingEvidenceLinkSchema),
      missingData: Schema.Array(FindingEvidenceLinkSchema),
      coverageAudit: Schema.Array(FindingEvidenceLinkSchema),
    }),
    evidenceObjects: Schema.Struct({
      primary: Schema.Array(Schema.Unknown),
      context: Schema.Array(Schema.Unknown),
      officialContext: Schema.Array(Schema.Unknown),
      counterEvidence: Schema.Array(Schema.Unknown),
      caveats: Schema.Array(Schema.Unknown),
      missingData: Schema.Array(Schema.Unknown),
      coverageAudit: Schema.Array(Schema.Unknown),
    }),
    coverage: Schema.Array(FindingCoverageAuditSchema),
    reviewContext: Schema.optional(
      Schema.Struct({
        summary: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(700)),
        evidenceHighlights: Schema.Array(
          Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
        ),
        cautionFlags: Schema.Array(
          Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
        ),
        suggestedChecks: Schema.Array(
          Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
        ),
      }),
    ),
    derivedMetricWarnings: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    promotionBlockers: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    reviewChecklist: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    allowedClaimStrength: Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(5)),
    packetCompleteness: Schema.Struct({
      hasPrimaryEvidence: Schema.Boolean,
      hasCounterEvidence: Schema.Boolean,
      hasCoverageAudit: Schema.Boolean,
      hasDetectorSpec: Schema.Boolean,
      hasReviewChecklist: Schema.Boolean,
    }),
  }),
  {
    id: "bp.finding.review_packet.v1",
    title: "Finding Review Packet",
    description:
      "Promotion-review packet with grouped evidence, parsed evidence objects, counter-evidence, coverage rows, and detector checklist.",
    stability: "draft",
  },
);

export const FindingReviewPacketsArtifactSchema = registerProjectSchema(
  Schema.Struct({
    artifactKind: Schema.Literal("finding_review_packets"),
    schemaVersion: Schema.Literal(schemaVersion),
    month: IsoMonthSchema,
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    detectorSpecsArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    packetCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    summary: Schema.Struct({
      packetCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      candidatesWithoutCounterEvidence: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      candidatesWithoutCoverage: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      detectorCounts: Schema.Record(
        DetectorIdSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
    }),
    packets: Schema.Array(FindingReviewPacketSchema),
  }),
  {
    id: "bp.finding.review_packets_artifact.v1",
    title: "Finding Review Packets Artifact",
    description: "Manifest of all packetized detector candidates for human/agent promotion review.",
    stability: "draft",
  },
);

export const FindingPromotionReadinessSchema = registerProjectSchema(
  Schema.Literals(["ready_for_review", "needs_enrichment", "blocked"]).pipe(
    Schema.brand("FindingPromotionReadiness"),
  ),
  {
    id: "bp.finding.promotion_readiness",
    title: "Finding Promotion Readiness",
    description:
      "Deterministic readiness bucket for moving a detector candidate into human promotion review.",
    stability: "draft",
  },
);

export const FindingPromotionDecisionSchema = registerProjectSchema(
  Schema.Literals([
    "approve",
    "approve_with_revisions",
    "defer",
    "reject",
    "downgrade_to_context",
  ]).pipe(Schema.brand("FindingPromotionDecision")),
  {
    id: "bp.finding.promotion_decision",
    title: "Finding Promotion Decision",
    description:
      "Human reviewer decision vocabulary for turning a detector candidate into a promoted finding or deferring it.",
    stability: "draft",
  },
);

export const FindingPromotionNextActionSchema = registerProjectSchema(
  Schema.Literals([
    "review_for_promotion",
    "revise_claim_before_promotion",
    "keep_as_data_quality",
    "enrich_before_promotion",
    "do_not_promote",
  ]).pipe(Schema.brand("FindingPromotionNextAction")),
  {
    id: "bp.finding.promotion_next_action",
    title: "Finding Promotion Next Action",
    description:
      "Pipeline-suggested next review action. This is not an approval decision by itself.",
    stability: "draft",
  },
);

export const FindingPromotionQueueItemSchema = registerProjectSchema(
  Schema.Struct({
    packetId: Schema.String.check(Schema.isMinLength(1)),
    reviewRank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    candidate: FindingCandidateSchema,
    readiness: FindingPromotionReadinessSchema,
    recommendedNextAction: FindingPromotionNextActionSchema,
    promotionPriority: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    promotionPriorityBand: FindingReviewPriorityBandSchema,
    allowedClaimStrength: Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(5)),
    maxPromotableClaimStrength: Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(5)),
    promotionBlockers: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    requiredReviewerActions: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    evidenceSummary: Schema.Struct({
      primaryCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      contextCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      counterEvidenceCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      caveatCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      missingDataCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      coverageAuditCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
    }),
    reviewChecklist: Schema.Array(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
  }),
  {
    id: "bp.finding.promotion_queue_item.v1",
    title: "Finding Promotion Queue Item",
    description:
      "One detector candidate summarized for human promotion review, with blockers and decision inputs.",
    stability: "draft",
  },
);

export const FindingPromotionQueueArtifactSchema = registerProjectSchema(
  Schema.Struct({
    artifactKind: Schema.Literal("finding_promotion_queue"),
    schemaVersion: Schema.Literal(schemaVersion),
    month: IsoMonthSchema,
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    reviewPacketsArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    candidateCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    summary: Schema.Struct({
      candidateCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      readinessCounts: Schema.Record(
        FindingPromotionReadinessSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      recommendedNextActionCounts: Schema.Record(
        FindingPromotionNextActionSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      detectorCounts: Schema.Record(
        DetectorIdSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      readyForReviewCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      blockedCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    }),
    reviewerDecisionOptions: Schema.Array(
      Schema.Struct({
        decision: FindingPromotionDecisionSchema,
        meaning: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
      }),
    ),
    outputSchema: Schema.Struct({
      candidateId: Schema.Literal("string"),
      decision: Schema.Literal(
        "approve | approve_with_revisions | defer | reject | downgrade_to_context",
      ),
      revisedClaimText: Schema.Literal("string | null"),
      rationale: Schema.Literal("string"),
      evidenceRefsApproved: Schema.Literal("string[]"),
      reviewer: Schema.Literal("string"),
      reviewedAt: Schema.Literal("ISO datetime"),
    }),
    candidates: Schema.Array(FindingPromotionQueueItemSchema),
  }),
  {
    id: "bp.finding.promotion_queue_artifact.v1",
    title: "Finding Promotion Queue Artifact",
    description:
      "Reviewer-facing promotion queue derived from review packets. It exposes readiness, blockers, and an explicit decision contract.",
    stability: "draft",
  },
);

export const FindingReviewerDecisionRecordSchema = registerProjectSchema(
  Schema.Struct({
    decisionId: Schema.String.check(Schema.isMinLength(1)),
    decisionHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    packetId: Schema.String.check(Schema.isMinLength(1)),
    candidateId: Schema.String.check(Schema.isMinLength(1)),
    detectorId: DetectorIdSchema,
    routeId: Schema.NullOr(RouteIdSchema),
    decision: FindingPromotionDecisionSchema,
    revisedClaimText: Schema.NullOr(
      Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    ),
    rationale: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(1000)),
    evidenceRefsApproved: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    reviewer: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
    reviewedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    promoted: Schema.Boolean,
  }),
  {
    id: "bp.finding.reviewer_decision_record.v1",
    title: "Finding Reviewer Decision Record",
    description:
      "Validated reviewer decision with a stable hash and candidate metadata for calibration and promotion audit.",
    stability: "draft",
  },
);

export const FindingReviewDecisionsArtifactSchema = registerProjectSchema(
  Schema.Struct({
    artifactKind: Schema.Literal("finding_review_decisions"),
    schemaVersion: Schema.Literal(schemaVersion),
    month: IsoMonthSchema,
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    promotionQueueArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    reviewPacketsArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    decisionCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    summary: Schema.Struct({
      decisionCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      decisionCounts: Schema.Record(
        FindingPromotionDecisionSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      promotedDecisionCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      nonPromotedDecisionCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
    }),
    decisions: Schema.Array(FindingReviewerDecisionRecordSchema),
  }),
  {
    id: "bp.finding.review_decisions_artifact.v1",
    title: "Finding Review Decisions Artifact",
    description:
      "Captured reviewer decisions for detector candidates. This is the audit input for promoted findings and calibration.",
    stability: "draft",
  },
);

export const PromotedFindingSchema = registerProjectSchema(
  Schema.Struct({
    promotedFindingId: Schema.String.check(Schema.isMinLength(1)),
    sourceCandidateId: Schema.String.check(Schema.isMinLength(1)),
    sourceDecisionId: Schema.String.check(Schema.isMinLength(1)),
    sourcePacketId: Schema.String.check(Schema.isMinLength(1)),
    detectorId: DetectorIdSchema,
    month: IsoMonthSchema,
    scopeKind: FindingScopeKindSchema,
    scopeId: Schema.String.check(Schema.isMinLength(1)),
    routeId: Schema.NullOr(RouteIdSchema),
    category: FindingCategorySchema,
    severity: FindingSeveritySchema,
    confidence: FindingConfidenceSchema,
    reasonCode: FindingReasonCodeSchema,
    claimText: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
    approvedClaimStrength: Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(5)),
    approvedEvidenceRefs: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    reviewer: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
    reviewedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    reviewRationale: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(1000)),
    sourceCandidate: FindingCandidateSchema,
    decisionHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    candidateSnapshotHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    promotedFindingHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  }),
  {
    id: "bp.finding.promoted_finding.v1",
    title: "Promoted Finding",
    description:
      "Immutable promoted-finding record produced from an approved reviewer decision and a frozen detector candidate snapshot.",
    stability: "draft",
  },
);

export const PromotedFindingsArtifactSchema = registerProjectSchema(
  Schema.Struct({
    artifactKind: Schema.Literal("promoted_findings"),
    schemaVersion: Schema.Literal(schemaVersion),
    month: IsoMonthSchema,
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    promotionQueueArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    reviewDecisionsArtifactPath: Schema.String.check(Schema.isMinLength(1)),
    promotedFindingCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    summary: Schema.Struct({
      promotedFindingCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      detectorCounts: Schema.Record(
        DetectorIdSchema,
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    }),
    findings: Schema.Array(PromotedFindingSchema),
  }),
  {
    id: "bp.finding.promoted_findings_artifact.v1",
    title: "Promoted Findings Artifact",
    description:
      "Immutable promoted-finding artifact. Each record is traceable to a reviewer decision, detector candidate, and approved evidence refs.",
    stability: "draft",
  },
);

export const SignalFeatureWindowSchema = registerProjectSchema(
  Schema.Literals(["all_day", "am_peak", "pm_peak"]),
  {
    id: "bp.finding.signal_feature_window",
    title: "Signal Feature Window",
    description: "Time window represented by a detector signal feature.",
    stability: "draft",
  },
);

export const RouteMonthContextEventFeatureSchema = registerProjectSchema(
  Schema.Struct({
    sourceId: Schema.String.check(Schema.isMinLength(1)),
    eventKind: Schema.String.check(Schema.isMinLength(1)),
    touchedEventCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    touchCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    primaryTouchCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    contextTouchCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    highConfidenceTouchCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    matchWeightSum: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    averageMatchWeight: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    maxRouteFanout: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  {
    id: "bp.finding.route_month_context_event_feature.v1",
    title: "Route Month Context Event Feature",
    description:
      "Per-route/month context-event support for one source/event-kind pair, including fanout and match-weight uncertainty.",
    stability: "draft",
  },
);

export const RouteMonthSignalFeatureSchema = registerProjectSchema(
  Schema.Struct({
    scope: Schema.Literal("route"),
    scopeId: RouteIdSchema,
    routeId: RouteIdSchema,
    month: IsoMonthSchema,
    window: SignalFeatureWindowSchema,
    direction: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
    routeWeightedAverageSpeedMph: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    speedObservationCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    hotspotCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    maxHotspotScore: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
    ),
    ridershipExposure: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
    permitTouchedEventCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    permitTouchCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    permitRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    permitSources: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    contextTouchedEventCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    contextTouchCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    contextPrimaryTouchCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    contextHighConfidenceTouchCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    contextEventCounts: Schema.Array(RouteMonthContextEventFeatureSchema),
    sampleSupport: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    uncertainty: Schema.Struct({
      speedObservationCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      permitTouchedEventCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      contextTouchedEventCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      contextHighConfidenceTouchCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
    }),
    provenance: Schema.Struct({
      featureComputedAt: Schema.String.check(
        Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
      ),
      derivationVersion: Schema.String.check(Schema.isMinLength(1)),
      sourceRefs: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
    }),
    coverage: Schema.Struct({
      isComputable: Schema.Boolean,
      skippedReasonCode: Schema.NullOr(FindingReasonCodeSchema),
      inputsSeenJson: Schema.String,
      inputsExpectedJson: Schema.String,
    }),
  }),
  {
    id: "bp.finding.route_month_signal_feature.v1",
    title: "Route Month Signal Feature",
    description:
      "Route/month/window signal row with raw feature values, uncertainty support, provenance, and coverage facts.",
    stability: "draft",
  },
);

export type RouteMonthSignalFeature = typeof RouteMonthSignalFeatureSchema.Type;

export const AgentFindingProposalEvidenceRefSchema = registerProjectSchema(
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("review_packet_link"),
      packetId: Schema.String.check(Schema.isMinLength(1)),
      linkId: Schema.String.check(Schema.isMinLength(1)),
    }),
    Schema.Struct({
      kind: Schema.Literal("signal_feature"),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      window: SignalFeatureWindowSchema,
      feature: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
    }),
    Schema.Struct({
      kind: Schema.Literal("promoted_finding"),
      promotedFindingId: Schema.String.check(Schema.isMinLength(1)),
    }),
    Schema.Struct({
      kind: Schema.Literal("intervention_record"),
      recordId: Schema.String.check(Schema.isMinLength(1)),
    }),
    Schema.Struct({
      kind: Schema.Literal("document_candidate"),
      candidateId: Schema.String.check(Schema.isMinLength(1)),
    }),
    Schema.Struct({
      kind: Schema.Literal("context_appendix"),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      section: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
    }),
    Schema.Struct({
      kind: Schema.Literal("code_execution"),
      language: CodeExecutionLanguageSchema,
      code: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(8000)),
      stdoutHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      citedValuePath: Schema.optional(
        Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(200)),
      ),
    }),
  ]),
  {
    id: "bp.finding.agent_proposal.evidence_ref.v1",
    title: "Agent Finding Proposal Evidence Reference",
    description:
      "Discriminated reference to an existing corpus artifact or to a sandboxed code execution. Every kind must resolve in the loaded corpus or re-execute deterministically; invented refs fail validation.",
    stability: "draft",
  },
);
