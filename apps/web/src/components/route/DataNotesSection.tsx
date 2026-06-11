import { Link } from "@tanstack/react-router";
import { DataAsOf } from "@/components/DataAsOf";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  formatCompact,
} from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function DataNotesSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, quality, segments, dossier } = data;
  const historyWindow = dossierMetricWindow(dossier?.speed);
  const ridershipMonthCount = dossierMetricMonthCount(dossier?.ridership);
  const datasets = [
    ["Bus segment speeds", "MTA Open Data", `${segments.length} timepoint segments`, 14],
    [
      "Route speed history",
      "Pipeline dossier projection",
      historyWindow ?? "not built for this route",
      dossierMetricMonthCount(dossier?.speed),
    ],
    [
      "Ridership and rider-hours",
      "MTA / Studio projection",
      ridershipMonthCount > 0
        ? `${ridershipMonthCount} monthly ridership rows`
        : `${formatCompact(route.dailyRiders)} weekday riders`,
      9,
    ],
    [
      "Schedule timepoints",
      "MTA GTFS",
      `${route.scheduledMph.toFixed(1)} mph scheduled baseline`,
      6,
    ],
    ["Bus lane geometry", "NYC DOT", `${route.laneCoverage}% route coverage`, 8],
    [
      "ACE program record",
      "MTA Open Data",
      route.aceSince ? `since ${route.aceSince}` : "no active record",
      5,
    ],
  ] as const;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-7 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <DataWindow
          label="Primary window"
          value={historyWindow ?? "Current projection"}
          sub={
            dossier
              ? `${dossier.speed.sparkline.length} route-month rows`
              : `${segments.length} segments in route detail`
          }
        />
        <DataWindow
          label="Route quality"
          value={quality.confidence}
          sub={quality.completenessStatus.replace(/_/g, " ")}
          good={quality.confidence === "high"}
        />
        <div className="max-w-[280px]">
          <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Freshness
          </div>
          <DataAsOf dataAsOf={dossier?.dataAsOf ?? null} className="text-[13px]" />
          <div className="mt-0.5 text-[11px] leading-[1.35] text-[var(--bp-color-ink-55)]">
            latest input month
          </div>
        </div>
        <div className="ml-auto">
          <Link
            to="/docs/$page"
            params={{ page: "methodology" }}
            className="inline-flex items-center rounded-[3px] border border-[var(--bp-color-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Full methodology &rarr;
          </Link>
        </div>
      </div>

      <div>
        <SectionHeader
          title="Datasets in use for this route"
          sub="The data sources behind this route's numbers."
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {datasets.map(([name, publisher, window, cites]) => (
            <div
              key={name}
              className="grid grid-cols-[220px_160px_minmax(0,1fr)_80px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
            >
              <div className="text-[13px] font-semibold">{name}</div>
              <div className="font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                {publisher}
              </div>
              <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">{window}</div>
              <div className="text-right font-mono text-[11.5px] font-semibold text-[var(--bp-color-accent)] max-lg:text-left">
                cited {cites}x
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataWindow({
  label,
  value,
  sub,
  good = false,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="max-w-[280px]">
      <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="font-mono text-[20px] font-semibold tracking-[-0.015em]">{value}</div>
        {good ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--bp-color-good)]" /> : null}
      </div>
      <div
        className="mt-0.5 text-[11px] leading-[1.35]"
        style={{ color: good ? "var(--bp-color-good)" : "var(--bp-color-ink-55)" }}
      >
        {sub}
      </div>
    </div>
  );
}
