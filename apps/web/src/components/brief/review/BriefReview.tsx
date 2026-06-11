import { Check, X } from "lucide-react";
import { useReviewBrief } from "../ReviewBriefContext.js";
import { BriefReviewBody } from "./BriefReviewBody.js";
import { CommentMargin } from "./CommentMargin.js";
import { ReviewTopBar } from "./ReviewTopBar.js";

/**
 * The reviewer surface — the brief read in its authored shape with comments
 * woven into the prose, alongside the comment margin. Top bar and both columns
 * are siblings reading the same backed ReviewBrief provider, so comment undo/redo
 * in the chrome drives the anchors in the document.
 */
export function BriefReview() {
  const { state, actions } = useReviewBrief();
  const exported = state.publishCandidateExport;

  return (
    <div className="flex h-full min-h-full flex-col bg-[var(--bp-color-paper)]">
      <ReviewTopBar />

      {state.writeError ? (
        <div className="flex items-center gap-3 bg-[var(--bp-color-bad-bg)] px-7 py-2.5 text-[12px] text-[var(--bp-color-bad)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <span className="flex-1">
            Review action didn’t complete: {state.writeError} (publishing requires an operator
            session).
          </span>
          <button type="button" onClick={actions.clearWriteError} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ) : exported ? (
        <div className="flex items-center gap-2 bg-[var(--bp-color-good-bg)] px-7 py-2.5 text-[12px] text-[var(--bp-color-good)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <Check size={14} />
          <span>
            Published candidate <span className="font-mono font-semibold">{exported.version}</span> ·{" "}
            {exported.candidateId}
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_384px] max-lg:grid-cols-1">
        <div className="min-h-0 overflow-auto">
          <BriefReviewBody />
        </div>
        <CommentMargin />
      </div>
    </div>
  );
}
