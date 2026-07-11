import {
  type ClassifiedRouteSegmentSourceKey,
  classifyRouteSegmentSourceKey,
} from "./route-speed-spine-crosswalk.js";

export const ROUTE_SPEED_SPINE_DEFAULT_START_MONTH = "2023-04";
export const ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS = 110;
const EARTH_RADIUS_METERS = 6_371_000;

export type RouteSpeedSpineSourceRow = {
  route_id: string;
  month: string;
  direction: string;
  stop_order: number;
  timepoint_stop_id: string | null;
  timepoint_stop_name: string | null;
  timepoint_stop_latitude: number | null;
  timepoint_stop_longitude: number | null;
  next_timepoint_stop_id: string | null;
  next_timepoint_stop_name: string | null;
  next_timepoint_stop_latitude: number | null;
  next_timepoint_stop_longitude: number | null;
  source_row_count: number;
  bus_trip_count: number | null;
  average_road_speed_mph: number | null;
  average_travel_time_minutes: number | null;
  average_road_distance_miles: number | null;
};

export type RouteSpeedSpineNode = {
  nodeId: string;
  stableKey: string;
  label: string;
  latitude: number;
  longitude: number;
  observationCount: number;
  months: string[];
  sourceStopIds: string[];
  sourceStopNames: string[];
  maxSourceSeparationMeters: number;
};

export type RouteSpeedSpineSegment = {
  segmentId: string;
  direction: string;
  displayOrder: number;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  months: string[];
  monthCount: number;
  sourceRowCount: number;
  busTripCount: number;
  averageRoadDistanceMiles: number | null;
  averageSpeedMph: number | null;
  stopOrder: {
    min: number;
    median: number;
    max: number;
    values: number[];
    changed: boolean;
  };
  raw: {
    rawSegmentKeyCount: number;
    rawStopPairCount: number;
    sourceStopPairs: Array<{
      fromStopId: string | null;
      fromStopName: string | null;
      toStopId: string | null;
      toStopName: string | null;
      stopOrders: number[];
      months: string[];
      sourceRowCount: number;
    }>;
    sourceKeys?: ClassifiedRouteSegmentSourceKey[];
  };
};

export type RouteSpeedSpineMonthCoverage = {
  month: string;
  sourceRowCount: number;
  busTripCount: number;
  rawSegmentKeyCount: number;
  rawStopPairCount: number;
  spineSegmentCount: number;
  coverageShare: number;
};

export type RouteSpeedSpineIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type RouteSpeedSpineArtifact = {
  artifactKind: "studio_route_speed_spine";
  schemaVersion: 1;
  generatedAt: string;
  routeId: string;
  routeSlug: string;
  source: {
    table: "local_route_segment_speed";
    dbPath: string;
    startMonth: string;
    endMonth: string | null;
    toleranceMeters: number;
    artifactPath: string;
  };
  summary: {
    monthCount: number;
    sourceRowCount: number;
    busTripCount: number;
    nodeCount: number;
    spineSegmentCount: number;
    rawSegmentKeyCount: number;
    rawStopPairCount: number;
    monthsWithRawKeyDriftCount: number;
    monthsWithPartialSpineCoverageCount: number;
    mergedNodeCount: number;
    segmentWithRawVariantCount: number;
    issueCount: number;
    keyedSourceKeyCount?: number;
    unkeyableSourceKeyCount?: number;
  };
  sourceKeys?: {
    observed: ClassifiedRouteSegmentSourceKey[];
  };
  nodes: RouteSpeedSpineNode[];
  segments: RouteSpeedSpineSegment[];
  monthCoverage: RouteSpeedSpineMonthCoverage[];
  validation: {
    status: "pass" | "warn" | "fail";
    issues: RouteSpeedSpineIssue[];
  };
};

export type RouteSpeedSpineReadiness =
  | "series_ready"
  | "series_ready_with_gaps"
  | "needs_pattern_review"
  | "failed";

