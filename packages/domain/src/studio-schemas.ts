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

const StudioInterventionWindowSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    sampleMonths: z.number().int().nonnegative(),
  })
  .strict();

const StudioInterventionComparisonCohortSchema = z
  .object({
    method: z.string(),
    causalInterpretation: z.string(),
    methodLimitations: z.array(z.string()),
    routeIds: z.array(z.string()),
    routeCount: z.number().int().nonnegative(),
    preWindow: StudioInterventionWindowSchema.nullable(),
    postWindow: StudioInterventionWindowSchema.nullable(),
    routeSpeedDeltaMph: z.number().nullable(),
    comparisonSpeedDeltaMph: z.number().nullable(),
    adjustedSpeedDeltaMph: z.number().nullable(),
    caveat: z.string(),
  })
  .strict();

export const StudioInterventionSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const { year, title, detail, tone, sourceLabel, sourceDetail, comparisonCohort } =
      value as Record<string, unknown>;
    return { year, title, detail, tone, sourceLabel, sourceDetail, comparisonCohort };
  },
  z
    .object({
      year: z.string(),
      title: z.string(),
      detail: z.string(),
      tone: z.enum(["accent", "good", "warn", "bad"]).optional(),
      sourceLabel: z.string().optional(),
      sourceDetail: z.string().optional(),
      comparisonCohort: StudioInterventionComparisonCohortSchema.optional(),
    })
    .strict(),
);

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

export const StudioObservedReliabilitySchema = z
  .object({
    month: z.string(),
    runId: z.string(),
    source: z.enum(["official_self_collected", "third_party_recovered"]),
    releaseLayer: z.enum(["observed_release", "current_signal"]),
    reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]),
    sampleCount: z.number().int().nonnegative(),
    medianObservedHeadwayMinutes: z.number().nullable(),
    p90ObservedHeadwayMinutes: z.number().nullable(),
    observedBunchingShare: z.number().nullable(),
    observedLongGapShare: z.number().nullable(),
    excessWaitMinutes: z.number().nullable(),
    caveats: z.array(z.string()),
  })
  .strict();

function legacyTspCoverage(value: unknown): "yes" | "partial" | "none" {
  if (value === "yes" || value === "partial" || value === "none") return value;
  if (value === "installed") return "yes";
  if (value === "candidate") return "partial";
  return "none";
}

type StudioRouteCompatInput = Record<string, unknown> & {
  dailyRiders?: unknown;
  diagnosis?: unknown;
  endpoints?: unknown;
  label?: unknown;
  speedMph?: unknown;
  termini?: unknown;
  tspCoverage?: unknown;
  tspStatus?: unknown;
};

type StudioSegmentCompatInput = Record<string, unknown> & {
  aiNote?: unknown;
  tsp?: unknown;
  tspStatus?: unknown;
};

function legacyDiagnosis(route: StudioRouteCompatInput): string {
  const { dailyRiders, diagnosis, label: labelValue, speedMph: speedValue } = route;
  if (typeof diagnosis === "string" && diagnosis.length > 0) return diagnosis;
  const label = typeof labelValue === "string" ? labelValue : "This route";
  const speed =
    typeof speedValue === "number"
      ? `${speedValue} mph observed speed`
      : "available observed speed";
  const riders =
    typeof dailyRiders === "number"
      ? `${Math.round(dailyRiders).toLocaleString("en-US")} daily riders`
      : "available ridership";
  return `${label} is summarized from the current Studio release with ${speed} and ${riders}.`;
}

function legacyTermini(route: StudioRouteCompatInput): { north: string; south: string } {
  const { termini } = route;
  if (
    typeof termini === "object" &&
    termini !== null &&
    typeof (termini as { north?: unknown }).north === "string" &&
    typeof (termini as { south?: unknown }).south === "string"
  ) {
    return termini as { north: string; south: string };
  }
  const endpointsValue = route.endpoints;
  const endpoints =
    typeof endpointsValue === "object" && endpointsValue !== null
      ? (endpointsValue as { end?: unknown; start?: unknown })
      : {};
  return {
    north: typeof endpoints.start === "string" ? endpoints.start : "Route start",
    south: typeof endpoints.end === "string" ? endpoints.end : "Route end",
  };
}

