import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import type { Tier2RouteTimelineBundleArtifact } from "./_route-timeline-bundle.ts";

const ARTIFACT_KIND = "bp.tier2_route_timeline_bundle_index.v1";
const SUMMARY_KIND = "bp.tier2_route_timeline_bundle_index_summary.v1";

type TimelineSupportLevel =
  | "timeline_ready"
  | "timeline_sparse"
  | "timeline_review_only"
  | "invalid";

type TimelineIndexDefaultEvent = {
  eventId: string;
  displayDate: string;
  title: string;
  layer: string;
  status: string;
  confidence: string;
  sourceCount: number;
  dateAssertionRefCount: number;
  suggestedWindowStatus: string;
};

type TimelineIndexRouteRow = {
  routeId: string;
  supportLevel: TimelineSupportLevel;
  qualityFlags: string[];
  bundlePath: string;
  generatedAt: string;
  eventCount: number;
  defaultEventCount: number;
  secondaryEventCount: number;
  reviewOnlyEventCount: number;
  sourceBackedEventCount: number;
  dateAssertionBackedEventCount: number;
  unresolvedDateEventCount: number;
  lowConfidenceEventCount: number;
  unaccountedCandidateCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  totalTokens: number | null;
  defaultEvents: TimelineIndexDefaultEvent[];
};

export type Tier2RouteTimelineBundleIndexArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  bundleCount: number;
  summary: {
    routeCount: number;
    timelineReadyCount: number;
    timelineSparseCount: number;
    timelineReviewOnlyCount: number;
    invalidCount: number;
    defaultEventCount: number;
    eventCount: number;
    unresolvedDateEventCount: number;
    validationErrorCount: number;
    validationWarningCount: number;
    totalTokens: number | null;
  };
  routeRows: TimelineIndexRouteRow[];
};

export type BuildRouteTimelineBundleIndexArgs = {
  bundlePaths: string[];
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
};

type CliArgs = Partial<BuildRouteTimelineBundleIndexArgs>;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function defaultOutputPath(): string {
  return join(
    fromCliPath("data/artifacts/docs/agentic-runs-20260604/route-timeline-index-v1-20260606"),
    "route-timeline-bundle-index.json",
  );
}

function defaultPath(outputPath: string, suffix: string): string {
  return outputPath.replace(/\.json$/, suffix);
}

function numberFromUsage(value: unknown): number | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const totalTokens = (value as Record<string, unknown>)["total_tokens"];
  return typeof totalTokens === "number" && Number.isFinite(totalTokens) ? totalTokens : null;
}

function supportLevelFor(bundle: Tier2RouteTimelineBundleArtifact): TimelineSupportLevel {
  if (bundle.summary.validationErrorCount > 0 || bundle.summary.validationWarningCount > 0) {
    return "invalid";
  }
  if (bundle.summary.defaultEventCount >= 3) return "timeline_ready";
  if (bundle.summary.defaultEventCount >= 1) return "timeline_sparse";
  return "timeline_review_only";
}

function qualityFlagsFor(bundle: Tier2RouteTimelineBundleArtifact): string[] {
  const flags: string[] = [];
  if (bundle.summary.validationErrorCount > 0) flags.push("validation_errors");
  if (bundle.summary.validationWarningCount > 0) flags.push("validation_warnings");
  if (bundle.summary.defaultEventCount < 3) flags.push("low_default_event_count");
  if (bundle.summary.unresolvedDateEventCount > 0) flags.push("has_unresolved_dates");
  if (bundle.summary.reviewOnlyEventCount > bundle.summary.defaultEventCount * 2) {
    flags.push("review_heavy");
  }
  if (bundle.summary.lowConfidenceEventCount > 0) flags.push("has_low_confidence_events");
  if (bundle.summary.unaccountedCandidateCount > 0) flags.push("has_unaccounted_tail");
  if (bundle.summary.legacyDateEventCount > 0) flags.push("legacy_model_dates");
  return uniqueSorted(flags);
}

function rowForBundle(input: {
  bundle: Tier2RouteTimelineBundleArtifact;
  bundlePath: string;
}): TimelineIndexRouteRow {
  const totalTokens = numberFromUsage(input.bundle.summary.usage);
  return {
    routeId: input.bundle.routeId,
    supportLevel: supportLevelFor(input.bundle),
    qualityFlags: qualityFlagsFor(input.bundle),
    bundlePath: input.bundlePath,
    generatedAt: input.bundle.generatedAt,
    eventCount: input.bundle.summary.eventCount,
    defaultEventCount: input.bundle.summary.defaultEventCount,
    secondaryEventCount: input.bundle.summary.secondaryEventCount,
    reviewOnlyEventCount: input.bundle.summary.reviewOnlyEventCount,
    sourceBackedEventCount: input.bundle.summary.sourceBackedEventCount,
    dateAssertionBackedEventCount: input.bundle.summary.dateAssertionBackedEventCount,
    unresolvedDateEventCount: input.bundle.summary.unresolvedDateEventCount,
    lowConfidenceEventCount: input.bundle.summary.lowConfidenceEventCount,
    unaccountedCandidateCount: input.bundle.summary.unaccountedCandidateCount,
    validationErrorCount: input.bundle.summary.validationErrorCount,
    validationWarningCount: input.bundle.summary.validationWarningCount,
    totalTokens,
    defaultEvents: input.bundle.events
      .filter((event) => event.displayLayer === "default")
      .map((event) => ({
        eventId: event.eventId,
        displayDate: event.displayDate,
        title: event.title,
        layer: event.layer,
        status: event.status,
        confidence: event.confidence,
        sourceCount: event.sourceChips.length,
        dateAssertionRefCount: event.dateAssertionRefs.length,
        suggestedWindowStatus: event.suggestedAnalysisWindow.status,
      })),
  };
}

