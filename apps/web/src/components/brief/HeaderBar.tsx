import type { ReactNode } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { Badge } from "@/components/ui/badge";

type ChipTone = "neutral" | "accent" | "good" | "warn" | "bad";

export function BriefHeaderBar({
  routeLabel,
  routeSbs,
  title,
  status,
  statusTone = "neutral",
  version,
  hint,
  children,
}: {
  routeLabel: string;
  routeSbs: boolean;
  title: string;
  status: string;
  statusTone?: ChipTone;
  version?: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--bp-color-rule)] pb-4 max-md:flex-col max-md:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <RouteBadge route={routeLabel} sbs={routeSbs} size="md" />
        <span className="truncate text-[15px] font-semibold leading-tight">{title}</span>
        <Badge variant={statusTone}>{status}</Badge>
        {version ? (
          <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
            {version}
          </span>
        ) : null}
        {hint ? (
          <span className="text-[11.5px] text-[var(--bp-color-ink-55)] max-md:hidden">{hint}</span>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
}