export const StudioRouteSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const route = value as StudioRouteCompatInput;
    return {
      ...route,
      tspCoverage: legacyTspCoverage(route.tspCoverage ?? route.tspStatus),
      diagnosis: legacyDiagnosis(route),
      termini: legacyTermini(route),
    };
  },
  z
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
      observedReliability: StudioObservedReliabilitySchema.nullable(),
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
    .strip(),
);

export const StudioSegmentSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const segment = value as StudioSegmentCompatInput;
    const { aiNote } = segment;
    return {
      ...segment,
      tsp: typeof segment.tsp === "boolean" ? segment.tsp : segment.tspStatus === "installed",
      aiNote:
        typeof aiNote === "object" &&
        aiNote !== null &&
        typeof (aiNote as { body?: unknown }).body === "string"
          ? (aiNote as { body: string }).body
          : aiNote,
    };
  },
  z
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
    .strip(),
);

export const StudioRouteArtifactRefSchema = z
  .object({
    routeId: z.string(),
    month: z.string(),
    name: z.string(),
    key: z.string(),
    contentType: z.string(),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string(),
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

export const StudioFindingReviewSchema = z
  .object({
    publicationState: z.enum(["reviewed", "review_candidate", "generated_candidate"]),
    reviewState: z.enum(["approved", "needs_review", "unreviewed"]).nullable(),
    source: z.enum([
      "manual_review",
      "promoted_finding",
      "detector_review_queue",
      "route_score_fallback",
      "agent_proposal",
    ]),
    candidateId: z.string().nullable(),
    detectorId: z.string().nullable(),
    promotedFindingId: z.string().nullable().optional(),
    decisionId: z.string().nullable().optional(),
    packetId: z.string().nullable().optional(),
    approvedEvidenceRefs: z.array(z.string()).optional(),
    reviewRationale: z.string().nullable().optional(),
    decisionHash: z.string().nullable().optional(),
    candidateSnapshotHash: z.string().nullable().optional(),
    promotedFindingHash: z.string().nullable().optional(),
    reviewedAt: z.string().nullable().optional(),
    reviewer: z.string().nullable().optional(),
    claimSafeLabel: z
      .enum([
        "no_issue_clean",
        "issue_clean",
        "issue_needs_review",
        "insufficient_evidence",
        "source_lag_expected",
      ])
      .nullable(),
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
      .strip(),
    comparableRoutes: z.array(ComparableRouteSchema),
    review: StudioFindingReviewSchema.optional(),
  })
  .strict();

export const ClaimEvidenceSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["number", "chart", "source", "caveat"]),
    title: z.string(),
    detail: z.string(),
  })
  .strip();

export const ClaimCaveatSchema = z
  .object({
    title: z.string(),
    body: z.string(),
  })
  .strip();

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

export const StudioClaimSchema = z
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

export const StudioBriefDraftStatusSchema = z.enum([
  "drafting",
  "draft",
  "in_review",
  "approved",
  "publish_candidate",
  "published",
  "archived",
  "retracted",
]);

export const StudioBriefPrimitiveRefSchema = z
  .object({
    role: z.string().min(1),
    kind: z.enum(["block", "evidence", "metric", "artifact", "source"]),
    id: z.string().min(1),
  })
  .strict();

const StudioBriefBlockBaseSchema = z
  .object({
    id: z.string().min(1),
    refs: z.array(StudioBriefPrimitiveRefSchema).default([]),
  })
  .strict();

const StudioBriefToneSchema = z.enum(["neutral", "accent", "good", "warn", "bad"]);

const StudioBriefBlockTypeSchema = z.enum([
  "segment-card",
  "before-after",
  "projection",
  "data-lineage",
  "finding",
  "key-takeaways",
  "mentioned-routes",
  "rich-sub-brief",
  "hour-figure",
]);

const StudioBriefSegmentCardBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("segment-card"),
  title: z.string().min(1),
  routeId: z.string().min(1),
  routeLabel: z.string().min(1),
  direction: z.enum(["NB", "SB", "EB", "WB"]),
  from: z.string().min(1),
  to: z.string().min(1),
  metrics: z
    .object({
      avgSpeedMph: z.number().nullable().optional(),
      scheduledSpeedMph: z.number().nullable().optional(),
      riderHoursLostDaily: z.number().nullable().optional(),
    })
    .strict(),
  treatments: z
    .object({
      busLane: z.enum(["yes", "partial", "minimal", "none", "painted"]).optional(),
      ace: z.boolean().optional(),
      tsp: z.boolean().optional(),
    })
    .strict()
    .optional(),
  spark: z.array(z.number()).optional(),
  note: z.string().nullable().optional(),
}).strict();

const StudioBriefBeforeAfterBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("before-after"),
  intervention: z.string().min(1),
  when: z.string().min(1),
  before: z.number(),
  after: z.number(),
  unit: z.string().min(1),
  delta: z.number(),
  caveat: z.string().optional(),
}).strict();

const StudioBriefProjectionBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("projection"),
  title: z.string().min(1),
  sub: z.string().optional(),
  unit: z.string().min(1),
  scenarios: z.array(
    z
      .object({
        label: z.string().min(1),
        value: z.number(),
        tone: StudioBriefToneSchema.optional(),
      })
      .strict(),
  ),
  target: z.number().nullable().optional(),
}).strict();

const StudioBriefDataLineageBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("data-lineage"),
  metric: z.string().min(1),
  source: z.string().min(1),
  steps: z.array(z.string().min(1)),
  retrievedAt: z.string().nullable().optional(),
  rowCount: z.number().int().nonnegative().nullable().optional(),
}).strict();

const StudioBriefFindingBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("finding"),
  confidence: z.enum(["low", "moderate", "high"]),
  title: z.string().min(1),
  claim: z.string().min(1),
  supports: z.array(z.string().min(1)),
  route: z.string().optional(),
  sbs: z.boolean().optional(),
}).strict();

const StudioBriefKeyTakeawaysBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("key-takeaways"),
  title: z.string().optional(),
  items: z.array(
    z
      .object({
        text: z.string().min(1),
        refs: z.array(StudioBriefPrimitiveRefSchema).default([]),
      })
      .strict(),
  ),
}).strict();

const StudioBriefMentionedRoutesBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("mentioned-routes"),
  routes: z.array(
    z
      .object({
        routeId: z.string().min(1),
        label: z.string().min(1),
        sbs: z.boolean().optional(),
        summary: z.string().optional(),
      })
      .strict(),
  ),
}).strict();

const StudioBriefRichSubBriefBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("rich-sub-brief"),
  title: z.string().min(1),
  sub: z.string().optional(),
  columns: z.array(
    z
      .object({
        title: z.string().min(1),
        bodyMd: z.string(),
      })
      .strict(),
  ),
}).strict();

const StudioBriefHourFigureBlockSchema = StudioBriefBlockBaseSchema.extend({
  type: z.literal("hour-figure"),
  caption: z.string().min(1),
  data: z.array(z.number()),
  sched: z.array(z.number()).optional(),
  height: z.number().int().positive().optional(),
}).strict();

export const StudioBriefBlockSchema = z.discriminatedUnion("type", [
  StudioBriefSegmentCardBlockSchema,
  StudioBriefBeforeAfterBlockSchema,
  StudioBriefProjectionBlockSchema,
  StudioBriefDataLineageBlockSchema,
  StudioBriefFindingBlockSchema,
  StudioBriefKeyTakeawaysBlockSchema,
  StudioBriefMentionedRoutesBlockSchema,
  StudioBriefRichSubBriefBlockSchema,
  StudioBriefHourFigureBlockSchema,
]);

export const StudioBriefRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("block"),
      blockId: z.string().min(1),
      blockType: StudioBriefBlockTypeSchema,
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("evidence"),
      evidenceId: z.string().min(1),
      role: z.enum(["primary", "counter", "caveat", "source"]),
      label: z.string().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("metric"),
      metricId: z.string().min(1),
      sourceEvidenceIds: z.array(z.string().min(1)),
      label: z.string().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("artifact"),
      artifactKey: z.string().min(1),
      artifactType: z.enum(["geojson", "hourly-series", "source-bundle", "export"]),
      publicUrl: z.string().optional(),
      label: z.string().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("source"),
      sourceId: z.string().min(1),
      url: z.string().optional(),
      retrievedAt: z.string().optional(),
      label: z.string().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("unresolved"),
      target: z.string().min(1),
      reason: z.string().optional(),
    })
    .strict(),
]);

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

type StudioBriefCompatInput = Record<string, unknown> & {
  citationCount?: unknown;
  evidenceRefCount?: unknown;
};

