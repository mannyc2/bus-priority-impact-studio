import { createDataFrame, stats as s } from "@tidy-ts/dataframe";
import type { SegmentDaypartHistoryRow } from "../local-db/segment-daypart-history-rows";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const SEGMENT_DAYPART_PANEL_V1_ID = "segment_daypart_panel_v1" as const;
export const SEGMENT_DAYPART_RESIDUALS_V1_ID = "segment_daypart_residuals_v1" as const;

export type SegmentDaypartPanelSpec = {
  readonly panelId: typeof SEGMENT_DAYPART_PANEL_V1_ID;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
  readonly routeId?: string;
};

export type SegmentDaypartResidualRow = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly directionId: string;
  readonly daypart: string;
  readonly averageSpeedMph: number;
  readonly expectedSpeedMph: number;
  readonly speedResidualMph: number;
  readonly residualPercentileWithinMonthDaypart: number;
  readonly residualRankWithinMonthDaypart: number;
  readonly residualMonthDaypartCount: number;
  readonly segmentDaypartHistoryMeanSpeedMph: number;
  readonly segmentDaypartHistoryMedianSpeedMph: number;
  readonly segmentDaypartHistoryMonthCount: number;
  readonly routeMonthDaypartMeanSpeedMph: number;
  readonly routeDaypartHistoryMeanSpeedMph: number;
  readonly observationCount: number;
  readonly traversalCount: number;
};

export type SegmentDaypartResidualArtifactV1 = {
  readonly artifactKind: typeof SEGMENT_DAYPART_RESIDUALS_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly panelSpec: SegmentDaypartPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly panelRowCount: number;
    readonly modeledReleaseRowCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly daypartCount: number;
    readonly releaseMonthResidualMedianMph: number | null;
  };
  readonly rows: readonly SegmentDaypartResidualRow[];
};

