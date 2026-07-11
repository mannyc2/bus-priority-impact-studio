import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Glob } from "bun";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import { readCsvRows } from "../../lib/streaming-csv.ts";

type CsvRow = Record<string, string>;

type DotTrafficSpeedRow = {
  linkId: string;
  sampledAt: string;
  speed: number | null;
  travelTime: number | null;
  statusCode: string;
  owner: string | null;
  borough: string | null;
  linkName: string | null;
  linkPoints: string | null;
  transcomId: string | null;
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function first(row: CsvRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
    if (value !== undefined) return value;
  }
  return "";
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSampledAt(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed.endsWith("Z") ? trimmed : `${trimmed.replace(/\.000$/, "")}Z`;
  }
  const parsed = Date.parse(`${trimmed} UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseTrafficSpeedRow(row: CsvRow): DotTrafficSpeedRow | null {
  const linkId = first(row, "link_id", "LINK_ID").trim();
  const sampledAt = parseSampledAt(first(row, "data_as_of", "DATA_AS_OF"));
  if (linkId.length === 0 || sampledAt === null) return null;
  return {
    linkId,
    sampledAt,
    speed: nullableNumber(first(row, "speed", "SPEED")),
    travelTime: nullableNumber(first(row, "travel_time", "TRAVEL_TIME")),
    statusCode: first(row, "status", "STATUS").trim(),
    owner: nullableText(first(row, "owner", "OWNER")),
    borough: nullableText(first(row, "borough", "BOROUGH")),
    linkName: nullableText(first(row, "link_name", "LINK_NAME")),
    linkPoints: nullableText(first(row, "link_points", "LINK_POINTS")),
    transcomId: nullableText(first(row, "transcom_id", "TRANSCOM_ID")),
  };
}

async function listCsvPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  const glob = new Glob("traffic-speeds-*/chunks/*/rows.csv");
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    paths.push(join(root, path));
  }
  return paths.sort();
}

function writeBatch(sqlite: Database, rows: readonly DotTrafficSpeedRow[]): void {
  if (rows.length === 0) return;
  const insert = sqlite.prepare(`
    INSERT INTO local_dot_traffic_speed (
      link_id,
      sampled_at,
      speed,
      travel_time,
      status_code,
      owner,
      borough,
      link_name,
      link_points,
      transcom_id,
      physical_id,
      geocode_confidence
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(link_id, sampled_at) DO UPDATE SET
      speed = excluded.speed,
      travel_time = excluded.travel_time,
      status_code = excluded.status_code,
      owner = excluded.owner,
      borough = excluded.borough,
      link_name = excluded.link_name,
      link_points = excluded.link_points,
      transcom_id = excluded.transcom_id
  `);
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      insert.run(
        row.linkId,
        row.sampledAt,
        row.speed,
        row.travelTime,
        row.statusCode,
        row.owner,
        row.borough,
        row.linkName,
        row.linkPoints,
        row.transcomId,
      );
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export default defineCommand({
  path: ["ingest", "dot-traffic-speeds-history"],
  summary: "Import partitioned historical DOT traffic-speed CSV snapshots into the local DB.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        rawRoot: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(
            Effect.succeed("data/raw/socrata-partitioned/nyc_dot_traffic_speeds"),
          ),
        ).annotate({ description: "Partitioned DOT traffic-speed CSV root" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override import manifest output path",
        }),
        batchSize: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(5_000)))
          .annotate({ description: "SQLite insert batch size" }),
        maxFiles: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Optional cap for smoke imports",
        }),
      },
    }),
  },
  output: Schema.Struct({
    dbPath: Schema.String,
    rawRoot: Schema.String,
    outputPath: Schema.String,
    fileCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    parsedRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    skippedRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    const rawRoot = fromCliPath(input.options.rawRoot);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "dot-traffic-speeds-history", "import-manifest.json")
        : fromCliPath(input.options.output);
    const allPaths = await listCsvPaths(rawRoot);
    const paths =
      input.options.maxFiles === undefined ? allPaths : allPaths.slice(0, input.options.maxFiles);
    const importResult = await runLocalDbCommandBoundary({
      dbPath,
      command: "ingest.dot-traffic-speeds-history",
      operation: "ingestDotTrafficSpeedsHistory",
      run: async (local) => {
        let parsedRowCount = 0;
        let skippedRowCount = 0;
        let batch: DotTrafficSpeedRow[] = [];
        for (const path of paths) {
          for await (const csvRow of readCsvRows<CsvRow>(path)) {
            const parsed = parseTrafficSpeedRow(csvRow);
            if (parsed === null) {
              skippedRowCount += 1;
              continue;
            }
            batch.push(parsed);
            parsedRowCount += 1;
            if (batch.length >= input.options.batchSize) {
              writeBatch(local.sqlite, batch);
              batch = [];
            }
          }
        }
        writeBatch(local.sqlite, batch);
        return {
          dbPath: local.path,
          parsedRowCount,
          skippedRowCount,
        };
      },
    });
    const manifest = {
      artifactKind: "dot_traffic_speeds_history_import",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      dbPath: repoDisplayPath(importResult.dbPath),
      rawRoot: repoDisplayPath(rawRoot),
      fileCount: paths.length,
      availableFileCount: allPaths.length,
      parsedRowCount: importResult.parsedRowCount,
      skippedRowCount: importResult.skippedRowCount,
      files: paths.map(repoDisplayPath),
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, manifest);
    return {
      dbPath: repoDisplayPath(importResult.dbPath),
      rawRoot: repoDisplayPath(rawRoot),
      outputPath: repoDisplayPath(outputPath),
      fileCount: paths.length,
      parsedRowCount: importResult.parsedRowCount,
      skippedRowCount: importResult.skippedRowCount,
    };
  },
});
