import { DataAsOf } from "@/components/DataAsOf";
import { reliabilityInsightRows, reliabilitySummary } from "@/components/route/reliability-summary";
import { safeInsightCaveats } from "@/components/route/route-insight-placement";
import { routeSectionQuestion } from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function ReliabilitySection({ data }: { data: StudioRouteDetailResponse }) {
  const observed = data.route.observedReliability;
  // biome-ignore lint/complexity/useLiteralKeys: capability surfaces are typed as an index signature.
  const capability = data.capability?.surfaces["reliability"] ?? null;
  const summary = reliabilitySummary({ observed, capability });
  const insights = reliabilityInsightRows(data.insights);

  if (observed === null) {
    return (
      <Alert variant="info">
        <AlertTitle variant="info">Reliability pending</AlertTitle>
        <AlertDescription>
          {capability?.reason ?? "Headway evidence has not cleared gate."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={routeSectionQuestion("reliability")}
        sub={summary.sectionSubtitle}
        right={<DataAsOf dataAsOf={summary.dataAsOf} />}
      />
      <div className="grid grid-cols-4 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
        <ReliabilityKpi
          label="Evidence state"
          value={summary.statusLabel}
          sub={summary.statusDetail}
          tone={summary.hasObservedMetrics ? "neutral" : "warn"}
        />
        <ReliabilityKpi
          label="Sample coverage"
          value={summary.sampleLabel}
          sub={summary.sampleDetail}
        />
        <ReliabilityKpi
          label="Bunching share"
          value={summary.bunchingLabel}
          sub="observed short gaps"
        />
        <ReliabilityKpi
          label="Long-gap share"
          value={summary.longGapLabel}
          sub="observed long gaps"
          tone={summary.kpiTone === "bad" ? "bad" : "neutral"}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5 max-xl:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader title="Headways" sub="Route-level observed waits." />
          <div className="mt-3 grid grid-cols-3 gap-4 max-sm:grid-cols-1">
            <HeadwayStat label="Median" value={summary.medianHeadwayLabel} />
            <HeadwayStat label="P90" value={summary.p90HeadwayLabel} />
            <HeadwayStat label="Excess wait" value={summary.excessWaitLabel} tone="bad" />
          </div>
        </div>
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader
            title="Signals"
            sub={insights.length > 0 ? "Reliability context." : "No insight yet."}
          />
          <ReliabilityInsightList insights={insights} />
        </div>
      </div>
      <Alert variant="info">
        <AlertTitle variant="info">Provenance</AlertTitle>
        <AlertDescription>{summary.caveat}</AlertDescription>
      </Alert>
    </section>
  );
}

function ReliabilityKpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "warn" | "bad";
}) {
  const color =
    tone === "bad"
      ? "var(--bp-color-bad)"
      : tone === "warn"
        ? "var(--bp-color-warn)"
        : "var(--bp-color-ink)";
  return (
    <div className="p-5 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-xl:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      <div
        className="font-mono text-[28px] font-semibold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function HeadwayStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "bad";
}) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-[24px] font-semibold leading-none tabular-nums"
        style={{ color: tone === "bad" ? "var(--bp-color-bad)" : "var(--bp-color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function ReliabilityInsightList({ insights }: { insights: StudioRouteDetailResponse["insights"] }) {
  if (insights.length === 0) {
    return (
      <div className="mt-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2.5 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
        Reliability can be cited; no card cleared the public gate.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {insights.map((insight) => {
        const caveats = safeInsightCaveats(insight, 1);
        return (
          <div
            key={`${insight.detectorId}:${insight.scopeId ?? insight.title}`}
            className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3 shadow-[0_0_0_1px_var(--bp-color-rule)]"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={insight.severity === "high" ? "bad" : "neutral"}>
                {insight.severity}
              </Badge>
              <DataAsOf dataAsOf={insight.asOfMonth ?? insight.month ?? null} />
            </div>
            <div className="text-[12.5px] font-semibold">{insight.title}</div>
            <div className="mt-1 text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
              {insight.shortText}
            </div>
            {caveats[0] ? (
              <div className="mt-1.5 text-[11px] leading-[1.4] text-[var(--bp-color-ink-40)]">
                {caveats[0]}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
