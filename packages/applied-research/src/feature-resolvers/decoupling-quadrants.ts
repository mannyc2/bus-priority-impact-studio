import type {
  DecouplingReliabilitySourceRow,
  DecouplingRouteTrendSourceRow,
} from "../local-db/decoupling-quadrants-rows";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const DECOUPLING_QUADRANTS_V1_ID = "decoupling_quadrants_v1" as const;
export const ROUTE_DECOUPLING_PANEL_V1_ID = "route_decoupling_panel_v1" as const;

export type DecouplingQuadrantsSpec = {
  readonly panelId: typeof ROUTE_DECOUPLING_PANEL_V1_ID;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly minHistoryMonths: number;
  readonly routeId?: string;
};

export type DecouplingPattern =
  | "speed_worse_ridership_resilient"
  | "speed_better_ridership_down"
  | "speed_worse_reliability_stable_or_better"
  | "reliability_worse_speed_stable_or_better"
  | "slow_but_reliable"
  | "fast_but_unreliable"
  | "coupled_or_weak_signal";

export type DecouplingQuadrantRow = {
  readonly routeId: string;
  readonly month: string;
  readonly pattern: DecouplingPattern;
  readonly reviewQuestion: string;
  readonly speedDeltaMph: number | null;
  readonly ridershipDeltaPct: number | null;
  readonly excessWaitDeltaMinutes: number | null;
  readonly longGapShareDelta: number | null;
  readonly currentSpeedMph: number | null;
  readonly currentRidership: number | null;
  readonly currentExcessWaitMinutes: number | null;
  readonly currentLongGapShare: number | null;
  readonly speedPercentile: number | null;
  readonly reliabilityPainPercentile: number | null;
  readonly historyMonthCount: number;
  readonly reliabilityHistoryMonthCount: number;
  readonly evidence: {
    readonly primary: readonly string[];
    readonly counter: readonly string[];
    readonly caveats: readonly string[];
  };
  readonly reviewDisposition: "internal_lab";
  readonly publicClaimAllowed: false;
};

export type DecouplingQuadrantsArtifactV1 = {
  readonly artifactKind: typeof DECOUPLING_QUADRANTS_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly panelSpec: DecouplingQuadrantsSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly panelRowCount: number;
    readonly routeCount: number;
    readonly supportedSpeedRidershipRowCount: number;
    readonly supportedReliabilityRowCount: number;
    readonly patternCounts: Record<string, number>;
    readonly publicClaimAllowedCount: 0;
  };
  readonly rows: readonly DecouplingQuadrantRow[];
};

type TrendPoint = {
  routeId: string;
  month: string;
  speedObservationCount: number;
  averageSpeedMph: number | null;
  ridership: number | null;
  hasSpeedTrend: boolean;
  hasRidershipTrend: boolean;
};

