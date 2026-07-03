import { routeSpeedSpineRouteSlug } from "./route-speed-spine.js";
import type {
  RouteHourlyProfileHourRow,
  RouteHourlyProfileReliabilitySampleRow,
  RouteHourlyProfileSlowestWindowRow,
  RouteMonthHourlyProfileRow,
} from "./rows.js";

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

export type StudioRouteHourlyProfileHour = {
  readonly hourOfDay: number;
  readonly speedObservationCount: number;
  readonly speedBusTripCount: number;
  readonly averageSpeedMph: number | null;
  readonly ridership: number | null;
  readonly transfers: number | null;
};

export type StudioRouteHourlyProfilePeakWindow = {
  readonly month: string;
  readonly dayOfWeek: string;
  readonly hourOfDay: number;
  readonly ridership: number | null;
};

export type StudioRouteHourlyProfileSlowestWindow = {
  readonly month: string;
  readonly dayOfWeek: string;
  readonly hourOfDay: number;
  readonly observationCount: number;
  readonly busTripCount: number;
  readonly weightedAverageSpeedMph: number | null;
};

export type StudioRouteReliabilitySample = {
  readonly month: string;
  readonly hourOfDay: number;
  readonly sampleCount: number;
  readonly averageObservedHeadwayMinutes: number;
};

export type StudioRouteHourlyProfileArtifact = {
  readonly artifactKind: "studio_route_hourly_profile";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly routeId: string;
  readonly routeSlug: string;
  readonly source: {
    readonly tables: readonly [
      "local_route_hourly_ridership",
      "local_route_segment_speed",
      "local_route_observed_reliability_summary",
      "local_observed_headway_sample",
    ];
    readonly dbPath: string;
    readonly startMonth: string;
    readonly endMonth: string;
    readonly artifactPath: string;
  };
  readonly dimensions: {
    readonly months: readonly string[];
    readonly hours: readonly number[];
  };
  readonly summary: {
    readonly monthCount: number;
    readonly latestMonth: string | null;
    readonly hourCount: number;
    readonly populatedHourCount: number;
    readonly speedObservationCount: number;
    readonly speedBusTripCount: number;
    readonly totalRidership: number;
    readonly totalTransfers: number;
    readonly reliabilitySampleCount: number;
  };
  /** Latest month, exactly 24 rows. */
  readonly hours: readonly StudioRouteHourlyProfileHour[];
  readonly peakWindows: readonly StudioRouteHourlyProfilePeakWindow[];
  readonly slowestWindows: readonly StudioRouteHourlyProfileSlowestWindow[];
  readonly reliabilitySamples: readonly StudioRouteReliabilitySample[];
  readonly monthlyProfiles: readonly RouteHourlyProfile[];
};

function monthSort(left: string, right: string): number {
  return left.localeCompare(right);
}

function latestMonth(months: Iterable<string>): string | null {
  return [...new Set(months)].sort(monthSort).at(-1) ?? null;
}

function toProfile(row: RouteMonthHourlyProfileRow): RouteHourlyProfile {
  return {
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
  };
}

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
    profiles: input.rows.map(toProfile),
  };
}

function routeRows<T extends { route_id: string }>(
  rows: readonly T[],
  routeId: string,
): readonly T[] {
  return rows.filter((row) => row.route_id === routeId);
}

function latestHours(
  rows: readonly RouteHourlyProfileHourRow[],
  month: string | null,
): readonly StudioRouteHourlyProfileHour[] {
  const byHour = new Map(
    rows.filter((row) => row.month === month).map((row) => [row.hour_of_day, row] as const),
  );
  return Array.from({ length: 24 }, (_, hour): StudioRouteHourlyProfileHour => {
    const row = byHour.get(hour);
    return {
      hourOfDay: hour,
      speedObservationCount: row?.speed_observation_count ?? 0,
      speedBusTripCount: row?.speed_bus_trip_count ?? 0,
      averageSpeedMph: row?.average_speed_mph ?? null,
      ridership: row?.ridership ?? null,
      transfers: row?.transfers ?? null,
    };
  });
}

function routePeakWindows(
  profiles: readonly RouteHourlyProfile[],
): readonly StudioRouteHourlyProfilePeakWindow[] {
  return profiles.flatMap((profile) =>
    profile.peakWindow === null
      ? []
      : [
          {
            month: profile.month,
            dayOfWeek: profile.peakWindow.dayOfWeek,
            hourOfDay: profile.peakWindow.hourOfDay,
            ridership: profile.peakWindow.ridership,
          },
        ],
  );
}

