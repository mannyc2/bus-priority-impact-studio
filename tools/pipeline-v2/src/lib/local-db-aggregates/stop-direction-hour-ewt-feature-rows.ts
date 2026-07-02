import type { Database } from "bun:sqlite";
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

type RawScheduleRow = RawScheduleStopArrivalRow;

type RawGtfsStopTimeRow = {
  source_id: unknown;
  service_id: unknown;
  route_id: unknown;
  direction: unknown;
  stop_id: unknown;
  stop_name: unknown;
  arrival_time: unknown;
};

type RawGtfsServiceCalendarRow = {
  source_id: unknown;
  service_id: unknown;
  monday: unknown;
  tuesday: unknown;
  wednesday: unknown;
  thursday: unknown;
  friday: unknown;
  saturday: unknown;
  sunday: unknown;
  start_date: unknown;
  end_date: unknown;
};

type RawGtfsCalendarDateRow = {
  source_id: unknown;
  service_id: unknown;
  service_date: unknown;
  exception_type: unknown;
};

type RawObservedHeadwayRow = RawObservedHeadwayForEwtRow;

export type StopDirectionHourEwtFeatureLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
  readonly routeId: string;
  readonly runId: string;
  readonly scheduleSource: "auto" | StopDirectionHourEwtScheduleSourceKind;
  readonly gtfsRunId: string | null;
};

