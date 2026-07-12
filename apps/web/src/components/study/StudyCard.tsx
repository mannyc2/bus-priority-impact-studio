import { useState } from "react";
import { SourceNote } from "@/components/SourceNote";
import { Badge } from "@/components/ui/badge";
import type { StudyArtifact } from "@/studio/api-contract";
import {
  caveatSentence,
  ciLongLabel,
  confounderMarker,
  descriptiveChangeLabel,
  descriptiveSentence,
  findingSentence,
  implementationLineLabel,
  methodProvenanceEntries,
  signedMphLabel,
  studyBadgeLabel,
  studyTone,
  type StudyTone,
} from "./study-display.js";
import { StudyEventChart } from "./StudyEventChart.js";

function toneColor(tone: StudyTone): string {
  if (tone === "good") return "var(--bp-color-good)";
  if (tone === "warn") return "var(--bp-color-warn)";
  if (tone === "bad") return "var(--bp-color-bad)";
  return "var(--bp-color-accent)";
}

function TrendIcon({ direction, tone }: { direction: StudyArtifact["direction"]; tone: StudyTone }) {
  const stroke = { color: toneColor(tone) };
  if (direction === "improved") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={stroke}
        aria-hidden="true"
      >
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    );
  }
  if (direction === "worsened") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={stroke}
        aria-hidden="true"
      >
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
      </svg>
    );
  }
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={stroke}
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

/** Studied card, gated-estimate tier: shadcn chart-card anatomy — header
 * stat block, event-time chart body, footer finding + provenance. */
export function StudyCard({
  title,
  study,
  defaultChartVisible = true,
}: {
  title: string;
  study: StudyArtifact;
  defaultChartVisible?: boolean;
}) {
  const [chartVisible, setChartVisible] = useState(defaultChartVisible);
  const tone = studyTone(study.direction);
  const variant = study.variants.allDay;
  const isNull = study.direction === "no_detectable_change";
  const caveat = caveatSentence(study);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold leading-tight">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-[var(--bp-color-ink-55)]">
            Monthly speed, mph.
          </div>
          <div className="mt-1.5">
            <Badge variant={tone}>{studyBadgeLabel(study)}</Badge>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            vs controls
          </div>
          <div
            className={`mt-0.5 font-mono font-semibold leading-[1.05] ${isNull ? "text-[18px]" : "text-[22px]"}`}
            style={{ color: toneColor(tone) }}
          >
            {isNull || variant.effectMph === null
              ? "No clear change"
              : signedMphLabel(variant.effectMph)}
          </div>
          {variant.confidenceInterval === null ? null : (
            <div className="mt-0.5 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
              {ciLongLabel(variant.confidenceInterval)}
            </div>
          )}
        </div>
      </div>
      {chartVisible ? (
        <div className="mt-3.5">
          <StudyEventChart
            series={variant.monthlySeries}
            implementationMonth={study.implementationMonth}
            implementationLabel={implementationLineLabel(study)}
            marker={confounderMarker(study)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChartVisible(true)}
          className="mt-3.5 w-full rounded-[3px] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
        >
          Show chart
        </button>
      )}
      <div className="mt-3 flex flex-col items-start gap-1">
        <div className="inline-flex items-center gap-1.5 text-[12.5px] font-medium leading-[1.4]">
          <TrendIcon direction={study.direction} tone={tone} />
          {findingSentence(study)}
        </div>
        {caveat === null ? null : (
          <div className="max-w-[62ch] text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
            {caveat}
          </div>
        )}
        <SourceNote label="Method & provenance" entries={methodProvenanceEntries(study)} />
      </div>
    </>
  );
}

/** Studied card, descriptive tier: same anatomy minus the chart, CI, and
 * icon — an uncontrolled before-vs-after with the caveat stated plainly. */
export function DescriptiveStudyCard({ title, study }: { title: string; study: StudyArtifact }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold leading-tight">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-[var(--bp-color-ink-55)]">
            Not a controlled comparison.
          </div>
          <div className="mt-1.5">
            <Badge variant="neutral">{studyBadgeLabel(study)}</Badge>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            before vs after
          </div>
          <div className="mt-0.5 font-mono text-[22px] font-semibold leading-[1.05] text-[var(--bp-color-ink-70)]">
            {descriptiveChangeLabel(study)}
          </div>
        </div>
      </div>
      <div className="mt-3 max-w-[62ch] text-[13px] leading-[1.55]">
        {descriptiveSentence(study)}
      </div>
      <div className="mt-3">
        <SourceNote label="Method & provenance" entries={methodProvenanceEntries(study)} />
      </div>
    </>
  );
}
