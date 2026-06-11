import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import {
  EmbedBeforeAfter,
  EmbedDataLineage,
  EmbedFinding,
  EmbedHourFigure,
  EmbedKeyTakeaways,
  EmbedMentionedRoutes,
  EmbedProjection,
  EmbedRichSubBrief,
  EmbedSegmentCard,
} from "./embeds.js";
import { InlineMetric, InlineRoute, InlineSegment, InlineSource, InlineTag } from "./inline.js";

type ElementProps = { children?: ReactNode; href?: string };

/** Inline brief-primitive directive names (`:name[…]{…}`). */
export const INLINE_DIRECTIVE_NAMES = ["route", "segment", "metric", "source", "tag"] as const;

/** Embedded (block-level) brief-primitive directive names (`:::name{ref=…}`). They
 * mirror `StudioBriefBlock`'s `type` discriminants exactly. */
export const BLOCK_DIRECTIVE_NAMES = [
  "segment-card",
  "before-after",
  "projection",
  "data-lineage",
  "finding",
  "key-takeaways",
  "mentioned-routes",
  "rich-sub-brief",
  "hour-figure",
] as const;

/** The single allowlist the remark transform validates against. */
export const ALLOWED_DIRECTIVES: ReadonlySet<string> = new Set<string>([
  ...INLINE_DIRECTIVE_NAMES,
  ...BLOCK_DIRECTIVE_NAMES,
]);

/**
 * react-markdown component map: the brief-primitive custom elements plus editorial
 * typography. Heading/structural sizes are em-relative so one renderer adapts to
 * each surface's base font size. Cast through `unknown` because the directive keys
 * (`route`, `metric`, …) are custom element names outside `Components`' HTML keys.
 */
export const proseComponents = {
  route: InlineRoute,
  segment: InlineSegment,
  metric: InlineMetric,
  source: InlineSource,
  tag: InlineTag,

  "segment-card": EmbedSegmentCard,
  "before-after": EmbedBeforeAfter,
  projection: EmbedProjection,
  "data-lineage": EmbedDataLineage,
  finding: EmbedFinding,
  "key-takeaways": EmbedKeyTakeaways,
  "mentioned-routes": EmbedMentionedRoutes,
  "rich-sub-brief": EmbedRichSubBrief,
  "hour-figure": EmbedHourFigure,

  p: ({ children }: ElementProps) => (
    <p className="m-0 mb-[0.85em] leading-[1.72] [text-wrap:pretty] last:mb-0">{children}</p>
  ),
  h2: ({ children }: ElementProps) => (
    <h2 className="m-0 mb-[0.4em] mt-[1.15em] text-[1.4em] font-semibold leading-[1.2] tracking-[-0.018em] text-[var(--bp-color-ink)] [text-wrap:balance] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: ElementProps) => (
    <h3 className="m-0 mb-[0.3em] mt-[1em] text-[1.12em] font-semibold tracking-[-0.01em] text-[var(--bp-color-ink)] first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }: ElementProps) => (
    <ul className="my-[0.7em] list-disc pl-[1.35em]">{children}</ul>
  ),
  ol: ({ children }: ElementProps) => (
    <ol className="my-[0.7em] list-decimal pl-[1.35em]">{children}</ol>
  ),
  li: ({ children }: ElementProps) => <li className="mb-[0.25em] leading-[1.6]">{children}</li>,
  a: ({ href, children }: ElementProps) => (
    <a
      href={href}
      className="text-[var(--bp-color-accent)] underline underline-offset-2"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: ElementProps) => (
    <strong className="font-semibold text-[var(--bp-color-ink)]">{children}</strong>
  ),
  em: ({ children }: ElementProps) => <em className="italic">{children}</em>,
  blockquote: ({ children }: ElementProps) => (
    <blockquote className="my-[0.8em] border-l-2 border-[var(--bp-color-accent)] pl-3 italic text-[var(--bp-color-ink-70)]">
      {children}
    </blockquote>
  ),
  code: ({ children }: ElementProps) => (
    <code className="rounded-[3px] bg-[var(--bp-color-ink-06)] px-1 py-px font-mono text-[0.86em]">
      {children}
    </code>
  ),
  hr: () => <hr className="my-[1.1em] border-0 shadow-[inset_0_1px_0_var(--bp-color-rule)]" />,
} as unknown as Components;