type ReliabilityPoint = {
  routeId: string;
  month: string;
  supported: boolean;
  observedLongGapShare: number | null;
  excessWaitMinutes: number | null;
  waitReliabilityRatio: number | null;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function percentile(value: number | null, values: readonly number[]): number | null {
  if (value === null || values.length === 0) return null;
  let count = 0;
  for (const candidate of values) if (candidate <= value) count += 1;
  return round(count / values.length);
}

function countValues(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function trendPoint(row: DecouplingRouteTrendSourceRow): TrendPoint {
  return {
    routeId: row.route_id,
    month: row.month,
    speedObservationCount: row.speed_observation_count,
    averageSpeedMph: numberValue(row.average_speed_mph),
    ridership: numberValue(row.ridership),
    hasSpeedTrend: booleanValue(row.has_speed_trend),
    hasRidershipTrend: booleanValue(row.has_ridership_trend),
  };
}

function reliabilityPoint(row: DecouplingReliabilitySourceRow): ReliabilityPoint {
  return {
    routeId: row.route_id,
    month: row.month,
    supported:
      row.reliability_status === "observed" &&
      row.sample_count >= row.min_sample_threshold,
    observedLongGapShare: numberValue(row.observed_long_gap_share),
    excessWaitMinutes: numberValue(row.excess_wait_minutes),
    waitReliabilityRatio: numberValue(row.wait_reliability_ratio),
  };
}

export function decouplingQuadrantsPanelSpecV1(input: DecouplingQuadrantsSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + release_month",
    timeKey: "release_month",
    entityKeys: ["route_id"],
    measures: [
      "speed_delta_mph",
      "ridership_delta_pct",
      "excess_wait_delta_minutes",
      "long_gap_share_delta",
      "speed_percentile",
      "reliability_pain_percentile",
    ],
    joins: ["local_route_month_trend", "local_route_observed_reliability_summary"],
    coverage: ["history_month_count", "reliability_history_month_count", "release_month_support"],
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    releaseFilter: { month: input.releaseMonth },
    requiredProducts: [
      {
        productId: "local_route_month_trends_history",
        state: "available",
        role: "derived",
        reason: "Provides monthly route speed and ridership history.",
      },
      {
        productId: "local_route_observed_reliability_summary_release",
        state: "available",
        role: "derived",
        reason: "Provides observed excess-wait and long-gap reliability context.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_history_months",
        description: "Routes need enough prior months before trend decoupling is interpreted.",
        threshold: input.minHistoryMonths,
      },
    ],
    negativeMeaning:
      "A coupled-or-weak-signal row means no configured decoupling pattern fired; it is not proof the route is uninteresting.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function classify(input: {
  speedDeltaMph: number | null;
  ridershipDeltaPct: number | null;
  excessWaitDeltaMinutes: number | null;
  longGapShareDelta: number | null;
  speedPercentile: number | null;
  reliabilityPainPercentile: number | null;
}): DecouplingPattern {
  const reliabilityStableOrBetter =
    input.excessWaitDeltaMinutes !== null
      ? input.excessWaitDeltaMinutes <= 0
      : input.longGapShareDelta !== null && input.longGapShareDelta <= 0;
  const reliabilityWorse =
    input.excessWaitDeltaMinutes !== null
      ? input.excessWaitDeltaMinutes >= 1
      : input.longGapShareDelta !== null && input.longGapShareDelta >= 0.05;

  if (
    input.speedDeltaMph !== null &&
    input.ridershipDeltaPct !== null &&
    input.speedDeltaMph <= -0.5 &&
    input.ridershipDeltaPct >= -0.05
  ) {
    return "speed_worse_ridership_resilient";
  }
  if (
    input.speedDeltaMph !== null &&
    input.ridershipDeltaPct !== null &&
    input.speedDeltaMph >= 0.5 &&
    input.ridershipDeltaPct <= -0.05
  ) {
    return "speed_better_ridership_down";
  }
  if (
    input.speedDeltaMph !== null &&
    input.speedDeltaMph <= -0.5 &&
    reliabilityStableOrBetter
  ) {
    return "speed_worse_reliability_stable_or_better";
  }
  if (
    input.speedDeltaMph !== null &&
    reliabilityWorse &&
    input.speedDeltaMph >= -0.25
  ) {
    return "reliability_worse_speed_stable_or_better";
  }
  if (
    input.speedPercentile !== null &&
    input.reliabilityPainPercentile !== null &&
    input.speedPercentile <= 0.25 &&
    input.reliabilityPainPercentile <= 0.35
  ) {
    return "slow_but_reliable";
  }
  if (
    input.speedPercentile !== null &&
    input.reliabilityPainPercentile !== null &&
    input.speedPercentile >= 0.75 &&
    input.reliabilityPainPercentile >= 0.75
  ) {
    return "fast_but_unreliable";
  }
  return "coupled_or_weak_signal";
}

function reviewQuestion(pattern: DecouplingPattern, routeId: string): string {
  if (pattern === "speed_worse_ridership_resilient") {
    return `Why did ${routeId} keep riders while speed weakened?`;
  }
  if (pattern === "speed_better_ridership_down") {
    return `Why did ${routeId} lose riders while speed improved?`;
  }
  if (pattern === "speed_worse_reliability_stable_or_better") {
    return `Why did ${routeId} slow down without a matching reliability collapse?`;
  }
  if (pattern === "reliability_worse_speed_stable_or_better") {
    return `Why did ${routeId} reliability worsen while speed stayed stable?`;
  }
  if (pattern === "slow_but_reliable") return `Is ${routeId} a scheduling problem more than a speed problem?`;
  if (pattern === "fast_but_unreliable") return `Is ${routeId} a bunching/reliability problem despite acceptable speed?`;
  return `No strong speed/reliability/ridership decoupling pattern fired for ${routeId}.`;
}

function caveats(input: {
  historyMonthCount: number;
  reliabilityHistoryMonthCount: number;
  ridershipDeltaPct: number | null;
  excessWaitDeltaMinutes: number | null;
  longGapShareDelta: number | null;
}): string[] {
  const out = [
    "Decoupling rows are internal lab hypotheses, not public findings.",
    "Deltas compare the release month with prior historical medians, not a causal counterfactual.",
  ];
  if (input.ridershipDeltaPct === null) out.push("Ridership history is missing or zero for the comparison window.");
  if (input.excessWaitDeltaMinutes === null && input.longGapShareDelta !== null) {
    out.push("Historical excess-wait is missing, so long-gap-share delta is used for reliability trend.");
  }
  if (input.excessWaitDeltaMinutes === null && input.longGapShareDelta === null) {
    out.push("Observed reliability history is missing or unsupported.");
  }
  if (input.historyMonthCount < 12) out.push("Route has less than twelve supported speed/ridership history months.");
  if (input.reliabilityHistoryMonthCount < 6) out.push("Route has limited observed reliability history.");
  return out;
}

export function buildDecouplingQuadrantsArtifactV1(input: {
  readonly routeTrendRows: readonly DecouplingRouteTrendSourceRow[];
  readonly reliabilityRows: readonly DecouplingReliabilitySourceRow[];
  readonly spec: DecouplingQuadrantsSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): DecouplingQuadrantsArtifactV1 {
  const trendByRoute = new Map<string, TrendPoint[]>();
  for (const raw of input.routeTrendRows) {
    const point = trendPoint(raw);
    if (point.month < input.spec.historyStartMonth || point.month > input.spec.releaseMonth) continue;
    if (input.spec.routeId !== undefined && point.routeId !== input.spec.routeId) continue;
    const current = trendByRoute.get(point.routeId) ?? [];
    current.push(point);
    trendByRoute.set(point.routeId, current);
  }
  const reliabilityByRoute = new Map<string, ReliabilityPoint[]>();
  for (const raw of input.reliabilityRows) {
    const point = reliabilityPoint(raw);
    if (point.month < input.spec.historyStartMonth || point.month > input.spec.releaseMonth) continue;
    if (input.spec.routeId !== undefined && point.routeId !== input.spec.routeId) continue;
    const current = reliabilityByRoute.get(point.routeId) ?? [];
    current.push(point);
    reliabilityByRoute.set(point.routeId, current);
  }
  for (const [routeId, points] of trendByRoute.entries()) {
    trendByRoute.set(routeId, points.sort((left, right) => left.month.localeCompare(right.month)));
  }
  for (const [routeId, points] of reliabilityByRoute.entries()) {
    reliabilityByRoute.set(routeId, points.sort((left, right) => left.month.localeCompare(right.month)));
  }

  const releaseTrendPoints = [...trendByRoute.values()]
    .map((points) => points.find((point) => point.month === input.spec.releaseMonth))
    .filter((point): point is TrendPoint => point !== undefined);
  const releaseReliabilityPoints = [...reliabilityByRoute.values()]
    .map((points) => points.find((point) => point.month === input.spec.releaseMonth && point.supported))
    .filter((point): point is ReliabilityPoint => point !== undefined);
  const releaseSpeeds = releaseTrendPoints
    .map((point) => point.averageSpeedMph)
    .filter((value): value is number => value !== null);
  const releaseReliabilityPain = releaseReliabilityPoints
    .map((point) => point.excessWaitMinutes ?? point.observedLongGapShare)
    .filter((value): value is number => value !== null);

  const routeIds = [...new Set([...trendByRoute.keys(), ...reliabilityByRoute.keys()])].sort();
  const rows: DecouplingQuadrantRow[] = [];
  for (const routeId of routeIds) {
    const trendPoints = trendByRoute.get(routeId) ?? [];
    const release = trendPoints.find((point) => point.month === input.spec.releaseMonth);
    if (release === undefined) continue;
    const history = trendPoints.filter((point) => point.month < input.spec.releaseMonth);
    const historySpeedMedian = median(
      history.map((point) => point.averageSpeedMph).filter((value): value is number => value !== null),
    );
    const historyRidershipMedian = median(
      history.map((point) => point.ridership).filter((value): value is number => value !== null && value > 0),
    );
    const reliabilityPoints = reliabilityByRoute.get(routeId) ?? [];
    const releaseReliability = reliabilityPoints.find(
      (point) => point.month === input.spec.releaseMonth && point.supported,
    );
    const reliabilityHistory = reliabilityPoints.filter(
      (point) => point.month < input.spec.releaseMonth && point.supported,
    );
    const historyExcessWaitMedian = median(
      reliabilityHistory
        .map((point) => point.excessWaitMinutes)
        .filter((value): value is number => value !== null),
    );
    const historyLongGapShareMedian = median(
      reliabilityHistory
        .map((point) => point.observedLongGapShare)
        .filter((value): value is number => value !== null),
    );
    const speedDeltaMph =
      release.averageSpeedMph === null || historySpeedMedian === null
        ? null
        : round(release.averageSpeedMph - historySpeedMedian);
    const ridershipDeltaPct =
      release.ridership === null || historyRidershipMedian === null || historyRidershipMedian === 0
        ? null
        : round((release.ridership - historyRidershipMedian) / historyRidershipMedian);
    const excessWaitDeltaMinutes =
      releaseReliability?.excessWaitMinutes === null ||
      releaseReliability?.excessWaitMinutes === undefined ||
      historyExcessWaitMedian === null
        ? null
        : round(releaseReliability.excessWaitMinutes - historyExcessWaitMedian);
    const longGapShareDelta =
      releaseReliability?.observedLongGapShare === null ||
      releaseReliability?.observedLongGapShare === undefined ||
      historyLongGapShareMedian === null
        ? null
        : round(releaseReliability.observedLongGapShare - historyLongGapShareMedian);
    const speedPercentile = percentile(release.averageSpeedMph, releaseSpeeds);
    const reliabilityPainPercentile = percentile(
      releaseReliability?.excessWaitMinutes ?? releaseReliability?.observedLongGapShare ?? null,
      releaseReliabilityPain,
    );
    const pattern = classify({
      speedDeltaMph,
      ridershipDeltaPct,
      excessWaitDeltaMinutes,
      longGapShareDelta,
      speedPercentile,
      reliabilityPainPercentile,
    });
    rows.push({
      routeId,
      month: input.spec.releaseMonth,
      pattern,
      reviewQuestion: reviewQuestion(pattern, routeId),
      speedDeltaMph,
      ridershipDeltaPct,
      excessWaitDeltaMinutes,
      longGapShareDelta,
      currentSpeedMph: release.averageSpeedMph,
      currentRidership: release.ridership,
      currentExcessWaitMinutes: releaseReliability?.excessWaitMinutes ?? null,
      currentLongGapShare: releaseReliability?.observedLongGapShare ?? null,
      speedPercentile,
      reliabilityPainPercentile,
      historyMonthCount: history.length,
      reliabilityHistoryMonthCount: reliabilityHistory.length,
      evidence: {
        primary: [
          `speed_delta_mph=${speedDeltaMph ?? "missing"}`,
          `ridership_delta_pct=${ridershipDeltaPct ?? "missing"}`,
          `excess_wait_delta_minutes=${excessWaitDeltaMinutes ?? "missing"}`,
          `long_gap_share_delta=${longGapShareDelta ?? "missing"}`,
        ],
        counter: [
          `speed_percentile=${speedPercentile ?? "missing"}`,
          `reliability_pain_percentile=${reliabilityPainPercentile ?? "missing"}`,
        ],
        caveats: caveats({
          historyMonthCount: history.length,
          reliabilityHistoryMonthCount: reliabilityHistory.length,
          ridershipDeltaPct,
          excessWaitDeltaMinutes,
          longGapShareDelta,
        }),
      },
      reviewDisposition: "internal_lab",
      publicClaimAllowed: false,
    });
  }

  const panelManifest: PanelManifest = {
    panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: decouplingQuadrantsPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_month_trend",
        role: "speed_and_ridership_history",
        path: "data/local/pipeline.sqlite",
      },
      {
        refKind: "local_table",
        refId: "local_route_observed_reliability_summary",
        role: "observed_reliability_history",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.routeTrendRows.length + input.reliabilityRows.length,
      supportedRowCount: rows.filter((row) => row.pattern !== "coupled_or_weak_signal").length,
      panelRowCount: rows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      entityCount: rows.length,
      monthCount: rows.length > 0 ? 1 : 0,
    },
    limitations: [
      "This is a route-level internal lab pattern artifact, not a public finding surface.",
      "Deltas are descriptive release-versus-history comparisons, not causal estimates.",
      "Reliability trend uses excess-wait deltas when historical excess-wait exists, and falls back to long-gap-share deltas where historical excess-wait is not populated.",
    ],
  };

  return {
    artifactKind: DECOUPLING_QUADRANTS_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.spec.releaseMonth,
    historyWindow: {
      startMonth: input.spec.historyStartMonth,
      endMonth: input.spec.releaseMonth,
    },
    panelSpec: input.spec,
    panelManifest,
    summary: {
      panelRowCount: rows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      supportedSpeedRidershipRowCount: rows.filter(
        (row) => row.speedDeltaMph !== null && row.ridershipDeltaPct !== null,
      ).length,
      supportedReliabilityRowCount: rows.filter(
        (row) => row.excessWaitDeltaMinutes !== null || row.longGapShareDelta !== null,
      ).length,
      patternCounts: countValues(rows.map((row) => row.pattern)),
      publicClaimAllowedCount: 0,
    },
    rows,
  };
}
