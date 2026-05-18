import { ReviewerStack } from "@/components/Reviewers";
import { StudioBar } from "@/components/StudioBar";
import { StudioFooter } from "@/components/StudioFooter";
import { StudioMark } from "@/components/StudioMark";
import { demoFooterSources, demoReviewers } from "@/fixtures/demo-snippets";

export function StudioBarDemo() {
  return (
    <div className="overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <StudioBar active="Routes" breadcrumb="system / primitives" />
      <div className="flex items-start justify-between gap-4 bg-[var(--bp-color-paper)] p-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <StudioMark size={32} />
            <span className="font-mono text-[11px] font-semibold text-[var(--bp-color-ink-55)]">
              Design system v0.1
            </span>
          </div>
          <h2 className="m-0 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            Bus Priority Impact Studio
          </h2>
          <p className="mt-2 max-w-[620px] text-[13px] leading-normal text-[var(--bp-color-ink-70)]">
            A warm-paper civic interface for route evidence, hotspot ranking, intervention
            reasoning, and brief authoring.
          </p>
        </div>
        <ReviewerStack reviewers={demoReviewers} />
      </div>
      <StudioFooter sources={demoFooterSources} />
    </div>
  );
}
