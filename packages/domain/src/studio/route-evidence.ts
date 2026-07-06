import * as z from "../schema-compat.js";

export const STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME = "route_evidence";
export const STUDIO_ROUTE_EVIDENCE_INDEX_KEY = "studio/v2/wiki/index.json";
export const STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE = "application/json";

export function studioRouteEvidenceBundleKey(routeSlug: string): string {
  return `studio/v2/wiki/routes/${routeSlug}.json`;
}

export const StudioRouteEvidenceCitationSchema = z
  .object({
    key: z.string().min(1),
    sourceId: z.string().min(1),
    blockId: z.string().min(1),
    evidenceId: z.string().min(1),
    sourcePath: z.string().min(1),
    pageNumber: z.number().int().positive().optional(),
    textSha256: z.string().min(1).optional(),
    sourceTitle: z.string().min(1).optional(),
    publisher: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional(),
    publishedDate: z.string().min(1).optional(),
  })
  .strict();

const CitationKeysSchema = z.array(z.string().min(1));

const RouteEvidenceRecordBaseSchema = z
  .object({
    recordId: z.string().min(1),
    recordKind: z.string().min(1),
    citationKeys: CitationKeysSchema,
  })
  .strict();

export const StudioRouteEvidenceTimelineEventSchema = RouteEvidenceRecordBaseSchema.extend({
  eventKind: z.string().nullable(),
  eventFamily: z.string().nullable(),
  lifecyclePhase: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  dateText: z.string().nullable(),
  dateNormalized: z.string().nullable(),
  datePrecision: z.string().nullable(),
}).strict();

export const StudioRouteEvidenceInterventionSchema = RouteEvidenceRecordBaseSchema.extend({
  treatmentKind: z.string().nullable(),
  treatmentFamily: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  locations: z.array(z.string()),
  projectRecordIds: z.array(z.string().min(1)),
}).strict();

export const StudioRouteEvidenceMetricClaimSchema = RouteEvidenceRecordBaseSchema.extend({
  metricName: z.string().nullable(),
  rawValue: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  unit: z.string().nullable(),
  period: z.string().nullable(),
  scope: z.string().nullable(),
  description: z.string().nullable(),
}).strict();

export const StudioRouteEvidenceProjectSchema = RouteEvidenceRecordBaseSchema.extend({
  projectName: z.string().nullable(),
  projectFamily: z.string().nullable(),
  projectType: z.string().nullable(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  routesServed: z.array(z.string()),
}).strict();

export const StudioRouteEvidenceSourceGapSchema = RouteEvidenceRecordBaseSchema.extend({
  gapKind: z.string().nullable(),
  gapText: z.string().nullable(),
  missingInformation: z.string().nullable(),
  description: z.string().nullable(),
}).strict();

export const StudioRouteEvidenceCoverageSchema = z
  .object({
    timelineCount: z.number().int().nonnegative(),
    interventionCount: z.number().int().nonnegative(),
    metricClaimCount: z.number().int().nonnegative(),
    projectCount: z.number().int().nonnegative(),
    sourceGapCount: z.number().int().nonnegative(),
    citationCount: z.number().int().nonnegative(),
  })
  .strict();

export const StudioRouteEvidenceBundleSchema = z
  .object({
    routeId: z.string().min(1),
    routeSlug: z.string().min(1),
    wikiRouteRecordId: z.string().min(1).nullable(),
    wikiRouteIds: z.array(z.string().min(1)),
    wikiAliases: z.array(z.string().min(1)),
    coverage: StudioRouteEvidenceCoverageSchema,
    timeline: z.array(StudioRouteEvidenceTimelineEventSchema),
    interventions: z.array(StudioRouteEvidenceInterventionSchema),
    metricClaims: z.array(StudioRouteEvidenceMetricClaimSchema),
    projects: z.array(StudioRouteEvidenceProjectSchema),
    sourceGaps: z.array(StudioRouteEvidenceSourceGapSchema),
    citations: z.array(StudioRouteEvidenceCitationSchema),
  })
  .strict();

export const StudioInterventionsEvidenceCitationSchema = z
  .object({
    key: z.string().min(1),
    sourceId: z.string().min(1),
    pageNumber: z.number().int().positive().optional(),
    sourceTitle: z.string().min(1).optional(),
    publisher: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional(),
    publishedDate: z.string().min(1).optional(),
  })
  .strict();

export const StudioInterventionsEvidenceCoverageSchema = z
  .object({
    timelineCount: z.number().int().nonnegative(),
    interventionCount: z.number().int().nonnegative(),
    projectCount: z.number().int().nonnegative(),
    sourceGapCount: z.number().int().nonnegative(),
    citationCount: z.number().int().nonnegative(),
  })
  .strict();

export const StudioInterventionsEvidenceBundleSchema = z
  .object({
    routeId: z.string().min(1),
    routeSlug: z.string().min(1),
    coverage: StudioInterventionsEvidenceCoverageSchema,
    timeline: z.array(StudioRouteEvidenceTimelineEventSchema),
    interventions: z.array(StudioRouteEvidenceInterventionSchema),
    projects: z.array(StudioRouteEvidenceProjectSchema),
    sourceGaps: z.array(StudioRouteEvidenceSourceGapSchema),
    citations: z.array(StudioInterventionsEvidenceCitationSchema),
  })
  .strict();

export const StudioInterventionsEvidenceResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routeCount: z.number().int().nonnegative(),
    bundles: z.array(StudioInterventionsEvidenceBundleSchema),
  })
  .strict();

