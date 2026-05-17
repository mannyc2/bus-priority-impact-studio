import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RouteIdCodec } from "@bp/domain";
import type { SocrataFetch, SocrataRow, SocrataRowsQuery } from "@bp/sources";
import { getSocrataSource, SocrataClient } from "@bp/sources";
import * as z from "zod";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { readSourceManifest } from "../../source-manifest.js";

type RouteSpeedAvailabilitySourceId = "bus_segment_speeds_2025";

type RouteSpeedAvailabilityArgs = {
  startYear?: number;
  endYear?: number;
  year?: number;
  month?: number;
  lastBuiltYear?: number;
  lastBuiltMonth?: number;
  minSpeedRoutes?: number;
  outputPath?: string;
  artifactRoot?: string;
  fetcher?: SocrataFetch;
};

export type RouteSpeedAvailabilityMonth = {
  isoMonth: string;
  year: number;
  month: number;
  routeCount: number;
  rowCount: number;
  busTripCount: number;
  status: "complete" | "insufficient_speed_routes";
};

export type RequestedRouteSpeedAvailability = {
  isoMonth: string;
  year: number;
  month: number;
  routeCount: number;
  rowCount: number;
  busTripCount: number;
  status: "complete" | "insufficient_speed_routes" | "missing_speed";
};

export type RouteSpeedAvailabilityResult = {
  sourceId: RouteSpeedAvailabilitySourceId;
  checkedAt: string;
  startYear: number;
  endYear: number;
  minSpeedRoutes: number;
  latestSpeedMonth: RouteSpeedAvailabilityMonth | null;
  requestedMonth: RequestedRouteSpeedAvailability | null;
  releaseDecision: {
    status: "new_complete_month_available" | "no_new_complete_month" | "no_complete_speed_month";
    latestCompleteMonth: string | null;
    lastBuiltMonth: string | null;
    shouldRebuild: boolean;
    reason: string;
  };
  months: RouteSpeedAvailabilityMonth[];
  artifactPath?: string;
};

const RawRouteSpeedAvailabilityRowSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    route_id: z.string().min(1),
    row_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative().default(0),
  })
  .passthrough();

const RouteSpeedAvailabilityMonthSchema = z.object({
  isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  routeCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  busTripCount: z.number().int().nonnegative(),
  status: z.enum(["complete", "insufficient_speed_routes"]),
});

const RequestedRouteSpeedAvailabilitySchema = RouteSpeedAvailabilityMonthSchema.extend({
  status: z.enum(["complete", "insufficient_speed_routes", "missing_speed"]),
});

