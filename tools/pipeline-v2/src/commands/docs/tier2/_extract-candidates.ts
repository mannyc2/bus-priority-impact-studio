// Tier 2 candidate-extraction step, extracted from the former _shared.ts
// monolith during the per-step decomposition. Builds the candidate bundle from
// captured sources + OCR markdown candidate extractions and emits the bundle
// artifact. Imports shared types and path/CLI helpers from the core module; the
// core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  candidateBundlePath,
  latestDocsRunId,
  ocrPlanPath,
  ocrQualityReviewPath,
  parseCliOptions,
  type CliOption,
  type ExtractCliArgs,
  type ExtractTier2CandidatesArgs,
  type Tier2CandidateBundle,
  type Tier2CandidateValidationState,
  type Tier2CaptureManifest,
  type Tier2CapturedSource,
  type Tier2DocumentEvidenceCandidate,
  type Tier2DocumentSourceCandidate,
  type Tier2FollowupOcrCandidate,
  type Tier2LlmExtractionAudit,
  type Tier2OcrMarkdownCandidateExtraction,
  type Tier2OcrPlan,
  type Tier2ReviewQuestionCandidate,
} from "./_shared.ts";

function validationSummaryForBundle(bundle: {
  documentSourceCandidates: Tier2DocumentSourceCandidate[];
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
  reviewQuestionCandidates: Tier2ReviewQuestionCandidate[];
  followupOcrCandidates: Tier2FollowupOcrCandidate[];
}): Record<Tier2CandidateValidationState, number> {
  const summary: Record<Tier2CandidateValidationState, number> = {
    unvalidated: 0,
    validated: 0,
    needs_review: 0,
    rejected: 0,
  };
  for (const candidate of [
    ...bundle.documentSourceCandidates,
    ...bundle.documentEvidenceCandidates,
    ...bundle.reviewQuestionCandidates,
    ...bundle.followupOcrCandidates,
  ]) {
    summary[candidate.validationState] += 1;
  }
  return summary;
}

function documentSourceCandidate(source: Tier2CapturedSource): Tier2DocumentSourceCandidate {
  return {
    candidateType: "document_source_candidate",
    candidateId: `document_source:${source.sourceId}`,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    documentDate: source.documentDate,
    retrievedAt: source.retrievedAt,
    captureStatus: source.captureStatus,
    detectedContentType: source.detectedContentType,
    textExtractionStatus: source.textExtractionStatus,
    contentSha256: source.sha256,
    rawArtifactKey: source.rawArtifactKey,
    textArtifactKey: source.textArtifactKey,
    termsNote: source.termsNote,
    validationState: "unvalidated",
  };
}

export async function extractTier2Candidates(
  args: ExtractTier2CandidatesArgs,
): Promise<Tier2CandidateBundle> {
  const plan = (await Bun.file(args.ocrPlanPath).json()) as Tier2OcrPlan;
  const markdownCandidateExtraction = (await Bun.file(
    args.ocrMarkdownCandidateExtractionPath,
  ).json()) as Tier2OcrMarkdownCandidateExtraction;
  const captureManifest = (await Bun.file(plan.captureManifestPath).json()) as Tier2CaptureManifest;

  const documentSourceCandidates = captureManifest.sources.map(documentSourceCandidate);
  const documentEvidenceCandidates = [...markdownCandidateExtraction.documentEvidenceCandidates];
  const reviewQuestionCandidates: Tier2ReviewQuestionCandidate[] = [];
  const followupOcrCandidates: Tier2FollowupOcrCandidate[] = [];

  const partialBundle = {
    documentSourceCandidates,
    documentEvidenceCandidates,
    reviewQuestionCandidates,
    followupOcrCandidates,
  };
  const validationSummary = validationSummaryForBundle(partialBundle);
  const candidateCounts = {
    document_source_candidate: documentSourceCandidates.length,
    document_evidence_candidate: documentEvidenceCandidates.length,
    review_question_candidate: reviewQuestionCandidates.length,
    followup_ocr_candidate: followupOcrCandidates.length,
  };
  const llmExtractionAudits: Tier2LlmExtractionAudit[] = [
    {
      candidateType: "llm_extraction_audit",
      candidateId: `llm_extraction_audit:${plan.runId}:ocr_markdown_candidate_bundle`,
      model: markdownCandidateExtraction.model,
      provider: markdownCandidateExtraction.provider,
      serviceTier: markdownCandidateExtraction.serviceTier,
      extractionMode: "ocr_markdown_candidate_bundle",
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      sourceCount: captureManifest.sources.length,
      candidateCounts,
      validationSummary,
    },
  ];

  const bundle: Tier2CandidateBundle = {
    version: 1,
    runId: plan.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrPlanPath: args.ocrPlanPath,
    outputPath: args.outputPath ?? null,
    summary: {
      sourceCandidateCount: documentSourceCandidates.length,
      evidenceCandidateCount: documentEvidenceCandidates.length,
      reviewQuestionCandidateCount: reviewQuestionCandidates.length,
      followupOcrCandidateCount: followupOcrCandidates.length,
      auditCount: llmExtractionAudits.length,
      unvalidatedCandidateCount: validationSummary.unvalidated,
    },
    documentSourceCandidates,
    documentEvidenceCandidates,
    reviewQuestionCandidates,
    followupOcrCandidates,
    llmExtractionAudits,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, bundle);
  }

  return bundle;
}

async function resolveExtractPaths(args: ExtractCliArgs): Promise<{
  ocrPlanPath: string;
  ocrQualityReviewPath: string;
  ocrMarkdownCandidateExtractionPath: string;
  outputPath: string;
}> {
  if (args.ocrPlanPath !== undefined) {
    if (args.ocrMarkdownCandidateExtractionPath === undefined) {
      throw new Error("--markdown-candidate-extraction is required when --ocr-plan is provided.");
    }
    return {
      ocrPlanPath: args.ocrPlanPath,
      ocrQualityReviewPath:
        args.ocrQualityReviewPath ?? join(dirname(args.ocrPlanPath), "ocr-quality-review.json"),
      ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
      outputPath: args.outputPath ?? join(dirname(args.ocrPlanPath), "candidate-bundle.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }

  if (args.ocrMarkdownCandidateExtractionPath === undefined) {
    throw new Error("--markdown-candidate-extraction is required.");
  }

  return {
    ocrPlanPath: ocrPlanPath(artifactRoot, runId),
    ocrQualityReviewPath: args.ocrQualityReviewPath ?? ocrQualityReviewPath(artifactRoot, runId),
    ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
    outputPath: args.outputPath ?? candidateBundlePath(artifactRoot, runId),
  };
}

function parseExtractCliArgs(args: string[]): ExtractCliArgs {
  const options: CliOption<ExtractCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrPlanPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--ocr-review"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrQualityReviewPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--markdown-candidate-extraction"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrMarkdownCandidateExtractionPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--triage-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.triageRootName = value;
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

export async function extractTier2CandidatesFromCli(args: string[]): Promise<Tier2CandidateBundle> {
  const parsed = parseExtractCliArgs(args);
  const paths = await resolveExtractPaths(parsed);
  return extractTier2Candidates({
    ...paths,
    ...(parsed.triageRootName !== undefined ? { triageRootName: parsed.triageRootName } : {}),
  });
}
