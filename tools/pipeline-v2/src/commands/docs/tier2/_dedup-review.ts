// Tier 2 duplicate-review-queue step, extracted from the former _shared.ts
// monolith during the per-step decomposition. Turns the duplicate audit into a
// human-review queue with recommendations. Imports shared types and path/CLI
// helpers from the core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  candidateBundlePath,
  canonicalInterventionEventsPath,
  latestDocsRunId,
  parseCliOptions,
  runArtifactRoot,
  type BuildTier2DuplicateReviewQueueArgs,
  type CliOption,
  type DuplicateReviewCliArgs,
  type Tier2CandidateBundle,
  type Tier2CanonicalInterventionEventsArtifact,
  type Tier2DuplicateReviewEvent,
  type Tier2DuplicateReviewQueue,
  type Tier2DuplicateReviewRecommendation,
  type Tier2InterventionDuplicateAudit,
  type Tier2InterventionDuplicateGroup,
} from "./_shared.ts";

function duplicateReviewRecommendation(group: Tier2InterventionDuplicateGroup): {
  recommendation: Tier2DuplicateReviewRecommendation;
  rationale: string;
} {
  if (group.sourceIds.length === 1) {
    return {
      recommendation: "collapse_single_source_duplicates",
      rationale:
        "All duplicate candidates share one source, implementation date, intervention type, and route set; review likely synonym/phrase variants before choosing one canonical event.",
    };
  }
  return {
    recommendation: "compare_multi_source_duplicates",
    rationale:
      "Duplicate candidates share implementation date, intervention type, and route set across multiple sources; compare source spans before deciding whether to merge or keep separate events.",
  };
}

export async function buildTier2DuplicateReviewQueue(
  args: BuildTier2DuplicateReviewQueueArgs,
): Promise<Tier2DuplicateReviewQueue> {
  const [canonical, duplicateAudit, bundle] = (await Promise.all([
    Bun.file(args.canonicalEventsPath).json(),
    Bun.file(args.duplicateAuditPath).json(),
    Bun.file(args.candidateBundlePath).json(),
  ])) as [
    Tier2CanonicalInterventionEventsArtifact,
    Tier2InterventionDuplicateAudit,
    Tier2CandidateBundle,
  ];
  const eventsById = new Map(canonical.events.map((event) => [event.eventId, event]));
  const evidenceByCandidateId = new Map(
    bundle.documentEvidenceCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const sourcesById = new Map(
    bundle.documentSourceCandidates.map((source) => [source.sourceId, source]),
  );
  const duplicateGroups = duplicateAudit.groups.filter(
    (group) => group.reviewState === "duplicate_candidate",
  );
  const items = duplicateGroups
    .map((group) => {
      const { recommendation, rationale } = duplicateReviewRecommendation(group);
      const events = group.eventIds.flatMap((eventId): Tier2DuplicateReviewEvent[] => {
        const event = eventsById.get(eventId);
        if (event === undefined) {
          throw new Error(`Duplicate review references unknown event ${eventId}`);
        }
        const evidence = evidenceByCandidateId.get(event.candidateId);
        const source = sourcesById.get(event.sourceId);
        return [
          {
            eventId: event.eventId,
            candidateId: event.candidateId,
            sourceId: event.sourceId,
            sourceTitle: source?.title ?? evidence?.sourceRef.title ?? null,
            sourceUrl: source?.sourceUrl ?? evidence?.sourceRef.sourceUrl ?? null,
            routeIds: event.routeIds,
            interventionType: event.interventionType,
            implementationDate: event.implementationDate,
            datePrecision: event.datePrecision,
            sourceSpanChunkIds: event.sourceSpanChunkIds,
            routeMentions: evidence?.routeMentions ?? [],
            corridorMentions: evidence?.corridorMentions ?? [],
            dateMentions: [],
            interventionFamily: null,
          },
        ];
      });
      return {
        fingerprint: group.fingerprint,
        recommendation,
        rationale,
        interventionType: group.interventionType,
        implementationDate: group.implementationDate,
        datePrecision: group.datePrecision,
        routeIds: group.routeIds,
        eventCount: group.eventIds.length,
        candidateCount: group.candidateIds.length,
        sourceCount: group.sourceIds.length,
        sourceIds: group.sourceIds,
        events,
      };
    })
    .toSorted((a, b) => {
      const recommendationDelta = a.recommendation.localeCompare(b.recommendation);
      if (recommendationDelta !== 0) return recommendationDelta;
      return a.fingerprint.localeCompare(b.fingerprint);
    });
  const queue: Tier2DuplicateReviewQueue = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    duplicateAuditPath: args.duplicateAuditPath,
    candidateBundlePath: args.candidateBundlePath,
    outputPath: args.outputPath ?? null,
    summary: {
      duplicateGroupCount: items.length,
      duplicateEventCount: items.reduce((sum, item) => sum + item.eventCount, 0),
      singleSourceGroupCount: items.filter(
        (item) => item.recommendation === "collapse_single_source_duplicates",
      ).length,
      multiSourceGroupCount: items.filter(
        (item) => item.recommendation === "compare_multi_source_duplicates",
      ).length,
    },
    items,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, queue);
  }

  return queue;
}

function parseDuplicateReviewCliArgs(args: string[]): DuplicateReviewCliArgs {
  const options: CliOption<DuplicateReviewCliArgs>[] = [
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.canonicalEventsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--duplicate-audit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateAuditPath = fromCliPath(value);
        }
      },
    },
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
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveDuplicateReviewPaths(
  args: DuplicateReviewCliArgs,
): Promise<BuildTier2DuplicateReviewQueueArgs> {
  if (args.canonicalEventsPath !== undefined) {
    const baseDir = dirname(args.canonicalEventsPath);
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      duplicateAuditPath:
        args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
      candidateBundlePath: args.candidateBundlePath ?? join(baseDir, "candidate-bundle.json"),
      outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-review.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    duplicateAuditPath:
      args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
    candidateBundlePath: args.candidateBundlePath ?? candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-duplicate-review.json"),
  };
}

export async function buildTier2DuplicateReviewQueueFromCli(
  args: string[],
): Promise<
  Pick<Tier2DuplicateReviewQueue, "version" | "runId" | "generatedAt" | "outputPath" | "summary">
> {
  const queue = await buildTier2DuplicateReviewQueue(
    await resolveDuplicateReviewPaths(parseDuplicateReviewCliArgs(args)),
  );
  return {
    version: queue.version,
    runId: queue.runId,
    generatedAt: queue.generatedAt,
    outputPath: queue.outputPath,
    summary: queue.summary,
  };
}
