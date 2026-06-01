import { createContext, type ReactNode, use, useMemo } from "react";
import type { StudioBriefBlock } from "@/studio/api-contract.js";

/** The typed blocks a brief body's `:::name{ref=…}` embeds resolve against, indexed
 * by block id. Defaults to empty so an embed outside a provider (or on a surface
 * with no blocks) degrades to its placeholder rather than throwing. */
const BriefBlocksContext = createContext<ReadonlyMap<string, StudioBriefBlock>>(new Map());

/**
 * Provides the brief's typed blocks to the embedded primitives rendered inside
 * `<BriefProse>`. The block data travels out-of-band (the markdown only carries a
 * `ref` id) because public payloads ship render-ready — the embeds read the block
 * straight from here, with no per-ref network resolution.
 */
export function BriefBlocksProvider({
  blocks,
  children,
}: {
  blocks: readonly StudioBriefBlock[];
  children: ReactNode;
}) {
  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  return <BriefBlocksContext value={byId}>{children}</BriefBlocksContext>;
}

/**
 * Resolve a block directive's `ref` (which is a block id) to its typed block,
 * narrowed to the directive's expected type. Returns null when the id is absent or
 * the stored block is a different type — the embed then renders an inert
 * placeholder, the same contract the draft validator enforces server-side.
 */
export function useBriefBlock<T extends StudioBriefBlock["type"]>(
  ref: string | undefined,
  type: T,
): Extract<StudioBriefBlock, { type: T }> | null {
  const blocks = use(BriefBlocksContext);
  if (ref === undefined) return null;
  const block = blocks.get(ref);
  if (block === undefined || block.type !== type) return null;
  return block as Extract<StudioBriefBlock, { type: T }>;
}
