import { arg, defineCommand, z } from "@liche/core";
import {
  type LocalRouteObservedReliabilitySummary,
  listRouteCatalog,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

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

export type ImportBusObservatoryReliabilitySummaryInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  runId: string;
  summaryCsv: string;
  fillCatalog?: boolean | undefined;
};

export type ImportBusObservatoryReliabilitySummaryResult = {
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
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(name: string, value: string | undefined): number {
  const parsed = numberOrNull(value);
  if (parsed === null) throw new Error(`Missing or invalid ${name}`);
  return Math.trunc(parsed);
}

function text(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) throw new Error(`Missing ${name}`);
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
  if (headerLine === undefined) return rows;
  const headers = parseCsvLine(headerLine);
  for (const line of lines) rows.push(parseSummary(headers, line));
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

export async function runImportBusObservatoryReliabilitySummary(
  inputs: ImportBusObservatoryReliabilitySummaryInputs,
): Promise<ImportBusObservatoryReliabilitySummaryResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const fillCatalog = inputs.fillCatalog ?? true;
  const csvRows = await readSummaryCsv(inputs.summaryCsv);
  const selectedRows = csvRows.filter(
    (row) => row.month === monthKey && row.runId === inputs.runId,
  );
  const catalog = fillCatalog ? await listRouteCatalog(inputs.local.db) : [];
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
          insufficientSummary({ routeId: route.routeId, month: monthKey, runId: inputs.runId }),
        );
      }
    }
  }

  const summaries = [...summariesByRoute.values()].sort((l, r) =>
    l.routeId.localeCompare(r.routeId),
  );
  await replaceRouteObservedReliabilityRows(inputs.local.db, monthKey, inputs.runId, {
    summaries,
    sourceStatuses: sourceStatuses(summaries),
  });

  return {
    month: monthKey,
    runId: inputs.runId,
    provenance: "third_party_recovered",
    sourceId,
    summaryCsv: inputs.summaryCsv,
    routeCount: summaries.length,
    observedRouteCount: summaries.filter((s) => s.reliabilityStatus === "observed").length,
    insufficientRouteCount: summaries.filter(
      (s) => s.reliabilityStatus === "insufficient_gtfs_rt_samples",
    ).length,
    sampleCount: summaries.reduce((sum, s) => sum + s.sampleCount, 0),
    skippedNonCatalogRouteCount,
  };
}

export default defineCommand({
  path: ["import", "bus-observatory-reliability-summary"],
  summary:
    "Import a Bus Observatory recovered reliability summary CSV into route_observed_reliability.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      runId: z.string().min(1).describe("Collection run identifier"),
      summaryCsv: z.string().min(1).describe("Path to per-route summary CSV"),
      fillCatalog: z.coerce
        .boolean()
        .default(true)
        .describe("Fill missing catalog routes with insufficient placeholders"),
    }),
  },
  output: z.object({
    month: z.string(),
    runId: z.string(),
    provenance: z.string(),
    sourceId: z.string(),
    summaryCsv: z.string(),
    routeCount: z.number(),
    observedRouteCount: z.number(),
    insufficientRouteCount: z.number(),
    sampleCount: z.number(),
    skippedNonCatalogRouteCount: z.number(),
  }),
  async run({ input }) {
    const summaryCsv = fromCliPath(input.options.summaryCsv);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "import.bus-observatory-reliability-summary",
      operation: "runImportBusObservatoryReliabilitySummary",
      spanAttributes: {
        runId: input.options.runId,
        year: input.options.year,
        month: input.options.month,
        fillCatalog: input.options.fillCatalog,
      },
      run: (local) =>
        runImportBusObservatoryReliabilitySummary({
          local,
          year: input.options.year,
          month: input.options.month,
          runId: input.options.runId,
          summaryCsv,
          fillCatalog: input.options.fillCatalog,
        }),
    });
  },
});
