import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DirIndicator } from "@/components/DirIndicator";
import { HourStrip } from "@/components/HourStrip";
import { LaneGlyph } from "@/components/LaneGlyph";
import { DotGlyph } from "@/components/DotGlyph";
import { StrengthBars } from "@/components/StrengthBars";
import { Cite } from "@/components/Cite";
import { bpiColors, bpiFonts } from "./tokens.js";

// Re-export shims — consumers still import from primitives.js while the
// migration to flat components/<X>.tsx is in flight. Removed in Phase 6.
export { AiAttribution } from "@/components/AiAttribution";
export { BeforeAfter } from "@/components/BeforeAfter";
export { ChartFrame } from "@/components/ChartFrame";
export { Cite } from "@/components/Cite";
export { CommentBadge } from "@/components/CommentBadge";
export { CommentMarker } from "@/components/CommentMarker";
export { ConfidenceBar } from "@/components/ConfidenceBar";
export { DirIndicator } from "@/components/DirIndicator";
export { DotGlyph } from "@/components/DotGlyph";
export { Heatmap } from "@/components/Heatmap";
export { HourBars } from "@/components/HourBars";
export { HourStrip } from "@/components/HourStrip";
export { LaneGlyph } from "@/components/LaneGlyph";
export { MapThumb } from "@/components/MapThumb";
export { ReviewerChip, ReviewerStack } from "@/components/Reviewers";
export { SectionHeader } from "@/components/SectionHeader";
export { Spark } from "@/components/Spark";
export { StrengthBars } from "@/components/StrengthBars";
export { StudioBar } from "@/components/StudioBar";
export { StudioFooter } from "@/components/StudioFooter";
export { StudioMark } from "@/components/StudioMark";
export { Timeline } from "@/components/Timeline";

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
type Direction = "NB" | "SB" | "EB" | "WB";
type LaneState = "yes" | "partial" | "minimal" | "none";
type KpiSize = "md" | "lg";
type RouteBadgeSize = "sm" | "md" | "lg" | "xl";

const badgeSizes = {
  sm: { h: 18, fs: 10.5, gap: 3, r: 3, w: [24, 32, 40, 50], sbsW: 32 },
  md: { h: 22, fs: 12.5, gap: 4, r: 3, w: [30, 40, 50, 62], sbsW: 40 },
  lg: { h: 28, fs: 15, gap: 5, r: 3, w: [38, 51, 64, 79], sbsW: 51 },
  xl: { h: 36, fs: 19, gap: 6, r: 4, w: [48, 65, 81, 100], sbsW: 65 },
} as const;

function badgeWidth(widths: readonly [number, number, number, number], charCount: number): number {
  if (charCount <= 2) return widths[0];
  if (charCount === 3) return widths[1];
  if (charCount === 4) return widths[2];
  return widths[3];
}

function routeColor(route: string, express: boolean): string {
  if (express) return bpiColors.route.express;
  const prefix = route.match(/^(BxM|BM|QM|Bx|SI|M|B|Q|S|X)/)?.[1] ?? "M";
  if (prefix === "Bx") return bpiColors.route.bronx;
  if (prefix === "B") return bpiColors.route.brooklyn;
  if (prefix === "Q") return bpiColors.route.queens;
  if (prefix === "SI" || prefix === "S") return bpiColors.route.si;
  if (prefix === "X" || prefix === "BM" || prefix === "BxM" || prefix === "QM") {
    return bpiColors.route.express;
  }
  return bpiColors.route.manhattan;
}

export function RouteBadge({
  route,
  size = "md",
  sbs = false,
  express = false,
}: {
  route: string;
  size?: RouteBadgeSize;
  sbs?: boolean;
  express?: boolean;
}) {
  const badge = badgeSizes[size];
  const background = routeColor(route, express);
  const baseStyle: CSSProperties = {
    alignItems: "center",
    borderRadius: badge.r,
    boxSizing: "border-box",
    display: "inline-flex",
    fontFamily: bpiFonts.body,
    fontSize: badge.fs,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    height: badge.h,
    justifyContent: "center",
    letterSpacing: "0.01em",
    lineHeight: 1,
  };

  return (
    <span className="inline-flex items-center align-middle" style={{ gap: badge.gap }}>
      <span
        style={{
          ...baseStyle,
          background,
          color: "white",
          width: badgeWidth(badge.w, route.length),
        }}
      >
        {route}
      </span>
      {sbs ? (
        <span
          style={{
            ...baseStyle,
            background: "white",
            border: `1.5px solid ${background}`,
            color: background,
            letterSpacing: "0.06em",
            width: badge.sbsW,
          }}
        >
          SBS
        </span>
      ) : null}
    </span>
  );
}

