import { defineCommand, z } from "@liche/core";
import { auditTier2AgenticExtractionArtifactFile } from "./_agentic-extraction.ts";

const optionsSchema = z.object({
  input: z.string(),
  output: z.string().optional(),
  generatedAt: z.string().optional(),
});

export async function runDocsTier2AgenticAudit(input: z.infer<typeof optionsSchema>) {
  return auditTier2AgenticExtractionArtifactFile({
    inputPath: input.input,
    ...(input.output === undefined ? {} : { outputPath: input.output }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
}

export default defineCommand({
  path: ["docs", "tier2", "agentic-audit"],
  summary: "Audit a Tier 2 agentic extraction artifact for deterministic blocker classes.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2AgenticAudit(input.options);
  },
});
