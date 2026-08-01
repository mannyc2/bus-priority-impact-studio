import type {
  RouteDossierMetricSummary,
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioSegment,
} from "@/studio/api-contract";

/**
 * Pure derived-series helpers shared by the route detail sections. No JSX or
 * chart imports so the route loaders that pull these in stay light.
 */

// C2 dossier series: the detail response embeds monthly sparkline vectors, so the
// sections read them off `data.dossier` (no separate history fetch on this page).

export type TrendPoint = {
  month: string;
  value: number | null;
};

export function dossierSpeedPoints(dossier: RouteDossierSummaryForDetail | null): TrendPoint[] {
  return (
    dossier?.speed.sparkline.map((point) => ({
      month: point.month,
      value: point.value === null ? null : Number(point.value.toFixed(2)),
    })) ?? []
  );
}

export function dossierRidershipSeries(dossier: RouteDossierSummaryForDetail | null): number[] {
  return (
    dossier?.ridership.sparkline.flatMap((point) =>
      point.value === null ? [] : [Number((point.value / 1000).toFixed(1))],
    ) ?? []
  );
}

export function dossierMetricMonthCount(metric: RouteDossierMetricSummary | undefined): number {
  return metric?.sparkline.filter((point) => point.value !== null).length ?? 0;
}

export function dossierMetricWindow(metric: RouteDossierMetricSummary | undefined): string | null {
  const months = metric?.sparkline.flatMap((point) => (point.value === null ? [] : [point.month]));
  if (months === undefined || months.length === 0) return null;
  return `${months[0]} to ${months[months.length - 1]}`;
}

export function routePerformanceSummary(
  route: StudioRoute,
  dossier: RouteDossierSummaryForDetail | null,
): {
  speedMph: number;
  peerPercentile: number | null;
  dataAsOf: string | null;
  lead: string;
} {
  const speed = dossier?.speed;
  if (speed?.current !== null && speed?.current !== undefined) {
    const movement =
      speed.movement6mPct === null
        ? ""
        : `, ${speed.movement6mPct > 0 ? "+" : ""}${speed.movement6mPct.toFixed(1)}% 6 mo`;
    return {
      speedMph: speed.current,
      peerPercentile: speed.peerPercentile,
      dataAsOf: speed.dataAsOf,
      lead: `${route.label}: ${speed.current.toFixed(1)} mph${movement}.`,
    };
  }

  return {
    speedMph: route.weightedAvgSpeed,
    peerPercentile: route.speedPercentile,
    dataAsOf: null,
    lead: route.diagnosis,
  };
}

function averageHourlySeverity(segments: readonly StudioSegment[]): number[] {
  if (segments.length === 0) return Array.from({ length: 24 }, () => 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const total = segments.reduce((sum, segment) => sum + (segment.hours[hour] ?? 0), 0);
    return total / segments.length;
  });
}

export function averageHourlySpeed(
  route: StudioRoute,
  segments: readonly StudioSegment[],
): number[] | null {
  const scheduledMph = route.scheduledMph;
  if (scheduledMph === null) return null;
  const severity = averageHourlySeverity(segments);
  return severity.map((value) => Math.max(2, scheduledMph - value * 4.2));
}

export function formatCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 0)}K`;
  return String(Math.round(value));
}
