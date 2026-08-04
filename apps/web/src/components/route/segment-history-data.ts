import type {
  StudioRouteSpeedHistoryCell,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

/** Per-segment monthly speed series, extracted from the route speed-history
 * response. Replaces the month×segment carpet: the same cells, re-shaped so a
 * single segment's history renders as an on-demand sparkline in its table row. */
export type SegmentHistorySeries = {
  segmentId: string;
  months: string[]; // ascending "YYYY-MM"
  speeds: (number | null)[]; // aligned 1:1 with months
  latestMonth: string | null; // latest month that has a speed, else null
};

/**
 * Why a series is unavailable, so the page can say which it is.
 *
 * `spine_unclassified` is the live case: artifacts published before the
 * producer emitted `spineReadiness` carry months of real cells that this
 * client refuses to join. Collapsing that into "no history" states a fact
 * about the route that is not true.
 */
export type SegmentHistoryReason =
  | "missing"
  | "spine_unclassified"
  | "needs_pattern_review"
  | "failed";

export type SegmentHistoryData = {
  readiness: "ready" | "partial" | "unavailable";
  /** Set only when `readiness` is "unavailable". */
  reason: SegmentHistoryReason | null;
  series: Map<string, SegmentHistorySeries>;
  unmatchedDetailSegmentIds: string[];
};

export type HistoricalSegmentValues = {
  readiness: "ready" | "ready_with_gaps" | "unavailable";
  speeds: Map<string, number | null>;
  displayOrders: Map<string, number>;
  missingSegmentCount: number;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-05" -> "May 2026"; anything unparseable returns the raw string. */
export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return month;
  const monthName = MONTH_NAMES[Number(match[2]) - 1];
  return monthName === undefined ? month : `${monthName} ${match[1]}`;
}

function normalizedId(value: string): string {
  return value.trim().toLowerCase();
}

/** One explicit historical value. All-day is traversal-weighted and requires
 * every expected daypart; observation count is only the zero-traversal
 * fallback. A missing expected cell invalidates the aggregate rather than
 * producing a biased partial-day average. */
export function historicalSpeedForCells(
  cells: readonly StudioRouteSpeedHistoryCell[],
  expectedDayparts: readonly StudioRouteSpeedHistoryCell["daypart"][],
  selectedDaypart?: StudioRouteSpeedHistoryCell["daypart"],
): number | null {
  if (selectedDaypart !== undefined) {
    const matching = cells.filter((cell) => cell.daypart === selectedDaypart);
    if (matching.length !== 1) return null;
    const cell = matching[0];
    return cell?.status === "available" && cell.averageSpeedMph !== null
      ? cell.averageSpeedMph
      : null;
  }

  let weighted = 0;
  let weight = 0;
  let expectedCount = 0;
  for (const daypart of expectedDayparts) {
    const matching = cells.filter((cell) => cell.daypart === daypart);
    if (matching.length !== 1) return null;
    const cell = matching[0];
    if (cell === undefined) return null;
    if (cell.status === "not_expected") continue;
    expectedCount += 1;
    if (cell.status !== "available" || cell.averageSpeedMph === null) return null;
    const cellWeight = cell.traversalCount > 0 ? cell.traversalCount : cell.observationCount;
    if (cellWeight <= 0) return null;
    weighted += cell.averageSpeedMph * cellWeight;
    weight += cellWeight;
  }
  return expectedCount > 0 && weight > 0 ? weighted / weight : null;
}

function historyCellsBySegmentMonth(history: StudioRouteSpeedHistoryResponse) {
  const bySegmentMonth = new Map<string, StudioRouteSpeedHistoryCell[]>();
  for (const cell of history.cells) {
    const key = `${normalizedId(cell.segmentId)}\u0000${cell.month}`;
    const bucket = bySegmentMonth.get(key) ?? [];
    bucket.push(cell);
    bySegmentMonth.set(key, bucket);
  }
  return bySegmentMonth;
}

/** Active historical values joined only through the durable speed spine. */
export function historicalSegmentValues(
  history: StudioRouteSpeedHistoryResponse,
  segments: readonly StudioSegment[],
  selection: {
    month: string;
    daypart?: StudioRouteSpeedHistoryCell["daypart"];
  },
): HistoricalSegmentValues {
  const speeds = new Map<string, number | null>();
  const displayOrders = new Map<string, number>();
  if (
    history.spineReadiness !== "series_ready" &&
    history.spineReadiness !== "series_ready_with_gaps"
  ) {
    return { readiness: "unavailable", speeds, displayOrders, missingSegmentCount: 0 };
  }

  const dimensionBySpineId = new Map(
    history.dimensions.segments.map((segment) => [normalizedId(segment.segmentId), segment]),
  );
  const cellsBySegmentMonth = historyCellsBySegmentMonth(history);
  let missingSegmentCount = 0;
  for (const segment of segments) {
    if (segment.spineSegmentId === null) {
      speeds.set(segment.id, null);
      missingSegmentCount += 1;
      continue;
    }
    const spineId = normalizedId(segment.spineSegmentId);
    const dimension = dimensionBySpineId.get(spineId);
    if (dimension === undefined) {
      speeds.set(segment.id, null);
      missingSegmentCount += 1;
      continue;
    }
    displayOrders.set(segment.id, dimension.displayOrder);
    const speed = historicalSpeedForCells(
      cellsBySegmentMonth.get(`${spineId}\u0000${selection.month}`) ?? [],
      history.dimensions.dayparts,
      selection.daypart,
    );
    speeds.set(segment.id, speed);
    if (speed === null) missingSegmentCount += 1;
  }

  return {
    readiness:
      history.spineReadiness === "series_ready_with_gaps" || missingSegmentCount > 0
        ? "ready_with_gaps"
        : "ready",
    speeds,
    displayOrders,
    missingSegmentCount,
  };
}

/**
 * Group the speed-history cells into one month-ordered series per detail
 * segment, keyed by the detail segment's month-specific `id`. The join itself
 * uses the stable `spineSegmentId`; unmatched detail records are reported
 * separately so they cannot be confused with an all-null observed series.
 */
export function segmentHistorySeries(
  history: StudioRouteSpeedHistoryResponse | null,
  segments: readonly StudioSegment[],
): SegmentHistoryData {
  const series = new Map<string, SegmentHistorySeries>();
  const unmatchedDetailSegmentIds = segments
    .filter((segment) => segment.spineSegmentId === null)
    .map((segment) => segment.id);
  if (history === null) {
    return { readiness: "unavailable", reason: "missing", series, unmatchedDetailSegmentIds };
  }
  if (history.spineReadiness === null) {
    return {
      readiness: "unavailable",
      reason: "spine_unclassified",
      series,
      unmatchedDetailSegmentIds,
    };
  }
  if (history.spineReadiness === "needs_pattern_review" || history.spineReadiness === "failed") {
    return {
      readiness: "unavailable",
      reason: history.spineReadiness,
      series,
      unmatchedDetailSegmentIds: segments.map((segment) => segment.id),
    };
  }

  const detailBySpineId = new Map(
    segments.flatMap((segment) =>
      segment.spineSegmentId === null
        ? []
        : ([[normalizedId(segment.spineSegmentId), segment]] as const),
    ),
  );
  const bySegmentMonth = historyCellsBySegmentMonth(history);

  const months = history.dimensions.months;
  for (const historySegment of history.dimensions.segments) {
    const detail = detailBySpineId.get(normalizedId(historySegment.segmentId));
    if (detail === undefined) continue;
    const speeds = months.map((month) =>
      historicalSpeedForCells(
        bySegmentMonth.get(`${normalizedId(historySegment.segmentId)}\u0000${month}`) ?? [],
        history.dimensions.dayparts,
      ),
    );
    let latestMonth: string | null = null;
    for (const [index, month] of months.entries()) {
      const speed = speeds[index];
      if (speed !== null && speed !== undefined) latestMonth = month;
    }
    series.set(detail.id, {
      segmentId: detail.id,
      months: [...months],
      speeds,
      latestMonth,
    });
  }

  for (const segment of segments) {
    if (!series.has(segment.id) && !unmatchedDetailSegmentIds.includes(segment.id)) {
      unmatchedDetailSegmentIds.push(segment.id);
    }
  }

  return {
    readiness:
      history.spineReadiness === "series_ready" && unmatchedDetailSegmentIds.length === 0
        ? "ready"
        : "partial",
    reason: null,
    series,
    unmatchedDetailSegmentIds,
  };
}
