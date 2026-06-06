import * as z from "zod";
import { StudioRouteSchema } from "../routes/index.js";
import { ComparableRouteSchema, StudioQualitySchema } from "../shared.js";

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

export const StudioFindingCardSchema = z
  .object({
    finding: StudioFindingSchema,
    route: StudioRouteSchema,
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

export type ReasoningStep = z.output<typeof ReasoningStepSchema>;
export type StudioFindingReview = z.output<typeof StudioFindingReviewSchema>;
export type StudioFinding = z.output<typeof StudioFindingSchema>;
export type StudioFindingCard = z.output<typeof StudioFindingCardSchema>;
export type StudioFindingsResponse = z.output<typeof StudioFindingsResponseSchema>;
export type StudioFindingResponse = z.output<typeof StudioFindingResponseSchema>;
