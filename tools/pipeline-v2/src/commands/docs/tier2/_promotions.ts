// Tier 2 promotion + studio-projection step, extracted from the former
// _shared.ts monolith during the per-step decomposition. Imports shared
// infrastructure (CLI parsing, path/IO helpers) from the core module; the core
// module never imports back here, keeping the DAG acyclic.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DocumentInterventionRecordKind } from "@bp/domain/documents/intervention-records";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import { type CliOption, parseCliOptions } from "./_shared.ts";

// ---------------------------------------------------------------------------
// Promotion step: reviewed Phase 3 v3 + manual review file -> publishable
// intervention staging artifact (JSON-only, no D1 changes).
//
// Splits records into two serving layers based on manual-review dispositions:
//   publish_candidate       -> canonical_milestone layer
//   planned_layer_candidate -> planned_or_proposed layer
// Records dispositioned needs_manual_curation, supporting_evidence_only, or
// (no longer present in v3) reject_pipeline_issue are excluded with counts.
//
// Evidence previews are embedded inline (first 1-2 evidenceQuote strings from
// the v5 candidate corpus) so the artifact is directly auditable without a
// second lookup.
// ---------------------------------------------------------------------------

export type PromotePublishableInterventionsArgs = {
  reviewedCorpusPath: string;
  manualReviewPath: string;
  candidateCorpusPath: string;
  outputPath?: string;
  generatedAt?: string;
  evidencePreviewLimit?: number;
};

const PROMOTION_DISPOSITION_TO_LAYER = {
  publish_candidate: "canonical_milestone",
  planned_layer_candidate: "planned_or_proposed",
} as const;

type PromotionDisposition = keyof typeof PROMOTION_DISPOSITION_TO_LAYER;
type PromotionLayer = (typeof PROMOTION_DISPOSITION_TO_LAYER)[PromotionDisposition];

export type PromotedInterventionStatus = "implemented" | "planned" | "proposed";

export type PromotionEvidencePreview = {
  candidateId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  quote: string;
};

export type PromotedIntervention = {
  recordId: string;
  sourceId: string;
  disposition: PromotionDisposition;
  timelineLayer: PromotionLayer;
  status: PromotedInterventionStatus;
  recordKind: DocumentInterventionRecordKind;
  routes: string[];
  serviceMode: string | null;
  primaryTreatments: string[];
  customTreatments: string[];
  corridor: Record<string, unknown> | null;
  effectiveDate: string | null;
  datePrecision: "day" | "month" | "year" | null;
  statusHistory: unknown[];
  treatmentComponents: unknown[];
  metrics: unknown[];
  caveats: unknown[];
  evidenceCandidateIds: string[];
  evidencePreviews: PromotionEvidencePreview[];
  review: {
    disposition: PromotionDisposition;
    confidence: string | null;
    rationale: string | null;
    issueTags: string[];
  };
};

export type PromotionConflictReport = {
  recordId: string;
  disposition: PromotionDisposition;
  recordKind: DocumentInterventionRecordKind;
  resolvedStatus: PromotedInterventionStatus;
};

export type PromotionArtifact = {
  version: 1;
  generatedAt: string;
  reviewedCorpusPath: string;
  manualReviewPath: string;
  candidateCorpusPath: string;
  outputPath: string | null;
  summary: {
    reviewedRecordCount: number;
    manualReviewCount: number;
    publishableTotal: number;
    publishableByLayer: Record<PromotionLayer, number>;
    publishableByStatus: Record<PromotedInterventionStatus, number>;
    publishableSourceCount: number;
    publishableRouteCount: number;
    excludedByDisposition: Record<string, number>;
    recordsWithoutReview: string[];
    dispositionVsRecordKindConflicts: PromotionConflictReport[];
  };
  publishableInterventions: PromotedIntervention[];
};

type ReviewedCorpusFile = {
  documentInterventionRecords?: Array<Record<string, unknown>>;
};

type ManualReviewFile = {
  reviews?: Array<{
    recordId: string;
    sourceId?: string;
    disposition: string;
    confidence?: string | null;
    rationale?: string | null;
    issueTags?: string[];
  }>;
};

