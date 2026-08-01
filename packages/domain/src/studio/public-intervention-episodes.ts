import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const GitCommitSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/u));
const ProducerEpisodeIdSchema = NonEmptyStringSchema.check(
  Schema.isPattern(/^occurrence:[a-f0-9]{24}$/u),
);
const TrackerEpisodeIdSchema = NonEmptyStringSchema.check(Schema.isPattern(/^ep_[a-f0-9]{16}$/u));

export const PublicEpisodeDateSchema = Schema.Struct({
  precision: Schema.Literals(["day", "month", "season", "year", "upper_bound_day", "range"]),
  value: NonEmptyStringSchema,
  display: NonEmptyStringSchema,
  intervalStart: Schema.NullOr(NonEmptyStringSchema),
  intervalEnd: Schema.NullOr(NonEmptyStringSchema),
});

export const PublicEpisodeRouteSchema = Schema.Struct({
  routeKey: NonEmptyStringSchema,
  routeId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  slug: NonEmptyStringSchema,
});

export const PublicEpisodeTreatmentFamilySchema = Schema.Struct({
  treatmentFamilyKey: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
});

export const PublicProducerEpisodeComponentSchema = Schema.Struct({
  authority: Schema.Literal("producer"),
  componentId: NonEmptyStringSchema,
  routeKey: NonEmptyStringSchema,
  gtfsRouteId: NonEmptyStringSchema,
  treatmentFamilyKey: NonEmptyStringSchema,
  treatmentFamilyLabel: NonEmptyStringSchema,
  applicability: Schema.Literal("applies"),
  action: Schema.Literals(["add", "modify", "remove", "suspend", "resume", "retain", "unknown"]),
  actionLabel: NonEmptyStringSchema,
  extent: Schema.Struct({
    kind: Schema.Literals([
      "route_wide",
      "bounded_segment",
      "stop_set",
      "service_pattern",
      "unknown",
    ]),
    label: NonEmptyStringSchema,
    description: Schema.NullOr(NonEmptyStringSchema),
  }),
  details: NonEmptyStringSchema,
  caveats: Schema.Array(NonEmptyStringSchema),
});

export const PublicTrackerEpisodeComponentSchema = Schema.Struct({
  authority: Schema.Literal("tracker_enrichment"),
  componentId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  detail: Schema.NullOr(NonEmptyStringSchema),
});

export const PublicProducerPlacementSchema = Schema.Struct({
  placementKey: NonEmptyStringSchema,
  foundingComponentId: Schema.NullOr(NonEmptyStringSchema),
  routeKey: NonEmptyStringSchema,
  treatmentFamilyKey: NonEmptyStringSchema,
  scope: Schema.Struct({
    kind: Schema.Literals([
      "route_wide",
      "bounded_segment",
      "stop_set",
      "service_pattern",
      "unknown",
    ]),
  }),
  stateAsOf: Schema.Literals([
    "confirmed_active",
    "last_confirmed_active",
    "confirmed_inactive",
    "planned",
    "suspended",
    "conflicted",
    "unknown",
  ]),
  asOfDate: NonEmptyStringSchema,
  confirmedCurrent: Schema.NullOr(
    Schema.Struct({ state: Schema.Literal("confirmed_active"), asOfDate: NonEmptyStringSchema }),
  ),
});

export const PublicEpisodeCitationSchema = Schema.Struct({
  citationId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  publisher: Schema.NullOr(NonEmptyStringSchema),
  published: Schema.NullOr(NonEmptyStringSchema),
  url: Schema.NullOr(NonEmptyStringSchema),
  urlStatus: Schema.Literals(["source_provided", "accepted_override", "unavailable"]),
});

export const PublicEpisodeFindingSchema = Schema.Struct({
  authority: Schema.Literal("tracker_study"),
  headline: NonEmptyStringSchema,
  comparison: NonEmptyStringSchema,
  caveat: Schema.NullOr(NonEmptyStringSchema),
  sourceEventKey: NonEmptyStringSchema,
});

