import { listAceRoutesForRoute, listAceViolationSummariesForRoute } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { aceInterventionSummary } from "./route-brief-metrics.js";

const schemaVersion = 1;

type InterventionOverlayArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type InterventionOverlayResult = {
  routeId: string;
  isoMonth: string;
  overlayPath: string;
  aceRouteMatchCount: number;
  activeProgramCount: number;
};

function parseBuildArgs(args: InterventionOverlayArgs): Required<InterventionOverlayArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): InterventionOverlayArgs {
  return parseCliOptions<InterventionOverlayArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
}

export async function buildM1InterventionOverlay(
  args: InterventionOverlayArgs = {},
): Promise<InterventionOverlayResult> {
  const options = parseBuildArgs(args);
  const routeId = z.decode(RouteIdCodec, options.routeId);
  const month = isoMonth(options.year, options.month);
  const local = await openLocalPipelineDb(options.dbPath);
  const [routeMatches, routeViolations] = await Promise.all([
    listAceRoutesForRoute(local.db, routeId),
    listAceViolationSummariesForRoute(local.db, routeId, month),
  ]);
  local.sqlite.close();
  const ace = aceInterventionSummary({
    acePrograms: routeMatches,
    aceViolations: routeViolations,
    year: options.year,
    month: options.month,
  });
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
        verifiedAt: null,
      },
      {
        sourceId: "ace_violations",
        title: "MTA Bus Automated Camera Enforcement Violations",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm",
        verifiedAt: null,
      },
    ],
    ace: {
      routeMatched: routeMatches.length > 0,
      routeMatchCount: routeMatches.length,
      activeDuringAnalysisPeriod: ace.activePrograms.length > 0,
      activePrograms: ace.activePrograms,
      futurePrograms: ace.futurePrograms,
    },
    violations: {
      analysisPeriod: month,
      routeViolationCount: ace.routeViolationCount,
      groupedRowCount: routeViolations.length,
      violationTypeCounts: ace.violationTypeCounts,
    },
    caveats: [
      "ACE route matching is route-level only; this does not prove segment-level camera coverage.",
      "Implementation dates do not measure enforcement intensity or violation volume.",
      "Violation counts are grouped monthly records from the public ACE violations dataset, not all obstructing events.",
      "No before/after causal effect is computed in this overlay.",
    ],
  };

  const overlayPath = await writeRouteSliceArtifact(
    routeId,
    month,
    "intervention-overlay.json",
    overlay,
  );

  return {
    routeId,
    isoMonth: month,
    overlayPath,
    aceRouteMatchCount: routeMatches.length,
    activeProgramCount: ace.activePrograms.length,
  };
}

export async function buildM1InterventionOverlayFromCli(
  args: string[],
): Promise<InterventionOverlayResult> {
  return buildM1InterventionOverlay(parseCliArgs(args));
}
