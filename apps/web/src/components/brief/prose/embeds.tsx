import { Fragment, type ReactNode } from "react";
import { BeforeAfter } from "@/components/BeforeAfter";
import { DirIndicator } from "@/components/DirIndicator";
import { HourBars } from "@/components/HourBars";
import { HourOverlay } from "@/components/HourOverlay";
import type { LaneState } from "@/components/LaneGlyph";
import { RouteBadge } from "@/components/RouteBadge";
import { Spark } from "@/components/Spark";
import { TreatmentRow } from "@/components/TreatmentRow";
import { useBriefBlock } from "./BriefBlocksContext.js";
import { attrStr, type DirectiveProps } from "./shared.js";

/**
 * The embedded (block-level) brief primitives. Each is mapped from a
 * `:::name{ref=…}` container directive; `ref` (a block id, surfaced as `blockref`
 * by the remark transform) resolves to its typed `StudioBriefBlock` via
 * {@link useBriefBlock}, and the figure renders from that — markdown carries only
 * the reference. A missing or type-mismatched ref degrades to an inert
 * placeholder, the same contract the draft validator enforces server-side.
 */

const BLOCK_TONE: Record<string, string> = {
  neutral: "var(--bp-color-ink)",
  accent: "var(--bp-color-accent)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  bad: "var(--bp-color-bad)",
};

function blockTone(tone: string | undefined): string {
  return (tone && BLOCK_TONE[tone]) || "var(--bp-color-accent)";
}

function speedColor(mph: number | null | undefined): string {
  if (mph === null || mph === undefined || !Number.isFinite(mph)) return "var(--bp-color-ink)";
  return mph < 5 ? "var(--bp-color-bad)" : mph < 6.5 ? "var(--bp-color-warn)" : "var(--bp-color-ink)";
}

function laneState(value: string | undefined): LaneState {
  if (value === "painted") return "partial";
  return value === "yes" || value === "partial" || value === "minimal" ? value : "none";
}

/** Shared figure shell — matches the composer's `EvidenceFigure` framing so embeds
 * sit consistently in the prose. */
function EmbedFrame({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <figure className="relative mx-0 my-[1.15em] overflow-hidden rounded-[6px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <figcaption className="flex items-center gap-2 px-4 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        <span style={{ color: blockTone(tone) }}>◆</span>
        {label}
      </figcaption>
      <div className="px-4 pb-4 pt-2.5 text-[14px] leading-[1.5] text-[var(--bp-color-ink-70)]">
        {children}
      </div>
    </figure>
  );
}

/** Rendered when a `ref` resolves to no block or the wrong block type. */
function EmbedMissing({ name, blockRef }: { name: string; blockRef: string | undefined }) {
  return (
    <div className="mx-0 my-[1.15em] rounded-[5px] border border-dashed border-[var(--bp-color-rule)] px-3 py-2 font-mono text-[11px] text-[var(--bp-color-ink-40)]">
      unresolved {name}
      {blockRef ? ` · ${blockRef}` : ""}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="leading-none">
      <div className="mb-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.07em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div
        className="font-mono text-[16px] font-semibold tabular-nums"
        style={{ color: color ?? "var(--bp-color-ink)" }}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-[9.5px] font-medium text-[var(--bp-color-ink-55)]">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

export function EmbedSegmentCard(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "segment-card");
  if (block === null) return <EmbedMissing name="segment-card" blockRef={ref} />;
  const metrics = block.metrics;
  const treatments = block.treatments;
  return (
    <EmbedFrame label="Segment">
      <div className="flex flex-wrap items-center gap-2">
        <RouteBadge route={block.routeLabel} sbs={block.routeId.includes("+")} size="sm" />
        <DirIndicator dir={block.direction} />
        <span className="font-semibold text-[var(--bp-color-ink)]">{block.title}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
        {block.from} → {block.to}
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-x-5 gap-y-2">
        {metrics.avgSpeedMph !== null && metrics.avgSpeedMph !== undefined ? (
          <Stat
            label="avg"
            value={metrics.avgSpeedMph.toFixed(1)}
            unit="mph"
            color={speedColor(metrics.avgSpeedMph)}
          />
        ) : null}
        {metrics.scheduledSpeedMph !== null && metrics.scheduledSpeedMph !== undefined ? (
          <Stat label="sched" value={metrics.scheduledSpeedMph.toFixed(1)} unit="mph" />
        ) : null}
        {metrics.riderHoursLostDaily !== null && metrics.riderHoursLostDaily !== undefined ? (
          <Stat
            label="rider-hrs/day"
            value={Math.round(metrics.riderHoursLostDaily).toLocaleString()}
            unit="lost"
            color="var(--bp-color-bad)"
          />
        ) : null}
        {block.spark && block.spark.length > 0 ? (
          <Spark data={block.spark} width={72} height={24} color="var(--bp-color-bad)" />
        ) : null}
      </div>
      {treatments ? (
        <div className="mt-3 border-t border-[var(--bp-color-rule)] pt-2.5">
          <TreatmentRow
            lane={laneState(treatments.busLane)}
            ace={treatments.ace ?? false}
            tsp={treatments.tsp ?? false}
            align="flex-start"
          />
        </div>
      ) : null}
      {block.note ? (
        <p className="mt-2 text-[12.5px] text-[var(--bp-color-ink-55)]">{block.note}</p>
      ) : null}
    </EmbedFrame>
  );
}

export function EmbedBeforeAfter(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "before-after");
  if (block === null) return <EmbedMissing name="before-after" blockRef={ref} />;
  const improved = block.delta > 0;
  return (
    <EmbedFrame label="Before / After">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--bp-color-ink)]">{block.intervention}</div>
          <div className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">{block.when}</div>
        </div>
        <div
          className="font-mono text-[15px] font-semibold tabular-nums"
          style={{ color: improved ? "var(--bp-color-good)" : "var(--bp-color-bad)" }}
        >
          {improved ? "+" : ""}
          {block.delta}
          <span className="ml-0.5 text-[10px] text-[var(--bp-color-ink-55)]">{block.unit}</span>
        </div>
      </div>
      <div className="mt-2.5">
        <BeforeAfter before={block.before} after={block.after} />
      </div>
      {block.caveat ? (
        <p className="mt-2 text-[12px] text-[var(--bp-color-ink-55)]">{block.caveat}</p>
      ) : null}
    </EmbedFrame>
  );
}

