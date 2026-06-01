import { defineCommand, z } from "@liche/core";
import { optionsToArgs } from "./_cli-bridge.ts";
import { recaptureFailedSourcesFromCli } from "./_recapture.ts";

const optionsSchema = z.object({
  captureManifest: z.string().optional(),
  artifactRoot: z.string().optional(),
  runId: z.string().optional(),
  sources: z.string().optional().describe("Comma-separated source ids to recapture"),
  run: z.boolean().optional().describe("Execute the recapture run"),
  output: z.string().optional(),
});

const flagMap: Record<string, string> = {
  captureManifest: "--capture-manifest",
  artifactRoot: "--artifact-root",
  runId: "--run-id",
  sources: "--sources",
  run: "--run",
  output: "--output",
};

export async function runDocsTier2CaptureRecapture403(input: z.infer<typeof optionsSchema>) {
  return recaptureFailedSourcesFromCli(optionsToArgs(input, flagMap));
}

export default defineCommand({
  path: ["docs", "tier2", "capture-recapture-403"],
  summary:
    "Recapture html_text sources that failed initial capture (e.g. 403) via Wayback Machine.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    return runDocsTier2CaptureRecapture403(input.options);
  },
});
