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
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[860px]">
        <div className="relative">
          <div className="absolute left-[7%] right-[7%] top-[31px] h-0.5 bg-[var(--bp-color-rule)]" />
          <ol
            className="relative m-0 grid list-none gap-3 p-0"
            style={{ gridTemplateColumns: `repeat(${events.length}, minmax(140px, 1fr))` }}
          >
            {events.map((event, i) => {
              const colors = toneColors(displayTone(event));
              return (
                <li key={`${event.year}-${i}`} className="flex min-w-0 flex-col">
                  <div
                    className="h-[21px] text-center font-mono text-[11px] font-bold tracking-[0.04em] tabular-nums"
                    style={{ color: colors.fg }}
                  >
                    {event.year}
                  </div>
                  <div className="relative z-[1] flex h-5 justify-center">
                    <span
                      className="size-[13px] rounded-full shadow-[0_0_0_4px_var(--bp-color-paper)]"
                      style={{ background: colors.fg }}
                    />
                  </div>
                  <div
                    className="h-3 w-0.5 self-center"
                    style={{ background: colors.fg, opacity: 0.45 }}
                  />
                  <div
                    className="flex min-h-[142px] flex-1 flex-col gap-1.5 rounded-[3px] bg-[var(--bp-color-card)] px-3 py-3 shadow-[0_0_0_1px_var(--bp-color-rule)]"
                    style={{ borderTop: `2px solid ${colors.fg}` }}
                  >
                    <div className="text-[12.5px] font-semibold leading-tight">{event.title}</div>
                    <div className="text-[11px] leading-[1.5] text-[var(--bp-color-ink-70)]">
                      {event.detail}
                    </div>
                    {event.sourceLabel || event.sourceDetail ? (
                      <div className="mt-auto pt-1 font-mono text-[9.5px] tracking-[0.02em] text-[var(--bp-color-ink-55)]">
                        src · {event.sourceLabel ?? event.sourceDetail}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function toneColors(tone: NonNullable<StudioIntervention["tone"]>) {
  if (tone === "good") return { fg: "var(--bp-color-good)" };
  if (tone === "warn") return { fg: "var(--bp-color-warn)" };
  if (tone === "bad") return { fg: "var(--bp-color-bad)" };
  return { fg: "var(--bp-color-accent)" };
}

function displayTone(event: StudioIntervention): NonNullable<StudioIntervention["tone"]> {
  if (event.tone) return event.tone;
  const text = `${event.title} ${event.detail}`.toLowerCase();
  if (text.includes("pricing") || text.includes("overlap") || text.includes("caveat")) {
    return "warn";
  }
  if (text.includes("concrete") || text.includes("upgrade") || text.includes("redesign")) {
    return "good";
  }
  return "accent";
}
