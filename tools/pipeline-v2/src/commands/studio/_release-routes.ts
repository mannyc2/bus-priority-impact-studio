import type {
  RouteArtifactRow,
  RouteBriefSummary,
  RouteInterventionComparison,
  RouteMonthTrend,
  RouteObservedReliabilitySummary,
  RouteReadiness,
} from "@bp/db";
import type { StudioSpeedPercentileContext } from "@bp/domain/studio/docs";
import type { StudioObservedReliability, StudioRouteArtifactRef } from "@bp/domain/studio/routes";
import { longNameEndpoints } from "./_release-geometry.ts";
import { routeRiderDelayHours, routeScheduledSpeedMph } from "./_release-segments.ts";
import type {
  RouteBriefInputArtifact,
  RouteBriefTopStopBoardings,
  RouteGeometrySummary,
  SpeedPercentileResult,
  StudioIntervention,
  StudioRoute,
  StudioSegment,
  TspEvidence,
} from "./_release-types.ts";

export function routeIdToSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function routeLabel(readiness: RouteReadiness): string {
  return readiness.routeShortName.replace("-SBS", "");
}

export function routeBorough(routeId: string): string {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) return "Bronx";
  if (upper.startsWith("B")) return "Brooklyn";
  if (upper.startsWith("Q")) return "Queens";
  if (upper.startsWith("S")) return "Staten Island";
  return "Manhattan";
}

export function routeObservedSpeed(summary: RouteBriefSummary, readiness: RouteReadiness): number {
  return Number((summary.averageSpeedMph || readiness.averageSpeedMph || 0).toFixed(1));
}

export function daysInIsoMonth(month: string): number {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return 30;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function previousYearMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  const parsedYear = Number(year);
  return Number.isInteger(parsedYear) && monthNumber !== undefined
    ? `${parsedYear - 1}-${monthNumber}`
    : month;
}

export function averageCalendarDayRiders(monthlyRidership: number, month: string): number {
  return Math.round(monthlyRidership / daysInIsoMonth(month));
}

export function routeRidershipSpark(
  routeTrends: readonly RouteMonthTrend[],
  currentMonth: string,
): { values: number[]; months: string[] } {
  const points = routeTrends
    .filter((row) => row.month <= currentMonth && row.ridership !== null && row.ridership > 0)
    .toSorted((left, right) => left.month.localeCompare(right.month))
    .slice(-7);

  return {
    values: points.map((row) => averageCalendarDayRiders(row.ridership ?? 0, row.month)),
    months: points.map((row) => row.month),
  };
}

export function routeRidersYoyPct(
  summary: RouteBriefSummary,
  routeTrends: readonly RouteMonthTrend[],
): number | null {
  const currentRidership =
    routeTrends.find((row) => row.month === summary.month)?.ridership ?? summary.totalRidership;
  const priorRidership =
    routeTrends.find((row) => row.month === previousYearMonth(summary.month))?.ridership ?? null;
  if (currentRidership <= 0 || priorRidership === null || priorRidership <= 0) {
    return null;
  }
  return Number((((currentRidership - priorRidership) / priorRidership) * 100).toFixed(1));
}

export function routeRidershipProfile(
  artifact: RouteBriefInputArtifact | null,
): StudioRoute["ridershipProfile"] {
  const profile = artifact?.ridershipProfile;
  if (profile === undefined) return null;
  return {
    peakRidershipWindow: profile.peakRidershipWindow ?? null,
    topRidershipWindows: profile.topRidershipWindows ?? [],
    slowCrowdedWindows: profile.slowCrowdedWindows ?? [],
    hourlyBoardings: profile.hourlyBoardings ?? null,
    topStopBoardings:
      profile.topStopBoardings ??
      ({
        coverage: "not_available",
        sourceId: null,
        sourceLabel: null,
        window: null,
        unavailableReason:
          "Stop-level boarding counts require an APC or equivalent stop-level boarding source.",
        stops: [],
      } satisfies RouteBriefTopStopBoardings),
  };
}

