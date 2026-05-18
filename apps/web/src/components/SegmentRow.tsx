import type { CSSProperties } from "react";

import { type Direction, DirIndicator } from "@/components/DirIndicator";
import { HourStrip } from "@/components/HourStrip";
import type { LaneState } from "@/components/LaneGlyph";
import { TreatmentRow } from "@/components/TreatmentRow";
import { Skeleton } from "@/components/ui/skeleton";

export function SegmentRowHeader({ showSched = true }: { showSched?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_84px_92px_168px_132px] gap-[18px] px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <span>Segment</span>
      <span className="text-right">
        MPH
        {showSched ? (
          <span className="font-medium text-[var(--bp-color-ink-40)]"> / sch</span>
        ) : null}
      </span>
      <span className="text-right">RH / day</span>
      <span>Severity by hour</span>
      <span className="text-right">Treatments</span>
    </div>
  );
}

export function SegmentRow({
  dir,
  from,
  to,
  mph,
  sched,
  riderHours,
  hours,
  lane = "none",
  ace = false,
  tsp = false,
  flag,
  hasNote = false,
  noteOpen = false,
  onClick,
}: {
  dir: Direction;
  from: string;
  to: string;
  mph: number;
  sched?: number;
  riderHours: number;
  hours: readonly number[];
  lane?: LaneState;
  ace?: boolean;
  tsp?: boolean;
  flag?: "top";
  hasNote?: boolean;
  noteOpen?: boolean;
  onClick?: () => void;
}) {
  const severityColor =
    mph < 5 ? "var(--bp-color-bad)" : mph < 6 ? "var(--bp-color-warn)" : "var(--bp-color-ink)";
  const className =
    "grid w-full grid-cols-[1fr_84px_92px_168px_132px] items-center gap-[18px] px-3 py-3.5 text-left transition-colors";
  const style: CSSProperties = {
    background: flag === "top" || noteOpen ? "var(--bp-color-accent-bg)" : "transparent",
    boxShadow: noteOpen ? "none" : "inset 0 -1px 0 var(--bp-color-rule)",
    cursor: onClick ? "pointer" : "default",
  };
  const content = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <DirIndicator dir={dir} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-tight">
            {from} <span className="text-[var(--bp-color-ink-40)]">→</span> {to}
          </span>
          {hasNote ? (
            <span
              className={`shrink-0 font-mono text-[9px] font-bold tracking-[0.04em] ${
                noteOpen ? "text-[var(--bp-color-accent)]" : "text-[var(--bp-color-ink-40)]"
              }`}
            >
              ◆
            </span>
          ) : null}
        </div>
        {flag === "top" ? (
          <div className="ml-7 mt-1 text-[10.5px] font-semibold tracking-[0.02em] text-[var(--bp-color-accent)]">
            ↑ Top rider-impact segment
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-px text-right">
        <div
          className="font-mono text-base font-semibold leading-none"
          style={{ color: severityColor }}
        >
          {mph.toFixed(1)}
        </div>
        {sched !== undefined ? (
          <div className="font-mono text-[9.5px] text-[var(--bp-color-ink-55)]">
            vs {sched.toFixed(1)} sch
          </div>
        ) : null}
      </div>
      <div className="text-right font-mono text-[13px] font-medium">
        {riderHours.toLocaleString()}
      </div>
      <HourStrip hours={hours} />
      <TreatmentRow lane={lane} ace={ace} tsp={tsp} />
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export function SegmentRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_84px_92px_168px_132px] items-center gap-[18px] px-3 py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-[12px] w-[28px]" />
        <Skeleton className="h-[14px] w-[260px]" />
      </div>
      <Skeleton className="ml-auto h-[18px] w-[48px]" />
      <Skeleton className="ml-auto h-[14px] w-[64px]" />
      <Skeleton className="h-[14px] w-[168px]" />
      <div className="flex justify-end gap-3">
        <Skeleton className="h-[10px] w-[20px]" />
        <Skeleton className="h-[10px] w-[20px]" />
        <Skeleton className="h-[10px] w-[20px]" />
      </div>
    </div>
  );
}
