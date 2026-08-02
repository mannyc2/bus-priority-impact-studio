import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { Effect } from "effect";
import { runBoundedPromises } from "../../effect/concurrency.ts";
import { isoMonthStart, monthRange, nextIsoMonthStart } from "../../lib/dates.ts";
import { backfillLogicalDatasetPartition } from "../../lib/logical-dataset-backfill.ts";
import { logicalDatasetById } from "../../lib/logical-datasets.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

const DATASETS = ["route-ridership", "route-reliability"] as const;
type BackfillDatasetId = (typeof DATASETS)[number];

type DatasetPlan = {
  datasetId: BackfillDatasetId;
  sourceId: string;
  start: string;
  end: string;
  query: (year: number, month: number) => Soda3SoqlQuery;
};

export type FullHistoryBackfillResult = {
  artifactKind: "bp.pipeline.full_history_backfill.v1";
  schemaVersion: 1;
  generatedAt: string;
  root: string;
  datasets: Array<{
    datasetId: BackfillDatasetId;
    sourceIds: string[];
    coverage: {
      start: string;
      end: string;
      missingIntervals: Array<{ start: string; end: string }>;
    };
    partitionCount: number;
    capturedCount: number;
    verifiedSkipCount: number;
    rowCount: number;
    receiptSha256s: string[];
  }>;
};

function monthParts(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month)
  ) {
    throw new Error(`Invalid month ${value}.`);
  }
  return { year, month };
}

function monthNumber(value: string): number {
  const { year, month } = monthParts(value);
  return year * 12 + month - 1;
}

function monthFromNumber(value: number): string {
  return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
}

