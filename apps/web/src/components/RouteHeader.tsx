import type { ReactNode } from "react";
import { RouteBadge } from "@/components/RouteBadge";

type RouteHeaderProps = {
  routeLabel: string;
  sbs?: boolean;
  title: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
};

export function RouteHeader({ routeLabel, sbs = false, title, meta, action }: RouteHeaderProps) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 rounded-[3px] bg-[var(--bp-color-card)] p-6 shadow-[0_0_0_1px_var(--bp-color-rule)] max-md:flex-col">
      <div className="flex min-w-0 items-start gap-5">
        <RouteBadge route={routeLabel} sbs={sbs} size="xl" />
        <div className="min-w-0">
          <h1 className="m-0 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
            {title}
          </h1>
          <div className="mt-2 text-[12.5px] text-[var(--bp-color-ink-55)]">{meta}</div>
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function RouteHeaderCompact({
  routeLabel,
  sbs = false,
  title,
  meta,
  right,
}: {
  routeLabel: string;
  sbs?: boolean;
  title: ReactNode;
  meta: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-center justify-between gap-5 rounded-[3px] bg-[var(--bp-color-card)] px-5 py-3 shadow-[0_0_0_1px_var(--bp-color-rule)] max-md:flex-col max-md:items-start">
      <div className="flex min-w-0 items-center gap-4">
        <RouteBadge route={routeLabel} sbs={sbs} size="lg" />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-[var(--bp-color-ink-55)]">{meta}</div>
        </div>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-4">{right}</div> : null}
    </header>
  );
}
