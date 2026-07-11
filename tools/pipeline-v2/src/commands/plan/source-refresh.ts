import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import type { SocrataManifestSource } from "@bp/sources/registry";
import { Effect } from "effect";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";
import {
  type RouteSpeedAvailabilityResult,
  runRouteSpeedAvailability,
} from "../check/route-speed-availability.ts";

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
  artifactPath: string;
};

export function sourceRefreshPlanArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-refresh", "plan.json");
}

export async function readSourceRefreshPlanArtifact(
  artifactRoot: string,
): Promise<SourceRefreshPlan | null> {
  const file = Bun.file(sourceRefreshPlanArtifactPath(artifactRoot));
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as SourceRefreshPlan;
  } catch {
    return null;
  }
}

function buildJobs(input: {
  requestedMonth: string | null;
  lastBuiltMonth: string | null;
  routeSpeedAvailability: RouteSpeedAvailabilityResult;
  gtfsRtSampleSeconds: number;
}): SourceRefreshPlanJob[] {
  const { routeSpeedAvailability: rsa } = input;
  const latestCompleteMonth = rsa.releaseDecision.latestCompleteMonth ?? "none";
  const watcherStatus: SourceRefreshPlanJob["status"] = rsa.releaseDecision.shouldRebuild
    ? "ready_to_rebuild"
    : rsa.releaseDecision.status === "no_complete_speed_month"
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
      status: watcherStatus,
      evidence: `Latest complete speed month is ${latestCompleteMonth}; requested month is ${
        input.requestedMonth ?? "not provided"
      }; last built month is ${input.lastBuiltMonth ?? "not provided"}; rebuild decision is ${
        rsa.releaseDecision.status
      } with shouldRebuild=${rsa.releaseDecision.shouldRebuild}.`,
      nextActions: rsa.releaseDecision.shouldRebuild
        ? [
            `Run ingest/build/finalize for ${rsa.releaseDecision.latestCompleteMonth}.`,
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

export type SourceRefreshPlanInputs = {
  startYear?: number | undefined;
  endYear?: number | undefined;
  year?: number | undefined;
  month?: number | undefined;
  lastBuiltYear?: number | undefined;
  lastBuiltMonth?: number | undefined;
  minSpeedRoutes?: number | undefined;
  gtfsRtSampleSeconds?: number | undefined;
  artifactRoot?: string | undefined;
  outputPath?: string | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  source?: SocrataManifestSource | undefined;
};

export async function runSourceRefreshPlan(
  opts: SourceRefreshPlanInputs = {},
): Promise<SourceRefreshPlan> {
  if ((opts.year === undefined) !== (opts.month === undefined)) {
    throw new Error("year and month must be provided together");
  }
  if ((opts.lastBuiltYear === undefined) !== (opts.lastBuiltMonth === undefined)) {
    throw new Error("lastBuiltYear and lastBuiltMonth must be provided together");
  }

  const artifactRoot = opts.artifactRoot ?? defaultArtifactRootPath();
  const gtfsRtSampleSeconds = opts.gtfsRtSampleSeconds ?? 30;
  if (gtfsRtSampleSeconds < 1) {
    throw new Error(`gtfsRtSampleSeconds must be at least 1. Received ${gtfsRtSampleSeconds}.`);
  }

  const routeSpeedAvailability = await runRouteSpeedAvailability({
    artifactRoot,
    startYear: opts.startYear,
    endYear: opts.endYear,
    year: opts.year,
    month: opts.month,
    lastBuiltYear: opts.lastBuiltYear,
    lastBuiltMonth: opts.lastBuiltMonth,
    minSpeedRoutes: opts.minSpeedRoutes,
    fetcher: opts.fetcher,
    manifestText: opts.manifestText,
    source: opts.source,
  });

  const requestedMonth =
    opts.year !== undefined && opts.month !== undefined ? isoMonth(opts.year, opts.month) : null;
  const lastBuiltMonth =
    opts.lastBuiltYear !== undefined && opts.lastBuiltMonth !== undefined
      ? isoMonth(opts.lastBuiltYear, opts.lastBuiltMonth)
      : null;
  const artifactPath = opts.outputPath ?? sourceRefreshPlanArtifactPath(artifactRoot);

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

export default defineCommand({
  path: ["plan", "source-refresh"],
  summary: "Write the production source-refresh plan for GTFS-RT and monthly speed data.",
  input: {
    options: Schema.Struct({
      startYear: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Start of year range for the speed watcher",
      }),
      endYear: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "End of year range for the speed watcher",
      }),
      year: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Requested calendar year (with --month)",
      }),
      month: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Requested calendar month, 1-12 (with --year)",
      }),
      lastBuiltYear: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Last built calendar year",
      }),
      lastBuiltMonth: Schema.optionalKey(arg.positiveInt()).annotate({
        description: "Last built calendar month",
      }),
      minSpeedRoutes: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
        .annotate({ description: "Minimum routes for a 'complete' month" }),
      gtfsRtSampleSeconds: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(30)))
        .annotate({ description: "GTFS-RT collector sample period" }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Override path for the plan JSON",
      }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Artifact root directory",
      }),
    }),
  },
  output: Schema.Struct({
    checkedAt: Schema.String,
    requestedMonth: Schema.NullOr(Schema.String),
    lastBuiltMonth: Schema.NullOr(Schema.String),
    routeSpeedAvailability: Schema.Unknown,
    jobs: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        requiredForV1: Schema.Boolean,
        cadence: Schema.String,
        status: Schema.String,
        evidence: Schema.String,
        nextActions: Schema.Array(Schema.String),
      }),
    ),
    artifactPath: Schema.String,
  }),
  async run({ input }) {
    return runSourceRefreshPlan({
      startYear: input.options.startYear,
      endYear: input.options.endYear,
      year: input.options.year,
      month: input.options.month,
      lastBuiltYear: input.options.lastBuiltYear,
      lastBuiltMonth: input.options.lastBuiltMonth,
      minSpeedRoutes: input.options.minSpeedRoutes,
      gtfsRtSampleSeconds: input.options.gtfsRtSampleSeconds,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      outputPath:
        input.options.output === undefined ? undefined : fromCliPath(input.options.output),
    });
  },
});
