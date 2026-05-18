import type { StudioIntervention } from "@/studio/api-contract";

export function InterventionTimeline({ events }: { events: readonly StudioIntervention[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No documented interventions on this route.
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[10px] h-px bg-[var(--bp-color-ink-20)]" />
      <ol
        className="relative m-0 grid list-none gap-4 p-0"
        style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}
      >
        {events.map((event, i) => (
          <li key={`${event.year}-${i}`} className="flex flex-col items-start">
            <span className="mb-3 h-[20px] w-[20px] rounded-full border-[3px] border-[var(--bp-color-card)] bg-[var(--bp-color-accent)] shadow-[0_0_0_1px_var(--bp-color-rule)]" />
            <div className="font-mono text-[11.5px] font-bold tabular-nums text-[var(--bp-color-ink-55)]">
              {event.year}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-tight">{event.title}</div>
            <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
              {event.detail}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
