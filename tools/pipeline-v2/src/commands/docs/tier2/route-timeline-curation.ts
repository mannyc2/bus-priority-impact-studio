import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { runRouteTimelineCurationFromCli } from "./_route-timeline-curation.ts";

const optionsSchema = z.object({
  packPath: z.string(),
  packMarkdownPath: z.string().optional(),
  outputPath: z.string().optional(),
  generatedAt: z.string().optional(),
  execute: z.union([z.boolean(), z.string()]).optional(),
  provider: z.enum(["deepseek", "pioneer"]).optional(),
  model: z.string().optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().optional(),
});

const flagMap: Record<string, string> = {
  packPath: "--pack",
  packMarkdownPath: "--pack-markdown",
  outputPath: "--output",
  generatedAt: "--generated-at",
  execute: "--execute",
  provider: "--provider",
  model: "--model",
  maxTokens: "--max-tokens",
  temperature: "--temperature",
};

export async function runDocsTier2RouteTimelineCuration(input: z.infer<typeof optionsSchema>) {
  return runRouteTimelineCurationFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "route-timeline-curation"],
  summary:
    "Run an LLM curation pass over a route timeline curation pack and persist the validated review artifact.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2RouteTimelineCuration(input.options);
  },
});
