import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

const AuditRecordSchema = Schema.Struct({
  recordId: NonEmptyStringSchema,
  disposition: Schema.Literals(["included", "supporting", "excluded", "unresolved"]),
  note: NonEmptyStringSchema,
});

/**
 * Operator-only resolution evidence. This contract intentionally lives apart
 * from the public serving contract so its states cannot enter consumer bundles.
 */
export const PublicEpisodeResolutionAuditArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.quality.intervention_episode_resolution.v1"),
  schemaVersion: Schema.Literal(1),
  releaseId: NonEmptyStringSchema,
  generatedAt: NonEmptyStringSchema,
  scope: Schema.Struct({
    upstreamOccurrenceCount: NonNegativeIntegerSchema,
    reconciliationDecisionCount: NonNegativeIntegerSchema,
    localMintedEpisodeCount: NonNegativeIntegerSchema,
    registryEventCount: NonNegativeIntegerSchema,
    registryAttachedEventCount: NonNegativeIntegerSchema,
    registryMintedEpisodeCount: NonNegativeIntegerSchema,
    episodeCount: NonNegativeIntegerSchema,
    routeReachCount: NonNegativeIntegerSchema,
    reviewedRouteCount: NonNegativeIntegerSchema,
    releasePins: Schema.Array(
      Schema.Struct({
        label: NonEmptyStringSchema,
        value: NonEmptyStringSchema,
      }),
    ),
  }),
  audits: Schema.Array(
    Schema.Struct({
      episodeId: NonEmptyStringSchema,
      decisionKind: Schema.Literals([
        "reviewed_occurrence",
        "reviewed_reconciliation",
        "ace_registry",
      ]),
      decisionIds: Schema.Array(NonEmptyStringSchema),
      occurrenceId: Schema.NullOr(NonEmptyStringSchema),
      sourceEventIds: Schema.Array(NonEmptyStringSchema),
      records: Schema.Array(AuditRecordSchema),
      reviewerNotes: Schema.Array(NonEmptyStringSchema),
      replacementState: Schema.NullOr(
        Schema.Literals(["active", "shadowed_by_upstream", "stale", "conflicted"]),
      ),
    }),
  ),
  withheld: Schema.Array(
    Schema.Struct({
      recordId: NonEmptyStringSchema,
      routeId: NonEmptyStringSchema,
      routeSlug: NonEmptyStringSchema,
      date: Schema.String,
      precision: Schema.String,
      title: NonEmptyStringSchema,
      reason: Schema.Literals([
        "no_reviewed_decision",
        "unresolved_relationship",
        "reviewed_and_excluded",
        "programme_scoped",
        "other_route_change",
        "undated",
        "ambiguous_registry_match",
      ]),
      note: NonEmptyStringSchema,
    }),
  ),
  reviewRoutes: Schema.Array(
    Schema.Struct({
      routeId: NonEmptyStringSchema,
      slug: NonEmptyStringSchema,
      label: NonEmptyStringSchema,
      corridor: Schema.NullOr(NonEmptyStringSchema),
      timelineCount: NonNegativeIntegerSchema,
      treatmentCount: NonNegativeIntegerSchema,
      projectCount: NonNegativeIntegerSchema,
      changeCandidateCount: NonNegativeIntegerSchema,
      speed: Schema.Array(
        Schema.Struct({
          month: NonEmptyStringSchema,
          value: Schema.NullOr(Schema.Number),
        }),
      ),
    }),
  ),
});

export type PublicEpisodeResolutionAuditArtifact =
  typeof PublicEpisodeResolutionAuditArtifactSchema.Type;
