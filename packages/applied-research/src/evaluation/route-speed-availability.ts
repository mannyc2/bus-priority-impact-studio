import { RouteIdCodec } from "@bp/domain/primitives";
import { z } from "zod";

export const ROUTE_SPEED_AVAILABILITY_SOURCE_ID = "bus_segment_speeds_2025" as const;
export type RouteSpeedAvailabilitySourceId = typeof ROUTE_SPEED_AVAILABILITY_SOURCE_ID;

export type RouteSpeedAvailabilityMonth = {
  isoMonth: string;
  year: number;
  month: number;
  routeCount: number;
  rowCount: number;
  busTripCount: number;
  status: "complete" | "insufficient_speed_routes";
};

export type RequestedRouteSpeedAvailability = Omit<RouteSpeedAvailabilityMonth, "status"> & {
  status: "complete" | "insufficient_speed_routes" | "missing_speed";
};

export type RouteSpeedAvailabilityReleaseDecision = {
  status: "new_complete_month_available" | "no_new_complete_month" | "no_complete_speed_month";
  latestCompleteMonth: string | null;
  lastBuiltMonth: string | null;
  shouldRebuild: boolean;
  reason: string;
};

export type RouteSpeedAvailabilityResult = {
  sourceId: RouteSpeedAvailabilitySourceId;
  checkedAt: string;
  startYear: number;
  endYear: number;
  minSpeedRoutes: number;
  latestSpeedMonth: RouteSpeedAvailabilityMonth | null;
  requestedMonth: RequestedRouteSpeedAvailability | null;
  releaseDecision: RouteSpeedAvailabilityReleaseDecision;
  months: RouteSpeedAvailabilityMonth[];
  artifactPath: string;
};

export type BuildRouteSpeedAvailabilityInput = {
  rows: readonly unknown[];
  checkedAt: string;
  startYear: number;
  endYear: number;
  minSpeedRoutes: number;
  artifactPath: string;
  requestedYear?: number | undefined;
  requestedMonth?: number | undefined;
  lastBuiltYear?: number | undefined;
  lastBuiltMonth?: number | undefined;
};

const RawRouteSpeedAvailabilityRowSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    route_id: z.string().min(1),
    row_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative().default(0),
  })
  .passthrough();

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function summarizeRouteSpeedAvailabilityMonths(input: {
  rows: readonly unknown[];
  minSpeedRoutes: number;
}): RouteSpeedAvailabilityMonth[] {
  const monthRows = new Map<
    string,
    { year: number; month: number; routes: Set<string>; rowCount: number; busTripCount: number }
  >();

  for (const row of input.rows) {
    const parsed = RawRouteSpeedAvailabilityRowSchema.parse(row);
    const monthKey = isoMonth(parsed.year, parsed.month);
    const existing = monthRows.get(monthKey) ?? {
      year: parsed.year,
      month: parsed.month,
      routes: new Set<string>(),
      rowCount: 0,
      busTripCount: 0,
    };

    existing.routes.add(z.decode(RouteIdCodec, parsed.route_id));
    existing.rowCount += parsed.row_count;
    existing.busTripCount += parsed.bus_trip_count;
    monthRows.set(monthKey, existing);
  }

  return [...monthRows.entries()]
    .map(([monthKey, value]) => {
      const routeCount = value.routes.size;
      return {
        isoMonth: monthKey,
        year: value.year,
        month: value.month,
        routeCount,
        rowCount: value.rowCount,
        busTripCount: value.busTripCount,
        status: routeCount >= input.minSpeedRoutes ? "complete" : "insufficient_speed_routes",
      } satisfies RouteSpeedAvailabilityMonth;
    })
    .sort((left, right) => right.isoMonth.localeCompare(left.isoMonth));
}

export function requestedRouteSpeedAvailability(input: {
  months: readonly RouteSpeedAvailabilityMonth[];
  year: number;
  month: number;
}): RequestedRouteSpeedAvailability {
  const monthKey = isoMonth(input.year, input.month);
  const found = input.months.find((month) => month.isoMonth === monthKey);
  return (
    found ?? {
      isoMonth: monthKey,
      year: input.year,
      month: input.month,
      routeCount: 0,
      rowCount: 0,
      busTripCount: 0,
      status: "missing_speed",
    }
  );
}

export function routeSpeedAvailabilityReleaseDecision(input: {
  latestSpeedMonth: RouteSpeedAvailabilityMonth | null;
  lastBuiltYear: number | undefined;
  lastBuiltMonth: number | undefined;
}): RouteSpeedAvailabilityReleaseDecision {
  const latestCompleteMonth = input.latestSpeedMonth?.isoMonth ?? null;
  const lastBuiltMonth =
    input.lastBuiltYear !== undefined && input.lastBuiltMonth !== undefined
      ? isoMonth(input.lastBuiltYear, input.lastBuiltMonth)
      : null;

  if (latestCompleteMonth === null) {
    return {
      status: "no_complete_speed_month",
      latestCompleteMonth,
      lastBuiltMonth,
      shouldRebuild: false,
      reason: "No complete route segment speed month is available in the checked range.",
    };
  }

  if (lastBuiltMonth === null || latestCompleteMonth > lastBuiltMonth) {
    return {
      status: "new_complete_month_available",
      latestCompleteMonth,
      lastBuiltMonth,
      shouldRebuild: true,
      reason:
        lastBuiltMonth === null
          ? `Latest complete speed month is ${latestCompleteMonth}; no last built month was provided.`
          : `Latest complete speed month ${latestCompleteMonth} is newer than last built month ${lastBuiltMonth}.`,
    };
  }

  return {
    status: "no_new_complete_month",
    latestCompleteMonth,
    lastBuiltMonth,
    shouldRebuild: false,
    reason: `Latest complete speed month ${latestCompleteMonth} is not newer than last built month ${lastBuiltMonth}.`,
  };
}

export function buildRouteSpeedAvailabilityResult(
  input: BuildRouteSpeedAvailabilityInput,
): RouteSpeedAvailabilityResult {
  const months = summarizeRouteSpeedAvailabilityMonths({
    rows: input.rows,
    minSpeedRoutes: input.minSpeedRoutes,
  });
  const latestSpeedMonth = months.find((month) => month.status === "complete") ?? null;
  const requestedMonth =
    input.requestedYear !== undefined && input.requestedMonth !== undefined
      ? requestedRouteSpeedAvailability({
          months,
          year: input.requestedYear,
          month: input.requestedMonth,
        })
      : null;

  return {
    sourceId: ROUTE_SPEED_AVAILABILITY_SOURCE_ID,
    checkedAt: input.checkedAt,
    startYear: input.startYear,
    endYear: input.endYear,
    minSpeedRoutes: input.minSpeedRoutes,
    latestSpeedMonth,
    requestedMonth,
    releaseDecision: routeSpeedAvailabilityReleaseDecision({
      latestSpeedMonth,
      lastBuiltYear: input.lastBuiltYear,
      lastBuiltMonth: input.lastBuiltMonth,
    }),
    months,
    artifactPath: input.artifactPath,
  };
}
