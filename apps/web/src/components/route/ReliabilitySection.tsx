import { reliabilityInsightRows, reliabilitySummary } from "@/components/route/reliability-summary";
import { riderImpactInsightRows } from "@/components/route/rider-impact-summary";
import { safeInsightCaveats } from "@/components/route/route-insight-placement";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function ReliabilitySection({ data }: { data: StudioRouteDetailResponse }) {
  const observed = data.route.observedReliability;
  // biome-ignore lint/complexity/useLiteralKeys: capability surfaces are typed as an index signature.
  const capability = data.capability?.surfaces["reliability"] ?? null;

  if (observed === null) {
    return (
      <Alert variant="info">
        <AlertTitle variant="info">Reliability not yet measured</AlertTitle>
        <AlertDescription>
          {capability?.reason ?? "Observed headway data is not yet available for this route."}
        </AlertDescription>
      </Alert>
    );
  }

  const summary = reliabilitySummary({ observed });
  const signals = unifiedSignalRows(data.insights);

  const aboutEntries: SourceNoteEntry[] = [
    { label: summary.statusLabel, detail: summary.statusDetail },
    {
      label: `${summary.sampleLabel} observed headway samples`,
      detail: summary.sampleDetail,
    },
    { label: `Bunching: ${summary.bunchingLabel} of observed gaps ran short.` },
    { label: summary.caveat },
  ];

  return (
    <section className="flex flex-col gap-5">
      <SectionCard
        title="Waiting for the bus"
        sub="Observed headways and gaps."
        right={<SourceNote label="About this data" entries={aboutEntries} />}
      >
        <div className="grid grid-cols-4 rounded-[3px] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
          <ReliabilityKpi
            label="Median wait"
            value={summary.medianHeadwayLabel}
            sub="typical time between buses"
          />
          <ReliabilityKpi
            label="P90 wait"
            value={summary.p90HeadwayLabel}
            sub="the worst 10% of gaps run at least this long"
          />
          <ReliabilityKpi
            label="Excess wait"
            value={summary.excessWaitLabel}
            sub="extra wait beyond the schedule"
            tone={summary.kpiTone === "bad" ? "bad" : "neutral"}
          />
          <ReliabilityKpi
            label="Long gaps"
            value={summary.longGapLabel}
            sub="share of observed gaps that ran long"
            tone={summary.kpiTone === "bad" ? "bad" : "neutral"}
          />
        </div>
        <ReliabilitySampleSparkline samples={data.reliabilitySamples} />
      </SectionCard>
      <SectionCard title="Signals" sub="Detector context for riders and reliability.">
        <SignalList insights={signals} />
      </SectionCard>
    </section>
  );
}

function unifiedSignalRows(
  insights: StudioRouteDetailResponse["insights"],
): StudioRouteDetailResponse["insights"] {
  const rows = [...riderImpactInsightRows(insights), ...reliabilityInsightRows(insights)];
  const seen = new Set<string>();
  return rows.filter((insight) => {
    const key = `${insight.detectorId}:${insight.scopeId ?? insight.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ReliabilitySampleSparkline({
  samples,
}: {
  samples: StudioRouteDetailResponse["reliabilitySamples"];
}) {
  if (samples.length === 0) return null;
  const byHour = new Map(samples.map((sample) => [sample.hourOfDay, sample] as const));
  const max = Math.max(...samples.map((sample) => sample.averageObservedHeadwayMinutes), 1);
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
        Observed headway samples by hour
      </div>
      <div
        className="grid h-16 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[3px]"
        aria-hidden
      >
        {Array.from({ length: 24 }, (_, hour) => {
          const sample = byHour.get(hour);
          const height =
            sample === undefined
              ? 4
              : Math.max(6, Math.round((sample.averageObservedHeadwayMinutes / max) * 64));
          return (
            <div
              key={hour}
              className="rounded-t-[2px] bg-[var(--bp-color-accent)] opacity-70"
              style={{ height }}
              title={
                sample === undefined
                  ? `${hour}:00, no samples`
                  : `${hour}:00, ${sample.averageObservedHeadwayMinutes.toFixed(1)} min`
              }
            />
          );
        })}
      </div>
    </div>
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
  tone?: "neutral" | "bad";
}) {
  return (
    <div className="p-5 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-xl:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      <div
        className="font-mono text-[28px] font-semibold leading-none tabular-nums"
        style={{ color: tone === "bad" ? "var(--bp-color-bad)" : "var(--bp-color-ink)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function SignalList({ insights }: { insights: StudioRouteDetailResponse["insights"] }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2.5 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
        No public rider or reliability insight for this route yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
