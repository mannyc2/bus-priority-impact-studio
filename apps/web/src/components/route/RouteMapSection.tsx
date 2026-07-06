import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { CorridorMap, orderCorridorSegments } from "@/components/CorridorMap";
import { type RouteMapLayerState, RouteMapLibre } from "@/components/route/RouteMapLibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import {
  insightTargetsSegment,
  routeInsightPlacements,
} from "@/components/route/route-insight-placement";
import { SectionCard } from "@/components/SectionCard";
import { Badge } from "@/components/ui/badge";
import { fetchMapContext, fetchRouteSegmentsGeo } from "@/studio/api-client";
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
  | {
      status: "ready";
      collection: MapRouteSegmentFeatureCollection;
      context: RouteGeoContext | null;
    }
  | { status: "unavailable" };

export function useRouteSegmentsGeo(routeId: string): GeoState {
  const [state, setState] = useState<GeoState>({ status: "loading" });

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

export function RouteMapSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const highlight = routeMapHighlight(segments, data.insights);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [layers, setLayers] = useState<RouteMapLayerState>({
    lane: true,
    ace: false,
    tsp: false,
  });
  const orderedSegments = useMemo(
    () => orderCorridorSegments(route.slug, segments),
    [route.slug, segments],
  );
  const activeSegment =
    hoveredSegmentId === null
      ? null
      : (orderedSegments.find((segment) => segment.id === hoveredSegmentId) ?? null);
  const displaySegment = activeSegment ?? highlight.segment;
  const focus = displaySegment
    ? routeMapFocusSummary({ segment: displaySegment, signalCount: highlight.signalCount })
    : routeMapFocusSummary(highlight);
  const laneSegments = segments.filter((segment) => segment.lane !== "none").length;
  const treatmentSegments = segments.filter((segment) => segment.ace || segment.tsp).length;
  const highlightId = activeSegment?.id ?? highlight.segment?.id;
  const geo = useRouteSegmentsGeo(route.routeId);

  return (
    <SectionCard
      title="On the map"
      sub="Observed all-day speed by segment."
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
    >
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(310px,0.75fr)] gap-4 max-xl:grid-cols-1">
        <div className="min-w-0 overflow-hidden rounded-[3px] bg-[var(--bp-color-paper-deep)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          {geo.status === "ready" ? (
            <RouteMapLibre
              collection={geo.collection}
              context={geo.context}
              route={route}
              segments={orderedSegments}
              hoveredSegmentId={hoveredSegmentId}
              setHoveredSegmentId={setHoveredSegmentId}
              layers={layers}
              highlightId={highlightId}
            />
          ) : geo.status === "loading" ? (
            <div
              className="animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
              style={{ height: 560 }}
              aria-hidden
            />
          ) : (
            <CorridorMap route={route} segments={orderedSegments} highlightId={highlightId} />
          )}
        </div>
        <aside className="min-w-0 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          <StaticMapReadout route={route} segment={displaySegment} />
          <LayerControls layers={layers} setLayers={setLayers} />
        </aside>
      </div>
      {geo.status === "unavailable" ? (
        <p className="m-0 mt-4 text-[11.5px] text-[var(--bp-color-ink-55)]">
          Street geometry for this route is not published yet; showing the corridor speed profile
          instead.
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <MapStat
          label="Bus lanes"
          value={`${route.laneCoverage}%`}
          sub={`${laneSegments} segments`}
        />
        <MapStat label="ACE/TSP" value={String(treatmentSegments)} sub="segments" />
        <MapStat label="Focus segment" value={focus.value} sub={focus.sub} />
      </div>
    </SectionCard>
  );
}

function StaticMapReadout({
  route,
  segment,
}: {
  route: StudioRouteDetailResponse["route"];
  segment: StudioSegment | null;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-40)]">
        All-day observed
      </div>
      <div className="mt-1 font-mono text-[30px] font-semibold leading-none tabular-nums">
        {route.weightedAvgSpeed.toFixed(1)}
        <span className="ml-1 text-[12px] text-[var(--bp-color-ink-55)]">mph</span>
      </div>
      {segment === null ? (
        <p className="m-0 mt-4 text-[12.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
          Hourly speed profile is not attached yet.
        </p>
      ) : (
        <div className="mt-4">
          <div className="text-[13px] font-semibold leading-snug text-[var(--bp-color-ink)]">
            {segment.from} to {segment.to}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--bp-color-ink-55)]">
            <span className="font-mono font-bold text-[var(--bp-color-ink)]">
              {segment.speedMph.toFixed(1)} mph
            </span>
            <span>{Math.round(segment.riderHours)} rider hr</span>
            <span>{segmentTreatment(segment)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerControls({
  layers,
  setLayers,
}: {
  layers: RouteMapLayerState;
  setLayers: Dispatch<SetStateAction<RouteMapLayerState>>;
}) {
  const items = [
    { key: "lane", label: "Bus lanes" },
    { key: "ace", label: "ACE" },
    { key: "tsp", label: "TSP" },
  ] as const;

  return (
    <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4">
      <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-40)]">
        Priority overlays
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-semibold shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
          >
            <input
              type="checkbox"
              checked={layers[item.key]}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setLayers((current) => ({ ...current, [item.key]: checked }));
              }}
              className="size-3.5 accent-[var(--bp-color-ink)]"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MapStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">{label}</div>
      <div className="font-mono text-[28px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function segmentTreatment(segment: StudioSegment): string {
  const items = [
    segment.lane === "none" ? null : segment.lane === "yes" ? "bus lane" : `${segment.lane} lane`,
    segment.ace ? "ACE" : null,
    segment.tsp ? "TSP" : null,
  ].filter(Boolean);
  return items.length === 0 ? "no priority" : items.join(" + ");
}
