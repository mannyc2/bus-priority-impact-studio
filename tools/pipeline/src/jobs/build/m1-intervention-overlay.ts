import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { RouteIdCodec } from "@bp/domain";
import { NormalizedAceRouteSchema, NormalizedAceViolationSummarySchema } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const AceRoutesArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.literal("ace_routes"),
    fetchedAt: z.iso.datetime(),
    rows: z.array(NormalizedAceRouteSchema),
  })
  .strict();

const AceViolationSummaryArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.literal("ace_violations"),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    fetchedAt: z.iso.datetime(),
    rows: z.array(NormalizedAceViolationSummarySchema),
  })
  .strict();

type InterventionOverlayArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  interventionDir?: string;
};

type InterventionOverlayResult = {
  routeId: string;
  isoMonth: string;
  overlayPath: string;
  aceRouteMatchCount: number;
  activeProgramCount: number;
};

function monthEndIso(year: number, month: number): string {
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  return monthEnd.toISOString();
}

function parseBuildArgs(args: InterventionOverlayArgs): Required<InterventionOverlayArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    interventionDir: args.interventionDir ?? fromRepoRoot(join("data/working/interventions")),
  };
}

function parseCliArgs(args: string[]): InterventionOverlayArgs {
  const output: InterventionOverlayArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--route" && value !== undefined) {
      output.routeId = value;
      index += 1;
      continue;
    }

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function buildM1InterventionOverlay(
  args: InterventionOverlayArgs = {},
): Promise<InterventionOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const month = isoMonth(options.year, options.month);
  const analysisPeriodEnd = monthEndIso(options.year, options.month);
  const artifactDir = fromRepoRoot(
    join("data/artifacts/route-slices", routeSliceKey(routeId, month)),
  );
  const overlayPath = join(artifactDir, "intervention-overlay.json");
  const aceRoutesPath = join(options.interventionDir, "ace-routes.json");
  const aceViolationsPath = join(options.interventionDir, `ace-violations-${month}.json`);
  const aceRoutes = AceRoutesArtifactSchema.parse(await Bun.file(aceRoutesPath).json());
  const aceViolations = AceViolationSummaryArtifactSchema.parse(
    await Bun.file(aceViolationsPath).json(),
  );
  const routeMatches = aceRoutes.rows.filter((row) => row.routeId === routeId);
  const activePrograms = routeMatches.filter((row) => row.implementationDate <= analysisPeriodEnd);
  const routeViolations = aceViolations.rows.filter((row) => row.routeId === routeId);
  const routeViolationCount = routeViolations.reduce((sum, row) => sum + row.violationCount, 0);
  const violationTypeCounts = [...new Set(routeViolations.map((row) => row.violationType))]
    .sort()
    .map((violationType) => ({
      violationType,
      violationCount: routeViolations
        .filter((row) => row.violationType === violationType)
        .reduce((sum, row) => sum + row.violationCount, 0),
    }));
  const overlay = {
    schemaVersion,
    routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        sourceId: "ace_routes",
        title: "MTA Bus Automated Camera Enforced Routes",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y",
        verifiedAt: aceRoutes.fetchedAt,
      },
      {
        sourceId: "ace_violations",
        title: "MTA Bus Automated Camera Enforcement Violations",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm",
        verifiedAt: aceViolations.fetchedAt,
      },
    ],
    ace: {
      routeMatched: routeMatches.length > 0,
      routeMatchCount: routeMatches.length,
      activeDuringAnalysisPeriod: activePrograms.length > 0,
      activePrograms,
      futurePrograms: routeMatches.filter((row) => row.implementationDate > analysisPeriodEnd),
    },
    violations: {
      analysisPeriod: aceViolations.isoMonth,
      routeViolationCount,
      groupedRowCount: routeViolations.length,
      violationTypeCounts,
    },
    caveats: [
      "ACE route matching is route-level only; this does not prove segment-level camera coverage.",
      "Implementation dates do not measure enforcement intensity or violation volume.",
      "Violation counts are grouped monthly records from the public ACE violations dataset, not all obstructing events.",
      "No before/after causal effect is computed in this overlay.",
    ],
  };

  await mkdir(artifactDir, { recursive: true });
  await writeJson(overlayPath, overlay);

  return {
    routeId,
    isoMonth: month,
    overlayPath,
    aceRouteMatchCount: routeMatches.length,
    activeProgramCount: activePrograms.length,
  };
}

export async function buildM1InterventionOverlayFromCli(
  args: string[],
): Promise<InterventionOverlayResult> {
  return buildM1InterventionOverlay(parseCliArgs(args));
}
