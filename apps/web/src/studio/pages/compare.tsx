import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { HourOverlay } from "@/components/HourOverlay";
import { RouteBadge } from "@/components/RouteBadge";
import { Badge } from "@/components/ui/badge";
import type { StudioCompareResponse, StudioRoute } from "../api-contract.js";
import { StudioPage, StudioPanel } from "../page.js";
import { NotFoundPage } from "./not-found.js";

export function ComparePage({ data }: { data: StudioCompareResponse | null }) {
  const navigate = useNavigate();
  if (data === null) return <NotFoundPage />;
  const [a, b] = data.routes;

  function swap() {
    navigate({ to: "/compare", search: { a: b.slug, b: a.slug } });
  }

  return (
    <StudioPage>
      <div className="mb-6 grid grid-cols-[1fr_56px_1fr] items-stretch gap-4 max-md:grid-cols-1">
        <RouteSide route={a} />
        <button
          type="button"
          onClick={swap}
          className="flex items-center justify-center self-center justify-self-center rounded-full bg-[var(--bp-color-card)] p-2 shadow-[0_0_0_1px_var(--bp-color-rule)] max-md:hidden"
          aria-label="Swap routes"
        >
          <ArrowLeftRight size={16} />
        </button>
        <RouteSide route={b} />
      </div>
      <KpiStripCompare a={a} b={b} />
      <section className="mt-6 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="mb-3">
          <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">Speed by hour</h2>
          <p className="mt-1 max-w-[680px] text-[12px] leading-normal text-[var(--bp-color-ink-70)]">
            Both routes on the same chart. Shaded area is the per-hour gap between them - that gap,
            summed across hours and weighted by riders, becomes the rider-hour delta in the KPI
            strip above.
          </p>
        </div>
        <div className="overflow-x-auto">
          <HourOverlay
            a={{
              label: `${a.label}${a.sbs ? " SBS" : ""}`,
              color: "var(--bp-color-bad)",
              hours: synth24(a.spark),
            }}
            b={{
              label: `${b.label}${b.sbs ? " SBS" : ""}`,
              color: "var(--bp-color-good)",
              hours: synth24(b.spark),
            }}
          />
        </div>
      </section>
      <section className="mt-6">
        <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">Bus-lane coverage</h2>
        <p className="mt-1 max-w-[680px] text-[12px] leading-normal text-[var(--bp-color-ink-70)]">
          Proportion of route mileage with dedicated bus-lane treatment (painted or concrete).
        </p>
        <div className="mt-3 space-y-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <CoverageBar route={a} />
          <CoverageBar route={b} />
        </div>
      </section>
      <section className="mt-6">
        <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">Interventions in place</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <StudioPanel>
            <div className="mb-3 flex items-center gap-2 text-[12.5px]">
              <RouteBadge route={a.label} sbs={a.sbs} size="sm" />
              <span className="font-semibold">{a.interventions.length} interventions</span>
            </div>
            <InterventionTimelineVertical events={a.interventions} />
          </StudioPanel>
          <StudioPanel>
            <div className="mb-3 flex items-center gap-2 text-[12.5px]">
              <RouteBadge route={b.label} sbs={b.sbs} size="sm" />
              <span className="font-semibold">{b.interventions.length} interventions</span>
            </div>
            <InterventionTimelineVertical events={b.interventions} />
          </StudioPanel>
        </div>
      </section>
      <section className="mt-6 rounded-[3px] bg-[var(--bp-color-ink)] p-6 text-[var(--bp-color-paper)]">
        <div className="flex items-start gap-4 max-md:flex-col">
          <span className="font-mono text-[24px] font-semibold leading-none opacity-60">=</span>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">
              Where {a.label}
              {a.sbs ? " SBS" : ""} needs to be is where {b.label}
              {b.sbs ? " SBS" : ""} already is.
            </h3>
            <p className="mt-2 max-w-[640px] text-[13px] leading-[1.55] opacity-80">
              {b.label}
              {b.sbs ? " SBS" : ""} carries {b.dailyRiders > a.dailyRiders ? "more" : "comparable"}{" "}
              riders, runs {Math.abs(b.weightedAvgSpeed - a.weightedAvgSpeed).toFixed(2)} mph
              faster, loses{" "}
              {Math.round(((a.riderHoursLost - b.riderHoursLost) / a.riderHoursLost) * 100)}% fewer
              rider-hours per day, and has {b.laneCoverage - a.laneCoverage} points more lane
              coverage.
            </p>
          </div>
          <Link
            to="/briefs/new"
            search={{ route: a.slug }}
            viewTransition
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-paper)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-ink)] no-underline"
          >
            Start a brief from this
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </StudioPage>
  );
}

function RouteSide({ route }: { route: StudioRoute }) {
  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: route.slug }}
      viewTransition
      className="block rounded-[3px] bg-[var(--bp-color-card)] p-4 text-[var(--bp-color-ink)] no-underline shadow-[0_0_0_1px_var(--bp-color-rule)]"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
        <Badge variant={route.speedMph < 5 ? "bad" : route.speedMph < 6.5 ? "warn" : "good"}>
          {route.speedMph.toFixed(1)} mph
        </Badge>
      </div>
      <div className="text-[13.5px] font-semibold">{route.corridorFull}</div>
      <div className="mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">
        {route.borough} &middot; {route.miles} mi
      </div>
    </Link>
  );
}

