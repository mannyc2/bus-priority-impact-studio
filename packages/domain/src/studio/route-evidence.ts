import { Schema } from "effect";
import { decodeStrict } from "../decode.js";
import { StudioRouteIdentityPresentationSchema } from "./route-presentation.js";

export const STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME = "route_evidence";
export const STUDIO_ROUTE_EVIDENCE_INDEX_KEY = "studio/v2/wiki/index.json";
export const STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE = "application/json";

export function studioRouteEvidenceBundleKey(routeSlug: string): string {
  return `studio/v2/wiki/routes/${routeSlug}.json`;
}

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

export const StudioRouteEvidenceCitationSchema = Schema.Struct({
  key: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  blockId: NonEmptyStringSchema,
  evidenceId: NonEmptyStringSchema,
  sourcePath: NonEmptyStringSchema,
  pageNumber: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
  textSha256: Schema.optional(NonEmptyStringSchema),
  sourceTitle: Schema.optional(NonEmptyStringSchema),
  publisher: Schema.optional(NonEmptyStringSchema),
  sourceUrl: Schema.optional(NonEmptyStringSchema),
  publishedDate: Schema.optional(NonEmptyStringSchema),
});

const CitationKeysSchema = Schema.mutable(Schema.Array(NonEmptyStringSchema));

const RouteEvidenceRecordBaseSchema = Schema.Struct({
  recordId: NonEmptyStringSchema,
  recordKind: NonEmptyStringSchema,
  citationKeys: CitationKeysSchema,
});

export const StudioRouteEvidenceTimelineEventSchema = Schema.Struct({
  ...RouteEvidenceRecordBaseSchema.fields,
  ...{
    eventKind: Schema.NullOr(Schema.String),
    eventFamily: Schema.NullOr(Schema.String),
    lifecyclePhase: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    dateText: Schema.NullOr(Schema.String),
    dateNormalized: Schema.NullOr(Schema.String),
    datePrecision: Schema.NullOr(Schema.String),
  },
});

export const StudioRouteEvidenceInterventionSchema = Schema.Struct({
  ...RouteEvidenceRecordBaseSchema.fields,
  ...{
    treatmentKind: Schema.NullOr(Schema.String),
    treatmentFamily: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    locations: Schema.Array(Schema.String),
    projectRecordIds: Schema.Array(NonEmptyStringSchema),
  },
});

export const StudioRouteEvidenceMetricClaimSchema = Schema.Struct({
  ...RouteEvidenceRecordBaseSchema.fields,
  ...{
    metricName: Schema.NullOr(Schema.String),
    rawValue: Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
    value: Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
    unit: Schema.NullOr(Schema.String),
    period: Schema.NullOr(Schema.String),
    scope: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
  },
});

export const StudioRouteEvidenceProjectSchema = Schema.Struct({
  ...RouteEvidenceRecordBaseSchema.fields,
  ...{
    projectName: Schema.NullOr(Schema.String),
    projectFamily: Schema.NullOr(Schema.String),
    projectType: Schema.NullOr(Schema.String),
    status: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    location: Schema.NullOr(Schema.String),
    routesServed: Schema.Array(Schema.String),
  },
});

export const StudioRouteEvidenceSourceGapSchema = Schema.Struct({
  ...RouteEvidenceRecordBaseSchema.fields,
  ...{
    gapKind: Schema.NullOr(Schema.String),
    gapText: Schema.NullOr(Schema.String),
    missingInformation: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
  },
});