export const StudioBriefSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const brief = value as StudioBriefCompatInput;
    return {
      ...brief,
      citationCount:
        typeof brief.citationCount === "number"
          ? brief.citationCount
          : typeof brief.evidenceRefCount === "number"
            ? brief.evidenceRefCount
            : 0,
    };
  },
  z
    .object({
      id: z.string(),
      routeSlug: z.string(),
      title: z.string(),
      status: z.enum(["Published", "Generated", "Draft", "In review"]),
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
      bodyMd: z.string().optional(),
      blocks: z.array(StudioBriefBlockSchema).optional(),
      refs: z.array(StudioBriefRefSchema).optional(),
    })
    .strip(),
);

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
    artifactRefs: z.array(StudioRouteArtifactRefSchema),
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
    draftStatus: StudioBriefDraftStatusSchema.nullable().default(null),
    draftPublishedAt: z.string().nullable().default(null),
  })
  .strict();

const StudioBriefHeadingSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    version: z.string(),
    routeSlug: z.string(),
    routeLabel: z.string(),
    routeSbs: z.boolean(),
  })
  .strict();

export const StudioBriefEvidenceResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    heading: StudioBriefHeadingSchema,
    claims: z.array(StudioClaimSchema),
    evidence: z.array(ClaimEvidenceSchema),
    caveats: z.array(ClaimCaveatSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioBriefHistoryResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    heading: StudioBriefHeadingSchema,
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
  .strip();

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
  .strip();

export const StudioDocsSourceLinkSchema = z
  .object({
    label: z.string(),
    url: z.string(),
  })
  .strict();

export const StudioDocsSourceSchema = z
  .object({
    sourceId: z.string(),
    name: z.string(),
    publisher: z.string(),
    role: z.string(),
    decision: z.string(),
    detectorEligibility: z.string(),
    rowCount: z.number().int().nonnegative(),
    rowLabel: z.string(),
    period: z.string(),
    monthCount: z.number().int().nonnegative().nullable(),
    geocodeRate: z.number().nullable(),
    joinRate: z.number().nullable(),
    primaryEvidenceAllowed: z.boolean(),
    automaticPromotionAllowed: z.boolean(),
    readinessStatus: z.string(),
    readinessReasons: z.array(z.string()),
    sourceLinks: z.array(StudioDocsSourceLinkSchema),
    use: z.string(),
  })
  .strict();

export const StudioDocsSectionSchema = z
  .object({
    title: z.string(),
    body: z.array(z.string()),
    code: z.string().optional(),
  })
  .strict();

export const StudioSpeedPercentileContextSchema = z
  .object({
    metric: z.string(),
    peerUniverse: z.string(),
    peerUniverseLabel: z.string(),
    rank: z.number().int().positive(),
    routeCount: z.number().int().positive(),
    direction: z.string(),
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
  .strip();

export const StudioSnapshotProjectionSchema = z
  .object({
    resource: z.enum(["routes", "findings", "briefs", "methods", "docs"]),
    path: z.string(),
    itemCount: z.number().int().nonnegative(),
    generatedAt: z.string().nullable(),
  })
  .strict();

export const StudioSnapshotResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseId: z.string(),
    projectionPrefix: z.string(),
    releaseKey: z.string(),
    baselineMonth: z.string().nullable(),
    lastBuiltSpeedMonth: z.string().nullable(),
    counts: z
      .object({
        routes: z.number().int().nonnegative(),
        findings: z.number().int().nonnegative(),
        briefs: z.number().int().nonnegative(),
        methods: z.number().int().nonnegative(),
        docsSections: z.number().int().nonnegative(),
        docsEndpoints: z.number().int().nonnegative(),
      })
      .strict(),
    projections: z.array(StudioSnapshotProjectionSchema),
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
    routeArtifacts: z.array(StudioRouteArtifactRefSchema),
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
export const studioBriefEvidenceResponseJsonSchema = toProjectJsonSchema(
  StudioBriefEvidenceResponseSchema,
);
export const studioBriefHistoryResponseJsonSchema = toProjectJsonSchema(
  StudioBriefHistoryResponseSchema,
);
export const studioMethodsResponseJsonSchema = toProjectJsonSchema(StudioMethodsResponseSchema);
export const studioDocsResponseJsonSchema = toProjectJsonSchema(StudioDocsResponseSchema);
export const studioSnapshotResponseJsonSchema = toProjectJsonSchema(StudioSnapshotResponseSchema);
export const studioReleasePayloadJsonSchema = toProjectJsonSchema(StudioReleasePayloadSchema);

export type StudioQuality = z.output<typeof StudioQualitySchema>;
export type StudioObservedReliability = z.output<typeof StudioObservedReliabilitySchema>;
export type StudioInterventionComparisonCohort = z.output<
  typeof StudioInterventionComparisonCohortSchema
>;
export type StudioIntervention = z.output<typeof StudioInterventionSchema>;
export type StudioRoute = z.output<typeof StudioRouteSchema>;
export type ComparableRoute = z.output<typeof ComparableRouteSchema>;
export type ReasoningStep = z.output<typeof ReasoningStepSchema>;
export type StudioFindingReview = z.output<typeof StudioFindingReviewSchema>;
export type ClaimEvidence = z.output<typeof ClaimEvidenceSchema>;
export type ClaimCaveat = z.output<typeof ClaimCaveatSchema>;
export type StudioComment = z.output<typeof StudioCommentSchema>;
export type StudioCommentReply = z.output<typeof StudioCommentReplySchema>;
export type StudioSegment = z.output<typeof StudioSegmentSchema>;
export type StudioRouteArtifactRef = z.output<typeof StudioRouteArtifactRefSchema>;
export type StudioFinding = z.output<typeof StudioFindingSchema>;
export type StudioBrief = z.output<typeof StudioBriefSchema>;
export type StudioBriefBlock = z.output<typeof StudioBriefBlockSchema>;
export type StudioBriefPrimitiveRef = z.output<typeof StudioBriefPrimitiveRefSchema>;
export type StudioBriefRef = z.output<typeof StudioBriefRefSchema>;
export type StudioClaim = z.output<typeof StudioClaimSchema>;
export type StudioBriefDraftStatus = z.output<typeof StudioBriefDraftStatusSchema>;
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
export type StudioBriefEvidenceResponse = z.output<typeof StudioBriefEvidenceResponseSchema>;
export type StudioBriefHistoryResponse = z.output<typeof StudioBriefHistoryResponseSchema>;
export type StudioMethodsResponse = z.output<typeof StudioMethodsResponseSchema>;
export type StudioDocsResponse = z.output<typeof StudioDocsResponseSchema>;
export type StudioSnapshotProjection = z.output<typeof StudioSnapshotProjectionSchema>;
export type StudioSnapshotResponse = z.output<typeof StudioSnapshotResponseSchema>;
export type StudioMethodDataset = z.output<typeof StudioMethodDatasetSchema>;
export type StudioDocsSection = z.output<typeof StudioDocsSectionSchema>;
export type StudioDocsEndpoint = z.output<typeof StudioDocsEndpointSchema>;
export type StudioDocsSource = z.output<typeof StudioDocsSourceSchema>;
export type StudioDocsSourceLink = z.output<typeof StudioDocsSourceLinkSchema>;
export type StudioReleasePayload = z.output<typeof StudioReleasePayloadSchema>;
export type StudioSpeedPercentileContext = z.output<typeof StudioSpeedPercentileContextSchema>;

export type StudioRouteSegmentEvidence = {
  id: string;
  routeSlug: string;
  routeId: string;
  month: string;
  direction: "NB" | "SB" | "EB" | "WB";
  from: string;
  to: string;
  stopOrder: number | null;
  observedSpeedMph: number | null;
  observedTravelTimeMinutes: number | null;
  scheduledMedianTravelTimeMinutes: number | null;
  scheduledSpeedMph: number;
  observedMinusScheduledMinutes: number | null;
  scheduledSampleCount: number | null;
  observedBusTripCount: number | null;
  observationCount: number | null;
  slowWindowPercent: number | null;
  averageRoadDistanceMiles: number | null;
  segmentGeometrySource: "mta_route_shape_timepoint_slice" | "geometry_unavailable";
  segmentGeometryMethod: "timepoint_stop_projection_to_route_shape" | "geometry_unavailable";
  segmentGeometry: unknown;
  ridershipExposure: number | null;
  riderDelayHours: number;
  hourlyPassengerDelay: unknown[];
  stopBoardings: unknown;
  segmentBoardings: unknown;
  lane: "yes" | "partial" | "minimal" | "none";
  laneSource: "dot_bus_lanes_geometry" | "geometry_unavailable";
  laneOverlapShare: number;
  laneMatchedCount: number;
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
  tspStatus: "installed" | "candidate" | "unknown";
  tspSource: "not_in_ingested_tsp_sources" | "nyc_dot_tsp_status_2017";
  tspSourceDate: string | null;
  tspSourceUrl: string | null;
  tspCorridor: string | null;
  tspMatchMethod:
    | "not_matched_in_ingested_sources"
    | "route_label_in_2017_status_snapshot"
    | "segment_endpoint_text_match"
    | "route_level_status_only";
  hotspotScore: number | null;
  riderImpactScore: number | null;
};

export const StudioAiNoteEvidenceKeySchema = z.string().min(1);
export type StudioAiNoteEvidenceKey = z.output<typeof StudioAiNoteEvidenceKeySchema>;

export const StudioAiAnalystNoteSchema = z.object({
  generationMode: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
  primaryEvidence: z.array(StudioAiNoteEvidenceKeySchema),
  caveats: z.array(z.string().min(1)),
  nextChecks: z.array(z.string().min(1)),
  blockedClaims: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"]),
});
export type StudioAiAnalystNote = z.output<typeof StudioAiAnalystNoteSchema>;

export const StudioAiPublicNoteSchema = z.object({
  generationMode: z.string().min(1),
  body: z.string().min(1),
  source: z.string().min(1),
});
export type StudioAiPublicNote = z.output<typeof StudioAiPublicNoteSchema>;

export const StudioBriefPublishCandidateAuditSchema = z
  .object({
    validation: z
      .object({
        score: z.number().int(),
        weakClaims: z.array(z.number().int().positive()),
        missingEvidence: z.array(z.number().int().positive()),
        blockingIssues: z.array(z.string()),
        validatedAt: z.string().min(1),
      })
      .strict(),
    contentHashes: z
      .object({
        bodyMd: z.string().length(64),
        claims: z.array(
          z
            .object({
              claimN: z.number().int().positive(),
              sha256: z.string().length(64),
            })
            .strict(),
        ),
        blocks: z.array(
          z
            .object({
              blockId: z.string().min(1),
              blockType: z.string().min(1),
              sha256: z.string().length(64),
            })
            .strict(),
        ),
      })
      .strict(),
    reviewThreads: z.array(
      z
        .object({
          commentId: z.string().min(1),
          kind: z.enum(["comment", "change-requested", "suggested-edit"]),
          status: z.enum(["open", "resolved", "dismissed"]),
          anchor: z
            .object({
              target: z.enum(["body", "claim", "block", "draft"]),
              targetId: z.string().nullable(),
              quote: z
                .object({
                  exact: z.string(),
                  prefix: z.string().optional(),
                  suffix: z.string().optional(),
                })
                .strict()
                .nullable(),
              range: z
                .object({
                  start: z.number().int().nonnegative(),
                  end: z.number().int().nonnegative(),
                })
                .strict()
                .optional(),
              contentHash: z.string().optional(),
            })
            .strict(),
          suggestion: z
            .object({
              suggestFrom: z.string().min(1),
              suggestTo: z.string(),
            })
            .strict()
            .nullable(),
          replyCount: z.number().int().nonnegative(),
          createdAt: z.string().min(1),
          updatedAt: z.string().min(1),
          resolvedAt: z.string().min(1).nullable(),
          resolvedBy: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type StudioBriefPublishCandidateAudit = z.output<
  typeof StudioBriefPublishCandidateAuditSchema
>;

export const StudioBriefPublishCandidateExportResponseSchema = z.object({
  briefId: z.string().min(1),
  sourceBriefId: z.string().min(1).nullable().optional(),
  candidateId: z.string().min(1),
  artifactKey: z.string().min(1),
  generatedAt: z.string().min(1),
  version: z.string().min(1),
  publishedAt: z.string().min(1),
  brief: StudioBriefSchema,
  route: StudioRouteSchema,
  history: z.object({
    comments: z.array(StudioCommentSchema),
  }),
  audit: StudioBriefPublishCandidateAuditSchema.optional(),
});
export const studioBriefPublishCandidateExportResponseJsonSchema = toProjectJsonSchema(
  StudioBriefPublishCandidateExportResponseSchema,
);
export type StudioBriefPublishCandidateExportResponse = z.output<
  typeof StudioBriefPublishCandidateExportResponseSchema
>;
