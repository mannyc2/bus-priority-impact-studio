// Tier 2 pipeline-status step, extracted from the former _shared.ts monolith
// during the per-step decomposition. Aggregates artifact presence/state across
// the docs pipeline into a gate-by-gate status report. Imports shared types,
// JSON readers, and path/CLI helpers from the core module; the core module
// never imports back here.
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";
import {
  type BuildTier2PipelineStatusArgs,
  type CliOption,
  candidateBundlePath,
  canonicalInterventionEventsPath,
  followupOcrPlanPath,
  latestDocsRunId,
  type PipelineStatusCliArgs,
  parseCliOptions,
  readJsonArtifactIfExistsForStatus,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type Tier2CandidateBundle,
  type Tier2CanonicalInterventionEventsArtifact,
  type Tier2DuplicateDecisionVerification,
  type Tier2InterventionStagingLoadReport,
  type Tier2OcrPlan,
  type Tier2OcrQualityReview,
  type Tier2PipelineStatusArtifact,
  type Tier2PipelineStatusGate,
} from "./_shared.ts";

type StudioReleaseInterventionForStatus = {
  sourceLabel?: string;
  sourceLinks?: unknown[];
  sourceSpanRefs?: unknown[];
};

type StudioReleaseRouteForStatus = {
  interventions?: StudioReleaseInterventionForStatus[];
};

type StudioReleaseForStatus = {
  routes?: StudioReleaseRouteForStatus[];
};

type FollowupOcrReviewForStatus = {
  path: string;
  review: Tier2OcrQualityReview;
};

function topNFromArtifactName(file: string): number {
  const match = /-top(\d+)\.json$/.exec(file);
  return match === null ? 0 : Number(match[1]);
}

async function latestFollowupOcrReviewForStatus(
  baseDir: string,
): Promise<FollowupOcrReviewForStatus | null> {
  const files = (await readdir(baseDir)).filter((file) =>
    /^followup-ocr-quality-review(?:-top\d+|-full)?\.json$/.test(file),
  );
  const reviews = await Promise.all(
    files.map(async (file): Promise<FollowupOcrReviewForStatus | null> => {
      const path = join(baseDir, file);
      try {
        return { path, review: await readRequiredJsonArtifact<Tier2OcrQualityReview>(path) };
      } catch {
        return null;
      }
    }),
  );
  return (
    reviews
      .flatMap((item) => (item === null ? [] : [item]))
      .toSorted((a, b) => {
        const reviewedDelta =
          b.review.summary.reviewedSourceCount - a.review.summary.reviewedSourceCount;
        if (reviewedDelta !== 0) return reviewedDelta;
        return b.review.summary.ocrCompleteCount - a.review.summary.ocrCompleteCount;
      })[0] ?? null
  );
}

async function latestTopNJsonArtifactForStatus<T>(
  baseDir: string,
  pattern: RegExp,
): Promise<{ path: string; artifact: T } | null> {
  const files = (await readdir(baseDir))
    .filter((file) => pattern.test(file))
    .toSorted((a, b) => topNFromArtifactName(b) - topNFromArtifactName(a));
  for (const file of files) {
    const path = join(baseDir, file);
    try {
      return { path, artifact: await readRequiredJsonArtifact<T>(path) };
    } catch {}
  }
  return null;
}