export const StudioRouteEvidenceCoverageSchema = Schema.Struct({
  timelineCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  interventionCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  metricClaimCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  projectCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sourceGapCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

const StudioRouteEvidenceBundleFields = {
  routeId: NonEmptyStringSchema,
  routeSlug: NonEmptyStringSchema,
  wikiRouteRecordId: Schema.NullOr(NonEmptyStringSchema),
  wikiRouteIds: Schema.Array(NonEmptyStringSchema),
  wikiAliases: Schema.Array(NonEmptyStringSchema),
  coverage: StudioRouteEvidenceCoverageSchema,
  timeline: Schema.Array(StudioRouteEvidenceTimelineEventSchema),
  interventions: Schema.Array(StudioRouteEvidenceInterventionSchema),
  metricClaims: Schema.Array(StudioRouteEvidenceMetricClaimSchema),
  projects: Schema.Array(StudioRouteEvidenceProjectSchema),
  sourceGaps: Schema.Array(StudioRouteEvidenceSourceGapSchema),
  citations: Schema.Array(StudioRouteEvidenceCitationSchema),
} as const;

export const StudioRouteEvidenceBundleV1Schema = Schema.Struct(StudioRouteEvidenceBundleFields);

export const StudioRouteEvidenceBindingSchema = Schema.Struct({
  routeRecordId: NonEmptyStringSchema,
  routeFamilyId: Schema.NullOr(NonEmptyStringSchema),
  datasetId: Schema.NullOr(NonEmptyStringSchema),
  componentFeedIds: Schema.Array(NonEmptyStringSchema),
  sourceRouteId: Schema.NullOr(NonEmptyStringSchema),
  gtfsRouteId: Schema.NullOr(NonEmptyStringSchema),
  serviceVariant: Schema.NullOr(
    Schema.Literals([
      "local",
      "local_limited",
      "limited_stop",
      "sbs",
      "express",
      "rush",
      "school_local",
      "school_limited",
    ]),
  ),
  identityScope: Schema.Literals([
    "exact_service",
    "route_family_context",
    "aggregate_context",
    "unresolved",
  ]),
  serviceClass: Schema.Literals([
    "regular_mta_bus",
    "proposal",
    "temporary",
    "external",
    "non_bus",
    "undetermined",
    "not_applicable",
  ]),
  recordTemporalScope: Schema.Literals([
    "current_description",
    "historical_description",
    "future_description",
    "undetermined",
    "not_applicable",
  ]),
  projectable: Schema.Boolean,
  presentationPrimary: Schema.Boolean,
  derivation: NonEmptyStringSchema,
  evidenceIds: Schema.Array(NonEmptyStringSchema),
  canonicalRecordFingerprint: Sha256Schema,
});

export const StudioRouteCatalogParitySchema = Schema.Struct({
  currentBusRoutesSha256: Sha256Schema,
  effectiveAsOfDate: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
  currentCatalogRouteCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  catalogInEffectIdentityCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  gtfsRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  descriptorReconciled: Schema.Boolean,
  catalogInEffectSetsEqual: Schema.Boolean,
  catalogOnlyRouteIds: Schema.Array(NonEmptyStringSchema),
  gtfsOnlyRouteIds: Schema.Array(NonEmptyStringSchema),
  rawRouteTypeCounts: Schema.Record(Schema.String, Schema.Number.check(Schema.isInt())),
  scheduledInWindowCounts: Schema.Record(Schema.String, Schema.Number.check(Schema.isInt())),
  reliabilityStatusCounts: Schema.Record(Schema.String, Schema.Number.check(Schema.isInt())),
  nonBusOrUnknownExtendedRouteTypeCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  externalOnlyRouteRecordCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

export const StudioRouteEvidenceSourceV2Schema = Schema.Struct({
  kind: Schema.Literal("mta-wiki-immutable-release"),
  wikiRelease: NonEmptyStringSchema,
  manifestSha256: Sha256Schema,
  routeIdentitySha256: Sha256Schema,
  routeAnchorSha256: Sha256Schema,
  trackerRouteInputSha256: Sha256Schema,
  catalogParity: StudioRouteCatalogParitySchema,
});

export const StudioRouteEvidenceBundleV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence_bundle.v2"),
  schemaVersion: Schema.Literal(2),
  source: StudioRouteEvidenceSourceV2Schema,
  routeIdentity: StudioRouteIdentityPresentationSchema,
  operationalBindings: Schema.Array(StudioRouteEvidenceBindingSchema),
  contextualBindings: Schema.Array(StudioRouteEvidenceBindingSchema),
  ...StudioRouteEvidenceBundleFields,
});

export const StudioRouteEvidenceBundleSchema = Schema.Union([
  StudioRouteEvidenceBundleV1Schema,
  StudioRouteEvidenceBundleV2Schema,
]);

export const StudioInterventionsEvidenceCitationSchema = Schema.Struct({
  key: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  pageNumber: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
  sourceTitle: Schema.optional(NonEmptyStringSchema),
  publisher: Schema.optional(NonEmptyStringSchema),
  sourceUrl: Schema.optional(NonEmptyStringSchema),
  publishedDate: Schema.optional(NonEmptyStringSchema),
});

export const StudioInterventionsEvidenceCoverageSchema = Schema.Struct({
  timelineCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  interventionCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  projectCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sourceGapCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

// The citywide `/interventions` ledger reads only the fields below; the route
// detail surfaces read the full bundle from the per-route artifact instead.
// Narrowing here is not cosmetic: it is what keeps the precomputed citywide
// artifact near 32 MB rather than the 46 MB the full records serialize to.
const InterventionsEvidenceRecordBaseSchema = Schema.Struct({
  recordId: NonEmptyStringSchema,
  citationKeys: CitationKeysSchema,
});

export const StudioInterventionsEvidenceTimelineEventSchema = Schema.Struct({
  ...InterventionsEvidenceRecordBaseSchema.fields,
  ...{
    eventKind: Schema.NullOr(Schema.String),
    eventFamily: Schema.NullOr(Schema.String),
    lifecyclePhase: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    dateText: Schema.NullOr(Schema.String),
    dateNormalized: Schema.NullOr(Schema.String),
  },
});

export const StudioInterventionsEvidenceInterventionSchema = Schema.Struct({
  ...InterventionsEvidenceRecordBaseSchema.fields,
  ...{
    treatmentKind: Schema.NullOr(Schema.String),
    title: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    locations: Schema.Array(Schema.String),
  },
});

export const StudioInterventionsEvidenceProjectSchema = Schema.Struct({
  ...InterventionsEvidenceRecordBaseSchema.fields,
  ...{
    projectName: Schema.NullOr(Schema.String),
    projectType: Schema.NullOr(Schema.String),
    status: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    location: Schema.NullOr(Schema.String),
  },
});

export const StudioInterventionsEvidenceSourceGapSchema = Schema.Struct({
  ...InterventionsEvidenceRecordBaseSchema.fields,
  ...{
    gapKind: Schema.NullOr(Schema.String),
    gapText: Schema.NullOr(Schema.String),
    missingInformation: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
  },
});

export const StudioInterventionsEvidenceBundleSchema = Schema.Struct({
  routeId: NonEmptyStringSchema,
  routeSlug: NonEmptyStringSchema,
  coverage: StudioInterventionsEvidenceCoverageSchema,
  timeline: Schema.Array(StudioInterventionsEvidenceTimelineEventSchema),
  interventions: Schema.Array(StudioInterventionsEvidenceInterventionSchema),
  projects: Schema.Array(StudioInterventionsEvidenceProjectSchema),
  sourceGaps: Schema.Array(StudioInterventionsEvidenceSourceGapSchema),
  citations: Schema.Array(StudioInterventionsEvidenceCitationSchema),
});

export const StudioInterventionsEvidenceResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  bundles: Schema.Array(StudioInterventionsEvidenceBundleSchema),
});

const StudioRouteEvidenceSummarySchema = Schema.Struct({
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  matchedBusRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  unmatchedWikiRouteCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  omittedAmbiguousRecordCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

export const StudioRouteEvidenceArtifactV1Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence.v1"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  source: Schema.Struct({
    kind: Schema.Literal("mta-wiki-canonical-jsonl"),
    mtaWikiRoot: NonEmptyStringSchema,
    canonicalRoot: NonEmptyStringSchema,
  }),
  summary: StudioRouteEvidenceSummarySchema,
  routes: Schema.Array(StudioRouteEvidenceBundleV1Schema),
});

