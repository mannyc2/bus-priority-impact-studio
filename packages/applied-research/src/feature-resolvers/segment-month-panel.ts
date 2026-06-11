import { createDataFrame, stats as s } from "@tidy-ts/dataframe";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const SEGMENT_MONTH_PANEL_V1_ID = "segment_month_panel_v1" as const;
export const SEGMENT_SPEED_RESIDUALS_V1_ID = "segment_speed_residuals_v1" as const;

export type SegmentMonthPanelSpec = {
  readonly panelId: typeof SEGMENT_MONTH_PANEL_V1_ID;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
  readonly routeId?: string;
};

export function segmentMonthPanelSpecV1(input: SegmentMonthPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: SEGMENT_MONTH_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + direction + stable_segment_key",
    timeKey: "month",
    entityKeys: ["route_id", "direction", "stop_order", "timepoint_pair"],
    measures: [
      "average_speed_mph",
      "segment_length_feet",
      "observation_count",
      "bus_trip_count",
    ],
    joins: [],
    coverage: [
      "source_row_count",
      "supported_row_count",
      "segment_history_month_count",
      "residual_month_count",
    ],
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    releaseFilter: {
      month: input.endMonth,
    },
    requiredProducts: [
      {
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
        reason: "Monthly MTA route-segment speed rows aggregated by route, month, direction, and timepoint pair.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_observation_count",
        description: "Rows with too few source observations are excluded from residual modeling.",
        threshold: input.minObservationCount,
      },
      {
        ruleId: "positive_bus_trip_count",
        description: "Rows must have positive bus trip support to avoid empty weighted averages.",
        threshold: "> 0",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the segment-month was eligible for residual modeling and was not abnormal under this model; missing or unsupported rows must be represented separately.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

export type SegmentMonthPanelSourceRow = {
  readonly route_id: unknown;
  readonly month: unknown;
  readonly segment_id: unknown;
  readonly stable_segment_key?: unknown;
  readonly direction: unknown;
  readonly stop_order: unknown;
  readonly average_speed_mph: unknown;
  readonly segment_length_feet?: unknown;
  readonly observation_count: unknown;
  readonly bus_trip_count: unknown;
};

export type SegmentMonthPanelRow = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly stableSegmentKey: string;
  readonly directionId: string;
  readonly stopOrder: number;
  readonly directionMaxStopOrder: number;
  readonly isTerminalSegment: boolean;
  readonly averageSpeedMph: number;
  readonly segmentLengthFeet: number | null;
  readonly observationCount: number;
  readonly busTripCount: number;
  readonly routeMonthMeanSpeedMph: number;
  readonly routeHistoryMeanSpeedMph: number;
  readonly segmentHistoryMeanSpeedMph: number;
  readonly segmentHistoryMedianSpeedMph: number;
  readonly segmentHistoryMonthCount: number;
  readonly expectedSpeedMph: number;
  readonly speedResidualMph: number;
  readonly residualPercentileWithinMonth: number;
  readonly residualRankWithinMonth: number;
  readonly residualMonthCount: number;
};

export type SegmentMonthPanelV1 = {
  readonly artifactKind: typeof SEGMENT_MONTH_PANEL_V1_ID;
  readonly schemaVersion: 1;
  readonly spec: SegmentMonthPanelSpec;
  readonly panelSpec: PanelSpec;
  readonly manifest: PanelManifest;
  readonly summary: {
    readonly sourceRowCount: number;
    readonly supportedRowCount: number;
    readonly panelRowCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly monthCount: number;
  };
  readonly rows: readonly SegmentMonthPanelRow[];
};

export type SegmentSpeedResidualRow = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly stableSegmentKey: string;
  readonly directionId: string;
  readonly stopOrder: number;
  readonly directionMaxStopOrder: number;
  readonly isTerminalSegment: boolean;
  readonly averageSpeedMph: number;
  readonly expectedSpeedMph: number;
  readonly speedResidualMph: number;
  readonly residualPercentileWithinMonth: number;
  readonly residualRankWithinMonth: number;
  readonly residualMonthCount: number;
  readonly segmentHistoryMeanSpeedMph: number;
  readonly segmentHistoryMedianSpeedMph: number;
  readonly segmentHistoryMonthCount: number;
  readonly routeMonthMeanSpeedMph: number;
  readonly routeHistoryMeanSpeedMph: number;
  readonly observationCount: number;
  readonly busTripCount: number;
};

export type SegmentSpeedResidualArtifactV1 = {
  readonly artifactKind: typeof SEGMENT_SPEED_RESIDUALS_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly panelSpec: SegmentMonthPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly panelRowCount: number;
    readonly modeledReleaseRowCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly releaseMonthResidualMedianMph: number | null;
  };
  readonly rows: readonly SegmentSpeedResidualRow[];
};

