import type { ReactNode } from "react";
import { bpiColors } from "../design-system/tokens.js";

export function StudioPage({ children, rail }: { children: ReactNode; rail?: ReactNode }) {
  if (rail) {
    return (
      <div className="grid min-h-full grid-cols-[minmax(0,1fr)_320px] gap-6 p-7 max-lg:grid-cols-1 max-sm:p-4">
        <main className="min-w-0">{children}</main>
        <aside className="min-w-0">{rail}</aside>
      </div>
    );
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
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            {label}
          </div>
        ) : null}
        <h1 className="m-0 text-[38px] font-semibold leading-[1.02] tracking-[0] max-sm:text-[30px]">
          {title}
        </h1>
        {body ? (
          <p className="mt-3 max-w-[640px] text-[14px] leading-6 text-[var(--bp-color-ink-70)]">
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
  if (value <= bad) return bpiColors.bad;
  if (value <= warning) return bpiColors.warn;
  return bpiColors.good;
}
