import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { nextIsoMonthStart } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import {
  buildSupplementalRouteEvidenceContext,
  type SupplementalRouteEvidenceContext,
} from "./findings.js";

type Args = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  output?: string;
};

export type FindingContextAppendixRoute = {
  routeId: string;
  weatherReliability: unknown | null;
  equity: unknown | null;
  trafficVolume: unknown | null;
  currentTrafficSpeed: unknown | null;
};

type WeatherReliabilityContextValue =
  SupplementalRouteEvidenceContext["weatherReliabilityByRoute"] extends Map<string, infer Value>
    ? Value
    : never;

type ControlStatus = "available" | "partial" | "missing";
type PlannedServiceMatchMethod = "exact_stop_hour" | "route_hour_fallback" | "mixed" | "none";

type CountBy<T extends string> = Record<T, number>;

export type WeatherReliabilityControlSummary = {
  plannedServiceControlStatusCounts: CountBy<ControlStatus>;
  plannedServiceBestMatchMethodCounts: CountBy<PlannedServiceMatchMethod>;
  passengerLoadControlStatusCounts: CountBy<ControlStatus>;
  incidentControlStatusCounts: CountBy<ControlStatus>;
};

export type FindingContextAppendixArtifact = {
  artifactKind: "finding_context_appendix";
  schemaVersion: 1;
  month: string;
  generatedAt: string;
  summary: {
    routeCount: number;
    weatherAvailable: boolean;
    weatherReliabilityRouteCount: number;
    sufficientWeatherReliabilityRouteCount: number;
    equityRouteCount: number;
    trafficVolumeRouteCount: number;
    currentTrafficSpeedRouteCount: number;
    trafficVolumeSourceMonths: string[];
    currentTrafficSpeedDays: string[];
    weatherReliabilityControls: WeatherReliabilityControlSummary;
  };
  weather: unknown | null;
  routes: FindingContextAppendixRoute[];
};

export type FindingContextAppendixResult = {
  isoMonth: string;
  routeCount: number;
  weatherAvailable: boolean;
  weatherReliabilityRouteCount: number;
  sufficientWeatherReliabilityRouteCount: number;
  equityRouteCount: number;
  trafficVolumeRouteCount: number;
  currentTrafficSpeedRouteCount: number;
  weatherReliabilityControls: WeatherReliabilityControlSummary;
  artifactPath: string;
};

function parseCliArgs(args: string[]): Args {
  return parseMonthDbCliArgs(args, {} as Args, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
  ]);
}

export function findingContextAppendixPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "context-appendix.json");
}

function sourceMonths(values: Iterable<{ sourceMonth?: unknown }>): string[] {
  return [
    ...new Set(
      [...values]
        .map((value) => value.sourceMonth)
        .filter((value): value is string => typeof value === "string"),
    ),
  ].sort();
}

function currentSignalDays(values: Iterable<{ currentSignalDay?: unknown }>): string[] {
  return [
    ...new Set(
      [...values]
        .map((value) => value.currentSignalDay)
        .filter((value): value is string => typeof value === "string"),
    ),
  ].sort();
}

function emptyCountBy<T extends string>(keys: readonly T[]): CountBy<T> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as CountBy<T>;
}

function weatherReliabilityControlSummary(
  values: Iterable<WeatherReliabilityContextValue>,
): WeatherReliabilityControlSummary {
  const summary = {
    plannedServiceControlStatusCounts: emptyCountBy(["available", "partial", "missing"] as const),
    plannedServiceBestMatchMethodCounts: emptyCountBy([
      "exact_stop_hour",
      "route_hour_fallback",
      "mixed",
      "none",
    ] as const),
    passengerLoadControlStatusCounts: emptyCountBy(["available", "partial", "missing"] as const),
    incidentControlStatusCounts: emptyCountBy(["available", "partial", "missing"] as const),
  } satisfies WeatherReliabilityControlSummary;

  for (const value of values) {
    summary.plannedServiceControlStatusCounts[value.plannedServiceControlStatus] += 1;
    summary.plannedServiceBestMatchMethodCounts[value.plannedServiceBestMatchMethod] += 1;
    summary.passengerLoadControlStatusCounts[value.passengerLoadControlStatus] += 1;
    summary.incidentControlStatusCounts[value.incidentControlStatus] += 1;
  }

  return summary;
}