type SupportedRow = {
  routeId: string;
  month: string;
  segmentId: string;
  directionId: string;
  daypart: string;
  averageSpeedMph: number;
  observationCount: number;
  traversalCount: number;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function key(parts: readonly string[]): string {
  return parts.join("\0");
}

function percentileRank(value: number, values: readonly number[]): number {
  if (values.length === 0) return 0;
  let count = 0;
  for (const candidate of values) {
    if (candidate <= value) count += 1;
  }
  return count / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return s.median(values);
}

export function segmentDaypartPanelSpecV1(input: SegmentDaypartPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: SEGMENT_DAYPART_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + direction + segment_id + daypart",
    timeKey: "month",
    entityKeys: ["route_id", "direction", "segment_id", "daypart"],
    measures: ["average_speed_mph", "observation_count", "traversal_count"],
    joins: [],
    coverage: [
      "source_row_count",
      "supported_row_count",
      "segment_daypart_history_month_count",
      "residual_month_daypart_count",
    ],
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    releaseFilter: { month: input.endMonth },
    requiredProducts: [
      {
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
        reason:
          "Monthly segment daypart speed rows pre-aggregated from local_route_segment_speed.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_observation_count",
        description: "Rows with too few source observations are excluded from daypart modeling.",
        threshold: input.minObservationCount,
      },
      {
        ruleId: "positive_traversal_count",
        description: "Rows must have positive traversal support.",
        threshold: "> 0",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the segment-daypart-month was eligible and was not abnormal under this daypart residual model; unsupported rows remain missing/coverage states.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function supportedRows(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly spec: SegmentDaypartPanelSpec;
}): SupportedRow[] {
  const output: SupportedRow[] = [];
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const segmentId = text(row.segment_id);
    const directionId = text(row.direction);
    const daypart = text(row.daypart);
    const averageSpeedMph = numberValue(row.average_speed_mph);
    const observationCount = numberValue(row.observation_count);
    const traversalCount = numberValue(row.traversal_count);
    if (
      routeId === null ||
      month === null ||
      segmentId === null ||
      directionId === null ||
      daypart === null ||
      averageSpeedMph === null ||
      observationCount === null ||
      traversalCount === null
    ) {
      continue;
    }
    if (month < input.spec.startMonth || month > input.spec.endMonth) continue;
    if (input.spec.routeId !== undefined && routeId !== input.spec.routeId) continue;
    if (observationCount < input.spec.minObservationCount || traversalCount <= 0) continue;
    output.push({
      routeId,
      month,
      segmentId,
      directionId,
      daypart,
      averageSpeedMph,
      observationCount,
      traversalCount,
    });
  }
  return output;
}

function manifest(input: {
  readonly spec: SegmentDaypartPanelSpec;
  readonly generatedAt: string;
  readonly sourceRowCount: number;
  readonly supportedRowCount: number;
  readonly panelRowCount: number;
  readonly routeCount: number;
  readonly segmentCount: number;
  readonly monthCount: number;
}): PanelManifest {
  return {
    panelId: SEGMENT_DAYPART_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: segmentDaypartPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_segment_speed",
        role: "primary_daypart_speed_panel_source",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.sourceRowCount,
      supportedRowCount: input.supportedRowCount,
      panelRowCount: input.panelRowCount,
      routeCount: input.routeCount,
      entityCount: input.segmentCount,
      monthCount: input.monthCount,
    },
    limitations: [
      "Dayparts are fixed hour buckets and do not model school, event, or holiday calendars.",
      "Expected speed adjusts same-segment daypart history by route-month-daypart movement; it is not a causal model.",
      "Segment identity is route/direction/timepoint-pair based and is not yet a route-shape-version-proof linear reference.",
    ],
  };
}

export function buildSegmentDaypartResidualArtifactV1(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly spec: SegmentDaypartPanelSpec;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): SegmentDaypartResidualArtifactV1 {
  const rows = supportedRows(input);
  const panelRows = rows.length === 0 ? [] : buildPanelRows(rows);
  const releaseRows = panelRows.filter((row) => row.month === input.releaseMonth);
  const panelManifest = manifest({
    spec: input.spec,
    generatedAt: input.generatedAt,
    sourceRowCount: input.rows.length,
    supportedRowCount: rows.length,
    panelRowCount: panelRows.length,
    routeCount: new Set(panelRows.map((row) => row.routeId)).size,
    segmentCount: new Set(panelRows.map((row) => row.segmentId)).size,
    monthCount: new Set(panelRows.map((row) => row.month)).size,
  });

  return {
    artifactKind: SEGMENT_DAYPART_RESIDUALS_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.releaseMonth,
    panelSpec: input.spec,
    panelManifest,
    summary: {
      panelRowCount: panelRows.length,
      modeledReleaseRowCount: releaseRows.length,
      routeCount: new Set(releaseRows.map((row) => row.routeId)).size,
      segmentCount: new Set(releaseRows.map((row) => row.segmentId)).size,
      daypartCount: new Set(releaseRows.map((row) => row.daypart)).size,
      releaseMonthResidualMedianMph: median(releaseRows.map((row) => row.speedResidualMph)),
    },
    rows: releaseRows,
  };
}

function buildPanelRows(rows: readonly SupportedRow[]): SegmentDaypartResidualRow[] {
  const df = createDataFrame(rows);
  const routeMonthDaypartMeans = new Map(
    df
      .groupBy("routeId", "month", "daypart")
      .summarize({ mean: (group) => s.mean(group.averageSpeedMph) })
      .toArray()
      .map((row) => [key([row.routeId, row.month, row.daypart]), row.mean] as const),
  );
  const routeDaypartHistoryMeans = new Map(
    df
      .groupBy("routeId", "daypart")
      .summarize({ mean: (group) => s.mean(group.averageSpeedMph) })
      .toArray()
      .map((row) => [key([row.routeId, row.daypart]), row.mean] as const),
  );
  const segmentDaypartHistory = new Map(
    df
      .groupBy("segmentId", "daypart")
      .summarize({
        mean: (group) => s.mean(group.averageSpeedMph),
        median: (group) => s.median(group.averageSpeedMph),
        monthCount: (group) => group.nrows(),
      })
      .toArray()
      .map((row) => [
        key([row.segmentId, row.daypart]),
        { mean: row.mean, median: row.median, monthCount: row.monthCount },
      ] as const),
  );

  const initialRows = rows.map((row) => {
    const routeMonthDaypartMeanSpeedMph =
      routeMonthDaypartMeans.get(key([row.routeId, row.month, row.daypart])) ??
      row.averageSpeedMph;
    const routeDaypartHistoryMeanSpeedMph =
      routeDaypartHistoryMeans.get(key([row.routeId, row.daypart])) ??
      routeMonthDaypartMeanSpeedMph;
    const history = segmentDaypartHistory.get(key([row.segmentId, row.daypart]));
    const segmentDaypartHistoryMeanSpeedMph = history?.mean ?? row.averageSpeedMph;
    const expectedSpeedMph =
      segmentDaypartHistoryMeanSpeedMph +
      (routeMonthDaypartMeanSpeedMph - routeDaypartHistoryMeanSpeedMph);
    return {
      ...row,
      routeMonthDaypartMeanSpeedMph,
      routeDaypartHistoryMeanSpeedMph,
      segmentDaypartHistoryMeanSpeedMph,
      segmentDaypartHistoryMedianSpeedMph: history?.median ?? row.averageSpeedMph,
      segmentDaypartHistoryMonthCount: history?.monthCount ?? 1,
      expectedSpeedMph,
      speedResidualMph: row.averageSpeedMph - expectedSpeedMph,
    };
  });

  const residualsByMonthDaypart = new Map<string, number[]>();
  for (const row of initialRows) {
    const bucketKey = key([row.month, row.daypart]);
    const values = residualsByMonthDaypart.get(bucketKey) ?? [];
    values.push(row.speedResidualMph);
    residualsByMonthDaypart.set(bucketKey, values);
  }

  const rankByMonthDaypartSegment = new Map<string, number>();
  for (const bucketKey of residualsByMonthDaypart.keys()) {
    const [month, daypart] = bucketKey.split("\0");
    const sorted = initialRows
      .filter((row) => row.month === month && row.daypart === daypart)
      .sort(
        (left, right) =>
          left.speedResidualMph - right.speedResidualMph ||
          left.segmentId.localeCompare(right.segmentId),
      );
    sorted.forEach((row, index) => {
      rankByMonthDaypartSegment.set(key([row.month, row.daypart, row.segmentId]), index + 1);
    });
  }

  return initialRows
    .map((row) => {
      const residualBucket = residualsByMonthDaypart.get(key([row.month, row.daypart])) ?? [];
      return {
        routeId: row.routeId,
        month: row.month,
        segmentId: row.segmentId,
        directionId: row.directionId,
        daypart: row.daypart,
        averageSpeedMph: round(row.averageSpeedMph),
        expectedSpeedMph: round(row.expectedSpeedMph),
        speedResidualMph: round(row.speedResidualMph),
        residualPercentileWithinMonthDaypart: round(
          percentileRank(row.speedResidualMph, residualBucket),
        ),
        residualRankWithinMonthDaypart:
          rankByMonthDaypartSegment.get(key([row.month, row.daypart, row.segmentId])) ?? 0,
        residualMonthDaypartCount: residualBucket.length,
        segmentDaypartHistoryMeanSpeedMph: round(row.segmentDaypartHistoryMeanSpeedMph),
        segmentDaypartHistoryMedianSpeedMph: round(row.segmentDaypartHistoryMedianSpeedMph),
        segmentDaypartHistoryMonthCount: row.segmentDaypartHistoryMonthCount,
        routeMonthDaypartMeanSpeedMph: round(row.routeMonthDaypartMeanSpeedMph),
        routeDaypartHistoryMeanSpeedMph: round(row.routeDaypartHistoryMeanSpeedMph),
        observationCount: row.observationCount,
        traversalCount: row.traversalCount,
      };
    })
    .sort(
      (left, right) =>
        left.month.localeCompare(right.month) ||
        left.routeId.localeCompare(right.routeId) ||
        left.directionId.localeCompare(right.directionId) ||
        left.segmentId.localeCompare(right.segmentId) ||
        left.daypart.localeCompare(right.daypart),
    );
}
