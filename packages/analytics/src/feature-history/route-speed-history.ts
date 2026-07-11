import {
  classifyRouteSpeedSpineArtifact,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineReadiness,
  routeSpeedSpineRouteSlug,
} from "./route-speed-spine.js";

const DAYPARTS = ["am_peak", "midday", "pm_peak", "off_peak"] as const;

type Daypart = (typeof DAYPARTS)[number];

export type RouteSpeedHistorySourceRow = {
  route_id: string;
  month: string;
  direction: string;
  stop_order: number;
  timepoint_stop_id: string | null;
  next_timepoint_stop_id: string | null;
  daypart: Daypart;
  observation_count: number;
  traversal_count: number | null;
  average_speed_mph: number | null;
  average_travel_time_minutes: number | null;
  average_road_distance_miles: number | null;
};

export type RouteSpeedHistoryCell = {
  segmentId: string;
  month: string;
  daypart: Daypart;
  status: "available" | "not_expected" | "source_missing";
  observationCount: number;
  traversalCount: number;
  averageSpeedMph: number | null;
  averageTravelTimeMinutes: number | null;
  averageRoadDistanceMiles: number | null;
  segmentDaypartMeanSpeedMph: number | null;
  deltaFromSegmentDaypartMeanMph: number | null;
  pctFromSegmentDaypartMean: number | null;
};

export type RouteSpeedHistoryArtifact = {
  artifactKind: "studio_route_speed_history";
  schemaVersion: 1;
  generatedAt: string;
  routeId: string;
  routeSlug: string;
  spineReadiness: RouteSpeedSpineReadiness;
  source: {
    table: "local_route_segment_speed";
    dbPath: string;
    speedSpinePath: string;
    startMonth: string;
    endMonth: string;
    artifactPath: string;
    expectedService: {
      table: "local_route_schedule_stop";
      completeMonths: string[];
      incompleteMonths: string[];
      routeScheduleRowCount: number;
      matchedSchedulePairCount: number;
      unmatchedSchedulePairCount: number;
    } | null;
  };
  dimensions: {
    months: string[];
    dayparts: Daypart[];
    segments: Array<{
      segmentId: string;
      direction: string;
      displayOrder: number;
      label: string;
      fromNodeId: string;
      toNodeId: string;
    }>;
  };
  summary: {
    monthCount: number;
    segmentCount: number;
    daypartCount: number;
    cellCount: number;
    expectedCellCount: number;
    availableExpectedCellCount: number;
    missingExpectedCellCount: number;
    notExpectedCellCount: number;
    availableCellCount: number;
    missingCellCount: number;
    sourceObservationCount: number;
    traversalCount: number;
    unmappedRawKeyCount: number;
    ignoredNonSegmentSourceKeyCount: number;
  };
  unmappedRawKeys: Array<{
    direction: string;
    stopOrder: number;
    fromStopId: string | null;
    toStopId: string | null;
    sourceRowCount: number;
  }>;
  cells: RouteSpeedHistoryCell[];
};

type CellAccumulator = {
  segmentId: string;
  month: string;
  daypart: Daypart;
  observationCount: number;
  traversalCount: number;
  speedWeightedSum: number;
  speedWeight: number;
  travelWeightedSum: number;
  travelWeight: number;
  distanceWeightedSum: number;
  distanceWeight: number;
};

type BaselineAccumulator = {
  speedWeightedSum: number;
  speedWeight: number;
};

export type RouteSpeedScheduleStopRow = {
  schedule_date: string;
  direction: string;
  shape_id: string;
  stop_sequence: number;
  stop_id: string;
  schedule_time: string;
  block_id: string;
  origin: number | null;
  destination: number | null;
};

export type RouteSpeedExpectedServiceContext = {
  completeMonths: ReadonlySet<string>;
  expectedCellKeys: ReadonlySet<string>;
  routeScheduleRowCount: number;
  matchedSchedulePairCount: number;
  unmatchedSchedulePairCount: number;
};

type SchedulePairAccumulatorRow = {
  scheduleDate: string;
  direction: string;
  shapeId: string;
  stopSequence: number;
  stopId: string;
  scheduleTime: string;
  blockId: string;
  origin: boolean;
  destination: boolean;
};

export const DEFAULT_ROUTE_SPEED_HISTORY_READINESS: readonly RouteSpeedSpineReadiness[] = [
  "series_ready",
  "series_ready_with_gaps",
  "needs_pattern_review",
];