type SupportedPanelInputRow = {
  routeId: string;
  month: string;
  segmentId: string;
  stableSegmentKey: string;
  directionId: string;
  stopOrder: number;
  averageSpeedMph: number;
  segmentLengthFeet: number | null;
  observationCount: number;
  busTripCount: number;
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

function stableSegmentKeyFromRow(row: {
  readonly routeId: string;
  readonly segmentId: string;
  readonly directionId: string;
  readonly stopOrder: number;
}): string {
  const parts = row.segmentId.split(":");
  if (parts.length >= 6) return [parts[0], ...parts.slice(2)].join(":");
  return [row.routeId, row.directionId, row.stopOrder, row.segmentId].join(":");
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

function buildSegmentMonthPanelManifest(input: {
  readonly spec: SegmentMonthPanelSpec;
  readonly generatedAt?: string | null;
  readonly summary: SegmentMonthPanelV1["summary"];
}): PanelManifest {
  const panelSpec = segmentMonthPanelSpecV1(input.spec);
  return {
    panelId: SEGMENT_MONTH_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? null,
    spec: panelSpec,
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_segment_speed",
        role: "primary_speed_panel_source",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.summary.sourceRowCount,
      supportedRowCount: input.summary.supportedRowCount,
      panelRowCount: input.summary.panelRowCount,
      routeCount: input.summary.routeCount,
      entityCount: input.summary.segmentCount,
      monthCount: input.summary.monthCount,
    },
    limitations: [
      "Segment identity is based on route, direction, stop order, and timepoint pair; it is not yet a route-shape-version-proof linear reference.",
      "Expected speed adjusts same-segment history by route-month mean speed movement; it is not a full fixed-effects or causal model.",
      "Terminal and layover behavior is labeled on rows but not removed by the panel builder.",
    ],
  };
}

function supportedRows(input: {
  readonly rows: readonly SegmentMonthPanelSourceRow[];
  readonly spec: SegmentMonthPanelSpec;
}): SupportedPanelInputRow[] {
  const output: SupportedPanelInputRow[] = [];
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const segmentId = text(row.segment_id);
    const directionId = text(row.direction);
    const stopOrder = numberValue(row.stop_order);
    const averageSpeedMph = numberValue(row.average_speed_mph);
    const observationCount = numberValue(row.observation_count);
    const busTripCount = numberValue(row.bus_trip_count);
    if (
      routeId === null ||
      month === null ||
      segmentId === null ||
      directionId === null ||
      stopOrder === null ||
      averageSpeedMph === null ||
      observationCount === null ||
      busTripCount === null
    ) {
      continue;
    }
    if (month < input.spec.startMonth || month > input.spec.endMonth) continue;
    if (input.spec.routeId !== undefined && routeId !== input.spec.routeId) continue;
    if (observationCount < input.spec.minObservationCount || busTripCount <= 0) continue;

    const stableSegmentKey =
      text(row.stable_segment_key) ??
      stableSegmentKeyFromRow({ routeId, segmentId, directionId, stopOrder });
    output.push({
      routeId,
      month,
      segmentId,
      stableSegmentKey,
      directionId,
      stopOrder,
      averageSpeedMph,
      segmentLengthFeet: numberValue(row.segment_length_feet),
      observationCount,
      busTripCount,
    });
  }
  return output;
}

function key(parts: readonly string[]): string {
  return parts.join("\0");
}