export type RouteSpeedSpineReadinessAudit = {
  readiness: RouteSpeedSpineReadiness;
  reasons: string[];
  coverage: {
    minCoverageShare: number;
    meanCoverageShare: number;
    fullCoverageMonthCount: number;
    partialCoverageMonthCount: number;
    partialCoverageMonthShare: number;
    rawKeyDriftMonthCount: number;
    rawKeyDriftMonthShare: number;
  };
};

type SourcePoint = {
  index: number;
  role: "from" | "to";
  stopId: string | null;
  stopName: string | null;
  latitude: number;
  longitude: number;
  month: string;
  direction: string;
  weight: number;
};

type RowWithPoints = {
  row: RouteSpeedSpineSourceRow;
  fromPointIndex: number | null;
  toPointIndex: number | null;
};

type NodeCluster = {
  pointIndexes: number[];
};

type SegmentAccumulator = {
  direction: string;
  fromNodeId: string;
  toNodeId: string;
  months: Set<string>;
  sourceRowCount: number;
  busTripCount: number;
  speedWeightedSum: number;
  speedWeight: number;
  distanceWeightedSum: number;
  distanceWeight: number;
  stopOrders: Map<number, number>;
  rawSegmentKeys: Set<string>;
  rawStopPairs: Map<string, RawStopPairAccumulator>;
  sourceKeys: Map<string, ClassifiedRouteSegmentSourceKey>;
};

type RawStopPairAccumulator = {
  fromStopId: string | null;
  fromStopName: string | null;
  toStopId: string | null;
  toStopName: string | null;
  stopOrders: Set<number>;
  months: Set<string>;
  sourceRowCount: number;
};

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

export function routeSpeedSpineRouteSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function textKey(value: string | null): string {
  return value === null ? "<null>" : value;
}

function rawSegmentKey(row: RouteSpeedSpineSourceRow): string {
  return [
    row.direction,
    String(row.stop_order),
    textKey(row.timepoint_stop_id),
    textKey(row.next_timepoint_stop_id),
  ].join("|");
}

function rawStopPairKey(row: RouteSpeedSpineSourceRow): string {
  return [row.direction, textKey(row.timepoint_stop_id), textKey(row.next_timepoint_stop_id)].join(
    "|",
  );
}

function rawStopPairAccumulatorKey(row: RouteSpeedSpineSourceRow): string {
  return [
    textKey(row.timepoint_stop_id),
    textKey(row.timepoint_stop_name),
    textKey(row.next_timepoint_stop_id),
    textKey(row.next_timepoint_stop_name),
  ].join("|");
}

function classifiedSourceKey(row: RouteSpeedSpineSourceRow): ClassifiedRouteSegmentSourceKey {
  return classifyRouteSegmentSourceKey({
    routeId: row.route_id,
    month: row.month,
    direction: row.direction,
    stopOrder: row.stop_order,
    fromStopId: row.timepoint_stop_id,
    toStopId: row.next_timepoint_stop_id,
  });
}

function classifiedSourceKeyIdentity(classified: ClassifiedRouteSegmentSourceKey): string {
  const value = classified.status === "keyed" ? classified.key : classified.observed;
  return JSON.stringify([
    classified.status,
    value.routeId,
    value.month,
    value.direction,
    value.stopOrder,
    value.fromStopId,
    value.toStopId,
  ]);
}

function isFiniteCoordinate(latitude: number | null, longitude: number | null): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function haversineMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const phi1 = (left.latitude * Math.PI) / 180;
  const phi2 = (right.latitude * Math.PI) / 180;
  const dPhi = ((right.latitude - left.latitude) * Math.PI) / 180;
  const dLambda = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  let total = 0;
  let weight = 0;
  for (const entry of values) {
    if (!Number.isFinite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) {
      continue;
    }
    total += entry.value * entry.weight;
    weight += entry.weight;
  }
  return weight === 0 ? 0 : total / weight;
}

function weightedMedian(values: Map<number, number>): number {
  const entries = [...values.entries()].sort((left, right) => left[0] - right[0]);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (entries.length === 0 || totalWeight <= 0) return 0;
  let seen = 0;
  for (const [value, weight] of entries) {
    seen += weight;
    if (seen >= totalWeight / 2) return value;
  }
  return entries[entries.length - 1]?.[0] ?? 0;
}