export type RouteSpeedHistoryBatchRouteStatus =
  | "written"
  | "skipped_existing"
  | "blocked"
  | "failed";

export type RouteSpeedHistoryBatchRoute = {
  routeId: string;
  routeSlug: string;
  readiness: RouteSpeedSpineReadiness;
  status: RouteSpeedHistoryBatchRouteStatus;
  reasons: string[];
  spinePath: string;
  artifactPath: string;
  monthCount: number | null;
  segmentCount: number | null;
  cellCount: number | null;
  availableCellCount: number | null;
  missingCellCount: number | null;
  unmappedRawKeyCount: number | null;
};

export type RouteSpeedHistoryBatchManifest = {
  artifactKind: "studio_route_speed_history_manifest";
  schemaVersion: 1;
  generatedAt: string;
  source: {
    table: "local_route_segment_speed";
    dbPath: string;
    artifactRoot: string;
    spineManifestPath: string;
    startMonth: string;
    endMonth: string | null;
    readiness: RouteSpeedSpineReadiness[];
    force: boolean;
    routeFilterCount: number;
    expectedService: {
      table: "local_route_schedule_stop";
      completeMonthCount: number;
    };
  };
  summary: {
    routeCount: number;
    writtenRouteCount: number;
    skippedExistingRouteCount: number;
    blockedRouteCount: number;
    failedRouteCount: number;
    artifactReadyRouteCount: number;
    totalCellCount: number;
    availableCellCount: number;
    missingCellCount: number;
    unmappedRawKeyCount: number;
  };
  routes: RouteSpeedHistoryBatchRoute[];
};

export function parseRouteSpeedHistoryReadinessList(
  value: string | undefined,
): RouteSpeedSpineReadiness[] {
  if (value === undefined) return [...DEFAULT_ROUTE_SPEED_HISTORY_READINESS];
  const allowed = new Set<RouteSpeedSpineReadiness>([
    "series_ready",
    "series_ready_with_gaps",
    "needs_pattern_review",
    "failed",
  ]);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is RouteSpeedSpineReadiness =>
      allowed.has(item as RouteSpeedSpineReadiness),
    );
}

export function summarizeRouteSpeedHistoryBatch(
  routes: readonly RouteSpeedHistoryBatchRoute[],
): RouteSpeedHistoryBatchManifest["summary"] {
  const artifactReady = routes.filter(
    (route) => route.status === "written" || route.status === "skipped_existing",
  );
  return {
    routeCount: routes.length,
    writtenRouteCount: routes.filter((route) => route.status === "written").length,
    skippedExistingRouteCount: routes.filter((route) => route.status === "skipped_existing").length,
    blockedRouteCount: routes.filter((route) => route.status === "blocked").length,
    failedRouteCount: routes.filter((route) => route.status === "failed").length,
    artifactReadyRouteCount: artifactReady.length,
    totalCellCount: artifactReady.reduce((sum, route) => sum + (route.cellCount ?? 0), 0),
    availableCellCount: artifactReady.reduce(
      (sum, route) => sum + (route.availableCellCount ?? 0),
      0,
    ),
    missingCellCount: artifactReady.reduce((sum, route) => sum + (route.missingCellCount ?? 0), 0),
    unmappedRawKeyCount: artifactReady.reduce(
      (sum, route) => sum + (route.unmappedRawKeyCount ?? 0),
      0,
    ),
  };
}

