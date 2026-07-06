import { StudioMark } from "@/components/StudioMark";

function StudioBar({
  active,
  breadcrumb,
  updated,
}: {
  active?: "Routes" | "Map" | "Interventions" | "Methods";
  breadcrumb?: string;
  updated?: string;
}) {
  return (
    <header className="flex items-center gap-8 bg-[var(--bp-color-card)] px-7 py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="flex items-center gap-2.5">
        <StudioMark size={22} />
        <div className="text-sm font-semibold tracking-[-0.01em]">
          Bus Priority{" "}
          <span className="font-normal text-[var(--bp-color-ink-55)]">Impact Studio</span>
        </div>
      </div>
      <nav className="flex gap-[22px] text-[13px]" aria-label="Primary">
        {(["Routes", "Map", "Interventions", "Methods"] as const).map((item) => {
          const isActive = item === active;
          return (
            <span
              key={item}
              className={`cursor-pointer pb-0.5 ${
                isActive
                  ? "font-semibold text-[var(--bp-color-ink)] shadow-[inset_0_-2px_0_var(--bp-color-ink)]"
                  : "font-normal text-[var(--bp-color-ink-55)]"
              }`}
            >
              {item}
            </span>
          );
        })}
      </nav>
      <div className="flex-1" />
      {breadcrumb ? (
        <div className="font-mono text-xs text-[var(--bp-color-ink-55)]">{breadcrumb}</div>
      ) : null}
      {updated ? (
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
          <span className="size-1.5 rounded-full bg-[var(--bp-color-good)]" />
          data current to {updated}
        </div>
      ) : null}
    </header>
  );
}

export function StudioBarDemo() {
  return (
    <div className="overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <StudioBar active="Routes" breadcrumb="system / primitives" />
      <div className="flex items-start justify-between gap-4 bg-[var(--bp-color-paper)] p-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <StudioMark size={32} />
            <span className="font-mono text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
              Design system v0.1
            </span>
          </div>
          <h2 className="m-0 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            Bus Priority Impact Studio
          </h2>
          <p className="mt-2 max-w-[620px] text-[13px] leading-normal text-[var(--bp-color-ink-70)]">
            A warm-paper civic interface for route evidence, hotspot ranking, intervention
            timelines, and methodology.
          </p>
        </div>
      </div>
    </div>
  );
}
