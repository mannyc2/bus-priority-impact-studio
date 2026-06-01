import type { AnchorTone } from "./RvAnchor.js";

export type ReviewAnchor = {
  commentId: string;
  on: string;
  tone: AnchorTone;
};

type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

/** A synthetic inline element the {@link ReviewAnchorMark} component renders. It
 * piggybacks the same `data.hName` path the brief primitives use, so it survives
 * the mdast→hast step without `remark-directive` parsing or raw HTML. */
function anchorNode(anchor: ReviewAnchor, text: string): MdNode {
  return {
    type: "textDirective",
    children: [{ type: "text", value: text }],
    data: { hName: "rv-anchor", hProperties: { cid: anchor.commentId, tone: anchor.tone } },
  };
}

/** Split one text node's value at the first occurrence of each remaining anchor's
 * quote, left-to-right and non-overlapping. Each comment anchors at most once
 * (it's removed from `remaining` once placed); an unmatched comment stays
 * margin-only. Returns the node unchanged when nothing matches. */
function splitText(value: string, remaining: Map<string, ReviewAnchor>): MdNode[] {
  const out: MdNode[] = [];
  let pos = 0;
  while (pos < value.length && remaining.size > 0) {
    let best: { index: number; anchor: ReviewAnchor } | null = null;
    for (const anchor of remaining.values()) {
      const index = value.indexOf(anchor.on, pos);
      if (index >= 0 && (best === null || index < best.index)) best = { index, anchor };
    }
    if (best === null) break;
    if (best.index > pos) out.push({ type: "text", value: value.slice(pos, best.index) });
    out.push(anchorNode(best.anchor, value.slice(best.index, best.index + best.anchor.on.length)));
    remaining.delete(best.anchor.commentId);
    pos = best.index + best.anchor.on.length;
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (pos < value.length) out.push({ type: "text", value: value.slice(pos) });
  return out;
}

function walk(node: MdNode, remaining: Map<string, ReviewAnchor>): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitText(child.value, remaining));
    } else {
      walk(child, remaining);
      next.push(child);
    }
  }
  node.children = next;
}

/**
 * A review-only remark transform that pins each unresolved margin comment to the
 * first occurrence of its quote inside the rendered prose, wrapping the matched
 * text in an `rv-anchor` element (mapped to the anchor mark in the review
 * registry). Quotes are matched within a single text node, so an anchor that
 * straddles inline formatting stays margin-only — the transform never throws,
 * reorders prose, or touches a primitive's children.
 */
export function remarkReviewAnchors(anchors: readonly ReviewAnchor[]) {
  return () => (tree: unknown) => {
    const remaining = new Map<string, ReviewAnchor>();
    for (const anchor of anchors) {
      if (anchor.on.length > 0) remaining.set(anchor.commentId, anchor);
    }
    if (remaining.size === 0) return;
    walk(tree as MdNode, remaining);
  };
}
