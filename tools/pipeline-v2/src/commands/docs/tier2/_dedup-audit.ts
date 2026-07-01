// Tier 2 intervention-duplicate audit step, extracted from the former
// _shared.ts monolith during the per-step decomposition. Fingerprints canonical
// intervention events, clusters duplicates, and emits the duplicate-audit
// artifact. Imports shared types and path/CLI helpers from the core module; the
// core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type AuditTier2InterventionDuplicatesArgs,
  type CliOption,
  canonicalInterventionEventsPath,
  type DuplicateAuditCliArgs,
  interventionDuplicateAuditPath,
  latestDocsRunId,
  parseCliOptions,
  type Tier2CanonicalInterventionEvent,
  type Tier2CanonicalInterventionEventsArtifact,
  type Tier2InterventionDuplicateAudit,
  type Tier2InterventionDuplicateGroup,
} from "./_shared.ts";

function duplicateFingerprint(event: Tier2CanonicalInterventionEvent): string {
  return [
    event.interventionType,
    event.implementationDate,
    event.datePrecision,
    event.routeIds.toSorted().join(","),
  ].join("|");
}

function duplicateGroupForEvents(
  fingerprint: string,
  events: Tier2CanonicalInterventionEvent[],
): Tier2InterventionDuplicateGroup {
  const first = events[0];
  if (first === undefined) {
    throw new Error("Cannot build duplicate group for empty event list.");
  }
  return {
    fingerprint,
    reviewState: events.length > 1 ? "duplicate_candidate" : "unique",
    interventionType: first.interventionType,
    implementationDate: first.implementationDate,
    datePrecision: first.datePrecision,
    routeIds: [...new Set(events.flatMap((event) => event.routeIds))].toSorted(),
    eventIds: events.map((event) => event.eventId).toSorted(),
    candidateIds: events.map((event) => event.candidateId).toSorted(),
    sourceIds: [...new Set(events.map((event) => event.sourceId))].toSorted(),
    sourceSpanChunkIds: [
      ...new Set(events.flatMap((event) => event.sourceSpanChunkIds)),
    ].toSorted(),
  };
}

export async function auditTier2InterventionDuplicates(
  args: AuditTier2InterventionDuplicatesArgs,
): Promise<Tier2InterventionDuplicateAudit> {
  const canonical = (await Bun.file(
    args.canonicalEventsPath,
  ).json()) as Tier2CanonicalInterventionEventsArtifact;
  const byFingerprint = new Map<string, Tier2CanonicalInterventionEvent[]>();
  for (const event of canonical.events) {
    const fingerprint = duplicateFingerprint(event);
    const group = byFingerprint.get(fingerprint) ?? [];
    group.push(event);
    byFingerprint.set(fingerprint, group);
  }

  const groups = [...byFingerprint.entries()]
    .map(([fingerprint, events]) => duplicateGroupForEvents(fingerprint, events))
    .toSorted((a, b) => {
      const reviewDelta = a.reviewState.localeCompare(b.reviewState);
      if (reviewDelta !== 0) {
        return reviewDelta;
      }
      return a.fingerprint.localeCompare(b.fingerprint);
    });
  const duplicateGroups = groups.filter((group) => group.reviewState === "duplicate_candidate");
  const duplicateEventCount = duplicateGroups.reduce(
    (sum, group) => sum + group.eventIds.length,
    0,
  );
  const audit: Tier2InterventionDuplicateAudit = {
    version: 1,
    runId: canonical.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    canonicalEventsPath: args.canonicalEventsPath,
    outputPath: args.outputPath ?? null,
    summary: {
      eventCount: canonical.events.length,
      fingerprintCount: groups.length,
      duplicateGroupCount: duplicateGroups.length,
      duplicateEventCount,
      uniqueEventCount: canonical.events.length - duplicateEventCount,
      eventsNeedingReviewCount: duplicateEventCount,
    },
    groups,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, audit);
  }

  return audit;
}

function parseDuplicateAuditCliArgs(args: string[]): DuplicateAuditCliArgs {
  const options: CliOption<DuplicateAuditCliArgs>[] = [
    {
      flags: ["--canonical-events"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.canonicalEventsPath = fromCliPath(value);
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

async function resolveDuplicateAuditPaths(
  args: DuplicateAuditCliArgs,
): Promise<AuditTier2InterventionDuplicatesArgs> {
  if (args.canonicalEventsPath !== undefined) {
    return {
      canonicalEventsPath: args.canonicalEventsPath,
      outputPath:
        args.outputPath ??
        join(dirname(args.canonicalEventsPath), "tier2-intervention-duplicate-audit.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --canonical-events.");
  }

  return {
    canonicalEventsPath: canonicalInterventionEventsPath(artifactRoot, runId),
    outputPath: args.outputPath ?? interventionDuplicateAuditPath(artifactRoot, runId),
  };
}

export async function auditTier2InterventionDuplicatesFromCli(
  args: string[],
): Promise<Tier2InterventionDuplicateAudit> {
  return auditTier2InterventionDuplicates(
    await resolveDuplicateAuditPaths(parseDuplicateAuditCliArgs(args)),
  );
}
