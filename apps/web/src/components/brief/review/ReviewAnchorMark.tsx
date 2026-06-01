import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { useReviewBrief } from "../ReviewBriefContext.js";
import { type AnchorTone, RvAnchor } from "./RvAnchor.js";

type AnchorMarkProps = { cid?: string; tone?: string; children?: ReactNode };

function anchorTone(tone: string | undefined): AnchorTone {
  return tone === "bad" ? "bad" : tone === "warn" ? "warn" : "accent";
}

/**
 * Renders an `rv-anchor` element (injected by `remarkReviewAnchors`) as the inline
 * span its margin comment is pinned to. It reads active state and the select
 * action straight from the review context rather than through props, because the
 * markdown pipeline can only hand a component the element's plain attributes.
 */
function ReviewAnchorMark({ cid, tone, children }: AnchorMarkProps) {
  const { state, actions } = useReviewBrief();
  return (
    <RvAnchor
      tone={anchorTone(tone)}
      active={cid !== undefined && state.activeCommentId === cid}
      onClick={() => {
        if (cid !== undefined) actions.setActiveComment(cid);
      }}
    >
      {children}
    </RvAnchor>
  );
}

/**
 * The review surface's extension to the brief-prose registry: the one custom
 * element the anchor transform emits. Cast because `rv-anchor` is a custom element
 * name outside react-markdown's HTML component keys. Stable identity so the
 * renderer's component-merge memo holds.
 */
export const reviewAnchorComponents = {
  "rv-anchor": ReviewAnchorMark,
} as unknown as Components;
