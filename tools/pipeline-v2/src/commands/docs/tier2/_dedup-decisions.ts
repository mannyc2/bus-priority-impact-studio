// Tier 2 duplicate-decision template + verification step, extracted from the
// former _shared.ts monolith during the per-step decomposition. Emits a
// decision template from the review queue and verifies decision completeness.
// `duplicateDecisionIsComplete` stays in core (shared with load-staging and
// pipeline-status) and is imported here. The core module never imports back.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type BuildTier2DuplicateDecisionTemplateArgs,
  type CliOption,
  type DuplicateDecisionTemplateCliArgs,
  duplicateDecisionIsComplete,
  latestDocsRunId,
  parseCliOptions,
  runArtifactRoot,
  type Tier2DuplicateDecision,
  type Tier2DuplicateDecisionItem,
  type Tier2DuplicateDecisionTemplate,
  type Tier2DuplicateDecisionVerification,
  type Tier2DuplicateReviewItem,
  type Tier2DuplicateReviewQueue,
  type VerifyDuplicateDecisionsCliArgs,
  type VerifyTier2DuplicateDecisionsArgs,
} from "./_shared.ts";

function suggestedDuplicateDecision(item: Tier2DuplicateReviewItem): Tier2DuplicateDecision {
  return item.recommendation === "collapse_single_source_duplicates"
    ? "collapse_to_one_event"
    : "keep_separate_events";
}

export async function buildTier2DuplicateDecisionTemplate(
  args: BuildTier2DuplicateDecisionTemplateArgs,
): Promise<Tier2DuplicateDecisionTemplate> {
  const review = (await Bun.file(args.duplicateReviewPath).json()) as Tier2DuplicateReviewQueue;
  const decisions = review.items.map((item): Tier2DuplicateDecisionItem => {
    const eventIds = item.events.map((event) => event.eventId).toSorted();
    return {
      fingerprint: item.fingerprint,
      currentDecision: "needs_human_review",
      suggestedDecision: suggestedDuplicateDecision(item),
      selectedEventId:
        item.recommendation === "collapse_single_source_duplicates" ? (eventIds[0] ?? null) : null,
      eventIds,
      sourceIds: item.sourceIds,
      routeIds: item.routeIds,
      interventionType: item.interventionType,
      implementationDate: item.implementationDate,
      datePrecision: item.datePrecision,
      reviewer: null,
      reviewedAt: null,
      rationale: item.rationale,
    };
  });
  const template: Tier2DuplicateDecisionTemplate = {
    version: 1,
    runId: review.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    duplicateReviewPath: args.duplicateReviewPath,
    outputPath: args.outputPath ?? null,
    summary: {
      duplicateGroupCount: decisions.length,
      duplicateEventCount: decisions.reduce((sum, item) => sum + item.eventIds.length, 0),
      needsHumanReviewCount: decisions.filter(
        (item) => item.currentDecision === "needs_human_review",
      ).length,
      collapseSuggestedCount: decisions.filter(
        (item) => item.suggestedDecision === "collapse_to_one_event",
      ).length,
      keepSeparateSuggestedCount: decisions.filter(
        (item) => item.suggestedDecision === "keep_separate_events",
      ).length,
    },
    decisions,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, template);
  }

  return template;
}