function buildArtifact(input: {
  generatedAt: string;
  rows: TimelineIndexRouteRow[];
}): Tier2RouteTimelineBundleIndexArtifact {
  const totalTokens = input.rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  const hasAnyTokenCount = input.rows.some((row) => row.totalTokens !== null);
  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    bundleCount: input.rows.length,
    summary: {
      routeCount: input.rows.length,
      timelineReadyCount: input.rows.filter((row) => row.supportLevel === "timeline_ready").length,
      timelineSparseCount: input.rows.filter((row) => row.supportLevel === "timeline_sparse")
        .length,
      timelineReviewOnlyCount: input.rows.filter(
        (row) => row.supportLevel === "timeline_review_only",
      ).length,
      invalidCount: input.rows.filter((row) => row.supportLevel === "invalid").length,
      defaultEventCount: input.rows.reduce((sum, row) => sum + row.defaultEventCount, 0),
      eventCount: input.rows.reduce((sum, row) => sum + row.eventCount, 0),
      unresolvedDateEventCount: input.rows.reduce(
        (sum, row) => sum + row.unresolvedDateEventCount,
        0,
      ),
      validationErrorCount: input.rows.reduce((sum, row) => sum + row.validationErrorCount, 0),
      validationWarningCount: input.rows.reduce((sum, row) => sum + row.validationWarningCount, 0),
      totalTokens: hasAnyTokenCount ? totalTokens : null,
    },
    routeRows: input.rows,
  };
}

function renderMarkdown(artifact: Tier2RouteTimelineBundleIndexArtifact): string {
  const lines: string[] = [];
  lines.push("# Route Timeline Bundle Index");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Routes: ${artifact.summary.routeCount}`);
  lines.push(`- Timeline-ready routes: ${artifact.summary.timelineReadyCount}`);
  lines.push(`- Sparse valid routes: ${artifact.summary.timelineSparseCount}`);
  lines.push(`- Review-only routes: ${artifact.summary.timelineReviewOnlyCount}`);
  lines.push(`- Invalid routes: ${artifact.summary.invalidCount}`);
  lines.push(`- Default events: ${artifact.summary.defaultEventCount}`);
  lines.push(`- Events: ${artifact.summary.eventCount}`);
  lines.push(`- Unresolved-date events: ${artifact.summary.unresolvedDateEventCount}`);
  lines.push(`- Validation: ${artifact.summary.validationErrorCount} errors, ${artifact.summary.validationWarningCount} warnings`);
  if (artifact.summary.totalTokens !== null) {
    lines.push(`- LLM tokens in source runs: ${artifact.summary.totalTokens}`);
  }
  lines.push("");
  lines.push("## Route Rows");
  lines.push("");
  lines.push(
    "| Route | Support | Default | Secondary | Review | Unresolved | Warnings | Tail | Flags |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const row of artifact.routeRows) {
    lines.push(
      `| ${row.routeId} | ${row.supportLevel} | ${row.defaultEventCount} | ${row.secondaryEventCount} | ${row.reviewOnlyEventCount} | ${row.unresolvedDateEventCount} | ${row.validationWarningCount} | ${row.unaccountedCandidateCount} | ${row.qualityFlags.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Default Events");
  for (const row of artifact.routeRows) {
    lines.push("");
    lines.push(`### ${row.routeId}`);
    if (row.defaultEvents.length === 0) {
      lines.push("");
      lines.push("No default timeline events.");
      continue;
    }
    for (const event of row.defaultEvents) {
      lines.push(
        `- ${event.displayDate}: ${event.title} (${event.layer}, ${event.status}, sources=${event.sourceCount})`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function buildRouteTimelineBundleIndex(
  args: BuildRouteTimelineBundleIndexArgs,
): Promise<{
  artifact: Tier2RouteTimelineBundleIndexArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  if (args.bundlePaths.length === 0) throw new Error("Provide at least one bundle path.");
  const rows: TimelineIndexRouteRow[] = [];
  for (const bundlePathInput of args.bundlePaths) {
    const bundlePath = fromCliPath(bundlePathInput);
    const bundle = (await Bun.file(bundlePath).json()) as Tier2RouteTimelineBundleArtifact;
    rows.push(rowForBundle({ bundle, bundlePath }));
  }
  rows.sort((left, right) => left.routeId.localeCompare(right.routeId));
  const artifact = buildArtifact({ generatedAt, rows });
  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath());
  const markdownPath =
    args.markdownPath === undefined
      ? defaultPath(outputPath, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? defaultPath(outputPath, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function splitBundlePaths(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { bundlePaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--bundle") {
      if (value === undefined) throw new Error("--bundle requires a value.");
      args.bundlePaths = [...(args.bundlePaths ?? []), value];
      index += 1;
    } else if (arg === "--bundles") {
      if (value === undefined) throw new Error("--bundles requires a value.");
      args.bundlePaths = [...(args.bundlePaths ?? []), ...splitBundlePaths(value)];
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-bundle-index option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineBundleIndexFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.bundlePaths === undefined || args.bundlePaths.length === 0) {
    throw new Error("Provide --bundle or --bundles.");
  }
  const result = await buildRouteTimelineBundleIndex({
    bundlePaths: args.bundlePaths,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `route-timeline-bundle-index: routes=${result.artifact.summary.routeCount} ready=${result.artifact.summary.timelineReadyCount} sparse=${result.artifact.summary.timelineSparseCount} invalid=${result.artifact.summary.invalidCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}