function topWeightedText(values: Map<string, number>): string {
  const sorted = [...values.entries()].sort((left, right) => {
    if (left[1] !== right[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
  return sorted[0]?.[0] ?? "Unknown stop";
}

function sortedSet<T extends string | number>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right)),
  );
}

function createPoints(rows: readonly RouteSpeedSpineSourceRow[]): {
  points: SourcePoint[];
  rowRefs: RowWithPoints[];
  issues: RouteSpeedSpineIssue[];
} {
  const points: SourcePoint[] = [];
  const rowRefs: RowWithPoints[] = [];
  const issues: RouteSpeedSpineIssue[] = [];

  for (const row of rows) {
    let fromPointIndex: number | null = null;
    let toPointIndex: number | null = null;
    const weight = Math.max(1, Number(row.source_row_count) || 1);

    if (isFiniteCoordinate(row.timepoint_stop_latitude, row.timepoint_stop_longitude)) {
      fromPointIndex = points.length;
      points.push({
        index: fromPointIndex,
        role: "from",
        stopId: row.timepoint_stop_id,
        stopName: row.timepoint_stop_name,
        latitude: row.timepoint_stop_latitude as number,
        longitude: row.timepoint_stop_longitude as number,
        month: row.month,
        direction: row.direction,
        weight,
      });
    } else {
      issues.push({
        severity: "error",
        code: "missing_from_coordinate",
        message: "A source row is missing a valid from-timepoint coordinate.",
        context: {
          month: row.month,
          direction: row.direction,
          stopOrder: row.stop_order,
          stopId: row.timepoint_stop_id,
        },
      });
    }

    if (isFiniteCoordinate(row.next_timepoint_stop_latitude, row.next_timepoint_stop_longitude)) {
      toPointIndex = points.length;
      points.push({
        index: toPointIndex,
        role: "to",
        stopId: row.next_timepoint_stop_id,
        stopName: row.next_timepoint_stop_name,
        latitude: row.next_timepoint_stop_latitude as number,
        longitude: row.next_timepoint_stop_longitude as number,
        month: row.month,
        direction: row.direction,
        weight,
      });
    } else {
      issues.push({
        severity: "error",
        code: "missing_to_coordinate",
        message: "A source row is missing a valid next-timepoint coordinate.",
        context: {
          month: row.month,
          direction: row.direction,
          stopOrder: row.stop_order,
          stopId: row.next_timepoint_stop_id,
        },
      });
    }

    rowRefs.push({ row, fromPointIndex, toPointIndex });
  }

  return { points, rowRefs, issues };
}

function clusterPoints(points: readonly SourcePoint[], toleranceMeters: number): NodeCluster[] {
  const clusters: NodeCluster[] = [];
  for (const point of points) {
    let bestCluster: number[] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      let maxDistance = 0;
      let fits = true;
      for (const pointIndex of cluster.pointIndexes) {
        const existing = points[pointIndex];
        if (existing === undefined) continue;
        const distance = haversineMeters(point, existing);
        maxDistance = Math.max(maxDistance, distance);
        if (distance > toleranceMeters) {
          fits = false;
          break;
        }
      }
      if (fits && maxDistance < bestDistance) {
        bestCluster = cluster.pointIndexes;
        bestDistance = maxDistance;
      }
    }
    if (bestCluster === null) {
      clusters.push({ pointIndexes: [point.index] });
    } else {
      bestCluster.push(point.index);
    }
  }

  return clusters.sort((left, right) => {
    const leftMin = Math.min(...left.pointIndexes);
    const rightMin = Math.min(...right.pointIndexes);
    return leftMin - rightMin;
  });
}

