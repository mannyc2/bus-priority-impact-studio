import { createHash } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type { Tier2RouteTimelineBundleIndexArtifact } from "./_route-timeline-bundle-index.ts";

const ARTIFACT_KIND = "bp.tier2_route_timeline_serving_projection.v1";
const SUMMARY_KIND = "bp.tier2_route_timeline_serving_projection_summary.v1";
const DEFAULT_MONTH = "2026-03";
const DEFAULT_R2_PREFIX = "studio/v2/routes";
const TIMELINE_ARTIFACT_NAME = "route_timeline_bundle";
const TIMELINE_CONTENT_TYPE = "application/json";

type BundleIndexRow = Tier2RouteTimelineBundleIndexArtifact["routeRows"][number];

type RouteTimelineServingRow = {
  routeId: string;
  month: string;
  supportLevel: BundleIndexRow["supportLevel"];
  qualityFlags: string[];
  defaultEventCount: number;
  secondaryEventCount: number;
  reviewOnlyEventCount: number;
  eventCount: number;
  sourceBackedEventCount: number;
  dateAssertionBackedEventCount: number;
  unresolvedDateEventCount: number;
  lowConfidenceEventCount: number;
  unaccountedCandidateCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  totalTokens: number | null;
  defaultEvents: BundleIndexRow["defaultEvents"];
  bundleArtifactKey: string;
  bundleArtifactSha256: string;
  bundleArtifactByteLength: number;
  sourceBundlePath: string;
  generatedAt: string;
};

type RouteArtifactServingRow = {
  routeId: string;
  month: string;
  artifactName: typeof TIMELINE_ARTIFACT_NAME;
  artifactKey: string;
  contentType: typeof TIMELINE_CONTENT_TYPE;
  byteLength: number;
  sha256: string;
};

type CopyPlanRow = {
  routeId: string;
  sourcePath: string;
  artifactKey: string;
  contentType: typeof TIMELINE_CONTENT_TYPE;
  byteLength: number;
  sha256: string;
};

export type Tier2RouteTimelineServingProjectionArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceIndexPath: string;
  releaseMonth: string;
  r2Prefix: string;
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
    routeTimelineIndexRowCount: number;
    routeArtifactRowCount: number;
    copyPlanRowCount: number;
    totalBundleByteLength: number;
    totalTokens: number | null;
  };
  routeTimelineIndexRows: RouteTimelineServingRow[];
  routeArtifactRows: RouteArtifactServingRow[];
  copyPlan: CopyPlanRow[];
};

export type BuildRouteTimelineServingProjectionArgs = {
  indexPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  schemaPath?: string;
  seedPath?: string;
  artifactRoot?: string;
  month?: string;
  r2Prefix?: string;
  generatedAt?: string;
};

type CliArgs = Partial<BuildRouteTimelineServingProjectionArgs>;

function defaultOutputPath(): string {
  return join(
    fromCliPath("data/artifacts/docs/agentic-runs-20260604/route-timeline-index-v1-20260606"),
    "route-timeline-serving-projection.json",
  );
}

function defaultPath(outputPath: string, suffix: string): string {
  return outputPath.replace(/\.json$/, suffix);
}

