import type { ReactNode } from "react";

export function AiAttribution({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
      <span className="mt-[3px] shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
        ◆
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