export async function verifyTier2DuplicateDecisions(
  args: VerifyTier2DuplicateDecisionsArgs,
): Promise<Tier2DuplicateDecisionVerification> {
  const decisions = (await Bun.file(
    args.duplicateDecisionsPath,
  ).json()) as Tier2DuplicateDecisionTemplate;
  const incompleteFingerprints = decisions.decisions
    .filter((item) => !duplicateDecisionIsComplete(item))
    .map((item) => item.fingerprint)
    .toSorted();
  const invalidCollapseSelectionCount = decisions.decisions.filter(
    (item) =>
      item.currentDecision === "collapse_to_one_event" &&
      (item.selectedEventId === null || !item.eventIds.includes(item.selectedEventId)),
  ).length;
  const verification: Tier2DuplicateDecisionVerification = {
    version: 1,
    runId: decisions.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    duplicateDecisionsPath: args.duplicateDecisionsPath,
    outputPath: args.outputPath ?? null,
    complete: incompleteFingerprints.length === 0,
    summary: {
      decisionCount: decisions.decisions.length,
      duplicateEventCount: decisions.decisions.reduce((sum, item) => sum + item.eventIds.length, 0),
      completeDecisionCount: decisions.decisions.length - incompleteFingerprints.length,
      incompleteDecisionCount: incompleteFingerprints.length,
      needsHumanReviewCount: decisions.decisions.filter(
        (item) => item.currentDecision === "needs_human_review",
      ).length,
      collapseDecisionCount: decisions.decisions.filter(
        (item) => item.currentDecision === "collapse_to_one_event",
      ).length,
      keepSeparateDecisionCount: decisions.decisions.filter(
        (item) => item.currentDecision === "keep_separate_events",
      ).length,
      invalidCollapseSelectionCount,
      missingReviewerCount: decisions.decisions.filter(
        (item) => item.reviewer === null || item.reviewer.trim().length === 0,
      ).length,
      missingReviewedAtCount: decisions.decisions.filter(
        (item) => item.reviewedAt === null || item.reviewedAt.trim().length === 0,
      ).length,
      missingRationaleCount: decisions.decisions.filter(
        (item) => item.rationale.trim().length === 0,
      ).length,
    },
    incompleteFingerprints,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, verification);
  }

  return verification;
}

function parseDuplicateDecisionTemplateCliArgs(args: string[]): DuplicateDecisionTemplateCliArgs {
  const options: CliOption<DuplicateDecisionTemplateCliArgs>[] = [
    {
      flags: ["--duplicate-review"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateReviewPath = fromCliPath(value);
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
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveDuplicateDecisionTemplatePaths(
  args: DuplicateDecisionTemplateCliArgs,
): Promise<BuildTier2DuplicateDecisionTemplateArgs> {
  if (args.duplicateReviewPath !== undefined) {
    return {
      duplicateReviewPath: args.duplicateReviewPath,
      outputPath:
        args.outputPath ??
        join(dirname(args.duplicateReviewPath), "tier2-intervention-duplicate-decisions.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --duplicate-review.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    duplicateReviewPath: join(baseDir, "tier2-intervention-duplicate-review.json"),
    outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-decisions.json"),
  };
}

export async function buildTier2DuplicateDecisionTemplateFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2DuplicateDecisionTemplate,
    "version" | "runId" | "generatedAt" | "outputPath" | "summary"
  >
> {
  const template = await buildTier2DuplicateDecisionTemplate(
    await resolveDuplicateDecisionTemplatePaths(parseDuplicateDecisionTemplateCliArgs(args)),
  );
  return {
    version: template.version,
    runId: template.runId,
    generatedAt: template.generatedAt,
    outputPath: template.outputPath,
    summary: template.summary,
  };
}

function parseVerifyDuplicateDecisionsCliArgs(args: string[]): VerifyDuplicateDecisionsCliArgs {
  const options: CliOption<VerifyDuplicateDecisionsCliArgs>[] = [
    {
      flags: ["--duplicate-decisions"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateDecisionsPath = fromCliPath(value);
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
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveVerifyDuplicateDecisionsPaths(
  args: VerifyDuplicateDecisionsCliArgs,
): Promise<VerifyTier2DuplicateDecisionsArgs> {
  if (args.duplicateDecisionsPath !== undefined) {
    return {
      duplicateDecisionsPath: args.duplicateDecisionsPath,
      outputPath:
        args.outputPath ??
        join(
          dirname(args.duplicateDecisionsPath),
          "tier2-intervention-duplicate-decision-verification.json",
        ),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --duplicate-decisions.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    duplicateDecisionsPath: join(baseDir, "tier2-intervention-duplicate-decisions.json"),
    outputPath:
      args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-decision-verification.json"),
  };
}

export async function verifyTier2DuplicateDecisionsFromCli(
  args: string[],
): Promise<
  Pick<
    Tier2DuplicateDecisionVerification,
    "version" | "runId" | "generatedAt" | "outputPath" | "complete" | "summary"
  >
> {
  const verification = await verifyTier2DuplicateDecisions(
    await resolveVerifyDuplicateDecisionsPaths(parseVerifyDuplicateDecisionsCliArgs(args)),
  );
  return {
    version: verification.version,
    runId: verification.runId,
    generatedAt: verification.generatedAt,
    outputPath: verification.outputPath,
    complete: verification.complete,
    summary: verification.summary,
  };
}
