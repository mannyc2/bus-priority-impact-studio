import type { StudioRoute } from "@/studio/api-contract";

export type InterventionSeries = {
  label: string;
  color: string;
  events: StudioRoute["interventions"];
};

/**
 * Both routes' interventions on a single shared year axis - the overlay form of
 * the side-by-side timelines. Each route is a lane; every event is a dot placed
 * by its year against a common min..max range, so you read at a glance who acted
 * when. Detail is on hover (title); the lane label carries the count.
 */
export function InterventionOverlay({ a, b }: { a: InterventionSeries; b: InterventionSeries }) {
  const years = [...a.events, ...b.events]
    .map((event) => Number.parseInt(event.year, 10))
    .filter((year) => Number.isFinite(year));

  if (years.length === 0) {
    return (
      <p className="m-0 rounded-[3px] bg-[var(--bp-color-card)] p-4 text-[12px] text-[var(--bp-color-ink-55)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        No documented interventions on either route.
      </p>
    );
  }

  const min = Math.min(...years);
  const max = Math.max(...years);
  const span = Math.max(1, max - min);
  const xOf = (year: number) => ((year - min) / span) * 100;

  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="space-y-3">
        <Lane series={a} xOf={xOf} />
        <Lane series={b} xOf={xOf} />
      </div>
      <div className="relative mt-1 h-4 border-t border-[var(--bp-color-rule)]">
        {yearTicks(min, max).map((tick) => (
          <span
            key={tick}
            className="absolute top-1 -translate-x-1/2 font-mono text-[9.5px] text-[var(--bp-color-ink-40)]"
            style={{ left: `calc(120px + (100% - 120px) * ${xOf(tick) / 100})` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

function Lane({ series, xOf }: { series: InterventionSeries; xOf: (year: number) => number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-[108px] shrink-0 items-center gap-2 text-[11.5px]">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: series.color }} />
        <span className="truncate font-semibold">{series.label}</span>
        <span className="font-mono text-[10px] text-[var(--bp-color-ink-40)]">
          {series.events.length}
        </span>
      </span>
      <div className="relative h-8 min-w-0 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--bp-color-rule)]" />
        {series.events.map((event, index) => {
          const year = Number.parseInt(event.year, 10);
          if (!Number.isFinite(year)) return null;
          return (
            <span
              key={`${event.year}-${index}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${xOf(year)}%` }}
              title={`${event.year} — ${event.title}: ${event.detail}`}
            >
              <span
                className="block size-2.5 rounded-full ring-2 ring-[var(--bp-color-card)]"
                style={{ background: series.color }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function yearTicks(min: number, max: number): number[] {
  if (max === min) return [min];
  const span = max - min;
  const step = span <= 6 ? 1 : span <= 12 ? 2 : Math.ceil(span / 6);
  const ticks: number[] = [];
  for (let year = min; year <= max; year += step) ticks.push(year);
  if (ticks.at(-1) !== max) ticks.push(max);
  return ticks;
}