export function buildRouteSpeedHistoryBatchManifest(input: {
  generatedAt: string;
  dbPath: string;
  artifactRoot: string;
  spineManifestPath: string;
  startMonth: string;
  endMonth: string | null;
  readiness: readonly RouteSpeedSpineReadiness[];
  force: boolean;
  routeFilterCount: number;
  completeScheduleMonthCount: number;
  routes: readonly RouteSpeedHistoryBatchRoute[];
}): RouteSpeedHistoryBatchManifest {
  const routes = input.routes.map((route) => ({ ...route }));
  return {
    artifactKind: "studio_route_speed_history_manifest",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    source: {
      table: "local_route_segment_speed",
      dbPath: input.dbPath,
      artifactRoot: input.artifactRoot,
      spineManifestPath: input.spineManifestPath,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      readiness: [...input.readiness],
      force: input.force,
      routeFilterCount: input.routeFilterCount,
      expectedService: {
        table: "local_route_schedule_stop",
        completeMonthCount: input.completeScheduleMonthCount,
      },
    },
    summary: summarizeRouteSpeedHistoryBatch(routes),
    routes,
  };
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function textKey(value: string | null): string {
  return value === null ? "<null>" : value;
}

function rawSegmentKey(input: {
  direction: string;
  stopOrder: number;
  fromStopId: string | null;
  toStopId: string | null;
}): string {
  return [
    input.direction,
    String(input.stopOrder),
    textKey(input.fromStopId),
    textKey(input.toStopId),
  ].join("|");
}

function cellKey(input: { segmentId: string; month: string; daypart: Daypart }): string {
  return [input.segmentId, input.month, input.daypart].join("|");
}

function baselineKey(input: { segmentId: string; daypart: Daypart }): string {
  return [input.segmentId, input.daypart].join("|");
}

function scheduleStopPairKey(input: {
  direction: string;
  fromStopId: string | null;
  toStopId: string | null;
}): string {
  return [input.direction, textKey(input.fromStopId), textKey(input.toStopId)].join("|");
}

function daypartForHour(hour: number): Daypart {
  if (hour >= 6 && hour <= 9) return "am_peak";
  if (hour >= 10 && hour <= 15) return "midday";
  if (hour >= 16 && hour <= 19) return "pm_peak";
  return "off_peak";
}

function scheduleTimeHour(value: string): number | null {
  const match = /T(\d{2}):/.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function monthFromScheduleDate(value: string): string | null {
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
}

function addWeightedCellMetric(
  cell: CellAccumulator,
  field: "distance" | "speed" | "travel",
  value: number | null,
  weight: number,
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    return;
  }
  if (field === "speed") {
    cell.speedWeightedSum += value * weight;
    cell.speedWeight += weight;
  } else if (field === "travel") {
    cell.travelWeightedSum += value * weight;
    cell.travelWeight += weight;
  } else {
    cell.distanceWeightedSum += value * weight;
    cell.distanceWeight += weight;
  }
}

function metricValue(weightedSum: number, weight: number, digits: number): number | null {
  return weight <= 0 ? null : round(weightedSum / weight, digits);
}

function buildRawKeyToSegmentId(spine: RouteSpeedSpineArtifact): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const segment of spine.segments) {
    for (const pair of segment.raw.sourceStopPairs) {
      for (const stopOrder of pair.stopOrders) {
        lookup.set(
          rawSegmentKey({
            direction: segment.direction,
            stopOrder,
            fromStopId: pair.fromStopId,
            toStopId: pair.toStopId,
          }),
          segment.segmentId,
        );
      }
    }
  }
  return lookup;
}

function buildScheduleStopPairToSegmentIds(spine: RouteSpeedSpineArtifact): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const segment of spine.segments) {
    for (const pair of segment.raw.sourceStopPairs) {
      const key = scheduleStopPairKey({
        direction: segment.direction,
        fromStopId: pair.fromStopId,
        toStopId: pair.toStopId,
      });
      const segmentIds = lookup.get(key) ?? [];
      segmentIds.push(segment.segmentId);
      lookup.set(key, segmentIds);
    }
  }
  return lookup;
}

function buildIgnoredRawKeys(spine: RouteSpeedSpineArtifact): Set<string> {
  const ignored = new Set<string>();
  for (const issue of spine.validation.issues) {
    if (issue.code !== "zero_length_spine_segment") continue;
    const context = issue.context ?? {};
    if (
      typeof context["direction"] !== "string" ||
      typeof context["stopOrder"] !== "number" ||
      !("fromStopId" in context) ||
      !("toStopId" in context)
    ) {
      continue;
    }
    ignored.add(
      rawSegmentKey({
        direction: context["direction"],
        stopOrder: context["stopOrder"],
        fromStopId: typeof context["fromStopId"] === "string" ? context["fromStopId"] : null,
        toStopId: typeof context["toStopId"] === "string" ? context["toStopId"] : null,
      }),
    );
  }
  return ignored;
}

export function routeSpeedHistoryMonthsFromSpine(spine: RouteSpeedSpineArtifact): string[] {
  return spine.monthCoverage
    .map((row) => row.month)
    .sort((left, right) => left.localeCompare(right));
}

