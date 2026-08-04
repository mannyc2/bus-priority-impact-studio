import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { useEffect, useState } from "react";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import {
  fetchMapContext,
  fetchRouteSegmentsGeoLoad,
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

/* `unavailable` is a fact about the data — a clean 404 or a null payload.
   A failed request is not that, and rendering one as the other turns a
   transport problem into a claim about the route. */
export type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null }
  | { status: "error"; data: null };

export type RouteHourlyProfileState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteHourlyProfileResponse }
  | { status: "unavailable"; data: null }
  | { status: "error"; data: null };

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
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Route hourly profile request failed.", { routeSlug, error });
        setState({ status: "error", data: null });
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
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Route speed-history request failed.", { routeSlug, error });
        setState({ status: "error", data: null });
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
  | { status: "unavailable"; reason: string };

function routeGeometryUnavailableReason(
  load: Exclude<Awaited<ReturnType<typeof fetchRouteSegmentsGeoLoad>>, { status: "ready" }>,
): string {
  switch (load.status) {
    case "integrity_mismatch":
      return "Route geometry failed its published integrity check.";
    case "invalid_contract":
      return "Route geometry failed its data contract.";
    case "request_failed":
      return "Route geometry could not be loaded.";
    case "missing":
      return "Route geometry is not published yet.";
    case "unavailable":
      return load.reason;
  }
}

export function useRouteSegmentsGeo(routeId: string): RouteGeoState {
  const [state, setState] = useState<RouteGeoState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all([
      fetchRouteSegmentsGeoLoad(routeId, { signal: controller.signal }),
      // Shoreline context is progressive enhancement — its absence never
      // blocks the route geometry.
      fetchMapContext({ signal: controller.signal }).catch(() => null),
    ])
      .then(([load, context]) => {
        if (controller.signal.aborted) return;
        setState(
          load.status !== "ready" || load.data.features.length === 0
            ? {
                status: "unavailable",
                reason:
                  load.status === "ready"
                    ? "Route geometry contains no published segments."
                    : routeGeometryUnavailableReason(load),
              }
            : { status: "ready", collection: load.data, context },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", reason: "Route geometry could not be loaded." });
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
  if (state.status === "error") return "Route hourly profile could not be loaded.";
  if (state.status === "unavailable") return "Route hourly profile unavailable.";
  return `${state.data.summary.latestMonth ?? "latest"} route-hour profile`;
}
