import type { ReactNode } from "react";

export function AiAttribution({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[3px] bg-[var(--bp-color-accent-bg)] p-3 text-[12.5px] leading-normal text-[var(--bp-color-ink)] shadow-[inset_0_0_0_1px_oklch(0.88_0.07_252)]">
      <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
        ◆
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