export function EmbedProjection(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "projection");
  if (block === null) return <EmbedMissing name="projection" blockRef={ref} />;
  return (
    <EmbedFrame label="Projection">
      <div className="font-semibold text-[var(--bp-color-ink)]">{block.title}</div>
      {block.sub ? (
        <div className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">{block.sub}</div>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {block.scenarios.map((scenario, index) => (
          <div
            key={`${scenario.label}-${index}`}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="text-[13px] text-[var(--bp-color-ink-70)]">{scenario.label}</span>
            <span
              className="font-mono text-[15px] font-semibold tabular-nums"
              style={{ color: blockTone(scenario.tone) }}
            >
              {scenario.value}
              <span className="ml-0.5 text-[10px] font-medium text-[var(--bp-color-ink-55)]">
                {block.unit}
              </span>
            </span>
          </div>
        ))}
      </div>
      {block.target !== null && block.target !== undefined ? (
        <div className="mt-2 flex items-baseline justify-between border-t border-[var(--bp-color-rule)] pt-2 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
          <span>target</span>
          <span className="tabular-nums">
            {block.target} {block.unit}
          </span>
        </div>
      ) : null}
    </EmbedFrame>
  );
}

export function EmbedDataLineage(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "data-lineage");
  if (block === null) return <EmbedMissing name="data-lineage" blockRef={ref} />;
  return (
    <EmbedFrame label="Data lineage">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="rounded bg-[var(--bp-color-accent-bg)] px-1.5 py-0.5 text-[var(--bp-color-accent)]">
          {block.source}
        </span>
        {block.steps.map((step, index) => (
          <Fragment key={`${step}-${index}`}>
            <span className="text-[var(--bp-color-ink-40)]">→</span>
            <span className="rounded bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 text-[var(--bp-color-ink-70)]">
              {step}
            </span>
          </Fragment>
        ))}
        <span className="text-[var(--bp-color-ink-40)]">→</span>
        <span className="rounded bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 font-semibold text-[var(--bp-color-ink)]">
          {block.metric}
        </span>
      </div>
      {block.retrievedAt || (block.rowCount !== null && block.rowCount !== undefined) ? (
        <div className="mt-2 font-mono text-[10px] text-[var(--bp-color-ink-40)]">
          {block.retrievedAt ? `retrieved ${block.retrievedAt}` : null}
          {block.retrievedAt && block.rowCount !== null && block.rowCount !== undefined ? " · " : null}
          {block.rowCount !== null && block.rowCount !== undefined
            ? `${block.rowCount.toLocaleString()} rows`
            : null}
        </div>
      ) : null}
    </EmbedFrame>
  );
}

