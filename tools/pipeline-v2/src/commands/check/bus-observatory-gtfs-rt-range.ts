import { defineCommand, z } from "@liche/core";
import { fromCliPath } from "../../lib/paths.ts";
import {
  type BusObservatoryAvailabilityResult,
  runCheckBusObservatoryGtfsRt,
} from "./bus-observatory-gtfs-rt.ts";

export type BusObservatoryAvailabilityRangeInputs = {
  sinceYear: number;
  sinceMonth: number;
  untilYear: number;
  untilMonth: number;
  artifactRoot?: string | undefined;
};

export type BusObservatoryAvailabilityRangeResult = {
  sinceMonth: string;
  untilMonth: string;
  monthCount: number;
  totalFileCount: number;
  totalSizeBytes: number;
  months: Array<{
    month: string;
    status: BusObservatoryAvailabilityResult["coverage"]["status"];
    fileCount: number;
    totalSizeBytes: number;
    missingDates: number;
  }>;
};

function parseMonthArg(value: string, label: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--${label} must be YYYY-MM, got: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function stepMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function compareMonth(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  return a.year - b.year || a.month - b.month;
}

export async function runCheckBusObservatoryGtfsRtRange(
  inputs: BusObservatoryAvailabilityRangeInputs,
): Promise<BusObservatoryAvailabilityRangeResult> {
  const since = { year: inputs.sinceYear, month: inputs.sinceMonth };
  const until = { year: inputs.untilYear, month: inputs.untilMonth };
  if (compareMonth(since, until) > 0) {
    throw new Error(
      `--since (${isoMonth(since.year, since.month)}) must be <= --until (${isoMonth(until.year, until.month)})`,
    );
  }

  const months: BusObservatoryAvailabilityRangeResult["months"] = [];
  let totalFileCount = 0;
  let totalSizeBytes = 0;
  let cursor = since;
  while (compareMonth(cursor, until) <= 0) {
    const monthLabel = isoMonth(cursor.year, cursor.month);
    process.stdout.write(`check:bus-observatory-gtfs-rt-range: ${monthLabel}\n`);
    const result = await runCheckBusObservatoryGtfsRt({
      year: cursor.year,
      month: cursor.month,
      artifactRoot: inputs.artifactRoot,
    });
    months.push({
      month: monthLabel,
      status: result.coverage.status,
      fileCount: result.coverage.fileCount,
      totalSizeBytes: result.coverage.totalSizeBytes,
      missingDates: result.coverage.missingMonthFileDates.length,
    });
    totalFileCount += result.coverage.fileCount;
    totalSizeBytes += result.coverage.totalSizeBytes;
    cursor = stepMonth(cursor.year, cursor.month);
  }

  return {
    sinceMonth: isoMonth(since.year, since.month),
    untilMonth: isoMonth(until.year, until.month),
    monthCount: months.length,
    totalFileCount,
    totalSizeBytes,
    months,
  };
}

export default defineCommand({
  path: ["check", "bus-observatory-gtfs-rt-range"],
  summary: "Check Bus Observatory recovered GTFS-RT availability across a month range.",
  input: {
    options: z.object({
      since: z
        .string()
        .regex(/^\d{4}-\d{1,2}$/)
        .describe("Start month, YYYY-MM"),
      until: z
        .string()
        .regex(/^\d{4}-\d{1,2}$/)
        .describe("End month, YYYY-MM"),
      artifactRoot: z.string().optional().describe("Artifact root directory"),
    }),
  },
  output: z.object({
    sinceMonth: z.string(),
    untilMonth: z.string(),
    monthCount: z.number(),
    totalFileCount: z.number(),
    totalSizeBytes: z.number(),
    months: z.array(z.unknown()),
  }),
  async run({ input }) {
    const since = parseMonthArg(input.options.since, "since");
    const until = parseMonthArg(input.options.until, "until");
    return runCheckBusObservatoryGtfsRtRange({
      sinceYear: since.year,
      sinceMonth: since.month,
      untilYear: until.year,
      untilMonth: until.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
    });
  },
});
