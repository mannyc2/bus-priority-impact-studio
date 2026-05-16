import {
  type LocalAceRoute,
  type LocalRouteMonthTrend,
  listAceRoutes,
  listRouteBriefSummaries,
  listRouteMonthTrends,
  replaceRouteInterventionEvaluationRows,
} from "@bp/db/local";
import { type CliOption, numberOption } from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

const sourceId = "mta_ace_routes";
const defaultWindowMonths = 3;
const defaultMinSampleMonths = 1;

type RouteInterventionEvaluationArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  windowMonths?: number;
  minSampleMonths?: number;
};

type RouteInterventionEvaluationResult = {
  isoMonth: string;
  routeCount: number;
  eventCount: number;
  comparisonCount: number;
  evaluatedComparisonCount: number;
  futureComparisonCount: number;
  insufficientComparisonCount: number;
};

type InterventionEventRow = {
  eventId: string;
  routeId: string;
  interventionType: string;
  sourceId: string;
  program: string;
  implementationDate: string;
  implementationMonth: string;
  eventStatus: string;
  description: string;
};

type TrendWindowSummary = {
  months: string[];
  requestedMonthCount: number;
  speedSampleMonthCount: number;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  ridershipSampleMonthCount: number;
  averageMonthlyRidership: number | null;
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) {
    throw new Error(`Invalid ISO month: ${month}`);
  }

  return year * 12 + monthNumber - 1;
}

function isoMonthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return isoMonth(year, monthNumber);
}

function implementationMonthFromDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = value.match(/^(\d{4})-(\d{2})/);
    if (fallback === null) {
      throw new Error(`Invalid intervention implementation date: ${value}`);
    }

    return `${fallback[1]}-${fallback[2]}`;
  }

  return isoMonth(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
}

function eventIdFor(route: LocalAceRoute): string {
  const dateKey = route.implementationDate.slice(0, 10);
  return `ace:${route.routeId}:${route.program}:${dateKey}`;
}

function monthWindow(startIndex: number, endIndex: number): string[] {
  if (endIndex < startIndex) {
    return [];
  }

  const months: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    months.push(isoMonthFromIndex(index));
  }
  return months;
}

function trendKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function summarizeTrendWindow(input: {
  routeId: string;
  months: string[];
  trendsByRouteMonth: Map<string, LocalRouteMonthTrend>;
}): TrendWindowSummary {
  const rows = input.months
    .map((month) => input.trendsByRouteMonth.get(trendKey(input.routeId, month)))
    .filter((row): row is LocalRouteMonthTrend => row !== undefined);
  const speedRows = rows.filter(
    (row) => row.hasSpeedTrend && row.averageSpeedMph !== null && row.speedObservationCount > 0,
  );
  const ridershipRows = rows.filter(
    (row) => row.hasRidershipTrend && row.ridership !== null && row.ridership > 0,
  );
  const speedObservationCount = speedRows.reduce((sum, row) => sum + row.speedObservationCount, 0);
  const speedBusTripCount = speedRows.reduce((sum, row) => sum + row.speedBusTripCount, 0);
  const averageSpeedMph =
    speedRows.length === 0
      ? null
      : speedBusTripCount > 0
        ? round(
            speedRows.reduce(
              (sum, row) => sum + (row.averageSpeedMph ?? 0) * row.speedBusTripCount,
              0,
            ) / speedBusTripCount,
          )
        : round(
            speedRows.reduce((sum, row) => sum + (row.averageSpeedMph ?? 0), 0) / speedRows.length,
          );
  const averageMonthlyRidership =
    ridershipRows.length === 0
      ? null
      : round(
          ridershipRows.reduce((sum, row) => sum + (row.ridership ?? 0), 0) / ridershipRows.length,
        );

  return {
    months: input.months,
    requestedMonthCount: input.months.length,
    speedSampleMonthCount: speedRows.length,
    speedObservationCount,
    speedBusTripCount,
    averageSpeedMph,
    ridershipSampleMonthCount: ridershipRows.length,
    averageMonthlyRidership,
  };
}