function KpiStripCompare({ a, b }: { a: StudioRoute; b: StudioRoute }) {
  return (
    <section className="grid grid-cols-5 gap-[1px] overflow-hidden rounded-[3px] bg-[var(--bp-color-rule)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-3 max-md:grid-cols-2">
      <DeltaCell
        label="Weighted speed"
        unit="mph"
        aValue={a.weightedAvgSpeed.toFixed(2)}
        bValue={b.weightedAvgSpeed.toFixed(2)}
        delta={(b.weightedAvgSpeed - a.weightedAvgSpeed).toFixed(2)}
        higherIsBetter
      />
      <DeltaCell
        label="Daily riders"
        aValue={fmtK(a.dailyRiders)}
        bValue={fmtK(b.dailyRiders)}
        delta={fmtK(b.dailyRiders - a.dailyRiders)}
        higherIsBetter
      />
      <DeltaCell
        label="Rider-hours lost"
        aValue={a.riderHoursLost.toLocaleString()}
        bValue={b.riderHoursLost.toLocaleString()}
        delta={(b.riderHoursLost - a.riderHoursLost).toLocaleString()}
        higherIsBetter={false}
      />
      <DeltaCell
        label="Lane coverage"
        unit="%"
        aValue={String(a.laneCoverage)}
        bValue={String(b.laneCoverage)}
        delta={String(b.laneCoverage - a.laneCoverage)}
        higherIsBetter
      />
      <DeltaCell
        label="ACE status"
        aValue={a.aceStatus === "active" ? "Active" : "None"}
        bValue={b.aceStatus === "active" ? "Active" : "None"}
      />
    </section>
  );
}

function DeltaCell({
  label,
  aValue,
  bValue,
  delta,
  unit,
  higherIsBetter,
}: {
  label: string;
  aValue: string;
  bValue: string;
  delta?: string;
  unit?: string;
  higherIsBetter?: boolean;
}) {
  let tone = "var(--bp-color-ink-55)";
  if (delta !== undefined && higherIsBetter !== undefined) {
    const numeric = Number(delta.replace(/[^-0-9.]/g, ""));
    if (!Number.isNaN(numeric)) {
      if ((numeric > 0 && higherIsBetter) || (numeric < 0 && !higherIsBetter)) {
        tone = "var(--bp-color-good)";
      } else if ((numeric < 0 && higherIsBetter) || (numeric > 0 && !higherIsBetter)) {
        tone = "var(--bp-color-bad)";
      }
    }
  }
  return (
    <div className="grid grid-cols-3 items-center gap-3 bg-[var(--bp-color-card)] p-3 text-center">
      <div className="font-mono text-[14px] font-semibold tabular-nums text-[var(--bp-color-ink)]">
        {aValue}
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--bp-color-ink-55)]">
        <div>{label}</div>
        {delta !== undefined ? (
          <div className="mt-0.5 font-mono text-[11px] tabular-nums" style={{ color: tone }}>
            {Number(delta) > 0 ? "+" : ""}
            {delta}
            {unit ? ` ${unit}` : ""}
          </div>
        ) : null}
      </div>
      <div className="font-mono text-[14px] font-semibold tabular-nums text-[var(--bp-color-ink)]">
        {bValue}
      </div>
    </div>
  );
}

function CoverageBar({ route }: { route: StudioRoute }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="inline-flex items-center gap-2">
          <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
          <span className="font-semibold">{route.corridor}</span>
        </span>
        <span className="font-mono tabular-nums">{route.laneCoverage}%</span>
      </div>
      <div className="h-2 w-full rounded-[2px] bg-[var(--bp-color-paper-deep)]">
        <div
          className="h-full rounded-[2px]"
          style={{
            width: `${route.laneCoverage}%`,
            background:
              route.laneCoverage >= 70
                ? "var(--bp-color-good)"
                : route.laneCoverage >= 40
                  ? "var(--bp-color-warn)"
                  : "var(--bp-color-bad)",
          }}
        />
      </div>
    </div>
  );
}

function InterventionTimelineVertical({ events }: { events: StudioRoute["interventions"] }) {
  if (events.length === 0)
    return (
      <p className="m-0 text-[12px] text-[var(--bp-color-ink-55)]">
        No documented interventions on this route.
      </p>
    );
  return (
    <ol className="m-0 list-none space-y-2 p-0">
      {events.map((e, i) => (
        <li key={`${e.year}-${i}`} className="flex items-start gap-3">
          <span className="shrink-0 font-mono text-[10.5px] font-bold tabular-nums text-[var(--bp-color-ink-55)]">
            {e.year}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold">{e.title}</div>
            <div className="text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
              {e.detail}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function synth24(spark: readonly number[]): number[] {
  if (spark.length === 0) return Array(24).fill(0);
  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const base = (min + max) / 2;
  const amp = (max - min) / 2 + 0.5;
  return Array.from({ length: 24 }, (_, h) => {
    const am = Math.max(0, 1 - Math.abs(h - 8) / 4);
    const pm = Math.max(0, 1 - Math.abs(h - 17) / 4);
    const intensity = Math.max(am, pm * 1.1);
    return Math.max(0.05, base - amp * intensity * 0.6 + (h % 2 === 0 ? 0.1 : -0.1));
  });
}
