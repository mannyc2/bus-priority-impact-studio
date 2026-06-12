import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { useEffect, useState } from "react";
import { CorridorMap } from "@/components/CorridorMap";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import {
  insightTargetsSegment,
  routeInsightPlacements,
} from "@/components/route/route-insight-placement";
import { routeSectionQuestion } from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { fetchRouteSegmentsGeo } from "@/studio/api-client";
import type {
  StudioRouteDetailResponse,
  StudioRouteInsight,
  StudioSegment,
} from "@/studio/api-contract";

export type RouteMapHighlight = {
  segment: StudioSegment | null;
  signalCount: number;
};

export type RouteMapFocusSummary = {
  value: string;
  sub: string;
};

export function routeMapHighlight(
  segments: readonly StudioSegment[],
  insights: readonly StudioRouteInsight[],
): RouteMapHighlight {
  const mapInsights = routeInsightPlacements(insights).mapSegment;
  for (const insight of mapInsights) {
    const segment = segments.find((item) => insightTargetsSegment(insight, item.id));
    if (segment) return { segment, signalCount: mapInsights.length };
  }
  return {
    segment: segments.find((segment) => segment.flagged) ?? null,
    signalCount: mapInsights.length,
  };
}

export function routeMapFocusSummary(highlight: RouteMapHighlight): RouteMapFocusSummary {
  const { segment, signalCount } = highlight;
  if (segment === null) {
    return {
      value: signalCount > 0 ? "Unmatched" : "Clear",
      sub: signalCount > 0 ? "map signal" : "no flag",
    };
  }

  const overlap =
    [
      segment.lane === "none" ? null : "lane",
      segment.ace ? "ACE" : null,
      segment.tsp ? "TSP" : null,
    ]
      .filter(Boolean)
      .join("+") || "no priority";
  return {
    value: `${segment.speedMph.toFixed(1)} mph`,
    sub: `${segment.from} to ${segment.to} / ${Math.round(segment.riderHours)} rider hr / ${overlap}`,
  };
}

type GeoState =
  | { status: "loading" }
  | { status: "ready"; collection: MapRouteSegmentFeatureCollection }
  | { status: "unavailable" };

export function useRouteSegmentsGeo(routeId: string): GeoState {
  const [state, setState] = useState<GeoState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchRouteSegmentsGeo(routeId, { signal: controller.signal })
      .then((collection) => {
        if (controller.signal.aborted) return;
        setState(
          collection === null || collection.features.length === 0
            ? { status: "unavailable" }
            : { status: "ready", collection },
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

export function RouteMapSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const highlight = routeMapHighlight(segments, data.insights);
  const focus = routeMapFocusSummary(highlight);
  const laneSegments = segments.filter((segment) => segment.lane !== "none").length;
  const treatmentSegments = segments.filter((segment) => segment.ace || segment.tsp).length;
  const geo = useRouteSegmentsGeo(route.routeId);

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={routeSectionQuestion("map")}
        sub="Observed segment speeds on the route's street geometry."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                highlight.signalCount > 0 ? "warn" : highlight.segment?.flagged ? "bad" : "neutral"
              }
            >
              {highlight.signalCount > 0
                ? `${highlight.signalCount} signals`
                : highlight.segment
                  ? "flagged"
                  : "clear"}
            </Badge>
            <Badge variant="neutral">{segments.length} segments</Badge>
          </div>
        }
      />
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        {geo.status === "ready" ? (
          <RouteGeoMap collection={geo.collection} />
        ) : geo.status === "loading" ? (
          <div
            className="animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
            style={{ height: 420 }}
            aria-hidden
          />
        ) : (
          <CorridorMap route={route} segments={segments} highlightId={highlight.segment?.id} />
        )}
      </div>
      {geo.status === "unavailable" ? (
        <p className="m-0 text-[11.5px] text-[var(--bp-color-ink-55)]">
          Street geometry for this route is not published yet; showing the corridor speed profile
          instead.
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <MapStat
          label="Bus lanes"
          value={`${route.laneCoverage}%`}
          sub={`${laneSegments} segments`}
        />
        <MapStat label="ACE/TSP" value={String(treatmentSegments)} sub="segments" />
        <MapStat label="Focus segment" value={focus.value} sub={focus.sub} />
      </div>
    </section>
  );
}

function MapStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">{label}</div>
      <div className="font-mono text-[28px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}
