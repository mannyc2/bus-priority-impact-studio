import type { ReactNode } from "react";
import type { MetricTone } from "@/studio/metric-model";

/** Tone -> figure color for the metric strips. Presentational, so it lives here
 * rather than in the data-only metric model. */
export const metricToneColor: Record<MetricTone, string> = {
  ink: "var(--bp-color-ink)",
  good: "var(--bp-color-good)",
  bad: "var(--bp-color-bad)",
};

/** Shared typography for the metric figure (mono, tabular). The font *size* is
 * applied per strip so compact route headers can keep stable columns. */
export const metricFigureClass =
  "font-mono font-semibold tabular-nums leading-none tracking-[-0.02em]";

/**
 * Shared presentational frame for route-header metric strips: a responsive
 * 5-column grid with right-border dividers.
 */
export function MetricColumns({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-6 max-xl:grid-cols-3 max-md:grid-cols-2">{children}</div>
  );
}

export function MetricColumn({
  label,
  divider,
  children,
}: {
  label: ReactNode;
  /** Draw the right-edge divider. False for the last column in each row. */
  divider: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        divider
          ? "pr-[18px] shadow-[inset_-1px_0_0_var(--bp-color-rule)] max-xl:nth-3:shadow-none max-md:nth-2:shadow-none"
          : ""
      }
    >
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * The big-number value primitive: a 28px mono figure with an optional small
 * unit and an optional trailing slot.
 */
export function MetricStat({
  value,
  unit,
  color = "var(--bp-color-ink)",
  trailing,
}: {
  value: ReactNode;
  unit?: string | undefined;
  color?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <div className={`${metricFigureClass} text-[28px]`} style={{ color }}>
        {value}
      </div>
      {unit ? (
        <div className="text-[11px] tracking-[0.03em] text-[var(--bp-color-ink-55)]">{unit}</div>
      ) : null}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}