export function KPI({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  trend,
  citeN,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  trend?: ReactNode;
  citeN?: number | string;
  size?: KpiSize;
}) {
  const sizes = size === "lg" ? { value: 30, unit: 12, gap: 8 } : { value: 26, unit: 11, gap: 6 };
  const color =
    tone === "bad"
      ? bpiColors.bad
      : tone === "good"
        ? bpiColors.good
        : tone === "warn"
          ? bpiColors.warn
          : bpiColors.ink;
  return (
    <div>
      <div
        className="text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]"
        style={{ marginBottom: sizes.gap }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <div
          className="font-mono font-semibold tracking-[-0.02em]"
          style={{ color, fontSize: sizes.value, lineHeight: 1 }}
        >
          {value}
        </div>
        {unit ? (
          <div
            className="text-[var(--bp-color-ink-55)] tracking-[0.03em]"
            style={{ fontSize: sizes.unit }}
          >
            {unit}
          </div>
        ) : null}
        {citeN ? <Cite n={citeN} /> : null}
        {trend ? <div className="ml-auto">{trend}</div> : null}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div> : null}
    </div>
  );
}

export function TreatmentRow({
  lane = "none",
  ace = false,
  tsp = false,
  align = "flex-end",
}: {
  lane?: LaneState;
  ace?: boolean;
  tsp?: boolean;
  align?: CSSProperties["justifyContent"];
}) {
  return (
    <div className="flex items-start gap-3.5" style={{ justifyContent: align }}>
      <LaneGlyph state={lane} />
      <DotGlyph label="ACE" on={ace} tone="accent" />
      <DotGlyph label="TSP" on={tsp} tone="good" />
    </div>
  );
}

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
  const severity = mph < 5 ? bpiColors.bad : mph < 6 ? bpiColors.warn : bpiColors.ink;
  const className =
    "grid w-full grid-cols-[1fr_84px_92px_168px_132px] items-center gap-[18px] px-3 py-3.5 text-left transition-colors";
  const style: CSSProperties = {
    background: flag === "top" || noteOpen ? bpiColors.accentBg : "transparent",
    boxShadow: noteOpen ? "none" : `inset 0 -1px 0 ${bpiColors.rule}`,
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
              className="shrink-0 font-mono text-[9px] font-bold tracking-[0.04em]"
              style={{ color: noteOpen ? bpiColors.accent : bpiColors.ink40 }}
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
        <div className="font-mono text-base font-semibold leading-none" style={{ color: severity }}>
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

export function Skeleton({
  w = "100%",
  h = 12,
  radius = 3,
  style,
}: {
  w?: CSSProperties["width"];
  h?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  style?: CSSProperties;
}) {
  return (
    <span
      className="bpi-skeleton inline-block"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonText({
  lines = 1,
  w = "100%",
}: {
  lines?: number;
  w?: CSSProperties["width"];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          w={index === lines - 1 && lines > 1 ? "60%" : w}
          h={lines === 1 ? 12 : 10}
        />
      ))}
    </div>
  );
}

export function SkeletonKPI() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton w={88} h={10} />
      <Skeleton w={120} h={26} />
      <Skeleton w={140} h={9} />
    </div>
  );
}

export function SkeletonSegmentRow() {
  return (
    <div className="grid grid-cols-[1fr_84px_92px_168px_132px] items-center gap-[18px] px-3 py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="flex items-center gap-2.5">
        <Skeleton w={28} h={12} />
        <Skeleton w={260} h={14} />
      </div>
      <Skeleton w={48} h={18} style={{ marginLeft: "auto" }} />
      <Skeleton w={64} h={14} style={{ marginLeft: "auto" }} />
      <Skeleton w={168} h={14} />
      <div className="flex justify-end gap-3">
        <Skeleton w={20} h={10} />
        <Skeleton w={20} h={10} />
        <Skeleton w={20} h={10} />
      </div>
    </div>
  );
}