export async function buildFindingContextAppendix(
  args: Args = {},
): Promise<FindingContextAppendixResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const artifactPath = args.output ?? findingContextAppendixPath(artifactRoot, options.isoMonth);
  const generatedAt = new Date().toISOString();
  const monthEndDate = nextIsoMonthStart(options.year, options.month).slice(0, 10);

  const artifact = await withLocalPipelineDb(options.dbPath, (local) => {
    const context = buildSupplementalRouteEvidenceContext({
      sqlite: local.sqlite,
      month: options.isoMonth,
      monthEndDate,
    });
    const routeIds = [
      ...new Set([
        ...context.weatherReliabilityByRoute.keys(),
        ...context.equityByRoute.keys(),
        ...context.trafficVolumeByRoute.keys(),
        ...context.currentTrafficSpeedByRoute.keys(),
      ]),
    ].sort((left, right) => left.localeCompare(right));

    return {
      artifactKind: "finding_context_appendix",
      schemaVersion: 1,
      month: options.isoMonth,
      generatedAt,
      summary: {
        routeCount: routeIds.length,
        weatherAvailable: context.weather !== null,
        weatherReliabilityRouteCount: context.weatherReliabilityByRoute.size,
        sufficientWeatherReliabilityRouteCount: [
          ...context.weatherReliabilityByRoute.values(),
        ].filter((row) => row.sampleSupport === "sufficient_split").length,
        equityRouteCount: context.equityByRoute.size,
        trafficVolumeRouteCount: context.trafficVolumeByRoute.size,
        currentTrafficSpeedRouteCount: context.currentTrafficSpeedByRoute.size,
        trafficVolumeSourceMonths: sourceMonths(context.trafficVolumeByRoute.values()),
        currentTrafficSpeedDays: currentSignalDays(context.currentTrafficSpeedByRoute.values()),
        weatherReliabilityControls: weatherReliabilityControlSummary(
          context.weatherReliabilityByRoute.values(),
        ),
      },
      weather: context.weather,
      routes: routeIds.map((routeId) => ({
        routeId,
        weatherReliability: context.weatherReliabilityByRoute.get(routeId) ?? null,
        equity: context.equityByRoute.get(routeId) ?? null,
        trafficVolume: context.trafficVolumeByRoute.get(routeId) ?? null,
        currentTrafficSpeed: context.currentTrafficSpeedByRoute.get(routeId) ?? null,
      })),
    } satisfies FindingContextAppendixArtifact;
  });

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, artifact);

  return {
    isoMonth: options.isoMonth,
    routeCount: artifact.summary.routeCount,
    weatherAvailable: artifact.summary.weatherAvailable,
    weatherReliabilityRouteCount: artifact.summary.weatherReliabilityRouteCount,
    sufficientWeatherReliabilityRouteCount: artifact.summary.sufficientWeatherReliabilityRouteCount,
    equityRouteCount: artifact.summary.equityRouteCount,
    trafficVolumeRouteCount: artifact.summary.trafficVolumeRouteCount,
    currentTrafficSpeedRouteCount: artifact.summary.currentTrafficSpeedRouteCount,
    weatherReliabilityControls: artifact.summary.weatherReliabilityControls,
    artifactPath,
  };
}

export async function buildFindingContextAppendixFromCli(
  args: string[],
): Promise<FindingContextAppendixResult> {
  const result = await buildFindingContextAppendix(parseCliArgs(args));
  const controls = result.weatherReliabilityControls;
  console.log(
    `finding-context-appendix ${result.isoMonth}: routes=${result.routeCount} weather=${result.weatherAvailable} weatherReliabilityRoutes=${result.weatherReliabilityRouteCount} sufficientWeatherReliabilityRoutes=${result.sufficientWeatherReliabilityRouteCount} plannedServiceAvailable=${controls.plannedServiceControlStatusCounts.available} passengerLoadAvailable=${controls.passengerLoadControlStatusCounts.available} incidentAvailable=${controls.incidentControlStatusCounts.available} equityRoutes=${result.equityRouteCount} trafficVolumeRoutes=${result.trafficVolumeRouteCount} currentTrafficSpeedRoutes=${result.currentTrafficSpeedRouteCount} artifact=${result.artifactPath}`,
  );
  return result;
}
