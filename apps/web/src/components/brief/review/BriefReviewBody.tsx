import { useMemo } from "react";
import type { StudioBriefBlock, StudioComment } from "@/studio/api-contract.js";
import { useReviewBrief } from "../ReviewBriefContext.js";
import { EvidenceFigure } from "../composer/atoms.js";
import { BriefProse } from "../prose/BriefProse.js";
import { reviewAnchorComponents } from "./ReviewAnchorMark.js";
import { remarkReviewAnchors, type ReviewAnchor } from "./remark-review-anchors.js";

/**
 * One claim's prose, rendered through the shared markdown renderer with its
 * unresolved comments woven in as inline anchors. The anchor transform is
 * memoized on the comment set — not the active id — so clicking between comments
 * re-styles the anchors (from context, inside the mark) without re-parsing the
 * markdown.
 */
function ReviewClaimBody({
  markdown,
  claimN,
  comments,
  blocks,
}: {
  markdown: string;
  claimN: number;
  comments: readonly StudioComment[];
  blocks: readonly StudioBriefBlock[] | undefined;
}) {
  const extraRemarkPlugins = useMemo(() => {
    const anchors: ReviewAnchor[] = comments
      .filter((comment) => comment.claimN === claimN && !comment.resolved && comment.on.trim())
      .map((comment) => ({
        commentId: comment.id,
        on: comment.on.trim(),
        tone: comment.kind === "change-requested" ? "bad" : "accent",
      }));
    return [remarkReviewAnchors(anchors)];
  }, [comments, claimN]);

  return (
    <BriefProse
      markdown={markdown}
      blocks={blocks}
      extraRemarkPlugins={extraRemarkPlugins}
      extraComponents={reviewAnchorComponents}
      className="mt-3.5 text-[16px] text-[var(--bp-color-ink-70)]"
    />
  );
}

/**
 * The editorial column the reviewer reads — the brief in its authored shape.
 * Each claim is a §-numbered section; its prose renders as markdown (primitives
 * and all) with unresolved comments anchored inline, in lock-step with the
 * margin. Attached evidence renders inline as the figures themselves (no shelf,
 * no scores).
 */
export function BriefReviewBody() {
  const { state, meta } = useReviewBrief();
  const { brief } = meta;
  // One id→evidence index for O(1) figure lookups, instead of a .find() per
  // evidence id inside the claims loop.
  const evidenceById = new Map(brief.evidence.map((evidence) => [evidence.id, evidence]));

  return (
    <div className="flex justify-center px-10 pb-20 pt-12 max-sm:px-4">
      <article className="relative w-[680px] max-w-full pl-2">
        {brief.claims.map((claim) => {
          const figures = claim.evidenceIds
            .map((id) => evidenceById.get(id))
            .filter((evidence) => evidence !== undefined);

          return (
            <section key={claim.n} className="mb-7">
              <h2 className="m-0 flex items-baseline gap-2.5 text-[23px] font-semibold leading-[1.18] tracking-[-0.018em] text-[var(--bp-color-ink)]">
                <span className="font-mono text-[15px] tabular-nums text-[var(--bp-color-ink-40)]">
                  {String(claim.n).padStart(2, "0")}
                </span>
                <span className="text-balance">{claim.title}</span>
              </h2>

              {claim.body ? (
                <ReviewClaimBody
                  markdown={claim.body}
                  claimN={claim.n}
                  comments={state.comments}
                  blocks={brief.blocks}
                />
              ) : null}

              {figures.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {figures.map((evidence) => (
                    <EvidenceFigure key={evidence.id} evidence={evidence} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </article>
    </div>
  );
}