export function collapseMissingMonthPartitions(
  partitions: readonly string[],
): Array<{ start: string; end: string }> {
  const values = [...new Set(partitions.map(monthNumber))].toSorted((left, right) => left - right);
  const intervals: Array<{ start: string; end: string }> = [];
  let start: number | undefined;
  let prior: number | undefined;
  for (const value of values) {
    if (start === undefined || prior === undefined || value !== prior + 1) {
      if (start !== undefined && prior !== undefined) {
        intervals.push({ start: monthFromNumber(start), end: monthFromNumber(prior) });
      }
      start = value;
    }
    prior = value;
  }
  if (start !== undefined && prior !== undefined) {
    intervals.push({ start: monthFromNumber(start), end: monthFromNumber(prior) });
  }
  return intervals;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function queryFingerprint(sourceId: string, query: Soda3SoqlQuery): string {
  return `sha256:${sha256(JSON.stringify({ sourceId, query }))}`;
}

function planFor(
  datasetId: BackfillDatasetId,
  coverageEnds: Readonly<Record<BackfillDatasetId, string>>,
): DatasetPlan[] {
  if (datasetId === "route-ridership") {
    const query = (year: number, month: number): Soda3SoqlQuery => ({
      select: "bus_route,sum(ridership) as ridership,sum(transfers) as transfers",
      where: [
        `transit_timestamp >= '${isoMonthStart(year, month)}'`,
        `transit_timestamp < '${nextIsoMonthStart(year, month)}'`,
        "bus_route IS NOT NULL",
      ].join(" AND "),
      group: "bus_route",
      order: "bus_route",
    });
    return [
      {
        datasetId,
        sourceId: "bus_hourly_ridership_2020_2024",
        start: "2020-01",
        end: "2024-12",
        query,
      },
      {
        datasetId,
        sourceId: "bus_hourly_ridership_2025",
        start: "2025-01",
        end: coverageEnds[datasetId],
        query,
      },
    ];
  }
  return [
    {
      datasetId,
      sourceId: "bus_wait_assessment",
      start: "2015-01",
      end: coverageEnds[datasetId],
      query: (year, month) => ({
        select:
          "month,borough,day_type,trip_type,route_id,period,number_of_trips_passing_wait,number_of_scheduled_trips,wait_assessment",
        where: [
          `month >= '${isoMonthStart(year, month)}'`,
          `month < '${nextIsoMonthStart(year, month)}'`,
          "route_id IS NOT NULL",
          "period IS NOT NULL",
        ].join(" AND "),
        order: "route_id,day_type,trip_type,period",
      }),
    },
  ];
}

export async function runFullHistoryBackfill(input: {
  root: string;
  datasets?: readonly BackfillDatasetId[] | undefined;
  concurrency?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  generatedAt?: string | undefined;
  coverageEnds: Readonly<Record<BackfillDatasetId, string>>;
}): Promise<FullHistoryBackfillResult> {
  const manifest = loadSourceManifestYaml(
    input.manifestText ??
      (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text()),
  );
  const fetcher = input.fetcher ?? fetch;
  const concurrency = input.concurrency ?? 4;
  const selected = input.datasets ?? DATASETS;
  const summaries: FullHistoryBackfillResult["datasets"] = [];
  await mkdir(input.root, { recursive: true });

  for (const datasetId of selected) {
    const descriptor = logicalDatasetById(datasetId);
    const plans = planFor(datasetId, input.coverageEnds);
    if (descriptor.earliestTrustworthy !== plans[0]?.start) {
      throw new Error(`Registry/backfill floor drift for ${datasetId}.`);
    }
    const tasks = plans.flatMap((plan) => {
      const start = monthParts(plan.start);
      const end = monthParts(plan.end);
      return monthRange(start.year, start.month, end.year, end.month).map((partition) => ({
        plan,
        partition,
      }));
    });
    const results = await runBoundedPromises(tasks, concurrency, async ({ plan, partition }) => {
      const query = plan.query(partition.year, partition.month);
      const source = getSocrataSource(manifest, plan.sourceId);
      return backfillLogicalDatasetPartition({
        root: input.root,
        partition: {
          datasetId,
          sourceId: plan.sourceId,
          partition: partition.isoMonth,
          queryFingerprint: queryFingerprint(plan.sourceId, query),
        },
        fetchRows: () => fetchSoda3RowsForSource(source, query, { fetcher }),
      });
    });
    const partitionIds = new Set(results.map((result) => result.receipt.partition));
    const expectedIds = tasks.map((task) => task.partition.isoMonth);
    const missing = expectedIds.filter((partition) => !partitionIds.has(partition));
    if (missing.length > 0)
      throw new Error(`${datasetId} is missing partitions: ${missing.join(", ")}.`);
    summaries.push({
      datasetId,
      sourceIds: plans.map((plan) => plan.sourceId),
      coverage: {
        start: plans[0]?.start ?? "",
        end: plans.at(-1)?.end ?? "",
        missingIntervals: collapseMissingMonthPartitions(
          results
            .filter((result) => result.receipt.rowCount === 0)
            .map((result) => result.receipt.partition),
        ),
      },
      partitionCount: results.length,
      capturedCount: results.filter((result) => result.outcome === "captured").length,
      verifiedSkipCount: results.filter((result) => result.outcome === "verified_skip").length,
      rowCount: results.reduce((sum, result) => sum + result.receipt.rowCount, 0),
      receiptSha256s: results.map((result) => sha256(JSON.stringify(result.receipt))).toSorted(),
    });
  }

  const result: FullHistoryBackfillResult = {
    artifactKind: "bp.pipeline.full_history_backfill.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    root: input.root,
    datasets: summaries,
  };
  await Bun.write(
    join(input.root, "full-history-backfill.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

export default defineCommand({
  path: ["backfill", "full-history"],
  summary: "Capture complete public logical-dataset history with immutable partition receipts.",
  input: {
    options: Schema.Struct({
      outputRoot: Schema.String.annotate({
        description: "Immutable partition/receipt output root",
      }),
      datasets: Schema.Array(Schema.Literals(DATASETS))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({ description: "Logical datasets (default: ridership and reliability)" }),
      concurrency: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(4)))
        .annotate({ description: "Bounded concurrent source requests" }),
      ridershipEnd: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)).annotate({
        description: "Verified latest complete route-ridership partition",
      }),
      reliabilityEnd: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)).annotate({
        description: "Verified latest complete route-reliability partition",
      }),
    }),
  },
  output: Schema.Unknown,
  run({ input }) {
    return runFullHistoryBackfill({
      root: fromCliPath(input.options.outputRoot),
      datasets: input.options.datasets.length === 0 ? undefined : input.options.datasets,
      concurrency: input.options.concurrency,
      coverageEnds: {
        "route-ridership": input.options.ridershipEnd,
        "route-reliability": input.options.reliabilityEnd,
      },
    });
  },
});