export function EmbedFinding(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "finding");
  if (block === null) return <EmbedMissing name="finding" blockRef={ref} />;
  const confTone =
    block.confidence === "high" ? "good" : block.confidence === "moderate" ? "warn" : "neutral";
  return (
    <EmbedFrame label="Finding" tone={confTone}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
          style={{
            color: blockTone(confTone),
            background: `color-mix(in oklch, ${blockTone(confTone)} 12%, transparent)`,
          }}
        >
          {block.confidence} confidence
        </span>
        {block.route ? (
          <RouteBadge route={block.route} sbs={block.sbs ?? false} size="sm" />
        ) : null}
      </div>
      <div className="mt-2 font-semibold text-[var(--bp-color-ink)]">{block.title}</div>
      <p className="mt-1 text-[13.5px] leading-[1.55]">{block.claim}</p>
      {block.supports.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {block.supports.map((support, index) => (
            <li key={`${support}-${index}`} className="flex gap-2 text-[13px]">
              <span className="text-[var(--bp-color-accent)]">◆</span>
              <span>{support}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </EmbedFrame>
  );
}

export function EmbedKeyTakeaways(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "key-takeaways");
  if (block === null) return <EmbedMissing name="key-takeaways" blockRef={ref} />;
  return (
    <EmbedFrame label={block.title ?? "Key takeaways"}>
      <ul className="space-y-2">
        {block.items.map((item, index) => (
          <li
            key={`${index}-${item.text.slice(0, 12)}`}
            className="flex gap-2.5 text-[14px] text-[var(--bp-color-ink-70)]"
          >
            <span className="mt-px font-mono text-[11px] font-bold tabular-nums text-[var(--bp-color-accent)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </EmbedFrame>
  );
}

export function EmbedMentionedRoutes(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "mentioned-routes");
  if (block === null) return <EmbedMissing name="mentioned-routes" blockRef={ref} />;
  return (
    <EmbedFrame label="Mentioned routes">
      <ul className="space-y-2">
        {block.routes.map((route, index) => (
          <li key={`${route.routeId}-${index}`} className="flex items-start gap-2.5">
            <RouteBadge route={route.label} sbs={route.sbs ?? false} size="sm" />
            {route.summary ? (
              <span className="text-[13px] leading-[1.5] text-[var(--bp-color-ink-70)]">
                {route.summary}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </EmbedFrame>
  );
}

export function EmbedRichSubBrief(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "rich-sub-brief");
  if (block === null) return <EmbedMissing name="rich-sub-brief" blockRef={ref} />;
  return (
    <EmbedFrame label="Sub-brief">
      <div className="font-semibold text-[var(--bp-color-ink)]">{block.title}</div>
      {block.sub ? (
        <div className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">{block.sub}</div>
      ) : null}
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {block.columns.map((column, index) => (
          <div key={`${column.title}-${index}`}>
            <div className="text-[13px] font-semibold text-[var(--bp-color-ink)]">
              {column.title}
            </div>
            <div className="mt-1 space-y-1.5">
              {column.bodyMd
                .split(/\n\n+/)
                .filter((paragraph) => paragraph.trim().length > 0)
                .map((paragraph, paragraphIndex) => (
                  <p
                    key={paragraphIndex}
                    className="text-[13px] leading-[1.6] text-[var(--bp-color-ink-70)]"
                  >
                    {paragraph}
                  </p>
                ))}
            </div>
          </div>
        ))}
      </div>
    </EmbedFrame>
  );
}

export function EmbedHourFigure(props: DirectiveProps) {
  const ref = attrStr(props.blockref);
  const block = useBriefBlock(ref, "hour-figure");
  if (block === null) return <EmbedMissing name="hour-figure" blockRef={ref} />;
  const height = block.height ?? 200;
  return (
    <EmbedFrame label="Hour figure">
      <div className="overflow-x-auto">
        {block.sched && block.sched.length > 0 ? (
          <HourOverlay
            a={{ label: "observed", color: "var(--bp-color-bad)", hours: block.data }}
            b={{ label: "scheduled", color: "var(--bp-color-accent)", hours: block.sched }}
            height={height}
          />
        ) : (
          <HourBars data={block.data} height={height} />
        )}
      </div>
      <div className="mt-1.5 text-[12px] leading-[1.5] text-[var(--bp-color-ink-55)]">
        {block.caption}
      </div>
    </EmbedFrame>
  );
}
