import { serializeStudioSegmentId } from "@bp/analytics/feature-history";

export type StudySpeedSourceRow = {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
  readonly stopOrder: number;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly hourOfDay: number;
  readonly borough: string;
  readonly averageSpeedMph: number;
  readonly busTripCount: number;
};

export type StudyPanelCell = {
  readonly routeId: string;
  readonly borough: string;
  readonly spineSegmentId: string;
  readonly month: string;
  readonly averageSpeedMph: number;
  readonly busTripCount: number;
};

export type StudySegmentSeries = {
  readonly routeId: string;
  readonly borough: string;
  readonly spineSegmentId: string;
  readonly cells: readonly StudyPanelCell[];
};

export type EligibleStudySegment = StudySegmentSeries & {
  readonly preMonthCount: number;
  readonly postMonthCount: number;
  readonly preMeanSpeedMph: number;
  readonly postMeanSpeedMph: number;
  readonly preTripCount: number;
  readonly postTripCount: number;
};

export type StudyPanelAggregation = {
  readonly cells: readonly StudyPanelCell[];
  readonly unmatchedSourceRowCount: number;
  readonly ignoredSourceRowCount: number;
};

type WeightedEntry = { readonly value: number; readonly weight: number };

export function weightedAverage(entries: readonly WeightedEntry[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) {
      continue;
    }
    weightedSum += entry.value * entry.weight;
    totalWeight += entry.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function sourceSegmentId(row: StudySpeedSourceRow): string {
  return serializeStudioSegmentId({
    routeId: row.routeId,
    month: row.month,
    direction: row.direction,
    stopOrder: row.stopOrder,
    fromStopId: row.fromStopId,
    toStopId: row.toStopId,
  });
}

export function aggregateStudyPanel(input: {
  readonly rows: readonly StudySpeedSourceRow[];
  readonly spineSegmentIdBySourceId: ReadonlyMap<string, string>;
  readonly hours?: ReadonlySet<number> | undefined;
}): StudyPanelAggregation {
  const groups = new Map<
    string,
    {
      routeId: string;
      borough: string;
      spineSegmentId: string;
      month: string;
      weightedSpeedSum: number;
      busTripCount: number;
    }
  >();
  let unmatchedSourceRowCount = 0;
  let ignoredSourceRowCount = 0;

  for (const row of input.rows) {
    if (input.hours !== undefined && !input.hours.has(row.hourOfDay)) continue;
    if (
      !Number.isFinite(row.averageSpeedMph) ||
      !Number.isFinite(row.busTripCount) ||
      row.averageSpeedMph < 0 ||
      row.busTripCount <= 0
    ) {
      ignoredSourceRowCount += 1;
      continue;
    }
    const spineSegmentId = input.spineSegmentIdBySourceId.get(sourceSegmentId(row));
    if (spineSegmentId === undefined) {
      unmatchedSourceRowCount += 1;
      continue;
    }
    const key = [row.routeId, spineSegmentId, row.month].join("|");
    const group = groups.get(key) ?? {
      routeId: row.routeId,
      borough: row.borough,
      spineSegmentId,
      month: row.month,
      weightedSpeedSum: 0,
      busTripCount: 0,
    };
    group.weightedSpeedSum += row.averageSpeedMph * row.busTripCount;
    group.busTripCount += row.busTripCount;
    groups.set(key, group);
  }

  return {
    cells: [...groups.values()]
      .map((group) => ({
        routeId: group.routeId,
        borough: group.borough,
        spineSegmentId: group.spineSegmentId,
        month: group.month,
        averageSpeedMph: group.weightedSpeedSum / group.busTripCount,
        busTripCount: group.busTripCount,
      }))
      .toSorted(
        (left, right) =>
          left.routeId.localeCompare(right.routeId) ||
          left.spineSegmentId.localeCompare(right.spineSegmentId) ||
          left.month.localeCompare(right.month),
      ),
    unmatchedSourceRowCount,
    ignoredSourceRowCount,
  };
}

export function segmentSeries(cells: readonly StudyPanelCell[]): StudySegmentSeries[] {
  const groups = new Map<string, StudyPanelCell[]>();
  for (const cell of cells) {
    const values = groups.get(cell.spineSegmentId) ?? [];
    values.push(cell);
    groups.set(cell.spineSegmentId, values);
  }
  return [...groups.entries()]
    .map(([spineSegmentId, values]) => {
      const first = values[0];
      if (first === undefined) throw new Error(`Empty study segment series ${spineSegmentId}`);
      return {
        routeId: first.routeId,
        borough: first.borough,
        spineSegmentId,
        cells: values.toSorted((left, right) => left.month.localeCompare(right.month)),
      };
    })
    .toSorted((left, right) => left.spineSegmentId.localeCompare(right.spineSegmentId));
}

function summarizeWindow(
  cells: readonly StudyPanelCell[],
  months: ReadonlySet<string>,
): { monthCount: number; meanSpeedMph: number; tripCount: number } | null {
  const values = cells.filter((cell) => months.has(cell.month) && cell.busTripCount > 0);
  const mean = weightedAverage(
    values.map((cell) => ({ value: cell.averageSpeedMph, weight: cell.busTripCount })),
  );
  if (mean === null) return null;
  return {
    monthCount: new Set(values.map((cell) => cell.month)).size,
    meanSpeedMph: mean,
    tripCount: values.reduce((sum, cell) => sum + cell.busTripCount, 0),
  };
}

export function eligibleSegmentSeries(input: {
  readonly series: readonly StudySegmentSeries[];
  readonly preMonths: ReadonlySet<string>;
  readonly postMonths: ReadonlySet<string>;
  readonly minimumMonthsPerSide?: number | undefined;
}): {
  readonly eligible: readonly EligibleStudySegment[];
  readonly droppedInsufficientWindowCount: number;
} {
  const minimumMonthsPerSide = input.minimumMonthsPerSide ?? 4;
  const eligible: EligibleStudySegment[] = [];
  let droppedInsufficientWindowCount = 0;
  for (const series of input.series) {
    const pre = summarizeWindow(series.cells, input.preMonths);
    const post = summarizeWindow(series.cells, input.postMonths);
    if (
      pre === null ||
      post === null ||
      pre.monthCount < minimumMonthsPerSide ||
      post.monthCount < minimumMonthsPerSide
    ) {
      droppedInsufficientWindowCount += 1;
      continue;
    }
    eligible.push({
      ...series,
      preMonthCount: pre.monthCount,
      postMonthCount: post.monthCount,
      preMeanSpeedMph: pre.meanSpeedMph,
      postMeanSpeedMph: post.meanSpeedMph,
      preTripCount: pre.tripCount,
      postTripCount: post.tripCount,
    });
  }
  return { eligible, droppedInsufficientWindowCount };
}

export function monthIndex(month: string): number {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);
  if (match === null) throw new Error(`Invalid ISO month ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error(`Invalid ISO month ${month}`);
  return year * 12 + monthNumber - 1;
}

export function isoMonthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function studyWindowMonths(input: {
  readonly implementationMonth: string;
  readonly analysisMonth: string;
  readonly windowMonths?: number | undefined;
  readonly earliestMonth?: string | undefined;
}): { readonly preMonths: string[]; readonly postMonths: string[]; readonly allMonths: string[] } {
  const implementation = monthIndex(input.implementationMonth);
  const analysis = monthIndex(input.analysisMonth);
  const earliest = monthIndex(input.earliestMonth ?? "2023-04");
  const windowMonths = input.windowMonths ?? 6;
  const preMonths: string[] = [];
  const postMonths: string[] = [];
  for (
    let index = Math.max(earliest, implementation - windowMonths);
    index < implementation;
    index += 1
  ) {
    preMonths.push(isoMonthFromIndex(index));
  }
  for (
    let index = implementation + 1;
    index <= Math.min(analysis, implementation + windowMonths);
    index += 1
  ) {
    postMonths.push(isoMonthFromIndex(index));
  }
  return {
    preMonths,
    postMonths,
    allMonths: [...preMonths, input.implementationMonth, ...postMonths],
  };
}

export const PEAK_HOURS = new Set([7, 8, 9, 10, 16, 17, 18, 19]);
