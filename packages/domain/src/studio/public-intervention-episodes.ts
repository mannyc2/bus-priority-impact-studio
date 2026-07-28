import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

export const PublicEpisodeDateSchema = Schema.Struct({
  precision: Schema.Literals(["unknown", "day", "month", "season", "year", "range"]),
  start: Schema.String,
  end: Schema.String,
  display: NonEmptyStringSchema,
  raw: Schema.String,
});

export const PublicEpisodeRouteSchema = Schema.Struct({
  routeId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  slug: NonEmptyStringSchema,
  role: Schema.Literals(["introduced", "changed", "affected", "continued"]),
});

export const PublicEpisodeComponentSchema = Schema.Struct({
  componentId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  detail: Schema.NullOr(NonEmptyStringSchema),
});

export const PublicEpisodeCitationSchema = Schema.Struct({
  citationId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  publisher: Schema.NullOr(NonEmptyStringSchema),
  published: Schema.NullOr(NonEmptyStringSchema),
  url: Schema.NullOr(NonEmptyStringSchema),
});

export const PublicEpisodeFindingSchema = Schema.Struct({
  headline: NonEmptyStringSchema,
  comparison: NonEmptyStringSchema,
  caveat: Schema.NullOr(NonEmptyStringSchema),
});

export const PublicInterventionEpisodeSchema = Schema.Struct({
  episodeId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  summary: Schema.String,
  date: PublicEpisodeDateSchema,
  phase: Schema.Literals(["launched", "changed", "switched_on", "warning_period"]),
  lifecycle: Schema.Literals(["in_place", "ended", "proposed"]),
  kindKeys: Schema.Array(NonEmptyStringSchema),
  routes: Schema.Array(PublicEpisodeRouteSchema),
  components: Schema.Array(PublicEpisodeComponentSchema),
  citations: Schema.Array(PublicEpisodeCitationSchema),
  caveat: Schema.NullOr(NonEmptyStringSchema),
  finding: Schema.NullOr(PublicEpisodeFindingSchema),
});

export const PublicInterventionReleaseSourceSchema = Schema.Struct({
  sourceId: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  sha256: Sha256Schema,
  coverageEnd: Schema.NullOr(NonEmptyStringSchema),
});

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
  firstYear: Schema.Number.check(Schema.isInt()),
  lastYear: Schema.Number.check(Schema.isInt()),
  lastCompleteYear: Schema.Number.check(Schema.isInt()),
  partialFinalYear: Schema.Boolean,
  coverageEndMonth: NonEmptyStringSchema,
  routeCount: NonNegativeIntegerSchema,
  routesWithDocumentedWork: NonNegativeIntegerSchema,
  series: Schema.Array(PublicNetworkSpreadSeriesSchema),
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

export const PublicInterventionEpisodesArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.public_intervention_episodes.v1"),
  schemaVersion: Schema.Literal(1),
  release: Schema.Struct({
    releaseId: NonEmptyStringSchema,
    publishedAt: NonEmptyStringSchema,
    coverageEnd: NonEmptyStringSchema,
    sources: Schema.Array(PublicInterventionReleaseSourceSchema),
  }),
  networkBuildout: PublicNetworkBuildoutSnapshotSchema,
  proposedPlans: Schema.Struct({
    plans: Schema.Array(PublicProposedPlanSchema),
    changeCount: NonNegativeIntegerSchema,
    planCount: NonNegativeIntegerSchema,
  }),
  episodes: Schema.Array(PublicInterventionEpisodeSchema),
});

export const PublicRouteInterventionHistoryArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_history.v1"),
  schemaVersion: Schema.Literal(1),
  releaseId: NonEmptyStringSchema,
  route: Schema.Struct({
    routeId: NonEmptyStringSchema,
    slug: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    corridor: Schema.NullOr(NonEmptyStringSchema),
  }),
  episodes: Schema.Array(PublicInterventionEpisodeSchema),
});

export function publicInterventionEpisodesKey(): string {
  return "studio/v2/interventions/public-episodes.json";
}

export function publicRouteInterventionHistoryKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/intervention-history.json`;
}

export type PublicEpisodeDate = typeof PublicEpisodeDateSchema.Type;
export type PublicEpisodeRoute = typeof PublicEpisodeRouteSchema.Type;
export type PublicEpisodeComponent = typeof PublicEpisodeComponentSchema.Type;
export type PublicEpisodeCitation = typeof PublicEpisodeCitationSchema.Type;
export type PublicEpisodeFinding = typeof PublicEpisodeFindingSchema.Type;
export type PublicInterventionEpisode = typeof PublicInterventionEpisodeSchema.Type;
export type PublicNetworkBuildoutSnapshot = typeof PublicNetworkBuildoutSnapshotSchema.Type;
export type PublicProposedPlan = typeof PublicProposedPlanSchema.Type;
export type PublicInterventionEpisodesArtifact =
  typeof PublicInterventionEpisodesArtifactSchema.Type;
export type PublicRouteInterventionHistoryArtifact =
  typeof PublicRouteInterventionHistoryArtifactSchema.Type;
