import { useState } from "react";
import { type CaptureSource, SendToBriefSheet } from "@/components/brief/SendToBriefSheet.js";
import { ChartFrame } from "@/components/ChartFrame";
import { CorridorMap } from "@/components/CorridorMap";
import { CorridorProfile } from "@/components/CorridorProfile";
import { DataAsOf } from "@/components/DataAsOf";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  insightTargetsSegment,
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import { routeSectionQuestion } from "@/components/route/section-registry";
import {
  type WhereWhenSummary,
  whereWhenSegmentBadge,
  whereWhenSummary,
} from "@/components/route/where-when-summary";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import type {
  RouteDossierSummaryForDetail,
  StudioRouteDetailResponse,
  StudioRouteInsight,
  StudioSegment,
} from "@/studio/api-contract";
import { legacyToTreatments } from "@/studio/treatment-model";

type SegmentIdentity = {
  id: string;
};

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
  const [openId, setOpenId] = useState<string | null>(flaggedId ?? null);
  const [direction, setDirection] = useState<"all" | "NB" | "SB" | "EB" | "WB">("all");
  const [sendSeg, setSendSeg] = useState<StudioSegment | null>(null);
  const hourProfile = averageHourlySpeed(route, segments);
  const summary = whereWhenSummary({ route, segments, dossier: dossier ?? null });

  const capture: CaptureSource | null = sendSeg && {
    routeSlug: route.slug,
    routeLabel: route.label,
    routeSbs: route.sbs,
    dir: sendSeg.direction,
    from: sendSeg.from,
    to: sendSeg.to,
    mph: sendSeg.speedMph,
  };
  const mapInsights = routeInsightPlacements(insights).mapSegment;
  const segmentInsight = (segment: StudioSegment) =>
    mapInsights.find((insight) => insightTargetsSegment(insight, segment.id)) ?? null;
  const directionSegments =
    direction === "all" ? segments : segments.filter((segment) => segment.direction === direction);
  const topVisible = directionSegments.slice(0, 5);
  const matchedInsightSegments = directionSegments.filter((segment) => segmentInsight(segment));
  const visible = prioritizeWhereWhenSegments(matchedInsightSegments, topVisible);
  const featured = visible.slice(0, 3);
  const tableRows = visible.slice(3);
  const visibleMatchedInsightIds = new Set(
    visible.flatMap((segment) => {
      const insight = segmentInsight(segment);
      return insight === null ? [] : [`${insight.detectorId}:${insight.scopeId ?? ""}`];
    }),
  );
  const unmatchedMapInsightCount = mapInsights.filter(
    (insight) => !visibleMatchedInsightIds.has(`${insight.detectorId}:${insight.scopeId ?? ""}`),
  ).length;

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={routeSectionQuestion("where-when")}
        sub={summary.sectionSubtitle}
        right={
          <div className="flex items-center gap-2">
            <DataAsOf dataAsOf={summary.dataAsOf} />
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
      <WhereWhenSummaryCards summary={summary} />
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader title="Profile" sub="Weekday speed; dash=schedule." />
          <CorridorProfile route={route} segments={segments} highlightId={flaggedId} />
        </div>
        <ChartFrame title="Hourly speed" source="Average by hour." height={164}>
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
      {featured.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
          {featured.map((segment, index) => (
            <SlowSegmentCard
              key={segment.id}
              route={route}
              segments={segments}
              segment={segment}
              insight={segmentInsight(segment)}
              segmentBadge={whereWhenSegmentBadge({ segment, dossier: dossier ?? null })}
              index={index}
              onSend={() => setSendSeg(segment)}
            />
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {tableRows.length > 0 ? <SegmentRowHeader /> : null}
          {tableRows.map((segment) => {
            const isOpen = openId === segment.id;
            return (
              <div key={segment.id}>
                <SegmentRow
                  dir={segment.direction}
                  from={segment.from}
                  to={segment.to}
                  mph={segment.speedMph}
                  sched={segment.scheduledMph}
                  riderHours={segment.riderHours}
                  hours={segment.hours}
                  lane={segment.lane}
                  ace={segment.ace}
                  tsp={segment.tsp}
                  treatments={legacyToTreatments({
                    lane: segment.lane,
                    ace: segment.ace,
                    tsp: segment.tsp,
                  })}
                  hasNote={Boolean(segment.aiNote)}
                  noteOpen={isOpen && Boolean(segment.aiNote)}
                  {...(segment.flagged ? { flag: "top" as const } : {})}
                  {...(segment.aiNote
                    ? {
                        onClick: () => setOpenId((cur) => (cur === segment.id ? null : segment.id)),
                      }
                    : {})}
                />
                {segmentInsight(segment) ? (
                  <SegmentInsightNote insight={segmentInsight(segment) as StudioRouteInsight} />
                ) : null}
                {isOpen && segment.aiNote ? (
                  <div className="flex items-start gap-2 bg-[var(--bp-color-accent-bg)] px-3 py-[11px] shadow-[inset_0_-1px_0_oklch(0.88_0.07_252)]">
                    <span className="mt-[2px] shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
                      &#9670;
                    </span>
                    <p className="m-0 text-[12px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                      {segment.aiNote}
                    </p>
                  </div>
                ) : null}
                <div className="flex justify-end px-3 py-1.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
                  <button
                    type="button"
                    onClick={() => setSendSeg(segment)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--bp-color-accent)] hover:underline"
                  >
                    Send to brief
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        {visible.length} of {segments.length} segments shown.
        {unmatchedMapInsightCount > 0 ? <span> More notes off-row.</span> : null}
      </div>
      {capture ? <SendToBriefSheet source={capture} onClose={() => setSendSeg(null)} /> : null}
    </section>
  );
}

function WhereWhenSummaryCards({ summary }: { summary: WhereWhenSummary }) {
  return (
    <div className="grid grid-cols-4 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
      <WhereWhenStat label="Speed" value={summary.currentSpeedLabel} sub={summary.peerLabel} />
      <WhereWhenStat
        label="6-mo trend"
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

function SlowSegmentCard({
  route,
  segments,
  segment,
  insight,
  segmentBadge,
  index,
  onSend,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  segment: StudioSegment;
  insight: StudioRouteInsight | null;
  segmentBadge: string | null;
  index: number;
  onSend: () => void;
}) {
  const color =
    segment.speedMph < 5
      ? "var(--bp-color-bad)"
      : segment.speedMph < 6.5
        ? "var(--bp-color-warn)"
        : "var(--bp-color-good)";

  return (
    <article className="flex min-h-[226px] flex-col rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[3px] bg-[var(--bp-color-ink)] font-mono text-[11px] font-bold text-[var(--bp-color-paper)]">
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">
              {segment.from} to {segment.to}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
              {segment.direction} · {segment.miles ? `${segment.miles} mi · ` : ""}
              {segment.timepoints ? `${segment.timepoints} timepoints` : "timepoint segment"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {segmentBadge ? <Badge variant="bad">{segmentBadge}</Badge> : null}
          <Badge variant={segment.flagged ? "bad" : "warn"}>
            {segment.speedMph.toFixed(1)} mph
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_150px] items-center gap-3">
        <div>
          <div className="font-mono text-[24px] font-semibold leading-none" style={{ color }}>
            {segment.riderHours.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[var(--bp-color-ink-55)]">rider-hr lost/day</div>
        </div>
        <CorridorMap route={route} segments={segments} highlightId={segment.id} mode="mini" />
      </div>

      <div className="mt-4">
        <TreatmentBadgeRow
          treatments={legacyToTreatments({
            lane: segment.lane,
            ace: segment.ace,
            tsp: segment.tsp,
          })}
        />
      </div>

      {segment.aiNote ? (
        <p className="m-0 mt-4 flex-1 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          {segment.aiNote}
        </p>
      ) : (
        <p className="m-0 mt-4 flex-1 text-[12px] leading-[1.55] text-[var(--bp-color-ink-55)]">
          No segment note in this release.
        </p>
      )}

      {insight ? <SegmentInsightNote insight={insight} compact /> : null}

      <button
        type="button"
        onClick={onSend}
        className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)] hover:bg-[var(--bp-color-paper-deep)]"
      >
        Send to brief
      </button>
    </article>
  );
}

function SegmentInsightNote({
  insight,
  compact = false,
}: {
  insight: StudioRouteInsight;
  compact?: boolean;
}) {
  const caveats = safeInsightCaveats(insight, 2);
  return (
    <div
      className={
        compact
          ? "mt-3 rounded-[3px] bg-[var(--bp-color-accent-bg)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]"
          : "flex items-start gap-2 bg-[var(--bp-color-accent-bg)] px-3 py-[10px] shadow-[inset_0_-1px_0_oklch(0.88_0.07_252)]"
      }
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
        Note
      </span>
      <span className={compact ? "mt-1 block" : "text-[12px] leading-[1.55]"}>
        {insight.shortText}
        {caveats.length > 0 ? (
          <span className="text-[var(--bp-color-ink-55)]"> {caveats.slice(0, 2).join(" ")}</span>
        ) : null}
      </span>
    </div>
  );
}