function buildNodes(input: {
  clusters: readonly NodeCluster[];
  points: readonly SourcePoint[];
  toleranceMeters: number;
  issues: RouteSpeedSpineIssue[];
}): { nodes: RouteSpeedSpineNode[]; nodeIdByPointIndex: Map<number, string> } {
  const provisional = input.clusters.map((cluster) => {
    const clusterPoints = cluster.pointIndexes
      .map((pointIndex) => input.points[pointIndex])
      .filter((point): point is SourcePoint => point !== undefined);
    const latitude = weightedAverage(
      clusterPoints.map((point) => ({ value: point.latitude, weight: point.weight })),
    );
    const longitude = weightedAverage(
      clusterPoints.map((point) => ({ value: point.longitude, weight: point.weight })),
    );
    const stopIds = new Map<string, number>();
    const stopNames = new Map<string, number>();
    const months = new Set<string>();
    let observationCount = 0;

    for (const point of clusterPoints) {
      observationCount += point.weight;
      months.add(point.month);
      if (point.stopId !== null) {
        stopIds.set(point.stopId, (stopIds.get(point.stopId) ?? 0) + point.weight);
      }
      if (point.stopName !== null) {
        stopNames.set(point.stopName, (stopNames.get(point.stopName) ?? 0) + point.weight);
      }
    }

    let maxSourceSeparationMeters = 0;
    for (let left = 0; left < clusterPoints.length; left += 1) {
      const leftPoint = clusterPoints[left];
      if (leftPoint === undefined) continue;
      for (let right = left + 1; right < clusterPoints.length; right += 1) {
        const rightPoint = clusterPoints[right];
        if (rightPoint === undefined) continue;
        maxSourceSeparationMeters = Math.max(
          maxSourceSeparationMeters,
          haversineMeters(leftPoint, rightPoint),
        );
      }
    }

    return {
      cluster,
      latitude,
      longitude,
      observationCount,
      months: sortedSet(months),
      sourceStopIds: sortedSet(stopIds.keys()),
      sourceStopNames: sortedSet(stopNames.keys()),
      label: topWeightedText(stopNames),
      stableKey: `${Math.round(latitude * 10_000)}:${Math.round(longitude * 10_000)}`,
      maxSourceSeparationMeters,
    };
  });

  const sorted = provisional.toSorted((left, right) => {
    if (left.latitude !== right.latitude) return left.latitude - right.latitude;
    if (left.longitude !== right.longitude) return left.longitude - right.longitude;
    return left.label.localeCompare(right.label);
  });

  const nodeIdByPointIndex = new Map<number, string>();
  const nodes: RouteSpeedSpineNode[] = sorted.map((node, index) => {
    const nodeId = `node-${String(index + 1).padStart(3, "0")}`;
    for (const pointIndex of node.cluster.pointIndexes) {
      nodeIdByPointIndex.set(pointIndex, nodeId);
    }
    if (node.maxSourceSeparationMeters > input.toleranceMeters * 2) {
      input.issues.push({
        severity: "warn",
        code: "wide_node_cluster",
        message: "A geographic node merged points spanning more than twice the tolerance.",
        context: {
          nodeId,
          maxSourceSeparationMeters: round(node.maxSourceSeparationMeters, 1),
          toleranceMeters: input.toleranceMeters,
          sourceStopIds: node.sourceStopIds,
          sourceStopNames: node.sourceStopNames,
        },
      });
    }
    return {
      nodeId,
      stableKey: node.stableKey,
      label: node.label,
      latitude: round(node.latitude, 6),
      longitude: round(node.longitude, 6),
      observationCount: node.observationCount,
      months: node.months,
      sourceStopIds: node.sourceStopIds,
      sourceStopNames: node.sourceStopNames,
      maxSourceSeparationMeters: round(node.maxSourceSeparationMeters, 1),
    };
  });

  return { nodes, nodeIdByPointIndex };
}

