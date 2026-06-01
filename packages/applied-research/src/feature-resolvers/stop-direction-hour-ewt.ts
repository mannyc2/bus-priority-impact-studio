import {
  buildStopDirectionHourEwtFeatures,
  type ObservedHeadwayForStopDirectionHourEwt,
  type ScheduleStopArrivalForStopDirectionHourEwt,
  type StopDirectionHourEwtAuditRow,
  type StopDirectionHourEwtFeatureBuildSummary,
  type StopDirectionHourFeature,
  type StopDirectionHourScheduleBaseline,
} from "@bp/analytics/features";

export type RawScheduleStopArrivalRow = {
  route_id: unknown;
  day_type: unknown;
  direction: unknown;
  stop_id: unknown;
  stop_name: unknown;
  schedule_date: unknown;
  schedule_time: unknown;
};

export type RawObservedHeadwayForEwtRow = {
  route_id: unknown;
  direction: unknown;
  stop_id: unknown;
  stop_name: unknown;
  observed_timestamp: unknown;
  headway_minutes: unknown;
};

export type StopDirectionHourEwtScheduleSourceKind =
  | "gtfs_static"
  | "socrata_route_schedule"
  | "route_schedule_timepoint";

export type StopDirectionHourEwtScheduleSelection = {
  kind: StopDirectionHourEwtScheduleSourceKind;
  table:
    | "local_gtfs_static_stop_time"
    | "local_route_schedule_stop"
    | "local_route_schedule_timepoint";
  gtfsRunId: string | null;
  caveat: string;
};

export type StopDirectionHourEwtFeatureArtifact = {
  artifactKind: "stop_direction_hour_ewt_features";
  generatedAt: string;
  month: string;
  routeId: string;
  runId: string;
  timezone: string;
  observedAggregation: "service_date_hour" | "month_day_type_hour";
  dbPath: string | null;
  artifactPath: string;
  source: {
    scheduleSource: StopDirectionHourEwtScheduleSourceKind;
    scheduleTable:
      | "local_gtfs_static_stop_time"
      | "local_route_schedule_stop"
      | "local_route_schedule_timepoint";
    gtfsRunId: string | null;
    observedHeadwayTable: "local_observed_headway_sample";
    stopDirectionTable: "local_route_stop";
    grain: "stop_direction_hour";
    caveat: string;
  };
  summary: StopDirectionHourEwtFeatureBuildSummary;
  scheduleBaselines: StopDirectionHourScheduleBaseline[];
  features: StopDirectionHourFeature[];
  auditRows: StopDirectionHourEwtAuditRow[];
};

function textValue(value: unknown): string | null {
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

export function parseScheduleRowsForStopDirectionHourEwt(
  rows: readonly RawScheduleStopArrivalRow[],
): ScheduleStopArrivalForStopDirectionHourEwt[] {
  return rows.flatMap((row) => {
    const routeId = textValue(row.route_id);
    const dayType = textValue(row.day_type);
    const direction = textValue(row.direction);
    const stopId = textValue(row.stop_id);
    const scheduleDate = textValue(row.schedule_date);
    const scheduleTime = textValue(row.schedule_time);
    if (
      routeId === null ||
      dayType === null ||
      direction === null ||
      stopId === null ||
      scheduleDate === null ||
      scheduleTime === null
    ) {
      return [];
    }
    return [
      {
        routeId,
        dayType,
        direction,
        stopId,
        stopName: textValue(row.stop_name),
        scheduleDate,
        scheduleTime,
      },
    ];
  });
}

export function parseObservedRowsForStopDirectionHourEwt(
  rows: readonly RawObservedHeadwayForEwtRow[],
): ObservedHeadwayForStopDirectionHourEwt[] {
  return rows.flatMap((row) => {
    const routeId = textValue(row.route_id);
    const stopId = textValue(row.stop_id);
    const observedTimestamp = numberValue(row.observed_timestamp);
    const headwayMinutes = numberValue(row.headway_minutes);
    if (
      routeId === null ||
      stopId === null ||
      observedTimestamp === null ||
      headwayMinutes === null
    ) {
      return [];
    }
    return [
      {
        routeId,
        direction: textValue(row.direction),
        stopId,
        stopName: textValue(row.stop_name),
        observedTimestamp,
        headwayMinutes,
      },
    ];
  });
}

export function buildStopDirectionHourEwtFeatureArtifact(input: {
  month: string;
  routeId: string;
  runId: string;
  selection: StopDirectionHourEwtScheduleSelection;
  scheduleArrivals: readonly ScheduleStopArrivalForStopDirectionHourEwt[];
  observedHeadways: readonly ObservedHeadwayForStopDirectionHourEwt[];
  timezone: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  minHeadways: number;
  minCoverageShare: number;
  observedAggregation: "service_date_hour" | "month_day_type_hour";
}): StopDirectionHourEwtFeatureArtifact {
  const built = buildStopDirectionHourEwtFeatures({
    scheduleArrivals: input.scheduleArrivals,
    observedHeadways: input.observedHeadways,
    options: {
      timezone: input.timezone,
      analysisMonth: input.month,
      observedAggregation: input.observedAggregation,
      minHeadways: input.minHeadways,
      minCoverageShare: input.minCoverageShare,
    },
  });

  return {
    artifactKind: "stop_direction_hour_ewt_features",
    generatedAt: input.generatedAt,
    month: input.month,
    routeId: input.routeId,
    runId: input.runId,
    timezone: built.timezone,
    observedAggregation: input.observedAggregation,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    source: {
      scheduleSource: input.selection.kind,
      scheduleTable: input.selection.table,
      gtfsRunId: input.selection.gtfsRunId,
      observedHeadwayTable: "local_observed_headway_sample",
      stopDirectionTable: "local_route_stop",
      grain: "stop_direction_hour",
      caveat: input.selection.caveat,
    },
    summary: built.summary,
    scheduleBaselines: built.scheduleBaselines,
    features: built.features,
    auditRows: built.auditRows,
  };
}

export type {
  ObservedHeadwayForStopDirectionHourEwt,
  ScheduleStopArrivalForStopDirectionHourEwt,
  StopDirectionHourEwtAuditRow,
  StopDirectionHourEwtFeatureBuildSummary,
  StopDirectionHourFeature,
  StopDirectionHourScheduleBaseline,
};
