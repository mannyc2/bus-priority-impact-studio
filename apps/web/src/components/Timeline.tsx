import type { ReactNode } from "react";

type TimelineEvent = {
  date: string;
  title: string;
  detail?: ReactNode;
  tone?: "good" | "bad" | "accent";
};

const toneVar = {
  good: "var(--bp-color-good)",
  bad: "var(--bp-color-bad)",
  accent: "var(--bp-color-accent)",
} as const;

export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  return (
    <div className="relative pl-4">
      <div className="absolute top-1.5 bottom-1.5 left-1 w-px bg-[var(--bp-color-rule)]" />
      {events.map((event) => (
        <div key={`${event.date}-${event.title}`} className="relative pb-3.5">
          <div
            className="absolute top-[5px] -left-4 size-[9px] rounded-full"
            style={{
              background: toneVar[event.tone ?? "accent"],
              boxShadow: "0 0 0 2px var(--bp-color-paper)",
            }}
          />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
              {event.date}
            </span>
            <span className="text-[12.5px] font-semibold">{event.title}</span>
          </div>
          {event.detail ? (
            <div className="mt-0.5 text-[11.5px] leading-normal text-[var(--bp-color-ink-70)]">
              {event.detail}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
