import { CitationChips, type WikiCitationEvidence } from "@/components/route/WikiEvidence";
import { Badge } from "@/components/ui/badge";
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