function clampSpeedPercentile(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function speedPercentileContext(
  rank: number,
  routeCount: number,
): StudioSpeedPercentileContext {
  return {
    metric: "observed_speed_mph",
    peerUniverse: "public_routes",
    peerUniverseLabel: "public route speeds",
    rank,
    routeCount,
    direction: "higher_speed_higher_percentile",
  };
}

function empiricalSpeedPercentiles(
  rows: readonly { routeId: string; speedMph: number }[],
): Map<string, SpeedPercentileResult> {
  const sorted = rows
    .filter((row) => Number.isFinite(row.speedMph))
    .toSorted(
      (left, right) => left.speedMph - right.speedMph || left.routeId.localeCompare(right.routeId),
    );
  const result = new Map<string, SpeedPercentileResult>();
  if (sorted.length === 0) return result;
  if (sorted.length === 1) {
    result.set(sorted[0]?.routeId ?? "", {
      percentile: 50,
      ...speedPercentileContext(1, 1),
    });
    return result;
  }

  let index = 0;
  while (index < sorted.length) {
    const start = index;
    const speedMph = sorted[index]?.speedMph;
    while (index + 1 < sorted.length && sorted[index + 1]?.speedMph === speedMph) {
      index += 1;
    }
    const averageRank = (start + 1 + index + 1) / 2;
    const percentile = clampSpeedPercentile(1 + ((averageRank - 1) / (sorted.length - 1)) * 98);
    const context = speedPercentileContext(Math.round(averageRank), sorted.length);
    for (let rowIndex = start; rowIndex <= index; rowIndex += 1) {
      const row = sorted[rowIndex];
      if (row !== undefined) result.set(row.routeId, { percentile, ...context });
    }
    index += 1;
  }

  return result;
}

export function speedPercentilesForSummaries(
  summaries: readonly RouteBriefSummary[],
  readinessByRoute: ReadonlyMap<string, RouteReadiness>,
): Map<string, SpeedPercentileResult> {
  return empiricalSpeedPercentiles(
    summaries.flatMap((summary) => {
      const readiness = readinessByRoute.get(summary.routeId);
      return readiness === undefined
        ? []
        : [{ routeId: summary.routeId, speedMph: routeObservedSpeed(summary, readiness) }];
    }),
  );
}

export function descriptivePeerSlugsForSummaries(
  summaries: readonly RouteBriefSummary[],
  readinessByRoute: ReadonlyMap<string, RouteReadiness>,
): Map<string, string | null> {
  const candidates = summaries.flatMap((summary) => {
    const readiness = readinessByRoute.get(summary.routeId);
    return readiness === undefined
      ? []
      : [{ routeId: summary.routeId, speedMph: routeObservedSpeed(summary, readiness) }];
  });

  return new Map(
    candidates.map((target) => {
      const peer =
        candidates
          .filter((candidate) => candidate.routeId !== target.routeId)
          .toSorted((left, right) => {
            const speedDelta =
              Math.abs(left.speedMph - target.speedMph) -
              Math.abs(right.speedMph - target.speedMph);
            if (speedDelta !== 0) return speedDelta;
            return left.routeId.localeCompare(right.routeId);
          })[0] ?? null;
      return [target.routeId, peer === null ? null : routeIdToSlug(peer.routeId)];
    }),
  );
}

export function qualityCaveats(month: string): string[] {
  return [
    `Studio projections are generated from the ${month} D1 serving export and generated route/brief artifacts.`,
    "Route length and endpoint labels are derived from the current MTA route-shape and stop snapshots.",
    "Transit Signal Priority status comes from the ingested 2017 NYC DOT TSP status snapshot; unknown means no positive evidence in ingested TSP sources, not confirmed absence.",
    "Realtime reliability is included only where the serving export contains observed reliability rows.",
    "Narrative text is deterministic copy generated from public serving metrics, not an official agency grade.",
  ];
}

export function buildObservedReliability(
  row: RouteObservedReliabilitySummary | undefined,
): StudioObservedReliability | null {
  if (row === undefined) return null;
  const source: StudioObservedReliability["source"] = row.runId.startsWith("bus-observatory-")
    ? "third_party_recovered"
    : "official_self_collected";
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : ["Observed reliability comes from self-collected MTA Bus Time GTFS-RT snapshots."];
  if (row.reliabilityStatus === "insufficient_gtfs_rt_samples") {
    caveats.push(
      `Sample count (${row.sampleCount}) is below the minimum threshold (${row.minSampleThreshold}); headway statistics are not reported.`,
    );
  }
  return {
    month: row.month,
    runId: row.runId,
    source,
    releaseLayer: "observed_release",
    reliabilityStatus: row.reliabilityStatus,
    sampleCount: row.sampleCount,
    medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
    p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
    observedBunchingShare: row.observedBunchingShare,
    observedLongGapShare: row.observedLongGapShare,
    excessWaitMinutes: row.excessWaitMinutes,
    caveats,
  };
}

export function buildRouteArtifactRef(row: RouteArtifactRow): StudioRouteArtifactRef {
  return {
    routeId: row.route_id,
    month: row.month,
    name: row.artifact_name,
    key: row.artifact_key,
    contentType: row.content_type,
    byteLength: row.byte_length,
    sha256: row.sha256,
  };
}

export function earliestAceInterventionMonth(
  comparisons: readonly RouteInterventionComparison[],
): string | null {
  return (
    comparisons
      .filter(
        (comparison) =>
          comparison.eventStatus !== "source_gap" &&
          comparison.interventionType === "automated_bus_lane_enforcement",
      )
      .map((comparison) => comparison.implementationMonth)
      .toSorted()[0] ?? null
  );
}

/** §16-D3 (C3): % speed change vs exactly `monthsBack` months before the latest speed month. */
export function routeSpeedMovementPct(
  routeTrends: readonly RouteMonthTrend[],
  upToMonth: string,
  monthsBack: number,
): number | null {
  const speeds = new Map<string, number>();
  let latestMonth: string | null = null;
  for (const row of routeTrends) {
    if (row.month > upToMonth || !row.hasSpeedTrend || row.averageSpeedMph === null) continue;
    speeds.set(row.month, row.averageSpeedMph);
    if (latestMonth === null || row.month > latestMonth) latestMonth = row.month;
  }
  if (latestMonth === null) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(latestMonth);
  if (match === null) return null;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) - monthsBack;
  const priorMonth = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  const latest = speeds.get(latestMonth);
  const prior = speeds.get(priorMonth);
  if (latest === undefined || prior === undefined || prior === 0) return null;
  return Number((((latest - prior) / prior) * 100).toFixed(1));
}

