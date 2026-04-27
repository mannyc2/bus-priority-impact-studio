export type SegmentSpeedObservation = {
  routeId: string;
  isoMonth: string;
  dayOfWeek?: string;
  hourOfDay?: number;
  direction: string;
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  roadDistanceMiles: number;
  averageTravelTimeMinutes: number;
  averageRoadSpeedMph: number;
  busTripCount: number;
  ridership?: number;
  transfers?: number;
};

export type SegmentHotspot = {
  routeId: string;
  isoMonth: string;
  segmentId: string;
  direction: string;
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number;
  weightedAverageTravelTimeMinutes: number;
  averageRoadDistanceMiles: number;
  slowWindowShare: number;
  speedSeverity: number;
  hotspotScore: number;
  ridershipExposure?: number;
  transferExposure?: number;
  riderDelayIndex?: number;
  riderImpactShare?: number;
  riderWeightedSpeedSeverity?: number;
  riderWeightedSlowWindowShare?: number;
  riderImpactScore?: number;
};

export type HotspotOptions = {
  targetSpeedMph?: number;
  slowSpeedThresholdMph?: number;
  limit?: number;
};

export type HotspotResult = {
  routeId: string;
  isoMonth: string;
  targetSpeedMph: number;
  slowSpeedThresholdMph: number;
  routeWeightedAverageSpeedMph: number;
  observationCount: number;
  busTripCount: number;
  ridershipWeighted: boolean;
  ridershipMatchedObservationCount?: number;
  ridershipExposure?: number;
  segmentCount: number;
  hotspots: SegmentHotspot[];
};

type SegmentAccumulator = {
  routeId: string;
  isoMonth: string;
  segmentId: string;
  direction: string;
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedSpeedSum: number;
  weightedTravelTimeSum: number;
  roadDistanceSum: number;
  slowWindowCount: number;
  ridershipMatchedObservationCount: number;
  ridershipExposure: number;
  transferExposure: number;
  riderDelayIndex: number;
  riderWeightedSlowWindowSum: number;
};

const defaultTargetSpeedMph = 8;

