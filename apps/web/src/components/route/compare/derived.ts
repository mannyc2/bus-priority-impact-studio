import {
  routeHistoryRidershipSeries,
  routeHistorySpeedSeries,
} from "@/components/route/route-derived";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

/** Speed trend for a route: real route-month history, or the sparkline fallback
 * (matches the single-route sections' behavior). */
export function compareSpeedSeries(
  detail: StudioRouteDetailResponse,
  history: StudioRouteHistoryResponse | null,
): number[] {
  const series = routeHistorySpeedSeries(history);
  return series.length > 0 ? series : [...detail.route.spark];
}

/** Monthly ridership (thousands); empty when the route has no history. */
export function compareRidersSeries(history: StudioRouteHistoryResponse | null): number[] {
  return routeHistoryRidershipSeries(history);
}