function getOrCreateSegmentAccumulator(
  segments: Map<string, SegmentAccumulator>,
  input: { direction: string; fromNodeId: string; toNodeId: string },
): SegmentAccumulator {
  const key = `${input.direction}|${input.fromNodeId}|${input.toNodeId}`;
  const existing = segments.get(key);
  if (existing !== undefined) return existing;
  const created: SegmentAccumulator = {
    direction: input.direction,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    months: new Set(),
    sourceRowCount: 0,
    busTripCount: 0,
    speedWeightedSum: 0,
    speedWeight: 0,
    distanceWeightedSum: 0,
    distanceWeight: 0,
    stopOrders: new Map(),
    rawSegmentKeys: new Set(),
    rawStopPairs: new Map(),
    sourceKeys: new Map(),
  };
  segments.set(key, created);
  return created;
}

function addWeightedSegmentMetric(
  segment: SegmentAccumulator,
  field: "distance" | "speed",
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
    segment.speedWeightedSum += value * weight;
    segment.speedWeight += weight;
  } else {
    segment.distanceWeightedSum += value * weight;
    segment.distanceWeight += weight;
  }
}

function buildSegments(input: {
  rowRefs: readonly RowWithPoints[];
  nodeIdByPointIndex: Map<number, string>;
  nodesById: Map<string, RouteSpeedSpineNode>;
  routeSlug: string;
  issues: RouteSpeedSpineIssue[];
}): RouteSpeedSpineSegment[] {
  const segments = new Map<string, SegmentAccumulator>();

  for (const { row, fromPointIndex, toPointIndex } of input.rowRefs) {
    if (fromPointIndex === null || toPointIndex === null) continue;
    const fromNodeId = input.nodeIdByPointIndex.get(fromPointIndex);
    const toNodeId = input.nodeIdByPointIndex.get(toPointIndex);
    if (fromNodeId === undefined || toNodeId === undefined) {
      input.issues.push({
        severity: "error",
        code: "missing_node_assignment",
        message: "A source row had coordinates but could not be assigned to a spine node.",
        context: { month: row.month, direction: row.direction, stopOrder: row.stop_order },
      });
      continue;
    }
    if (fromNodeId === toNodeId) {
      input.issues.push({
        severity: "warn",
        code: "zero_length_spine_segment",
        message: "A source segment collapsed to the same from/to geographic node.",
        context: {
          month: row.month,
          direction: row.direction,
          stopOrder: row.stop_order,
          fromStopId: row.timepoint_stop_id,
          toStopId: row.next_timepoint_stop_id,
        },
      });
      continue;
    }

    const rowWeight = Math.max(1, Number(row.source_row_count) || 1);
    const busTripWeight = Math.max(0, Number(row.bus_trip_count) || 0);
    const segment = getOrCreateSegmentAccumulator(segments, {
      direction: row.direction,
      fromNodeId,
      toNodeId,
    });
    segment.months.add(row.month);
    segment.sourceRowCount += rowWeight;
    segment.busTripCount += busTripWeight;
    segment.stopOrders.set(
      row.stop_order,
      (segment.stopOrders.get(row.stop_order) ?? 0) + rowWeight,
    );
    segment.rawSegmentKeys.add(rawSegmentKey(row));
    const sourceKey = classifiedSourceKey(row);
    segment.sourceKeys.set(classifiedSourceKeyIdentity(sourceKey), sourceKey);
    addWeightedSegmentMetric(
      segment,
      "speed",
      row.average_road_speed_mph,
      busTripWeight || rowWeight,
    );
    addWeightedSegmentMetric(
      segment,
      "distance",
      row.average_road_distance_miles,
      busTripWeight || rowWeight,
    );

    const pairKey = rawStopPairAccumulatorKey(row);
    const rawPair =
      segment.rawStopPairs.get(pairKey) ??
      ({
        fromStopId: row.timepoint_stop_id,
        fromStopName: row.timepoint_stop_name,
        toStopId: row.next_timepoint_stop_id,
        toStopName: row.next_timepoint_stop_name,
        stopOrders: new Set<number>(),
        months: new Set<string>(),
        sourceRowCount: 0,
      } satisfies RawStopPairAccumulator);
    rawPair.stopOrders.add(row.stop_order);
    rawPair.months.add(row.month);
    rawPair.sourceRowCount += rowWeight;
    segment.rawStopPairs.set(pairKey, rawPair);
  }

  return [...segments.values()]
    .map((segment) => {
      const fromNode = input.nodesById.get(segment.fromNodeId);
      const toNode = input.nodesById.get(segment.toNodeId);
      const stopOrderValues = sortedSet(segment.stopOrders.keys());
      const medianOrder = weightedMedian(segment.stopOrders);
      const segmentId = [
        input.routeSlug,
        segment.direction.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        segment.fromNodeId,
        segment.toNodeId,
      ].join("-");
      const sourceStopPairs = [...segment.rawStopPairs.values()]
        .map((pair) => ({
          fromStopId: pair.fromStopId,
          fromStopName: pair.fromStopName,
          toStopId: pair.toStopId,
          toStopName: pair.toStopName,
          stopOrders: sortedSet(pair.stopOrders),
          months: sortedSet(pair.months),
          sourceRowCount: pair.sourceRowCount,
        }))
        .sort((left, right) => {
          const leftOrder = left.stopOrders[0] ?? 0;
          const rightOrder = right.stopOrders[0] ?? 0;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return `${left.fromStopId ?? ""}:${left.toStopId ?? ""}`.localeCompare(
            `${right.fromStopId ?? ""}:${right.toStopId ?? ""}`,
          );
        });
      return {
        segmentId,
        direction: segment.direction,
        displayOrder: medianOrder,
        fromNodeId: segment.fromNodeId,
        toNodeId: segment.toNodeId,
        label: `${fromNode?.label ?? segment.fromNodeId} to ${toNode?.label ?? segment.toNodeId}`,
        months: sortedSet(segment.months),
        monthCount: segment.months.size,
        sourceRowCount: segment.sourceRowCount,
        busTripCount: segment.busTripCount,
        averageRoadDistanceMiles:
          segment.distanceWeight === 0
            ? null
            : round(segment.distanceWeightedSum / segment.distanceWeight, 4),
        averageSpeedMph:
          segment.speedWeight === 0
            ? null
            : round(segment.speedWeightedSum / segment.speedWeight, 2),
        stopOrder: {
          min: Math.min(...stopOrderValues),
          median: medianOrder,
          max: Math.max(...stopOrderValues),
          values: stopOrderValues,
          changed: stopOrderValues.length > 1,
        },
        raw: {
          rawSegmentKeyCount: segment.rawSegmentKeys.size,
          rawStopPairCount: segment.rawStopPairs.size,
          sourceStopPairs,
          sourceKeys: [...segment.sourceKeys.values()].toSorted((left, right) =>
            classifiedSourceKeyIdentity(left).localeCompare(classifiedSourceKeyIdentity(right)),
          ),
        },
      } satisfies RouteSpeedSpineSegment;
    })
    .sort((left, right) => {
      if (left.direction !== right.direction) return left.direction.localeCompare(right.direction);
      if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
      return left.segmentId.localeCompare(right.segmentId);
    });
}

