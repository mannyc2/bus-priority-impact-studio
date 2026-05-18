import * as z from "zod";
import { toProjectJsonSchema } from "./schema-registry.js";

export const StudioQualitySchema = z
  .object({
    releaseLayer: z.enum([
      "baseline_release",
      "observed_release",
      "current_signal",
      "pending_publication",
    ]),
    completenessStatus: z.enum([
      "complete",
      "partial_public_monthly_only",
      "missing_realtime",
      "insufficient_samples",
      "source_lag_expected",
      "unavailable",
    ]),
    confidence: z.enum(["high", "medium", "low"]),
    caveats: z.array(z.string()),
  })
  .strict();

const StudioInterventionSchema = z
  .object({
    year: z.string(),
    title: z.string(),
    detail: z.string(),
    tone: z.enum(["accent", "good", "warn", "bad"]).optional(),
  })
  .strict();

export const ComparableRouteSchema = z
  .object({
    slug: z.string(),
    label: z.string(),
    sbs: z.boolean(),
    outcome: z.enum(["reversed", "flat", "declining"]),
    delta: z.string(),
    detail: z.string(),
  })
  .strict();

export const StudioRouteSchema = z
  .object({
    slug: z.string(),
    routeId: z.string(),
    label: z.string(),
    corridor: z.string(),
    corridorFull: z.string(),
    borough: z.string(),
    sbs: z.boolean(),
    speedMph: z.number(),
    scheduledMph: z.number(),
    weightedAvgSpeed: z.number(),
    speedPercentile: z.number(),
    dailyRiders: z.number(),
    ridersYoyPct: z.number(),
    riderHoursLost: z.number(),
    laneCoverage: z.number(),
    aceStatus: z.enum(["active", "none"]),
    aceSince: z.string().nullable(),
    tspCoverage: z.enum(["yes", "partial", "none"]),
    reliability: z.string(),
    diagnosis: z.string(),
    spark: z.array(z.number()),
    termini: z
      .object({
        north: z.string(),
        south: z.string(),
      })
      .strict(),
    miles: z.number(),
    stops: z.number(),
    flags: z.array(z.string()),
    peerSlug: z.string().nullable(),
    interventions: z.array(StudioInterventionSchema),
  })
  .strict();

export const StudioSegmentSchema = z
  .object({
    id: z.string(),
    routeSlug: z.string(),
    direction: z.enum(["NB", "SB", "EB", "WB"]),
    from: z.string(),
    to: z.string(),
    speedMph: z.number(),
    scheduledMph: z.number(),
    riderHours: z.number(),
    lane: z.enum(["yes", "partial", "minimal", "none"]),
    ace: z.boolean(),
    tsp: z.boolean(),
    hours: z.array(z.number()),
    miles: z.number().optional(),
    timepoints: z.number().optional(),
    flagged: z.boolean().optional(),
    aiNote: z.string().optional(),
    suggestedSeeds: z.array(z.string()).optional(),
  })
  .strict();

export const ReasoningStepSchema = z
  .object({
    index: z.number(),
    title: z.string(),
    detail: z.string(),
    source: z.string(),
    tone: z.enum(["accent", "warn", "good"]),
  })
  .strict();

export const StudioFindingSchema = z
  .object({
    id: z.string(),
    category: z.enum(["Anomaly", "Treatment gap", "Emerging risk"]),
    routeSlug: z.string(),
    title: z.string(),
    body: z.string(),
    metric: z.string(),
    confidence: z.enum(["high", "moderate"]),
    borough: z.string(),
    reasoning: z.array(ReasoningStepSchema),
    caveat: z
      .object({
        title: z.string(),
        body: z.string(),
      })
      .strict(),
    comparableRoutes: z.array(ComparableRouteSchema),
  })
  .strict();

export const ClaimEvidenceSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["number", "chart", "source", "caveat"]),
    title: z.string(),
    detail: z.string(),
  })
  .strict();

const ClaimCaveatSchema = z
  .object({
    title: z.string(),
    body: z.string(),
  })
  .strict();

const StudioVersionSchema = z
  .object({
    briefId: z.string(),
    v: z.string(),
    date: z.string(),
    author: z.string(),
    summary: z.string(),
    claimsCount: z.number(),
    citesCount: z.number(),
    caveatsCount: z.number(),
  })
  .strict();