export function routeSpeedSpark(
  routeTrends: readonly RouteMonthTrend[],
  month: string,
  currentSpeedMph: number,
): { values: number[]; months: string[] } {
  const points = routeTrends
    .filter(
      (row) =>
        row.month <= month &&
        row.hasSpeedTrend &&
        row.averageSpeedMph !== null &&
        Number.isFinite(row.averageSpeedMph),
    )
    .toSorted((left, right) => left.month.localeCompare(right.month))
    .slice(-7);

  if (points.length === 0) {
    return { values: [currentSpeedMph], months: [month] };
  }

  return {
    values: points.map((row) => Number((row.averageSpeedMph ?? 0).toFixed(1))),
    months: points.map((row) => row.month),
  };
}

export function buildRoute(
  readiness: RouteReadiness,
  summary: RouteBriefSummary,
  artifact: RouteBriefInputArtifact | null,
  geometry: RouteGeometrySummary | undefined,
  peerSlug: string | null,
  observed: RouteObservedReliabilitySummary | undefined,
  interventionComparisons: readonly RouteInterventionComparison[],
  manualInterventions: readonly StudioIntervention[],
  speedPercentile: SpeedPercentileResult,
  routeTrends: readonly RouteMonthTrend[],
  tspEvidence: TspEvidence,
  buildInterventions: (
    comparisons: readonly RouteInterventionComparison[],
    manual: readonly StudioIntervention[],
  ) => StudioIntervention[],
): StudioRoute {
  const slug = routeIdToSlug(readiness.routeId);
  const speedMph = routeObservedSpeed(summary, readiness);
  const scheduledMph = routeScheduledSpeedMph(readiness.routeId, artifact);
  const coverage = geometry?.laneCoverage ?? 0;
  const coverageSource = geometry?.laneCoverageSource ?? "geometry_unavailable";
  const ridershipSpark = routeRidershipSpark(routeTrends, summary.month);
  const speedSpark = routeSpeedSpark(routeTrends, summary.month, speedMph);

  return {
    slug,
    routeId: readiness.routeId,
    label: routeLabel(readiness),
    corridor: readiness.routeLongName ?? readiness.routeShortName,
    corridorFull: readiness.routeLongName ?? readiness.routeShortName,
    borough: routeBorough(readiness.routeId),
    sbs: readiness.routeId.includes("+") || readiness.routeShortName.includes("SBS"),
    speedMph,
    scheduledMph,
    weightedAvgSpeed: speedMph,
    speedPercentile: speedPercentile.percentile,
    speedPercentileContext: speedPercentileContext(
      speedPercentile.rank,
      speedPercentile.routeCount,
    ),
    dailyRiders: averageCalendarDayRiders(summary.totalRidership, summary.month),
    ridersYoyPct: routeRidersYoyPct(summary, routeTrends) ?? 0,
    ridershipSpark: ridershipSpark.values,
    ridershipSparkMonths: ridershipSpark.months,
    ridershipProfile: routeRidershipProfile(artifact),
    riderHoursLost: routeRiderDelayHours(readiness.routeId, artifact),
    laneCoverage: coverage,
    laneCoverageSource: coverageSource,
    laneTypes: geometry?.laneTypes ?? [],
    laneOperatingHours: geometry?.laneOperatingHours ?? [],
    laneOperatingDays: geometry?.laneOperatingDays ?? [],
    aceStatus: summary.aceActive ? "active" : "none",
    aceSince: summary.aceActive ? earliestAceInterventionMonth(interventionComparisons) : null,
    tspStatus: tspEvidence.tspStatus,
    tspSource: tspEvidence.tspSource,
    tspSourceDate: tspEvidence.tspSourceDate,
    tspSourceUrl: tspEvidence.tspSourceUrl,
    tspCorridor: tspEvidence.tspCorridor,
    tspMatchMethod: tspEvidence.tspMatchMethod,
    reliability:
      summary.routeScore >= 70
        ? "Studio high-attention band"
        : summary.routeScore >= 40
          ? "Studio watch band"
          : "Studio lower-attention band",
    observedReliability: buildObservedReliability(observed),
    spark: speedSpark.values,
    sparkMonths: speedSpark.months,
    endpoints:
      geometry?.endpoints ?? longNameEndpoints(readiness.routeLongName, readiness.routeShortName),
    miles: geometry?.miles ?? Number(Math.max(1, readiness.shapeCount * 1.2).toFixed(1)),
    stops: readiness.stopCount,
    flags: [
      summary.aceActive ? "ACE active" : "ACE inactive",
      coverage > 0 ? "Bus lane matched" : "No matched bus lane",
      tspEvidence.tspStatus === "installed"
        ? "TSP snapshot match"
        : tspEvidence.tspStatus === "candidate"
          ? "TSP snapshot candidate"
          : "TSP unknown",
    ],
    peerSlug,
    movement6mPct: routeSpeedMovementPct(routeTrends, summary.month, 6),
    context12mPct: routeSpeedMovementPct(routeTrends, summary.month, 12),
    interventions: buildInterventions(interventionComparisons, manualInterventions),
  };
}

// Helper used by intervention assembly
export function routeKey(routeId: string): string {
  return routeId.toUpperCase().replace(/\+$/u, "");
}

// Re-export for orchestrator
export type { StudioRoute, StudioSegment };