export async function buildTier2PipelineStatus(
  args: BuildTier2PipelineStatusArgs,
): Promise<Tier2PipelineStatusArtifact> {
  const baseDir = runArtifactRoot(args.artifactRoot, args.runId);
  const [baseBundle, baseCanonical, staging, duplicateVerification, followupPlan, top30Review] =
    await Promise.all([
      readRequiredJsonArtifact<Tier2CandidateBundle>(
        candidateBundlePath(args.artifactRoot, args.runId),
      ),
      readRequiredJsonArtifact<Tier2CanonicalInterventionEventsArtifact>(
        canonicalInterventionEventsPath(args.artifactRoot, args.runId),
      ),
      readRequiredJsonArtifact<Tier2InterventionStagingLoadReport>(
        join(baseDir, "tier2-intervention-staging-load-report.json"),
      ),
      readRequiredJsonArtifact<Tier2DuplicateDecisionVerification>(
        join(baseDir, "tier2-intervention-duplicate-decision-verification.json"),
      ),
      readRequiredJsonArtifact<Tier2OcrPlan>(followupOcrPlanPath(args.artifactRoot, args.runId)),
      readJsonArtifactIfExistsForStatus<Tier2OcrQualityReview>(
        join(baseDir, "followup-ocr-quality-review-top30.json"),
      ),
    ]);
  const bundle =
    (await readJsonArtifactIfExistsForStatus<Tier2CandidateBundle>(
      join(baseDir, "candidate-bundle-combined.json"),
    )) ?? baseBundle;
  const canonical =
    (await readJsonArtifactIfExistsForStatus<Tier2CanonicalInterventionEventsArtifact>(
      join(baseDir, "tier2-intervention-events-combined.json"),
    )) ?? baseCanonical;
  const latestFollowupReview = await latestFollowupOcrReviewForStatus(baseDir);
  const latestFollowupBundle = await latestTopNJsonArtifactForStatus<Tier2CandidateBundle>(
    baseDir,
    /^candidate-bundle-followup-top\d+\.json$/,
  );
  const manualFollowupBundle = await readJsonArtifactIfExistsForStatus<Tier2CandidateBundle>(
    join(baseDir, "candidate-bundle-followup-manual.json"),
  );
  const release = await readRequiredJsonArtifact<StudioReleaseForStatus>(args.studioReleasePath);
  const tier2Rows = (release.routes ?? []).flatMap((route) =>
    (route.interventions ?? []).filter(
      (intervention) => intervention.sourceLabel === "Tier 2 documents",
    ),
  );
  const studioTier2RowsMissingSourceLinks = tier2Rows.filter(
    (intervention) => (intervention.sourceLinks?.length ?? 0) === 0,
  ).length;
  const studioTier2RowsMissingSourceSpanPreviews = tier2Rows.filter(
    (intervention) => (intervention.sourceSpanRefs?.length ?? 0) === 0,
  ).length;
  const summary = {
    sourceCandidateCount: bundle.summary.sourceCandidateCount,
    evidenceCandidateCount: bundle.summary.evidenceCandidateCount,
    canonicalEventCount: canonical.summary.eventCount,
    eligibleTimelineEventCount: staging.summary.eligibleForTimelineCount,
    blockedDuplicateEventCount: staging.summary.blockedDuplicateReviewCount,
    suppressedDuplicateEventCount: staging.summary.suppressedDuplicateCount,
    completeDuplicateDecisionCount: staging.summary.completeDuplicateDecisionCount,
    incompleteDuplicateDecisionCount: staging.summary.incompleteDuplicateDecisionCount,
    duplicateDecisionComplete: duplicateVerification.complete,
    followupOcrPlannedCount: followupPlan.summary.ocrRequiredSourceCount,
    followupOcrTop30CompletedCount: top30Review?.summary.ocrCompleteCount ?? 0,
    followupOcrLatestReviewPath: latestFollowupReview?.path ?? null,
    followupOcrReviewedCount: latestFollowupReview?.review.summary.reviewedSourceCount ?? 0,
    followupOcrCompletedCount: latestFollowupReview?.review.summary.ocrCompleteCount ?? 0,
    followupCandidateBundlePath:
      manualFollowupBundle === null
        ? (latestFollowupBundle?.path ?? null)
        : join(baseDir, "candidate-bundle-followup-manual.json"),
    followupEvidenceCandidateCount:
      manualFollowupBundle?.summary.evidenceCandidateCount ??
      latestFollowupBundle?.artifact.summary.evidenceCandidateCount ??
      0,
    followupUnresolvedOcrSourceCount:
      latestFollowupReview === null
        ? 0
        : (latestFollowupReview.review.summary.unknownQualityCount ?? 0) +
          (latestFollowupReview.review.summary.unknownDecisionCount ?? 0),
    studioTier2TimelineRowCount: tier2Rows.length,
    studioTier2RowsMissingSourceLinks,
    studioTier2RowsMissingSourceSpanPreviews,
  };
  const gates: Tier2PipelineStatusGate[] = [
    {
      gate: "corpus_and_extraction",
      status:
        summary.sourceCandidateCount > 0 && summary.evidenceCandidateCount > 0
          ? "complete"
          : "blocked",
      evidence: `${summary.sourceCandidateCount} source candidates; ${summary.evidenceCandidateCount} evidence candidates.`,
      remaining: null,
    },
    {
      gate: "duplicate_decisions",
      status: summary.duplicateDecisionComplete ? "complete" : "blocked",
      evidence: `${summary.completeDuplicateDecisionCount} duplicate decisions complete; ${summary.incompleteDuplicateDecisionCount} incomplete; ${summary.blockedDuplicateEventCount} events remain blocked; ${summary.suppressedDuplicateEventCount} duplicates suppressed.`,
      remaining: summary.duplicateDecisionComplete
        ? null
        : "Complete and apply tier2-intervention-duplicate-decisions.json.",
    },
    {
      gate: "followup_ocr",
      status: summary.followupUnresolvedOcrSourceCount === 0 ? "complete" : "partial",
      evidence: `${summary.followupOcrCompletedCount} completed follow-up OCR outputs; ${summary.followupOcrReviewedCount} reviewed; ${summary.followupUnresolvedOcrSourceCount} OCR-tail sources unresolved; ${summary.followupEvidenceCandidateCount} follow-up evidence candidates; ${summary.followupOcrPlannedCount} total follow-up ranges planned.`,
      remaining:
        summary.followupUnresolvedOcrSourceCount === 0
          ? null
          : "Unresolved follow-up OCR sources remain.",
    },
    {
      gate: "studio_timeline_affordances",
      status:
        summary.studioTier2TimelineRowCount > 0 &&
        summary.studioTier2RowsMissingSourceLinks === 0 &&
        summary.studioTier2RowsMissingSourceSpanPreviews === 0
          ? "complete"
          : "blocked",
      evidence: `${summary.studioTier2TimelineRowCount} Tier 2 Studio rows; ${summary.studioTier2RowsMissingSourceLinks} missing source links; ${summary.studioTier2RowsMissingSourceSpanPreviews} missing span previews.`,
      remaining: null,
    },
  ];
  const status: Tier2PipelineStatusArtifact = {
    version: 1,
    runId: args.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    outputPath: args.outputPath ?? null,
    complete: gates.every((gate) => gate.status === "complete"),
    summary,
    gates,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, status);
  }

  return status;
}

function parsePipelineStatusCliArgs(args: string[]): PipelineStatusCliArgs {
  const options: CliOption<PipelineStatusCliArgs>[] = [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--studio-release"],
      apply: (output, value) => {
        if (value !== undefined) output.studioReleasePath = fromCliPath(value);
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

async function resolvePipelineStatusPaths(
  args: PipelineStatusCliArgs,
): Promise<BuildTier2PipelineStatusArgs> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    runId,
    artifactRoot,
    studioReleasePath:
      args.studioReleasePath ?? fromRepoRoot("data/artifacts/studio/v1/release.json"),
    outputPath: args.outputPath ?? join(baseDir, "tier2-pipeline-status.json"),
  };
}

export async function buildTier2PipelineStatusFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2PipelineStatusArtifact,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary" | "gates"
  >
> {
  const status = await buildTier2PipelineStatus(
    await resolvePipelineStatusPaths(parsePipelineStatusCliArgs(args)),
  );
  return {
    version: status.version,
    runId: status.runId,
    generatedAt: status.generatedAt,
    outputPath: status.outputPath,
    complete: status.complete,
    summary: status.summary,
    gates: status.gates,
  };
}