export const StudioRouteEvidenceArtifactV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence.v2"),
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  source: StudioRouteEvidenceSourceV2Schema,
  summary: StudioRouteEvidenceSummarySchema,
  routes: Schema.Array(StudioRouteEvidenceBundleV2Schema),
});

export const StudioRouteEvidenceArtifactSchema = Schema.Union([
  StudioRouteEvidenceArtifactV1Schema,
  StudioRouteEvidenceArtifactV2Schema,
]);

const StudioRouteEvidenceIndexRouteFields = {
  routeId: NonEmptyStringSchema,
  routeSlug: NonEmptyStringSchema,
  wikiRouteRecordId: Schema.NullOr(NonEmptyStringSchema),
  artifactName: Schema.Literal(STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME),
  artifactKey: NonEmptyStringSchema,
  contentType: Schema.Literal(STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE),
  byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Sha256Schema,
  coverage: StudioRouteEvidenceCoverageSchema,
} as const;

export const StudioRouteEvidenceIndexRouteV1Schema = Schema.Struct(
  StudioRouteEvidenceIndexRouteFields,
);

export const StudioRouteEvidenceIndexRouteV2Schema = Schema.Struct({
  ...StudioRouteEvidenceIndexRouteFields,
  bundleSchemaVersion: Schema.Literal(2),
  routeIdentity: StudioRouteIdentityPresentationSchema,
});

