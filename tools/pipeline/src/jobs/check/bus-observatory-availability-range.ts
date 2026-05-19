import { type CliOption, parseCliOptions } from "../../lib/cli-args.js";
import { fromCliPath } from "../../lib/paths.js";
import {
  type BusObservatoryAvailabilityResult,
  checkBusObservatoryAvailability,
} from "./bus-observatory-availability.js";

type BusObservatoryAvailabilityRangeArgs = {
  sinceYear?: number;
  sinceMonth?: number;
  untilYear?: number;
  untilMonth?: number;
  artifactRoot?: string;
};

type BusObservatoryAvailabilityRangeResult = {
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

function parseMonth(value: string | undefined, label: string): { year: number; month: number } {
  if (value === undefined) throw new Error(`Missing required argument: --${label}`);
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

function compareMonth(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return a.year - b.year || a.month - b.month;
}

function parseArgs(args: string[]): BusObservatoryAvailabilityRangeArgs {
  const output: BusObservatoryAvailabilityRangeArgs = {};
  const options: CliOption<BusObservatoryAvailabilityRangeArgs>[] = [
    {
      flags: ["--since"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "since");
        target.sinceYear = year;
        target.sinceMonth = month;
      },
    },
    {
      flags: ["--until"],
      apply: (target, value) => {
        const { year, month } = parseMonth(value, "until");
        target.untilYear = year;
        target.untilMonth = month;
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (target, value) => {
        if (value !== undefined) target.artifactRoot = fromCliPath(value);
      },
    },
  ];
  return parseCliOptions(args, output, options);
}

export async function checkBusObservatoryAvailabilityRange(
  args: BusObservatoryAvailabilityRangeArgs,
): Promise<BusObservatoryAvailabilityRangeResult> {
  if (args.sinceYear === undefined || args.sinceMonth === undefined) {
    throw new Error("Missing required argument: --since YYYY-MM");
  }
  if (args.untilYear === undefined || args.untilMonth === undefined) {
    throw new Error("Missing required argument: --until YYYY-MM");
  }
  const since = { year: args.sinceYear, month: args.sinceMonth };
  const until = { year: args.untilYear, month: args.untilMonth };
  if (compareMonth(since, until) > 0) {
    throw new Error(`--since (${isoMonth(since.year, since.month)}) must be <= --until (${isoMonth(until.year, until.month)})`);
  }

  const months: BusObservatoryAvailabilityRangeResult["months"] = [];
  let totalFileCount = 0;
  let totalSizeBytes = 0;
  let cursor = since;
  while (compareMonth(cursor, until) <= 0) {
    const monthLabel = isoMonth(cursor.year, cursor.month);
    process.stdout.write(`check:bus-observatory-gtfs-rt-range: ${monthLabel}\n`);
    const result = await checkBusObservatoryAvailability({
      year: cursor.year,
      month: cursor.month,
      ...(args.artifactRoot !== undefined ? { artifactRoot: args.artifactRoot } : {}),
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

export async function checkBusObservatoryAvailabilityRangeFromCli(
  args: string[],
): Promise<BusObservatoryAvailabilityRangeResult> {
  return checkBusObservatoryAvailabilityRange(parseArgs(args));
}
