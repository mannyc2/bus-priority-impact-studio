import { lazy, Suspense } from "react";
import { ChartFallback } from "@/components/ChartFallback";
import { ChartFrame } from "@/components/ChartFrame";
import { KPI } from "@/components/KPI";
import type { CorridorPoint } from "./corridor.chart";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const CorridorTrendChart = lazy(() =>
  import("./corridor.chart.js").then((module) => ({ default: module.CorridorTrendChart })),
);

// Illustrative fixture for the M86 SBS (86th St crosstown) corridor. The events and the
// +7% ridership outcome are modeled on real Tier 2 records extracted from NYC DOT 86th St
// documents; the quarterly speed series is a stand-in until the corridor metric is wired
// to the pipeline. Swap these for real API/Tier 2 data once the event payload is frozen.
const speed: readonly CorridorPoint[] = [
  { t: "'14 Q1", speed: 4.5 },
  { t: "'14 Q2", speed: 4.6 },
  { t: "'14 Q3", speed: 4.4 },
  { t: "'14 Q4", speed: 4.5 },
  { t: "'15 Q1", speed: 4.6 },
  { t: "'15 Q2", speed: 4.5 },
  { t: "'15 Q3", speed: 5.0 },
  { t: "'15 Q4", speed: 5.5 },
  { t: "'16 Q1", speed: 5.6 },
  { t: "'16 Q2", speed: 5.7 },
  { t: "'16 Q3", speed: 5.5 },
  { t: "'16 Q4", speed: 5.7 },
];

type EventFamily = "community_outreach" | "street_design" | "service_launch" | "performance";

const familyMeta: Record<EventFamily, { label: string; color: string }> = {
  community_outreach: { label: "Community outreach", color: "var(--bp-color-accent)" },
  street_design: { label: "Street design", color: "var(--bp-color-ink-40)" },
  service_launch: { label: "Service launch", color: "var(--bp-color-good)" },
  performance: { label: "Performance", color: "var(--bp-color-warn)" },
};

const events: ReadonlyArray<{
  date: string;
  title: string;
  family: EventFamily;
  source: string;
}> = [
  {
    date: "Oct 2014",
    title: "CB8 corridor presentation",
    family: "community_outreach",
    source: "86th St CB8 slides",
  },
  {
    date: "Feb 2015",
    title: "CB7 transportation committee",
    family: "community_outreach",
    source: "86th St CB7 slides",
  },
  {
    date: "Spr 2015",
    title: "Off-board fare + curb redesign",
    family: "street_design",
    source: "86th St design boards",
  },
  {
    date: "Jul 2015",
    title: "M86 SBS service launch",
    family: "service_launch",
    source: "MTA service notice",
  },
  {
    date: "Jun 2016",
    title: "Ridership +7% (first 11 mo)",
    family: "performance",
    source: "DOT SBS progress report",
  },
];

function SourceChip({ children }: { children: string }) {
  return (
    <span className="inline-flex w-fit rounded-[3px] bg-[var(--bp-color-paper-deep)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--bp-color-ink-55)]">
      {children}
    </span>
  );
}

export function CorridorDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-[3px] bg-[var(--bp-color-ink)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--bp-color-paper)]">
              M86 SBS
            </span>
            <h3 className="m-0 text-[19px] font-semibold tracking-[-0.01em]">
              86th Street Select Bus Service
            </h3>
          </div>
          <p className="mt-1 text-[12.5px] text-[var(--bp-color-ink-70)]">
            Crosstown · Manhattan · service active since 2015
          </p>
        </div>
        <span className="rounded-[3px] bg-[var(--bp-color-paper-deep)] px-2 py-1 font-mono text-[10px] text-[var(--bp-color-ink-55)]">
          illustrative · fixture data
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <KPI
          label="Ridership · first 11 mo"
          value="+7%"
          tone="good"
          sub="vs. prior M86 local"
          citeN={1}
        />
        <KPI
          label="Bus speed · SBS program"
          value="15–23%"
          unit="faster"
          tone="good"
          sub="NYC DOT SBS summary"
          citeN={2}
        />
        <KPI label="Cited records" value="12" sub="across 4 DOT documents" />
      </div>

      <div className="mt-5">
        <ChartFrame title="Corridor bus speed" source="Illustrative weekday AM trend · mph">
          <Suspense fallback={<ChartFallback height={248} />}>
            <CorridorTrendChart data={speed} launchAt="'15 Q3" baseline={4.5} />
          </Suspense>
        </ChartFrame>
      </div>

      <div className="mt-5">
        <div className="mb-3 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
          Project timeline
        </div>
        <div className="relative">
          <div className="absolute inset-x-0 top-[5px] h-px bg-[var(--bp-color-rule)]" />
          <ol className="relative grid grid-cols-5 gap-3 max-md:grid-cols-2">
            {events.map((event) => {
              const meta = familyMeta[event.family];
              return (
                <li key={event.title} className="flex flex-col gap-1.5">
                  <span
                    className="size-[11px] rounded-full border-2 border-[var(--bp-color-card)]"
                    style={{ background: meta.color }}
                  />
                  <div className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                    {event.date}
                  </div>
                  <div className="text-[12.5px] font-semibold leading-snug">{event.title}</div>
                  <div className="text-[11px] font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </div>
                  <SourceChip>{event.source}</SourceChip>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className="mt-5 border-t border-[var(--bp-color-rule)] pt-3 text-[11px] leading-[1.5] text-[var(--bp-color-ink-55)]">
        Every event and outcome above carries a source document and authority tag in Tier 2.
        Speed series is a placeholder; events + the +7% ridership outcome are modeled on real
        extracted M86 records.
      </p>
    </div>
  );
}
