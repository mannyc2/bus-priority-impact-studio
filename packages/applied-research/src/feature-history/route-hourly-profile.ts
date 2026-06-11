import type { RouteMonthHourlyProfileRow } from "../local-db/route-hourly-profile-rows";

export type RouteHourlyProfileArtifact = {
  readonly artifactKind: "route_hourly_profile";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
    readonly monthCount: number;
  };
  readonly summary: {
    readonly profileCount: number;
    readonly routeCount: number;
    readonly grain: "route_month_compact_hourly_profile";
    readonly sourceGrain: "route_month_day_of_week_hour";
  };
  readonly profiles: readonly RouteHourlyProfile[];
};

export type RouteHourlyProfile = {
  readonly routeId: string;
  readonly month: string;
  readonly hourlyRowCount: number;
  readonly totalRidership: number;
  readonly totalTransfers: number;
  readonly peakWindow: {
    readonly dayOfWeek: string;
    readonly hourOfDay: number;
    readonly ridership: number | null;
  } | null;
};

export function buildRouteHourlyProfileArtifact(input: {
  readonly rows: readonly RouteMonthHourlyProfileRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
}): RouteHourlyProfileArtifact {
  const routeIds = new Set(input.rows.map((row) => row.route_id));
  const months = new Set(input.rows.map((row) => row.month));

  return {
    artifactKind: "route_hourly_profile",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: { startMonth: input.startMonth, endMonth: input.endMonth, monthCount: months.size },
    summary: {
      profileCount: input.rows.length,
      routeCount: routeIds.size,
      grain: "route_month_compact_hourly_profile",
      sourceGrain: "route_month_day_of_week_hour",
    },
    profiles: input.rows.map((row) => ({
      routeId: row.route_id,
      month: row.month,
      hourlyRowCount: row.hourly_row_count,
      totalRidership: row.total_ridership,
      totalTransfers: row.total_transfers,
      peakWindow:
        row.peak_day_of_week === null || row.peak_hour_of_day === null
          ? null
          : {
              dayOfWeek: row.peak_day_of_week,
              hourOfDay: row.peak_hour_of_day,
              ridership: row.peak_ridership,
            },
    })),
  };
}
