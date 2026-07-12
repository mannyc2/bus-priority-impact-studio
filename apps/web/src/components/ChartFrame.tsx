import type { ReactNode } from "react";
import { SectionCard } from "@/components/SectionCard";

/** Framed chart container. Titled charts render through SectionCard so their
 * header matches every other section (title 15px, inside the card). Untitled
 * charts keep the bare card surface. */
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
  if (title) {
    return (
      <SectionCard title={title} sub={source} right={right}>
        <div style={{ minHeight: height }}>{children}</div>
      </SectionCard>
    );
  }
  return (
    <div className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div style={{ minHeight: height }}>{children}</div>
    </div>
  );
}