export const StudioRouteEvidenceArtifactSchema = z
  .object({
    artifactKind: z.literal("bp.studio.route_evidence.v1"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    source: z
      .object({
        kind: z.literal("mta-wiki-canonical-jsonl"),
        mtaWikiRoot: z.string().min(1),
        canonicalRoot: z.string().min(1),
      })
      .strict(),
    summary: z
      .object({
        routeCount: z.number().int().nonnegative(),
        matchedBusRouteCount: z.number().int().nonnegative(),
        unmatchedWikiRouteCount: z.number().int().nonnegative(),
        citationCount: z.number().int().nonnegative(),
        omittedAmbiguousRecordCount: z.number().int().nonnegative(),
      })
      .strict(),
    routes: z.array(StudioRouteEvidenceBundleSchema),
  })
  .strict();

export const StudioRouteEvidenceIndexRouteSchema = z
  .object({
    routeId: z.string().min(1),
    routeSlug: z.string().min(1),
    wikiRouteRecordId: z.string().min(1).nullable(),
    artifactName: z.literal(STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME),
    artifactKey: z.string().min(1),
    contentType: z.literal(STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string().length(64),
    coverage: StudioRouteEvidenceCoverageSchema,
  })
  .strict();

export const StudioRouteEvidenceIndexSchema = z
  .object({
    artifactKind: z.literal("bp.studio.route_evidence_index.v1"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    sourceArtifactKey: z.string().min(1),
    summary: z
      .object({
        routeCount: z.number().int().nonnegative(),
        matchedBusRouteCount: z.number().int().nonnegative(),
        citationCount: z.number().int().nonnegative(),
        totalByteLength: z.number().int().nonnegative(),
      })
      .strict(),
    routes: z.array(StudioRouteEvidenceIndexRouteSchema),
  })
  .strict();

export function emptyStudioRouteEvidenceBundle(input: {
  routeId: string;
  routeSlug: string;
}): StudioRouteEvidenceBundle {
  return StudioRouteEvidenceBundleSchema.parse({
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

export type StudioRouteEvidenceCitation = z.output<typeof StudioRouteEvidenceCitationSchema>;
export type StudioRouteEvidenceTimelineEvent = z.output<
  typeof StudioRouteEvidenceTimelineEventSchema
>;
export type StudioRouteEvidenceIntervention = z.output<
  typeof StudioRouteEvidenceInterventionSchema
>;
export type StudioRouteEvidenceMetricClaim = z.output<typeof StudioRouteEvidenceMetricClaimSchema>;
export type StudioRouteEvidenceProject = z.output<typeof StudioRouteEvidenceProjectSchema>;
export type StudioRouteEvidenceSourceGap = z.output<typeof StudioRouteEvidenceSourceGapSchema>;
export type StudioRouteEvidenceCoverage = z.output<typeof StudioRouteEvidenceCoverageSchema>;
export type StudioRouteEvidenceBundle = z.output<typeof StudioRouteEvidenceBundleSchema>;
export type StudioInterventionsEvidenceCitation = z.output<
  typeof StudioInterventionsEvidenceCitationSchema
>;
export type StudioInterventionsEvidenceCoverage = z.output<
  typeof StudioInterventionsEvidenceCoverageSchema
>;
export type StudioInterventionsEvidenceBundle = z.output<
  typeof StudioInterventionsEvidenceBundleSchema
>;
export type StudioInterventionsEvidenceResponse = z.output<
  typeof StudioInterventionsEvidenceResponseSchema
>;
export type StudioRouteEvidenceArtifact = z.output<typeof StudioRouteEvidenceArtifactSchema>;
export type StudioRouteEvidenceIndexRoute = z.output<typeof StudioRouteEvidenceIndexRouteSchema>;
export type StudioRouteEvidenceIndex = z.output<typeof StudioRouteEvidenceIndexSchema>;