export function ClaimRow({
  n,
  title,
  strength,
  evidence,
  caveats,
  active = false,
  editing = false,
  weak = false,
  reorderable = false,
  density = "comfortable",
  onClick,
}: {
  n: number;
  title: string;
  strength: number;
  evidence?: number;
  caveats?: number;
  active?: boolean;
  editing?: boolean;
  weak?: boolean;
  reorderable?: boolean;
  density?: "compact" | "comfortable";
  onClick?: () => void;
}) {
  const dense = density === "compact";
  const border = editing
    ? `1.5px solid ${bpiColors.accent}`
    : active
      ? `1.5px solid ${bpiColors.ink}`
      : "1px solid transparent";
  const background = editing ? bpiColors.accentBg : active ? bpiColors.card : "transparent";

  const className = "mb-1 flex w-full gap-2 rounded-[3px] text-left transition-colors";
  const style: CSSProperties = {
    background,
    border,
    cursor: onClick ? "pointer" : "default",
    padding: dense ? "8px 10px" : "11px 12px",
  };
  const content = (
    <>
      {reorderable ? (
        <span className="mt-0.5 cursor-grab select-none text-xs leading-none tracking-[-0.1em] text-[var(--bp-color-ink-20)]">
          ⋮⋮
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="shrink-0 font-mono font-bold tracking-[0.02em] text-[var(--bp-color-ink-55)]"
            style={{ fontSize: dense ? 10 : 11 }}
          >
            0{n}
          </span>
          <span
            className="flex-1 text-[13px] leading-snug tracking-[-0.005em]"
            style={{ fontSize: dense ? 12 : 13, fontWeight: active || editing ? 600 : 500 }}
          >
            {title}
          </span>
          {editing ? <Badge variant="accent">EDITING</Badge> : null}
        </div>
        <div
          className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]"
          style={{ fontSize: dense ? 9.5 : 10.5 }}
        >
          <StrengthBars strength={strength} />
          {evidence !== undefined ? <span>{evidence} evidence</span> : null}
          {caveats !== undefined ? (
            <>
              <span className="text-[var(--bp-color-ink-20)]">·</span>
              <span>
                {caveats} caveat{caveats === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
          {weak ? (
            <>
              <span className="text-[var(--bp-color-ink-20)]">·</span>
              <span className="font-bold text-[var(--bp-color-warn)]">weak</span>
            </>
          ) : null}
        </div>
      </div>
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

export function ClaimList({
  claims,
  reorderable = false,
  density = "comfortable",
  onAdd,
  summary,
  onSelect,
}: {
  claims: ReadonlyArray<Parameters<typeof ClaimRow>[0]>;
  reorderable?: boolean;
  density?: "compact" | "comfortable";
  onAdd?: () => void;
  summary?: ReactNode;
  onSelect?: (claim: Parameters<typeof ClaimRow>[0]) => void;
}) {
  return (
    <div>
      {claims.map((claim) => {
        const onClick = onSelect ? () => onSelect(claim) : claim.onClick;
        return (
          <ClaimRow
            key={claim.n}
            {...claim}
            reorderable={reorderable}
            density={density}
            {...(onClick ? { onClick } : {})}
          />
        );
      })}
      {onAdd ? (
        <button
          type="button"
          className="mt-1.5 w-full rounded-[3px] border-[1.5px] border-dashed border-[var(--bp-color-ink-20)] bg-transparent text-left text-[11.5px] font-medium text-[var(--bp-color-ink-55)]"
          style={{ padding: density === "compact" ? "8px 10px" : "10px 12px" }}
          onClick={onAdd}
        >
          + Add claim
        </button>
      ) : null}
      {summary ? (
        <div className="mt-2.5 rounded-[3px] bg-[var(--bp-color-ink-06)] px-3 py-2.5 font-mono text-[11px] leading-normal text-[var(--bp-color-ink-55)]">
          {summary}
        </div>
      ) : null}
    </div>
  );
}

