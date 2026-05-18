import type { ReactNode } from "react";

import { Cite } from "@/components/Cite";
import { Skeleton } from "@/components/ui/skeleton";

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
type KpiSize = "md" | "lg";

const toneColor: Record<Tone, string> = {
  neutral: "var(--bp-color-ink)",
  accent: "var(--bp-color-accent)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  bad: "var(--bp-color-bad)",
};

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
          className="font-mono font-semibold tabular-nums tracking-[-0.02em]"
          style={{ color: toneColor[tone], fontSize: sizes.value, lineHeight: 1 }}
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

export function KPISkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-[10px] w-[88px]" />
      <Skeleton className="h-[26px] w-[120px]" />
      <Skeleton className="h-[9px] w-[140px]" />
    </div>
  );
}
