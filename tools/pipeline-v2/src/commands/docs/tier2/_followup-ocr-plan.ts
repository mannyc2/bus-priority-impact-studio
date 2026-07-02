// Tier 2 follow-up OCR-plan step, extracted from the former _shared.ts monolith
// during the per-step decomposition. Builds a targeted OCR plan from
// follow-up-flagged candidates in the candidate bundle. Imports shared types
// and path/CLI helpers from the core module; the core module never imports back
// here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type CliOption,
  candidateBundlePath,
  type FollowupOcrPlanCliArgs,
  followupOcrPlanPath,
  latestDocsRunId,
  type PlanTier2FollowupOcrArgs,
  parseCliOptions,
  type Tier2CandidateBundle,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
} from "./_shared.ts";

export async function planTier2FollowupOcr(args: PlanTier2FollowupOcrArgs): Promise<Tier2OcrPlan> {
  const bundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const basePlan = (await Bun.file(bundle.ocrPlanPath).json()) as Tier2OcrPlan;
  const baseSourcesById = new Map(basePlan.sources.map((source) => [source.sourceId, source]));
  const seen = new Set<string>();
  const followupSources: Tier2OcrPlanSource[] = [];
  const sortedCandidates = [...bundle.followupOcrCandidates].toSorted((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];
    return priorityDelta === 0
      ? a.sourceRef.sourceId.localeCompare(b.sourceRef.sourceId)
      : priorityDelta;
  });

  for (const candidate of sortedCandidates) {
    const baseSource = baseSourcesById.get(candidate.sourceRef.sourceId);
    if (baseSource === undefined) {
      continue;
    }
    const key = `${candidate.sourceRef.sourceId}:${candidate.suggestedPageRange}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    followupSources.push({
      ...baseSource,
      pageRange: candidate.suggestedPageRange,
      reviewState: "triage_ready",
      nextAction:
        "Run docs:ocr with this follow-up plan only after reviewing cost and source priority.",
    });
    if (args.limit !== undefined && followupSources.length >= args.limit) {
      break;
    }
  }

  const totalBytes = followupSources.reduce((sum, source) => sum + source.byteLength, 0);
  const plan: Tier2OcrPlan = {
    version: 1,
    runId: `${bundle.runId}-followup`,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: basePlan.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model: basePlan.model,
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: followupSources.length,
      skippedSourceCount: basePlan.sources.length - followupSources.length,
      totalBytes,
      totalMegabytes: Math.round((totalBytes / 1_000_000) * 100) / 100,
    },
    sources: followupSources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, plan);
  }

  return plan;
}

function parseFollowupOcrPlanCliArgs(args: string[]): FollowupOcrPlanCliArgs {
  const options: CliOption<FollowupOcrPlanCliArgs>[] = [
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
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
      flags: ["--limit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.limit = Number(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveFollowupOcrPlanPaths(
  args: FollowupOcrPlanCliArgs,
): Promise<PlanTier2FollowupOcrArgs> {
  if (args.candidateBundlePath !== undefined) {
    return {
      candidateBundlePath: args.candidateBundlePath,
      outputPath:
        args.outputPath ?? join(dirname(args.candidateBundlePath), "followup-ocr-plan.json"),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --candidate-bundle.");
  }

  return {
    candidateBundlePath: candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? followupOcrPlanPath(artifactRoot, runId),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export async function planTier2FollowupOcrFromCli(args: string[]): Promise<Tier2OcrPlan> {
  return planTier2FollowupOcr(await resolveFollowupOcrPlanPaths(parseFollowupOcrPlanCliArgs(args)));
}