const PublicEpisodeCommonFields = {
  title: NonEmptyStringSchema,
  summary: Schema.String,
  date: PublicEpisodeDateSchema,
  routes: Schema.Array(PublicEpisodeRouteSchema),
  treatmentFamilies: Schema.Array(PublicEpisodeTreatmentFamilySchema),
  citations: Schema.Array(PublicEpisodeCitationSchema),
  caveat: Schema.NullOr(NonEmptyStringSchema),
  finding: Schema.NullOr(PublicEpisodeFindingSchema),
} as const;

export const PublicProducerInterventionEpisodeSchema = Schema.Struct({
  authority: Schema.Literal("producer"),
  episodeId: ProducerEpisodeIdSchema,
  aliases: Schema.Array(NonEmptyStringSchema),
  ...PublicEpisodeCommonFields,
  components: Schema.Array(PublicProducerEpisodeComponentSchema),
  placements: Schema.Array(PublicProducerPlacementSchema),
});

export const PublicTrackerEnrichmentEpisodeSchema = Schema.Struct({
  authority: Schema.Literal("tracker_enrichment"),
  episodeId: TrackerEpisodeIdSchema,
  ...PublicEpisodeCommonFields,
  components: Schema.Array(PublicTrackerEpisodeComponentSchema),
  lineage: Schema.Struct({
    sourceId: Schema.Literal("mta_ace_routes"),
    originIds: Schema.Array(NonEmptyStringSchema),
    sourceEventIds: Schema.Array(NonEmptyStringSchema),
  }),
});

export const PublicInterventionEpisodeSchema = Schema.Union([
  PublicProducerInterventionEpisodeSchema,
  PublicTrackerEnrichmentEpisodeSchema,
]);

export const PublicNetworkSpreadSeriesSchema = Schema.Struct({
  familyKey: Schema.Literals([
    "bus_lane",
    "camera_enforcement",
    "select_bus_service",
    "signal_priority",
    "busway",
    "other",
  ]),
  label: NonEmptyStringSchema,
  routesByYear: Schema.Array(NonNegativeIntegerSchema),
});

export const PublicNetworkBuildoutSnapshotSchema = Schema.Struct({
  authority: Schema.Literal("tracker_presentation"),
  firstYear: Schema.Number.check(Schema.isInt()),
  lastYear: Schema.Number.check(Schema.isInt()),
  lastCompleteYear: Schema.Number.check(Schema.isInt()),
  partialFinalYear: Schema.Boolean,
  coverageEndMonth: NonEmptyStringSchema,
  routeCount: NonNegativeIntegerSchema,
  routesWithDocumentedWork: NonNegativeIntegerSchema,
  series: Schema.Array(PublicNetworkSpreadSeriesSchema),
  inputSha256: Sha256Schema,
});

export const PublicProposedPlanSchema = Schema.Struct({
  planId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  url: Schema.NullOr(NonEmptyStringSchema),
  changeCount: NonNegativeIntegerSchema,
  routeCount: NonNegativeIntegerSchema,
  mix: Schema.Array(
    Schema.Struct({
      label: NonEmptyStringSchema,
      count: NonNegativeIntegerSchema,
    }),
  ),
});

export const PublicCandidateProvenanceSchema = Schema.Struct({
  candidateId: Sha256Schema,
  builderVersion: Schema.Literal("resolved-transit-candidate-v2"),
  producer: Schema.Struct({
    releaseId: Schema.Literal("resolved-pack-v1-production"),
    tagTarget: GitCommitSchema,
    generatorCommit: GitCommitSchema,
    buildId: Sha256Schema,
    asOfDate: NonEmptyStringSchema,
    releaseManifestSha256: Sha256Schema,
    publicManifestSha256: Sha256Schema,
  }),
  trackerEnrichment: Schema.Struct({
    aceRegistrySha256: Sha256Schema,
    aceEventCount: NonNegativeIntegerSchema,
    studyIndexSha256: Sha256Schema,
    editorialCorpusSha256: Sha256Schema,
  }),
});

export const PublicInterventionEpisodesArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.public_intervention_episodes.v2"),
  schemaVersion: Schema.Literal(2),
  candidate: PublicCandidateProvenanceSchema,
  networkBuildout: PublicNetworkBuildoutSnapshotSchema,
  proposedPlans: Schema.Struct({
    authority: Schema.Literal("tracker_editorial"),
    inputSha256: Sha256Schema,
    plans: Schema.Array(PublicProposedPlanSchema),
    changeCount: NonNegativeIntegerSchema,
    planCount: NonNegativeIntegerSchema,
  }),
  episodes: Schema.Array(PublicInterventionEpisodeSchema),
});

export const PublicRouteInterventionHistoryArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_history.v2"),
  schemaVersion: Schema.Literal(2),
  candidateId: Sha256Schema,
  producerAsOfDate: NonEmptyStringSchema,
  route: Schema.Struct({
    routeKey: NonEmptyStringSchema,
    routeId: NonEmptyStringSchema,
    slug: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    corridor: Schema.NullOr(NonEmptyStringSchema),
  }),
  episodes: Schema.Array(PublicInterventionEpisodeSchema),
});

export function publicInterventionEpisodesKey(): string {
  return "studio/v2/interventions/public-episodes-v2.json";
}

export function publicRouteInterventionHistoryKey(routeKey: string): string {
  return `studio/v2/routes/${routeKey}/intervention-history-v2.json`;
}

export function publicInterventionCandidateRootKey(candidateId: string): string {
  return `studio/v2/candidates/${candidateId}`;
}

export function publicInterventionEpisodesCandidateKey(candidateId: string): string {
  return `${publicInterventionCandidateRootKey(candidateId)}/public-episodes.json`;
}

export function publicRouteInterventionHistoryCandidateKey(
  candidateId: string,
  routeKey: string,
): string {
  return `${publicInterventionCandidateRootKey(candidateId)}/routes/${routeKey}/intervention-history.json`;
}

export type PublicEpisodeDate = typeof PublicEpisodeDateSchema.Type;
export type PublicEpisodeRoute = typeof PublicEpisodeRouteSchema.Type;
export type PublicEpisodeTreatmentFamily = typeof PublicEpisodeTreatmentFamilySchema.Type;
export type PublicProducerEpisodeComponent = typeof PublicProducerEpisodeComponentSchema.Type;
export type PublicTrackerEpisodeComponent = typeof PublicTrackerEpisodeComponentSchema.Type;
export type PublicProducerPlacement = typeof PublicProducerPlacementSchema.Type;
export type PublicEpisodeCitation = typeof PublicEpisodeCitationSchema.Type;
export type PublicEpisodeFinding = typeof PublicEpisodeFindingSchema.Type;
export type PublicProducerInterventionEpisode = typeof PublicProducerInterventionEpisodeSchema.Type;
export type PublicTrackerEnrichmentEpisode = typeof PublicTrackerEnrichmentEpisodeSchema.Type;
export type PublicInterventionEpisode = typeof PublicInterventionEpisodeSchema.Type;
export type PublicNetworkBuildoutSnapshot = typeof PublicNetworkBuildoutSnapshotSchema.Type;
export type PublicProposedPlan = typeof PublicProposedPlanSchema.Type;
export type PublicCandidateProvenance = typeof PublicCandidateProvenanceSchema.Type;
export type PublicInterventionEpisodesArtifact =
  typeof PublicInterventionEpisodesArtifactSchema.Type;
export type PublicRouteInterventionHistoryArtifact =
  typeof PublicRouteInterventionHistoryArtifactSchema.Type;