export function buildSegmentMonthPanelV1(input: {
  readonly rows: readonly SegmentMonthPanelSourceRow[];
  readonly spec: SegmentMonthPanelSpec;
  readonly generatedAt?: string | null;
}): SegmentMonthPanelV1 {
  const rows = supportedRows(input);
  if (rows.length === 0) {
    const summary = {
      sourceRowCount: input.rows.length,
      supportedRowCount: 0,
      panelRowCount: 0,
      routeCount: 0,
      segmentCount: 0,
      monthCount: 0,
    };
    const panelSpec = segmentMonthPanelSpecV1(input.spec);
    return {
      artifactKind: SEGMENT_MONTH_PANEL_V1_ID,
      schemaVersion: 1,
      spec: input.spec,
      panelSpec,
      manifest: buildSegmentMonthPanelManifest(
        input.generatedAt === undefined
          ? { spec: input.spec, summary }
          : { spec: input.spec, generatedAt: input.generatedAt, summary },
      ),
      summary,
      rows: [],
    };
  }

  const df = createDataFrame(rows);
  const routeMonthMeans = new Map(
    df
      .groupBy("routeId", "month")
      .summarize({ routeMonthMeanSpeedMph: (group) => s.mean(group.averageSpeedMph) })
      .toArray()
      .map((row) => [key([row.routeId, row.month]), row.routeMonthMeanSpeedMph] as const),
  );
  const routeHistoryMeans = new Map(
    df
      .groupBy("routeId")
      .summarize({ routeHistoryMeanSpeedMph: (group) => s.mean(group.averageSpeedMph) })
      .toArray()
      .map((row) => [row.routeId, row.routeHistoryMeanSpeedMph] as const),
  );
  const segmentHistoryRows = df
    .groupBy("stableSegmentKey")
    .summarize({
      segmentHistoryMeanSpeedMph: (group) => s.mean(group.averageSpeedMph),
      segmentHistoryMedianSpeedMph: (group) => s.median(group.averageSpeedMph),
      segmentHistoryMonthCount: (group) => group.nrows(),
    })
    .toArray();
  const segmentHistory = new Map(
    segmentHistoryRows.map((row) => [
      row.stableSegmentKey,
      {
        mean: row.segmentHistoryMeanSpeedMph,
        median: row.segmentHistoryMedianSpeedMph,
        monthCount: row.segmentHistoryMonthCount,
      },
    ] as const),
  );

  const directionMaxStopOrder = new Map<string, number>();
  for (const row of rows) {
    const directionMapKey = key([row.routeId, row.month, row.directionId]);
    directionMaxStopOrder.set(
      directionMapKey,
      Math.max(directionMaxStopOrder.get(directionMapKey) ?? 0, row.stopOrder),
    );
  }

  const initialRows = rows.map((row) => {
    const routeMonthMeanSpeedMph =
      routeMonthMeans.get(key([row.routeId, row.month])) ?? row.averageSpeedMph;
    const routeHistoryMeanSpeedMph =
      routeHistoryMeans.get(row.routeId) ?? routeMonthMeanSpeedMph;
    const history = segmentHistory.get(row.stableSegmentKey);
    const segmentHistoryMeanSpeedMph = history?.mean ?? row.averageSpeedMph;
    const expectedSpeedMph =
      segmentHistoryMeanSpeedMph + (routeMonthMeanSpeedMph - routeHistoryMeanSpeedMph);
    const directionMax =
      directionMaxStopOrder.get(key([row.routeId, row.month, row.directionId])) ?? row.stopOrder;
    const speedResidualMph = row.averageSpeedMph - expectedSpeedMph;
    return {
      ...row,
      directionMaxStopOrder: directionMax,
      isTerminalSegment: row.stopOrder === 1 || row.stopOrder >= directionMax,
      routeMonthMeanSpeedMph,
      routeHistoryMeanSpeedMph,
      segmentHistoryMeanSpeedMph,
      segmentHistoryMedianSpeedMph: history?.median ?? row.averageSpeedMph,
      segmentHistoryMonthCount: history?.monthCount ?? 1,
      expectedSpeedMph,
      speedResidualMph,
    };
  });

  const residualsByMonth = new Map<string, number[]>();
  for (const row of initialRows) {
    const residuals = residualsByMonth.get(row.month) ?? [];
    residuals.push(row.speedResidualMph);
    residualsByMonth.set(row.month, residuals);
  }
  const rankByMonthAndSegment = new Map<string, number>();
  for (const month of residualsByMonth.keys()) {
    const sorted = [...initialRows]
      .filter((row) => row.month === month)
      .sort(
        (left, right) =>
          left.speedResidualMph - right.speedResidualMph ||
          left.segmentId.localeCompare(right.segmentId),
      );
    sorted.forEach((row, index) => {
      rankByMonthAndSegment.set(key([month, row.segmentId]), index + 1);
    });
  }

  const panelRows = initialRows
    .map((row) => {
      const residuals = residualsByMonth.get(row.month) ?? [];
      return {
        routeId: row.routeId,
        month: row.month,
        segmentId: row.segmentId,
        stableSegmentKey: row.stableSegmentKey,
        directionId: row.directionId,
        stopOrder: row.stopOrder,
        directionMaxStopOrder: row.directionMaxStopOrder,
        isTerminalSegment: row.isTerminalSegment,
        averageSpeedMph: round(row.averageSpeedMph),
        segmentLengthFeet: row.segmentLengthFeet === null ? null : round(row.segmentLengthFeet, 2),
        observationCount: row.observationCount,
        busTripCount: row.busTripCount,
        routeMonthMeanSpeedMph: round(row.routeMonthMeanSpeedMph),
        routeHistoryMeanSpeedMph: round(row.routeHistoryMeanSpeedMph),
        segmentHistoryMeanSpeedMph: round(row.segmentHistoryMeanSpeedMph),
        segmentHistoryMedianSpeedMph: round(row.segmentHistoryMedianSpeedMph),
        segmentHistoryMonthCount: row.segmentHistoryMonthCount,
        expectedSpeedMph: round(row.expectedSpeedMph),
        speedResidualMph: round(row.speedResidualMph),
        residualPercentileWithinMonth: round(percentileRank(row.speedResidualMph, residuals)),
        residualRankWithinMonth: rankByMonthAndSegment.get(key([row.month, row.segmentId])) ?? 0,
        residualMonthCount: residuals.length,
      };
    })
    .sort(
      (left, right) =>
        left.month.localeCompare(right.month) ||
        left.routeId.localeCompare(right.routeId) ||
        left.directionId.localeCompare(right.directionId) ||
        left.stopOrder - right.stopOrder ||
        left.segmentId.localeCompare(right.segmentId),
    );

  const summary = {
    sourceRowCount: input.rows.length,
    supportedRowCount: rows.length,
    panelRowCount: panelRows.length,
    routeCount: new Set(panelRows.map((row) => row.routeId)).size,
    segmentCount: new Set(panelRows.map((row) => row.stableSegmentKey)).size,
    monthCount: new Set(panelRows.map((row) => row.month)).size,
  };
  const panelSpec = segmentMonthPanelSpecV1(input.spec);
  return {
    artifactKind: SEGMENT_MONTH_PANEL_V1_ID,
    schemaVersion: 1,
    spec: input.spec,
    panelSpec,
    manifest: buildSegmentMonthPanelManifest(
      input.generatedAt === undefined
        ? { spec: input.spec, summary }
        : { spec: input.spec, generatedAt: input.generatedAt, summary },
    ),
    summary,
    rows: panelRows,
  };
}

