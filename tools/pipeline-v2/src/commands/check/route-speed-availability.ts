import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RouteIdCodec } from "@bp/domain";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@liche/core";
import * as zodLib from "zod";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

export const RouteSpeedAvailabilitySourceId = "bus_segment_speeds_2025" as const;
export type RouteSpeedAvailabilitySourceId = typeof RouteSpeedAvailabilitySourceId;

export type RouteSpeedAvailabilityMonth = {
  isoMonth: string;
  year: number;
  month: number;
  routeCount: number;
  rowCount: number;
  busTripCount: number;
  status: "complete" | "insufficient_speed_routes";
};

export type RequestedRouteSpeedAvailability = Omit<RouteSpeedAvailabilityMonth, "status"> & {
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
  artifactPath: string;
};

const RawRowSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    route_id: z.string().min(1),
    row_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative().default(0),
  })
  .passthrough();

function summarizeSpeedMonths(
  rows: readonly SocrataRow[],
  minSpeedRoutes: number,
): RouteSpeedAvailabilityMonth[] {
  const monthRows = new Map<
    string,
    { year: number; month: number; routes: Set<string>; rowCount: number; busTripCount: number }
  >();

  for (const row of rows) {
    const parsed = RawRowSchema.parse(row);
    const monthKey = isoMonth(parsed.year, parsed.month);
    const existing = monthRows.get(monthKey) ?? {
      year: parsed.year,
      month: parsed.month,
      routes: new Set<string>(),
      rowCount: 0,
      busTripCount: 0,
    };

    existing.routes.add(zodLib.decode(RouteIdCodec, parsed.route_id));
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
  const found = months.find((m) => m.isoMonth === monthKey);
  return (
    found ?? {
      isoMonth: monthKey,
      year,
      month,
      routeCount: 0,
      rowCount: 0,
      busTripCount: 0,
      status: "missing_speed",
    }
  );
}

function releaseDecision(input: {
  latestSpeedMonth: RouteSpeedAvailabilityMonth | null;
  lastBuiltYear: number | undefined;
  lastBuiltMonth: number | undefined;
}): RouteSpeedAvailabilityResult["releaseDecision"] {
  const latestCompleteMonth = input.latestSpeedMonth?.isoMonth ?? null;
  const lastBuiltMonth =
    input.lastBuiltYear !== undefined && input.lastBuiltMonth !== undefined
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

export function routeSpeedAvailabilityArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-availability", "route-speed-availability.json");
}

export async function readRouteSpeedAvailabilityArtifact(
  artifactRoot: string,
): Promise<RouteSpeedAvailabilityResult | null> {
  const file = Bun.file(routeSpeedAvailabilityArtifactPath(artifactRoot));
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as RouteSpeedAvailabilityResult;
  } catch {
    return null;
  }
}

export type RouteSpeedAvailabilityInputs = {
  startYear?: number | undefined;
  endYear?: number | undefined;
  year?: number | undefined;
  month?: number | undefined;
  lastBuiltYear?: number | undefined;
  lastBuiltMonth?: number | undefined;
  minSpeedRoutes?: number | undefined;
  artifactRoot?: string | undefined;
  outputPath?: string | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  source?: SocrataManifestSource | undefined;
};

function pairInvariants(opts: RouteSpeedAvailabilityInputs): void {
  if ((opts.year === undefined) !== (opts.month === undefined)) {
    throw new Error("year and month must be provided together");
  }
  if ((opts.lastBuiltYear === undefined) !== (opts.lastBuiltMonth === undefined)) {
    throw new Error("lastBuiltYear and lastBuiltMonth must be provided together");
  }
}

