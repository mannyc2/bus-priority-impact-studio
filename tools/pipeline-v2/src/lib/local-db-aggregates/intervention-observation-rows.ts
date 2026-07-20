import type { Database, SQLQueryBindings } from "bun:sqlite";

const INTERVENTION_OBSERVATION_TREND_TABLE = "local_route_month_trend";

export type InterventionObservationTrendRow = {
  readonly route_id: string;
  readonly month: string;
  readonly speed_observation_count: number;
  readonly speed_bus_trip_count: number;
  readonly average_speed_mph: number | null;
  readonly ridership: number | null;
  readonly transfers: number | null;
  readonly has_speed_trend: boolean;
  readonly has_ridership_trend: boolean;
};

type RawInterventionObservationTrendRow = Omit<
  InterventionObservationTrendRow,
  "has_speed_trend" | "has_ridership_trend"
> & {
  readonly has_speed_trend: number;
  readonly has_ridership_trend: number;
};

function tableExists(sqlite: Database, tableName: string): boolean {
  return (
    sqlite
      .query<{ present: number }, SQLQueryBindings[]>(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName) !== null
  );
}

export function loadInterventionObservationTrendRows(input: {
  readonly sqlite: Database;
}): InterventionObservationTrendRow[] {
  if (!tableExists(input.sqlite, INTERVENTION_OBSERVATION_TREND_TABLE)) {
    throw new Error(
      `Required intervention-observation trend table is missing: ${INTERVENTION_OBSERVATION_TREND_TABLE}`,
    );
  }

  return input.sqlite
    .query<RawInterventionObservationTrendRow, []>(`
      SELECT
        route_id,
        month,
        speed_observation_count,
        speed_bus_trip_count,
        average_speed_mph,
        ridership,
        transfers,
        has_speed_trend,
        has_ridership_trend
      FROM local_route_month_trend
      ORDER BY route_id, month
    `)
    .all()
    .map((row) => ({
      ...row,
      has_speed_trend: row.has_speed_trend === 1,
      has_ridership_trend: row.has_ridership_trend === 1,
    }));
}
