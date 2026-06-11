// Tier 2 intervention-staging load step, extracted from the former _shared.ts
// monolith during the per-step decomposition. Projects canonical events +
// duplicate decisions into per-event promotion states and replaces the local
// staging rows. `duplicateDecisionIsComplete` stays in core (shared) and is
// imported here. The core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { replaceTier2InterventionStagingRows } from "@bp/db/local";
import { defaultLocalPipelineDbPath } from "../../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  candidateBundlePath,
  canonicalInterventionEventsPath,
  duplicateDecisionIsComplete,
  interventionDuplicateAuditPath,
  latestDocsRunId,
  parseCliOptions,
  runArtifactRoot,
  withLocalPipelineDb,
  type CliOption,
  type LoadStagingCliArgs,
  type LoadTier2InterventionStagingArgs,
  type Tier2CandidateBundle,
  type Tier2CanonicalInterventionEventsArtifact,
  type Tier2DuplicateDecisionItem,
  type Tier2DuplicateDecisionTemplate,
  type Tier2InterventionDuplicateAudit,
  type Tier2InterventionDuplicateGroup,
  type Tier2InterventionPromotionState,
  type Tier2InterventionStagingLoadReport,
} from "./_shared.ts";

function duplicateGroupsByEventId(
  audit: Tier2InterventionDuplicateAudit,
): Map<string, Tier2InterventionDuplicateGroup> {
  const byEventId = new Map<string, Tier2InterventionDuplicateGroup>();
  for (const group of audit.groups) {
    for (const eventId of group.eventIds) {
      byEventId.set(eventId, group);
    }
  }
  return byEventId;
}

function promotionStateForDuplicateDecision(
  eventId: string,
  duplicateGroup: Tier2InterventionDuplicateGroup,
  decisionsByFingerprint: Map<string, Tier2DuplicateDecisionItem>,
): Tier2InterventionPromotionState {
  if (duplicateGroup.reviewState === "unique") {
    return "eligible_for_timeline";
  }
  const decision = decisionsByFingerprint.get(duplicateGroup.fingerprint);
  if (decision === undefined || !duplicateDecisionIsComplete(decision)) {
    return "blocked_duplicate_review";
  }
  if (decision.currentDecision === "keep_separate_events") {
    return "eligible_for_timeline";
  }
  return decision.selectedEventId === eventId ? "eligible_for_timeline" : "suppressed_duplicate";
}

