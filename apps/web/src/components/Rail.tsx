import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Edge = "left" | "right";

export function Rail({
  children,
  edge,
  className,
}: {
  children: ReactNode;
  edge: Edge;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex min-w-0 flex-col overflow-auto bg-[var(--bp-color-paper)]",
        edge === "left"
          ? "shadow-[inset_-1px_0_0_var(--bp-color-rule)]"
          : "shadow-[inset_1px_0_0_var(--bp-color-rule)]",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function RailSection({ eyebrow, children }: { eyebrow?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {eyebrow ? (
        <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
          {eyebrow}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function RailRule() {
  return <div className="h-px bg-[var(--bp-color-rule)]" />;
}
