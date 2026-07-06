import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { routeSpeedAvailabilityArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedAvailabilityResult,
  ROUTE_SPEED_AVAILABILITY_SOURCE_ID,
  type RouteSpeedAvailabilityResult,
  type RouteSpeedAvailabilitySourceId as RouteSpeedAvailabilitySourceIdValue,
} from "@bp/analytics/evaluation";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

export const RouteSpeedAvailabilitySourceId: RouteSpeedAvailabilitySourceIdValue =
  ROUTE_SPEED_AVAILABILITY_SOURCE_ID;
export type { RouteSpeedAvailabilityResult };

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
      ROUTE_SPEED_AVAILABILITY_SOURCE_ID,
    );

  const query: Soda3SoqlQuery = {
    select: "year,month,route_id,count(*) as row_count,sum(bus_trip_count) as bus_trip_count",
    where: `year between ${startYear} and ${endYear}`,
    group: "year,month,route_id",
    order: "year DESC,month DESC,route_id",
  };

  const rows = await fetchSoda3RowsForSource(source, query, { fetcher: opts.fetcher });
  const artifactPath = opts.outputPath ?? routeSpeedAvailabilityArtifactPath(artifactRoot);
  const result = buildRouteSpeedAvailabilityResult({
    rows,
    checkedAt: new Date().toISOString(),
    startYear,
    endYear,
    minSpeedRoutes,
    artifactPath,
    requestedYear: opts.year,
    requestedMonth: opts.month,
    lastBuiltYear: opts.lastBuiltYear,
    lastBuiltMonth: opts.lastBuiltMonth,
  });

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
    sourceId: z.literal(ROUTE_SPEED_AVAILABILITY_SOURCE_ID),
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
