import type { Database } from "bun:sqlite";
import type { CorpusProfileObservation } from "@bp/analytics/corpus";

type QueryObservationConfig = {
  sourceId: string;
  family: string;
  sql: string;
};

type RawObservationRow = {
  month: unknown;
  route_id?: unknown;
  row_count: unknown;
  sample_count?: unknown;
};

export type AnalyticsCorpusProfileLocalDbQuery = {
  readonly sqlite: Database;
};

const OBSERVATION_QUERIES: readonly QueryObservationConfig[] = [
  {
    sourceId: "route_month_trends_speed",
    family: "speed",
    sql: `
      SELECT month, route_id, 1 AS row_count, speed_observation_count AS sample_count
      FROM local_route_month_trend
      WHERE has_speed_trend = 1
    `,
  },
  {
    sourceId: "route_month_trends_ridership",
    family: "ridership",
    sql: `
      SELECT month, route_id, 1 AS row_count, NULL AS sample_count
      FROM local_route_month_trend
      WHERE has_ridership_trend = 1
    `,
  },
  {
    sourceId: "route_hourly_ridership",
    family: "ridership",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, NULL AS sample_count
      FROM local_route_hourly_ridership
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "route_segment_speed",
    family: "speed",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, SUM(bus_trip_count) AS sample_count
      FROM local_route_segment_speed
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "observed_reliability_summary",
    family: "reliability",
    sql: `
      SELECT month, route_id, 1 AS row_count, sample_count
      FROM local_route_observed_reliability_summary
    `,
  },
  {
    sourceId: "observed_headway_samples",
    family: "reliability",
    sql: `
      SELECT
        strftime('%Y-%m', observed_timestamp, 'unixepoch') AS month,
        route_id,
        COUNT(*) AS row_count,
        COUNT(*) AS sample_count
      FROM local_observed_headway_sample
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "bus_wait_assessment",
    family: "reliability",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, SUM(scheduled_trips) AS sample_count
      FROM local_bus_wait_assessment
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "intervention_comparisons",
    family: "intervention",
    sql: `
      SELECT month, route_id, COUNT(*) AS row_count, NULL AS sample_count
      FROM local_route_intervention_comparison
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "context_events",
    family: "context",
    sql: `
      SELECT substr(occurred_at, 1, 7) AS month, route_id, COUNT(*) AS row_count, COUNT(*) AS sample_count
      FROM local_context_event
      WHERE route_id IS NOT NULL AND length(substr(occurred_at, 1, 7)) = 7
      GROUP BY month, route_id
    `,
  },
  {
    sourceId: "context_route_touches",
    family: "context",
    sql: `
      SELECT substr(occurred_at, 1, 7) AS month, route_id, COUNT(*) AS row_count, COUNT(*) AS sample_count
      FROM local_context_event_route_touch
      WHERE length(substr(occurred_at, 1, 7)) = 7
      GROUP BY month, route_id
    `,
  },
];

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function loadAnalyticsCorpusProfileLocalDbRows(
  input: AnalyticsCorpusProfileLocalDbQuery,
): CorpusProfileObservation[] {
  const observations: CorpusProfileObservation[] = [];

  for (const config of OBSERVATION_QUERIES) {
    const rows = input.sqlite.query(config.sql).all() as RawObservationRow[];
    for (const row of rows) {
      const month = textValue(row.month);
      if (month === null) continue;
      observations.push({
        sourceId: config.sourceId,
        family: config.family,
        month,
        routeId: textValue(row.route_id ?? null),
        rowCount: numberValue(row.row_count),
        sampleCount:
          row.sample_count === undefined || row.sample_count === null
            ? null
            : numberValue(row.sample_count),
      });
    }
  }

  return observations;
}