const StudioRouteEvidenceIndexSummarySchema = Schema.Struct({
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  matchedBusRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  totalByteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const StudioRouteEvidenceIndexV1Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence_index.v1"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  sourceArtifactKey: NonEmptyStringSchema,
  summary: StudioRouteEvidenceIndexSummarySchema,
  routes: Schema.Array(StudioRouteEvidenceIndexRouteV1Schema),
});

export const StudioRouteEvidenceIndexV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence_index.v2"),
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  sourceArtifactKey: NonEmptyStringSchema,
  source: StudioRouteEvidenceSourceV2Schema,
  summary: StudioRouteEvidenceIndexSummarySchema,
  routes: Schema.Array(StudioRouteEvidenceIndexRouteV2Schema),
});

export const StudioRouteEvidenceIndexSchema = Schema.Union([
  StudioRouteEvidenceIndexV1Schema,
  StudioRouteEvidenceIndexV2Schema,
]);
export const StudioRouteEvidenceIndexRouteSchema = Schema.Union([
  StudioRouteEvidenceIndexRouteV1Schema,
  StudioRouteEvidenceIndexRouteV2Schema,
]);

export function emptyStudioRouteEvidenceBundle(input: {
  routeId: string;
  routeSlug: string;
}): StudioRouteEvidenceBundleV1 {
  return decodeStrict(StudioRouteEvidenceBundleV1Schema)({
    routeId: input.routeId,
    routeSlug: input.routeSlug,
    wikiRouteRecordId: null,
    wikiRouteIds: [],
    wikiAliases: [],
    coverage: {
      timelineCount: 0,
      interventionCount: 0,
      metricClaimCount: 0,
      projectCount: 0,
      sourceGapCount: 0,
      citationCount: 0,
    },
    timeline: [],
    interventions: [],
    metricClaims: [],
    projects: [],
    sourceGaps: [],
    citations: [],
  });
}

/** Project one full route bundle down to what the citywide ledger renders,
 * keeping only the citations its records actually reference. */
export function compactInterventionsEvidenceBundle(
  bundle: StudioRouteEvidenceBundle,
): StudioInterventionsEvidenceBundle {
  const citationKeys = new Set<string>();
  for (const record of [
    ...bundle.timeline,
    ...bundle.interventions,
    ...bundle.projects,
    ...bundle.sourceGaps,
  ]) {
    for (const key of record.citationKeys) citationKeys.add(key);
  }
  const citations = bundle.citations
    .filter((citation) => citationKeys.has(citation.key))
    .map((citation) =>
      decodeStrict(StudioInterventionsEvidenceCitationSchema)({
        key: citation.key,
        sourceId: citation.sourceId,
        ...(citation.pageNumber === undefined ? {} : { pageNumber: citation.pageNumber }),
        ...(citation.sourceTitle === undefined ? {} : { sourceTitle: citation.sourceTitle }),
        ...(citation.publisher === undefined ? {} : { publisher: citation.publisher }),
        ...(citation.sourceUrl === undefined ? {} : { sourceUrl: citation.sourceUrl }),
        ...(citation.publishedDate === undefined ? {} : { publishedDate: citation.publishedDate }),
      }),
    );

  return decodeStrict(StudioInterventionsEvidenceBundleSchema)({
    routeId: bundle.routeId,
    routeSlug: bundle.routeSlug,
    coverage: {
      timelineCount: bundle.coverage.timelineCount,
      interventionCount: bundle.coverage.interventionCount,
      projectCount: bundle.coverage.projectCount,
      sourceGapCount: bundle.coverage.sourceGapCount,
      citationCount: citations.length,
    },
    timeline: bundle.timeline.map((event) => ({
      recordId: event.recordId,
      citationKeys: event.citationKeys,
      eventKind: event.eventKind,
      eventFamily: event.eventFamily,
      lifecyclePhase: event.lifecyclePhase,
      title: event.title,
      description: event.description,
      dateText: event.dateText,
      dateNormalized: event.dateNormalized,
    })),
    interventions: bundle.interventions.map((intervention) => ({
      recordId: intervention.recordId,
      citationKeys: intervention.citationKeys,
      treatmentKind: intervention.treatmentKind,
      title: intervention.title,
      description: intervention.description,
      locations: intervention.locations,
    })),
    projects: bundle.projects.map((project) => ({
      recordId: project.recordId,
      citationKeys: project.citationKeys,
      projectName: project.projectName,
      projectType: project.projectType,
      status: project.status,
      description: project.description,
      location: project.location,
    })),
    sourceGaps: bundle.sourceGaps.map((gap) => ({
      recordId: gap.recordId,
      citationKeys: gap.citationKeys,
      gapKind: gap.gapKind,
      gapText: gap.gapText,
      missingInformation: gap.missingInformation,
      description: gap.description,
    })),
    citations,
  });
}

