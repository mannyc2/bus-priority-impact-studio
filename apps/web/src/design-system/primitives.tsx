import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DirIndicator } from "@/components/DirIndicator";
import { LaneGlyph } from "@/components/LaneGlyph";
import { DotGlyph } from "@/components/DotGlyph";
import { StrengthBars } from "@/components/StrengthBars";
import { Cite } from "@/components/Cite";
import { bpiColors, bpiFonts } from "./tokens.js";

// Re-export shims — consumers still import from primitives.js while the
// migration to flat components/<X>.tsx is in flight. Removed in Phase 6.
export { AiAttribution } from "@/components/AiAttribution";
export { Cite } from "@/components/Cite";
export { CommentBadge } from "@/components/CommentBadge";
export { CommentMarker } from "@/components/CommentMarker";
export { ConfidenceBar } from "@/components/ConfidenceBar";
export { DirIndicator } from "@/components/DirIndicator";
export { DotGlyph } from "@/components/DotGlyph";
export { LaneGlyph } from "@/components/LaneGlyph";
export { ReviewerChip, ReviewerStack } from "@/components/Reviewers";
export { SectionHeader } from "@/components/SectionHeader";
export { StrengthBars } from "@/components/StrengthBars";
export { StudioBar } from "@/components/StudioBar";
export { StudioFooter } from "@/components/StudioFooter";
export { StudioMark } from "@/components/StudioMark";

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

