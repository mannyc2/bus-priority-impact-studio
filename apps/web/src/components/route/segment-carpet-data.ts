import type {
  StudioRouteSpeedHistoryCell,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

export type SegmentCarpetStatus = StudioRouteSpeedHistoryCell["status"];

export type SegmentCarpetCell = {
  month: string;
  status: SegmentCarpetStatus;
  speedMph: number | null;
  observationCount: number;
  traversalCount: number;
};

export type SegmentCarpetRow = {
  segmentId: string;
  label: string;
  direction: string;
  displayOrder: number;
  detailSegment: StudioSegment | null;
  cells: SegmentCarpetCell[];
  averageSpeedMph: number | null;
};

export type SegmentCarpetModel = {
  months: string[];
  rows: SegmentCarpetRow[];
  availableCellCount: number;
  missingCellCount: number;
  latestMonth: string | null;
};

type CellAggregate = {
  weightedSpeed: number;
  weight: number;
  observationCount: number;
  traversalCount: number;
  statuses: Set<SegmentCarpetStatus>;
};

function normalizedId(value: string): string {
  return value.trim().toLowerCase();
}

function aggregateStatus(statuses: ReadonlySet<SegmentCarpetStatus>): SegmentCarpetStatus {
  if (statuses.has("available")) return "available";
  if (statuses.has("source_missing")) return "source_missing";
  if (statuses.has("missing")) return "missing";
  return "not_expected";
}

function aggregateCell(
  month: string,
  cells: readonly StudioRouteSpeedHistoryCell[],
): SegmentCarpetCell {
  const aggregate: CellAggregate = {
    weightedSpeed: 0,
    weight: 0,
    observationCount: 0,
    traversalCount: 0,
    statuses: new Set(),
  };

  for (const cell of cells) {
    aggregate.statuses.add(cell.status);
    aggregate.observationCount += cell.observationCount;
    aggregate.traversalCount += cell.traversalCount;
    if (cell.status !== "available" || cell.averageSpeedMph === null) continue;
    const weight = Math.max(1, cell.observationCount || cell.traversalCount);
    aggregate.weightedSpeed += cell.averageSpeedMph * weight;
    aggregate.weight += weight;
  }

  return {
    month,
    status: aggregateStatus(aggregate.statuses),
    speedMph: aggregate.weight > 0 ? aggregate.weightedSpeed / aggregate.weight : null,
    observationCount: aggregate.observationCount,
    traversalCount: aggregate.traversalCount,
  };
}

function rowAverage(cells: readonly SegmentCarpetCell[]): number | null {
  let weighted = 0;
  let weight = 0;
  for (const cell of cells) {
    if (cell.speedMph === null) continue;
    const cellWeight = Math.max(1, cell.observationCount || cell.traversalCount);
    weighted += cell.speedMph * cellWeight;
    weight += cellWeight;
  }
  return weight > 0 ? weighted / weight : null;
}

export function buildSegmentCarpetModel(
  history: StudioRouteSpeedHistoryResponse | null,
  detailSegments: readonly StudioSegment[],
): SegmentCarpetModel {
  if (history === null) {
    return {
      months: [],
      rows: [],
      availableCellCount: 0,
      missingCellCount: 0,
      latestMonth: null,
    };
  }

  const detailById = new Map(detailSegments.map((segment) => [normalizedId(segment.id), segment]));
  const bySegmentMonth = new Map<string, StudioRouteSpeedHistoryCell[]>();
  for (const cell of history.cells) {
    const key = `${normalizedId(cell.segmentId)}\u0000${cell.month}`;
    const bucket = bySegmentMonth.get(key) ?? [];
    bucket.push(cell);
    bySegmentMonth.set(key, bucket);
  }

  let availableCellCount = 0;
  let missingCellCount = 0;
  const rows = history.dimensions.segments
    .map((segment) => {
      const cells = history.dimensions.months.map((month) => {
        const cell = aggregateCell(
          month,
          bySegmentMonth.get(`${normalizedId(segment.segmentId)}\u0000${month}`) ?? [],
        );
        if (cell.speedMph === null) missingCellCount += 1;
        else availableCellCount += 1;
        return cell;
      });
      return {
        segmentId: segment.segmentId,
        label: detailById.get(normalizedId(segment.segmentId))
          ? detailLabel(detailById.get(normalizedId(segment.segmentId)) as StudioSegment)
          : segment.label,
        direction: segment.direction,
        displayOrder: segment.displayOrder,
        detailSegment: detailById.get(normalizedId(segment.segmentId)) ?? null,
        cells,
        averageSpeedMph: rowAverage(cells),
      };
    })
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || left.segmentId.localeCompare(right.segmentId),
    );

  return {
    months: history.dimensions.months,
    rows,
    availableCellCount,
    missingCellCount,
    latestMonth: history.dimensions.months.at(-1) ?? null,
  };
}

function detailLabel(segment: StudioSegment): string {
  return `${segment.from} to ${segment.to}`;
}
