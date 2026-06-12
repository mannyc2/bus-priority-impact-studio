import { Link } from "@tanstack/react-router";
import { DataAsOf } from "@/components/DataAsOf";
import {
  type CheckedCleanCoverageChip,
  checkedCleanCoverageChips,
  coverageRows,
  coverageSummary,
} from "@/components/route/coverage-matrix";
import {
  completenessStatusLabel,
  releaseLayerDescription,
  releaseLayerLabel,
} from "@/components/route/data-quality-labels";
import { ROUTE_DETAIL_TABS } from "@/components/route/RouteDetailShell";
import { routeDossierArchetype } from "@/components/route/route-archetype";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  formatCompact,
} from "@/components/route/route-derived";
import { sectionPresentation } from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function DataNotesSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, quality, segments, dossier } = data;
  const historyWindow = dossierMetricWindow(dossier?.speed);
  const ridershipMonthCount = dossierMetricMonthCount(dossier?.ridership);
  const coverage = coverageRows(data.capability);
  const checkedCleanChips = checkedCleanCoverageChips(coverage);
  const archetype = routeDossierArchetype({ capability: data.capability, dossier });
  const hiddenTabs = ROUTE_DETAIL_TABS.flatMap((tab) => {
    const presentation = sectionPresentation(data.capability, tab.value);
    return presentation.mode === "hidden" ? [{ tab, presentation }] : [];
  });
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
          label="Dossier depth"
          value={archetype.label}
          sub={archetype.summary}
          good={archetype.id === "flagship"}
        />
        <DataWindow
          label="Release layer"
          value={releaseLayerLabel(quality.releaseLayer)}
          sub={releaseLayerDescription(quality.releaseLayer)}
          good={quality.releaseLayer === "observed_release"}
        />
        <DataWindow
          label="Route quality"
          value={quality.confidence}
          sub={completenessStatusLabel(quality.completenessStatus)}
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
          title="What we checked"
          sub={
            coverage.length > 0
              ? coverageSummary(coverage)
              : "Legacy route detail without a published capability manifest."
          }
        />
        <CheckedCleanChipRail chips={checkedCleanChips} />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {coverage.length > 0 ? (
            coverage.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[220px_130px_minmax(0,1fr)_120px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
              >
                <div>
                  <div className="text-[13px] font-semibold">{row.label}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">
                    {row.depthLabel}
                  </div>
                </div>
                <div>
                  <Badge variant={row.tone}>{row.stateLabel}</Badge>
                </div>
                <div className="text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
                  {row.reason ?? coverageReason(row.state)}
                </div>
                <div className="text-right max-lg:text-left">
                  <DataAsOf dataAsOf={row.dataAsOf} />
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
              This route predates the manifest-driven evidence matrix.
            </div>
          )}
        </div>
      </div>

      {hiddenTabs.length > 0 ? (
        <div>
          <SectionHeader
            title="Sections not shown"
            sub="Route sections withheld because the source evidence does not support them yet."
          />
          <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {hiddenTabs.map(({ tab, presentation }) => (
              <div
                key={tab.value}
                className="grid grid-cols-[220px_160px_minmax(0,1fr)_120px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
              >
                <div className="text-[13px] font-semibold">{tab.label}</div>
                <div className="font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                  {hiddenStateLabel(presentation.state)}
                </div>
                <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">
                  {presentation.reason ?? "No route-level evidence published for this section."}
                </div>
                <div className="text-right max-lg:text-left">
                  <DataAsOf dataAsOf={presentation.dataAsOf} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

function CheckedCleanChipRail({ chips }: { chips: readonly CheckedCleanCoverageChip[] }) {
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <div
          key={chip.key}
          className="inline-flex max-w-full items-center gap-2 rounded-[3px] bg-[var(--bp-color-good-bg)] px-2.5 py-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--bp-color-good)]"
          title={chip.reason ?? chip.depthLabel}
        >
          <Badge variant="good">Checked clean</Badge>
          <span className="truncate font-semibold text-[var(--bp-color-ink)]">{chip.label}</span>
          <span className="font-mono text-[10.5px] text-[var(--bp-color-good)]">
            {chip.checkedThroughLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

function hiddenStateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

function coverageReason(state: string): string {
  switch (state) {
    case "ready":
      return "Evidence is available for this section.";
    case "partial":
      return "Evidence is available, but coverage is incomplete.";
    case "checked_clean":
      return "The source or detector ran and did not publish a route flag.";
    case "building":
      return "The producer exists but has not finished for this route.";
    case "insufficient_data":
      return "The available inputs do not support a route-level claim.";
    case "not_applicable":
      return "This surface does not apply to this route.";
    case "blocked":
      return "An upstream dependency blocked this surface.";
    default:
      return "No route-level explanation published for this surface.";
  }
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