export function buildSegmentSpeedResidualArtifactV1(input: {
  readonly panel: SegmentMonthPanelV1;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): SegmentSpeedResidualArtifactV1 {
  const rows = input.panel.rows
    .filter((row) => row.month === input.releaseMonth)
    .map((row) => ({
      routeId: row.routeId,
      month: row.month,
      segmentId: row.segmentId,
      stableSegmentKey: row.stableSegmentKey,
      directionId: row.directionId,
      stopOrder: row.stopOrder,
      directionMaxStopOrder: row.directionMaxStopOrder,
      isTerminalSegment: row.isTerminalSegment,
      averageSpeedMph: row.averageSpeedMph,
      expectedSpeedMph: row.expectedSpeedMph,
      speedResidualMph: row.speedResidualMph,
      residualPercentileWithinMonth: row.residualPercentileWithinMonth,
      residualRankWithinMonth: row.residualRankWithinMonth,
      residualMonthCount: row.residualMonthCount,
      segmentHistoryMeanSpeedMph: row.segmentHistoryMeanSpeedMph,
      segmentHistoryMedianSpeedMph: row.segmentHistoryMedianSpeedMph,
      segmentHistoryMonthCount: row.segmentHistoryMonthCount,
      routeMonthMeanSpeedMph: row.routeMonthMeanSpeedMph,
      routeHistoryMeanSpeedMph: row.routeHistoryMeanSpeedMph,
      observationCount: row.observationCount,
      busTripCount: row.busTripCount,
    }));
  return {
    artifactKind: SEGMENT_SPEED_RESIDUALS_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.releaseMonth,
    panelSpec: input.panel.spec,
    panelManifest: input.panel.manifest,
    summary: {
      panelRowCount: input.panel.rows.length,
      modeledReleaseRowCount: rows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      segmentCount: new Set(rows.map((row) => row.stableSegmentKey)).size,
      releaseMonthResidualMedianMph: median(rows.map((row) => row.speedResidualMph)),
    },
    rows,
  };
}
