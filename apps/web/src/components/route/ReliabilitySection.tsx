import { DataAsOf } from "@/components/DataAsOf";
import { SectionHeader } from "@/components/SectionHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

function minutes(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} min`;
}

function share(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function ReliabilitySection({ data }: { data: StudioRouteDetailResponse }) {
  const observed = data.route.observedReliability;
  const capability = data.capability?.surfaces["reliability"] ?? null;

  if (observed === null) {
    return (
      <Alert variant="info">
        <AlertTitle variant="info">
          Reliability evidence is not published for this route yet
        </AlertTitle>
        <AlertDescription>
          {capability?.reason ??
            "The route dossier has not published enough observed headway evidence for a reliability panel."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title="Observed wait reliability"
        sub="Headway samples, bunching, long gaps, and excess wait from the observed reliability layer."
        right={<DataAsOf dataAsOf={observed.month} />}
      />
      <div className="grid grid-cols-4 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
        <ReliabilityKpi
          label="Median observed headway"
          value={minutes(observed.medianObservedHeadwayMinutes)}
          sub={`${observed.sampleCount.toLocaleString()} samples`}
        />
        <ReliabilityKpi
          label="P90 observed headway"
          value={minutes(observed.p90ObservedHeadwayMinutes)}
          sub={observed.reliabilityStatus.replaceAll("_", " ")}
        />
        <ReliabilityKpi
          label="Bunching share"
          value={share(observed.observedBunchingShare)}
          sub="observed short gaps"
        />
        <ReliabilityKpi
          label="Long-gap share"
          value={share(observed.observedLongGapShare)}
          sub="observed long gaps"
        />
      </div>
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
          Excess wait
        </div>
        <div className="font-mono text-[34px] font-semibold leading-none tabular-nums">
          {minutes(observed.excessWaitMinutes)}
        </div>
        <div className="mt-2 max-w-[720px] text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-55)]">
          {observed.caveats[0] ??
            "Observed reliability carries separate provenance from official monthly speed evidence."}
        </div>
      </div>
    </section>
  );
}

function ReliabilityKpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-5 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-xl:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      <div className="font-mono text-[28px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}
