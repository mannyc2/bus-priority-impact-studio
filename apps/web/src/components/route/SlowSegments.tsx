import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { type CaptureSource, SendToBriefSheet } from "@/components/brief/SendToBriefSheet.js";
import { CorridorMap } from "@/components/CorridorMap";
import { FilterChips } from "@/components/FilterChips";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";
import { legacyToTreatments } from "@/studio/treatment-model";

export function SlowSegmentsSection({
  route,
  segments,
  flaggedId,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  flaggedId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(flaggedId ?? null);
  const [direction, setDirection] = useState<"all" | "NB" | "SB" | "EB" | "WB">("all");
  const [sendSeg, setSendSeg] = useState<StudioSegment | null>(null);

  const capture: CaptureSource | null = sendSeg && {
    routeSlug: route.slug,
    routeLabel: route.label,
    routeSbs: route.sbs,
    dir: sendSeg.direction,
    from: sendSeg.from,
    to: sendSeg.to,
    mph: sendSeg.speedMph,
  };
  const visible = (
    direction === "all" ? segments : segments.filter((s) => s.direction === direction)
  ).slice(0, 5);
  const featured = visible.slice(0, 3);
  const tableRows = visible.slice(3);

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title="Top slow segments by rider-hours lost"
        sub={`${segments.length} timepoint segments observed in March 2026. Hour strip shows severity by time of day.`}
        right={
          <div className="flex items-center gap-2">
            <Badge variant="accent">Mar 2026</Badge>
            <FilterChips
              ariaLabel="Direction filter"
              value={direction}
              onChange={setDirection}
              options={[
                { id: "all" as const, label: "All directions" },
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
            <SlowSegmentCard
              key={segment.id}
              route={route}
              segments={segments}
              segment={segment}
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
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        Showing {visible.length} of {segments.length} timepoint segments in this direction filter.
      </div>
      {capture ? <SendToBriefSheet source={capture} onClose={() => setSendSeg(null)} /> : null}
    </section>
  );
}

function SlowSegmentCard({
  route,
  segments,
  segment,
  index,
  onSend,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  segment: StudioSegment;
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
        <Badge variant={segment.flagged ? "bad" : "warn"}>{segment.speedMph.toFixed(1)} mph</Badge>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_150px] items-center gap-3">
        <div>
          <div className="font-mono text-[24px] font-semibold leading-none" style={{ color }}>
            {segment.riderHours.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[var(--bp-color-ink-55)]">
            rider-hours lost / day
          </div>
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
          No route-specific note is attached to this segment in the current serving data.
        </p>
      )}

      <button
        type="button"
        onClick={onSend}
        className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)] hover:bg-[var(--bp-color-paper-deep)]"
      >
        Send to brief
        <ArrowRight size={13} />
      </button>
    </article>
  );
}
