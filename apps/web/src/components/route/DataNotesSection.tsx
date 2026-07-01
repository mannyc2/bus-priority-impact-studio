import { Link } from "@tanstack/react-router";
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
import { routeDossierArchetype } from "@/components/route/route-archetype";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  formatCompact,
} from "@/components/route/route-derived";
import {
  type RouteEvidenceIndexRow,
  routeEvidenceIndexRows,
} from "@/components/route/route-insight-card";
import {
  type RouteDetailTabValue,
  type RouteSectionRegistry,
  routeSectionCanNavigate,
  routeSectionQuestion,
} from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function DataNotesSection({
  data,
  sectionRegistry,
  onNavigate,
}: {
  data: StudioRouteDetailResponse;
  sectionRegistry: Pick<RouteSectionRegistry, "presentations" | "hiddenSections">;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const { route, quality, segments, dossier } = data;
  const historyWindow = dossierMetricWindow(dossier?.speed);
  const ridershipMonthCount = dossierMetricMonthCount(dossier?.ridership);
  const coverage = coverageRows(data.capability);
  const checkedCleanChips = checkedCleanCoverageChips(coverage);
  const evidenceRows = routeEvidenceIndexRows(data.insights);
  const archetype = routeDossierArchetype({ capability: data.capability, dossier });
  const hiddenTabs = sectionRegistry.hiddenSections;
  const datasets = [
    ["Segment speeds", "MTA Open Data", `${segments.length} segments`],
    ["Speed history", "Dossier", historyWindow ?? "not built"],
    [
      "Riders/time",
      "Studio projection",
      ridershipMonthCount > 0
        ? `${ridershipMonthCount} ridership rows`
        : `${formatCompact(route.dailyRiders)} riders/day`,
    ],
    ["Schedule", "MTA GTFS", `${route.scheduledMph.toFixed(1)} mph scheduled`],
    ["Bus lanes", "NYC DOT", `${route.laneCoverage}% coverage`],
    ["ACE record", "MTA Open Data", route.aceSince ? `since ${route.aceSince}` : "none active"],
  ] as const;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-7 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <DataWindow
          label="Window"
          value={historyWindow ?? "Projection"}
          sub={
            dossier
              ? `${dossier.speed.sparkline.length} route-months`
              : `${segments.length} segments in route detail`
          }
        />
        <DataWindow
          label="Depth"
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
          label="Quality"
          value={quality.confidence}
          sub={completenessStatusLabel(quality.completenessStatus)}
          good={quality.confidence === "high"}
        />
        <div className="max-w-[280px]">
          <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Freshness
          </div>
          <div className="mt-0.5 text-[11px] leading-[1.35] text-[var(--bp-color-ink-55)]">
            latest month
          </div>
        </div>
        <div className="ml-auto">
          <Link
            to="/methods"
            className="inline-flex items-center rounded-[3px] border border-[var(--bp-color-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Methods &rarr;
          </Link>
        </div>
      </div>

      <EvidenceIndexSection
        rows={evidenceRows}
        sectionRegistry={sectionRegistry}
        hiddenSectionCount={hiddenTabs.length}
        onNavigate={onNavigate}
      />

      <div>
        <SectionHeader
          title="Checked"
          sub={coverage.length > 0 ? coverageSummary(coverage) : "Legacy detail; no manifest."}
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
                  {row.reason ?? row.stateLabel}
                </div>
                <div className="text-right max-lg:text-left"></div>
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
          <SectionHeader title="Hidden sections" sub="Hidden when evidence is thin." />
          <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {hiddenTabs.map(({ tab, presentation }) => (
              <div
                key={tab.value}
                className="grid grid-cols-[220px_160px_minmax(0,1fr)_120px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
              >
                <div className="text-[13px] font-semibold">
                  {tab.label}
                  {tab.badge ? (
                    <Badge
                      variant={
                        tab.badge.severity === "high"
                          ? "bad"
                          : tab.badge.severity === "medium"
                            ? "warn"
                            : "neutral"
                      }
                      className="ml-2"
                    >
                      {tab.badge.count}
                    </Badge>
                  ) : null}
                </div>
                <div className="font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                  {hiddenStateLabel(presentation.state)}
                </div>
                <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">
                  {presentation.reason ?? "No route evidence published."}
                </div>
                <div className="text-right max-lg:text-left"></div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <SectionHeader title="Datasets" sub="Route-number sources." />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {datasets.map(([name, publisher, window]) => (
            <div
              key={name}
              className="grid grid-cols-[220px_160px_minmax(0,1fr)] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
            >
              <div className="text-[13px] font-semibold">{name}</div>
              <div className="font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                {publisher}
              </div>
              <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">{window}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EvidenceIndexSection({
  rows,
  sectionRegistry,
  hiddenSectionCount,
  onNavigate,
}: {
  rows: readonly RouteEvidenceIndexRow[];
  sectionRegistry: Pick<RouteSectionRegistry, "presentations">;
  hiddenSectionCount: number;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const hiddenSignalCount = rows.filter(
    (row) => row.tab !== "evidence" && !routeSectionCanNavigate(sectionRegistry, row.tab),
  ).length;
  const hasSummary = rows.length > 0 || hiddenSectionCount > 0;

  return (
    <div>
      <SectionHeader
        title={routeSectionQuestion("evidence")}
        right={
          hasSummary ? (
            <div className="flex flex-wrap justify-end gap-2">
              {rows.length > 0 ? (
                <Badge variant="neutral">
                  {rows.length} {plural(rows.length, "signal")}
                </Badge>
              ) : null}
              {hiddenSignalCount > 0 ? (
                <Badge variant="accent">{hiddenSignalCount} covered</Badge>
              ) : null}
              {hiddenSectionCount > 0 ? (
                <Badge variant="warn">
                  {hiddenSectionCount} {plural(hiddenSectionCount, "notice")}
                </Badge>
              ) : null}
            </div>
          ) : null
        }
      />
      <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_180px_210px] gap-5 px-4 py-4 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-3"
            >
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      row.severity === "high"
                        ? "bad"
                        : row.severity === "medium"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {row.severity}
                  </Badge>
                  <Badge variant="neutral" className="max-w-full truncate">
                    {row.detectorLabel}
                  </Badge>
                </div>
                <div className="text-[13px] font-semibold">{row.title}</div>
                <p className="m-0 mt-1 max-w-[820px] text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
                  {row.summary}
                </p>
                {row.caveats.length > 0 ? (
                  <p className="m-0 mt-2 max-w-[820px] text-[11px] leading-[1.45] text-[var(--bp-color-ink-40)]">
                    {row.caveats.join(" ")}
                  </p>
                ) : null}
              </div>
              <div className="text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
                <div className="font-semibold text-[var(--bp-color-ink)]">{row.citationLabel}</div>
                <div className="mt-1">{row.referenceDetailLabel}</div>
              </div>
              <div className="flex flex-col items-end gap-2 max-lg:items-start">
                {row.tab === "evidence" ? (
                  <Badge variant="accent">In Evidence</Badge>
                ) : !routeSectionCanNavigate(sectionRegistry, row.tab) ? (
                  <Badge variant="neutral">Covered in Evidence</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(row.tab)}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
                  >
                    Open {row.tabLabel}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
            Checked surfaces below.
          </div>
        )}
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
          <Badge variant="good">Clean</Badge>
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

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
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