/** Build the precomputed citywide evidence artifact. This runs offline in the
 * pipeline: assembling it per request meant reading every route bundle (58 MB
 * across 375 objects), which exceeded the Worker resource limit. */
export function buildStudioInterventionsEvidenceArtifact(input: {
  generatedAt: string;
  bundles: readonly StudioRouteEvidenceBundle[];
}): StudioInterventionsEvidenceResponse {
  const bundles = input.bundles
    .toSorted((left, right) => left.routeSlug.localeCompare(right.routeSlug))
    .map((bundle) => compactInterventionsEvidenceBundle(bundle));
  return decodeStrict(StudioInterventionsEvidenceResponseSchema)({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeCount: bundles.length,
    bundles,
  });
}

export type StudioRouteEvidenceCitation = typeof StudioRouteEvidenceCitationSchema.Type;
export type StudioRouteEvidenceTimelineEvent = typeof StudioRouteEvidenceTimelineEventSchema.Type;
export type StudioRouteEvidenceIntervention = typeof StudioRouteEvidenceInterventionSchema.Type;
export type StudioRouteEvidenceMetricClaim = typeof StudioRouteEvidenceMetricClaimSchema.Type;
export type StudioRouteEvidenceProject = typeof StudioRouteEvidenceProjectSchema.Type;
export type StudioRouteEvidenceSourceGap = typeof StudioRouteEvidenceSourceGapSchema.Type;
export type StudioRouteEvidenceCoverage = typeof StudioRouteEvidenceCoverageSchema.Type;
export type StudioRouteEvidenceBinding = typeof StudioRouteEvidenceBindingSchema.Type;
export type StudioRouteCatalogParity = typeof StudioRouteCatalogParitySchema.Type;
export type StudioRouteEvidenceSourceV2 = typeof StudioRouteEvidenceSourceV2Schema.Type;
export type StudioRouteEvidenceBundleV1 = typeof StudioRouteEvidenceBundleV1Schema.Type;
export type StudioRouteEvidenceBundleV2 = typeof StudioRouteEvidenceBundleV2Schema.Type;
export type StudioRouteEvidenceBundle = typeof StudioRouteEvidenceBundleSchema.Type;
export type StudioInterventionsEvidenceCitation =
  typeof StudioInterventionsEvidenceCitationSchema.Type;
export type StudioInterventionsEvidenceCoverage =
  typeof StudioInterventionsEvidenceCoverageSchema.Type;
export type StudioInterventionsEvidenceTimelineEvent =
  typeof StudioInterventionsEvidenceTimelineEventSchema.Type;
export type StudioInterventionsEvidenceIntervention =
  typeof StudioInterventionsEvidenceInterventionSchema.Type;
export type StudioInterventionsEvidenceProject =
  typeof StudioInterventionsEvidenceProjectSchema.Type;
export type StudioInterventionsEvidenceSourceGap =
  typeof StudioInterventionsEvidenceSourceGapSchema.Type;
export type StudioInterventionsEvidenceBundle = typeof StudioInterventionsEvidenceBundleSchema.Type;
export type StudioInterventionsEvidenceResponse =
  typeof StudioInterventionsEvidenceResponseSchema.Type;
export type StudioRouteEvidenceArtifactV1 = typeof StudioRouteEvidenceArtifactV1Schema.Type;
export type StudioRouteEvidenceArtifactV2 = typeof StudioRouteEvidenceArtifactV2Schema.Type;
export type StudioRouteEvidenceArtifact = typeof StudioRouteEvidenceArtifactSchema.Type;
export type StudioRouteEvidenceIndexRouteV1 = typeof StudioRouteEvidenceIndexRouteV1Schema.Type;
export type StudioRouteEvidenceIndexRouteV2 = typeof StudioRouteEvidenceIndexRouteV2Schema.Type;
export type StudioRouteEvidenceIndexRoute = typeof StudioRouteEvidenceIndexRouteSchema.Type;
export type StudioRouteEvidenceIndexV1 = typeof StudioRouteEvidenceIndexV1Schema.Type;
export type StudioRouteEvidenceIndexV2 = typeof StudioRouteEvidenceIndexV2Schema.Type;
export type StudioRouteEvidenceIndex = typeof StudioRouteEvidenceIndexSchema.Type;
