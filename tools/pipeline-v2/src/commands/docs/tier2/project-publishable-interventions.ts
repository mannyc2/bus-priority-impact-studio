import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { projectPublishableInterventionsFromCli } from "./_shared.ts";

const optionsSchema = z.object({
  publishable: z.string().describe("Path to publishable intervention artifact JSON"),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  publishable: "--publishable",
  output: "--output",
};

export async function runDocsTier2ProjectPublishableInterventions(
  input: z.infer<typeof optionsSchema>,
) {
  return projectPublishableInterventionsFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "project-publishable-interventions"],
  summary:
    "Project the publishable intervention artifact into a per-route StudioIntervention[] map for the studio release builder.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2ProjectPublishableInterventions(input.options);
  },
});
