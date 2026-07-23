import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { RouteSpeedAvailabilityResultSchema } from "@bp/analytics/evaluation";
import { decodeStrict } from "@bp/domain/decode";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { type FreshnessLedger, FreshnessLedgerSchema } from "../../lib/freshness-ledger.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  buildPlan097FreshnessMatrix,
  latestClosedUpstreamMonth,
  type Plan097FreshnessEvidence,
  Plan097FreshnessMatrixSchema,
} from "../../lib/plan097-freshness.ts";

const sourceTables = {
  bus_segment_speeds_2025: { table: "local_route_segment_speed", partitionColumn: "month" },
  bus_hourly_ridership_2025: {
    table: "local_route_hourly_ridership",
    partitionColumn: "month",
  },
  bus_wait_assessment: { table: "local_bus_wait_assessment", partitionColumn: "month" },
  ace_violations: { table: "local_ace_violation_summary", partitionColumn: "month" },
} as const;

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error(`Unsafe SQLite identifier ${value}`);
  return `"${value}"`;
}

function hashValue(value: unknown): unknown {
  return value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value;
}

function tableEvidence(input: {
  sqlite: Database;
  sourceId: string;
  table: string;
  partitionColumn?: string | undefined;
  partitionExpression?: string | undefined;
  partition: string;
}): Plan097FreshnessEvidence {
  const table = quoteIdentifier(input.table);
  const info = input.sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{
    cid: number;
    name: string;
    pk: number;
  }>;
  if (info.length === 0) throw new Error(`Plan 097 evidence table ${input.table} is absent`);
  const columns = info.toSorted((left, right) => left.cid - right.cid).map((row) => row.name);
  const primaryKey = info
    .filter((row) => row.pk > 0)
    .toSorted((left, right) => left.pk - right.pk)
    .map((row) => row.name);
  const order = primaryKey.length > 0 ? primaryKey : columns;
  const partitionExpression =
    input.partitionExpression ??
    (input.partitionColumn === undefined ? undefined : quoteIdentifier(input.partitionColumn));
  const predicate = partitionExpression === undefined ? "" : ` WHERE ${partitionExpression} = ?`;
  const params = partitionExpression === undefined ? [] : [input.partition];
  const rows = input.sqlite
    .query(
      `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${table}${predicate} ORDER BY ${order
        .map(quoteIdentifier)
        .join(", ")}`,
    )
    .iterate(...params);
  const hash = createHash("sha256");
  let rowCount = 0;
  const routeIds = new Set<string>();
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    hash.update(`${JSON.stringify(columns.map((column) => hashValue(row[column])))}\n`);
    rowCount += 1;
    // biome-ignore lint/complexity/useLiteralKeys: SQLite rows use an index signature.
    if (typeof row["route_id"] === "string") routeIds.add(row["route_id"]);
  }
  return {
    sourceId: input.sourceId,
    partition: input.partition,
    rowCount,
    routeCount: columns.includes("route_id") ? routeIds.size : null,
    rowsSha256: hash.digest("hex"),
    sourceSnapshotSha256: null,
  };
}

async function snapshotEvidence(input: {
  sqlite: Database;
  sourceId: string;
  table: string;
  path: string;
}): Promise<Plan097FreshnessEvidence> {
  const source = Bun.file(input.path);
  if (!(await source.exists())) throw new Error(`Plan 097 source snapshot ${input.path} is absent`);
  const bytes = new Uint8Array(await source.arrayBuffer());
  const sourceSnapshotSha256 = createHash("sha256").update(bytes).digest("hex");
  const evidence = tableEvidence({
    sqlite: input.sqlite,
    sourceId: input.sourceId,
    table: input.table,
    partition: `snapshot:${sourceSnapshotSha256}`,
  });
  return { ...evidence, sourceSnapshotSha256 };
}

