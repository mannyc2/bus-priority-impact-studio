import {
  type LocalRouteObservedReliabilitySummary,
  listRouteCatalog,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import { type CliOption, trueOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { createMonthContext, type MonthDbArgs, parseMonthDbCliArgs } from "../../lib/route-job.js";

type ImportBusObservatoryReliabilitySummaryArgs = MonthDbArgs & {
  summaryCsv?: string;
  runId?: string;
  fillCatalog?: boolean;
};

type ImportBusObservatoryReliabilitySummaryResult = {
  month: string;
  runId: string;
  provenance: "third_party_recovered";
  sourceId: "bus_observatory_nyct_mta_bus_gtfsrt";
  summaryCsv: string;
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
  skippedNonCatalogRouteCount: number;
};

type SummaryRow = LocalRouteObservedReliabilitySummary;

type SummaryCsvRow = Record<string, string> & {
  route_id?: string;
  month?: string;
  run_id?: string;
  reliability_status?: string;
  min_sample_threshold?: string;
  sample_count?: string;
  stop_count?: string;
  direction_count?: string;
  average_observed_headway_minutes?: string;
  median_observed_headway_minutes?: string;
  p90_observed_headway_minutes?: string;
  max_observed_headway_minutes?: string;
  scheduled_median_headway_minutes?: string;
  bunching_threshold_minutes?: string;
  long_gap_threshold_minutes?: string;
  observed_bunching_share?: string;
  observed_long_gap_share?: string;
  expected_wait_minutes?: string;
  scheduled_expected_wait_minutes?: string;
  excess_wait_minutes?: string;
  wait_reliability_ratio?: string;
};

const sourceIds = ["observedHeadways", "bunching", "waitTimeReliability"] as const;
const defaultMinSampleThreshold = 30;
const sourceId = "bus_observatory_nyct_mta_bus_gtfsrt";

function requireString(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      output.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  output.push(current);
  return output;
}

function rowFromValues(headers: string[], values: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((header, index) => {
    output[header] = values[index] ?? "";
  });
  return output;
}

function numberOrNull(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(name: string, value: string | undefined): number {
  const parsed = numberOrNull(value);
  if (parsed === null) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return Math.trunc(parsed);
}

function text(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return trimmed;
}

function reliabilityStatus(value: string | undefined): "observed" | "insufficient_gtfs_rt_samples" {
  const parsed = text("reliability_status", value);
  if (parsed !== "observed" && parsed !== "insufficient_gtfs_rt_samples") {
    throw new Error(`Invalid reliability_status: ${parsed}`);
  }
  return parsed;
}

function parseSummary(headers: string[], line: string): SummaryRow {
  const row = rowFromValues(headers, parseCsvLine(line)) as SummaryCsvRow;
  return {
    routeId: text("route_id", row.route_id),
    month: text("month", row.month),
    runId: text("run_id", row.run_id),
    reliabilityStatus: reliabilityStatus(row.reliability_status),
    minSampleThreshold: integer("min_sample_threshold", row.min_sample_threshold),
    sampleCount: integer("sample_count", row.sample_count),
    stopCount: integer("stop_count", row.stop_count),
    directionCount: integer("direction_count", row.direction_count),
    averageObservedHeadwayMinutes: numberOrNull(row.average_observed_headway_minutes),
    medianObservedHeadwayMinutes: numberOrNull(row.median_observed_headway_minutes),
    p90ObservedHeadwayMinutes: numberOrNull(row.p90_observed_headway_minutes),
    maxObservedHeadwayMinutes: numberOrNull(row.max_observed_headway_minutes),
    scheduledMedianHeadwayMinutes: numberOrNull(row.scheduled_median_headway_minutes),
    bunchingThresholdMinutes: numberOrNull(row.bunching_threshold_minutes),
    longGapThresholdMinutes: numberOrNull(row.long_gap_threshold_minutes),
    observedBunchingShare: numberOrNull(row.observed_bunching_share),
    observedLongGapShare: numberOrNull(row.observed_long_gap_share),
    expectedWaitMinutes: numberOrNull(row.expected_wait_minutes),
    scheduledExpectedWaitMinutes: numberOrNull(row.scheduled_expected_wait_minutes),
    excessWaitMinutes: numberOrNull(row.excess_wait_minutes),
    waitReliabilityRatio: numberOrNull(row.wait_reliability_ratio),
  };
}

async function readSummaryCsv(path: string): Promise<SummaryRow[]> {
  const rows: SummaryRow[] = [];
  const textContent = await Bun.file(path).text();
  const lines = textContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerLine = lines.shift();
  if (headerLine === undefined) {
    return rows;
  }
  const headers = parseCsvLine(headerLine);
  for (const line of lines) {
    rows.push(parseSummary(headers, line));
  }
  return rows;
}

function insufficientSummary(input: { routeId: string; month: string; runId: string }): SummaryRow {
  return {
    routeId: input.routeId,
    month: input.month,
    runId: input.runId,
    reliabilityStatus: "insufficient_gtfs_rt_samples",
    minSampleThreshold: defaultMinSampleThreshold,
    sampleCount: 0,
    stopCount: 0,
    directionCount: 0,
    averageObservedHeadwayMinutes: null,
    medianObservedHeadwayMinutes: null,
    p90ObservedHeadwayMinutes: null,
    maxObservedHeadwayMinutes: null,
    scheduledMedianHeadwayMinutes: null,
    bunchingThresholdMinutes: null,
    longGapThresholdMinutes: null,
    observedBunchingShare: null,
    observedLongGapShare: null,
    expectedWaitMinutes: null,
    scheduledExpectedWaitMinutes: null,
    excessWaitMinutes: null,
    waitReliabilityRatio: null,
  };
}

function statusFor(summary: SummaryRow): string {
  return summary.sampleCount >= summary.minSampleThreshold ? "available" : "insufficient_samples";
}

function sourceStatuses(summaries: readonly SummaryRow[]) {
  return summaries.flatMap((summary) =>
    sourceIds.map((metricSourceId) => ({
      routeId: summary.routeId,
      month: summary.month,
      sourceScope: "reliability",
      sourceId: metricSourceId,
      status: statusFor(summary),
      rowCount: summary.sampleCount,
      snapshotId: summary.runId,
      note:
        summary.reliabilityStatus === "observed"
          ? `${summary.sampleCount} third-party recovered Bus Observatory samples; source ${sourceId}.`
          : `No third-party recovered Bus Observatory samples for this route; source ${sourceId}.`,
    })),
  );
}

export async function importBusObservatoryReliabilitySummary(
  args: ImportBusObservatoryReliabilitySummaryArgs,
): Promise<ImportBusObservatoryReliabilitySummaryResult> {
  const context = createMonthContext(args);
  const runId = requireString("--run-id", args.runId);
  const summaryCsv = requireString("--summary-csv", args.summaryCsv);
  const fillCatalog = args.fillCatalog ?? true;
  const csvRows = await readSummaryCsv(summaryCsv);
  const selectedRows = csvRows.filter(
    (row) => row.month === context.isoMonth && row.runId === runId,
  );

  return withLocalPipelineDb(context.dbPath, async (local) => {
    const catalog = fillCatalog ? await listRouteCatalog(local.db) : [];
    const catalogRouteIds = new Set(catalog.map((route) => route.routeId));
    const matchedRows =
      fillCatalog && catalogRouteIds.size > 0
        ? selectedRows.filter((row) => catalogRouteIds.has(row.routeId))
        : selectedRows;
    const skippedNonCatalogRouteCount = selectedRows.length - matchedRows.length;
    const summariesByRoute = new Map(matchedRows.map((row) => [row.routeId, row]));
    if (fillCatalog) {
      for (const route of catalog) {
        if (!summariesByRoute.has(route.routeId)) {
          summariesByRoute.set(
            route.routeId,
            insufficientSummary({ routeId: route.routeId, month: context.isoMonth, runId }),
          );
        }
      }
    }

    const summaries = [...summariesByRoute.values()].sort((left, right) =>
      left.routeId.localeCompare(right.routeId),
    );
    await replaceRouteObservedReliabilityRows(local.db, context.isoMonth, runId, {
      summaries,
      sourceStatuses: sourceStatuses(summaries),
    });

    return {
      month: context.isoMonth,
      runId,
      provenance: "third_party_recovered",
      sourceId,
      summaryCsv,
      routeCount: summaries.length,
      observedRouteCount: summaries.filter((summary) => summary.reliabilityStatus === "observed")
        .length,
      insufficientRouteCount: summaries.filter(
        (summary) => summary.reliabilityStatus === "insufficient_gtfs_rt_samples",
      ).length,
      sampleCount: summaries.reduce((sum, summary) => sum + summary.sampleCount, 0),
      skippedNonCatalogRouteCount,
    };
  });
}

function parseCliArgs(args: string[]): ImportBusObservatoryReliabilitySummaryArgs {
  const extraOptions: CliOption<ImportBusObservatoryReliabilitySummaryArgs>[] = [
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--summary-csv"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.summaryCsv = fromCliPath(value);
        }
      },
    },
    trueOption(["--no-fill-catalog"], (target) => {
      target.fillCatalog = false;
    }),
  ];

  return parseMonthDbCliArgs(args, {} as ImportBusObservatoryReliabilitySummaryArgs, extraOptions);
}

export async function importBusObservatoryReliabilitySummaryFromCli(
  args: string[],
): Promise<ImportBusObservatoryReliabilitySummaryResult> {
  return importBusObservatoryReliabilitySummary(parseCliArgs(args));
}