function normalizedScheduleRow(row: RouteSpeedScheduleStopRow): SchedulePairAccumulatorRow | null {
  if (
    typeof row.schedule_date !== "string" ||
    typeof row.direction !== "string" ||
    typeof row.shape_id !== "string" ||
    typeof row.stop_id !== "string" ||
    typeof row.schedule_time !== "string" ||
    typeof row.block_id !== "string" ||
    !Number.isFinite(row.stop_sequence)
  ) {
    return null;
  }
  return {
    scheduleDate: row.schedule_date,
    direction: row.direction,
    shapeId: row.shape_id,
    stopSequence: row.stop_sequence,
    stopId: row.stop_id,
    scheduleTime: row.schedule_time,
    blockId: row.block_id,
    origin: row.origin === 1,
    destination: row.destination === 1,
  };
}

function scheduleTripKey(row: SchedulePairAccumulatorRow): string {
  return [row.scheduleDate, row.direction, row.shapeId, row.blockId].join("|");
}

function compareScheduleRows(
  left: SchedulePairAccumulatorRow,
  right: SchedulePairAccumulatorRow,
): number {
  return (
    left.scheduleDate.localeCompare(right.scheduleDate) ||
    left.direction.localeCompare(right.direction) ||
    left.shapeId.localeCompare(right.shapeId) ||
    left.blockId.localeCompare(right.blockId) ||
    left.scheduleTime.localeCompare(right.scheduleTime) ||
    left.stopSequence - right.stopSequence
  );
}

export function buildRouteExpectedServiceContext(input: {
  spine: RouteSpeedSpineArtifact;
  scheduleRows: readonly RouteSpeedScheduleStopRow[];
  completeMonths: ReadonlySet<string>;
}): RouteSpeedExpectedServiceContext {
  const pairToSegmentIds = buildScheduleStopPairToSegmentIds(input.spine);
  const normalizedRows = input.scheduleRows
    .map(normalizedScheduleRow)
    .filter((row): row is SchedulePairAccumulatorRow => row !== null)
    .sort(compareScheduleRows);
  const previousByTrip = new Map<string, SchedulePairAccumulatorRow>();
  const expectedCellKeys = new Set<string>();
  let matchedSchedulePairCount = 0;
  let unmatchedSchedulePairCount = 0;

  for (const row of normalizedRows) {
    const tripKey = scheduleTripKey(row);
    const previous = previousByTrip.get(tripKey);
    const startsNewTrip =
      previous === undefined ||
      row.origin ||
      row.stopSequence <= previous.stopSequence ||
      row.scheduleTime < previous.scheduleTime ||
      previous.destination;

    if (!startsNewTrip) {
      const hour = scheduleTimeHour(previous.scheduleTime);
      const month = monthFromScheduleDate(previous.scheduleDate);
      const segmentIds = pairToSegmentIds.get(
        scheduleStopPairKey({
          direction: previous.direction,
          fromStopId: previous.stopId,
          toStopId: row.stopId,
        }),
      );
      if (hour !== null && month !== null && segmentIds !== undefined) {
        matchedSchedulePairCount += 1;
        const daypart = daypartForHour(hour);
        for (const segmentId of segmentIds) {
          expectedCellKeys.add(cellKey({ segmentId, month, daypart }));
        }
      } else {
        unmatchedSchedulePairCount += 1;
      }
    }

    if (row.destination) {
      previousByTrip.delete(tripKey);
    } else {
      previousByTrip.set(tripKey, row);
    }
  }

  return {
    completeMonths: input.completeMonths,
    expectedCellKeys,
    routeScheduleRowCount: normalizedRows.length,
    matchedSchedulePairCount,
    unmatchedSchedulePairCount,
  };
}

