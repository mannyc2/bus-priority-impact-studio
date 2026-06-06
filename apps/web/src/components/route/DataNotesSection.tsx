import { Link } from "@tanstack/react-router";
import { formatCompact, routeHistoryWindow } from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

export function DataNotesSection({
  data,
  history,
}: {
  data: StudioRouteDetailResponse;
  history: StudioRouteHistoryResponse | null;
}) {
  const { route, quality, segments } = data;
  const historyWindow = routeHistoryWindow(history);
  const datasets = [
    ["Bus segment speeds", "MTA Open Data", `${segments.length} timepoint segments`, 14],
    [
      "Route speed history",
      "D1 route-month trend",
      historyWindow ?? "not loaded for this route",
      history?.coverage.speedMonthCount ?? 0,
    ],
    [
      "Ridership and rider-hours",
      "MTA / Studio projection",
      history?.coverage.ridershipMonthCount
        ? `${history.coverage.ridershipMonthCount} monthly ridership rows`
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

  // Snapshot 2.0 route quality/caveats stay in the API payload for release gating.
  // Keep this prototype's data-notes section focused on the designed evidence copy.
  const caveats = [
    {
      title: "Speed is observed bus travel speed",
      body: "Segment speeds include dwell time, traffic, signals, and stops. Brief language should say observed bus travel speed, not general traffic speed.",
      scope: `${route.label} route view`,
    },
    {
      title: "Trend data is projection-backed",
      body: "The route sparkline is already computed in the Studio projection. Do not treat it as a full causal time-series without attaching source rows.",
      scope: "route trend",
    },
    {
      title: "Treatment attribution needs context",
      body: "Treatment status is shown as operational context. Before publishing an intervention claim, attach before/after windows and any overlapping events.",
      scope: "intervention claims",
    },
    {
      title: "Data quality travels with the route",
      body: `This response was generated at ${data.generatedAt}; quality confidence is ${quality.confidence}. Use the quality object when deciding whether a claim is publishable.`,
      scope: "publication review",
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-7 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <DataWindow
          label="Primary window"
          value={historyWindow ?? "Current projection"}
          sub={
            history
              ? `${history.coverage.pointCount} route-month rows`
              : `${segments.length} segments in route detail`
          }
        />
        <DataWindow
          label="Route quality"
          value={quality.confidence}
          sub={quality.caveats.join("; ") || quality.completenessStatus}
          good={quality.confidence === "high"}
        />
        <DataWindow
          label="Last generated"
          value={data.generatedAt.slice(0, 10)}
          sub="serving artifact timestamp"
        />
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
          title="Route-specific caveats"
          sub="Apply these to briefs when the claim uses the associated route evidence."
        />
        <div className="flex flex-col gap-2.5">
          {caveats.map((caveat, index) => (
            <div
              key={`${caveat.title}-${index}`}
              className="flex items-start gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bp-color-warn)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-[13.5px] font-semibold">{caveat.title}</div>
                  <Badge variant="neutral">scope: {caveat.scope}</Badge>
                </div>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                  {caveat.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader
          title="Datasets in use for this route"
          sub="Dataset rows are shown as route-level evidence inventory, not generic docs."
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
