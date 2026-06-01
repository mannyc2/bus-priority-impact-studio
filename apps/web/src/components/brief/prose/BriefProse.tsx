import { useMemo } from "react";
import Markdown, { type Components, type Options } from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import type { StudioBriefBlock } from "@/studio/api-contract.js";
import { BriefBlocksProvider } from "./BriefBlocksContext.js";
import { ALLOWED_DIRECTIVES, proseComponents } from "./registry.js";
import { remarkBriefDirectives } from "./remark-brief-directives.js";

type RemarkPlugins = NonNullable<Options["remarkPlugins"]>;

const baseRemarkPlugins: RemarkPlugins = [
  remarkGfm,
  remarkDirective,
  remarkBriefDirectives(ALLOWED_DIRECTIVES),
];

/**
 * The one brief-prose renderer, shared by every surface that shows a brief body.
 * Markdown + GFM + allowlisted directives that map to the brief primitives.
 *
 * No `rehype-raw`: embedded raw HTML is dropped, not rendered — brief content is
 * AI/operator-authored and treated as untrusted. Plain-text bodies render as plain
 * prose, so existing string bodies stay backward-compatible. This module pulls in
 * the markdown stack, so it must only be imported from the (code-split) brief
 * surfaces, never the initial bundle.
 *
 * A surface can compose in its own behavior without this renderer knowing about
 * it: `extraRemarkPlugins`/`extraComponents` are merged after the base stack (the
 * review surface uses them to weave in its comment anchors). Pass stable
 * identities — the merge is memoized on them. `blocks` supplies the typed data the
 * embedded `:::name{ref=…}` primitives resolve against (markdown carries only the
 * ref).
 */
export function BriefProse({
  markdown,
  className,
  blocks,
  extraRemarkPlugins,
  extraComponents,
}: {
  markdown: string;
  className?: string;
  blocks?: readonly StudioBriefBlock[] | undefined;
  extraRemarkPlugins?: RemarkPlugins;
  extraComponents?: Components;
}) {
  const remarkPlugins = useMemo(
    () => (extraRemarkPlugins ? [...baseRemarkPlugins, ...extraRemarkPlugins] : baseRemarkPlugins),
    [extraRemarkPlugins],
  );
  const components = useMemo(
    () => (extraComponents ? { ...proseComponents, ...extraComponents } : proseComponents),
    [extraComponents],
  );
  return (
    <BriefBlocksProvider blocks={blocks ?? EMPTY_BLOCKS}>
      <div className={className}>
        <Markdown remarkPlugins={remarkPlugins} components={components}>
          {markdown}
        </Markdown>
      </div>
    </BriefBlocksProvider>
  );
}

const EMPTY_BLOCKS: readonly StudioBriefBlock[] = [];