function routeSlug(routeId: string): string {
  return routeId
    .trim()
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeR2Prefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

async function fileDigest(path: string): Promise<{ byteLength: number; sha256: string }> {
  const bytes = await Bun.file(path).arrayBuffer();
  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
  };
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableNumber(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

function sqlJson(value: unknown): string {
  return sqlString(JSON.stringify(value));
}

function renderSchemaSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS route_timeline_index (",
    "  route_id TEXT NOT NULL,",
    "  month TEXT NOT NULL,",
    "  support_level TEXT NOT NULL,",
    "  quality_flags_json TEXT NOT NULL,",
    "  default_event_count INTEGER NOT NULL,",
    "  secondary_event_count INTEGER NOT NULL,",
    "  review_only_event_count INTEGER NOT NULL,",
    "  event_count INTEGER NOT NULL,",
    "  source_backed_event_count INTEGER NOT NULL,",
    "  date_assertion_backed_event_count INTEGER NOT NULL,",
    "  unresolved_date_event_count INTEGER NOT NULL,",
    "  low_confidence_event_count INTEGER NOT NULL,",
    "  unaccounted_candidate_count INTEGER NOT NULL,",
    "  validation_error_count INTEGER NOT NULL,",
    "  validation_warning_count INTEGER NOT NULL,",
    "  total_tokens INTEGER,",
    "  default_events_json TEXT NOT NULL,",
    "  bundle_artifact_key TEXT NOT NULL,",
    "  bundle_artifact_sha256 TEXT NOT NULL,",
    "  bundle_artifact_byte_length INTEGER NOT NULL,",
    "  source_bundle_path TEXT NOT NULL,",
    "  generated_at TEXT NOT NULL,",
    "  PRIMARY KEY (route_id, month)",
    ");",
    "",
    "CREATE INDEX IF NOT EXISTS route_timeline_index_month_support_idx",
    "  ON route_timeline_index (month, support_level);",
    "",
    "CREATE TABLE IF NOT EXISTS route_artifact (",
    "  route_id TEXT NOT NULL,",
    "  month TEXT NOT NULL,",
    "  artifact_name TEXT NOT NULL,",
    "  artifact_key TEXT NOT NULL,",
    "  content_type TEXT NOT NULL,",
    "  byte_length INTEGER NOT NULL,",
    "  sha256 TEXT NOT NULL,",
    "  PRIMARY KEY (route_id, month, artifact_name)",
    ");",
    "",
  ].join("\n");
}

function renderSeedSql(artifact: Tier2RouteTimelineServingProjectionArtifact): string {
  const month = sqlString(artifact.releaseMonth);
  const lines: string[] = [];
  lines.push("BEGIN TRANSACTION;");
  lines.push(`DELETE FROM route_timeline_index WHERE month = ${month};`);
  lines.push(
    `DELETE FROM route_artifact WHERE month = ${month} AND artifact_name = ${sqlString(TIMELINE_ARTIFACT_NAME)};`,
  );
  for (const row of artifact.routeTimelineIndexRows) {
    lines.push(
      [
        "INSERT INTO route_timeline_index (",
        "  route_id, month, support_level, quality_flags_json, default_event_count,",
        "  secondary_event_count, review_only_event_count, event_count, source_backed_event_count,",
        "  date_assertion_backed_event_count, unresolved_date_event_count, low_confidence_event_count,",
        "  unaccounted_candidate_count, validation_error_count, validation_warning_count, total_tokens,",
        "  default_events_json, bundle_artifact_key, bundle_artifact_sha256, bundle_artifact_byte_length,",
        "  source_bundle_path, generated_at",
        ") VALUES (",
        `  ${sqlString(row.routeId)}, ${sqlString(row.month)}, ${sqlString(row.supportLevel)}, ${sqlJson(row.qualityFlags)}, ${row.defaultEventCount},`,
        `  ${row.secondaryEventCount}, ${row.reviewOnlyEventCount}, ${row.eventCount}, ${row.sourceBackedEventCount},`,
        `  ${row.dateAssertionBackedEventCount}, ${row.unresolvedDateEventCount}, ${row.lowConfidenceEventCount},`,
        `  ${row.unaccountedCandidateCount}, ${row.validationErrorCount}, ${row.validationWarningCount}, ${sqlNullableNumber(row.totalTokens)},`,
        `  ${sqlJson(row.defaultEvents)}, ${sqlString(row.bundleArtifactKey)}, ${sqlString(row.bundleArtifactSha256)}, ${row.bundleArtifactByteLength},`,
        `  ${sqlString(row.sourceBundlePath)}, ${sqlString(row.generatedAt)}`,
        ");",
      ].join("\n"),
    );
  }
  for (const row of artifact.routeArtifactRows) {
    lines.push(
      [
        "INSERT INTO route_artifact (route_id, month, artifact_name, artifact_key, content_type, byte_length, sha256)",
        "VALUES (",
        `  ${sqlString(row.routeId)}, ${sqlString(row.month)}, ${sqlString(row.artifactName)}, ${sqlString(row.artifactKey)},`,
        `  ${sqlString(row.contentType)}, ${row.byteLength}, ${sqlString(row.sha256)}`,
        ");",
      ].join("\n"),
    );
  }
  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}

function renderMarkdown(artifact: Tier2RouteTimelineServingProjectionArtifact): string {
  const lines: string[] = [];
  lines.push("# Route Timeline Serving Projection");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push(`Release month: ${artifact.releaseMonth}`);
  lines.push(`Source index: ${artifact.sourceIndexPath}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Routes: ${artifact.summary.routeCount}`);
  lines.push(`- Timeline-ready routes: ${artifact.summary.timelineReadyCount}`);
  lines.push(`- Sparse routes: ${artifact.summary.timelineSparseCount}`);
  lines.push(`- Review-only routes: ${artifact.summary.timelineReviewOnlyCount}`);
  lines.push(`- Invalid routes: ${artifact.summary.invalidCount}`);
  lines.push(`- D1 route_timeline_index rows: ${artifact.summary.routeTimelineIndexRowCount}`);
  lines.push(`- D1 route_artifact rows: ${artifact.summary.routeArtifactRowCount}`);
  lines.push(`- R2 copy plan rows: ${artifact.summary.copyPlanRowCount}`);
  lines.push(`- Bundle bytes: ${artifact.summary.totalBundleByteLength}`);
  if (artifact.summary.totalTokens !== null) {
    lines.push(`- Source LLM tokens: ${artifact.summary.totalTokens}`);
  }
  lines.push("");
  lines.push("## D1 Route Rows");
  lines.push("");
  lines.push("| Route | Support | Default | Events | Unresolved | Tail | Bundle key |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  for (const row of artifact.routeTimelineIndexRows) {
    lines.push(
      `| ${row.routeId} | ${row.supportLevel} | ${row.defaultEventCount} | ${row.eventCount} | ${row.unresolvedDateEventCount} | ${row.unaccountedCandidateCount} | ${row.bundleArtifactKey} |`,
    );
  }
  lines.push("");
  lines.push("## R2 Copy Plan");
  lines.push("");
  lines.push("| Route | Bytes | SHA-256 | Key | Source |");
  lines.push("|---|---:|---|---|---|");
  for (const row of artifact.copyPlan) {
    lines.push(
      `| ${row.routeId} | ${row.byteLength} | ${row.sha256.slice(0, 12)}... | ${row.artifactKey} | ${row.sourcePath} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function summarize(input: {
  index: Tier2RouteTimelineBundleIndexArtifact;
  routeTimelineIndexRows: RouteTimelineServingRow[];
  routeArtifactRows: RouteArtifactServingRow[];
  copyPlan: CopyPlanRow[];
}): Tier2RouteTimelineServingProjectionArtifact["summary"] {
  return {
    routeCount: input.index.summary.routeCount,
    timelineReadyCount: input.index.summary.timelineReadyCount,
    timelineSparseCount: input.index.summary.timelineSparseCount,
    timelineReviewOnlyCount: input.index.summary.timelineReviewOnlyCount,
    invalidCount: input.index.summary.invalidCount,
    defaultEventCount: input.index.summary.defaultEventCount,
    eventCount: input.index.summary.eventCount,
    unresolvedDateEventCount: input.index.summary.unresolvedDateEventCount,
    validationErrorCount: input.index.summary.validationErrorCount,
    validationWarningCount: input.index.summary.validationWarningCount,
    routeTimelineIndexRowCount: input.routeTimelineIndexRows.length,
    routeArtifactRowCount: input.routeArtifactRows.length,
    copyPlanRowCount: input.copyPlan.length,
    totalBundleByteLength: input.copyPlan.reduce((sum, row) => sum + row.byteLength, 0),
    totalTokens: input.index.summary.totalTokens,
  };
}

export async function buildRouteTimelineServingProjection(
  args: BuildRouteTimelineServingProjectionArgs,
): Promise<{
  artifact: Tier2RouteTimelineServingProjectionArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
  schemaPath: string;
  seedPath: string;
  materializedArtifactPaths: string[];
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceIndexPath = fromCliPath(args.indexPath);
  const artifactRoot = fromCliPath(args.artifactRoot ?? defaultArtifactRootPath());
  const index = (await Bun.file(sourceIndexPath).json()) as Tier2RouteTimelineBundleIndexArtifact;
  const releaseMonth = args.month ?? DEFAULT_MONTH;
  const r2Prefix = normalizeR2Prefix(args.r2Prefix ?? DEFAULT_R2_PREFIX);
  const routeTimelineIndexRows: RouteTimelineServingRow[] = [];
  const routeArtifactRows: RouteArtifactServingRow[] = [];
  const copyPlan: CopyPlanRow[] = [];

  for (const row of index.routeRows) {
    const sourceBundlePath = fromCliPath(row.bundlePath);
    const digest = await fileDigest(sourceBundlePath);
    const artifactKey = `${r2Prefix}/${routeSlug(row.routeId)}/timeline.json`;
    routeTimelineIndexRows.push({
      routeId: row.routeId,
      month: releaseMonth,
      supportLevel: row.supportLevel,
      qualityFlags: row.qualityFlags,
      defaultEventCount: row.defaultEventCount,
      secondaryEventCount: row.secondaryEventCount,
      reviewOnlyEventCount: row.reviewOnlyEventCount,
      eventCount: row.eventCount,
      sourceBackedEventCount: row.sourceBackedEventCount,
      dateAssertionBackedEventCount: row.dateAssertionBackedEventCount,
      unresolvedDateEventCount: row.unresolvedDateEventCount,
      lowConfidenceEventCount: row.lowConfidenceEventCount,
      unaccountedCandidateCount: row.unaccountedCandidateCount,
      validationErrorCount: row.validationErrorCount,
      validationWarningCount: row.validationWarningCount,
      totalTokens: row.totalTokens,
      defaultEvents: row.defaultEvents,
      bundleArtifactKey: artifactKey,
      bundleArtifactSha256: digest.sha256,
      bundleArtifactByteLength: digest.byteLength,
      sourceBundlePath,
      generatedAt: row.generatedAt,
    });
    routeArtifactRows.push({
      routeId: row.routeId,
      month: releaseMonth,
      artifactName: TIMELINE_ARTIFACT_NAME,
      artifactKey,
      contentType: TIMELINE_CONTENT_TYPE,
      byteLength: digest.byteLength,
      sha256: digest.sha256,
    });
    copyPlan.push({
      routeId: row.routeId,
      sourcePath: sourceBundlePath,
      artifactKey,
      contentType: TIMELINE_CONTENT_TYPE,
      byteLength: digest.byteLength,
      sha256: digest.sha256,
    });
  }

  const artifact: Tier2RouteTimelineServingProjectionArtifact = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceIndexPath,
    releaseMonth,
    r2Prefix,
    summary: summarize({ index, routeTimelineIndexRows, routeArtifactRows, copyPlan }),
    routeTimelineIndexRows,
    routeArtifactRows,
    copyPlan,
  };

  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath());
  const markdownPath =
    args.markdownPath === undefined
      ? defaultPath(outputPath, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? defaultPath(outputPath, "-summary.json")
      : fromCliPath(args.summaryPath);
  const schemaPath =
    args.schemaPath === undefined
      ? defaultPath(outputPath, "-schema.sql")
      : fromCliPath(args.schemaPath);
  const seedPath =
    args.seedPath === undefined
      ? defaultPath(outputPath, "-seed.sql")
      : fromCliPath(args.seedPath);

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });
  await mkdir(dirname(summaryPath), { recursive: true });
  await mkdir(dirname(schemaPath), { recursive: true });
  await mkdir(dirname(seedPath), { recursive: true });

  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  await Bun.write(schemaPath, renderSchemaSql());
  await Bun.write(seedPath, renderSeedSql(artifact));
  const materializedArtifactPaths: string[] = [];
  for (const row of copyPlan) {
    const targetPath = join(artifactRoot, row.artifactKey);
    await mkdir(dirname(targetPath), { recursive: true });
    if (targetPath !== row.sourcePath) {
      await copyFile(row.sourcePath, targetPath);
    }
    materializedArtifactPaths.push(targetPath);
  }

  return {
    artifact,
    outputPath,
    markdownPath,
    summaryPath,
    schemaPath,
    seedPath,
    materializedArtifactPaths,
  };
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--index") {
      if (value === undefined) throw new Error("--index requires a value.");
      args.indexPath = value;
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
    } else if (arg === "--schema") {
      if (value === undefined) throw new Error("--schema requires a value.");
      args.schemaPath = value;
      index += 1;
    } else if (arg === "--seed") {
      if (value === undefined) throw new Error("--seed requires a value.");
      args.seedPath = value;
      index += 1;
    } else if (arg === "--artifact-root") {
      if (value === undefined) throw new Error("--artifact-root requires a value.");
      args.artifactRoot = value;
      index += 1;
    } else if (arg === "--month") {
      if (value === undefined) throw new Error("--month requires a value.");
      args.month = value;
      index += 1;
    } else if (arg === "--r2-prefix") {
      if (value === undefined) throw new Error("--r2-prefix requires a value.");
      args.r2Prefix = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-serving-projection option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineServingProjectionFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.indexPath === undefined) throw new Error("Provide --index.");
  const result = await buildRouteTimelineServingProjection({
    indexPath: args.indexPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.schemaPath === undefined ? {} : { schemaPath: args.schemaPath }),
    ...(args.seedPath === undefined ? {} : { seedPath: args.seedPath }),
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
    ...(args.month === undefined ? {} : { month: args.month }),
    ...(args.r2Prefix === undefined ? {} : { r2Prefix: args.r2Prefix }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `route-timeline-serving-projection: routes=${result.artifact.summary.routeCount} ready=${result.artifact.summary.timelineReadyCount} sparse=${result.artifact.summary.timelineSparseCount} artifactRows=${result.artifact.summary.routeArtifactRowCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    schemaPath: result.schemaPath,
    seedPath: result.seedPath,
    summary: result.artifact.summary,
  };
}
