import type {
  RouteDossierEvent,
  RouteDossierMetricSummary,
  RouteDossierSummary,
  RouteDossierWorstSegment,
} from "@bp/domain/studio";

/**
 * Pure builder for the per-route dossier summary (frontend §7.2 / hard-cutover C2).
 *
 * Takes one explicit input row per route — already resolved from the pipeline's
 * local-DB readers and the per-route speed-history artifacts — and emits the
 * series-shaped summary block the Worker embeds into the route detail response.
 * No DB or filesystem access: the messy join lives in the pipeline adapter; this
 * stays a deterministic, unit-testable projection (same split as
 * ./build-route-capability-manifest.ts).
 *
 * Peer percentiles are computed here, across the full row set, so the adapter
 * never needs a separate ranking input.
 */

export type RouteDossierTrendPoint = {
  readonly month: string;
  readonly averageSpeedMph: number | null;
  readonly ridership: number | null;
};

export type RouteDossierWorstSegmentMonth = {
  readonly month: string;
  readonly segmentId: string;
  readonly direction: string;
  readonly label: string;
  readonly averageSpeedMph: number | null;
};

export type RouteDossierInputRow = {
  readonly routeId: string;
  readonly routeSlug: string;
  /** Monthly route-grain trend rows (any order; deduped by month, last wins). */
  readonly trend: readonly RouteDossierTrendPoint[];
  /** Per month, the route's slowest segment — adapter-derived from the speed-history artifact. */
  readonly worstSegmentByMonth: readonly RouteDossierWorstSegmentMonth[];
  readonly treatment: {
    readonly aceActive: boolean;
    readonly aceSince: string | null;
    readonly busLaneMatchedLaneCount: number;
    readonly events: readonly RouteDossierEvent[];
    /** Baseline month behind the treatment record. */
    readonly dataAsOf: string | null;
  };
};

export type BuildRouteDossierSummariesInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly rows: readonly RouteDossierInputRow[];
};

const SPARKLINE_MONTHS = 36;
const MOVEMENT_WINDOW_MONTHS = 6;
const LATEST_EVENTS_CAP = 5;

function monthIndex(month: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

function sortedUniqueByMonth(points: readonly RouteDossierTrendPoint[]): RouteDossierTrendPoint[] {
  const byMonth = new Map<string, RouteDossierTrendPoint>();
  for (const point of points) byMonth.set(point.month, point);
  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month));
}

function metricSummary(
  points: readonly RouteDossierTrendPoint[],
  value: (point: RouteDossierTrendPoint) => number | null,
): Omit<RouteDossierMetricSummary, "peerPercentile"> {
  const sparkline = points.slice(-SPARKLINE_MONTHS).map((point) => ({
    month: point.month,
    value: value(point),
  }));

  let current: number | null = null;
  let dataAsOf: string | null = null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point === undefined) continue;
    const pointValue = value(point);
    if (pointValue !== null) {
      current = pointValue;
      dataAsOf = point.month;
      break;
    }
  }

  let movement6mPct: number | null = null;
  if (current !== null && dataAsOf !== null) {
    const currentIdx = monthIndex(dataAsOf);
    if (currentIdx !== null) {
      const prior = points.find((point) => monthIndex(point.month) === currentIdx - MOVEMENT_WINDOW_MONTHS);
      const priorValue = prior === undefined ? null : value(prior);
      if (priorValue !== null && priorValue !== 0) {
        movement6mPct = ((current - priorValue) / priorValue) * 100;
      }
    }
  }

  return { current, movement6mPct, sparkline, dataAsOf };
}

/** Percentile rank (0–100) of `current` among all routes with the metric; null when unranked. */
function percentileOf(current: number | null, all: readonly number[]): number | null {
  if (current === null || all.length < 2) return null;
  const below = all.filter((value) => value < current).length;
  return Math.round((below / all.length) * 100);
}

function worstSegment(
  byMonth: readonly RouteDossierWorstSegmentMonth[],
): RouteDossierWorstSegment | null {
  if (byMonth.length === 0) return null;
  const sorted = [...byMonth].sort((left, right) => left.month.localeCompare(right.month));
  const latest = sorted[sorted.length - 1];
  if (latest === undefined) return null;

  let persistenceMonths = 0;
  let expectedIdx = monthIndex(latest.month);
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const entry = sorted[i];
    if (entry === undefined || expectedIdx === null) break;
    if (monthIndex(entry.month) !== expectedIdx || entry.segmentId !== latest.segmentId) break;
    persistenceMonths += 1;
    expectedIdx -= 1;
  }

  return {
    segmentId: latest.segmentId,
    direction: latest.direction,
    label: latest.label,
    averageSpeedMph: latest.averageSpeedMph,
    persistenceMonths,
    dataAsOf: latest.month,
  };
}

function latestEvents(events: readonly RouteDossierEvent[]): RouteDossierEvent[] {
  return [...events]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, LATEST_EVENTS_CAP);
}

function maxMonth(months: readonly (string | null)[]): string | null {
  let max: string | null = null;
  for (const month of months) {
    if (month === null) continue;
    if (max === null || month > max) max = month;
  }
  return max;
}

export function buildRouteDossierSummaries(
  input: BuildRouteDossierSummariesInput,
): RouteDossierSummary[] {
  const prepared = input.rows.map((row) => {
    const trend = sortedUniqueByMonth(row.trend);
    return {
      row,
      speed: metricSummary(trend, (point) => point.averageSpeedMph),
      ridership: metricSummary(trend, (point) => point.ridership),
    };
  });

  const speedCurrents = prepared
    .map((entry) => entry.speed.current)
    .filter((value): value is number => value !== null);
  const ridershipCurrents = prepared
    .map((entry) => entry.ridership.current)
    .filter((value): value is number => value !== null);

  return prepared
    .sort((left, right) => left.row.routeId.localeCompare(right.row.routeId))
    .map(({ row, speed, ridership }): RouteDossierSummary => {
      const speedSummary: RouteDossierMetricSummary = {
        ...speed,
        peerPercentile: percentileOf(speed.current, speedCurrents),
      };
      const ridershipSummary: RouteDossierMetricSummary = {
        ...ridership,
        peerPercentile: percentileOf(ridership.current, ridershipCurrents),
      };
      const worst = worstSegment(row.worstSegmentByMonth);
      const treatmentPosture = {
        aceActive: row.treatment.aceActive,
        aceSince: row.treatment.aceSince,
        busLaneMatchedLaneCount: row.treatment.busLaneMatchedLaneCount,
        latestEvents: latestEvents(row.treatment.events),
        dataAsOf: row.treatment.dataAsOf,
      };
      return {
        artifactKind: "studio_route_dossier_summary",
        schemaVersion: 1,
        generatedAt: input.generatedAt,
        routeId: row.routeId,
        routeSlug: row.routeSlug,
        releaseMonth: input.releaseMonth,
        dataAsOf: maxMonth([
          speedSummary.dataAsOf,
          ridershipSummary.dataAsOf,
          worst?.dataAsOf ?? null,
          treatmentPosture.dataAsOf,
        ]),
        speed: speedSummary,
        ridership: ridershipSummary,
        worstSegment: worst,
        treatmentPosture,
      };
    });
}
