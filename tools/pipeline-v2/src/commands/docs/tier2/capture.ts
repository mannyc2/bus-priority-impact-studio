import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { captureTier2DocsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  backlog: z.string().optional().describe("Path to Tier 2 reviewed backlog JSON"),
  artifactRoot: z.string().optional().describe("Override artifact root directory"),
  runId: z.string().optional().describe("Override generated run id"),
});

const flagMap: Record<string, string> = {
  backlog: "--backlog",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
};

export async function runDocsTier2Capture(input: z.infer<typeof optionsSchema>) {
  return captureTier2DocsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "capture"],
  summary: "Fetch the reviewed Tier 2 document backlog and write capture metadata.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2Capture(input.options);
  },
});
