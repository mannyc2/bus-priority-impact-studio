import type { ReactNode } from "react";
import { RouteBadge } from "@/components/RouteBadge";

/**
 * Composer sub-bar. The persistent studio nav comes from the app shell, so this
 * is just the calm single line carrying the brief title, a DRAFT mark, save
 * status, and slots for tools (undo/redo), status (corpus), and the action
 * cluster (share / preview / send).
 */
export function ComposerTopBar({
  routeLabel,
  routeSbs,
  title,
  savedLabel,
  tools,
  status,
  action,
}: {
  routeLabel: string;
  routeSbs: boolean;
  title: string;
  savedLabel: string;
  tools?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 bg-[var(--bp-color-card)] px-7 py-[13px] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:flex-wrap">
      <RouteBadge route={routeLabel} sbs={routeSbs} size="md" />
      <div className="text-[16.5px] font-semibold tracking-[-0.012em]">{title}</div>
      <span className="rounded-[2px] bg-[var(--bp-color-ink-06)] px-[7px] py-[3px] font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        DRAFT
      </span>
      <span className="font-mono text-[11px] text-[var(--bp-color-ink-40)]">{savedLabel}</span>
      {tools ? (
        <>
          <span className="h-[22px] w-px bg-[var(--bp-color-rule)]" />
          {tools}
        </>
      ) : null}
      <div className="flex-1" />
      {status}
      {action}
    </div>
  );
}
