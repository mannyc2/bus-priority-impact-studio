import * as z from "zod";
import { StudioRouteSchema } from "../routes/index.js";
import { StudioQualitySchema } from "../shared.js";

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

export const StudioVersionSchema = z
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

export const StudioCommentReplySchema = z
  .object({
    author: z.string(),
    initials: z.string(),
    ago: z.string(),
    body: z.string(),
  })
  .strict();

export const StudioCommentSchema = z
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

export const StudioBriefCardSchema = z
  .object({
    brief: StudioBriefSchema,
    route: StudioRouteSchema,
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
export type StudioBriefPublishCandidateExportResponse = z.output<
  typeof StudioBriefPublishCandidateExportResponseSchema
>;

export type ClaimEvidence = z.output<typeof ClaimEvidenceSchema>;
export type ClaimCaveat = z.output<typeof ClaimCaveatSchema>;
export type StudioVersion = z.output<typeof StudioVersionSchema>;
export type StudioCommentReply = z.output<typeof StudioCommentReplySchema>;
export type StudioComment = z.output<typeof StudioCommentSchema>;
export type StudioClaim = z.output<typeof StudioClaimSchema>;
export type StudioBriefDraftStatus = z.output<typeof StudioBriefDraftStatusSchema>;
export type StudioBriefBlock = z.output<typeof StudioBriefBlockSchema>;
export type StudioBriefPrimitiveRef = z.output<typeof StudioBriefPrimitiveRefSchema>;
export type StudioBriefRef = z.output<typeof StudioBriefRefSchema>;
export type StudioBrief = z.output<typeof StudioBriefSchema>;
export type StudioBriefCard = z.output<typeof StudioBriefCardSchema>;
export type StudioBriefsResponse = z.output<typeof StudioBriefsResponseSchema>;
export type StudioBriefResponse = z.output<typeof StudioBriefResponseSchema>;
export type StudioBriefEvidenceResponse = z.output<typeof StudioBriefEvidenceResponseSchema>;
export type StudioBriefHistoryResponse = z.output<typeof StudioBriefHistoryResponseSchema>;
