import * as z from "zod";

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

export type StudioRouteEvidenceCitation = z.output<typeof StudioRouteEvidenceCitationSchema>;
export type StudioRouteEvidenceTimelineEvent = z.output<
  typeof StudioRouteEvidenceTimelineEventSchema
>;
export type StudioRouteEvidenceIntervention = z.output<
  typeof StudioRouteEvidenceInterventionSchema
>;
export type StudioRouteEvidenceMetricClaim = z.output<
  typeof StudioRouteEvidenceMetricClaimSchema
>;
export type StudioRouteEvidenceProject = z.output<typeof StudioRouteEvidenceProjectSchema>;
export type StudioRouteEvidenceSourceGap = z.output<typeof StudioRouteEvidenceSourceGapSchema>;
export type StudioRouteEvidenceCoverage = z.output<typeof StudioRouteEvidenceCoverageSchema>;
export type StudioRouteEvidenceBundle = z.output<typeof StudioRouteEvidenceBundleSchema>;
export type StudioRouteEvidenceArtifact = z.output<typeof StudioRouteEvidenceArtifactSchema>;
