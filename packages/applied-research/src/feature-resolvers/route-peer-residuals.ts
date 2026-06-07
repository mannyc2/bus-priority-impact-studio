import { createDataFrame, stats as s } from "@tidy-ts/dataframe";
import type { RouteMetricHistorySourceRow } from "./runtime-history";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const ROUTE_MONTH_PEER_PANEL_V1_ID = "route_month_peer_panel_v1" as const;
export const ROUTE_PEER_RESIDUALS_V1_ID = "route_peer_residuals_v1" as const;

export type RoutePeerResidualPanelSpec = {
  readonly panelId: typeof ROUTE_MONTH_PEER_PANEL_V1_ID;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
  readonly minHistoryMonths: number;
  readonly routeId?: string;
};

export type RoutePeerResidualRow = {
  readonly routeId: string;
  readonly month: string;
  readonly averageSpeedMph: number;
  readonly expectedSpeedMph: number;
  readonly speedResidualMph: number;
  readonly residualPercentileWithinMonth: number;
  readonly residualRankWithinMonth: number;
  readonly residualRouteCount: number;
  readonly routeHistoryMeanSpeedMph: number;
  readonly routeHistoryMedianSpeedMph: number;
  readonly routeHistoryMonthCount: number;
  readonly networkMonthMeanSpeedMph: number;
  readonly networkHistoryMeanSpeedMph: number;
  readonly speedObservationCount: number;
};

export type RoutePeerResidualArtifactV1 = {
  readonly artifactKind: typeof ROUTE_PEER_RESIDUALS_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly panelSpec: RoutePeerResidualPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly panelRowCount: number;
    readonly modeledReleaseRowCount: number;
    readonly routeCount: number;
    readonly releaseMonthResidualMedianMph: number | null;
  };
  readonly rows: readonly RoutePeerResidualRow[];
};

type SupportedRow = {
  routeId: string;
  month: string;
  averageSpeedMph: number;
  speedObservationCount: number;
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

export function routePeerResidualPanelSpecV1(input: RoutePeerResidualPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month",
    timeKey: "month",
    entityKeys: ["route_id"],
    measures: ["average_speed_mph", "speed_observation_count"],
    joins: [],
    coverage: [
      "source_row_count",
      "supported_row_count",
      "route_history_month_count",
      "residual_route_count",
    ],
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    releaseFilter: { month: input.endMonth },
    requiredProducts: [
      {
        productId: "local_route_month_trends_history",
        state: "available",
        role: "derived",
        reason:
          "Monthly route speed trends derived from the local segment speed corpus and used for route-history detectors.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_observation_count",
        description: "Route-month rows with too few speed observations are excluded.",
        threshold: input.minObservationCount,
      },
      {
        ruleId: "minimum_route_history_months",
        description: "Release rows remain model rows but carry history support for detector gates.",
        threshold: input.minHistoryMonths,
      },
    ],
    negativeMeaning:
      "A clean no-hit means the route-month was eligible for the route peer residual model and was not abnormal versus own history plus network-month movement.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function supportedRows(input: {
  readonly rows: readonly RouteMetricHistorySourceRow[];
  readonly spec: RoutePeerResidualPanelSpec;
}): SupportedRow[] {
  const output: SupportedRow[] = [];
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const averageSpeedMph = numberValue(row.average_speed_mph);
    const speedObservationCount = numberValue(row.speed_observation_count);
    if (
      routeId === null ||
      month === null ||
      averageSpeedMph === null ||
      speedObservationCount === null
    ) {
      continue;
    }
    if (month < input.spec.startMonth || month > input.spec.endMonth) continue;
    if (input.spec.routeId !== undefined && routeId !== input.spec.routeId) continue;
    if (speedObservationCount < input.spec.minObservationCount) continue;
    output.push({ routeId, month, averageSpeedMph, speedObservationCount });
  }
  return output;
}

function manifest(input: {
  readonly spec: RoutePeerResidualPanelSpec;
  readonly generatedAt: string;
  readonly sourceRowCount: number;
  readonly supportedRowCount: number;
  readonly panelRowCount: number;
  readonly routeCount: number;
  readonly monthCount: number;
}): PanelManifest {
  return {
    panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: routePeerResidualPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_month_trend",
        role: "primary_route_peer_residual_source",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.sourceRowCount,
      supportedRowCount: input.supportedRowCount,
      panelRowCount: input.panelRowCount,
      routeCount: input.routeCount,
      entityCount: input.routeCount,
      monthCount: input.monthCount,
    },
    limitations: [
      "The v1 peer universe is all supported bus routes, not a borough, route-type, or demand-matched peer set.",
      "Expected speed adjusts own route history by network-month movement; it is descriptive context, not causal evidence.",
      "Route restructures, branch changes, and schedule-version breaks are not explicitly modeled in this v1 artifact.",
    ],
  };
}

