import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { useEffect, useState } from "react";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import {
  fetchMapContext,
  fetchRouteSegmentsGeo,
  fetchStudioRouteHourlyProfile,
  fetchStudioRouteSpeedHistory,
} from "@/studio/api-client";
import type {
  StudioRouteHourlyProfileResponse,
  StudioRouteSpeedHistoryResponse,
} from "@/studio/api-contract";

/** Lazy per-route artifact fetch states shared by the Segments explorer and
 * the Riders tab (frontend §7.2 keeps cell-grain data out of the Tier-1
 * response; these hooks own one abort lifecycle each). */

export type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null };

export type RouteHourlyProfileState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteHourlyProfileResponse }
  | { status: "unavailable"; data: null };

export function useRouteHourlyProfile(routeSlug: string): RouteHourlyProfileState {
  const [state, setState] = useState<RouteHourlyProfileState>({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    fetchStudioRouteHourlyProfile(routeSlug, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data === null ? { status: "unavailable", data: null } : { status: "ready", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", data: null });
      });

    return () => controller.abort();
  }, [routeSlug]);

  return state;
}

export function useRouteSpeedHistory(routeSlug: string): RouteSpeedHistoryState {
  const [state, setState] = useState<RouteSpeedHistoryState>({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    fetchStudioRouteSpeedHistory(routeSlug, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data === null ? { status: "unavailable", data: null } : { status: "ready", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", data: null });
      });

    return () => controller.abort();
  }, [routeSlug]);

  return state;
}

export type RouteGeoState =
  | { status: "loading" }
  | {
      status: "ready";
      collection: MapRouteSegmentFeatureCollection;
      context: RouteGeoContext | null;
    }
  | { status: "unavailable" };

export function useRouteSegmentsGeo(routeId: string): RouteGeoState {
  const [state, setState] = useState<RouteGeoState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all([
      fetchRouteSegmentsGeo(routeId, { signal: controller.signal }),
      // Shoreline context is progressive enhancement — its absence never
      // blocks the route geometry.
      fetchMapContext({ signal: controller.signal }).catch(() => null),
    ])
      .then(([collection, context]) => {
        if (controller.signal.aborted) return;
        setState(
          collection === null || collection.features.length === 0
            ? { status: "unavailable" }
            : { status: "ready", collection, context },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [routeId]);

  return state;
}

export function chartHoursFromHourlyProfile(
  profile: StudioRouteHourlyProfileResponse | null,
  fallback: readonly number[] | null,
): number[] | null {
  if (profile === null) return fallback === null ? null : [...fallback];
  return profile.hours.map((hour, index) => hour.averageSpeedMph ?? fallback?.[index] ?? 0);
}

export function hourProfileSource(state: RouteHourlyProfileState): string {
  if (state.status === "loading") return "Loading route hourly profile.";
  if (state.status === "unavailable") return "Route hourly profile unavailable.";
  return `${state.data.summary.latestMonth ?? "latest"} route-hour profile`;
}
