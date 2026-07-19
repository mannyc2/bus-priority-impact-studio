import type { ReactNode } from "react";

/** The single approved section container: title INSIDE the card it titles.
 * Title 15px/semibold, sub 11.5px muted — every route/home/interventions
 * section converges on this (design doctrine 2026-07-06). */
export function SectionCard({
  title,
  sub,
  right,
  children,
  bodyClassName,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-3.5 flex items-end justify-between gap-4 max-md:flex-col max-md:items-stretch">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold leading-tight tracking-[-0.005em]">
            {title}
          </h2>
          {sub ? (
            <div className="mt-[3px] text-[11.5px] leading-normal text-[var(--bp-color-ink-55)]">
              {sub}
            </div>
          ) : null}
        </div>
        {right ? <div className="shrink-0 max-md:w-full">{right}</div> : null}
      </div>
      <div className={bodyClassName ?? "min-w-0"}>{children}</div>
    </section>
  );
}
