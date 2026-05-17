import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SocrataFetch } from "@bp/sources";
import * as z from "zod";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import {
  checkRouteSpeedAvailability,
  type RouteSpeedAvailabilityResult,
  RouteSpeedAvailabilityResultSchema,
} from "./route-speed-availability.js";

type SourceRefreshPlanArgs = {
  startYear?: number;
  endYear?: number;
  year?: number;
  month?: number;
  lastBuiltYear?: number;
  lastBuiltMonth?: number;
  minSpeedRoutes?: number;
  gtfsRtSampleSeconds?: number;
  outputPath?: string;
  artifactRoot?: string;
  fetcher?: SocrataFetch;
};

export type SourceRefreshPlanJob = {
  id: "gtfs_rt_collector" | "route_speed_monthly_watcher";
  requiredForV1: boolean;
  cadence: string;
  status: "required" | "idle" | "ready_to_rebuild" | "blocked";
  evidence: string;
  nextActions: string[];
};

export type SourceRefreshPlan = {
  checkedAt: string;
  requestedMonth: string | null;
  lastBuiltMonth: string | null;
  routeSpeedAvailability: RouteSpeedAvailabilityResult;
  jobs: SourceRefreshPlanJob[];
  artifactPath?: string;
};

export const SourceRefreshPlanSchema = z.object({
  checkedAt: z.string().min(1),
  requestedMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  lastBuiltMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  routeSpeedAvailability: RouteSpeedAvailabilityResultSchema,
  jobs: z.array(
    z.object({
      id: z.enum(["gtfs_rt_collector", "route_speed_monthly_watcher"]),
      requiredForV1: z.boolean(),
      cadence: z.string().min(1),
      status: z.enum(["required", "idle", "ready_to_rebuild", "blocked"]),
      evidence: z.string().min(1),
      nextActions: z.array(z.string().min(1)),
    }),
  ),
  artifactPath: z.string().min(1).optional(),
});

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

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseCliArgs(args: string[]): SourceRefreshPlanArgs {
  const outputPath = parseStringFlag(args, "--output");
  const artifactRoot = parseStringFlag(args, "--artifact-root");
  const parsed: SourceRefreshPlanArgs = {};
  const startYear = parseIntegerFlag(args, "--start-year");
  const endYear = parseIntegerFlag(args, "--end-year");
  const year = parseIntegerFlag(args, "--year");
  const month = parseIntegerFlag(args, "--month");
  const lastBuiltYear = parseIntegerFlag(args, "--last-built-year");
  const lastBuiltMonth = parseIntegerFlag(args, "--last-built-month");
  const minSpeedRoutes = parseIntegerFlag(args, "--min-speed-routes");
  const gtfsRtSampleSeconds = parseIntegerFlag(args, "--gtfs-rt-sample-seconds");

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
  if (gtfsRtSampleSeconds !== undefined) {
    parsed.gtfsRtSampleSeconds = gtfsRtSampleSeconds;
  }
  if (outputPath !== undefined) {
    parsed.outputPath = fromCliPath(outputPath);
  }
  if (artifactRoot !== undefined) {
    parsed.artifactRoot = fromCliPath(artifactRoot);
  }

  return parsed;
}

export function sourceRefreshPlanArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-refresh", "plan.json");
}

function buildJobs(input: {
  requestedMonth: string | null;
  lastBuiltMonth: string | null;
  routeSpeedAvailability: RouteSpeedAvailabilityResult;
  gtfsRtSampleSeconds: number;
}): SourceRefreshPlanJob[] {
  const { routeSpeedAvailability } = input;
  const latestCompleteMonth = routeSpeedAvailability.releaseDecision.latestCompleteMonth ?? "none";
  const routeSpeedWatcherStatus = routeSpeedAvailability.releaseDecision.shouldRebuild
    ? "ready_to_rebuild"
    : routeSpeedAvailability.releaseDecision.status === "no_complete_speed_month"
      ? "blocked"
      : "idle";

  return [
    {
      id: "gtfs_rt_collector",
      requiredForV1: true,
      cadence: `vehicle_positions every ${input.gtfsRtSampleSeconds}s while service is running`,
      status: "required",
      evidence:
        "Bus Time GTFS-RT is live-only for this project; missing collection windows cannot be backfilled from the public feed.",
      nextActions: [
        "Deploy a scheduled collector that does not depend on user request traffic.",
        "Store raw protobuf snapshots in durable object storage with run id, timestamp, checksum, feed type, and redacted source URL metadata.",
        "Run observed monthly promotion checks only after the collected realtime month has matching public speed coverage.",
      ],
    },
    {
      id: "route_speed_monthly_watcher",
      requiredForV1: true,
      cadence: "poll current and previous public months until a new complete speed month appears",
      status: routeSpeedWatcherStatus,
      evidence: `Latest complete speed month is ${latestCompleteMonth}; requested month is ${
        input.requestedMonth ?? "not provided"
      }; last built month is ${input.lastBuiltMonth ?? "not provided"}; rebuild decision is ${
        routeSpeedAvailability.releaseDecision.status
      } with shouldRebuild=${routeSpeedAvailability.releaseDecision.shouldRebuild}.`,
      nextActions: routeSpeedAvailability.releaseDecision.shouldRebuild
        ? [
            `Run ingest/build/finalize for ${routeSpeedAvailability.releaseDecision.latestCompleteMonth}.`,
            "Regenerate D1/static exports and run the v1 audit; promote to an observed monthly release only when same-month GTFS-RT evidence exists.",
          ]
        : [
            "Persist the source-availability artifact.",
            "Keep the current build as the latest public-source release.",
            "Poll again on the next scheduled watcher interval.",
          ],
    },
  ];
}

