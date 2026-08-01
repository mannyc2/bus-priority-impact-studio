import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

/** Operator-only cutover evidence. This contract is never a public serving input. */
export const PublicEpisodeResolutionAuditArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.quality.intervention_episode_resolution.v2"),
  schemaVersion: Schema.Literal(2),
  candidateId: Sha256Schema,
  producer: Schema.Struct({
    releaseId: Schema.Literal("resolved-pack-v1-production"),
    asOfDate: NonEmptyStringSchema,
    releaseManifestSha256: Sha256Schema,
    publicManifestSha256: Sha256Schema,
  }),
  conformance: Schema.Struct({
    acceptedLedgerSha256: Sha256Schema,
    acceptedReceiptSha256: Sha256Schema,
    trackerBaselineEpisodeCount: NonNegativeIntegerSchema,
    useProducerIdentityCount: NonNegativeIntegerSchema,
    trackerEnrichmentOnlyCount: NonNegativeIntegerSchema,
    dropLegacyEpisodeCount: NonNegativeIntegerSchema,
    addProducerEpisodeCount: NonNegativeIntegerSchema,
    unexplainedDispositionCount: NonNegativeIntegerSchema,
  }),
  candidate: Schema.Struct({
    episodeCount: NonNegativeIntegerSchema,
    producerEpisodeCount: NonNegativeIntegerSchema,
    trackerEnrichmentEpisodeCount: NonNegativeIntegerSchema,
    routeArtifactCount: NonNegativeIntegerSchema,
    episodeRouteMembershipCount: NonNegativeIntegerSchema,
  }),
  enrichments: Schema.Array(
    Schema.Struct({
      episodeId: NonEmptyStringSchema,
      originIds: Schema.Array(NonEmptyStringSchema),
      sourceEventIds: Schema.Array(NonEmptyStringSchema),
      routeKeys: Schema.Array(NonEmptyStringSchema),
    }),
  ),
  exclusions: Schema.Array(
    Schema.Struct({
      trackerEpisodeId: NonEmptyStringSchema,
      originIds: Schema.Array(NonEmptyStringSchema),
      reasonCode: NonEmptyStringSchema,
    }),
  ),
});

export type PublicEpisodeResolutionAuditArtifact =
  typeof PublicEpisodeResolutionAuditArtifactSchema.Type;