function caveatFor(input: {
  comparisonStatus: string;
  minSampleMonths: number;
  pre: TrendWindowSummary;
  post: TrendWindowSummary;
}): string {
  if (input.comparisonStatus === "future_intervention") {
    return "Implementation is after the analysis month; before/after evaluation is not available yet.";
  }
  if (input.comparisonStatus === "insufficient_pre_data") {
    return `Insufficient pre-period monthly speed trend rows: ${input.pre.speedSampleMonthCount} available, ${input.minSampleMonths} required.`;
  }
  if (input.comparisonStatus === "insufficient_post_data") {
    return `Insufficient post-period monthly speed trend rows: ${input.post.speedSampleMonthCount} available, ${input.minSampleMonths} required.`;
  }

  return "Descriptive before/after only; not seasonality-adjusted and not matched to comparison routes.";
}

function comparisonStatus(input: {
  implementationMonth: string;
  analysisMonth: string;
  minSampleMonths: number;
  pre: TrendWindowSummary;
  post: TrendWindowSummary;
}): "evaluated" | "future_intervention" | "insufficient_pre_data" | "insufficient_post_data" {
  if (monthIndex(input.implementationMonth) > monthIndex(input.analysisMonth)) {
    return "future_intervention";
  }
  if (input.pre.speedSampleMonthCount < input.minSampleMonths) {
    return "insufficient_pre_data";
  }
  if (input.post.speedSampleMonthCount < input.minSampleMonths) {
    return "insufficient_post_data";
  }

  return "evaluated";
}

function eventRow(input: {
  route: LocalAceRoute;
  implementationMonth: string;
  analysisMonth: string;
}): InterventionEventRow {
  return {
    eventId: eventIdFor(input.route),
    routeId: input.route.routeId,
    interventionType: "automated_bus_lane_enforcement",
    sourceId,
    program: input.route.program,
    implementationDate: input.route.implementationDate,
    implementationMonth: input.implementationMonth,
    eventStatus:
      monthIndex(input.implementationMonth) <= monthIndex(input.analysisMonth)
        ? "implemented"
        : "future",
    description: `${input.route.program} automated bus lane enforcement for ${input.route.routeId}`,
  };
}

function buildComparison(input: {
  event: InterventionEventRow;
  analysisMonth: string;
  windowMonths: number;
  minSampleMonths: number;
  trendsByRouteMonth: Map<string, LocalRouteMonthTrend>;
}) {
  const implementationIndex = monthIndex(input.event.implementationMonth);
  const analysisIndex = monthIndex(input.analysisMonth);
  const preMonths = monthWindow(implementationIndex - input.windowMonths, implementationIndex - 1);
  const postMonths = monthWindow(
    implementationIndex + 1,
    Math.min(implementationIndex + input.windowMonths, analysisIndex),
  );
  const pre = summarizeTrendWindow({
    routeId: input.event.routeId,
    months: preMonths,
    trendsByRouteMonth: input.trendsByRouteMonth,
  });
  const post = summarizeTrendWindow({
    routeId: input.event.routeId,
    months: postMonths,
    trendsByRouteMonth: input.trendsByRouteMonth,
  });
  const status = comparisonStatus({
    implementationMonth: input.event.implementationMonth,
    analysisMonth: input.analysisMonth,
    minSampleMonths: input.minSampleMonths,
    pre,
    post,
  });
  const evaluationLevel =
    status === "evaluated"
      ? "descriptive_before_after"
      : status === "future_intervention"
        ? "not_evaluated_future"
        : "insufficient_trend_data";

  return {
    routeId: input.event.routeId,
    month: input.analysisMonth,
    eventId: input.event.eventId,
    interventionType: input.event.interventionType,
    sourceId: input.event.sourceId,
    evaluationLevel,
    comparisonStatus: status,
    preStartMonth: pre.months[0] ?? null,
    preEndMonth: pre.months.at(-1) ?? null,
    postStartMonth: post.months[0] ?? null,
    postEndMonth: post.months.at(-1) ?? null,
    requestedPreMonthCount: pre.requestedMonthCount,
    requestedPostMonthCount: post.requestedMonthCount,
    preSampleMonthCount: pre.speedSampleMonthCount,
    postSampleMonthCount: post.speedSampleMonthCount,
    preSpeedObservationCount: pre.speedObservationCount,
    postSpeedObservationCount: post.speedObservationCount,
    preAverageSpeedMph: pre.averageSpeedMph,
    postAverageSpeedMph: post.averageSpeedMph,
    speedDeltaMph:
      pre.averageSpeedMph === null || post.averageSpeedMph === null
        ? null
        : round(post.averageSpeedMph - pre.averageSpeedMph),
    preAverageMonthlyRidership: pre.averageMonthlyRidership,
    postAverageMonthlyRidership: post.averageMonthlyRidership,
    ridershipDelta:
      pre.averageMonthlyRidership === null || post.averageMonthlyRidership === null
        ? null
        : round(post.averageMonthlyRidership - pre.averageMonthlyRidership),
    caveat: caveatFor({
      comparisonStatus: status,
      minSampleMonths: input.minSampleMonths,
      pre,
      post,
    }),
  };
}

