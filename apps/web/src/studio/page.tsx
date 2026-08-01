import type { ReactNode } from "react";

export function StudioPage({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  if (flush) {
    return <div className="h-full min-h-0">{children}</div>;
  }
  return <main className="min-h-full p-7 max-sm:p-4">{children}</main>;
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
