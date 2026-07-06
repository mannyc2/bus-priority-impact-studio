import type { ReactNode } from "react";
import { segmentSpeedAtHour, speedToColor } from "@/components/route/maplibre-style";
import { CitationChips, type WikiCitationEvidence } from "@/components/route/WikiEvidence";
import { Badge } from "@/components/ui/badge";
import type { StudioSegment } from "@/studio/api-contract";
import type { MetricTone } from "@/studio/metric-model";

type PublicTone = MetricTone | "accent" | "warn";

export type RPubStatTone = Extract<PublicTone, "ink" | "good" | "bad" | "accent" | "warn">;

const toneColor: Record<RPubStatTone, string> = {
  ink: "var(--bp-color-ink)",
  good: "var(--bp-color-good)",
  bad: "var(--bp-color-bad)",
  accent: "var(--bp-color-accent)",
  warn: "var(--bp-color-warn)",
};

export function RPubSlowCard({
  segment,
  rank,
  routeMedianMph,
  badge,
  note,
}: {
  segment: StudioSegment;
  rank: number;
  routeMedianMph: number | null;
  badge: string | null;
  note: ReactNode;
}) {
  const delta =
    routeMedianMph === null ? null : Number((routeMedianMph - segment.speedMph).toFixed(1));
  const treatments = [
    segment.lane === "none" ? null : segment.lane === "yes" ? "bus lane" : `${segment.lane} lane`,
    segment.ace ? "ACE" : null,
    segment.tsp ? "TSP" : null,
  ].filter((item): item is string => item !== null);
  const hasHourData =
    segment.scheduledMph !== null &&
    segment.hours.length === 24 &&
    segment.hours.some((value) => value > 0);

  return (
    <article className="flex min-h-[270px] flex-col rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-55)]">
            Slow segment {rank}
          </div>
          <h3 className="m-0 mt-1 text-[17px] font-semibold leading-[1.2]">
            {segment.from} to {segment.to}
          </h3>
          <div className="mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">
            {segment.direction} &middot;{" "}
            {segment.miles ? `${segment.miles} mi` : "timepoint segment"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {badge ? <Badge variant="bad">{badge}</Badge> : null}
          <Badge variant={segment.speedMph < 5 ? "bad" : "warn"}>
            {segment.speedMph.toFixed(1)} mph
          </Badge>
        </div>
      </div>

      <p className="m-0 mt-4 text-[13px] leading-[1.6] text-[var(--bp-color-ink-70)]">
        This stretch runs {segment.speedMph.toFixed(1)} mph
        {delta !== null && delta > 0 ? `, ${delta.toFixed(1)} mph below the route median,` : ""} and
        accounts for {Math.round(segment.riderHours).toLocaleString("en-US")} rider-hours per
        weekday.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <SlowCardStat label="Speed" value={`${segment.speedMph.toFixed(1)} mph`} />
        <SlowCardStat label="Rider-hours" value={Math.round(segment.riderHours).toLocaleString()} />
        <SlowCardStat
          label="Priority"
          value={treatments.length === 0 ? "none" : treatments.join(" + ")}
        />
      </div>

      {hasHourData ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
              Hour profile
            </div>
            <div className="text-[10.5px] text-[var(--bp-color-ink-55)]">served segment data</div>
          </div>
          <div
            role="img"
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
            aria-label="Hourly speed profile"
          >
            {segment.hours.map((_, hour) => {
              const speed = segmentSpeedAtHour(segment, hour);
              if (speed === null) return null;
              return (
                <span
                  key={hour}
                  title={`${hour}:00, ${speed.toFixed(1)} mph`}
                  className="h-7 rounded-[1px]"
                  style={{ backgroundColor: speedToColor(speed) }}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {note ? <div className="mt-4">{note}</div> : null}
    </article>
  );
}

export function RPubInterventionCard({
  dateLabel,
  yearLabel,
  kind,
  title,
  detail,
  tone,
  sourceLabel,
  citationKeys,
  evidence,
}: {
  dateLabel: string;
  yearLabel: string;
  kind: string;
  title: string;
  detail: string;
  tone: Exclude<PublicTone, "ink">;
  sourceLabel: string | null;
  citationKeys: readonly string[];
  evidence: WikiCitationEvidence | null;
}) {
  return (
    <article
      className="grid grid-cols-[82px_minmax(0,1fr)] gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-sm:grid-cols-1"
      style={{ borderLeft: `4px solid ${toneColor[tone]}` }}
    >
      <div>
        <div
          className="inline-flex min-w-[64px] justify-center rounded-[3px] px-2.5 py-1.5 font-mono text-[13px] font-bold text-white"
          style={{ backgroundColor: toneColor[tone] }}
        >
          {yearLabel}
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
          {dateLabel}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge
            variant={
              tone === "good"
                ? "good"
                : tone === "warn"
                  ? "warn"
                  : tone === "bad"
                    ? "bad"
                    : "accent"
            }
          >
            {kind.replaceAll("_", " ")}
          </Badge>
          {sourceLabel ? <Badge variant="neutral">{sourceLabel}</Badge> : null}
        </div>
        <h3 className="m-0 text-[15px] font-semibold leading-[1.25]">{title}</h3>
        <p className="m-0 mt-1.5 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          {detail}
        </p>
        <div className="mt-3">
          {citationKeys.length > 0 ? (
            <CitationChips evidence={evidence} citationKeys={citationKeys} />
          ) : (
            <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
              {sourceLabel ?? "Serving record"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function SlowCardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2">
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[14px] font-semibold text-[var(--bp-color-ink)]">
        {value}
      </div>
    </div>
  );
}