function segmentId(row: SegmentSpeedObservation): string {
  return [
    row.routeId,
    row.isoMonth,
    row.direction,
    row.stopOrder,
    row.timepointStopId,
    row.nextTimepointStopId,
  ].join(":");
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createAccumulator(row: SegmentSpeedObservation): SegmentAccumulator {
  return {
    routeId: row.routeId,
    isoMonth: row.isoMonth,
    segmentId: segmentId(row),
    direction: row.direction,
    stopOrder: row.stopOrder,
    timepointStopId: row.timepointStopId,
    timepointStopName: row.timepointStopName,
    nextTimepointStopId: row.nextTimepointStopId,
    nextTimepointStopName: row.nextTimepointStopName,
    observationCount: 0,
    busTripCount: 0,
    weightedSpeedSum: 0,
    weightedTravelTimeSum: 0,
    roadDistanceSum: 0,
    slowWindowCount: 0,
    ridershipMatchedObservationCount: 0,
    ridershipExposure: 0,
    transferExposure: 0,
    riderDelayIndex: 0,
    riderWeightedSlowWindowSum: 0,
  };
}

function toHotspot(
  accumulator: SegmentAccumulator,
  targetSpeedMph: number,
  maxRiderDelayIndex: number,
): SegmentHotspot {
  const weightedAverageSpeedMph = accumulator.weightedSpeedSum / accumulator.busTripCount;
  const speedSeverity = clamp((targetSpeedMph - weightedAverageSpeedMph) / targetSpeedMph, 0, 1);
  const slowWindowShare = accumulator.slowWindowCount / accumulator.observationCount;
  const output: SegmentHotspot = {
    routeId: accumulator.routeId,
    isoMonth: accumulator.isoMonth,
    segmentId: accumulator.segmentId,
    direction: accumulator.direction,
    stopOrder: accumulator.stopOrder,
    timepointStopId: accumulator.timepointStopId,
    timepointStopName: accumulator.timepointStopName,
    nextTimepointStopId: accumulator.nextTimepointStopId,
    nextTimepointStopName: accumulator.nextTimepointStopName,
    observationCount: accumulator.observationCount,
    busTripCount: accumulator.busTripCount,
    weightedAverageSpeedMph: round(weightedAverageSpeedMph),
    weightedAverageTravelTimeMinutes: round(
      accumulator.weightedTravelTimeSum / accumulator.busTripCount,
    ),
    averageRoadDistanceMiles: round(accumulator.roadDistanceSum / accumulator.observationCount),
    slowWindowShare: round(slowWindowShare),
    speedSeverity: round(speedSeverity),
    hotspotScore: Math.round((0.65 * speedSeverity + 0.35 * slowWindowShare) * 100),
  };

  if (accumulator.ridershipExposure > 0 && maxRiderDelayIndex > 0) {
    const riderImpactShare = accumulator.riderDelayIndex / maxRiderDelayIndex;
    const riderWeightedSpeedSeverity = accumulator.riderDelayIndex / accumulator.ridershipExposure;
    const riderWeightedSlowWindowShare =
      accumulator.riderWeightedSlowWindowSum / accumulator.ridershipExposure;

    output.ridershipExposure = round(accumulator.ridershipExposure);
    output.transferExposure = round(accumulator.transferExposure);
    output.riderDelayIndex = round(accumulator.riderDelayIndex);
    output.riderImpactShare = round(riderImpactShare);
    output.riderWeightedSpeedSeverity = round(riderWeightedSpeedSeverity);
    output.riderWeightedSlowWindowShare = round(riderWeightedSlowWindowShare);
    output.riderImpactScore = Math.round(
      (0.65 * (output.hotspotScore / 100) + 0.35 * riderImpactShare) * 100,
    );
  }

  return output;
}

export function detectSegmentHotspots(
  observations: SegmentSpeedObservation[],
  options: HotspotOptions = {},
): HotspotResult {
  if (observations.length === 0) {
    throw new Error("Cannot detect hotspots without segment speed observations.");
  }

  const targetSpeedMph = options.targetSpeedMph ?? defaultTargetSpeedMph;
  const slowSpeedThresholdMph = options.slowSpeedThresholdMph ?? targetSpeedMph;
  const limit = options.limit ?? 10;
  const groups = new Map<string, SegmentAccumulator>();
  let routeWeightedSpeedSum = 0;
  let routeBusTripCount = 0;
  let ridershipMatchedObservationCount = 0;
  let ridershipExposure = 0;

  for (const row of observations) {
    if (row.busTripCount <= 0) {
      continue;
    }

    const id = segmentId(row);
    const accumulator = groups.get(id) ?? createAccumulator(row);
    accumulator.observationCount += 1;
    accumulator.busTripCount += row.busTripCount;
    accumulator.weightedSpeedSum += row.averageRoadSpeedMph * row.busTripCount;
    accumulator.weightedTravelTimeSum += row.averageTravelTimeMinutes * row.busTripCount;
    accumulator.roadDistanceSum += row.roadDistanceMiles;
    const rowSpeedSeverity = clamp(
      (targetSpeedMph - row.averageRoadSpeedMph) / targetSpeedMph,
      0,
      1,
    );
    if (row.averageRoadSpeedMph < slowSpeedThresholdMph) {
      accumulator.slowWindowCount += 1;
    }
    if (row.ridership !== undefined && row.ridership > 0) {
      accumulator.ridershipMatchedObservationCount += 1;
      accumulator.ridershipExposure += row.ridership;
      accumulator.transferExposure += row.transfers ?? 0;
      accumulator.riderDelayIndex += row.ridership * rowSpeedSeverity;
      if (row.averageRoadSpeedMph < slowSpeedThresholdMph) {
        accumulator.riderWeightedSlowWindowSum += row.ridership;
      }
      ridershipMatchedObservationCount += 1;
      ridershipExposure += row.ridership;
    }
    groups.set(id, accumulator);

    routeBusTripCount += row.busTripCount;
    routeWeightedSpeedSum += row.averageRoadSpeedMph * row.busTripCount;
  }

  if (routeBusTripCount === 0) {
    throw new Error("Cannot detect hotspots without positive bus trip counts.");
  }

  const maxRiderDelayIndex = Math.max(
    0,
    ...[...groups.values()].map((group) => group.riderDelayIndex),
  );
  const ridershipWeighted = maxRiderDelayIndex > 0;
  const hotspots = [...groups.values()]
    .filter((group) => group.busTripCount > 0)
    .map((group) => toHotspot(group, targetSpeedMph, maxRiderDelayIndex))
    .sort((left, right) => {
      if (ridershipWeighted) {
        const leftScore = left.riderImpactScore ?? left.hotspotScore;
        const rightScore = right.riderImpactScore ?? right.hotspotScore;
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
      }

      if (right.hotspotScore !== left.hotspotScore) {
        return right.hotspotScore - left.hotspotScore;
      }

      return left.weightedAverageSpeedMph - right.weightedAverageSpeedMph;
    })
    .slice(0, limit);

  const output: HotspotResult = {
    routeId: observations[0]?.routeId ?? "",
    isoMonth: observations[0]?.isoMonth ?? "",
    targetSpeedMph,
    slowSpeedThresholdMph,
    routeWeightedAverageSpeedMph: round(routeWeightedSpeedSum / routeBusTripCount),
    observationCount: observations.length,
    busTripCount: routeBusTripCount,
    ridershipWeighted,
    segmentCount: groups.size,
    hotspots,
  };

  if (ridershipWeighted) {
    output.ridershipMatchedObservationCount = ridershipMatchedObservationCount;
    output.ridershipExposure = round(ridershipExposure);
  }

  return output;
}
