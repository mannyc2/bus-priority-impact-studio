import { ArrowRight } from "lucide-react";
import { RouteBadge } from "@/components/RouteBadge";
import { ReviewerStack } from "@/components/Reviewers";
import type { StudioBriefResponse } from "@/studio/api-contract.js";
import { useReviewBrief } from "../ReviewBriefContext.js";
import { ChromeUndoRedo } from "../composer/atoms.js";

// Reviewer roster is local chrome until the backend exposes review assignments.
const REVIEWERS = [
  { initials: "CP", state: "requested-changes" as const },
  { initials: "SR", state: "approved" as const },
  { initials: "JL", state: "reviewing" as const },
];

const STATUS_CHIP: Record<
  NonNullable<StudioBriefResponse["draftStatus"]> | "default",
  { label: string; fg: string; bg: string }
> = {
  drafting: { label: "DRAFTING", fg: "var(--bp-color-ink-55)", bg: "var(--bp-color-ink-06)" },
  draft: { label: "DRAFT", fg: "var(--bp-color-ink-55)", bg: "var(--bp-color-ink-06)" },
  in_review: { label: "IN REVIEW", fg: "var(--bp-color-warn)", bg: "var(--bp-color-warn-bg)" },
  approved: { label: "APPROVED", fg: "var(--bp-color-good)", bg: "var(--bp-color-good-bg)" },
  publish_candidate: {
    label: "PUBLISH CANDIDATE",
    fg: "var(--bp-color-accent)",
    bg: "var(--bp-color-accent-bg)",
  },
  published: { label: "PUBLISHED", fg: "var(--bp-color-good)", bg: "var(--bp-color-good-bg)" },
  archived: { label: "ARCHIVED", fg: "var(--bp-color-ink-55)", bg: "var(--bp-color-ink-06)" },
  retracted: { label: "RETRACTED", fg: "var(--bp-color-bad)", bg: "var(--bp-color-bad-bg)" },
  default: { label: "IN REVIEW", fg: "var(--bp-color-warn)", bg: "var(--bp-color-warn-bg)" },
};

/**
 * The review sub-bar. The persistent studio nav comes from the app shell, so
 * this is the calm single line: the brief identity + status, comment undo/redo,
 * the reviewer stack, and the two backed lifecycle actions (validate, publish).
 */
export function ReviewTopBar() {
  const { state, actions, meta } = useReviewBrief();
  const chip = STATUS_CHIP[meta.draftStatus ?? "default"];
  const validation = state.validation;
  const clean = validation !== null && validation.blockingIssues.length === 0;

  return (
    <div className="flex items-center gap-3.5 bg-[var(--bp-color-card)] px-7 py-[11px] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:flex-wrap">
      <RouteBadge route={meta.route.label} sbs={meta.route.sbs} size="md" />
      <div className="text-[16.5px] font-semibold tracking-[-0.012em]">{meta.brief.title}</div>
      <span
        className="rounded-[2px] px-[7px] py-[3px] font-mono text-[10px] font-bold tracking-[0.08em]"
        style={{ color: chip.fg, background: chip.bg }}
      >
        {chip.label}
      </span>
      <span className="h-[22px] w-px bg-[var(--bp-color-rule)]" />
      <ChromeUndoRedo
        canUndo={state.canUndoComments}
        canRedo={state.canRedoComments}
        onUndo={actions.undoComments}
        onRedo={actions.redoComments}
      />

      <div className="flex-1" />

      {validation ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-[13px] px-2.5 py-[5px] font-mono text-[10.5px] font-bold tracking-[0.04em]"
          style={{
            color: clean ? "var(--bp-color-good)" : "var(--bp-color-bad)",
            background: clean ? "var(--bp-color-good-bg)" : "var(--bp-color-bad-bg)",
          }}
        >
          {clean ? `✓ valid · score ${validation.score}` : `${validation.blockingIssues.length} blocking`}
        </span>
      ) : null}

      <ReviewerStack reviewers={REVIEWERS} />
      <span className="h-[22px] w-px bg-[var(--bp-color-rule)]" />

      <button
        type="button"
        onClick={actions.validate}
        disabled={state.pendingAction !== null}
        className="inline-flex h-8 items-center rounded-[3px] px-3 text-[12.5px] font-medium text-[var(--bp-color-ink)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] disabled:opacity-50"
      >
        {state.pendingAction === "validate" ? "Validating…" : "Validate"}
      </button>
      <button
        type="button"
        onClick={actions.publishCandidate}
        disabled={state.pendingAction !== null}
        className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3 text-[12.5px] font-medium text-[var(--bp-color-paper)] disabled:opacity-50"
      >
        {state.pendingAction === "publish" ? "Publishing…" : "Approve & publish"}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