export async function loadTier2InterventionStaging(
  args: LoadTier2InterventionStagingArgs,
): Promise<Tier2InterventionStagingLoadReport> {
  const canonical = (await Bun.file(
    args.canonicalEventsPath,
  ).json()) as Tier2CanonicalInterventionEventsArtifact;
  const duplicateAudit = (await Bun.file(
    args.duplicateAuditPath,
  ).json()) as Tier2InterventionDuplicateAudit;
  const candidateBundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const duplicateDecisions =
    args.duplicateDecisionsPath === undefined
      ? null
      : ((await Bun.file(args.duplicateDecisionsPath).json()) as Tier2DuplicateDecisionTemplate);
  const sourcesById = new Map(
    candidateBundle.documentSourceCandidates.map((source) => [source.sourceId, source]),
  );
  const duplicateByEventId = duplicateGroupsByEventId(duplicateAudit);
  const decisionsByFingerprint = new Map(
    (duplicateDecisions?.decisions ?? []).map((decision) => [decision.fingerprint, decision]),
  );
  const completeDuplicateDecisionCount = (duplicateDecisions?.decisions ?? []).filter((decision) =>
    duplicateDecisionIsComplete(decision),
  ).length;
  const incompleteDuplicateDecisionCount =
    (duplicateDecisions?.decisions.length ?? 0) - completeDuplicateDecisionCount;

  const events = canonical.events.map((event) => {
    const duplicateGroup = duplicateByEventId.get(event.eventId);
    if (duplicateGroup === undefined) {
      throw new Error(`Missing duplicate audit group for Tier 2 event ${event.eventId}`);
    }
    const promotionState = promotionStateForDuplicateDecision(
      event.eventId,
      duplicateGroup,
      decisionsByFingerprint,
    );
    return {
      eventId: event.eventId,
      candidateId: event.candidateId,
      sourceId: event.sourceId,
      sourceTitle: sourcesById.get(event.sourceId)?.title ?? null,
      sourceUrl: sourcesById.get(event.sourceId)?.sourceUrl ?? null,
      interventionType: event.interventionType,
      implementationDate: event.implementationDate,
      implementationMonth: event.implementationMonth,
      datePrecision: event.datePrecision,
      eventStatus: event.eventStatus,
      validationState: event.validationState,
      duplicateReviewState: duplicateGroup.reviewState,
      duplicateFingerprint: duplicateGroup.fingerprint,
      promotionState,
    };
  });
  const routes = canonical.events.flatMap((event) =>
    event.routeIds.map((routeId) => ({
      eventId: event.eventId,
      routeId,
    })),
  );
  const sourceSpans = canonical.events.flatMap((event) =>
    event.sourceSpanChunkIds.map((chunkId, index) => ({
      eventId: event.eventId,
      chunkRank: index + 1,
      chunkId,
    })),
  );

  await withLocalPipelineDb(args.dbPath, (local) =>
    replaceTier2InterventionStagingRows(local.db, {
      events,
      routes,
      sourceSpans,
    }),
  );

  const report: Tier2InterventionStagingLoadReport = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    duplicateAuditPath: args.duplicateAuditPath,
    candidateBundlePath: args.candidateBundlePath,
    duplicateDecisionsPath: args.duplicateDecisionsPath ?? null,
    dbPath: args.dbPath,
    outputPath: args.outputPath ?? null,
    summary: {
      eventCount: events.length,
      routeEventCount: routes.length,
      sourceSpanCount: sourceSpans.length,
      eligibleForTimelineCount: events.filter(
        (event) => event.promotionState === "eligible_for_timeline",
      ).length,
      blockedDuplicateReviewCount: events.filter(
        (event) => event.promotionState === "blocked_duplicate_review",
      ).length,
      suppressedDuplicateCount: events.filter(
        (event) => event.promotionState === "suppressed_duplicate",
      ).length,
      completeDuplicateDecisionCount,
      incompleteDuplicateDecisionCount,
    },
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, report);
  }

  return report;
}

function parseLoadStagingCliArgs(args: string[]): LoadStagingCliArgs {
  const options: CliOption<LoadStagingCliArgs>[] = [
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
      flags: ["--duplicate-decisions"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.duplicateDecisionsPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--db"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.dbPath = fromCliPath(value);
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

async function resolveLoadStagingPaths(
  args: LoadStagingCliArgs,
): Promise<LoadTier2InterventionStagingArgs> {
  if (args.canonicalEventsPath !== undefined) {
    const baseDir = dirname(args.canonicalEventsPath);
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      duplicateAuditPath:
        args.duplicateAuditPath ?? join(baseDir, "tier2-intervention-duplicate-audit.json"),
      candidateBundlePath: args.candidateBundlePath ?? join(baseDir, "candidate-bundle.json"),
      duplicateDecisionsPath:
        args.duplicateDecisionsPath ?? join(baseDir, "tier2-intervention-duplicate-decisions.json"),
      dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
      outputPath: args.outputPath ?? join(baseDir, "tier2-intervention-staging-load-report.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }

  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    duplicateAuditPath:
      args.duplicateAuditPath ?? interventionDuplicateAuditPath(artifactRoot, runId),
    candidateBundlePath: args.candidateBundlePath ?? candidateBundlePath(artifactRoot, runId),
    duplicateDecisionsPath:
      args.duplicateDecisionsPath ??
      join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-duplicate-decisions.json"),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
    outputPath:
      args.outputPath ??
      join(runArtifactRoot(artifactRoot, runId), "tier2-intervention-staging-load-report.json"),
  };
}

export async function loadTier2InterventionStagingFromCli(
  args: string[],
): Promise<Tier2InterventionStagingLoadReport> {
  return loadTier2InterventionStaging(await resolveLoadStagingPaths(parseLoadStagingCliArgs(args)));
}