export async function buildSourceRefreshPlan(
  args: SourceRefreshPlanArgs = {},
): Promise<SourceRefreshPlan> {
  if ((args.year === undefined) !== (args.month === undefined)) {
    throw new Error("--year and --month must be provided together.");
  }
  if ((args.lastBuiltYear === undefined) !== (args.lastBuiltMonth === undefined)) {
    throw new Error("--last-built-year and --last-built-month must be provided together.");
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const gtfsRtSampleSeconds = args.gtfsRtSampleSeconds ?? 30;
  if (gtfsRtSampleSeconds < 1) {
    throw new Error(`gtfsRtSampleSeconds must be at least 1. Received ${gtfsRtSampleSeconds}.`);
  }

  const routeSpeedAvailabilityArgs: Parameters<typeof checkRouteSpeedAvailability>[0] = {
    artifactRoot,
  };
  if (args.startYear !== undefined) {
    routeSpeedAvailabilityArgs.startYear = args.startYear;
  }
  if (args.endYear !== undefined) {
    routeSpeedAvailabilityArgs.endYear = args.endYear;
  }
  if (args.year !== undefined) {
    routeSpeedAvailabilityArgs.year = args.year;
  }
  if (args.month !== undefined) {
    routeSpeedAvailabilityArgs.month = args.month;
  }
  if (args.lastBuiltYear !== undefined) {
    routeSpeedAvailabilityArgs.lastBuiltYear = args.lastBuiltYear;
  }
  if (args.lastBuiltMonth !== undefined) {
    routeSpeedAvailabilityArgs.lastBuiltMonth = args.lastBuiltMonth;
  }
  if (args.minSpeedRoutes !== undefined) {
    routeSpeedAvailabilityArgs.minSpeedRoutes = args.minSpeedRoutes;
  }
  if (args.fetcher !== undefined) {
    routeSpeedAvailabilityArgs.fetcher = args.fetcher;
  }

  const routeSpeedAvailability = await checkRouteSpeedAvailability(routeSpeedAvailabilityArgs);
  const requestedMonth =
    args.year !== undefined && args.month !== undefined ? isoMonth(args.year, args.month) : null;
  const lastBuiltMonth =
    args.lastBuiltYear !== undefined && args.lastBuiltMonth !== undefined
      ? isoMonth(args.lastBuiltYear, args.lastBuiltMonth)
      : null;
  const artifactPath = args.outputPath ?? sourceRefreshPlanArtifactPath(artifactRoot);
  const plan: SourceRefreshPlan = {
    checkedAt: new Date().toISOString(),
    requestedMonth,
    lastBuiltMonth,
    routeSpeedAvailability,
    jobs: buildJobs({
      requestedMonth,
      lastBuiltMonth,
      routeSpeedAvailability,
      gtfsRtSampleSeconds,
    }),
    artifactPath,
  };

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, plan);

  return plan;
}

export async function buildSourceRefreshPlanFromCli(args: string[]): Promise<SourceRefreshPlan> {
  return buildSourceRefreshPlan(parseCliArgs(args));
}

export async function readSourceRefreshPlanArtifact(
  artifactRoot: string,
): Promise<SourceRefreshPlan | null> {
  const path = sourceRefreshPlanArtifactPath(artifactRoot);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  return SourceRefreshPlanSchema.parse(await file.json()) as SourceRefreshPlan;
}
