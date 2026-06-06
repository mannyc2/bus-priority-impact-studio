import type { StudioRoute, StudioRouteHistoryResponse, StudioSegment } from "@/studio/api-contract";

/**
 * Pure derived-series helpers shared by the route detail sections. No JSX or
 * chart imports so the route loaders that pull these in stay light.
 */

export function routeHistorySpeedSeries(history: StudioRouteHistoryResponse | null): number[] {
  return (
    history?.points.flatMap((point) =>
      point.averageSpeedMph === null ? [] : [Number(point.averageSpeedMph.toFixed(2))],
    ) ?? []
  );
}

export function routeHistoryRidershipSeries(history: StudioRouteHistoryResponse | null): number[] {
  return (
    history?.points.flatMap((point) =>
      point.ridership === null ? [] : [Number((point.ridership / 1000).toFixed(1))],
    ) ?? []
  );
}

export function routeHistoryWindow(history: StudioRouteHistoryResponse | null): string | null {
  if (history?.coverage.startMonth === null || history?.coverage.endMonth === null) return null;
  if (history === null) return null;
  return `${history.coverage.startMonth} to ${history.coverage.endMonth}`;
}

export function averageHourlySeverity(segments: readonly StudioSegment[]): number[] {
  if (segments.length === 0) return Array.from({ length: 24 }, () => 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const total = segments.reduce((sum, segment) => sum + (segment.hours[hour] ?? 0), 0);
    return total / segments.length;
  });
}

export function averageHourlySpeed(
  route: StudioRoute,
  segments: readonly StudioSegment[],
): number[] {
  const severity = averageHourlySeverity(segments);
  return severity.map((value) => Math.max(2, route.scheduledMph - value * 4.2));
}

export function formatCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 0)}K`;
  return String(Math.round(value));
}