function buildMonthCoverage(input: {
  rows: readonly RouteSpeedSpineSourceRow[];
  rowRefs: readonly RowWithPoints[];
  nodeIdByPointIndex: Map<number, string>;
  spineSegmentCount: number;
}): RouteSpeedSpineMonthCoverage[] {
  const byMonth = new Map<
    string,
    {
      sourceRowCount: number;
      busTripCount: number;
      rawSegmentKeys: Set<string>;
      rawStopPairs: Set<string>;
      spineSegments: Set<string>;
    }
  >();

  for (const row of input.rows) {
    const month = byMonth.get(row.month) ?? {
      sourceRowCount: 0,
      busTripCount: 0,
      rawSegmentKeys: new Set<string>(),
      rawStopPairs: new Set<string>(),
      spineSegments: new Set<string>(),
    };
    month.sourceRowCount += Math.max(1, Number(row.source_row_count) || 1);
    month.busTripCount += Math.max(0, Number(row.bus_trip_count) || 0);
    month.rawSegmentKeys.add(rawSegmentKey(row));
    month.rawStopPairs.add(rawStopPairKey(row));
    byMonth.set(row.month, month);
  }

  for (const { row, fromPointIndex, toPointIndex } of input.rowRefs) {
    if (fromPointIndex === null || toPointIndex === null) continue;
    const fromNodeId = input.nodeIdByPointIndex.get(fromPointIndex);
    const toNodeId = input.nodeIdByPointIndex.get(toPointIndex);
    if (fromNodeId === undefined || toNodeId === undefined || fromNodeId === toNodeId) continue;
    byMonth.get(row.month)?.spineSegments.add(`${row.direction}|${fromNodeId}|${toNodeId}`);
  }

  return [...byMonth.entries()]
    .map(([month, summary]) => ({
      month,
      sourceRowCount: summary.sourceRowCount,
      busTripCount: summary.busTripCount,
      rawSegmentKeyCount: summary.rawSegmentKeys.size,
      rawStopPairCount: summary.rawStopPairs.size,
      spineSegmentCount: summary.spineSegments.size,
      coverageShare:
        input.spineSegmentCount === 0
          ? 0
          : round(summary.spineSegments.size / input.spineSegmentCount, 4),
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

export function buildRouteSpeedSpineArtifact(input: {
  routeId: string;
  routeSlug?: string;
  rows: readonly RouteSpeedSpineSourceRow[];
  generatedAt: string;
  dbPath: string;
  artifactPath: string;
  startMonth: string;
  endMonth: string | null;
  toleranceMeters?: number;
}): RouteSpeedSpineArtifact {
  const routeId = normalizeRouteId(input.routeId);
  const routeSlug = input.routeSlug ?? routeSpeedSpineRouteSlug(routeId);
  const toleranceMeters = input.toleranceMeters ?? ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS;
  const issues: RouteSpeedSpineIssue[] = [];
  const rows = input.rows.filter((row) => normalizeRouteId(row.route_id) === routeId);
  const observedSourceKeys = rows
    .map(classifiedSourceKey)
    .toSorted((left, right) =>
      classifiedSourceKeyIdentity(left).localeCompare(classifiedSourceKeyIdentity(right)),
    );
  const sourceRowCount = rows.reduce(
    (sum, row) => sum + Math.max(1, Number(row.source_row_count) || 1),
    0,
  );
  const busTripCount = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.bus_trip_count) || 0),
    0,
  );

  if (rows.length === 0) {
    issues.push({
      severity: "error",
      code: "no_source_rows",
      message: "No local_route_segment_speed rows were found for the requested route/window.",
      context: { routeId, startMonth: input.startMonth, endMonth: input.endMonth },
    });
  }

  const { points, rowRefs, issues: coordinateIssues } = createPoints(rows);
  issues.push(...coordinateIssues);
  const clusters = clusterPoints(points, toleranceMeters);
  const { nodes, nodeIdByPointIndex } = buildNodes({ clusters, points, toleranceMeters, issues });
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const segments = buildSegments({ rowRefs, nodeIdByPointIndex, nodesById, routeSlug, issues });
  const monthCoverage = buildMonthCoverage({
    rows,
    rowRefs,
    nodeIdByPointIndex,
    spineSegmentCount: segments.length,
  });

  const rawSegmentKeys = new Set(rows.map(rawSegmentKey));
  const rawStopPairs = new Set(rows.map(rawStopPairKey));
  const monthsWithRawKeyDriftCount = monthCoverage.filter(
    (month) => month.rawSegmentKeyCount !== month.spineSegmentCount,
  ).length;
  const monthsWithPartialSpineCoverageCount = monthCoverage.filter(
    (month) => month.spineSegmentCount < segments.length,
  ).length;
  const mergedNodeCount = nodes.filter(
    (node) => node.sourceStopIds.length > 1 || node.sourceStopNames.length > 1,
  ).length;
  const segmentWithRawVariantCount = segments.filter(
    (segment) =>
      segment.raw.rawSegmentKeyCount > 1 ||
      segment.raw.rawStopPairCount > 1 ||
      segment.stopOrder.changed,
  ).length;

  const status = issues.some((issue) => issue.severity === "error")
    ? "fail"
    : issues.some((issue) => issue.severity === "warn")
      ? "warn"
      : "pass";

  return {
    artifactKind: "studio_route_speed_spine",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeId,
    routeSlug,
    source: {
      table: "local_route_segment_speed",
      dbPath: input.dbPath,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      toleranceMeters,
      artifactPath: input.artifactPath,
    },
    summary: {
      monthCount: monthCoverage.length,
      sourceRowCount,
      busTripCount,
      nodeCount: nodes.length,
      spineSegmentCount: segments.length,
      rawSegmentKeyCount: rawSegmentKeys.size,
      rawStopPairCount: rawStopPairs.size,
      monthsWithRawKeyDriftCount,
      monthsWithPartialSpineCoverageCount,
      mergedNodeCount,
      segmentWithRawVariantCount,
      issueCount: issues.length,
      keyedSourceKeyCount: observedSourceKeys.filter((key) => key.status === "keyed").length,
      unkeyableSourceKeyCount: observedSourceKeys.filter(
        (key) => key.status === "unkeyable_missing_stop_pair",
      ).length,
    },
    sourceKeys: { observed: observedSourceKeys },
    nodes,
    segments,
    monthCoverage,
    validation: { status, issues },
  };
}

export function classifyRouteSpeedSpineArtifact(
  artifact: RouteSpeedSpineArtifact,
): RouteSpeedSpineReadinessAudit {
  const monthCount = artifact.summary.monthCount;
  const coverageShares = artifact.monthCoverage.map((row) => row.coverageShare);
  const minCoverageShare = coverageShares.length === 0 ? 0 : Math.min(...coverageShares);
  const meanCoverageShare =
    coverageShares.length === 0
      ? 0
      : coverageShares.reduce((sum, value) => sum + value, 0) / coverageShares.length;
  const fullCoverageMonthCount = artifact.monthCoverage.filter(
    (row) => row.coverageShare >= 1,
  ).length;
  const partialCoverageMonthCount = artifact.summary.monthsWithPartialSpineCoverageCount;
  const partialCoverageMonthShare = monthCount === 0 ? 0 : partialCoverageMonthCount / monthCount;
  const rawKeyDriftMonthCount = artifact.summary.monthsWithRawKeyDriftCount;
  const rawKeyDriftMonthShare = monthCount === 0 ? 0 : rawKeyDriftMonthCount / monthCount;
  const reasons: string[] = [];

  if (artifact.validation.status === "fail") reasons.push("validation_failed");
  if (artifact.summary.spineSegmentCount === 0) reasons.push("no_spine_segments");
  if (monthCount === 0) reasons.push("no_source_months");
  if (minCoverageShare < 0.75) reasons.push("low_monthly_spine_coverage");
  if (partialCoverageMonthShare > 0.25) reasons.push("partial_months_require_pattern_grouping");
  if (rawKeyDriftMonthShare > 0.5) reasons.push("high_raw_key_drift_collapsed_by_spine");

  let readiness: RouteSpeedSpineReadiness;
  if (
    artifact.validation.status === "fail" ||
    artifact.summary.spineSegmentCount === 0 ||
    monthCount === 0
  ) {
    readiness = "failed";
  } else if (partialCoverageMonthCount === 0) {
    readiness = "series_ready";
    reasons.push("full_spine_coverage_all_months");
  } else if (minCoverageShare >= 0.75 && partialCoverageMonthShare <= 0.25) {
    readiness = "series_ready_with_gaps";
    reasons.push("partial_months_within_gap_tolerance");
  } else {
    readiness = "needs_pattern_review";
  }

  return {
    readiness,
    reasons,
    coverage: {
      minCoverageShare: round(minCoverageShare, 4),
      meanCoverageShare: round(meanCoverageShare, 4),
      fullCoverageMonthCount,
      partialCoverageMonthCount,
      partialCoverageMonthShare: round(partialCoverageMonthShare, 4),
      rawKeyDriftMonthCount,
      rawKeyDriftMonthShare: round(rawKeyDriftMonthShare, 4),
    },
  };
}