function parseCliArgs(args: string[]): RouteInterventionEvaluationArgs {
  const extraOptions: CliOption<RouteInterventionEvaluationArgs>[] = [
    numberOption(["--window-months"], (output, value) => {
      output.windowMonths = value;
    }),
    numberOption(["--min-sample-months"], (output, value) => {
      output.minSampleMonths = value;
    }),
  ];

  return parseMonthDbCliArgs(args, {} as RouteInterventionEvaluationArgs, extraOptions);
}

export async function buildRouteInterventionEvaluation(
  args: RouteInterventionEvaluationArgs = {},
): Promise<RouteInterventionEvaluationResult> {
  const options = createMonthContext(args);
  const windowMonths = Math.max(1, Math.round(args.windowMonths ?? defaultWindowMonths));
  const minSampleMonths = Math.max(1, Math.round(args.minSampleMonths ?? defaultMinSampleMonths));

  const { routeCount, events, comparisons } = await withLocalPipelineDb(
    options.dbPath,
    async (local) => {
      const [briefs, aceRoutes, trends] = await Promise.all([
        listRouteBriefSummaries(local.db, options.isoMonth),
        listAceRoutes(local.db),
        listRouteMonthTrends(local.db),
      ]);
      const publicRouteIds = new Set(
        briefs.filter((brief) => brief.publicVisible).map((brief) => brief.routeId),
      );
      const relevantAceRoutes = aceRoutes.filter((route) => publicRouteIds.has(route.routeId));
      const trendsByRouteMonth = new Map(
        trends.map((trend) => [trendKey(trend.routeId, trend.month), trend]),
      );
      const events = relevantAceRoutes.map((route) =>
        eventRow({
          route,
          implementationMonth: implementationMonthFromDate(route.implementationDate),
          analysisMonth: options.isoMonth,
        }),
      );
      const comparisons = events.map((event) =>
        buildComparison({
          event,
          analysisMonth: options.isoMonth,
          windowMonths,
          minSampleMonths,
          trendsByRouteMonth,
        }),
      );

      return {
        routeCount: publicRouteIds.size,
        events,
        comparisons,
      };
    },
  );

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteInterventionEvaluationRows(local.db, options.isoMonth, sourceId, {
      events,
      comparisons,
    }),
  );

  return {
    isoMonth: options.isoMonth,
    routeCount,
    eventCount: events.length,
    comparisonCount: comparisons.length,
    evaluatedComparisonCount: comparisons.filter(
      (comparison) => comparison.comparisonStatus === "evaluated",
    ).length,
    futureComparisonCount: comparisons.filter(
      (comparison) => comparison.comparisonStatus === "future_intervention",
    ).length,
    insufficientComparisonCount: comparisons.filter((comparison) =>
      comparison.comparisonStatus.startsWith("insufficient_"),
    ).length,
  };
}

export function buildRouteInterventionEvaluationFromCli(
  args: string[],
): Promise<RouteInterventionEvaluationResult> {
  return buildRouteInterventionEvaluation(parseCliArgs(args));
}