export function buildRoutePeerResidualArtifactV1(input: {
  readonly rows: readonly RouteMetricHistorySourceRow[];
  readonly spec: RoutePeerResidualPanelSpec;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): RoutePeerResidualArtifactV1 {
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
    monthCount: new Set(panelRows.map((row) => row.month)).size,
  });

  return {
    artifactKind: ROUTE_PEER_RESIDUALS_V1_ID,
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
      releaseMonthResidualMedianMph: median(releaseRows.map((row) => row.speedResidualMph)),
    },
    rows: releaseRows,
  };
}

function buildPanelRows(rows: readonly SupportedRow[]): RoutePeerResidualRow[] {
  const df = createDataFrame(rows);
  const networkMonthMeans = new Map(
    df
      .groupBy("month")
      .summarize({ mean: (group) => s.mean(group.averageSpeedMph) })
      .toArray()
      .map((row) => [row.month, row.mean] as const),
  );
  const networkHistoryMean = s.mean(rows.map((row) => row.averageSpeedMph));
  const routeHistory = new Map(
    df
      .groupBy("routeId")
      .summarize({
        mean: (group) => s.mean(group.averageSpeedMph),
        median: (group) => s.median(group.averageSpeedMph),
        monthCount: (group) => group.nrows(),
      })
      .toArray()
      .map((row) => [
        row.routeId,
        { mean: row.mean, median: row.median, monthCount: row.monthCount },
      ] as const),
  );

  const initialRows = rows.map((row) => {
    const history = routeHistory.get(row.routeId);
    const routeHistoryMeanSpeedMph = history?.mean ?? row.averageSpeedMph;
    const networkMonthMeanSpeedMph = networkMonthMeans.get(row.month) ?? row.averageSpeedMph;
    const expectedSpeedMph =
      routeHistoryMeanSpeedMph + (networkMonthMeanSpeedMph - networkHistoryMean);
    return {
      ...row,
      networkMonthMeanSpeedMph,
      networkHistoryMeanSpeedMph: networkHistoryMean,
      routeHistoryMeanSpeedMph,
      routeHistoryMedianSpeedMph: history?.median ?? row.averageSpeedMph,
      routeHistoryMonthCount: history?.monthCount ?? 1,
      expectedSpeedMph,
      speedResidualMph: row.averageSpeedMph - expectedSpeedMph,
    };
  });

  const residualsByMonth = new Map<string, number[]>();
  for (const row of initialRows) {
    const values = residualsByMonth.get(row.month) ?? [];
    values.push(row.speedResidualMph);
    residualsByMonth.set(row.month, values);
  }

  const rankByMonthRoute = new Map<string, number>();
  for (const month of residualsByMonth.keys()) {
    const sorted = initialRows
      .filter((row) => row.month === month)
      .sort(
        (left, right) =>
          left.speedResidualMph - right.speedResidualMph || left.routeId.localeCompare(right.routeId),
      );
    sorted.forEach((row, index) => {
      rankByMonthRoute.set(key([row.month, row.routeId]), index + 1);
    });
  }

  return initialRows
    .map((row) => {
      const residualBucket = residualsByMonth.get(row.month) ?? [];
      return {
        routeId: row.routeId,
        month: row.month,
        averageSpeedMph: round(row.averageSpeedMph),
        expectedSpeedMph: round(row.expectedSpeedMph),
        speedResidualMph: round(row.speedResidualMph),
        residualPercentileWithinMonth: round(percentileRank(row.speedResidualMph, residualBucket)),
        residualRankWithinMonth: rankByMonthRoute.get(key([row.month, row.routeId])) ?? 0,
        residualRouteCount: residualBucket.length,
        routeHistoryMeanSpeedMph: round(row.routeHistoryMeanSpeedMph),
        routeHistoryMedianSpeedMph: round(row.routeHistoryMedianSpeedMph),
        routeHistoryMonthCount: row.routeHistoryMonthCount,
        networkMonthMeanSpeedMph: round(row.networkMonthMeanSpeedMph),
        networkHistoryMeanSpeedMph: round(row.networkHistoryMeanSpeedMph),
        speedObservationCount: row.speedObservationCount,
      };
    })
    .sort(
      (left, right) => left.month.localeCompare(right.month) || left.routeId.localeCompare(right.routeId),
    );
}