export function buildRouteSpeedHistoryArtifact(input: {
  routeId: string;
  routeSlug?: string;
  spine: RouteSpeedSpineArtifact;
  rows: readonly RouteSpeedHistorySourceRow[];
  expectedService?: RouteSpeedExpectedServiceContext | null | undefined;
  generatedAt: string;
  dbPath: string;
  speedSpinePath: string;
  artifactPath: string;
}): RouteSpeedHistoryArtifact {
  const routeId = normalizeRouteId(input.routeId);
  const routeSlug = input.routeSlug ?? routeSpeedSpineRouteSlug(routeId);
  const months = routeSpeedHistoryMonthsFromSpine(input.spine);
  const rawKeyToSegmentId = buildRawKeyToSegmentId(input.spine);
  const ignoredRawKeys = buildIgnoredRawKeys(input.spine);
  const ignoredNonSegmentRawKeys = new Set<string>();
  const cellsByKey = new Map<string, CellAccumulator>();
  const unmappedRawKeys = new Map<
    string,
    {
      direction: string;
      stopOrder: number;
      fromStopId: string | null;
      toStopId: string | null;
      sourceRowCount: number;
    }
  >();

  for (const row of input.rows) {
    if (normalizeRouteId(row.route_id) !== routeId) continue;
    const rawKey = rawSegmentKey({
      direction: row.direction,
      stopOrder: row.stop_order,
      fromStopId: row.timepoint_stop_id,
      toStopId: row.next_timepoint_stop_id,
    });
    const segmentId = rawKeyToSegmentId.get(rawKey);
    if (segmentId === undefined) {
      if (ignoredRawKeys.has(rawKey)) {
        ignoredNonSegmentRawKeys.add(rawKey);
        continue;
      }
      const existing =
        unmappedRawKeys.get(rawKey) ??
        ({
          direction: row.direction,
          stopOrder: row.stop_order,
          fromStopId: row.timepoint_stop_id,
          toStopId: row.next_timepoint_stop_id,
          sourceRowCount: 0,
        } satisfies {
          direction: string;
          stopOrder: number;
          fromStopId: string | null;
          toStopId: string | null;
          sourceRowCount: number;
        });
      existing.sourceRowCount += Math.max(1, Number(row.observation_count) || 1);
      unmappedRawKeys.set(rawKey, existing);
      continue;
    }
    const key = cellKey({ segmentId, month: row.month, daypart: row.daypart });
    const accumulator =
      cellsByKey.get(key) ??
      ({
        segmentId,
        month: row.month,
        daypart: row.daypart,
        observationCount: 0,
        traversalCount: 0,
        speedWeightedSum: 0,
        speedWeight: 0,
        travelWeightedSum: 0,
        travelWeight: 0,
        distanceWeightedSum: 0,
        distanceWeight: 0,
      } satisfies CellAccumulator);
    const observationCount = Math.max(1, Number(row.observation_count) || 1);
    const traversalCount = Math.max(0, Number(row.traversal_count) || 0);
    const metricWeight = traversalCount || observationCount;
    accumulator.observationCount += observationCount;
    accumulator.traversalCount += traversalCount;
    addWeightedCellMetric(accumulator, "speed", row.average_speed_mph, metricWeight);
    addWeightedCellMetric(accumulator, "travel", row.average_travel_time_minutes, metricWeight);
    addWeightedCellMetric(accumulator, "distance", row.average_road_distance_miles, metricWeight);
    cellsByKey.set(key, accumulator);
  }

  const baselineByKey = new Map<string, BaselineAccumulator>();
  for (const cell of cellsByKey.values()) {
    if (cell.speedWeight <= 0) continue;
    const key = baselineKey({ segmentId: cell.segmentId, daypart: cell.daypart });
    const baseline =
      baselineByKey.get(key) ??
      ({ speedWeightedSum: 0, speedWeight: 0 } satisfies BaselineAccumulator);
    baseline.speedWeightedSum += cell.speedWeightedSum;
    baseline.speedWeight += cell.speedWeight;
    baselineByKey.set(key, baseline);
  }

  const cells: RouteSpeedHistoryCell[] = [];
  for (const segment of input.spine.segments) {
    for (const month of months) {
      for (const daypart of DAYPARTS) {
        const key = cellKey({ segmentId: segment.segmentId, month, daypart });
        const accumulator = cellsByKey.get(key);
        const baseline = baselineByKey.get(baselineKey({ segmentId: segment.segmentId, daypart }));
        const segmentDaypartMeanSpeedMph =
          baseline === undefined
            ? null
            : metricValue(baseline.speedWeightedSum, baseline.speedWeight, 2);
        if (accumulator === undefined) {
          const status =
            input.expectedService !== undefined &&
            input.expectedService !== null &&
            input.expectedService.completeMonths.has(month) &&
            !input.expectedService.expectedCellKeys.has(key)
              ? "not_expected"
              : "source_missing";
          cells.push({
            segmentId: segment.segmentId,
            month,
            daypart,
            status,
            observationCount: 0,
            traversalCount: 0,
            averageSpeedMph: null,
            averageTravelTimeMinutes: null,
            averageRoadDistanceMiles: null,
            segmentDaypartMeanSpeedMph,
            deltaFromSegmentDaypartMeanMph: null,
            pctFromSegmentDaypartMean: null,
          });
          continue;
        }
        const averageSpeedMph = metricValue(
          accumulator.speedWeightedSum,
          accumulator.speedWeight,
          2,
        );
        const status = averageSpeedMph === null ? "source_missing" : "available";
        const delta =
          averageSpeedMph === null || segmentDaypartMeanSpeedMph === null
            ? null
            : round(averageSpeedMph - segmentDaypartMeanSpeedMph, 2);
        cells.push({
          segmentId: segment.segmentId,
          month,
          daypart,
          status,
          observationCount: accumulator.observationCount,
          traversalCount: accumulator.traversalCount,
          averageSpeedMph,
          averageTravelTimeMinutes: metricValue(
            accumulator.travelWeightedSum,
            accumulator.travelWeight,
            3,
          ),
          averageRoadDistanceMiles: metricValue(
            accumulator.distanceWeightedSum,
            accumulator.distanceWeight,
            4,
          ),
          segmentDaypartMeanSpeedMph,
          deltaFromSegmentDaypartMeanMph: delta,
          pctFromSegmentDaypartMean:
            delta === null ||
            segmentDaypartMeanSpeedMph === null ||
            segmentDaypartMeanSpeedMph === 0
              ? null
              : round(delta / segmentDaypartMeanSpeedMph, 4),
        });
      }
    }
  }

  const availableCells = cells.filter((cell) => cell.status === "available");
  const sourceMissingCells = cells.filter((cell) => cell.status === "source_missing");
  const notExpectedCells = cells.filter((cell) => cell.status === "not_expected");
  const expectedCellCount = availableCells.length + sourceMissingCells.length;
  return {
    artifactKind: "studio_route_speed_history",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeId,
    routeSlug,
    spineReadiness: classifyRouteSpeedSpineArtifact(input.spine).readiness,
    source: {
      table: "local_route_segment_speed",
      dbPath: input.dbPath,
      speedSpinePath: input.speedSpinePath,
      startMonth: months[0] ?? input.spine.source.startMonth,
      endMonth:
        months[months.length - 1] ?? input.spine.source.endMonth ?? input.spine.source.startMonth,
      artifactPath: input.artifactPath,
      expectedService:
        input.expectedService === undefined || input.expectedService === null
          ? null
          : {
              table: "local_route_schedule_stop",
              completeMonths: [...input.expectedService.completeMonths].sort(),
              incompleteMonths: months.filter(
                (month) => !input.expectedService?.completeMonths.has(month),
              ),
              routeScheduleRowCount: input.expectedService.routeScheduleRowCount,
              matchedSchedulePairCount: input.expectedService.matchedSchedulePairCount,
              unmatchedSchedulePairCount: input.expectedService.unmatchedSchedulePairCount,
            },
    },
    dimensions: {
      months,
      dayparts: [...DAYPARTS],
      segments: input.spine.segments.map((segment) => ({
        segmentId: segment.segmentId,
        direction: segment.direction,
        displayOrder: segment.displayOrder,
        label: segment.label,
        fromNodeId: segment.fromNodeId,
        toNodeId: segment.toNodeId,
      })),
    },
    summary: {
      monthCount: months.length,
      segmentCount: input.spine.segments.length,
      daypartCount: DAYPARTS.length,
      cellCount: cells.length,
      expectedCellCount,
      availableExpectedCellCount: availableCells.length,
      missingExpectedCellCount: sourceMissingCells.length,
      notExpectedCellCount: notExpectedCells.length,
      availableCellCount: availableCells.length,
      missingCellCount: sourceMissingCells.length,
      sourceObservationCount: availableCells.reduce((sum, cell) => sum + cell.observationCount, 0),
      traversalCount: availableCells.reduce((sum, cell) => sum + cell.traversalCount, 0),
      unmappedRawKeyCount: unmappedRawKeys.size,
      ignoredNonSegmentSourceKeyCount: ignoredNonSegmentRawKeys.size,
    },
    unmappedRawKeys: [...unmappedRawKeys.values()].sort((left, right) => {
      if (left.direction !== right.direction) return left.direction.localeCompare(right.direction);
      if (left.stopOrder !== right.stopOrder) return left.stopOrder - right.stopOrder;
      return `${left.fromStopId ?? ""}:${left.toStopId ?? ""}`.localeCompare(
        `${right.fromStopId ?? ""}:${right.toStopId ?? ""}`,
      );
    }),
    cells,
  };
}