function routeSlowestWindows(
  rows: readonly RouteHourlyProfileSlowestWindowRow[],
): readonly StudioRouteHourlyProfileSlowestWindow[] {
  return rows.map((row) => ({
    month: row.month,
    dayOfWeek: row.day_of_week,
    hourOfDay: row.hour_of_day,
    observationCount: row.observation_count,
    busTripCount: row.bus_trip_count,
    weightedAverageSpeedMph: row.weighted_average_speed_mph,
  }));
}

function routeReliabilitySamples(
  rows: readonly RouteHourlyProfileReliabilitySampleRow[],
  month: string | null,
): readonly StudioRouteReliabilitySample[] {
  return rows
    .filter((row) => row.month === month)
    .map((row) => ({
      month: row.month,
      hourOfDay: row.hour_of_day,
      sampleCount: row.sample_count,
      averageObservedHeadwayMinutes: row.average_observed_headway_minutes,
    }));
}

export function buildStudioRouteHourlyProfileArtifact(input: {
  readonly routeId: string;
  readonly routeSlug?: string;
  readonly profiles: readonly RouteMonthHourlyProfileRow[];
  readonly hours: readonly RouteHourlyProfileHourRow[];
  readonly slowestWindows: readonly RouteHourlyProfileSlowestWindowRow[];
  readonly reliabilitySamples: readonly RouteHourlyProfileReliabilitySampleRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
}): StudioRouteHourlyProfileArtifact {
  const monthlyProfiles = input.profiles
    .map(toProfile)
    .sort((left, right) => monthSort(left.month, right.month));
  const months = [...new Set(monthlyProfiles.map((profile) => profile.month))].sort(monthSort);
  const chartMonth = latestMonth([
    ...monthlyProfiles.map((profile) => profile.month),
    ...input.hours.map((row) => row.month),
  ]);
  const hours = latestHours(input.hours, chartMonth);
  const peakWindows = routePeakWindows(monthlyProfiles);
  const slowestWindows = routeSlowestWindows(input.slowestWindows);
  const reliabilitySamples = routeReliabilitySamples(input.reliabilitySamples, chartMonth);

  return {
    artifactKind: "studio_route_hourly_profile",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeId: input.routeId,
    routeSlug: input.routeSlug ?? routeSpeedSpineRouteSlug(input.routeId),
    source: {
      tables: [
        "local_route_hourly_ridership",
        "local_route_segment_speed",
        "local_route_observed_reliability_summary",
        "local_observed_headway_sample",
      ],
      dbPath: input.dbPath,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      artifactPath: input.artifactPath,
    },
    dimensions: {
      months,
      hours: Array.from({ length: 24 }, (_, hour) => hour),
    },
    summary: {
      monthCount: months.length,
      latestMonth: chartMonth,
      hourCount: 24,
      populatedHourCount: hours.filter(
        (hour) =>
          hour.averageSpeedMph !== null ||
          hour.ridership !== null ||
          hour.transfers !== null ||
          hour.speedObservationCount > 0,
      ).length,
      speedObservationCount: hours.reduce((sum, hour) => sum + hour.speedObservationCount, 0),
      speedBusTripCount: hours.reduce((sum, hour) => sum + hour.speedBusTripCount, 0),
      totalRidership: hours.reduce((sum, hour) => sum + (hour.ridership ?? 0), 0),
      totalTransfers: hours.reduce((sum, hour) => sum + (hour.transfers ?? 0), 0),
      reliabilitySampleCount: reliabilitySamples.reduce((sum, row) => sum + row.sampleCount, 0),
    },
    hours,
    peakWindows,
    slowestWindows,
    reliabilitySamples,
    monthlyProfiles,
  };
}

export function buildStudioRouteHourlyProfileArtifacts(input: {
  readonly profiles: readonly RouteMonthHourlyProfileRow[];
  readonly hours: readonly RouteHourlyProfileHourRow[];
  readonly slowestWindows: readonly RouteHourlyProfileSlowestWindowRow[];
  readonly reliabilitySamples: readonly RouteHourlyProfileReliabilitySampleRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPathForRoute: (routeSlug: string) => string;
}): readonly StudioRouteHourlyProfileArtifact[] {
  const routeIds = [...new Set(input.profiles.map((row) => row.route_id))].sort();
  return routeIds.map((routeId) => {
    const routeSlug = routeSpeedSpineRouteSlug(routeId);
    return buildStudioRouteHourlyProfileArtifact({
      routeId,
      routeSlug,
      profiles: routeRows(input.profiles, routeId),
      hours: routeRows(input.hours, routeId),
      slowestWindows: routeRows(input.slowestWindows, routeId),
      reliabilitySamples: routeRows(input.reliabilitySamples, routeId),
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      generatedAt: input.generatedAt,
      dbPath: input.dbPath,
      artifactPath: input.artifactPathForRoute(routeSlug),
    });
  });
}
