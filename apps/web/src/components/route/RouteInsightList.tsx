import { SectionCard } from "@/components/SectionCard";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteCapability, StudioRouteInsight } from "@/studio/api-contract";
import {
  routeSectionForInsight,
  safeInsightCaveats,
  stableInsightSort,
} from "./route-insight-placement";
import { type RouteDetailSectionValue, routeSectionTitle } from "./section-registry";

const MAX_INSIGHTS = 5;

const severityRank: Record<StudioRouteInsight["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const severityColor: Record<StudioRouteInsight["severity"], string> = {
  high: "var(--bp-color-bad)",
  medium: "var(--bp-color-warn)",
  low: "var(--bp-color-ink-40)",
};

export function RouteInsightList({
  insights,
  capability,
  onNavigate,
}: {
  insights: readonly StudioRouteInsight[];
  capability: StudioRouteCapability | null;
  onNavigate: (section: RouteDetailSectionValue) => void;
}) {
  if (insights.length === 0) {
    return cleanInsightState(capability);
  }

  const rows = [...insights].sort(stableInsightSort).slice(0, MAX_INSIGHTS);

  return (
    <SectionCard
      title="What stands out"
      sub={
        rows.length === insights.length
          ? "Detector findings, ranked by severity."
          : `Top ${rows.length} of ${insights.length} detector findings.`
      }
      right={
        insights.length > rows.length ? (
          <Badge variant="neutral">{insights.length - rows.length} more in sections</Badge>
        ) : undefined
      }
      bodyClassName="-mx-[18px] -mb-[18px] divide-y divide-[var(--bp-color-rule)] border-t border-[var(--bp-color-rule)]"
    >
      {rows.map((insight, index) => (
        <RankedInsightRow
          key={`${insight.detectorId}:${insight.scopeId ?? insight.title}:${index}`}
          insight={insight}
          index={index}
          onNavigate={onNavigate}
        />
      ))}
    </SectionCard>
  );
}

function RankedInsightRow({
  insight,
  index,
  onNavigate,
}: {
  insight: StudioRouteInsight;
  index: number;
  onNavigate: (section: RouteDetailSectionValue) => void;
}) {
  const caveats = safeInsightCaveats(insight, 2);
  const target =
    insight.placement === "map_segment" ? "where-when" : routeSectionForInsight(insight);
  const color = severityColor[insight.severity];

  return (
    <article className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-4 px-4 py-4 max-md:grid-cols-[36px_minmax(0,1fr)] max-md:gap-3">
      <div className="font-mono text-[16px] font-semibold tabular-nums" style={{ color }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[15.5px] font-semibold leading-snug text-[var(--bp-color-ink)]">
            {insight.title}
          </h3>
          <SeverityBlocks severity={insight.severity} />
        </div>
        <p className="m-0 mt-1.5 max-w-[760px] text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          {insight.shortText}
        </p>
        {caveats.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {caveats.map((caveat) => (
              <span
                key={caveat}
                className="rounded-[3px] bg-[var(--bp-color-paper-deep)] px-2 py-1 text-[10.5px] text-[var(--bp-color-ink-55)]"
              >
                {caveat}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onNavigate(target)}
        className="inline-flex whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)] hover:text-[var(--bp-color-ink)] max-md:col-start-2"
      >
        {routeSectionTitle(target)} →
      </button>
    </article>
  );
}

function SeverityBlocks({ severity }: { severity: StudioRouteInsight["severity"] }) {
  const count = severityRank[severity];
  const color = severityColor[severity];
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
      <span className="inline-flex gap-[2px]" aria-hidden>
        {Array.from({ length: 3 }).map((_, index) => (
          <span
            key={index}
            className="h-2 w-1.5 rounded-[1px]"
            style={{
              background: index < count ? color : "var(--bp-color-ink-10)",
            }}
          />
        ))}
      </span>
      {severity}
    </span>
  );
}

function cleanInsightState(capability: StudioRouteCapability | null) {
  const surfaces = Object.values(capability?.surfaces ?? {});
  const checkedCount = surfaces.filter((surface) =>
    ["checked_clean", "ready", "partial"].includes(surface.state),
  ).length;
  const hasCleanSignal = surfaces.some((surface) => surface.state === "checked_clean");
  if (!hasCleanSignal) return null;

  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="text-[13px] font-semibold text-[var(--bp-color-good)]">No flags raised</div>
      <p className="m-0 mt-2 text-[13px] leading-[1.55] text-[var(--bp-color-ink-70)]">
        {checkedCount > 0
          ? `No detector flags raised for this route across ${checkedCount} checked surface${checkedCount === 1 ? "" : "s"}.`
          : "No detector flags raised for this route."}
      </p>
    </section>
  );
}