export async function runRouteSpeedAvailability(
  opts: RouteSpeedAvailabilityInputs = {},
): Promise<RouteSpeedAvailabilityResult> {
  pairInvariants(opts);

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const startYear = opts.startYear ?? currentYear - 1;
  const endYear = opts.endYear ?? currentYear;
  const minSpeedRoutes = opts.minSpeedRoutes ?? 1;
  const artifactRoot = opts.artifactRoot ?? defaultArtifactRootPath();

  if (startYear > endYear) {
    throw new Error(`startYear must be <= endYear. Received ${startYear} > ${endYear}.`);
  }
  if (minSpeedRoutes < 1) {
    throw new Error(`minSpeedRoutes must be at least 1. Received ${minSpeedRoutes}.`);
  }

  const source =
    opts.source ??
    getSocrataSource(
      loadSourceManifestYaml(
        opts.manifestText ??
          (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text()),
      ),
      RouteSpeedAvailabilitySourceId,
    );

  const query: Soda3SoqlQuery = {
    select: "year,month,route_id,count(*) as row_count,sum(bus_trip_count) as bus_trip_count",
    where: `year between ${startYear} and ${endYear}`,
    group: "year,month,route_id",
    order: "year DESC,month DESC,route_id",
  };

  const rows = await fetchSoda3RowsForSource(source, query, { fetcher: opts.fetcher });
  const months = summarizeSpeedMonths(rows, minSpeedRoutes);
  const latestSpeedMonth = months.find((m) => m.status === "complete") ?? null;
  const requestedMonth =
    opts.year !== undefined && opts.month !== undefined
      ? requestedStatus(months, opts.year, opts.month)
      : null;
  const decision = releaseDecision({
    latestSpeedMonth,
    lastBuiltYear: opts.lastBuiltYear,
    lastBuiltMonth: opts.lastBuiltMonth,
  });
  const artifactPath = opts.outputPath ?? routeSpeedAvailabilityArtifactPath(artifactRoot);

  const result: RouteSpeedAvailabilityResult = {
    sourceId: RouteSpeedAvailabilitySourceId,
    checkedAt: new Date().toISOString(),
    startYear,
    endYear,
    minSpeedRoutes,
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

export default defineCommand({
  path: ["check", "route-speed-availability"],
  summary: "Check Socrata bus segment speeds for a complete route-speed month.",
  input: {
    options: z.object({
      startYear: arg
        .positiveInt()
        .optional()
        .describe("Start of year range (defaults to last year)"),
      endYear: arg
        .positiveInt()
        .optional()
        .describe("End of year range (defaults to current year)"),
      year: arg.positiveInt().optional().describe("Requested calendar year (with --month)"),
      month: arg.positiveInt().optional().describe("Requested calendar month, 1-12 (with --year)"),
      lastBuiltYear: arg
        .positiveInt()
        .optional()
        .describe("Last built calendar year (with --last-built-month)"),
      lastBuiltMonth: arg
        .positiveInt()
        .optional()
        .describe("Last built calendar month, 1-12 (with --last-built-year)"),
      minSpeedRoutes: arg
        .positiveInt()
        .default(1)
        .describe("Minimum distinct route count for a 'complete' month"),
      output: z.string().optional().describe("Override path for the artifact JSON"),
      artifactRoot: z
        .string()
        .optional()
        .describe("Artifact root directory (defaults to data/artifacts/)"),
    }),
  },
  output: z.object({
    sourceId: z.literal(RouteSpeedAvailabilitySourceId),
    checkedAt: z.string(),
    startYear: z.number(),
    endYear: z.number(),
    minSpeedRoutes: z.number(),
    months: z.array(z.unknown()),
    latestSpeedMonth: z.unknown().nullable(),
    requestedMonth: z.unknown().nullable(),
    releaseDecision: z.object({
      status: z.string(),
      latestCompleteMonth: z.string().nullable(),
      lastBuiltMonth: z.string().nullable(),
      shouldRebuild: z.boolean(),
      reason: z.string(),
    }),
    artifactPath: z.string(),
  }),
  async run({ input }) {
    return runRouteSpeedAvailability({
      startYear: input.options.startYear,
      endYear: input.options.endYear,
      year: input.options.year,
      month: input.options.month,
      lastBuiltYear: input.options.lastBuiltYear,
      lastBuiltMonth: input.options.lastBuiltMonth,
      minSpeedRoutes: input.options.minSpeedRoutes,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      outputPath:
        input.options.output === undefined ? undefined : fromCliPath(input.options.output),
    });
  },
});