const StudioCommentReplySchema = z
  .object({
    author: z.string(),
    initials: z.string(),
    ago: z.string(),
    body: z.string(),
  })
  .strict();

const StudioCommentSchema = z
  .object({
    id: z.string(),
    briefId: z.string(),
    claimN: z.number(),
    kind: z.enum(["comment", "change-requested"]),
    author: z.string(),
    initials: z.string(),
    ago: z.string(),
    on: z.string(),
    body: z.string(),
    resolved: z.boolean().optional(),
    replies: z.array(StudioCommentReplySchema).optional(),
  })
  .strict();

const StudioClaimSchema = z
  .object({
    n: z.number(),
    title: z.string(),
    body: z.string().optional(),
    strength: z.number(),
    evidenceIds: z.array(z.string()),
    caveatIds: z.array(z.string()),
    state: z.enum(["editing", "weak", "active"]).optional(),
  })
  .strict();

const StudioBriefSectionSchema = z
  .object({
    title: z.string(),
    sub: z.string().optional(),
    body: z.array(z.string()),
    callout: z
      .object({
        variant: z.enum(["warn", "bad", "info"]),
        title: z.string(),
        body: z.string(),
      })
      .strict()
      .optional(),
    figure: z
      .object({
        kind: z.enum(["map", "chart"]),
        label: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();

const StudioBriefKpiSchema = z
  .object({
    label: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    sub: z.string(),
    tone: z.enum(["neutral", "good", "warn", "bad"]),
  })
  .strict();

export const StudioBriefSchema = z
  .object({
    id: z.string(),
    routeSlug: z.string(),
    title: z.string(),
    status: z.enum(["Published", "Draft", "In review"]),
    version: z.string(),
    generated: z.string(),
    authors: z.array(z.string()),
    citationCount: z.number(),
    summary: z.string(),
    dek: z.string(),
    kpis: z.array(StudioBriefKpiSchema),
    sections: z.array(StudioBriefSectionSchema),
    claims: z.array(StudioClaimSchema),
    evidence: z.array(ClaimEvidenceSchema),
    caveats: z.array(ClaimCaveatSchema),
  })
  .strict();

export const StudioFindingCardSchema = z
  .object({
    finding: StudioFindingSchema,
    route: StudioRouteSchema,
  })
  .strict();

export const StudioBriefCardSchema = z
  .object({
    brief: StudioBriefSchema,
    route: StudioRouteSchema,
  })
  .strict();

export const StudioRoutesResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routes: z.array(StudioRouteSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioSearchResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    query: z.string(),
    routes: z.array(StudioRouteSchema),
    findings: z.array(StudioFindingCardSchema),
    briefs: z.array(StudioBriefCardSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioRouteDetailResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    route: StudioRouteSchema,
    peerRoute: StudioRouteSchema.optional(),
    segments: z.array(StudioSegmentSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioRouteLadderResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    route: StudioRouteSchema,
    segments: z.array(StudioSegmentSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioCompareResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routes: z.tuple([StudioRouteSchema, StudioRouteSchema]),
    deltas: z
      .object({
        speedMph: z.number(),
        riderHoursLost: z.number(),
        laneCoverage: z.number(),
      })
      .strict(),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioFindingsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    findings: z.array(StudioFindingCardSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioFindingResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    finding: StudioFindingSchema,
    route: StudioRouteSchema,
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioBriefsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    briefs: z.array(StudioBriefCardSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioBriefResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    brief: StudioBriefSchema,
    route: StudioRouteSchema,
    versions: z.array(StudioVersionSchema),
    comments: z.array(StudioCommentSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioMethodDatasetSchema = z
  .object({
    name: z.string(),
    publisher: z.string(),
    grain: z.string(),
    cadence: z.string(),
  })
  .strict();

export const StudioMethodsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    datasets: z.array(StudioMethodDatasetSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioDocsEndpointSchema = z
  .object({
    method: z.string(),
    path: z.string(),
    body: z.string(),
  })
  .strict();

export const StudioDocsSectionSchema = z
  .object({
    title: z.string(),
    body: z.array(z.string()),
    code: z.string().optional(),
  })
  .strict();

export const StudioDocsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    sections: z.array(StudioDocsSectionSchema),
    endpoints: z.array(StudioDocsEndpointSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioReleasePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    quality: StudioQualitySchema,
    routes: z.array(StudioRouteSchema),
    segments: z.array(StudioSegmentSchema),
    findings: z.array(StudioFindingSchema),
    briefs: z.array(StudioBriefSchema),
    versions: z.array(StudioVersionSchema),
    comments: z.array(StudioCommentSchema),
    methods: z.array(StudioMethodDatasetSchema),
    docsSections: z.array(StudioDocsSectionSchema),
    docsEndpoints: z.array(StudioDocsEndpointSchema),
  })
  .strict();

export const studioRoutesResponseJsonSchema = toProjectJsonSchema(StudioRoutesResponseSchema);
export const studioSearchResponseJsonSchema = toProjectJsonSchema(StudioSearchResponseSchema);
export const studioRouteDetailResponseJsonSchema = toProjectJsonSchema(
  StudioRouteDetailResponseSchema,
);
export const studioRouteLadderResponseJsonSchema = toProjectJsonSchema(
  StudioRouteLadderResponseSchema,
);
export const studioCompareResponseJsonSchema = toProjectJsonSchema(StudioCompareResponseSchema);
export const studioFindingsResponseJsonSchema = toProjectJsonSchema(StudioFindingsResponseSchema);
export const studioFindingResponseJsonSchema = toProjectJsonSchema(StudioFindingResponseSchema);
export const studioBriefsResponseJsonSchema = toProjectJsonSchema(StudioBriefsResponseSchema);
export const studioBriefResponseJsonSchema = toProjectJsonSchema(StudioBriefResponseSchema);
export const studioMethodsResponseJsonSchema = toProjectJsonSchema(StudioMethodsResponseSchema);
export const studioDocsResponseJsonSchema = toProjectJsonSchema(StudioDocsResponseSchema);
export const studioReleasePayloadJsonSchema = toProjectJsonSchema(StudioReleasePayloadSchema);

export type StudioQuality = z.output<typeof StudioQualitySchema>;
export type StudioRoute = z.output<typeof StudioRouteSchema>;
export type StudioIntervention = z.output<typeof StudioInterventionSchema>;
export type ComparableRoute = z.output<typeof ComparableRouteSchema>;
export type ReasoningStep = z.output<typeof ReasoningStepSchema>;
export type ClaimEvidence = z.output<typeof ClaimEvidenceSchema>;
export type StudioComment = z.output<typeof StudioCommentSchema>;
export type StudioCommentReply = z.output<typeof StudioCommentReplySchema>;
export type StudioSegment = z.output<typeof StudioSegmentSchema>;
export type StudioFinding = z.output<typeof StudioFindingSchema>;
export type StudioBrief = z.output<typeof StudioBriefSchema>;
export type StudioFindingCard = z.output<typeof StudioFindingCardSchema>;
export type StudioBriefCard = z.output<typeof StudioBriefCardSchema>;
export type StudioRoutesResponse = z.output<typeof StudioRoutesResponseSchema>;
export type StudioSearchResponse = z.output<typeof StudioSearchResponseSchema>;
export type StudioRouteDetailResponse = z.output<typeof StudioRouteDetailResponseSchema>;
export type StudioRouteLadderResponse = z.output<typeof StudioRouteLadderResponseSchema>;
export type StudioCompareResponse = z.output<typeof StudioCompareResponseSchema>;
export type StudioFindingsResponse = z.output<typeof StudioFindingsResponseSchema>;
export type StudioFindingResponse = z.output<typeof StudioFindingResponseSchema>;
export type StudioBriefsResponse = z.output<typeof StudioBriefsResponseSchema>;
export type StudioBriefResponse = z.output<typeof StudioBriefResponseSchema>;
export type StudioMethodsResponse = z.output<typeof StudioMethodsResponseSchema>;
export type StudioDocsResponse = z.output<typeof StudioDocsResponseSchema>;
export type StudioMethodDataset = z.output<typeof StudioMethodDatasetSchema>;
export type StudioDocsSection = z.output<typeof StudioDocsSectionSchema>;
export type StudioDocsEndpoint = z.output<typeof StudioDocsEndpointSchema>;
export type StudioReleasePayload = z.output<typeof StudioReleasePayloadSchema>;
