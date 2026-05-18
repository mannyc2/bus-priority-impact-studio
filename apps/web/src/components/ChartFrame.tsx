import type { ReactNode } from "react";

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