export type StopDirectionHourEwtFeatureArtifactFromDbInput =
  StopDirectionHourEwtFeatureLocalDbQuery & {
    readonly timezone: string;
    readonly generatedAt: string;
    readonly dbPath: string | null;
    readonly artifactPath: string;
    readonly minHeadways: number;
    readonly minCoverageShare: number;
    readonly observedAggregation: "service_date_hour" | "month_day_type_hour";
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

function intValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function nextMonthStart(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const next = monthNumber === 12 ? { year: year + 1, month: 1 } : { year, month: monthNumber + 1 };
  return `${next.year.toString().padStart(4, "0")}-${next.month.toString().padStart(2, "0")}-01`;
}

function yyyymmdd(date: string): string {
  return date.replaceAll("-", "");
}

function isoDateFromYyyymmdd(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function dayTypeFromIsoDate(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 0) return "Sunday";
  if (day === 6) return "Saturday";
  return "Weekday";
}

function gtfsTimeToIso(serviceDate: string, gtfsTime: string): string | null {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(gtfsTime);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (![hour, minute, second].every(Number.isFinite)) return null;
  const [year, month, day] = serviceDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
}

export function queryScheduleTimepointsForEwtFeatures(
  sqlite: Database,
  month: string,
  routeId: string,
): ScheduleStopArrivalForStopDirectionHourEwt[] {
  const rows = sqlite
    .query(
      `
        SELECT
          route_id,
          day_type,
          direction,
          stop_id,
          stop_name,
          schedule_date,
          schedule_time
        FROM local_route_schedule_timepoint
        WHERE month = ? AND route_id = ?
        ORDER BY day_type, direction, stop_id, schedule_time
      `,
    )
    .all(month, routeId) as RawScheduleRow[];
  return parseScheduleRowsForStopDirectionHourEwt(rows);
}

export function querySocrataRouteSchedulesForEwtFeatures(
  sqlite: Database,
  month: string,
  routeId: string,
): ScheduleStopArrivalForStopDirectionHourEwt[] {
  if (!tableExists(sqlite, "local_route_schedule_stop")) return [];
  const sourceYear = Number(month.slice(0, 4));
  const rows = sqlite
    .query(
      `
        SELECT
          route_id,
          day_type,
          direction,
          stop_id,
          stop_name,
          schedule_date,
          schedule_time
        FROM local_route_schedule_stop
        WHERE source_year = ?
          AND route_id = ?
          AND schedule_date >= ?
          AND schedule_date < ?
        ORDER BY day_type, direction, stop_id, schedule_time
      `,
    )
    .all(
      sourceYear,
      routeId,
      `${monthStart(month)}T00:00:00`,
      `${nextMonthStart(month)}T00:00:00`,
    ) as RawScheduleRow[];
  return parseScheduleRowsForStopDirectionHourEwt(rows);
}

function latestGtfsStaticRunId(sqlite: Database): string | null {
  if (!tableExists(sqlite, "local_gtfs_static_bundle")) return null;
  const row = sqlite
    .query(
      `
        SELECT run_id
        FROM local_gtfs_static_bundle
        GROUP BY run_id
        ORDER BY MAX(ingested_at) DESC, run_id DESC
        LIMIT 1
      `,
    )
    .get() as { run_id?: unknown } | null;
  return textValue(row?.run_id);
}

function datesInMonth(month: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${monthStart(month)}T12:00:00Z`);
  const end = new Date(`${nextMonthStart(month)}T12:00:00Z`);
  for (let time = start.getTime(); time < end.getTime(); time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function datesBetweenInclusive(startCompact: string, endCompact: string, maxDays = 370): string[] {
  const startIso = isoDateFromYyyymmdd(startCompact);
  const endIso = isoDateFromYyyymmdd(endCompact);
  if (startIso === null || endIso === null) return [];
  const dates: string[] = [];
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  for (
    let time = start.getTime(), count = 0;
    time <= end.getTime() && count < maxDays;
    time += 86_400_000, count += 1
  ) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function serviceKey(sourceId: string, serviceId: string): string {
  return `${sourceId}\0${serviceId}`;
}

function buildGtfsServiceDateMap(input: {
  month: string;
  calendars: readonly RawGtfsServiceCalendarRow[];
  calendarDates: readonly RawGtfsCalendarDateRow[];
}): Map<string, string[]> {
  const active = new Map<string, Set<string>>();
  const monthDates = datesInMonth(input.month);

  for (const calendar of input.calendars) {
    const sourceId = textValue(calendar.source_id);
    const serviceId = textValue(calendar.service_id);
    const startDate = textValue(calendar.start_date);
    const endDate = textValue(calendar.end_date);
    if (sourceId === null || serviceId === null || startDate === null || endDate === null) {
      continue;
    }
    const key = serviceKey(sourceId, serviceId);
    const dates = active.get(key) ?? new Set<string>();
    const serviceFlags = [
      intValue(calendar.sunday) ?? 0,
      intValue(calendar.monday) ?? 0,
      intValue(calendar.tuesday) ?? 0,
      intValue(calendar.wednesday) ?? 0,
      intValue(calendar.thursday) ?? 0,
      intValue(calendar.friday) ?? 0,
      intValue(calendar.saturday) ?? 0,
    ];
    for (const date of monthDates) {
      const compact = yyyymmdd(date);
      if (compact < startDate || compact > endDate) continue;
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if ((serviceFlags[day] ?? 0) === 1) dates.add(date);
    }
    active.set(key, dates);
  }

  for (const calendarDate of input.calendarDates) {
    const sourceId = textValue(calendarDate.source_id);
    const serviceId = textValue(calendarDate.service_id);
    const date = textValue(calendarDate.service_date);
    const exceptionType = intValue(calendarDate.exception_type);
    const isoDate = date === null ? null : isoDateFromYyyymmdd(date);
    if (
      sourceId === null ||
      serviceId === null ||
      isoDate === null ||
      exceptionType === null ||
      isoDate.slice(0, 7) !== input.month
    ) {
      continue;
    }
    const key = serviceKey(sourceId, serviceId);
    const dates = active.get(key) ?? new Set<string>();
    if (exceptionType === 1) dates.add(isoDate);
    if (exceptionType === 2) dates.delete(isoDate);
    active.set(key, dates);
  }

  return new Map(
    [...active.entries()]
      .map(
        ([key, values]) =>
          [key, [...values].sort((left, right) => left.localeCompare(right))] as const,
      )
      .filter(([, values]) => values.length > 0),
  );
}

function buildGtfsRepresentativeServiceDateMap(input: {
  calendars: readonly RawGtfsServiceCalendarRow[];
  calendarDates: readonly RawGtfsCalendarDateRow[];
}): Map<string, string[]> {
  const active = new Map<string, Set<string>>();

  for (const calendar of input.calendars) {
    const sourceId = textValue(calendar.source_id);
    const serviceId = textValue(calendar.service_id);
    const startDate = textValue(calendar.start_date);
    const endDate = textValue(calendar.end_date);
    if (sourceId === null || serviceId === null || startDate === null || endDate === null) {
      continue;
    }
    const key = serviceKey(sourceId, serviceId);
    const dates = active.get(key) ?? new Set<string>();
    const selectedDayTypes = new Set([...dates].map(dayTypeFromIsoDate));
    const serviceFlags = [
      intValue(calendar.sunday) ?? 0,
      intValue(calendar.monday) ?? 0,
      intValue(calendar.tuesday) ?? 0,
      intValue(calendar.wednesday) ?? 0,
      intValue(calendar.thursday) ?? 0,
      intValue(calendar.friday) ?? 0,
      intValue(calendar.saturday) ?? 0,
    ];
    for (const date of datesBetweenInclusive(startDate, endDate)) {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if ((serviceFlags[day] ?? 0) !== 1) continue;
      const dayType = dayTypeFromIsoDate(date);
      if (selectedDayTypes.has(dayType)) continue;
      dates.add(date);
      selectedDayTypes.add(dayType);
      if (selectedDayTypes.size >= 3) break;
    }
    if (dates.size > 0) active.set(key, dates);
  }

  for (const calendarDate of input.calendarDates) {
    const sourceId = textValue(calendarDate.source_id);
    const serviceId = textValue(calendarDate.service_id);
    const date = textValue(calendarDate.service_date);
    const exceptionType = intValue(calendarDate.exception_type);
    const isoDate = date === null ? null : isoDateFromYyyymmdd(date);
    if (sourceId === null || serviceId === null || isoDate === null || exceptionType === null) {
      continue;
    }
    const key = serviceKey(sourceId, serviceId);
    const dates = active.get(key) ?? new Set<string>();
    if (exceptionType === 1) dates.add(isoDate);
    if (exceptionType === 2) dates.delete(isoDate);
    if (dates.size > 0) active.set(key, dates);
  }

  return new Map(
    [...active.entries()]
      .map(
        ([key, values]) =>
          [key, [...values].sort((left, right) => left.localeCompare(right))] as const,
      )
      .filter(([, values]) => values.length > 0),
  );
}

export function queryGtfsStaticScheduleArrivalsForEwtFeatures(
  sqlite: Database,
  month: string,
  routeId: string,
  runId: string | null,
): {
  runId: string | null;
  rows: ScheduleStopArrivalForStopDirectionHourEwt[];
  usedReferenceCalendar: boolean;
} {
  const resolvedRunId = runId ?? latestGtfsStaticRunId(sqlite);
  if (resolvedRunId === null || !tableExists(sqlite, "local_gtfs_static_stop_time")) {
    return { runId: resolvedRunId, rows: [], usedReferenceCalendar: false };
  }

  const calendars = sqlite
    .query(
      `
        SELECT c.*
        FROM local_gtfs_static_calendar c
        WHERE c.run_id = ?
          AND EXISTS (
            SELECT 1
            FROM local_gtfs_static_trip t
            WHERE t.run_id = c.run_id
              AND t.source_id = c.source_id
              AND t.service_id = c.service_id
              AND t.route_id = ?
          )
      `,
    )
    .all(resolvedRunId, routeId) as RawGtfsServiceCalendarRow[];
  const calendarDates = sqlite
    .query(
      `
        SELECT d.*
        FROM local_gtfs_static_calendar_date d
        WHERE d.run_id = ?
          AND EXISTS (
            SELECT 1
            FROM local_gtfs_static_trip t
            WHERE t.run_id = d.run_id
              AND t.source_id = d.source_id
              AND t.service_id = d.service_id
              AND t.route_id = ?
          )
      `,
    )
    .all(resolvedRunId, routeId) as RawGtfsCalendarDateRow[];
  let serviceDatesByKey = buildGtfsServiceDateMap({ month, calendars, calendarDates });
  const usedReferenceCalendar = serviceDatesByKey.size === 0;
  if (usedReferenceCalendar) {
    serviceDatesByKey = buildGtfsRepresentativeServiceDateMap({ calendars, calendarDates });
  }
  if (serviceDatesByKey.size === 0) {
    return { runId: resolvedRunId, rows: [], usedReferenceCalendar };
  }

  const stopTimes = sqlite
    .query(
      `
        SELECT
          st.source_id,
          st.service_id,
          st.route_id,
          COALESCE(rs.direction, st.direction_id) AS direction,
          st.stop_id,
          gs.stop_name,
          st.arrival_time
        FROM local_gtfs_static_stop_time st
        LEFT JOIN local_gtfs_static_stop gs
          ON gs.run_id = st.run_id
          AND gs.source_id = st.source_id
          AND gs.stop_id = st.stop_id
        LEFT JOIN local_route_stop rs
          ON rs.route_id = st.route_id
          AND rs.month = ?
          AND rs.stop_id = st.stop_id
          AND rs.direction_id = st.direction_id
        WHERE st.run_id = ?
          AND st.route_id = ?
        ORDER BY st.source_id, st.service_id, direction, st.stop_id, st.arrival_time
      `,
    )
    .all(month, resolvedRunId, routeId) as RawGtfsStopTimeRow[];

  const rows: ScheduleStopArrivalForStopDirectionHourEwt[] = [];
  for (const stopTime of stopTimes) {
    const sourceId = textValue(stopTime.source_id);
    const serviceId = textValue(stopTime.service_id);
    const route = textValue(stopTime.route_id);
    const direction = textValue(stopTime.direction);
    const stopId = textValue(stopTime.stop_id);
    const arrivalTime = textValue(stopTime.arrival_time);
    if (
      sourceId === null ||
      serviceId === null ||
      route === null ||
      direction === null ||
      stopId === null ||
      arrivalTime === null
    ) {
      continue;
    }
    const serviceDates = serviceDatesByKey.get(serviceKey(sourceId, serviceId)) ?? [];
    for (const serviceDate of serviceDates) {
      const scheduleTime = gtfsTimeToIso(serviceDate, arrivalTime);
      if (scheduleTime === null) continue;
      rows.push({
        routeId: route,
        dayType: dayTypeFromIsoDate(serviceDate),
        direction,
        stopId,
        stopName: textValue(stopTime.stop_name),
        scheduleDate: serviceDate,
        scheduleTime,
      });
    }
  }

  return { runId: resolvedRunId, rows, usedReferenceCalendar };
}

function selectScheduleSource(input: {
  sqlite: Database;
  month: string;
  routeId: string;
  requestedSource: "auto" | StopDirectionHourEwtScheduleSourceKind;
  gtfsRunId: string | null;
}): {
  selection: StopDirectionHourEwtScheduleSelection;
  rows: ScheduleStopArrivalForStopDirectionHourEwt[];
} {
  const tryGtfs = () => {
    const gtfs = queryGtfsStaticScheduleArrivalsForEwtFeatures(
      input.sqlite,
      input.month,
      input.routeId,
      input.gtfsRunId,
    );
    return {
      selection: {
        kind: "gtfs_static" as const,
        table: "local_gtfs_static_stop_time" as const,
        gtfsRunId: gtfs.runId,
        caveat: gtfs.usedReferenceCalendar
          ? "Schedule baselines use all-stop GTFS static stop_times expanded through representative active service dates because the selected GTFS bundle calendar does not overlap the analysis month. This is a day-type/hour baseline fallback; month-specific service exceptions are not asserted."
          : "Schedule baselines use all-stop GTFS static stop_times expanded through calendar/calendar_dates for the analysis month. Cells still emit typed missing-data states when observed samples or matched scheduled baselines are insufficient.",
      },
      rows: gtfs.rows,
    };
  };
  const trySocrata = () => ({
    selection: {
      kind: "socrata_route_schedule" as const,
      table: "local_route_schedule_stop" as const,
      gtfsRunId: null,
      caveat:
        "Schedule baselines use MTA Socrata Bus Schedules rows staged by source year. This source appears timepoint-grain for tested routes, so all-stop audit coverage should prefer GTFS static when available.",
    },
    rows: querySocrataRouteSchedulesForEwtFeatures(input.sqlite, input.month, input.routeId),
  });
  const tryTimepoints = () => ({
    selection: {
      kind: "route_schedule_timepoint" as const,
      table: "local_route_schedule_timepoint" as const,
      gtfsRunId: null,
      caveat:
        "Schedule baselines use the legacy local route-slice schedule table, which covers timepoint stops. Cells without a matched baseline are emitted with baseline_unavailable rather than scored as clean.",
    },
    rows: queryScheduleTimepointsForEwtFeatures(input.sqlite, input.month, input.routeId),
  });

  if (input.requestedSource === "gtfs_static") return tryGtfs();
  if (input.requestedSource === "socrata_route_schedule") return trySocrata();
  if (input.requestedSource === "route_schedule_timepoint") return tryTimepoints();

  for (const candidate of [tryGtfs(), trySocrata(), tryTimepoints()]) {
    if (candidate.rows.length > 0) return candidate;
  }
  return tryTimepoints();
}

export function queryObservedHeadwaysForEwtFeatures(
  sqlite: Database,
  month: string,
  runId: string,
  routeId: string,
): ObservedHeadwayForStopDirectionHourEwt[] {
  const routeIdCandidates = [
    routeId,
    ...(/^([A-Z]+)([1-9])$/.test(routeId)
      ? [routeId.replace(/^([A-Z]+)([1-9])$/, (_match, prefix, number) => `${prefix}0${number}`)]
      : []),
  ];
  const placeholders = routeIdCandidates.map(() => "?").join(", ");
  const rows = sqlite
    .query(
      `
        SELECT
          ? AS route_id,
          COALESCE(s.direction, CAST(h.direction_id AS TEXT)) AS direction,
          h.stop_id,
          s.stop_name AS stop_name,
          h.observed_timestamp,
          h.headway_minutes
        FROM local_observed_headway_sample h
        LEFT JOIN local_route_stop s
          ON s.route_id = ?
          AND s.month = ?
          AND s.stop_id = h.stop_id
          AND s.direction_id = CAST(h.direction_id AS TEXT)
        WHERE h.run_id = ?
          AND h.route_id IN (${placeholders})
          AND h.headway_minutes > 0
        ORDER BY h.observed_timestamp, h.stop_id
      `,
    )
    .all(routeId, routeId, month, runId, ...routeIdCandidates) as RawObservedHeadwayRow[];
  return parseObservedRowsForStopDirectionHourEwt(rows);
}

export function loadStopDirectionHourEwtFeatureLocalDbRows(
  input: StopDirectionHourEwtFeatureLocalDbQuery,
): {
  readonly selection: StopDirectionHourEwtScheduleSelection;
  readonly scheduleArrivals: readonly ScheduleStopArrivalForStopDirectionHourEwt[];
  readonly observedHeadways: readonly ObservedHeadwayForStopDirectionHourEwt[];
} {
  const { selection, rows: scheduleArrivals } = selectScheduleSource({
    sqlite: input.sqlite,
    month: input.month,
    routeId: input.routeId,
    requestedSource: input.scheduleSource,
    gtfsRunId: input.gtfsRunId,
  });
  const observedHeadways = queryObservedHeadwaysForEwtFeatures(
    input.sqlite,
    input.month,
    input.runId,
    input.routeId,
  );
  return { selection, scheduleArrivals, observedHeadways };
}

export function buildStopDirectionHourEwtFeatureArtifactFromDb(
  input: StopDirectionHourEwtFeatureArtifactFromDbInput,
): StopDirectionHourEwtFeatureArtifact {
  const { selection, scheduleArrivals, observedHeadways } =
    loadStopDirectionHourEwtFeatureLocalDbRows({
      sqlite: input.sqlite,
      month: input.month,
      routeId: input.routeId,
      runId: input.runId,
      scheduleSource: input.scheduleSource,
      gtfsRunId: input.gtfsRunId,
    });
  return buildStopDirectionHourEwtFeatureArtifact({
    month: input.month,
    routeId: input.routeId,
    runId: input.runId,
    selection,
    scheduleArrivals,
    observedHeadways,
    timezone: input.timezone,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    minHeadways: input.minHeadways,
    minCoverageShare: input.minCoverageShare,
    observedAggregation: input.observedAggregation,
  });
}