export function Spark({
  data,
  width = 80,
  height = 22,
  color = bpiColors.ink,
  fill = false,
  baseline,
}: {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  baseline?: number;
}) {
  if (data.length === 0) return null;
  const min = Math.min(...data, baseline ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...data, baseline ?? Number.NEGATIVE_INFINITY);
  const range = max - min || 1;
  const dx = width / (data.length - 1 || 1);
  const y = (value: number) => height - 2 - ((value - min) / range) * (height - 4);
  const points = data.map((value, index) => [index * dx, y(value)] as const);
  const path = points
    .map(([x, pointY], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${pointY.toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
      {baseline !== undefined ? (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke={bpiColors.ink20}
          strokeDasharray="2 2"
          strokeWidth="1"
        />
      ) : null}
      {fill ? (
        <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} opacity="0.12" />
      ) : null}
      <path d={path} fill="none" stroke={color} strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

export function HourStrip({
  hours,
  width = 168,
  height = 14,
}: {
  hours: readonly number[];
  width?: number;
  height?: number;
}) {
  const cellWidth = width / 24;
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      {hours.slice(0, 24).map((value, index) => {
        const color =
          value > 0.72
            ? bpiColors.bad
            : value > 0.48
              ? bpiColors.warn
              : value > 0.2
                ? bpiColors.good
                : bpiColors.ink10;
        return (
          <rect
            key={`${index}-${value}`}
            x={index * cellWidth}
            y="0"
            width={Math.max(1, cellWidth - 1)}
            height={height}
            rx="1.5"
            fill={color}
          />
        );
      })}
    </svg>
  );
}

export function BeforeAfter({
  before,
  after,
  max = Math.max(before, after),
}: {
  before: number;
  after: number;
  max?: number;
}) {
  const width = 140;
  const safeMax = max || 1;
  return (
    <div className="flex flex-col gap-[3px]">
      {[
        { label: "before", value: before, color: bpiColors.ink40, weight: 400 },
        {
          label: "after",
          value: after,
          color: after > before ? bpiColors.good : bpiColors.bad,
          weight: 600,
        },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <div className="w-9 text-[10px] text-[var(--bp-color-ink-55)]">{row.label}</div>
          <div
            className="h-2"
            style={{ width: (row.value / safeMax) * width, background: row.color }}
          />
          <div
            className="font-mono text-[11px] text-[var(--bp-color-ink-70)]"
            style={{ fontWeight: row.weight }}
          >
            {row.value.toFixed(1)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MapThumb({
  width = 120,
  height = 80,
  label = "segment map",
  emphasis = bpiColors.accent,
}: {
  width?: number;
  height?: number;
  label?: string;
  emphasis?: string;
}) {
  const stops = [
    [0.1, 0.85],
    [0.3, 0.55],
    [0.75, 0.35],
    [0.92, 0.18],
  ] as const;

  return (
    <div
      className="relative overflow-hidden rounded-[2px] border font-mono text-[9px] text-[var(--bp-color-ink-55)]"
      style={{
        width,
        height,
        background: `repeating-linear-gradient(45deg, ${bpiColors.ink06} 0 6px, transparent 6px 14px), ${bpiColors.paperDeep}`,
        borderColor: bpiColors.rule,
      }}
    >
      <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
        <line x1="0" y1={height * 0.3} x2={width} y2={height * 0.3} stroke={bpiColors.ink20} />
        <line x1="0" y1={height * 0.6} x2={width} y2={height * 0.6} stroke={bpiColors.ink20} />
        <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke={bpiColors.ink20} />
        <line x1={width * 0.7} y1="0" x2={width * 0.7} y2={height} stroke={bpiColors.ink20} />
        <path
          d={`M${width * 0.1},${height * 0.85} L${width * 0.3},${height * 0.55} L${width * 0.75},${height * 0.35} L${width * 0.92},${height * 0.18}`}
          fill="none"
          stroke={emphasis}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        {stops.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x * width}
            cy={y * height}
            r="2.2"
            fill="white"
            stroke={emphasis}
            strokeWidth="1.4"
          />
        ))}
      </svg>
      <div className="absolute bottom-[3px] left-1 font-mono text-[8.5px] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
    </div>
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

export function Timeline({
  events,
}: {
  events: ReadonlyArray<{
    date: string;
    title: string;
    detail?: ReactNode;
    tone?: "good" | "bad" | "accent";
  }>;
}) {
  return (
    <div className="relative pl-4">
      <div className="absolute top-1.5 bottom-1.5 left-1 w-px bg-[var(--bp-color-rule)]" />
      {events.map((event) => (
        <div key={`${event.date}-${event.title}`} className="relative pb-3.5">
          <div
            className="absolute top-[5px] -left-4 size-[9px] rounded-full"
            style={{
              background:
                event.tone === "good"
                  ? bpiColors.good
                  : event.tone === "bad"
                    ? bpiColors.bad
                    : bpiColors.accent,
              boxShadow: `0 0 0 2px ${bpiColors.paper}`,
            }}
          />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
              {event.date}
            </span>
            <span className="text-[12.5px] font-semibold">{event.title}</span>
          </div>
          {event.detail ? (
            <div className="mt-0.5 text-[11.5px] leading-normal text-[var(--bp-color-ink-70)]">
              {event.detail}
            </div>
          ) : null}
        </div>
      ))}
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

export function ChartFrame({
  title,
  source,
  right,
  height = 220,
  children,
}: {
  title?: string;
  source?: string;
  right?: ReactNode;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {title ? (
        <div className="mb-3.5 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-[-0.005em]">{title}</div>
            {source ? (
              <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{source}</div>
            ) : null}
          </div>
          {right}
        </div>
      ) : null}
      <div style={{ minHeight: height }}>{children}</div>
    </div>
  );
}

export function Heatmap({
  rows,
  cols,
  values,
  min,
  max,
  cellW = 36,
  cellH = 22,
  labelGutter = 56,
  colTickEvery = 6,
  valueFormat = (value) => value.toFixed(1),
}: {
  rows: readonly string[];
  cols: readonly string[];
  values: ReadonlyArray<readonly number[]>;
  min?: number;
  max?: number;
  cellW?: number;
  cellH?: number;
  labelGutter?: number;
  colTickEvery?: number;
  valueFormat?: (value: number) => string;
}) {
  const flat = values.flat();
  const lo = min ?? Math.min(...flat);
  const hi = max ?? Math.max(...flat);
  const range = hi - lo || 1;
  const colorAt = (value: number) => {
    const t = Math.max(0, Math.min(1, (value - lo) / range));
    return `oklch(${0.55 + t * 0.35} ${0.16 * (1 - t) + 0.02} ${28 + t * 30})`;
  };

  return (
    <div className="inline-block">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${labelGutter}px repeat(${cols.length}, ${cellW}px)`,
        }}
      >
        <div />
        {cols.map((col, index) => (
          <div
            key={col}
            className="h-4 pb-1 text-center font-mono text-[9.5px] text-[var(--bp-color-ink-55)]"
          >
            {index % colTickEvery === 0 || index === cols.length - 1 ? col : ""}
          </div>
        ))}
        {rows.map((rowLabel, rowIndex) => (
          <>
            <div
              key={`${rowLabel}-label`}
              className="flex items-center text-[10.5px] font-medium text-[var(--bp-color-ink-55)]"
              style={{ height: cellH }}
            >
              {rowLabel}
            </div>
            {cols.map((col, colIndex) => {
              const value = values[rowIndex]?.[colIndex] ?? 0;
              const t = Math.max(0, Math.min(1, (value - lo) / range));
              return (
                <div
                  key={`${rowLabel}-${col}`}
                  className="mb-0.5 mr-0.5 flex items-center justify-center rounded-[2px] font-mono text-[9px] font-medium"
                  style={{
                    background: colorAt(value),
                    color: t < 0.4 ? "white" : bpiColors.ink70,
                    height: cellH,
                    width: cellW - 2,
                  }}
                >
                  {valueFormat(value)}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-[var(--bp-color-ink-55)]">
        <span>slower</span>
        <div className="h-2 w-[120px] rounded-[2px] bg-[linear-gradient(90deg,oklch(0.55_0.16_28),oklch(0.85_0.04_60),oklch(0.9_0.02_58))]" />
        <span>faster</span>
        <span className="ml-3.5 font-mono">
          {valueFormat(lo)} → {valueFormat(hi)}
        </span>
      </div>
    </div>
  );
}

export function HourBars({
  data,
  sched,
  width = 600,
  height = 200,
  min,
  max,
}: {
  data: readonly number[];
  sched?: number;
  width?: number;
  height?: number;
  min?: number;
  max?: number;
}) {
  const lo = min ?? Math.floor(Math.min(...data, sched ?? Number.POSITIVE_INFINITY) - 0.5);
  const hi = max ?? Math.ceil(Math.max(...data, sched ?? Number.NEGATIVE_INFINITY) + 0.5);
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const cw = (width - padL - padR) / 24;
  const y = (value: number) => padT + (1 - (value - lo) / (hi - lo || 1)) * (height - padT - padB);
  const step = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi; value += step) ticks.push(value);

  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      {ticks.map((value) => (
        <g key={value}>
          <line x1={padL} x2={width - padR} y1={y(value)} y2={y(value)} stroke={bpiColors.rule} />
          <text
            x={padL - 6}
            y={y(value) + 3}
            fontSize="10"
            textAnchor="end"
            fill={bpiColors.ink55}
            fontFamily={bpiFonts.mono}
          >
            {value}
          </text>
        </g>
      ))}
      {sched !== undefined ? (
        <>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(sched)}
            y2={y(sched)}
            stroke={bpiColors.accent}
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
          <text
            x={width - padR - 4}
            y={y(sched) - 5}
            fontSize="10"
            textAnchor="end"
            fill={bpiColors.accent}
            fontWeight="600"
          >
            scheduled {sched.toFixed(1)}
          </text>
        </>
      ) : null}
      {data.slice(0, 24).map((value, index) => {
        const top = y(value);
        const bottom = y(lo);
        return (
          <rect
            key={`${index}-${value}`}
            x={padL + index * cw + 1.5}
            width={cw - 3}
            y={top}
            height={bottom - top}
            fill={value < 5 ? bpiColors.bad : value < 6.5 ? bpiColors.warn : bpiColors.ink40}
          />
        );
      })}
      {[0, 6, 12, 18].map((hour) => (
        <text
          key={hour}
          x={padL + hour * cw + cw / 2}
          y={height - padB + 14}
          fontSize="10"
          textAnchor="middle"
          fill={bpiColors.ink55}
          fontFamily={bpiFonts.mono}
        >
          {hour}:00
        </text>
      ))}
    </svg>
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

