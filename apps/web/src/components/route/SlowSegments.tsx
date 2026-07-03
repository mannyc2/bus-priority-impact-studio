import { useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/ChartFrame";
import { CorridorProfile } from "@/components/CorridorProfile";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { RPubSlowCard } from "@/components/route/RoutePublicAtoms";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  insightTargetsSegment,
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import { SegmentCarpet } from "@/components/route/SegmentCarpet";
import { routeSectionTitle } from "@/components/route/section-registry";
import { buildSegmentCarpetModel } from "@/components/route/segment-carpet-data";
import {
  type WhereWhenSummary,
  whereWhenSegmentBadge,
  whereWhenSummary,
} from "@/components/route/where-when-summary";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { fetchStudioRouteSpeedHistory } from "@/studio/api-client";
import type {
  RouteDossierSummaryForDetail,
  StudioRouteDetailResponse,
  StudioRouteInsight,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

type SegmentIdentity = {
  id: string;
};

type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null };

export function prioritizeWhereWhenSegments<T extends SegmentIdentity>(
  insightSegments: readonly T[],
  fallbackSegments: readonly T[],
): T[] {
  return [
    ...new Map(
      [...insightSegments, ...fallbackSegments].map((segment) => [segment.id, segment] as const),
    ).values(),
  ];
}

export function SlowSegmentsSection({
  route,
  segments,
  insights,
  flaggedId,
  dossier,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  insights: readonly StudioRouteInsight[];
  flaggedId?: string;
  dossier?: RouteDossierSummaryForDetail | null;
}) {
  const [direction, setDirection] = useState<"all" | "NB" | "SB" | "EB" | "WB">("all");
  const hourProfile = averageHourlySpeed(route, segments);
  const summary = whereWhenSummary({ route, segments, dossier: dossier ?? null });
  const speedHistory = useRouteSpeedHistory(route.slug);
  const carpetModel = useMemo(
    () => buildSegmentCarpetModel(speedHistory.data, segments),
    [speedHistory.data, segments],
  );
  const carpetSource = carpetSourceLabel(
    speedHistory,
    carpetModel.months.length,
    carpetModel.rows.length,
  );

  const mapInsights = routeInsightPlacements(insights).mapSegment;
  const segmentInsight = (segment: StudioSegment) =>
    mapInsights.find((insight) => insightTargetsSegment(insight, segment.id)) ?? null;
  const directionSegments =
    direction === "all" ? segments : segments.filter((segment) => segment.direction === direction);
  const topVisible = directionSegments.slice(0, 5);
  const matchedInsightSegments = directionSegments.filter((segment) => segmentInsight(segment));
  const visible = prioritizeWhereWhenSegments(
    [
      ...directionSegments.filter((segment) => segment.id === dossier?.worstSegment?.segmentId),
      ...matchedInsightSegments,
    ],
    topVisible,
  );
  const featured = visible.slice(0, 3);
  const routeMedianMph = medianSegmentSpeed(directionSegments);

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={routeSectionTitle("where-when")}
        sub={summary.sectionSubtitle}
        right={
          <div className="flex items-center gap-2">
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={setDirection}
              options={[
                { id: "all" as const, label: "All" },
                { id: "NB" as const, label: "NB" },
                { id: "SB" as const, label: "SB" },
              ]}
            />
          </div>
        }
      />
      {featured.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
          {featured.map((segment, index) => (
            <RPubSlowCard
              key={segment.id}
              segment={segment}
              routeMedianMph={routeMedianMph}
              badge={whereWhenSegmentBadge({ segment, dossier: dossier ?? null })}
              rank={index + 1}
              note={
                segmentInsight(segment) ? (
                  <SegmentInsightNote insight={segmentInsight(segment) as StudioRouteInsight} />
                ) : segment.aiNote ? (
                  <p className="m-0 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                    {segment.aiNote}
                  </p>
                ) : null
              }
            />
          ))}
        </div>
      ) : null}
      <WhereWhenSummaryCards summary={summary} />
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader title="Profile" />
          <CorridorProfile route={route} segments={segments} highlightId={flaggedId} />
        </div>
        <ChartFrame title="By hour" height={164}>
          <HourBars
            data={hourProfile}
            sched={route.scheduledMph}
            height={164}
            min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
            max={Math.ceil(Math.max(route.scheduledMph, ...hourProfile) + 1)}
            legend
          />
        </ChartFrame>
      </div>
      <ChartFrame
        title="Segment history"
        height={320}
        {...(carpetSource ? { source: carpetSource } : {})}
        right={
          <Badge variant={speedHistory.status === "ready" ? "neutral" : "warn"}>
            {speedHistory.status === "ready"
              ? (carpetModel.latestMonth ?? "ready")
              : speedHistory.status}
          </Badge>
        }
      >
        {speedHistory.status === "loading" ? (
          <div
            className="h-[300px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
            aria-hidden
          />
        ) : (
          <SegmentCarpet model={carpetModel} />
        )}
      </ChartFrame>
      <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        {featured.length} of {segments.length} segments highlighted.
      </div>
    </section>
  );
}

function useRouteSpeedHistory(routeSlug: string): RouteSpeedHistoryState {
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

function carpetSourceLabel(
  state: RouteSpeedHistoryState,
  monthCount: number,
  segmentCount: number,
): string | undefined {
  if (state.status === "loading") return "Loading speed history.";
  if (state.status === "unavailable") return "Speed history unavailable.";
  return `${monthCount} months / ${segmentCount} segments`;
}

function WhereWhenSummaryCards({ summary }: { summary: WhereWhenSummary }) {
  return (
    <div className="grid grid-cols-4 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
      <WhereWhenStat label="Speed" value={summary.currentSpeedLabel} sub={summary.peerLabel} />
      <WhereWhenStat
        label="Trend"
        value={summary.movementLabel}
        sub={summary.movementDetail}
        tone={summary.movementTone}
      />
      <WhereWhenStat label="Window" value={summary.windowLabel} sub={summary.coverageLabel} />
      <WhereWhenStat
        label="Worst"
        value={summary.worstSegmentLabel}
        sub={summary.worstSegmentDetail}
      />
    </div>
  );
}

function WhereWhenStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: WhereWhenSummary["movementTone"];
}) {
  const color =
    tone === "bad"
      ? "var(--bp-color-bad)"
      : tone === "good"
        ? "var(--bp-color-good)"
        : "var(--bp-color-ink)";
  return (
    <div className="min-w-0 p-4 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-xl:nth-2:shadow-none max-sm:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div
        className="mt-1 truncate font-mono text-[20px] font-semibold leading-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function SegmentInsightNote({ insight }: { insight: StudioRouteInsight }) {
  const caveats = safeInsightCaveats(insight, 2);
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-accent-bg)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
        Note
      </span>
      <span className="mt-1 block">
        {insight.shortText}
        {caveats.length > 0 ? (
          <span className="text-[var(--bp-color-ink-55)]"> {caveats.slice(0, 2).join(" ")}</span>
        ) : null}
      </span>
    </div>
  );
}

function medianSegmentSpeed(segments: readonly StudioSegment[]): number | null {
  const speeds = segments
    .map((segment) => segment.speedMph)
    .filter((speed) => Number.isFinite(speed) && speed > 0)
    .toSorted((left, right) => left - right);
  if (speeds.length === 0) return null;
  const mid = Math.floor(speeds.length / 2);
  if (speeds.length % 2 === 1) return speeds[mid] ?? null;
  const left = speeds[mid - 1];
  const right = speeds[mid];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}
