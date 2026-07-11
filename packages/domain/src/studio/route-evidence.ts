import { Schema } from "effect";
import { decodeStrict } from "../decode.js";

export const STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME = "route_evidence";
export const STUDIO_ROUTE_EVIDENCE_INDEX_KEY = "studio/v2/wiki/index.json";
export const STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE = "application/json";

export function studioRouteEvidenceBundleKey(routeSlug: string): string {
  return `studio/v2/wiki/routes/${routeSlug}.json`;
}

export const StudioRouteEvidenceCitationSchema = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1)),
  sourceId: Schema.String.check(Schema.isMinLength(1)),
  blockId: Schema.String.check(Schema.isMinLength(1)),
  evidenceId: Schema.String.check(Schema.isMinLength(1)),
  sourcePath: Schema.String.check(Schema.isMinLength(1)),
  pageNumber: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
  textSha256: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  sourceTitle: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  publisher: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  sourceUrl: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  publishedDate: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
});

const CitationKeysSchema = Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1))));

const RouteEvidenceRecordBaseSchema = Schema.Struct({
  recordId: Schema.String.check(Schema.isMinLength(1)),
  recordKind: Schema.String.check(Schema.isMinLength(1)),
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
    projectRecordIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
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

export const StudioRouteEvidenceBundleSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  wikiRouteRecordId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  wikiRouteIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  wikiAliases: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  coverage: StudioRouteEvidenceCoverageSchema,
  timeline: Schema.Array(StudioRouteEvidenceTimelineEventSchema),
  interventions: Schema.Array(StudioRouteEvidenceInterventionSchema),
  metricClaims: Schema.Array(StudioRouteEvidenceMetricClaimSchema),
  projects: Schema.Array(StudioRouteEvidenceProjectSchema),
  sourceGaps: Schema.Array(StudioRouteEvidenceSourceGapSchema),
  citations: Schema.Array(StudioRouteEvidenceCitationSchema),
});

export const StudioInterventionsEvidenceCitationSchema = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1)),
  sourceId: Schema.String.check(Schema.isMinLength(1)),
  pageNumber: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))),
  sourceTitle: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  publisher: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  sourceUrl: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  publishedDate: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
});

export const StudioInterventionsEvidenceCoverageSchema = Schema.Struct({
  timelineCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  interventionCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  projectCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sourceGapCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const StudioInterventionsEvidenceBundleSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  coverage: StudioInterventionsEvidenceCoverageSchema,
  timeline: Schema.Array(StudioRouteEvidenceTimelineEventSchema),
  interventions: Schema.Array(StudioRouteEvidenceInterventionSchema),
  projects: Schema.Array(StudioRouteEvidenceProjectSchema),
  sourceGaps: Schema.Array(StudioRouteEvidenceSourceGapSchema),
  citations: Schema.Array(StudioInterventionsEvidenceCitationSchema),
});

export const StudioInterventionsEvidenceResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  bundles: Schema.Array(StudioInterventionsEvidenceBundleSchema),
});

export const StudioRouteEvidenceArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence.v1"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  source: Schema.Struct({
    kind: Schema.Literal("mta-wiki-canonical-jsonl"),
    mtaWikiRoot: Schema.String.check(Schema.isMinLength(1)),
    canonicalRoot: Schema.String.check(Schema.isMinLength(1)),
  }),
  summary: Schema.Struct({
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    matchedBusRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    unmatchedWikiRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    omittedAmbiguousRecordCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  routes: Schema.Array(StudioRouteEvidenceBundleSchema),
});

export const StudioRouteEvidenceIndexRouteSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  wikiRouteRecordId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  artifactName: Schema.Literal(STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME),
  artifactKey: Schema.String.check(Schema.isMinLength(1)),
  contentType: Schema.Literal(STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE),
  byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Schema.String.check(Schema.isLengthBetween(64, 64)),
  coverage: StudioRouteEvidenceCoverageSchema,
});

export const StudioRouteEvidenceIndexSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_evidence_index.v1"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  sourceArtifactKey: Schema.String.check(Schema.isMinLength(1)),
  summary: Schema.Struct({
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    matchedBusRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    totalByteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  routes: Schema.Array(StudioRouteEvidenceIndexRouteSchema),
});

export function emptyStudioRouteEvidenceBundle(input: {
  routeId: string;
  routeSlug: string;
}): StudioRouteEvidenceBundle {
  return decodeStrict(StudioRouteEvidenceBundleSchema)({
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

export type StudioRouteEvidenceCitation = typeof StudioRouteEvidenceCitationSchema.Type;
export type StudioRouteEvidenceTimelineEvent = typeof StudioRouteEvidenceTimelineEventSchema.Type;
export type StudioRouteEvidenceIntervention = typeof StudioRouteEvidenceInterventionSchema.Type;
export type StudioRouteEvidenceMetricClaim = typeof StudioRouteEvidenceMetricClaimSchema.Type;
export type StudioRouteEvidenceProject = typeof StudioRouteEvidenceProjectSchema.Type;
export type StudioRouteEvidenceSourceGap = typeof StudioRouteEvidenceSourceGapSchema.Type;
export type StudioRouteEvidenceCoverage = typeof StudioRouteEvidenceCoverageSchema.Type;
export type StudioRouteEvidenceBundle = typeof StudioRouteEvidenceBundleSchema.Type;
export type StudioInterventionsEvidenceCitation =
  typeof StudioInterventionsEvidenceCitationSchema.Type;
export type StudioInterventionsEvidenceCoverage =
  typeof StudioInterventionsEvidenceCoverageSchema.Type;
export type StudioInterventionsEvidenceBundle = typeof StudioInterventionsEvidenceBundleSchema.Type;
export type StudioInterventionsEvidenceResponse =
  typeof StudioInterventionsEvidenceResponseSchema.Type;
export type StudioRouteEvidenceArtifact = typeof StudioRouteEvidenceArtifactSchema.Type;
export type StudioRouteEvidenceIndexRoute = typeof StudioRouteEvidenceIndexRouteSchema.Type;
export type StudioRouteEvidenceIndex = typeof StudioRouteEvidenceIndexSchema.Type;
