import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runTier2ManualVocabProjectionOverlayFromCli } from "./_manual-vocab-projection-overlay.ts";

const optionsSchema = z.object({
  canonicalMergePath: z.string(),
  graduationPlanPath: z.string(),
  sourceProjectionPath: z.string(),
  outputRoot: z.string().optional(),
  keyIds: z.string().optional(),
  generatedAt: z.string().optional(),
});

const flagMap: Record<string, string> = {
  canonicalMergePath: "--canonical-merge",
  graduationPlanPath: "--graduation-plan",
  sourceProjectionPath: "--source-projection",
  outputRoot: "--output-root",
  keyIds: "--key-ids",
  generatedAt: "--generated-at",
};

export async function runDocsTier2ManualVocabProjectionOverlay(
  input: z.infer<typeof optionsSchema>,
) {
  return runTier2ManualVocabProjectionOverlayFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "manual-vocab-projection-overlay"],
  summary:
    "Apply deterministic manual overlay rules to selected Tier 2 vocab projection keys without mutating raw payloads.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2ManualVocabProjectionOverlay(input.options);
  },
});