export const RouteSpeedAvailabilityResultSchema = z.object({
  sourceId: z.literal("bus_segment_speeds_2025"),
  checkedAt: z.string().min(1),
  startYear: z.number().int(),
  endYear: z.number().int(),
  minSpeedRoutes: z.number().int().positive(),
  latestSpeedMonth: RouteSpeedAvailabilityMonthSchema.nullable(),
  requestedMonth: RequestedRouteSpeedAvailabilitySchema.nullable(),
  releaseDecision: z.object({
    status: z.enum([
      "new_complete_month_available",
      "no_new_complete_month",
      "no_complete_speed_month",
    ]),
    latestCompleteMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    lastBuiltMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    shouldRebuild: z.boolean(),
    reason: z.string().min(1),
  }),
  months: z.array(RouteSpeedAvailabilityMonthSchema),
  artifactPath: z.string().min(1).optional(),
});

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseIntegerFlag(args: string[], name: string): number | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args.at(index + 1);
  if (value === undefined) {
    throw new Error(`Missing value for ${name}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }

  return parsed;
}

function parseStringFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args.at(index + 1);
  if (value === undefined) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function parseCliArgs(args: string[]): RouteSpeedAvailabilityArgs {
  const parsed: RouteSpeedAvailabilityArgs = {};
  const startYear = parseIntegerFlag(args, "--start-year");
  const endYear = parseIntegerFlag(args, "--end-year");
  const year = parseIntegerFlag(args, "--year");
  const month = parseIntegerFlag(args, "--month");
  const lastBuiltYear = parseIntegerFlag(args, "--last-built-year");
  const lastBuiltMonth = parseIntegerFlag(args, "--last-built-month");
  const minSpeedRoutes = parseIntegerFlag(args, "--min-speed-routes");
  const outputPath = parseStringFlag(args, "--output");
  const artifactRoot = parseStringFlag(args, "--artifact-root");

  if (startYear !== undefined) {
    parsed.startYear = startYear;
  }
  if (endYear !== undefined) {
    parsed.endYear = endYear;
  }
  if (year !== undefined) {
    parsed.year = year;
  }
  if (month !== undefined) {
    parsed.month = month;
  }
  if (lastBuiltYear !== undefined) {
    parsed.lastBuiltYear = lastBuiltYear;
  }
  if (lastBuiltMonth !== undefined) {
    parsed.lastBuiltMonth = lastBuiltMonth;
  }
  if (minSpeedRoutes !== undefined) {
    parsed.minSpeedRoutes = minSpeedRoutes;
  }
  if (outputPath !== undefined) {
    parsed.outputPath = fromCliPath(outputPath);
  }
  if (artifactRoot !== undefined) {
    parsed.artifactRoot = fromCliPath(artifactRoot);
  }

  return parsed;
}

export function routeSpeedAvailabilityArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-availability", "route-speed-availability.json");
}

function parseOptions(args: RouteSpeedAvailabilityArgs = {}): Required<
  Omit<RouteSpeedAvailabilityArgs, "outputPath">
> & {
  outputPath?: string;
} {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const startYear = args.startYear ?? currentYear - 1;
  const endYear = args.endYear ?? currentYear;
  const minSpeedRoutes = args.minSpeedRoutes ?? 1;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();

  if (startYear > endYear) {
    throw new Error(`startYear must be <= endYear. Received ${startYear} > ${endYear}.`);
  }
  if (minSpeedRoutes < 1) {
    throw new Error(`minSpeedRoutes must be at least 1. Received ${minSpeedRoutes}.`);
  }
  if ((args.year === undefined) !== (args.month === undefined)) {
    throw new Error("--year and --month must be provided together.");
  }
  if ((args.lastBuiltYear === undefined) !== (args.lastBuiltMonth === undefined)) {
    throw new Error("--last-built-year and --last-built-month must be provided together.");
  }

  return {
    startYear,
    endYear,
    year: args.year ?? 0,
    month: args.month ?? 0,
    lastBuiltYear: args.lastBuiltYear ?? 0,
    lastBuiltMonth: args.lastBuiltMonth ?? 0,
    minSpeedRoutes,
    artifactRoot,
    fetcher: args.fetcher ?? fetch,
    ...(args.outputPath !== undefined ? { outputPath: args.outputPath } : {}),
  };
}

async function fetchAvailabilityRows(
  source: SocrataManifestSource,
  query: SocrataRowsQuery,
  fetcher: SocrataFetch,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows(query);
}

function summarizeSpeedMonths(
  rows: SocrataRow[],
  minSpeedRoutes: number,
): RouteSpeedAvailabilityMonth[] {
  const monthRows = new Map<
    string,
    { year: number; month: number; routes: Set<string>; rowCount: number; busTripCount: number }
  >();

  for (const row of rows) {
    const parsed = RawRouteSpeedAvailabilityRowSchema.parse(row);
    const monthKey = isoMonth(parsed.year, parsed.month);
    const existing = monthRows.get(monthKey) ?? {
      year: parsed.year,
      month: parsed.month,
      routes: new Set<string>(),
      rowCount: 0,
      busTripCount: 0,
    };

    existing.routes.add(z.decode(RouteIdCodec, parsed.route_id));
    existing.rowCount += parsed.row_count;
    existing.busTripCount += parsed.bus_trip_count;
    monthRows.set(monthKey, existing);
  }

  return [...monthRows.entries()]
    .map(([monthKey, value]) => {
      const routeCount = value.routes.size;

      return {
        isoMonth: monthKey,
        year: value.year,
        month: value.month,
        routeCount,
        rowCount: value.rowCount,
        busTripCount: value.busTripCount,
        status: routeCount >= minSpeedRoutes ? "complete" : "insufficient_speed_routes",
      } satisfies RouteSpeedAvailabilityMonth;
    })
    .sort((left, right) => right.isoMonth.localeCompare(left.isoMonth));
}

function requestedStatus(
  months: RouteSpeedAvailabilityMonth[],
  year: number,
  month: number,
): RequestedRouteSpeedAvailability {
  const monthKey = isoMonth(year, month);
  const found = months.find((candidate) => candidate.isoMonth === monthKey);

  if (found !== undefined) {
    return found;
  }

  return {
    isoMonth: monthKey,
    year,
    month,
    routeCount: 0,
    rowCount: 0,
    busTripCount: 0,
    status: "missing_speed",
  };
}

function releaseDecision(input: {
  latestSpeedMonth: RouteSpeedAvailabilityMonth | null;
  lastBuiltYear: number;
  lastBuiltMonth: number;
}): RouteSpeedAvailabilityResult["releaseDecision"] {
  const latestCompleteMonth = input.latestSpeedMonth?.isoMonth ?? null;
  const lastBuiltMonth =
    input.lastBuiltYear > 0 && input.lastBuiltMonth > 0
      ? isoMonth(input.lastBuiltYear, input.lastBuiltMonth)
      : null;

  if (latestCompleteMonth === null) {
    return {
      status: "no_complete_speed_month",
      latestCompleteMonth,
      lastBuiltMonth,
      shouldRebuild: false,
      reason: "No complete route segment speed month is available in the checked range.",
    };
  }

  if (lastBuiltMonth === null || latestCompleteMonth > lastBuiltMonth) {
    return {
      status: "new_complete_month_available",
      latestCompleteMonth,
      lastBuiltMonth,
      shouldRebuild: true,
      reason:
        lastBuiltMonth === null
          ? `Latest complete speed month is ${latestCompleteMonth}; no last built month was provided.`
          : `Latest complete speed month ${latestCompleteMonth} is newer than last built month ${lastBuiltMonth}.`,
    };
  }

  return {
    status: "no_new_complete_month",
    latestCompleteMonth,
    lastBuiltMonth,
    shouldRebuild: false,
    reason: `Latest complete speed month ${latestCompleteMonth} is not newer than last built month ${lastBuiltMonth}.`,
  };
}

export async function checkRouteSpeedAvailability(
  args: RouteSpeedAvailabilityArgs = {},
): Promise<RouteSpeedAvailabilityResult> {
  const options = parseOptions(args);
  const manifest = await readSourceManifest();
  const speedSource = getSocrataSource(
    manifest,
    "bus_segment_speeds_2025" satisfies RouteSpeedAvailabilitySourceId,
  );
  const query: SocrataRowsQuery = {
    select: "year,month,route_id,count(*) as row_count,sum(bus_trip_count) as bus_trip_count",
    where: `year between ${options.startYear} and ${options.endYear}`,
    group: "year,month,route_id",
    order: "year DESC,month DESC,route_id",
  };
  const rows = await fetchAvailabilityRows(speedSource, query, options.fetcher);
  const months = summarizeSpeedMonths(rows, options.minSpeedRoutes);
  const latestSpeedMonth = months.find((month) => month.status === "complete") ?? null;
  const requestedMonth =
    options.year > 0 && options.month > 0
      ? requestedStatus(months, options.year, options.month)
      : null;
  const decision = releaseDecision({
    latestSpeedMonth,
    lastBuiltYear: options.lastBuiltYear,
    lastBuiltMonth: options.lastBuiltMonth,
  });
  const artifactPath =
    options.outputPath ?? routeSpeedAvailabilityArtifactPath(options.artifactRoot);
  const result: RouteSpeedAvailabilityResult = {
    sourceId: "bus_segment_speeds_2025",
    checkedAt: new Date().toISOString(),
    startYear: options.startYear,
    endYear: options.endYear,
    minSpeedRoutes: options.minSpeedRoutes,
    latestSpeedMonth,
    requestedMonth,
    releaseDecision: decision,
    months,
    artifactPath,
  };

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, result);

  return result;
}

export async function checkRouteSpeedAvailabilityFromCli(
  args: string[],
): Promise<RouteSpeedAvailabilityResult> {
  return checkRouteSpeedAvailability(parseCliArgs(args));
}

export async function readRouteSpeedAvailabilityArtifact(
  artifactRoot: string,
): Promise<RouteSpeedAvailabilityResult | null> {
  const path = routeSpeedAvailabilityArtifactPath(artifactRoot);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  const parsed = RouteSpeedAvailabilityResultSchema.parse(await file.json());
  const { artifactPath, ...rest } = parsed;

  return artifactPath === undefined ? rest : { ...rest, artifactPath };
}