export async function runPlan097ReadinessAudit(input: {
  dbPath: string;
  freshnessLedgerPath: string;
  routeSpeedAvailabilityPath: string;
  aceRoutesSnapshotPath: string;
  busLanesSnapshotPath: string;
  outputPath: string;
}) {
  const freshness = decodeStrict(FreshnessLedgerSchema)(
    await Bun.file(input.freshnessLedgerPath).json(),
  );
  const routeSpeedAvailability = decodeStrict(RouteSpeedAvailabilityResultSchema)(
    await Bun.file(input.routeSpeedAvailabilityPath).json(),
  );
  const ledgerBySource = new Map(freshness.rows.map((row) => [row.sourceId, row]));
  const selectedPartitions = new Map<string, string | null>([
    ["bus_segment_speeds_2025", routeSpeedAvailability.releaseDecision.latestCompleteMonth],
    ...(["bus_hourly_ridership_2025", "bus_wait_assessment", "ace_violations"] as const).map(
      (sourceId) =>
        [
          sourceId,
          latestClosedUpstreamMonth(
            ledgerBySource.get(sourceId)?.upstreamLatest ?? null,
            freshness.checkedAt,
          ),
        ] as const,
    ),
  ]);
  const sqlite = new Database(input.dbPath, { readonly: true });
  try {
    const evidence: Plan097FreshnessEvidence[] = [];
    for (const [sourceId, config] of Object.entries(sourceTables)) {
      const partition = selectedPartitions.get(sourceId);
      if (partition === null || partition === undefined) continue;
      evidence.push(
        tableEvidence({
          sqlite,
          sourceId,
          table: config.table,
          partitionColumn: config.partitionColumn,
          partition,
        }),
      );
    }
    evidence.push(
      await snapshotEvidence({
        sqlite,
        sourceId: "ace_routes",
        table: "local_ace_route",
        path: input.aceRoutesSnapshotPath,
      }),
      await snapshotEvidence({
        sqlite,
        sourceId: "nyc_dot_bus_lanes_local_streets",
        table: "local_bus_lane",
        path: input.busLanesSnapshotPath,
      }),
    );
    const realtime = ledgerBySource.get("bus_time_gtfsrt_vehicle_positions")?.ingestedLatest;
    if (realtime !== null && realtime !== undefined) {
      evidence.push(
        tableEvidence({
          sqlite,
          sourceId: "bus_time_gtfsrt_vehicle_positions",
          table: "local_gtfs_rt_feed_snapshot",
          partitionExpression: 'substr("fetched_at", 1, 10)',
          partition: realtime,
        }),
      );
    }
    const matrix = buildPlan097FreshnessMatrix({
      checkedAt: freshness.checkedAt,
      ledger: freshness as FreshnessLedger,
      routeSpeedAvailability,
      evidence,
    });
    await mkdir(dirname(input.outputPath), { recursive: true });
    await writeJson(input.outputPath, matrix);
    if (matrix.status !== "ready") {
      const blockers = matrix.datasets
        .filter((row) => row.status === "stop")
        .map((row) => `${row.sourceId}: ${row.reasons.join(", ")}`)
        .join("; ");
      throw new Error(`Plan 097 freshness-derived candidate is not ready: ${blockers}`);
    }
    return matrix;
  } finally {
    sqlite.close();
  }
}

export default defineCommand({
  path: ["audit", "plan097-readiness"],
  summary: "Build the fail-closed, per-dataset Plan 097 candidate freshness matrix.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      freshnessLedger: Schema.String,
      routeSpeedAvailability: Schema.String,
      aceRoutesSnapshot: Schema.optionalKey(Schema.String),
      busLanesSnapshot: Schema.optionalKey(Schema.String),
      output: Schema.String,
    }),
  },
  output: Plan097FreshnessMatrixSchema,
  run({ input }) {
    return runPlan097ReadinessAudit({
      dbPath:
        input.options.db === undefined
          ? defaultLocalPipelineDbPath()
          : fromCliPath(input.options.db),
      freshnessLedgerPath: fromCliPath(input.options.freshnessLedger),
      routeSpeedAvailabilityPath: fromCliPath(input.options.routeSpeedAvailability),
      aceRoutesSnapshotPath:
        input.options.aceRoutesSnapshot === undefined
          ? fromRepoRoot("data/raw/interventions/ace-routes.json")
          : fromCliPath(input.options.aceRoutesSnapshot),
      busLanesSnapshotPath:
        input.options.busLanesSnapshot === undefined
          ? fromRepoRoot("data/raw/interventions/bus-lanes-local-streets.json")
          : fromCliPath(input.options.busLanesSnapshot),
      outputPath: fromCliPath(input.options.output),
    });
  },
});