type V5CandidateCorpusFile = {
  documentEvidenceCandidates?: Array<{
    candidateId: string;
    evidenceQuote: string;
    sourceRef?: {
      title?: string;
      sourceUrl?: string;
    };
  }>;
};

// Map the Phase 3 `recordKind` enum (implemented | in_progress | proposed) and
// manual-review disposition to the studio-facing status enum. The disposition
// is the human verdict; recordKind is the model verdict. Disagreement is
// logged in dispositionVsRecordKindConflicts so the conflicts surface.
function deriveStatus(
  disposition: PromotionDisposition,
  recordKind: DocumentInterventionRecordKind,
): { status: PromotedInterventionStatus; conflict: boolean } {
  if (disposition === "publish_candidate") {
    if (recordKind === "implemented") return { status: "implemented", conflict: false };
    if (recordKind === "in_progress") return { status: "implemented", conflict: false };
    return { status: "implemented", conflict: true };
  }
  // planned_layer_candidate
  if (recordKind === "proposed") return { status: "proposed", conflict: false };
  if (recordKind === "in_progress") return { status: "planned", conflict: false };
  return { status: "planned", conflict: true };
}

export async function promotePublishableInterventions(
  args: PromotePublishableInterventionsArgs,
): Promise<PromotionArtifact> {
  const reviewed = (await Bun.file(args.reviewedCorpusPath).json()) as ReviewedCorpusFile;
  const manualReview = (await Bun.file(args.manualReviewPath).json()) as ManualReviewFile;
  const candidateCorpus = (await Bun.file(
    args.candidateCorpusPath,
  ).json()) as V5CandidateCorpusFile;

  const records = reviewed.documentInterventionRecords ?? [];
  const reviews = manualReview.reviews ?? [];
  const reviewByRecordId = new Map(reviews.map((review) => [review.recordId, review]));
  const candidateById = new Map(
    (candidateCorpus.documentEvidenceCandidates ?? []).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );

  const previewLimit = args.evidencePreviewLimit ?? 2;
  const excludedByDisposition: Record<string, number> = {};
  const recordsWithoutReview: string[] = [];
  const conflicts: PromotionConflictReport[] = [];
  const publishable: PromotedIntervention[] = [];

  for (const raw of records) {
    const recordId = raw["recordId"] as string;
    const review = reviewByRecordId.get(recordId);
    if (review === undefined) {
      recordsWithoutReview.push(recordId);
      continue;
    }
    const disposition = review.disposition;
    if (!(disposition in PROMOTION_DISPOSITION_TO_LAYER)) {
      excludedByDisposition[disposition] = (excludedByDisposition[disposition] ?? 0) + 1;
      continue;
    }
    const promotionDisposition = disposition as PromotionDisposition;
    const recordKind = raw["recordKind"] as DocumentInterventionRecordKind;
    const { status, conflict } = deriveStatus(promotionDisposition, recordKind);
    if (conflict) {
      conflicts.push({
        recordId,
        disposition: promotionDisposition,
        recordKind,
        resolvedStatus: status,
      });
    }

    const evidenceCandidateIds = Array.isArray(raw["evidenceCandidateIds"])
      ? (raw["evidenceCandidateIds"] as string[])
      : [];
    const evidencePreviews: PromotionEvidencePreview[] = [];
    for (const candidateId of evidenceCandidateIds.slice(0, previewLimit)) {
      const candidate = candidateById.get(candidateId);
      if (candidate === undefined) continue;
      evidencePreviews.push({
        candidateId,
        sourceLabel: candidate.sourceRef?.title ?? (raw["sourceId"] as string),
        sourceUrl: candidate.sourceRef?.sourceUrl ?? null,
        quote: candidate.evidenceQuote,
      });
    }

    publishable.push({
      recordId,
      sourceId: raw["sourceId"] as string,
      disposition: promotionDisposition,
      timelineLayer: PROMOTION_DISPOSITION_TO_LAYER[promotionDisposition],
      status,
      recordKind,
      routes: (raw["routes"] as string[] | undefined) ?? [],
      serviceMode: (raw["serviceMode"] as string | undefined) ?? null,
      primaryTreatments: (raw["primaryTreatments"] as string[] | undefined) ?? [],
      customTreatments: (raw["customTreatments"] as string[] | undefined) ?? [],
      corridor: (raw["corridor"] as Record<string, unknown> | undefined) ?? null,
      effectiveDate: (raw["effectiveDate"] as string | undefined) ?? null,
      datePrecision: (raw["datePrecision"] as "day" | "month" | "year" | undefined) ?? null,
      statusHistory: (raw["statusHistory"] as unknown[] | undefined) ?? [],
      treatmentComponents: (raw["treatmentComponents"] as unknown[] | undefined) ?? [],
      metrics: (raw["metrics"] as unknown[] | undefined) ?? [],
      caveats: (raw["caveats"] as unknown[] | undefined) ?? [],
      evidenceCandidateIds,
      evidencePreviews,
      review: {
        disposition: promotionDisposition,
        confidence: review.confidence ?? null,
        rationale: review.rationale ?? null,
        issueTags: review.issueTags ?? [],
      },
    });
  }

  const publishableByLayer: Record<PromotionLayer, number> = {
    canonical_milestone: 0,
    planned_or_proposed: 0,
  };
  const publishableByStatus: Record<PromotedInterventionStatus, number> = {
    implemented: 0,
    planned: 0,
    proposed: 0,
  };
  const sourceSet = new Set<string>();
  const routeSet = new Set<string>();
  for (const intervention of publishable) {
    publishableByLayer[intervention.timelineLayer] += 1;
    publishableByStatus[intervention.status] += 1;
    sourceSet.add(intervention.sourceId);
    for (const route of intervention.routes) routeSet.add(route);
  }

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const outputPath =
    args.outputPath ?? join(dirname(args.reviewedCorpusPath), "intervention-publishable-v1.json");

  const artifact: PromotionArtifact = {
    version: 1,
    generatedAt,
    reviewedCorpusPath: args.reviewedCorpusPath,
    manualReviewPath: args.manualReviewPath,
    candidateCorpusPath: args.candidateCorpusPath,
    outputPath,
    summary: {
      reviewedRecordCount: records.length,
      manualReviewCount: reviews.length,
      publishableTotal: publishable.length,
      publishableByLayer,
      publishableByStatus,
      publishableSourceCount: sourceSet.size,
      publishableRouteCount: routeSet.size,
      excludedByDisposition,
      recordsWithoutReview,
      dispositionVsRecordKindConflicts: conflicts,
    },
    publishableInterventions: publishable,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  return artifact;
}

type PromotePublishableInterventionsCliArgs = {
  reviewedCorpusPath?: string;
  manualReviewPath?: string;
  candidateCorpusPath?: string;
  outputPath?: string;
  evidencePreviewLimit?: number;
};

function parsePromotePublishableInterventionsCliArgs(
  args: string[],
): PromotePublishableInterventionsCliArgs {
  const options: CliOption<PromotePublishableInterventionsCliArgs>[] = [
    {
      flags: ["--reviewed-corpus"],
      apply: (output, value) => {
        if (value !== undefined) output.reviewedCorpusPath = fromCliPath(value);
      },
    },
    {
      flags: ["--manual-review"],
      apply: (output, value) => {
        if (value !== undefined) output.manualReviewPath = fromCliPath(value);
      },
    },
    {
      flags: ["--candidate-corpus"],
      apply: (output, value) => {
        if (value !== undefined) output.candidateCorpusPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--evidence-preview-limit"],
      apply: (output, value) => {
        if (value !== undefined) output.evidencePreviewLimit = Number(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

// ---------------------------------------------------------------------------
// Studio projection: intervention-publishable-v1.json -> per-route
// StudioIntervention[] map, ready for the studio release builder to attach
// as RouteScorecard.interventions[] entries.
//
// Mirrors buildStudioInterventionFromManualCandidate in
// tools/pipeline/src/jobs/build/studio-release.ts so a follow-up wiring
// change in that file can read the projected JSON and merge with the
// existing manual-interventions index.
// ---------------------------------------------------------------------------

export type StudioInterventionShape = {
  candidateId?: string;
  timelineLayer?:
    | "canonical_milestone"
    | "treatment_component"
    | "planned_or_proposed"
    | "evaluation";
  qualityTier?:
    | "canonical_milestone"
    | "implemented_treatment_component"
    | "planned_or_proposed"
    | "historical_context"
    | "supporting_duplicate"
    | "defer";
  status?: "implemented" | "planned" | "proposed" | "historical_context" | "defer";
  interventionType?: string;
  year: string;
  title: string;
  detail: string;
  tone?: "accent" | "good" | "warn" | "bad";
  sourceLabel?: string;
  sourceDetail?: string;
  sourceLinks?: Array<{ label: string; url: string }>;
};

export type StudioInterventionsByRoute = Record<string, StudioInterventionShape[]>;

export type ProjectPublishableInterventionsArtifact = {
  version: 1;
  generatedAt: string;
  publishableArtifactPath: string;
  outputPath: string | null;
  summary: {
    publishableRecordCount: number;
    projectedInterventionEntryCount: number;
    routeCount: number;
    droppedNoRoutesCount: number;
  };
  interventionsByRoute: StudioInterventionsByRoute;
};

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectionRouteKey(routeId: string): string {
  return routeId.toUpperCase().replace(/\+$/u, "");
}

function deriveTitle(record: PromotedIntervention, routeId?: string): string {
  const treatment = record.primaryTreatments[0] ?? record.customTreatments[0];
  if (routeId !== undefined && record.routes.length > 1) {
    if (treatment !== undefined) return `${titleCase(treatment)} — ${projectionRouteKey(routeId)}`;
    return `Bus priority intervention — ${projectionRouteKey(routeId)}`;
  }
  const street = (record.corridor?.["streets"] as string[] | undefined)?.[0];
  if (treatment !== undefined && street !== undefined) {
    return `${titleCase(treatment)} on ${street}`;
  }
  if (treatment !== undefined && record.routes.length > 0) {
    return `${titleCase(treatment)} — ${record.routes.join(", ")}`;
  }
  if (street !== undefined) {
    return `Bus priority on ${street}`;
  }
  if (record.routes.length > 0) {
    return `Bus priority intervention — ${record.routes.join(", ")}`;
  }
  return "Bus priority intervention";
}

function deriveDetail(record: PromotedIntervention): string {
  const components = record.treatmentComponents as Array<{ description?: string }>;
  if (Array.isArray(components) && components.length === 1) {
    const description = components[0]?.description;
    if (typeof description === "string" && description.length > 0) return description;
  }
  if (Array.isArray(components) && components.length > 1) {
    return `${components.length.toLocaleString("en-US")} curated treatment components`;
  }
  if (record.evidencePreviews.length > 0) {
    return record.evidencePreviews[0]!.quote;
  }
  return record.primaryTreatments.map(titleCase).join(", ") || "Bus priority intervention";
}

function deriveTone(status: PromotedInterventionStatus): "good" | "warn" {
  return status === "implemented" ? "good" : "warn";
}

function deriveQualityTier(layer: PromotionLayer): "canonical_milestone" | "planned_or_proposed" {
  return layer;
}

function deriveSourceLinks(record: PromotedIntervention): Array<{ label: string; url: string }> {
  const byUrl = new Map<string, { label: string; url: string }>();
  for (const preview of record.evidencePreviews) {
    if (preview.sourceUrl === null || preview.sourceUrl.length === 0) continue;
    if (byUrl.has(preview.sourceUrl)) continue;
    byUrl.set(preview.sourceUrl, {
      label: preview.sourceLabel,
      url: preview.sourceUrl,
    });
  }
  return [...byUrl.values()].toSorted(
    (left, right) => left.label.localeCompare(right.label) || left.url.localeCompare(right.url),
  );
}

function deriveYear(record: PromotedIntervention): string {
  if (record.effectiveDate === null || record.effectiveDate.length === 0) {
    return "date unknown";
  }
  return record.effectiveDate;
}

export function projectPublishableInterventionToStudio(
  record: PromotedIntervention,
  routeId?: string,
): StudioInterventionShape {
  const sourceLinks = deriveSourceLinks(record);
  const evidenceCount = record.evidencePreviews.length;
  return {
    candidateId: record.recordId,
    timelineLayer: record.timelineLayer,
    qualityTier: deriveQualityTier(record.timelineLayer),
    status: record.status,
    ...(record.primaryTreatments[0] !== undefined
      ? { interventionType: record.primaryTreatments[0] }
      : {}),
    year: deriveYear(record),
    title: deriveTitle(record, routeId),
    detail: deriveDetail(record),
    tone: deriveTone(record.status),
    sourceLabel: record.evidencePreviews[0]?.sourceLabel ?? `Source: ${record.sourceId}`,
    sourceDetail: `${evidenceCount.toLocaleString("en-US")} evidence preview${
      evidenceCount === 1 ? "" : "s"
    } from ${record.sourceId}`,
    ...(sourceLinks.length > 0 ? { sourceLinks } : {}),
  };
}

export type ProjectPublishableInterventionsArgs = {
  publishableArtifactPath: string;
  outputPath?: string;
  generatedAt?: string;
};

export async function projectPublishableInterventions(
  args: ProjectPublishableInterventionsArgs,
): Promise<ProjectPublishableInterventionsArtifact> {
  const publishable = (await Bun.file(args.publishableArtifactPath).json()) as PromotionArtifact;
  const interventionsByRoute: StudioInterventionsByRoute = {};
  let projectedInterventionEntryCount = 0;
  let droppedNoRoutesCount = 0;

  for (const record of publishable.publishableInterventions) {
    if (record.routes.length === 0) {
      droppedNoRoutesCount += 1;
      continue;
    }
    for (const routeId of record.routes) {
      const key = projectionRouteKey(routeId);
      const projected = projectPublishableInterventionToStudio(record, routeId);
      const group = interventionsByRoute[key] ?? [];
      group.push(projected);
      interventionsByRoute[key] = group;
      projectedInterventionEntryCount += 1;
    }
  }

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const outputPath =
    args.outputPath ??
    join(dirname(args.publishableArtifactPath), "intervention-publishable-v1-by-route.json");
  const artifact: ProjectPublishableInterventionsArtifact = {
    version: 1,
    generatedAt,
    publishableArtifactPath: args.publishableArtifactPath,
    outputPath,
    summary: {
      publishableRecordCount: publishable.publishableInterventions.length,
      projectedInterventionEntryCount,
      routeCount: Object.keys(interventionsByRoute).length,
      droppedNoRoutesCount,
    },
    interventionsByRoute,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  return artifact;
}

type ProjectPublishableInterventionsCliArgs = {
  publishableArtifactPath?: string;
  outputPath?: string;
};

function parseProjectPublishableInterventionsCliArgs(
  args: string[],
): ProjectPublishableInterventionsCliArgs {
  const options: CliOption<ProjectPublishableInterventionsCliArgs>[] = [
    {
      flags: ["--publishable"],
      apply: (output, value) => {
        if (value !== undefined) output.publishableArtifactPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

export async function projectPublishableInterventionsFromCli(
  args: string[],
): Promise<ProjectPublishableInterventionsArtifact> {
  const parsed = parseProjectPublishableInterventionsCliArgs(args);
  if (parsed.publishableArtifactPath === undefined) {
    throw new Error("--publishable is required.");
  }
  return projectPublishableInterventions({
    publishableArtifactPath: parsed.publishableArtifactPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
  });
}

export async function promotePublishableInterventionsFromCli(
  args: string[],
): Promise<PromotionArtifact> {
  const parsed = parsePromotePublishableInterventionsCliArgs(args);
  if (parsed.reviewedCorpusPath === undefined) {
    throw new Error("--reviewed-corpus is required.");
  }
  if (parsed.manualReviewPath === undefined) {
    throw new Error("--manual-review is required.");
  }
  if (parsed.candidateCorpusPath === undefined) {
    throw new Error("--candidate-corpus is required.");
  }
  return promotePublishableInterventions({
    reviewedCorpusPath: parsed.reviewedCorpusPath,
    manualReviewPath: parsed.manualReviewPath,
    candidateCorpusPath: parsed.candidateCorpusPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
    ...(parsed.evidencePreviewLimit !== undefined
      ? { evidencePreviewLimit: parsed.evidencePreviewLimit }
      : {}),
  });
}
