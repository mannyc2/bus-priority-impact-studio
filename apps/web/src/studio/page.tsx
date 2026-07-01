import type { ReactNode } from "react";

export function StudioPage({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  if (flush) {
    return <div className="h-full min-h-0">{children}</div>;
  }
  return <main className="min-h-full p-7 max-sm:p-4">{children}</main>;
}

export function StudioHero({
  label,
  title,
  body,
  action,
}: {
  label?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-8 border-b border-[var(--bp-color-rule)] pb-6 max-md:flex-col max-md:items-start">
      <div className="max-w-[760px]">
        {label ? (
          <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
            {label}
          </div>
        ) : null}
        <h1 className="m-0 text-[44px] font-semibold leading-[1.05] tracking-[-0.025em] max-sm:text-[32px]">
          {title}
        </h1>
        {body ? (
          <p className="mt-3 max-w-[640px] text-[14.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {body}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function StudioPanel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {children}
    </section>
  );
}

export function Rule() {
  return <div className="h-px bg-[var(--bp-color-rule)]" />;
}

export function toneForMetric(value: number, warning: number, bad: number): string {
  if (value <= bad) return "var(--bp-color-bad)";
  if (value <= warning) return "var(--bp-color-warn)";
  return "var(--bp-color-good)";
}
